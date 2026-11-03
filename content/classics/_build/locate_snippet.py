# -*- coding: utf-8 -*-
"""在注本章文里定位「差异所在的那一句」，给人工核校用。

职责：输入一条异文线索 + 注本章文，输出一个窗口和定位依据。
数据来源：`raw/commentary/index/variant-ledger.json` 与
`raw/commentary/text/*.txt`（行号由线索的 loc_start/loc_end 给出）。
对外接口：`read_span(path, a, b)`、`locate(seg, canon_text, snippet, base)`。
副作用：无（只读源文件，内部缓存）。

**为什么单独抽成一个模块**：工作单（`make_variant_worklist.py`）和核校批
（`make_review_batch.py`）都要定位同一批线索。两处各写一套，改了一处忘了另一处，
同一组线索在两个文件里定位到不同的句子——人看到就会开始怀疑数据本身。

三种定位思路都试过，前两种不可靠，写在这里免得下一个人重走：

① 拿差异片段本身去搜：差异片段是**原典**写法，注本这里是另一个字，永远搜不到。
   搜不到就退回章首，人看不到差异字。
② 拿差异片段两侧各 12 字当双锚：原典「出吊于东郭氏」，注本这一章另有「出吊于滕」，
   「出吊于」四字命中到完全不相干的另一句。**人对着错句判，比不给位置更糟。**
③ 拿 canon_text 当锚做最长公共子串：可靠。canon_text 是按小句切的，
   差异常占掉大半，短句只剩 4 字公共部分，所以阈值取 4，
   并要求该公共块在章内出现不超过 2 次。

定位失败就返回 None，由调用方明说「未能定位，请回源核对」——
**不拿章首冒充位置**。
"""
import difflib
import io
import json
import os

from cn_norm import TR, PUNCT_RE, norm

WIDTH = 40
MIN_MATCH = 4

_canon_cache = {}
_src_cache = {}


def norm_map(s):
    """归一，同时记住每个归一字符来自原文哪个位置。

    必须带映射：`norm()` 会删标点，归一串的下标跟原文下标对不上，
    直接拿归一串的位置去切原文，窗口会整体偏移。
    """
    out, mp = [], []
    for i, ch in enumerate(s):
        for c in TR.get(ch, ch):
            if PUNCT_RE.match(c):
                continue
            out.append(c)
            mp.append(i)
    return ''.join(out), mp


def read_span(base, path, a, b):
    """按行号取注本章文（a/b 从 1 开始，含端点）。"""
    key = (base, path)
    if key not in _src_cache:
        fp = os.path.join(base, path)
        _src_cache[key] = (io.open(fp, encoding='utf-8').read().split('\n')
                           if os.path.exists(fp) else None)
    lines = _src_cache[key]
    if not lines:
        return ''
    return '\n'.join(s.strip() for s in lines[a - 1:b] if s.strip())


def locate(seg, canon_text='', snippet='', differs='', width=WIDTH):
    """返回 (窗口, 定位依据)；定位不到返回 (None, None)。"""
    ct = norm(canon_text or '') or norm(snippet or '')
    if not ct or not seg:
        return None, None
    seg_n, mp = norm_map(seg)
    if not seg_n:
        return None, None
    m = difflib.SequenceMatcher(None, ct, seg_n, autojunk=False).find_longest_match(
        0, len(ct), 0, len(seg_n))
    if m.size < MIN_MATCH:
        return None, None
    probe = ct[m.a:m.a + m.size]
    if seg_n.count(probe) > 2:
        return None, None
    # 窗口以 probe 在注本章文里的**实测位置**（m.b）为中心。
    # 曾经试过「原典侧起点 + 差异偏移」推算（start = m.b - m.a; center = start + k），
    # 想更贴近差异点，但注本在经文中间插入大段注文，推算偏差可达几百字——
    # 第 5 组「诲汝知之乎」的窗口直接落到上一章的注文里，人看到的是「比之杨墨…」。
    # m.b 是匹配出来的真实位置，比任何推算都可靠；差异落到窗口外的情形
    # 交给 locate_all 补第二个窗口。
    center = m.b
    lo = mp[max(0, center - width)] if mp else 0
    hi = mp[min(len(mp) - 1, center + m.size + width)]
    return seg[lo:hi + 1], probe


def locate_all(seg, canon_text='', snippet='', differs='', width=WIDTH):
    """主窗口 + 必要时补一个窗口。

    注本常把一句经文拆开排：论语集注「孔子于乡党，恂恂如也，似不能言者。」
    与「其在宗庙朝廷，便便言，唯谨尔。」之间隔了几百字注文。主窗口以差异点
    为中心，只能覆盖到前半句，差异落在注文之后，人看不到。
    所以检查 canon_text 尾部是否落在主窗口范围内，不在就按尾部再定位一次，
    两个窗口都给出来——**宁可多给一段，也不让人对着半句话判**。
    """
    w1, probe = locate(seg, canon_text, snippet, differs, width)
    if not w1:
        return [], None
    ct = norm(canon_text or '') or norm(snippet or '')
    # tail 不能含差异字：第 6 组差异是「庭 / 廷」，取尾部 8 字得
    # 「朝庭便便言唯谨尔」，注本写的是「朝廷」，整串永远搜不到。
    # 所以从差异片段之后取，那是两侧相同的部分，搜得到。
    d = norm(differs or '')
    k = ct.rfind(d) if d else -1
    tail = ct[k + len(d):] if k >= 0 else ct
    tail = tail[-8:] if len(tail) >= 4 else ct[-8:]
    wins = [w1]
    if tail and tail not in norm(w1):
        # 不能再用「差异点线性推算」——注本把经文拆开排，前后偏差几百字，
        # 推出来的位置会落在注文里。直接拿尾部文字在章文里搜，命中即真实位置。
        seg_n, mp = norm_map(seg)
        i = seg_n.find(tail)
        if i >= 0:
            lo = mp[max(0, i - width)] if mp else 0
            hi = mp[min(len(mp) - 1, i + len(tail) + width)]
            w2 = seg[lo:hi + 1]
            if norm(w2) not in norm(w1) and norm(w1) not in norm(w2):
                wins.append(w2)
    return wins, probe
