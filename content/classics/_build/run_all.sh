#!/usr/bin/env bash
# 内容库生成链。顺序不可调换：后一步依赖前一步输出。
# parse_md（研究文档→结构化）→ build_nodes → build_network → review_relations
#   → build_content（拼总包）→ patch_context → fix_p0 → validate
#
# 第 0 步是为了让整条链可复现：研究文档是唯一事实源，
# parsed/ 每次从 md 重新生成，不依赖任何临时文件。
set -e
cd "$(dirname "$0")/.."

echo "== 0/8 解析研究文档 =="  && python3 _build/parse_md.py --md 02_思想单元候选总表.md --out parsed/lunyu.json | tail -1
echo "== 1/8 生成节点 =="       && python3 _build/build_nodes.py      | tail -1
echo "== 2/8 生成群与关系 =="   && python3 _build/build_network.py    | tail -1
echo "== 3/8 关系边审核 =="     && python3 _build/review_relations.py | tail -3
echo "== 4/8 拼总包 =="         && python3 _build/build_content.py    | tail -2
echo "== 5/8 补全前后文 =="     && python3 _build/patch_context.py    | tail -3
echo "== 6/8 P0 硬错误修正 =="  && python3 _build/fix_p0.py           | tail -2
echo "== 7/8 校验 =="           && python3 _build/validate.py
