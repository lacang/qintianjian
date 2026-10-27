// 实验算法（去重应用层）的共享实现：给定 orig 信号流 + 盘面上下文，算出各变体的分数与档位。
// 用途：① 供 tools/score-regression.mjs 逐盘现算基线（不依赖 30MB CSV 入库）；
//       ② 与 run-v2b.mjs 的离线统计保持同一实现，避免"报告一套、测试一套"。
// 只读生产代码，不修改任何规则。
import { classifySignal, groupActive, pickPrimary, GROUPS } from './classify-v2b.mjs';

const G = GROUPS;
const ALL_GROUPS = [G.G_SHI_WANG, G.G_CHONG, G.G_HE, G.G_HT_KE, G.G_HT_SHENG, G.G_HC_KE, G.G_HC_SHENG];

export const LEVEL_OF = (s) => (s >= 4 ? 2 : s >= 1 ? 1 : s <= -4 ? -2 : s <= -1 ? -1 : 0);
export const LEVEL_CN = { [-2]: '大凶', [-1]: '凶', 0: '平', 1: '吉', 2: '大吉' };

export const VARIANTS = {
  orig: { label: '原算法(对照)', groups: [], k: 0 },
  v1:   { label: '单项①用神持世旺衰归组', groups: [G.G_SHI_WANG], k: 0 },
  v2:   { label: '单项②世应合冲与卦象归组', groups: [G.G_CHONG, G.G_HE], k: 0 },
  v12:  { label: '提交A：①②（旺衰+合冲）', groups: [G.G_SHI_WANG, G.G_CHONG, G.G_HE], k: 0 },
  v3:   { label: '单项③用神持世回头生克归组', groups: [G.G_HT_KE, G.G_HT_SHENG], k: 0 },
  v4:   { label: '单项④health内部回头生克去重', groups: [G.G_HC_KE, G.G_HC_SHENG], k: 0 },
  vall: { label: '①②③④全部已确认重复项', groups: ALL_GROUPS, k: 0 },
  vfold:{ label: '折减k=0.5(仅敏感性·无古籍依据)', groups: ALL_GROUPS, k: 0.5 },
};

// signals: judgeNajia().signals（原算法信号流）；ctx: {domain, yongHoldsShi}
export function aggregate(signals, ctx, variant) {
  const cfg = VARIANTS[variant];
  const tagged = signals.map((s) => ({ ...s, _cls: classifySignal(s) }));
  if (variant === 'orig') { const sc = tagged.reduce((a, s) => a + s.w, 0); return { score: sc, level: LEVEL_OF(sc), cut: [], cutIdx: [], cutGroups: [] }; }
  const byGroup = new Map();
  for (const s of tagged) {
    for (const g of (s._cls.groups || [])) {
      if (!cfg.groups.includes(g)) continue;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(s);
    }
  }
  const cut = new Set(); const cutGroups = []; const cutIdx = [];
  for (const [g, members] of byGroup) {
    if (!groupActive(g, members, ctx)) continue;
    const primary = pickPrimary(g, members);
    let didCut = false;
    for (const m of members) if (m !== primary) { cut.add(m); cutIdx.push(tagged.indexOf(m)); didCut = true; }
    if (didCut) cutGroups.push(g);
  }
  let score = 0;
  for (const s of tagged) score += cut.has(s) ? (cfg.k === 0.5 ? s.w * 0.5 : 0) : s.w;
  return { score, level: LEVEL_OF(score), cut: [...cut].map((s) => s._cls.sid), cutIdx: cutIdx.sort((a, b) => a - b), cutGroups: [...new Set(cutGroups)] };
}
