# -*- coding: utf-8 -*-
"""把老子两传本异文台账整理成人工核校工作单。

不判差异类型。程序只做「发现并定位候选差异」，diff_type / variant_scope
由人核定——这个边界是用户明确划的，也是前一轮自动判定失败后确立的：
自动匹配会把真异文误判成排印差异（「女/汝」不是错字，是通假或版本用字）。

工作单按章组织，每章并列两侧全文和本章全部差异块。
只给条目列表的话，人得自己在 179 条里按章号筛，看不到全章面貌。
"""
import io
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(BASE, 'raw', 'commentary', 'index', 'laozi-variant-ledger.json')
OUT = os.path.join(BASE, 'raw', 'commentary', 'index', 'laozi-variant-review-sheet.md')


def main():
    d = json.load(io.open(LEDGER, encoding='utf-8'))
    items = d['items']
    cand = [x for x in items if x['kind'] == 'variant_candidate']
    susp = [x for x in items if x['kind'] != 'variant_candidate']

    L = []
    L.append('# 老子两传本异文 · 人工核校工作单')
    L.append('')
    L.append('> 这份文件是**待核校的候选差异**，不是校勘结论。')
    L.append('> 所有 `diff_type` / `variant_scope` / 结论栏都空着，等人工填写。')
    L.append('> 程序只做了两件事：把两个底本逐章对齐，把对不上的地方定位出来。')
    L.append('')
    L.append('## 一、两侧底本')
    L.append('')
    L.append('| 侧 | 版本 | 角色 | 来源 | 说明 |')
    L.append('|---|---|---|---|---|')
    ea = d['editions']['A']
    eb = d['editions']['B']
    L.append('| A | %s | 独立原典 | `%s` | Kanripo %s / %s，%s。%s |'
             % (ea['name'], ea['source'], ea['repo'], ea['branch'],
                ea['license'], ea['note']))
    L.append('| B | %s | 另一传本系统 | `%s` | 经注切分依据排版交替规律，'
             '**未经校勘**，引用前须回源文件核对 |' % (eb['name'], eb['source']))
    L.append('')
    L.append('**章次对应不代表文字一致，两侧不得互相冒充。**')
    L.append('')
    L.append('## 二、规模')
    L.append('')
    L.append('| 项 | 数 |')
    L.append('|---|---|')
    L.append('| 候选异文（本章工作单范围） | %d 条 |' % len(cand))
    L.append('| 其中同章同内容合并前的原始差异块 | %d 个 |' % d['count_before_dedup'])
    L.append('| 涉及章数 | %d 章 |' % len(set(x['chapter'] for x in cand)))
    L.append('| A 侧有、B 侧无（候选脱文/衍文） | %d 条 |'
             % sum(1 for x in cand if not x['wangbi_side']))
    L.append('| 长片段差异（单列，不进本单） | %d 条 |' % len(susp))
    L.append('')
    L.append('**不预设差异总数。** 这个数字是本次对齐跑出来的结果，'
             '不是「老子有 179 处异文」这个结论。')
    L.append('')
    L.append('## 三、怎么填')
    L.append('')
    L.append('每条差异下方有三栏：')
    L.append('')
    L.append('- **差异性质**：`字词` / `脱文` / `衍文` / `语序` / `通假` / `异体` / `避讳` / `底本讹误` / `存疑`')
    L.append('- **核校依据**：你凭什么这么判（对照本、字形、文义、前人校记）')
    L.append('- **核校人 / 日期**')
    L.append('')
    L.append('判完一条，回填到 `laozi-variant-ledger.json` 的对应 `ledger_id`：'
             '`diff_type`、`variant_scope`、`confirmed`、`confirmed_by`、'
             '`confirmed_at`、`verify_note`。')
    L.append('')
    L.append('**不要一次打开多个注本就把结论复制过去。** 本台账只有两个传本，'
             '不存在跨注本归并问题；但第 29 章 A 侧底本并列两套正文（A1/A2），'
             '两套各自产生的线索必须分别判——它们可能来自同一传本系统，'
             '也可能只是各自采用相同写法。')
    L.append('')
    L.append('## 四、逐章对照')
    L.append('')

    by_ch = {}
    for x in cand:
        by_ch.setdefault(x['chapter'], []).append(x)

    def cn(s):
        return int(re.match(r'(\d+)', s).group(1))

    for ch in d['chapters']:
        name = ch['chapter']
        if name not in by_ch:
            continue
        L.append('### %s（差异 %d 条）' % (name, ch['diff_count']))
        L.append('')
        q = ch.get('b_quality') or {}
        if q.get('rejected_as_note'):
            L.append('> ⚠ B 侧该章交替位上有 %d 行被判为注文剔除，'
                     '经注边界须人工确认：%s'
                     % (q['rejected_as_note'],
                        '、'.join('L%d' % r['line'] for r in q.get('rejected_samples', []))))
            L.append('')
        L.append('**A 侧（河上公系统）**')
        L.append('')
        for e in ch['a_text']:
            tag = '' if e['variant_set'] == 'A1' and len(ch['a_text']) == 1 else '［%s］' % e['variant_set']
            L.append('```')
            L.append('%s%s' % (tag, e['text']))
            L.append('```')
        L.append('')
        L.append('**B 侧（王弼本）**')
        L.append('')
        L.append('```')
        L.append(ch['b_text'])
        L.append('```')
        L.append('')
        L.append('| # | A 侧写法 | B 侧写法 | 次数 | A 行 / B 行 | 差异性质 | 核校依据 |')
        L.append('|---|---|---|---|---|---|---|')
        for x in by_ch[name]:
            a = x['differs'][0].replace('|', '\\|')
            b = (x['wangbi_side'] or '**（B 侧无）**').replace('|', '\\|')
            loc = 'L%s / L%s' % (x['loc_start'], x['loc_end'])
            if x.get('chapter_29_edition'):
                loc += '［%s］' % x['chapter_29_edition']
            L.append('| %s | `%s` | `%s` | %d | %s |  |  |'
                     % (x['ledger_id'], a, b, x['occurrences'], loc))
        L.append('')

    if susp:
        L.append('## 五、长片段差异（单列，不进异文台账）')
        L.append('')
        L.append('差异块超过 12 字。这类多半不是「一字一词的异文」，'
                 '而是整句归属不同、脱衍，或 B 侧经注切分有偏移。'
                 '先当另一类问题看，判清性质后再决定是否并入台账。')
        L.append('')
        L.append('| # | 章 | A 侧片段 | B 侧片段 | 次数 |')
        L.append('|---|---|---|---|---|')
        for x in susp:
            a = x['differs'][0].replace('|', '\\|')
            b = (x['wangbi_side'] or '**（B 侧无）**').replace('|', '\\|')
            L.append('| %s | %s | `%s` | `%s` | %d |'
                     % (x['ledger_id'], x['chapter'], a, b, x['occurrences']))
        L.append('')

    L.append('## 六、已知缺口')
    L.append('')
    L.append('1. **B 侧经注切分是排版推断，未经校勘。** 底本注文有时跨行、有时占多行，'
             '交替规律会整体错位。已用「与河上公本重合度」修正，'
             '但第 10、16、38、41、81 章仍有行被判为注文剔除，边界须人工确认。')
    L.append('2. **只覆盖两个传本。** 帛书、竹简、傅奕本、想尔本等未纳入。'
             '本台账回答的是「河上公系统与王弼本在这两处怎么写」，'
             '不是「老子原文是什么」。')
    L.append('3. **A 侧第 61 章底本自身有重文**（「天下之交天下之交牝化」），'
             '疑为「天下之交，天下之牝」之讹。这是底本问题，不是两本差异。')
    L.append('4. **虚词差异占比高。** 179 条里 108 条是单字，'
             '「之/也/矣/而/者」这类句末虚词在传本间大量增减。'
             '这类差异真实存在，但价值远低于实词异文，核校时可按性质批量处理。')
    L.append('')

    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
    print('老子异文核校工作单 → %s' % os.path.relpath(OUT, BASE))
    print('  章 %d，候选 %d 条，长片段 %d 条'
          % (len(by_ch), len(cand), len(susp)))


if __name__ == '__main__':
    main()
