# -*- coding: utf-8 -*-
"""从 Kanripo 白文本（ZTDZ 分支）生成 raw/canon/laozi.json 与 raw/canon/zhuangzi.json。

设计约束（来自 2026-11-02 主人裁决）：
- 只用 Kanripo 白文本，不掺任何注本文字。
- 老子是河上公系统道藏本，不是王弼本；章次对应不代表文字一致。
- 庄子是 33 篇白文，与郭象注本分属不同层次；注本缺篇不是原典缺失。
- 每个输出文件都写 SHA256 与来源文件清单，便于回溯。
- 切分失败必须显式报错，不允许静默产出残缺数据。
"""
import hashlib
import io
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KP = os.path.join(BASE, 'raw', 'canon', 'kanripo')
OUT = os.path.join(BASE, 'raw', 'canon')

CN = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9}


def cn2i(t):
    """中文数字转整数，支持「一百三十五」这类。"""
    t = (t or '').strip()
    if not t:
        return 0
    if '百' in t:
        a, _, b = t.partition('百')
        return (CN.get(a, 1) if a else 1) * 100 + (cn2i(b) if b else 0)
    if '十' in t:
        a, _, b = t.partition('十')
        return (CN.get(a, 1) if a else 1) * 10 + (CN.get(b, 0) if b else 0)
    return CN.get(t, 0)


CN_DIGIT = '一二三四五六七八九'


def i2cn(n):
    """整数转中文数字，覆盖 1-99。篇名要与注本「逍遥游第一」这类写法对齐。"""
    if n < 10:
        return CN_DIGIT[n - 1]
    if n < 20:
        return '十' + (CN_DIGIT[n - 11] if n > 10 else '')
    a, b = divmod(n, 10)
    return CN_DIGIT[a - 1] + '十' + (CN_DIGIT[b - 1] if b else '')


def strip_markup(text):
    """去掉 mandoku 的行标记与影印页标记，保留正文与 ¶ 分句符。"""
    text = re.sub(r'<pb:[^>]*>', '', text)
    text = re.sub(r'<md:[^>]*>', '', text)
    text = re.sub(r'<img:[^>]*>', '', text)
    return text


def read_repo(repo, first, last):
    """按序合并某仓库 _000.._00N 文件。缺文件直接报错。"""
    buf, used = [], []
    for i in range(first, last + 1):
        p = os.path.join(KP, repo, f'{repo}_00{i}.txt')
        if not os.path.exists(p):
            raise SystemExit(f'缺少 Kanripo 文件 {p}')
        buf.append(strip_markup(io.open(p, encoding='utf-8').read()))
        used.append(os.path.relpath(p, BASE))
    return ''.join(buf), used


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- 老子

LAOZI_CH_NAME_RE = re.compile(r'[\u4e00-\u9fff]{1,6}章第([一二三四五六七八九十]+)')
LAOZI_CH_END_RE = re.compile(
    r'右第([一二三四五六七八九十]+)章([一二三四五六七八九十百]+)言')
LAOZI_TAIL_MARK_RE = re.compile(
    r'右第[一二三四五六七八九十]+章[一二三四五六七八九十百]+言')


def build_laozi():
    """切 81 章。

    双锚点：章名在章首，章末计数在章尾。
    优先级：下一章章名 > 本章章末计数。理由：章末计数标记在源文件里可能错位
    （第 28 章标记实际排在 29 章正文之后），章名锚更可靠。
    """
    raw, used = read_repo('KR5c0045', 0, 2)

    starts, ends = {}, {}
    for m in LAOZI_CH_NAME_RE.finditer(raw):
        starts.setdefault(cn2i(m.group(1)), (m.start(), m.end()))
    for m in LAOZI_CH_END_RE.finditer(raw):
        ends.setdefault(cn2i(m.group(1)), (m.start(), m.end(), m.group(2)))

    bounds = {}
    for n in range(1, 82):
        s = starts[n][1] if n in starts else (
            ends[n - 1][1] if n - 1 in ends else None)
        e = starts[n + 1][0] if n + 1 in starts else (
            ends[n][0] if n in ends else None)
        bounds[n] = [s, e]

    # 补洞：向前/向后借用相邻章的边界
    for n in range(1, 82):
        s, e = bounds[n]
        if s is None:
            for k in range(n - 1, 0, -1):
                if bounds[k][1] is not None:
                    s = bounds[k][1]
                    break
        if e is None:
            for k in range(n + 1, 82):
                if bounds[k][0] is not None:
                    e = bounds[k][0]
                    break
        if e is None and n == 81:
            e = len(raw)
        bounds[n] = [s, e]

    def clean(t):
        t = re.sub(r'#.*$', '', t, flags=re.M)
        t = re.sub(r'道德眞經卷[上下]', '', t)
        t = re.sub(r'篇[上下]終', '', t)
        t = LAOZI_TAIL_MARK_RE.sub('', t)
        return re.sub(r'[¶\s\u3000]', '', t)

    issues = []
    records = []
    for n in range(1, 82):
        s, e = bounds[n]
        if s is None or e is None:
            issues.append(f'第{n}章无法定界')
            continue
        text = clean(raw[s:e])
        if not text:
            issues.append(f'第{n}章正文为空')
            continue
        rec = {
            'id': f'laozi#{n}',
            'source': '道德真經',
            'chapter': f'{n}章',
            'content': text,
            'author': '老子',
            'era': '春秋',
        }
        # 章末字数自校验：这是古籍内部证据，比任何外部比对都硬
        if n in ends:
            declared = cn2i(ends[n][2])
            actual = len(text)
            rec['char_count_declared'] = declared
            rec['char_count_actual'] = actual
            if declared != actual:
                rec['char_count_diff'] = actual - declared
        records.append(rec)

    if len(records) != 81:
        raise SystemExit(f'老子切出 {len(records)} 章，应为 81')

    # 已知源文件结构异常：第 29 章在底本中并列了两个传本系统的正文
    dup = next((r for r in records if r['chapter'] == '29章'), None)
    if dup and dup.get('char_count_diff', 0) > 10:
        dup['variant_duplicated'] = True
        dup['variant_note'] = (
            '底本此章并列了两套正文：河上公系统「將欲取天下而爲之…是以聖人」'
            '与另一系统「將欲取天下而爲之者…去泰」，章末标记「右第二十九章六十言」'
            '只对应其中一套。两套文字均保留，不做取舍。')

    return records, issues, used


# ---------------------------------------------------------------- 庄子

ZHUANGZI_PIAN_RE = re.compile(
    r'^[\s\u3000]*(?:内|內|外|雜|杂)篇([\u4e00-\u9fff]{2,4})第([一二三四五六七八九十]+)',
    re.M)

# 繁 -> 简，只覆盖 33 篇篇名用字，与注本（nanhua-zhushu / zhuangzi-guoxiang）对齐
PIAN_SIMP = {
    '逍遥遊': '逍遥游', '齊物論': '齐物论', '養生主': '养生主', '人間世': '人间世',
    '德充符': '德充符', '大宗師': '大宗师', '應帝王': '应帝王', '駢拇': '骈拇',
    '馬蹄': '马蹄', '胠篋': '胠箧', '在宥': '在宥', '天地': '天地', '天道': '天道',
    '天運': '天运', '刻意': '刻意', '繕性': '缮性', '秋水': '秋水', '至樂': '至乐',
    '達生': '达生', '山木': '山木', '田子方': '田子方', '知北遊': '知北游',
    '庚桑楚': '庚桑楚', '徐無鬼': '徐无鬼', '則陽': '则阳', '外物': '外物',
    '寓言': '寓言', '讓王': '让王', '盜跖': '盗跖', '說剱': '说剑', '漁父': '渔父',
    '列御寇': '列御寇', '天下': '天下',
}


def build_zhuangzi():
    raw, used = read_repo('KR5c0051', 0, 4)

    marks = list(ZHUANGZI_PIAN_RE.finditer(raw))
    if len(marks) != 33:
        raise SystemExit(f'庄子篇数 {len(marks)}，应为 33')

    issues = []
    records = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(raw)
        body = raw[m.end():end]
        body = re.sub(r'南華眞經卷之[一二三四五六七八九十]+', '', body)
        body = re.sub(r'[¶\s\u3000]', '', body)
        idx = cn2i(m.group(2))
        trad = m.group(1)
        simp = PIAN_SIMP.get(trad)
        if simp is None:
            issues.append(f'篇名「{trad}」缺繁简映射')
            simp = trad
        if idx != i + 1:
            issues.append(f'篇序断裂：第{i+1}篇位置标为「{trad}第{m.group(2)}」')
        if not body:
            issues.append(f'「{trad}」正文为空')
            continue
        records.append({
            'id': f'zhuangzi#{idx}',
            'source': '南華真經',
            'chapter': f'{simp}第{i2cn(idx)}',
            'content': body,
            'author': '庄子',
            'era': '战国',
            'pian_traditional': trad,
            'pian_section': ('内篇' if idx <= 7 else '外篇' if idx <= 22 else '杂篇'),
            'char_count': len(body),
        })

    if len(records) != 33:
        raise SystemExit(f'庄子切出 {len(records)} 篇，应为 33')
    return records, issues, used


def write_canon(cid, records, issues, used, note, extra=None):
    payload = records
    p = os.path.join(OUT, f'{cid}.json')
    with io.open(p, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    meta = {
        'classic': cid,
        'file': os.path.relpath(p, BASE),
        'records': len(records),
        'bytes': os.path.getsize(p),
        'sha256': sha256_file(p),
        'source_files': used,
        'note': note,
        'issues': issues,
    }
    if extra:
        meta.update(extra)
    with io.open(os.path.join(OUT, f'{cid}.meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    print(f'[kanripo] {cid}: {len(records)} 条，{meta["bytes"]} bytes，异常 {len(issues)} 处')
    for x in issues:
        print('   ! ' + x)
    return meta


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None

    if not only or only == 'laozi':
        rec, iss, used = build_laozi()
        write_canon('laozi', rec, iss, used,
                    '切自 Kanripo KR5c0045（ZTDZ 分支）河上公系统道藏本白文，'
                    '81 章。章界由章名锚与章末计数锚双重确定，'
                    '章末声明字数与实际字数逐章比对。',
                    {'license': 'CC-BY-SA', 'repo': 'kanripo/KR5c0045',
                     'branch': 'ZTDZ',
                     'edition': '河上公系统正统道藏本（非王弼本）'})

    if not only or only == 'zhuangzi':
        rec, iss, used = build_zhuangzi()
        write_canon('zhuangzi', rec, iss, used,
                    '切自 Kanripo KR5c0051（ZTDZ 分支）白文本，33 篇。'
                    '篇界由「内篇/外篇/杂篇 + 篇名 + 第N」标记确定，'
                    '篇名已转简体以与注本篇名对齐。',
                    {'license': 'CC-BY-SA', 'repo': 'kanripo/KR5c0051',
                     'branch': 'ZTDZ',
                     'edition': '白文本（不含郭象注、陆德明音义）'})


if __name__ == '__main__':
    main()
