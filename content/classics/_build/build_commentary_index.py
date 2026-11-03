#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建注疏索引。

三条硬要求（2026-11-02 裁决）：
  1. 每条记录保留八项元数据：书名、作者或注家、篇章、原文、注释原文、
     原始文件位置、版本信息、获取来源。
  2. 必须区分「检索命中」与「证据成立」——match_status: hit / candidate / verified。
     自动召回只产出 hit，人工核过才能升 verified，产品只展示 verified。
  3. 结构上的脱漏、缺章、无法对齐，一律记录进报告，不静默补齐。

三种文本格式三种处理：
  marked          经文行 + [疏] 前缀疏文        → 经/注/疏三层可直接切分
  mixed           经文与注文同行混排，无标记    → 以原典句子为锚对齐，锚间为注文
  commentary_only 仅存注文，经文省略            → 按章号挂靠，经文留空待补
"""
import hashlib
import io
import json
import os
import re
import sys

from cn_norm import TR

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
RAW = os.path.join(BASE, 'raw', 'commentary')
INDEX_DIR = os.path.join(RAW, 'index')

CN_NUM = '一二三四五六七八九'
# 注疏前缀：论语注疏作 [疏]，南华真经注疏作 〔注〕/〔疏〕
NOTE_TAGS = ('[疏]', '〔注〕', '〔疏〕', '［疏］', '［注］')
# 篇名行有两种体例：
#   论语体  ●卷一 学而第一
#   孟子体  ●卷一下·梁惠王章句上（凡十六章）
CHAPTER_HEAD_RES = (
    re.compile(r'^●卷[一二三四五六七八九十]+[\s\u3000]+(.+?第[一二三四五六七八九十]+)\s*$'),
    re.compile(r'^●卷[一二三四五六七八九十]*[上下][·・]\s*(.+?章句[上下])'),
    re.compile(r'^(?:内篇|外篇|杂篇)(.+?第[一二三四五六七八九十]+)(?:（续）)?$'),
)
# 单独的卷次行（南华真经注疏作「卷一」），不是内容
JUAN_ONLY_RE = re.compile(r'^卷[一二三四五六七八九十百]+$')
# 孟子体的篇序排在篇名行之前，篇名只能从疏文首句取：
#   [疏]“梁惠王章句上”。○正义曰：自此至《尽心》，是《孟子》七篇之目及次第也。
PREFACE_CHAPTER_RE = re.compile(r'^\[疏\]“(.+?章句[上下])”')
TOP_CHAPTER_RE = re.compile(r'^(\S.*?第[一二三四五六七八九十]+)$')
LAOZI_CH_RE = re.compile(r'^[\s\u3000]*([0-9０-９]+|[一二三四五六七八九十]+)章(?:【[^】]*】)?[\s\u3000]*$')
CN_DIGITS = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}


def ch_no(tok):
    """章号归一：阿拉伯数字直接取，中文数字按 1-99 解析。道德真经注作「一章」。"""
    t = tok.translate(FULL2HALF)
    if t.isdigit():
        return int(t)
    if '十' in t:
        a, _, b = t.partition('十')
        return (CN_DIGITS.get(a, 1) if a else 1) * 10 + (CN_DIGITS.get(b, 0) if b else 0)
    return CN_DIGITS.get(t)
FULL2HALF = str.maketrans('０１２３４５６７８９', '0123456789')


# 源文件里的技术噪声：不是版本差异，是数据转换留下的残渣。
# 与「异文」必须分开处理——异文是知识，要保留；噪声是缺陷，要清掉但留记录。
#   nanhua-zhushu 有 14 处 HTML 实体残留（&#39; 被截成裸 #39），落在经文中间，
#   会把「莫则传言者殃」切成「莫#39则传言者殃」，导致对齐与抽检双向失败。
_SOURCE_NOISE_RE = re.compile(r'&#\d+;|#39')
NOISE_LEDGER = {}


def read_lines(key):
    path = os.path.join(RAW, 'text', key + '.txt')
    if not os.path.exists(path):
        raise SystemExit('缺少 %s，先跑 fetch_commentary.py' % path)
    with open(path, encoding='utf-8') as f:
        raw = f.read()
    n = len(_SOURCE_NOISE_RE.findall(raw))
    if n:
        NOISE_LEDGER[key] = n
        raw = _SOURCE_NOISE_RE.sub('', raw)
    return raw.split('\n')


def split_paren_notes(s):
    """抽出（）内的注文，返回 (经文, [注文])。注文顺序保留。"""
    notes = []

    def repl(m):
        notes.append(m.group(1).strip())
        return ''

    canon = re.sub(r'（([^（）]*)）', repl, s)
    return re.sub(r'\s+', '', canon), [n for n in notes if n]


def canon_sentences(text, granularity='sentence'):
    """切分原典。
    sentence  按句（。！？）——用于输出 canon_text
    clause    按逗号级（，、；：。！？）——用于对齐锚点。
              集注把注文插在经文句子中间，整句做锚必然对不上，必须细到小句。
    """
    t = re.sub(r'\s+', '', text)
    if granularity == 'clause':
        parts = re.split(r'(?<=[，、；：。！？])', t)
    else:
        parts = re.split(r'(?<=[。！？])', t)
    return [p for p in parts if p]



QUOTE_CHARS = '“”「」『』"\'‘’'

# 锚点只认字，不认标点。
# 原典是整理过的标点本（「莫显乎微。」），注本多是无标点或标点习惯不同的本子
# （「莫显乎微故君子慎其独也」）。标点一参与匹配，整句锚必然找不到——
# 实测《中庸章句》795 个小句里 531 个失败，绝大多数就是句号／逗号对不上，
# 不是异文，也不是分章差异。去掉标点后同一句就能对上。
_HAN_RE = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff0-9]')


def _anchor_char(ch):
    """这个字能不能进锚点串。不能进返回 None。"""
    if ch in QUOTE_CHARS:
        return None
    if not _HAN_RE.match(ch):
        return None
    return TR.get(ord(ch), ch)


def bare_with_map(s):
    """只留汉字做锚点串，并返回 bare 索引 → 原始索引的映射。

    必须做三件事，缺一件就大面积对不上：
      1. 去引号：集注与通行本引号用法不同（原典「有子曰」，集注可能作「”有子曰」），
         引号一参与匹配就会错位到几百字之外。锚点只认字词，不认引号。
      2. 去标点：见 _HAN_RE 上的说明，这是《中庸》《大学》失败率高的主因。
      3. 繁简归一：注本多为繁体（弒／鴈／餍／說／則），原典是简体。
         不做归一时孟子集注梁惠王章句下 624 个小句里有 331 个找不到。

    归一是 1 字符 → 1 字符（不增不减），所以 imap 的
    「锚点串位置 → 原文位置」映射仍然精确，切出来的注文边界不会歪。
    """
    out, idx = [], []
    for i, ch in enumerate(s):
        a = _anchor_char(ch)
        if a is None:
            continue
        out.append(a)
        idx.append(i)
    idx.append(len(s))
    return ''.join(out), idx


def strip_quotes(s):
    """只留汉字做锚点串。与 bare_with_map 用同一套规则，两边必须一致。"""
    return ''.join(a for a in (_anchor_char(c) for c in s) if a is not None)


# ---------------------------------------------------------------- marked 型
def parse_marked(key, meta, line_nos=None):
    """经文行 + [疏] 行。适用于论语注疏、孟子注疏、南华真经注疏。"""
    lines = read_lines(key)
    entries, issues, prefaces = [], [], []
    chapter, chapter_seen = None, 0
    cur = None

    for i, raw in enumerate(lines, 1):
        s = raw.strip()
        if not s:
            continue
        if JUAN_ONLY_RE.match(s):
            continue
        m = next((r.match(s) for r in CHAPTER_HEAD_RES if r.match(s)), None)
        if m:
            if m.group(1) != chapter:
                chapter = m.group(1)
                chapter_seen += 1
            cur = None
            continue
        # 注疏前缀不止一种：论语注疏作 [疏]，南华真经注疏作 〔注〕/〔疏〕
        tag = next((t for t in NOTE_TAGS if s.startswith(t)), None)
        if tag:
            body = s[len(tag):]
            if cur is None:
                # 孟子体篇名行在篇序之后，先由篇序确定当前篇，否则后面的经文行全被跳过。
                pm = PREFACE_CHAPTER_RE.match(s)
                if pm and chapter != pm.group(1):
                    chapter = pm.group(1)
                    chapter_seen += 1
                # 篇名之后、首条经文之前的疏文是篇序（总序或该篇小序），
                # 有独立价值，不能当脏数据丢掉。
                if chapter is not None:
                    prefaces.append({'chapter': chapter, 'loc': i, 'text': s})
                else:
                    issues.append('L%d 卷前总序（无篇名），已归入全书序' % i)
                    prefaces.append({'chapter': None, 'loc': i, 'text': s})
                continue
            field = 'note_text' if tag == '〔注〕' else 'shu_text'
            cur[field] = (cur[field] + '\n' + body).strip()
            cur['loc_end'] = i
            continue
        # 经文行
        if chapter is None:
            continue          # 序、目录等前置内容
        canon, notes = split_paren_notes(s)
        if not canon:
            continue
        cur = {
            'chapter': chapter,
            'canon_text': canon,
            'note_text': '\n'.join(notes),
            'shu_text': '',
            'loc_start': i,
            'loc_end': i,
        }
        entries.append(cur)

    entries = dedupe_segments(entries, issues)

    for n, e in enumerate(entries, 1):
        e['seq'] = n
    return entries, issues, {'chapters': chapter_seen, 'prefaces': prefaces}


# ------------------------------------------------------------ mixed 型（锚法）
def _chapter_head(raw):
    """判定这一行是不是篇名行，是则返回篇名，否则 None。

    三类注本的篇名写法完全不同，只认一种会白丢整本：
        论语集注       学而第一                      「篇名+第N」
        孟子集注       卷一 梁惠王章句上              「卷次+卷名+章句上下」
        四书合刻       卷一　　学而第一               「卷次+篇名+第N」
    缩进行一律当正文，避免把注文里的「…第N」误判成篇名。
    """
    if raw.startswith((' ', '\u3000', '\t')):
        return None
    s = raw.strip()
    # 一行里出现两个以上「卷N」的是目录行（「卷十三　尽心章句上卷十四　尽心章句下」），
    # 不是篇名。不排掉会拼出一个谁也对不上的假篇名，然后整卷报「无对应原典句子」。
    if len(re.findall(r'卷[一二三四五六七八九十百]+', s)) > 1:
        return None
    m = TOP_CHAPTER_RE.match(s)
    if m and len(re.findall(r'第[一二三四五六七八九十]+', s)) > 1:
        m = None        # 「卷九　阳货第十七微子第十八…」这类是目录行，不是篇名
    if m:
        return m.group(1)
    m = JUAN_CHAPTER_RE.match(s)
    if m:
        return m.group(1)
    return None


def _align_block(chapter, lstart, lend, body, sents, single_book=None):
    """在一个文本块内，用原典句子做锚切出「经文 + 其后注文」的条目。

    返回 (entries, missed, total)。missed/total 是统计用，不改变返回的条目。

    为什么用「小句」而不是「整句」做锚：集注把注文插在经文句子中间
    （「莫显乎微，故君子慎其独也」这种夹注），整句做锚必然对不上。
    用小句定位后，再把命中位置合并回整句边界，一个原典整句对应一条条目。
    """
    entries = []
    flat = re.sub(r'\s+', '', body)
    bare, imap = bare_with_map(flat)
    WINDOW = 3000          # 一章之内找不到就认为不是同一处，防止跨章误配

    # 短锚必须限制在局部窗口内搜索。
    # 「王曰」「寡人有疾」这类 4-5 字小句在一卷里出现好几次，全库 find
    # 会命中几百字之外的另一次出现，把 cursor 推到错误位置，
    # 后面所有长锚跟着连锁失败——实测孟子集注梁惠王章句下 624 个小句丢 325 个，
    # 根因就是这种误命中，不是异文。
    SHORT_ANCHOR = 6
    LOCAL = 400

    cursor, missed, total = 0, 0, 0
    sent_hits = []
    for sent in sents:
        clauses = [c for c in re.split(r'(?<=[，、；：。！？])', sent) if c.strip()]
        spans = []
        for c in clauses:
            total += 1
            key_c = strip_quotes(c)
            if not key_c:
                continue
            if len(key_c) < SHORT_ANCHOR:
                pos = bare.find(key_c, cursor, cursor + LOCAL)
            else:
                pos = bare.find(key_c, cursor)
            if pos < 0 or pos - cursor > WINDOW:
                missed += 1
                continue
            spans.append((imap[pos], imap[pos + len(key_c)]))
            cursor = pos + len(key_c)
        if spans:
            sent_hits.append((min(x[0] for x in spans), max(x[1] for x in spans), sent))

    if not sent_hits:
        entries.append({
            'chapter': chapter, 'canon_text': '', 'note_text': flat,
            'shu_text': '', 'loc_start': lstart, 'loc_end': lend,
            'align': {'status': 'no_hit'},
        })
        return entries, missed, total

    # 注文跟在被注的句子后面：取「本句结束 → 下一句开始」。
    # 篇首（第一句之前）的文字是整篇总注，挂到第一条上，不单独丢。
    lead = flat[:sent_hits[0][0]].strip()
    # 单篇注本（大学/中庸）的篇首是朱熹自序，几百字，属于序不是注。
    # 混进第一章注文会让下游把序文当注文引用，必须单独成条。
    if single_book and len(lead) > 120:
        entries.append({
            'chapter': single_book + '序',
            'canon_text': '', 'note_text': lead, 'shu_text': '',
            'loc_start': lstart, 'loc_end': lstart,
            'align': {'status': 'self_contained', 'section': 'preface'},
        })
        lead = ''
    for i, (a, b, sent) in enumerate(sent_hits):
        nxt = sent_hits[i + 1][0] if i + 1 < len(sent_hits) else len(flat)
        note = flat[b:nxt].strip()
        if i == 0 and lead:
            note = (lead + '\n' + note).strip()
        entries.append({
            'chapter': chapter,
            'canon_text': sent,
            'note_text': note,
            'shu_text': '',
            'loc_start': lstart,
            'loc_end': lend,
            'align': {'status': 'ok', 'canon_span': [a, b]},
        })
    return entries, missed, total


# 《大学》朱子本经传分章的章末标记。标记出现在章末（「上传之首章。释明明德。」），
# 所以块的范围是 [上一标记结束, 本标记结束]。
_DAXUE_MARK_RE = re.compile(r'上经一章|上传之首章|上传之[一二三四五六七八九十]+章')


def parse_mixed_by_plan(key, meta, canon_rec, single_book=None):
    """按朱子本经传分章逐章对齐，而不是整本线性扫描。

    为什么大学不能用 parse_mixed 的线性扫描：朱子本把古本第 4 段
    （《诗》云「瞻彼淇澳」）移到第 7 段之后，第 3 段移到传之六章。
    线性扫描的 cursor 只进不退，读到古本第 3 段时注本里它在很后面，
    读第 4 段时它在很前面，两边互相顶死——实测 355 个小句丢 265 个。
    按 mapping 逐章切块、每块 cursor 归零，才是这两套结构之间正确的对齐方式。

    结构差异不抹平：reordered / partial / jizhu_supplement 都原样带进条目，
    朱子补传标记为 jizhu_supplement，canon_text 留空。
    """
    lines = read_lines(key)
    body = '\n'.join(s.strip() for s in lines if s.strip())
    flat = re.sub(r'\s+', '', body)

    mapping = (canon_rec.get('_structure') or {}).get('mapping') or []
    if not mapping:
        raise RuntimeError('大学原典缺 _structure.mapping，无法按经传分章对齐')

    paras = canon_rec.get('chapters') or []
    entries, issues = [], []
    total_missed = total_clauses = 0

    marks = [(m.start(), m.end()) for m in _DAXUE_MARK_RE.finditer(flat)]
    if len(marks) != len(mapping):
        issues.append('注本章末标记 %d 个，与经传分章映射 %d 章不一致——'
                      '按标记位置逐章对齐可能错位，需人工核对'
                      % (len(marks), len(mapping)))

    prev = 0
    for idx, item in enumerate(mapping):
        name = item['jizhu_chapter']
        name_full = item.get('jizhu_chapter_name') or name
        if idx < len(marks):
            seg = flat[prev:marks[idx][1]]
            prev = marks[idx][1]
        else:
            seg = flat[prev:]
            prev = len(flat)

        # 朱子补传：古本无此章，只能作为注疏层内容，且必须显式标记为朱子补入
        if item.get('structure_type') == 'jizhu_supplement':
            # 朱子补传 134 字是朱子自撰，古本没有，不在原典层。
            # 但 daxue-zhangju-jizhu 这份底本里只有「此谓知之至也」的结语
            # 和程子「衍文也」的按语，补传正文本身缺失。
            # 不补写——那是编造朱熹的文字。如实记录缺口，正文留空。
            if len(re.sub(r'\s+', '', seg)) < 134:
                issues.append('朱子补传（传之五章）正文在本底本中缺失，'
                              '仅有结语与程子按语 %d 字（应为 134 字）；'
                              'canon_text 留空，不代拟朱子文字，需另找含补传全文的底本'
                              % len(re.sub(r'\s+', '', seg)))
            entries.append({
                'chapter': name,
                'canon_text': '',
                'supplement_text_present': False,
                'note_text': seg,
                'shu_text': '',
                'loc_start': 1, 'loc_end': len(lines),
                'align': {
                    'status': 'jizhu_supplement',
                    'in_canon': False,
                    'author': '朱熹',
                    'nature': 'jizhu_supplement',
                    'structure_note': {
                        'structure_type': item.get('structure_type'),
                        'scope': {'jizhu_chapter': name, 'guben_paragraphs': []},
                        'note': item.get('note') or '',
                    },
                },
            })
            continue

        gub = item.get('guben_paragraphs') or []
        sents = []
        for p in gub:
            if 1 <= p <= len(paras):
                sents.extend(canon_sentences(paras[p - 1]['text'], 'sentence'))
        if not sents:
            issues.append('%s 无对应古本段落，未对齐' % name)
            entries.append({
                'chapter': name, 'canon_text': '', 'note_text': seg,
                'shu_text': '', 'loc_start': 1, 'loc_end': len(lines),
                'align': {'status': 'no_canon'},
            })
            continue

        ents, missed, total = _align_block(name, 1, len(lines), seg, sents,
                                           single_book=single_book)
        total_missed += missed
        total_clauses += total
        # 结构差异带进每条：下游要能看出这一章是重叠、重排还是部分取用
        sn = {
            'structure_type': item.get('structure_type'),
            'scope': {'jizhu_chapter': name, 'guben_paragraphs': gub},
            'note': item.get('note') or '',
        }
        for e in ents:
            al = e.get('align') or {}
            if al.get('status') == 'ok':
                al['structure_note'] = sn
            e['align'] = al
        entries.extend(ents)

    if total_missed:
        issues.append('大学 有 %d/%d 小句未能在注本中定位（异文或结构差异），'
                      '未命中的句子没有产出条目' % (total_missed, total_clauses))

    for n, e in enumerate(entries, 1):
        e['seq'] = n
    return entries, issues, {'chapters': len(mapping)}


def parse_mixed(key, meta, canon_by_chapter, single_book=None):
    """
    经文与注文同行混排。以原典句子为锚：句子命中处为经文，锚与锚之间为注文。

    canon_by_chapter: {篇名前缀: [句子, ...]}，按篇内顺序给出该篇全部原典句子。
    对齐按篇内句子顺序进行，不按章号——朱熹本与杨伯峻本章界不同，按章号会错位。

    single_book: 大学、中庸这类整本一篇的注本。它们没有可用的篇名行
    （《中庸章句》的「中庸章句」甚至带四空格缩进，与注文无法区分），
    强行按篇名切只会得到零条。此时整本作为一个 block，篇名由调用方给定。
    """
    lines = read_lines(key)
    entries, issues = [], []
    chapter, cur_block, cur_start = None, [], None
    blocks = []

    if single_book:
        body = [s.strip() for s in lines if s.strip()]
        blocks.append((single_book, 1, len(lines), '\n'.join(body)))
    else:
        for i, raw in enumerate(lines, 1):
            s = raw.strip()
            if not s:
                continue
            head = _chapter_head(raw)
            if head:
                if chapter and cur_block:
                    blocks.append((chapter, cur_start, i - 1, '\n'.join(cur_block)))
                chapter, cur_block, cur_start = head, [], i + 1
                continue
            if chapter is None:
                continue
            if cur_start is None:
                cur_start = i
            cur_block.append(s)
        if chapter and cur_block:
            blocks.append((chapter, cur_start, len(lines), '\n'.join(cur_block)))

    for chapter, lstart, lend, body in blocks:
        stem = _canon_stem(chapter)
        sents = canon_by_chapter.get(stem, [])          # 整句，用于输出
        if not sents:
            issues.append('%s 无对应原典句子，未对齐' % chapter)
            entries.append({
                'chapter': chapter, 'canon_text': '', 'note_text': body,
                'shu_text': '', 'loc_start': lstart, 'loc_end': lend,
                'align': {'status': 'no_canon'},
            })
            continue
        ents, missed, total = _align_block(chapter, lstart, lend, body, sents,
                                           single_book=single_book)
        entries.extend(ents)
        if missed:
            issues.append('%s 有 %d/%d 小句未能在注本中定位（异文或分章差异），'
                          '未命中的句子没有产出条目'
                          % (chapter, missed, total))

    for n, e in enumerate(entries, 1):
        e['seq'] = n
    return entries, issues, {'chapters': len(blocks)}


# ------------------------------------------------------ commentary_only 型
def parse_commentary_only(key, meta):
    """仅存注文。章标记之间为注文，经文留空待补。"""
    lines = read_lines(key)
    entries, issues = [], []
    cur_no, cur_lines, cur_start = None, [], None

    for i, raw in enumerate(lines, 1):
        m = LAOZI_CH_RE.match(raw)
        if m:
            if cur_no is not None:
                entries.append({
                    'chapter': '%d章' % cur_no, 'chapter_no': cur_no,
                    'canon_text': '', 'note_text': '\n'.join(cur_lines).strip(),
                    'shu_text': '', 'loc_start': cur_start, 'loc_end': i - 1,
                })
            cur_no = ch_no(m.group(1))
            cur_lines, cur_start = [], i + 1
            continue
        if cur_no is None:
            continue
        if raw.strip():
            cur_lines.append(raw.strip())
    if cur_no is not None:
        entries.append({
            'chapter': '%d章' % cur_no, 'chapter_no': cur_no,
            'canon_text': '', 'note_text': '\n'.join(cur_lines).strip(),
            'shu_text': '', 'loc_start': cur_start, 'loc_end': len(lines),
        })

    got = {e['chapter_no'] for e in entries}
    missing = [i for i in range(1, 82) if i not in got] if entries else []
    if missing:
        issues.append('缺章 %s（共 %d 章，应为 81 章）——脱漏已记录，未补齐'
                      % (missing, len(entries)))
    empty = [e['chapter_no'] for e in entries if not e['note_text']]
    if empty:
        issues.append('注文为空章 %s' % empty)

    for n, e in enumerate(entries, 1):
        e['seq'] = n
    return entries, issues, {'chapters': len(entries), 'missing': missing}


# ------------------------------------------------------------------ 主流程
_JUAN_PREFIX_RE = re.compile(r'^卷[一二三四五六七八九十百]+[\s\u3000]*')


def _canon_stem(ch):
    """把注本与原典两侧的篇名归一成可对齐的 stem。

    不归一就会出现「注本叫梁惠王章句上、原典叫梁惠王上」这种对不上的假失败，
    从而被误判成 no_canon，白丢几千条对齐。
    必须同时处理：
        梁惠王章句上      → 梁惠王上     朱子集注卷名带「章句」
        大学章句集注      → 大学         单篇注本整本一个 chapter
        卷一　　学而第一  → 学而         四书合刻带卷次前缀
        逍遥游第一        → 逍遥游
        1章               → 1章          老子按章挂靠，不动
    """
    s = str(ch or '').strip()
    s = _JUAN_PREFIX_RE.sub('', s)
    s = re.sub(r'章句集注$', '', s)
    s = re.sub(r'章句([上下])$', r'\1', s)
    s = re.sub(r'章句$', '', s)
    s = re.sub(r'第[一二三四五六七八九十百]+$', '', s)
    return s


def load_canon_rec(classic):
    """读 parsed/canon/<classic>.json 的完整内容。

    load_canon_sentences 只取句子，但《大学》要按 _structure.mapping
    逐章对齐，必须拿到完整的结构记录，所以另开一个入口。
    """
    path = os.path.join(BASE, 'parsed', 'canon', classic + '.json')
    if not os.path.exists(path):
        return None
    return json.load(open(path, encoding='utf-8'))


def load_canon_sentences(classic):
    """读 parsed/canon/<classic>.json，按篇聚合同一系统下的全部原典句子。"""
    path = os.path.join(BASE, 'parsed', 'canon', classic + '.json')
    if not os.path.exists(path):
        return {}
    data = json.load(open(path, encoding='utf-8'))
    if isinstance(data, list):
        units = data
    else:
        units = data.get('chapters') or data.get('units') or []
    by_chapter = {}
    for u in units:
        ch = u.get('book') or u.get('chapter') or ''
        stem = _canon_stem(ch)
        by_chapter.setdefault(stem, []).extend(
            canon_sentences(u.get('text') or u.get('content') or ''))
    return by_chapter


# ---------------------------------------------------------------- 无原典注本（sectioned 型）
#
# 老子、孟子、大学、中庸、庄子目前没有进 parsed/canon，无法做句子级对齐。
# 这里不做「猜测哪句是经文哪句是注文」的自动切分——猜错就等于伪造证据。
# 只按注本自身的章/篇标记切块，块内按长度合并，canon_text 留空，
# align.status 明确标 no_canon：可检索，但不能直接当产品里的注释依据。

LAOZI_CH_ALT_RE = re.compile(r'^[一二三四五六七八九十百]+章')
JUAN_CHAPTER_RE = re.compile(r'^卷[一二三四五六七八九十]+[\s\u3000]+(.+?章句[上下])$')
ZHUANGZI_PIAN_RE = re.compile(r'^《庄子[．.](?:内篇|外篇|杂篇)[．.](.+?)》$')
NANHUA_JUAN_RE = re.compile(r'^卷[一二三四五六七八九十百]+$')
NANHUA_PIAN_RE = re.compile(r'^(?:内篇|外篇|杂篇)(.+?第[一二三四五六七八九十]+)(?:（续）)?$')
HEAD_MATTER_RE = re.compile(
    r'^(?:\[疏\]|经名：|道德真经注|南华真经|钦定四库|老子道德经|提要|【臣】|总纂官|'
    r'总[\s\u3000]*校|目录|山阳王弼注|魏[\s\u3000]*王弼|向秀、郭象|'
    r'《大学》|《中庸》|大学章句|中庸章句|卷[一二三四五六七八九十百]+$)')


def parse_alternating(key, meta):
    """经文行与注文行交替出现（道德真经注、老子道德经晋王弼本）。

    这两本没有独立标记区分经与注，只能靠「同一章内严格交替」的排版规律切分。
    这是排版假设，不是校对结论，align.status 标 assumed，提示下游不可当已核实证据用。
    末行落单时按经文处理并在 issues 里点名。
    """
    lines = read_lines(key)
    entries, issues, prefaces = [], [], []
    cur_no, cur_lines, cur_start = None, [], None
    odd = []

    def flush():
        nonlocal cur_lines
        if cur_no is None or not cur_lines:
            cur_lines = []
            return
        canon, notes = [], []
        for idx, ln in enumerate(cur_lines):
            (canon if idx % 2 == 0 else notes).append(ln)
        if len(cur_lines) % 2 == 1:
            odd.append(cur_no)
        for idx, c in enumerate(canon):
            note = notes[idx] if idx < len(notes) else ''
            entries.append({
                'chapter': '%d章' % cur_no, 'chapter_no': cur_no,
                'canon_text': c, 'note_text': note, 'shu_text': '',
                'loc_start': cur_start, 'loc_end': cur_start + len(cur_lines) - 1,
                'align': {'status': 'assumed', 'method': 'strict_alternating',
                          'note': '按同章内经文/注文交替的排版规律切分，未经校勘验证'},
            })
        cur_lines = []

    for i, raw in enumerate(lines, 1):
        s = raw.strip()
        if not s:
            continue
        m = LAOZI_CH_RE.match(s)
        if m:
            flush()
            cur_no = ch_no(m.group(1))
            cur_start = i + 1
            continue
        if cur_no is None:
            prefaces.append({'chapter': None, 'loc': i, 'text': s})
            continue
        cur_lines.append(s)
    flush()

    if odd:
        issues.append('章内行数为奇数，末行按经文处理：%s 章' % odd[:10])
    got = {e['chapter_no'] for e in entries}
    miss = [i for i in range(1, 82) if i not in got]
    if miss:
        issues.append('缺章 %s（本注本共 %d 章，应为 81 章）——脱漏已记录，未补齐'
                      % (miss, len(got)))
    issues.append('经注切分依据是排版交替规律（assumed），未经校勘，不可直接当已核实证据')
    for n, e in enumerate(entries, 1):
        e['seq'] = n
    return entries, issues, {'chapters': len(got), 'prefaces': prefaces}


def dedupe_segments(entries, issues):
    """同一篇名在多处出现时（目录列表 + 正文，或源文件整篇重复），只保留最全的一段。

    先按「连续同名」切段，再按段总字数取最大。目录那种一段一行的情况自然被淘汰。
    """
    segs, cur_seg = [], []
    for e in entries:
        if cur_seg and e['chapter'] != cur_seg[-1]['chapter']:
            segs.append(cur_seg)
            cur_seg = []
        cur_seg.append(e)
    if cur_seg:
        segs.append(cur_seg)

    best, dropped = {}, []
    for seg in segs:
        ch = seg[0]['chapter']
        size = sum(len(x['note_text']) + len(x['shu_text']) for x in seg)
        if ch not in best or size > best[ch][0]:
            if ch in best:
                dropped.append((ch, best[ch][1][0]['loc_start'], best[ch][1][-1]['loc_end']))
            best[ch] = (size, seg)
        else:
            dropped.append((ch, seg[0]['loc_start'], seg[-1]['loc_end']))
    if dropped:
        issues.append('同一篇名重复出现 %d 处（目录/正文重复或源文件整篇重复），'
                      '已保留最全的一份：%s'
                      % (len(dropped), '；'.join('%s@L%d-L%d' % d for d in dropped[:6])))
    return [e for _size, seg in sorted(best.values(), key=lambda x: x[1][0]['loc_start'])
            for e in seg]


def parse_sectioned(key, meta, max_chars=600):
    """按注本自身的章/篇标记切块，块内按长度合并成检索条目。

    不推断经文与注文的边界，因此 canon_text 一律为空，align.status = no_canon。
    """
    lines = read_lines(key)
    entries, issues, prefaces = [], [], []
    chapter = None
    chapter_seen = 0
    buf, buf_start = [], None

    def flush(end_loc):
        nonlocal buf, buf_start
        if buf and buf_start is not None:
            entries.append({
                'chapter': chapter,
                'canon_text': '',
                'note_text': '\n'.join(buf),
                'shu_text': '',
                'loc_start': buf_start,
                'loc_end': end_loc,
            })
        buf, buf_start = [], None

    for i, raw in enumerate(lines, 1):
        s = raw.strip()
        if not s:
            continue
        # 篇章标记
        m = (LAOZI_CH_ALT_RE.match(s) or ZHUANGZI_PIAN_RE.match(s)
             or NANHUA_PIAN_RE.match(s) or JUAN_CHAPTER_RE.match(s))
        if m:
            flush(i - 1)
            name = m.group(1) if m.groups() else s
            name = re.sub(r'（续）$', '', name)
            if name != chapter:
                chapter = name
                chapter_seen += 1
            continue
        if NANHUA_JUAN_RE.match(s):
            flush(i - 1)
            continue
        # 书名、卷次、题解、目录等前置内容
        if chapter is None:
            if HEAD_MATTER_RE.match(s):
                prefaces.append({'chapter': None, 'loc': i, 'text': s})
                continue
            # 没有篇名标记的书（大学、中庸）整篇当一章处理
            chapter = meta['book']
            chapter_seen = max(chapter_seen, 1)
        # 段内合并
        if buf_start is None:
            buf_start = i
        buf.append(s)
        if sum(len(x) for x in buf) >= max_chars:
            flush(i)

    flush(len(lines))

    entries = dedupe_segments(entries, issues)

    if chapter_seen == 0:
        issues.append('未识别到章/篇标记，整篇按 %d 字一块切分' % max_chars)
    elif CANON_CLASSIC.get(key):
        # 原典已经有了，但这一型注本经文与注文没有可靠标记，无法逐句分离经注。
        # 只做到章级挂靠：章次能对上原典，文字没有比对过，不能说成已对齐。
        issues.append('原典已入库，但本注本经文与注文无可靠标记，无法逐句分离经注；'
                      '只做章级挂靠（align.status=chapter_level），未做文字比对，'
                      '不可直接作为产品注释依据')
    else:
        issues.append('无原典可对齐（parsed/canon 缺该经典），条目仅按注本自身章篇切块，'
                      'align.status=no_canon，不可直接作为产品注释依据')

    for n, e in enumerate(entries, 1):
        e['seq'] = n
        if not e['chapter']:
            e['chapter'] = '（未分章）'
    return entries, issues, {'chapters': chapter_seen, 'prefaces': prefaces}


# 注本 → parsed/canon 里可用于句子对齐的原典。
# 2026-11-02 补齐五部原典后，12 个注本全部有原典可挂靠，None 已清零。
# 注意：有 canon 不等于文字必然一致——老子注本是王弼系统，原典是河上公系统，
# 章次对应而文字不同，必须走 ok_variant 而不是 ok。
# 一部注本内含多部原典：四书合刻。
# 整本只挂一部原典，孟子 14 章会全部报「无对应原典句子」——
# 不是原典缺失，是这一本本来就跨四部。合并四部句子池、按章名索引即可，
# 章名（学而第一 / 梁惠王章句上）在四部之间不重名。
MULTI_CANON = {
    'sishu-zhangju-jizhu': ['lunyu', 'mengzi', 'daxue', 'zhongyong'],
}

CANON_CLASSIC = {
    'lunyu-zhushu': 'lunyu',
    'lunyu-jizhu': 'lunyu',
    'sishu-zhangju-jizhu': 'lunyu',
    'mengzi-zhushu': 'mengzi',
    'mengzi-jizhu': 'mengzi',
    'daxue-zhangju-jizhu': 'daxue',
    'zhongyong-zhangju-jizhu': 'zhongyong',
    'laozi-wangbi': 'laozi',
    'laozi-wangbi-daozang': 'laozi',
    'laozi-wangbi-jin': 'laozi',
    'zhuangzi-guoxiang': 'zhuangzi',
    'nanhua-zhushu': 'zhuangzi',
}

# 整本一篇的注本：没有可用篇名行，篇名由这里给定。
# 《中庸章句》的篇名「中庸章句」带四空格缩进，与注文无法区分，
# 按篇名切会得到零条，所以显式指定。
# 需要按经传分章（而非整本线性扫描）对齐的注本。
# 判据：朱子本把古本段落重排过，线性扫描的单调 cursor 会被顶死。
PLAN_ALIGN = {
    'daxue-zhangju-jizhu': True,
}

SINGLE_BOOK = {
    'daxue-zhangju-jizhu': '大学',
    'zhongyong-zhangju-jizhu': '中庸',
}

# 原典与注本分属不同传本系统的注本，不能标 ok。
# 老子原典是河上公系统道藏本，三个王弼注本都是王弼系统：
#   章次能对上，文字对不上。对齐只做到章级挂靠或异文对照，
#   绝不允许把河上公本的文字冒充王弼本原文。
VARIANT_NOTES = {
    'laozi-wangbi': {
        'scope': '结构性',
        'note': ('本注本仅有注文，无经文可校，与原典按章次挂靠。'
                 '原典为河上公系统道藏本，注本为魏王弼注，二者分属不同传本系统，'
                 '章次对应不代表文字一致。'),
    },
    'laozi-wangbi-daozang': {
        'scope': '字词',
        'note': ('本注本属王弼系统道藏本，原典属河上公系统道藏本。'
                 '两本同章次，但用字、虚词、语序有差异，允许异文对照，不强行匹配。'
                 '已知差异清单不是全书异文总数，须人工抽检。'),
    },
    'laozi-wangbi-jin': {
        'scope': '字词',
        'note': ('本注本属王弼系统（晋王弼本一系），原典属河上公系统道藏本。'
                 '两本同章次，但用字、虚词、语序有差异，允许异文对照，不强行匹配。'
                 '已知差异清单不是全书异文总数，须人工抽检。'),
    },
}


def main():
    os.makedirs(INDEX_DIR, exist_ok=True)
    src = json.load(open(os.path.join(RAW, 'SOURCES.json'), encoding='utf-8'))
    meta_by_key = {f['key']: f for f in src['files']}

    # 老子原典层的展示标记（第 13/76 章等释义级差异）。
    # 这些是原典层已经确认过的高优先级差异，注疏层不能把它们藏起来——
    # 用户读的是注疏条目，展示标记留在原典层等于没展示。
    LAOZI_DISPLAY = {}
    _lc = load_canon_rec('laozi')
    if _lc:
        for _c in (_lc.get('chapters') or []):
            if _c.get('display'):
                LAOZI_DISPLAY[_c['chapter']] = _c['display']

    all_entries, report = [], []

    for key, meta in meta_by_key.items():
        fmt = meta['format']
        canon = CANON_CLASSIC.get(key)
        if fmt == 'alternating':
            ents, issues, stat = parse_alternating(key, meta)
        elif fmt == 'commentary_only':
            ents, issues, stat = parse_commentary_only(key, meta)
        elif fmt == 'marked':
            # marked 型自带经文行，即使没有 canon 也能切出经/注/疏三层
            ents, issues, stat = parse_marked(key, meta)
        elif fmt == 'sectioned':
            # sectioned 型经文与注文没有可靠标记，切块方式由 format 决定，
            # 不能因为现在有了原典就改走句子对齐——那等于假设它本来没有的边界。
            ents, issues, stat = parse_sectioned(key, meta)
        elif canon and PLAN_ALIGN.get(key):
            # 朱子本与古本结构不同的单篇注本（目前只有《大学》），
            # 必须按经传分章逐章对齐；线性扫描会被结构重排顶死。
            ents, issues, stat = parse_mixed_by_plan(
                key, meta, load_canon_rec(canon),
                single_book=SINGLE_BOOK.get(key))
        elif canon and MULTI_CANON.get(key):
            # 四书合刻：把四部原典的句子池合并，按章名索引后再对齐。
            # 不合并的话孟子 14 章全部落在论语池里，一条也对不上。
            pool = {}
            for _cl in MULTI_CANON[key]:
                for _k, _v in (load_canon_sentences(_cl) or {}).items():
                    pool.setdefault(_k, []).extend(_v)
            ents, issues, stat = parse_mixed(
                key, meta, pool, single_book=SINGLE_BOOK.get(key))
        elif canon:
            ents, issues, stat = parse_mixed(
                key, meta, load_canon_sentences(canon),
                single_book=SINGLE_BOOK.get(key))
        else:
            # mixed 型且没有原典可对齐：降级为章篇切块，不假装做了句子对齐
            ents, issues, stat = parse_sectioned(key, meta)

        for e in ents:
            # 三个文本字段统一存在，缺内容就是空串，不留 None 让下游到处判空
            e.setdefault('canon_text', '')
            e.setdefault('note_text', '')
            e.setdefault('shu_text', '')
            # align 说明这条到底对齐到了什么程度，决定它能不能直接当证据用：
            #   ok            锚点全部命中，经文与注文已按原典切分
            #   partial       部分锚点未命中（异文或分章差异），未命中的部分不可引用
            #   self_contained 经文取自注本自身，未与原典交叉校验
            #   assumed       靠排版交替规律切分，未经校勘
            #   chapter_level 章次已挂靠原典，但注本无经文可校或无法可靠分离经注，
            #                 只做到章级挂靠，未做文字比对
            #   no_canon      该经典尚未进 parsed/canon（2026-11-02 补齐五部原典后已清零）
            #   ok_variant    原典与注本分属不同传本系统，章次能对、文字不一定对，
            #                 必须带 variant_scope / variant_note，不得当同文引用
            al = e.get('align') or {}
            if not al.get('status'):
                al['status'] = 'self_contained' if fmt == 'marked' else 'chapter_level'
            al.setdefault('classic', canon)

            # 跨传本系统的注本：章次对应不代表文字一致。
            # 原来的 assumed 不能丢——它说的是「切分方式未校勘」，
            # 与「跨系统异文」是两个维度，降级成子字段保留。
            vn = VARIANT_NOTES.get(key)
            if vn:
                if al['status'] == 'assumed':
                    al['split_method'] = al.pop('method', 'strict_alternating')
                    al['split_assumed'] = True
                al['status'] = 'ok_variant'
                al['variant_scope'] = vn['scope']
                al['variant_note'] = vn['note']
                al['verified_by'] = None
                al['verified_at'] = None
                al['verify_note'] = None

            e['align'] = al
            e.update({
                'id': 'CM-%s-%04d' % (key.upper().replace('-', ''), e['seq']),
                'book': meta['book'],
                'author': meta['author'],
                'era': meta['era'],
                'series': meta['series'],
                'commentary_key': key,
                # 八项元数据之「原始文件位置」「版本信息」「获取来源」
                # source_file 统一成相对 classics 根的路径。
                # SOURCES.json 里的 local_path 带 content/classics/ 前缀，
                # 下游拿它直接拼 BASE 会拼成 content/classics/content/classics/...，
                # 一路 file_not_found。索引里的路径必须是拿来就能用的。
                'source_file': meta['local_path'].replace('\\', '/').split(
                    'content/classics/', 1)[-1],
                'source_locator': 'L%d-L%d' % (e['loc_start'], e['loc_end']),
                'version': '%s @ %s' % (meta['source_repo'], meta['source_commit'][:12]),
                'provenance': meta['source_url'],
                # 检索命中 ≠ 证据成立
                'match_status': 'hit',
                'verified_by': None,
                'verified_at': None,
                'verify_note': None,
            })
            # 老子第 13/76 章这类释义级差异，产品详情要优先展示，
            # 不能只留在原典层的技术字段里——用户实际读的是注疏条目。
            # 从原典层把 display 带过来，注疏条目直接可读，不用再去 join 原典。
            if canon == 'laozi':
                _no = ch_no(re.match(r'([0-9０-９]+|[一二三四五六七八九十]+)章',
                                     e.get('chapter') or '') and
                            re.match(r'([0-9０-９]+|[一二三四五六七八九十]+)章',
                                     e.get('chapter') or '').group(1))
                dsp = LAOZI_DISPLAY.get(_no) if _no else None
                if dsp:
                    e['display'] = dsp
        # 老子注各本按章挂靠，缺章必须显式列出，不能靠 81 章的印象糊过去
        if key.startswith('laozi') and fmt != 'commentary_only':
            nos = set()
            for e in ents:
                m = re.match(r'([0-9０-９]+|[一二三四五六七八九十]+)章', e['chapter'])
                if m and ch_no(m.group(1)):
                    nos.add(ch_no(m.group(1)))
            if nos:
                miss = [i for i in range(1, 82) if i not in nos]
                # parse_alternating 内部已经报过一次缺章，这里只补它没覆盖的情况，
                # 否则同一件事在 issues 里出现两遍，看起来像两个不同的缺陷。
                already = any('缺章' in x for x in issues)
                if miss and not already:
                    issues.append('缺章 %s（本注本共 %d 章，应为 81 章）——'
                                  '脱漏已记录，未补齐' % (miss, len(nos)))
        if stat and 'chapters' in stat:
            stat['chapters'] = len({e['chapter'] for e in ents})   # 去重后的实际篇数
        all_entries.extend(ents)
        if NOISE_LEDGER.get(key):
            issues.append('源文件有 %d 处 HTML 实体残留（&#39; 被截成裸 #39），'
                          '落在经文中间会切断句子；已在读取时清除并记录，'
                          '属于数据转换缺陷，不是版本差异' % NOISE_LEDGER[key])
        report.append({
            'key': key, 'book': meta['book'], 'author': meta['author'],
            'format': fmt, 'entries': len(ents),
            'stat': stat, 'issues': issues,
        })

    # 构建时把每个源文件的实际 SHA256 写进索引。
    # 没有这个，将来没人能证明这批对齐结果用的是哪一版底本。
    src_sha = {}
    for key, meta in meta_by_key.items():
        # local_path 有几种写法（相对仓库根的 content/classics/...、相对 classics 的
        # raw/commentary/...、只有文件名），逐个候选试，别假设一种。
        lp = meta['local_path'].replace('\\', '/')
        cands = [
            os.path.join(BASE, lp),
            os.path.join(BASE, lp.split('content/classics/', 1)[-1]),
            os.path.join(RAW, 'text', os.path.basename(lp)),
            os.path.join(BASE, 'raw', 'commentary', 'text', os.path.basename(lp)),
        ]
        for c in cands:
            if os.path.exists(c):
                h = hashlib.sha256()
                with open(c, 'rb') as fh:
                    for chunk in iter(lambda: fh.read(65536), b''):
                        h.update(chunk)
                src_sha[key] = {'path': os.path.relpath(c, BASE), 'sha256': h.hexdigest()}
                break
        else:
            src_sha[key] = {'path': meta['local_path'], 'sha256': None,
                            'error': 'file_not_found'}

    canon_sha = {}
    # 必须 sorted：set 的迭代顺序受 PYTHONHASHSEED 影响，每次跑出来的
    # canon_sha256 键序都不同，同一个底本会产出不同 SHA256 的文件，
    # 构建记录的 outputs 校验就永远对不上——「可复现」直接失效。
    for cid in sorted(set(CANON_CLASSIC.values())):
        cp = os.path.join(BASE, 'parsed', 'canon', cid + '.json')
        if os.path.exists(cp):
            h = hashlib.sha256()
            with open(cp, 'rb') as fh:
                for chunk in iter(lambda: fh.read(65536), b''):
                    h.update(chunk)
            canon_sha[cid] = h.hexdigest()

    out = {
        'meta': {
            'generated_by': 'content/classics/_build/build_commentary_index.py',
            'source_snapshot': 'content/classics/raw/commentary/SOURCES.json',
            'source_sha256': src_sha,
            'canon_sha256': canon_sha,
            'entry_count': len(all_entries),
            'principle': '检索命中（hit）不是证据成立（verified）。'
                         '自动召回只产出 hit，产品只能引用人工核实过的条目。',
            'metadata_fields': ['book', 'author', 'chapter', 'canon_text',
                                'note_text/shu_text', 'source_file+source_locator',
                                'version', 'provenance'],
        },
        'books': report,
        'entries': all_entries,
    }
    path = os.path.join(INDEX_DIR, 'commentary-index.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print('[build_commentary_index] %d 条 → %s' % (len(all_entries), path))
    for r in report:
        flag = '  ' if not r['issues'] else '! '
        st = dict(r['stat'] or {})
        for k, v in list(st.items()):
            if isinstance(v, list):
                st[k] = '%d 条' % len(v)
        print('%s%-24s %-16s %5d 条  %s'
              % (flag, r['key'], r['book'], r['entries'], st))
        pf = r['stat'].get('prefaces')
        if pf:
            print('      · 篇序/总序 %d 条已单独保留（不并入经文条目）' % len(pf))
        shown = [i for i in r['issues'] if not i.startswith('L')][:4]
        hidden = len(r['issues']) - len(shown)
        for it in shown:
            print('      · ' + it[:120])
        if hidden > 0:
            print('      · …另有 %d 条同类记录，见 index 的 books[].issues' % hidden)


if __name__ == '__main__':
    main()
