#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抽取注疏子集（十三经注疏、朱熹四书章句集注、王弼老子注、郭象庄子注）。

来源：殆知阁古代文献 txt 大全集（github.com/garychowcmu/daizhigev20，公有领域）
      钉死 commit，不用 master —— master 会变，索引就无法复现。

只取需要的 12 个文件（约 4.7MB），不下载 4.8GB 全量。

产出：
  raw/commentary/text/*.txt     注疏原文
  raw/commentary/SOURCES.json   每个文件的来源、版本、许可、SHA256

再次运行会校验 SHA256；不符即失败（除非 --update 显式接受新版本）。
"""
import argparse
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
OUT_DIR = os.path.join(BASE, 'raw', 'commentary')
TEXT_DIR = os.path.join(OUT_DIR, 'text')
SOURCES = os.path.join(OUT_DIR, 'SOURCES.json')

# 钉死 commit：2026-11-02 取的 master 头
COMMIT = '4a6d6f2088825f132521d848c2ea86cf9c9a7620'
REPO = 'garychowcmu/daizhigev20'
RAW = 'https://raw.githubusercontent.com/%s/%s/' % (REPO, COMMIT)

COMMENTARIES = {
    'lunyu-zhushu': {
        'book': '论语注疏',
        'author': '何晏集解、邢昺疏',
        'era': '魏、宋',
        'repo_path': '儒藏/四书/论语注疏.txt',
        'series': '十三经注疏',
        'format': 'marked',
        'format_note': '经文行 + [疏] 前缀疏文，可机械切分；注文以「注」标起',
    },
    'lunyu-jizhu': {
        'book': '论语集注',
        'author': '朱熹',
        'era': '宋',
        'repo_path': '儒藏/四书/论语集注.txt',
        'series': '四书章句集注',
        'format': 'mixed',
        'format_note': '经文与注文同行混排，无分隔标记，须以原典章节为锚对齐',
    },
    'mengzi-zhushu': {
        'book': '孟子注疏',
        'author': '赵岐注、孙奭疏',
        'era': '汉、宋',
        'repo_path': '儒藏/四书/孟子注疏.txt',
        'series': '十三经注疏',
        'format': 'marked',
        'format_note': '经文行 + [疏] 前缀疏文',
    },
    'mengzi-jizhu': {
        'book': '孟子集注',
        'author': '朱熹',
        'era': '宋',
        'repo_path': '儒藏/四书/孟子集注.txt',
        'series': '四书章句集注',
        'format': 'mixed',
        'format_note': '经文与注文混排',
    },
    'sishu-zhangju-jizhu': {
        'book': '四书章句集注',
        'author': '朱熹',
        'era': '宋',
        'repo_path': '儒藏/四书/四书章句集注.txt',
        'series': '四书章句集注',
        'format': 'mixed',
        'format_note': '四书合集本，可与单行本互校',
    },
    'daxue-zhangju-jizhu': {
        'book': '大学章句集注',
        'author': '朱熹',
        'era': '宋',
        'repo_path': '儒藏/四书/大学章句集注.txt',
        'series': '四书章句集注',
        'format': 'mixed',
        'format_note': '单行本',
    },
    'zhongyong-zhangju-jizhu': {
        'book': '中庸章句集注',
        'author': '朱熹',
        'era': '宋',
        'repo_path': '儒藏/四书/中庸章句集注.txt',
        'series': '四书章句集注',
        'format': 'mixed',
        'format_note': '单行本',
    },
    'laozi-wangbi': {
        'book': '王弼老子注',
        'author': '王弼',
        'era': '魏',
        'repo_path': '道藏/藏外/王弼老子注.txt',
        'series': '老子注',
        'format': 'commentary_only',
        'format_note': '仅存注文，经文省略；须按章号挂到老子原文上',
    },
    'laozi-wangbi-daozang': {
        'book': '道德真经注（魏王弼）',
        'author': '王弼',
        'era': '魏',
        'repo_path': '道藏/正统道藏洞神部/玉诀类/道德真经注（魏王弼）.txt',
        'series': '老子注',
        'format': 'alternating',
        'format_note': '正统道藏本。经文行与注文行交替出现（一、三、五行经文，二、四、六行王弼注），'
                       '与藏外本互校，用于记录版本差异',
    },
    'laozi-wangbi-jin': {
        'book': '老子道德经（晋王弼）',
        'author': '王弼',
        'era': '魏（题晋）',
        'repo_path': '道藏/藏外/老子道德经（晋王弼）.txt',
        'series': '老子注',
        'format': 'alternating',
        'format_note': '第三个王弼本，三本并存用于版本对照',
    },
    'zhuangzi-guoxiang': {
        'book': '庄子注',
        'author': '郭象',
        'era': '晋',
        'repo_path': '道藏/藏外/庄子注.txt',
        'series': '庄子注',
        'format': 'sectioned',
        'format_note': '郭象注本',
    },
    'nanhua-zhushu': {
        'book': '南华真经注疏',
        'author': '郭象注、成玄英疏',
        'era': '晋、唐',
        'repo_path': '道藏/正统道藏洞神部/玉诀类/南华真经注疏.txt',
        'series': '庄子注疏',
        'format': 'marked',
        'format_note': '注疏合刊，含郭象注与成玄英疏',
    },
}


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def download(repo_path, dest):
    url = RAW + urllib.parse.quote(repo_path)
    req = urllib.request.Request(url, headers={'User-Agent': 'qintianjian-content-build/1.0'})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    if not data:
        raise RuntimeError('下载为空：%s' % url)
    with open(dest, 'wb') as f:
        f.write(data)
    return url, len(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--update', action='store_true', help='接受上游内容变化，重写 SHA256')
    ap.add_argument('--only', default=None, help='只处理某个 key')
    args = ap.parse_args()

    os.makedirs(TEXT_DIR, exist_ok=True)
    old = {}
    if os.path.exists(SOURCES):
        for e in json.load(open(SOURCES, encoding='utf-8'))['files']:
            old[e['key']] = e

    files = []
    changed, added, kept, failed = [], [], [], []

    for key, meta in COMMENTARIES.items():
        if args.only and key != args.only:
            continue
        dest = os.path.join(TEXT_DIR, key + '.txt')
        entry = {
            'key': key,
            'book': meta['book'],
            'author': meta['author'],
            'era': meta['era'],
            'series': meta['series'],
            'format': meta['format'],
            'format_note': meta['format_note'],
            'source_repo': REPO,
            'source_commit': COMMIT,
            'source_path': meta['repo_path'],
            'license': '公有领域（殆知阁古代文献 txt 大全集，项目自述为公有领域古籍整理文本）',
            'license_caveat': '整理本的标点、分段、校勘记可能另有整理者劳动；本库只作内部检索与引用定位，'
                              '不直接复制整理本的标点成果作为产品内容。',
            'local_path': 'content/classics/raw/commentary/text/%s.txt' % key,
        }
        try:
            url, size = download(meta['repo_path'], dest)
        except Exception as e:
            failed.append('%s: %s' % (key, e))
            if key in old:
                files.append(old[key])
            continue
        digest = sha256_of(dest)
        entry['source_url'] = url
        entry['bytes'] = size
        entry['sha256'] = digest

        prev = old.get(key)
        if prev and prev.get('sha256') != digest:
            if not args.update:
                failed.append('%s: SHA256 变化（旧 %s… 新 %s…），加 --update 才接受'
                              % (key, prev['sha256'][:12], digest[:12]))
            else:
                changed.append(key)
        elif not prev:
            added.append(key)
        else:
            kept.append(key)
        files.append(entry)

    payload = {
        'dataset': '殆知阁古代文献 txt 大全集',
        'repo': 'https://github.com/%s' % REPO,
        'pinned_commit': COMMIT,
        'fetched_at': '2026-11-02',
        'scope': '只取注疏子集 12 种，不下载全量 4.8GB',
        'note': '索引保留八项元数据：书名、作者或注家、篇章、原文、注释原文、原始文件位置、版本信息、获取来源。'
                '检索命中不等于证据成立，match_status 区分 hit / candidate / verified。',
        'files': files,
    }
    with open(SOURCES, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print('[fetch_commentary] 新增 %d / 变化 %d / 未变 %d / 失败 %d'
          % (len(added), len(changed), len(kept), len(failed)))
    for k in added:
        print('  + ' + k)
    for k in changed:
        print('  ~ ' + k)
    for k in failed:
        print('  ! ' + k)
    if failed and not args.update:
        sys.exit(1)


if __name__ == '__main__':
    main()
