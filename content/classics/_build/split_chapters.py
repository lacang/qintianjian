# -*- coding: utf-8 -*-
"""把 raw/canon/ 里的篇级原文切成章级，并做结构完整性校验。

关键原则：切分数量对得上，不等于切分正确。
    《论语》切出 512 段、正好等于通行本 512 章，这只是必要条件，不是充分条件。
    真正要查的是：篇名对不对、篇序对不对、每篇章数对不对、有没有把标题或注释
    混进正文、有没有整行丢失、有没有异常短行（可能是被切断的残句）。

    所以本脚本除了切，还要逐篇报出章数并与通行本核对；对不上的直接失败，
    不静默通过。

输出：
    parsed/canon/<classic>.json   章级结构，供下游 build 使用
    raw/reports/split-<classic>.md 切分报告，人可读，含异常清单
"""
import io
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANON = os.path.join(BASE, 'raw', 'canon')
OUT = os.path.join(BASE, 'parsed', 'canon')
REPORTS = os.path.join(BASE, 'raw', 'reports')

# 《论语》存在两套通行的分章系统，总数都是 512，但篇内分布不同。
# 这不是谁对谁错，是版本差异，必须如实记录而不是强行统一——章号会直接影响
# 产品里「雍也第几章」的显示，用错系统就是错引。
#
#   朱熹《论语集注》本：雍也 28、述而 37、宪问 47
#   杨伯峻《论语译注》本：雍也 30、述而 38、宪问 44
#
# 实测本数据集（chinese-classical-corpus）用的是杨伯峻一系。
LUNYU_ZHUXI = [
    ('学而', 16), ('为政', 24), ('八佾', 26), ('里仁', 26), ('公冶长', 28),
    ('雍也', 28), ('述而', 37), ('泰伯', 21), ('子罕', 31), ('乡党', 27),
    ('先进', 26), ('颜渊', 24), ('子路', 30), ('宪问', 47), ('卫灵公', 42),
    ('季氏', 14), ('阳货', 26), ('微子', 11), ('子张', 25), ('尧曰', 3),
]
LUNYU_YANGBOJUN = [
    ('学而', 16), ('为政', 24), ('八佾', 26), ('里仁', 26), ('公冶长', 28),
    ('雍也', 30), ('述而', 38), ('泰伯', 21), ('子罕', 31), ('乡党', 27),
    ('先进', 26), ('颜渊', 24), ('子路', 30), ('宪问', 44), ('卫灵公', 42),
    ('季氏', 14), ('阳货', 26), ('微子', 11), ('子张', 25), ('尧曰', 3),
]
LUNYU_SYSTEMS = {
    'zhuxi': ('朱熹《论语集注》本', LUNYU_ZHUXI),
    'yangbojun': ('杨伯峻《论语译注》本', LUNYU_YANGBOJUN),
}


def detect_lunyu_system(rows):
    """根据各篇行数判断数据集用的是哪套分章系统。两套都不符则报错。"""
    actual = [len(split_lines(r['content'])) for r in rows]
    for key, (label, table) in LUNYU_SYSTEMS.items():
        if actual == [n for _, n in table]:
            return key, label, []
    # 都不完全匹配：逐篇列出差异，让人看清楚问题在哪
    diff = []
    for i, n in enumerate(actual):
        name = LUNYU_ZHUXI[i][0]
        zx, yb = LUNYU_ZHUXI[i][1], LUNYU_YANGBOJUN[i][1]
        if n not in (zx, yb):
            diff.append(f'《{name}》切出 {n} 行，朱熹本 {zx}、杨伯峻本 {yb}，两套都对不上')
    raise SystemExit('无法识别分章系统：\n  ' + '\n  '.join(diff or ['篇名可能不对']))


# 兼容旧引用
LUNYU_BOOKS = LUNYU_YANGBOJUN

# 孝经 18 章章名（今文本）
XIAOJING_CHAPTERS = [
    '开宗明义', '天子', '诸侯', '卿大夫', '士', '庶人', '三才', '孝治', '圣治',
    '纪孝行', '五刑', '广要道', '广至德', '广扬名', '谏诤', '感应', '事君', '丧亲',
]


def load(cid):
    p = os.path.join(CANON, f'{cid}.json')
    if not os.path.exists(p):
        raise SystemExit(f'缺少 {p}，先跑 fetch_corpus.py')
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


def split_lines(content):
    """按换行切段，丢掉空行。返回原始行列表。"""
    return [ln.strip() for ln in content.split('\n') if ln.strip()]


# 罗马数字序号（周易数据集里混进正文的排版标记）
ROMAN_RE = re.compile(r'^[\u2160-\u217f]+$')


def is_roman_noise(line):
    return bool(ROMAN_RE.match(line.strip()))


def check_anomalies(lines, where):
    """粗查可疑行：过短、含疑似标题标记、含疑似注释标记、混入罗马数字序号。"""
    issues = []
    for i, ln in enumerate(lines, 1):
        if is_roman_noise(ln):
            issues.append((where, i, 'roman_numeral_noise', ln))
            continue
        if len(ln) <= 1:
            issues.append((where, i, 'too_short', ln))
        # 「卷一」「第X」这类是排版标题，不该出现在正文里
        if re.match(r'^(卷[一二三四五六七八九十]+|第[一二三四五六七八九十百]+[章篇节卷]?)\s*$', ln):
            issues.append((where, i, 'looks_like_heading', ln))
        # 「【」多为注文标记
        if ln.startswith('【') or ln.startswith('注：') or ln.startswith('○'):
            issues.append((where, i, 'looks_like_commentary', ln[:40]))
    return issues


def split_lunyu(rows):
    """论语：20 条篇记录，content 按行分章。"""
    if len(rows) != 20:
        raise SystemExit(f'论语篇数异常：{len(rows)}，应为 20')

    syskey, syslabel, _ = detect_lunyu_system(rows)
    table = LUNYU_SYSTEMS[syskey][1]
    print(f'[split] 论语分章系统：{syslabel}')

    chapters, issues = [], []
    for i, rec in enumerate(rows):
        expect_name, expect_count = table[i]
        book = (rec.get('chapter') or '').strip()
        if not book.startswith(expect_name):
            raise SystemExit(f'篇名不符：第 {i+1} 篇数据集是「{book}」，应为「{expect_name}」')
        lines = split_lines(rec['content'])
        if len(lines) != expect_count:
            raise SystemExit(
                f'《{expect_name}》章数不符：切出 {len(lines)}，{syslabel} {expect_count}。')
        issues += check_anomalies(lines, expect_name)
        for j, text in enumerate(lines, 1):
            chapters.append({
                'classic': 'lunyu',
                'book': expect_name,
                'book_index': i + 1,
                'chapter': j,
                'ref': f'论语·{expect_name}{j}',
                'text': text,
                'chapter_system': syslabel,
            })

    # 与另一套系统比，把差异摆出来，不藏
    other = 'zhuxi' if syskey == 'yangbojun' else 'yangbojun'
    for i, (name, n) in enumerate(LUNYU_SYSTEMS[other][1]):
        if n != table[i][1]:
            issues.append((name, '-', 'chapter_system_diff',
                           f'本篇章数：{syslabel} {table[i][1]}，{LUNYU_SYSTEMS[other][0]} {n}'))
    return chapters, issues


def split_xiaojing(rows):
    """孝经：18 条，每条一章。"""
    if len(rows) != 18:
        raise SystemExit(f'孝经章数异常：{len(rows)}，应为 18')
    chapters, issues = [], []
    for i, rec in enumerate(rows, 1):
        name = XIAOJING_CHAPTERS[i - 1]
        lines = split_lines(rec['content'])
        issues += check_anomalies(lines, name)
        chapters.append({
            'classic': 'xiaojing',
            'book': name,
            'book_index': 1,
            'chapter': i,
            'ref': f'孝经·{name}',
            'text': '\n'.join(lines),
        })
    return chapters, issues


def split_flat(cid, rows, name):
    """诗经/周易/礼记等：每条记录本身就是一个单元，不再切。

    周易的原始数据在正文里混了罗马数字序号（ⅰ ⅱ ⅴ …），那是排版标记不是内容。
    这里清掉，但必须计数上报——清洗不能是静默的，否则下次没人知道少了什么。
    """
    chapters, issues = [], []
    dropped = 0
    for i, rec in enumerate(rows, 1):
        lines = split_lines(rec['content'])
        kept = []
        for ln in lines:
            if is_roman_noise(ln):
                dropped += 1
                issues.append((rec.get('chapter') or str(i), '-', 'roman_numeral_dropped', ln))
            else:
                kept.append(ln)
        lines = kept
        issues += check_anomalies(lines, rec.get('chapter') or str(i))
        chapters.append({
            'classic': cid,
            'book': (rec.get('chapter') or '').strip(),
            'book_index': i,
            'chapter': 1,
            'ref': f'{name}·{(rec.get("chapter") or i)}',
            'text': '\n'.join(lines),
        })
    return chapters, issues


# ================================================================
# 2026-11-02 新增：孟子 / 大学 / 中庸 / 老子 / 庄子
#
# 设计原则（来自主人裁决）：
#   1. 原典层只用独立原典文本，不拿注本自带经文替代。
#   2. 朱子本章次只用于交叉比对，不用来改写原典章界。
#   3. 源文件缺陷显式记录，不静默修正，也不假装切分必然正确。
#   4. 版本差异本身就是知识：古本与朱子本结构不同、河上公本与王弼本文字
#      不同，都作为结构化字段保留，而不是抹平。
# ================================================================

# 繁简 / 异体归一表已抽到 cn_norm.py，与 build_commentary_index.py 共用一份。
# 两份表各写一遍必然慢慢漂移，最后出现「切分器能对上、索引对不上」这种极难查的 bug。
from cn_norm import TR, norm  # noqa: E402



_CN = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}


def _cn2i(t):
    """中文数字转整数，支持「一百三十五」这类。"""
    t = (t or '').strip()
    if not t:
        return 0
    if '百' in t:
        a, _, b = t.partition('百')
        return (_CN.get(a, 1) if a else 1) * 100 + (_cn2i(b) if b else 0)
    if '十' in t:
        a, _, b = t.partition('十')
        return (_CN.get(a, 1) if a else 1) * 10 + (_CN.get(b, 0) if b else 0)
    return _CN.get(t, 0)


def _align_heads(paras_norm, heads_norm, lens=(14, 12, 10, 8, 6, 5, 4)):
    """单调贪心对齐：每章只在上一章命中位置之后搜索，前缀长度逐级退化。

    为什么要单调约束：同一句在《孟子》里可能出现两次（弟子重复提问），
    不约束游标会跨卷回跳，把后面的章错配到前面去。
    为什么要多级前缀：源文件有讹字（蚔[鼃]、尹士/君士），长前缀匹配不上，
    退到较短前缀才能命中；但退得太短会误命中，所以从长到短试。
    """
    res, cursor, fails = [], 0, []
    for n, h in enumerate(heads_norm, 1):
        h60 = h[:60]
        best = None
        for L in lens:
            for k in range(cursor, len(paras_norm)):
                p = paras_norm[k]
                if len(p) < 4:
                    continue
                if p[:min(L, len(p))] in h60:
                    best = k
                    break
            if best is not None:
                break
        if best is None:
            fails.append(n)
            res.append((n, None))
        else:
            res.append((n, best))
            cursor = best
    return res, fails


# ---------------------------------------------------------------- 孟子

MENGZI_JUAN = [
    '梁惠王上', '梁惠王下', '公孙丑上', '公孙丑下', '滕文公上', '滕文公下',
    '离娄上', '离娄下', '万章上', '万章下', '告子上', '告子下', '尽心上', '尽心下',
]

# 朱子集注源文件的已知缺陷。每一条都显式记录，并在报告里列出。
# 不静默修正，是因为「源文件缺了一章」本身就是知识——将来若换更好的底本，
# 这些修正必须能被逐条复核，而不是散落在代码里的魔法字符串。
MENGZI_SOURCE_DEFECTS = {
    '告子上': {
        'kind': 'missing_chapter',
        'chapter': 9,
        'canon_anchor': '孟子曰无或乎王之不智也',
        'note': (
            '朱子集注源文件第 8 章末「…惟心之谓与？」与第 9 章首句粘连，'
            '第 9 章「孟子曰：无或乎王之不智也」整章脱漏（源文件只剩「舍，日暴之」以下残句）。'
            '原典有此章，本切分按原典自然段独立成章，章号据卷首「凡二十章」声明回填。'
            '未与朱子本原书核对，状态保留为 pending。'),
    },
    '尽心上': {
        'kind': 'split_row',
        'merge_rows': [41, 42],
        'note': (
            '朱子集注源文件把第 41 章「公孙丑曰：道则高矣，美矣」与'
            '「孟子曰：大匠不为拙工改废绳墨」切成两行，实为一章，此处合并。'),
    },
    '公孙丑下': {
        'kind': 'source_typo',
        'rows': {5: ('孟子谓蚔 曰', '孟子谓蚔鼃曰'), 12: ('君士语人曰', '尹士语人曰')},
        'note': (
            '朱子集注源文件第 5 章脱「鼃」字（作「孟子谓蚔 曰」），'
            '第 12 章「尹士」讹作「君士」。定位时用原典文字替换，原典文字不动。'),
    },
}

_JIZHU_JUAN_RE = re.compile(r'^卷[一二三四五六七八九十]+\s+(\S+章句[上下])')
_JIZHU_DECL_RE = re.compile(r'^\s*凡([一二三四五六七八九十百]+)章')


def _read_jizhu_mengzi():
    """读朱子《孟子集注》，返回 {卷名: {'declared': N, 'heads': [章首句]}}。

    源文件结构：
        卷N  XX章句上／下
        凡N章。
            （四空格缩进）章正文……
    """
    p = os.path.join(BASE, 'raw', 'commentary', 'text', 'mengzi-jizhu.txt')
    if not os.path.exists(p):
        raise SystemExit(f'缺少 {p}，无法做朱子本章次交叉比对')
    lines = io.open(p, encoding='utf-8').read().split('\n')

    out, cur = {}, None
    for ln in lines:
        m = _JIZHU_JUAN_RE.match(ln)
        if m:
            cur = re.sub(r'章句', '', m.group(1))
            out[cur] = {'declared': 0, 'heads': []}
            continue
        if cur is None:
            continue
        m = _JIZHU_DECL_RE.match(ln)
        if m:
            out[cur]['declared'] = _cn2i(m.group(1))
            continue
        if ln.startswith('    ') and ln.strip() and not ln.strip().startswith('凡'):
            out[cur]['heads'].append(ln.strip())
    return out


def _mengzi_fix_heads(juan, info, issues):
    """按源缺陷表修正朱子本章首句列表，返回可用于原典定位的串列表。"""
    heads = list(info['heads'])
    d = MENGZI_SOURCE_DEFECTS.get(juan)
    if not d:
        return heads

    if d['kind'] == 'missing_chapter':
        heads.insert(d['chapter'] - 1, d['canon_anchor'])
        issues.append((juan, d['chapter'], 'jizhu_chapter_missing', d['note']))
    elif d['kind'] == 'split_row':
        a, b = d['merge_rows']
        heads[a - 1] = heads[a - 1] + heads[b - 1]
        del heads[b - 1]
        issues.append((juan, a, 'jizhu_row_split_merged', d['note']))
    elif d['kind'] == 'source_typo':
        for n, (bad, good) in sorted(d['rows'].items()):
            if n - 1 < len(heads) and bad.replace(' ', '') in heads[n - 1].replace(' ', ''):
                heads[n - 1] = heads[n - 1].replace(bad, good)
                issues.append((juan, n, 'jizhu_source_typo_fixed', f'{bad} → {good}'))
    return heads


def split_mengzi(rows):
    """孟子：14 卷 → 章。

    章界以独立原典的自然段为准，朱子《集注》章首句只用来定位与交叉比对。
    这样做的原因：注本自带经文可能被抄手改动，原典层不能跟着变。
    赵岐《章句》分章数据本轮未引入，故不写具体差异，只标记 not_available。
    """
    if len(rows) != 14:
        raise SystemExit(f'孟子原典应为 14 卷，实得 {len(rows)}')

    jz = _read_jizhu_mengzi()
    chapters, issues = [], []
    cross = []

    for juan_idx, (juan, rec) in enumerate(zip(MENGZI_JUAN, rows), 1):
        got = (rec.get('chapter') or '').strip()
        if got != juan:
            issues.append((got or juan, '-', 'juan_name_mismatch', f'原典卷名「{got}」，期望「{juan}」'))

        paras = split_lines(rec['content'])
        if not paras:
            issues.append((juan, '-', 'empty_juan', ''))
            continue

        info = jz.get(juan)
        if not info:
            issues.append((juan, '-', 'jizhu_juan_missing', ''))
            continue

        heads = _mengzi_fix_heads(juan, info, issues)
        if len(heads) != info['declared']:
            issues.append((juan, '-', 'jizhu_count_mismatch',
                           f'声明 {info["declared"]} 章，实得 {len(heads)} 章首句'))

        paras_norm = [norm(p) for p in paras]
        pairs, fails = _align_heads(paras_norm, [norm(h) for h in heads])
        for n in fails:
            issues.append((juan, n, 'jizhu_head_not_found', heads[n - 1][:30]))

        starts = [k for _, k in pairs]

        # 补洞：定位失败的章借用前一章起点，状态标 pending
        for i in range(1, len(starts)):
            if starts[i] is None:
                starts[i] = starts[i - 1]
        if starts and starts[0] is None:
            starts[0] = 0

        for i, k in enumerate(starts):
            n = i + 1
            end = len(paras)
            for k2 in starts[i + 1:]:
                if k2 is not None and k2 > k:
                    end = k2
                    break
            status = 'ok' if i not in [f - 1 for f in fails] else 'pending'
            note = None
            if status == 'pending':
                note = '朱子本章首句未能与原典段落对齐，段落范围由相邻章推定，待核。'

            chapters.append({
                'classic': 'mengzi',
                'book': juan,
                'book_index': juan_idx,
                'chapter': n,
                'ref': f'孟子·{juan}·{n}',
                'text': '\n'.join(paras[k:end]),
                'structure_note': {
                    'structure_type': 'canon_paragraphs',
                    'scope': {'canon_paragraphs': [k + 1, end], 'jizhu_chapter': n},
                    'note': note,
                },
                'align': {
                    'canon_source': 'raw/canon/mengzi.json（独立原典，非注本自带经文）',
                    'jizhu_chapter': n,
                    'jizhu_declared_total': info['declared'],
                    'zhaooqi_status': 'not_available',
                    'zhaooqi_note': (
                        '赵岐《孟子章句》分章数据本轮未引入，无法逐章比对。'
                        '传世记载赵岐本与朱熹本总章数不同，但未引入原文核验，'
                        '故此处不写具体差异，保留待核。'),
                    'status': status,
                },
            })

        cross.append({
            'book': juan,
            'canon_paragraphs': len(paras),
            'jizhu_declared': info['declared'],
            'jizhu_rows': len(info['heads']),
            'jizhu_heads_after_fix': len(heads),
            'aligned': len(heads) - len(fails),
            'failed': fails,
        })

    total = len(chapters)
    if total != 260:
        issues.append(('孟子', '-', 'total_count', f'切出 {total} 章，朱熹本应为 260 章'))

    return chapters, issues, {'_cross_check_jizhu': cross}


# ---------------------------------------------------------------- 大学

# 古本《大学》16 段 → 朱子《大学章句》经一章 + 传十章 的结构映射。
# 三种关系必须分开记录，不能塞进一个文本字段：
#   overlap           两本文字重叠
#   reordered         文字重叠但位置不同（朱子重排）
#   partial           朱子只取一部分，其余判为衍文或另属
#   jizhu_supplement  朱子补入，古本无（不得进入原典层）
DAXUE_STRUCTURE = [
    ([1, 2], '经一章', '经一章', 'overlap',
     '朱子本「经一章」含古本第 1、2 段，判为「孔子之言而曾子述之」，凡二百五字。'),
    ([5], '传之首章', '传之首章（释明明德）', 'overlap', ''),
    ([6], '传之二章', '传之二章（释新民）', 'overlap', ''),
    ([7, 4], '传之三章', '传之三章（释止于至善）', 'reordered',
     '朱子本把古本第 4 段（《诗》云「瞻彼淇澳」）移到第 7 段之后，用以释「止于至善」。'
     '古本原序为 3→4，此处为结构重排，不是文字差异。'),
    ([8], '传之四章', '传之四章（释本末）', 'partial',
     '朱子本取古本第 8 段前半「子曰听讼吾犹人也…此谓知本」，并判「此谓知本」四字为衍文。'),
    ([], '传之五章', '传之五章（释格物致知）', 'jizhu_supplement',
     '古本无此章。朱子自述「右传之五章，盖释格物、致知之义，而今亡矣」，'
     '取程子之意补传一百三十四字。此段为朱子补入，不属于原典层，'
     '仅可作为注疏层内容，且必须标记为朱子补入。'),
    ([3], '传之六章', '传之六章（释诚意）', 'overlap', ''),
    ([9], '传之七章', '传之七章（释正心修身）', 'overlap', ''),
    ([10], '传之八章', '传之八章（释修身齐家）', 'overlap', ''),
    ([11], '传之九章', '传之九章（释齐家治国）', 'overlap', ''),
    ([12, 13, 14, 15, 16], '传之十章', '传之十章（释治国平天下）', 'overlap', ''),
]


def split_daxue(rows):
    """大学：保留古本 16 段结构，朱子经传分章作为注家解释体系记录。

    原典层不采用朱子分章，因为古本结构本身就是版本事实；
    朱子把《大学》判为「经传」并补写格物致知传，那是朱熹的解释，
    属于注疏层，不能反过来改写原典。
    """
    if len(rows) != 1:
        raise SystemExit(f'大学原典应为 1 条整篇记录，实得 {len(rows)}')

    paras = split_lines(rows[0]['content'])
    issues = []
    if len(paras) != 16:
        issues.append(('大学', '-', 'paragraph_count', f'古本应为 16 段，实得 {len(paras)} 段'))

    # 反查：每段被朱子本放到哪一章
    para_to_jz = {}
    for paras_in, jz_ch, jz_name, rel, note in DAXUE_STRUCTURE:
        for p in paras_in:
            para_to_jz.setdefault(p, []).append({
                'jizhu_chapter': jz_ch, 'jizhu_chapter_name': jz_name,
                'structure_type': rel, 'note': note,
            })

    chapters = []
    for i, p in enumerate(paras, 1):
        hits = para_to_jz.get(i)
        if hits:
            h = hits[0]
            sn = {
                'structure_type': h['structure_type'],
                'scope': {'guben_paragraph': i, 'jizhu_chapter': h['jizhu_chapter'],
                          'jizhu_chapter_name': h['jizhu_chapter_name']},
                'note': h['note'],
            }
            status = 'ok'
        else:
            sn = {
                'structure_type': 'absent_in_jizhu',
                'scope': {'guben_paragraph': i, 'jizhu_chapter': None},
                'note': '古本此段在朱子经传系统中无独立对应位置，需逐句核对归属。',
            }
            status = 'pending'
            issues.append(('大学', i, 'guben_paragraph_unmapped', p[:30]))

        chapters.append({
            'classic': 'daxue',
            'book': '大学',
            'book_index': 1,
            'chapter': i,
            'ref': f'大学·古本第{i}段',
            'text': p,
            'structure_note': sn,
            'align': {
                'canon_source': 'raw/canon/daxue.json（古本，独立原典）',
                'status': status,
            },
        })

    extra = {
        '_structure': {
            '_note': (
                '古本与朱子《大学章句》的结构差异记录。'
                '原典层保留古本结构；朱子经传分章属于注家解释体系，只做映射记录，不改写原典。'
                '朱子补传一百三十四字在古本中不存在，因此不出现在本文件的 chapters 里。'),
            'jizhu_supplement': {
                'chapter': '传之五章',
                'chapter_name': '传之五章（释格物致知）',
                'in_canon': False,
                'note': (
                    '朱子自述此章「而今亡矣」，取程子之意补传。'
                    '补传文字属于朱子补入，不得进入原典层；'
                    '如需进入注疏层，必须显式标记 author=朱熹、nature=jizhu_supplement。'),
                'char_count': 134,
            },
            'mapping': [
                {
                    'jizhu_chapter': jz_ch,
                    'jizhu_chapter_name': jz_name,
                    'guben_paragraphs': paras_in,
                    'structure_type': rel,
                    'note': note,
                }
                for paras_in, jz_ch, jz_name, rel, note in DAXUE_STRUCTURE
            ],
        },
    }
    return chapters, issues, extra


# ---------------------------------------------------------------- 中庸

# 古本《中庸》39 段 → 朱子《中庸章句》33 章的对应关系。
# 朱子 33 章只作阅读分段锚，古本整篇结构必须保留。
# 四处 spans 是真实跨章：古本一个自然段在朱子本里被切到两章。
ZHONGYONG_MAP = []
_z = 1
for _g in range(1, 15):
    ZHONGYONG_MAP.append((_g, [_g], 'exact'))
ZHONGYONG_MAP.append((15, [14, 15], 'spans'))
for _g in range(16, 20):
    ZHONGYONG_MAP.append((_g, [_g], 'exact'))
for _g in (20, 21, 22):
    ZHONGYONG_MAP.append((_g, [20], 'merged'))
ZHONGYONG_MAP.append((23, [21, 22], 'spans'))
ZHONGYONG_MAP.append((24, [23], 'exact'))
ZHONGYONG_MAP.append((25, [24], 'exact'))
ZHONGYONG_MAP.append((26, [25, 26], 'spans'))
ZHONGYONG_MAP.append((27, [26], 'exact'))
ZHONGYONG_MAP.append((28, [27], 'exact'))
ZHONGYONG_MAP.append((29, [28], 'exact'))
ZHONGYONG_MAP.append((30, [28, 29], 'spans'))
ZHONGYONG_MAP.append((31, [30], 'exact'))
ZHONGYONG_MAP.append((32, [31], 'exact'))
ZHONGYONG_MAP.append((33, [32], 'exact'))
for _g in range(34, 40):
    ZHONGYONG_MAP.append((_g, [33], 'merged'))

_ZY_SPANS_NOTE = {
    15: '古本第 15 段含朱子第 14 章末「子曰：射有似乎君子，失诸正鹄，反求诸其身」'
        '与第 15 章「君子之道，辟如行远必自迩」两处文字。',
    23: '古本第 23 段含朱子第 21 章「自诚明，谓之性」与第 22 章「唯天下至诚，为能尽其性」两章文字。',
    26: '古本第 26 段含朱子第 25 章「诚者自成也…故时措之宜也」与第 26 章「故至诚无息」两章文字。',
    30: '古本第 30 段含朱子第 28 章末「子曰：吾说夏礼，杞不足征也」与第 29 章「王天下有三重焉」两章文字。',
}


def split_zhongyong(rows):
    """中庸：保留古本 39 段整篇结构，朱子 33 章作为阅读分段锚记录在结构字段里。"""
    if len(rows) != 1:
        raise SystemExit(f'中庸原典应为 1 条整篇记录，实得 {len(rows)}')

    paras = split_lines(rows[0]['content'])
    issues = []
    if len(paras) != 39:
        issues.append(('中庸', '-', 'paragraph_count', f'古本应为 39 段，实得 {len(paras)} 段'))

    if len(ZHONGYONG_MAP) != len(paras):
        issues.append(('中庸', '-', 'map_length',
                       f'映射表 {len(ZHONGYONG_MAP)} 条，段落 {len(paras)} 段'))

    chapters = []
    for i, p in enumerate(paras, 1):
        rec = next((r for r in ZHONGYONG_MAP if r[0] == i), None)
        if rec is None:
            issues.append(('中庸', i, 'paragraph_unmapped', p[:30]))
            jz_list, rel = [], 'unmapped'
        else:
            _, jz_list, rel = rec

        chapters.append({
            'classic': 'zhongyong',
            'book': '中庸',
            'book_index': 1,
            'chapter': i,
            'ref': f'中庸·古本第{i}段',
            'text': p,
            'structure_note': {
                'structure_type': rel,
                'scope': {'guben_paragraph': i, 'jizhu_chapters': jz_list},
                'note': _ZY_SPANS_NOTE.get(i) if rel == 'spans' else None,
            },
            'align': {
                'canon_source': 'raw/canon/zhongyong.json（古本，独立原典）',
                'jizhu_chapters': jz_list,
                'status': 'ok' if jz_list else 'pending',
            },
        })

    extra = {
        '_structure': {
            '_note': (
                '古本 39 段与朱子《中庸章句》33 章的对应关系。'
                '朱子 33 章只作阅读分段锚，原典层保留古本整篇结构，不按朱子章重切。'),
            'span_notes': {str(k): v for k, v in _ZY_SPANS_NOTE.items()},
            'merged_groups': [
                {'jizhu_chapter': 20, 'guben_paragraphs': [20, 21, 22],
                 'note': '朱子第 20 章是《中庸》最长章，古本分成三段。'},
                {'jizhu_chapter': 33, 'guben_paragraphs': [34, 35, 36, 37, 38, 39],
                 'note': '朱子第 33 章「《诗》曰衣锦尚䌹」以下收束全篇，古本分成六段。'},
            ],
            'mapping': [
                {'guben_paragraph': g, 'jizhu_chapters': jz, 'structure_type': rel}
                for g, jz, rel in ZHONGYONG_MAP
            ],
        },
    }
    return chapters, issues, extra


# ---------------------------------------------------------------- 老子

# 河上公系统本与王弼本在这两章存在可能影响释义的差异，需在产品详情优先展示。
# 只标章号与理由，不预设具体异文——异文内容必须来自实际对齐结果，不能凭印象写。
LAOZI_VARIANT_HIGHLIGHT = {
    13: '本章「寵辱若驚」一段，河上公本与王弼本在「寵為下」等句的断句与归属上有分歧，'
        '直接影响对「寵辱」的解释，属释义级差异。',
    76: '本章「民之生也柔弱」一段，河上公本与王弼本在「堅强者死之徒」等句的语序与'
        '虚词上有差异，涉及老子柔弱思想的表述方式，属释义级差异。',
}


def split_laozi(rows):
    """老子：Kanripo 白本已是章级，一转一即可。

    必须保留的版本事实：
      - 这是河上公系统道藏本，不是王弼本；章次对应不代表文字一致。
      - 章末声明字数与实际字数逐章比对，差异作为字段保留。
      - 第 29 章底本并列了两套正文，两套都保留，不做取舍。
    """
    chapters, issues = [], []
    for i, rec in enumerate(rows, 1):
        text = rec.get('content') or ''
        if not text:
            issues.append((rec.get('chapter') or str(i), '-', 'empty_chapter', ''))
            continue

        align = {
            'canon_source': 'raw/canon/laozi.json（Kanripo KR5c0045 白本，河上公系统）',
            'status': 'ok',
            'verified_by': None,
            'verified_at': None,
            'verify_note': None,
        }

        declared = rec.get('char_count_declared')
        actual = rec.get('char_count_actual')
        diff = rec.get('char_count_diff')
        if diff:
            align['char_count_check'] = {
                'declared': declared, 'actual': actual, 'diff': diff,
                'note': '底本章末声明字数与实际字数不符，差异保留，不据以改字。',
            }

        variant = None
        if rec.get('variant_duplicated'):
            variant = {
                'scope': '结构性',
                'note': rec.get('variant_note'),
                'sources': ['KR5c0045 河上公系统', 'KR5c0045 并列的另一传本系统'],
                'resolved': False,
            }
            align['status'] = 'ok_variant'
            align['variant_scope'] = '结构性'
            align['variant_note'] = rec.get('variant_note')
            issues.append((rec.get('chapter'), '-', 'variant_duplicated',
                           '底本并列两套正文，已保留全部文字'))

        # 主人裁决：第 13 章、第 76 章这类可能影响释义的差异，
        # 必须在产品详情里优先展示，不能藏在技术字段里。
        # 具体异文要与王弼本对齐后才能填，此处先把展示位与优先级落进数据，
        # 避免将来靠前端硬编码章号。
        display = None
        if i in LAOZI_VARIANT_HIGHLIGHT:
            display = {
                'variant_priority': 'high',
                'headline': '此章存在可能影响释义的版本差异',
                'reason': LAOZI_VARIANT_HIGHLIGHT[i],
                'evidence_status': 'pending',
                'evidence_note': '具体异文待与王弼本逐句对齐后填充；当前不预设差异内容。',
            }

        chapters.append({
            'classic': 'laozi',
            'book': rec.get('chapter') or f'{i}章',
            'book_index': i,
            'chapter': i,
            'ref': f'老子·第{i}章',
            'text': text,
            'structure_note': {
                'structure_type': 'kanripo_plain_text',
                'scope': {'chapter': i},
                'note': '章界由底本章名锚与章末计数锚双重确定，非人工划分。',
            },
            'align': align,
            'variant': variant,
            'display': display,
        })

    if len(chapters) != 81:
        issues.append(('老子', '-', 'total_count', f'切出 {len(chapters)} 章，应为 81 章'))
    return chapters, issues, {
        '_edition': {
            'edition': '河上公系统正统道藏本（非王弼本）',
            'repo': 'kanripo/KR5c0045',
            'branch': 'ZTDZ',
            'license': 'CC-BY-SA',
            'warning': [
                '这是道藏本、河上公系统，不是王弼本。',
                '不得把它的文字冒充王弼本原文。',
                '章次与王弼本对应，不代表文字一致。',
                '已知异文不等于已完成校勘。',
            ],
        },
    }


# ---------------------------------------------------------------- 庄子

def split_zhuangzi(rows):
    """庄子：Kanripo 白本已是篇级，一转一即可。

    与郭象注本分属不同层次：郭象注本当前只有内篇七篇，那是注本数据不完整，
    不是原典缺失。本轮不补郭象注本，注本缺篇继续保留 no_canon。
    """
    chapters, issues = [], []
    for i, rec in enumerate(rows, 1):
        text = rec.get('content') or ''
        if not text:
            issues.append((rec.get('chapter') or str(i), '-', 'empty_pian', ''))
            continue
        chapters.append({
            'classic': 'zhuangzi',
            'book': rec.get('chapter') or f'第{i}篇',
            'book_index': i,
            'chapter': i,
            'ref': f'庄子·{rec.get("chapter") or i}',
            'text': text,
            'structure_note': {
                'structure_type': 'kanripo_plain_text',
                'scope': {'pian_index': i, 'pian_section': rec.get('pian_section')},
                'note': '篇界由底本「内篇／外篇／杂篇＋篇名＋第N」标记确定。',
            },
            'pian_section': rec.get('pian_section'),
            'pian_traditional': rec.get('pian_traditional'),
            'align': {
                'canon_source': 'raw/canon/zhuangzi.json（Kanripo KR5c0051 白本）',
                'status': 'ok',
                'verified_by': None,
                'verified_at': None,
                'verify_note': None,
            },
        })

    if len(chapters) != 33:
        issues.append(('庄子', '-', 'total_count', f'切出 {len(chapters)} 篇，应为 33 篇'))
    return chapters, issues, {
        '_edition': {
            'edition': '白文本（不含郭象注、陆德明音义）',
            'repo': 'kanripo/KR5c0051',
            'branch': 'ZTDZ',
            'license': 'CC-BY-SA',
            'warning': [
                '这是白文本，与郭象注本分属不同层次。',
                '郭象注本当前只有内篇七篇，属注本数据不完整，不是原典缺失。',
            ],
        },
    }



SPLITTERS = {
    'lunyu': (split_lunyu, '论语', '按篇切章，逐篇核对通行本章数'),
    'xiaojing': (split_xiaojing, '孝经', '一章一条'),
    'shijing': (lambda r: split_flat('shijing', r, '诗经'), '诗经', '一篇一条'),
    'zhouyi': (lambda r: split_flat('zhouyi', r, '周易'), '周易', '一卦/一篇一条'),
    'liji': (lambda r: split_flat('liji', r, '礼记'), '礼记', '一篇一条'),
    'mengzi': (split_mengzi, '孟子',
               '原典段落定章界，朱子《集注》章首句交叉比对，源缺陷显式记录'),
    'daxue': (split_daxue, '大学',
              '保留古本十六段结构，朱子经传分章只作结构映射，不重切'),
    'zhongyong': (split_zhongyong, '中庸',
                  '保留古本三十九段整篇结构，朱子三十三章作阅读分段锚'),
    'laozi': (split_laozi, '老子',
              'Kanripo 白本，章界由底本章名锚与章末计数锚双重确定'),
    'zhuangzi': (split_zhuangzi, '庄子',
                 'Kanripo 白本，篇界由底本内篇／外篇／杂篇标记确定'),
}


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(REPORTS, exist_ok=True)

    done = []
    for cid, (fn, name, note) in SPLITTERS.items():
        if only and cid != only:
            continue
        rows = load(cid)
        res = fn(rows)
        if len(res) == 3:
            chapters, issues, extra = res
        else:
            chapters, issues = res
            extra = None
        payload = {
            '_note': f'{name}章级原文。切分自 raw/canon/{cid}.json，来源见 raw/SOURCES.json。',
            '_splitting': note,
            '_warning': '切分经过结构校验与抽样比对，但不等于全量校勘。引用前仍须核对纸质通行本。',
            'classic': cid,
            'name': name,
            'count': len(chapters),
            'chapters': chapters,
        }
        if extra:
            payload.update(extra)
        p = os.path.join(OUT, f'{cid}.json')
        with io.open(p, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)

        # 报告
        lines = [f'# {name} 切分报告', '',
                 f'- 来源：`raw/canon/{cid}.json`',
                 f'- 切法：{note}',
                 f'- 切出：**{len(chapters)}** 个单元',
                 f'- 异常：{len(issues)} 处', '']
        if issues:
            lines += ['| 位置 | 行 | 类型 | 内容 |', '|---|---|---|---|']
            for where, idx, kind, text in issues[:50]:
                lines.append(f'| {where} | {idx} | {kind} | {text[:30]} |')
            if len(issues) > 50:
                lines.append(f'| … | | | 共 {len(issues)} 处，仅列前 50 |')
        else:
            lines.append('无异常。')
        with io.open(os.path.join(REPORTS, f'split-{cid}.md'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))

        print(f'[split] {name}: {len(chapters)} 单元，异常 {len(issues)} 处 → parsed/canon/{cid}.json')
        done.append((name, len(chapters), len(issues)))

    print()
    print('[split] 汇总：')
    for name, n, bad in done:
        print(f'  {name:6s} {n:5d} 单元   异常 {bad}')


if __name__ == '__main__':
    main()
