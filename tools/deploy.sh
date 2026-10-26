#!/usr/bin/env bash
# 钦天监 · 统一部署入口（P0-2：门禁不过，绝不部署）
#
# 用法：
#   bash tools/deploy.sh [--no-gates] [--no-remote-check] [--note "说明"]
#
# 环境变量：
#   QT_DRY_RUN=1             只打印将要执行的部署命令，不真的部署（用于故障注入自测）
#   QT_DRY_RUN_MARKER=<path> dry-run 到达"该部署了"这一步时写一个标记文件
#                            （故障注入自测用它证明"门禁失败时流程根本没走到部署"）
#   QT_DEPLOY_REPORT=<path>  写部署结果 JSON，供 tools/release-record.mjs 引用
#   QT_ALLOW_DIRTY=1         允许在脏工作区部署（默认拒绝：部署产物必须能追溯到某个提交）
#   QT_SKIP_REMOTE=1         跳过线上版本核验
#
# 为什么部署前必须再跑一次门禁：
#   因为"构建失败必须阻止发布"这件事，只有在**唯一的部署入口**上做才可靠。
#   只要有人绕过入口手工 coze-dev deploy，门禁就形同虚设。所以入口只有一个：本脚本。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_NAME="钦天监"
COZE_URL="https://8xjmbcxsf9.page.coze.site"
GH_URL="https://lacang.github.io/qintianjian/"
NO_GATES=0
NO_REMOTE=0
NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-gates) NO_GATES=1 ;;
    --no-remote-check) NO_REMOTE=1 ;;
    --note) NOTE="${2:-}"; shift ;;
    *) echo "[deploy] 未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done

VER=$(grep -o '?v=[0-9]\+' app/index.html | head -1 | tr -d '?v=')
SWVER=$(grep -o 'qintian-v[0-9]\+' app/sw.js | head -1 | sed 's/qintian-v//')
echo "[deploy] 待部署版本：index.html ?v=$VER / sw.js qintian-v$SWVER"
if [ "$VER" != "$SWVER" ]; then
  echo "[deploy] ❌ index.html 与 sw.js 版本号不一致，拒绝部署。" >&2
  exit 1
fi

# ---------- 1. 工作区必须干净（部署产物要能追溯到某个提交） ----------
DIRTY=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$DIRTY" != "0" ] && [ "${QT_ALLOW_DIRTY:-0}" != "1" ]; then
  echo "[deploy] ❌ 工作区有 $DIRTY 项未提交改动，拒绝部署。" >&2
  echo "[deploy]    先提交推送，再部署；确实要临时部署可设 QT_ALLOW_DIRTY=1。" >&2
  git status --porcelain | head -10 >&2
  exit 1
fi

# ---------- 2. 门禁（唯一入口上的硬门禁） ----------
if [ "$NO_GATES" -eq 0 ]; then
  echo ""
  echo "════════ 部署前门禁（失败即中止，不会部署任何产物）════════"
  QT_GATE_REPORT="${QT_DEPLOY_GATE_REPORT:-}" bash tools/gates.sh --expect-version "$VER" || {
    echo "[deploy] ❌ 门禁未通过，已中止部署。线上仍是旧版本，不会被本次改动影响。" >&2
    exit 1
  }
else
  echo "[deploy] ⚠️ 已按 --no-gates 跳过部署前门禁（仅限排障，正式发版不要这样用）"
fi

# ---------- 3. 该部署了（dry-run 在这里留痕） ----------
if [ -n "${QT_DRY_RUN_MARKER:-}" ]; then
  printf 'reached-deploy version=%s commit=%s\n' "$VER" "$(git rev-parse --short HEAD)" > "$QT_DRY_RUN_MARKER"
fi

DEPLOY_CMD=(coze-dev deploy --format json --source-root . --application-type pages --name "$APP_NAME" --yes)

if [ "${QT_DRY_RUN:-0}" = "1" ]; then
  echo ""
  echo "[deploy] DRY-RUN：门禁全绿，将执行（未真正执行）："
  echo "         cd app && ${DEPLOY_CMD[*]}"
  exit 0
fi

echo ""
echo "════════ 执行部署 ════════"
DEPLOY_JSON="$(cd app && "${DEPLOY_CMD[@]}")"
RC=$?
echo "$DEPLOY_JSON"
if [ "$RC" -ne 0 ]; then
  echo "[deploy] ❌ coze-dev deploy 返回非零（$RC），部署失败。" >&2
  exit 1
fi

DEPLOY_ID=$(printf '%s' "$DEPLOY_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('deploy_history_id',''))" 2>/dev/null || true)
APP_ID=$(printf '%s' "$DEPLOY_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('app_id',''))" 2>/dev/null || true)
echo "[deploy] deploy_history_id=$DEPLOY_ID app_id=$APP_ID"

# ---------- 4. 等部署单跑完 ----------
STATUS="Unknown"
if [ -n "$DEPLOY_ID" ] && [ -n "$APP_ID" ]; then
  for i in $(seq 1 40); do
    OUT="$(coze-dev deploy status --app-id "$APP_ID" --deploy-id "$DEPLOY_ID" --format json 2>/dev/null || true)"
    ST=$(printf '%s' "$OUT" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('status') or d.get('data',{}).get('status') or '')" 2>/dev/null || true)
    [ -n "$ST" ] && STATUS="$ST"
    echo "[deploy] 轮询 $i：status=$STATUS"
    case "$STATUS" in
      Succeeded|Failed|Canceled|Cancelled) break ;;
    esac
    sleep 15
  done
fi
if [ "$STATUS" != "Succeeded" ]; then
  echo "[deploy] ❌ 部署单最终状态为 $STATUS，不是 Succeeded。" >&2
  exit 1
fi

# ---------- 5. 线上核验：两个站点的 sw.js 版本必须等于本次版本 ----------
REMOTE_COZE="skipped"
REMOTE_GH="skipped"
if [ "$NO_REMOTE" -eq 0 ] && [ "${QT_SKIP_REMOTE:-0}" != "1" ]; then
  echo ""
  echo "════════ 线上核验（等 CDN 收敛到 v$VER）════════"
  check_remote() {
    local name="$1" base="$2"
    local i swv
    for i in $(seq 1 12); do
      swv=$(curl -s -m 12 "$base/sw.js?qt=$RANDOM" | grep -o 'qintian-v[0-9]\+' | head -1 | sed 's/qintian-v//')
      if [ "$swv" = "$VER" ]; then echo "$name v$swv ✅"; return 0; fi
      echo "[deploy]   $name 第 $i 次读到 sw=$swv，等待收敛…"
      sleep 10
    done
    echo "$name sw=$swv ❌"
    return 1
  }
  REMOTE_COZE=$(check_remote "coze.site" "$COZE_URL") || { echo "[deploy] ❌ coze.site 未收敛到 v$VER。" >&2; exit 1; }
  REMOTE_GH=$(check_remote "github.io" "$GH_URL") || { echo "[deploy] ❌ GitHub Pages 未收敛到 v$VER。" >&2; exit 1; }
  echo "[deploy] 线上核验通过：$REMOTE_COZE / $REMOTE_GH"
fi

# ---------- 6. 写部署结果（供发布记录引用） ----------
if [ -n "${QT_DEPLOY_REPORT:-}" ]; then
  QT_REPORT="$QT_DEPLOY_REPORT" QT_VER="$VER" QT_DEPLOY_ID="$DEPLOY_ID" QT_APP_ID="$APP_ID" \
  QT_STATUS="$STATUS" QT_COZE="$REMOTE_COZE" QT_GH="$REMOTE_GH" QT_NOTE="$NOTE" \
  python3 - <<'PY'
import json, os
rep = {
    'app_id': os.environ.get('QT_APP_ID') or None,
    'deploy_history_id': os.environ.get('QT_DEPLOY_ID') or None,
    'status': os.environ.get('QT_STATUS'),
    'version': int(os.environ.get('QT_VER')),
    'deployed_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    'remote_check': {'coze_site': os.environ.get('QT_COZE'), 'github_pages': os.environ.get('QT_GH')},
    'note': os.environ.get('QT_NOTE') or '',
}
with open(os.environ['QT_REPORT'], 'w', encoding='utf-8') as f:
    json.dump(rep, f, ensure_ascii=False, indent=2)
print('[deploy] 部署结果已写入 ' + os.environ['QT_REPORT'])
PY
fi

echo ""
echo "[deploy] ✅ v$VER 部署完成：status=$STATUS"
echo "[deploy]    coze.site   $COZE_URL"
echo "[deploy]    github.io   $GH_URL"
