// 黄道十二星座 · 会动星图（当下黄道星空）
// 星点：J2000 赤经(小时)/赤纬(度)，公开天文事实；连线为传统星图连法（简化示意，非 IAU 边界）
// 绘制坐标：黄道坐标（横轴黄经，纵轴黄纬），故黄道在图中是一条水平线
import { shouyeTianxiang } from '../vendor/liuyao-core.js?v=118';

const D2R = Math.PI / 180, EPS = 23.4393 * D2R;

// [赤经(时), 赤纬(度), 星等档(1最亮/2亮/3普通)]
const ZODIAC = [
  { cn: '白羊', key: 'ari', s: [[2.1196, 23.46, 2], [1.9106, 20.81, 2], [1.8921, 19.29, 3], [2.8335, 27.26, 3]], l: [[0, 1], [1, 2], [0, 3]] },
  { cn: '金牛', key: 'tau', s: [[4.5987, 16.51, 1], [5.4382, 28.61, 2], [4.3299, 15.63, 3], [4.3823, 17.54, 3], [4.4769, 19.18, 3], [5.6274, 21.14, 3]], l: [[2, 3], [3, 4], [4, 1], [2, 0], [0, 4]] },
  { cn: '双子', key: 'gem', s: [[7.5766, 31.89, 1], [7.7553, 28.03, 1], [6.6283, 16.40, 2], [6.3829, 22.51, 3], [6.7322, 25.13, 3], [7.0682, 20.57, 3], [7.3353, 21.98, 3]], l: [[0, 1], [0, 4], [4, 3], [3, 2], [0, 5], [5, 2], [1, 6], [6, 5]] },
  { cn: '巨蟹', key: 'cnc', s: [[8.9748, 11.86, 3], [8.2750, 9.19, 3], [8.7217, 21.47, 3], [8.7448, 18.15, 3], [8.7781, 28.76, 3]], l: [[4, 2], [2, 3], [3, 0], [3, 1]] },
  { cn: '狮子', key: 'leo', s: [[10.1395, 11.97, 1], [11.8177, 14.57, 2], [10.3328, 19.84, 2], [11.2351, 20.52, 2], [9.7646, 23.77, 2], [11.2373, 15.43, 3], [10.2782, 23.42, 3]], l: [[0, 2], [2, 6], [6, 4], [0, 5], [5, 3], [3, 1], [3, 2]] },
  { cn: '室女', key: 'vir', s: [[13.4199, -11.16, 1], [12.6940, -1.45, 2], [13.0362, 10.96, 2], [13.5783, -0.60, 3], [12.3318, -0.67, 3], [11.8448, 1.76, 3], [12.9260, 3.40, 3], [13.1642, -5.54, 3], [14.2664, -6.00, 3]], l: [[5, 4], [4, 1], [1, 2], [1, 6], [6, 3], [3, 0], [1, 7], [7, 8]] },
  { cn: '天秤', key: 'lib', s: [[14.8479, -16.04, 2], [15.2834, -9.38, 2], [15.5921, -14.79, 3], [15.0679, -25.28, 3]], l: [[0, 1], [0, 2], [0, 3], [1, 2]] },
  { cn: '天蝎', key: 'sco', s: [[16.4901, -26.43, 1], [16.0906, -19.81, 2], [16.0055, -22.62, 2], [16.3536, -25.59, 3], [16.5985, -28.22, 3], [16.8362, -34.29, 2], [17.5601, -37.10, 2], [17.6222, -42.99, 2], [17.7933, -40.13, 3], [17.7082, -39.03, 3], [17.5128, -37.30, 3]], l: [[1, 2], [2, 0], [0, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 6]] },
  { cn: '人马', key: 'sgr', s: [[18.0968, -30.42, 2], [18.4029, -34.38, 2], [18.3499, -29.83, 2], [18.4662, -25.42, 2], [18.9212, -26.30, 2], [19.0433, -29.88, 3], [18.7620, -26.99, 3], [19.1152, -27.67, 3]], l: [[0, 2], [2, 1], [2, 3], [3, 6], [6, 4], [4, 5], [5, 1], [5, 7]] },
  { cn: '摩羯', key: 'cap', s: [[20.3017, -12.54, 2], [20.3501, -14.78, 2], [21.6682, -16.66, 3], [21.7837, -16.13, 3], [21.0983, -17.23, 3], [20.8635, -26.92, 3], [21.4439, -22.41, 3]], l: [[0, 1], [1, 4], [4, 6], [6, 5], [6, 2], [2, 3]] },
  { cn: '水瓶', key: 'aqr', s: [[22.0964, -0.32, 2], [21.5267, -5.57, 2], [22.3621, -1.39, 3], [22.9108, -15.82, 3], [22.4805, -0.02, 3], [22.5896, -0.12, 3], [22.2807, -7.78, 3]], l: [[4, 5], [5, 2], [2, 0], [0, 1], [1, 6], [6, 3]] },
  { cn: '双鱼', key: 'psc', s: [[2.0330, 2.76, 2], [23.0651, 3.82, 3], [23.2920, 3.28, 3], [0.8117, 7.59, 3], [1.0479, 7.89, 3], [1.2322, 7.58, 3], [1.5253, 15.35, 3], [1.5305, 9.16, 3]], l: [[0, 7], [7, 6], [0, 2], [2, 1], [0, 5], [5, 4], [4, 3]] },
];

// 赤道 → 黄道
function eq2ecl(raH, decDeg) {
  const a = raH * 15 * D2R, d = decDeg * D2R;
  const lam = Math.atan2(Math.sin(a) * Math.cos(EPS) + Math.tan(d) * Math.sin(EPS), Math.cos(a));
  const bet = Math.asin(Math.sin(d) * Math.cos(EPS) - Math.cos(d) * Math.sin(EPS) * Math.sin(a));
  return [(lam / D2R + 360) % 360, bet / D2R];
}
const ZECL = ZODIAC.map((z) => ({ cn: z.cn, key: z.key, l: z.l, e: z.s.map(([ra, dec, m]) => [...eq2ecl(ra, dec), m]) }));

const P_COLOR = { sun: '#f2b24b', moon: '#dfe6f2', mercury: '#9fb4c7', venus: '#e7a7c4', mars: '#e06b51', jupiter: '#d9a86a', saturn: '#cbb98c', uranus: '#7fd0d6', neptune: '#7d9be8', pluto: '#b08ad6' };
const P_MARK = { sun: '日', moon: '月', mercury: '水', venus: '金', mars: '火', jupiter: '木', saturn: '土', uranus: '天', neptune: '海', pluto: '冥' };

// 确定性伪随机：同一时刻星空稳定，不闪烁乱跳
function prand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function zodiacSkySVG(now = new Date(), moonFn = null) {
  let t; try { t = shouyeTianxiang(now); } catch (e) { return ''; }
  const W = 720, H = 250, SPAN = 240, PPD = W / SPAN;
  const sun = t.bodies.find((b) => b.id === 'sun');
  const lam0 = (sun ? sun.lon : 0) - SPAN / 2, y0 = H / 2;
  const toX = (lam) => { let d = (lam - lam0) % 360; if (d < 0) d += 360; return d * PPD; };
  const toY = (bet) => y0 - bet * PPD;
  let s = '';

  // 深空背景星（静态 + 呼吸）
  const rnd = prand(Math.floor(now.getTime() / 36e5));
  for (let i = 0; i < 120; i++) {
    const x = rnd() * W, y = rnd() * H, r = (0.5 + rnd() * 1.1).toFixed(2), o = (0.22 + rnd() * 0.5).toFixed(2), d = (rnd() * 4).toFixed(2);
    s += `<circle class="zs-bg" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" style="opacity:${o};--d:${d}"/>`;
  }
  // 黄道基准线
  s += `<line class="zs-ecl" x1="0" y1="${y0}" x2="${W}" y2="${y0}"/>`;

  // 十二星座：真实星点 + 连线
  for (const z of ZECL) {
    const pts = z.e.map(([lam, bet, m]) => ({ x: toX(lam), y: toY(bet), m }));
    if (!pts.some((p) => p.x > -30 && p.x < W + 30)) continue;
    for (const [a, b] of z.l) {
      const p = pts[a], q = pts[b];
      s += `<line class="zs-line" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"/>`;
    }
    for (const p of pts) {
      const r = p.m === 1 ? 2.7 : p.m === 2 ? 1.9 : 1.4;
      s += `<circle class="zs-star m${p.m}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" style="--d:${(Math.abs(p.x) % 4).toFixed(2)}"/>`;
    }
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    if (cx > 26 && cx < W - 26) s += `<text class="zs-cn" x="${cx.toFixed(1)}" y="${(cy + 38).toFixed(1)}" text-anchor="middle">${z.cn}</text>`;
  }

  // 七政三王（含日月）按黄经落位
  for (const b of t.bodies) {
    if (b.id === 'mean_node') continue;
    const x = toX(b.lon);
    if (x < -10 || x > W + 10) continue;
    const col = P_COLOR[b.id] || '#cfd8ea';
    if (b.id === 'moon' && moonFn) {
      s += `<g class="zs-moon" data-pl="moon" transform="translate(${(x - 12).toFixed(1)},${(y0 - 12).toFixed(1)})">${moonFn(t.moon.phase01, 24)}</g>`;
      continue;
    }
    s += `<g class="zs-pl" data-pl="${b.id}">`;
    s += `<circle class="zs-pl-halo" cx="${x.toFixed(1)}" cy="${y0}" r="8" fill="${col}"/>`;
    s += `<circle class="zs-pl-dot" cx="${x.toFixed(1)}" cy="${y0}" r="3.1" fill="${col}"/>`;
    s += `<text class="zs-pl-g" x="${x.toFixed(1)}" y="${(y0 - 14).toFixed(1)}" text-anchor="middle" fill="${col}">${P_MARK[b.id] || ''}</text>`;
    if (b.retrograde) s += `<text class="zs-pl-r" x="${x.toFixed(1)}" y="${(y0 + 17).toFixed(1)}" text-anchor="middle">℞</text>`;
    s += `</g>`;
  }
  return `<svg class="zs-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="当下黄道星空">${s}</svg>`;
}

// 供无障碍/复制：列出当前可见星座与落位
export function zodiacAt(now = new Date()) {
  try { const t = shouyeTianxiang(now); return t.bodies.filter((b) => b.id !== 'mean_node'); } catch (e) { return []; }
}

// ============================================================
// 星象全图：一整张可左右滑动的黄道地图（画一次，靠滚动平移，省电）
// 等距圆柱投影：x=黄经×4，y=黄纬×4；日月行星、12 星座全部在图上
// ============================================================
const TROPIC_CN = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
// 星座缩写 → 释义库键（meaning.js 的 sg-*），点击复用塔罗式详解卡
const SG_KEY = { ari: 'aries', tau: 'taurus', gem: 'gemini', cnc: 'cancer', leo: 'leo', vir: 'virgo', lib: 'libra', sco: 'scorpio', sgr: 'sagittarius', cap: 'capricorn', aqr: 'aquarius', psc: 'pisces' };

const Z_HUE = [352, 26, 50, 86, 126, 166, 190, 216, 250, 280, 308, 334];

export function zodiacMapSVG(now = new Date(), moonFn = null) {
  let t; try { t = shouyeTianxiang(now); } catch (e) { return { svg: '', sunX: 0, moonX: 0 }; }
  // X0：左端预留 20°，容纳跨越黄经 0° 的双鱼座（否则星点被画到图两端）
  const X0 = 20, P = 4, H = 256, y0 = H / 2, W = (360 + X0) * P;
  const x = (lam) => (lam + X0) * P;
  const y = (bet) => y0 - bet * P;
  let s = '', hits = '', pl = '';

  // 背景静态星（不闪，省电）
  const rnd = prand(20261023);
  for (let i = 0; i < 240; i++) {
    const cx = rnd() * W, cy = 10 + rnd() * (H - 20), r = (0.4 + rnd() * 1.05).toFixed(2), o = (0.12 + rnd() * 0.3).toFixed(2);
    s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="#c9d6f2" opacity="${o}"/>`;
  }
  // 顶部占星宫位色带
  for (let i = 0; i < 12; i++) {
    const bx = x(i * 30), bw = 30 * P;
    if (i % 2 === 0) s += `<rect x="${bx.toFixed(1)}" y="0" width="${bw}" height="${H}" fill="#ffffff" opacity="0.016"/>`;
    s += `<text class="zm-band" x="${(bx + bw / 2).toFixed(1)}" y="20" text-anchor="middle">${TROPIC_CN[i]}宫</text>`;
    if (i > 0) s += `<line class="zm-grid" x1="${bx.toFixed(1)}" y1="0" x2="${bx.toFixed(1)}" y2="${H}"/>`;
  }
  s += `<line class="zs-ecl" x1="0" y1="${y0}" x2="${W}" y2="${y0}"/>`;

  // 12 星座：先 unwrap 黄经（让跨 0° 的星座连续），再按星座色相 + 星等明度绘制
  ZECL.forEach((z, zi) => {
    const hue = Z_HUE[zi % 12];
    const base = z.e[0][0];
    const ul = z.e.map((pt) => { let d = pt[0] - base; if (d > 180) d -= 360; if (d < -180) d += 360; return base + d; });
    const SG = 'sg-' + (SG_KEY[z.key] || z.key);
    let g = '';
    for (const [a, b] of z.l) {
      g += `<line class="zs-line" x1="${x(ul[a]).toFixed(1)}" y1="${y(z.e[a][1]).toFixed(1)}" x2="${x(ul[b]).toFixed(1)}" y2="${y(z.e[b][1]).toFixed(1)}" stroke="hsla(${hue},46%,62%,.30)"/>`;
    }
    z.e.forEach((pt, i) => {
      const m = pt[2];
      const L = m === 1 ? 94 : m === 2 ? 80 : 64;
      const S = m === 1 ? 30 : m === 2 ? 46 : 52;
      const r = m === 1 ? 3.2 : m === 2 ? 2.3 : 1.6;
      g += `<circle class="${m === 1 ? 'zm-bright' : ''}" cx="${x(ul[i]).toFixed(1)}" cy="${y(pt[1]).toFixed(1)}" r="${r}" fill="hsl(${hue},${S}%,${L}%)"/>`;
    });
    const cxm = ul.reduce((a, v) => a + v, 0) / ul.length;
    const cym = z.e.reduce((a, pt) => a + pt[1], 0) / z.e.length;
    const lx = x(cxm), ly = y(cym) - 32;
    g += `<text class="zs-cn" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" fill="hsl(${hue},42%,76%)">${z.cn}座</text>`;
    s += `<g class="zs-const" data-tip="${SG}">${g}</g>`;
    // 热区跟随星点（不跨图），统一放中间层
    z.e.forEach((pt, i) => { hits += `<circle cx="${x(ul[i]).toFixed(1)}" cy="${y(pt[1]).toFixed(1)}" r="24" fill="transparent" pointer-events="all" data-tip="${SG}"/>`; });
    hits += `<circle cx="${lx.toFixed(1)}" cy="${(ly - 4).toFixed(1)}" r="36" fill="transparent" pointer-events="all" data-tip="${SG}"/>`;
  });

  // 行星：按黄经排序分配 lane，避免标签互相叠
  const items = t.bodies.filter((b) => b.id !== 'mean_node').map((b) => ({ b, px: x(b.lon) })).sort((a, c) => a.px - c.px);
  const laneEnd = [];
  for (const it of items) {
    let ln = 0;
    while (laneEnd[ln] !== undefined && it.px - laneEnd[ln] < 46) ln++;
    laneEnd[ln] = it.px; it.ln = ln;
  }
  const laneY = (ln) => [y0 - 22, y0 + 32, y0 - 40, y0 + 50, y0 - 58][ln % 5];
  const lab = (tk, px, ly, col, txt) =>
    `<text class="zm-plab" data-tip="${tk}" x="${px.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" fill="${col}" stroke="#05080f" stroke-width="3.2" paint-order="stroke">${txt}</text>`;

  let sunX = W / 2, moonX = W / 2;
  for (const it of items) {
    const b = it.b, px = it.px, tk = 'pl-' + b.id, col = P_COLOR[b.id] || '#cfd8ea';
    if (b.id === 'sun') sunX = px;
    if (b.id === 'moon') moonX = px;
    if (b.id === 'moon' && moonFn) {
      pl += `<g class="zm-pl" data-tip="${tk}"><circle cx="${px.toFixed(1)}" cy="${y0}" r="18" fill="#070b14" opacity=".88"/><g transform="translate(${(px - 13).toFixed(1)},${(y0 - 13).toFixed(1)})">${moonFn(t.moon.phase01, 26)}</g></g>`;
      pl += lab(tk, px, y0 + 36, col, '月');
    } else if (b.id === 'sun') {
      pl += `<g class="zm-sun zm-pl" data-tip="${tk}"><circle cx="${px.toFixed(1)}" cy="${y0}" r="16" fill="#070b14" opacity=".88"/><circle class="zs-pl-halo" cx="${px.toFixed(1)}" cy="${y0}" r="12" fill="${col}"/><circle cx="${px.toFixed(1)}" cy="${y0}" r="6.4" fill="${col}"/><circle cx="${px.toFixed(1)}" cy="${y0}" r="2.6" fill="#fff" opacity=".9"/></g>`;
      pl += lab(tk, px, laneY(it.ln), col, '日');
    } else {
      pl += `<g class="zm-pl" data-tip="${tk}"><circle cx="${px.toFixed(1)}" cy="${y0}" r="12" fill="#070b14" opacity=".85"/><circle class="zs-pl-halo" cx="${px.toFixed(1)}" cy="${y0}" r="8.5" fill="${col}"/><circle cx="${px.toFixed(1)}" cy="${y0}" r="4.8" fill="${col}"/><circle cx="${px.toFixed(1)}" cy="${y0}" r="1.8" fill="#fff" opacity=".8"/></g>`;
      pl += lab(tk, px, laneY(it.ln), col, (P_MARK[b.id] || '') + (b.retrograde ? '℞' : ''));
    }
    pl += `<circle cx="${px.toFixed(1)}" cy="${y0}" r="20" fill="transparent" pointer-events="all" data-tip="${tk}"/>`;
  }

  const svg = `<svg class="zm-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="星象全图">
    <defs><filter id="zmglow" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${s}
    <g class="zm-hits">${hits}</g>
    <g class="zm-planets">${pl}</g>
  </svg>`;
  return { svg, sunX, moonX };
}
