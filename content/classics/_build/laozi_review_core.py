"""老子两传本 181 条：重算最小差异核 + 收集可验证证据。

职责：给每条候选差异算出「真正不同的那一个字/那几个字」，
      并从两传本全书里找可用证据（用字系统性、平行句、B 侧注文）。
数据来源：laozi-variant-ledger.json、parsed/canon/laozi.json、
          raw/commentary/text/laozi-wangbi-daozang.txt。
对外接口：`build()` 返回 (items, ev)；`python3 laozi_review_core.py` 打印概览。
副作用：无（只读，不写台账）。

**为什么要重算差异核**：逐字 diff 的区间边界受两侧共同文字影响，
「矣故有无之 / 已故有无」里真正的差异只是「矣→已」和一个「之」的有无，
其余「故有无」是两边一样的。把整段当差异记，人判的时候会被无关字干扰，
分类也会把「等长替换」和「脱一字」混成一类。
"""
import difflib
import io
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_laozi_variant_ledger as G
from cn_norm import norm

BASE = G.BASE
IDX = os.path.join(BASE, 'raw', 'commentary', 'index')
LEDGER = os.path.join(IDX, 'laozi-variant-ledger.json')
B_SRC = os.path.join(BASE, G.B_SRC)

# 虚词/功能词。差异落在这些字上，多半是传本虚词增删，不是义理分歧。
FUNC = set('之乎者也矣已焉哉夫其而则故是以于於与为乃且若所')

# 义理关键词：这些字本身承载概念，两侧不同会改变句义。
MEANING_WORDS = set('道徳德仁義义禮礼智信勇柔弱剛刚强強無无有生死動动静静虛虚實实'
                    '善惡恶美醜丑聖圣愚賢贤不爭争爲为化治亂乱')


def fine(a, b):
    """把一个粗差异块细分成最小核。"""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return [dict(op=t, a=a[i1:i2], b=b[j1:j2])
            for t, i1, i2, j1, j2 in sm.get_opcodes() if t != 'equal']


def chapter_texts():
    A = G.load_a()
    G.A_ALL = {k: norm(v[0]['text']) for k, v in A.items()}
    B, _ = G.load_b()
    a_by = {}
    for n, eds in A.items():
        for e in eds:
            a_by[(n, e['edition'])] = norm(e['text'])
    b_by = {n: norm(''.join(e.get('text') or '' for e in eds)) for n, eds in B.items()}
    return a_by, b_by


def build():
    a_by, b_by = chapter_texts()
    v = json.load(io.open(LEDGER, encoding='utf-8'))
    items = v['items']

    # 章级对齐结果缓存：同一章多条线索共用一次对齐
    blocks_cache = {}

    def blocks_of(n, ed):
        key = (n, ed)
        if key in blocks_cache:
            return blocks_cache[key]
        a_n, b_n = a_by.get(key), b_by.get(n)
        if not a_n or not b_n:
            blocks_cache[key] = ([], '', '')
            return blocks_cache[key]
        sm = difflib.SequenceMatcher(None, a_n, b_n, autojunk=False)
        bl = G.merge_blocks([(i1, i2, j1, j2) for t, i1, i2, j1, j2 in sm.get_opcodes()
                             if t != 'equal'])
        blocks_cache[key] = (bl, a_n, b_n)
        return blocks_cache[key]

    for it in items:
        n = G.ch_no(it['chapter'])
        ed = it.get('chapter_29_edition') or 'A1'
        bl, a_n, b_n = blocks_of(n, ed)
        locs = it.get('occurrence_locs') or []
        p = locs[0] if locs else None
        hit = [x for x in bl if p is not None and x[0] <= p < x[1]]
        if not hit:
            hit = [x for x in bl if a_n[x[0]:x[1]] == it['differs'][0]]
        if hit:
            a1, a2, j1, j2 = hit[0]
            a_seg, b_seg = a_n[a1:a2], b_n[j1:j2]
            cores = fine(a_seg, b_seg)
        else:
            a_seg, b_seg = it['differs'][0], it['wangbi_side'] or ''
            cores = fine(a_seg, b_seg)
        it['diff_core'] = dict(block_a=a_seg, block_b=b_seg, cores=cores)

    # ---- 证据 1：全书用字对照 ----
    # 同一对 (A 字, B 字) 在全书出现几次。出现多次说明是两传本的系统性用字差异，
    # 不是某一章的孤立讹误。只统计单字对单字的核。
    pair_count = Counter()
    pair_chaps = defaultdict(set)
    for it in items:
        n = G.ch_no(it['chapter'])
        for c in it['diff_core']['cores']:
            if c['op'] == 'replace' and len(c['a']) == 1 and len(c['b']) == 1:
                pair_count[(c['a'], c['b'])] += 1
                pair_chaps[(c['a'], c['b'])].add(n)

    # ---- 证据 2：B 侧注文里的校语/释义 ----
    b_lines = io.open(B_SRC, encoding='utf-8').read().split('\n') if os.path.exists(B_SRC) else []
    notes = []
    for ln, line in enumerate(b_lines, 1):
        s = line.strip()
        if s.startswith('#') and ('原本作' in s or '疑' in s or '原脱' in s or '原作' in s):
            notes.append((ln, s))

    # ---- 证据 3：平行句（同章内「相X」类对文） ----
    # 老子多对文：「有无相生，难易相成，长短相较，高下相倾，音声相和，前后相随」。
    # 若差异字属于同章一处并列结构中的同位成分，可作为「对文证据」。
    def parallel(n, ed, seg):
        a_n = a_by.get((n, ed)) or ''
        k = a_n.find(seg)
        if k < 0:
            return []
        out = []
        for m in range(4, 9):
            for start in range(max(0, k - 40), min(len(a_n) - m, k + len(seg))):
                pass
        # 简化：抽取同章「相X」结构
        import re
        return re.findall(r'相[\u4e00-\u9fff]', a_n)

    ev = dict(pair_count=pair_count, pair_chaps=pair_chaps, notes=notes, parallel=parallel)
    return items, ev


def main():
    items, ev = build()
    print('条目 %d' % len(items))
    ops = Counter()
    for it in items:
        for c in it['diff_core']['cores']:
            ops[c['op']] += 1
    print('差异核操作', dict(ops))
    multi = sum(1 for it in items if len(it['diff_core']['cores']) > 1)
    print('含多个核的条目', multi)
    print()
    print('出现 2 次以上的单字对（可能是系统性用字差异）：')
    for (a, b), c in ev['pair_count'].most_common(20):
        if c >= 2:
            print('  %s / %s  ×%d  章 %s' % (a, b, c, sorted(ev['pair_chaps'][(a, b)])))
    print()
    print('B 侧校记 %d 条' % len(ev['notes']))


if __name__ == '__main__':
    main()
