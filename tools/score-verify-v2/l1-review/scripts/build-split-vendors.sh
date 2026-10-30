#!/usr/bin/env bash
# 构建组合影响矩阵所需的 4 份 vendor 产物（可复现）。
#
#   /tmp/vendor-pre.mjs      V0：commit 0ed9e89 的线上产物（L0 前 + L1 前）
#   /tmp/vout-L0/index.js    仅 L0：constants/guaTable/paipan 取当前，wangshuai 取 HEAD
#   /tmp/vout-L1/index.js    仅 L1：wangshuai 取当前，其余三文件取 HEAD
#   app/vendor/liuyao-core.js 当前：L0 + L1（由 tools/build-vendor.mjs 产出）
#
# 依据：0ed9e89..HEAD 只改了 app/js/verdict.js，liuyao-core/src 零改动，
# 所以 V0 vendor 等于 HEAD vendor，两个分体 vendor 的差异可精确归因到 L0 / L1。
#
# 用法：bash tools/score-verify-v2/l1-review/scripts/build-split-vendors.sh
set -uo pipefail
cd "$(dirname "$0")/../../../.." || exit 2   # → 每日六爻

BASE=${BASE:-0ed9e89}
TMP=liuyao-core/.tmp-split

echo "[1/4] 取 $BASE 的 vendor → /tmp/vendor-pre.mjs"
git show "$BASE:app/vendor/liuyao-core.js" > /tmp/vendor-pre.mjs || exit 1
wc -c /tmp/vendor-pre.mjs

echo "[2/4] 准备两份 src 副本"
rm -rf "$TMP" && mkdir -p "$TMP/srcL0" "$TMP/srcL1"
cp -r liuyao-core/src/. "$TMP/srcL0/"
cp -r liuyao-core/src/. "$TMP/srcL1/"

# L0 分体：wangshuai 回到 HEAD（去掉 L1）
git show "HEAD:liuyao-core/src/wangshuai.ts" > "$TMP/srcL0/wangshuai.ts" || exit 1
# L1 分体：constants/guaTable/paipan 回到 HEAD（去掉 L0）
for f in constants guaTable paipan; do
  git show "HEAD:liuyao-core/src/$f.ts" > "$TMP/srcL1/$f.ts" || exit 1
done

echo "[3/4] tsup 构建两份分体 bundle（DTS 报错可忽略，只需 JS）"
cd liuyao-core || exit 1
rm -rf /tmp/vout-L0 /tmp/vout-L1
node node_modules/tsup/dist/cli-default.js .tmp-split/srcL0/index.ts --format esm --out-dir /tmp/vout-L0 >/dev/null 2>&1
node node_modules/tsup/dist/cli-default.js .tmp-split/srcL1/index.ts --format esm --out-dir /tmp/vout-L1 >/dev/null 2>&1
cd ..

echo "[4/4] 校验产物"
for p in /tmp/vendor-pre.mjs /tmp/vout-L0/index.js /tmp/vout-L1/index.js app/vendor/liuyao-core.js; do
  [ -s "$p" ] && echo "  OK $p ($(wc -c < "$p") bytes)" || { echo "  MISSING $p" >&2; exit 1; }
done
echo "完成。分体 src 副本保留在 $TMP（已在 .gitignore 外，勿提交）。"
