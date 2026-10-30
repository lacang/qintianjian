#!/usr/bin/env bash
# 六爻核心正式测试入口（Vitest）。
#
# 为什么不用 `npm test` / `npx vitest`：
#   本工作区在云盘同步下，node_modules/.bin/* 里的符号链接会被压成「只有一行相对路径的
#   纯文本文件」（file 显示 ASCII text, no line terminators）。于是 npx 会把它当 shell
#   脚本执行，报 `../vitest/vitest.mjs: not found`（exit 127）——这不是 vitest 坏了，
#   而是 bin shim 坏了。直接用 node 调 vitest 的真实入口可绕开该问题。
#
# 退出码：0=全通过；非 0=失败或环境缺失（显式失败，不静默跳过）。
set -uo pipefail
cd "$(dirname "$0")/../liuyao-core" || exit 2

ENTRY=node_modules/vitest/vitest.mjs
if [ ! -f "$ENTRY" ]; then
  echo "❌ 未找到 $ENTRY —— 依赖未安装（先在 liuyao-core 执行 npm install）" >&2
  exit 2
fi

exec node "$ENTRY" run --reporter=basic "$@"
