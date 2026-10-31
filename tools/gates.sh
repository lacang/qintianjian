#!/usr/bin/env bash
# 钦天监 · 统一门禁（发版与部署都只走这一条路）
#
# 用法：
#   bash tools/gates.sh                       # 全套门禁（静态 + 真实浏览器 + 离线 + 桩测）
#   bash tools/gates.sh --quick               # 快速门禁（静态 + 真实浏览器），发版 bump 前后各跑一次
#   bash tools/gates.sh --no-tests            # 只做门禁，跳过桩测
#   bash tools/gates.sh --expect-version 121  # 额外断言版本号
#
# 环境变量：
#   QT_GATE_REPORT=/path/report.json   把每步结果写成 JSON（供发版记录 releases/vNNN.json 引用）
#
# 退出码：0 = 全绿；1 = 有门禁未通过（调用方必须中止后续发布/部署）；3 = 环境不具备（缺 Chrome 等）
#
# 设计原则：**门禁只认退出码，不做"尽力而为"**。任何一步失败立即中止，避免"测试显示通过、
# 实际跑的却是旧产物"这类假绿灯。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="full"
EXPECT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) MODE="quick" ;;
    --no-tests) MODE="gates" ;;
    --expect-version) EXPECT="${2:-}"; shift ;;
    *) echo "[gates] 未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done

FAILED=""
STEPS_TSV="$(mktemp)"
STEP=0
T0=$(date +%s)

# 跑一步：成功打 ✅；失败记入 FAILED 并立即中止（门禁不允许带病继续）。
step() {
  local name="$1"; shift
  STEP=$((STEP + 1))
  local t0
  t0=$(date +%s)
  echo ""
  echo "──────── [$STEP] $name ────────"
  local rc=0
  "$@" || rc=$?
  local secs=$(( $(date +%s) - t0 ))
  if [ "$rc" -eq 0 ]; then
    echo "✅ $name（${secs}s）"
    printf '%s\t%s\tok\t%s\n' "$STEP" "$name" "$secs" >> "$STEPS_TSV"
    return 0
  fi
  echo "❌ $name 失败（exit=$rc，${secs}s）" >&2
  printf '%s\t%s\tFAIL\t%s\n' "$STEP" "$name" "$secs" >> "$STEPS_TSV"
  FAILED="${FAILED}${name} "
  return 1
}

run_all() {
  # ---- 1. 静态 ESM 模块图：语法 + import 目标存在 + 具名导入确有导出 ----
  # v121 事故（重复声明逃过 node --check 的假绿灯）的直接对策。
  step "静态 ESM 模块图" node tools/check-modules.mjs || return 1

  # ---- 1b. 经典板块（《论语》）纯函数自测 ----
  # 抽取确定性、问题不参与抽取、关系展示权限、八层层序。
  # 数据改动后这些是最容易被无声破坏的约束，必须前置。
  step "经典板块纯函数自测" node tools/test-classic.mjs || return 1

  # ---- 2. vendor 产物是否与 liuyao-core/src 同步（防"src 改了 vendor 没重建"漂移） ----
  step "vendor 产物同步" node tools/build-vendor.mjs --check || return 1

  # ---- 3. 六爻核心正式测试（Vitest，209 例）：golden/najia/跨64卦等单元测试 ----
  # 不走 npm test：云盘同步会把 node_modules/.bin 的符号链接压成文本文件，npx 必然 127。
  step "六爻核心正式测试" bash tools/test-core.sh || return 1

  # ---- 4. 真实浏览器启动：模块图真的能在浏览器里跑起来 ----
  # 静态检查全绿也可能整站不启动（运行时依赖 / MIME / 路径大小写）。
  if [ -n "$EXPECT" ]; then
    step "真实浏览器启动" node tools/verify-browser.mjs --expect-version "$EXPECT" || return 1
  else
    step "真实浏览器启动" node tools/verify-browser.mjs || return 1
  fi

  # ---- 4b. 经典板块交互测试（真实点击） ----
  # 「问题不影响抽取」这条产品承诺只能靠同一序号 + 不同问题的对照点击证明。
  # 三种抽取机制互不混淆、五种反馈不触发重抽、辩一辩先立场后注疏，也都在这一层验。
  step "经典板块交互测试" node tools/test-classic-ui.mjs || return 1

  # ---- 4c. 主题标签正式数据合规 ----
  # 董事长 2026-10-31 批准 v0.2 转正，标签正式进入 pack.topics。
  # 这一步守三件事：正式数据够格（覆盖/依据/边界）、真的进了产品且与源文件一致、
  # 以及三条约束在结构上成立（允许交叉 / 标签不产生关系 / 跨经典不带占位内容）。
  if [ -f ../论语思想单元候选库/_build/topics.json ]; then
    step "主题标签正式数据合规" node tools/check-topics.mjs || return 1
  fi

  [ "$MODE" = "quick" ] && return 0

  # ---- 5. Service Worker 离线可用（PWA 的核心承诺） ----
  if [ -n "$EXPECT" ]; then
    step "SW 离线可用" node tools/verify-offline.mjs --expect-version "$EXPECT" || return 1
  else
    step "SW 离线可用" node tools/verify-offline.mjs || return 1
  fi

  [ "$MODE" = "gates" ] && return 0

  # ---- 6. 桩测链路：先重建 bundle，再跑测试（顺序不能反，否则测的是旧产物） ----
  step "桩测 bundle 重建" bash _lnsrc/ln_stub_test/build.sh || return 1
  step "塔罗冒烟" node _lnsrc/ln_stub_test/tarot_smoke.mjs || return 1
  step "v111 桩测" node _lnsrc/ln_stub_test/v111_smoke.mjs || return 1

  # ---- 7. 复现码端到端 + v1 向后兼容 ----
  step "复现码 e2e（含 v1 兼容）" node v91_src/check_sharecode_v2.mjs || return 1

  # ---- 8. 术数数据/视图回归 ----
  step "塔罗数据" node v91_src/check_tarot_data.mjs || return 1
  step "塔罗视图" node v91_src/check_tarot_view.mjs || return 1
  step "塔罗 v119 回归" node v91_src/check_tarot_v119.mjs || return 1
  step "塔罗 v120 回归" node v91_src/check_tarot_v120.mjs || return 1

  # ---- 9. AI 资料包快照一致性（四层：文件集/逐字节/魂卦断言/格式交叉） ----
  step "AI 资料包快照一致性" node tools/aipack-snapshot-check.mjs || return 1

  return 0
}

run_all
RC=$?
TOTAL=$(( $(date +%s) - T0 ))

if [ -n "${QT_GATE_REPORT:-}" ]; then
  QT_MODE="$MODE" QT_STEPS="$STEPS_TSV" QT_RC="$RC" QT_TOTAL="$TOTAL" QT_REPORT="$QT_GATE_REPORT" python3 - <<'PY'
import json, os
steps = []
with open(os.environ['QT_STEPS'], encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        n, name, st, secs = line.split('\t')
        steps.append({'step': int(n), 'name': name, 'ok': st == 'ok', 'seconds': int(secs)})
rep = {'mode': os.environ['QT_MODE'], 'ok': os.environ['QT_RC'] == '0', 'total_seconds': int(os.environ['QT_TOTAL']), 'steps': steps}
with open(os.environ['QT_REPORT'], 'w', encoding='utf-8') as f:
    json.dump(rep, f, ensure_ascii=False, indent=2)
print('[gates] 报告已写入 ' + os.environ['QT_REPORT'])
PY
fi
rm -f "$STEPS_TSV"

echo ""
echo "════════ 门禁汇总（模式 $MODE，共 ${TOTAL}s）════════"
if [ "$RC" -eq 0 ] && [ -z "$FAILED" ]; then
  echo "[gates] 全部通过 ✅"
  exit 0
fi
echo "[gates] 未通过：${FAILED}" >&2
echo "[gates] 已中止后续步骤（发版/部署不得继续）" >&2
exit 1
