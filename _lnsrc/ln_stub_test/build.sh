#!/usr/bin/env bash
# 桩测构建：把 app/js、app/vendor 拷到 /tmp 并剥掉 ?v=（esbuild 不认 query），再打 bundle
# 用法： bash _lnsrc/ln_stub_test/build.sh
# 变更（v121）：
#   - v120 已删小雷诺曼，原来那行 `js/lenormandview.js` bundle 会因文件不存在直接失败（set -e），已移除；
#     配套的 ln_bundle.mjs / run.mjs 是 v119 及以前的产物，已无用，保留仅作历史（未删）。
#   - node_modules 里的 esbuild 可执行位在云盘同步后经常丢失（.bin/esbuild 与 esbuild/bin/esbuild），
#     这里自愈 chmod，避免 `Permission denied`。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/_lnsrc/ln_stub_test"
STUB=/tmp/stub111
NM="$ROOT/liuyao-core/node_modules"

# --- esbuild 可执行位自愈（云盘 FUSE 会丢 exec bit）---
chmod +x "$NM/.bin/esbuild" 2>/dev/null || true
chmod +x "$NM/esbuild/bin/esbuild" 2>/dev/null || true
chmod +x "$NM/@esbuild/linux-x64/bin/esbuild" 2>/dev/null || true

# --- 选一个能真正执行的 esbuild ---
# 坑：node_modules/.bin/esbuild 这个 shim 内容就是裸相对路径 `../esbuild/bin/esbuild`，
# 只在 CWD=node_modules/.bin 时才解析得到，从仓库根调用必然 "No such file or directory"。
# 所以优先直接用平台原生二进制，退化时用 node 跑 JS 包装层。
if [ -x "$NM/@esbuild/linux-x64/bin/esbuild" ]; then
  ESBUILD="$NM/@esbuild/linux-x64/bin/esbuild"
else
  ESBUILD="node $NM/esbuild/bin/esbuild"
fi
echo "[build.sh] esbuild = $ESBUILD"

rm -rf "$STUB"; mkdir -p "$STUB"
cp -r "$APP/js" "$STUB/js"
[ -d "$APP/vendor" ] && cp -r "$APP/vendor" "$STUB/vendor"
find "$STUB" -name '*.js' -type f -print0 | xargs -0 sed -i 's/?v=[0-9]\+//g'
cp "$OUT/v111_entry.js" "$STUB/v111_entry.js"

"$ESBUILD" "$STUB/js/tarotview.js" --bundle --format=esm --outfile="$OUT/tarot_bundle.mjs" --log-level=warning
"$ESBUILD" "$STUB/v111_entry.js"   --bundle --format=esm --outfile="$OUT/v111_bundle.mjs"   --log-level=warning
echo "=== bundle 构建完成：tarot / v111 ==="
