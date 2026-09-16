/**
 * 제휴 수집을 앱이 대신 돌리는 계획표 (2026-09-16).
 *
 * 사장님 "매일마다 로그인해야되는거네".
 * 매일 로그인해야 하는 구조는 아닌데 지금 구조가 그렇게 만든다 — 갱신이 사장님 PC 수동 실행이라
 * 아무도 안 돌리면 쿠키가 방치돼 만료되고, 끊긴 걸 열흘간 아무도 몰랐다(실측: 수집 241시간 전,
 * 표의 '바로쓰기' 0개). 앱이 하루 한 번 돌리면 세션이 계속 연장돼 로그인할 일이 거의 없어지고,
 * 정말 끊겼을 때만 알림이 뜬다.
 *
 * 걸림돌과 우회: 수집기(다른 에이전트 소관, 수정 금지)가 쿠키 프로필을 `scripts/../tmp/affiliate-profile`
 * 로 박아 뒀다. 설치판에서 scripts 는 app.asar 안이라 쓸 수 없다. 그래서 **스크립트 묶음을 앱 데이터
 * 폴더로 복사해 거기서 돌린다** — `__dirname/../tmp` 가 앱 폴더로 잡혀 쿠키가 남는다. 파일은 한 줄도 안 고친다.
 *
 * 여기 있는 것은 전부 순수 함수다 — 복사 · 실행 · 알림은 핸들러(main/handlers/affiliate-local)가 한다.
 */
import * as path from 'path';

/**
 * 앱 폴더로 복사할 스크립트. 하나라도 빠지면 자식 프로세스가 require 에서 죽는다.
 * 목록 근거: affiliate-refresh → campaigns · campaigns-parse · snapshot,
 * campaigns → login-session, parse → recommendation.mjs · shopping-insight.mjs · ai-titles,
 * 그리고 자리 · 브리프를 붙이는 enrich. (`../src/**` 모듈은 shim 이 dist 로 돌려준다.)
 */
export const AFFILIATE_SCRIPT_FILES: readonly string[] = Object.freeze([
  'affiliate-refresh.js',
  'affiliate-campaigns.js',
  'affiliate-campaigns-parse.js',
  'affiliate-snapshot.js',
  'affiliate-login-session.js',
  'affiliate-ai-titles.js',
  'affiliate-recommendation.mjs',
  'affiliate-enrich.js',
  'shopping-insight.mjs',
  'load-project-env.js',
]);

export type AffiliateStageKey = 'collect' | 'enrich';

export const AFFILIATE_STAGE_LABEL: Readonly<Record<AffiliateStageKey, string>> = Object.freeze({
  collect: '제휴 상품 받기',
  enrich: '자리 · 글감 재기',
});

export interface AffiliateStage {
  key: AffiliateStageKey;
  label: string;
  script: string;
  args: string[];
}

export interface AffiliatePlan {
  stages: AffiliateStage[];
  /** 자식 프로세스에 더할 환경변수. 사이트 레포를 모르면 넣지 않는다. */
  env: { NAVER_SITE_REPO?: string };
  /** 수집기가 내놓는 스냅샷 — enrich 가 이 파일에 자리 · 브리프를 덧붙인다. */
  snapshotFile: string;
}

export interface AffiliatePlanInput {
  /** 스크립트 사본과 tmp 가 놓이는 앱 폴더 */
  workDir: string;
  /** 사이트 레포 경로. 모르면 null — 그러면 앱 폴더에만 둔다. */
  siteRepo: string | null;
}

/**
 * 두 단계다. 발행(--publish)은 앱이 하지 않는다 — 사이트 커밋은 사람이 보고 한다.
 * 수집만 하고 자리를 안 재면 판이 오히려 빈다(순수 수집본에는 seat · brief 가 없다). 그래서 둘은 한 벌이다.
 */
export function buildAffiliatePlan(input: AffiliatePlanInput): AffiliatePlan {
  const scriptsDir = path.join(input.workDir, 'scripts');
  const snapshotFile = path.join(input.workDir, 'tmp', 'affiliate-campaigns-public.json');
  const env: { NAVER_SITE_REPO?: string } = {};
  if (input.siteRepo) env.NAVER_SITE_REPO = input.siteRepo;
  return {
    snapshotFile,
    env,
    stages: [
      {
        key: 'collect',
        label: AFFILIATE_STAGE_LABEL.collect,
        script: path.join(scriptsDir, 'affiliate-refresh.js'),
        args: [],
      },
      {
        key: 'enrich',
        label: AFFILIATE_STAGE_LABEL.enrich,
        script: path.join(scriptsDir, 'affiliate-enrich.js'),
        args: [`--in=${snapshotFile}`, '--deriveMissing', '--briefAll'],
      },
    ],
  };
}

const KST_MS = 9 * 60 * 60 * 1000;

/** 한국 날짜(YYYY-MM-DD). 하루 한 번의 '하루'는 한국 날짜다. */
function kstDay(ms: number): string {
  return new Date(ms + KST_MS).toISOString().slice(0, 10);
}

/** 오늘(한국 날짜) 이미 돌았으면 안 돈다. 기록이 없거나 못 읽으면 돈다 — 안 도는 쪽이 더 나쁘다. */
export function isAffiliateRunDue(lastRunAt: string | null | undefined, now: number): boolean {
  if (!lastRunAt) return true;
  const at = Date.parse(String(lastRunAt));
  if (!Number.isFinite(at)) return true;
  return kstDay(at) !== kstDay(now);
}

export interface AffiliateOutcome {
  /** 로그인이 끊겨 새 목록을 못 받았다. */
  needsLogin: boolean;
  /** 로그인이 필요한 플랫폼 id. */
  sites: string[];
  /** 이번 회차에 받은 건수. 못 읽으면 빈 객체. */
  collected: Record<string, number>;
}

/**
 * 수집기 출력에서 결과만 읽는다. 문구는 수집기(다른 에이전트 소관)가 정한 것이라, 바뀌면 여기가 못 알아듣는다 —
 * 그때는 '로그인 필요'로 넘기지 않고 건수만 비는 쪽으로 기운다(거짓 알림보다 조용한 편이 낫다).
 */
export function readAffiliateOutcome(output: string): AffiliateOutcome {
  const text = String(output || '');
  const sites: string[] = [];
  const incomplete = text.match(/새 수집 미완료:\s*([^\n—]+)/);
  if (incomplete) {
    for (const piece of incomplete[1].split(',')) {
      const id = piece.trim();
      if (id && !sites.includes(id)) sites.push(id);
    }
  }
  const collected: Record<string, number> = {};
  const counts = text.match(/이번 수집:\s*([^\n(]+)/);
  if (counts) {
    for (const piece of counts[1].split('·')) {
      const hit = piece.trim().match(/^([a-z][a-z0-9_-]*)\s+(\d+)건$/i);
      if (hit) collected[hit[1]] = Number(hit[2]);
    }
  }
  return { needsLogin: sites.length > 0, sites, collected };
}
