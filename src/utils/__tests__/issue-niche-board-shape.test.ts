import { describe, expect, it } from 'vitest';
import type { IssueNicheIssue, IssueNicheKeyword } from '../issue-niche-hunter';
import {
  buildIssueBoardPayload,
  selectIssueRowsForEnrich,
  toPublicIssueRow,
  type IssueBoardPayload,
} from '../issue-niche-board-publish';

/**
 * 황금키워드 카드와 같은 모양으로 나간다(사장님 지시 2026-09-03 "황금키워드랑
 * 똑같이 버튼·연관키워드·그래프 전부"). 보강(enrich-board.js)이 붙인 값은
 * 그대로 실리고, "왜 지금?"은 헤드라인이 검증한 이슈 추론이 보강 AI 보다 앞선다.
 */

const NOW = Date.parse('2026-09-03T04:00:00.000Z');

function row(over: Partial<IssueNicheKeyword> & Record<string, unknown> = {}): IssueNicheKeyword {
  return {
    keyword: '박재홍 복귀',
    baseKeyword: '박재홍',
    issueType: 'entertainment',
    isDerived: true,
    grade: 'A',
    searchVolume: 320,
    documentCount: 1200,
    goldenRatio: 0.27,
    cpc: null,
    recencyStatus: 'rising',
    recencyRatio: 2.1,
    isHot: true,
    hasTraffic: true,
    frontalDocCount: 3,
    freshFrontalCount: 1,
    isNiche: true,
    isEstimated: false,
    isSearchVolumeEstimated: false,
    searchVolumeLt10: false,
    isDocumentCountEstimated: false,
    demandRecent7: 40,
    demandRatio: 1.8,
    demandStatus: 'rising',
    hasLiveDemand: true,
    nicheRoute: 'demand',
    isPreemption: false,
    nicheScore: 77,
    reasons: ['실측 수요 ▲', '문서수 1,200'],
    source: 'signal.bz',
    origin: 'next-wave',
    originReason: '3주 입원 후 복귀 예정이라 복귀 시점 검색이 이어진다',
    ...over,
  };
}

const issue: IssueNicheIssue = {
  issue: '박재홍',
  issueType: 'entertainment',
  source: 'signal.bz',
  headlines: [
    { title: '박재홍, 뇌경색 진단…"회복 중"', press: 'press-a.co.kr', publishedAt: '2026-09-03T01:12:00.000Z', link: 'https://n.news.naver.com/1' },
    { title: '해설위원 박재홍 3주 입원 후 복귀 예정', press: null, publishedAt: null, link: 'https://n.news.naver.com/2' },
    { title: '박재홍 근황', press: null, publishedAt: null, link: 'https://n.news.naver.com/3' },
    { title: '넷째 헤드라인', press: null, publishedAt: null, link: 'https://n.news.naver.com/4' },
  ],
  autocomplete: ['박재홍 뇌경색', '박재홍 근황'],
  related: [{ keyword: '박재홍 해설', monthlyVolume: 700 }, { keyword: '박재홍 근황', monthlyVolume: 300 }],
  why: '뇌경색 진단으로 입원했다는 소식에 근황 검색이 몰린다',
  nextWave: [{ keyword: '박재홍 복귀', reason: '3주 입원 후 복귀 예정이라 복귀 시점 검색이 이어진다' }, { keyword: '박재홍 후임', reason: '공백 기간 대체 해설위원 궁금증' }],
};

describe('selectIssueRowsForEnrich — 보강에 넘길 행만, 황금 보강기가 읽는 필드로', () => {
  const ledger = {
    generator: 'issue-niche-hunter',
    generatedAt: '2026-09-03T03:50:00.000Z',
    funnel: { issues: 1, candidates: 4 },
    issues: [issue],
    rows: [
      row({ keyword: '박재홍', isDerived: false, isNiche: false, isPreemption: false, origin: 'head', originReason: null }),
      row(),
      row({ keyword: '박재홍 뇌경색 증상', origin: 'autocomplete', originReason: null, cpc: 450, isNiche: false, isPreemption: true }),
      row({ keyword: '탈락', isNiche: false, isPreemption: false }),
    ],
  };

  it('틈새·선점 후보만 남기고, 애드센스 판정·의도·헤드라인·topic 을 붙인다', () => {
    const picks = selectIssueRowsForEnrich(ledger);
    expect(picks.rows.map((r) => r.keyword)).toEqual(['박재홍 복귀', '박재홍 뇌경색 증상']);
    const [wave, symptom] = picks.rows;
    expect(wave.topic).toBe('박재홍');
    expect(wave.issueHeadlines).toEqual(['박재홍, 뇌경색 진단…"회복 중"', '해설위원 박재홍 3주 입원 후 복귀 예정', '박재홍 근황', '넷째 헤드라인']);
    // 의도·CPC 재료가 없으면 판정하지 않는다 — null 이지 false 가 아니다.
    expect(wave.adsenseFit).toBeNull();
    // '증상' = 정보형 → 애드센스 적합. CPC 실측이 근거 문장에 실린다.
    expect(symptom.intentLabel).toBe('정보');
    expect(symptom.adsenseFit).toBe(true);
    expect(symptom.adsenseReason).toContain('450');
    // 원장의 나머지 필드는 그대로다(보강기는 keyword 만 읽고, 발행기는 나머지를 읽는다).
    expect(wave.origin).toBe('next-wave');
    expect(picks.funnel).toEqual(ledger.funnel);
  });

  it('이슈에는 머리 행의 추세·HOT 을 붙여 둔다 — 보강본만으로 브리핑이 선다', () => {
    const picks = selectIssueRowsForEnrich(ledger);
    expect(picks.issues[0].issueStatus).toBe('rising');
    expect(picks.issues[0].isHot).toBe(true);
    expect(picks.issues[0].why).toBe(issue.why);
  });

  it('이슈 목록이 없는 옛 원장도 처리한다', () => {
    const picks = selectIssueRowsForEnrich({ ...ledger, issues: undefined });
    expect(picks.rows).toHaveLength(2);
    expect(picks.rows[0].issueHeadlines).toEqual([]);
    expect(picks.issues).toEqual([]);
  });
});

describe('toPublicIssueRow — 황금 카드 모양', () => {
  it('근거(evidence)를 실측 사실에서 만든다 — 다음 물결 이유가 맨 앞', () => {
    const pub = toPublicIssueRow(row(), 'now', issue)!;
    expect(pub.topic).toBe('박재홍');
    expect(pub.origin).toBe('next-wave');
    expect(pub.originReason).toBe('3주 입원 후 복귀 예정이라 복귀 시점 검색이 이어진다');
    expect(pub.evidence.map((e) => e.code)).toEqual(['next-wave', 'demand', 'empty-field', 'fresh']);
    expect(pub.evidence[0].text).toContain('다음 물결');
    expect(pub.evidence[1].text).toContain('1.8');
    expect(pub.evidence[2].text).toContain('3건');
  });

  it('출처별 근거 — 자동완성·연관검색어는 실측 문구, 파생은 근거 없음', () => {
    expect(toPublicIssueRow(row({ origin: 'autocomplete', originReason: null }), 'now', issue)!.evidence[0]).toEqual({ code: 'autocomplete', text: '네이버 자동완성 실측 — 사람들이 이미 치는 말' });
    expect(toPublicIssueRow(row({ origin: 'related', originReason: null }), 'now', issue)!.evidence[0].code).toBe('related');
    expect(toPublicIssueRow(row({ origin: 'derived', originReason: null, hasLiveDemand: false, frontalDocCount: null, isHot: false, recencyStatus: 'stable' }), 'now', issue)!.evidence).toEqual([]);
  });

  it('"왜 지금?"은 헤드라인이 검증한 이슈 추론이 보강 AI 보다 앞선다', () => {
    const pub = toPublicIssueRow(row({ whySearch: { text: '보강 AI 가 지어낸 이유', basis: 'AI 추론' } }), 'now', issue)!;
    expect(pub.whySearch?.text).toBe('뇌경색 진단으로 입원했다는 소식에 근황 검색이 몰린다');
    expect(pub.whySearch?.basis).toContain('헤드라인 4건');
    // 이슈 추론이 없으면 보강 AI 것을 쓴다(황금 보드와 같은 라벨).
    const fallback = toPublicIssueRow(row({ whySearch: { text: '보강 AI 이유', basis: 'AI 추론 — 연관 실측' } }), 'now', { ...issue, why: null })!;
    expect(fallback.whySearch).toEqual({ text: '보강 AI 이유', basis: 'AI 추론 — 연관 실측' });
    expect(toPublicIssueRow(row(), 'now', { ...issue, why: null })!.whySearch).toBeNull();
  });

  it('보강이 붙인 값은 그대로 싣는다 — 풀은 검색량이 실측인 것만', () => {
    const enriched = row({
      titles: { seo: { text: '박재홍 복귀 시점, 3주 입원 뒤 어떻게 되나', frame: 'ai' }, home: { text: '박재홍 복귀 언제냐고 물어보시길래 찾아봤어요', frame: 'ai' } },
      subKeywords: [{ keyword: '박재홍 해설', searchVolume: 700, frame: 'problem' }],
      keywordPool: [{ keyword: '박재홍 해설', searchVolume: 700, documentCount: 90 }, { keyword: '지어낸 말', searchVolume: null }],
      trend: { series: [10, 20, 100], label: '급등' },
      kinCount: 12,
      kinTop: [{ title: '박재홍 언제 복귀하나요', link: 'https://kin.naver.com/1', views: 300, answers: 2 }],
      monetize: { verdict: 'good', points: [{ text: '보험 광고 붙음' }] },
      adsenseFit: true,
      adsenseReason: '정보형 검색',
      intentLabel: '정보',
    });
    const pub = toPublicIssueRow(enriched, 'now', issue)!;
    expect(pub.titles?.seo?.text).toContain('박재홍');
    expect(pub.subKeywords).toEqual([{ keyword: '박재홍 해설', searchVolume: 700, frame: 'problem' }]);
    expect(pub.keywordPool).toEqual([{ keyword: '박재홍 해설', searchVolume: 700, documentCount: 90 }]);
    expect(pub.trend).toEqual({ series: [10, 20, 100], label: '급등' });
    expect(pub.kinCount).toBe(12);
    expect(pub.kinTop?.[0].title).toBe('박재홍 언제 복귀하나요');
    expect(pub.monetize?.verdict).toBe('good');
    expect(pub.adsenseFit).toBe(true);
    expect(pub.intentLabel).toBe('정보');
  });

  it('보강이 없으면 그 필드들은 없다(null) — 지어내지 않는다', () => {
    const pub = toPublicIssueRow(row(), 'now', issue)!;
    expect(pub.titles).toBeNull();
    expect(pub.keywordPool).toBeNull();
    expect(pub.trend).toBeNull();
    expect(pub.kinCount).toBeNull();
    expect(pub.adsenseFit).toBeNull();
  });
});

describe('buildIssueBoardPayload — 이슈 브리핑(issues)', () => {
  const ledger = {
    generator: 'issue-niche-hunter',
    generatedAt: '2026-09-03T03:50:00.000Z',
    funnel: { issues: 2, candidates: 3 },
    issues: [
      { ...issue, issueStatus: 'rising' as const, isHot: true },
      { issue: '마운자로', issueType: 'fresh' as const, source: 'tech-rss', headlines: [], autocomplete: [], related: [], why: null, nextWave: [] },
    ],
    rows: [
      row(),
      row({ keyword: '박재홍 뇌경색', origin: 'autocomplete', originReason: null, isNiche: false, isPreemption: true, searchVolume: 900, documentCount: 40 }),
    ],
  };

  it('왜·헤드라인 3건·몰린 검색어·다음 물결(보드 실측 합류)·행 수를 이슈별로 싣는다', () => {
    const { payload } = buildIssueBoardPayload(ledger, null, { nowMs: NOW });
    expect(payload.issues.map((i) => i.issue)).toEqual(['박재홍']);
    const b = payload.issues[0];
    expect(b.lane).toBe('realtime');
    expect(b.issueStatus).toBe('rising');
    expect(b.isHot).toBe(true);
    expect(b.why).toBe(issue.why);
    expect(b.headlines).toHaveLength(3);
    expect(b.headlines[0]).toEqual({ title: '박재홍, 뇌경색 진단…"회복 중"', press: 'press-a.co.kr', publishedAt: '2026-09-03T01:12:00.000Z', link: 'https://n.news.naver.com/1' });
    // 몰린 검색어 = 자동완성 + 연관(중복 제거). 검색량은 연관 실측 또는 보드 실측, 없으면 null.
    expect(b.concentrated).toEqual([
      { keyword: '박재홍 뇌경색', searchVolume: 900, origin: 'autocomplete' },
      { keyword: '박재홍 근황', searchVolume: 300, origin: 'autocomplete' },
      { keyword: '박재홍 해설', searchVolume: 700, origin: 'related' },
    ]);
    expect(b.nextWave).toEqual([
      { keyword: '박재홍 복귀', reason: '3주 입원 후 복귀 예정이라 복귀 시점 검색이 이어진다', searchVolume: 320, documentCount: 1200, onBoard: true },
      { keyword: '박재홍 후임', reason: '공백 기간 대체 해설위원 궁금증', searchVolume: null, documentCount: null, onBoard: false },
    ]);
    expect(b.rowCount).toBe(2);
  });

  it('왜도 다음 물결도 행도 없는 이슈는 싣지 않는다', () => {
    const { payload } = buildIssueBoardPayload(ledger, null, { nowMs: NOW });
    expect(payload.issues.find((i) => i.issue === '마운자로')).toBeUndefined();
  });

  it('이월된 행의 이슈는 직전 브리핑을 carried 로 이어 간다', () => {
    const first = buildIssueBoardPayload(ledger, null, { nowMs: NOW - 3_600_000 }).payload;
    const next = { ...ledger, issues: [], rows: [row({ keyword: '새 이슈 파생', baseKeyword: '새 이슈' })] };
    const { payload } = buildIssueBoardPayload(next, first, { nowMs: NOW });
    const carried = payload.issues.find((i) => i.issue === '박재홍');
    expect(carried?.carried).toBe(true);
    expect(carried?.why).toBe(issue.why);
  });

  it('옛 발행본(issues 없음)도 읽는다', () => {
    const prev = { ...buildIssueBoardPayload(ledger, null, { nowMs: NOW - 3_600_000 }).payload } as Partial<IssueBoardPayload>;
    delete prev.issues;
    const { payload } = buildIssueBoardPayload({ ...ledger, issues: [] }, prev as IssueBoardPayload, { nowMs: NOW });
    expect(payload.issues).toEqual([]);
  });
});
