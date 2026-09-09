import { describe, expect, it } from 'vitest';
import { describeBlogFacts, monthLabel, rhythmLabel, roParticle } from '../blog-class/plain-words';
import type { BlogActivity, BlogSnapshot } from '../blog-class/naver-blog-facts';

/**
 * 화면에 나가는 말이라 뜻이 바뀌면 사용자가 오해한다. 그래서 문장 자체를 테스트한다.
 * 규칙(하네스 5절): 못 잰 값은 문장을 아예 만들지 않는다 · 판단·확률·점수는 만들지 않는다.
 */
const snapshot = (over: Partial<BlogSnapshot> = {}): BlogSnapshot => ({
  blogId: 'me', blogName: '내 블로그', nickName: '나', declaredTopic: 'IT·컴퓨터',
  todayVisitors: 1217, totalVisitors: 139744068, subscribers: 1529266, postCount: 1336,
  officialBlog: false, powerBlog: false, ...over,
});

const activity = (over: Partial<BlogActivity> = {}): BlogActivity => ({
  totalPosts: 50, oldestPostOn: '2010-03-24', newestPostOn: '2026-09-07', monthsRunning: 198,
  recent30: 12, recent90: 30, medianGapDays: 2, searchableCount: 50, blockedCount: 0, ...over,
});

describe('말 만들기 조각', () => {
  it('개설 시점을 년·월로 읽는다', () => {
    expect(monthLabel('2010-03-24')).toBe('2010년 3월');
    expect(monthLabel('2026-12-01')).toBe('2026년 12월');
    expect(monthLabel(null)).toBeNull();
    expect(monthLabel('어제')).toBeNull();
  });

  it('발행 간격을 사람 말로 바꾼다', () => {
    expect(rhythmLabel(0)).toBe('거의 매일 한 편씩 올려요');
    expect(rhythmLabel(1)).toBe('거의 매일 한 편씩 올려요');
    expect(rhythmLabel(3)).toBe('보통 3일에 한 편씩 올려요');
    expect(rhythmLabel(21)).toBe('보통 3주에 한 편씩 올려요');
    expect(rhythmLabel(90)).toBe('보통 3달에 한 편씩 올려요');
    expect(rhythmLabel(null)).toBeNull();
  });

  it("받침에 따라 '로'와 '으로'를 가려 쓴다 — 조사가 어긋나면 화면에서 티가 난다", () => {
    expect(roParticle('IT·컴퓨터')).toBe('로');   // 받침 없음
    expect(roParticle('맛집')).toBe('으로');      // ㅂ 받침
    expect(roParticle('일상·생각')).toBe('으로'); // ㄱ 받침
    expect(roParticle('게임')).toBe('으로');      // ㅁ 받침
    expect(roParticle('한글')).toBe('로');        // ㄹ 받침은 '로'
    expect(roParticle('IT')).toBe('로');          // 한글이 아니면 '로'
  });
});

describe('블로그 사실 카드', () => {
  it('맨 위 한 줄에 시작 시점과 글 수를 담는다', () => {
    const card = describeBlogFacts({ snapshot: snapshot(), activity: activity(), oldestPostOn: '2010-03-24' });
    expect(card.headline).toBe('2010년 3월부터 글 1,336개를 썼어요.');
  });

  it('최근 활동과 발행 리듬을 한 문장으로 붙인다', () => {
    const card = describeBlogFacts({ snapshot: snapshot(), activity: activity() });
    expect(card.lines[0].text).toBe('최근 30일에 12개를 올렸어요. 보통 2일에 한 편씩 올려요.');
  });

  it('최근 30일에 글이 없으면 그 사실을 그대로 말한다', () => {
    const card = describeBlogFacts({ snapshot: snapshot(), activity: activity({ recent30: 0, medianGapDays: null }) });
    expect(card.lines[0].text).toBe('최근 30일에 올린 글이 없어요.');
  });

  it('방문자·이웃·주제를 초보자 말로 적는다', () => {
    const card = describeBlogFacts({ snapshot: snapshot(), activity: activity() });
    const texts = card.lines.map((line) => line.text);
    expect(texts).toContain('오늘 방문자 1,217명, 이웃 1,529,266명이에요.');
    expect(texts).toContain("블로그 주제는 'IT·컴퓨터'로 되어 있어요.");
  });

  it("받침 있는 주제는 '으로'로 적는다", () => {
    const card = describeBlogFacts({ snapshot: snapshot({ declaredTopic: '맛집' }), activity: activity() });
    expect(card.lines.map((l) => l.text)).toContain("블로그 주제는 '맛집'으로 되어 있어요.");
  });

  it('못 잰 값은 문장을 아예 만들지 않는다 — 0명이라고 쓰지 않는다', () => {
    const card = describeBlogFacts({
      snapshot: snapshot({ todayVisitors: null, subscribers: null, declaredTopic: null }),
      activity: activity(),
    });
    const joined = card.lines.map((line) => line.text).join(' ');
    expect(joined).not.toContain('방문자');
    expect(joined).not.toContain('주제');
    expect(joined).not.toContain('0명');
  });

  it('이웃을 못 읽으면 방문자만 말한다', () => {
    const card = describeBlogFacts({ snapshot: snapshot({ subscribers: null }), activity: activity() });
    expect(card.lines.map((l) => l.text)).toContain('오늘 방문자 1,217명이에요.');
  });

  it('인플루언서면 알리고, 아니면 아무 말도 하지 않는다', () => {
    const yes = describeBlogFacts({ snapshot: snapshot(), activity: activity(), isInfluencer: true });
    expect(yes.lines.map((l) => l.text)).toContain('인플루언서로 등록돼 있어요.');
    const no = describeBlogFacts({ snapshot: snapshot(), activity: activity(), isInfluencer: false });
    expect(no.lines.map((l) => l.text).join(' ')).not.toContain('인플루언서');
    const unknown = describeBlogFacts({ snapshot: snapshot(), activity: activity(), isInfluencer: null });
    expect(unknown.lines.map((l) => l.text).join(' ')).not.toContain('인플루언서');
  });

  it('검색이 막힌 글은 알림으로 올리고, 다 열려 있으면 안심 문장으로 내린다', () => {
    const ok = describeBlogFacts({ snapshot: snapshot(), activity: activity(), sampledPosts: 50 });
    expect(ok.notices).toHaveLength(0);
    expect(ok.lines.map((l) => l.text)).toContain('최근 50개 글 모두 검색에 나올 수 있는 상태예요.');

    const hidden = describeBlogFacts({
      snapshot: snapshot(), activity: activity({ searchableCount: 47 }), sampledPosts: 50,
    });
    expect(hidden.notices[0].text)
      .toBe("최근 50개 중 3개가 '검색 허용'이 꺼져 있어요. 그 글은 검색에 나오지 않아요.");
    expect(hidden.lines.map((l) => l.text).join(' ')).not.toContain('모두 검색에 나올 수 있는');
  });

  it('막힌 글도 알림으로 알린다', () => {
    const card = describeBlogFacts({ snapshot: snapshot(), activity: activity({ blockedCount: 2 }) });
    expect(card.notices.map((n) => n.text)).toContain('네이버가 막은 글이 2개 있어요.');
  });

  it('모든 문장에 근거가 붙는다 — 초보자가 이 숫자를 믿어도 되는지 확인할 수 있어야 한다', () => {
    const card = describeBlogFacts({
      snapshot: snapshot(), activity: activity({ searchableCount: 49, blockedCount: 1 }),
      isInfluencer: true, measuredAt: '9월 10일 05:12',
    });
    for (const line of [...card.lines, ...card.notices]) {
      expect(line.evidence).toContain('9월 10일 05:12');
      expect(line.evidence.length).toBeGreaterThan(10);
    }
  });

  it('아무것도 못 읽었으면 빈 카드를 준다 — 던지지 않는다', () => {
    const card = describeBlogFacts({ snapshot: null, activity: null });
    expect(card.headline).toBeNull();
    expect(card.lines).toEqual([]);
    expect(card.notices).toEqual([]);
  });

  it('글 목록을 못 읽으면 글 이야기를 아예 하지 않고 다시 눌러 달라고만 한다', () => {
    const card = describeBlogFacts({
      snapshot: snapshot({ postCount: 0, todayVisitors: 0, subscribers: 0 }),
      activity: null, postListUnavailable: true,
    });
    expect(card.headline).toBeNull(); // '글 0개를 썼어요' 라고 말하지 않는다
    expect(card.notices.map((n) => n.text))
      .toContain('네이버 글 목록이 지금 열리지 않아요. 잠시 뒤에 다시 눌러 주세요.');
    const all = card.lines.map((l) => l.text).join(' ');
    expect(all).not.toContain('올렸어요');
    expect(all).not.toContain('검색에 나올 수 있는');
  });

  it('목록을 못 읽어도 블로그 화면에서 읽은 값은 그대로 말한다', () => {
    const card = describeBlogFacts({
      snapshot: snapshot(), activity: null, postListUnavailable: true, oldestPostOn: '2010-03-24',
    });
    expect(card.lines.map((l) => l.text)).toContain('오늘 방문자 1,217명, 이웃 1,529,266명이에요.');
    expect(card.headline).toBe('2010년 3월부터 글 1,336개를 썼어요.');
  });

  it('점수·확률·등급 같은 말을 만들지 않는다', () => {
    const card = describeBlogFacts({
      snapshot: snapshot(), activity: activity({ searchableCount: 48, blockedCount: 1 }), isInfluencer: true,
    });
    const all = [card.headline ?? '', ...card.lines.map((l) => l.text), ...card.notices.map((n) => n.text)].join(' ');
    for (const banned of ['지수', '점수', '확률', '등급', '상위노출', '예상', '추천']) {
      expect(all).not.toContain(banned);
    }
  });
});
