// homecards.js — 起卦页「更多排盘」卡片化入口
// 每种术数：图标 + 主标题 + 一句话介绍 + 分组，按 命/卜/牌/相/天 分组
// v120：小雷诺曼整体撤下，塔罗卡只保留历代塔罗牌组。

const I = {
  bazi: '<path d="M8.6 3.6v16.8M15.4 3.6v16.8"/><path d="M5.6 8.8h6M12.4 8.8h6M5.6 15.2h6M12.4 15.2h6"/>',
  ziwei: '<circle cx="4.8" cy="16.2" r="1.5"/><circle cx="8.6" cy="12.8" r="1.5"/><circle cx="11.8" cy="15.4" r="1.5"/><circle cx="14.8" cy="10" r="1.5"/><circle cx="17.8" cy="12.6" r="1.5"/><circle cx="20" cy="6.8" r="1.5"/><circle cx="6.4" cy="7.6" r="1.5"/>',
  astro: '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="4.6"/><path d="M12 3.2v17.6M3.2 12h17.6"/>',
  vedic: '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4v17.2M3.4 12h17.2M5.9 5.9l12.2 12.2M18.1 5.9L5.9 18.1"/>',
  meihua: '<circle cx="12" cy="12" r="2.1"/><circle cx="12" cy="5.7" r="2.5"/><circle cx="17.5" cy="10.3" r="2.5"/><circle cx="15" cy="16.9" r="2.5"/><circle cx="9" cy="16.9" r="2.5"/><circle cx="6.5" cy="10.3" r="2.5"/>',
  qimen: '<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="1.6"/><path d="M9.3 3.8v16.4M14.7 3.8v16.4M3.8 9.3h16.4M3.8 14.7h16.4"/>',
  daliuren: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21"/>',
  xiaoliuren: '<circle cx="12" cy="4.8" r="1.9"/><circle cx="18.2" cy="8.4" r="1.9"/><circle cx="18.2" cy="15.6" r="1.9"/><circle cx="12" cy="19.2" r="1.9"/><circle cx="5.8" cy="15.6" r="1.9"/><circle cx="5.8" cy="8.4" r="1.9"/>',
  geomancy: '<circle cx="8.5" cy="6" r="1.5"/><circle cx="15.5" cy="6" r="1.5"/><circle cx="12" cy="10.5" r="1.5"/><circle cx="8.5" cy="15" r="1.5"/><circle cx="15.5" cy="15" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  tibetan: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="8.5" r="1.3"/><circle cx="15.5" cy="8.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="8.5" cy="15.5" r="1.3"/><circle cx="15.5" cy="15.5" r="1.3"/>',
  tarot: '<rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5 L13 10.2 L16 10.2 L13.6 12 L14.5 14.7 L12 13 L9.5 14.7 L10.4 12 L8 10.2 L11 10.2 Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  yangzhai: '<path d="M4 11.2 12 4l8 7.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.4V20h12V10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="14.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  zhuyou: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.6"/><path d="M9 9h6v6H9z"/><path d="M12 4.5v4.5M12 15v4.5M4.5 12H9M15 12h4.5"/>',
  sky: '<circle cx="5.8" cy="16.4" r="1.8"/><circle cx="12" cy="7.8" r="2.4"/><circle cx="18.6" cy="15" r="1.4"/><path d="M7.2 15l3.1-4.4M13.9 9.4l3.5 3.9"/>',
  globe: '<circle cx="12" cy="12" r="8.6"/><ellipse cx="12" cy="12" rx="8.6" ry="3.4"/><path d="M12 3.4v17.2M3.4 12h17.2"/>',
  mansion: '<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6v2.3M12 18.1v2.3M3.6 12h2.3M18.1 12h2.3M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"/>',
};

const GROUPS = [
  {
    gh: '命 · 出生定盘', tip: '一次生辰，终身格局',
    items: [
      { k: 'bazi', t: '八字', d: '四柱定格 · 十神六亲看格局高低' },
      { k: 'ziwei', t: '紫微斗数', d: '十二宫星曜 · 大限流年看运途' },
      { k: 'astro', t: '西洋星盘', d: '古典本命盘 · 行星星座宫位相位' },
      { k: 'vedic', t: '印度占星', d: 'Jyotiṣa · 二十七宿与 Dashā 大运' },
    ],
  },
  {
    gh: '卜 · 一事一占', tip: '心中有事，当下起卦',
    items: [
      { k: 'meihua', t: '梅花易数', d: '触机起卦 · 体用生克断一事成败' },
      { k: 'qimen', t: '奇门遁甲', d: '时家转盘 · 格局用神断时机方位' },
      { k: 'daliuren', t: '大六壬', d: '月将加时 · 四课三传断来龙去脉' },
      { k: 'xiaoliuren', t: '小六壬', d: '掌上三数 · 最快的一卦' },
      { k: 'geomancy', t: '地占术', d: '欧洲中世纪 · 十六卦形盾阵断问' },
      { k: 'tibetan', t: '敦煌藏占', d: '骰掷六十四卦 · 六十二繇辞' },
    ],
  },
  {
    gh: '牌 · 抽牌成阵', tip: '亲手洗牌，逐张翻开',
    items: [
      { k: 'tarot', t: '塔罗牌桌', d: '韦特 / 索拉·布斯卡 / 马赛等历代牌组' },
    ],
  },
  {
    gh: '相 · 宅法符禁', tip: '观物之形，用古之法',
    items: [
      { k: 'yangzhai', t: '阳宅风水', d: '八宅 · 玄空飞星 · 金锁玉关看宅向' },
      { k: 'zhuyou', t: '符箓祝由', d: '《圣济总录》符禁门 · 对症古法' },
    ],
  },
  {
    gh: '天 · 星象台', tip: '仰观天象，实时躔次',
    items: [
      { k: 'sky', t: '天象', d: '七政四余实时行度 · 节气月相' },
      { k: 'globe', t: '天球', d: '三维立体星图 · 行星实时位置' },
      { k: 'mansion', t: '星官', d: '三垣二十八宿 · 真星连线天球' },
    ],
  },
];

function icoSvg(k) {
  const inner = I[k];
  if (!inner) return '';
  const hasOwnStroke = /stroke="currentColor"/.test(inner);
  return `<svg class="qi" viewBox="0 0 24 24"${hasOwnStroke ? ' fill="none"' : ''}>${inner}</svg>`;
}

export function renderMoreCards() {
  const host = document.getElementById('more-cards');
  if (!host) return;
  host.innerHTML = GROUPS.map((g) => `
    <div class="mc-group">
      <div class="mc-gh"><b>${g.gh}</b><i>${g.tip}</i></div>
      <div class="mc-grid">
        ${g.items.map((it) => `
        <button type="button" class="mc-card" data-open="${it.k}">
          <span class="mc-ico">${icoSvg(it.k)}</span>
          <span class="mc-txt"><b>${it.t}</b><i>${it.d}</i></span>
        </button>`).join('')}
      </div>
    </div>`).join('');
}
