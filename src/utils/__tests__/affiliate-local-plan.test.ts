import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_SCRIPT_FILES,
  buildAffiliatePlan,
  isAffiliateRunDue,
  readAffiliateOutcome,
} from '../affiliate-local-plan';

/**
 * 제휴 수집을 앱이 대신 돌린다 (2026-09-16).
 *
 * 사장님 "매일마다 로그인해야되는거네". 매일 로그인해야 하는 구조는 아닌데, 지금 구조가 그렇게 만든다 —
 * 갱신이 사장님 PC 수동 실행이라 아무도 안 돌리면 쿠키가 방치돼 만료되고, 끊긴 걸 10일간 아무도 몰랐다
 * (2026-09-16 실측: 수집 241시간 전, 표의 '바로쓰기'가 0개).
 *
 * 그래서 앱이 하루 한 번 돌린다. 세션이 살아 있으면 계속 연장돼 로그인할 일이 거의 없고,
 * 정말 끊겼을 때만 알림을 띄워 그때 한 번 로그인하면 된다.
 *
 * 걸림돌: 수집기(Codex 소관, 수정 금지)가 쿠키 프로필을 `scripts/../tmp/affiliate-profile` 로 박아 뒀다.
 * 설치판에서 scripts 는 app.asar 안이라 쓸 수 없다. 그래서 **스크립트 묶음을 앱 데이터 폴더로 복사해
 * 거기서 돌린다** — `__dirname/../tmp` 가 앱 폴더로 잡혀 쿠키가 남는다. 파일은 한 줄도 안 고친다.
 */

describe('제휴 자동 실행 계획', () => {
  it('설치판에서 돌리려면 이 스크립트들이 함께 있어야 한다', () => {
    // 하나라도 빠지면 자식 프로세스가 require 에서 죽는다 — 목록을 코드로 잠근다.
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-refresh.js');
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-campaigns.js');
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-campaigns-parse.js');
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-snapshot.js');
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-login-session.js');
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-ai-titles.js');
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-recommendation.mjs');
    expect(AFFILIATE_SCRIPT_FILES).toContain('affiliate-enrich.js');
  });

  it('앱 폴더에 복사한 스크립트를 부르고, 사이트 발행은 하지 않는다', () => {
    const plan = buildAffiliatePlan({ workDir: 'C:\\data\\affiliate', siteRepo: null });
    expect(plan.stages.map((stage) => stage.key)).toEqual(['collect', 'enrich']);
    const collect = plan.stages[0];
    expect(collect.script).toBe('C:\\data\\affiliate\\scripts\\affiliate-refresh.js');
    // 발행(--publish)은 앱이 하지 않는다 — 사이트 레포 커밋은 사람이 확인하고 한다.
    expect(collect.args).not.toContain('--publish');
    const enrich = plan.stages[1];
    expect(enrich.script).toBe('C:\\data\\affiliate\\scripts\\affiliate-enrich.js');
    expect(enrich.args.some((arg) => arg.startsWith('--in='))).toBe(true);
  });

  it('사이트 레포를 알면 그쪽으로 내보내고, 모르면 앱 폴더에만 둔다', () => {
    const withRepo = buildAffiliatePlan({ workDir: 'C:\\data\\affiliate', siteRepo: 'D:\\naver' });
    expect(withRepo.env.NAVER_SITE_REPO).toBe('D:\\naver');
    const withoutRepo = buildAffiliatePlan({ workDir: 'C:\\data\\affiliate', siteRepo: null });
    expect(withoutRepo.env.NAVER_SITE_REPO).toBeUndefined();
  });

  it('하루 한 번만 돈다 — 오늘 이미 돌았으면 안 돈다', () => {
    const now = Date.parse('2026-09-17T20:05:00+09:00');
    expect(isAffiliateRunDue(null, now)).toBe(true);
    expect(isAffiliateRunDue('2026-09-16T23:00:00+09:00', now)).toBe(true);
    expect(isAffiliateRunDue('2026-09-17T09:00:00+09:00', now)).toBe(false);
  });

  it('수집기가 로그인이 끊겼다고 말하면 그대로 알아듣는다', () => {
    const loggedOut = readAffiliateOutcome([
      '■ 토스쇼핑 쉐어링크 — 이번 수집의 상품 응답 없음. 기존 목록/수집 시각 유지',
      '  새 수집 미완료: toss, brandconnect — 마지막 정상 목록과 실패 상태만 반영합니다.',
    ].join('\n'));
    expect(loggedOut.needsLogin).toBe(true);
    expect(loggedOut.sites).toContain('toss');

    const fine = readAffiliateOutcome('  이번 수집: toss 150건 · brandconnect 24건 (합계 174)');
    expect(fine.needsLogin).toBe(false);
    expect(fine.collected).toEqual({ toss: 150, brandconnect: 24 });
  });
});
