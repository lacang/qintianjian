"""老子两传本 181 条：形态分类 + 来源推断 + 影响程度。

职责：在 `laozi_review_core` 算出的差异核基础上，给每条定
      diff_type（客观形态）/ error_source（推断来源）/ impact（影响程度）/
      evidence_level（证据强度）/ status（结论状态）。
数据来源：laozi_review_core.build() 的返回值。
对外接口：`classify(items, ev)`；`python3 laozi_review_classify.py` 打印分布。
副作用：无。

**三条不许越的线**：
① diff_type 是形态，客观可算；error_source 是来源归属，是推断。
   两者混在一栏，就会把「程序发现两侧不同」说成「程序判定这是异体字」。
② confirmed 只在有独立证据时为 true。证据强度分三级：
   strong（全书用字对 ≥3 例 / B 侧注文或校记直接指向）→ confirmed
   medium（2 例，或结构对文可佐证）→ pending，但证据记下来
   none（只有「两侧不同」这一个事实）→ pending，写明无独立证据
③ 待考不是失败。181 条里大部分本来就没有第三方版本可比，
   标成待考才是诚实的；把「两侧不同」写成「已确认异文」才是造假。
"""
from collections import Counter

FUNC = set('之乎者也矣已焉哉夫其而则故是以于於与为乃且若所')
MEANING = set('道徳德仁義义禮礼智信勇柔弱剛刚强強無无有生死動动静静虛虚實实'
              '善惡恶美醜丑聖圣愚賢贤不爭争爲为化治亂乱人臣主民王侯')
STRONG_PAIR = 3      # 同一对单字在全书出现这么多次，才算系统性用字差异
MEDIUM_PAIR = 2


def main_core(cores):
    """多核条目取主核：先按 (a+b) 长度，再按是否实词。"""
    return max(cores, key=lambda c: (len(c['a']) + len(c['b']),
                                     any(ch in MEANING for ch in c['a'] + c['b'])))


def classify(items, ev):
    pc = ev['pair_count']
    pch = ev['pair_chaps']

    for it in items:
        cores = it['diff_core']['cores']
        ops = {c['op'] for c in cores}
        m = main_core(cores)
        it['main_core'] = m

        # ---------- 形态 ----------
        if ops == {'delete'}:
            diff_type, scope = 'omission', '脱文'
        elif ops == {'insert'}:
            diff_type, scope = 'addition', '衍文'
        elif ops == {'replace'}:
            diff_type = 'char_level'
            scope = '字词'
            if all(len(c['a']) == len(c['b']) == 1 for c in cores):
                scope = '字词'
        else:
            diff_type, scope = 'mixed', '混合'
        it['diff_type'] = diff_type
        it['variant_scope'] = scope

        # ---------- 用字对证据 ----------
        pairs = [(c['a'], c['b']) for c in cores
                 if c['op'] == 'replace' and len(c['a']) == 1 and len(c['b']) == 1]
        pair_ev = []
        for a, b in pairs:
            n = pc.get((a, b), 0)
            if n:
                pair_ev.append(dict(a=a, b=b, count=n, chapters=sorted(pch[(a, b)])))
        it['systematic'] = pair_ev
        best = max(pair_ev, key=lambda x: x['count']) if pair_ev else None

        # ---------- 来源 ----------
        if best and best['count'] >= STRONG_PAIR:
            # 全书一致的单向用字差异。注意：能确认的是「两传本用字习惯不同」，
            # 不是「哪个字对」。
            it['error_source'] = 'orthographic_variant'
            it['evidence_level'] = 'strong'
            it['confirmed'] = True
            it['verify_note'] = ('两传本系统性用字差异：A 侧作「%s」、B 侧作「%s」，'
                                 '全书共 %d 例（章 %s）。确认的是用字习惯不同，不判正误。'
                                 % (best['a'], best['b'], best['count'],
                                    '、'.join(str(x) for x in best['chapters'])))
        elif best and best['count'] >= MEDIUM_PAIR:
            it['error_source'] = 'orthographic_variant'
            it['evidence_level'] = 'medium'
            it['confirmed'] = False
            it['verify_note'] = ('疑为用字差异：A「%s」/ B「%s」全书共 %d 例（章 %s），'
                                 '样本偏少，待考。'
                                 % (best['a'], best['b'], best['count'],
                                    '、'.join(str(x) for x in best['chapters'])))
        else:
            it['error_source'] = 'textual_variant'
            it['evidence_level'] = 'none'
            it['confirmed'] = False
            chars = ''.join(c['a'] + c['b'] for c in cores)
            if chars and all(ch in FUNC for ch in chars):
                it['verify_note'] = '传本虚词出入（%s），无独立证据判性质，待考。' % (
                    '、'.join('%s/%s' % (c['a'] or '∅', c['b'] or '∅') for c in cores))
            else:
                it['verify_note'] = ('两传本文字不同（%s），未找到第三方版本或注文依据，待考。'
                                     % '、'.join('%s/%s' % (c['a'] or '∅', c['b'] or '∅')
                                                 for c in cores))

        # ---------- 影响程度 ----------
        chars = ''.join(c['a'] + c['b'] for c in cores)
        if it['error_source'] == 'orthographic_variant':
            it['impact'] = 'orthography'
        elif chars and all(ch in FUNC for ch in chars):
            it['impact'] = 'syntax'
        elif any(ch in MEANING for ch in chars):
            it['impact'] = 'meaning'
        elif diff_type in ('omission', 'addition', 'mixed'):
            it['impact'] = 'syntax'
        else:
            it['impact'] = 'lexical'

        it['status'] = 'confirmed' if it['confirmed'] else 'pending'

    return items


def report(items):
    print('形态  ', dict(Counter(i['diff_type'] for i in items)))
    print('范围  ', dict(Counter(i['variant_scope'] for i in items)))
    print('来源  ', dict(Counter(i['error_source'] for i in items)))
    print('影响  ', dict(Counter(i['impact'] for i in items)))
    print('证据  ', dict(Counter(i['evidence_level'] for i in items)))
    print('状态  ', dict(Counter(i['status'] for i in items)))


if __name__ == '__main__':
    import laozi_review_core as C
    items, ev = C.build()
    classify(items, ev)
    report(items)
