#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 data/lunyu-content.json 导出为钦天监前端可直接 import 的 ES 模块。

为什么不用 fetch JSON：
  钦天监是纯本地 PWA，所有内容资产都以 ES 模块形式随包发布，
  由 sw.js 的 ASSETS 精确列入离线缓存。走 fetch 会引入一个
  额外的运行时失败面（缓存未命中、离线首屏、MIME），
  与「确定性 / 纯本地」铁律冲突。

输出：每日六爻/app/js/classic/lunyu-data.js
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'data', 'lunyu-content.json')
DEBATES = os.path.join(HERE, 'debates.json')
TOPICS = os.path.join(HERE, 'topics.json')
# 迁移后 ROOT 已位于 每日六爻/content/classics，仓库根要往上两层。
REPO = os.path.dirname(os.path.dirname(ROOT))
APP = os.path.join(REPO, 'app', 'js', 'classic')
OUT = os.path.join(APP, 'lunyu-data.js')


def main():
    d = json.load(open(SRC, encoding='utf-8'))

    # 前端只需要产品必需的字段；证据层原始 URL 清单留在内容库，
    # 产品侧只保留已写进 evidence.text 的叙述，避免把研究中间产物带上线。
    keep_thought = [
        'id', 'type', 'classic', 'title', 'full_title', 'original',
        'location', 'location_text', 'context', 'idea',
        'commentaries', 'disputes', 'evidence', 'ratings', 'verify',
        'clusters', 'tags', 'evidence_quality', 'relations', 'corrections',
    ]
    thoughts = [{k: t[k] for k in keep_thought if k in t} for t in d['thoughts']]

    # 辩一辩题库属于产品内容，但它引用原典与注家归属，必须与内容库同源同版本，
    # 因此不写在 web 侧，而是随内容库一起导出（董事长批示：数据源统一比界面补救重要）。
    debates = []
    if os.path.exists(DEBATES):
        dj = json.load(open(DEBATES, encoding='utf-8'))
        debates = dj.get('debates', [])
        # 结构校验：辩题必须落到真实节点，立场至少两个，且必须给出原典说法
        ids = {t['id'] for t in thoughts}
        errs = []
        for db in debates:
            if db.get('node') not in ids:
                errs.append('%s 指向不存在的节点 %s' % (db.get('id'), db.get('node')))
            if len(db.get('stances') or []) < 2:
                errs.append('%s 立场少于两个' % db.get('id'))
            if not db.get('canon_note'):
                errs.append('%s 缺少 canon_note（必须说明原典实际说了什么）' % db.get('id'))
            for st in db.get('stances') or []:
                if not st.get('lineage'):
                    errs.append('%s 立场 %s 缺少 lineage（必须注明出处或明确标注原文未及）' % (db.get('id'), st.get('id')))
        if errs:
            raise SystemExit('辩题库校验失败：\n  ' + '\n  '.join(errs))

    # 主题标签（正式）：董事长 2026-10-31 批准 v0.2 转正。
    #
    # 三条约束必须在这里落地，而不是留给前端补救：
    #   ① 标签允许交叉 —— 所以 thought.topics 是数组，且不要求唯一归属；
    #   ② 标签相同不自动产生思想关系 —— 所以标签只写进 topics，绝不写进 relations；
    #   ③ 跨经典标签可以提前建立，但没有真实内容时不得显示虚假推荐
    #      —— 所以 future_classics 这类"意图声明"不进入产品 payload，
    #         推荐只从 topics[].nodes（本经典已有节点）里取。
    topics = []
    if os.path.exists(TOPICS):
        tj = json.load(open(TOPICS, encoding='utf-8'))
        tmeta = tj.get('meta', {})
        if tmeta.get('status') != 'approved':
            raise SystemExit('topics.json 状态为 %r，未获批准，不得进入产品数据'
                             % tmeta.get('status'))
        raw = tj.get('topics') or []
        ids = {t['id'] for t in thoughts}
        errs = []
        if len({x['id'] for x in raw}) != len(raw):
            errs.append('标签 id 重复')
        if len({x['name'] for x in raw}) != len(raw):
            errs.append('标签名重复')
        cover = {}
        for tp in raw:
            if not tp.get('nodes'):
                errs.append('%s 没有节点清单' % tp.get('id'))
            for nid in tp.get('nodes') or []:
                if nid not in ids:
                    errs.append('%s 指向不存在的节点 %s' % (tp.get('id'), nid))
                cover.setdefault(nid, []).append(tp['id'])
        miss = ids - set(cover)
        if miss:
            errs.append('有节点没有归入任何主题：%s' % ','.join(sorted(miss)))
        over = {k: v for k, v in cover.items() if len(v) > 4}
        if over:
            errs.append('单节点标签数超过 4：%s' % over)
        if errs:
            raise SystemExit('主题标签校验失败：\n  ' + '\n  '.join(errs))
        # 产品侧只保留渲染必需字段。basis/boundary 保留是因为详情页要回答
        # 「为什么它归这个主题」——这是标签可审查性的产品化落地。
        topics = [{
            'id': tp['id'], 'name': tp['name'], 'nodes': tp['nodes'],
            'basis': tp.get('basis', ''), 'boundary': tp.get('boundary', ''),
        } for tp in raw]
        for t in thoughts:
            t['topics'] = cover.get(t['id'], [])

    payload = dict(
        meta=d['meta'],
        clusters=d['clusters'],
        relations=d['relations'],
        thoughts=thoughts,
        corrections=d['corrections'],
        entrypoints=d['entrypoints'],
        debates=debates,
        topics=topics,
    )

    body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    # 防御：JSON 内出现 </script 会截断内联场景；本文件是外部模块，
    # 但统一转义可让同一份产物将来可安全内联。
    body = body.replace('</', '<\\/')

    os.makedirs(APP, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// 由 论语思想单元候选库/_build/export_web.py 生成，勿手改。\n')
        f.write('// 数据源：data/lunyu-content.json（已终审版本）\n')
        f.write('export const LUNYU = ')
        f.write(body)
        f.write(';\n')

    size = os.path.getsize(OUT)
    print('导出 %s  %.1f KB' % (OUT, size / 1024))
    print('  思想 %d / 纠错 %d / 群 %d / 关系 %d / 抽签池 %d / 辩题 %d / 主题标签 %d' % (
        len(thoughts), len(d['corrections']), len(d['clusters']),
        len(d['relations']), d['meta']['counts']['draw_pool'], len(debates), len(topics)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
