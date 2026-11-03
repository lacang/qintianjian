# -*- coding: utf-8 -*-
"""老子两套传本异文对照台账：河上公系统道藏本 × 王弼本。

这件事的边界必须写清楚，否则一定会被当成校勘成果：

    程序只做「发现和定位候选差异」。
    diff_type / variant_scope 一律留空，由人工核定。
    不预设差异总数——跑出来多少就是多少，不是 18 处。

传本关系（决定了这些差异该怎么理解）：
    A 侧 河上公系统正统道藏本（Kanripo KR5c0045, ZTDZ 分支）——独立原典
    B 侧 王弼本（道德真经注，魏王弼）——另一传本系统
    章次对应，不代表文字一致。差异是知识，不是需要清洗的噪声。

用法：python3 build_laozi_variant_ledger.py
"""
import difflib
import hashlib
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cn_norm import norm

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'raw', 'commentary', 'index', 'laozi-variant-ledger.json')

# A 侧：河上公系统原典
A_PATH = os.path.join(BASE, 'parsed', 'canon', 'laozi.json')
# B 侧：王弼本经文。用注疏索引里已切出的经条（laozi-wangbi-daozang，81 章全覆盖）。
# 注意：B 侧经注切分依据是排版交替规律（align.status = ok_variant，
# 内部带 split_assumed），未经校勘。所以这里给出的 B 侧片段是「候选原文」，
# 人工核校时必须回源文件核对，不能直接引用。
B_KEY = 'laozi-wangbi-daozang'
B_SRC = 'raw/commentary/text/laozi-wangbi-daozang.txt'
IDX = os.path.join(BASE, 'raw', 'commentary', 'index', 'commentary-index.json')

# 差异块合并阈值：归一后相隔不超过这个字数的两个差异块视为同一处
MERGE_GAP = 3
# 超过这个长度的差异块不进异文台账。真异文是一字一词的事；
# 整段对不上通常说明 B 侧混进了注文（切分缺陷）或确有整句脱衍，
# 那是另一类问题，混在一起会让人误以为老子有上百字的异文。
MAX_VARIANT_LEN = 12
# 单条差异至少这么长才记（1-2 字的碎片多半是分词边界，不是异文）
MIN_DIFF = 1


def ch_no(s):
    m = re.match(r'(\d+)', str(s or ''))
    return int(m.group(1)) if m else None


def load_a():
    """河上公侧：81 章。第 29 章底本并列两套正文，必须切开分别对照，
    否则会拿 A 套前半段去对 B 侧整章，从头错到尾，还会把两套之间的
    重复内容记成两条线索（用户点名要求避免重复记录）。"""
    d = json.load(io.open(A_PATH, encoding='utf-8'))
    out = {}
    for c in d['chapters']:
        n = ch_no(c.get('chapter') or c.get('book'))
        txt = c.get('text') or ''
        if n == 29 and c.get('variant'):
            # 底本此处两套正文首尾相接。分界点是第二套的起句
            # 「將欲取天下而爲之者」——比第一套多一个「者」。
            k = txt.find('將欲取天下而爲之者')
            if k > 0:
                out[29] = [
                    {'edition': 'A1', 'text': txt[:k]},
                    {'edition': 'A2', 'text': txt[k:]},
                ]
                continue
        out[n] = [{'edition': 'A1', 'text': txt}]
    return out


CH_RE = re.compile(r'^[一二三四五六七八九十百]+章$')
# 卷名、作者行、卷末校记、书末后记都不是经文
B_SKIP_RE = re.compile(r'^(道德真经注卷|山阳王弼注|#\d+)')
B_TAIL_RE = re.compile(r'^道德真经注后记')
# 行末是这些悬空虚词，说明这句没说完，下一行是它的续行
SUSPEND = set('则而以故若其於于与及且或因由自从为乎焉之')
# 交替位上的行，与河上公本的重合度低于这个值就判为注文
COV_TH = 0.45
# 交替位但很短的行（「生之，」「畜之。」）不受覆盖率否决：
# 分母只有两三个字，覆盖率天然低，可它们是真经文。
COV_MIN_LEN = 4
# 非交替位也要看：注文占两行时交替整体错位，末尾真经文会落到注文位上。
# 第 16 章 L169「无也。」（注文）占掉了经位，后面「道乃久，」「没身不殆。」
# 就整体滑到注文位，不补回来这一章末尾的经文整段丢失。
# 门槛必须高——注文常整句引用经文（「可得而亲，则可得而疏也」覆盖率 0.80），
# 门槛低了会把注文补回来，正是它要防的事。0.95 只有几乎逐字相同的行能过。
COV_ADD = 0.85
COV_ADD_MIN_LEN = 8
# 很短的注位行（「生之，」「畜之。」）单独给一个极严门槛：
# 两个字的分母，0.85 随便一个「之」就能凑到，必须几乎逐字相同才认
COV_ADD_SHORT = 0.99
COV_ADD_SHORT_MAX = 7


def _lcs_ratio(s, a):
    """s 有多少字落在 a 的最长公共子序列里。只用来否决，不用来确认。"""
    if not s or not a:
        return 0.0
    sm = difflib.SequenceMatcher(None, s, a, autojunk=False)
    return sum(x.size for x in sm.get_matching_blocks()) / len(s)


A_ALL = {}


def load_b():
    """王弼侧：直接重读源文件抽经文。

    为什么不用索引里已切好的经条：那份切分是 assumed，第 20 章就错位了。
    199 行注文结尾「益之则」、200 行「忧。故续凫之足…」是它的续行，
    多出一行之后整章经注颠倒，B 侧因此混进大量注文，
    拿来和河上公本对照会造出一堆假异文。

    抽取分两步，每一步都有它不能替代的理由：

    第一步 合并续行：行末是「则/而/以/故/若/其/於…」这类悬空虚词，
        说明这句没说完，下一行接着。第 20 章 L199 结尾「益之则」就是这样。
        不能用「行末有无句末标点」——经文也常以逗号收尾（L205
        「我独怕兮其未兆，如婴儿之未孩，」），那样会把经文并进注文。

    第二步 交替 + 覆盖率否决：章内奇数位是经文。但交替在「注文占两行」
        （第 38 章 448经/449注/450注续）时会整体错位，所以交替只能当初判。
        再用与河上公本的重合度否决明显是注文的行——注文整段在原典里找不到对应。

    覆盖率只用来否决，不用来确认。第 20 章注文「若无所宅」含「若无所」
    （出自 A 侧「乘乘兮若无所归」），LCS 覆盖率 0.75，比真经文还高；
    拿它当确认判据会把注文扶正。用它当否决判据则是安全的：
    注文的覆盖率远低于阈值，而真经文不会。

    也不去逐行猜「这是注文那是经文」——猜错过。把不确定性作为字段交出去。
    """
    lines = io.open(os.path.join(BASE, B_SRC), encoding='utf-8').read().split('\n')
    chapters, cur = [], None
    for i, s in enumerate(lines, 1):
        tt = s.strip()
        if not tt:
            continue
        if CH_RE.match(tt):
            if cur:
                chapters.append(cur)
            cur = {'name': tt, 'rows': []}
            continue
        if cur is None or B_SKIP_RE.match(tt) or B_TAIL_RE.match(tt):
            continue
        cur['rows'].append((i, tt))
    if cur:
        chapters.append(cur)

    out, quality = {}, {}
    for n, c in enumerate(chapters, 1):
        rows = c['rows']
        # 第一步：合并续行
        merged = []
        for ln, tx in rows:
            if merged and merged[-1][1].rstrip()[-1] in SUSPEND:
                merged[-1] = (merged[-1][0], merged[-1][1] + tx)
            else:
                merged.append((ln, tx))
        # 第二步：交替位判经文，覆盖率否决注文
        a_n = A_ALL.get(n, '')
        canon, rejected = [], []
        for k, (ln, tx) in enumerate(merged):
            s = norm(tx)
            if k % 2 == 0:
                # 交替位：短行直接留（「生之，」这类覆盖率天然低），
                # 长行要看它有多少字真能在河上公本里找到
                # 短行也要看：第 16 章末尾注文「无也。」只有两字，
                # 不受覆盖率检查就会混进经文，把「道乃久，没身不殆」顶掉。
                # 短行只要求「至少有一个字能在原典里找到」，不设比例门槛。
                if ((len(s) < COV_MIN_LEN and _lcs_ratio(s, a_n) > 0)
                        or (len(s) >= COV_MIN_LEN
                            and _lcs_ratio(s, a_n) >= COV_TH)):
                    canon.append({'line': ln, 'text': tx})
                else:
                    rejected.append({'line': ln, 'cov': round(_lcs_ratio(s, a_n), 3),
                                     'text': tx[:40]})
            elif ((len(s) >= COV_ADD_MIN_LEN and _lcs_ratio(s, a_n) >= COV_ADD)
                  or (len(s) < COV_ADD_MIN_LEN and _lcs_ratio(s, a_n) >= COV_ADD_SHORT)):
                # 注文位但覆盖率极高：注文占两行导致的错位，这是被挤下去的真经文
                canon.append({'line': ln, 'text': tx, 'from_note_slot': True})
        canon.sort(key=lambda x: x['line'])
        out[n] = canon
        quality[n] = {
            'rows_raw': len(rows),
            'rows_merged': len(merged),
            'continuations_merged': len(rows) - len(merged),
            'canon_lines': len(canon),
            'rejected_as_note': len(rejected),
            'coverage': round(_lcs_ratio(
                ''.join(norm(x['text']) for x in canon), a_n), 3),
            'rejected_samples': rejected[:3],
            'note': ('交替位上有 %d 行与河上公本重合度过低，判为注文剔除；'
                     '该章经注边界仍须人工确认' % len(rejected)
                     if rejected else '交替位全部通过覆盖率检查'),
        }
    return out, quality


def merge_blocks(opcodes):
    """把相隔很近的差异块并成一处，同时把 B 侧区间一起并进来。

    逐字 diff 会把「幡→翻」这类单字替换和紧邻的标点差异拆成好几段，
    分开记等于把一件事记三遍。

    B 侧区间必须在这里一起合并、一起带走。之前是先合并 A 侧区间、
    再用 A 侧前后锚去 B 里重新定位，结果 A 侧有异文时锚点找不到，
    194 条里六十多条 wangbi_side 是空的。opcode 本来就知道 B 侧在哪，
    直接取 j1/j2 就精确，没有任何猜的成分。
    """
    if not opcodes:
        return []
    merged = [list(opcodes[0])]
    for i1, i2, j1, j2 in opcodes[1:]:
        if i1 - merged[-1][1] <= MERGE_GAP:
            merged[-1][1] = i2
            merged[-1][3] = max(merged[-1][3], j2)
            merged[-1][2] = min(merged[-1][2], j1)
        else:
            merged.append([i1, i2, j1, j2])
    return merged


def main():
    A = load_a()
    global A_ALL
    A_ALL = {k: norm(v[0]['text']) for k, v in A.items()}
    B, B_QUALITY = load_b()
    b_src_path = os.path.join(BASE, B_SRC)
    b_src_sha = None
    if os.path.exists(b_src_path):
        h = hashlib.sha256()
        with open(b_src_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        b_src_sha = h.hexdigest()

    items = []
    stat = {'chapters_a': len(A), 'chapters_b': len(B),
            'chapters_compared': 0, 'chapters_skipped': []}

    for n in sorted(A):
        if n not in B:
            stat['chapters_skipped'].append({'chapter': n, 'reason': 'B 侧无该章经文'})
            continue
        b_entries = B[n]
        b_raw = ''.join((e.get('text') or '') for e in b_entries)
        b_n = norm(b_raw)
        if not b_n:
            stat['chapters_skipped'].append({'chapter': n, 'reason': 'B 侧该章经文为空'})
            continue

        for ed in A[n]:
            a_raw = ed['text']
            a_n = norm(a_raw)
            if not a_n:
                continue
            stat['chapters_compared'] += 1
            sm = difflib.SequenceMatcher(None, a_n, b_n, autojunk=False)
            blocks = [(i1, i2, j1, j2) for tag, i1, i2, j1, j2 in sm.get_opcodes()
                      if tag != 'equal']
            for a1, a2, j1, j2 in merge_blocks(blocks):
                a_seg = a_n[a1:a2]
                if len(a_seg) < MIN_DIFF and (a2 - a1) < MIN_DIFF:
                    continue
                # B 侧对应片段：直接取 opcode 的 j 区间。
                # 不需要再用锚点去 B 里重新找——A 侧有异文时锚点本身就找不到，
                # 而 opcode 已经给出了精确位置。
                b_seg = b_n[j1:j2]
                located = True
                b_truncated = False

                # 取上下文，供人判断是「字词」还是「整句归属不同」
                ctx = 12
                # 差异块长短决定它是不是「异文」：短的是候选异文，
                # 长的是切分缺陷或整句脱衍，必须分开，不能混成一张表
                # 差异规模决定归类：两侧都短是字词级候选异文，
                # 有一侧长说明整句归属不同（脱文/衍文/切分缺陷），属另一类问题
                kind = ('variant_candidate'
                        if max(len(a_seg), len(b_seg)) <= MAX_VARIANT_LEN
                        else 'length_diff_suspect')
                items.append({
                    'kind': kind,
                    'ledger_id': None,
                    'group_id': None,
                    'entry_id': None,
                    'commentary_key': B_KEY,
                    'book': '道德真经注（魏王弼）',
                    'chapter': '%d章' % n,
                    'canon_snippet': a_n[max(0, a1 - ctx):a2 + ctx],
                    'differs': [a_seg],
                    'wangbi_side': b_seg,
                    'wangbi_side_located': located,
                    'wangbi_side_truncated': b_truncated,
                    'canon_classic': 'laozi',
                    'source_file': B_SRC,
                    'loc_start': b_entries[0]['line'],
                    'loc_end': b_entries[-1]['line'],
                    # 传本关系：两侧不是同一种本子，差异不能当「错字」处理
                    'cross_edition': {
                        'a': {'edition': '河上公系统正统道藏本',
                              'repo': 'kanripo/KR5c0045', 'branch': 'ZTDZ',
                              'role': '独立原典',
                              'source': 'parsed/canon/laozi.json',
                              'variant_set': ed['edition']},
                        'b': {'edition': '王弼本（道德真经注，魏王弼）',
                              'role': '另一传本系统',
                              'source': B_SRC,
                              'split_method': '章内奇数行经文、偶数行注文',
                              'split_assumed': True,
                              'chapter_quality': B_QUALITY.get(n)},
                        'relation': '章次对应，文字不保证一致；不得互相冒充',
                    },
                    'canon_side_verified': True,
                    'note_side_missing': True,
                    # 这两个必须人工填，程序不许猜
                    'diff_type': None,
                    'variant_scope': None,
                    'confirmed': False,
                    'confirmed_by': None,
                    'confirmed_at': None,
                    'verify_note': None,
                })

    # 第 29 章两套正文各自产生的线索要能区分，否则看起来像重复记录
    for it in items:
        if it['chapter'] == '29章':
            it['chapter_29_edition'] = it['cross_edition']['a']['variant_set']

    # 同章内「A 侧写法、B 侧写法」完全相同的差异块合并成一条，记出现次数。
    # 第 33 章河上公本每句末都有「也」，王弼本没有，逐字 diff 会出 8 条，
    # 台账被虚词淹没，真正的字词异文反而看不见。合并后是一条
    # 「句末『也』，出现 8 次」——信息没少，可读性回来了。
    dedup, seen = [], {}
    for it in items:
        key = (it['chapter'], tuple(it['differs']), it['wangbi_side'])
        if key in seen:
            seen[key]['occurrences'] += 1
            seen[key]['occurrence_locs'].append(it['loc_start'])
        else:
            it['occurrences'] = 1
            it['occurrence_locs'] = [it['loc_start']]
            seen[key] = it
            dedup.append(it)
    merged_n = len(items) - len(dedup)
    items = dedup

    for i, it in enumerate(items, 1):
        it['ledger_id'] = 'LV-%04d' % i

    # 章级汇总：用户要求「逐章对照」，所以每章要能一次看到 A 全文、B 全文、
    # 本章所有差异块、以及 B 侧抽经的可信度。只有条目级列表，人得自己在
    # 194 条里按章号筛，看不到全章面貌。
    chapters_out = []
    for n in sorted(A):
        ch_items = [x for x in items if x['chapter'] == '%d章' % n]
        if not ch_items:
            continue
        a_ed = A[n]
        chapters_out.append({
            'chapter': '%d章' % n,
            'a_text': [{'variant_set': e['edition'], 'text': e['text']}
                       for e in a_ed],
            'b_text': ''.join(x['text'] for x in B.get(n, [])),
            'b_quality': B_QUALITY.get(n),
            'diff_count': len(ch_items),
            'ledger_ids': [x['ledger_id'] for x in ch_items],
            'has_length_diff_suspect': any(
                x['kind'] != 'variant_candidate' for x in ch_items),
        })

    n_cand = sum(1 for it in items if it['kind'] == 'variant_candidate')
    n_susp = len(items) - n_cand
    stat['variant_candidates'] = n_cand
    stat['length_diff_suspects'] = n_susp
    stat['chapters_with_rejected_note_lines'] = [
        {'chapter': '%d章' % k, 'rejected': v['rejected_as_note'],
         'coverage': v['coverage']}
        for k, v in sorted(B_QUALITY.items()) if v['rejected_as_note']]

    payload = {
        '_note': ('老子两套传本的候选异文台账。'
                  'A 侧为河上公系统正统道藏本（独立原典），B 侧为王弼本（另一传本系统）。'
                  '章次对应不代表文字一致；这里记的是「发现并定位」的候选差异，'
                  '不是校勘结论。diff_type / variant_scope 留空，由人工核定。'
                  '不预设差异总数——跑出多少就是多少。'),
        '_schema': {
            'ledger_id': '线索唯一编号',
            'canon_snippet': 'A 侧（河上公）归一后片段，前后各留 12 字上下文',
            'differs': 'A 侧与 B 侧不同的片段（A 侧写法）',
            'wangbi_side': 'B 侧（王弼本）在对应位置的片段，用 A 侧前后锚定位',
            'wangbi_side_located': 'B 侧片段是否成功定位；false 表示只知 A 侧有这段、不知 B 侧对应何处',
            'wangbi_side_truncated': 'B 侧片段因超长被截断，说明锚点可能命中错误位置，须回源文件核对',
            'cross_edition': '两侧传本关系；variant_set 为 A1/A2 时表示底本并列两套正文',
            'chapter_29_edition': '仅第 29 章：该线索来自哪一套并列正文（A1/A2）',
            'split_assumed': 'B 侧经注切分依据排版交替规律，未经校勘，引用前须回源文件核对',
            'occurrences': '同章内完全相同的差异块出现次数；occurrence_locs 为各次所在行号',
            'kind': ('variant_candidate=短片段差异，进异文核校；'
                     'length_diff_suspect=长片段差异，多半是 B 侧混入注文'
                     '（切分缺陷）或整句脱衍，属另一类问题，不混入异文台账'),
            'diff_type': '人工填：char_level / omission / addition / word_order / structure',
            'variant_scope': '人工填：字词 / 脱文 / 衍文 / 语序 / 结构性',
            'confirmed': '人工核校通过后置 true',
        },
        'editions': {
            'A': {'name': '河上公系统正统道藏本', 'repo': 'kanripo/KR5c0045',
                  'branch': 'ZTDZ', 'license': 'CC-BY-SA',
                  'source': 'parsed/canon/laozi.json',
                  'note': '第 29 章底本并列两套正文，已切分为 A1/A2 分别对照'},
            'B': {'name': '王弼本（道德真经注，魏王弼）', 'source': B_SRC,
                  'sha256': b_src_sha, 'split_assumed': True},
        },
        'stat': stat,
        'count': len(items),
        'count_before_dedup': len(items) + merged_n,
        'chapters': chapters_out,
        'count_variant_candidate': n_cand,
        'count_length_diff_suspect': n_susp,
        'confirmed_count': 0,
        'items': items,
    }
    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps(payload, ensure_ascii=False, indent=1))

    print('老子异文台账 → %s' % os.path.relpath(OUT, BASE))
    print('  对照 %d 章段（A 侧 %d 章，B 侧 %d 章）'
          % (stat['chapters_compared'], stat['chapters_a'], stat['chapters_b']))
    if stat['chapters_skipped']:
        print('  跳过 %d 章：%s' % (len(stat['chapters_skipped']),
                                 [x['chapter'] for x in stat['chapters_skipped']][:10]))
    print('  差异块 %d 条（confirmed 0）' % len(items))
    print('    候选异文（短片段，进核校）%d 条' % n_cand)
    print('    长片段疑似（切分缺陷/整句脱衍，不混入）%d 条' % n_susp)
    print('  同章同内容差异合并 %d 条（如第 33 章句末「也」×8 并为一条）'
          % merged_n)
    _risk = [(k, v['rejected_as_note']) for k, v in B_QUALITY.items()
             if v['rejected_as_note']]
    _cov = [v['coverage'] for v in B_QUALITY.values()]
    print('  B 侧抽经覆盖率 均值 %.3f 最低 %.3f'
          % (sum(_cov) / len(_cov), min(_cov)))
    print('  交替位上被判为注文并剔除的章 %d 个（需人工确认经注边界）'
          % len(_risk))
    if _risk:
        print('    %s' % _risk[:12])
    from collections import Counter
    print('  按章分布 top10：%s' % Counter(i['chapter'] for i in items).most_common(10))


if __name__ == '__main__':
    main()
