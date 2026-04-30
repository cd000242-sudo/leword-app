/**
 * 👤 인플루언서/빈자리 감지 — 검색 1페이지 분석으로 진입 가능성 판정
 *
 * 2026-04-30 네이버 SERP 변경 대응:
 *   - 연관검색어 종료 → SmartBlock 비중 ↑
 *   - 인플루언서: in.naver.com/{handle} (신규 패턴)
 *   - HTML 클래스: fds-comps-* (신규)
 *   - 발행일 셀렉터: .sub_time, .user_info_inner span
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const FETCH_TIMEOUT = 10000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

export interface VacancyResult {
    keyword: string;
    totalSlotsAnalyzed: number;
    influencerCount: number;
    bigDomainCount: number;
    vacancySlots: number;
    freshnessGap: number;
    suggestedAction: string;
    domains: Array<{ domain: string; isInfluencer: boolean; isBigDomain: boolean; daysOld?: number; isFresh?: boolean }>;
    serpVersion: '2026-04' | 'legacy';
}

// 인플루언서 URL 패턴 (4/30 신규 + 기존)
const INFLUENCER_PATTERNS: RegExp[] = [
    /in\.naver\.com\/[a-z0-9_]+/i,                          // 4/30 신규: in.naver.com/handle
    /m\.blog\.naver\.com\/PostList\.naver/i,                // 모바일 인플루언서 PostList
    /blog\.naver\.com\/.*\?influencer=true/i,
    /post\.naver\.com\/[a-z0-9_]+\/influencer/i,
    /image\.naver\.com\/influencer/i,
];

// DA 50+ 추정 대형 사이트 (기존 30 → 110개로 확장)
const BIG_DOMAINS = new Set<string>([
    // 검색/포털
    'tistory.com', 'wikipedia.org', 'namu.wiki', 'wikitree.co.kr', 'kr.wikipedia.org',
    'news.naver.com', 'naver.com', 'kakao.com', 'daum.net', 'brunch.co.kr',
    // 소셜/영상
    'youtube.com', 'instagram.com', 'tiktok.com', 'facebook.com', 'twitter.com',
    // 정부 도메인
    'gov.kr', 'go.kr', 'or.kr', 'kostat.go.kr', 'mohw.go.kr', 'molit.go.kr',
    'nts.go.kr', 'lh.or.kr', 'hf.go.kr',
    // 대형 언론사
    'mk.co.kr', 'hankyung.com', 'mt.co.kr', 'chosun.com', 'donga.com',
    'hani.co.kr', 'joongang.co.kr', 'kbs.co.kr', 'mbc.co.kr', 'sbs.co.kr',
    'jtbc.co.kr', 'ytn.co.kr', 'yna.co.kr', 'newsis.com', 'segye.com',
    'munhwa.com', 'kookmin.com', 'seoul.co.kr', 'ohmynews.com', 'pressian.com',
    // 경제/금융
    'hankookilbo.com', 'edaily.co.kr', 'fnnews.com', 'mhj21.com',
    // IT 매체
    'zdnet.co.kr', 'etnews.com', 'inews24.com', 'bloter.net', 'itworld.co.kr',
    // 쇼핑/커머스
    'coupang.com', '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'ssg.com',
    'wemakeprice.com', 'tmon.co.kr', 'lotteon.com', 'oliveyoung.co.kr', 'musinsa.com',
    // 부동산/금융
    'land.naver.com', 'kbland.kr', 'r114.com', 'realestate114.co.kr', 'zigbang.com',
    // 학술/공공
    'kostat.go.kr', 'kosis.kr', 'data.go.kr', 'kostat.go.kr',
    // 의료 (병원)
    'amc.seoul.kr', 'snuh.org', 'samsunghospital.com', 'health.kr',
    // 여행
    'visitkorea.or.kr', 'tripadvisor.co.kr', 'agoda.com', 'booking.com',
    // 건강/뷰티 매체
    'hidoc.co.kr', 'kormedi.com', 'hankookilbo.com',
    // 자동차
    'bobaedream.co.kr', 'auto.naver.com', 'encar.com', 'kbchachacha.com',
    // 교육
    'megastudy.net', 'ebs.co.kr', 'classroom.google.com',
    // 게임
    'inven.co.kr', 'fmkorea.com', 'ruliweb.com', 'thisisgame.com',
    // 식품/요리
    '10000recipe.com', 'foodtv.com',
    // 여성/육아
    'mom.cafe.naver.com', 'momsdiary.co.kr',
    // 영상/엔터
    'kpopstarz.com', 'soompi.com', 'allkpop.com', 'newsen.com', 'osen.co.kr',
]);

// 발행일 파싱 셀렉터 (4/30 SERP 새 구조 + 기존 fallback)
const DATE_SELECTORS = [
    '.fds-info-sub-inner-text',     // 4/30 신규
    '.user_info_inner span',         // SmartBlock 블로그
    '.sub_time',                     // 통합검색
    '.txt_info',                     // 카페
    '.api_thumb_info',
];

/**
 * 키워드 → 검색 1페이지 분석
 */
export async function analyzeVacancy(keyword: string): Promise<VacancyResult> {
    try {
        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        const res = await axios.get(url, {
            timeout: FETCH_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9', 'Referer': 'https://www.naver.com/' },
            validateStatus: s => s < 500,
        });

        if (typeof res.data !== 'string') {
            return emptyVacancyResult(keyword, '응답 형식 오류');
        }

        const html: string = res.data;
        const $ = cheerio.load(html);

        // SERP 버전 자동 감지
        const isNew = html.includes('fds-comps-') || html.includes('data-template=');
        const serpVersion: VacancyResult['serpVersion'] = isNew ? '2026-04' : 'legacy';

        const domains: VacancyResult['domains'] = [];
        const seen = new Set<string>();

        // 결과 항목별로 발행일까지 함께 추출
        const itemSelector = isNew
            ? '.fds-comps-right-image-text-block, .fds-comps-keyword-text-block, .total_wrap, .api_subject_bx li'
            : '.total_wrap, .blog .list_info, .api_subject_bx li';

        $(itemSelector).each((_, item) => {
            if (domains.length >= 15) return false;

            const itemEl = $(item);
            const linkEl = itemEl.find('a[href*="://"]').first();
            const href = linkEl.attr('href') || '';

            try {
                const u = new URL(href);
                const domain = u.hostname.replace(/^www\./, '');
                if (seen.has(domain) || domain.includes('search.naver.com') || domain.length < 4) return;
                seen.add(domain);

                const isInfluencer = INFLUENCER_PATTERNS.some(p => p.test(href));
                const isBigDomain = Array.from(BIG_DOMAINS).some(d => domain.includes(d));

                // 발행일 추출
                let dateText = '';
                for (const sel of DATE_SELECTORS) {
                    const t = itemEl.find(sel).first().text().trim();
                    if (t) { dateText = t; break; }
                }
                const daysOld = parseDaysOld(dateText);
                const isFresh = daysOld != null ? daysOld <= 14 : undefined;

                domains.push({ domain, isInfluencer, isBigDomain, daysOld, isFresh });
                return;
            } catch { /* invalid URL */ }
        });

        // Item 셀렉터로 못 찾으면 a 태그 fallback
        if (domains.length < 5) {
            $('a[href*="://"]').each((_, el) => {
                if (domains.length >= 15) return false;
                const href = $(el).attr('href') || '';
                try {
                    const u = new URL(href);
                    const domain = u.hostname.replace(/^www\./, '');
                    if (seen.has(domain) || domain.includes('search.naver.com') || domain.length < 4) return;
                    seen.add(domain);
                    const isInfluencer = INFLUENCER_PATTERNS.some(p => p.test(href));
                    const isBigDomain = Array.from(BIG_DOMAINS).some(d => domain.includes(d));
                    domains.push({ domain, isInfluencer, isBigDomain });
                } catch { /* skip */ }
            });
        }

        const totalSlots = Math.min(10, domains.length);
        const top10 = domains.slice(0, 10);
        const influencerCount = top10.filter(d => d.isInfluencer).length;
        const bigDomainCount = top10.filter(d => d.isBigDomain).length;
        const occupied = influencerCount + bigDomainCount;
        const vacancySlots = Math.max(0, totalSlots - occupied);

        // 신선도 갭 — 발행 14일+ 글이 차지한 자리 수
        const stale = top10.filter(d => d.daysOld != null && d.daysOld > 14).length;
        const freshnessGap = stale;

        let action: string;
        if (vacancySlots >= 7 && influencerCount === 0) action = '🟢 진입 매우 쉬움 — 즉시 발행';
        else if (vacancySlots >= 5) action = '✅ 진입 가능 — 제목 최적화 후 발행';
        else if (vacancySlots >= 3) action = '⚠️ 진입 어려움 — 차별화 제목 필수';
        else if (influencerCount >= 3) action = '🚫 인플루언서 점유 — 다른 키워드 권장';
        else action = '🔴 빅도메인 독점 — 진입 거의 불가';

        if (freshnessGap >= 3) action += ` · ⚡ 신선도 갭 ${freshnessGap}자리`;

        return {
            keyword,
            totalSlotsAnalyzed: totalSlots,
            influencerCount,
            bigDomainCount,
            vacancySlots,
            freshnessGap,
            suggestedAction: action,
            domains: top10,
            serpVersion,
        };
    } catch (err: any) {
        return emptyVacancyResult(keyword, err?.message || '크롤 실패');
    }
}

/**
 * "3시간 전" / "어제" / "2026.04.20." → 일수 변환
 */
function parseDaysOld(text: string): number | undefined {
    if (!text) return undefined;
    const t = text.trim();

    if (/방금|분 전|시간 전|오늘/.test(t)) return 0;
    if (/어제/.test(t)) return 1;
    if (/그제|2일 전/.test(t)) return 2;

    const dayMatch = t.match(/(\d+)\s*일\s*전/);
    if (dayMatch) return parseInt(dayMatch[1], 10);

    const weekMatch = t.match(/(\d+)\s*주\s*전/);
    if (weekMatch) return parseInt(weekMatch[1], 10) * 7;

    const monthMatch = t.match(/(\d+)\s*(개월|달)\s*전/);
    if (monthMatch) return parseInt(monthMatch[1], 10) * 30;

    const yearMatch = t.match(/(\d+)\s*년\s*전/);
    if (yearMatch) return parseInt(yearMatch[1], 10) * 365;

    // YYYY.MM.DD. 형식
    const dateMatch = t.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (dateMatch) {
        const [_, y, m, d] = dateMatch;
        const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
        const now = Date.now();
        return Math.floor((now - dt.getTime()) / 86400000);
    }
    return undefined;
}

function emptyVacancyResult(keyword: string, reason: string): VacancyResult {
    return {
        keyword,
        totalSlotsAnalyzed: 0,
        influencerCount: 0,
        bigDomainCount: 0,
        vacancySlots: 5,
        freshnessGap: 0,
        suggestedAction: `⚠️ 검색 분석 실패 (${reason}) — 빈자리 5/10 가정`,
        domains: [],
        serpVersion: 'legacy',
    };
}

/**
 * 키워드 배열 일괄 분석 (concurrency 제한)
 */
export async function batchAnalyzeVacancy(keywords: string[]): Promise<Map<string, VacancyResult>> {
    const result = new Map<string, VacancyResult>();
    const CONCURRENCY = 3;
    for (let i = 0; i < keywords.length; i += CONCURRENCY) {
        const batch = keywords.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(kw => analyzeVacancy(kw)));
        results.forEach((r, idx) => result.set(batch[idx], r));
        // 네이버 throttle 회피 — 200ms 대기
        if (i + CONCURRENCY < keywords.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    return result;
}
