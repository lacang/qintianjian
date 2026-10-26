#!/usr/bin/env bash
# 钦天监 · 统一发版入口
#
# 用法：
#   bash tools/release.sh <旧版本号> <新版本号> [--skip-tests] [--no-record]
#   例：bash tools/release.sh 121 122
#
# 固定动作顺序（顺序本身就是防错设计）：
#   1) 起点门禁（快速）：确认"改之前"是绿的，旧版本号与现网一致
#   2) bump 版本号（tools/bump-version.sh，内含写回读回/残留/SW 一致性三闸门）
#   3) 终点门禁（全套）：静态 + 真实浏览器 + 离线 + 桩测 + 复现码 e2e
#   4) 写发布记录 releases/vNNN.json
#   5) 打印后续（git 提交/推送、tools/deploy.sh 部署）
#
# 任何一步失败立即中止，不做"跳过继续"。发版前门禁没过，就绝不动版本号。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OLD="${1:-}"
NEW="${2:-}"
shift 2 2>/dev/null || true
SKIP_TESTS=0
NO_RECORD=0
NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-tests) SKIP_TESTS=1 ;;
    --no-record) NO_RECORD=1 ;;
    --note) NOTE="${2:-}"; shift ;;
    *) echo "[release] 未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done

if ! [[ "$OLD" =~ ^[0-9]+$ ]] || ! [[ "$NEW" =~ ^[0-9]+$ ]]; then
  echo "用法：bash tools/release.sh <旧版本号> <新版本号> [--skip-tests] [--no-record]" >&2
  exit 2
fi
if [ "$NEW" -le "$OLD" ]; then
  echo "[release] 新版本号 $NEW 必须大于旧版本号 $OLD" >&2
  exit 2
fi

CUR_IDX=$(grep -o '?v=[0-9]\+' app/index.html | head -1 | tr -d '?v=')
CUR_SW=$(grep -o 'qintian-v[0-9]\+' app/sw.js | head -1 | sed 's/qintian-v//')
echo "[release] 当前 index.html ?v=$CUR_IDX / sw.js CACHE=qintian-v$CUR_SW；准备 $OLD → $NEW"
if [ "$CUR_IDX" != "$OLD" ] || [ "$CUR_SW" != "$OLD" ]; then
  echo "[release] ❌ 声明的旧版本号 $OLD 与仓库现状（index=$CUR_IDX / sw=$CUR_SW）不一致，请先核对再发版。" >&2
  exit 2
fi

GATE_ARGS=(--expect-version "$OLD")
[ "$SKIP_TESTS" -eq 1 ] && GATE_ARGS=(--quick --expect-version "$OLD")

echo ""
echo "════════ 阶段 1/4：起点门禁（快速，确认改之前是绿的）════════"
bash tools/gates.sh "${GATE_ARGS[@]}" || { echo "[release] ❌ 起点门禁未通过，未做任何修改，已中止。" >&2; exit 1; }

echo ""
echo "════════ 阶段 2/4：bump 版本号 $OLD → $NEW ════════"
bash tools/bump-version.sh "$OLD" "$NEW" || { echo "[release] ❌ bump 失败（bump-version.sh 自带三闸门），已中止。" >&2; exit 1; }

echo ""
echo "════════ 阶段 3/4：终点门禁（全套，断言新版本 $NEW）════════"
GATE_REPORT="$(mktemp /tmp/qt-gates-XXXXXX.json)"
if [ "$SKIP_TESTS" -eq 1 ]; then
  QT_GATE_REPORT="$GATE_REPORT" bash tools/gates.sh --quick --expect-version "$NEW"
else
  QT_GATE_REPORT="$GATE_REPORT" bash tools/gates.sh --expect-version "$NEW"
fi
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "" >&2
  echo "[release] ❌ 终点门禁未通过。版本号已被 bump 到 $NEW，请修好问题后重跑门禁；" >&2
  echo "[release]    不要带着红门禁提交或部署（这正是 v121 那次假绿灯的教训）。" >&2
  exit 1
fi

echo ""
echo "════════ 阶段 4/4：写发布记录 ════════"
if [ "$NO_RECORD" -eq 1 ]; then
  echo "[release] 已按 --no-record 跳过发布记录"
else
  node tools/release-record.mjs --version "$NEW" --gate-report "$GATE_REPORT" --note "${NOTE:-发布 $NEW：门禁全绿（静态 ESM / 真实浏览器启动 / SW 离线 / 桩测 / 复现码 e2e）}" \
    --url "https://8xjmbcxsf9.page.coze.site" --url "https://lacang.github.io/qintianjian/" || exit 1
fi
rm -f "$GATE_REPORT"

echo ""
echo "════════ 发版前置完成（v$NEW 已 bump 且门禁全绿）════════"
cat <<EOF
接下来按顺序做（缺一不可）：
  1. 提交并推送双远端：
       git add -A && git commit -m "feat(v$NEW): <说明>"
       git push origin main && git push github main
  2. 部署（部署前会再跑一遍门禁，脏工作区会被拒绝）：
       bash tools/deploy.sh --note "v$NEW"
  3. 部署后核验：tools/deploy.sh 会自动核对线上 sw.js 版本号并写进 releases/v$NEW.json
  4. 归档记忆：recent_memory/ + MEMORY.md 状态锚点
EOF
