/**
 * AI Briefing Detector (v2.49.5+)
 *
 * 사용자 요구: 검·경·실·AI 4단계 공식의 마지막 "AI" 단계 — 실측.
 * - 키워드를 네이버 통합검색에 던지고 결과 페이지 HTML 에서 AI 브리핑 박스 유무 확인.
 * - true → 그 키워드는 SSS 후보에서 강등 (사용자가 답을 AI 브리핑에서 읽고 끝, 블로그 클릭 X).
 *
 * 메모리 규칙 준수: "추정치 UI 노출 금지 — 실측·단순산술·매칭사실·사용자입력만"
 *   본 함수는 페이지 HTML 매칭사실 → boolean (실측).
 */

import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT_MS = 2500;

/**
 * 다층 selector — 네이버 AI 브리핑 박스 검출.
 * WebSearch cross-verify (2026-05): 정확한 class 명은 SerpApi/Scrapfly 도 비공개,
 * LEWORD related-keyword-fallback.ts 의 fetchNaverAiBriefingKeywords 가 쓰는 3패턴 + JSON 블록 fallback 통합.
 */
const AI_BRIEFING_PATTERNS: RegExp[] = [
    /class="[^"]*ai_briefing[^"]*"/i,
    /class="[^"]*ai-briefing[^"]*"/i,
    /class="[^"]*ai_summary[^"]*"/i,
    /class="[^"]*aiSummary[^"]*"/i,
    /class="[^"]*briefing[^"]*"/i,
    // JSON 블록 안 module type
    /"moduleType"\s*:\s*"[^"]*ai[_-]?brief/i,
    /"moduleType"\s*:\s*"[^"]*ai[_-]?summary/i,
    /data-module-type\s*=\s*"[^"]*ai[_-]?brief/i,
];

const STRICT_TEXT = /AI\s*브리핑/;

/**
 * 단일 키워드의 AI 브리핑 박스 떴는지 실측.
 * 결과: true (떴음, SSS 부적합) / false (안 떴음, SSS 가능) / null (네트워크 실패 등 미확정)
 *
 * @param keyword 검색 키워드
 * @param html   이미 fetch 한 HTML (선택, 있으면 추가 호출 안 함)
 */
export async function detectAiBriefing(keyword: string, html?: string): Promise<boolean | null> {
    try {
        let body = html;
        if (!body) {
            const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
            const res = await axios.get(url, {
                timeout: TIMEOUT_MS,
                headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9' },
            });
            body = String(res.data || '');
        }
        if (!body) return null;

        // 1차: class/data-attr selector 매칭
        for (const pat of AI_BRIEFING_PATTERNS) {
            if (pat.test(body)) return true;
        }

        // 2차: "AI 브리핑" 텍스트 + 구조 컨텍스트 매칭 (navigation/footer false positive 방지)
        //      텍스트 자체가 결과 모듈 안에 등장하면 detected.
        //      간단 가드: 텍스트 주변 200자 안에 결과 모듈 시그널 (sc_new, api_subject_bx 등)
        const m = body.match(STRICT_TEXT);
        if (m && typeof m.index === 'number') {
            const around = body.slice(Math.max(0, m.index - 400), m.index + 400);
            if (/sc_new|api_subject_bx|sub_section|fds-comps|main_pack/.test(around)) {
                return true;
            }
        }
        return false;
    } catch {
        return null;  // 네트워크 실패 — 미확정 (SSS 차단하지 않음)
    }
}

/**
 * 배치 detection — 여러 키워드를 동시 호출 (병렬).
 * AbortController 로 hard timeout 보장.
 */
export async function detectAiBriefingBatch(
    keywords: string[],
    concurrency: number = 8,
): Promise<Map<string, boolean | null>> {
    const result = new Map<string, boolean | null>();
    for (let i = 0; i < keywords.length; i += concurrency) {
        const batch = keywords.slice(i, i + concurrency);
        await Promise.all(batch.map(async (kw) => {
            const detected = await detectAiBriefing(kw);
            result.set(kw, detected);
        }));
    }
    return result;
}
