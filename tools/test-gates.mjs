#!/usr/bin/env node
/**
 * 钦天监 · 门禁故障注入自测（P0-2：证明门禁真的会拦人）
 *
 * 用法: node tools/test-gates.mjs [--json] [--only A,B,G]
 *
 * 为什么必须做这件事
 * ----------------
 * 主人指出："测试本身可以是绿的，但测试对象可能根本不是最新代码。应该把这件事做成
 * **自动化的失败注入测试**，而不是只靠开发者记得检查。"
 *
 * 一个从没红过的门禁，和一个假绿灯没有区别。所以本脚本对每一道门禁**故意注入故障**，
 * 断言它必须失败；并且每类注入都配一条"无故障时必须通过"的对照，避免出现"门禁无论如何都红"
 * 这种看起来安全的假象。
 *
 * 安全约束：
 *  · 只在**已被 git 跟踪**的文件上做注入，注入前记录 sha256，跑完立刻 `git checkout --` 还原并校验哈希；
 *  · 开跑前若这些文件本来就有未提交改动，直接拒绝运行（不能覆盖主人的未提交工作）；
 *  · 任何一步异常都会走 finally 还原。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 && argv[i + 1] ? argv[i + 1].split(',') : null; })();

const F = {
  yangzhai: 'app/js/yangzhai/yangzhaiview.js',
  main: 'app/js/main.js',
  index: 'app/index.html',
  sw: 'app/sw.js',
  vendor: 'app/vendor/liuyao-core.js',
  tarot: 'app/js/tarotview.js',
};
const TOUCHED = Object.values(F);

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const abs = (rel) => path.join(ROOT, rel);

function run(cmd, args, env = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { rc: r.status === null ? -1 : r.status, out, ms: Date.now() - t0 };
}

/** 从输出里抓第一个 [FAIL:xxx] 标记，作为失败归因证据。 */
const firstFailCode = (out) => (out.match(/\[FAIL:([a-zA-Z0-9_-]+)\]/) || [])[1] || null;

// ---------- 前置：确认可安全注入 ----------
const dirty = run('git', ['status', '--porcelain', '--', ...TOUCHED]);
if (dirty.out.trim()) {
  console.error('[test-gates] ❌ 以下文件有未提交改动，为避免覆盖你的工作，拒绝运行：\n' + dirty.out);
  process.exit(2);
}
const original = {};
for (const rel of TOUCHED) original[rel] = sha(abs(rel));

const restore = (rels) => {
  run('git', ['checkout', '--', ...rels]);
  const bad = rels.filter((rel) => sha(abs(rel)) !== original[rel]);
  return bad;
};

// ---------- 用例定义 ----------
const cases = [
  {
    id: 'A',
    name: 'ESM 重复顶层声明（v121 事故原样）',
    inject: () => fs.writeFileSync(abs(F.yangzhai), 'const yangzhaiCode = 1;\n' + fs.readFileSync(abs(F.yangzhai), 'utf8')),
    restore: [F.yangzhai],
    expect: 'fail',
    cmd: ['node', ['tools/check-modules.mjs']],
    gate: '静态 ESM 模块图',
    extra: () => {
      // 顺带留证：老办法 node --check 对 .js（CommonJS 语义）是假绿灯 —— 这正是这道门禁存在的理由。
      const asJs = path.join(os.tmpdir(), '_qt_gate_legacy.js');
      const asMjs = path.join(os.tmpdir(), '_qt_gate_new.mjs');
      fs.copyFileSync(abs(F.yangzhai), asJs);
      fs.copyFileSync(abs(F.yangzhai), asMjs);
      const legacy = run('node', ['--check', asJs]);
      const fixed = run('node', ['--check', asMjs]);
      fs.rmSync(asJs, { force: true });
      fs.rmSync(asMjs, { force: true });
      if (legacy.rc === 0 && fixed.rc !== 0) {
        return '假绿灯留证：同一份注入文件，`node --check x.js`（旧办法）rc=0 通过，`node --check x.mjs` rc=' + fixed.rc + ' 报错 → 旧检查确实拦不住，必须走 check-modules';
      }
      return `注意：假绿灯条件本次不成立（.js rc=${legacy.rc} / .mjs rc=${fixed.rc}），请复核 check-modules 的检查方式`;
    },
  },
  {
    id: 'B',
    name: 'import 断链（指向不存在的模块）',
    inject: () => fs.writeFileSync(abs(F.main), "import './__no_such_file.js';\n" + fs.readFileSync(abs(F.main), 'utf8')),
    restore: [F.main],
    expect: 'fail',
    cmd: ['node', ['tools/check-modules.mjs']],
    gate: '静态 ESM 模块图',
    expectCode: 'missing-file',
  },
  {
    id: 'C',
    name: '具名导入在目标模块并不存在',
    inject: () => fs.appendFileSync(abs(F.main), "\nimport { definitelyNotExported } from './state.js';\n"),
    restore: [F.main],
    expect: 'fail',
    cmd: ['node', ['tools/check-modules.mjs']],
    gate: '静态 ESM 模块图',
    expectCode: 'missing-export',
  },
  {
    id: 'D',
    name: '真实浏览器：模块图整站不启动',
    inject: () => fs.writeFileSync(abs(F.yangzhai), 'const yangzhaiCode = 1;\n' + fs.readFileSync(abs(F.yangzhai), 'utf8')),
    restore: [F.yangzhai],
    expect: 'fail',
    cmd: ['node', ['tools/verify-browser.mjs']],
    gate: '真实浏览器启动',
  },
  {
    id: 'E',
    name: '版本号不一致（index ?v= 与 sw CACHE 不同步）',
    inject: () => fs.writeFileSync(abs(F.index), fs.readFileSync(abs(F.index), 'utf8').replace(/\?v=\d+/g, '?v=1')),
    restore: [F.index],
    expect: 'fail',
    cmd: ['node', ['tools/verify-browser.mjs']],
    gate: '真实浏览器启动',
  },
  {
    id: 'F',
    name: 'SW 预缓存清单缺项（addAll 整批失败）',
    inject: () => {
      const src = fs.readFileSync(abs(F.sw), 'utf8');
      fs.writeFileSync(abs(F.sw), src.replace("const ASSETS = [", "const ASSETS = [\n  './js/__no_such_asset.js?v=1',"));
    },
    restore: [F.sw],
    expect: 'fail',
    cmd: ['node', ['tools/verify-offline.mjs']],
    gate: 'SW 离线可用',
  },
  {
    id: 'G',
    name: 'vendor 产物与 liuyao-core/src 漂移',
    inject: () => fs.appendFileSync(abs(F.vendor), '\n// 故障注入：制造 src 与 vendor 漂移\n'),
    restore: [F.vendor],
    expect: 'fail',
    cmd: ['node', ['tools/build-vendor.mjs', '--check']],
    gate: 'vendor 产物同步',
  },
  {
    id: 'H',
    name: '构建/校验失败必须阻止部署（dry-run 不得到达部署步骤）',
    inject: () => fs.writeFileSync(abs(F.tarot), 'const x = ;\n' + fs.readFileSync(abs(F.tarot), 'utf8')),
    restore: [F.tarot],
    expect: 'fail',
    cmd: ['bash', ['tools/deploy.sh']],
    gate: '部署阻断',
    env: () => ({ QT_DRY_RUN: '1', QT_ALLOW_DIRTY: '1', QT_DRY_RUN_MARKER: '/tmp/qt_dry_run_marker_fault' }),
    pre: () => fs.rmSync('/tmp/qt_dry_run_marker_fault', { force: true }),
    post: (r) => {
      const reached = fs.existsSync('/tmp/qt_dry_run_marker_fault');
      if (reached) return { ok: false, note: '❌ 门禁失败却仍然走到了部署步骤（标记文件被创建）' };
      if (/拒绝部署/.test(r.out)) return { ok: false, note: '❌ 被"脏工作区"规则拦下，而不是被门禁拦下 → 归因不成立' };
      if (!/\[gates\]|门禁/.test(r.out)) return { ok: false, note: '❌ 输出里看不到门禁相关证据' };
      return { ok: true, note: '门禁失败 → 未到达部署步骤（标记文件未创建）' };
    },
  },
  {
    id: 'I',
    name: 'release.sh 起点版本号与仓库现状不符时拒绝发版',
    inject: () => {},
    restore: [],
    expect: 'fail',
    cmd: ['bash', ['tools/release.sh', '999', '1000']],
    gate: '发版入口',
    expectRc: 2,
  },
  {
    id: 'J',
    name: '对照：无故障时部署 dry-run 必须放行（证明 H 的红来自门禁）',
    inject: () => {},
    restore: [],
    expect: 'pass',
    cmd: ['bash', ['tools/deploy.sh']],
    gate: '部署放行（对照组）',
    env: () => ({ QT_DRY_RUN: '1', QT_ALLOW_DIRTY: '1', QT_DRY_RUN_MARKER: '/tmp/qt_dry_run_marker_ok' }),
    pre: () => fs.rmSync('/tmp/qt_dry_run_marker_ok', { force: true }),
    post: () => (fs.existsSync('/tmp/qt_dry_run_marker_ok')
      ? { ok: true, note: '门禁全绿 → 正常到达部署步骤（标记文件已创建）' }
      : { ok: false, note: '❌ 无故障却没走到部署步骤 → 说明 H 的失败不是门禁造成的' }),
  },
];

// ---------- 执行 ----------
const results = [];
for (const c of cases) {
  if (ONLY && !ONLY.includes(c.id)) continue;
  const t0 = Date.now();
  let res = { id: c.id, name: c.name, gate: c.gate, ok: false, rc: null, ms: 0, code: null, notes: [], extra: null };
  try {
    if (c.pre) c.pre();
    c.inject();
    const env = c.env ? c.env() : {};
    const r = run(c.cmd[0], c.cmd[1], env);
    res.rc = r.rc;
    res.ms = Date.now() - t0;
    res.code = firstFailCode(r.out);
    const wantRc = c.expectRc;
    const failedAsExpected = c.expect === 'fail' ? r.rc !== 0 : r.rc === 0;
    const rcOk = wantRc === undefined ? failedAsExpected : r.rc === wantRc;
    res.ok = rcOk;
    if (!rcOk) res.notes.push(`退出码不符合预期：rc=${r.rc}（期望${c.expect === 'fail' ? '非 0' : '0'}${wantRc !== undefined ? ' 且等于 ' + wantRc : ''}）`);
    if (c.expectCode && res.code !== c.expectCode) {
      res.ok = false;
      res.notes.push(`失败归因不符：抓到 [FAIL:${res.code}]，期望 [FAIL:${c.expectCode}]`);
    }
    if (c.expect === 'fail' && res.code) res.notes.push(`门禁报错类型：[FAIL:${res.code}]`);
    if (c.post) {
      const p = c.post(r);
      if (!p.ok) res.ok = false;
      res.notes.push(p.note);
    }
    if (c.extra) res.extra = c.extra();
    if (r.rc !== 0 && c.expect === 'fail') res.headline = (r.out.split('\n').find((l) => l.includes('[FAIL:')) || '').trim().slice(0, 160);
  } catch (e) {
    res.notes.push('执行异常：' + (e && e.message ? e.message : e));
  } finally {
    if (c.restore.length) {
      const bad = restore(c.restore);
      if (bad.length) { res.ok = false; res.notes.push('❌ 还原失败：' + bad.join(', ')); }
    }
  }
  results.push(res);
}

// ---------- 汇总 ----------
const passed = results.filter((r) => r.ok).length;
const allOk = passed === results.length;
const summary = { root: ROOT, total: results.length, passed, ok: allOk, results };

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('\n========== 门禁故障注入自测 ==========');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} [${r.id}] ${r.name}`);
    console.log(`     门禁=${r.gate} rc=${r.rc} ${r.ms}ms`);
    for (const n of r.notes) console.log('     · ' + n);
    if (r.extra) console.log('     · ' + r.extra);
  }
  console.log(`\n${passed}/${results.length} 个注入用例符合预期`);
  console.log(allOk ? '[test-gates] PASS —— 每道门禁都能拦住对应的故障' : '[test-gates] FAIL —— 有门禁拦不住故障，必须先修门禁');
}

// 还原校验
const leftDirty = run('git', ['status', '--porcelain', '--', ...TOUCHED]).out.trim();
if (leftDirty) {
  console.error('[test-gates] ⚠️ 注入文件未完全还原：\n' + leftDirty);
  process.exit(1);
}
process.exit(allOk ? 0 : 1);
