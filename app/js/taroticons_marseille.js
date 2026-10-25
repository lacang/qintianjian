// 马赛塔罗 22 张大阿卡纳 · 古典木刻风线稿（自绘，钦天监）
// 统一 viewBox 0 0 64 64；描边用 currentColor，背景由牌面 CSS 控制。
// 风格：17–18 世纪法国木刻纸牌单线白描，几何化、小尺寸可辨；据公有领域图像志自绘，
//      不复制 Flornoy/Camoin/Marteau 等任何现代复原版的受版权画面。

const T = {
  // 星花（八角星）
  star: (cx, cy, r) => `<path d="M${cx} ${cy-r} L${cx+r*0.22} ${cy-r*0.22} L${cx+r} ${cy} L${cx+r*0.22} ${cy+r*0.22} L${cx} ${cy+r} L${cx-r*0.22} ${cy+r*0.22} L${cx-r} ${cy} L${cx-r*0.22} ${cy-r*0.22} Z"/>`,
  face: (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>` +
    `<path d="M${cx-r*0.4} ${cy+r*0.1} h.1 M${cx+r*0.4} ${cy+r*0.1} h.1 M${cx-r*0.25} ${cy+r*0.5} q${r*0.25} ${r*0.2} ${r*0.5} 0"/>`
};

export const TAROT_MARSEILLE_ICONS = {
  // 0 愚者：花帽扛棍行脚人 + 小狗 + 崖
  0: `<path d="M10 52 L24 52 L30 40 L34 52 L54 52"/>
      <circle cx="30" cy="18" r="6"/>
      <path d="M24 15 q6-9 13-3 M24 14 l-4-4 M36 13 l5-3"/>
      <path d="M24 25 q6 5 12 0 l4 22 M30 27 l0 20 M26 47 l-4 7 M34 47 l5 6"/>
      <path d="M34 22 L48 10 M48 10 l5 2 l-5 3 Z"/>
      <path d="M14 44 q-6 0-6-6 q5 1 6 5 Z M8 39 l-4-2"/>`,
  // I 魔术师：桌后举杖指天、一手指地 + 桌上杯币刀
  1: `<path d="M14 38 L50 38 L46 46 L18 46 Z"/>
      <circle cx="32" cy="18" r="5"/>
      <path d="M22 46 v8 M42 46 v8"/>
      <path d="M26 24 q6-6 12 0 l3 14 H23 Z"/>
      <path d="M31 23 L24 9 M33 23 L40 31"/>
      <path d="M22 34 v5 M30 32 l2 6 M38 33 l-5 5"/>`,
  // II 女教皇：三重冕 + 面纱 + 书卷
  2: `<circle cx="32" cy="16" r="6"/>
      <path d="M25 14 q7-7 14 0 M26 11 h12 M32 7 v3"/>
      <path d="M24 24 q8 6 16 0 l4 24 H20 Z"/>
      <rect x="25" y="34" width="14" height="9" rx="1"/>
      <path d="M28 37 h8 M28 40 h6"/>
      <path d="M20 48 q12 5 24 0"/>`,
  // III 女皇：冠 + 鹰头杖 + 盾徽
  3: `<circle cx="32" cy="15" r="5.5"/>
      <path d="M27 12 l2-6 3 3 3-3 2 6 M28 11 h8"/>
      <path d="M24 23 q8 6 16 0 l4 25 H20 Z"/>
      <path d="M22 48 l10-6 10 6"/>
      <path d="M40 26 v18 M42 28 l3-2 M40 32 l4 1"/>
      <path d="M25 38 l4-2 v8 l-4 2 Z"/>`,
  // IIII 皇帝：须 + 冠 + 交叉腿 + 杖盾
  4: `<circle cx="32" cy="15" r="6"/>
      <path d="M26 10 l2-5 4 3 4-3 2 5 M27 12 h10"/>
      <path d="M28 19 q4 3 8 0 M29 21 q3 3 6 0"/>
      <path d="M23 25 q9 6 18 0 l4 24 H19 Z"/>
      <path d="M26 48 l6-12 6 12 M32 36 v12"/>
      <path d="M22 28 v18 M42 30 l-4 4 v8 l4 3 Z"/>`,
  // V 教皇：三重冕十字杖 + 两跪僧
  5: `<circle cx="32" cy="13" r="5"/>
      <path d="M26 12 q6-6 12 0 M27 9 h10 M32 6 v3 M32 12 v2"/>
      <path d="M25 20 q7 5 14 0 l3 20 H22 Z"/>
      <path d="M38 22 v18 M36 25 l4-2 M38 30 l4 1"/>
      <path d="M16 48 v-7 q-5-1-5-6 q5-1 6 4 v9 Z M13 34 l-3-3"/>
      <path d="M48 48 v-7 q5-1 5-6 q-5-1-6 4 v9 Z M51 34 l3-3"/>
      <path d="M14 48 h36"/>`,
  // VI 恋人：一男两女 + 丘比特
  6: `<circle cx="20" cy="26" r="4.5"/><path d="M14 46 q6-6 12 0 l1 8 H13 Z"/>
      <circle cx="44" cy="26" r="4.5"/><path d="M38 46 q6-6 12 0 l1 8 H37 Z"/>
      <circle cx="32" cy="30" r="5"/><path d="M25 50 q7-7 14 0 l1 8 H24 Z"/>
      <path d="M25 32 l-4 8 M39 32 l4 8"/>
      <path d="M27 14 q5-6 10 0 l-2 4 h-6 Z M32 8 v2 M30 18 l-4 5 M34 18 l4 5"/>
      ${T.star(32, 8, 2)}`,
  // VII 战车：方车 + 星冠驭者 + 两斯芬克斯
  7: `<path d="M16 30 h32 v18 H16 Z M20 30 v-8 h24 v8"/>
      <circle cx="32" cy="20" r="4.5"/>
      <path d="M27 18 l2-5 3 2 3-2 2 5 M27 26 q5 4 10 0"/>
      <path d="M22 48 v-6 M42 48 v-6"/>
      <path d="M12 52 q4-8 12-6 q-3 5-4 8 Z M16 48 l-4 3"/>
      <path d="M52 52 q-4-8-12-6 q3 5 4 8 Z M48 48 l4 3"/>
      <path d="M24 22 h16"/>`,
  // VIII 正义：正坐女 + 直剑 + 天平
  8: `<circle cx="32" cy="14" r="5.5"/>
      <path d="M27 11 l2-4 3 2 3-2 2 4 M28 10 h8"/>
      <path d="M25 21 q7 5 14 0 l4 26 H21 Z"/>
      <path d="M23 47 h18"/>
      <path d="M23 24 v16 M21 22 h4"/>
      <path d="M41 24 v8 M36 32 h10 M37 32 v2 q0 2-2 2 q-2 0-2-2 v-2 M49 32 v2 q0 2-2 2 q-2 0-2-2 v-2"/>`,
  // VIIII 隐士：长须披氅老者 + 六角星灯 + 杖
  9: `<circle cx="28" cy="18" r="5.5"/>
      <path d="M24 22 q4 6 8 0 l1 3"/>
      <path d="M21 27 q9 7 14 0 l5 23 H17 Z"/>
      <path d="M40 18 h10 l-2 8 h-6 Z M45 18 v8 M43 22 h4"/>
      ${T.star(45, 22, 1.6)}
      <path d="M18 30 v20 M16 50 h5"/>`,
  // X 命运轮：大轮 + 顶斯芬克斯 + 下兽 + 攀轮兽
  10: `<circle cx="32" cy="34" r="16"/><circle cx="32" cy="34" r="5"/>
       <path d="M32 18 v5 M32 45 v5 M16 34 h5 M43 34 h5 M21 23 l4 4 M39 41 l4 4 M43 23 l-4 4 M25 41 l-4 4"/>
       <path d="M27 16 q5-6 10 0 M28 14 l2 3 M34 13 l3 3"/>
       <path d="M24 48 q-3 4 0 7 q5 1 6-3 Z M21 55 h12"/>
       <path d="M20 30 q-5 1-6 7 q4-1 6-4 Z"/>`,
  // XI 力量：花冠女启狮口
  11: `<circle cx="26" cy="20" r="5.5"/>
       <path d="M21 18 q5-7 10 0 M21 18 q-1 4 2 6 M31 18 q1 4-2 6"/>
       <path d="M22 26 q6 5 11 0 l3 20 H20 Z"/>
       <path d="M34 40 q12-8 18 2 q3 7-4 12 q-10 4-16-4 q-2-6 2-10 Z"/>
       <path d="M34 40 l6-4 M52 38 q4-2 4 2 M50 42 q3 2 2 6 M44 50 q-3 1-4-2"/>`,
  // XII 倒吊人：T 架倒悬
  12: `<path d="M14 12 h28 M42 12 v8 M14 12 v40"/>
       <path d="M42 20 q-2 8-8 10 q-5 3-6 10"/>
       <circle cx="29" cy="42" r="5"/>
       <path d="M24 38 l-5-5 M34 38 l5-5 M25 47 l-6 7 M33 47 l6 7"/>
       <path d="M21 31 l-4 2 M37 31 l4 2"/>`,
  // XIII 死神：持镰骷髅收割 + 人头残肢
  13: `<circle cx="34" cy="18" r="7"/>
       <path d="M30 16 h.1 M38 16 h.1 M31 21 q3 3 6 0 M28 13 q6-5 12 0"/>
       <path d="M28 26 l-4 24 h16 l-4-24 Z"/>
       <path d="M30 30 L14 14 M14 14 q-6 0-6 6 M13 15 v-7"/>
       <circle cx="18" cy="50" r="3.5"/><path d="M14 55 h8"/>
       <circle cx="46" cy="51" r="3"/><path d="M42 55 h8"/>`,
  // XIIII 节制：有翼天使双足踏水陆 + 双杯倾水
  14: `<path d="M24 14 q-7 2-8 10 M40 14 q7 2 8 10"/>
       <circle cx="32" cy="20" r="5.5"/>
       <path d="M26 26 q6 5 12 0 l4 22 H22 Z"/>
       <path d="M24 30 l-7 4 M40 30 l7 4"/>
       <path d="M16 33 h-4 v7 h4 Z M48 33 h4 v7 h-4 Z"/>
       <path d="M17 40 q2 5 0 8 M47 40 q-2 5 0 8"/>
       <path d="M12 50 q20 5 40 0"/>`,
  // XV 恶魔：角翼魔王举火炬 + 两被链者
  15: `<path d="M22 16 l-8-6 M42 16 l8-6"/>
       <path d="M24 12 q8-8 16 0 l4 8 q-2 12-12 12 q-10 0-12-12 Z"/>
       <path d="M26 12 l-2-6 M38 12 l2-6"/>
       <circle cx="28" cy="20" r="1.4"/><circle cx="36" cy="20" r="1.4"/>
       <path d="M29 25 q3 2 6 0"/>
       <path d="M24 32 v16 M40 30 v14 M40 32 l6-2 M46 30 v-5 M45 22 q4 0 3 5"/>
       <circle cx="20" cy="40" r="4"/><path d="M15 52 q5-5 10 0 v6 H15 Z"/>
       <circle cx="44" cy="40" r="4"/><path d="M39 52 q5-5 10 0 v6 H39 Z"/>
       <path d="M18 44 q14 5 28 0"/>`,
  // XVI 高塔：雷击塔 + 冠飞 + 坠人
  16: `<path d="M24 52 V16 l8-8 8 8 v36"/>
       <path d="M24 16 h16 M24 30 h16 M28 52 V34 h8 v18"/>
       <path d="M32 2 L18 22 L30 22 L24 40 L46 16 L34 16 Z"/>
       <path d="M24 8 l-6-5 M40 8 l6-5"/>
       <circle cx="16" cy="44" r="3.5"/><path d="M12 52 l8-4 M14 40 l-4-6"/>
       <circle cx="50" cy="46" r="3.5"/><path d="M46 54 l8-4 M48 42 l5-5"/>`,
  // XVII 星：裸女倾双壶 + 大八角星七小星
  17: `<circle cx="28" cy="30" r="4.5"/>
       <path d="M25 35 q5 4 8 0 l2 16 H22 Z"/>
       <path d="M26 44 l-7 8 M33 42 l7 4 M19 52 q4 2 0 5 M40 46 q5 0 4 5"/>
       ${T.star(32, 12, 6)}${T.star(18, 18, 2.4)}${T.star(46, 18, 2.4)}${T.star(24, 8, 2)}${T.star(40, 8, 2)}${T.star(14, 28, 1.8)}${T.star(50, 28, 1.8)}${T.star(32, 22, 1.8)}
       <path d="M10 54 q22 4 44 0"/>`,
  // XVIII 月：圆脸月 + 双塔双兽吠 + 螯虾
  18: `<circle cx="32" cy="16" r="9"/>
       <path d="M29 15 h.1 M35 15 h.1 M30 19 q2 2 4 0 M26 12 q-2-4 2-6 M38 12 q2-4-2-6"/>
       <path d="M20 28 h4 v14 h-4 Z M40 28 h4 v14 h-4 Z"/>
       <path d="M18 46 q-5 0-5-6 q5 1 6 5 Z M14 41 l-4-3"/>
       <path d="M46 46 q5 0 5-6 q-5 1-6 5 Z M50 41 l4-3"/>
       <path d="M26 54 q6-4 12 0 M28 50 q4-4 8 0 M30 47 l3-4 M34 47 l3-4"/>`,
  // XVIIII 太阳：日轮放射 + 矮墙 + 双童
  19: `<circle cx="32" cy="17" r="8"/>
       <g stroke-width="2">${[0,22,45,67,90,112,135,157,180,202,225,247,270,292,315,337].map(a=>{const rad=a*Math.PI/180;return `<line x1="${32+10*Math.cos(rad)}" y1="${17+10*Math.sin(rad)}" x2="${32+14*Math.cos(rad)}" y2="${17+14*Math.sin(rad)}"/>`}).join('')}</g>
       <path d="M12 40 h40 M14 40 v8 M22 40 v8 M30 40 v8 M38 40 v8 M46 40 v8"/>
       <circle cx="24" cy="48" r="4"/><path d="M19 56 q5-6 10 0 v4 H19 Z"/>
       <circle cx="40" cy="48" r="4"/><path d="M35 56 q5-6 10 0 v4 H35 Z"/>`,
  // XX 审判：云中天使吹号角 + 三复活者
  20: `<path d="M16 22 h32 l4 8 H12 Z"/>
       <circle cx="32" cy="14" r="4"/><path d="M27 10 q5-6 10 0"/>
       <path d="M24 22 q-6 2-7 9 M40 22 q6 2 7 9"/>
       <path d="M32 22 v10 M30 28 l-9-2 M30 29 l-9 2 M21 26 v4"/>
       <path d="M21 30 l-3 1 M21 30 l-3-1 M21 26 h6"/>
       <circle cx="20" cy="46" r="3.5"/><path d="M15 56 q5-8 10 0 v4 H15 Z"/>
       <circle cx="32" cy="44" r="3.5"/><path d="M27 56 q5-8 10 0 v4 H27 Z"/>
       <circle cx="44" cy="46" r="3.5"/><path d="M39 56 q5-8 10 0 v4 H39 Z"/>`,
  // XXI 世界：花环 + 中央披巾人 + 四角活物
  21: `<ellipse cx="32" cy="32" rx="15" ry="19"/>
       <circle cx="32" cy="22" r="5"/><path d="M27 28 q5 4 10 0 l2 18 H25 Z"/>
       <path d="M26 46 l-6 8 M38 46 l6 8 M29 28 l-3-6 M35 28 l3-6"/>
       <path d="M12 8 q3-2 4 3 q-4 1-4-3 Z M9 11 h8 M11 6 q0 5 4 6"/>
       <path d="M52 8 q-3-2-4 3 q4 1 4-3 Z M47 11 h8 M53 6 q0 5-4 6"/>
       <path d="M12 56 q3 2 4-3 q-4-1-4 3 Z M9 53 h8"/>
       <path d="M52 56 q-3 2-4-3 q4-1 4 3 Z M47 53 h8"/>`
};

export function marseilleIcon(id) { return TAROT_MARSEILLE_ICONS[id] || ''; }
