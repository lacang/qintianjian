/**
 * 格式化层
 *
 * - formatCopyText：产出与「六爻排盘」App「复制卦例」逐字一致的纯文本。
 *   严格依据《复制卦例模板.md》：头部四行 + 爻区（自上而下＝上爻→初爻）。
 *   空格统一为单空格分隔（模板注明"空格全/半角可在实现时统一，字段顺序不能错"），
 *   验收时按空白归一比较。
 * - formatScreen：只产出结构化视图模型，不渲染任何 UI。
 */
import { getShouGuaPan, type ShouGuaYao } from './paipan.js';
import type { BenYao, BianYao, LiuQin, Pan, TianGan, DiZhi } from './types.js';

export interface FormatOptions {
  /** 是否显示藏爻（本宫首卦列）。默认 true（金标准样本均为显示藏爻状态复制）。
   *  false 时省略伏神列；隐藏状态下 App 实际是否带此列尚未拿到样本，见 TODO。 */
  showHidden?: boolean;
}

const YANG_LINE = '━━━';
const YIN_LINE = '━ ━';
const YANG_DONG = '○';
const YIN_DONG = 'Ｘ';

function qinGanZhi(qin: LiuQin, gan: TianGan, zhi: DiZhi): string {
  // 六亲+天干+地支+五行（五行随支固定，从六亲干支名推：App 文本形如"官鬼丁未土"）
  return `${qin}${gan}${zhi}${WUXING_OF_ZHI[zhi]}`;
}

const WUXING_OF_ZHI: Record<DiZhi, string> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

function lineOf(yinYang: '阴' | '阳'): string {
  return yinYang === '阳' ? YANG_LINE : YIN_LINE;
}

/** 终端/剪贴板显示宽度：CJK 与全角符号记 2，其余记 1。爻线 ━/━/空格据此精确对齐。 */
function dispWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    // ━(U+2501)、全角Ｘ、中文、全角标点等按宽字符计
    const wide =
      code >= 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 || code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x2500 && code <= 0x257f) || // 制表/画线符号含 ━
        code === 0x25cb || // ○ 阳动符按全角宽计
        (code >= 0x20000 && code <= 0x3fffd));
    w += wide ? 2 : 1;
  }
  return w;
}

/** 右侧补全角/半角空格到指定显示宽度，保证各爻行同列纵向对齐。 */
function padEndDisp(s: string, width: number): string {
  const gap = width - dispWidth(s);
  return gap > 0 ? s + ' '.repeat(gap) : s;
}

export function formatCopyText(pan: Pan, options: FormatOptions = {}): string {
  const showHidden = options.showHidden ?? true;
  const lines: string[] = [];

  // ---- 头部四行 ----
  lines.push(`${pan.gender === '女' ? '女测' : '男测'}：${pan.question.trim() || '未填写所占之事'}`);
  const s = pan.solar;
  lines.push(`公历：${s.year}年 ${s.month}月 ${s.day}日 ${s.hour}时 ${s.minute}分`);
  const z = pan.siZhu;
  lines.push(
    `干支：${z.yearGanZhi}年 ${z.monthGanZhi}月 ${z.dayGanZhi}日 ${z.timeGanZhi}时 （旬空：${pan.xunKong[0]}${pan.xunKong[1]}）`,
  );
  const title = pan.bianGua ? `得${pan.benGua.name}之${pan.bianGua.name}` : `得${pan.benGua.name}`;
  lines.push(title);

  // ---- 爻区：自上而下（上爻 position=6 → 初爻 position=1）----
  const shou = showHidden ? getShouGuaPan(pan.benGua.gong) : undefined;
  // 真伏神位置集合：该位伏神列只写伏神名、省略爻线与本宫世应
  const fuAt = new Map(pan.fuShenList.map((f) => [f.position, f]));

  // 先生成每行三列的原始串，再按各列显示宽度补空格对齐（修复单空格折叠导致的列错位）。
  interface YaoRow { liuShen: string; fu: string; ben: string; bian: string }
  const rows: YaoRow[] = [];
  for (let position = 6; position >= 1; position--) {
    const i = position - 1;
    const ben = pan.yaoList[i];
    const bian: BianYao | undefined = pan.bianYaoList?.[i];

    // 第 1 列：六神（固定 2 个汉字宽）
    const liuShen = ben.liuShen;

    // 第 2 列：藏爻（本宫首卦 / 真伏神）
    let fu = '';
    if (shou) {
      const f = fuAt.get(position);
      if (f) {
        // 真伏神位：只写伏神六亲纳甲名，不画爻线、不标本宫世应（金标准革卦妻财戊午火例）
        fu = qinGanZhi(f.liuQin, f.gan, f.zhi);
      } else {
        const sy: ShouGuaYao = shou.yaoList[i];
        fu = `${qinGanZhi(sy.liuQin, sy.gan, sy.zhi)} ${lineOf(sy.yinYang)}${sy.shiYing ? ' ' + sy.shiYing : ''}`;
      }
    }

    // 第 3 列：本卦（名 + 爻线 + 世应 + 动标；动标总在世应之后）
    let benTail = ben.shiYing ?? '';
    if (ben.moving) {
      const dong = ben.yinYang === '阳' ? YANG_DONG : YIN_DONG;
      benTail = benTail ? `${benTail} ${dong}` : dong;
    }
    const benStr = `${qinGanZhi(ben.liuQin, ben.gan, ben.zhi)} ${lineOf(ben.yinYang)}${benTail ? ' ' + benTail : ''}`;

    // 第 4 列：变卦（仅动卦；每行都给，带变卦自身世应，六亲按本卦宫）
    let bianStr = '';
    if (pan.bianGua && bian) {
      bianStr = `${qinGanZhi(bian.liuQin, bian.gan, bian.zhi)} ${lineOf(bian.yinYang)}${bian.shiYing ? ' ' + bian.shiYing : ''}`;
    }

    rows.push({ liuShen, fu, ben: benStr, bian: bianStr });
  }

  // 各列显示宽度（藏爻列固定按正常本宫爻最宽 22，真伏神名短也补齐，保证本卦列不漂移）
  const FU_W = shou ? 22 : 0;
  const benW = rows.reduce((m, r) => Math.max(m, dispWidth(r.ben)), 0);
  const bianW = rows.reduce((m, r) => Math.max(m, dispWidth(r.bian)), 0);

  for (const r of rows) {
    const cells: string[] = [padEndDisp(r.liuShen, 4)];
    if (shou) cells.push(padEndDisp(r.fu, FU_W));
    cells.push(padEndDisp(r.ben, benW));
    if (pan.bianGua) cells.push(padEndDisp(r.bian, bianW));
    lines.push(cells.join('  ').replace(/[ \t　]+$/g, ''));
  }

  // 仅清理行尾空格；列间对齐空格保留（金标准验收按空白归一比较，不受影响）。
  return lines.join('\n');
}

/** 屏幕视图模型：一爻一行（自上而下），UI 自行排版 */
export interface ScreenLine {
  position: number;
  positionName: string;
  liuShen: BenYao['liuShen'];
  hidden?: {
    /** 组合名，如"官鬼庚戌土"；真伏神位也有此名 */
    name: string;
    liuQin: LiuQin;
    gan: TianGan;
    zhi: DiZhi;
    wuXing: BenYao['wuXing'];
    yinYang?: '阴' | '阳';
    shiYing?: '世' | '应';
    /** 真伏神：只有名字、无爻线无本宫世应 */
    isTrueFuShen: boolean;
  };
  ben: {
    /** 组合名，如"官鬼庚戌土" */
    name: string;
    liuQin: LiuQin;
    gan: TianGan;
    zhi: DiZhi;
    wuXing: BenYao['wuXing'];
    yinYang: '阴' | '阳';
    moving: boolean;
    dongMark?: '○' | 'Ｘ';
    shiYing?: '世' | '应';
  };
  bian?: {
    name: string;
    liuQin: LiuQin;
    gan: TianGan;
    zhi: DiZhi;
    wuXing: BenYao['wuXing'];
    yinYang: '阴' | '阳';
    shiYing?: '世' | '应';
  };
}

export interface ScreenViewModel {
  header: {
    gender: '男' | '女';
    question: string;
    solarText: string;
    ganZhiText: string;
    xunKong: [DiZhi, DiZhi];
    deGuaText: string;
    /** 本卦全名（如"雷火丰"） */
    benGuaName: string;
    /** 变卦全名（静卦为 undefined） */
    bianGuaName?: string;
  };
  benGua: Pan['benGua'];
  bianGua?: Pan['benGua'];
  lines: ScreenLine[]; // 自上而下
  shenSha: Pan['shenSha'];
  fuShenList: Pan['fuShenList'];
}

const POS_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];

export function formatScreen(pan: Pan, options: FormatOptions = {}): ScreenViewModel {
  const showHidden = options.showHidden ?? true;
  const shou = showHidden ? getShouGuaPan(pan.benGua.gong) : undefined;
  const fuAt = new Map(pan.fuShenList.map((f) => [f.position, f]));

  const lines: ScreenLine[] = [];
  for (let position = 6; position >= 1; position--) {
    const i = position - 1;
    const ben = pan.yaoList[i];
    const bian = pan.bianYaoList?.[i];
    const fu = fuAt.get(position);
    const sy = shou?.yaoList[i];

    lines.push({
      position,
      positionName: POS_NAMES[i],
      liuShen: ben.liuShen,
      hidden: shou
        ? fu
          ? {
              name: qinGanZhi(fu.liuQin, fu.gan, fu.zhi),
              liuQin: fu.liuQin, gan: fu.gan, zhi: fu.zhi, wuXing: fu.wuXing,
              isTrueFuShen: true,
            }
          : {
              name: qinGanZhi(sy!.liuQin, sy!.gan, sy!.zhi),
              liuQin: sy!.liuQin, gan: sy!.gan, zhi: sy!.zhi, wuXing: sy!.wuXing,
              yinYang: sy!.yinYang, shiYing: sy!.shiYing, isTrueFuShen: false,
            }
        : undefined,
      ben: {
        name: qinGanZhi(ben.liuQin, ben.gan, ben.zhi),
        liuQin: ben.liuQin, gan: ben.gan, zhi: ben.zhi, wuXing: ben.wuXing,
        yinYang: ben.yinYang, moving: ben.moving,
        dongMark: ben.moving ? (ben.yinYang === '阳' ? '○' : 'Ｘ') : undefined,
        shiYing: ben.shiYing,
      },
      // 视图模型里变卦块只在真正变化的动爻行出现（非动爻无变爻）
      bian:
        bian && pan.bianGua && ben.moving
          ? {
              name: pan.bianGua.name,
              liuQin: bian.liuQin, gan: bian.gan, zhi: bian.zhi, wuXing: bian.wuXing,
              yinYang: bian.yinYang, shiYing: bian.shiYing,
            }
          : undefined,
    });
  }

  const s = pan.solar;
  const z = pan.siZhu;
  return {
    header: {
      gender: pan.gender,
      question: pan.question,
      solarText: `${s.year}年 ${s.month}月 ${s.day}日 ${s.hour}时 ${s.minute}分`,
      ganZhiText: `${z.yearGanZhi}年 ${z.monthGanZhi}月 ${z.dayGanZhi}日 ${z.timeGanZhi}时`,
      xunKong: pan.xunKong,
      deGuaText: pan.bianGua ? `得${pan.benGua.name}之${pan.bianGua.name}` : `得${pan.benGua.name}`,
      benGuaName: pan.benGua.name,
      bianGuaName: pan.bianGua?.name,
    },
    benGua: pan.benGua,
    bianGua: pan.bianGua,
    lines,
    shenSha: pan.shenSha,
    fuShenList: pan.fuShenList,
  };
}
