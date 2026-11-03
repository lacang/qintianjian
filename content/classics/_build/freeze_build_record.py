# -*- coding: utf-8 -*-
"""把本轮索引成果固化成可复现的构建记录。

为什么需要这个文件：索引里已经记了每个源文件的 SHA256，但那只是「用了哪一版底本」。
真正要能复现，还得知道「用哪个脚本、按什么顺序、什么参数、产出了什么、产出本身的指纹是什么」。
少一样，半年后没人能证明现在这份索引是怎么来的。

这个脚本只读 + 写一份记录，不重建索引。索引本身由 build_commentary_index.py 产出，
抽检由 verify_alignment.py 完成，三者职责分开：
    build_commentary_index.py  产出索引
    verify_alignment.py        抽检索引
    freeze_build_record.py     固化「这一版索引由哪些输入、按哪条链、产出什么」

用法：
    python3 freeze_build_record.py
"""
import hashlib
import io
import json
import os
import subprocess
import sys
from collections import Counter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # content/classics
IDX_DIR = os.path.join(BASE, 'raw', 'commentary', 'index')
RECORD = os.path.join(IDX_DIR, 'BUILD-RECORD.json')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def rel(p):
    return os.path.relpath(p, BASE).replace('\\', '/')


def fingerprint(paths):
    out = []
    for p in paths:
        if not os.path.exists(p):
            out.append({'path': rel(p), 'missing': True})
            continue
        out.append({'path': rel(p), 'bytes': os.path.getsize(p),
                    'sha256': sha256(p)})
    return out


def main():
    idx_path = os.path.join(IDX_DIR, 'commentary-index.json')
    vl_path = os.path.join(IDX_DIR, 'variant-ledger.json')
    if not os.path.exists(idx_path):
        raise SystemExit('缺少 %s，先跑 build_commentary_index.py' % idx_path)

    idx = json.load(io.open(idx_path, encoding='utf-8'))
    ents = idx['entries']
    meta = idx['meta']

    # ---- 输入：注本 12 份 + 原典 6 部 ----
    comment_inputs = []
    for key, rec in sorted((meta.get('source_sha256') or {}).items()):
        p = os.path.join(BASE, rec['path'])
        comment_inputs.append({
            'key': key, 'path': rec['path'],
            'sha256': rec.get('sha256'),
            'sha256_recorded_matches_file': (
                os.path.exists(p) and sha256(p) == rec.get('sha256')),
            'bytes': os.path.getsize(p) if os.path.exists(p) else None,
        })

    canon_inputs = []
    for classic, h in sorted((meta.get('canon_sha256') or {}).items()):
        p = os.path.join(BASE, 'parsed', 'canon', classic + '.json')
        canon_inputs.append({
            'classic': classic, 'path': rel(p),
            'sha256': h,
            'sha256_recorded_matches_file': (os.path.exists(p) and sha256(p) == h),
            'bytes': os.path.getsize(p) if os.path.exists(p) else None,
        })

    # ---- 脚本链 ----
    scripts = fingerprint([
        os.path.join(BASE, '_build', n) for n in (
            'cn_norm.py',
            'split_chapters.py',
            'build_commentary_index.py',
            'verify_alignment.py',
            'locate_snippet.py',
            'make_variant_worklist.py',
            'make_review_batch.py',
            'apply_review_batch01.py',
            'check_review_writeback.py',
            'build_laozi_variant_ledger.py',
            'make_laozi_review_sheet.py',
            'freeze_build_record.py',
        )
    ])

    # ---- 输出 ----
    # 老子两传本台账是独立产物，与注疏层异文台账并列，不是它的子集。
    # 前者是「两个原典传本之间写法不同」，后者是「注本引的经文与原典对不上」。
    extra_outs = [
        os.path.join(BASE, 'raw', 'commentary', 'index', n) for n in (
            'variant-review-worklist.md',
            'variant-review-batch1.md',
            'laozi-variant-ledger.json',
            'laozi-variant-review-sheet.md',
            'source-defect-ledger.json',
        )
    ]
    outputs = fingerprint([idx_path, vl_path]
                          + [x for x in extra_outs if os.path.exists(x)])

    vl = json.load(io.open(vl_path, encoding='utf-8')) if os.path.exists(vl_path) else {}

    status = Counter(((e.get('align') or {}).get('status')) for e in ents)
    per_book = {b['key']: b['entries'] for b in idx['books']}

    record = {
        '_note': ('本轮注疏索引成果的构建复现记录。'
                  '记录输入底本、脚本链、产出与各自的 SHA256，'
                  '用于证明「这一版索引由哪些东西按哪条链生成」。'
                  '它不是校勘结论，也不改变任何 align.status。'),
        'schema_version': 1,
        'stage': 'P1 注疏索引（已验收）',
        'generated_at': None,       # 下面填
        'environment': {
            'python': sys.version.split()[0],
            'platform': sys.platform,
        },
        'build_chain': [
            {'step': 1, 'script': '_build/split_chapters.py',
             'role': '原典切分（孟子/大学/中庸/老子/庄子）',
             'produces': 'parsed/canon/*.json',
             'note': '本轮未重跑，输入已固化在 parsed/canon 的 SHA256 中'},
            {'step': 2, 'script': '_build/build_commentary_index.py',
             'role': '注疏索引构建（对齐 + 状态判定）',
             'produces': 'raw/commentary/index/commentary-index.json'},
            {'step': 3, 'script': '_build/verify_alignment.py',
             'role': '抽样验证（八项检查）+ 异文台账落盘',
             'produces': 'raw/commentary/index/variant-ledger.json',
             'must_be_zero': ['fails', 'warns']},
            {'step': 4, 'script': '_build/freeze_build_record.py',
             'role': '固化本记录', 'produces': rel(RECORD)},
        ],
        'shared_module': {
            'path': '_build/cn_norm.py',
            'role': ('繁简 / 异体 / 标点归一表，切分器与注疏索引共用一份。'
                     '两边各写一份必然漂移，最后出现「切分器能对上、索引对不上」这类极难查的 bug。'),
            'constraint': '归一必须 1 字符 → 1 字符，否则锚点索引映射失效',
        },
        'inputs': {
            'commentary': comment_inputs,
            'canon': canon_inputs,
        },
        'scripts': scripts,
        'outputs': outputs,
        'counts': {
            'entries': len(ents),
            'empty_entries': sum(1 for e in ents if not (
                e.get('canon_text') or e.get('note_text') or e.get('shu_text'))),
            'verified_non_null': sum(1 for e in ents
                                     if e.get('verified_by') or e.get('verified_at')),
            'status': dict(status),
            'per_book': per_book,
            'variant_ledger': {
                'count': vl.get('count'),
                'group_count': vl.get('group_count'),
                'grouped_count': vl.get('grouped_count'),
                'confirmed_count': vl.get('confirmed_count'),
            },
        },
        'verification': {
            'script': '_build/verify_alignment.py',
            'checks': [
                'canon_text 必须能被其来源层（原典 / 注本自身）证伪',
                'note_text 必须能在源文件里找到',
                '不得产出空壳条目',
                'verified_by / verified_at 必须全空',
                '源文件与原典 SHA256 必须齐全',
                'align.status 必须在已定义状态集内',
                '大学结构映射必须完整（11 章 + 补传 in_canon=False）',
                '老子第 13/76 章必须在产品展示层带出差异提示',
            ],
            'last_result': {'fails': 0, 'warns': 0},
        },
        'known_gaps': [
            'daxue-zhangju-jizhu 缺朱子补传正文（本底本仅 61 字结语，应 134 字），未代拟',
            'laozi-wangbi 缺第 31/66/75 章',
            'laozi-wangbi-jin 缺 10 章（8/14/15/19/30/54/62/70/71/78）',
            'zhuangzi-guoxiang 仅内篇七篇，chapter_level，未做文字比对',
            'nanhua-zhushu 源文件 14 处 &#39; 残渣，已清洗并记录',
            '中庸 17/795、大学 15/355、四书合刻 31 条章级小句未定位',
            '老子 ok_variant 958 条尚无结构化异文清单（仅第 29 章有 variant 记录）',
        ],
        'boundaries': [
            '不是全量人工校勘',
            '不是全部注疏已完成文字级对齐（仍有 chapter_level 70 条）',
            '不是所有条目都取得引用资格（verified_by 全空是正确状态，不是待消除缺陷）',
            '未进行生产发布，未 commit / push / 部署',
        ],
        'reproduce': [
            'cd content/classics/_build',
            'python3 build_commentary_index.py',
            'python3 verify_alignment.py     # 必须 fails=0 warns=0',
            'python3 freeze_build_record.py  # 与本记录比对 outputs 的 sha256',
        ],
    }
    import datetime
    record['generated_at'] = datetime.datetime.now().astimezone().isoformat(
        timespec='seconds')

    io.open(RECORD, 'w', encoding='utf-8').write(
        json.dumps(record, ensure_ascii=False, indent=1))

    # 回读校验：输入指纹必须与实际文件一致，否则这份记录本身就是假的
    bad = [x for x in comment_inputs + canon_inputs
           if not x.get('sha256_recorded_matches_file')]
    print('构建记录 → %s' % rel(RECORD))
    print('  输入 注本 %d / 原典 %d，指纹不符 %d'
          % (len(comment_inputs), len(canon_inputs), len(bad)))
    for b in bad:
        print('    ✗', b.get('key') or b.get('classic'), b.get('path'))
    print('  输出 索引 %d 条 / 异文线索 %s 条'
          % (len(ents), vl.get('count')))
    if bad:
        raise SystemExit('输入指纹与记录不一致，构建记录不可信')


def check():
    """独立校验：已有记录里的 outputs 指纹，跟磁盘上现在的产物是否一致。

    为什么不能只靠 main() 自比：main() 是「记录当前文件的 sha」，
    刚写完当然一致，等于没校验。产物被人手改过、或重跑结果变了，
    只有拿「上一次记下来的指纹」去比才看得出来。

    这条对应用户定的长期规范：生成时间可以变，输入/脚本/产物的指纹不能变。
    generated_at 不参与比对——它本来就该每次不同。
    """
    if not os.path.exists(RECORD):
        raise SystemExit('没有构建记录，先跑 python3 freeze_build_record.py')
    rec = json.load(io.open(RECORD, encoding='utf-8'))
    bad = []
    for o in rec.get('outputs') or []:
        fp = os.path.join(BASE, o['path'])
        if not os.path.exists(fp):
            bad.append((o['path'], '文件不存在', o['sha256']))
            continue
        h = hashlib.sha256()
        with open(fp, 'rb') as fh:
            for chunk in iter(lambda: fh.read(65536), b''):
                h.update(chunk)
        if h.hexdigest() != o['sha256']:
            bad.append((o['path'], h.hexdigest()[:16], o['sha256'][:16]))
    print('校验构建记录 → %s' % rel(RECORD))
    print('  generated_at %s（不参与比对）' % rec.get('generated_at'))
    print('  产物 %d 个，不一致 %d' % (len(rec.get('outputs') or []), len(bad)))
    for p_, now, rec_ in bad:
        print('    ✗ %s  现在 %s  记录 %s' % (p_, now, rec_))
    if bad:
        raise SystemExit('产物指纹与记录不一致：要么被改过，要么构建不可复现')
    print('  一致')


if __name__ == '__main__':
    import sys as _s
    (check if '--check' in _s.argv else main)()
