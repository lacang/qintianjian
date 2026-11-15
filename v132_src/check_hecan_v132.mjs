// v132：多盘合参（问事）骨架桩测
// ①view-hecan 渲染出三个盘位（梅花 / 奇门 / 六爻），且每盘都有「问题域是否覆盖」一行
// ②填入所问、点「起盘」后梅花卡片出真实卦象（与引擎独立算出的卦名逐字对照）
// ③合参区四字段齐全；单盘时固定为 同向空 / 无关「仅 1 盘有结果，无法交叉」/ 冲突空 / 强度弱 / 至少一条可证伪
// ④禁用词扫描：整页渲染文本命中 0
// 用法：在仓库根目录 npm i jsdom 后 `node v132_src/check_hecan_v132.mjs`
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app');
const load = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// 浏览器里这些 .js 是 ES module，Node 默认按 CJS 解析；复制一份到临时目录并标 type=module，
// 既不污染仓库，又保证测的是仓库里这几个文件的原文。
const STAGE = mkdtempSync(path.join(os.tmpdir(), 'qtj-hecan-'));
const NEED = [
  'js/hecanview.js', 'js/state.js', 'js/solartime.js', 'js/geo.js', 'js/citydata.js',
  'vendor/liuyao-core.js',
];
for (const rel of NEED) {
  const dst = path.join(STAGE, 'app', rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  copyFileSync(path.join(APP, rel), dst);
}
writeFileSync(path.join(STAGE, 'package.json'), '{"type":"module"}');

let err = 0, pass = 0;
const chk = (c, m) => { if (!c) { console.log('❌', m); err++; } else { console.log('✓', m); pass++; } };

// 抹平词表：一出现就说明有人在把几盘缝成一个故事
const BANNED = [
  '综合来看', '综合', '殊途同归', '都指向', '指向', '相互印证', '印证',
  '不谋而合', '总体而言', '总体', '整体呈现出', '整体呈现', '整体', '合参一致',
];

console.log('— ① 视图与接线 —');
const INDEX = load('app/index.html');
const MAIN = load('app/js/main.js');
const SW = load('app/sw.js');
chk(/id="view-hecan"/.test(INDEX), 'index.html 有 view-hecan 容器');
chk(/data-open="hecan"/.test(INDEX), '首页有多盘合参入口按钮（data-open="hecan"）');
chk(/from '\.\/hecanview\.js\?v=132'/.test(MAIN), "main.js 已 import './hecanview.js?v=132'");
chk(/name === 'hecan'/.test(MAIN), "main.js openSubview 已接 hecan 分支");
chk(/hecanview\.js\?v=132/.test(SW), 'sw.js 预缓存已列 hecanview.js');
chk(/qintian-v132/.test(SW) && !/qintian-v131/.test(SW), 'sw.js 缓存名已升到 qintian-v132');

// 真 DOM：用仓库里的 index.html 建树（模块脚本 jsdom 不执行，只当容器用）
const dom = new JSDOM(INDEX, { url: 'https://lacang.github.io/qintianjian/' });
const { window } = dom;
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
def('window', window); def('document', window.document); def('navigator', window.navigator);
def('localStorage', window.localStorage); def('getComputedStyle', window.getComputedStyle);
def('HTMLElement', window.HTMLElement); def('Element', window.Element);
def('Event', window.Event); def('MouseEvent', window.MouseEvent);

const view = window.document.querySelector('#view-hecan');
const body = window.document.querySelector('#hecan-body');
chk(!!view && !!body, '#view-hecan / #hecan-body 取到');

const M = await import(pathToFileURL(path.join(STAGE, 'app/js/hecanview.js')).href);
body.innerHTML = M.renderHeCan();
M.initHeCan(view);

const cards = () => Array.from(view.querySelectorAll('.hc-card'));
chk(cards().length === 3, `盘位卡片 3 张（实际 ${cards().length}）`);
chk(cards().map((c) => c.dataset.pan).join(',') === 'meihua,qimen,liuyao',
  `盘位顺序 梅花/奇门/六爻（实际 ${cards().map((c) => c.dataset.pan).join(',')}）`);
chk(cards().every((c) => /问题域是否覆盖：[是否]/.test(c.textContent)), '每盘都有「问题域是否覆盖」一行');
chk(cards().filter((c) => c.dataset.pan !== 'meihua').every((c) => c.textContent.includes('本盘不答此类问题')),
  '未接入的两盘明写「本盘不答此类问题」');

console.log('\n— ② 起盘：梅花卡片出真实卦象 —');
const qEl = view.querySelector('#hc-q');
const atEl = view.querySelector('#hc-at');
const AT = '2026-11-16T09:30';
qEl.value = '这周内这笔款能不能到账';
atEl.value = AT;
view.querySelector('#hc-go').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// 独立复算：直接调引擎，不看视图里的数
const { meiHuaByTime } = await import(pathToFileURL(path.join(STAGE, 'app/vendor/liuyao-core.js')).href);
const [Y, Mo, D, H, Mi] = AT.split(/[-T:]/).map(Number);
const exp = meiHuaByTime(new Date(Y, Mo - 1, D, H, Mi, 0, 0), { longitude: undefined, alreadyApparent: false });
const mhText = view.querySelector('[data-pan="meihua"]').textContent;
chk(mhText.includes(exp.benGua.name), `本卦与引擎一致：${exp.benGua.name}`);
chk(mhText.includes(exp.huGua.name), `互卦与引擎一致：${exp.huGua.name}`);
chk(mhText.includes(exp.bianGua.name), `变卦与引擎一致：${exp.bianGua.name}`);
chk(mhText.includes(`第 ${exp.movingPosition} 爻动`), `动爻与引擎一致：第 ${exp.movingPosition} 爻动`);
chk(!/未起卦|占位|待起盘/.test(mhText), '梅花卡片不是占位符');
chk(mhText.includes('问题域是否覆盖：是'), '所问可辨时梅花自报「覆盖：是」');
chk(!mhText.includes('本盘不答此类问题'), '覆盖时不出现「本盘不答此类问题」');

// 边界：所问清空 → 梅花自报「覆盖：否」，并显式写「本盘不答此类问题」
qEl.value = '';
atEl.value = AT;
view.querySelector('#hc-go').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const mhEmpty = view.querySelector('[data-pan="meihua"]').textContent;
chk(mhEmpty.includes('问题域是否覆盖：否') && mhEmpty.includes('本盘不答此类问题'),
  '所问为空 → 梅花「覆盖：否」+「本盘不答此类问题」');

// 恢复有问状态，后面的合参区按「有问」检查
qEl.value = '这周内这笔款能不能到账';
atEl.value = AT;
view.querySelector('#hc-go').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

console.log('\n— ③ 合参区四字段 —');
const merge = view.querySelector('#hecan-merge');
const mergeText = merge.textContent;
const col = (cls) => merge.querySelector(`.hc-tri-col.${cls}`).textContent;
chk(/同向/.test(mergeText) && /无关/.test(mergeText) && /冲突/.test(mergeText), '同向 / 无关 / 冲突 三区齐全');
chk(col('same').includes('（空）'), `同向为空：${col('same').trim()}`);
chk(col('none').includes('仅 1 盘有结果，无法交叉'), `无关写明原因：${col('none').trim()}`);
chk(col('clash').includes('（空）'), `冲突为空：${col('clash').trim()}`);
const strength = merge.querySelector('.hc-strength b').textContent.trim();
chk(strength === '弱', `结论强度 = ${strength}`);
const fsItems = Array.from(merge.querySelectorAll('.hc-falsify li')).map((li) => li.textContent.trim());
chk(fsItems.length >= 1, `可证伪条件 ${fsItems.length} 条`);
chk(fsItems.every((t) => /^若.+，则本条.+错。?$/.test(t)), '每条都是「若 X…，则本条…错」格式');
fsItems.forEach((t) => console.log('   ·', t));

console.log('\n— ④ 禁用词扫描 —');
const clone = view.cloneNode(true);
clone.querySelectorAll('style,script').forEach((n) => n.remove());
const text = clone.textContent;
const hits = BANNED.map((w) => [w, text.split(w).length - 1]).filter(([, n]) => n > 0);
chk(hits.length === 0, `禁用词命中 ${hits.length} 处${hits.length ? '：' + hits.map(([w, n]) => `${w}×${n}`).join(' ') : ''}（扫描文本 ${text.length} 字）`);

console.log(`\n合参区实测文本：\n${mergeText.replace(/\s+/g, ' ').trim().slice(0, 400)}`);
console.log(err ? `\n❌ 失败 ${err} 项` : `\n✓ 全通过（4 组 / 共 ${pass} 项断言）`);
process.exit(err ? 1 : 0);
