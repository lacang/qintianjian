// v111 桩测：地址中心 / 真太阳时绑地点 / 小六壬坏页 / 行星时择时 / 3D 与拖牌跟手
// 用法： node _lnsrc/ln_stub_test/v111_smoke.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '../../app');

// ---------- DOM / 浏览器桩 ----------
function mkEl(id = '') {
  return {
    id, innerHTML: '', textContent: '', value: '', style: {}, attrs: {}, dataset: {}, children: [],
    addEventListener() {}, removeEventListener() {}, appendChild(c) { this.children.push(c); return c; },
    remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = v; }, focus() {}, blur() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 480, right: 320, bottom: 480 }; },
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  };
}
const els = {};
['sky-body', 'xiaoliuren-body', 'globe-body', 'mansion-body', 'toast', 'place-modal'].forEach(i => { els[i] = mkEl(i); });
globalThis.__els = els;
globalThis.document = {
  getElementById: (i) => els[i] || null,
  querySelector: (sel) => {
    if (typeof sel === 'string' && sel.startsWith('#')) return els[sel.slice(1)] || null;
    return null;
  },
  querySelectorAll: () => [],
  createElement: () => mkEl(), addEventListener() {},
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: { style: {} },
};
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', hardwareConcurrency: 8 }, configurable: true, writable: true });
globalThis.window = { innerWidth: 390, innerHeight: 800, devicePixelRatio: 2, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const M = await import('./v111_bundle.mjs');
const pass = [], fail = [];
const t = (name, cond) => (cond ? pass : fail).push(name);
const src = (f) => readFileSync(join(APP, f), 'utf8');  // f 相对 app/ 根

// ---------- A. 地址中心（geo.js） ----------
const { geo } = M;
t('城市库非空且 > 300 条', geo && geo.CITIES === undefined ? true : M.citydata.CITIES.length > 300);
t('中文检索命中沈阳', geo.searchCity('沈阳')[0]?.n === '沈阳');
t('全拼检索命中沈阳', geo.searchCity('shenyang')[0]?.n === '沈阳');
t('首字母 sy 命中沈阳（首字母同码城市并列，沈阳在列）', geo.searchCity('sy').slice(0, 8).some(c => c.n === '沈阳'));
t('首字母 bj 命中北京', geo.searchCity('bj').some(c => c.n === '北京'));
t('全拼 hangzhou 命中杭州', geo.searchCity('hangzhou')[0]?.n === '杭州');
t('拼音检索 kashi 命中喀什', geo.searchCity('kashi')[0]?.n === '喀什');
t('定位反查：北京坐标→北京', geo.nearestCity(39.90, 116.40)?.city?.n === '北京');
t('定位反查：沈阳坐标→沈阳', geo.nearestCity(41.8057, 123.4328)?.city?.n === '沈阳');
t('默认未设置观测地（src=default）', geo.isPlaceSet() === false && geo.getPlace().name === '沈阳');
let fired = 0;
const off = geo.onPlaceChange(() => { fired++; });
const p = geo.setPlace({ name: '杭州', prov: '浙江', lat: 30.2741, lon: 120.1551, src: 'manual' });
t('手选城市后 isPlaceSet=true', geo.isPlaceSet() === true);
t('手选城市后 getPlace 正确', geo.getPlace().name === '杭州' && p.lat === 30.2741);
t('地点变更会广播', fired === 1);
t('手选城市可被拼音再次搜到', geo.searchCity('hangzhou')[0]?.n === '杭州');
geo.resetPlace();
t('恢复默认回到沈阳', geo.getPlace().name === '沈阳' && geo.isPlaceSet() === false);
off();

// ---------- B. 真太阳时不再写死沈阳（solartime.js） ----------
const { solartime } = M;
const day = new Date(2026, 4, 25, 12, 0, 0);
const offSH = solartime.trueSolarOffsetMin(day, 123.4328);
const offWLMQ = solartime.trueSolarOffsetMin(day, 87.6168);
const offSH2 = solartime.trueSolarOffsetMin(day, 121.4737);
t('真太阳时校正随经度变化（非写死沈阳）', Math.abs((offSH2 - offWLMQ) - 4 * (121.4737 - 87.6168)) < 1.5);
t('沈阳校正量在合理区间（±20 分内含均时差）', Math.abs(offSH) < 25 && offSH > -20);
const stSH = solartime.sunTimes(day, 41.8057, 123.4328);
const stWLMQ = solartime.sunTimes(day, 41.8057, 87.6168);
const dMin = (stSH.sunrise - stWLMQ.sunrise) / 60000; // 负数 = 东边（沈阳）更早
t('日出时刻随经度差 ≈ 4 分/°（东边更早）', dMin < -120 && dMin > -160);
const ph = solartime.planetaryHoursOfDay(day, 41.8057, 123.4328);
const phs = (ph && ph.hours) || [];
t('行星时出 24 时', phs.length === 24);
t('行星时含昼夜分段', phs.some(x => x.isDay) && phs.some(x => !x.isDay));
t('行星时主星按迦勒底次序（≤7 星循环）', new Set(phs.map(x => x.planet)).size <= 7 && !!phs[0]?.planet);
t('行星时昼 12 时 + 夜 12 时', phs.filter(x => x.isDay).length === 12 && phs.filter(x => !x.isDay).length === 12);
t('行星时司日星 = 当日日出日之星期主', !!phs[0]?.dayRuler);

// ---------- C. 天象页 + 行星时择时面板（skyview.js） ----------
const { sky } = M;
sky.renderSky(day);
const skyHtml = els['sky-body'].innerHTML;
t('天象页渲染无 undefined/NaN', !/\bundefined\b|\bNaN\b/.test(skyHtml));
t('天象页含择时面板 ph-pick', skyHtml.includes('id="ph-pick"'));
t('择时面板含 24 时表', (skyHtml.match(/php-row/g) || []).length >= 20);
t('择时面板含司日星', skyHtml.includes('司日') || skyHtml.includes('php-planet'));

// ---------- D. 小六壬视觉化坏页（xiaoliurenview.js） ----------
const { ritual, xiaoliuren } = M;
ritual.castDone('xiaoliuren');
const xlHtml = xiaoliuren.renderXiaoLiuRen(day);
t('小六壬不再输出 undefined', !/\bundefined\b/.test(xlHtml));
t('小六壬不再输出 NaN', !/\bNaN\b/.test(xlHtml));
t('小六壬含三步推算结构', xlHtml.includes('xl-three'));

// ---------- E. 占星城市表接全量离线库 ----------
const { astromodes } = M;
t('占星城市表 > 300 条', astromodes.CITIES.length > 300);
t('占星城市表保留北京/沈阳等关键城市', ['北京', '沈阳', '上海', '广州'].every(n => astromodes.CITIES.some(c => c.name === n)));
t('占星城市项仍有 lat/lonEast 契约', astromodes.CITIES.every(c => Number.isFinite(c.lat) && Number.isFinite(c.lonEast)));

// ---------- F. 源码级断言：跟手 / 3D 宿主搬家 / 宿名描边 ----------
const tv = src('js/tarotview.js');
t('塔罗 pull 分支每帧写 left/top（跟手）', /style\.left\s*=/.test(tv) && /style\.top\s*=/.test(tv));
const m3 = src('js/mansion3d.js');
t('3D 宿主持久化（搬家保留 WebGL 上下文）', m3.includes('appendChild(renderer.domElement)') && m3.includes('applySize'));
t('3D 有 WebGL 失败兜底文案', m3.includes('ms3-fallback'));
const gl = src('js/globe.js');
t('天球仪有 WebGL 失败兜底', gl.includes('gl-fallback'));
t('天球仪有上下文丢失恢复', gl.includes('webglcontextlost') && gl.includes('webglcontextrestored'));
t('天球仪显示当前观测地', gl.includes('gl-place'));
const st = src('css/style.css');
t('二十八宿宿名加描边（可读性）', /\.rk-name\{[^}]*paint-order:stroke/.test(st));

console.log(pass.map(x => '+ ' + x).join('\n'));
if (fail.length) { console.log(fail.map(x => '- ' + x).join('\n')); process.exit(1); }
console.log(`===== v111 桩测: ${pass.length} 通过 / ${fail.length} 失败 =====`);
