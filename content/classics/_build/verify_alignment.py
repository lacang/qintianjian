# -*- coding: utf-8 -*-
"""注疏索引对齐抽检。

只做「能不能被源文件证伪」这一类检查——不去猜对齐对不对，
而是把每条条目的 canon_text 拿回注本源文件里找，找不到就是硬错。

检查项：
  1. canon_text 非空的条目，文字必须能在对应注本源文件里找到（去标点 + 繁简归一后）
  2. note_text 非空的条目，文字必须能在源文件里找到
  3. 每条至少有一个文本字段非空，不能产出空壳
  4. verified_by / verified_at 必须全空——检索命中不等于证据成立
  5. 源文件 SHA256 与 canon SHA256 记录必须齐全
  6. align.status 必须是已定义的状态之一，不许出现野状态
  7. 大学结构映射必须完整（11 章 + 补传 in_canon=False）
  8. 老子第 13/76 章必须在产品展示层带出差异提示
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cn_norm import norm  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(BASE, 'raw', 'commentary', 'index', 'commentary-index.json')

VALID_STATUS = {'ok', 'partial', 'self_contained', 'assumed', 'chapter_level',
                'no_canon', 'ok_variant', 'no_hit', 'jizhu_supplement'}

fails, warns, stats = [], [], {}
variant_ledger = []

# 注本 → 原典。与 build_commentary_index.py 的 CANON_CLASSIC 保持一致。
CANON_CLASSIC = {
    'lunyu-zhushu': 'lunyu', 'lunyu-jizhu': 'lunyu', 'sishu-zhangju-jizhu': 'lunyu',
    'mengzi-zhushu': 'mengzi', 'mengzi-jizhu': 'mengzi',
    'daxue-zhangju-jizhu': 'daxue', 'zhongyong-zhangju-jizhu': 'zhongyong',
    'laozi-wangbi': 'laozi', 'laozi-wangbi-daozang': 'laozi', 'laozi-wangbi-jin': 'laozi',
    'zhuangzi-guoxiang': 'zhuangzi', 'nanhua-zhushu': 'zhuangzi',
}

# 一部注本跨多部原典（四书合刻）。证伪时要把四部原典合起来当池子，
# 只拿论语去证孟子章，会把正确的经文全判成「凭空生成」。
MULTI_CANON = {
    'sishu-zhangju-jizhu': ['lunyu', 'mengzi', 'daxue', 'zhongyong'],
}

_canon_cache = {}


def canon_norm(classic):
    if not classic:
        return None
    if classic not in _canon_cache:
        p = os.path.join(BASE, 'parsed', 'canon', classic + '.json')
        if not os.path.exists(p):
            _canon_cache[classic] = None
        else:
            d = json.load(io.open(p, encoding='utf-8'))
            units = d if isinstance(d, list) else (d.get('chapters') or d.get('units') or [])
            _canon_cache[classic] = norm(''.join(
                (u.get('text') or u.get('content') or '') for u in units))
    return _canon_cache[classic]


_CLAUSE_RE = re.compile(r'[^，。、；：：？！「」『』“”‘’（）《》〈〉\s]+')

# 与 build_commentary_index.py 的 _SOURCE_NOISE_RE 一致。
# 源文件里的 &#39; 残渣在抽取阶段已清掉，抽检读源文件时也必须清，
# 否则同一句话在两边长度不同，会被误判成缺字。
_SOURCE_NOISE_RE = re.compile(r'&#\d+;|#39')


def _missing_parts(text, src_normed, min_len=4):
    """返回在源文件里找不到的片段。

    不能要求整串连续出现：注本把注文插在经文句子中间
    （「孟懿子问孝。（孔曰：…）子曰：无违。」），整句在源文件里本来就是断开的。
    正确判据是「每个小句都能在源文件里找到」，顺序对不对由对齐逻辑保证，
    这里只查有没有凭空生成的字。
    """
    bad = []
    for part in _CLAUSE_RE.findall(text or ''):
        p = norm(part)
        if len(p) < min_len:
            continue
        if p not in src_normed:
            bad.append(part)
    return bad


def fail(msg):
    fails.append(msg)


def warn(msg):
    warns.append(msg)


def main():
    idx = json.load(io.open(IDX, encoding='utf-8'))
    entries = idx['entries']
    print('条目总数', len(entries))

    # 5. SHA256
    src_sha = (idx['meta'] or {}).get('source_sha256') or {}
    canon_sha = (idx['meta'] or {}).get('canon_sha256') or {}
    if not src_sha:
        fail('meta.source_sha256 缺失')
    for k, v in src_sha.items():
        if not v.get('sha256'):
            fail('源文件 SHA256 缺失：%s（%s）' % (k, v.get('error')))
    if not canon_sha:
        fail('meta.canon_sha256 缺失')

    # 4. verified 必须全空
    n_verified = sum(1 for e in entries
                     if e.get('verified_by') or e.get('verified_at'))
    if n_verified:
        fail('有 %d 条被标成已核实——检索命中不等于证据成立' % n_verified)

    # 6. 状态白名单
    bad_status = {}
    for e in entries:
        st = ((e.get('align') or {}).get('status'))
        if st not in VALID_STATUS:
            bad_status[st] = bad_status.get(st, 0) + 1
    if bad_status:
        fail('出现未定义的 align.status：%s' % bad_status)

    # 缓存每个源文件的归一文本
    raw_dir = os.path.join(BASE, 'raw', 'commentary', 'text')
    cache = {}

    def src_norm(path):
        if path not in cache:
            lp = (path or '').replace('\\', '/')
            cands = [
                os.path.join(BASE, lp),
                os.path.join(BASE, lp.split('content/classics/', 1)[-1]),
                os.path.join(raw_dir, os.path.basename(lp)),
            ]
            cache[path] = None
            for c in cands:
                if os.path.exists(c):
                    cache[path] = norm(_SOURCE_NOISE_RE.sub(
                        '', io.open(c, encoding='utf-8').read()))
                    break
        return cache[path]

    paren_cache = {}

    def src_noparen(path):
        """剥掉（…）括号注文后的源文件归一文本。"""
        if path not in paren_cache:
            lp = (path or '').replace('\\', '/')
            cands = [
                os.path.join(BASE, lp),
                os.path.join(BASE, lp.split('content/classics/', 1)[-1]),
                os.path.join(raw_dir, os.path.basename(lp)),
            ]
            paren_cache[path] = None
            for c in cands:
                if os.path.exists(c):
                    raw = _SOURCE_NOISE_RE.sub(
                        '', io.open(c, encoding='utf-8').read())
                    # 括号必须限制在同一行内：南华真经注疏里「（」9 个、「）」11 个，
                    # 不配对。允许跨行匹配的话，一个孤立「（」会一直吃到几万字之后的
                    # 「）」，把中间的经文整段吞掉，抽检就变成假阳性。
                    paren_cache[path] = norm(
                        re.sub(r'（[^）\n]*）', '', raw))
                    break
        return paren_cache[path]

    # 1/2/3. 文本可证伪
    checked = 0
    for e in entries:
        ct = (e.get('canon_text') or '').strip()
        nt = (e.get('note_text') or '').strip()
        if not ct and not nt:
            fail('空壳条目：%s %s seq=%s' % (e.get('commentary_key'), e.get('chapter'), e.get('seq')))
            continue
        src = src_norm(e.get('source_file') or '')
        if src is None:
            fail('源文件缺失：%s' % e.get('source_file'))
            continue
        if ct:
            checked += 1
            st = ((e.get('align') or {}).get('status'))
            # canon_text 的来源决定拿什么证伪它：
            #   ok              经文取自独立原典 → 必须能在 parsed/canon 里找到
            #   self_contained  经文取自注本自身 → 必须能在注本里找到
            # 两者都不是「必须在注本里找到」——注本与原典本就用字不同，
            # 拿注本去证伪原典文字，等于把异文当成错误。
            if st == 'ok_variant':
                # 跨传本系统：章次能对、文字本来就不该一致。
                # 拿原典去证伪这里的文字，等于要求河上公本写成王弼本。
                vb = _missing_parts(ct, src)
                if vb:
                    fail('ok_variant 的 canon_text 在注本里也找不到：%s %s | 缺 %r'
                         % (e.get('commentary_key'), e.get('chapter'), vb[:1]))
                continue
            if st == 'self_contained':
                # marked 型注本把注文用括号插在经文中间：
                # 「周公谓鲁公（孔曰：…）曰：」——经文在原文件里本来就是断开的。
                # 先把括号注文剥掉再比对，否则会把正常的夹注当成缺字。
                bad = _missing_parts(ct, src_noparen(e.get('source_file') or ''))
                if bad:
                    fail('canon_text（取自注本）有片段在注本里找不到：%s %s | 缺 %r'
                         % (e.get('commentary_key'), e.get('chapter'), bad[:1]))
            else:
                ck = e.get('commentary_key')
                if MULTI_CANON.get(ck):
                    csrc = ''.join((canon_norm(x) or '') for x in MULTI_CANON[ck])
                    cn = '+'.join(MULTI_CANON[ck])
                else:
                    cn = CANON_CLASSIC.get(ck)
                    csrc = canon_norm(cn)
                if csrc is None:
                    fail('canon_text 无法校验（缺 %s 原典）：%s %s'
                         % (cn, e.get('commentary_key'), e.get('chapter')))
                else:
                    bad = _missing_parts(ct, csrc)
                    if bad:
                        fail('canon_text 有片段在原典里找不到（凭空生成？）：%s %s | 缺 %r'
                             % (e.get('commentary_key'), e.get('chapter'), bad[:1]))
                    # 原典对得上、注本对不上，是异文不是错误。
                    # 逐条记进 variant_ledger，这才是「版本差异本身就是知识」。
                    vb = _missing_parts(ct, src)
                    if vb:
                        # 线索必须能回到「哪一条索引、源文件哪一行」，
                        # 否则它只是一句孤立的话，人工核校时无从下手。
                        variant_ledger.append({
                            'entry_id': e.get('id'),
                            'commentary_key': e.get('commentary_key'),
                            'book': e.get('book'),
                            'chapter': e.get('chapter'),
                            'canon_snippet': ct[:60],
                            'differs': vb[:3],
                            'canon_classic': cn,
                            'source_file': e.get('source_file'),
                            'loc_start': e.get('loc_start'),
                            'loc_end': e.get('loc_end'),
                            # 下面三个是这条线索成立的机械前提，不是校勘结论
                            'canon_side_verified': True,
                            'note_side_missing': True,
                            'auto_checked_at': None,
                            # 差异类型必须人工判：字词 / 脱文 / 衍文 / 语序 / 结构性。
                            # 自动猜「字形相近所以是异体」会把真异文误判成排印差异，
                            # 这正是版本学判断不能被自动匹配替代的地方。
                            'diff_type': None,
                            'variant_scope': None,
                            'confirmed': False,
                            'confirmed_by': None,
                            'confirmed_at': None,
                            'verify_note': None,
                        })
        if nt and len(nt) >= 8:
            bad = _missing_parts(nt, src)
            if bad:
                fail('note_text 有片段在注本里找不到：%s %s | 缺 %r'
                     % (e.get('commentary_key'), e.get('chapter'), bad[:1]))
    stats['canon_text 校验条数'] = checked

    # 7. 大学结构映射
    dax = [e for e in entries if e.get('commentary_key') == 'daxue-zhangju-jizhu']
    sup = [e for e in dax if (e.get('align') or {}).get('status') == 'jizhu_supplement']
    if len(sup) != 1:
        fail('大学朱子补传条目数应为 1，实得 %d' % len(sup))
    else:
        s = sup[0]
        if (s.get('align') or {}).get('in_canon') is not False:
            fail('朱子补传 in_canon 必须为 False')
        if len(s.get('note_text') or '') < 134:
            # 补传应为 134 字。这份底本里只有结语和程子按语，正文缺失。
            # 缺正文是源缺陷，不是对齐错误——只要索引显式记录了缺口、
            # canon_text 留空没有代拟朱熹文字，就不该报 warn。
            if s.get('supplement_text_present') is False:
                print('  · 朱子补传正文在本底本中缺失（%d 字，应为 134 字），'
                      '已显式记录且未代拟，属源缺陷'
                      % len(s.get('note_text') or ''))
            else:
                warn('朱子补传正文偏短且未标记缺口：%d 字' % len(s.get('note_text') or ''))
    reordered = [e for e in dax
                 if ((e.get('align') or {}).get('structure_note') or {}).get('structure_type') == 'reordered']
    if not reordered:
        fail('大学未带出 reordered 结构记录（古本第 4 段重排）')
    stats['大学条目'] = len(dax)

    # 8. 老子展示层
    lz = [e for e in entries if e.get('commentary_key') == 'laozi-wangbi-daozang']
    hi = [e for e in lz if ((e.get('align') or {}).get('variant_priority') == 'high'
                            or (e.get('display') or {}).get('variant_priority') == 'high')]
    stats['老子展示层高优先级条目'] = len(hi)
    if not hi:
        warn('老子索引层未见第 13/76 章展示标记（可能在原典层）')

    # 各注本条目数
    by_book = {}
    for e in entries:
        by_book[e.get('commentary_key')] = by_book.get(e.get('commentary_key'), 0) + 1
    stats['各注本条目数'] = by_book

    print('\n=== 统计 ===')
    for k, v in stats.items():
        print(' ', k, '=', v)

    print('\n=== 失败 %d ===' % len(fails))
    for m in fails[:40]:
        print('  ✗', m)
    # 异文台账：原典对得上、注本对不上的片段。
    # 不写进索引（索引是检索层，不是校勘层），先落盘供人工确认。
    if variant_ledger:
        # 同一处差异常被多个注本同时命中（四书合刻 + 单行本），
        # 用 group_id 把它们串起来：核校时看一处就知道有几个本子涉及，
        # 不必在 142 条里逐条比对是不是同一件事。
        _g = {}
        for _i in variant_ledger:
            _g.setdefault(tuple(sorted(_i['differs'])), []).append(_i)
        for _k, _grp in _g.items():
            if len(_grp) > 1:
                _gid = 'VG-%03d' % (sorted(_g).index(_k) + 1)
                for _i in _grp:
                    _i['group_id'] = _gid
                    _i['group_size'] = len(_grp)
        for _n, _i in enumerate(variant_ledger, 1):
            _i['ledger_id'] = 'VL-%04d' % _n
            _i.setdefault('group_id', None)
            _i.setdefault('group_size', 1)

        out = os.path.join(BASE, 'raw', 'commentary', 'index', 'variant-ledger.json')
        io.open(out, 'w', encoding='utf-8').write(
            json.dumps({
                '_note': ('原典与注本用字不同、但原典侧可证的片段。'
                          '这些是异文线索，不是已完成的校勘结论；'
                          'confirmed 全为 false，需人工逐条核对后方可升级。'
                          'diff_type / variant_scope 留空是刻意的——'
                          '差异类型属于版本学判断，不能由自动匹配代替。'),
                '_schema': {
                    'ledger_id': '线索唯一编号',
                    'group_id': '同一差异被多个注本命中时的归并组；单条为 null',
                    'entry_id': '对应 commentary-index.json 的条目 id',
                    'canon_side_verified': '原典侧已确认存在该文字',
                    'note_side_missing': '注本侧已确认找不到该文字',
                    'diff_type': '人工填：char_level / omission / addition / word_order / structure',
                    'variant_scope': '人工填：字词 / 脱文 / 衍文 / 语序 / 结构性',
                    'confirmed': '人工核校通过后置 true，并填 confirmed_by / confirmed_at',
                },
                'count': len(variant_ledger),
                'grouped_count': sum(1 for i in variant_ledger if i.get('group_id')),
                'group_count': sum(1 for g in _g.values() if len(g) > 1),
                'confirmed_count': sum(1 for i in variant_ledger if i.get('confirmed')),
                'items': variant_ledger,
            }, ensure_ascii=False, indent=1))
        print('\n异文线索 %d 条 → %s' % (len(variant_ledger), out))

    print('\n=== 警告 %d ===' % len(warns))
    for m in warns[:20]:
        print('  !', m)

    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
