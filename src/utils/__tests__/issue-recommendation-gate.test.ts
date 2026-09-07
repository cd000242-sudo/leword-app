import { describe, expect, it } from 'vitest';
import { inspectIssueRelation, classifyIssuePublication } from '../issue-recommendation-gate';
import { assembleIssueCandidates } from '../issue-niche-hunter';
import { buildIssueBoardPayload } from '../issue-niche-board-publish';

const NOW = Date.parse('2026-09-06T08:00:00Z');
const base = (over: Record<string, unknown> = {}) => ({ keyword: '오늘의 운세 띠별', baseKeyword: '오늘의 운세',
  isNiche: true, isPreemption: false, hasLiveDemand: true, demandRecent7: 20, demandStatus: 'stable',
  searchVolume: 1000, documentCount: 100, isSearchVolumeEstimated: false, isDocumentCountEstimated: false,
  issueType: 'fresh', source: 'signal.bz', origin: 'autocomplete', ...over } as any);

describe('이슈 관계 증거', () => {
  it('일반 접두어와 부분 인물명만 겹치는 의도 이탈은 차단한다', () => {
    for (const [issue, candidate] of [['오늘의 운세', '오늘의 월드뉴스'], ['리리아 3.5', '리리아나 보넷'], ['리리아3.5', '리리아나 보넷'], ['리리아 3.5', '리리아 3.6 설치'], ['유리', '유리나 프로필'], ['', '말'], ['오늘의', '오늘의 뉴스']]) {
      expect(inspectIssueRelation(issue, candidate).related, `${issue} -> ${candidate}`).toBe(false);
    }
  });
  it('핵심 의도·엔티티·버전이 유지된 실제 세부어를 허용한다', () => {
    for (const [issue, candidate] of [['오늘의 운세', '오늘의 운세 띠별'], ['오늘의 운세', '오늘의운세'], ['리리아 3.5', '리리아3.5 설치'], ['박재홍', '박재홍 근황'], ['박재홍', '박재홍근황'], ['아동 수당', '아동수당 신청']]) {
      expect(inspectIssueRelation(issue, candidate).related, `${issue} -> ${candidate}`).toBe(true);
    }
  });
  it('부분 이름이 아닌 같은 실기사의 양쪽 완전한 표현만 대체 근거로 쓴다', () => {
    const headlines = [{ title: '출근하는 용혜인 후보자, 용혜인 청문회 일정 공개', link: 'https://news.example/article/1' }];
    expect(inspectIssueRelation('출근하는 용혜인 후보자', '용혜인 청문회', headlines).related).toBe(true);
    expect(inspectIssueRelation('리리아 3.5', '리리아나 보넷', [{ title: '리리아나 보넷 인터뷰', link: 'https://news.example/a' }]).related).toBe(false);
    expect(inspectIssueRelation('오늘의 운세', '오늘의 월드뉴스', [{ title: '오늘의 운세와 오늘의 월드뉴스', link: '' }]).related).toBe(false);
  });
  it('자동완성·연관·AI 출처 모두 실측 전에 같은 관계 게이트를 적용한다', () => {
    const context = { issue: '오늘의 운세', headlines: [], autocomplete: ['오늘의 월드뉴스', '오늘의 운세 띠별'], related: [{ keyword: '오늘의 날씨', monthlyVolume: 10000 }] };
    const analysis = { issue: context.issue, why: null, cands: ['오늘의 경제'], nextWave: [{ keyword: '오늘의 방송', reason: 'AI 예측' }] };
    expect(assembleIssueCandidates(context.issue, context, analysis, 20).map((row) => row.keyword)).toEqual(['오늘의 운세 띠별']);
  });
  it('깨진 주소나 인증정보·로컬 호스트는 기사 관계 근거가 아니다', () => {
    for (const link of ['https://', 'https://user:secret@news.example/a', 'https://127.0.0.1/a', 'http://localhost/a']) {
      expect(inspectIssueRelation('신형휴대폰 출시', '배터리 비교', [{title:'신형휴대폰 출시 배터리 비교',link}]).related).toBe(false);
    }
    expect(inspectIssueRelation('신형휴대폰 출시', '배터리 비교', null as any).related).toBe(false);
  });
});

describe('발행 최종 추천 게이트', () => {
  it('수요 숫자가 없으면 관찰행의 수요 검증 문구도 제거한다', () => {
    const payload = buildIssueBoardPayload({ generatedAt: new Date(NOW).toISOString(), rows: [base({ demandRecent7: null })] }, null, { nowMs: NOW }).payload;
    expect(payload.rows).toHaveLength(0);
    expect(payload.observations?.[0].hasLiveDemand).toBe(false);
    expect(payload.observations?.[0].evidence.some(item => item.code === 'demand')).toBe(false);
  });
  it('수요 미검출은 경쟁이 적어도 관찰용이고 수요 숫자를 만들지 않는다', () => {
    const decision = classifyIssuePublication({ keyword: '리리아 3.5 설치', issue: '리리아 3.5', hasLiveDemand: false, demandStatus: 'unknown', preemptionKind: 'no-demand' });
    expect(decision.status).toBe('observe');
    expect(decision.reason).toBe('demand-unverified');
    expect(classifyIssuePublication({ keyword: '오늘의 월드뉴스', issue: '오늘의 운세', hasLiveDemand: true }).status).toBe('reject');
  });
  it('신규·이월 모두 검사하고 무수요는 observations, 관계이탈은 어디에도 싣지 않는다', () => {
    const prev = { publishedAt: new Date(NOW - 1000).toISOString(), freeSample: { day: '2026-09-06', keywords: ['리리아나 보넷', '리리아3.5 설치'] }, issues: [], rows: [
      { keyword: '리리아나 보넷', issue: '리리아3.5', verdict: 'preemption', hasLiveDemand: true, measuredAt: new Date(NOW - 1000).toISOString() },
      { keyword: '리리아3.5 설치', issue: '리리아3.5', verdict: 'preemption', hasLiveDemand: false, preemptionKind: 'no-demand', measuredAt: new Date(NOW - 1000).toISOString() },
    ] } as any;
    const ledger = { generatedAt: new Date(NOW).toISOString(), rows: [base(), base({ keyword: '오늘의 월드뉴스' }), base({ keyword: '오늘의 운세 별자리', isNiche: false, isPreemption: true, preemptionKind: 'no-demand', hasLiveDemand: false, demandRecent7: null })] };
    const { payload } = buildIssueBoardPayload(ledger, prev, { nowMs: NOW });
    expect(payload.rows.map((row) => row.keyword)).toEqual(['오늘의 운세 띠별']);
    expect(payload.observations?.map((row) => row.keyword)).toEqual(['오늘의 운세 별자리', '리리아3.5 설치']);
    expect(payload.observations?.every((row) => row.recommendationStatus === 'observe')).toBe(true);
    expect(payload.freeSample.keywords).toEqual([]);
  });
  it('최신 실측의 실패를 과거 추천 이월로 되살리지 않는다', () => {
    const before = buildIssueBoardPayload({ rows: [base()], generatedAt: new Date(NOW - 1000).toISOString() }, null, { nowMs: NOW - 1000 }).payload;
    const result = buildIssueBoardPayload({ rows: [base({ isNiche: false, isPreemption: false })], generatedAt: new Date(NOW).toISOString() }, before, { nowMs: NOW });
    expect(result.payload.rows).toEqual([]);
  });
});
