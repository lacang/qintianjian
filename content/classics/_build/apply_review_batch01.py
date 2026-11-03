"""把主人对核校批 01（前 20 组）的裁决写回异文台账。

职责：读 `raw/commentary/index/variant-ledger.json`，按组写入
      diff_type / error_source / variant_scope / status / confirmed / verify_note，
      并把「源文件缺字」三组同步到 `source-defect-ledger.json`。
数据来源：主人的逐组裁决（2026-11-02 20:33）。
对外接口：`python3 apply_review_batch01.py`（幂等，可重复跑）
副作用：改 variant-ledger.json、写 source-defect-ledger.json。

**为什么另立 error_source 字段，不改 diff_type 的语义**：
`diff_type` 记的是「文本差异长什么样」（字词 / 脱文 / 衍文 / 语序 / 结构），
`error_source` 记的是「这个差异该归到哪一类来源」。后者才是这批核校真正要建立的区分：

    textual_variant        古代传本之间确实存在的文字差异
    orthographic_variant   异体字、通用字
    phonetic_loan          通假、借字、古今字（有注音证据）
    commentator_error      注本自身讹误
    ocr_defect             数字化过程产生的缺字/错字
    source_excerpt_issue   材料截取或窗口不全，暂不能当异文
    unknown                材料不足，待考

四种来源混在一起，做出来的就是一个看起来很完整、实际不断制造错误的数据库。

**confirmed 的含义**：现有材料足以确认「差异性质或问题归属」，
不等于已证明某个字是古本原貌。没看底本影印页的，不写成版本学结论。
"""
import io, json, os
from collections import Counter, defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(BASE, 'raw', 'commentary', 'index')
LEDGER = os.path.join(IDX, 'variant-ledger.json')
DEFECT = os.path.join(IDX, 'source-defect-ledger.json')

BY = 'owner'
AT = '2026-11-02'
BATCH = 'batch01'

# 按组下达的裁决。confirmed_scope=group 表示主人按组判，组内两个注本同判；
# 若日后单独核校某一注本发现不同，必须拆开——同组命中不等于同组结论。
R = {
    'VG-050': dict(error_source='textual_variant', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='幡/翻 字词异文。两字均能成义，注本未出校，不能凭现代常用写法判正误。'),
    'VG-055': dict(error_source='textual_variant', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='未/末 字词异文，疑形近讹写。语境应作「未闻」，但须区分注本底本原刻与 OCR 识别错误。'),
    'VG-009': dict(error_source='textual_variant', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='伋/急 人名字词异文，疑讹写。伋为子思之名，语境支持「伋」，注本是否原刻作「急」须核影印本。'),
    'VG-023': dict(error_source='textual_variant', diff_type='char_level', scope='字词',
                   status='confirmed', confirmed=True,
                   note='底/砥 字词异文，有注本自证：注文明言「底，诗作砥」「底，与砥同，砺石也」。'
                        '正文作底而所引《诗》作砥，是有价值的传本文字差异，不归为错字。'),
    'VG-070': dict(error_source='phonetic_loan', diff_type='char_level', scope='用字',
                   status='confirmed', confirmed=True,
                   note='汝/女 通假、借字关系，有注音证据：注本自注「女，音汝」。古代用字现象，不是简单错字。'),
    'VG-011': dict(error_source='orthographic_variant', diff_type='char_level', scope='用字',
                   status='confirmed', confirmed=True,
                   note='朝庭/朝廷 字形、用字差异。现有材料足以确认两侧写法不同，但不足以认定「庭」为讹字。'),
    'VG-072': dict(error_source='textual_variant', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='蹜蹜/缩缩 字词异文。注本有「缩，色六反」只说明读音，不足以证明两字在此处的版本关系。'),
    'VG-024': dict(error_source='orthographic_variant', diff_type='char_level', scope='用字',
                   status='confirmed', confirmed=True,
                   note='唯/惟 通用字异文。两种写法古籍均有用例，记录为用字差异，不判正误。'),
    'VG-031': dict(error_source='phonetic_loan', diff_type='char_level', scope='用字',
                   status='confirmed', confirmed=True,
                   note='太/大 古今字、借字关系，有注音证据：注本自注「大，音泰」，且三处均作「大庙」。'),
    'VG-038': dict(error_source='orthographic_variant', diff_type='char_level', scope='用字',
                   status='pending', confirmed=False,
                   note='棁/梲 字形异文。二字形体接近，但是否属异体关系、传本差异，仍需字书或版本依据。'),
    'VG-054': dict(error_source='textual_variant', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='蹴/蹙 字词异文。不能凭字形或现代语感合并，须查字书及版本。同段另有「艴然」，三字各指不同神态。'),
    'VG-067': dict(error_source='textual_variant', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='智慧/智能 字词异文。语义相近不等于可互换，须核对其他传本。'),
    'VG-015': dict(error_source='ocr_defect', diff_type=None, scope='缺段',
                   status='source_defect', confirmed=True,
                   note='出吊于东郭氏 源文件连续文本缺失，不是传本异文。回查 L46–L62 确认：L48 单行 1311 字，'
                        '原文作「孟子亦以疾辞也。明“昔者辞以病，今日吊，或者不可乎？”」，'
                        '「明」后直接接引号，缺「日，出吊于东郭氏，公孙丑曰：‘」；'
                        '同行注文仍释「东郭氏，齐大夫家也」「辞疾而出吊」，注文与经文不匹配。'
                        '可确认的是源文件缺失，不是原始底本如何排版。已移入 source-defect-ledger.json SD-0002。'),
    'VG-079': dict(error_source='mixed', diff_type=None, scope='混合',
                   status='pending', confirmed=False,
                   note='拆为两个子问题，不合并成一个差异性质：'
                        'A 餽/馈——字形、用字差异；B「七十」后缺「镒」——疑似脱字或 OCR 缺失。'
                        '同句后半有「馈五十镒」，前半缺「镒」，B 须重点核查影印本。'
                        '部分确认不能整组标 confirmed。',
                   sub_issues=[
                       dict(sub_id='VG-079-A', error_source='orthographic_variant',
                            diff_type='char_level', scope='用字',
                            a='餽', b='馈', confirmed=True,
                            note='字形、用字差异。'),
                       dict(sub_id='VG-079-B', error_source='unknown',
                            diff_type='omission', scope='缺字',
                            a='七十镒', b='七十', confirmed=False,
                            note='疑似缺字或 OCR 缺失，待查影印本。同句后半作「馈五十镒」。'),
                   ]),
    'VG-034': dict(error_source='ocr_defect', diff_type=None, scope='缺字',
                   status='source_defect', confirmed=True,
                   note='蚔鼃/蚔␣ 源文件缺字，不是传本异文。独立证据：注本自注「蚔，音迟。␣，乌花反」，'
                        '「乌花反」正是「蛙」的音，说明底本此处有字，缺的是源文件。已移入 source-defect-ledger.json SD-0001。'),
    'VG-068': dict(error_source='ocr_defect', diff_type=None, scope='缺字',
                   status='source_defect', confirmed=True,
                   note='同 VG-034，源文件缺字。三条同源，统一处理。已移入 SD-0001。'),
    'VG-046': dict(error_source='ocr_defect', diff_type=None, scope='缺字',
                   status='source_defect', confirmed=True,
                   note='同 VG-034，源文件缺字。三条同源，统一处理。已移入 SD-0001。'),
    'VG-013': dict(error_source='orthographic_variant', diff_type='char_level', scope='用字',
                   status='confirmed', confirmed=True,
                   note='锺/钟 字形、用字差异，注本自注「万钟，谷禄之数也。钟，量…」。作为古籍用字差异保留，不判错。'),
    'VG-037': dict(error_source='commentator_error', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='尹士/君士 注本内部矛盾：正文作「君士」，同段注文作「尹士，齐人也」。矛盾很强，但须确认原始注本刻写。'),
    'VG-014': dict(error_source='commentator_error', diff_type='char_level', scope='字词',
                   status='pending', confirmed=False,
                   note='决/袂 注本内部疑讹：同句前后结构平行，前作「决」后作「袂」，疑注本讹写或 OCR 错误。须原始页面确认。'),
}

# 回查 L46–L62 的原始结果。只记事实。
INTEGRITY_CHECK_015 = dict(
    checked_at=AT,
    checked_by='agent',
    range='mengzi-jizhu.txt L46–L62（本章 L48 为单行 1311 字）',
    finding='L48 原文作「孟子亦以疾辞也。明“昔者辞以病，今日吊，或者不可乎？”」，'
            '「明」后直接接引号，缺「日，出吊于东郭氏，公孙丑曰：‘」。'
            '同行注文仍释「东郭氏，齐大夫家也」「辞疾而出吊」，注文与经文不匹配。',
    conclusion='可确认的是源文件缺失，不是原始底本如何排版。已改判 ocr_defect，迁入 SD-0002。',
)

# 源文件缺陷台账：两种 kind 共用一套结构，kind 决定哪些字段必填。
#   missing_char     单字或少量字符缺失 → 必填 char_expected / char_present
#   missing_passage  连续文字或整段缺失 → 必填 anchor_before / anchor_after /
#                                        expected_text / estimated_missing_chars
# expected_text 一律带 expected_text_is_inferred=true：它是根据现有证据推定的待核文本，
# 不是已核实的原始底本文字。estimated_missing_chars 是估算值，不是精确校勘字数。
DEFECT_OF = {
    'VG-034': 'SD-0001', 'VG-068': 'SD-0001', 'VG-046': 'SD-0001',
    'VG-015': 'SD-0002',
}

DEFECT_RECORDS = [
    dict(
        defect_id='SD-0001',
        kind='missing_char',
        status='open',
        error_source='ocr_defect',
        classic='mengzi',
        commentary='mengzi-jizhu',
        chapter='公孙丑章句下',
        source_file='mengzi-jizhu.txt',
        source_location='L51',
        anchor_before='蚔',
        anchor_after='曰',
        expected_text='鼃',
        expected_text_is_inferred=True,
        estimated_missing_chars=1,
        char_expected='鼃',
        char_present=' ',
        # 同一个字在同一行出现三处，缺的是同一处：记下来，别让人以为只有一个位置。
        occurrences=[
            dict(anchor_before='谓蚔', anchor_after='曰', expected='鼃'),
            dict(anchor_before='蚔', anchor_after='谏于王', expected='鼃'),
            dict(anchor_before='为蚔', anchor_after='，则善矣', expected='鼃'),
        ],
        evidence=[
            '源文件该处为空格，无字',
            '注本自注「蚔，音迟。␣，乌花反」，「乌花反」即「蛙」之音，证明底本此处有字',
            '缺失发生在源文件层，不是传本异文',
        ],
        related_entries=['VL-0028', 'VL-0091', 'VL-0029', 'VL-0092', 'VL-0030', 'VL-0093'],
        related_groups=['VG-034', 'VG-068', 'VG-046'],
        fix=dict(before=None, after=None, basis=None),
        batch=BATCH,
        confirmed_by=BY,
        confirmed_at=AT,
    ),
    dict(
        defect_id='SD-0002',
        kind='missing_passage',
        status='open',
        error_source='ocr_defect',
        classic='mengzi',
        commentary='mengzi-jizhu',
        chapter='公孙丑章句下',
        source_file='mengzi-jizhu.txt',
        source_location='L48',
        anchor_before='明',
        anchor_after='昔者辞以病',
        expected_text='日，出吊于东郭氏，公孙丑曰：',
        expected_text_is_inferred=True,
        estimated_missing_chars=12,
        evidence=[
            '源文件 L48 中「明」字后直接接引号，语句结构不完整',
            '同行注文仍解释「东郭氏，齐大夫家也」「辞疾而出吊」',
            '经文与注文内容不匹配，缺失属原文叙述而非注家有意省略',
        ],
        related_entries=['VL-0026', 'VL-0089'],
        related_groups=['VG-015'],
        fix=dict(before=None, after=None, basis=None),
        batch=BATCH,
        confirmed_by=BY,
        confirmed_at=AT,
    ),
]


def main():
    v = json.load(io.open(LEDGER, encoding='utf-8'))
    items = v['items']

    groups = defaultdict(list)
    for it in items:
        groups[it.get('group_id') or it['ledger_id']].append(it)

    hit = 0
    for gid, r in R.items():
        for it in groups.get(gid, []):
            it['error_source'] = r['error_source']
            it['diff_type'] = r['diff_type']
            it['variant_scope'] = r['scope']
            it['status'] = r['status']
            it['confirmed'] = r['confirmed']
            it['confirmed_by'] = BY if r['confirmed'] else None
            it['confirmed_at'] = AT if r['confirmed'] else None
            it['confirmed_scope'] = 'group' if r['confirmed'] else None
            it['verify_note'] = r['note']
            it['review_batch'] = BATCH
            if r.get('sub_issues'):
                it['sub_issues'] = r['sub_issues']
            if r['status'] == 'source_defect':
                it['moved_to'] = 'source-defect-ledger.json#' + DEFECT_OF[gid]
            if gid == 'VG-015':
                it['integrity_check'] = INTEGRITY_CHECK_015
            hit += 1

    # 统计分三类，不能合成一个「异文总量」：
    # 源文件缺陷不是异文；材料完整性待查也不是异文。
    st = Counter(it.get('status') or 'pending' for it in items)
    v['stats'] = dict(
        total=len(items),
        by_status=dict(st),
        in_variant_ledger=len(items) - st['source_defect'],
        # confirmed 指「仍在异文台账里、性质可确认」的条数。
        # source_defect 那批的性质也已确认（缺字/缺段是事实），但它们不是异文，
        # 不能并进 confirmed 里当异文数用——另记 confirmed_any。
        confirmed=st['confirmed'],
        pending=st['pending'],
        source_defect=st['source_defect'],
        confirmed_any=sum(1 for it in items if it.get('confirmed')),
    )
    v['confirmed_count'] = st['confirmed']
    v['_schema'].update(dict(
        error_source='人工填：textual_variant 传本异文 / orthographic_variant 异体通用字 / '
                     'phonetic_loan 通假借字 / commentator_error 注本讹误 / '
                     'ocr_defect 数字化缺陷 / source_excerpt_issue 材料截取 / mixed 混合 / unknown 待考',
        status='人工填：pending 待考 / confirmed 性质可确认 / '
               'source_defect 源文件缺陷（已移出异文台账）/ integrity_suspected 材料完整性待查',
        confirmed_scope='confirmed 的适用范围。group 表示按组裁决，组内各注本同判；'
                        '日后单独核校某注本发现不同，必须拆开——同组命中不等于同组结论',
        sub_issues='同一组内混有两类问题时拆成子问题，各自带 error_source / confirmed',
    ))
    v['_note'] = ('原典与注本用字不同、但原典侧可证的片段。这些是异文线索，不是已完成的校勘结论。'
                  'batch01（前 20 组）已由主人逐组裁决：6 组性质可确认，10 组待考，'
                  '1 组材料完整性待查，3 组为源文件缺陷已移出异文台账（见 source-defect-ledger.json）。'
                  'confirmed 只代表现有材料足以确认差异性质或问题归属，不代表已证明某字为古本原貌。')

    json.dump(v, io.open(LEDGER, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    d = {
        '_note': '源文件层缺陷记录。与传本异文台账分开：这里记的是「数字化过程把字弄丢了」，'
                 '不是「古人写的字不一样」。'
                 'kind=missing_char 记单字缺失（char_expected / char_present）；'
                 'kind=missing_passage 记连续文本缺失（anchor_before / anchor_after / '
                 'expected_text / estimated_missing_chars）。'
                 'expected_text 是推定的待核文本，不是已核实的底本文字；'
                 'estimated_missing_chars 是估算值。'
                 '修复时填 fix.before / fix.after / fix.basis，并另存修复后版本，'
                 '不覆盖原始文件——源文件修复不等于传本校勘。',
        '_schema': dict(
            kind='missing_char 单字缺失 / missing_passage 连续文本缺失',
            expected_text='推定待核文本，expected_text_is_inferred 恒为 true',
            estimated_missing_chars='估算值，不作精确校勘字数使用',
            fix='before / after / basis 三格，status=open 时全为 null',
            related_entries='关联的 variant-ledger ledger_id，保留历史痕迹，不删除',
        ),
        'items': sorted(DEFECT_RECORDS, key=lambda x: x['defect_id']),
        'count': len(DEFECT_RECORDS),
        'by_kind': {},
    }
    for rec in d['items']:
        d['by_kind'][rec['kind']] = d['by_kind'].get(rec['kind'], 0) + 1
    json.dump(d, io.open(DEFECT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print('写回 %d 条线索（%d 组）' % (hit, len(R)))
    for k, n in sorted(st.items()):
        print('  %-20s %d' % (k, n))
    print('  进入异文台账 %d 条（总 %d，源文件缺陷 %d 条移出）'
          % (v['stats']['in_variant_ledger'], len(items), st['source_defect']))
    print('  台账内 confirmed %d 条；含源文件缺陷的性质确认共 %d 条'
          % (st['confirmed'], v['stats']['confirmed_any']))
    print('源文件缺陷记录 → %s（%d 条：%s）'
          % (os.path.relpath(DEFECT, BASE), d['count'],
             ' / '.join('%s %d' % kv for kv in sorted(d['by_kind'].items()))))


if __name__ == '__main__':
    main()
