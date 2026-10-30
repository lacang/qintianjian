// 信号分类器：给 verdict.js 产出的每条 signal 打稳定 sid 与证据组 group。
// 只用源码中该条信号独有的短词匹配，避免错分。仅用于实验归因，不碰生产代码。
// group 非空者＝进入"重复证据归组"候选；是否真重复还要结合盘面条件（cond）。

// A 类已确认重复组
const G_SHI_WANG = 'G_SHI_WANG'; // 用神月建旺衰 ↔ 世爻月建旺衰（条件：用神持世）
const G_HECHONG   = 'G_HECHONG'; // 世应相冲/合 ↔ 六冲/六合卦（条件：love 且两者共现，即八纯/六合卦）

export function classifySignal(s, ctx) {
  const t = s.text || '';
  // ---------- A 类相关 ----------
  if (t.startsWith('本卦是六冲卦')) return { sid: 'liuchonggua', group: G_HECHONG };
  if (t.startsWith('本卦是六合卦')) return { sid: 'liuhegua', group: G_HECHONG };
  if (t.startsWith('世应相冲')) return { sid: 'shiyingchong', group: G_HECHONG };
  if (t.startsWith('世应相合')) return { sid: 'shiyinghe', group: G_HECHONG };
  // 用神本体月建旺衰
  if (t.includes('得月令之气')) return { sid: 'yongwang', group: G_SHI_WANG, factor: 'yong' };
  if (t.includes('月令休态')) return { sid: 'yongxiu', group: G_SHI_WANG, factor: 'yong' };
  if (t.includes('被月令')) return { sid: 'yongshuai', group: G_SHI_WANG, factor: 'yong' };
  // 世爻自身月建旺衰
  if (/^世爻[旺相]于月/.test(t)) return { sid: 'shiwang', group: G_SHI_WANG, factor: 'shi' };
  if (/^世爻[囚死]于月/.test(t)) return { sid: 'shishuai', group: G_SHI_WANG, factor: 'shi' };

  // ---------- B 类相关但独立（记录、不归组） ----------
  if (t.includes('临帝旺')) return { sid: 'diwang', group: null };
  if (t.includes('逢长生')) return { sid: 'changsheng', group: null };
  if (t.includes('双双旺动相生')) return { sid: 'guanfu', group: null };
  if (t.startsWith('官星旺动')) return { sid: 'guandong', group: null };
  return { sid: 'other', group: null };
}

// 判断某条信号的组在当前盘面是否"真重复成立"
// members: 同组全部命中信号；ctx: { yongHoldsShi: 选中用神是否持世, domain }
export function groupActive(group, members, ctx) {
  if (group === G_SHI_WANG) {
    // 必须同盘同时有用神旺衰信号和世爻旺衰信号，且选中用神持世
    const hasYong = members.some((m) => m._cls.factor === 'yong');
    const hasShi = members.some((m) => m._cls.factor === 'shi');
    return ctx.yongHoldsShi && hasYong && hasShi;
  }
  if (group === G_HECHONG) {
    // love 域。实测：八纯卦世应 8/8 固定相冲（LIU_CHONG_GUA 名⇒世应必冲）；
    // 六合卦仅 5/8 世应相合（火地晋/山雷颐/地泽临世应非合非冲），故合侧须真共现才并。
    if (ctx.domain !== 'love') return false;
    const chong = members.some((m) => m._cls.sid === 'shiyingchong');
    const chongGua = members.some((m) => m._cls.sid === 'liuchonggua');
    const he = members.some((m) => m._cls.sid === 'shiyinghe');
    const heGua = members.some((m) => m._cls.sid === 'liuhegua');
    return (chong && chongGua) || (he && heGua);
  }
  return false;
}

export const GROUPS = { G_SHI_WANG, G_HECHONG };
