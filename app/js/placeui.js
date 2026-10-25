// 地点条 + 选点弹层：全盘面共用的地址入口（定位优先 / 拼音手选）
// 主人 v111 要求："所有命盘里边都是可以去选地址的"、"定位最方便，手动选择用拼音的方式"
// 做法：往各盘面页顶栏注入一枚地点胶囊，点开弹层；选完写回 geo.js 中心并广播，页面按需重渲染。
import { getPlace, setPlace, resetPlace, searchCity, locate, fmtCoord, onPlaceChange } from './geo.js?v=120';
import { toast } from './state.js?v=120';

// 需要地址的页面（抽牌/历史等与地点无关，不挂）
const VIEWS_WITH_PLACE = [
  'view-home', 'view-bazi', 'view-meihua', 'view-qimen', 'view-astro', 'view-vedic',
  'view-zhuyou', 'view-yangzhai', 'view-ziwei', 'view-sky', 'view-globe', 'view-mansion',
  'view-daliuren', 'view-xiaoliuren', 'view-geomancy', 'view-tibetan', 'view-cast', 'view-pan'
];

function chipHTML() {
  const p = getPlace();
  const tag = p.src === 'locate' ? '定位' : (p.src === 'default' ? '未设置' : '手选');
  return `<span class="pc-dot"></span><span class="pc-name">${p.name}</span><span class="pc-tag">${tag}</span>`;
}

function refreshChips() {
  document.querySelectorAll('.place-chip').forEach(el => { el.innerHTML = chipHTML(); });
}

// 往每个盘面页的顶栏注入地点胶囊
export function mountPlaceBars() {
  VIEWS_WITH_PLACE.forEach(id => {
    const view = document.getElementById(id);
    if (!view) return;
    let box = view.querySelector('.top-right');
    if (!box) {
      const bar = view.querySelector('.topbar');
      if (!bar) return;
      box = document.createElement('div');
      box.className = 'top-right';
      bar.appendChild(box);
    }
    if (box.querySelector('.place-chip')) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'place-chip';
    chip.title = '选择观测地（定位 / 拼音搜城市）';
    chip.innerHTML = chipHTML();
    box.insertBefore(chip, box.firstChild);
  });
  onPlaceChange(refreshChips);
}

// 全局委托：点胶囊开弹层
export function bindPlaceChip() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.place-chip')) { e.preventDefault(); openPlacePicker(); }
  });
}

// 选点弹层：返回 Promise<place|null>（选了才 resolve）
export function openPlacePicker() {
  return new Promise(resolve => {
    const old = document.getElementById('place-modal');
    if (old) old.remove();
    const m = document.createElement('div');
    m.className = 'place-modal';
    m.id = 'place-modal';
    const p0 = getPlace();
    m.innerHTML = `
      <div class="pm-mask"></div>
      <div class="pm-panel" role="dialog" aria-label="选择观测地">
        <div class="pm-head"><b>选择观测地</b><button class="pm-x" type="button" aria-label="关闭">✕</button></div>
        <div class="pm-cur">当前：${p0.name} · ${fmtCoord(p0)}</div>
        <div class="pm-actions">
          <button class="btn btn-primary" id="pm-locate" type="button">用当前位置定位</button>
          <button class="btn ghost" id="pm-reset" type="button">恢复默认（沈阳）</button>
        </div>
        <div class="pm-search">
          <input id="pm-q" type="search" placeholder="城市名或拼音：shenyang / 沈阳 / sy" autocomplete="off" enterkeyhint="search">
        </div>
        <div class="pm-list" id="pm-list"></div>
        <div class="pm-note">定位需你授权（https 下才可用）；不授权也能手选城市，城市库离线，不联网。</div>
      </div>`;
    document.body.appendChild(m);

    const list = m.querySelector('#pm-list');
    const input = m.querySelector('#pm-q');
    const close = (val) => { m.remove(); resolve(val); };

    function renderList(q) {
      const res = q ? searchCity(q, 40) : [];
      if (!q) { list.innerHTML = '<div class="pm-empty">输入城市名或拼音即可检索（如 shenyang / 沈阳 / sy / hangzhou）</div>'; return; }
      if (!res.length) { list.innerHTML = '<div class="pm-empty">没找到这个城市，换个写法试试</div>'; return; }
      list.innerHTML = res.map(c => `
        <button type="button" class="pm-item" data-lat="${c.lat}" data-lon="${c.lon}" data-n="${c.n}" data-p="${c.prov || ''}">
          <span class="pmi-name">${c.n}</span>
          <span class="pmi-prov">${c.prov || ''}</span>
          <span class="pmi-coord">${fmtCoord(c)}</span>
        </button>`).join('');
    }
    renderList('');

    input.addEventListener('input', () => renderList(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const first = list.querySelector('.pm-item'); if (first) first.click(); }
    });
    list.addEventListener('click', (e) => {
      const it = e.target.closest('.pm-item');
      if (!it) return;
      const p = setPlace({ name: it.dataset.n, prov: it.dataset.p, lat: +it.dataset.lat, lon: +it.dataset.lon, src: 'manual' });
      toast(`观测地已切换：${p.name}`);
      close(p);
    });
    m.querySelector('#pm-locate').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = '定位中…';
      try {
        const r = await locate();
        const nm = r.near ? r.near.city.n : '当前位置';
        const p = setPlace({ name: nm, prov: r.near ? r.near.city.prov : '', lat: r.lat, lon: r.lon, src: 'locate' });
        const extra = r.near ? `（距${nm}约${Math.round(r.near.km)}公里）` : '';
        toast(`已定位：${nm}${extra}`);
        close(p);
      } catch (err) {
        btn.disabled = false; btn.textContent = '用当前位置定位';
        toast(err.message || '定位失败');
      }
    });
    m.querySelector('#pm-reset').addEventListener('click', () => {
      const p = resetPlace();
      toast('已恢复默认观测地：沈阳');
      close(p);
    });
    m.querySelector('.pm-x').addEventListener('click', () => close(null));
    m.querySelector('.pm-mask').addEventListener('click', () => close(null));
    setTimeout(() => { try { input.focus(); } catch {} }, 60);
  });
}
