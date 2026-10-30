// AI 协作资料包（v123）—— 把"钦天监已经算好的结果"组织成一份可直接交给外部大模型的资料。
//
// 设计铁律（2026-10-26 主人定，见 v123 规划与审计报告修正）：
//   1) 不要让 AI 重新计算已经由钦天监正确计算出来的结果 —— 排盘事实与程序分析原样交付。
//   2) 计算事实（facts）与依规则生成的判断（rule_based_judgments）必须分层，后者不得包装成客观事实。
//   3) 古籍原文（classic_quote）/ 整理解释（rule_digest）/ 自建惯例（convention）三者必须可区分。
//   4) 资料状态四态：available / not_applicable / not_included / unverified，不靠自由文本描述。
//   5) 单一数据源：buildAiPack() 产出唯一对象，文本渲染与 JSON 序列化都从它读，不二次读原始数据。
//   6) 资料包 schema 版本与复现码 RULE_VERSION 各自独立演进，不互相绑定。
//
// 本模块是纯函数：不 import 任何业务模块、不读 DOM、不联网、不留存。Node 与浏览器同构。
// 输入由调用方准备（浏览器里是排盘后的对象，Node 里是样例脚本构造的对象）。

/** 资料包 schema 版本。与 sharecode 的 RULE_VERSION 无关，独立递增。 */
export const AI_PACK_SCHEMA_VERSION = 1;

/** 资料状态四态。 */
export const STATUS = {
  /** 数据存在且已提供 */
  AVAILABLE: 'available',
  /** 该术数/该盘本身没有这一类数据 —— 不是缺陷，不提示缺失 */
  NOT_APPLICABLE: 'not_applicable',
  /** 数据存在，但当前模式没有包含 —— 明确提示用户可切换模式获取 */
  NOT_INCLUDED: 'not_included',
  /** 数据存在，但来源或准确性尚未核实 —— 输出时附带核验状态 */
  UNVERIFIED: 'unverified',
};

/** 三种模式。区别在于"要解决什么问题"，不是"资料包大小"。 */
export const MODES = {
  /** 我想快速理解这一盘：精简事实 + 核心结论 + 少量关键依据 */
  QUICK: 'quick',
  /** 我想知道传统规则如何推导：完整事实 + 程序分析 + 相关规则和原文 */
  CLASSIC: 'classic',
  /** 我想研究不同规则之间的关系：完整资料 + 多问事域对照 + 规则适用条件 + 资料缺口 */
  RESEARCH: 'research',
};

export const MODE_META = {
  quick: { id: 'quick', name: '快速解读', goal: '我想快速理解这一盘' },
  classic: { id: 'classic', name: '古法推演', goal: '我想知道传统规则如何推导' },
  research: { id: 'research', name: '深度研究', goal: '我想研究不同规则之间的关系' },
};

const MODE_ALIAS = {
  quick: 'quick', fast: 'quick', 快速: 'quick', 快速解读: 'quick',
  classic: 'classic', classical: 'classic', 古法: 'classic', 古法推演: 'classic',
  research: 'research', deep: 'research', 深度: 'research', 深度研究: 'research',
};

function normMode(mode) {
  const m = MODE_ALIAS[String(mode || '').trim()] || MODE_ALIAS[String(mode || '').trim().toLowerCase()];
  if (!m) throw new Error(`未知模式「${mode}」，只支持 quick / classic / research`);
  return m;
}

/** 统一把 state 的 tags 数组压成一行可读串。 */
function tagsOf(state) {
  return Array.isArray(state?.tags) && state.tags.length ? state.tags.join('、') : '—';
}

/** 爻位中文名（初/二/三/四/五/上）。 */
const POS_CN = ['初', '二', '三', '四', '五', '上'];

/**
 * 神煞中文名。键与 liuyao-core 的 ShenSha 接口一一对应。
 * 注意 guiRen 是「天乙贵人」（按日干），tianYi 是「天医」（按月建退一位），两者不是一回事。
 */
const SHEN_SHA_NAMES = {
  yiMa: '驿马',
  taoHua: '桃花',
  riLu: '日禄',
  guiRen: '天乙贵人',
  wenChang: '文昌',
  yangRen: '羊刃',
  jiangXing: '将星',
  mouXing: '谋星',
  jieSha: '劫煞',
  zaiSha: '灾煞',
  huaGai: '华盖',
  riDe: '日德',
  tianMa: '天马',
  tianYi: '天医',
};

/**
 * 神煞取值存疑项。
 * 依据 liuyao-core/src/shensha.ts 的显式 TODO：天马按「月建本位」取值，
 * 与通行月马/天马口诀均不同，仅有单一真实盘数据点，尚未经其他月份复核。
 * 这类值必须标 unverified，不能和已核实的计算事实混在一起。
 */
const SHEN_SHA_UNVERIFIED = {
  tianMa: '天马按「月建本位」取值，与通行月马口诀不同；源码标注待补其他月份真实盘确认，当前仅有单点校验。',
};

// ---------------------------------------------------------------------------
// 六爻
// ---------------------------------------------------------------------------

/**
 * 六爻资料包。
 * @param {object} ctx
 * @param {object} ctx.pan        paipan() 的返回
 * @param {object} ctx.najia      analyzeNajia() 的返回
 * @param {object} [ctx.verdict]  judgeNajia() 的返回；没有则不输出判断层
 * @param {object} [ctx.reading]  getReadingDomain(id) 的返回
 * @param {object} [ctx.meta]     { appVersion, ruleVersion, reproCode, castAt, castMethod }
 * @param {string} mode
 */
function buildLiuyaoPack(ctx, mode) {
  const pan = ctx.pan;
  if (!pan) throw new Error('六爻资料包缺少 pan');
  const najia = ctx.najia || null;
  const verdict = ctx.verdict || null;
  const reading = ctx.reading || null;
  const meta = ctx.meta || {};

  // ---- chart_metadata：通用元数据（跨术数同构） ----
  const chartMetadata = {
    domain: 'liuyao',
    domain_name: '六爻纳甲',
    cast_at: meta.castAt || (pan.solar ? `${pan.solar.year}-${String(pan.solar.month).padStart(2, '0')}-${String(pan.solar.day).padStart(2, '0')} ${String(pan.solar.hour ?? '').padStart(2, '0')}:${String(pan.solar.minute ?? '').padStart(2, '0')}` : null),
    cast_method: meta.castMethod || null,
    question: pan.question && pan.question !== '未填写所占之事' ? pan.question : null,
    question_note: pan.question && pan.question !== '未填写所占之事' ? null : '用户未填写所占之事，资料包中不推断问题类型',
    gender: pan.gender || null,
    app_version: meta.appVersion || null,
    rule_version: meta.ruleVersion ?? null,
    repro_code: meta.reproCode || null,
    schema_version: AI_PACK_SCHEMA_VERSION,
    mode,
  };

  // ---- chart_data：排盘事实（任何模式都全量保留，精简模式也不改写） ----
  const lines = (pan.yaoList || []).map((y, i) => ({
    pos: y.position,
    pos_cn: POS_CN[y.position - 1],
    yin_yang: y.yinYang,
    moving: !!y.moving,
    liu_shen: y.liuShen,
    na_jia: `${y.gan}${y.zhi}`,
    wu_xing: y.wuXing,
    liu_qin: y.liuQin,
    shi_ying: y.position === pan.benGua.shiPosition ? '世' : (y.position === pan.benGua.yingPosition ? '应' : null),
  }));
  const bianLines = (pan.bianYaoList || []).map((y) => ({
    pos: y.position,
    yin_yang: y.yinYang,
    na_jia: `${y.gan}${y.zhi}`,
    wu_xing: y.wuXing,
    liu_qin: y.liuQin,
  }));

  const guaOf = (g) => g ? {
    name: g.name, upper: g.upper, lower: g.lower,
    palace: g.gong, palace_wu_xing: g.gongWuXing,
    shi_pos: g.shiPosition, ying_pos: g.yingPosition,
    shou_gua: g.shouGuaName,
    flags: [g.isYouHun && '游魂', g.isGuiHun && '归魂', g.isBaChun && '八纯'].filter(Boolean),
  } : null;

  const chartData = {
    si_zhu: pan.siZhu ? { ...pan.siZhu } : null,
    xun_kong: pan.xunKong || [],
    gua_shen: pan.guaShen || null,
    ben_gua: guaOf(pan.benGua),
    bian_gua: guaOf(pan.bianGua),
    moving_positions: pan.movingPositions || [],
    lines,
    bian_lines: bianLines.length ? bianLines : null,
    fu_shen: (pan.fuShenList || []).length ? pan.fuShenList : null,
    shen_sha: pan.shenSha
      ? Object.entries(pan.shenSha).map(([k, v]) => ({
        key: k,
        name: SHEN_SHA_NAMES[k] || k,
        value: Array.isArray(v) ? v.join('/') : v,
        status: SHEN_SHA_UNVERIFIED[k] ? STATUS.UNVERIFIED : STATUS.AVAILABLE,
        note: SHEN_SHA_UNVERIFIED[k] || null,
      }))
      : null,
  };

  // ---- computed_analysis.facts：程序计算的分析事实（可确定验证） ----
  let facts = null;
  let factsStatus = STATUS.NOT_APPLICABLE;
  if (najia) {
    factsStatus = STATUS.AVAILABLE;
    // 兼容两种输入：occurrence（有 naJia）与 DongYao（纳甲在 yao 里）
    const occ = (o) => ({
      pos: o.pos,
      pos_cn: POS_CN[o.pos - 1],
      na_jia: o.naJia || (o.yao ? `${o.yao.gan}${o.yao.zhi}` : ''),
      liu_qin: o.liuQin,
      liu_shen: o.liuShen,
      shi_ying: o.shi ? '世' : (o.ying ? '应' : null),
      hidden: !!o.hidden,
      wang_shuai: {
        ling_tai: o.state?.lingTai,
        month_role: o.state?.monthRole,
        day_role: o.state?.riRole,
        tags: o.state?.tags || [],
      },
    });
    const ysKey = reading?.name ? null : null; // 占位，实际用 najia.yongshen 的键
    const ysDomains = Object.keys(najia.yongshen || {});
    const activeYs = pickYongshen(najia, reading, verdict);
    facts = {
      month_zhi: najia.meta?.monthZhi,
      day_zhi: najia.meta?.dayZhi,
      xun_kong: najia.meta?.xunKong || [],
      palace: najia.meta?.gong,
      palace_wu_xing: najia.meta?.gongWuXing,
      shi: najia.shi?.occ ? occ(najia.shi.occ) : null,
      ying: najia.ying?.occ ? occ(najia.ying.occ) : null,
      dong: (najia.dong || []).map((d) => ({
        ...occ(d),
        bian: d.bian ? { pos: d.bian.position, na_jia: `${d.bian.gan}${d.bian.zhi}`, liu_qin: d.bian.liuQin, wu_xing: d.bian.wuXing } : null,
        hua_note: [
          d.state?.huaTouSheng && '化回头生',
          d.state?.huaTouKe && '化回头克',
          d.state?.huaJin && '化进',
          d.state?.huaTui && '化退',
        ].filter(Boolean).join('、') || null,
      })),
      relations: (najia.relations || []).map((r) => ({ from: r.from, to: r.to, rel: r.rel, desc: r.desc })),
      yongshen: activeYs ? {
        domain: activeYs.domain,
        primary: activeYs.primary || [],
        use_ying: !!activeYs.useYing,
        occurrences: (activeYs.occurrences || []).map(occ),
        note: activeYs.note || null,
        yuan_shen: activeYs.yuanShen || null,
        ji_shen: activeYs.jiShen || null,
        chou_shen: activeYs.chouShen || null,
      } : null,
      yongshen_domains_available: ysDomains,
      shi_state: najia.shiState ? { ling_tai: najia.shiState.lingTai, tags: najia.shiState.tags || [] } : null,
    };
    if (ysKey) facts.ys_key = ysKey;
  }

  // ---- computed_analysis.rule_based_judgments：程序依规则生成的判断 ----
  let judgments = null;
  let judgmentStatus = STATUS.NOT_APPLICABLE;
  if (verdict) {
    judgmentStatus = STATUS.AVAILABLE;
    const sig = (verdict.signals || []).map((s) => ({
      weight: s.w,
      text: s.text,
      source: s.src,
      rule: s.rule ? { id: s.rule.id, book: s.rule.book, gu: s.rule.gu, hua: s.rule.hua } : null,
    }));
    // 模式裁剪：快速模式只留权重最高的 3 条，古法/研究全留
    const kept = mode === MODES.QUICK ? sig.slice().sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 3) : sig;
    judgments = {
      level: verdict.level,
      score: verdict.score,
      headline: verdict.headline,
      takeaway: verdict.takeaway,
      timing: verdict.timing || null,
      yong_shen_name: verdict.ysName || null,
      domain_name: verdict.domainName || null,
      dong_count: verdict.dongCount ?? null,
      signals: kept,
      signals_total: sig.length,
      signals_omitted: sig.length - kept.length,
      basis_note: 'level / score / headline 是钦天监现有判断逻辑（《增删卜易》《卜筮正宗》通行规则）的输出，不是经独立验证的预测准确率。',
    };
  }

  // ---- source_materials：原文 / 整理 / 自建惯例，三者 kind 严格区分 ----
  const sourceMaterials = [];
  const seenRule = new Set();
  for (const s of (judgments?.signals || [])) {
    const r = s.rule;
    if (!r || !r.id || seenRule.has(r.id)) continue;
    seenRule.add(r.id);
    sourceMaterials.push({
      kind: 'rule_digest',
      id: r.id,
      book: r.book,
      text: r.hua || '',
      original: r.gu || '',
      note: '规则原文（original）与白话解释（text）均为钦天监代码内置，出处到书名篇目；未与纸本逐字校勘。',
    });
  }
  // 问事域引文：古法/研究模式全给，快速模式只给前 2 条
  const classicsAll = Array.isArray(reading?.classics) ? reading.classics : [];
  const classicsKept = mode === MODES.QUICK ? classicsAll.slice(0, 2) : classicsAll;
  for (const q of classicsKept) {
    sourceMaterials.push({ kind: 'classic_quote', text: q.text, source: q.source });
  }
  const classicsOmitted = classicsAll.length - classicsKept.length;

  // ---- 深度研究模式：附其他问事域的用神对照（不塞无关古籍，只给取用差异） ----
  let domainComparison = null;
  let researchStatus = STATUS.NOT_INCLUDED;
  if (mode === MODES.RESEARCH && najia?.yongshen) {
    researchStatus = STATUS.AVAILABLE;
    domainComparison = Object.entries(najia.yongshen).map(([name, v]) => ({
      domain: name,
      primary: v.primary || [],
      use_ying: !!v.useYing,
      in_chart: (v.occurrences || []).map((o) => `${POS_CN[o.pos - 1]}爻${o.liuQin}(${o.naJia})`),
      note: v.note || null,
    }));
  }

  // ---- zhouyi_text：本卦/变卦的《周易》经传原文（仅 classic / research）----
  // 只组织调用方传入的经传查询结果，本模块不 import vendor、不做查询。
  // 严格三分经文/彖传/大象传；不塞白话解释、不塞 64 卦全文；缺失字段一律 null，不补写。
  let zhouyiText = null;
  let zhouyiStatus = STATUS.NOT_INCLUDED;
  if (mode !== MODES.QUICK && ctx.zhouyi) {
    const zy = ctx.zhouyi;
    const entryOf = (g) => (g ? {
      name: g.name || null,
      gua_ci: g.judgment ?? null,      // 经文（卦辞）
      tuan_zhuan: g.tuan ?? null,       // 彖传
      da_xiang: g.daxiang ?? null,      // 大象传
      source_location: g.sourceLocation || null,
    } : null);
    zhouyiText = {
      source: {
        title: '周易正义',
        edition: (zy.meta && zy.meta.edition) || '十三经注疏系统本（阮元校刻《周易正义》）',
        text_type: '经文（卦辞）/ 彖传 / 大象传；只收原文，不含白话解释',
      },
      ben_gua: entryOf(zy.ben) || null,
      bian_gua: entryOf(zy.bian) || null,
    };
    zhouyiStatus = STATUS.AVAILABLE;
  }

  // ---- 层状态与缺口 ----
  const layerStatus = {
    chart_data: STATUS.AVAILABLE,
    'computed_analysis.facts': factsStatus,
    'computed_analysis.rule_based_judgments': judgmentStatus,
    source_materials: sourceMaterials.length ? STATUS.AVAILABLE : STATUS.NOT_APPLICABLE,
    zhouyi_text: zhouyiStatus,
    domain_comparison: researchStatus,
    reading_domain: reading ? STATUS.AVAILABLE : STATUS.NOT_APPLICABLE,
  };
  const dataGaps = [];
  if (classicsOmitted > 0) dataGaps.push({ layer: 'source_materials', status: STATUS.NOT_INCLUDED, detail: `快速模式只附前 ${classicsKept.length} 条问事域引文，另有 ${classicsOmitted} 条可用「古法推演」模式获取` });
  if (researchStatus === STATUS.NOT_INCLUDED) dataGaps.push({ layer: 'domain_comparison', status: STATUS.NOT_INCLUDED, detail: '其他问事域的用神对照仅在「深度研究」模式提供' });
  if (mode === MODES.QUICK) dataGaps.push({ layer: 'zhouyi_text', status: STATUS.NOT_INCLUDED, detail: '本卦/变卦的《周易》经传原文（卦辞/彖传/大象传）仅在「古法推演」「深度研究」模式提供' });
  if (zhouyiText && !zhouyiText.bian_gua) dataGaps.push({ layer: 'zhouyi_text.bian_gua', status: STATUS.NOT_APPLICABLE, detail: '本盘无动爻，没有变卦，故无变卦经传；不是资料缺失' });
  if (zhouyiText && zhouyiText.ben_gua) {
    const miss = [];
    for (const [k, label] of [['gua_ci', '卦辞'], ['tuan_zhuan', '彖传'], ['da_xiang', '大象传']]) {
      if (!zhouyiText.ben_gua[k]) miss.push(label);
      if (zhouyiText.bian_gua && !zhouyiText.bian_gua[k]) miss.push(`变卦${label}`);
    }
    if (miss.length) dataGaps.push({ layer: 'zhouyi_text', status: STATUS.UNVERIFIED, detail: `以下经传字段在所选底本中未取到，已置 null，不得自行补写：${miss.join('、')}` });
  }
  if (judgments && judgments.signals_omitted > 0) dataGaps.push({ layer: 'computed_analysis.rule_based_judgments', status: STATUS.NOT_INCLUDED, detail: `快速模式只附权重最高的 ${judgments.signals.length} 条依据，另有 ${judgments.signals_omitted} 条可用「古法推演」模式获取` });
  if (!verdict) dataGaps.push({ layer: 'computed_analysis.rule_based_judgments', status: STATUS.NOT_APPLICABLE, detail: '本盘未计算古法直断结论（未选择问事域）' });
  if (!pan.question || pan.question === '未填写所占之事') dataGaps.push({ layer: 'chart_metadata.question', status: STATUS.NOT_APPLICABLE, detail: '用户未填写所问之事，问事域相关取用未纳入' });
  if (pan.shenSha && Object.keys(SHEN_SHA_UNVERIFIED).some((k) => k in pan.shenSha)) {
    dataGaps.push({
      layer: 'chart_data.shen_sha',
      status: STATUS.UNVERIFIED,
      detail: Object.entries(SHEN_SHA_UNVERIFIED).map(([k, why]) => `${SHEN_SHA_NAMES[k]}（${pan.shenSha[k]}）：${why}`).join('；'),
    });
  }

  return finalize({
    schema_version: AI_PACK_SCHEMA_VERSION,
    domain: 'liuyao',
    mode,
    mode_name: MODE_META[mode].name,
    question: chartMetadata.question,
    chart_metadata: chartMetadata,
    chart_data: chartData,
    computed_analysis: {
      facts,
      rule_based_judgments: judgments,
      domain_comparison: domainComparison,
    },
    zhouyi_text: zhouyiText,
    source_materials: sourceMaterials,
    reading_domain: reading ? { id: reading.id, name: reading.name, hint: reading.hint || null, focus: reading.focus || null, yong_shen: reading.yongShen || null } : null,
    layer_status: layerStatus,
    data_gaps: dataGaps,
    interpretation_constraints: liuyaoConstraints(mode),
    user_task: userTaskOf('liuyao', mode),
  });
}

/** 按问事域名/verdict 里报出的用神名，挑出"本次这一盘"的用神对象。 */
function pickYongshen(najia, reading, verdict) {
  const ys = najia?.yongshen;
  if (!ys) return null;
  // 1) 优先按 reading 域名的中文简称匹配（求财→财运、事业学业→事业…）
  const nameMap = {
    wealth: '财运', career: '事业', love: '感情', health: '疾病',
    decision: '其他', life: '其他', people: '行人', lost: '失物',
  };
  const byId = reading?.id ? nameMap[reading.id] : null;
  if (byId && ys[byId]) return { domain: byId, ...ys[byId] };
  // 2) 退而按 verdict 报出的用神名反查
  const want = String(verdict?.ysName || '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
  for (const [name, v] of Object.entries(ys)) {
    const primary = v.primary || [];
    if (want.length && want.every((w) => primary.includes(w))) return { domain: name, ...v };
  }
  // 3) 兜底
  return ys['其他'] ? { domain: '其他', ...ys['其他'] } : null;
}

function liuyaoConstraints(mode) {
  const base = [
    '以下排盘结果已由钦天监程序按固定规则计算，请直接采用，不要重新排盘，也不要自行重算旺衰、用神、世应或动变。',
    'source_materials 中 kind=classic_quote 是古籍原文，kind=rule_digest 是整理后的白话解释（original 字段才是原文），kind=convention 是钦天监自建的惯例值。引用时必须区分，不得把整理层或惯例值当作古籍原文。',
    'layer_status 标为 not_included 的层是当前模式未包含（可切换模式获取），标为 not_applicable 是本盘本身没有这一类数据，二者都不等于资料缺失。',
    '不得将未经提供或未经确认的规则冒充典籍原文；如果资料不足，请明确指出。',
  ];
  if (mode === MODES.QUICK) base.push('本模式只给精简依据，请不要据少量依据推翻 facts 里的计算结果。');
  if (mode !== MODES.QUICK) {
    base.push('zhouyi_text 给的是《周易》经传原文（卦辞/彖传/大象传），属于卦义文本，与六爻纳甲的用神、旺衰、世应、动变不是同一套推演体系：可以借它理解本卦/变卦的卦义，但不得把卦辞或彖象直接当作纳甲断吉凶的规则，也不得据此改写 computed_analysis 里的纳甲结论。');
    base.push('zhouyi_text 只收阮刻《周易正义》系统本原文，未提供白话翻译；字段为 null 处表示底本无此条或本盘不适用，不要自行补写或用记忆中的其他版本替换。');
  }
  if (mode === MODES.RESEARCH) base.push('研究模式要求说明每条规则的适用条件与彼此冲突时的取舍理由，不要为了内容丰富而引入未提供的典籍。');
  return base;
}

// ---------------------------------------------------------------------------
// 塔罗
// ---------------------------------------------------------------------------

/**
 * 塔罗资料包。
 * @param {object} ctx
 * @param {object} ctx.deck       getDeck(id) 的返回
 * @param {object} ctx.spread     getSpread(id) 的返回
 * @param {Array}  ctx.drawn      [{ id, rev }]，按落位顺序
 * @param {object} [ctx.verdict]  { score, level, text, desc }
 * @param {object} [ctx.meta]     { appVersion, question, drawnAt, reversalUsed }
 * @param {string} mode
 */
function buildTarotPack(ctx, mode) {
  const deck = ctx.deck;
  const spread = ctx.spread;
  const drawn = ctx.drawn;
  if (!deck || !spread || !Array.isArray(drawn)) throw new Error('塔罗资料包缺少 deck / spread / drawn');
  const meta = ctx.meta || {};
  const byId = new Map((deck.cards || []).map((c) => [c.id, c]));

  const chartMetadata = {
    domain: 'tarot',
    domain_name: '塔罗',
    cast_at: meta.drawnAt || null,
    question: meta.question || null,
    question_note: meta.question ? null : '用户未填写所问之事',
    deck_id: deck.id,
    deck_name: deck.name,
    deck_license: deck.license || null,
    spread_id: spread.id,
    spread_name: spread.name,
    reversal_used: meta.reversalUsed !== false,
    app_version: meta.appVersion || null,
    repro_code: meta.reproCode || null,
    schema_version: AI_PACK_SCHEMA_VERSION,
    mode,
  };

  // chart_data：牌面事实
  const positions = spread.positions || [];
  const cards = drawn.map((d, i) => {
    const c = byId.get(d.id) || null;
    const p = positions[i] || null;
    return {
      index: i + 1,
      position_label: p?.label || `第 ${i + 1} 张`,
      position_meaning: p?.meaning || null,
      card_id: d.id,
      name: c?.name || d.id,
      name_alt: c?.nameAlt || null,
      group: c?.group || null,
      label: c?.label || null,
      reversed: !!d.rev,
      image: c?.image || null,
    };
  });

  const chartData = {
    deck: { id: deck.id, name: deck.name, license: deck.license || null, source: deck.source || null },
    spread: { id: spread.id, name: spread.name, intro: spread.intro || null, positions: positions.map((p) => ({ label: p.label, meaning: p.meaning })) },
    cards,
  };

  // facts：牌义（自建整理层）+ 原文（classic_quote），两者分开。
  // 三种模式的差别不是「字段多少」，而是回答的问题不同：
  //   quick    只回答「这一张牌在这个位置上说什么」→ 只给本张牌实际正逆位那一套牌义
  //   classic  回答「牌义与原文各自怎么说」     → 正位/逆位两套都给，便于核对取用
  //   research 回答「两套读法差在哪、位置如何相互作用」→ 另加正逆位对照与牌阵全位
  const quickMode = mode === MODES.QUICK;
  const facts = {
    card_count: cards.length,
    reversal_used: meta.reversalUsed !== false,
    cards: cards.map((c) => {
      const src = byId.get(c.card_id);
      const m = src?.meaning || null;
      const base = {
        index: c.index,
        position_label: c.position_label,
        card: c.name,
        card_alt: c.name_alt,
        reversed: c.reversed,
        scene: m?.scene || null,
        keywords: m?.keywords || [],
        meaning_nature: 'rule_digest',
        meaning_note: '画面 / 关键词 / 正逆位牌义是钦天监自建的中性整理层，不是古籍原文。',
        classic_source: m?.classicSource || null,
        classic_text: m?.classicText || null,
      };
      if (quickMode) {
        base.meaning_current = c.reversed ? (m?.reversed || []) : (m?.upright || []);
        base.meaning_current_note = `按本张牌实际${c.reversed ? '逆' : '正'}位取用；另一套读法在「古法推演」模式提供`;
      } else {
        base.upright_meanings = m?.upright || [];
        base.reversed_meanings = m?.reversed || [];
      }
      return base;
    }),
  };

  // judgments：自建惯例值机械合参（明确标 convention）
  let judgments = null;
  let judgmentStatus = STATUS.NOT_APPLICABLE;
  if (ctx.verdict) {
    // 这一层是「存在且可用」的，只是性质为自建惯例（basis=convention），
    // 不是「未核验」，所以标 available，不能标 unverified。
    judgmentStatus = STATUS.AVAILABLE;
    judgments = {
      score: ctx.verdict.score ?? null,
      level: ctx.verdict.level ?? ctx.verdict.t ?? null,
      text: ctx.verdict.text ?? null,
      desc: ctx.verdict.desc ?? ctx.verdict.d ?? null,
      basis: 'convention',
      basis_note: '本倾向由钦天监按每张牌的惯例值（RWS_VAL）与逆位处理公式机械合参得出，是为"这一阵"给参考而编码的中性惯例值，不是某本古籍对每张牌的固定判决，也不是预测准确率。',
    };
  }

  const sourceMaterials = [];
  for (const c of facts.cards) {
    if (c.classic_text) {
      sourceMaterials.push({ kind: 'classic_quote', card: c.card, position: c.position_label, reversed: c.reversed, text: c.classic_text, source: c.classic_source });
    }
  }
  sourceMaterials.push({ kind: 'convention', id: 'rws_val', text: '每张牌的基础倾向值 +2/+1/0/-1（逆位按能量受阻处理）', source: '钦天监 tarotval_rws.js 自建惯例表', note: '不是古籍判决，仅用于机械合参给倾向。' });

  // research：正逆位读法对照 + 牌阵全位（含未抽到的位置）
  let reversalComparison = null;
  let spreadFull = null;
  if (mode === MODES.RESEARCH) {
    reversalComparison = facts.cards.map((c) => ({
      card: c.card,
      drawn_as: c.reversed ? '逆位' : '正位',
      upright_reading: c.upright_meanings || [],
      reversed_reading: c.reversed_meanings || [],
      note: '两套读法取自同一张牌的自建整理层；Waite 原书条目在同一段里并列正位与 Reversed 之后两说。',
    }));
    spreadFull = positions.map((p, i) => ({
      order: i + 1,
      label: p.label,
      meaning: p.meaning || null,
      drawn_card: cards[i] ? `${cards[i].name}${cards[i].reversed ? '（逆位）' : '（正位）'}` : null,
      drawn: !!cards[i],
    }));
  }

  const layerStatus = {
    chart_data: STATUS.AVAILABLE,
    'computed_analysis.facts': STATUS.AVAILABLE,
    'computed_analysis.rule_based_judgments': judgmentStatus,
    source_materials: sourceMaterials.length ? STATUS.AVAILABLE : STATUS.NOT_APPLICABLE,
    'computed_analysis.reversal_comparison': reversalComparison ? STATUS.AVAILABLE : STATUS.NOT_INCLUDED,
    'computed_analysis.spread_full': spreadFull ? STATUS.AVAILABLE : STATUS.NOT_INCLUDED,
  };
  const dataGaps = [];
  // 塔罗本身没有「按古法规则逐条推导」的判断层，这是术数性质，不是缺陷；
  // 实际提供的是自建惯例合参倾向（basis=convention），所以 layer_status 标 available、gap 标 not_applicable。
  dataGaps.push({
    layer: 'computed_analysis.rule_based_judgments.classic_rules',
    status: STATUS.NOT_APPLICABLE,
    detail: '塔罗没有"按古法规则逐条推导"的判断层（术数本身如此，不是资料缺失）；本层实际提供的是自建惯例合参倾向，性质见 basis=convention。',
  });
  if (mode === MODES.QUICK) {
    dataGaps.push({ layer: 'computed_analysis.facts.cards.upright_meanings', status: STATUS.NOT_INCLUDED, detail: '快速模式只给本张牌实际正逆位那一套牌义，另一套读法可用「古法推演」模式获取' });
  }
  if (mode !== MODES.RESEARCH) {
    dataGaps.push({ layer: 'computed_analysis.reversal_comparison', status: STATUS.NOT_INCLUDED, detail: '正逆位读法对照与牌阵全位仅在「深度研究」模式提供' });
  }
  if (!meta.question) dataGaps.push({ layer: 'chart_metadata.question', status: STATUS.NOT_APPLICABLE, detail: '用户未填写所问之事' });

  return finalize({
    schema_version: AI_PACK_SCHEMA_VERSION,
    domain: 'tarot',
    mode,
    mode_name: MODE_META[mode].name,
    question: chartMetadata.question,
    chart_metadata: chartMetadata,
    chart_data: chartData,
    computed_analysis: { facts, rule_based_judgments: judgments, reversal_comparison: reversalComparison, spread_full: spreadFull },
    source_materials: sourceMaterials,
    reading_domain: null,
    layer_status: layerStatus,
    data_gaps: dataGaps,
    interpretation_constraints: tarotConstraints(mode),
    user_task: userTaskOf('tarot', mode),
  });
}

function tarotConstraints(mode) {
  const meaningFields = mode === MODES.QUICK
    ? 'scene / keywords / meaning_current'
    : 'scene / keywords / upright_meanings / reversed_meanings';
  const base = [
    '以下牌阵与正逆位已由钦天监抽定，请直接采用，不要重新抽牌或改动牌位。',
    `facts.cards 里的 ${meaningFields} 是钦天监自建的中性整理层（kind=rule_digest），不是古籍原文；只有 classic_text 是 A.E. Waite《Pictorial Key to the Tarot》(1910) 原文。引用时必须区分。`,
    '本牌组的牌义不得套用到其他牌组（牌组身份见 chart_metadata.deck_id）。',
    'classic_text 是 Waite 原书条目，同一段里并列了正位与「Reversed:」之后两套说法；请按本张牌的实际正逆位取用对应那一套，不要把两套混讲。',
    '倾向值来自钦天监自建的惯例表（kind=convention），不是古籍判决，也不是命定；塔罗所示为当下之势与功课，取舍由人。',
    'layer_status 标为 not_applicable 的层是该术数本身没有这一类数据（如塔罗无古法逐条推导层），标为 not_included 是当前模式未包含，二者都不等于资料缺失。',
  ];
  if (mode === MODES.QUICK) base.push('本模式只给本张牌实际正逆位那一套牌义，请用少量关键牌说明趋势，不要逐张展开，也不要自行补出未提供的另一套读法。');
  if (mode === MODES.RESEARCH) base.push('研究模式请说明各牌在牌阵位置上的相互影响、同一张牌正逆两套读法的差异，以及自建牌义层与 Waite 原文之间可能存在的分歧。');
  return base;
}

// ---------------------------------------------------------------------------
// 三种模式的任务说明（交给外部模型的话）
// ---------------------------------------------------------------------------

function userTaskOf(domain, mode) {
  if (mode === MODES.QUICK) {
    return domain === 'liuyao'
      ? '请用 3–5 句话说清这一卦的基本情况：最关键的一两条依据是什么、倾向如何、最需要注意什么。不要逐条解释所有字段，也不要自行重新排盘或重算。'
      : '请用 3–5 句话说清这一阵的基本情况：关键牌提示了什么、倾向如何、最需要注意什么。不要逐张展开牌义，也不要重新抽牌。';
  }
  if (mode === MODES.CLASSIC) {
    return domain === 'liuyao'
      ? '请依据提供的古法资料分析此卦。先说明各项判断所依据的规则，再结合当前卦象进行推演。不得将未经提供或未经确认的规则冒充典籍原文；如果资料不足，请明确指出。'
      : '请依据提供的牌阵、牌义与 Waite 原文分析这一阵。先说明每个位置上的牌依据哪一条牌义或原文，再综合推演。不得把整理层当作原文，不得把倾向值当作命定；如果资料不足，请明确指出。';
  }
  return domain === 'liuyao'
    ? '请研究这一卦中不同规则之间的关系：比较各问事域取用的差异，说明每条规则在什么条件下适用、彼此冲突时如何取舍、当前资料还缺什么。不要引入未提供的典籍，也不要为了内容丰富而塞入无关材料。'
    : '请研究这一阵中牌义与牌阵位置的相互作用：说明自建整理层与 Waite 原文可能存在的差异、不同位置的权重如何影响整体判断、当前资料还缺什么。不要引入未提供的资料。';
}

// ---------------------------------------------------------------------------
// 收尾与渲染
// ---------------------------------------------------------------------------

function finalize(pack) {
  pack.layer_status = pack.layer_status || {};
  pack.data_gaps = pack.data_gaps || [];
  pack.interpretation_constraints = pack.interpretation_constraints || [];
  return pack;
}

/**
 * 统一入口。
 * @param {'liuyao'|'tarot'} domain
 * @param {object} ctx
 * @param {string} mode
 */
export function buildAiPack(domain, ctx, mode) {
  const m = normMode(mode);
  if (domain === 'liuyao') return buildLiuyaoPack(ctx || {}, m);
  if (domain === 'tarot') return buildTarotPack(ctx || {}, m);
  throw new Error(`未知术数「${domain}」，当前只支持 liuyao / tarot`);
}

/** JSON 序列化（结构化复制项）。 */
export function renderAiPackJson(pack, pretty = true) {
  return JSON.stringify(pack, null, pretty ? 2 : 0);
}

/**
 * 可读文本渲染。只从 pack 读，不二次访问原始数据 —— 保证文本与 JSON 永远同源。
 */
export function renderAiPackText(pack) {
  if (!pack) return '';
  const L = [];
  const push = (...xs) => L.push(...xs);
  const head = `【钦天监 · ${pack.domain === 'liuyao' ? '六爻' : '塔罗'} · ${pack.mode_name}资料包】`;
  push(head, '');

  // 元数据
  const md = pack.chart_metadata || {};
  push('■ 基本信息');
  if (md.cast_at) push(`时间：${md.cast_at}`);
  if (pack.question) push(`所问：${pack.question}`);
  else push('所问：未填写');
  if (md.domain === 'liuyao') {
    if (md.gender) push(`性别：${md.gender}`);
    if (md.cast_method) push(`起卦：${md.cast_method}`);
  } else {
    push(`牌组：${md.deck_name}${md.deck_license ? ` · ${md.deck_license}` : ''}`);
    push(`牌阵：${md.spread_name}`);
    push(`正逆位：${md.reversal_used ? '启用' : '不启用'}`);
  }
  if (md.repro_code) push(`复现码：${md.repro_code}`);
  push('');

  // 排盘事实
  push('■ 排盘事实（已由钦天监计算，请直接采用，不要重算）');
  const cd = pack.chart_data || {};
  if (md.domain === 'liuyao') {
    if (cd.si_zhu) push(`四柱：${cd.si_zhu.yearGanZhi}年 ${cd.si_zhu.monthGanZhi}月 ${cd.si_zhu.dayGanZhi}日 ${cd.si_zhu.timeGanZhi}时`);
    if (cd.xun_kong?.length) push(`旬空：${cd.xun_kong.join('、')}`);
    if (cd.gua_shen) push(`卦身：${cd.gua_shen}`);
    if (cd.ben_gua) push(`本卦：${cd.ben_gua.name}（${cd.ben_gua.upper}上${cd.ben_gua.lower}下，${cd.ben_gua.palace}宫${cd.ben_gua.palace_wu_xing}${cd.ben_gua.flags?.length ? '，' + cd.ben_gua.flags.join('/') : ''}，世${cd.ben_gua.shi_pos}应${cd.ben_gua.ying_pos}）`);
    if (cd.bian_gua) push(`变卦：${cd.bian_gua.name}（${cd.bian_gua.upper}上${cd.bian_gua.lower}下）`);
    else push('变卦：无（六爻皆静）');
    if (cd.moving_positions?.length) push(`动爻：第 ${cd.moving_positions.join('、')} 爻`);
    push('六爻（自上而下）：');
    for (const l of (cd.lines || []).slice().reverse()) {
      // 动爻只标一次：爻性后写「（动）」，末尾方括号只留世/应，避免「（动）… [动]」重复
      const mark = l.shi_ying || '';
      push(`  ${l.pos_cn}爻 ${l.yin_yang}${l.moving ? '（动）' : ''} ${l.liu_shen} ${l.na_jia}${l.wu_xing} ${l.liu_qin}${mark ? ' [' + mark + ']' : ''}`);
    }
    if (cd.bian_lines) {
      push('变卦六爻：');
      for (const l of cd.bian_lines.slice().reverse()) push(`  ${POS_CN[l.pos - 1]}爻 ${l.yin_yang} ${l.na_jia}${l.wu_xing} ${l.liu_qin}`);
    }
    if (cd.fu_shen) push(`伏神：${cd.fu_shen.map((f) => `${POS_CN[f.position - 1]}爻${f.liuQin}`).join('、')}`);
    if (cd.shen_sha) {
      const ok = cd.shen_sha.filter((s) => s.status !== 'unverified').map((s) => `${s.name}${s.value}`);
      const un = cd.shen_sha.filter((s) => s.status === 'unverified').map((s) => `${s.name}${s.value}（存疑）`);
      push(`神煞：${[...ok, ...un].join(' ')}`);
    }
  } else {
    for (const c of (cd.cards || [])) {
      push(`${c.index}. ${c.position_label}｜${c.name}${c.name_alt ? `(${c.name_alt})` : ''}${c.reversed ? '（逆位）' : '（正位）'}`);
      if (c.position_meaning) push(`   位置含义：${c.position_meaning}`);
    }
  }
  push('');

  // 程序分析事实
  const ca = pack.computed_analysis || {};
  if (ca.facts) {
    push('■ 程序分析事实（已计算，非推测）');
    if (md.domain === 'liuyao') {
      const f = ca.facts;
      if (f.shi) push(`世爻：${f.shi.pos_cn}爻 ${f.shi.liu_qin}(${f.shi.na_jia}) ${f.shi.wang_shuai.tags.join('、') || '—'}`);
      if (f.ying) push(`应爻：${f.ying.pos_cn}爻 ${f.ying.liu_qin}(${f.ying.na_jia}) ${f.ying.wang_shuai.tags.join('、') || '—'}`);
      if (f.yongshen) {
        push(`用神（${f.yongshen.domain}）：${f.yongshen.primary.join('、')}${f.yongshen.use_ying ? '，兼取应爻' : ''}`);
        for (const o of f.yongshen.occurrences) push(`  ${o.pos_cn}爻 ${o.liu_qin}(${o.na_jia}) ${o.wang_shuai.tags.join('、') || '—'}${o.shi_ying ? ' [' + o.shi_ying + ']' : ''}`);
        if (f.yongshen.note) push(`  说明：${f.yongshen.note}`);
      }
      if (f.dong?.length) {
        push('动爻变化：');
        for (const d of f.dong) push(`  ${d.pos_cn}爻 ${d.liu_qin}(${d.na_jia})${d.bian ? ` → ${d.bian.liu_qin}(${d.bian.na_jia})` : ''}${d.hua_note ? ' ' + d.hua_note : ''}`);
      }
      if (f.relations?.length) {
        push('世应与其他关系：');
        for (const r of f.relations) push(`  ${r.desc}`);
      }
    } else {
      const f = ca.facts;
      push(`共 ${f.card_count} 张牌${f.reversal_used ? '，启用正逆位' : '，不启用正逆位'}`);
      for (const c of (f.cards || [])) {
        push(`${c.index}. ${c.position_label}｜${c.card}${c.reversed ? '（逆位）' : '（正位）'}`);
        if (c.scene) push(`   画面：${c.scene}`);
        if (c.keywords?.length) push(`   关键词：${c.keywords.join('、')}`);
        const ms = c.meaning_current || (c.reversed ? c.reversed_meanings : c.upright_meanings);
        if (ms?.length) push(`   ${c.reversed ? '逆位' : '正位'}牌义（整理层）：${ms.join('；')}`);
        if (c.classic_text) push(`   Waite 1910 原文：${c.classic_text}`);
      }
    }
    push('');
  }

  // 《周易》经传原文（仅六爻 non-quick 提供）
  const zt = pack.zhouyi_text;
  if (zt) {
    push('■ 《周易》经传原文（卦义文本，与纳甲断卦不是同一套体系）');
    push(`底本：${zt.source.title}（${zt.source.edition}）；收录范围：${zt.source.text_type}`);
    push('');
    const zEntry = (label, e) => {
      if (!e) {
        push(`${label}：无（本卦无变卦，故无变卦经传；null，不得自行补写）`);
        push('');
        return;
      }
      push(`${label}：${e.name ?? '—'}`);
      push(`  卦辞（经文）：${e.gua_ci ?? 'null（底本缺或不适用，不得自行补写）'}`);
      push(`  彖传：${e.tuan_zhuan ?? 'null（底本缺或不适用，不得自行补写）'}`);
      push(`  大象传：${e.da_xiang ?? 'null（底本缺或不适用，不得自行补写）'}`);
      if (e.source_location) push(`  底本索引：${e.source_location}`);
      push('');
    };
    zEntry('本卦', zt.ben_gua);
    zEntry('变卦', zt.bian_gua);
    push('说明：以上为《周易》经传原文，只可用于理解本卦/变卦的卦义，');
    push('不得把卦辞、彖象直接当作纳甲断吉凶的规则，也不得据此改写上方的纳甲结论。');
    push('');
  }

  // 规则判断
  const j = ca.rule_based_judgments;
  if (j) {
    push('■ 程序依规则生成的判断（不是客观事实，也不是预测准确率）');
    if (md.domain === 'liuyao') {
      push(`倾向：${j.headline || '—'}${j.level != null ? `（level ${j.level}，score ${j.score}）` : ''}`);
      if (j.takeaway) push(`要点：${j.takeaway}`);
      if (j.timing) push(`应期：${j.timing}`);
      if (j.yong_shen_name) push(`用神：${j.yong_shen_name}`);
      if (j.signals?.length) {
        push(`依据（${j.signals.length}/${j.signals_total} 条）：`);
        for (const s of j.signals) push(`  [权重${s.weight}] ${s.text}　— ${s.source}`);
      }
    } else {
      push(`倾向：${j.text || '—'}${j.score != null ? `（合参分 ${j.score}）` : ''}`);
      if (j.desc) push(`说明：${j.desc}`);
      push(`性质：${j.basis}（自建惯例值机械合参）`);
    }
    if (j.basis_note) push(`声明：${j.basis_note}`);
    push('');
  }

  // 正逆位读法对照（塔罗研究模式）
  if (ca.reversal_comparison?.length) {
    push('■ 同一张牌的正逆位读法对照（研究模式）');
    for (const r of ca.reversal_comparison) {
      push(`${r.card}（本阵为${r.drawn_as}）`);
      push(`  正位读法：${r.upright_reading.join('；') || '—'}`);
      push(`  逆位读法：${r.reversed_reading.join('；') || '—'}`);
    }
    push('');
  }

  // 牌阵全位（塔罗研究模式）
  if (ca.spread_full?.length) {
    push('■ 牌阵全部位置（研究模式，含本阵未用到时的情况）');
    for (const sp of ca.spread_full) {
      push(`  ${sp.order}. ${sp.label}${sp.meaning ? '｜' + sp.meaning : ''} → ${sp.drawn_card || '（本阵未占此位）'}`);
    }
    push('');
  }

  // 问事域对照（研究模式）
  if (ca.domain_comparison?.length) {
    push('■ 各问事域的取用对照（研究模式）');
    for (const d of ca.domain_comparison) {
      const ys = d.primary.length
        ? `${d.primary.join('、')}${d.use_ying ? '，兼取应爻' : ''}`
        : (d.use_ying ? '径取应爻（本域不另取六亲）' : '本盘未取到');
      push(`· ${d.domain}：用神 ${ys}${d.in_chart.length ? '｜盘中 ' + d.in_chart.join('、') : '｜不上卦'}${d.note ? '｜' + d.note : ''}`);
    }
    push('');
  }

  // 资料出处
  if (pack.source_materials?.length) {
    push('■ 资料出处（原文 / 整理 / 惯例，已分层）');
    for (const s of pack.source_materials) {
      if (s.kind === 'classic_quote') {
        push(`〔原文〕${s.text}`);
        push(`  出处：${s.source}${s.card ? `（${s.card}${s.reversed ? '逆位' : ''}）` : ''}`);
      } else if (s.kind === 'rule_digest') {
        push(`〔规则·整理〕${s.book}｜${s.text}`);
        if (s.original) push(`  原文：${s.original}`);
      } else if (s.kind === 'convention') {
        push(`〔惯例·自建〕${s.text}　— ${s.source}`);
      }
    }
    push('');
  }

  // 层状态与缺口
  push('■ 资料状态');
  const stName = { available: '已提供', not_applicable: '本盘无此类数据', not_included: '当前模式未包含', unverified: '未核验' };
  for (const [k, v] of Object.entries(pack.layer_status || {})) push(`  ${k}：${stName[v] || v}`);
  if (pack.data_gaps?.length) {
    push('缺口说明：');
    for (const g of pack.data_gaps) push(`  · ${g.layer}（${stName[g.status] || g.status}）${g.detail}`);
  }
  push('');

  // 使用约束
  if (pack.interpretation_constraints?.length) {
    push('■ 使用约束');
    pack.interpretation_constraints.forEach((c, i) => push(`  ${i + 1}. ${c}`));
    push('');
  }

  // 交给模型的任务
  if (pack.user_task) {
    push('■ 请你做的事');
    push(pack.user_task);
  }
  return L.join('\n');
}

/** 复制用的一行摘要（面板标题区用）。 */
export function aiPackSummary(pack) {
  if (!pack) return '';
  const j = pack.computed_analysis?.rule_based_judgments;
  const core = pack.domain === 'liuyao'
    ? (pack.chart_data?.ben_gua?.name || '') + (pack.chart_data?.bian_gua ? `→${pack.chart_data.bian_gua.name}` : '')
    : `${pack.chart_data?.spread?.name || ''}·${pack.chart_data?.cards?.length || 0}张`;
  const tail = j ? (j.headline || j.text || '') : '';
  return `${pack.mode_name}｜${core}${tail ? '｜' + tail : ''}`;
}

// ---------------------------------------------------------------------------
// HTML 渲染（专为「发给另一个 AI 协同」设计：静态、无 JS 依赖、语义化、
// 内容全部在 HTML 里；每个单页内嵌一份 application/json 结构化数据）。
// 与 renderAiPackText 一样只读 pack，不二次访问原始数据 —— 单一数据源。
// ---------------------------------------------------------------------------

export const AI_PACK_CSS = `
:root{--ink:#1a1a1a;--muted:#666;--line:#d8d4cc;--paper:#fbfaf7;--accent:#7a2e1f;--ok:#1a6b37;--na:#666;--ni:#9a6a00;--uv:#9c3a00}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.75 -apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}
main{max-width:860px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:24px;margin:0 0 4px}
h2{font-size:19px;margin:36px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--accent)}
h3{font-size:16px;margin:20px 0 6px;color:var(--accent)}
.sub{color:var(--muted);margin:0 0 8px;font-size:14px}
.notice{background:#f3efe6;border:1px solid var(--line);border-left:4px solid var(--accent);padding:12px 16px;border-radius:6px;margin:20px 0;font-size:14.5px}
table{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:14.5px;background:#fff}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{background:#f3efe6;font-weight:600;white-space:nowrap}
.kv td:first-child{width:110px;color:var(--muted);white-space:nowrap}
.tag{display:inline-block;padding:0 8px;border-radius:10px;font-size:12.5px;line-height:1.8;border:1px solid currentColor;white-space:nowrap}
.tag.available{color:var(--ok)}
.tag.not_applicable{color:var(--na)}
.tag.not_included{color:var(--ni)}
.tag.unverified{color:var(--uv)}
.verdict{background:#fdf6ec;border:1px solid #e8d5b0;border-radius:8px;padding:14px 18px;margin:10px 0}
.verdict .big{font-size:18px;font-weight:700}
.muted{color:var(--muted)}
.src-item{background:#fff;border:1px solid var(--line);border-radius:6px;padding:10px 14px;margin:8px 0}
.src-kind{font-size:12.5px;font-weight:700;padding:1px 8px;border-radius:10px;margin-right:8px}
.k-classic_quote{background:#e7f0e9;color:#1a6b37}
.k-rule_digest{background:#e9eef6;color:#23447a}
.k-convention{background:#f6e9e4;color:#8a3418}
blockquote{margin:6px 0;padding:4px 12px;border-left:3px solid var(--line);color:#333}
ol.constraints{padding-left:22px}ol.constraints li{margin:4px 0}
.task{background:#eef3ee;border:1px solid #c9dccb;border-radius:8px;padding:14px 18px;font-size:16px}
details{margin:24px 0}summary{cursor:pointer;color:var(--muted);font-size:14px}
pre{background:#23262b;color:#e6e3da;padding:16px;border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.55;max-height:560px}
.toc{background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px 18px;font-size:14.5px}
.toc a{color:var(--accent);text-decoration:none;margin-right:14px;white-space:nowrap}
.dong{color:var(--accent);font-weight:700}
.unverif{color:var(--uv);font-weight:700}
footer{margin-top:60px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:14px}
`;

const STATUS_CN = {
  available: '已提供',
  not_applicable: '本术数无此类数据',
  not_included: '当前模式未包含',
  unverified: '未核验',
};

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusTag(st) {
  const v = STATUS_CN[st] ? st : 'not_applicable';
  return `<span class="tag ${v}">${STATUS_CN[v]}</span>`;
}

function kvTable(rows) {
  const body = rows.filter((r) => r && r[1] !== null && r[1] !== undefined && r[1] !== '')
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('');
  return body ? `<table class="kv"><tbody>${body}</tbody></table>` : '';
}

// ---- 六爻专属渲染 ----

function liuyaoChartHtml(cd) {
  const out = [];
  const meta = [];
  if (cd.si_zhu) meta.push(['四柱', esc(`${cd.si_zhu.yearGanZhi}年 ${cd.si_zhu.monthGanZhi}月 ${cd.si_zhu.dayGanZhi}日 ${cd.si_zhu.timeGanZhi}时`)]);
  if (cd.xun_kong?.length) meta.push(['旬空', esc(cd.xun_kong.join('、'))]);
  if (cd.gua_shen) meta.push(['卦身', esc(cd.gua_shen)]);
  const b = cd.ben_gua;
  if (b) meta.push(['本卦', esc(`${b.name}（${b.upper}上${b.lower}下，${b.palace}宫${b.palace_wu_xing}${b.flags?.length ? '，' + b.flags.join('/') : ''}，世${b.shi_pos}应${b.ying_pos}）`)]);
  if (cd.bian_gua) {
    const c = cd.bian_gua;
    meta.push(['变卦', esc(`${c.name}（${c.upper}上${c.lower}下）`)]);
  } else meta.push(['变卦', '无（六爻皆静）']);
  if (cd.moving_positions?.length) meta.push(['动爻', '第 ' + esc(cd.moving_positions.join('、')) + ' 爻']);
  out.push(kvTable(meta));

  if (cd.lines?.length) {
    out.push('<h3>六爻（自上而下）</h3><table><thead><tr><th>爻位</th><th>阴阳</th><th>六神</th><th>纳甲</th><th>五行</th><th>六亲</th><th>世应</th></tr></thead><tbody>');
    for (const l of cd.lines.slice().reverse()) {
      out.push(`<tr${l.moving ? ' class="dong"' : ''}><td>${esc(l.pos_cn)}爻${l.moving ? '（动）' : ''}</td><td>${esc(l.yin_yang)}</td><td>${esc(l.liu_shen)}</td><td>${esc(l.na_jia)}</td><td>${esc(l.wu_xing)}</td><td>${esc(l.liu_qin)}</td><td>${esc(l.shi_ying || '')}</td></tr>`);
    }
    out.push('</tbody></table>');
  }
  if (cd.bian_lines?.length) {
    out.push('<h3>变卦六爻（自上而下）</h3><table><thead><tr><th>爻位</th><th>阴阳</th><th>纳甲</th><th>五行</th><th>六亲</th></tr></thead><tbody>');
    for (const l of cd.bian_lines.slice().reverse()) {
      out.push(`<tr><td>${esc(l.pos_cn ?? POS_CN[l.pos - 1])}爻</td><td>${esc(l.yin_yang)}</td><td>${esc(l.na_jia)}</td><td>${esc(l.wu_xing)}</td><td>${esc(l.liu_qin)}</td></tr>`);
    }
    out.push('</tbody></table>');
  }
  if (cd.shen_sha?.length) {
    const unverifCount = cd.shen_sha.filter((x) => x.status === 'unverified').length;
    out.push(`<h3>神煞（${cd.shen_sha.length} 项${unverifCount ? `，其中 ${unverifCount} 项存疑` : ''}）</h3><table><thead><tr><th>名称</th><th>取值</th><th>状态</th></tr></thead><tbody>`);
    for (const s of cd.shen_sha) {
      if (s.status === 'unverified') {
        out.push(`<tr><td>${esc(s.name)}</td><td class="unverif">${esc(s.value)}（存疑）</td><td>${statusTag(s.status)}</td></tr>`);
        if (s.note) out.push(`<tr><td></td><td colspan="2" class="muted">${esc(s.note)}</td></tr>`);
      } else {
        // 已提供是默认常态，状态列留白（不逐行挂标签制造噪音）；AI 以 JSON 的 status 字段为准
        out.push(`<tr><td>${esc(s.name)}</td><td>${esc(s.value)}</td><td class="muted">已提供</td></tr>`);
      }
    }
    out.push('</tbody></table>');
  }
  if (cd.fu_shen?.length) out.push(`<h3>伏神</h3><pre>${esc(JSON.stringify(cd.fu_shen, null, 2))}</pre>`);
  return out.join('');
}

function liuyaoFactsHtml(f) {
  const out = [];
  const ws = (o) => o.wang_shuai?.tags?.length ? o.wang_shuai.tags.join('、') : '—';
  if (f.shi) out.push(`<p><strong>世爻：</strong>${esc(f.shi.pos_cn)}爻 ${esc(f.shi.liu_qin)}（${esc(f.shi.na_jia)}） ${esc(ws(f.shi))}</p>`);
  if (f.ying) out.push(`<p><strong>应爻：</strong>${esc(f.ying.pos_cn)}爻 ${esc(f.ying.liu_qin)}（${esc(f.ying.na_jia)}） ${esc(ws(f.ying))}</p>`);
  if (f.yongshen) {
    const y = f.yongshen;
    out.push(`<h3>用神（${esc(y.domain)}）：${esc(y.primary.join('、') || '（不另取六亲）')}${y.use_ying ? '，兼取应爻' : ''}</h3>`);
    if (y.occurrences?.length) {
      out.push('<table><thead><tr><th>爻位</th><th>六亲</th><th>纳甲</th><th>旺衰</th><th>世应</th></tr></thead><tbody>');
      for (const o of y.occurrences) out.push(`<tr><td>${esc(o.pos_cn)}爻</td><td>${esc(o.liu_qin)}</td><td>${esc(o.na_jia)}</td><td>${esc(ws(o))}</td><td>${esc(o.shi_ying || '')}</td></tr>`);
      out.push('</tbody></table>');
    }
    if (y.note) out.push(`<p class="muted">说明：${esc(y.note)}</p>`);
    const ysExtra = [y.yuan_shen && `元神：${y.yuan_shen}`, y.ji_shen && `忌神：${y.ji_shen}`, y.chou_shen && `仇神：${y.chou_shen}`].filter(Boolean);
    if (ysExtra.length) out.push(`<p>${ysExtra.map(esc).join('　')}</p>`);
  }
  if (f.dong?.length) {
    out.push('<h3>动爻变化</h3><table><thead><tr><th>动爻</th><th>变出</th><th>变化性质</th></tr></thead><tbody>');
    for (const d of f.dong) {
      out.push(`<tr><td>${esc(d.pos_cn)}爻 ${esc(d.liu_qin)}（${esc(d.na_jia)}）</td><td>${d.bian ? esc(d.bian.liu_qin + '（' + d.bian.na_jia + '）') : '—'}</td><td>${esc(d.hua_note || '')}</td></tr>`);
    }
    out.push('</tbody></table>');
  }
  if (f.relations?.length) {
    out.push('<h3>世应与其他关系</h3><ul>');
    for (const r of f.relations) out.push(`<li>${esc(r.desc)}</li>`);
    out.push('</ul>');
  }
  return out.join('');
}

// ---- 塔罗专属渲染 ----

function tarotChartHtml(cd) {
  const out = [];
  if (cd.deck || cd.spread) {
    out.push(kvTable([
      cd.deck ? ['牌组', esc(`${cd.deck.name}${cd.deck.license ? ' · ' + cd.deck.license : ''}`)] : null,
      cd.spread ? ['牌阵', esc(cd.spread.name)] : null,
    ].filter(Boolean)));
  }
  if (cd.cards?.length) {
    out.push('<h3>本阵抽牌（位置事实）</h3><table><thead><tr><th>#</th><th>位置</th><th>牌</th><th>正逆位</th></tr></thead><tbody>');
    for (const c of cd.cards) {
      out.push(`<tr><td>${c.index}</td><td>${esc(c.position_label)}<br><span class="muted">${esc(c.position_meaning || '')}</span></td><td>${esc(c.name)}${c.name_alt ? ` <span class="muted">(${esc(c.name_alt)})</span>` : ''}</td><td>${c.reversed ? '逆位' : '正位'}</td></tr>`);
    }
    out.push('</tbody></table>');
  }
  return out.join('');
}

function tarotFactsHtml(f) {
  const out = [`<p>共 ${f.card_count} 张牌，${f.reversal_used ? '启用正逆位' : '不启用正逆位'}</p>`];
  for (const c of f.cards || []) {
    out.push(`<h3>${c.index}. ${esc(c.position_label)}｜${esc(c.card)}（${c.reversed ? '逆位' : '正位'}）</h3>`);
    if (c.scene) out.push(`<p><strong>画面：</strong>${esc(c.scene)}</p>`);
    if (c.keywords?.length) out.push(`<p><strong>关键词：</strong>${esc(c.keywords.join('、'))}</p>`);
    if (c.meaning_current) {
      out.push(`<p><strong>${c.reversed ? '逆位' : '正位'}牌义</strong>（自建整理层，非古籍原文）：${esc(c.meaning_current.join('；'))}</p>`);
      if (c.meaning_current_note) out.push(`<p class="muted">${esc(c.meaning_current_note)}</p>`);
    } else {
      if (c.upright_meanings?.length) out.push(`<p><strong>正位牌义</strong>（整理层）：${esc(c.upright_meanings.join('；'))}</p>`);
      if (c.reversed_meanings?.length) out.push(`<p><strong>逆位牌义</strong>（整理层）：${esc(c.reversed_meanings.join('；'))}</p>`);
    }
    if (c.classic_text) out.push(`<p><strong>A.E. Waite《Pictorial Key to the Tarot》(1910, PD) 原文：</strong><span lang="en">${esc(c.classic_text)}</span></p>`);
  }
  return out.join('');
}

// ---- 通用区块 ----

function sourcesHtml(list) {
  if (!list?.length) return '<p class="muted">（无）</p>';
  return list.map((s) => {
    if (s.kind === 'classic_quote') {
      return `<div class="src-item"><span class="src-kind k-classic_quote">古籍原文</span><strong>${esc(s.source || '')}${s.card ? `（${esc(s.card)}${s.reversed ? '逆位' : ''}）` : ''}</strong><blockquote>${esc(s.text)}</blockquote></div>`;
    }
    if (s.kind === 'rule_digest') {
      return `<div class="src-item"><span class="src-kind k-rule_digest">规则·白话整理</span><strong>${esc(s.book || '')}</strong><p>${esc(s.text)}</p>${s.original ? `<blockquote>原文：${esc(s.original)}</blockquote>` : ''}${s.note ? `<p class="muted" style="font-size:13px">${esc(s.note)}</p>` : ''}</div>`;
    }
    return `<div class="src-item"><span class="src-kind k-convention">自建惯例</span><strong>${esc(s.source || '')}</strong><p>${esc(s.text)}</p>${s.note ? `<p class="muted" style="font-size:13px">${esc(s.note)}</p>` : ''}</div>`;
  }).join('');
}

function gapsHtml(gaps, layerStatus) {
  const out = [];
  if (layerStatus) {
    out.push('<h3>各资料层状态</h3><table><thead><tr><th>资料层</th><th>状态</th></tr></thead><tbody>');
    for (const [k, v] of Object.entries(layerStatus)) out.push(`<tr><td><code>${esc(k)}</code></td><td>${statusTag(v)}</td></tr>`);
    out.push('</tbody></table>');
  }
  if (gaps?.length) {
    out.push('<h3>逐条说明</h3><table><thead><tr><th>资料层</th><th>状态</th><th>说明</th></tr></thead><tbody>');
    for (const g of gaps) out.push(`<tr><td><code>${esc(g.layer)}</code></td><td>${statusTag(g.status)}</td><td>${esc(g.detail)}</td></tr>`);
    out.push('</tbody></table>');
  }
  out.push('<p class="muted">四态含义：已提供＝存在且已提供；本术数无此类数据＝该术数本身没有（not_applicable），不是缺陷；当前模式未包含（not_included）＝可切换模式获取；未核验（unverified）＝存在但准确性/来源尚未核实。</p>');
  return out.join('');
}

/**
 * 单份资料包 → 完整 HTML 文档字符串（UTF-8、零脚本依赖、内嵌 JSON）。
 * @param {object} pack
 * @param {object} [opts]
 * @param {boolean} [opts.fragment=false] 只返回 main 内片段（合集页复用）；片段模式不内嵌 script JSON。
 */
export function renderAiPackHtml(pack, opts = {}) {
  if (!pack) throw new Error('renderAiPackHtml: pack 为空');
  const isLy = pack.domain === 'liuyao';
  const domainCn = isLy ? '六爻纳甲' : '塔罗';
  const md = pack.chart_metadata || {};
  const cd = pack.chart_data || {};
  const ca = pack.computed_analysis || {};
  const j = ca.rule_based_judgments;
  // blocks：{id,title,html}，章节序号在最后统一加，避免动态编号错位
  const blocks = [];

  // 给 AI 的阅读说明（不编号）
  const notice = `<section class="notice"><strong>致阅读本页的 AI 助手：</strong>
本页是「钦天监」本地术数工具导出的结构化资料包，分四层呈现：<strong>排盘事实</strong>（程序已计算，请直接采用，不要重算）、<strong>程序分析事实</strong>（可确定验证的计算结果）、<strong>依规则生成的判断</strong>（程序按内置规则的输出，不是客观事实也不是预测准确率）、<strong>资料出处</strong>（古籍原文 / 白话整理 / 自建惯例严格分层）。
页面底部「结构化数据（JSON）」内嵌了完整机器可读数据。请先读最后的「请你做的事」与「使用约束」。</section>`;

  // 1 基本信息
  const info = [];
  if (md.cast_at) info.push(['时间', esc(md.cast_at)]);
  info.push(['所问', pack.question ? esc(pack.question) : '<span class="muted">未填写</span>']);
  if (isLy) {
    if (md.gender) info.push(['性别', esc(md.gender)]);
    if (md.cast_method) info.push(['起卦方式', esc(md.cast_method)]);
  } else {
    info.push(['牌组', esc(`${md.deck_name || ''}${md.deck_license ? ' · ' + md.deck_license : ''}`)]);
    info.push(['牌阵', esc(md.spread_name || '')]);
    info.push(['正逆位', md.reversal_used ? '启用' : '不启用']);
  }
  if (md.app_version) info.push(['钦天监版本', esc(md.app_version)]);
  blocks.push({ id: 'meta', title: '基本信息', html: kvTable(info) });

  // 2 排盘事实
  blocks.push({ id: 'chart', title: '排盘事实（已由钦天监计算，请直接采用，不要重算）', html: isLy ? liuyaoChartHtml(cd) : tarotChartHtml(cd) });

  // 3 程序分析事实
  if (ca.facts) {
    blocks.push({ id: 'facts', title: '程序分析事实（已计算，非推测）', html: isLy ? liuyaoFactsHtml(ca.facts) : tarotFactsHtml(ca.facts) });
  }

  // 3.5 《周易》经传原文（仅六爻 non-quick）
  if (pack.zhouyi_text) {
    blocks.push({ id: 'zhouyi', title: '《周易》经传原文（卦义文本，与纳甲断卦不是同一套体系）', html: zhouyiHtml(pack.zhouyi_text) });
  }

  // 4 规则判断
  if (j) {
    let body = '';
    if (isLy) {
      body = `<div class="verdict"><div class="big">倾向：${esc(j.headline || '—')} <span class="muted">（level ${esc(j.level)}，score ${esc(j.score)}）</span></div>${j.takeaway ? `<p>${esc(j.takeaway)}</p>` : ''}${j.timing ? `<p><strong>应期：</strong>${esc(j.timing)}</p>` : ''}<p><strong>用神：</strong>${esc(j.yong_shen_name || '')}</p></div>`;
      if (j.signals?.length) {
        body += `<h3>逐条依据（${j.signals.length}/${j.signals_total} 条${j.signals_omitted ? `，快速模式省略 ${j.signals_omitted} 条` : ''}）</h3><table><thead><tr><th>权重</th><th>判断内容</th><th>程序标注出处</th></tr></thead><tbody>`;
        for (const s of j.signals) body += `<tr><td>${esc(s.weight)}</td><td>${esc(s.text)}</td><td>${esc(s.source)}</td></tr>`;
        body += '</tbody></table>';
      }
    } else {
      body = `<div class="verdict"><div class="big">倾向：${esc(j.text || '—')} <span class="muted">（合参分 ${esc(j.score)}）</span></div>${j.desc ? `<p>${esc(j.desc)}</p>` : ''}<p><strong>性质：</strong>convention（自建惯例值机械合参，非古籍判决）</p></div>`;
    }
    if (j.basis_note) body += `<p class="muted"><strong>声明：</strong>${esc(j.basis_note)}</p>`;
    blocks.push({ id: 'judgments', title: '程序依规则生成的判断（不是客观事实，也不是预测准确率）', html: body });
  }

  // 研究模式专属
  if (ca.domain_comparison?.length) {
    let body = '<table><thead><tr><th>问事域</th><th>用神取用</th><th>盘中落位</th><th>备注</th></tr></thead><tbody>';
    for (const d of ca.domain_comparison) {
      const ys = d.primary.length ? `${esc(d.primary.join('、'))}${d.use_ying ? '，兼取应爻' : ''}` : (d.use_ying ? '径取应爻（本域不另取六亲）' : '本盘未取到');
      body += `<tr><td>${esc(d.domain)}</td><td>${ys}</td><td>${d.in_chart.length ? esc(d.in_chart.join('、')) : '不上卦'}</td><td class="muted">${esc(d.note || '')}</td></tr>`;
    }
    body += '</tbody></table><p class="muted">只给取用差异，不堆砌与当前问事无关的古籍内容。</p>';
    blocks.push({ id: 'comparison', title: '各问事域的取用对照（研究模式）', html: body });
  }
  if (ca.reversal_comparison?.length) {
    let body = '<table><thead><tr><th>牌</th><th>本阵</th><th>正位读法</th><th>逆位读法</th></tr></thead><tbody>';
    for (const r of ca.reversal_comparison) {
      body += `<tr><td>${esc(r.card)}</td><td>${esc(r.drawn_as)}</td><td>${esc(r.upright_reading.join('；'))}</td><td>${esc(r.reversed_reading.join('；'))}</td></tr>`;
    }
    body += '</tbody></table>';
    blocks.push({ id: 'comparison', title: '同一张牌的正逆位读法对照（研究模式）', html: body });
  }
  if (ca.spread_full?.length) {
    let body = '<table><thead><tr><th>#</th><th>位置</th><th>位置含义</th><th>本阵抽到</th></tr></thead><tbody>';
    for (const s of ca.spread_full) body += `<tr><td>${s.order}</td><td>${esc(s.label)}</td><td class="muted">${esc(s.meaning || '')}</td><td>${s.drawn_card ? esc(s.drawn_card) : '（本阵未占此位）'}</td></tr>`;
    body += '</tbody></table>';
    blocks.push({ id: 'spreadfull', title: '牌阵全部位置（研究模式）', html: body });
  }

  // 出处 / 状态
  blocks.push({ id: 'sources', title: '资料出处（原文 / 白话整理 / 自建惯例，已分层）', html: sourcesHtml(pack.source_materials) });
  blocks.push({ id: 'status', title: '资料状态（四态）', html: gapsHtml(pack.data_gaps, pack.layer_status) });

  // 约束 / 任务（不进中文序号，保持醒目）
  const constraintsHtml = `<ol class="constraints">${(pack.interpretation_constraints || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ol>`;
  const taskHtml = `<div class="task">${esc(pack.user_task || '')}</div>`;

  const title = `${isLy ? '六爻' : '塔罗'} · ${esc(pack.mode_name)} · 钦天监 AI 协作资料包`;
  const jsonText = renderAiPackJson(pack);
  // 防止 JSON 里的 </script> 截断标签
  const safeJson = jsonText.replace(/</g, '\\u003c');

  const toc = blocks.map((b) => `<a href="#${opts.fragment ? opts.fragment + '-' : ''}${b.id}">${esc(b.title.replace(/（.*$/, ''))}</a>`).join('')
    + (opts.fragment ? '' : '<a href="#json">结构化 JSON</a>');
  const headId = (x) => (opts.fragment ? `${opts.fragment}-${x}` : x);
  const sections = blocks.map((b, i) => `<section id="${headId(b.id)}"><h2>${CN_NUM[i]}、${esc(b.title)}</h2>${b.html}</section>`).join('\n');

  const body = `${opts.fragment ? '' : `<h1>${title}</h1>
<p class="sub">生成时间 ${esc(md.cast_at || '')}　·　schema v${esc(pack.schema_version)}　·　本页为静态页面，无需 JavaScript 即可完整阅读；数据来自钦天监本地计算，未连接任何外部服务。</p>
${notice}
<nav class="toc">${toc}</nav>`}
${sections}
<section id="${headId('constraints')}"><h2>使用约束</h2>${constraintsHtml}</section>
<section id="${headId('task')}"><h2>请你做的事</h2>${taskHtml}</section>${opts.fragment ? '' : `
<details id="json"><summary>结构化数据（application/json，与上方内容同源，共 ${jsonText.length} 字符）</summary>
<script type="application/json" id="ai-pack-json">${safeJson}</script>
<pre>${esc(jsonText)}</pre>
</details>
<footer>钦天监 · 纯本地命理工具 · 本资料包仅组织排盘结果与可追溯资料，不代替人的判断。</footer>`}`;

  if (opts.fragment) {
    return `<article class="pack-fragment" id="frag-${esc(opts.fragment)}" data-domain="${esc(pack.domain)}" data-mode="${esc(pack.mode)}">
<hr>
<h1 style="font-size:21px">${title}</h1>
<p class="sub">${esc(md.cast_at || '')}　·　${domainCn}　·　${esc(pack.mode_name)}模式</p>
${body}
</article>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="钦天监 AI 协作资料包：${domainCn} · ${esc(pack.mode_name)}。供大模型读取的排盘事实、程序分析、规则判断与典籍出处分层数据。">
<meta name="ai-content-kind" content="qintianjian-ai-pack">
<meta name="ai-pack-domain" content="${esc(pack.domain)}">
<meta name="ai-pack-mode" content="${esc(pack.mode)}">
<meta name="ai-pack-schema-version" content="${esc(pack.schema_version)}">
<style>${AI_PACK_CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}
