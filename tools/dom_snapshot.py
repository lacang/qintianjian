#!/usr/bin/env python3
"""把 index.html 解析成元素树 JSON，供 Node 端 DOM 桩使用。"""
import json, sys
from html.parser import HTMLParser

VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag':'#root','attrs':{},'children':[]}
        self.stack = [self.root]
        self.text = {}
    def handle_starttag(self, tag, attrs):
        node = {'tag':tag,'attrs':{k:(v if v is not None else '') for k,v in attrs},'children':[]}
        self.stack[-1]['children'].append(node)
        if tag not in VOID:
            self.stack.append(node)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i]['tag'] == tag:
                del self.stack[i:]
                return
    def handle_data(self, data):
        if data.strip():
            self.stack[-1].setdefault('text', '')
            self.stack[-1]['text'] += data.strip()

p = P()
p.feed(open(sys.argv[1], encoding='utf-8').read())
json.dump(p.root, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
def count(n):
    return 1 + sum(count(c) for c in n['children'])
print(f'解析完成：{count(p.root)} 个节点 → {sys.argv[2]}')
