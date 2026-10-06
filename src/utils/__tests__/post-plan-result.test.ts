/**
 * 설계실 3차 — 결과 확인(2026-10-06). 발행 글의 3일 · 7일 뒤 실제 순위와 어드바이저 홈판 유입을 '고를 때 판정' 옆에 남긴다.
 * 순위는 블로그탭 화면의 data-url 순서로 센다 — blog.naver.com 만 세면 티스토리 등 외부 결과만큼 앞당겨진다(메모리: 네이버 순위 실측법).
 */
import { describe, expect, it } from 'vitest';
import { dueResultChecks, homefeedForPost, logNoOf, rankFromBlogTab } from '../post-plan/post-plan-result';

const DAY = 86400000;

describe('rankFromBlogTab — 블로그탭 data-url 순서로 내 글 순위', () => {
  const html = [
    '<li data-url="https://blog.naver.com/aaa/111"></li>',
    '<li data-url="https://kim4047.tistory.com/55"></li>',
    '<li data-url="https://blog.naver.com/aaa/111"></li>', // 같은 글 반복은 한 번만
    '<li data-url="https://m.blog.naver.com/leader_248/224427462115?referrerCode=1"></li>',
    '<li data-url="https://blog.naver.com/ccc/333"></li>',
  ].join('');
  it('외부 블로그도 한 자리로 세고, 모바일 · 추적값이 붙은 주소도 같은 글로 본다', () => {
    expect(rankFromBlogTab(html, 'https://blog.naver.com/leader_248/224427462115')).toEqual({ rank: 3, sampled: 4 });
  });
  it('없으면 순위 null · 읽은 개수는 남긴다', () => {
    expect(rankFromBlogTab(html, 'https://blog.naver.com/leader_248/999')).toEqual({ rank: null, sampled: 4 });
  });
  it('결과를 하나도 못 읽으면 sampled 0', () => {
    expect(rankFromBlogTab('<html>차단</html>', 'https://blog.naver.com/x/1')).toEqual({ rank: null, sampled: 0 });
  });
});

describe('dueResultChecks — 3일 · 7일 차례', () => {
  const at = Date.parse('2026-10-06T00:00:00Z');
  it('등록 후 3일이 지나면 3일 확인, 7일이 지나면 7일 확인 — 이미 잰 날은 다시 안 잰다', () => {
    expect(dueResultChecks({ registeredAt: new Date(at).toISOString(), checks: [] }, at + 2 * DAY)).toEqual([]);
    expect(dueResultChecks({ registeredAt: new Date(at).toISOString(), checks: [] }, at + 3 * DAY)).toEqual([3]);
    expect(dueResultChecks({ registeredAt: new Date(at).toISOString(), checks: [{ day: 3 }] }, at + 8 * DAY)).toEqual([7]);
    expect(dueResultChecks({ registeredAt: new Date(at).toISOString(), checks: [{ day: 3 }, { day: 7 }] }, at + 30 * DAY)).toEqual([]);
  });
});

describe('홈판 유입 — 어드바이저 글별 기록에서 같은 글 번호', () => {
  it('글 주소의 글 번호(logNo)와 어드바이저 contentId 를 맞춘다', () => {
    expect(logNoOf('https://blog.naver.com/leader_248/224427462115')).toBe('224427462115');
    expect(logNoOf('https://m.blog.naver.com/PostView.naver?blogId=leader_248&logNo=224427462115')).toBe('224427462115');
    const latest = { day: '2026-10-08', posts: [{ contentId: '224427462115', title: '부활남', views: 120, homefeed: { count: 37, ratio: 0.31 } }, { contentId: '1', homefeed: null }] };
    expect(homefeedForPost(latest, 'https://blog.naver.com/leader_248/224427462115')).toEqual({ day: '2026-10-08', count: 37, views: 120 });
    expect(homefeedForPost(latest, 'https://blog.naver.com/leader_248/5')).toBeNull();
    expect(homefeedForPost(null, 'https://blog.naver.com/leader_248/224427462115')).toBeNull();
  });
});

describe('어드바이저 contentId 는 글 주소 전체다(2026-10-06 실측)', () => {
  it('"http://blog.naver.com/아이디/글번호" 형식도 같은 글로 맞춘다', () => {
    const latest = { day: '2026-10-05', posts: [{ contentId: 'http://blog.naver.com/leader_248/224412198142', views: 38, homefeed: { count: 2, ratio: 0.05 } }] };
    expect(homefeedForPost(latest, 'https://blog.naver.com/leader_248/224412198142')).toEqual({ day: '2026-10-05', count: 2, views: 38 });
  });
});
