#!/usr/bin/env bash
# 钦天监 · 统一部署入口（P0-2：门禁不过，绝不部署）
#
# 用法：
#   bash tools/deploy.sh [--no-gates] [--no-remote-check] [--note "说明"]
#   bash tools/deploy.sh --verify-only   # 只做线上核验，不跑门禁也不部署（排障用）
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
VERIFY_ONLY=0
NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-gates) NO_GATES=1 ;;
    --no-remote-check) NO_REMOTE=1 ;;
    --verify-only) VERIFY_ONLY=1; NO_GATES=1 ;;
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

# set -u 下这些变量必须在被引用前定义；正常路径下由第 4/5 节覆盖
if [ "$VERIFY_ONLY" -eq 1 ]; then STATUS="verify-only"; else STATUS=""; fi
DEPLOY_ID=""
APP_ID=""
REMOTE_COZE=""; REMOTE_GH=""
if [ "$VERIFY_ONLY" -eq 0 ]; then
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
fi   # ← 结束 VERIFY_ONLY 跳过段（--verify-only 时直接进入线上核验）

# ---------- 5. 线上核验：两站 sw.js 必须与本地字节一致 + index.html 版本一致 ----------
# 为什么不只比版本号：版本号对不代表内容对（CDN 可能返回旧的同名文件）。
# 为什么不加 ?cache-buster 或 Cache-Control: no-cache：实测 coze.site 这个共享域 CDN
#   在这两种情况下约一半概率挂起 22s（http=000），会让核验假失败。用普通 GET + 重试，
#   并直接比对 sw.js 内容的 sha256 —— 这比只读版本号更强，也能容忍 CDN 收敛延迟。
REMOTE_COZE="skipped"
REMOTE_GH="skipped"
if [ "$NO_REMOTE" -eq 0 ] && [ "${QT_SKIP_REMOTE:-0}" != "1" ]; then
  echo ""
  echo "════════ 线上核验（sw.js 与本地字节一致 + index.html 版本一致）════════"
  LOCAL_SW_SHA=$(sha256sum app/sw.js | awk '{print $1}')
  EMPTY_SHA=$(printf '' | sha256sum | awk '{print $1}')

  # 返回 0=一致 / 1=读到内容但不一致 / 2=一直读不到（网络或 CDN 抖动）
  check_site() {
    local name="$1" base="$2" i swsha htmlver
    for i in $(seq 1 6); do
      swsha=$(curl -s -m 30 "$base/sw.js" | sha256sum | awk '{print $1}')
      if [ "$swsha" = "$EMPTY_SHA" ]; then
        echo "[deploy]   $name 第 $i 次：读不到 sw.js（网络/CDN 抖动），重试…"
        sleep 10; continue
      fi
      if [ "$swsha" != "$LOCAL_SW_SHA" ]; then
        echo "[deploy]   $name 第 $i 次：sw.js 与本地不一致（远端 ${swsha:0:12} / 本地 ${LOCAL_SW_SHA:0:12}），等收敛…"
        sleep 10; continue
      fi
      htmlver=$(curl -s -m 30 "$base/" | grep -o '?v=[0-9]\+' | head -1 | tr -d '?v=')
      if [ "$htmlver" = "$VER" ]; then
        echo "$name sw.js 字节一致 / index.html ?v=$htmlver ✅"
        return 0
      fi
      echo "[deploy]   $name 第 $i 次：sw.js 一致但 index.html ?v=$htmlver（期望 $VER），等收敛…"
      sleep 10
    done
    if [ "$swsha" = "$EMPTY_SHA" ]; then
      echo "$name 始终读不到（本地/网络受限）⚠️"
      return 2
    fi
    echo "$name sw.js=${swsha:0:12} htmlver=$htmlver（期望 $VER）❌"
    return 1
  }

  echo ""
  echo "[deploy] 核验 coze.site："
  check_site "coze.site" "$COZE_URL"; RC_COZE=$?
  echo "[deploy] 核验 github.io："
  check_site "github.io" "$GH_URL"; RC_GH=$?

  if [ "$RC_COZE" = "0" ]; then REMOTE_COZE="ok"; elif [ "$RC_COZE" = "2" ]; then REMOTE_COZE="unreachable"; else REMOTE_COZE="mismatch"; fi
  if [ "$RC_GH" = "0" ]; then REMOTE_GH="ok"; elif [ "$RC_GH" = "2" ]; then REMOTE_GH="unreachable"; else REMOTE_GH="mismatch"; fi

  if [ "$RC_COZE" = "1" ] || [ "$RC_GH" = "1" ]; then
    echo "[deploy] ❌ 有站点线上内容与本地不一致（sw.js 字节不同或 index.html 版本不对）。" >&2
    exit 1
  fi
  if [ "$RC_COZE" = "2" ] && [ "$RC_GH" = "2" ]; then
    echo "[deploy] ❌ 两个站点都读不到，本次没有任何线上证据，不算部署成功。" >&2
    exit 1
  fi
  if [ "$RC_COZE" = "2" ] || [ "$RC_GH" = "2" ]; then
    echo "[deploy] ⚠️ 有站点从本机读不到（可能是本机网络受限，不一定是部署问题）："
    echo "[deploy]    coze.site=$REMOTE_COZE / github.io=$REMOTE_GH"
    echo "[deploy]    已至少核验一个站点；请人工在浏览器里确认另一个站点。"
  fi
  echo "[deploy] 线上核验：coze.site=$REMOTE_COZE / github.io=$REMOTE_GH"
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
echo "[deploy] ✅ v$VER 完成：status=${STATUS}"
echo "[deploy]    coze.site   $COZE_URL"
echo "[deploy]    github.io   $GH_URL"
