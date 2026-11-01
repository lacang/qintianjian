# -*- coding: utf-8 -*-
"""内容库数据校验。改数据后运行：python3 _build/validate.py"""
import json, os, sys

# 路径一律相对本文件解析，不写机器绝对路径。
# 换设备、换目录、别人 clone 下来都能直接跑。
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'data')
errs, warns = [], []

d = json.load(open(os.path.join(OUT, 'lunyu-content.json'), encoding='utf-8'))
T = d['thoughts']; C = d['corrections']; CL = d['clusters']; R = d['relations']
tid = {t['id'] for t in T}

# 0 多经典结构（五百条阶段新增，对现有 26 条向后兼容）
#
# 单经典时代不需要 classic 字段——整个库只有论语。跨到 14 部之后，
# 「这条出自哪本书」必须显式写在数据里，不能靠 ID 前缀猜、也不能靠约定俗成。
# 一旦 d['classics'] 存在，就按严格模式校验；不存在则跳过，老数据照常通过。
CLASSIC_DEFS = d.get('classics', [])
if CLASSIC_DEFS:
    known = {c['id']: c for c in CLASSIC_DEFS}
    code_map = {c['code']: c['id'] for c in CLASSIC_DEFS}
    for t in T:
        cl = t.get('classic')
        if not cl:
            errs.append(f"{t['id']} 缺 classic 字段（多经典库不允许隐式归属）")
            continue
        if cl not in known:
            errs.append(f"{t['id']} classic={cl} 不在 classics 名单内")
            continue
        prefix = t['id'].split('-')[0]
        if code_map.get(prefix) != cl:
            errs.append(f"{t['id']} ID 前缀 {prefix} 与 classic={cl} 不一致")
        tier = t.get('quality_tier')
        if tier not in ('A', 'B', 'C'):
            errs.append(f"{t['id']} quality_tier 非法：{tier}（必须是 A/B/C）")
        # C 简释层只承诺「原典+出处+白话+一条注」，出现学术证据说明层级标错了
        if tier == 'C' and (t.get('evidence') or {}).get('academic'):
            errs.append(f"{t['id']} 标为 C 简释层却有学术证据，层级与证据深度不符")

# 0b 跨经典关系不得标为原典事实
# 没有哪部原典自带跨书判语。孔孟之间的关联、性善性恶的对照，都是后人建立的，
# 要么是注家明确合观（commentary），要么是本产品建立的比较（editorial）。
_classic_of = {}
for _t in T:
    _classic_of[_t['id']] = _t.get('classic', 'lunyu')
for _r in R:
    _ca = _classic_of.get(_r['from'])
    _cb = _classic_of.get(_r['to'])
    if _ca and _cb and _ca != _cb and _r.get('relation_basis') == 'canon':
        errs.append(
            f"关系 {_r['id']} 跨经典（{_ca}↔{_cb}）却标 relation_basis=canon"
            f"——不得把编辑比较包装成原典自带判语")

# 1 id 唯一
if len(tid) != len(T): errs.append('思想节点 id 重复')
cid = [c['id'] for c in C]
if len(set(cid)) != len(cid): errs.append('纠错节点 id 重复')

# 2 关系两端存在
for r in R:
    if r['status'] not in ('verified','pending','rejected'): errs.append(f"关系 {r['id']} status 非法: {r['status']}")
    if not r.get('basis'): errs.append(f"关系 {r['id']} 缺依据")
    if r['relation_basis'] == 'editorial' and r['status'] == 'verified' and not r.get('approved_by'):
        errs.append(f"关系 {r['id']} 关系层为编辑阐释却标 verified 且无人工批准——不得把编辑意见写成事实")
    if r['relation_basis'] == 'editorial' and r['status'] == 'verified' and not r.get('review_note'):
        errs.append(f"关系 {r['id']} 人工批准的编辑阐释缺展示措辞说明")
    if r['from'] not in tid: errs.append(f"关系 {r['id']} from 不存在: {r['from']}")
    if r['to'] not in tid: errs.append(f"关系 {r['id']} to 不存在: {r['to']}")

# 3 cluster 分支存在
for c in CL:
    for b in c['branches']:
        if b['node'] not in tid: errs.append(f"群 {c['id']} 分支节点不存在: {b['node']}")

# 4 context 五要素
for t in T:
    for k in ('speaker','interlocutor','occasion','before','after'):
        if not t['context'].get(k): errs.append(f"{t['id']} context.{k} 为空")

# 5 correction 关联存在
for c in C:
    if c.get('related_thought') and c['related_thought'] not in tid:
        errs.append(f"{c['id']} related_thought 不存在")
    if c.get('soft_related') and c['soft_related'] not in tid:
        errs.append(f"{c['id']} soft_related 不存在")

# 6 抽签池一致
pool = sum(1 for t in T if t['ratings']['draw_suitability'] == '适合')
if pool != d['entrypoints']['random_encounter']['pool_size']:
    errs.append(f"抽签池数量不符：实际 {pool}，声明 {d['entrypoints']['random_encounter']['pool_size']}")

# 7 分片与总包一致
frag = json.load(open(os.path.join(OUT, 'lunyu-thoughts.json'), encoding='utf-8'))
if len(frag) != len(T): warns.append(f"分片 thoughts {len(frag)} 条 ≠ 总包 {len(T)} 条")
fragc = json.load(open(os.path.join(OUT, 'lunyu-corrections.json'), encoding='utf-8'))
if len(fragc) != len(C): warns.append(f"分片 corrections {len(fragc)} 条 ≠ 总包 {len(C)} 条")

# 8 质量提示
weak = [t['id'] for t in T if t['evidence_quality'] == 'weak']
if weak: warns.append(f'证据薄弱节点：{weak}')
nores = [t['id'] for t in T if not t['relations']]
if nores: warns.append(f'孤立节点（无关系）：{nores}')
from collections import Counter
st = Counter(r['status'] for r in R)
warns.append(f"关系边状态：已核实 {st['verified']} / 待核实 {st['pending']} / 不成立 {st['rejected']}")
fb = Counter(r['fact_basis'] for r in R); rb = Counter(r['relation_basis'] for r in R)
warns.append(f"原典事实层：原典直证 {fb['canon']} / 原典+注疏 {fb['canon+commentary']} / 注疏 {fb['commentary']}")
warns.append(f"关系层：原典自带判语 {rb['canon']} / 注家合观 {rb['commentary']} / 编辑阐释 {rb['editorial']}")
appr = [r['id'] for r in R if r.get('approved_by')]
if appr: warns.append(f"人工批准的编辑阐释（须标明「这是阐释」）：{appr}")
if st['rejected']:
    warns.append(f"不成立边（不进探索推荐）：{[r['id'] for r in R if r['status']=='rejected']}")

print(f'思想 {len(T)} | 纠错 {len(C)} | 群 {len(CL)} | 关系 {len(R)} | 抽签池 {pool}')
print(f'注家 {sum(len(t["commentaries"]) for t in T)} 条 | 有分歧 {sum(1 for t in T if t["disputes"])} 条 | 证据 strong {sum(1 for t in T if t["evidence_quality"]=="strong")}')
print()
if warns:
    print('提示：')
    for w in warns: print('  -', w)
print()
if errs:
    print(f'❌ {len(errs)} 项错误：')
    for e in errs: print('  -', e)
    sys.exit(1)
print('✅ 全部校验通过')
