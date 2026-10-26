#!/usr/bin/env bash
# 全链资源版本号 bump（FUSE 安全）+ 发版三闸门。
# 用法： bash tools/bump-version.sh <旧版本号> <新版本号>
#   例： bash tools/bump-version.sh 117 118
#
# 同步三处：index.html 引用、js/css 全部 ESM import/link（递归含子目录与 vendor）、
#          sw.js 的 CACHE 常量与 ASSETS。
# 三闸门（任一失败 exit 1，带病不发版）：
#   ① 写回读回断言（FUSE epoch 文件 cat> 静默失败的对策，见 v117 P1 事故）
#   ② 旧版本号残留必须为 0，且 sw.js CACHE==新版本
#   ③ 每个相对 .js import 的真实路径必须存在于 sw.js ASSETS（离线不断链）
# 另含：js/ 下非 .js 杂文件巡检、全量 node --check 语法自检。
set -euo pipefail

OLD="${1:?用法: bash tools/bump-version.sh <旧版本号> <新版本号>}"
NEW="${2:?}"
[ "$OLD" != "$NEW" ] || { echo "旧/新版本号相同"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"

echo "=== bump v${OLD} -> v${NEW}（目录 $APP）==="
python3 "$ROOT/tools/_bump_impl.py" "$APP" "$OLD" "$NEW"

echo
echo "=== 版本号分布（健康状态应只有 v${NEW} 一个值）==="
grep -rhoE 'v=[0-9]+' "$APP/js" "$APP/css" "$APP/index.html" 2>/dev/null | sort | uniq -c
