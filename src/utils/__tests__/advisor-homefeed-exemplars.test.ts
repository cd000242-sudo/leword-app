import { describe, expect, it } from 'vitest';
import type { AdvisorDailyRecord } from '../advisor/daily-summary';
import { HOMEFEED_EXEMPLAR_CAP, selectHomefeedExemplars } from '../advisor/homefeed-exemplars';
import { TITLE_FRAME_REPEAT_CAP, isSpokenEnding, spokenEndingCap, titleEndingKey } from '../benchmark-title-engine';

/**
 * 최근 7일 홈판 본보기 고르기(2026-09-30 4단계) — 하루 기록의 homefeedWeek(어제 + 그 전 6일 상위 20)에서
 * '오늘 쓸 글' 제목 프롬프트에 넣을 제목을 고른다. 전부 실측 행·매칭 사실이고 추정치는 없다.
 */
const base = {
  day: '2026-09-29',
  topicsDay: [{ topic: '자동차', value: 64 }],
  topicsWeek: [],
  popularKeywords: { topic: '자동차', items: [{ keyword: '투싼', ratio: 0.3 }] },
  topicKeywords: [{ topic: '자동차', keyword: '아이오닉9 리콜', rank: 1, rankChange: null }, { topic: '자동차', keyword: '2027 팰리세이드', rank: 2, rankChange: null }],
  homefeedTitles: [],
  homefeedWeek: [],
} as unknown as AdvisorDailyRecord;

const row = (day: string, rank: number, title: string, url = `u:${day}:${rank}`) => ({ day, rank, title, url });
const withWeek = (homefeedWeek: ReturnType<typeof row>[]) => ({ ...base, homefeedWeek }) as unknown as AdvisorDailyRecord;

describe('selectHomefeedExemplars', () => {
  it('표면 규칙에 걸린 제목·같은 글(url) 은 빼고, 내 주제 해당 제목이 앞, 나머지는 날짜 내림차순 그대로', () => {
    const out = selectHomefeedExemplars(withWeek([
      row('2026-09-29', 1, '"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', 'http://blog.naver.com/foodlog/2'),
      row('2026-09-29', 2, '아이오닉9 리콜 통지서 받고 서비스센터 가 보니 보인 것'),
      row('2026-09-29', 3, '장기전세 만기 총정리 한눈에 보기'),
      row('2026-09-28', 1, '투싼 하이브리드 계약하고 두 달 기다린 끝에 받은 안내'),
      row('2026-09-28', 2, '"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', 'http://blog.naver.com/foodlog/2'),
      row('2026-09-27', 1, '가을 이사 앞두고 장판 먼저 걷어 본 집의 바닥 상태'),
    ]));
    expect(out.exemplars.map((r) => `${r.day}#${r.rank}${r.myTopic ? '*' : ''}`)).toEqual(['2026-09-29#2*', '2026-09-28#1*', '2026-09-29#1', '2026-09-27#1']);
    expect(out.exemplars[0]).toEqual({ day: '2026-09-29', rank: 2, title: '아이오닉9 리콜 통지서 받고 서비스센터 가 보니 보인 것', url: 'u:2026-09-29:2', myTopic: true });
    // 개수는 원 행 기준(어제 3건 중 내 주제 1건 · 7일 6행) — 걸러진 뒤 수가 아니다
    expect(out).toMatchObject({ yesterdayTotal: 3, myTopicYesterday: 1, weekTotal: 6 });
  });

  it('내 주제 어휘는 주제 검색어·인기 검색어·주제명의 어절 — 숫자로 시작하는 어절은 빼고, 글 제목 어절은 안 쓴다', () => {
    const record = { ...withWeek([
      row('2026-09-29', 1, '2027년 달라지는 검사 주기 미리 본 사람들'),
      row('2026-09-29', 2, '팰리세이드 계약 전에 전시차 실내 먼저 본 사람들의 고민'),
      row('2026-09-29', 3, '그냥 넘기면 안 되는 경우가 따로 있는 전세 계약'),
    ]), posts: [{ contentId: 'p1', title: '그냥 넘기면 안 되는 경우', views: 1, publishedAt: null, homefeed: null, searchCount: null }] } as unknown as AdvisorDailyRecord;
    const out = selectHomefeedExemplars(record);
    expect(out.exemplars.map((r) => [r.rank, r.myTopic])).toEqual([[2, true], [1, false], [3, false]]);
    expect(out.myTopicYesterday).toBe(1);
  });

  it('상한은 12, 같은 끝맺음 3개까지 · 구어 어미는 판의 다섯에 하나까지 — 홈판 실측 틀 상한과 같다', () => {
    const cars = ['투싼', '아반떼', '쏘렌토', '카니발', '그랜저', '스포티지'];
    const tails = ['조건', '금액', '순서', '숫자', '자리', '시점', '기준', '방향', '차이', '절차'];
    const spoken = ['생각보다 다르더라고요', '생각보다 달랐네요', '생각보다 크대요', '생각보다 크죠'];
    const rows = [
      ...cars.map((car, i) => row('2026-09-29', i + 1, `${car} 계약 뒤에 남는 이유`)),
      ...spoken.map((tail, i) => row('2026-09-28', i + 1, `${cars[i]} 계약해 봤더니 ${tail}`)),
      ...tails.map((tail, i) => row('2026-09-27', i + 1, `${cars[i % cars.length]} 계약 뒤에 남는 ${tail}`)),
    ];
    const out = selectHomefeedExemplars({ ...base, popularKeywords: null, topicKeywords: [], homefeedWeek: rows } as unknown as AdvisorDailyRecord);
    expect(HOMEFEED_EXEMPLAR_CAP).toBe(12);
    expect(out.exemplars).toHaveLength(HOMEFEED_EXEMPLAR_CAP);
    expect(out.exemplars.filter((r) => titleEndingKey(r.title) === '이유')).toHaveLength(TITLE_FRAME_REPEAT_CAP);
    expect(out.exemplars.filter((r) => isSpokenEnding(r.title))).toHaveLength(spokenEndingCap(HOMEFEED_EXEMPLAR_CAP));
    expect(out.weekTotal).toBe(rows.length);
    // 상한을 줄이면 그만큼만
    expect(selectHomefeedExemplars({ ...base, popularKeywords: null, topicKeywords: [], homefeedWeek: rows } as unknown as AdvisorDailyRecord, 4).exemplars).toHaveLength(4);
  });

  it('옛 기록(homefeedWeek 없음)은 어제 홈판 제목(homefeedTitles)으로 — 날짜는 기록 날짜, 순위는 순서', () => {
    const old = { ...base, homefeedWeek: undefined, homefeedTitles: [{ title: '투싼 하이브리드 계약하고 두 달 기다린 끝에 받은 안내', url: 'u1' }, { title: '가을 이사 앞두고 장판 먼저 걷어 본 집의 바닥 상태', url: 'u2' }] } as unknown as AdvisorDailyRecord;
    const out = selectHomefeedExemplars(old);
    expect(out.exemplars.map((r) => `${r.day}#${r.rank}${r.myTopic ? '*' : ''}`)).toEqual(['2026-09-29#1*', '2026-09-29#2']);
    expect(out).toMatchObject({ yesterdayTotal: 2, myTopicYesterday: 1, weekTotal: 2 });
  });

  it('홈판 제목이 하나도 없으면 전부 0 · 빈 배열', () => {
    expect(selectHomefeedExemplars({ ...base, homefeedWeek: undefined, homefeedTitles: [] } as unknown as AdvisorDailyRecord)).toEqual({ yesterdayTotal: 0, myTopicYesterday: 0, weekTotal: 0, exemplars: [] });
  });
});
