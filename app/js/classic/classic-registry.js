// classic-registry.js — 经典内容包注册表（纯函数，无 DOM、无网络）
//
// 「观心」是内容渲染器，不是《论语》页面。本文件决定当前有哪些经典可读。
// 接入第二套经典（道德经 / 庄子 …）只需两步：
//   1. 内容库侧产出同构数据包（见 classic-schema.js 的契约）
//   2. 在此 register 一下
// 产品层（八层详情、关系权限、孤立回退、辩一辩、主题探索）不需要任何改动。
//
// 董事长 2026-10-31 批示第五部分第 3 条：跨经典关联必须重新审核依据，
// 不得仅因标签相同就宣称思想传承。因此本表只做「并列」，不做跨包关系推导。

import { LUNYU } from './lunyu-data.js';
import { validateClassic, packCapabilities } from './classic-schema.js';

const REGISTRY = new Map();
let ACTIVE = null;

/** 注册一个内容包。契约不合格时不注册，并把错误抛给调用方（显式失败，不静默降级） */
export function registerClassic(pack) {
  const errs = validateClassic(pack);
  if (errs.length) {
    const e = new Error(`内容包 ${pack && pack.meta ? pack.meta.classic : '(未知)'} 不符合契约：${errs.join('；')}`);
    e.details = errs;
    throw e;
  }
  const id = pack.meta.classic;
  REGISTRY.set(id, pack);
  if (!ACTIVE) ACTIVE = id;
  return pack;
}

export function listClassics() {
  return [...REGISTRY.entries()].map(([id, p]) => ({
    id,
    name: p.meta.name,
    version: p.meta.version,
    status: p.meta.status,
    capabilities: packCapabilities(p),
  }));
}

export function getClassic(id) {
  return REGISTRY.get(id) || null;
}

export function activeClassic() {
  return ACTIVE ? REGISTRY.get(ACTIVE) : null;
}

export function setActiveClassic(id) {
  if (!REGISTRY.has(id)) return false;
  ACTIVE = id;
  return true;
}

// 首套内容：《论语》。契约校验在模块加载时执行一次，不合格即抛错，
// 避免带着坏数据进产品（这类错误必须早暴露，不能等用户点到才崩）。
registerClassic(LUNYU);
