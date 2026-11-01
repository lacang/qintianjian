# -*- coding: utf-8 -*-
"""下载并抽取公有领域原典，落进仓库的 raw/canon/，同时记录来源元数据。

为什么单独一步：
    原典是整条内容链的地基。地基的来源必须可追溯——数据集叫什么、哪个版本、
    什么时候下的、文件指纹多少、许可是什么、许可文件在哪。这些东西如果不
    在下载当时记下来，半年后没人说得清这些字是从哪来的。

    所以本脚本做两件事：抽数据 + 写 SOURCES.json。缺一不可。

许可提醒（重要）：
    本脚本只处理「原典」——古籍本身早已进入公有领域。
    现代译文是另一回事：译者是今人，译文有著作权。NiuTrans 的 README 自述
    「数据均来自互联网，原始数据的最终解释权归相关数据来源方所有」，权利状态
    并不清晰。所以译文只能作研究参考，不得直接当产品文案。这一点写在
    SOURCES.json 里，也写在计划里。

用法：
    python3 fetch_corpus.py                # 下载 + 抽取 + 写元数据
    python3 fetch_corpus.py --check        # 只校验已有数据，不下载
"""
import argparse
import hashlib
import io
import json
import os
import sys
import time
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, 'raw')
CANON = os.path.join(RAW, 'canon')
CACHE = os.path.join(RAW, '_cache')
SOURCES = os.path.join(RAW, 'SOURCES.json')

# 数据源登记。新增来源必须在这里加一条，不许裸写 URL 到别的脚本里。
DATASETS = {
    'ccc': {
        'name': 'chinese-classical-corpus',
        'upstream': 'gujilab/chinese-classical-corpus (原 zi6me)',
        'url': 'https://hf-mirror.com/datasets/gujilab/chinese-classical-corpus/resolve/main/corpus.jsonl',
        'license': 'CC0-1.0',
        'license_note': '数据集自述为 CC0 1.0 公有领域奉献，可自由使用与商用。'
                        '底层古籍本身早已进入公有领域，不受著作权保护。'
                        '注意：CC0 覆盖的是「数据集的组织与标注」，不等于对任意转引的现代校注本授权。',
        'record_count': 12009,
        'scope': '十三经及先秦两汉经部文献，按篇/卷存储，content 内部按换行分章',
        'fetched_at': None,
        'sha256': None,
        'bytes': None,
    },
}

# 需要的经典：source 字段的中文名 → 本项目经典 id
WANTED = {
    '论语': 'lunyu',
    '孟子': 'mengzi',
    '大学': 'daxue',
    '中庸': 'zhongyong',
    '诗经': 'shijing',
    '周易': 'zhouyi',
    '孝经': 'xiaojing',
    '礼记': 'liji',
}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def download(url, dest, retries=4):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        print(f'[fetch] 已有缓存，跳过下载：{dest}')
        return dest
    last = None
    for i in range(retries):
        try:
            print(f'[fetch] 下载 {url} （第 {i+1} 次）')
            tmp = dest + '.part'
            with urllib.request.urlopen(url, timeout=180) as r, open(tmp, 'wb') as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(tmp, dest)
            print(f'[fetch] 完成 {os.path.getsize(dest)/1048576:.1f} MB')
            return dest
        except Exception as e:  # noqa: BLE001
            last = e
            print(f'[fetch] 失败：{e}')
            time.sleep(3 * (i + 1))
    raise SystemExit(f'[fetch] 下载失败，已重试 {retries} 次：{last}')


def extract(corpus_path):
    """从总语料里抽出需要的经典，按经典分文件落盘。"""
    os.makedirs(CANON, exist_ok=True)
    buckets = {cid: [] for cid in WANTED.values()}
    total = 0
    with io.open(corpus_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            total += 1
            rec = json.loads(line)
            cid = WANTED.get(rec.get('source', ''))
            if not cid:
                continue
            buckets[cid].append({
                'id': rec.get('id'),
                'source': rec.get('source'),
                'chapter': rec.get('chapter'),
                'content': rec.get('content'),
                'author': rec.get('author'),
                'era': rec.get('era'),
            })

    written = {}
    for cid, rows in buckets.items():
        if not rows:
            print(f'[fetch] 警告：{cid} 没有抽到记录')
            continue
        out = os.path.join(CANON, f'{cid}.json')
        with io.open(out, 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
        written[cid] = {
            'file': os.path.relpath(out, BASE),
            'records': len(rows),
            'bytes': os.path.getsize(out),
            'sha256': sha256_file(out),
        }
        print(f'[fetch] {cid}: {len(rows)} 条记录 → {os.path.relpath(out, BASE)}')
    return total, written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='只校验，不下载')
    args = ap.parse_args()

    ds = DATASETS['ccc']
    cache_path = os.path.join(CACHE, 'ccc-corpus.jsonl')

    if not args.check:
        download(ds['url'], cache_path)
        ds['fetched_at'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
        ds['sha256'] = sha256_file(cache_path)
        ds['bytes'] = os.path.getsize(cache_path)
        total, written = extract(cache_path)
        ds['parsed_records'] = total
        ds['extracted'] = written
    else:
        # 校验模式：确认 raw/canon 里的文件和元数据记录的指纹一致
        if not os.path.exists(SOURCES):
            raise SystemExit('[fetch] 没有 SOURCES.json，先跑一次正常下载')
        with io.open(SOURCES, encoding='utf-8') as f:
            prev = json.load(f)
        ds = prev['datasets']['ccc']
        bad = []
        for cid, info in ds.get('extracted', {}).items():
            p = os.path.join(BASE, info['file'])
            if not os.path.exists(p):
                bad.append(f'{cid} 文件缺失')
                continue
            if sha256_file(p) != info['sha256']:
                bad.append(f'{cid} 指纹不符（文件被改过或重建过）')
        if bad:
            raise SystemExit('[fetch] 校验失败：\n  ' + '\n  '.join(bad))
        print(f'[fetch] 校验通过，{len(ds["extracted"])} 部经典指纹一致')

    payload = {
        '_note': '原典来源登记。任何原典数据的来历都必须在这里能查到。',
        '_license_principle': [
            '古籍原文早已进入公有领域，不受著作权保护。',
            '数据集自身的许可（如 CC0）覆盖的是数据集的编排与标注，不等于对任何现代校注本的授权。',
            '现代译文由今人完成，有著作权。译文只能作研究参考，不得直接作为产品文案。',
            '每次引用具体文本时，须能回溯到本文件记录的版本与文件指纹。',
        ],
        'datasets': {'ccc': ds},
    }
    with io.open(SOURCES, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f'[fetch] 元数据写入 {os.path.relpath(SOURCES, BASE)}')


if __name__ == '__main__':
    main()
