# 论语思想单元候选库研究维度

research_question: 以《论语》为唯一研究对象，通过大众传播、学术研究、历史注疏、现代跨学科研究四个维度，发现现代人反复讨论/引用、且具有长期思想价值的《论语》思想单元，形成一份有来源、有证据、可追溯原典的思想单元候选库。

## Scope
time_scope: Not specified（关注长期思想价值，不限时段；大众传播侧重当代）
geographic_scope: 中国为主，兼顾海外汉学研究
target_object: 《论语》（孔子及其弟子言行录）
decision_intent: 为后续内容生产（抽签/日课类应用）筛选值得收录的思想单元
task_type: 文献调研与思想发现实验
exclusions: 不扩展到其他经典；不开发网站功能；不修改代码；不执行git操作；不部署
ambiguities: ①"现代跨学科研究"边界需自行判断（心理学/社会学/管理学等对论语的引用性研究）；②"高/中/低"传播评级缺乏统一量化标准，需以多源交叉判断

### dim_01: 大众传播维度
Entity:
Must-have: yes
Description: 识别当代互联网、书籍、演讲中被高频引用和持续讨论的《论语》语句与思想
Sources hint: 知乎、微信公众号、新闻媒体、豆瓣、论坛、畅销书引用

### dim_02: 学术研究维度
Entity:
Must-have: yes
Description: 识别学术界持续研究的《论语》篇章、思想主题，以及存在不同学术解释的内容
Sources hint: 知网CNKI、万方、Google Scholar、学术专著、高校研究成果

### dim_03: 历史注疏维度
Entity:
Must-have: yes
Description: 梳理历代重要注疏对《论语》各篇的解释传统和分歧
Sources hint: 何晏《论语集解》、皇侃《论语义疏》、邢昺《论语注疏》、朱熹《论语集注》、刘宝楠《论语正义》

### dim_04: 现代跨学科研究维度
Entity:
Must-have: yes
Description: 识别心理学、社会学、教育学、管理学、政治哲学等学科对《论语》思想的研究与延伸
Sources hint: 跨学科期刊、正面管教/积极心理学/儒商管理等研究领域

### dim_05: 原典核验与误引辨析
Entity:
Must-have: yes
Description: 核验所有候选单元的原文真实性、篇章定位，识别常见误引/改写/断章取义
Sources hint: ctext.org、中国哲学书电子化计划、十三经注疏、原典对照
