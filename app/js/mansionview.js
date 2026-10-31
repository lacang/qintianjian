// 实时中国传统星象 · 二十八宿躔次（纯天文历法事实，不作吉凶）
// 多层同心环星盘：外宿名（真实经度）→ 宿度弧带（宽度=实测跨度）→ 七政星点 → 中星指针。
// 全部可点：点星点/宿名/下方标签均出详情卡；赤道·黄道一键切换。
import {
  mansionSnapshot, zhiSu, MANSIONS, MANSION_BY_NAME, SISHOU_COLOR, GU_DU_ZHOUTIAN,
} from '../vendor/liuyao-core.js?v=124';
import { $, nowDate, pad, escapeHtml, toSec } from './state.js?v=124';
import { siyuLongitudes, solarParams } from './solartime.js?v=124';
import { initMansion3D } from './mansion3d.js?v=124';
import { getPlace } from './geo.js?v=124';
// 观测地：二十八宿的中星/值宿随经度变，按当前地点算（v111：不再固定北京）
function obsNow() { const p = getPlace(); return { lat: p.lat, lonEast: p.lon }; }

// 元素对照：二十八宿 / 七政 的含义 key
const MS_KEY = { 角:'ms-jiao', 亢:'ms-kang', 氐:'ms-di', 房:'ms-fang', 心:'ms-xin', 尾:'ms-wei', 箕:'ms-ji',
  斗:'ms-dou', 牛:'ms-niu', 女:'ms-nv', 虚:'ms-xu', 危:'ms-wei2', 室:'ms-shi', 壁:'ms-bi', 奎:'ms-kui',
  娄:'ms-lou', 胃:'ms-wei3', 昴:'ms-mao', 毕:'ms-bi2', 觜:'ms-zi', 参:'ms-shen', 井:'ms-jing', 鬼:'ms-gui',
  柳:'ms-liu', 星:'ms-xing', 张:'ms-zhang', 翼:'ms-yi', 轸:'ms-zhen' };
const MS_BODY_KEY = { sun:'ms-sun', moon:'ms-moon' };

import { guideHTML, T } from './tipview.js?v=124';

let frame = localStorage.getItem('qt-mansion-frame') === 'ect' ? 'ect' : 'eqd';
// 选中项：{t:'body', id} 或 {t:'mansion', name}
let sel = { t: 'body', id: 'sun' };
let lastNow = null;

const P_CN = { sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星' };
const P_COLOR = {
  sun: '#f5c15c', moon: '#e6ecf7', mercury: '#a9bdd0', venus: '#eab0cf',
  mars: '#e8745a', jupiter: '#e0b275', saturn: '#d6c69a',
  luohou: '#c07be0', jidu: '#9c8fd8', yuebei: '#7fa8e8',
};

// ---------- 四余（罗睺 / 计都 / 月孛）----------
// 无实体可见星，为月亮轨道特征点（平位置）：罗睺=黄白升交点、计都=降交点、月孛=月道远地点。
// 罗计逆行（交点西移），月孛顺行（远地点东移）。第四余「紫气」无对应天体、诸书推法不一，如实暂缺。
const SIYU_IDS = ['luohou', 'jidu', 'yuebei'];
const SIYU_META = {
  luohou: { name: '罗睺', retro: true, sub: '黄白升交点（今测）', note: '罗睺为月亮轨道与黄道的升交点。日月食只发生在交点附近，古人目见「龙头吞日」，故尊罗睺为食神之首。四余之一，火之余。', src: '唐《九执历》传入罗计；明·万民英《星学大成》' },
  jidu: { name: '计都', retro: true, sub: '黄白降交点（今测）', note: '计都为黄白降交点，与罗睺相对为「龙尾」，同为蚀神。四余之一，土之余。', src: '唐《九执历》；明·万民英《星学大成》' },
  yuebei: { name: '月孛', retro: false, sub: '月道远地点（今测）', note: '月孛为月亮轨道远地点，古人谓月行至此最迟，视为月之「余气」。四余之一，水之余。', src: '明·万民英《星学大成》；《七政推步》' },
};

// 把四余黄经换算到当前帧（ect 直用黄经；eqd 转赤经），并求所入宿与入宿度
function siyuBodies(snap, now) {
  const { luohou, jidu, yuebei } = siyuLongitudes(now);
  const defs = [
    { id: 'luohou', lon: luohou }, { id: 'jidu', lon: jidu }, { id: 'yuebei', lon: yuebei },
  ];
  const guK = GU_DU_ZHOUTIAN / 360;
  return defs.map((d) => {
    let L = d.lon;
    if (snap.frame === 'eqd') {
      const eps = solarParams(now).obliq * Math.PI / 180;
      const lam = d.lon * Math.PI / 180;
      L = (Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) * 180 / Math.PI + 360) % 360;
    }
    const bs = snap.boundaries;
    let mi = 0;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i].lon, b = bs[(i + 1) % bs.length].lon;
      const span = (b - a + 360) % 360;
      if (((L - a + 360) % 360) < span) { mi = i; break; }
    }
    const m = MANSION_BY_NAME[bs[mi].name];
    const ruDu = (L - bs[mi].lon + 360) % 360;
    return {
      id: d.id, name: SIYU_META[d.id].name, retrograde: SIYU_META[d.id].retro,
      mansion: bs[mi].name, sishou: m ? m.sishou : '', ruDu, ruGuDu: ruDu * guK, lon: d.lon,
    };
  });
}
const FRAME_LABEL = { eqd: '赤道宿度', ect: '黄道宿度' };
const FRAME_SUB = { eqd: '传统正朔 · 距星赤经', ect: '七政四余 · 距星黄经' };
const FRAME_NOTE = {
  eqd: '赤道宿度为中国传统天文正朔，以距星赤经分区，源自《淮南子·天文训》《开元占经》《授时历》。',
  ect: '黄道宿度为七政四余所用，以距星黄经分区。两套皆以当日实测距星为界，随岁差漂移。',
};

/* 解盘思路：怎么看这张星官盘（小白向） */
const MANSION_GUIDE = {
  title: '怎么看这张星官盘',
  intro: '这是一张「此刻天象」图——把此刻太阳、月亮、五大行星在二十八宿里的位置，画在一圈星盘上。它只报位置，不预测吉凶。 本盘每一个宿名都可以点开——卡里会告诉你这一宿是什么、传统星占主什么事、对应天上哪颗星。',
  steps: [
    { t: '外圈那一圈名字', d: '是二十八宿，古人沿天赤道把天空分成的 28 段，相当于中国的「星座分区」。', tip: 'mansion', sel: '.mansion-ring' },
    { t: '彩色弧带', d: '每条弧对应一宿，弧越长说明这宿占的天区越大；四种颜色代表东南西北四象。', tip: 'sishou', sel: '.mansion-ring' },
    { t: '盘里发光的点', d: '是日月五星（七政）此刻所在的位置，颜色各不相同。', tip: 'qizheng', sel: '.mansion-ring' },
    { t: '盘正中心', d: '写着「日躔X宿」，意思是太阳现在走到了哪一宿。', tip: 'richan', sel: '.mansion-ring' },
    { t: '点一下任意处', d: '点星点或宿名，下方会给出详细数据；点带虚线的词，会弹出白话解释。', tip: 'rudu', sel: '.ms-detail' },
  ],
  note: '盘上只列传统体系里的通行含义与古籍出处，不替你下断语；吉凶倾向一律标为「古籍所载」，供你自己衡量。',
};

function momentText(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const D2R = Math.PI / 180;
// 经度(度，0=春分点) -> 屏幕角(0=正上方，顺时针)
const px = (r, lon, cx, cy = cx) => [cx + r * Math.sin(lon * D2R), cy - r * Math.cos(lon * D2R)];

/* 圆弧 path（stroked ribbon，绝不画成楔形三角） */
function arcPath(r, lon0, lon1, cx, cy = cx) {
  let span = lon1 - lon0;
  if (span < 0) span += 360;
  if (span <= 0.0001) span = 0.0001;
  const [x0, y0] = px(r, lon0, cx, cy);
  const [x1, y1] = px(r, lon1, cx, cy);
  const large = span > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/* ============================ 星盘 SVG ============================ */
function ringSVG(snap) {
  const W = 360, cx = W / 2, cy = 192;
  const R_NAME = 164, R_RIB = 138, R_BODY = 104;
  const selM = sel.t === 'mansion' ? sel.name : null;
  let svg = '';

  // 装饰底环
  for (const r of [176, 126, 60]) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" class="rk-deco" rk="${r}"/>`.replace('rk="', 'data-rk="');
  }

  // 宿度弧带：按实测经度升序，每宿一段弧形 ribbon
  const B = snap.boundaries;
  for (let i = 0; i < B.length; i++) {
    const a0 = B[i].lon;
    const a1 = B[(i + 1) % B.length].lon;
    const span = (a1 - a0 + 360) % 360;
    const col = SISHOU_COLOR[B[i].sishou];
    const on = selM === B[i].name;
    svg += `<path d="${arcPath(R_RIB, a0, a1, cx, cy)}" fill="none" stroke="${col}"
      stroke-width="${on ? 13 : 8}" stroke-opacity="${on ? 0.95 : 0.45}" stroke-linecap="butt"
      class="rk-rib" data-sel-mansion="${B[i].name}"/>`;
    // 界刻度
    const [tx0, ty0] = px(R_RIB - 8, a0, cx, cy), [tx1, ty1] = px(R_RIB + 8, a0, cx, cy);
    svg += `<line x1="${tx0.toFixed(1)}" y1="${ty0.toFixed(1)}" x2="${tx1.toFixed(1)}" y2="${ty1.toFixed(1)}" class="rk-tick"/>`;

    // 宿名：放该宿跨度中点；觜宿极窄，引出到外圈避让参宿
    let mid = a0 + span / 2;
    let nr = R_NAME, extra = '';
    if (B[i].name === '觜') { nr = 182; mid = a0 - 2.2; extra = 'rk-name-out'; }
    const [nx, ny] = px(nr, mid, cx, cy);
    const rot = mid; // 径向旋转
    const flip = mid > 180 ? 180 : 0;
    svg += `<g class="rk-nameg ${B[i].name === '觜' || B[i].name === '参' ? 'is-inv' : ''}" data-sel-mansion="${B[i].name}" data-tip="${MS_KEY[B[i].name] || ''}">
      ${extra ? `<line x1="${px(R_RIB + 6, a0, cx, cy)[0].toFixed(1)}" y1="${px(R_RIB + 6, a0, cx, cy)[1].toFixed(1)}" x2="${nx.toFixed(1)}" y2="${(ny - 6).toFixed(1)}" class="rk-leader"/>` : ''}
      <text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" class="rk-name" transform="rotate(${rot + flip} ${nx.toFixed(1)} ${ny.toFixed(1)})">${B[i].name}</text>
    </g>`;
  }

  // 中星指针（南中天）
  {
    const [mx, my] = px(R_NAME + 12, snap.meridianLon, cx, cy);
    svg += `<line x1="${cx}" y1="${cy}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" class="rk-meridian"/>`;
    const [lx, ly] = px(R_NAME + 24, snap.meridianLon, cx, cy);
    svg += `<g data-sel-meridian><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="rk-mer-label">中</text></g>`;
  }

  // 七政星点（真实经度，轻微避让重叠）
  const placed = [];
  snap.bodies.forEach((b, bi) => {
    let lon = b.lon;
    for (const p of placed) if (Math.abs(((lon - p + 540) % 360) - 180) < 16) lon = (lon + 15) % 360;
    placed.push(lon);
    const [x, y] = px(R_BODY, lon, cx, cy);
    const col = P_COLOR[b.id];
    const on = sel.t === 'body' && sel.id === b.id;
    svg += `<g class="rk-bodyg" data-sel-body="${b.id}">`;
    if (on) svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="none" stroke="${col}" stroke-width="1.4" class="rk-halo"/>`;
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 11 : 9}" fill="#070b14" opacity=".86"/>`;
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 7.4 : 6.2}" fill="${col}" class="rk-pl-halo"/>`;
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 2.6 : 2.1}" fill="#fff" opacity=".85"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${(y - 14).toFixed(1)}" class="rk-bodylabel" fill="${col}" stroke="#05080f" stroke-width="3" paint-order="stroke">${b.name.replace('星', '')}</text>`;
    svg += `</g>`;
  });

  // 中心：日躔（可点）
  svg += `<g data-sel-body="sun" class="rk-coreg">
    <circle cx="${cx}" cy="${cy}" r="46" class="rk-core"/>
    <text x="${cx}" y="${cy - 8}" class="rk-core-t">${snap.sunMansion}</text>
    <text x="${cx}" y="${cy + 12}" class="rk-core-s">日躔</text>
  </g>`;

  return `<svg viewBox="0 0 ${W} ${W + 24}" class="mansion-ring" aria-label="二十八宿星盘">${svg}</svg>`;
}

/* ============================ 详情卡 ============================ */
function spanIn(snap, name) {
  const i = snap.boundaries.findIndex((x) => x.name === name);
  if (i < 0) return 0;
  const a0 = snap.boundaries[i].lon;
  const a1 = snap.boundaries[(i + 1) % snap.boundaries.length].lon;
  return (a1 - a0 + 360) % 360;
}

function detailHTML(snap, snapOther, z, now) {
  if (sel.t === 'body') {
    const b = snap.bodies.find((x) => x.id === sel.id);
    if (!b) return '';
    const bo = snapOther.bodies.find((x) => x.id === sel.id);
    const col = P_COLOR[b.id];
    if (SIYU_IDS.includes(b.id)) {
      const meta = SIYU_META[b.id];
      return `
      <div class="dt-head">
        <span class="dt-dot" style="background:${col};box-shadow:0 0 12px ${col}aa"></span>
        <b>${meta.name}</b>
        <span class="dt-tag ${b.retrograde ? 'retro' : ''}">${b.retrograde ? '逆行' : '顺行'}</span>
      </div>
      <div class="dt-big">躔 <b style="color:${SISHOU_COLOR[b.sishou]}">${b.sishou}·${b.mansion}宿</b></div>
      <div class="dt-grid">
        <div><span>${FRAME_LABEL[snap.frame]}入宿度</span><em>${b.ruDu.toFixed(2)}°</em><i>古 ${b.ruGuDu.toFixed(2)} 古度</i></div>
        <div><span>${FRAME_LABEL[snapOther.frame]}入宿度</span><em>${bo.ruDu.toFixed(2)}°</em><i>${bo.mansion}宿 · 古 ${bo.ruGuDu.toFixed(2)} 度</i></div>
      </div>
      <div class="dt-sub">${meta.sub} · 四余虚点，无实体可见星</div>
      <div class="dt-note">${meta.note}</div>
      <div class="dt-note">出处：${meta.src}。第四余「紫气」无对应天体、诸书推法不一，本盘如实暂缺。</div>`;
    }
    return `
      <div class="dt-head">
        <span class="dt-dot" style="background:${col};box-shadow:0 0 12px ${col}aa"></span>
        <b>${b.name}</b>
        <span class="dt-tag ${b.retrograde ? 'retro' : ''}">${b.retrograde ? T('逆行', 'nixing') : '顺行'}</span>
      </div>
      <div class="dt-big">躔 <b style="color:${SISHOU_COLOR[b.sishou]}">${b.sishou}·${b.mansion}宿</b></div>
      <div class="dt-grid">
        <div><span>${FRAME_LABEL[frame]}${T('入宿度', 'rudu')}</span><em>${b.ruDu.toFixed(2)}°</em><i>古 ${b.ruGuDu.toFixed(2)} ${T('古度', 'gudu')}</i></div>
        <div><span>${FRAME_LABEL[snapOther.frame]}${T('入宿度', 'rudu')}</span><em>${bo.ruDu.toFixed(2)}°</em><i>${bo.mansion}宿 · 古 ${bo.ruGuDu.toFixed(2)} 度</i></div>
      </div>
      <div class="dt-tip">点外圈宿名可看该宿${T('距星', 'juxing')}与历代宿度；点其他星点切换七政。</div>`;
  }
  const m = MANSION_BY_NAME[sel.name];
  if (!m) return '';
  const here = snap.bodies.filter((x) => x.mansion === m.name && !SIYU_IDS.includes(x.id)).map((x) => x.name.replace('星', '')).join('、');
  const hereSiyu = snap.bodies.filter((x) => x.mansion === m.name && SIYU_IDS.includes(x.id)).map((x) => x.name).join('、');
  const guDeg = 360 / GU_DU_ZHOUTIAN;
  const inv = m.name === '觜' || m.name === '参';
  return `
    <div class="dt-head">
      <span class="dt-sq" style="background:${SISHOU_COLOR[m.sishou]}"></span>
      <b>${m.sishou} · ${m.name}宿</b>
      <span class="dt-pinyin">${m.pinyin}</span>
    </div>
    <div class="dt-big">${T('距星', 'juxing')} <b>${escapeHtml(m.star.western)}</b></div>
    <div class="dt-grid">
      <div><span>${T('七曜', 'qiyao')} / ${T('禽', 'qin')}</span><em>${m.qiyao} · ${m.qin}</em></div>
      <div><span>${T('距星', 'juxing')}${T('星等', 'xingdeng')}</span><em>${m.star.mag} 等</em><i>${m.star.bayer}</i></div>
      <div><span>${T('《授时历》', 'shoushi')}${T('赤道宿度', 'eqd')}</span><em>${m.shoushiEq} ${T('古度', 'gudu')}</em><i>≈ ${(m.shoushiEq * guDeg).toFixed(2)}°</i></div>
      <div><span>${T('《授时历》', 'shoushi')}${T('黄道宿度', 'ect')}</span><em>${m.shoushiEc} ${T('古度', 'gudu')}</em></div>
      <div><span>今日·${FRAME_LABEL[frame]}</span><em>${spanIn(snap, m.name).toFixed(2)}°</em></div>
      <div><span>今日·${FRAME_LABEL[snapOther.frame]}</span><em>${spanIn(snapOther, m.name).toFixed(2)}°</em></div>
    </div>
    ${here ? `<div class="dt-here">此刻七政在此：<b>${here}</b></div>` : '<div class="dt-here dim">此刻无七政正躔此宿</div>'}
    ${hereSiyu ? `<div class="dt-here">此刻四余在此：<b>${hereSiyu}</b></div>` : ''}
    ${inv ? `<div class="dt-warn">觜、参距星因${T('岁差', 'suicha')}＋自行，约 13 世纪后赤经逆序（${T('觜参逆序', 'zican')}）；实测升序为「参前觜后」，《时宪历》曾据删并觜宿。此处保留 28 宿如实标注。</div>` : ''}
    ${m.note ? `<div class="dt-note">${escapeHtml(m.note)}</div>` : ''}`;
}

/* ============================ 主渲染 ============================ */
export function renderMansion(now = nowDate()) {
  lastNow = now;
  const body = $('#mansion-body');
  if (!body) return;
  const otherF = frame === 'eqd' ? 'ect' : 'eqd';
  let snap, snapOther;
  try { snap = mansionSnapshot(now, frame, undefined, obsNow()); snapOther = mansionSnapshot(now, otherF, undefined, obsNow()); }
  catch (e) { body.innerHTML = `<div class="empty">星象计算失败：${escapeHtml(String(e.message || e))}</div>`; return; }
  // 四余并入星点列表（环盘 / 胶囊 / 详情共用）
  const sb = siyuBodies(snap, now), sbO = siyuBodies(snapOther, now);
  const snapX = { ...snap, bodies: [...snap.bodies, ...sb] };
  const snapXO = { ...snapOther, bodies: [...snapOther.bodies, ...sbO] };
  const z = (() => { try { return zhiSu(now); } catch { return { yueli: snap.moonMansion, zhiri: '—' }; } })();

  const bodyChips = snapX.bodies.map((b) => `
    <button class="bc ${sel.t === 'body' && sel.id === b.id ? 'on' : ''}" data-sel-body="${b.id}" style="--pc:${P_COLOR[b.id]}">
      <i></i>${b.name.replace('星', '')}<span>${b.mansion}</span>${b.retrograde ? '<em class="r">逆</em>' : ''}
    </button>`).join('');

  body.innerHTML = `
  ${guideHTML(MANSION_GUIDE)}
  <div class="ms3-host glass-card">
    <div class="ms3-title">星官 · 真星天球<em>拖转 · 捏缩 · 双击复位</em></div>
    <div id="ms-globe3d"></div>
    <div class="ms3-cap">真实亮星 177 颗（J2000）· 四色弧带为二十八宿界（青龙/玄武/白虎/朱雀）· 金线黄道、青线赤道 · 连线为北斗、紫微、太微、天市及二十八宿距星链 · 光点为七政四余实时位置（点标签看入宿度）。</div>
  </div>
  <div class="ms-framebar">
    <button class="ms-frame-btn ${frame === 'eqd' ? 'on' : ''}" data-frame="eqd">赤道宿度<small>传统正朔</small></button>
    <button class="ms-frame-btn ${frame === 'ect' ? 'on' : ''}" data-frame="ect">黄道宿度<small>七政四余</small></button>
  </div>

  <div class="ms-chart-card">
    <div class="ms-ring-wrap">${ringSVG(snapX)}</div>
    <div class="ms-quick">
      <button class="mq ${sel.t === 'body' && sel.id === 'sun' ? 'on' : ''}" data-sel-body="sun"><span>${T('日躔', 'richan')}</span><b>${snap.sunMansion}宿</b></button>
      <button class="mq ${sel.t === 'body' && sel.id === 'moon' ? 'on' : ''}" data-sel-body="moon"><span>${T('月离', 'yueli')}</span><b>${snap.moonMansion}宿</b></button>
      <button class="mq ${sel.t === 'mansion' && sel.name === snap.meridianMansion ? 'on' : ''}" data-sel-mansion="${snap.meridianMansion}"><span>${T('中星', 'zhongxing')}</span><b>${snap.meridianMansion}宿</b></button>
      <button class="mq ${sel.t === 'mansion' && sel.name === z.zhiri ? 'on' : ''}" data-sel-mansion="${z.zhiri}"><span>${T('值宿', 'zhisu')}</span><b>${z.zhiri}宿</b></button>
    </div>
  </div>
  <div class="ms-hint">点星盘上的 <b>星点</b> 或 <b>宿名</b> 看详情 · 带<span class="gt">虚线的词</span>可点开白话解释 · 上方切换赤道 / 黄道 · 北京时间 ${momentText(now)}</div>

  <div class="ms-bodies">${bodyChips}</div>

  <div class="ms-detail">${detailHTML(snapX, snapXO, z, now)}</div>

  <div class="ms-sec-h">三垣 · 紫微 太微 天市</div>
  <div class="sy3-grid">
    <div class="sy3-card" data-tip="ms-ziwei"><b>紫微垣</b><span>中垣 · 帝廷</span><p>北极五星、北斗、文昌等环拱天极，象皇宫内廷——「中宫天极星，其一明者，太一常居也」。</p></div>
    <div class="sy3-card" data-tip="ms-taiwei"><b>太微垣</b><span>上垣 · 朝廷</span><p>五帝座、三公、九卿列宿其中，为「三光之廷」——日月五星朝会之所，主政令爵禄。</p></div>
    <div class="sy3-card" data-tip="ms-tianshi"><b>天市垣</b><span>下垣 · 市肆</span><p>帝座居中，宗正、市楼、车肆环列，象天子率诸侯临市，主权衡、聚众、交易。</p></div>
  </div>
  <div class="sy3-note">三垣二十八宿合为中国星官总纲：垣象帝廷朝市，宿列天赤道分野。本环盘绘二十八宿躔次与七政四余星点；三垣星官众多，暂以文字总览、不作逐星绘图。四余为月亮轨道特征点（平位置），第四余「紫气」无对应天体、诸书推法不一，如实暂缺。出处：《史记·天官书》《晋书·天文志》。</div>

  <div class="ms-frame-note">${FRAME_NOTE[frame]} 弧带越长表示该宿实测跨度越大；觜宿已窄如一线（见详情）。</div>
  ${snap.invertedPairs.length ? `<div class="ms-inv-note">实测：${snap.invertedPairs.join('、')} 次序在现代坐标下逆序（岁差＋自行），本盘如实标注、不作取舍。</div>` : ''}
  <div class="ms-foot">
    距星取清代《仪象考成》系统，ICRS/J2000 公开星表观测值经岁差章动旋至当日真坐标架；只报日躔、月离、五星躔次、入宿度、中星、值宿等天文历法事实，<b>不作任何吉凶休咎断语</b>。本地计算，离线可查。
  </div>`;

  try { initMansion3D(now); } catch (e) { /* 3D 球独立降级，不影响 2D 盘 */ }
}

/* 事件：绑在常驻 section 上，容器重渲染不丢；SVG/按钮统一委托 */
export function initMansionInteract() {
  const root = $('#view-mansion');
  if (!root || root.dataset.mbound) return;
  root.dataset.mbound = '1';
  root.addEventListener('click', (e) => {
    // 点读术语优先：交给全局 tip 层处理，不触发选盘
    if (e.target.closest('[data-tip]') || e.target.closest('[data-guide-toggle]')) return;
    const fb = e.target.closest('[data-frame]');
    if (fb) {
      const f = fb.dataset.frame;
      if (f !== frame) {
        frame = f;
        try { localStorage.setItem('qt-mansion-frame', f); } catch { /* */ }
        renderMansion(lastNow || undefined);
      }
      return;
    }
    const bb = e.target.closest('[data-sel-body]');
    if (bb) { sel = { t: 'body', id: bb.dataset.selBody }; renderMansion(lastNow || undefined); return; }
    const mb = e.target.closest('[data-sel-mansion]');
    if (mb) { sel = { t: 'mansion', name: mb.dataset.selMansion }; renderMansion(lastNow || undefined); return; }
    if (e.target.closest('[data-sel-meridian]')) {
      // 中星：需要当前宿名，从 DOM 快取不便，直接用默认 now 重算一帧
      try { const s = mansionSnapshot(lastNow || nowDate(), frame, undefined, obsNow()); sel = { t: 'mansion', name: s.meridianMansion }; renderMansion(lastNow || undefined); } catch { /* */ }
    }
  });
}

/* ============================ 复制 / 复现码 ============================ */
export function mansionCopyText(now = nowDate()) {
  const L = [`【实时二十八宿躔次】`, `北京时间 ${momentText(now)}`];
  for (const f of ['eqd', 'ect']) {
    const s = mansionSnapshot(now, f, undefined, obsNow());
    L.push(`—— ${FRAME_LABEL[f]} —— 日躔${s.sunMansion} · 月离${s.moonMansion} · 中星${s.meridianMansion}`);
    for (const b of s.bodies) L.push(`${b.name} 躔${b.mansion}宿 入宿${b.ruDu.toFixed(2)}°（古${b.ruGuDu.toFixed(2)}度）${b.retrograde ? ' 逆行' : ''}`);
  }
  L.push('（只报天文历法事实，不作吉凶）');
  return L.join('\n');
}

export function mansionCode(now = nowDate()) {
  let title = '实时二十八宿', sub = momentText(now);
  try {
    const s = mansionSnapshot(now, frame, undefined, obsNow());
    title = `日躔${s.sunMansion}宿 · 月离${s.moonMansion}宿`;
    sub = `${momentText(now)} · ${FRAME_LABEL[frame]}`;
  } catch { /* */ }
  return { kind: 'sky', data: { at: toSec(now.getTime()) }, title, sub };
}
