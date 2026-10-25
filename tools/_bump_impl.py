#!/usr/bin/env python3
# 钦天监发版版本号 bump（FUSE 安全）+ 三道硬闸门。
# 由 tools/bump-version.sh 调用：python3 _bump_impl.py <APP_DIR> <OLD> <NEW>
# 闸门：① 写回读回断言 ② 旧版本号残留=0 且 SW CACHE 同步 ③ import 闭包 ⊆ sw.js ASSETS。
# 任一不过即 exit 1。SKIP_JUNK_GATE=1 可临时跳过 js/ 杂文件巡检。
import os, re, sys, subprocess, posixpath

APP, OLD, NEW = sys.argv[1], sys.argv[2], sys.argv[3]
SKIP_JUNK = os.environ.get('SKIP_JUNK_GATE') == '1'
os.chdir(APP)
fail = []

# ---- 收集需要 bump 的文本文件：app 下 js/css/html（递归含子目录/vendor）----
targets = []
for root, dirs, files in os.walk('.'):
    for fn in files:
        if fn.endswith(('.js', '.css', '.html')):
            targets.append(posixpath.join(root, fn).lstrip('./'))
targets = sorted(set(targets))

# ---- ① 可靠写入 + 读回断言（绕开 FUSE epoch 文件 cat> 静默失败）----
changed = 0
for f in targets:
    with open(f, 'rb') as fh:
        b = fh.read()
    b2 = b.replace(('qintian-v' + OLD).encode(), ('qintian-v' + NEW).encode())
    b2 = b2.replace(('?v=' + OLD).encode(), ('?v=' + NEW).encode())
    if b2 == b:
        continue
    with open(f, 'wb') as fh:
        fh.write(b2)
        fh.flush()
        os.fsync(fh.fileno())
    with open(f, 'rb') as fh:
        rb = fh.read()
    if rb != b2:
        fail.append('写回读回不一致（疑似 FUSE 静默失败）: ' + f)
        continue
    changed += 1
print('[bump] 改写 %d 个文件 v%s -> v%s' % (changed, OLD, NEW))

# ---- ② 旧版本号残留闸 ----
pat = re.compile(r'(\?v=%s\b|qintian-v%s\b)' % (re.escape(OLD), re.escape(OLD)))
lingering = []
for f in targets:
    with open(f, 'rb') as fh:
        if pat.search(fh.read().decode('utf-8', 'replace')):
            lingering.append(f)
if lingering:
    fail.append('旧版本号残留（发版中止）:\n    ' + '\n    '.join(lingering))

sw = open('sw.js', encoding='utf-8').read()
m = re.search(r'qintian-v(\d+)', sw)
if not m or m.group(1) != NEW:
    fail.append('sw.js CACHE 常量不是 qintian-v%s（实际 %s）' % (NEW, m.group(0) if m else '未找到'))

# ---- ③ 模块图离线闸：相对 .js import 必须在 sw.js ASSETS ----
assets = set(x.split('?')[0].lstrip('./') for x in re.findall(r"['\"](\.[^'\"]+)['\"]", sw))
RE_FROM = re.compile(r"(?:import|export)[^'\"\n]*?from\s*['\"](\.[^'\"]+)['\"]")
RE_SIDE = re.compile(r"import\s*['\"](\.[^'\"]+)['\"]")
RE_DYN = re.compile(r"import\(\s*['\"](\.[^'\"]+)['\"]\s*\)")
miss = {}
for f in targets:
    if not f.endswith('.js'):
        continue
    src = open(f, encoding='utf-8', errors='replace').read()
    specs = [mm.group(1) for mm in RE_FROM.finditer(src)]
    specs += [mm.group(1) for mm in RE_SIDE.finditer(src)]
    specs += [mm.group(1) for mm in RE_DYN.finditer(src)]
    for spec in specs:
        spec = spec.split('?')[0]
        if not spec.endswith('.js'):
            continue
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(f), spec))
        if resolved not in assets:
            miss.setdefault(f, []).append(resolved)
if miss:
    lines = ['    %s -> %s' % (k, v) for k, vs in miss.items() for v in vs]
    fail.append('import 闭包不在 sw.js 预缓存（离线会断，发版中止）:\n' + '\n'.join(lines))
else:
    print('[gate3] 模块图离线校验通过（SW ASSETS %d 条，0 断链）' % len(assets))

# ---- 卫生闸：js/ 下非 js 杂文件（如 0 字节 sed 残留）----
junk = []
for root, dirs, files in os.walk('js'):
    for fn in files:
        if not fn.endswith('.js'):
            junk.append(posixpath.join(root, fn))
if junk and not SKIP_JUNK:
    fail.append('js/ 下存在非 .js 文件（疑似临时残留，请人工确认）:\n    ' + '\n    '.join(junk))

# ---- 语法自检 ----
for f in targets:
    if f.endswith('.js'):
        r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
        if r.returncode != 0:
            fail.append('node --check 失败: %s\n%s' % (f, r.stderr[:400]))

if fail:
    print('\n========== 发版闸门未通过 ==========')
    for x in fail:
        print('[FAIL] ' + x)
    sys.exit(1)
print('[all gates] 三闸门 + 卫生 + 语法全部通过，可以部署')
