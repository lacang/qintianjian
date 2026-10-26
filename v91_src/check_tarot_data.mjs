// v92：校验 RWS 数据完整性 + 倾向表 78 全覆盖 + 真图文件真实存在
import { getDeck } from '/Coze/Drive/编程专家/每日六爻/app/vendor/liuyao-core.js';
import { RWS_VAL, rwsVal } from '/Coze/Drive/编程专家/每日六爻/app/js/tarotval_rws.js';
import { existsSync } from 'fs';
let err = 0;
const ok = (c, m) => { if (!c) { console.log('❌', m); err++; } };

const d = getDeck('rws');
ok(d.cards.length === 78, `应78张，实际${d.cards.length}`);
let imgOk = 0;
const ids = new Set();
d.cards.forEach(c => {
  ids.add(c.id);
  ok(c.name && c.nameAlt, `${c.id} 名缺`);
  ok(c.meaning && c.meaning.scene && c.meaning.scene.length > 6, `${c.id} scene 短`);
  ok(Array.isArray(c.meaning.keywords) && c.meaning.keywords.length >= 3, `${c.id} 关键词不足`);
  ok(Array.isArray(c.meaning.upright) && c.meaning.upright.length >= 2, `${c.id} 正位义不足`);
  ok(Array.isArray(c.meaning.reversed) && c.meaning.reversed.length >= 2, `${c.id} 逆位义不足`);
  ok(c.image && /^\.\/assets\/cards\/.+\.jpg$/.test(c.image), `${c.id} 图路径异常 ${c.image}`);
  const p = '/Coze/Drive/编程专家/每日六爻/app/' + c.image.replace('./', '');
  if (existsSync(p)) imgOk++; else console.log('❌ 缺图文件', c.image);
  ok(!/undefined|NaN|\[object/.test(JSON.stringify(c)), `${c.id} 脏字符`);
});
ok(imgOk === 78, `真图应78张存在，实际${imgOk}`);

// 倾向表 78 全覆盖
let valCover = 0;
d.cards.forEach(c => { if (Object.prototype.hasOwnProperty.call(RWS_VAL, c.id)) valCover++; else console.log('❌ 倾向表缺', c.id); });
ok(valCover === 78, `倾向表应覆盖78，实际${valCover}`);
// 大牌 08 力量 / 11 正义（RWS 顺序）
const labels = d.cards.filter(c => c.group.includes('大')).map(c => c.id);
ok(/strength/.test(labels[8]) && /justice/.test(labels[11]), 'RWS 8力量11正义');
// 逆位函数
ok(rwsVal('major-19-sun', false) === 2 && rwsVal('major-19-sun', true) < 2, '太阳逆位减分');
ok(rwsVal('major-16-tower', true) > -1, '高塔逆位减苦');
// 花色分布 14×4
['权杖','圣杯','宝剑','星币'].forEach(g => ok(d.cards.filter(c=>c.group===g).length===14, g+'应14张'));

console.log(`牌 ${d.cards.length} / 真图 ${imgOk} / 倾向覆盖 ${valCover}`);
console.log(err === 0 ? '\n✅ RWS 数据+倾向+真图 全部通过' : `\n⛔ ${err} 处错误`);
process.exit(err ? 1 : 0);
