import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveDiscoveryCategoryIds } from '../category-discovery-map';
import { NAVER_BLOG_TOPICS } from '../naver-blog-topics';
import { DEFAULT_PREEMPTION_THRESHOLDS } from '../preemption-gate';
import { judgeAnswerCardKeyword } from '../preemption-supply-guards';
import {
  SITE_GATE,
  SITE_MAX_DOCUMENT_COUNT,
  buildSiteGoldenRows,
  describeSiteGateDrops,
  judgeSiteGate,
  measuredVolume,
  siteRowToGoldenRow,
  siteTopicInCategory,
} from '../golden-site-merge';

/**
 * 황금키워드 발굴이 사이트의 상위호환이 되는 규칙(2026-09-15).
 *
 * 사장님 "앱에 있는 황금키워드 발굴도 4개밖에 안 나와 사이트랑 많이 다른데 상위호환으로 발굴해줘야지".
 * 결정: 사이트 판 전부 + 앱이 더 찾은 말은 사이트와 같은 관문 통과분.
 */
const root = path.join(__dirname, '..', '..', '..');

describe('사이트와 같은 관문', () => {
  it('숫자는 사이트 게이트·후보 선별과 같은 출처다', () => {
    expect(SITE_GATE.minSearchVolume).toBe(DEFAULT_PREEMPTION_THRESHOLDS.minSearchVolume);
    expect(SITE_GATE.minVolumeToDocumentRatio).toBe(DEFAULT_PREEMPTION_THRESHOLDS.minVolumeToDocumentRatio);
    const script = fs.readFileSync(path.join(root, 'scripts', 'preemption-candidates.js'), 'utf8');
    expect(script).toContain(`Number(arg('maxDocumentCount')) || ${SITE_MAX_DOCUMENT_COUNT}`);
  });

  it('검색량·경쟁 글·비율을 넘는 말만 통과한다', () => {
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', searchVolume: 2810, documentCount: 578 }).ok).toBe(true);
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', searchVolume: 499, documentCount: 100 }).code).toBe('low-volume');
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', searchVolume: 900, documentCount: 0 }).code).toBe('no-documents');
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', searchVolume: 900, documentCount: null }).code).toBe('no-documents');
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', searchVolume: 9000, documentCount: 60000 }).code).toBe('too-many-documents');
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', searchVolume: 600, documentCount: 20000 }).code).toBe('low-ratio');
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', searchVolume: null, documentCount: 300 }).code).toBe('no-volume');
    expect(judgeSiteGate({ keyword: '   ', searchVolume: 900, documentCount: 300 }).code).toBe('empty');
  });

  it('PC·모바일 검색량이 따로 오면 합으로 본다 — 한쪽이 10 미만(0)이어도 나머지가 넘으면 통과', () => {
    expect(measuredVolume({ pcSearchVolume: 0, mobileSearchVolume: 520 })).toBe(520);
    expect(measuredVolume({ searchVolume: 700 })).toBe(700);
    expect(measuredVolume({})).toBeNull();
    expect(judgeSiteGate({ keyword: '메디홈 실비청구', pcSearchVolume: 0, mobileSearchVolume: 520, documentCount: 900 }).ok).toBe(true);
  });

  it('카드 답·금방 죽는 검색어는 숫자가 좋아도 뺀다 — 사이트 공급 차단과 같은 함수', () => {
    const card = ['서울 날씨', '오늘 날씨', '양자리 운세', '로또 당첨번호'].find((k) => judgeAnswerCardKeyword(k).answerCard);
    expect(card).toBeTruthy();
    expect(judgeSiteGate({ keyword: card as string, searchVolume: 90000, documentCount: 3000 }).code).toBe('answer-card');
    expect(judgeSiteGate({ keyword: '무한도전 재방송', searchVolume: 5000, documentCount: 3000 }).code).toBe('ephemeral');
  });

  it('뺀 이유를 사람이 읽는 말로 센다', () => {
    expect(describeSiteGateDrops({ 'low-volume': 120, 'answer-card': 3 })).toBe('카드 답 검색어 3 · 검색량 500 미만 120');
    expect(describeSiteGateDrops({})).toBe('');
  });
});

describe('사이트 행의 주제를 발굴 카테고리로 푼다', () => {
  it('블로그 주제 32종이 전부 발굴 카테고리 id 로 풀린다 — 안 풀리면 카테고리를 골랐을 때 그 주제 행이 사라진다', () => {
    const unresolved = NAVER_BLOG_TOPICS.map((topic) => topic.label).filter((label) => {
      const ids = resolveDiscoveryCategoryIds(label);
      return ids.length === 0 || (ids.length === 1 && ids[0] === label);
    });
    expect(unresolved).toEqual([]);
  });

  it('카테고리를 안 골랐으면 전부, 고르면 같은 id 를 나누는 주제만', () => {
    expect(siteTopicInCategory('게임', '')).toBe(true);
    expect(siteTopicInCategory('건강·의학', '건강')).toBe(true);
    expect(siteTopicInCategory('게임', '건강')).toBe(false);
    expect(siteTopicInCategory('육아·결혼', '육아')).toBe(true);
    expect(siteTopicInCategory('육아·결혼', '결혼')).toBe(true);
    expect(siteTopicInCategory('일상·생각', '생활')).toBe(true);
    expect(siteTopicInCategory('자동차', '전기차')).toBe(true);
    expect(siteTopicInCategory('', '건강')).toBe(false);
  });
});

describe('사이트 행을 발굴 표 모양으로', () => {
  const siteRow = {
    keyword: '메디홈 실비청구',
    topic: '건강·의학',
    tier: 'golden-ratio',
    tierLabel: '황금비',
    searchVolume: 2810,
    documentCount: 578,
    openSlot: 2,
    serp: { exactTitleHits: 2, hasAiBriefing: true, adCount: 3 },
    measuredAt: '2026-09-15T04:10:00.000Z',
    timingGroup: '지금 뜨는 중',
    intentLabel: '정보',
    adsenseFit: true,
    adsenseReason: '정보 의도',
  };

  it('사이트가 잰 값만 옮기고 새 값은 만들지 않는다', () => {
    const row = siteRowToGoldenRow(siteRow);
    expect(row).toMatchObject({
      keyword: '메디홈 실비청구',
      source: 'site-board',
      topic: '건강·의학',
      searchVolume: 2810,
      documentCount: 578,
      goldenRatio: 4.86,
      grade: '',
      siteOpenSlot: 2,
      siteFacing: 2,
      siteAiBriefing: true,
      siteAdCount: 3,
      siteMeasuredAt: '2026-09-15T04:10:00.000Z',
      adsenseFit: true,
      intent: '정보',
      platformLane: 'content',
      reseat: null,
    });
    expect(row?.goldenReason).toBe('사이트 판 · 황금비 · 지금 뜨는 중');
  });

  it('못 잰 칸은 비워 둔다 — 0 으로 채우지 않는다', () => {
    const row = siteRowToGoldenRow({ keyword: '빈 칸', topic: '게임' });
    expect(row?.searchVolume).toBeNull();
    expect(row?.documentCount).toBeNull();
    expect(row?.goldenRatio).toBeNull();
    expect(row?.siteOpenSlot).toBeNull();
    expect(row?.siteFacing).toBeNull();
    expect(row?.adsenseFit).toBeNull();
    expect(siteRowToGoldenRow({ keyword: '  ' })).toBeNull();
  });

  it('판 순서를 지키고, 고른 카테고리만, 같은 말은 한 번, 다시 잰 자리를 붙인다', () => {
    const board = {
      publishedAt: '2026-09-15T04:30:35Z',
      rows: [
        siteRow,
        { keyword: '무료게임 crazy', topic: '게임', searchVolume: 4650, documentCount: 3615 },
        { keyword: '메디홈실비청구', topic: '건강·의학', searchVolume: 2810, documentCount: 578 },
        { keyword: '카니발 풀체인지 시기', topic: '자동차', searchVolume: 1600, documentCount: 5078 },
      ],
    };
    const reseats = {
      메디홈실비청구: { keyword: '메디홈 실비청구', verdict: '반열림', facing: 2, vacancy: null, reason: '', measuredAt: '2026-09-14T00:00:00.000Z' },
    };
    expect(buildSiteGoldenRows(board, '', reseats).map((r) => r.keyword)).toEqual(['메디홈 실비청구', '무료게임 crazy', '카니발 풀체인지 시기']);
    const health = buildSiteGoldenRows(board, '건강', reseats);
    expect(health.map((r) => r.keyword)).toEqual(['메디홈 실비청구']);
    expect(health[0].reseat?.verdict).toBe('반열림');
    expect(buildSiteGoldenRows(null, '')).toEqual([]);
  });
});
