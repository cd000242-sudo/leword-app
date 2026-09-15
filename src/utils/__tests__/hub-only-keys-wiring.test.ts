import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { judgeStageExit } from '../golden-local-plan';

/**
 * API HUB 키만 있어도 이 PC 판이 시작된다 — 키 검사 배선(2026-09-15, 사장님 "HUB 키만 있는 사용자도 이 PC 판 쓰게").
 * 2026-06-25 이후 새로 발급한 사용자는 HUB 키뿐인데, 앱 키 검사 · 후보 스크립트 · 발행 시계열 보강이 옛 Client ID 만 봤다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('API HUB 키만 있어도 이 PC 판이 시작된다', () => {
  it('앱 키 검사는 옛 Client ID 또는 API HUB 키 — 안내 문구도 둘 다 적는다', () => {
    const handler = read('src/main/handlers/golden-local.ts');
    expect(handler).toContain('config.naverSearchAdAccessLicense && (config.naverClientId || isApiHubConfigured())');
    expect(handler).toContain("import { isApiHubConfigured } from '../../utils/naver-api-hub';");
    expect(handler).toContain('오픈 API 키(API HUB 또는 옛 Client ID)');
  });

  it('후보 스크립트도 같은 조건으로 시작한다 — 실패 문구는 그대로(계획표가 그 문구를 읽는다)', () => {
    const script = read('scripts/preemption-candidates.js');
    expect(script).toContain('if (!searchAd.accessLicense || (!openApi.clientId && !isApiHubConfigured())) {');
    expect(script).toContain("require('../src/utils/naver-api-hub')");
    expect(script).toContain("console.error('네이버 검색광고·오픈 API 자격증명이 필요합니다.');");
    expect(judgeStageExit('candidates', 2, '네이버 검색광고·오픈 API 자격증명이 필요합니다.').message).toContain('API HUB');
  });

  it('발행 시계열 보강은 환경변수 → 앱 설정 → API HUB 순으로 키를 찾는다', () => {
    const publish = read('scripts/publish-preemption-board.js');
    expect(publish).toContain('clientId: process.env.NAVER_CLIENT_ID || seriesConfig.naverClientId');
    expect(publish).toContain('((openApi.clientId && openApi.clientSecret) || seriesHubConfigured) && lacking.length > 0');
    expect(publish).not.toContain('NAVER_CLIENT_ID/SECRET 없음');
  });

  it('문서수 함수는 옛 키가 없어도 HUB 키가 있으면 요청한다', () => {
    const blogApi = read('src/utils/naver-blog-api.ts');
    expect(blogApi).toContain('getNaverBlogOpenApiCredentials(fallbackConfig).length > 0 || hubConfigured');
    expect(blogApi).toContain('if (!activeCredential && !(hubConfigured && !isNaverBlogOpenApiQuotaBlocked(fallbackConfig))) return null;');
  });
});
