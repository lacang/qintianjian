// v2b 信号分类器（修正：世爻侧补「休」，与生产 235/236 规格一致）
// v2 信号分类器：在 v1（旺衰、合冲）基础上新增
//   ① 回头生/回头克「用神持世」条件性归组（非持世/不同爻/不同因素绝不并）；
//   ② v2 新发现：health 域通用块(237/238) 与 health 专项块(327/328) 对同一世爻同一动变各计一次。
// 一条信号可属多个候选组（groups 数组），是否真并由 groupActive 结合盘面判定。
// 实验专用，只读生产代码。

const G_SHI_WANG = 'G_SHI_WANG'; // 用神月建旺衰 ↔ 世爻月建旺衰（用神持世才并）
const G_CHONG    = 'G_CHONG';    // 世应相冲 ↔ 六冲卦（love，且真共现）
const G_HE       = 'G_HE';       // 世应相合 ↔ 六合卦（love，且真共现）
const G_HT_KE    = 'G_HT_KE';    // 用神回头克 ↔ 世爻回头克（用神持世、非 health 才并）
const G_HT_SHENG = 'G_HT_SHENG'; // 用神回头生 ↔ 世爻回头生（用神持世、非 health 才并）
const G_HC_KE    = 'G_HC_KE';    // health：通用世爻回头克(237) ↔ 专项回头克(327)
const G_HC_SHENG = 'G_HC_SHENG'; // health：通用世爻回头生(238) ↔ 专项回头生(328)

export function classifySignal(s) {
  const t = s.text || '';
  const R = (sid, groups, extra={}) => ({ sid, groups, ...extra });

  // 合冲
  if (t.startsWith('本卦是六冲卦')) return R('liuchonggua', [G_CHONG]);
  if (t.startsWith('本卦是六合卦')) return R('liuhegua', [G_HE]);
  if (t.startsWith('世应相冲')) return R('shiyingchong', [G_CHONG]);
  if (t.startsWith('世应相合')) return R('shiyinghe', [G_HE]);

  // 月建旺衰
  if (t.includes('得月令之气')) return R('yongwang', [G_SHI_WANG], { factor:'yong' });
  if (t.includes('月令休态'))   return R('yongxiu', [G_SHI_WANG], { factor:'yong' });
  if (t.includes('被月令'))     return R('yongshuai', [G_SHI_WANG], { factor:'yong' });
  if (/^世爻[旺相]于月/.test(t)) return R('shiwang', [G_SHI_WANG], { factor:'shi' });
  if (/^世爻[休囚死]于月/.test(t)) return R('shishuai', [G_SHI_WANG], { factor:'shi' });

  // 回头克
  if (t.includes('却被变爻回头克')) return R('yonghuike', [G_HT_KE], { factor:'yong' });       // 202
  if (t.startsWith('用神动化回头克')) return R('yonghuike2', [G_HT_KE], { factor:'yong' });     // 389 行人
  if (/^世爻动化回头克——/.test(t)) return R('shihuike', [G_HT_KE, G_HC_KE], { factor:'shi' });  // 237 通用
  if (t.startsWith('世爻动化回头克、或化官鬼')) return R('shihuike_health', [G_HC_KE], { factor:'health' }); // 327

  // 回头生
  if (t.includes('反过来生它（回头生）')) return R('yonghuisheng', [G_HT_SHENG], { factor:'yong' }); // 201
  if (t.startsWith('世爻动化回头生，行动有人帮')) return R('shihuisheng', [G_HT_SHENG, G_HC_SHENG], { factor:'shi' }); // 238
  if (t.startsWith('世爻动化回头生，得生得救')) return R('shihuisheng_health', [G_HC_SHENG], { factor:'health' });     // 328

  // 明确独立、不归组（记录在案，防止误并）
  if (t.includes('临帝旺')) return R('diwang', []);
  if (t.includes('逢长生')) return R('changsheng', []);
  if (t.includes('双双旺动相生')) return R('guanfu', []);
  if (t.startsWith('官星旺动')) return R('guandong', []);
  if (t.includes('六冲变六合') || t.includes('六合变六冲')) return R('chonghebian', []);
  return R('other', []);
}

export function groupActive(group, members, ctx) {
  if (group === G_SHI_WANG) {
    return ctx.yongHoldsShi
      && members.some((m) => m._cls.factor === 'yong')
      && members.some((m) => m._cls.factor === 'shi');
  }
  if (group === G_CHONG) {
    if (ctx.domain !== 'love') return false;
    return members.some((m) => m._cls.sid === 'shiyingchong')
        && members.some((m) => m._cls.sid === 'liuchonggua');
  }
  if (group === G_HE) {
    if (ctx.domain !== 'love') return false;
    return members.some((m) => m._cls.sid === 'shiyinghe')
        && members.some((m) => m._cls.sid === 'liuhegua');
  }
  if (group === G_HT_KE || group === G_HT_SHENG) {
    if (!ctx.yongHoldsShi) return false;     // 用神不持世＝不同爻，独立保留
    if (ctx.domain === 'health') return false; // health 走 G_HC_* 专项，需专业判断不自动并入用神组
    return members.some((m) => m._cls.factor === 'yong')
        && members.some((m) => m._cls.factor === 'shi');
  }
  if (group === G_HC_KE || group === G_HC_SHENG) {
    if (ctx.domain !== 'health') return false;
    const target = group === G_HC_KE ? ['shihuike','shihuike_health'] : ['shihuisheng','shihuisheng_health'];
    return target.every((sid) => members.some((m) => m._cls.sid === sid));
  }
  return false;
}

// 激活组里保留谁为主信号：返回成员对象（其余被并）
export function pickPrimary(group, members) {
  if (group === G_SHI_WANG || group === G_HT_KE || group === G_HT_SHENG) {
    return members.find((m) => m._cls.factor === 'yong'); // 保留用神侧
  }
  if (group === G_CHONG) return members.find((m) => m._cls.sid === 'shiyingchong');
  if (group === G_HE) return members.find((m) => m._cls.sid === 'shiyinghe');
  if (group === G_HC_KE || group === G_HC_SHENG) {
    return members.find((m) => m._cls.factor === 'health'); // 保留 health 专项古法条，剔通用块
  }
  return members[0];
}

export const GROUPS = { G_SHI_WANG, G_CHONG, G_HE, G_HT_KE, G_HT_SHENG, G_HC_KE, G_HC_SHENG };
