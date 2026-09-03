import { describe, expect, it } from 'vitest';
import type { IssueContext } from '../issue-context';
import type { IssueAnalysis } from '../issue-next-wave';
import { assembleIssueCandidates } from '../issue-niche-hunter';

/**
 * 후보 조립 순서가 곧 "무엇을 먼저 실측하나"다 — 다음 물결(예측)이 앞, 실측 자동완성,
 * 에이전트 파생, 연관검색어 순. 출처가 행에 남아야 화면이 "왜 여기 있나"를 말한다.
 */

const context: IssueContext = {
  issue: '박재홍',
  headlines: [],
  autocomplete: ['박재홍 뇌경색', '박재홍 근황', '박재홍 뇌경색 진단 이유 영상'],
  related: [{ keyword: '박재홍 해설', monthlyVolume: 700 }, { keyword: '박재홍 근황', monthlyVolume: 300 }],
};

const analysis: IssueAnalysis = {
  issue: '박재홍',
  why: '뇌경색 진단 소식',
  cands: ['박재홍 아내', '박재홍 뇌경색', '박재홍 굿즈 최저가'],
  nextWave: [{ keyword: '박재홍 복귀', reason: '3주 입원 후 복귀 예정' }, { keyword: '박재홍 근황', reason: '중복' }],
};

describe('assembleIssueCandidates', () => {
  it('다음 물결 → 자동완성 → 파생 → 연관 순으로 쌓고 출처를 남긴다', () => {
    const out = assembleIssueCandidates('박재홍', context, analysis, 12);
    expect(out.map((c) => `${c.origin}:${c.keyword}`)).toEqual([
      'next-wave:박재홍 복귀',
      'next-wave:박재홍 근황',
      'autocomplete:박재홍 뇌경색',
      'derived:박재홍 아내',
      'related:박재홍 해설',
    ]);
    expect(out[0].originReason).toBe('3주 입원 후 복귀 예정');
    expect(out[2].originReason).toBeNull();
  });

  it('이슈 자체·4어절 이상·상업 노이즈는 어느 출처든 떨어진다', () => {
    const out = assembleIssueCandidates('박재홍', { ...context, autocomplete: ['박재홍', '박재홍  근황'] }, analysis, 12);
    expect(out.map((c) => c.keyword)).not.toContain('박재홍');
    expect(out.map((c) => c.keyword)).not.toContain('박재홍 굿즈 최저가');
    expect(out.map((c) => c.keyword)).not.toContain('박재홍 뇌경색 진단 이유 영상');
    // 이중 공백은 같은 키워드다 — 한 번만
    expect(out.filter((c) => c.keyword === '박재홍 근황')).toHaveLength(1);
  });

  it('perIssue 로 자른다 — 앞 출처가 자리를 차지한다', () => {
    const out = assembleIssueCandidates('박재홍', context, analysis, 2);
    expect(out.map((c) => c.origin)).toEqual(['next-wave', 'next-wave']);
  });

  it('재료·분석이 없으면 빈 배열(머리만 관찰)', () => {
    expect(assembleIssueCandidates('박재홍', null, null, 12)).toEqual([]);
  });
});
