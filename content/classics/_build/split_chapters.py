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


SPLITTERS = {
    'lunyu': (split_lunyu, '论语', '按篇切章，逐篇核对通行本章数'),
    'xiaojing': (split_xiaojing, '孝经', '一章一条'),
    'shijing': (lambda r: split_flat('shijing', r, '诗经'), '诗经', '一篇一条'),
    'zhouyi': (lambda r: split_flat('zhouyi', r, '周易'), '周易', '一卦/一篇一条'),
    'liji': (lambda r: split_flat('liji', r, '礼记'), '礼记', '一篇一条'),
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
        chapters, issues = fn(rows)
        payload = {
            '_note': f'{name}章级原文。切分自 raw/canon/{cid}.json，来源见 raw/SOURCES.json。',
            '_splitting': note,
            '_warning': '切分经过结构校验与抽样比对，但不等于全量校勘。引用前仍须核对纸质通行本。',
            'classic': cid,
            'name': name,
            'count': len(chapters),
            'chapters': chapters,
        }
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
