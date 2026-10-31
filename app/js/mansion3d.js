// mansion3d.js — 中国星官 3D 天球（复用天球可视化骨架，星官中国化）
// 真实亮星 177 颗（含中文名）+ 二十八宿距星链 + 北斗/三垣星官连线 + 宿界弧带
// + 七政四余实时位置与入宿度。three.js r160（MIT，本地内置）。
// 只报天文事实（躔次/入宿度），不作吉凶断语。
import * as THREE from '../vendor/three/three.module.js';
import { shouyeTianxiang, MANSIONS } from '../vendor/liuyao-core.js?v=124';
import { siyuLongitudes, solarParams } from './solartime.js?v=124';
import { STARS3 } from './stars.js?v=124';

const R = 10;
const D2R = Math.PI / 180;
const EPS = 23.4392811 * D2R;

const P_COLOR = {
  sun: '#f5c15c', moon: '#e6ecf7', mercury: '#a9bdd0', venus: '#eab0cf',
  mars: '#e8745a', jupiter: '#e0b275', saturn: '#d6c69a',
  luohou: '#c07be0', jidu: '#9c8fd8', yuebei: '#7fa8e8',
};
const P_CN = { sun: '太阳', moon: '太阴', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星', luohou: '罗睺', jidu: '计都', yuebei: '月孛' };
const P_SIZE = { sun: 0.62, moon: 0.44, mercury: 0.2, venus: 0.32, mars: 0.28, jupiter: 0.46, saturn: 0.4, luohou: 0.22, jidu: 0.22, yuebei: 0.22 };
const SISHOU_COLOR = { 青龙: '#5eb3b3', 玄武: '#7d8fc9', 白虎: '#c9a27d', 朱雀: '#c97d8c' };

// ---------- 坐标 ----------
function eqPos(raDeg, decDeg, radius = R) {
  const a = raDeg * D2R, d = decDeg * D2R;
  return new THREE.Vector3(
    radius * Math.cos(d) * Math.cos(a),
    radius * Math.sin(d),
    -radius * Math.cos(d) * Math.sin(a)
  ).applyAxisAngle(new THREE.Vector3(1, 0, 0), EPS);
}
function eclPos(lonDeg, radius = R) {
  const l = lonDeg * D2R;
  return new THREE.Vector3(radius * Math.cos(l), 0, -radius * Math.sin(l));
}

// ---------- 二十八宿界（J2000 距星赤经，与 STARS3 同架） ----------
const M_SORTED = MANSIONS.slice().sort((a, b) => a.star.ra0 - b.star.ra0);
function mansionAt(lon) {
  const arr = M_SORTED;
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i].star.ra0, b = arr[(i + 1) % arr.length].star.ra0;
    const span = (b - a + 360) % 360;
    if (((lon - a + 360) % 360) < span) return { m: arr[i], ruDu: (lon - a + 360) % 360, span };
  }
  return { m: arr[0], ruDu: 0, span: 0 };
}

// ---------- 星官连线（STARS3 星名索引） ----------
const STAR_BY_NAME = {};
STARS3.forEach(([, , , , name]) => { if (name) STAR_BY_NAME[name] = null; });
STARS3.forEach(([ra, dec, mag, , name]) => { if (name) STAR_BY_NAME[name] = { ra, dec, mag }; });
function starPos(name, radius = R) {
  const s = STAR_BY_NAME[name];
  return s ? eqPos(s.ra, s.dec, radius) : null;
}
// 星官折线：名字取自 STARS3（耶鲁亮星表 J2000，公有领域）
const FIGURES = [
  { id: 'beidou', name: '北斗七星', color: '#e8d9ae', stars: ['天枢', '天璇', '天玑', '玉衡', '开阳', '摇光'], note: '斗为帝车，运于中央，四乡分阴阳——《史记·天官书》' },
  { id: 'ziwei', name: '紫微垣 · 帝极', color: '#d6b66e', stars: ['北极星', '太子', '帝'], note: '中宫天极星，其一明者，太一常居也——《史记·天官书》' },
  { id: 'taiwei', name: '太微垣 · 三光之廷', color: '#9db8d6', stars: ['西上相', '五帝座一', '东上相', '东次将'], note: '太微，三光之廷；日月五星朝会其所——《晋书·天文志》' },
  { id: 'tianshi', name: '天市垣 · 帝率诸侯临市', color: '#c9a27d', stars: ['河中', '帝座', '候', '宗正一', '韩', '宋', '梁', '蜀', '吴越'], note: '天市，天子率诸侯临市——《史记·天官书》天市垣候、宗正、列国诸星环列帝座' },
  { id: 'xiu28', name: '二十八宿距星链', color: '#6f8f8f', stars: null, note: '沿天赤道依次相连的二十八宿距星' },
];

// ---------- 单例 ----------
let renderer, scene, camera, root, rafId = 0;
let starObj, bodyGroup, figGroup;
const LOWFX = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 4) <= 2;
let currentAt = null, inited = false, built = false;
// 宿主页每次重渲染都会用 innerHTML 冲掉 #ms-globe3d 宿主 → 画布必须可搬家（换宿主不重建 WebGL 上下文）
let hostEl = null, labelsLayer = null, detailCard = null;
const cam = { dist: 21, theta: -0.9, phi: 1.05 };
let drag = null;
const labels = [];
// 入场动画（自远处旋入）与自动旋转、惯性
let intro = { t0: 0, on: false };
let spin = { v: 0.055, lastTouch: 0 };
let inertia = { theta: 0, phi: 0 };

function glowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(0.22, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cnTextSprite(text, color = '#d6b66e', fs = 40) {
  const cv = document.createElement('canvas');
  const ctx0 = cv.getContext('2d');
  ctx0.font = `600 ${fs}px -apple-system,"PingFang SC",sans-serif`;
  const w = Math.ceil(ctx0.measureText(text).width) + 24;
  cv.width = w; cv.height = fs + 18;
  const ctx = cv.getContext('2d');
  ctx.font = `600 ${fs}px -apple-system,"PingFang SC",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 8;
  ctx.fillStyle = color; ctx.fillText(text, w / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }));
  sp.scale.set(w / fs * 0.56, cv.height / fs * 0.56, 1);
  sp.renderOrder = 5;
  return sp;
}

function buildStars() {
  const n = STARS3.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), tw = new Float32Array(n);
  const c = new THREE.Color();
  STARS3.forEach(([ra, dec, mag, bv], i) => {
    const v = eqPos(ra, dec, R);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    const t = Math.max(-0.3, Math.min(1.6, bv));
    const hue = 0.6 - (t + 0.3) / 1.9 * 0.6;
    const sat = Math.min(0.5, Math.abs(t - 0.55) * 0.5);
    const light = 0.85 - Math.max(0, mag) * 0.045;
    c.setHSL(hue, sat, Math.max(0.6, light));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sz[i] = mag <= 0 ? 6 : mag <= 1 ? 4.6 : mag <= 2 ? 3.4 : 2.4;
    tw[i] = Math.random() * 6.2832;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
  starObj = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aTw; uniform float uTime; varying vec3 vColor;
      void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);
      float twk=0.86+0.14*sin(uTime*2.2+aTw);
      gl_PointSize=aSize*twk*(140.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vColor;
      void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d);
      float core=smoothstep(0.16,0.0,d)*0.9;
      gl_FragColor=vec4(vColor+core,a+core*0.4); }`,
  }));
  root.add(starObj);
}

function lineThrough(starNames, color, opacity = 0.5, radius = R) {
  const pts = [];
  starNames.forEach((nm) => { const p = starPos(nm, radius); if (p) pts.push(p); });
  if (pts.length < 2) return null;
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function spikeTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 8;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(232,240,255,0)'); g.addColorStop(0.5, 'rgba(232,240,255,0.85)'); g.addColorStop(1, 'rgba(232,240,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 8);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function buildBrightHalo() {
  const spike = LOWFX ? null : spikeTexture();
  STARS3.forEach(([ra, dec, mag]) => {
    if (mag > 1.3 || LOWFX) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#e8f0ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5,
    }));
    const sz = Math.max(0.16, 0.5 - mag * 0.22);
    sp.scale.set(sz, sz, 1); sp.renderOrder = 4;
    sp.position.copy(eqPos(ra, dec, R * 0.992));
    root.add(sp);
    if (mag <= 0.5 && spike) {
      const len = 0.34 - mag * 0.08;
      [-1, 0].forEach((rot, k) => {
        const mk = new THREE.Sprite(new THREE.SpriteMaterial({
          map: spike, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, rotation: rot * Math.PI / 2,
        }));
        mk.scale.set(k ? len : len * 0.62, 0.028, 1); mk.renderOrder = 5;
        mk.position.copy(sp.position);
        root.add(mk);
      });
    }
  });
}
function buildDeepField() {
  const n = 1400;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 46 + Math.random() * 22;
    const s0 = Math.sqrt(1 - u * u);
    pos[i * 3] = rr * s0 * Math.cos(th); pos[i * 3 + 1] = rr * u; pos[i * 3 + 2] = rr * s0 * Math.sin(th);
    c.setHSL(0.58 + Math.random() * 0.06, 0.25, 0.5 + Math.random() * 0.3);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sz[i] = Math.random() < 0.92 ? 1.1 : 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const dust = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'attribute float aSize; attribute vec3 aColor; varying vec3 vColor;void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize*(140.0/-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vColor;void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.1,d)*0.75;gl_FragColor=vec4(vColor,a); }',
  }));
  scene.add(dust);
}

function buildFigures() {
  figGroup = new THREE.Group();
  root.add(figGroup);
  for (const f of FIGURES) {
    let line = null;
    if (f.stars) line = lineThrough(f.stars, new THREE.Color(f.color).getHex(), 0.62);
    if (f.id === 'xiu28') {
      // 二十八宿距星链：按赤经序连距星（去重闭合）
      const names = M_SORTED.map((m) => m.star.western.split(' ').pop());
      const pts = [];
      M_SORTED.forEach((m) => { const p = eqPos(m.star.ra0, m.star.dec0, R * 0.995); pts.push(p); });
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x6f8f8f, transparent: true, opacity: 0.42, depthWrite: false }));
      // 每宿距星上放星点标记
      M_SORTED.forEach((m) => {
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(SISHOU_COLOR[m.sishou] || '#8fa'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        dot.scale.set(0.3, 0.3, 1);
        dot.position.copy(eqPos(m.star.ra0, m.star.dec0, R * 1.005));
        dot.renderOrder = 6;
        figGroup.add(dot);
      });
    }
    if (line) figGroup.add(line);
  }
  // 星官名标签（挂在首星旁）
  const tagFig = (f, starName) => {
    const p = starPos(starName, R * 1.09);
    if (!p) return;
    const sp = cnTextSprite(f.name.split(' · ')[0], f.color, 34);
    sp.position.copy(p);
    figGroup.add(sp);
  };
  tagFig(FIGURES[0], '天枢');
  tagFig(FIGURES[1], '帝');
  tagFig(FIGURES[2], '五帝座一');
  tagFig(FIGURES[3], '帝座');
}

function buildMansionBand() {
  // 赤道外圈：28 段弧带（按距星赤经分界）+ 宿名标签
  const arr = M_SORTED;
  for (let i = 0; i < arr.length; i++) {
    const a0 = arr[i].star.ra0;
    const a1 = arr[(i + 1) % arr.length].star.ra0;
    const span = (a1 - a0 + 360) % 360;
    const col = new THREE.Color(SISHOU_COLOR[arr[i].sishou] || '#8fa').getHex();
    const pts = [];
    const steps = Math.max(4, Math.ceil(span / 2));
    for (let k = 0; k <= steps; k++) pts.push(eqPos(a0 + span * k / steps, 0, R * 1.028));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    root.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false })));
    // 宿名（放在段中点，稍外）
    const mid = a0 + span / 2;
    const sp = cnTextSprite(arr[i].name, SISHOU_COLOR[arr[i].sishou] || '#d6b66e', 30);
    sp.position.copy(eqPos(mid, 0, R * 1.1));
    root.add(sp);
    labels.push({ sp, ra: mid, dec: 0, r: R * 1.1, txt: arr[i].name });
  }
}

function buildGrids() {
  // 黄道（金）、赤道（青灰）
  const eclip = [], equat = [];
  for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; eclip.push(new THREE.Vector3(R * 0.996 * Math.cos(a), 0, -R * 0.996 * Math.sin(a))); }
  for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; equat.push(new THREE.Vector3(R * 1.012 * Math.cos(a), 0, -R * 1.012 * Math.sin(a)).applyAxisAngle(new THREE.Vector3(1, 0, 0), EPS)); }
  root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(eclip), new THREE.LineBasicMaterial({ color: 0xd6b66e, transparent: true, opacity: 0.4, depthWrite: false })));
  root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(equat), new THREE.LineBasicMaterial({ color: 0x4a7580, transparent: true, opacity: 0.5, depthWrite: false })));
}

function siyuOf(now) {
  const { luohou, jidu, yuebei } = siyuLongitudes(now);
  const eps = solarParams(now).obliq * D2R;
  return [
    { id: 'luohou', lon: luohou }, { id: 'jidu', lon: jidu }, { id: 'yuebei', lon: yuebei },
  ].map((d) => {
    const lam = d.lon * D2R;
    const ra = (Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) * 180 / Math.PI + 360) % 360;
    return { id: d.id, ra, lon: d.lon };
  });
}

function buildBodies() {
  bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  for (const id of Object.keys(P_COLOR)) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(P_COLOR[id]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const s = P_SIZE[id]; sp.scale.set(s, s, 1); sp.renderOrder = 10; sp.userData.id = id;
    bodyGroup.add(sp);
    labels.push({ sp, isBody: true, id });
  }
}

function updateBodies(at) {
  currentAt = at;
  let t;
  try { t = shouyeTianxiang(at, 35); } catch { return; }
  const by = Object.fromEntries(t.bodies.map((b) => [b.id, b]));
  bodyGroup.children.forEach((sp) => {
    const id = sp.userData.id;
    let ra = null, extra = null;
    if (by[id]) {
      // 黄经 -> 赤经
      const eps = solarParams(at).obliq * D2R;
      const lam = by[id].lon * D2R;
      ra = (Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) * 180 / Math.PI + 360) % 360;
      extra = { signName: by[id].signName, retro: by[id].retrograde };
    } else {
      const s = siyuOf(at).find((x) => x.id === id);
      if (s) ra = s.ra;
    }
    if (ra == null) { sp.visible = false; return; }
    sp.visible = true;
    sp.position.copy(eqPos(ra, 0, R * 0.955));
    sp.userData.ra = ra; sp.userData.extra = extra;
    const { m, ruDu } = mansionAt(ra);
    sp.userData.mansion = m ? m.name : '';
    sp.userData.ruDu = ruDu;
  });
}

// ---------- DOM 标签 ----------
const camDir = new THREE.Vector3();
function project(v3) {
  const v = v3.clone();
  const facing = v.clone().normalize().dot(camera.getWorldDirection(camDir));
  const p = v.project(camera);
  const host = renderer.domElement.parentElement;
  return { x: (p.x * 0.5 + 0.5) * host.clientWidth, y: (-p.y * 0.5 + 0.5) * host.clientHeight, near: facing > 0.03 };
}

function renderLabels() {
  const layer = document.getElementById('ms3-labels');
  if (!layer) return;
  const w = layer.clientWidth, h = layer.clientHeight;
  for (const L of labels) {
    if (L.sp && L.isBody) {
      if (!L.sp.visible) { if (L.el) L.el.style.display = 'none'; continue; }
    }
    const v = L.sp ? L.sp.position : eqPos(L.ra, L.dec, L.r);
    const p = project(v);
    const on = p.near && p.x > -30 && p.x < w + 30 && p.y > -16 && p.y < h + 16;
    let el = L.el;
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'gl-tag' + (L.isBody ? ' ms3-body-tag' : ' is-star');
      el.textContent = L.isBody ? P_CN[L.id] : L.txt;
      if (L.isBody) el.style.color = P_COLOR[L.id];
      el.addEventListener('click', (ev) => { ev.stopPropagation(); showBodyCard(L.id); });
      layer.appendChild(el); L.el = el;
    }
    el.style.display = on ? '' : 'none';
    if (on) el.style.transform = `translate(-50%,-50%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
  }
}

function showBodyCard(id) {
  const card = document.getElementById('ms3-detail');
  if (!card) return;
  const sp = bodyGroup.children.find((s) => s.userData.id === id);
  if (!sp || !sp.visible) return;
  const u = sp.userData;
  card.innerHTML = `
    <div class="gld-h"><span class="gld-dot" style="background:${P_COLOR[id]};box-shadow:0 0 10px ${P_COLOR[id]}"></span>${P_CN[id]}</div>
    <div class="gld-row"><span>所入</span><b>${u.mansion}宿</b></div>
    <div class="gld-row"><span>入宿度</span><b>${u.ruDu.toFixed(2)}°（今度）</b></div>
    ${u.extra ? `<div class="gld-row"><span>所在</span><b>${u.extra.signName}座 ${(u.ra % 30).toFixed(1)}°</b></div>
    <div class="gld-row"><span>视运动</span><b class="${u.extra.retro ? 'retro' : 'direct'}">${u.extra.retro ? '逆行 ℞' : '顺行'}</b></div>` : '<div class="gld-row"><span>性质</span><b>四余 · 月轨特征点</b></div>'}`;
  card.classList.add('on');
}

// ---------- 控制 ----------
function bindControls(canvas) {
  const pointers = new Map();
  let pinchD = 0;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e); pointers.set(e.pointerId, p);
    const c = document.getElementById('ms3-detail'); if (c) c.classList.remove('on');
    if (pointers.size === 1) drag = { x: p.x, y: p.y, theta: cam.theta, phi: cam.phi };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e); pointers.set(e.pointerId, p);
    if (pointers.size === 1 && drag) {
      const nTheta = drag.theta - (p.x - drag.x) * 0.006;
      const nPhi = Math.max(0.18, Math.min(Math.PI - 0.18, drag.phi - (p.y - drag.y) * 0.006));
      inertia.theta = (nTheta - cam.theta) * 60; inertia.phi = (nPhi - cam.phi) * 60;
      cam.theta = nTheta; cam.phi = nPhi;
      spin.lastTouch = e.timeStamp;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) cam.dist = Math.max(12.5, Math.min(42, cam.dist * (pinchD / d)));
      pinchD = d;
    }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchD = 0; if (pointers.size === 0) drag = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('dblclick', () => {
    cam.dist = 21; cam.theta = -0.9; cam.phi = 1.05; inertia.theta = 0; inertia.phi = 0;
    intro = { t0: performance.now(), on: true };
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist = Math.max(12.5, Math.min(42, cam.dist * (1 + Math.sign(e.deltaY) * 0.08)));
  }, { passive: false });
}

function applyCamera() {
  const sp = Math.sin(cam.phi);
  camera.position.set(cam.dist * sp * Math.sin(cam.theta), cam.dist * Math.cos(cam.phi), cam.dist * sp * Math.cos(cam.theta));
  camera.lookAt(0, 0, 0);
}

let lastTick = 0;
function tick(t) {
  rafId = requestAnimationFrame(tick);
  if (!built) return;
  const dt = lastTick ? Math.min(0.05, (t - lastTick) / 1000) : 0.016;
  lastTick = t;
  if (intro.on) {
    const k = Math.min(1, (t - intro.t0) / 2600);
    const e = 1 - Math.pow(1 - k, 3);
    cam.dist = 34 - 13 * e;
    cam.theta = -2.6 + 1.7 * e;
    if (k >= 1) intro.on = false;
  } else if (!drag) {
    const idle = t - spin.lastTouch > 3000;
    if (Math.abs(inertia.theta) > 0.004 || Math.abs(inertia.phi) > 0.004) {
      cam.theta -= inertia.theta * dt;
      cam.phi = Math.max(0.18, Math.min(Math.PI - 0.18, cam.phi - inertia.phi * dt));
      inertia.theta *= Math.pow(0.02, dt); inertia.phi *= Math.pow(0.02, dt);
    } else if (idle) cam.theta -= spin.v * dt;
  }
  if (starObj) starObj.material.uniforms.uTime.value = t / 1000;
  applyCamera();
  renderer.render(scene, camera);
  renderLabels();
}

// ---------- 对外 ----------
// 尺寸：宿主宽 0 = 父级还隐藏着（display:none），此时画布会是黑的 → 等可见再上尺寸
function applySize() {
  if (!renderer || !hostEl) return;
  const w = hostEl.clientWidth || 0;
  if (!w) return;
  const h = Math.min(430, Math.max(300, w * 0.92));
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function waitVisible() {
  if (!hostEl || !hostEl.isConnected) return;
  if (hostEl.clientWidth > 0) { applySize(); return; }
  requestAnimationFrame(waitVisible);
}

export function initMansion3D(at) {
  const h = document.getElementById('ms-globe3d');
  if (!h) return;
  // 已建过：把画布/标签层/详情卡搬到新宿主（页面重渲染后宿主换了），不重建 WebGL 上下文
  if (inited && renderer) {
    if (hostEl !== h) {
      hostEl = h;
      h.appendChild(renderer.domElement);
      if (labelsLayer) h.appendChild(labelsLayer);
      if (detailCard) h.appendChild(detailCard);
    }
    applySize();
    updateBodies(at);
    return;
  }
  hostEl = h;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !LOWFX, alpha: true });
  } catch (e) {
    // 本机不支持 WebGL：给出人话提示，不留黑块
    h.innerHTML = '<div class="ms3-fallback">本机未启用 WebGL（或显卡被占用），三维星球暂不可用；下方二维宿盘数据完整可用。</div>';
    return;
  }
  inited = true;
  renderer.setPixelRatio(Math.min(LOWFX ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.setSize(hostEl.clientWidth || 320, Math.min(430, Math.max(300, (hostEl.clientWidth || 320) * 0.92)));
  hostEl.appendChild(renderer.domElement);
  const layer = document.createElement('div');
  layer.className = 'gl-labels'; layer.id = 'ms3-labels';
  hostEl.appendChild(layer); labelsLayer = layer;
  const card = document.createElement('div');
  card.className = 'gl-detail'; card.id = 'ms3-detail';
  hostEl.appendChild(card); detailCard = card;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  root = new THREE.Group();
  scene.add(root);
  if (!LOWFX) buildDeepField();
  buildStars();
  buildBrightHalo();
  buildGrids();
  buildMansionBand();
  buildFigures();
  buildBodies();
  built = true;
  intro = { t0: performance.now(), on: true };

  const resize = () => applySize();
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    try { new ResizeObserver(() => applySize()).observe(hostEl); } catch (e) { /* 老浏览器忽略 */ }
  }
  applySize();
  requestAnimationFrame(waitVisible);

  bindControls(renderer.domElement);
  updateBodies(at);
  tick(0);
}

export function mansion3DUpdate(at) { if (built) updateBodies(at); }
