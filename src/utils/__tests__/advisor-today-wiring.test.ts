import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * '오늘 쓸 글 10' 판 배선(D 판, 2026-09-30).
 *
 * 순수 함수·조립 테스트는 판을 잘 만드는지만 본다. 여기는 그 판이 수집 직후 실제로 만들어지고(hook),
 * 실측기는 기존 창구(검색광고 · 자리 실측기 · 에이전트 CLI)를 그대로 잇고, 화면이 그 판을 읽는 길인지 잠근다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

describe("'오늘 쓸 글' 판 배선", () => {
  it('허브가 핸들러를 등록하고, 하루 수집 직후 판을 만들도록 건다', () => {
    const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
    expect(hub).toContain("from './handlers/advisor-today';");
    expect(hub).toContain('setupAdvisorTodayHandlers();');
    const daily = read('src', 'main', 'handlers', 'advisor-daily.ts');
    expect(daily).toContain('export function setAdvisorDailyAfterCollect(');
    expect(daily).toContain('afterCollect(record)');
  });

  it('실측기는 기존 창구를 그대로 잇는다 — 새 판정 규칙 없음', () => {
    const handler = read('src', 'main', 'handlers', 'advisor-today.ts');
    expect(handler).toContain("from '../../utils/advisor/today-build'");
    expect(handler).toContain('buildTodayPlan(');
    expect(handler).toContain('getNaverSearchAdKeywordVolume(');
    expect(handler).toContain('exactSearchAdTotal(');
    expect(handler).toContain("from './seat-measure'");
    expect(handler).toContain('measureKeywords(');
    expect(handler).toContain('collectTodayTitles(');
    expect(handler).toContain('setAdvisorDailyAfterCollect(');
    expect(handler).not.toMatch(/Math\.random/);
    expect(handler).not.toMatch(/brightdata|brightDataFetch/i);
  });

  it('IPC 채널 둘이 핸들러·화면 양쪽에 있고, 안 잰 칸은 미측정으로 찍는다', () => {
    const handler = read('src', 'main', 'handlers', 'advisor-today.ts');
    const html = read('ui', 'keyword-master.html');
    for (const ch of ['advisor-today-view', 'advisor-today-run-now']) {
      expect(handler).toContain("ipcMain.handle('" + ch + "'");
      expect(html).toContain("invoke('" + ch + "'");
    }
    expect(html).toContain('id="advisorTodayBody"');
    expect(html).toContain('refreshAdvisorToday();');
    expect(html).toContain('AI 엔진 연결 전');
  });
});
