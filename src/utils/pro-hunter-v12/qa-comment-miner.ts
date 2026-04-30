/**
 * 💬 Q&A 마이닝 — 자동완성에 없는 진짜 사용자 질문 발굴
 *
 * 5명 비평가 만장일치: "Q&A 마이닝 0%, 자동완성에 없는 long-tail 부재"
 *
 * 동작:
 *   1. 네이버 지식인 검색 → 질문 본문 + 댓글 채굴
 *   2. 유튜브 인기 영상 댓글 TOP 100 → 진짜 사용자 질문 추출
 *   3. Gemini로 질문형 키워드만 추출 + 정제
 *
 * 차별점: "콜레스테롤 음식" 검색자가 진짜 검색하기 전에 댓글로 묻는 것
 *   → "고지혈증 진단받았는데 식단", "혈관 청소 음식 진짜 효과", "콜레스테롤 약 안 먹고 낮추는 법"
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const FETCH_TIMEOUT = 10000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

interface QAQuestion {
    question: string;
    source: 'naver-kin' | 'youtube-comments' | 'reddit-comments';
    score: number;             // 댓글 추천수 / 조회수
    extractedKeywords: string[];
}

/**
 * 네이버 지식인 검색 → 질문 본문 추출
 */
async function fetchNaverKinQuestions(seed: string, limit: number = 30): Promise<QAQuestion[]> {
    try {
        const url = `https://kin.naver.com/search/list.naver?query=${encodeURIComponent(seed)}`;
        const res = await axios.get(url, {
            timeout: FETCH_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'text/html' },
            validateStatus: s => s < 500,
        });
        if (typeof res.data !== 'string') return [];
        const $ = cheerio.load(res.data);
        const questions: QAQuestion[] = [];

        // 지식인 검색 결과 패턴 (DOM 구조 변동 가능 — 다중 selector)
        const selectors = ['._title', '.tit', 'dl.basic1 dt a', '.question_box .tit'];
        for (const sel of selectors) {
            $(sel).each((_, el) => {
                const t = $(el).text().trim().replace(/\s+/g, ' ');
                if (t && t.length >= 8 && t.length <= 100 && questions.length < limit) {
                    // 질문형만 (?, 어떻게, 왜, 무엇)
                    if (/\?$|어떻게|왜|무엇|언제|어디|얼마|어느|뭐가/.test(t)) {
                        questions.push({
                            question: t,
                            source: 'naver-kin',
                            score: 50,
                            extractedKeywords: [],
                        });
                    }
                }
            });
            if (questions.length >= limit) break;
        }
        return questions.slice(0, limit);
    } catch (err: any) {
        console.warn('[QA-MINER] 지식인 실패:', err?.message);
        return [];
    }
}

/**
 * YouTube Data API로 인기 영상 댓글 마이닝 (질문형만)
 */
async function fetchYoutubeQuestionComments(seed: string, limit: number = 30): Promise<QAQuestion[]> {
    try {
        const { EnvironmentManager } = await import('../environment-manager');
        const env = EnvironmentManager.getInstance().getConfig();
        if (!env.youtubeApiKey) return [];

        // 1. 검색어로 영상 5개 찾기
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(seed)}&type=video&order=viewCount&maxResults=5&regionCode=KR&key=${env.youtubeApiKey}`;
        const searchRes = await axios.get(searchUrl, { timeout: FETCH_TIMEOUT });
        const videoIds = (searchRes.data?.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
        if (videoIds.length === 0) return [];

        // 2. 각 영상의 인기 댓글
        const questions: QAQuestion[] = [];
        for (const videoId of videoIds) {
            try {
                const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance&key=${env.youtubeApiKey}`;
                const cRes = await axios.get(commentsUrl, { timeout: FETCH_TIMEOUT, validateStatus: s => s < 500 });
                if (cRes.status !== 200 || !cRes.data?.items) continue;
                for (const item of cRes.data.items) {
                    const text: string = item.snippet?.topLevelComment?.snippet?.textDisplay || '';
                    const likes: number = item.snippet?.topLevelComment?.snippet?.likeCount || 0;
                    if (text.length >= 8 && text.length <= 200 && /\?$|어떻게|왜|무엇|어디서|얼마|뭐예요|있나요|되나요/.test(text)) {
                        questions.push({
                            question: text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80),
                            source: 'youtube-comments',
                            score: likes,
                            extractedKeywords: [],
                        });
                        if (questions.length >= limit) break;
                    }
                }
                if (questions.length >= limit) break;
            } catch { /* skip video */ }
        }
        return questions;
    } catch (err: any) {
        console.warn('[QA-MINER] YouTube 실패:', err?.message);
        return [];
    }
}

/**
 * Gemini로 질문 → SEO 키워드 추출
 */
async function extractKeywordsFromQuestions(questions: QAQuestion[]): Promise<QAQuestion[]> {
    if (questions.length === 0) return [];
    try {
        const { callAI } = await import('./ai-client');
        const prompt = `다음 사용자 질문들에서 SEO 검색 키워드를 추출하세요. 각 질문당 3개씩.

질문: ${JSON.stringify(questions.slice(0, 30).map(q => q.question))}

JSON 배열 응답: [["질문1키워드1", "질문1키워드2", "질문1키워드3"], ...]
규칙: 3토큰 이상 롱테일, 검색 가능한 자연스러운 표현`;
        const { text } = await callAI(prompt, { maxTokens: 1024, temperature: 0.4 });
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return questions.map(extractKeywordsFallback);
        const arr = JSON.parse(jsonMatch[0]);
        return questions.slice(0, arr.length).map((q, i) => ({ ...q, extractedKeywords: arr[i] || [] }));
    } catch (err: any) {
        // 룰 fallback: 질문에서 명사구 추출
        return questions.map(extractKeywordsFallback);
    }
}

function extractKeywordsFallback(q: QAQuestion): QAQuestion {
    return {
        ...q,
        extractedKeywords: q.question.split(/[?!.,:;]/)[0].trim().split(/\s+/).filter(t => t.length >= 2).slice(0, 4),
    };
}

/**
 * 💬 메인: seed → Q&A 마이닝 통합
 */
export async function mineQAKeywords(seed: string, options: { limit?: number } = {}): Promise<{
    questions: QAQuestion[];
    keywords: string[];
    bySource: Record<string, number>;
    summary: string;
}> {
    const limit = options.limit || 30;
    const t0 = Date.now();

    const [kin, youtube] = await Promise.allSettled([
        fetchNaverKinQuestions(seed, limit),
        fetchYoutubeQuestionComments(seed, limit),
    ]);

    const all: QAQuestion[] = [];
    if (kin.status === 'fulfilled') all.push(...kin.value);
    if (youtube.status === 'fulfilled') all.push(...youtube.value);

    // 점수 정렬 + 추출
    all.sort((a, b) => b.score - a.score);
    const enriched = await extractKeywordsFromQuestions(all.slice(0, limit));

    // 키워드 평탄화 + dedup
    const allKeywords = new Set<string>();
    for (const q of enriched) for (const k of q.extractedKeywords) if (k.length >= 4) allKeywords.add(k);

    const bySource: Record<string, number> = {};
    for (const q of enriched) bySource[q.source] = (bySource[q.source] || 0) + 1;

    const summary = `💬 Q&A ${enriched.length}개 → 키워드 ${allKeywords.size}개 (${Date.now() - t0}ms)`;
    console.log(`[QA-MINER] ${summary}`);

    return {
        questions: enriched,
        keywords: Array.from(allKeywords),
        bySource,
        summary,
    };
}
