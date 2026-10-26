#!/usr/bin/env node
/**
 * 钦天监 · 发布记录（P2）
 *
 * 用法:
 *   node tools/release-record.mjs --version 122 \
 *        [--gate-report /tmp/gates.json] [--deploy-report /tmp/deploy.json] \
 *        [--note "一句话说明"] [--url https://...] [--root <仓库根>]
 *
 * 产出: releases/vNNN.json
 *
 * 为什么需要它
 * ------------
 * 主人的要求是"每次发布都能拿出证据，恢复时不依赖某个 AI 还记得之前做过什么"。
 * 发布记录就是那份证据：这一版是谁（哪个提交）、跑了哪些门禁、结果如何、部署到了哪里、
 * 对应哪个部署单号。以后出问题，看这一个文件就能定位"当时到底发了什么"。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const all = (n) => argv.reduce((acc, a, i) => (a === n && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);

const ROOT = path.resolve(opt('--root', path.join(HERE, '..')));
const VERSION = opt('--version');
if (!VERSION || !/^\d+$/.test(VERSION)) {
  console.error('[release-record] 必须用 --version <数字> 指定版本号');
  process.exit(2);
}

function readJson(p) {
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return { error: String(e.message || e) }; }
}
function git(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const gateReport = readJson(opt('--gate-report'));
const deployReport = readJson(opt('--deploy-report'));
// --commit：补记历史版本时用（例如给已发版的 v121 补一份记录，HEAD 已经不是那次提交了）
const COMMIT = opt('--commit');
const dir = path.join(ROOT, 'releases');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `v${VERSION}.json`);

let prev = {};
if (fs.existsSync(file)) { try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { prev = {}; } }

const record = {
  version: Number(VERSION),
  app: '钦天监 PWA',
  updated_at: new Date().toISOString(),
  git: {
    commit: COMMIT ? git('rev-parse', COMMIT) : git('rev-parse', 'HEAD'),
    commit_short: COMMIT ? git('rev-parse', '--short', COMMIT) : git('rev-parse', '--short', 'HEAD'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    dirty: COMMIT ? false : (git('status', '--porcelain') || '').length > 0,
    remotes: (git('remote', '-v') || '').split('\n').filter(Boolean),
  },
  gates: gateReport || prev.gates || null,
  deploy: deployReport || prev.deploy || null,
  urls: all('--url'),
  notes: opt('--note', prev.notes || ''),
};
if (!record.urls.length) record.urls = prev.urls || [];

fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
console.log(`[release-record] 已写入 ${file}`);
console.log(`[release-record] commit=${record.git.commit_short} dirty=${record.git.dirty} gates=${record.gates ? (record.gates.ok ? 'PASS' : 'FAIL') : '未记录'} deploy=${record.deploy ? record.deploy.status || '已记录' : '未记录'}`);
if (record.git.dirty) console.log('[release-record] 注意：工作区有未提交改动，发布记录里的 commit 不能代表实际发布的代码');
