import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 어드바이저 하루 수집기 배선(A 층, 2026-09-30).
 *
 * 순수 함수 테스트(advisor-daily.test.ts)는 판을 잘 만드는지만 본다. 여기는 그 판을 만드는 핸들러가
 * 실제로 허브에 등록되고 스케줄러가 켜지고 꺼지는지, 저장 판에 계정 아이디가 새지 않는 길인지 잠근다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

describe('어드바이저 하루 수집기 배선', () => {
  it('핸들러·스케줄러가 허브에 등록되고 닫을 때 멈춘다', () => {
    const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
    expect(hub).toContain("from './handlers/advisor-daily';");
    expect(hub).toContain('setupAdvisorDailyHandlers();');
    expect(hub).toContain('startAdvisorDailyScheduler();');
    expect(hub).toContain('stopAdvisorDailyScheduler();');
  });

  it('로그인 세션 창구만 쓰고, 판은 순수 모듈이 만든다', () => {
    const handler = read('src', 'main', 'handlers', 'advisor-daily.ts');
    expect(handler).toContain("from './naver-session'");
    expect(handler).toContain("from '../../utils/advisor/daily-plan'");
    expect(handler).toContain("from '../../utils/advisor/daily-summary'");
    expect(handler).toContain('buildDailyRecord(');
    expect(handler).toContain('pickBlogChannelId(');
    // 어제 통계가 채워지는 새벽 차례 뒤 한 번 — 자리 감시와 같은 판정기.
    expect(handler).toContain("from '../../utils/seat-watch'");
    expect(handler).toContain('isWatchDue(');
    expect(handler).not.toMatch(/nid\.naver\.com/);
    expect(handler).not.toMatch(/brightdata|brightDataFetch/i);
  });

  it('IPC 채널 둘이 핸들러·화면 양쪽에 있고, 화면은 모달을 열 때 판을 읽는다', () => {
    const handler = read('src', 'main', 'handlers', 'advisor-daily.ts');
    const html = read('ui', 'keyword-master.html');
    for (const ch of ['advisor-daily-view', 'advisor-daily-run-now']) {
      expect(handler).toContain("ipcMain.handle('" + ch + "'");
      expect(html).toContain("invoke('" + ch + "'");
    }
    expect(html).toContain('id="advisorDailyBody"');
    expect(html).toContain('refreshAdvisorDaily();');
    // 못 받은 창구는 0 이 아니라 '미측정' — 추정치를 사실처럼 찍지 않는다.
    expect(html).toContain("td('미측정'");
  });
});
