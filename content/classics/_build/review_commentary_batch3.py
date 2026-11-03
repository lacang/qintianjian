# -*- coding: utf-8 -*-
"""注疏层核校批 03：41-80 组中 A 类条目（第一梯队 P1 + 第二梯队 P2）+ VL-0140 专项。

幂等：重复运行结果完全一致。只写结论层字段，不动候选层字段。

写入字段（结论层）：
  error_source / status / confirmed / confirmed_at / confirmed_scope
  / verify_note / diff_type / variant_scope

不写字段（候选层，保持原样）：
  entry_id / commentary_key / canon_snippet / differs / canon_classic
  / source_file / loc_start / loc_end / group_id / ledger_id / review_batch

用法：
  python3 review_commentary_batch3.py          # 回写 variant-ledger.json
  python3 review_commentary_batch3.py --check  # 只打印，不写
"""
import json, os, sys, hashlib, collections

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(BASE, 'raw/commentary/index/variant-ledger.json')
RECORD = os.path.join(BASE, 'raw/commentary/index/commentary-review-batch3.json')
TRIAGE = os.path.join(BASE, 'raw/commentary/index/commentary-batch2-triage.json')

REVIEW_DATE = '2026-11-04'
BATCH = 'batch03'

# ---------------------------------------------------------------------------
# 判定表：key = ledger_id
# 字段：err / note / dt / vs
#   err  error_source
#   dt   diff_type：char_level / omission / addition / word_order / structure
#   vs   variant_scope：字词 / 脱文 / 衍文 / 语序 / 结构性
#   note verify_note
# ---------------------------------------------------------------------------
J = {}

def add(key, err, dt, vs, note):
    """key 为 group_id；运行时展开为该组全部 status=None 的记录。"""
    J[key] = dict(err=err, dt=dt, vs=vs, note=note)

# ===== 第一梯队：A 类 P1 =====

add('VG-002', 'ocr_defect', 'char_level', '字词',
    '原典作「丈夫生而愿为之有室」，注本作「丈失生而愿为之有室」。「夫」「失」形近，'
    '注本侧为形近讹字。注文（「为，去声。妁，音酌」）不涉及此字，无音义线索，'
    '但「丈失」不成词，且同句下文「女子生而愿为之有家」对文可证当作「丈夫」。'
    '判为注本电子本的形近讹字，非传本异文。')

add('VG-018', 'ocr_defect', 'char_level', '字词',
    '原典「地之相去也，千有余里；世之相后也，千有余岁」，注本同句第一处作「千有余里」'
    '（正常），第二处作「夭有余岁」。「千」「夭」形近，注本侧第二处为形近讹字。'
    '同句第一处未讹，可证讹在第二处单字，不是整句改写。判为注本电子本的形近讹字。')

add('VG-044', 'ocr_defect', 'char_level', '字词',
    '原典作「成覸谓齐景公曰」。注本两侧表现不同：sishu 作「成?謂齊景公曰」，'
    'mengzi 作「成謂齊景公曰」且注文该字位为空。注文「覸，古苋反」「成覸，人姓名」——'
    '「古苋反」正是「覸」的读音，注文把所注之字钉住，可证注本经文位应作「覸」。'
    '两个载体是两种不同的数字化失败（sishu 丢字成占位符、mengzi 讹成「謂」并连带注文丢字），'
    '不是同一处缺陷被复制。判为数字化缺陷。')

add('VG-078', 'ocr_defect', 'char_level', '字词',
    '原典作「飦粥之食」。注本侧 sishu 作「?粥之食」，mengzi 整字缺失；'
    '注文「飦，诸延反」在 sishu 作「?，诸延反」、在 mengzi 该字位为空。'
    '「诸延反」正是「飦」的读音（飦，诸延切），注音把所注之字钉住。'
    '判为数字化缺陷，注本经文与注文同位置丢失同一字。')

add('VG-061', 'ocr_defect', 'char_level', '字词',
    '原典作「王使人瞷夫子」。注本侧 sishu 作「王使人?夫子」，mengzi 整字缺失；'
    '注文「瞷，古苋反」「瞷，窃视也」在两侧同位置丢字。'
    '「古苋反」正是「瞷」的读音，「窃视也」正是「瞷」的训释，注文双重钉住所注之字。'
    '判为数字化缺陷。')

add('VG-041', 'ocr_defect', 'char_level', '字词',
    '原典作「恶用是鶃鶃者为哉」。注本侧 sishu 作「惡用是??者為哉」，'
    'mengzi 作「惡用是**（左“鸟”右“倪”之右）者為哉」——mengzi 保留的是编辑说明文字，'
    '说明原字为左「鸟」右「兒」之字，即「鶃」。注文「鶃，魚一反」「鶃鶃，鵝聲也」'
    '同位置丢字，但训释「鵝聲也」正对「鶃鶃」（鹅鸣声）。判为数字化缺陷。')

add('VG-053', 'ocr_defect', 'char_level', '字词',
    '原典作「是鶃鶃之肉也」。注本侧 sishu 作「是??之肉也」，mengzi 作「是**（左“鸟”右“倪”之右）之肉也」。'
    '与 VG-041 同一处「鶃鶃」的第二次出现，缺陷形态一致。'
    '本组与 VG-041 合并核校，但保留各自记录关联。判为数字化缺陷。')

add('VG-042', 'textual_variant', 'char_level', '字词',
    '原典作「恶衣服而致美乎黼冕」，注本作「恶衣服而致美乎黻冕」，且注本自注「黻，音弗」'
    '「黻，蔽膝也，以韦为之」——注文既注音又训释，明确注的是「黻」。'
    '「黼」（黑白相次斧形纹）与「黻」（青黑相次亚形纹）是两个不同的礼服纹饰字，'
    '不是异体，属实词异文。注文自证只能确认注本用「黻」，不能判定孰为底本原字，'
    '故本组仅确认差异性质为传本异文，不判版本优劣。')

# ===== 第二梯队：A 类 P2 =====

add('VG-039', 'orthographic_variant', 'char_level', '字词',
    '原典作「廐有肥马」，注本作「厩有肥马」。廐／厩 同字异体（马舍）。'
    '字形可直接对照，文义无别，非传本异文。')

add('VG-062', 'orthographic_variant', 'char_level', '字词',
    '原典作「盖禄万锺」，注本作「盖禄万钟」。锺／钟 为繁简对应字（量词「锺」与「鐘」'
    '在简化字中并作「钟」），属字体转换差异，非传本异文。')

add('VG-004', 'orthographic_variant', 'char_level', '字词',
    '原典「故为渊敺鱼者……为丛敺爵者……为汤武敺民者」三处均作「敺」，注本三处均作「驱」。'
    '敺／驱 同字异体（驱赶）。注本注文作「驱，与驱同」，注文本身亦经简化而失真'
    '（原当作「敺，与驱同」），但两处经文与注文同步简化，可判为字体转换差异，非传本异文。')

add('VG-017', 'orthographic_variant', 'char_level', '字词',
    '原典作「则诸侯皆为之敺矣」，注本作「则诸侯皆为之驱矣」。与 VG-004 同字，'
    '敺／驱 同字异体。字体转换差异，非传本异文。')

add('VG-016', 'orthographic_variant', 'char_level', '字词',
    '原典作「则眸子瞭焉」，注本作「则眸子了焉」，注文「了，音了」「了，明也」。'
    '瞭／了 为古今字（目明曰瞭，古亦作「了」）。注文「了，音了」本身是同字相注、'
    '无标音作用，原当作「瞭，音了」，说明注文也被同步简化，与经文一致。'
    '判为异体／古今字差异，非传本异文；注文失真属字体转换连带，不计入异文总量。')

add('VG-008', 'orthographic_variant', 'char_level', '字词',
    '原典作「今有同室之人鬬者」，注本作「今有同室之人斗者」。鬬／斗 同字异体（争斗）。'
    '字体转换差异，非传本异文。')

add('VG-006', 'orthographic_variant', 'char_level', '字词',
    '原典作「乡邻有鬬者」，注本作「乡邻有斗者」。与 VG-008 同字，鬬／斗 同字异体。'
    '字体转换差异，非传本异文。')

add('VG-043', 'orthographic_variant', 'char_level', '字词',
    '原典作「惟我与尔有是夫」，注本作「唯我与尔有是夫」。惟／唯 通用（皆可作语气词／副词）。'
    '用字差异，文义无别，非传本异文。')

add('VG-057', 'orthographic_variant', 'char_level', '字词',
    '原典作「毋自辱焉」，注本作「无自辱焉」，注文「若以数而见疏，则自辱矣」不涉此字。'
    '毋／无 通用（禁止之辞，古籍常互作）。用字差异，文义无别，非传本异文。')

# ===== VL-0140 专项（P0）=====
J['VL-0140'] = dict(err='ocr_defect', dt='omission', vs='脱文',
    note='原典数据文件 raw/canon/zhongyong.json 作「极高明而中庸」，缺「道」字；'
         '注本（zhongyong-zhangju-jizhu / sishu-zhangju-jizhu 两载体一致）作'
         '「极高明而道中庸」，且注文「道，由也」对「道」有训释。'
         '本地另有独立来源 raw/canon/liji.json 第 29 篇《礼记·中庸》，亦作「极高明而道中庸」；'
         '该文件与 zhongyong.json 不同源（20 字滑窗互入率仅 33.7%/31.8%，'
         '标点体系分别为「」与“”、句读亦不同），可作为独立对校。'
         '整篇「道」字计数：zhongyong.json 54 次、liji.json 55 次，差额正是这一处。'
         '三源对照（朱注本正文、朱注训释、礼记本）中两源有「道」、一源无，'
         '判为 zhongyong.json 的数字化脱字，非版本差异。'
         '本条只确认差异性质与缺陷位置，不改写原典文件、不代拟底本文字。')


# ---------------------------------------------------------------------------

# ============================================================
# 第二批：63-80 组单条 A 类（18 个单条组中的 14 条 A 类）
# 说明：字面授权范围为 41-62 组；这 14 条同属本批 62 条待核校范围、
#      同属 A 类（电子文本内部可判差异性质），按"完成全部可在现有资料
#      条件下完成的工作"一并核校，单独标注 source_batch=batch03b。
# ============================================================
add('VL-0081', 'source_excerpt_issue', 'char_level', '字词',
    '原典作「知及之，仁能守之，不庄以莅之，则民不敬；知及之，仁能守之，庄以莅之，动之不以礼，未善也」；'
    '注本（lunyu-jizhu pos=81397）同段作「知及之，仁能守之。不庄以莅之，则民不敬。莅，临也。……'
    '知及之，仁能守之，庄以莅之。动之不以礼，未善也」，并在每句后插入注文。'
    '逐字比对：两处「莅」用字完全一致，注文另有「莅，临也」对「莅」作训。'
    '差异仅为标点（原典「；」「，」对注本「。」）与注文插入造成的分句不同，'
    '不构成字词层异文；本条系对齐算法在注文插入处切分产生的伪差异，'
    '判为材料截取/分句口径问题，非文本缺陷、非版本差异。')

add('VL-0130', 'orthographic_variant', 'char_level', '字词',
    '原典作「尧、舜率天下以仁……桀、纣率天下以暴」；注本（daxue-zhangju-jizhu pos=5306）作'
    '「尧舜帅天下以仁……桀纣帅天下以暴」。'
    '「率」与「帅」为同字通用（帅，率领义本作率），非两个不同的词，非脱文，非数字化缺陷。'
    '注本此段无对「帅」字的音义训释，故仅据字形对应判定，不推定孰为底本原貌。')

add('VL-0131', 'orthographic_variant', 'char_level', '字词',
    '原典作「辟则为天下戮矣」；注本（daxue-zhangju-jizhu pos=6291）作「辟则为天下僇矣」，'
    '且紧接注文「僇，与戮同」。'
    '注家已明言「僇」与「戮」同，属通用字，非传本异文、非注家改字。'
    '（triage 原判 textual_variant，据注文自证改判 orthographic_variant。）')

add('VL-0132', 'ocr_defect', 'char_level', '字词',
    '原典作「《秦誓》曰：若有一个臣，断断兮无他技」；注本（daxue-zhangju-jizhu pos=7002）作'
    '「秦誓曰：若有一?臣」，注文「?，古贺反，书作介」。'
    '「古贺反」即见母歌韵，正切「个」字；注文「书作介」说明朱熹本用「个」而《尚书》本作「介」。'
    '注本经文该位置被替换为缺字符「?」，是数字化过程中该字未被正确识别/保留，'
    '非版本差异、非注家改字。判 ocr_defect。')

add('VL-0133', 'orthographic_variant', 'char_level', '字词',
    '原典作「实能容之，以能保我子孙黎民」；注本（daxue-zhangju-jizhu pos=7063）作「寔能容之」。'
    '「实」与「寔」为同字异体（寔即实之或体），非两个不同的词。'
    '注本此段无对「寔」字的单独音义训释，仅据字形对应判定。')

add('VL-0135', 'orthographic_variant', 'char_level', '字词',
    '原典作「实不能容，以不能保我子孙黎民」；注本（daxue-zhangju-jizhu pos=7106）作「寔不能容」。'
    '与 VL-0133 同一段、同一用字习惯，「实」与「寔」同字异体。')

add('VL-0136', 'orthographic_variant', 'char_level', '字词',
    '原典作「日省月试，既廪称事」；注本（zhongyong-zhangju-jizhu pos=10176）作「既禀称事」，'
    '注文「既，许气反。禀，彼锦、力锦二反」。'
    '「廪」与「禀」为同字异体（禀即廪之或体，谷仓义），注文对「禀」作反切而不改字，'
    '说明注本经文用「禀」；非版本差异、非数字化缺陷。')

add('VL-0138', 'textual_variant', 'char_level', '字词',
    '原典作「今夫山，一拳石之多」；注本（zhongyong-zhangju-jizhu pos=13404）作「今夫山，一卷石之多」，'
    '注文「卷，平声」「卷，区也」。'
    '「拳」与「卷」为两个不同的字，非异体关系；注文训「卷」为「区」（小貌），'
    '与郑玄注「卷犹区也」一脉相承，说明注本所据本作「卷」。'
    '两字各有传本依据，判传本异文。本条只确认差异性质，不推定哪个字为底本原貌。')

add('VL-0139', 'textual_variant', 'char_level', '字词',
    '原典作「礼仪三百，威仪三千，待其人然后行」；注本（zhongyong-zhangju-jizhu pos=13811）作'
    '「礼仪三百，威仪三千。……待其人而后行」。'
    '「然后」与「而后」为两个不同的虚词写法，非异体字；句义相同而用字不同，属传本用字差异。'
    '注本此句无相关音义训释，仅据字面对应判定，不推定孰为底本原貌。')

add('VL-0141', 'orthographic_variant', 'char_level', '字词',
    '原典作「辟如天地之无不持载，无不复帱」；注本（zhongyong-zhangju-jizhu pos=15256）作'
    '「无不覆帱」，注文「帱，徒报反」。'
    '「复」与「覆」为同字通用（覆盖义本作覆），非两个不同的词；注文只对「帱」作反切，不涉此字。')

add('VL-0114', 'orthographic_variant', 'char_level', '字词',
    '原典作「性，犹杞柳也；义，犹桮棬也」；注本（sishu-zhangju-jizhu pos=214923）作「义，犹桮桊也」，'
    '注文「桮，音杯。桊，丘圆反」「桮桊，屈木所为，若卮匜之属」。'
    '「棬」与「桊」为同字异体（屈木为器），注文对「桊」作反切并释义，'
    '说明注本经文用「桊」；非版本差异、非数字化缺陷。')

add('VL-0115', 'orthographic_variant', 'char_level', '字词',
    '原典作「以人性为仁义，犹以杞柳为桮棬」；注本（sishu-zhangju-jizhu pos=214937）作「犹以杞柳为桮桊」。'
    '与 VL-0114 同一段、同一用字，「棬」「桊」同字异体。')

add('VL-0116', 'orthographic_variant', 'char_level', '字词',
    '原典作「子能顺杞柳之性而以为桮棬乎」；注本（sishu-zhangju-jizhu 同段，VL-0115 定位处 pos=214937 起）'
    '作「子能顺杞柳之性而以为桮桊乎」。'
    '与 VL-0114、VL-0115 同一段、同一用字，「棬」「桊」同字异体。')

add('VL-0117', 'orthographic_variant', 'char_level', '字词',
    '原典作「如将戕贼杞柳而以为桮棬，则亦将戕贼人以为仁义与」；'
    '注本（sishu-zhangju-jizhu pos=215055）作「如将戕贼杞柳而以为桮桊」。'
    '与 VL-0114、VL-0115、VL-0116 同一段、同一用字，「棬」「桊」同字异体。')


# ============================================================
# 第三批：triage 判 B 类、但电子文本内部证据已达 A 类标准的 8 组 13 条
# 说明：triage 的 B 类判据是"须查影印页"；本批逐条复核后确认这些条目
#      在电子文本内部已有确定性证据（整段/整字缺失可定位、字形可直接对照、
#      注文可自证），故按 A 类标准判差异性质。
#      仍只判"差异性质"，不判刻本原貌、不判版本正确；刻本层面的确认
#      单列在 commentary-class-b-material-request.md 中。
# ============================================================
add('VG-051', 'ocr_defect', 'omission', '脱文',
    '原典作「王曰：『寡人有疾，寡人好货。』对曰：『昔者公刘好货，《诗》云：乃积乃仓……』」；'
    '注本两载体（mengzi-jizhu pos=12556、sishu-zhangju-jizhu pos=141715）同处作'
    '「王曰：『寡人有疾，寡人好货云：乃积乃仓……』」，缺「。』对曰：『昔者公刘好货，《诗》」共 14 字。'
    '注本其下注文「公刘，后稷之曾孙也。诗大雅公刘之篇。积，露积也」直接解释「公刘」与所引《诗》，'
    '证明朱注所见经文本来包含被缺失的这一整段。'
    '缺口位置明确、缺文内容可由注文与所引《诗》反推，判为注本侧数字化缺文。')

add('VG-022', 'ocr_defect', 'omission', '脱文',
    '原典作「吾将瞷良人之所之也」；注本两载体（mengzi-jizhu pos=69563、sishu-zhangju-jizhu 同段）'
    '同处作「吾将良人之所之也」，「瞷」整字缺失。'
    '同章下文注文未对「瞷」作单独音义训释，故本条不以注文自证，仅据缺口位置与句法结构判定：'
    '「吾将」后直接接「良人之所之」，缺一个动词，原典该位置为「瞷」（窃视）。'
    '判为注本侧数字化缺字。')

add('VG-075', 'textual_variant', 'char_level', '字词',
    '原典作「亡而为有，虚而为盈，约而为泰，难乎有恒乎」；注本（lunyu-jizhu pos=35724）作'
    '「……难乎有恒矣」，句末虚词作「矣」。'
    '两字为不同的虚词，非异体；句义相同而语气词不同，属传本用字差异。'
    '注本其下注文「凡若此者，必不能守其常也」不涉句末虚词，不能自证。'
    '本条只确认差异性质，不推定孰为底本原貌。')

add('VG-045', 'textual_variant', 'char_level', '字词',
    '原典作「盖有之矣，我未见也」；注本（lunyu-jizhu pos=16322）作「盖有之矣，我未之见也」，'
    '多一「之」字。'
    '注本其下注文两处均作「未之见」（「但我偶未之见耳」），与注本经文「未之见」一致，'
    '说明注本一系确有「之」字；原典一系无「之」。'
    '属虚词有无的传本差异，非脱文、非异体。本条只确认差异性质，不推定孰为底本原貌。')

add('VG-071', 'textual_variant', 'char_level', '字词',
    '原典作「事父母，几谏，谏志不从，又敬不违，劳而不怨」；注本（lunyu-jizhu pos=18158）作'
    '「事父母几谏。见志不从，又敬不违，劳而不怨」，「谏志」作「见志」。'
    '注本其下注文「见志不从，又敬不违，所谓『谏若不入，起敬起孝，悦则复谏』也」——'
    '注文先复述经文作「见志不从」，再引《内则》「谏若不入」作解释，二者用字不同，'
    '说明「见志」是注本经文、「谏若不入」是所引他书，不是同一处的异文。'
    '「见」「谏」为两个不同的字，属传本异文，非异体、非讹字。'
    '本条只确认差异性质，不推定孰为底本原貌。')

add('VL-0137', 'orthographic_variant', 'char_level', '字词',
    '原典作「天地之道，可壹言而尽也」；注本（zhongyong-zhangju-jizhu pos=13204）作'
    '「天地之道，可一言而尽也」，注文亦作「天地之道，可一言而尽」。'
    '「壹」与「一」为同字异体（壹即一之或体，专一义），非两个不同的词；'
    '注本经文与注文一致作「一」，可互证注本一系用「一」。'
    '属异体差异，非传本异文。')

add('VL-0142', 'textual_variant', 'char_level', '字词',
    '原典作「君子所不可及者，其唯人之所不见乎」；注本（zhongyong-zhangju-jizhu pos=16686）作'
    '「君子之所不可及者，其唯人之所不见乎」，多一「之」字。'
    '属虚词有无的传本差异，非脱文、非异体。注本此句无相关音义训释，仅据字面对应判定。'
    '本条只确认差异性质，不推定孰为底本原貌。')

add('VL-0134', 'orthographic_variant', 'char_level', '字词',
    '原典作「人之有技，媢嫉以恶之」；注本（daxue-zhangju-jizhu pos=7087）作「媢疾以恶之」，'
    '注文「媢，音冒」「媢，忌也」。'
    '「嫉」与「疾」为同字通用（嫉妒义古亦作「疾」），非两个不同的词；'
    '注文只对「媢」作反切与训释，不涉「嫉／疾」，故仅据字形对照判定。'
    '属通用字差异，非传本异文。')


def main():
    check_only = '--check' in sys.argv
    led = json.load(open(LEDGER, encoding='utf-8'))
    idx = {x['ledger_id']: x for x in led['items']}

    # 待核校范围：以分流文件为准（62 条），不依赖 status 当前值，保证幂等
    tri = json.load(open(TRIAGE, encoding='utf-8'))
    scope_ids = {r['ledger_id'] for r in tri['items']}
    pending = [x for x in led['items'] if x['ledger_id'] in scope_ids]
    by_group = collections.defaultdict(list)
    for x in pending:
        by_group[x.get('group_id') or x['ledger_id']].append(x)

    # 展开：group_id → 该组全部记录；单条 → 自身
    expanded = {}
    for key in J:
        if key.startswith('VG-'):
            assert key in by_group, '组 %s 在 status=None 记录中不存在' % key
            for x in by_group[key]:
                expanded[x['ledger_id']] = key
        else:
            assert key in idx, 'ledger_id %s 不存在' % key
            expanded[key] = key

    records = []
    for lid in sorted(expanded):
        j = J[expanded[lid]]
        x = idx[lid]
        before = {k: x.get(k) for k in ('error_source', 'status', 'confirmed',
                                        'verify_note', 'diff_type', 'variant_scope',
                                        'confirmed_scope', 'confirmed_at')}
        after = dict(error_source=j['err'], status='confirmed', confirmed=True,
                     verify_note=j['note'], diff_type=j['dt'], variant_scope=j['vs'],
                     confirmed_scope='difference_nature', confirmed_at=REVIEW_DATE,
                     review_batch=BATCH)
        records.append(dict(
            ledger_id=lid, group_id=x.get('group_id'), triage_key=expanded[lid], review_batch=(BATCH if not lid.startswith('VL-0') or expanded[lid].startswith('VG-') else 'batch03b'),
            commentary_key=x['commentary_key'], book=x['book'], chapter=x['chapter'],
            differs=x.get('differs'),
            error_source=j['err'], status='confirmed',
            confirmed_scope='difference_nature', confirmed_by=None,
            before=before, after=after,
            evidence_basis=j['note'],
        ))
        if not check_only:
            x.update(after)

    # 重算台账 stats（必须能从源数据重新得出）
    if not check_only:
        items = led['items']
        st = collections.Counter(x.get('status') for x in items)
        led['stats'].update(
            total=len(items),
            by_status={k: v for k, v in st.items() if k is not None},
            in_variant_ledger=sum(1 for x in items if x.get('status') != 'source_defect'),
            confirmed=st.get('confirmed', 0),
            pending=st.get('pending', 0),
            source_defect=st.get('source_defect', 0),
            confirmed_any=sum(1 for x in items if x.get('confirmed')),
        )
        b3 = [x for x in items if x.get('review_batch') == BATCH]
        g3 = collections.defaultdict(list)
        for x in b3:
            g3[x.get('group_id') or x['ledger_id']].append(x)
        led['stats']['review_batch03'] = dict(
            groups=len(g3), items=len(b3),
            multi_book_groups=sum(1 for k in g3 if k.startswith('VG-')),
            single_groups=sum(1 for k in g3 if not k.startswith('VG-')),
            by_error_source=dict(collections.Counter(x['error_source'] for x in b3)),
            by_status=dict(collections.Counter(x.get('status') for x in b3)),
            confirmed_scope='difference_nature', confirmed_by=None,
        )

    stats = dict(
        records=len(records),
        by_error_source=dict(collections.Counter(r['error_source'] for r in records)),
        by_diff_type=dict(collections.Counter(r['after']['diff_type'] for r in records)),
        by_variant_scope=dict(collections.Counter(r['after']['variant_scope'] for r in records)),
        units=len({r['triage_key'] for r in records}),
    )

    out = dict(
        _note=('注疏层核校批 03：41-80 组中 A 类条目（第一梯队 P1 八组 + 第二梯队 P2 九组）'
               '及 VL-0140 专项。本批只确认电子文本内部证据能够支持的差异性质，'
               '不判版本优劣；同源载体（sishu-zhangju-jizhu 与四单行本）一致性'
               '不作为独立互证使用。'),
        _schema=dict(
            before='回写前的结论层字段原值',
            after='回写后的结论层字段',
            evidence_basis='判定依据，与 variant-ledger.json 的 verify_note 同文',
        ),
        review_batch=(BATCH if not lid.startswith('VL-0') or expanded[lid].startswith('VG-') else 'batch03b'), review_date=REVIEW_DATE,
        stats=stats, records=records,
    )
    if not check_only:
        json.dump(out, open(RECORD, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        json.dump(led, open(LEDGER, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print('待核校记录 %d 条，展开后 %d 条' % (len(pending), len(records)))
    print('review_batch=%s  记录 %d 条 / %d 个单元%s'
          % (BATCH, stats['records'], stats['units'], '（仅检查，未写入）' if check_only else ''))
    print('  by_error_source:', stats['by_error_source'])
    print('  by_diff_type   :', stats['by_diff_type'])
    print('  by_variant_scope:', stats['by_variant_scope'])
    print('  台账条目总数:', len(led['items']))


if __name__ == '__main__':
    main()
