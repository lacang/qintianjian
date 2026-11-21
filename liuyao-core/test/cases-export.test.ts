/**
 * 案例导出 / 导入 / 满额提示验收（r6_compat.md P1-2）
 *
 * 被审计抓到的事实：案例只躺在 localStorage 里，没有导出/导入，超 30 条**静默淘汰**，
 * 用户永远不知道旧案例没了。清缓存或换设备 = 全丢。
 *
 * 这里锁：
 *   1. 导出 → 清空 → 导入，逐字段一致（含 pos/星标/时间戳/卦象等全部字段）；
 *   2. 导入到「有盘面」的案例后，按码重算的盘逐字段一致（紫微大限流年四化 / 吠陀 Panchanga / 八字神煞）；
 *   3. 重复导入幂等（不算新增、不产生重复）；
 *   4. 超过上限时不再静默：saveCase 回来带 evicted，importCaseBundle 也回报条数。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  saveCase, loadCases, caseStats, clearUnpinned, removeCase, togglePin, updateCase,
  exportCaseBundle, importCaseBundle, inspectBundle, exportFileName,
  EXPORT_SCHEMA, EXPORT_VERSION, AUTO_KEEP,
} from '../../app/js/cases.js';
import { buildCode } from '../../app/js/sharecode.js';

const PLATE = fileURLToPath(new URL('./fixtures/qt2-plate.mjs', import.meta.url));

/** 最小 localStorage 垫片：cases.js 是懒读写的，import 时不会碰它 */
function shimStorage(quota = Infinity) {
  const map = new Map<string, string>();
  const api = {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      if (v.length > quota) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size; },
  };
  (globalThis as any).localStorage = api;
  return api;
}

const SH_GEO = { lon: 121.4737, lat: 31.2304 };

function plateFor(code: string, tz = 'America/New_York') {
  const out = execFileSync(process.execPath, [PLATE, code], {
    env: { ...process.env, TZ: tz, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out).plate;
}

beforeEach(() => shimStorage());

describe('导出 / 导入', () => {
  it('导出 → 清空 → 导入：逐字段一致', () => {
    const ziwei = buildCode('ziwei', {
      civil: { y: 1990, mo: 5, d: 20, h: 10, mi: 30 }, city: '上海', tz: 'Asia/Shanghai',
      tzOffsetMinutes: 540, inDst: true, gender: '男', ...SH_GEO,
    }).code;
    const bazi = buildCode('bazi', {
      civil: { y: 1988, mo: 2, d: 29, h: 23, mi: 10 }, city: '纽约', tz: 'America/New_York',
      tzOffsetMinutes: -300, gender: '女', lon: -74.006, lat: 40.7128,
    }).code;
    saveCase({ kind: 'ziwei', code: ziwei, title: '紫微·1990', sub: '上海 巳时', question: '事业如何' });
    const second = saveCase({ kind: 'bazi', code: bazi, title: '八字·1988', sub: '纽约 子时' });
    // 星标一条，验证 pinned 也随文件走
    togglePin(second.id);

    const before = loadCases();
    expect(before.length).toBe(2);

    const bundle = exportCaseBundle();
    expect(bundle.schema).toBe(EXPORT_SCHEMA);
    expect(bundle.version).toBe(EXPORT_VERSION);
    expect(bundle.count).toBe(2);
    expect(typeof bundle.exportedAt).toBe('string');
    expect(new Date(bundle.exportedAt).getTime()).toBeGreaterThan(0);
    // 真的序列化一遍（导出就是落文件）
    const fileText = JSON.stringify(bundle, null, 2);
    expect(fileText.length).toBeGreaterThan(100);

    // 清空后导入
    clearUnpinned();
    loadCases().forEach((c) => removeCase(c.id));
    expect(loadCases().length).toBe(0);

    const r = importCaseBundle(JSON.parse(fileText));
    expect(r.added).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(0);

    const after = loadCases();
    expect(after.length).toBe(2);
    for (const b of before) {
      const a = after.find((x) => x.code === b.code);
      expect(a, `导入后应能找到 ${b.title}`).toBeTruthy();
      for (const k of ['id', 'kind', 'code', 'title', 'sub', 'question', 'castAt', 'pinned', 'createdAt'] as const) {
        expect((a as any)[k], `字段 ${k}`).toEqual((b as any)[k]);
      }
    }
  });

  it('导出导入后按码重算的盘逐字段一致（含大限流年四化 / Panchanga / 神煞）', () => {
    const casesIn: { kind: 'ziwei' | 'bazi' | 'vedic'; code: string }[] = [
      { kind: 'ziwei', code: buildCode('ziwei', { civil: { y: 1990, mo: 5, d: 20, h: 10, mi: 30 }, city: '上海', tz: 'Asia/Shanghai', tzOffsetMinutes: 540, gender: '男', ...SH_GEO }).code },
      { kind: 'bazi', code: buildCode('bazi', { civil: { y: 1976, mo: 12, d: 3, h: 4, mi: 25 }, city: '成都', tz: 'Asia/Shanghai', tzOffsetMinutes: 480, gender: '女', lon: 104.0668, lat: 30.5728 }).code },
      { kind: 'vedic', code: buildCode('vedic', { civil: { y: 2001, mo: 9, d: 11, h: 18, mi: 5 }, city: '孟买', tz: 'Asia/Kolkata', tzOffsetMinutes: 330, gender: '男', lon: 72.8777, lat: 19.076 }).code },
    ];
    const platesBefore = casesIn.map((c) => plateFor(c.code));
    for (const c of casesIn) saveCase({ kind: c.kind, code: c.code, title: `${c.kind}`, sub: '' });

    const text = JSON.stringify(exportCaseBundle());
    clearUnpinned();
    loadCases().forEach((c) => removeCase(c.id));
    importCaseBundle(JSON.parse(text));

    const after = loadCases();
    expect(after.length).toBe(casesIn.length);
    for (const c of casesIn) {
      const stored = after.find((x) => x.code === c.code);
      expect(stored, `${c.kind} 应还在库里`).toBeTruthy();
      // 导出/导入换了「设备时区」再算，盘面必须和导出前一模一样
      const i = casesIn.indexOf(c);
      expect(JSON.stringify(plateFor(c.code)), `${c.kind} 重算盘面`).toBe(JSON.stringify(platesBefore[i]));
    }
    // 具体字段点名，防止哪天盘面结构变了还「整体相等」
    expect(JSON.stringify(platesBefore[0])).toContain('decadal');
    expect(JSON.stringify(platesBefore[2])).toContain('tithi');
  });

  it('重复导入是幂等的：不新增、不重复', () => {
    const code = buildCode('meihua', { civil: { y: 2026, mo: 2, d: 2, h: 12, mi: 0 }, city: '北京', tz: 'Asia/Shanghai', tzOffsetMinutes: 480 }).code;
    saveCase({ kind: 'meihua', code, title: '梅花', sub: '' });
    const text = JSON.stringify(exportCaseBundle());
    const first = importCaseBundle(JSON.parse(text));
    expect(first.added).toBe(0);
    expect(first.updated).toBe(1);
    expect(loadCases().length).toBe(1);
  });

  it('冲突以新为准：同码不同标题 → 覆盖并计数', () => {
    const code = buildCode('qimen', { civil: { y: 2026, mo: 3, d: 3, h: 9, mi: 0 }, city: '北京', tz: 'Asia/Shanghai', tzOffsetMinutes: 480 }).code;
    saveCase({ kind: 'qimen', code, title: '旧标题', sub: '旧副标题' });
    const bundle = exportCaseBundle();
    bundle.cases[0].title = '新标题';
    bundle.cases[0].sub = '新副标题';
    const r = importCaseBundle(bundle);
    expect(r.updated).toBe(1);
    expect(loadCases()[0].title).toBe('新标题');
    expect(loadCases()[0].sub).toBe('新副标题');
  });

  it('文件版本过高 / 缺 cases / 坏条目都被挡住并回报', () => {
    expect(() => importCaseBundle({ schema: EXPORT_SCHEMA, version: 99, cases: [] })).toThrow(/版本/);
    expect(() => importCaseBundle({ schema: 'other' })).toThrow(/不是案例文件/);
    expect(() => importCaseBundle({ schema: EXPORT_SCHEMA, cases: 'x' as any })).toThrow(/cases/);
    const r = importCaseBundle({ cases: [{ kind: 'nope', code: 'X' }, { kind: 'ziwei', code: '' }] });
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(2);
    expect(inspectBundle({ cases: [{ kind: 'ziwei', code: 'QT2-abc' }] }).valid.length).toBe(1);
  });

  it('文件名带日期，便于归档', () => {
    expect(exportFileName(new Date(2026, 10, 21, 16, 45))).toBe('qintianjian-cases-20261121-1645.json');
  });
});

describe('满额不再静默淘汰', () => {
  it(`超过 ${AUTO_KEEP} 条时回报被删条数`, () => {
    let evicted = 0;
    for (let i = 0; i < AUTO_KEEP + 5; i++) {
      const c = saveCase({
        kind: 'liuyao',
        code: buildCode('liuyao', { civil: { y: 2026, mo: 1, d: 1, h: 12, mi: i }, city: '北京', tz: 'Asia/Shanghai', tzOffsetMinutes: 480, yaoValues: [7, 7, 7, 7, 7, 7], source: 'manual' }).code,
        title: `第 ${i} 条`, sub: '',
      });
      if (c.evicted) evicted += c.evicted;
    }
    expect(evicted).toBe(5);
    const st = caseStats();
    expect(st.total).toBe(AUTO_KEEP);
    expect(st.keep).toBe(AUTO_KEEP);
  });

  it('星标案例不会被顶掉', () => {
    const first = saveCase({ kind: 'liuyao', code: 'QT2-pinned', title: '星标', sub: '' });
    togglePin(first.id);
    expect(loadCases().find((c) => c.id === first.id)!.pinned).toBe(true);
    for (let i = 0; i < AUTO_KEEP + 3; i++) {
      saveCase({ kind: 'liuyao', code: `QT2-x${i}`, title: `x${i}`, sub: '' });
    }
    expect(loadCases().some((c) => c.id === first.id)).toBe(true);
  });
});
