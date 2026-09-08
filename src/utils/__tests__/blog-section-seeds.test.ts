import { describe, expect, it } from 'vitest';
import {
    BLOG_SECTION_DIRECTORY, blogSectionUrl, extractSectionHeads, parseBlogSectionTitles, sectionSourceTag,
} from '../blog-section-seeds';
import { NAVER_BLOG_TOPICS } from '../naver-blog-topics';

/** 네이버 블로그 섹션 씨앗 창구(2026-09-09) — 32주제 대응·응답 파싱·구절 머리말. */
describe('BLOG_SECTION_DIRECTORY', () => {
    it('32주제 전부에 섹션 번호가 있고 번호가 겹치지 않는다', () => {
        const labels = NAVER_BLOG_TOPICS.map((t) => t.label);
        for (const label of labels) expect(BLOG_SECTION_DIRECTORY[label], label).toBeGreaterThan(0);
        expect(new Set(Object.values(BLOG_SECTION_DIRECTORY)).size).toBe(labels.length);
    });
    it('실측으로 확인한 번호 — 문학·책 5, IT·컴퓨터 30, 원예·재배 36', () => {
        expect(BLOG_SECTION_DIRECTORY['문학·책']).toBe(5);
        expect(BLOG_SECTION_DIRECTORY['IT·컴퓨터']).toBe(30);
        expect(BLOG_SECTION_DIRECTORY['원예·재배']).toBe(36);
    });
    it('주소와 꼬리표', () => {
        expect(blogSectionUrl(5, 2)).toBe('https://section.blog.naver.com/ajax/DirectoryPostList.naver?directorySeq=5&pageNo=2');
        expect(sectionSourceTag('사진')).toBe('section:사진');
    });
});

describe('parseBlogSectionTitles', () => {
    const body = `)]}',\n{"result":{"totalCount":1000,"postList":[{"title":"9월 대구 가볼만한곳 화원 &lt;배롱나무길&gt;","logNo":1},{"title":"<b>구월동맛집</b> 스시사쿠","logNo":2},{"title":"","logNo":3}]}}`;
    it('접두사를 걷고 제목만, HTML 태그·엔티티는 푼다', () => {
        expect(parseBlogSectionTitles(body)).toEqual(['9월 대구 가볼만한곳 화원 <배롱나무길>', '구월동맛집 스시사쿠']);
    });
    it('깨진 응답은 빈 배열 — 회차를 죽이지 않는다', () => {
        expect(parseBlogSectionTitles('<html>차단</html>')).toEqual([]);
        expect(parseBlogSectionTitles('')).toEqual([]);
    });
});

describe('extractSectionHeads', () => {
    const titles = [
        '9월 대구 가볼만한곳 화원 구라리 배롱나무길 실시간',
        '대구 가볼만한곳 추천 수성못 야경',
        '아는 사람만 몰래 가는 9월 10월 가을 절경 대구 가볼만한곳',
        '구월동맛집 스시사쿠 구월점, 부모님 모시고 갔다',
        '압구정로데오 맛집 이도청담 데이트하기 좋은 곳',
        '청년전용창업자금 대출｜신청할 수 있는 조건보다',
        '청년전용창업자금 대출 후기 정리',
    ];
    it('여러 제목에 되풀이되는 구절이 앞에 온다 — 대구 가볼만한곳', () => {
        const heads = extractSectionHeads(titles, { minCount: 2, limit: 10 });
        expect(heads[0]).toBe('대구 가볼만한곳');
        expect(heads).toContain('청년전용창업자금 대출');
    });
    it('숫자·날짜·잡음 낱말(추천·후기·정리)은 머리말이 아니다', () => {
        const heads = extractSectionHeads(titles, { minCount: 1, limit: 200 });
        for (const bad of ['9월', '10월', '추천', '후기', '정리', '9']) expect(heads).not.toContain(bad);
    });
    it('15자(공백 제외)를 넘는 구절은 만들지 않고, accept 로 거른다', () => {
        const heads = extractSectionHeads(['가나다라마바사아자차 카타파하가나다라마', '가나다라마바사아자차 카타파하가나다라마'], { minCount: 1 });
        for (const h of heads) expect(h.replace(/\s+/g, '').length).toBeLessThanOrEqual(15);
        expect(extractSectionHeads(titles, { minCount: 1, accept: (h) => h !== '대구 가볼만한곳' })).not.toContain('대구 가볼만한곳');
    });
    it('같은 제목이 두 번 와도 한 번만 센다', () => {
        expect(extractSectionHeads(['수성못 야경', '수성못 야경'], { minCount: 2 })).toEqual([]);
    });
});
