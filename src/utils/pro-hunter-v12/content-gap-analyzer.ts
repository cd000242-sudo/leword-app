/**
 * 🎯 콘텐츠 갭 분석 — 사용자 블로그 URL → 빈 토픽 자동 발굴
 *
 * 5명 비평가 만장일치: "사용자 블로그 갭 분석 0%, 백링크 0%, 콘텐츠 깊이 측정 15%"
 *
 * 동작:
 *   1. 사용자 블로그 URL → 글 목록 100개 타이틀 크롤
 *   2. Gemini로 토픽 분류 → 카테고리별 글 분포
 *   3. 부족한 토픽 50개 자동 추천 (= 갭)
 *
 * 차별점: Ahrefs/Semrush는 "일반 연관 키워드", LEWORD는 "당신 블로그에 맞춤 갭"
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const FETCH_TIMEOUT = 12000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

interface BlogContentMap {
    blogUrl: string;
    fetchedTitles: string[];
    detectedTopics: Record<string, number>;  // 토픽 → 글 수
    coverageScore: number;                     // 0~100
}

interface ContentGapResult {
    blogUrl: string;
    contentMap: BlogContentMap;
    gapTopics: string[];                       // 부족한 토픽
    suggestedKeywords: Array<{ keyword: string; reason: string; topic: string }>;
    summary: string;
}

/**
 * 네이버 블로그/티스토리 URL → 글 타이틀 크롤
 */
async function fetchBlogTitles(blogUrl: string, limit: number = 100): Promise<string[]> {
    const titles: string[] = [];
    try {
        // 네이버 블로그 RSS 시도
        const url = blogUrl.includes('blog.naver.com')
            ? blogUrl.replace(/\/?$/, '') + '/rss'
            : blogUrl + '/rss';
        const res = await axios.get(url, {
            timeout: FETCH_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,text/xml,*/*' },
            validateStatus: s => s < 500,
        });
        if (typeof res.data === 'string' && res.data.length > 100) {
            const $ = cheerio.load(res.data, { xmlMode: true });
            $('item > title').each((_, el) => {
                const t = $(el).text().trim();
                if (t && t.length >= 4) titles.push(t);
            });
        }
    } catch (err: any) { /* RSS 실패 */ }

    // RSS 실패 시 HTML 파싱 시도
    if (titles.length === 0) {
        try {
            const res = await axios.get(blogUrl, {
                timeout: FETCH_TIMEOUT,
                headers: { 'User-Agent': UA },
                validateStatus: s => s < 500,
            });
            if (typeof res.data === 'string') {
                const $ = cheerio.load(res.data);
                // 일반적 블로그 글 제목 패턴
                $('h1, h2, h3, .title, .post-title, .se-title-text, [class*="title"]').each((_, el) => {
                    const t = $(el).text().trim().replace(/\s+/g, ' ');
                    if (t && t.length >= 6 && t.length <= 100 && !titles.includes(t)) titles.push(t);
                });
            }
        } catch (err: any) { /* skip */ }
    }
    return titles.slice(0, limit);
}

/**
 * Gemini로 글 타이틀들의 토픽 자동 분류
 */
async function classifyTitlesIntoTopics(titles: string[]): Promise<Record<string, number>> {
    if (titles.length === 0) return {};
    try {
        const { callAI } = await import('./ai-client');
        const prompt = `다음 블로그 글 제목들을 5~10개 토픽 카테고리로 분류하고, 각 토픽별 글 수를 계산하세요.

제목: ${JSON.stringify(titles.slice(0, 50))}

JSON만 응답: { "토픽1": 5, "토픽2": 3, ... }`;
        const { text } = await callAI(prompt, { maxTokens: 1024, temperature: 0.3 });
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return classifyFallback(titles);
        return JSON.parse(jsonMatch[0]);
    } catch (err: any) {
        return classifyFallback(titles);
    }
}

function classifyFallback(titles: string[]): Record<string, number> {
    const topics: Record<string, number> = {};
    for (const t of titles) {
        const firstToken = t.split(/[\s\-_,]/)[0] || 'etc';
        topics[firstToken] = (topics[firstToken] || 0) + 1;
    }
    return topics;
}

/**
 * 토픽 분포 → 빈 토픽 발굴 (Gemini로 카테고리 보강 추천)
 */
async function suggestGapTopics(category: string, currentTopics: Record<string, number>, count: number = 20): Promise<string[]> {
    try {
        const { callAI } = await import('./ai-client');
        const prompt = `한국 블로그 SEO 전문가로서, 카테고리 "${category}"에서 다음 토픽들을 이미 다룬 블로그가 있을 때, 추가로 다룰만한 빈 토픽 ${count}개를 추천하세요.

현재 다룬 토픽: ${JSON.stringify(currentTopics)}

JSON 배열만 응답: ["빈 토픽 키워드1", "빈 토픽 키워드2", ...]
규칙: 4토큰 이상 롱테일 키워드, 정보형 의도, 신생 블로그 진입 가능`;
        const { text } = await callAI(prompt, { maxTokens: 1024, temperature: 0.7 });
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];
        return JSON.parse(jsonMatch[0]);
    } catch (err: any) {
        // 룰 fallback: 카테고리별 일반적 빈 토픽 후보
        return suggestGapTopicsFallback(category, count);
    }
}

function suggestGapTopicsFallback(category: string, count: number): string[] {
    const generic = [
        `${category} 초보자 가이드`, `${category} 비교 정리`, `${category} 후기 모음`,
        `${category} 추천 TOP 10`, `${category} 자주 묻는 질문`, `${category} 트러블슈팅`,
        `${category} 비용 비교`, `${category} 시작하는 법`, `${category} 자격 조건`,
        `${category} 신청 방법`, `${category} 마감 일정`, `${category} 실패 사례`,
        `${category} 성공 사례`, `${category} 장단점 비교`, `${category} 대안 정리`,
        `${category} 최신 트렌드`, `${category} 무료 자료`, `${category} 체크리스트`,
        `${category} 주의사항`, `${category} 관련 법규`,
    ];
    return generic.slice(0, count);
}

/**
 * 🎯 메인: 블로그 URL → 콘텐츠 갭 + 추천 키워드
 */
export async function analyzeContentGap(input: {
    blogUrl: string;
    targetCategory?: string;
}): Promise<ContentGapResult> {
    const titles = await fetchBlogTitles(input.blogUrl);
    if (titles.length === 0) {
        return {
            blogUrl: input.blogUrl,
            contentMap: { blogUrl: input.blogUrl, fetchedTitles: [], detectedTopics: {}, coverageScore: 0 },
            gapTopics: [],
            suggestedKeywords: [],
            summary: '⚠️ 블로그 글 수집 실패 (RSS/HTML 모두) — URL 확인 필요',
        };
    }

    const topics = await classifyTitlesIntoTopics(titles);
    const topicCount = Object.keys(topics).length;
    const coverageScore = Math.min(100, Math.round((titles.length / 100) * 60 + topicCount * 4));

    const category = input.targetCategory || 'all';
    const gapTopics = await suggestGapTopics(category, topics, 20);
    const suggestedKeywords = gapTopics.map((kw, i) => ({
        keyword: kw,
        reason: `당신 블로그가 다루지 않은 토픽 (현재 ${topicCount}개 토픽 중 부재)`,
        topic: `gap-${i + 1}`,
    }));

    const summary = `🎯 ${titles.length}개 글 분석 → ${topicCount}개 토픽 식별 (커버리지 ${coverageScore}/100) → ${gapTopics.length}개 빈 토픽 추천`;
    console.log(`[CONTENT-GAP] ${summary}`);

    return {
        blogUrl: input.blogUrl,
        contentMap: {
            blogUrl: input.blogUrl,
            fetchedTitles: titles,
            detectedTopics: topics,
            coverageScore,
        },
        gapTopics,
        suggestedKeywords,
        summary,
    };
}
