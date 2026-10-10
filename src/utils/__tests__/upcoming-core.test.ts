/**
 * 미리 써 둘 소재(2026-10-11 사장님 "지금 홈판도 미리 쓰면 뜰 소재가 있으면 — 예: 모레노 감독 체제 두 번째 경기 우루과이전(1:4)에
 * 처음 나온 김민수 선수 글이 그날만 43만 명"). 날짜가 정해진 사건 직전에 그날 검색이 몰릴 사람을 '처음' 신호로 짚는다.
 * 지어내지 않기: 사람 · 신호는 기사 문장 안에(인용 검사), 날짜는 경기 일정 또는 기사 날짜 해석으로만.
 */
import { describe, expect, it } from 'vitest';
import { sportsEvents, scheduleEventsFromNews, buildWatchPrompt, validateWatch, upcomingCards, type UpcomingEvent } from '../upcoming/upcoming-core';

const now = Date.parse('2026-10-11T00:00:00Z'); // KST 10/11 09:00

describe('사건 모으기', () => {
  it('경기 일정 — 앞으로 7일 안 경기만, 시각은 KST, 국가대표는 A매치 이름', () => {
    const games = [
      { gameId: 'g1', categoryId: 'amatch', gameDateTime: '2026-10-14T20:00:00', homeTeamName: '대한민국', awayTeamName: '파라과이' },
      { gameId: 'g2', categoryId: 'kbo', gameDateTime: '2026-10-11T08:00:00', homeTeamName: '삼성', awayTeamName: 'KT' }, // 이미 지남(KST 08시)
      { gameId: 'g3', categoryId: 'kleague', gameDateTime: '2026-10-25T14:00:00', homeTeamName: '광주', awayTeamName: '울산' }, // 7일 밖
    ];
    const events = sportsEvents(games, now, 7);
    expect(events.map((e) => e.id)).toEqual(['sports-g1']);
    expect(events[0]).toMatchObject({ kind: 'sports', league: '축구 국가대표 A매치', title: '대한민국 vs 파라과이', startsAt: '2026-10-14T11:00:00.000Z', dateOnly: false });
  });

  it('기사 속 예정 — 일정 신호(첫 방송 · 컴백 · 개봉 …)와 7일 안 앞날짜가 함께 있는 기사만, 같은 제목은 하나로', () => {
    const items = [
      { title: '&lt;데블스 플랜3&gt; 오는 14일 첫 방송…출연진 16명 공개', description: '넷플릭스 데블스 플랜3가 오는 14일 첫 방송된다.', link: 'https://n.news/1', pubDate: 'Sat, 11 Oct 2026 08:00:00 +0900' },
      { title: '데블스 플랜3 오는 14일 첫 방송…출연진 16명 공개', description: '같은 기사 재전송', link: 'https://n.news/2', pubDate: 'Sat, 11 Oct 2026 08:10:00 +0900' },
      { title: '지난 3일 개봉한 영화 흥행', description: '지난 3일 개봉', link: 'https://n.news/3', pubDate: 'Sat, 11 Oct 2026 08:00:00 +0900' },
      { title: '가수 A 오는 30일 컴백', description: '오는 30일 컴백', link: 'https://n.news/4', pubDate: 'Sat, 11 Oct 2026 08:00:00 +0900' },
      { title: '오는 13일 날씨 맑음', description: '오는 13일 전국 맑음', link: 'https://n.news/5', pubDate: 'Sat, 11 Oct 2026 08:00:00 +0900' },
    ];
    const events = scheduleEventsFromNews(items, now, 7);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'schedule', startsAt: '2026-10-13T15:00:00.000Z', dateOnly: true });
    expect(events[0].title).toBe('<데블스 플랜3> 오는 14일 첫 방송…출연진 16명 공개');
    expect(events[0].articles).toHaveLength(1);
  });
});

const event: UpcomingEvent = {
  id: 'sports-g1', kind: 'sports', league: '축구 국가대표 A매치', title: '대한민국 vs 파라과이', startsAt: '2026-10-14T11:00:00.000Z', dateOnly: false,
  articles: [
    { title: '홍명보호 10월 명단 발표…김민수 생애 첫 발탁', description: '대표팀은 파라과이전에 나설 26명을 발표했다. 측면 수비수 김민수가 생애 첫 발탁의 기쁨을 누렸다.', url: 'https://n.news/a', publishedAt: '2026-10-10T01:00:00Z' },
    { title: '이강인 부상 복귀 청신호', description: '이강인이 부상을 털고 대표팀에 돌아온다.', url: 'https://n.news/b', publishedAt: '2026-10-10T02:00:00Z' },
  ],
};

describe('주목할 사람 — 기사 인용 검사', () => {
  it('지시문은 사건 · 날짜 · 기사 문장과 "처음" 신호 · 인용 규칙 · JSON 을 담는다', () => {
    const p = buildWatchPrompt([event]);
    for (const s of ['대한민국 vs 파라과이', '김민수가 생애 첫 발탁', '첫 발탁', 'quote', 'JSON']) expect(p).toContain(s);
  });

  it('인용이 기사에 그대로 있고 이름 · 처음 신호가 인용 안에 있을 때만 남긴다(주소는 그 기사 주소로 고친다)', () => {
    const raw = { id: 'sports-g1', watch: [
      { name: '김민수', signal: '생애 첫 발탁', quote: '측면 수비수 김민수가 생애 첫 발탁의 기쁨을 누렸다.', url: 'https://지어낸주소', angles: ['김민수 프로필 — 소속팀 · 포지션 · 나이', '데뷔전 출전 시간과 활약 정리'], publishAt: '경기 종료 직후' },
      { name: '이강인', signal: '부상 복귀', quote: '이강인이 부상을 털고 대표팀에 돌아온다.', url: '', angles: ['복귀전 몸 상태'], publishAt: '' },
      { name: '손흥민', signal: '첫 발탁', quote: '손흥민이 첫 발탁됐다.', url: '', angles: ['x'], publishAt: '' }, // 기사에 없는 인용 — 지어냄
      { name: '박지성', signal: '첫 발탁', quote: '측면 수비수 김민수가 생애 첫 발탁의 기쁨을 누렸다.', url: '', angles: ['x'], publishAt: '' }, // 인용에 이름 없음
    ] };
    const watch = validateWatch(event, raw);
    expect(watch.map((w) => w.name)).toEqual(['김민수']); // 이강인 인용엔 신호 낱말(첫 · 처음 · 데뷔 · 복귀 …)이 없다 — 아래에서 확인
    expect(watch[0].url).toBe('https://n.news/a');
    expect(watch[0].publishAt).toBe('경기 종료 직후');
  });

  it('복귀 · 데뷔 · 컴백 같은 신호도 인용 안에 그 낱말이 있어야 한다', () => {
    const raw = { id: 'sports-g1', watch: [{ name: '이강인', signal: '부상 복귀', quote: '이강인이 부상을 털고 대표팀에 돌아온다.', angles: ['복귀전'], publishAt: '' }] };
    expect(validateWatch(event, raw)).toEqual([]); // '돌아온다'는 신호 낱말이 아니다 — 인용에 '복귀'가 없다
    const ok = { ...event, articles: [...event.articles, { title: 't', description: '이강인이 부상 복귀전을 치른다.', url: 'https://n.news/c', publishedAt: '2026-10-10T03:00:00Z' }] };
    expect(validateWatch(ok, { id: 'sports-g1', watch: [{ name: '이강인', signal: '부상 복귀', quote: '이강인이 부상 복귀전을 치른다.', angles: ['복귀전 몸 상태'], publishAt: '' }] }).map((w) => w.url)).toEqual(['https://n.news/c']);
  });
});

describe('카드', () => {
  it('주목할 사람이 있는 사건만, 날짜순 — 사람마다 실측(검색량 · 블로그 문서 수)과 자동완성을 붙인다', () => {
    const later: UpcomingEvent = { ...event, id: 'later', startsAt: '2026-10-16T11:00:00.000Z' };
    const empty: UpcomingEvent = { ...event, id: 'empty', startsAt: '2026-10-12T11:00:00.000Z' };
    const w = { name: '김민수', signal: '생애 첫 발탁', quote: 'q', url: 'https://n.news/a', angles: ['a'], publishAt: '경기 종료 직후' };
    const cards = upcomingCards([later, empty, event], new Map([['later', [w]], ['sports-g1', [w]], ['empty', []]]), { volumes: { 김민수: 12000 }, documents: { 김민수: 37 }, suggestions: { 김민수: ['김민수 축구', '김민수 나이'] } });
    expect(cards.map((c) => c.id)).toEqual(['sports-g1', 'later']);
    expect(cards[0].watch[0]).toMatchObject({ name: '김민수', searchVolume: 12000, documentCount: 37, suggestions: ['김민수 축구', '김민수 나이'] });
    expect(cards[0].articleCount).toBe(2);
  });
});
