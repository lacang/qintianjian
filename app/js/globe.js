// 天球仪 · 实时 3D 宇宙（地心黄道视角）
// 一个透明天球上：177 颗真实裸眼亮星（J2000 赤道坐标）+ 黄道/赤道圈 + 日月行星实时位置。
// 行星由 astronomy-engine（liuyao-core 打包）实时计算；3D 用 three.js r160（MIT，本地内置、离线）。
// 单指拖拽旋转、滚轮/双指缩放；点天体名出数据卡；顶部时间条/播放可快进，直观看到每颗星在球面上运行。
import * as THREE from '../vendor/three/three.module.js';
import { shouyeTianxiang } from '../vendor/liuyao-core.js?v=118';
import { getPlace } from './geo.js?v=118';
import { $, nowDate, pad } from './state.js?v=118';
import { STARS3 } from './stars.js?v=118';

const R = 10;                         // 天球半径
const D2R = Math.PI / 180;
const EPS = 23.4392811 * D2R;         // 黄赤交角 J2000

const P_COLOR = {
  sun: '#ffd271', moon: '#e9eefb', mercury: '#aebfd2', venus: '#f2b3d2',
  mars: '#ef7a5c', jupiter: '#e6bb7e', saturn: '#ddcf9f', uranus: '#8fdce0',
  neptune: '#8fa6f0', pluto: '#bd97e0',
};
const P_CN = {
  sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星',
  jupiter: '木星', saturn: '土星', uranus: '天王', neptune: '海王', pluto: '冥王',
};
const P_SIZE = { sun: 0.62, moon: 0.42, mercury: 0.22, venus: 0.34, mars: 0.3, jupiter: 0.5, saturn: 0.44, uranus: 0.28, neptune: 0.28, pluto: 0.22 };
const P_ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '人马', '摩羯', '宝瓶', '双鱼'];

// 黄道经纬度 -> 直角坐标（黄道面=XZ，春分点 +X，黄道北 +Y）
function eclPos(lonDeg, latDeg = 0, radius = R) {
  const l = lonDeg * D2R, b = latDeg * D2R;
  return new THREE.Vector3(
    radius * Math.cos(b) * Math.cos(l),
    radius * Math.sin(b),
    -radius * Math.cos(b) * Math.sin(l)
  );
}
// 赤道赤经/赤纬 -> 直角坐标（先赤道架，再绕 X 轴旋到黄道架）
function eqPos(raDeg, decDeg, radius = R) {
  const a = raDeg * D2R, d = decDeg * D2R;
  return new THREE.Vector3(
    radius * Math.cos(d) * Math.cos(a),
    radius * Math.sin(d),
    -radius * Math.cos(d) * Math.sin(a)
  ).applyAxisAngle(new THREE.Vector3(1, 0, 0), EPS);
}

let renderer, scene, camera, root, rafId = 0;
let planetGroup, starObj;
const pickables = [];
let currentAt = null;
let playing = false, speed = 2;
let lastT = 0;
const cam = { dist: 20, theta: -0.5, phi: 1.15 };
let drag = null, inited = false, built = false;
let selPid = null;

// ---------- 视角导航：观测地南中天 / 北天极 / 月 / 日（v101） ----------
// 观测地：v111 改用"当前地点"（定位或手选城市），不再写死沈阳
function obsNow() { const p = getPlace(); return { lat: p.lat, lon: p.lon }; }
function localSiderealTimeDeg(at) {
  const d = (at.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;   // J2000 起算的天
  let gmst = 280.46061837 + 360.98564736629 * d;
  gmst = ((gmst % 360) + 360) % 360;
  return ((gmst + obsNow().lon) % 360 + 360) % 360;
}
// 目标天区（场景坐标单位向量）→ 相机球坐标
function dirToCam(dir) {
  const n = dir.clone().normalize();
  return { phi: Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)), theta: Math.atan2(n.x, n.z) };
}
function viewTarget(which, at = currentAt || nowDate()) {
  if (which === 'north') return dirToCam(new THREE.Vector3(0.03, 1, 0.03));
  if (which === 'south') return dirToCam(eqPos(localSiderealTimeDeg(at), 10, 1));
  try {
    const info = computeBodies(at);
    const b = which === 'moon' ? info.moon : info.byId.sun;
    const lon = which === 'moon' ? (b.lon ?? b.eclLon ?? 0) : b.lon;
    return dirToCam(eclPos(lon, 0, 1));
  } catch { return dirToCam(eqPos(localSiderealTimeDeg(at), 10, 1)); }
}
let camTween = null;   // {t0, dur, from:{theta,phi}, to:{theta,phi}}
function goToView(which) {
  const to = viewTarget(which);
  if (!to || !isFinite(to.theta)) return;
  // 走最短角路径
  let dth = to.theta - cam.theta;
  while (dth > Math.PI) dth -= Math.PI * 2;
  while (dth < -Math.PI) dth += Math.PI * 2;
  camTween = { t0: performance.now(), dur: 650, from: { theta: cam.theta, phi: cam.phi }, to: { theta: cam.theta + dth, phi: THREE.MathUtils.clamp(to.phi, 0.18, Math.PI - 0.18) } };
}

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

function signTextSprite(text) {
  const cv = document.createElement('canvas');
  const fs = 44;
  const ctx0 = cv.getContext('2d');
  ctx0.font = `600 ${fs}px -apple-system,"PingFang SC",sans-serif`;
  const w = Math.ceil(ctx0.measureText(text).width) + 28;
  cv.width = w; cv.height = fs + 22;
  const ctx = cv.getContext('2d');
  ctx.font = `600 ${fs}px -apple-system,"PingFang SC",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#6fb8af'; ctx.fillText(text, w / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
  sp.scale.set(w / 44 * 0.62, cv.height / 44 * 0.62, 1);
  sp.renderOrder = 5;
  return sp;
}

function buildStars() {
  const n = STARS3.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
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
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  starObj = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aSize; attribute vec3 aColor; varying vec3 vColor;
      void main(){
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * (140.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(vColor, a);
      }`,
  }));
  root.add(starObj);
}

function lineLoop(fn, color, opacity, radius) {
  const pts = [];
  for (let i = 0; i <= 256; i++) pts.push(fn(i / 256, radius));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  root.add(m);
}

function buildGrids() {
  // 黄道（亮青）、赤道（暗青）
  lineLoop((t) => { const a = t * Math.PI * 2; return new THREE.Vector3(R * 0.998 * Math.cos(a), 0, -R * 0.998 * Math.sin(a)); }, 0x4fd0c4, 0.6, R);
  lineLoop((t) => { const a = t * Math.PI * 2; return new THREE.Vector3(R * 0.997 * Math.cos(a), 0, -R * 0.997 * Math.sin(a)).applyAxisAngle(new THREE.Vector3(1, 0, 0), EPS); }, 0x4a7580, 0.32, R);
  // 稀疏经纬网
  for (let lon = 0; lon < 360; lon += 30) {
    const pts = [];
    for (let i = 0; i <= 90; i++) pts.push(eclPos(lon, -90 + i * 2, R * 1.002));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    root.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x2c424b, transparent: true, opacity: 0.14, depthWrite: false })));
  }
  for (let la = -60; la <= 60; la += 30) lineLoop((t) => eclPos(t * 360, la, R * 1.002), 0x2c424b, 0.14, R);
  // 二分点轴
  const ag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-R * 1.03, 0, 0), new THREE.Vector3(R * 1.03, 0, 0)]);
  root.add(new THREE.Line(ag, new THREE.LineBasicMaterial({ color: 0x5a7080, transparent: true, opacity: 0.28 })));
  // 十二宫标签（宫中央 15°）
  SIGNS.forEach((s, i) => {
    const sp = signTextSprite(s);
    sp.position.copy(eclPos(i * 30 + 15, 0, R * 1.07));
    root.add(sp);
  });
}

function buildPlanets() {
  planetGroup = new THREE.Group();
  root.add(planetGroup);
  for (const id of P_ORDER) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(P_COLOR[id]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const s = P_SIZE[id]; sp.scale.set(s, s, 1); sp.renderOrder = 10; sp.userData.id = id;
    planetGroup.add(sp);
    pickables.push({ key: 'p:' + id, id, name: P_CN[id], obj: sp, kind: 'planet' });
  }
}

// 亮星标签：仅 1.5 等以内（约二十余颗），DOM 呈现
function buildStarLabels() {
  STARS3.forEach(([ra, dec, mag, , name]) => {
    if (!name || mag > 1.5) return;
    const anchor = new THREE.Object3D();
    anchor.position.copy(eqPos(ra, dec, R * 1.02));
    root.add(anchor);
    pickables.push({ key: 's:' + name, name, obj: anchor, kind: 'star', ra, dec, mag });
  });
}

function computeBodies(at) {
  const t = shouyeTianxiang(at, 35);
  return { t, byId: Object.fromEntries(t.bodies.map((b) => [b.id, b])), moon: t.moon };
}

function updatePositions(at) {
  currentAt = at;
  let info;
  try { info = computeBodies(at); } catch (e) { return; }
  planetGroup.children.forEach((sp) => {
    const b = info.byId[sp.userData.id];
    if (!b) { sp.visible = false; return; }
    sp.visible = true;
    sp.position.copy(eclPos(b.lon, 0, (sp.userData.id === 'sun' || sp.userData.id === 'moon') ? R * 0.97 : R * 0.965));
    sp.userData.lon = b.lon; sp.userData.signName = b.signName; sp.userData.retro = b.retrograde;
  });
  const phaseEl = $('#gl-phase');
  if (phaseEl) phaseEl.textContent = `${info.moon.phaseName} · 亮${Math.round(info.moon.illumination * 100)}%`;
}

// ---------- DOM 标签投影（含近/远半球消隐） ----------
const camDir = new THREE.Vector3();
function project(pk) {
  const v = new THREE.Vector3();
  pk.obj.getWorldPosition(v);
  const facing = v.clone().normalize().dot(camera.getWorldDirection(camDir)); // >0 朝向相机=近半球
  const p = v.clone().project(camera);
  const host = renderer.domElement.parentElement;
  return { x: (p.x * 0.5 + 0.5) * host.clientWidth, y: (-p.y * 0.5 + 0.5) * host.clientHeight, near: facing > 0.02 };
}

function renderLabels() {
  const layer = $('#gl-labels');
  if (!layer) return;
  const w = layer.clientWidth, h = layer.clientHeight;
  for (const pk of pickables) {
    let el = pk.el;
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'gl-tag' + (pk.kind === 'star' ? ' is-star' : '');
      el.textContent = pk.name;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); showDetail(pk); });
      layer.appendChild(el); pk.el = el;
    }
    const p = project(pk);
    const on = p.near && p.x > -40 && p.x < w + 40 && p.y > -20 && p.y < h + 20;
    el.style.display = on ? '' : 'none';
    if (on) {
      el.style.transform = `translate(-50%,-50%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
      el.classList.toggle('is-sel', selPid === pk.key);
    }
  }
}

function showDetail(pk) {
  selPid = pk.key;
  const card = $('#gl-detail');
  if (!card) return;
  let html = '';
  if (pk.kind === 'planet') {
    const u = pk.obj.userData;
    if (u.lon == null) return;
    html = `
      <div class="gld-h"><span class="gld-dot" style="background:${P_COLOR[pk.id]};box-shadow:0 0 10px ${P_COLOR[pk.id]}"></span>${pk.name}</div>
      <div class="gld-row"><span>黄经</span><b>${u.lon.toFixed(2)}°</b></div>
      <div class="gld-row"><span>所在</span><b>${u.signName}座 ${(u.lon % 30).toFixed(2)}°</b></div>
      <div class="gld-row"><span>视运动</span><b class="${u.retro ? 'retro' : 'direct'}">${u.retro ? '逆行 ℞' : '顺行'}</b></div>`;
  } else {
    html = `
      <div class="gld-h"><span class="gld-dot" style="background:#cdd6e0"></span>${pk.name}</div>
      <div class="gld-row"><span>类型</span><b>裸眼恒星</b></div>
      <div class="gld-row"><span>赤经</span><b>${pk.ra.toFixed(2)}°</b></div>
      <div class="gld-row"><span>赤纬</span><b>${pk.dec.toFixed(2)}°</b></div>
      <div class="gld-row"><span>视星等</span><b>${pk.mag.toFixed(2)}</b></div>`;
  }
  card.innerHTML = html + '<div class="gld-src">行星为实时天文计算 · 恒星为 J2000 坐标</div>';
  card.classList.add('on');
}
function hideDetail() { selPid = null; const c = $('#gl-detail'); if (c) c.classList.remove('on'); }

// ---------- 视角控制（自研，零额外依赖） ----------
function bindControls(canvas) {
  const pointers = new Map();
  let pinchD = 0;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e); pointers.set(e.pointerId, p);
    hideDetail();
    if (pointers.size === 1) drag = { x: p.x, y: p.y, theta: cam.theta, phi: cam.phi };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e); pointers.set(e.pointerId, p);
    if (pointers.size === 1 && drag) {
      cam.theta = drag.theta - (p.x - drag.x) * 0.006;
      cam.phi = Math.max(0.18, Math.min(Math.PI - 0.18, drag.phi - (p.y - drag.y) * 0.006));
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

// ---------- 主循环 ----------
function loop(tms) {
  rafId = requestAnimationFrame(loop);
  const dt = lastT ? Math.min(60, tms - lastT) : 16.7;
  lastT = tms;
  if (playing && currentAt) {
    const stepMs = speed === 1 ? 3 * 3600e3 : speed === 2 ? 2 * 864e5 : 12 * 864e5;
    updatePositions(new Date(currentAt.getTime() + stepMs * (dt / 16.7)));
  }
  if (camTween) {
    const k = Math.min(1, (tms - camTween.t0) / camTween.dur);
    const e = 1 - Math.pow(1 - k, 3);
    cam.theta = camTween.from.theta + (camTween.to.theta - camTween.from.theta) * e;
    cam.phi = camTween.from.phi + (camTween.to.phi - camTween.from.phi) * e;
    if (k >= 1) camTween = null;
  }
  applyCamera();
  renderer.render(scene, camera);
  renderLabels();
}

function buildUI(body) {
  body.innerHTML = `
  <div class="gl-wrap">
    <div class="gl-canvas" id="gl-canvas"></div>
    <div class="gl-labels" id="gl-labels"></div>
    <div class="gl-phase" id="gl-phase"></div>
    <div class="gl-detail" id="gl-detail"></div>
    <div class="gl-ctl">
      <button class="gl-btn" id="gl-play" type="button" title="播放/暂停">▶</button>
      <div class="gl-segs">
        <button class="gl-btn seg" data-sp="1" type="button">时</button>
        <button class="gl-btn seg on" data-sp="2" type="button">日</button>
        <button class="gl-btn seg" data-sp="3" type="button">旬</button>
      </div>
      <button class="gl-btn" id="gl-now" type="button" title="回到此刻">此刻</button>
    </div>
    <div class="gl-views" id="gl-views">
      <button class="gl-btn seg on" data-vv="south" type="button" title="当下正南天空">南天</button>
      <button class="gl-btn seg" data-vv="moon" type="button" title="转向月亮">月</button>
      <button class="gl-btn seg" data-vv="sun" type="button" title="转向太阳">日</button>
      <button class="gl-btn seg" data-vv="north" type="button" title="北天极（北极星）">北极</button>
    </div>
    <div class="gl-hint">拖动旋转 · 双指/滚轮缩放 · 点星名看数据 · 南天/月/日/北极一键转向</div>
    <div class="gl-place" id="gl-place"></div>
  </div>`;

  const host = $('#gl-canvas');
  let tries = 0;
  const ensure = () => {
    if (inited) return;
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      initThree(host);
      bindControls(renderer.domElement);
    } else if (++tries < 40) {
      requestAnimationFrame(ensure);
    }
  };
  requestAnimationFrame(ensure);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { if (!inited) ensure(); }).observe(host);
  }

  $('#gl-play').addEventListener('click', (e) => {
    playing = !playing;
    e.currentTarget.textContent = playing ? '❚❚' : '▶';
  });
  body.querySelectorAll('.gl-btn.seg').forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.sp;
    body.querySelectorAll('.gl-btn.seg').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#gl-now').addEventListener('click', () => {
    playing = false; $('#gl-play').textContent = '▶';
    updatePositions(nowDate());
  });
  body.querySelectorAll('#gl-views [data-vv]').forEach((b) => b.addEventListener('click', () => {
    body.querySelectorAll('#gl-views [data-vv]').forEach((x) => x.classList.toggle('on', x === b));
    goToView(b.dataset.vv);
  }));
  // 拖动即取消按钮高亮（自由视角）
  const cv = host.querySelector('canvas');
  if (cv) cv.addEventListener('pointerdown', () => {
    body.querySelectorAll('#gl-views [data-vv]').forEach((x) => x.classList.remove('on'));
  });

  // 离开可见区即停渲染省电，回来自动恢复
  new IntersectionObserver((es) => {
    es.forEach((en) => {
      if (en.isIntersecting) { if (!rafId) { lastT = 0; loop(0); } }
      else { playing = false; const pb = $('#gl-play'); if (pb) pb.textContent = '▶'; cancelAnimationFrame(rafId); rafId = 0; }
    });
  }, { threshold: 0.02 }).observe(body);
}

function initThree(host) {
  if (inited) { host.appendChild(renderer.domElement); return; }
  // 移动端降级：弱机/小屏关抗锯齿、限像素比，避免掉帧把 WebGL 上下文挤掉（真机曾整块黑屏）
  const lowfx = (navigator.hardwareConcurrency || 8) <= 4 || Math.min(window.innerWidth || 400, window.innerHeight || 800) < 380;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 200);
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lowfx, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    host.innerHTML = '<div class="gl-fallback">这台设备未启用 WebGL（或显卡被占用），三维天球仪暂不可用；天象页"行星·该时刻黄道"数据不受影响。</div>';
    return;
  }
  renderer.setPixelRatio(Math.min(lowfx ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  root = new THREE.Group(); scene.add(root);
  buildStars(); buildGrids(); buildPlanets(); buildStarLabels();
  updatePositions(pendingAt || nowDate());
  // 起始视角：观测地此刻正南天空（此前固定角度，打开常落在南天深空，与所在地无关）
  try {
    const to = viewTarget('south');
    cam.theta = to.theta; cam.phi = THREE.MathUtils.clamp(to.phi, 0.18, Math.PI - 0.18);
  } catch { /* 保底用默认 */ }

  window.addEventListener('resize', () => {
    if (!host.clientWidth) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  });
  // 上下文被系统回收时给可读提示，恢复后自动重建场景（别留一块黑）
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    const tip = document.createElement('div');
    tip.className = 'gl-fallback';
    tip.textContent = '三维上下文被系统回收（内存紧张或切到后台），正在恢复…';
    host.appendChild(tip);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    host.querySelectorAll('.gl-fallback').forEach(n => n.remove());
    try {
      buildStars(); buildGrids(); buildPlanets(); buildStarLabels();
      updatePositions(pendingAt || nowDate());
    } catch (e) { /* 重建失败保持现状 */ }
  }, false);
  inited = true;
  loop(0);
}

// 由时间条 / 首次进入驱动
let pendingAt = null;
export function renderGlobe(at) {
  const body = $('#globe-body');
  if (!body) return;
  if (!built) { buildUI(body); built = true; }
  const target = at || nowDate();
  pendingAt = target;
  playing = false;
  const pb = $('#gl-play'); if (pb) pb.textContent = '▶';
  // 观测地：正南天空按当地恒星时定向，随地点变化
  const pl = $('#gl-place');
  if (pl) {
    const p = getPlace();
    const ew = p.lon >= 0 ? 'E' : 'W', ns = p.lat >= 0 ? 'N' : 'S';
    pl.textContent = `观测地：${p.name}（${Math.abs(p.lat).toFixed(2)}°${ns} ${Math.abs(p.lon).toFixed(2)}°${ew}）· 视角随观测地变化`;
  }
  if (inited) updatePositions(target);
}

export function globeCode(at = nowDate()) {
  const d = at || nowDate();
  return { kind: 'globe', data: { at: Math.floor(d.getTime() / 1000) }, title: '天球仪', sub: momentText(d) };
}
export function globeCopyText(at = nowDate()) {
  const d = at || nowDate();
  let info;
  try { info = computeBodies(d); } catch (e) { return '天球仪数据暂不可用'; }
  const L = ['【天球仪 · 行星实时黄道】', momentText(d) + '（北京时间）'];
  for (const id of P_ORDER) {
    const b = info.byId[id];
    if (b) L.push(`${P_CN[id]} ${b.signName}座 ${(b.lon % 30).toFixed(2)}° ${b.retrograde ? '逆行' : '顺行'}`);
  }
  return L.join('\n');
}
function momentText(d) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
