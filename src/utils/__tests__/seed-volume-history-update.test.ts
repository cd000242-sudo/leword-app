import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { updateHistoryFile } = require('../../../scripts/seed-volume-history-update');
const store = require('../../../scripts/today-picks-volume-history');

/*
 * 오늘의 추천 정렬용 검색량 이력(2026-11-08) — 작업이 돌 때마다 씨앗 창고의 오늘 값을 한 점씩 보탠다.
 * 관측일은 시계가 아니라 창고의 builtAt(KST)이다: 재구축이 실패해 옛 창고가 남았을 때 그것을 오늘 값으로 적지 않는다.
 */
let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'volume-history-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const seedsPath = () => path.join(dir, 'seed-db.json');
const historyPath = () => path.join(dir, 'history', 'seed-volume-history.json');
const writeDb = (builtAt: string, seeds: unknown[]) => fs.writeFileSync(seedsPath(), JSON.stringify({ builtAt, seeds }), 'utf8');
const now = new Date('2026-11-08T03:00:00Z');
const read = () => JSON.parse(fs.readFileSync(historyPath(), 'utf8'));

describe('검색량 이력 갱신', () => {
  it('다음 달·두 달·석 달 뒤 피크 씨앗만 한 점씩 적고, 폴더가 없어도 만든다', () => {
    writeDb('2026-11-08T00:00:00Z', [
      { keyword: '난방비', searchVolume: 9000, source: 'month:12' },
      { keyword: '설날선물', searchVolume: 5000, source: 'month:1' },
      { keyword: '입춘', searchVolume: 800, source: 'month:2' },
      { keyword: '김장', searchVolume: 70000, source: 'month:11' },
      { keyword: '날씨', searchVolume: 3000000, source: 'section:세계여행' },
    ]);
    const result = updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now });
    expect(result).toMatchObject({ entries: 3, changed: true });
    const day = store.kstDayNumber(Date.parse('2026-11-08T00:00:00Z'));
    expect(read().entries).toEqual({ 난방비: [[day, 9000]], 설날선물: [[day, 5000]], 입춘: [[day, 800]] });
  });
  it('같은 날 다시 돌려도 파일이 바뀌지 않는다', () => {
    writeDb('2026-11-08T00:00:00Z', [{ keyword: '난방비', searchVolume: 9000, source: 'month:12' }]);
    updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now });
    const first = fs.readFileSync(historyPath(), 'utf8');
    const again = updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now });
    expect(again.changed).toBe(false);
    expect(fs.readFileSync(historyPath(), 'utf8')).toBe(first);
  });
  it('이틀 뒤 창고는 새 점으로 이어 붙는다', () => {
    writeDb('2026-11-08T00:00:00Z', [{ keyword: '난방비', searchVolume: 9000, source: 'month:12' }]);
    updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now });
    writeDb('2026-11-10T00:00:00Z', [{ keyword: '난방비', searchVolume: 12000, source: 'month:12' }]);
    updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now });
    expect(read().entries['난방비'].map((p: number[]) => p[1])).toEqual([9000, 12000]);
  });
  it('재구축이 실패해 남은 옛 창고는 오늘 값으로 적지 않는다', () => {
    writeDb('2026-11-10T00:00:00Z', [{ keyword: '난방비', searchVolume: 12000, source: 'month:12' }]);
    updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now });
    const first = fs.readFileSync(historyPath(), 'utf8');
    writeDb('2026-11-01T00:00:00Z', [{ keyword: '난방비', searchVolume: 100, source: 'month:12' }]);
    expect(updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now }).changed).toBe(false);
    expect(fs.readFileSync(historyPath(), 'utf8')).toBe(first);
  });
  it('깨진 이력 파일은 새로 시작한다 (던지지 않는다)', () => {
    fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
    fs.writeFileSync(historyPath(), '{깨짐', 'utf8');
    writeDb('2026-11-08T00:00:00Z', [{ keyword: '난방비', searchVolume: 9000, source: 'month:12' }]);
    expect(updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now }).entries).toBe(1);
  });
  it('창고를 못 읽으면 던진다 — 워크플로가 이 단계만 실패로 보고 회차는 이어 간다', () => {
    expect(() => updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now })).toThrow();
    fs.writeFileSync(seedsPath(), '{"seeds": 3}', 'utf8');
    expect(() => updateHistoryFile({ seedsPath: seedsPath(), historyPath: historyPath(), now })).toThrow('씨앗 창고');
  });
});
