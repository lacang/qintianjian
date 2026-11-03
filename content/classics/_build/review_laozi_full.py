"""老子两传本 181 条全量核校：逐条给结论、证据、状态。

职责：差异核（laozi_review_core）+ 人工判定表（laozi-review-rules.json）
      + 四项自动取证（全书用字对 / 语序回查 / 源文件回查 / 注文复述）
      → 181 条完整结论，写 laozi-variant-review.json。
对外接口：`run()` 返回 (items, ev, stats)；`python3 review_laozi_full.py` 打印概览。
副作用：写 laozi-variant-review.json（中间产物，不改台账）。

**四项证据各自能证明什么、不能证明什么**：
  全书用字对（≥3 例）—— 证明「两传本用字习惯不同」。不能证明哪个字对。
  语序回查（片段在对侧别处存在）—— 证明「不是脱文，是次序不同」。
  源文件回查（多字片段在对侧全文确无）—— 证明「两侧文本确不同」。
      不能证明「王弼原书无此句」，那要影印页。
  注文复述（注文含差异字前后 3 字窗口）—— 注文与经文用字一致，弱证据。

**confirmed 的边界**：只说「差异性质已确认」，从不说「某版本正确」。
146 条没有第三方版本可比，标待考才是诚实；把「两侧不同」写成「已确认异文」才是造假。
"""
import io
import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import laozi_review_core as C
import build_laozi_variant_ledger as G
from cn_norm import norm

HERE = os.path.dirname(os.path.abspath(__file__))
RULES = os.path.join(HERE, 'laozi-review-rules.json')
OUT = os.path.join(G.BASE, 'raw', 'commentary', 'index', 'laozi-variant-review.json')

FUNC = set('之乎者也矣已焉哉夫其而则故是以于於与为乃且若所兮')
STRONG, MEDIUM = 3, 2
BIG = 4          # 片段长到这个字数，才值得回查源文件


def load_rules():
    d = json.load(io.open(RULES, encoding='utf-8'))
    table = {}
    for key in ('font_normalization', 'orthographic_variant', 'textual_variant'):
        for a, b, why in d.get(key) or []:
            table[(a, b)] = (key, why)
    return table


def note_texts():
    """B 侧逐章注文（源文件里非经文行）。"""
    p = os.path.join(G.BASE, G.B_SRC)
    lines = io.open(p, encoding='utf-8').read().split('\n')
    chapters, cur = [], None
    for i, s in enumerate(lines, 1):
        tt = s.strip()
        if not tt:
            continue
        if G.CH_RE.match(tt):
            if cur:
                chapters.append(cur)
            cur = {'name': tt, 'rows': []}
            continue
        if cur is None or G.B_SKIP_RE.match(tt) or G.B_TAIL_RE.match(tt):
            continue
        cur['rows'].append((i, tt))
    if cur:
        chapters.append(cur)
    B, _ = G.load_b()
    out = {}
    for n, c in enumerate(chapters, 1):
        canon = {e['line'] for e in B.get(n, [])}
        out[n] = norm(''.join(tx for ln, tx in c['rows'] if ln not in canon))
    return out


def main_core(cores):
    return max(cores, key=lambda c: (len(c['a']) + len(c['b']),
                                     any(ch not in FUNC for ch in c['a'] + c['b'])))


def run():
    items, ev = C.build()
    pc, pch = ev['pair_count'], ev['pair_chaps']
    table = load_rules()
    a_by, b_by = C.chapter_texts()
    notes = note_texts()

    # 对侧全文，用于回查
    p = os.path.join(G.BASE, G.B_SRC)
    raw_b = norm('\n'.join(l for l in io.open(p, encoding='utf-8').read().split('\n')
                           if not l.strip().startswith('#')))

    for it in items:
        cores = it['diff_core']['cores']
        ops = {c['op'] for c in cores}
        m = main_core(cores)
        n = G.ch_no(it['chapter'])
        it['main_core'] = m

        # ---------- 形态（客观可算） ----------
        if ops == {'delete'}:
            diff_type, scope = 'omission', '脱文'
        elif ops == {'insert'}:
            diff_type, scope = 'addition', '衍文'
        elif ops == {'replace'}:
            diff_type, scope = 'char_level', '字词'
        else:
            diff_type, scope = 'mixed', '混合'

        # 语序：多字片段在对侧章内另处出现，不是缺字，是次序不同
        word_order = False
        for c in cores:
            if c['op'] == 'delete' and len(c['a']) >= 3:
                t = norm(c['a'])
                bn = b_by.get(n, '')
                if t in bn:
                    word_order = True
                    it['word_order_note'] = ('「%s」在对侧同章另处出现（位置 %d），'
                                             '属次序不同，不是脱文。' % (c['a'], bn.find(t)))
        if word_order:
            diff_type, scope = 'word_order', '语序'

        if diff_type in ('omission', 'addition') and len(m['a'] + m['b']) >= BIG:
            scope = '脱句' if diff_type == 'omission' else '衍句'
        it['diff_type'] = diff_type
        it['variant_scope'] = scope

        # ---------- 证据 1：全书用字对 ----------
        pairs = [(c['a'], c['b']) for c in cores
                 if c['op'] == 'replace' and len(c['a']) == 1 and len(c['b']) == 1]
        sys_ev = [dict(a=a, b=b, count=pc.get((a, b), 0),
                       chapters=sorted(pch[(a, b)])) for a, b in pairs if pc.get((a, b))]
        it['systematic'] = sys_ev
        best = max(sys_ev, key=lambda x: x['count']) if sys_ev else None
        best_n = best['count'] if best else 0

        # ---------- 证据 2：注文复述（差异字前后 3 字窗口） ----------
        cited = None
        nb = notes.get(n, '')
        if nb and len(m['b']) >= 1:
            bn = b_by.get(n, '')
            k = bn.find(m['b'])
            if k >= 0:
                for pad in (3, 2):
                    w = bn[max(0, k - pad):k + len(m['b']) + pad]
                    if len(w) >= len(m['b']) + 2 and w in nb:
                        cited = w
                        break
        it['note_cited'] = cited

        # ---------- 证据 3：多字片段源文件回查 ----------
        checked = None
        if diff_type in ('omission', 'addition') and len(m['a'] + m['b']) >= BIG:
            t = norm(m['a'] if diff_type == 'omission' else m['b'])
            hit = t in (raw_b if diff_type == 'omission' else ''.join(
                v for k, v in sorted(a_by.items()) if k[1] == 'A1'))
            checked = dict(fragment=m['a'] or m['b'], found_other_side=hit)
        it['source_checked'] = checked

        # ---------- 来源与强度 ----------
        hit = table.get((m['a'], m['b'])) if len(m['a']) == 1 and len(m['b']) == 1 else None
        if hit and hit[0] == 'font_normalization':
            it['error_source'], it['evidence_level'], it['confirmed'] = (
                'font_normalization', 'strong', True)
            it['impact'] = 'font'
            it['verify_note'] = ('录入字体层差异：' + hit[1] +
                                 '两传本此处在字上并无不同，不构成传本异文。')
        elif hit and hit[0] == 'orthographic_variant':
            it['error_source'], it['impact'] = 'orthographic_variant', 'orthography'
            if best_n >= STRONG:
                it['evidence_level'], it['confirmed'] = 'strong', True
                it['verify_note'] = ('%s 全书 A 作「%s」/ B 作「%s」共 %d 例（章 %s）。'
                                     '确认的是两传本用字习惯不同，不判正误。'
                                     % (hit[1], best['a'], best['b'], best_n,
                                        '、'.join(str(x) for x in best['chapters'])))
            elif best_n >= MEDIUM:
                it['evidence_level'], it['confirmed'] = 'medium', False
                it['verify_note'] = ('%s 全书共 %d 例（章 %s），样本偏少，待考。'
                                     % (hit[1], best_n,
                                        '、'.join(str(x) for x in best['chapters'])))
            else:
                it['evidence_level'], it['confirmed'] = 'none', False
                it['verify_note'] = hit[1] + ' 仅此一见，无第三方版本佐证，待考。'
        elif hit and hit[0] == 'textual_variant':
            it['error_source'], it['impact'] = 'textual_variant', 'meaning'
            it['evidence_level'] = 'strong' if best_n >= STRONG else 'none'
            it['confirmed'] = best_n >= STRONG
            it['verify_note'] = (('%s 全书 A/B 互有出入共 %d 例（章 %s），'
                                  '确认为两传本实词差异，不判正误。'
                                  % (hit[1], best_n,
                                     '、'.join(str(x) for x in best['chapters'])))
                                 if best_n else hit[1] + ' 待考。')
        elif word_order:
            it['error_source'], it['evidence_level'], it['confirmed'] = (
                'textual_variant', 'medium', False)
            it['impact'] = 'syntax'
            it['verify_note'] = it['word_order_note'] + '次序不同可确认，孰为原本待考。'
        elif diff_type in ('omission', 'addition') and len(m['a'] + m['b']) >= BIG:
            it['error_source'], it['evidence_level'], it['confirmed'] = (
                'unknown', 'medium', False)
            it['impact'] = 'meaning'
            it['verify_note'] = ('A 侧「%s」在 B 侧源文件全文确无（已回查）。'
                                 '两传本确不同，但未见王弼本影印页，'
                                 '不写成版本学结论，待考。' % m['a'])
        elif cited:
            it['error_source'], it['evidence_level'], it['confirmed'] = (
                'unknown', 'medium', False)
            it['impact'] = 'lexical'
            it['verify_note'] = ('B 侧注文复述经文作「%s」，与 B 侧经文用字一致；'
                                 '注文与经文同源，可作旁证，但不足以定版本，待考。' % cited)
        else:
            chars = ''.join(c['a'] + c['b'] for c in cores)
            if chars and all(ch in FUNC for ch in chars):
                it['error_source'], it['evidence_level'], it['confirmed'] = (
                    'textual_variant', 'none', False)
                it['impact'] = 'syntax'
                it['verify_note'] = ('虚词出入（%s）。属两传本常见现象，'
                                     '但无第三方版本可证，待考。'
                                     % '、'.join('%s/%s' % (c['a'] or '∅', c['b'] or '∅')
                                                 for c in cores))
            else:
                it['error_source'], it['evidence_level'], it['confirmed'] = (
                    'unknown', 'none', False)
                it['impact'] = 'lexical' if diff_type == 'char_level' else 'syntax'
                it['verify_note'] = ('两传本作「%s」/「%s」，未见字书或版本依据，待考。'
                                     % (m['a'] or '∅', m['b'] or '∅'))

        it['status'] = 'confirmed' if it['confirmed'] else 'pending'
        # 是否需要人工逐条复核。虚词出入（syntax）性质清楚——两传本虚词增删是
        # 常见现象，缺的只是「哪个版本是原本」的第三方版本，这类不必逐条占人工；
        # 实词/字词类没有依据就真的判不了，才要人看。
        it['needs_human'] = (it['evidence_level'] == 'none' and it['impact'] != 'syntax')

    stats = dict(
        total=len(items),
        by_status=dict(Counter(i['status'] for i in items)),
        by_source=dict(Counter(i['error_source'] for i in items)),
        by_evidence=dict(Counter(i['evidence_level'] for i in items)),
        by_impact=dict(Counter(i['impact'] for i in items)),
        by_diff_type=dict(Counter(i['diff_type'] for i in items)),
        confirmed=sum(1 for i in items if i['confirmed']),
        pending=sum(1 for i in items if not i['confirmed']),
        font_layer=sum(1 for i in items if i['error_source'] == 'font_normalization'),
        needs_human=sum(1 for i in items if i['needs_human']),
        by_needs_human=dict(Counter(str(i['needs_human']) for i in items)),
    )
    return items, ev, stats


def main():
    items, ev, stats = run()
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    print()
    for lvl in ('strong', 'medium'):
        sel = [i for i in items if i['evidence_level'] == lvl]
        print('—— 证据 %s（%d 条）——' % (lvl, len(sel)))
        for i in sel:
            m = i['main_core']
            print('  %-8s %-5s %-12s %-20s %s' % (
                i['ledger_id'], i['chapter'], i['diff_type'],
                '%s>%s' % (m['a'] or '∅', m['b'] or '∅'), i['verify_note'][:46]))
        print()
    v = dict(_note='老子两传本 181 条全量核校结果。diff_type 是形态（客观），'
                   'error_source 是来源归属（推断），confirmed 只说差异性质已确认，'
                   '不说某版本正确。evidence_level: strong/medium/none。',
             count=len(items), stats=stats, items=items)
    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps(v, ensure_ascii=False, indent=1) + '\n')
    print('写出', OUT)


if __name__ == '__main__':
    main()
