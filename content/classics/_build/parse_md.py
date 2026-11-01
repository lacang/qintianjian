# -*- coding: utf-8 -*-
"""从研究文档（Markdown）解析出结构化数据，供 build_nodes.py 使用。

为什么要有这一步：
    原来 build_nodes.py 直接读 /tmp/ly_parsed.json —— 那是上一次人工跑脚本的
    临时产物。机器重启、/tmp 被清、换一台机器，构建链第 1 步就断，而 26 条
    的研究内容只存在于这个临时文件里。五百条计划要做几十次构建，这不能忍。

现在改成：研究文档是唯一事实源，parsed json 每次从 md 重新生成，可复现。

用法：
    python3 parse_md.py --md ../02_思想单元候选总表.md --out ../parsed/lunyu.json

契约：
    - 只做解析，不做判断。原文正确性、证据真实性不在这里保证。
    - 解析不出来的字段留空字符串，不猜。
    - 条目数少于 md 里的 `## XX-nnn` 标题数就报错退出，不静默丢条。
"""
import argparse
import json
import os
import re
import sys

# 研究文档里的二级标题 → parsed 字段名
SECTION_MAP = {
    '原文': 'original',
    '篇章定位': 'location',
    '前后文': 'context',
    '独立思想表达': 'idea',
    '四维来源证据': 'evidence',
    '七项交叉评价': 'ratings_raw',
    '核验状态': 'verify',
}

FIELD_ORDER = ['id', 'title', 'original', 'location', 'context',
               'idea', 'evidence', 'ratings_raw', 'verify']


def parse(md_text):
    """把研究文档切成条目列表。"""
    out = []
    # 按二级标题切条。首个块是文档头（版本说明），丢掉。
    blocks = re.split(r'\n## ', md_text)
    heads = re.findall(r'^## ([A-Z]{2}-\d{3})\s+(.+)$', md_text, re.M)

    for block in blocks[1:]:
        lines = block.split('\n')
        m = re.match(r'^([A-Z]{2}-\d{3})\s+(.+?)\s*$', lines[0])
        if not m:
            continue
        tid, title = m.group(1), m.group(2).strip()
        body = '\n'.join(lines[1:])

        rec = dict.fromkeys(FIELD_ORDER, '')
        rec['id'] = tid
        rec['title'] = title

        for sec in re.split(r'\n### ', body)[1:]:
            sec_lines = sec.split('\n')
            name = sec_lines[0].strip()
            content = '\n'.join(sec_lines[1:]).strip()
            # 遇到 --- 分隔线就截断：后面要么是下一条，要么是文档尾注。
            # 文档末尾有一段 "> **说明**：以上26条…"，那是全表注释，
            # 不属于最后一条的核验状态，不能混进去。
            content = content.split('\n---')[0].strip()
            key = SECTION_MAP.get(name)
            if key:
                rec[key] = content

        out.append(rec)

    if len(out) != len(heads):
        raise SystemExit(
            f'解析条数不符：标题 {len(heads)} 个，解析出 {len(out)} 条。'
            f'不允许静默丢条，请检查 md 的标题格式。')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--md', required=True, help='研究文档路径')
    ap.add_argument('--out', required=True, help='输出 json 路径')
    ap.add_argument('--min-fields', type=int, default=5,
                    help='单条最少非空字段数，低于此值视为解析失败')
    args = ap.parse_args()

    with open(args.md, encoding='utf-8') as f:
        md_text = f.read()

    rows = parse(md_text)

    # 完整性自检：必填字段不能整列为空
    for key in ('original', 'location', 'idea'):
        empty = [r['id'] for r in rows if not r[key]]
        if empty:
            raise SystemExit(f'字段 {key} 在以下条目为空：{empty}')

    thin = [r['id'] for r in rows
            if sum(1 for v in r.values() if v) < args.min_fields]
    if thin:
        raise SystemExit(f'以下条目字段过少，疑似解析失败：{thin}')

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    print(f'[parse_md] {args.md} → {args.out}')
    print(f'[parse_md] {len(rows)} 条，字段 {FIELD_ORDER}')


if __name__ == '__main__':
    main()
