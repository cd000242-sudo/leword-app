import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 순위 실측의 중간 저장(2026-09-11).
 *
 * 실측한 사고(userData/blog-class/latest.json, 2026-09-10T11:00Z, leadernam-):
 *   글 200개는 저장됐는데 **wonRows 도 envelope 도 없다.**
 *   1단계(사실 카드)는 writeRecord 로 먼저 저장되고, 2단계(순위→봉투)는 **다 끝난 뒤에만** 저장된다.
 *   200개 표본이면 검색량 조회 120회 + 순위 실측 80건(건당 약 2초, 직렬·1.2~1.8초 대기) 이라
 *   한 회차가 몇 분이다. 그 사이 앱을 닫거나 오류가 나면 잰 것이 통째로 사라진다.
 *   그래서 '오늘 쓸 한 편'의 내 크기가 계속 빈칸이었다.
 *
 * 규칙: 잰 줄이 생기는 대로 저장한다. 몇 분을 기다리다 끊긴 사람도 그때까지 잰 것은 갖는다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
const rank = read('src', 'main', 'handlers', 'blog-class-rank.ts');
const handler = read('src', 'main', 'handlers', 'blog-class.ts');

describe('잰 줄이 생기는 대로 저장한다', () => {
  it('순위 단계가 중간 결과를 밖으로 알린다', () => {
    expect(rank).toContain('onRows?:');
    // 순위를 한 줄 잰 직후, 그리고 문서수를 채운 직후 두 곳에서 알려야 한다
    expect((rank.match(/onRows\?\.\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('핸들러가 그 알림을 받아 기록에 담고 저장한다', () => {
    expect(handler).toContain('onRows:');
    expect(handler).toContain('buildEnvelope');
    // 봉투도 그 자리에서 다시 만든다 — 순위만 저장하고 봉투를 비워 두면 화면이 여전히 빈칸이다
    expect(handler).toMatch(/record\.envelope = buildEnvelope\(/);
  });

  it('저장을 매 줄마다 하지 않는다 — 60KB 기록을 80번 쓰지 않는다', () => {
    expect(handler).toMatch(/PARTIAL_SAVE_MS|lastPartialAt|partialSavedAt/);
  });

  it('끝나고 한 번은 반드시 저장한다 — 마지막 줄이 잘리지 않게', () => {
    // 2단계 뒤의 writeRecord 는 그대로 남아 있어야 한다
    const after = handler.slice(handler.indexOf('record.rankSummary = ranked.summary;'));
    expect(after).toContain('writeRecord(record)');
  });
});

describe('부분 저장이 판을 망치지 않는다', () => {
  it('문서수를 아직 못 채운 중간 봉투는 buildEnvelope 가 스스로 null 로 막는다', () => {
    const env = read('src', 'utils', 'blog-class', 'envelope.ts');
    expect(env).toContain('if (docs.length === 0) return null;');
  });
});
