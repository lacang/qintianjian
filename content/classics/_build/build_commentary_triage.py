# -*- coding: utf-8 -*-
"""
注疏层 batch02 剩余 62 条核校前分流（triage）。
只读 variant-ledger.json，只写 commentary-batch2-triage.json。
不修改任何 confirmed / status / diff_type 等结论字段。
"""
import json, os, re, collections

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(BASE, 'raw/commentary/index/variant-ledger.json')
OUT    = os.path.join(BASE, 'raw/commentary/index/commentary-batch2-triage.json')

# ---------------------------------------------------------------------------
# 人工判定表：40 个独立问题（22 组 × 2 条 + 18 条单条）
# 键 = 组内任一 ledger_id 或 group_id；值 = 判定
#   ev      : A / B / C
#   p       : P0 / P1 / P2 / P3
#   src     : error_source
#   canon   : 原典侧实际写法
#   note    : 注本侧实际写法
#   basis   : 判定依据（为什么是这一类）
#   need    : 需要什么材料（B 类必填，A 类可为空）
#   action  : 建议动作
#   human   : 是否需要人工介入
# ---------------------------------------------------------------------------
J = {
 # ---- 22 组 ----
 'VG-045': dict(ev='B', p='P1', src='textual_variant',
   canon='我未见也', note='我未之见也',
   basis='注本多一「之」字。两载体同源，无第二独立传本可比，属脱文/衍文，性质可描述但无法在电子文本内判定哪侧为底本原貌。',
   need='中华书局/上海古籍《四书章句集注》影印本，里仁第四「盖有之矣」章，核对刻本是否有「之」',
   action='保留待考；标注为「注本可能衍『之』或原典可能脱『之』」', human=True),
 'VG-071': dict(ev='B', p='P1', src='textual_variant',
   canon='谏志不从', note='见志不从',
   basis='「谏」「见」均为常用字，非形近、非异体，属实词异文，影响句义（「谏志」不辞，「见志」通）。电子文本内部无法判定是传本异文还是注本讹字。',
   need='影印本里仁第四「事父母几谏」章；另需核对《礼记·内则》相关文句作旁证',
   action='保留待考；倾向「见」为是，但须影印页确认', human=True),
 'VG-043': dict(ev='A', p='P2', src='orthographic_variant',
   canon='惟我与尔', note='唯我与尔',
   basis='惟/唯 古籍通用，字形可对照，不影响句义。注本无音注，属通行异体。',
   need='', action='可判为异体字，标 orthographic_variant，不计入实质异文', human=False),
 'VG-075': dict(ev='B', p='P1', src='textual_variant',
   canon='难乎有恒乎', note='难乎有恒矣',
   basis='句末「乎」「矣」不同，影响语气与句读（反问 vs 判断）。两载体同源，无法判定。',
   need='影印本述而第七「亡而为有」章，核对句末虚词',
   action='保留待考', human=True),
 'VG-042': dict(ev='A', p='P1', src='textual_variant',
   canon='黼冕', note='黻冕',
   basis='注本自注「黻，音弗」，注文与经文用字一致，可证注本刻本作「黻」而非数字化讹误。黼（fǔ）黻（fú）为两种不同礼服纹样，属名物实词异文，性质可确认，正误不可确认。',
   need='', action='判为传本用字差异（黼/黻），confirmed_scope=difference_nature；不判正误', human=False),
 'VG-057': dict(ev='A', p='P2', src='orthographic_variant',
   canon='毋自辱焉', note='无自辱焉',
   basis='毋/无 禁令副词通用，字形可对照。',
   need='', action='判为异体通用字', human=False),
 'VG-039': dict(ev='A', p='P2', src='orthographic_variant',
   canon='廐有肥马', note='厩有肥马',
   basis='廐/厩 异体，字形可对照。',
   need='', action='判为异体字', human=False),
 'VG-051': dict(ev='B', p='P1', src='source_excerpt_issue',
   canon='昔者公刘好货，《诗》云：『乃积乃仓', note='（注本无此段，直接接「云：『乃积乃仓」）',
   basis='注本侧整段「昔者公刘好货，《诗》云：『」缺失，且上下文有截断痕迹（「寡人好货云：『」）。属段落截取或数字化脱漏，无法在电子文本内区分。',
   need='影印本梁惠王章句下「公刘好货」章；并核对 raw 源文件该段完整性',
   action='标 source_excerpt_issue，保留待考；不得据此判为注本脱文', human=True),
 'VG-044': dict(ev='A', p='P1', src='ocr_defect',
   canon='成覸谓齐景公曰', note='mengzi 作「成謂」；sishu 作「成?」',
   basis='两载体同一处出现两种不同的数字化失败（一为讹字「謂」，一为替换字符「?」），可确认是数字化缺陷而非传本差异。注文「?，古苋反」「成?，人姓名」同缺，属同一缺陷扩散。',
   need='原字「覸」的确证需影印页（若后续要恢复用字）',
   action='标 ocr_defect，移出异文统计；展示层用「成覸」并加注', human=False),
 'VG-078': dict(ev='A', p='P1', src='ocr_defect',
   canon='飦粥之食', note='mengzi 缺该字；sishu 作「?」',
   basis='sishu 为替换字符「?」，mengzi 直接缺字，两载体同一位置均无法显示该字，属数字化缺陷。',
   need='原字「飦（饘）」的确证需影印页',
   action='标 ocr_defect，移出异文统计', human=False),
 'VG-002': dict(ev='A', p='P1', src='ocr_defect',
   canon='丈夫生而愿为之有室', note='失夫生而愿为之有室',
   basis='「丈」误作「失」，形近讹字，语义不通（「失夫」不辞），可确认为数字化讹误。',
   need='', action='标 ocr_defect，移出异文统计；展示层改回「丈夫」', human=False),
 'VG-062': dict(ev='A', p='P2', src='orthographic_variant',
   canon='盖禄万锺', note='盖禄万钟',
   basis='锺/钟 为繁简/异体对应，字形可对照。注本另有「盖，音合」证明「盖」为地名读法，与「锺」无关。',
   need='', action='判为异体字', human=False),
 'VG-041': dict(ev='A', p='P1', src='ocr_defect',
   canon='恶用是鶃鶃者为哉', note='mengzi 作「**（左“鸟”右“倪”之右）」；sishu 作「??」',
   basis='mengzi 载体直接写入编辑说明文字「（左“鸟”右“倪”之右）」，明确暴露该字在数字化时字体缺失；sishu 为两个替换字符。注文「*，魚一反」「**，鵝聲也」同缺，属同一缺陷。性质可确认。',
   need='若需恢复原字「鶃」，需影印页',
   action='标 ocr_defect，移出异文统计；展示层用「鶃鶃」并加注', human=False),
 'VG-053': dict(ev='A', p='P1', src='ocr_defect',
   canon='是鶃鶃之肉也', note='同上（** / ??）',
   basis='与 VG-041 同一缺陷在同一段落内重复出现。',
   need='', action='与 VG-041 合并处理', human=False),
 'VG-004': dict(ev='A', p='P2', src='orthographic_variant',
   canon='敺（三见）', note='驱（三见）',
   basis='敺/驱 异体，字形可对照，三处一致。',
   need='', action='判为异体字', human=False),
 'VG-017': dict(ev='A', p='P2', src='orthographic_variant',
   canon='敺', note='驱',
   basis='同上。', need='', action='判为异体字', human=False),
 'VG-016': dict(ev='A', p='P2', src='orthographic_variant',
   canon='眸子瞭焉', note='眸子了焉',
   basis='注本自注「了，音…」，注文与经文一致，可证注本作「了」为「瞭」之省/通假，非数字化讹误。',
   need='', action='判为通假/异体，confirmed_scope=difference_nature', human=False),
 'VG-018': dict(ev='A', p='P1', src='ocr_defect',
   canon='千有余里', note='夭有余里',
   basis='「千」误作「夭」，形近讹字，与下句「千有余岁」对文可证，语义不通。可确认为数字化讹误。',
   need='', action='标 ocr_defect，移出异文统计；展示层改回「千」', human=False),
 'VG-008': dict(ev='A', p='P2', src='orthographic_variant',
   canon='同室之人鬬者', note='同室之人斗者',
   basis='鬬/斗 异体（鬬为斗之古字）。', need='', action='判为异体字', human=False),
 'VG-006': dict(ev='A', p='P2', src='orthographic_variant',
   canon='乡邻有鬬者', note='乡邻有斗者',
   basis='同上。', need='', action='判为异体字', human=False),
 'VG-061': dict(ev='A', p='P1', src='ocr_defect',
   canon='王使人瞷夫子', note='mengzi 脱该字；sishu 作「王使人?夫子」',
   basis='sishu 为替换字符，mengzi 为脱字，同一位置两载体均失败，属数字化缺陷。',
   need='原字「瞷」确证需影印页', action='标 ocr_defect，移出异文统计', human=False),
 'VG-022': dict(ev='B', p='P1', src='textual_variant',
   canon='吾将瞷良人之所之也', note='吾将良人之所之也（注本脱「瞷」）',
   basis='注本脱动词「瞷」，句子仍通但语义弱化（「将良人之所之」不辞）。可能是传本脱文，也可能是数字化脱字，电子文本内部无法区分。',
   need='影印本离娄章句下「齐人有一妻一妾」章，核对是否有「瞷」',
   action='保留待考', human=True),
 # ---- 18 条单条 ----
 'VL-0081': dict(ev='A', p='P1', src='ocr_defect',
   canon='不庄以莅之／庄以莅之', note='不庄以?之／庄以?之，注文亦作「?，临也」「?之不庄」',
   basis='经文与注文同一位置均为替换字符「?」，且注文提供语义「?，临也」，可反推原字为「莅」。属数字化缺陷，性质确定。',
   need='若需确认刻本用字为「莅」或「涖」，需影印页',
   action='标 ocr_defect；展示层用「莅」并保留注文', human=False),
 'VL-0114': dict(ev='A', p='P2', src='orthographic_variant',
   canon='犹桮棬也', note='犹桮桊也',
   basis='注本自注「桮，音杯。桊，丘圆反」，注文与经文一致，可证注本作「桊」，为「棬」之异体，非讹误。',
   need='', action='判为异体字', human=False),
 'VL-0115': dict(ev='A', p='P2', src='orthographic_variant',
   canon='犹以杞柳为桮棬', note='犹以杞柳为桮桊', basis='同上。', need='', action='判为异体字', human=False),
 'VL-0116': dict(ev='A', p='P2', src='orthographic_variant',
   canon='子能顺杞柳之性而以为桮棬乎', note='……桮桊乎', basis='同上。', need='', action='判为异体字', human=False),
 'VL-0117': dict(ev='A', p='P2', src='orthographic_variant',
   canon='如将戕贼杞柳而以为桮棬', note='……桮桊', basis='同上。', need='', action='判为异体字', human=False),
 'VL-0130': dict(ev='A', p='P2', src='orthographic_variant',
   canon='尧、舜率天下以仁；桀、纣率天下以暴', note='尧舜帅天下以仁；桀纣帅天下以暴',
   basis='率/帅 古通用（帅为率之或体），且注本无顿号属标点层差异，不影响句义。字形可对照。',
   need='', action='判为异体字 + 标点差异，分别记录', human=False),
 'VL-0131': dict(ev='A', p='P1', src='textual_variant',
   canon='辟则为天下戮矣', note='辟则为天下僇矣',
   basis='注本自注「僇，与戮同」，注文明确给出通假关系，可证注本作「僇」且为「戮」之通假，性质可确认。',
   need='', action='判为通假异文，confirmed_scope=difference_nature；不判正误', human=False),
 'VL-0132': dict(ev='A', p='P1', src='ocr_defect',
   canon='若有一个臣', note='若有一?臣，注文亦作「?，古贺反，书作介」',
   basis='经文与注文均为替换字符「?」，注文「书作介」提供旁证（《尚书》作「介」），可推原字为「个」。属数字化缺陷。',
   need='', action='标 ocr_defect；展示层用「个」并保留注文', human=False),
 'VL-0133': dict(ev='A', p='P2', src='orthographic_variant',
   canon='实能容之', note='寔能容之',
   basis='实/寔 异体通用，字形可对照。', need='', action='判为异体字', human=False),
 'VL-0134': dict(ev='B', p='P1', src='textual_variant',
   canon='媢嫉以恶之', note='媢疾以恶之',
   basis='「媢嫉」「媢疾」为两种并存的古语形式（《尚书·秦誓》系统作「媢疾」），属实词异文，需版本证据判定。注本自注仅「媢，音冒」「媢，忌也」，未涉「嫉/疾」。',
   need='影印本大学传之十章；并核对《尚书·秦誓》原文用字',
   action='保留待考', human=True),
 'VL-0135': dict(ev='A', p='P2', src='orthographic_variant',
   canon='实不能容', note='寔不能容', basis='同 VL-0133。', need='', action='判为异体字', human=False),
 'VL-0136': dict(ev='A', p='P1', src='orthographic_variant',
   canon='既廪称事', note='既禀称事',
   basis='注本自注「既，许气反。禀，彼锦…反」，注文与经文一致，可证注本作「禀」。廪/禀 为异体通用（皆指廪食），性质可确认。',
   need='', action='判为异体字，confirmed_scope=difference_nature', human=False),
 'VL-0137': dict(ev='B', p='P1', src='textual_variant',
   canon='可壹言而尽也', note='可一言而尽也',
   basis='朱熹《中庸章句》经文用「壹」有特意（与「不贰」对文），注本作「一」可能是传本简化，也可能原典侧误。两载体同源，无独立证据。',
   need='影印本《中庸章句》「天地之道」章，核对刻本作「壹」或「一」',
   action='保留待考；此为朱熹用字习惯问题，价值较高', human=True),
 'VL-0138': dict(ev='A', p='P1', src='textual_variant',
   canon='一拳石之多', note='一卷石之多',
   basis='注本自注「卷，平声」，明确以「卷」读 quán，与「拳」通假。注文自证用字与音读，性质可确认。',
   need='', action='判为通假异文，confirmed_scope=difference_nature', human=False),
 'VL-0139': dict(ev='A', p='P2', src='orthographic_variant',
   canon='待其人然后行', note='待其人而后行',
   basis='「然后」「而后」为同义虚词两种写法，不影响句义，属通行异文。',
   need='', action='判为虚词异文，P2', human=False),
 'VL-0140': dict(ev='B', p='P0', src='textual_variant',
   canon='极高明而中庸（缺「道」）', note='极高明而道中庸',
   basis='原典侧缺「道」字。此句为《中庸》核心命题，「道中庸」的「道」是动词（由、行），缺字直接改变句义与经文完整性，属最高影响等级。注本侧有「道」且上下文完整，但两载体同源，不能据此确认原典底本。',
   need='影印本《中庸章句》「故君子尊德性」章；并核对《礼记·中庸》原文',
   action='最高优先人工处理；在确认前，产品展示一律用「极高明而道中庸」并标注', human=True),
 'VL-0141': dict(ev='A', p='P2', src='orthographic_variant',
   canon='无不复帱', note='无不覆帱',
   basis='复/覆 异体通用（覆帱为固定搭配），字形可对照。',
   need='', action='判为异体字', human=False),
 'VL-0142': dict(ev='B', p='P1', src='textual_variant',
   canon='君子所不可及者（缺「之」）', note='君子之所不可及者',
   basis='原典侧缺结构助词「之」。语义影响小，但涉及经文完整性；两载体同源，无法判定原典底本是否脱字。',
   need='影印本《中庸章句》「潜虽伏矣」章', action='保留待考', human=True),
}

# ---------------------------------------------------------------------------
# 工作单组号映射（组 1-62 ↔ VG-xxx）
WL = os.path.join(BASE, 'raw/commentary/index/variant-review-worklist.md')
# 工作单 80 组：1-62 为多本命中组（每组 2 条），63-80 为单本命中组（每组 1 条）
_wl = re.findall(r'^###\s*(\d+)\.\s*`([A-Z]{2}-\d{3,4})`', open(WL, encoding='utf-8').read(), re.M)
assert len(_wl) == 80, 'worklist 组数应为 80，实际 %d' % len(_wl)
WL_NO = {vg: int(no) for no, vg in _wl}

led = json.load(open(LEDGER, encoding='utf-8'))
targets = [x for x in led['items'] if x.get('status') is None]
assert len(targets) == 62, len(targets)

# 同源判定：四单行本与 sishu 合刻本为同一数字化母本
CARRIER = {
 'lunyu-jizhu': 'same_source:sishu-zhangju-jizhu',
 'mengzi-jizhu': 'same_source:sishu-zhangju-jizhu',
 'daxue-zhangju-jizhu': 'same_source:sishu-zhangju-jizhu',
 'zhongyong-zhangju-jizhu': 'same_source:sishu-zhangju-jizhu',
 'sishu-zhangju-jizhu': 'same_source:sishu-zhangju-jizhu',
}

rows = []
missed = []
for x in targets:
    gid = x.get('group_id')
    key = gid if gid in J else x['ledger_id']
    j = J.get(key)
    if not j:
        missed.append(x['ledger_id']); continue
    rows.append({
      'ledger_id': x['ledger_id'],
      'group_id': gid,
      'worklist_no': WL_NO.get(gid) if gid else WL_NO.get(x['ledger_id']),
      'triage_unit': key,
      'commentary_key': x['commentary_key'],
      'book': x['book'],
      'chapter': x['chapter'],
      'canon_side_text': j['canon'],
      'note_side_text': j['note'],
      'evidence_class': j['ev'],
      'impact_priority': j['p'],
      'suspected_error_source': j['src'],
      'carrier_independence': CARRIER.get(x['commentary_key'], 'unknown'),
      'evidence': j['basis'],
      'required_material': j['need'],
      'recommended_action': j['action'],
      'needs_human': j['human'],
      'confirmed': x.get('confirmed'),
      'status': x.get('status'),
    })

assert not missed, missed

by_class = collections.Counter(r['evidence_class'] for r in rows)
by_p     = collections.Counter(r['impact_priority'] for r in rows)
by_src   = collections.Counter(r['suspected_error_source'] for r in rows)
units    = len(set(r['triage_unit'] for r in rows))
unit_class = collections.Counter({u: next(r['evidence_class'] for r in rows if r['triage_unit']==u) for u in set(r['triage_unit'] for r in rows)})

out = {
 '_note': '注疏层 batch02 剩余 62 条（40 个独立问题）的核校前分流。本文件不修改原台账，不升级 confirmed，不写未经核实的原典文字。evidence_class：A=电子文本内部可判差异性质；B=需影印页；C=材料不足。impact_priority：P0=影响经文含义/完整性/展示正确性，P1=实词句义注家解释，P2=普通异体通用字，P3=纯技术性。',
 '_schema': {
   'ledger_id': '对应 variant-ledger.json 的线索编号',
   'group_id': '同一差异被多个注本命中时的归并组；单条为 null',
   'worklist_no': 'variant-review-worklist.md 的组号（1-80）：1-62 多本组、63-80 单条组',
   'triage_unit': '本次分流的处理单元（组号或单条 ledger_id）；同单元各条共享同一判定',
   'canon_side_text': '原典侧实际写法（经本次核对）',
   'note_side_text': '注本侧实际写法（经本次核对）',
   'evidence_class': 'A / B / C',
   'impact_priority': 'P0 / P1 / P2 / P3',
   'suspected_error_source': 'textual_variant / orthographic_variant / phonetic_loan / commentator_error / ocr_defect / source_excerpt_issue / mixed / unknown',
   'carrier_independence': 'same_source:<载体> 表示与另一载体同一数字化母本；independent 表示独立；unknown 表示未推定',
   'evidence': '判定依据',
   'required_material': 'B 类必填：需要查阅的具体版本、篇章、位置',
   'recommended_action': '建议动作',
   'needs_human': '是否需要人工介入',
   'confirmed': '原台账值，原样复制，未改动',
   'status': '原台账值，原样复制，未改动',
 },
 'stats': {
   'records': len(rows),
   'triage_units': units,
   'by_evidence_class': dict(by_class),
   'by_evidence_class_units': dict(collections.Counter(unit_class.values())),
   'by_impact_priority': dict(by_p),
   'by_error_source': dict(by_src),
   'needs_human': sum(1 for r in rows if r['needs_human']),
   'needs_human_units': len(set(r['triage_unit'] for r in rows if r['needs_human'])),
 },
 'carrier_relation': {
   'verdict': 'same_source',
   'detail': 'sishu-zhangju-jizhu.txt 与 lunyu-jizhu / mengzi-jizhu / daxue-zhangju-jizhu / zhongyong-zhangju-jizhu 为同一文本母本。20 字滑窗单向命中率：lunyu 99.6%、mengzi 98.8%、zhongyong 89.8%、daxue 76.2% 的窗口都能在 sishu 中找到；反向 sishu 只有 38.3% 落在 lunyu、46.9% 落在 mengzi（差额为目录、序说、注文等 sishu 独有部分）。四单行本几乎是 sishu 的子集，方向是 sishu → 单行本，不是两个独立来源。22 个成组单元的两条记录 differs 与 canon_snippet 完全一致（0 组不同）。',
   'postprocess_differs': '两载体的缺字标记方式不同：lunyu 与 sishu 用替换字符「?」（lunyu 17 处、sishu 74 处、daxue 2 处、zhongyong 1 处），mengzi 不用「?」而改用编辑说明文字「*」（6 处，如「**（左“鸟”右“倪”之右）」）。这说明文本内容同源但经过不同的后处理流程；该差异只在格式层，不构成文本层互证。',
   'implication': '本批 62 条中 44 条为同源重复记录，实际独立问题只有 40 个；任何依赖「两个电子本同现」升级证据强度的做法在本批全部失效。此前把「两本同现」当作 strong 依据的判法，在本批必须全部降级。',
 },
 'items': rows,
}

json.dump(out, open(OUT,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print('written', OUT)
print(json.dumps(out['stats'], ensure_ascii=False, indent=1))
