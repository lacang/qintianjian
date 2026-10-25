#!/usr/bin/env bash
# 桩测构建：把 app/js、app/vendor 拷到 /tmp 并剥掉 ?v=（esbuild 不认 query），再打三个 bundle
# 用法： bash _lnsrc/ln_stub_test/build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/_lnsrc/ln_stub_test"
STUB=/tmp/stub111
ESBUILD="$ROOT/liuyao-core/node_modules/.bin/esbuild"

rm -rf "$STUB"; mkdir -p "$STUB"
cp -r "$APP/js" "$STUB/js"
[ -d "$APP/vendor" ] && cp -r "$APP/vendor" "$STUB/vendor"
find "$STUB" -name '*.js' -type f -print0 | xargs -0 sed -i 's/?v=[0-9]\+//g'
cp "$OUT/v111_entry.js" "$STUB/v111_entry.js"

"$ESBUILD" "$STUB/js/tarotview.js"      --bundle --format=esm --outfile="$OUT/tarot_bundle.mjs"  --log-level=warning
"$ESBUILD" "$STUB/js/lenormandview.js"  --bundle --format=esm --outfile="$OUT/ln_bundle.mjs"     --log-level=warning
"$ESBUILD" "$STUB/v111_entry.js"        --bundle --format=esm --outfile="$OUT/v111_bundle.mjs"   --log-level=warning
echo "=== bundle 构建完成：tarot / lenormand / v111 ==="
