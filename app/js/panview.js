// 排盘视图：本卦 → 变卦 两列（藏爻默认收列，需要时一键展开）
import { $, $$, cfg, current, toast, flashCopyBtn } from './state.js?v=119';
import { formatCopyText, getShouGuaPan } from '../vendor/liuyao-core.js?v=119';
import { renderJingZhuan } from './jingzhuanview.js?v=119';
import { renderReading, getActiveReadingDomain } from './readingview.js?v=119';
import { renderNajia } from './najiaview.js?v=119';
import { renderVerdict } from './verdict.js?v=119';
// 元素对照：六亲 / 六神 的含义 key
const LY_QIN_KEY = { 父母:'ly-qin-fumu', 兄弟:'ly-qin-xiongdi', 子孙:'ly-qin-zisun', 妻财:'ly-qin-qicai', 官鬼:'ly-qin-guangui' };
const LY_SHEN_KEY = { 青龙:'ly-shen-qinglong', 朱雀:'ly-shen-zhuque', 勾陈:'ly-shen-gouchen',
  螣蛇:'ly-shen-tengshe', 白虎:'ly-shen-baihu', 玄武:'ly-shen-xuanwu' };

import { guideHTML, T } from './tipview.js?v=119';

const POS_NAME = ['初','二','三','四','五','上'];
// 伏神小标用的一字简称
const QIN_SHORT = { 官鬼:'官', 父母:'父', 兄弟:'兄', 子孙:'孙', 妻财:'财' };

const PAN_GUIDE = {
  title: '怎么看这一卦',
  intro: '这一盘是六爻（纳甲筮法）排出的卦：左边「本卦」是你摇出来的现状，有动爻时右边出现「变卦」，表示事情发展下去的样子；动爻那几行会高亮。看完卦先翻到下面的「古法直断」卡：它直接告诉你这一卦的吉凶倾向、依据和时间窗。本盘每一个六亲、六神都可以点开——卡里会告诉你它是什么、代表什么、古法怎么用。',
  steps: [
    { t: '最上面的卦名', d: '「X宫：某卦」是这卦的归属；后面「之 某卦」表示变卦。', tip: 'liuyao', sel: '.pan-head' },
    { t: '本卦 → 变卦', d: '左列「本卦」是现状，右列「变卦」是走向；只有带 ○（阳动）或 Ｘ（阴动）的爻会变，那几行会高亮。', tip: 'biangua', sel: '.pan-rows' },
    { t: '每个爻怎么读', d: '一行一个爻，从下往上；写着六亲+干支，旁边画阴阳爻线。', tip: 'najia', sel: '.pan-rows' },
    { t: '标「世」「应」的位置', d: '世爻代表自己，应爻代表对方或所问之事。', tip: 'shiyao', sel: '.pan-rows' },
    { t: '爻前的「伏」小字', d: '表示这爻下藏着一个本宫伏神，用来补卦里缺的六亲；想看完整藏爻列，可点右上角「显示藏爻」。', tip: 'liuqin', sel: '.pan-rows' },
    { t: '再往下看经传原文与读法', d: '卦辞、爻辞是《周易》原文；再往下是取用神与自问清单。', tip: 'guaci' },
  ],
  note: '盘上只列传统体系里的通行含义与古籍出处，不替你下断语；吉凶倾向一律标为「古籍所载」，供你自己衡量。',
};

const SS_LABELS = (ss) => [
  ['驿马', ss.yiMa], ['桃花', ss.taoHua], ['日禄', ss.riLu],
  ['贵人', `${ss.guiRen[0]}，${ss.guiRen[1]}`], ['文昌', ss.wenChang],
  ['羊刃', ss.yangRen], ['将星', ss.jiangXing], ['谋星', ss.mouXing],
  ['劫煞', ss.jieSha], ['灾煞', ss.zaiSha], ['华盖', ss.huaGai],
  ['日德', ss.riDe], ['天马', ss.tianMa], ['天医', ss.tianYi],
];

export function renderPan() {
  const p = current.pan;
  if (!p) return;

  // 头部
  const gongTag = [];
  if (p.benGua.specialType) gongTag.push(p.benGua.specialType);
  if (p.benGua.isGuiHun) gongTag.push('归魂');
  if (p.benGua.isYouHun) gongTag.push('游魂');
  if (p.benGua.isBaChun) gongTag.push('八纯');
  const title = `${p.benGua.gong}宫：${p.benGua.name}${gongTag.length ? `（${gongTag.join('·')}）` : ''}${p.bianGua ? ` 之 ${p.bianGua.name}` : ''}`;

  const ssHtml = cfg.showShensha
    ? `<div class="shensha">神煞：${SS_LABELS(p.shenSha).map(([k, v]) => `${k}－${v}`).join('　')}</div>` : '';

  // 藏爻列只在「显示藏爻」开启时出现；伏神始终用小标提示
  const showCang = !!cfg.showCangyao;
  const hasBian = !!p.bianGua;
  const shou = getShouGuaPan(p.benGua.gong);
  const shouByPos = {};
  for (const y of shou.yaoList) shouByPos[y.position] = y;
  const fuByPos = {};
  for (const f of p.fuShenList) fuByPos[f.position] = f;

  const head = `
    <div class="pan-head">
      <div class="guan">${title}</div>
      <div>${p.siZhu.yearGanZhi}年 ${p.siZhu.monthGanZhi}月 ${p.siZhu.dayGanZhi}日 ${p.siZhu.timeGanZhi}时（旬空：${p.xunKong.join('')}）</div>
      ${ssHtml}
    </div>`;

  // 列头（与每行 grid 列对齐）
  let cols = '<div class="pan-cols"><span class="shen"></span>';
  if (showCang) cols += '<span class="colh colh-cang">藏爻</span>';
  cols += `<span class="colh">本卦 · ${p.benGua.name}</span>`;
  if (hasBian) cols += `<span class="colh">变卦 · ${p.bianGua.name}</span>`;
  cols += '</div>';

  // 六爻：自上而下（position 6 → 1）
  let rows = '';
  for (let pos = 6; pos >= 1; pos--) {
    const y = p.yaoList[pos - 1];
    const b = p.bianYaoList ? p.bianYaoList[pos - 1] : null;
    const isMoving = y.moving;
    const sYao = shouByPos[pos];
    const fu = fuByPos[pos];

    // 藏爻列（默认不渲染）
    let cang = '';
    if (showCang) {
      if (fu) {
        cang = `<div class="cell"><span class="lq is-fu" data-tip="${LY_QIN_KEY[fu.liuQin] || ''}">${fu.liuQin}${fu.gan}${fu.zhi}</span></div>`;
      } else {
        cang = `<div class="cell cang-col"><span class="lq" data-tip="${LY_QIN_KEY[sYao.liuQin] || ''}">${sYao.liuQin}${sYao.gan}${sYao.zhi}</span>${lineHtml(sYao.yinYang)}</div>`;
      }
    }

    // 本卦：伏神小标
    const fuTag = fu
      ? `<span class="fu-tag" data-tip="${LY_QIN_KEY[fu.liuQin] || ''}" title="伏神：${fu.liuQin}${fu.gan}${fu.zhi}（${fu.relation}）">伏${QIN_SHORT[fu.liuQin] || ''}</span>`
      : '';
    const benSym = y.shiYing ? `<span class="mark ${y.shiYing === '世' ? 'shi' : 'ying'}">${y.shiYing}</span>` : '';
    const dong = isMoving ? `<span class="mark ${y.yinYang === '阳' ? 'dong-yang' : 'dong-yin'}">${y.yinYang === '阳' ? '○' : 'Ｘ'}</span>` : '';
    const ben = `<div class="cell"><span class="lq" data-tip="${LY_QIN_KEY[y.liuQin] || ''}">${fuTag}${y.liuQin}${y.gan}${y.zhi}</span>${lineHtml(y.yinYang)}${benSym}${dong}</div>`;

    // 变卦：六爻画全，非动爻只留灰爻线对齐
    let bian = '';
    if (hasBian && b) {
      if (isMoving) {
        const bs = b.shiYing ? `<span class="mark ${b.shiYing === '世' ? 'shi' : 'ying'}">${b.shiYing}</span>` : '';
        bian = `<div class="cell bian-move"><span class="lq" data-tip="${LY_QIN_KEY[b.liuQin] || ''}">${b.liuQin}${b.gan}${b.zhi}</span>${lineHtml(b.yinYang)}${bs}</div>`;
      } else {
        bian = `<div class="cell bian-rest">${lineHtml(b.yinYang)}</div>`;
      }
    }

    rows += `<div class="pan-line ${isMoving ? 'is-moving' : ''}">
      <div class="shen" data-tip="${LY_SHEN_KEY[y.liuShen] || ''}">${y.liuShen}</div>${cang}${ben}${bian}
    </div>`;
  }

  const rowCls = ['pan-grid', showCang ? 'has-cang' : '', hasBian ? 'has-bian' : ''].filter(Boolean).join(' ');
  $('#pan-body').innerHTML = guideHTML(PAN_GUIDE) + head + `<div class="pan-rows ${rowCls}">${cols}${rows}</div>`;
  // 古法直断结论卡（v69）：排完盘第一张给方向的卡
  renderVerdict(p, getActiveReadingDomain());

  // toggle 视觉态
  $('#toggle-shensha').classList.toggle('on', cfg.showShensha);
  $('#toggle-shensha').textContent = cfg.showShensha ? '隐藏神煞' : '显示神煞';
  $('#toggle-cangyao').classList.toggle('on', cfg.showCangyao);
  $('#toggle-cangyao').textContent = cfg.showCangyao ? '隐藏藏爻' : '显示藏爻';

  // 性别 / 所问
  $$('.g-btn').forEach((b) => b.classList.toggle('on', b.id === (p.gender === '男' ? 'gender-male' : 'gender-female')));
  $('#question-input').value = p.question === '未填写所占之事' ? '' : p.question;

  // 经传事实区（M5）：卦辞/彖/大象 + 动爻爻辞，只报原文不解卦
  renderJingZhuan(p);
  // 问事读法区（M5）：取用神/观察点/典籍原文/自问清单，不替用户断吉凶
  renderReading(p);
  renderNajia(p, getActiveReadingDomain());
}

function lineHtml(yy) {
  if (yy === '阳') return '<span class="lines"><span class="seg yang"></span></span>';
  return '<span class="lines"><span class="seg yin"></span><span class="seg yin"></span></span>';
}

export async function copyCurrent(ev, code) {
  const p = current.pan;
  if (!p) return;
  let text = formatCopyText(p, { showHidden: cfg.showCangyao });
  // 强制带复现码：顺手粘给 AI 后，随时能在系统内还原这一盘
  if (code) text += `\n复现码：${code}\n`;
  const btn = ev && ev.currentTarget;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (ok) flashCopyBtn(btn); else toast('复制失败，请长按选择');
}
