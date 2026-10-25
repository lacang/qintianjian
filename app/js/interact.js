/*
 * 三盘（梅花/八字/奇门）统一交互层：容器级事件委托 + 触摸滑动。
 * 监听只绑定一次到 body（section 容器长期存在，视图内部 innerHTML 重渲染也不丢失）。
 * 全部行为只读 data-* / 切换 class，不在此做任何排盘或吉凶逻辑。
 */

function setMhTab(root, key) {
  root.querySelectorAll('[data-mh-tab]').forEach((b) => b.classList.toggle('active', b.dataset.mhTab === key));
  root.querySelectorAll('[data-mh-card]').forEach((c) => c.classList.toggle('active', c.dataset.mhCard === key));
  root.querySelectorAll('[data-mh-panel]').forEach((p) => {
    p.classList.toggle('active', p.dataset.mhPanel === key);
  });
}

function baziPillar(root, key) {
  root.querySelectorAll('[data-pane]').forEach((p) => {
    if (p.dataset.paneGroup === 'pillar') p.classList.toggle('active', p.dataset.pane === key);
  });
  root.querySelectorAll('[data-pi]').forEach((c) => c.classList.toggle('active', c.dataset.pi === key));
}

function baziWuxing(root, wx, rowEl) {
  // 再点同一个五行 → 取消筛选
  const on = rowEl.classList.toggle('active');
  if (!on) {
    root.querySelectorAll('.wx-bar-row').forEach((r) => r.classList.remove('active'));
    root.querySelectorAll('[data-pi]').forEach((c) => c.classList.remove('dimmed'));
    return;
  }
  root.querySelectorAll('.wx-bar-row').forEach((r) => r.classList.toggle('active', r.dataset.wx === wx));
  root.querySelectorAll('[data-pi]').forEach((c) => {
    const set = (c.dataset.wxlist || '').split(',');
    c.classList.toggle('dimmed', !set.includes(wx));
  });
}

function qmPalace(root, n) {
  root.querySelectorAll('[data-pane]').forEach((p) => {
    if (p.dataset.paneGroup === 'palace') p.classList.toggle('active', p.dataset.pane === String(n));
  });
  root.querySelectorAll('[data-palace]').forEach((c) => c.classList.toggle('active', c.dataset.palace === String(n)));
}

function qmFilter(root, type, chipEl) {
  const on = chipEl.classList.toggle('active');
  if (!on) {
    root.querySelectorAll('[data-qmfilter]').forEach((c) => c.classList.remove('active'));
    root.querySelectorAll('.qm-cell').forEach((c) => c.classList.remove('dimmed'));
    return;
  }
  root.querySelectorAll('[data-qmfilter]').forEach((c) => c.classList.toggle('active', c === chipEl));
  root.querySelectorAll('.qm-cell').forEach((c) => {
    let hit = false;
    if (type === 'zf') hit = c.dataset.zf === '1';
    else if (type === 'zs') hit = c.dataset.zs === '1';
    else if (type === 'kong') hit = (c.dataset.marks || '').includes('空');
    else if (type === 'ma') hit = (c.dataset.marks || '').includes('马');
    else if (type === 'mu') hit = (c.dataset.marks || '').includes('墓');
    c.classList.toggle('dimmed', !hit);
  });
}

function bindMeihuaSwipe(root) {
  if (root.__mhSwipe) return;
  root.__mhSwipe = true;
  let sx = 0, sy = 0, st = null;
  // 手势区域：三卦卡条（含卡片本身）。禁用原生横滚，交给滑动切换，避免"滑不动/卡半页"。
  const stageSel = '[data-mh-stage]';
  root.addEventListener('touchstart', (e) => {
    st = e.target.closest(stageSel);
    if (!st) return;
    if (st.addEventListener && st.style) st.style.touchAction = 'pan-y';
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (!st) return;
    const cur = st; st = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return; // 需明显横向、且以横向为主
    const order = ['ben', 'hu', 'bian'];
    const activeNow = cur.querySelector('[data-mh-card].active');
    const i = activeNow ? order.indexOf(activeNow.dataset.mhCard) : 0;
    const ni = dx < 0 ? Math.min(2, i + 1) : Math.max(0, i - 1);
    if (ni !== i) setMhTab(root, order[ni]);
  }, { passive: true });
}

/* ============ 古法读法层（梅花 / 奇门） ============ */

// 折叠「古法读卦/读盘次第」整段
function rdToggle(head) {
  const sec = head.closest('.rd-method');
  if (!sec) return;
  const open = sec.classList.toggle('open');
  const chev = head.querySelector('.rd-method-chevron');
  if (chev) chev.textContent = open ? '收起' : '展开';
}

// 奇门读盘步骤：展开；带 data-rdpals 时高亮并滚动到上方九宫
function qmStepFlash(root, el) {
  el.classList.toggle('open');
  const pals = (el.dataset.rdpals || '').split(',').map((x) => parseInt(x, 10)).filter((n) => n >= 1);
  if (!pals.length) return;
  const cells = pals.map((n) => root.querySelector(`.qm-cell[data-palace="${n}"]`)).filter(Boolean);
  if (!cells.length) return;
  root.querySelectorAll('.qm-cell.rd-flash').forEach((c) => c.classList.remove('rd-flash'));
  cells.forEach((c) => c.classList.add('rd-flash'));
  cells[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => root.querySelectorAll('.qm-cell.rd-flash').forEach((c) => c.classList.remove('rd-flash')), 2400);
}

/* ============ 占星星盘联动 ============ */

function astroHasSel(root, on) {
  root.querySelectorAll('.cw-svg').forEach((s) => s.classList.toggle('has-sel', on));
}
function astroSelect(root, ap) {
  astroHasSel(root, true);
  // 轮盘：点亮该星及其所有主相位；清单同步
  root.querySelectorAll('.cw-planet').forEach((g) => g.classList.toggle('hl', g.dataset.ap === ap));
  root.querySelectorAll('.ab-row').forEach((b) => b.classList.toggle('hl', b.dataset.ap === ap));
  root.querySelectorAll('.cw-asp').forEach((ln) => {
    const pair = (ln.dataset.apair || '').split('|');
    ln.classList.toggle('hl', pair.includes(ap));
  });
  root.querySelectorAll('.ax-row').forEach((r) => {
    const pair = (r.dataset.apair || '').split('|');
    r.classList.toggle('hl', pair.includes(ap));
  });
}

function astroSelectPair(root, pair, aspKey) {
  astroHasSel(root, true);
  const [a, b] = pair.split('|');
  root.querySelectorAll('.cw-planet').forEach((g) => g.classList.toggle('hl', g.dataset.ap === a || g.dataset.ap === b));
  root.querySelectorAll('.ab-row').forEach((r) => r.classList.toggle('hl', r.dataset.ap === a || r.dataset.ap === b));
  root.querySelectorAll('.cw-asp').forEach((ln) => ln.classList.toggle('hl', ln.dataset.apair === pair && ln.dataset.aspkey === aspKey));
  root.querySelectorAll('.ax-row').forEach((r) => r.classList.toggle('hl', r.dataset.apair === pair && r.dataset.aspkey === aspKey));
}

// 奇门事类 tabs
function qmYongShenTab(sec, btn) {
  const key = btn.dataset.qytab;
  sec.querySelectorAll('.rd-ys-tab').forEach((b) => b.classList.toggle('active', b === btn));
  sec.querySelectorAll('.rd-ys-panel').forEach((p) => p.classList.toggle('active', p.dataset.qypanel === key));
}

export function initInteract() {
  const mhBody = document.getElementById('meihua-body');
  const bzBody = document.getElementById('bazi-body');
  const qmBody = document.getElementById('qimen-body');

  if (mhBody) {
    mhBody.addEventListener('click', (e) => {
      // 古法读法层：折叠 / 步骤展开优先
      const tg = e.target.closest('[data-rdtoggle]');
      if (tg) { rdToggle(tg); return; }
      const step = e.target.closest('.mh-method .rd-step');
      if (step) { step.classList.toggle('open'); return; }
      const tab = e.target.closest('[data-mh-tab],[data-mh-card]');
      if (tab) setMhTab(mhBody, tab.dataset.mhTab || tab.dataset.mhCard);
    });
    bindMeihuaSwipe(mhBody);
  }

  if (bzBody) {
    bzBody.addEventListener('click', (e) => {
      const col = e.target.closest('[data-pi]');
      if (col) { baziPillar(bzBody, col.dataset.pi); return; }
      const wx = e.target.closest('[data-wx]');
      if (wx) { baziWuxing(bzBody, wx.dataset.wx, wx); return; }
    });
  }

  const astroBody = document.getElementById('astro-body');
  if (astroBody) {
    astroBody.addEventListener('click', (e) => {
      const pairEl = e.target.closest('[data-apair]');
      if (pairEl) { astroSelectPair(astroBody, pairEl.dataset.apair, pairEl.dataset.aspkey); return; }
      const apEl = e.target.closest('[data-ap]');
      if (apEl) { astroSelect(astroBody, apEl.dataset.ap); }
    });
  }

  if (qmBody) {
    qmBody.addEventListener('click', (e) => {
      // 古法读法层优先
      const tg = e.target.closest('[data-rdtoggle]');
      if (tg) { rdToggle(tg); return; }
      const step = e.target.closest('.qm-method .rd-step');
      if (step) { qmStepFlash(qmBody, step); return; }
      const yt = e.target.closest('.rd-ys-tab');
      if (yt) { qmYongShenTab(yt.closest('.rd-method'), yt); return; }
      const chip = e.target.closest('.rd-pal-chip');
      if (chip) { qmPalace(qmBody, chip.dataset.qmpal); const p = qmBody.querySelector(`.qm-pane[data-pane="${chip.dataset.qmpal}"]`); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

      const cell = e.target.closest('.qm-cell[data-palace]');
      if (cell) { qmPalace(qmBody, cell.dataset.palace); return; }
      const f = e.target.closest('[data-qmfilter]');
      if (f) qmFilter(qmBody, f.dataset.qmfilter, f);
    });
  }
}
