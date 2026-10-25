import {pathToFileURL} from 'node:url'; import path from 'node:path';
const APP=process.argv[2];
const STATE=pathToFileURL(path.join(APP,'yz_test/state-stub.mjs')).href;
const hooks=await import('./loader-hooks.mjs'); hooks.register(s=>s.includes('/state.js')?STATE:null);
const {judgeYangzhai}=await import(pathToFileURL(path.join(APP,'js/yangzhai/yangzhai-judge.js')).href);
const B=await import(pathToFileURL(path.join(APP,'vendor/bazhai-core.js')).href);
let bad=0; const ok=(c,m)=>{console.log((c?'✔':'❌'),m); if(!c)bad++;};
// 边界1：24山 坐壬(352.5)向丙 —— 用坐山定宅卦；门在绝命方
let r=judgeYangzhai({mount:{deg:172.5,via:'手动24山'},rooms:{door:[2],master:[2],second:[],living:[],kitchen:[0],bath:[4]},year:{built:2003},person:{g:'m',y:1994},shapes:[]});
ok(r.mount.zuo==='壬'&&r.mount.chao==='丙','24山 坐壬向丙 识别: '+r.mount.zuo+'/'+r.mount.chao);
ok(r.issues.some(i=>i.title.includes('卫生间')&&i.title.includes('中宫')),'中宫卫生间出提示');
ok(r.score.score>=0&&r.score.score<=100,'边界1 分数合法 '+r.score.score);
ok(r.doorVerdict&&r.masterVerdict&&r.kitchenVerdict,'门主灶三断齐全');
// 边界2：女命 1990
const gf=B.lifeGua(1990,'female'); ok(['东四','西四'].includes(B.GROUP_NAME[gf.group]),'1990女命分组正常: '+gf.name+B.GROUP_NAME[gf.group]);
r=judgeYangzhai({mount:{deg:180,via:'手动8方位'},rooms:{door:[8],master:[5],kitchen:[0],second:[],living:[],bath:[]},year:{},person:{g:'f',y:1990},shapes:['明堂开阔','路冲','缺角','临近水体']});
ok(r.shapeVerdicts.length===4,'形势4条全出');
ok(r.shapeVerdicts.some(s=>s.name==='临近水体'&&s.tone==='neutral'),'水体=neutral 不武断吉凶');
ok(r.shapeVerdicts.some(s=>s.name==='路冲'&&s.tone==='bad'),'路冲=bad');
ok(r.shapeVerdicts.some(s=>s.name==='明堂开阔'&&s.tone==='good'),'明堂=good');
// 边界3：缺居住者（不应崩，四吉方仍出）
r=judgeYangzhai({mount:{deg:90},rooms:{door:[8],master:[5],kitchen:[0],second:[],living:[],bath:[]},year:{},person:{g:null,y:null},shapes:[]});
ok(r.person===null&&r.doorVerdict,'无居住者不崩且门主灶仍断');
// 边界4：各角度 8/24 山映射不越界
for(let d=0;d<360;d+=11){const m=B.mountainsAt(d); if(!m.chao||!m.zuo){bad++;console.log('❌ 角度',d,'映射空');}}
ok(true,'0-359 每11° 24山映射均非空');
// 边界5：脏值扫描所有卡片
const r2=judgeYangzhai({mount:{deg:180},rooms:{door:[8],master:[5],kitchen:[0],second:[],living:[],bath:[4]},year:{},person:{g:'m',y:1994},shapes:['路冲','反弓','尖角壁刀','缺角','电梯楼梯冲门','电杆大树正对','背后有靠','明堂开阔','临近水体']});
const blob=JSON.stringify(r2);
ok(!/undefined|NaN|\[object/.test(blob),'全勾选形势 结果无脏值');
console.log(bad?'\n[FAIL]':'\n[PASS] 边界用例全过');
process.exit(bad?1:0);
