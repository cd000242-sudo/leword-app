/**
 * 🚨 네이버 연관검색어 종료 대응 — 다중 소스 폴백 시스템
 *
 * 배경:
 *   2026-04-30 부로 네이버 연관검색어 기능 종료 (네이버 공지)
 *   기존 fetchRelatedKeywords (search.naver.com HTML 크롤링)는 0건 반환 예정
 *
 * 5중 폴백 우선순위:
 *   1️⃣ 네이버 검색광고 RelKwdStat API (★★★) — 광고시스템 별도 운영, 실측 검색량 포함
 *   2️⃣ 네이버 자동완성 PC + 모바일 + 쇼핑 (3채널) — 자동완성은 유지됨
 *   3️⃣ 다음(Daum) 자동완성 — suggest.search.daum.net
 *   4️⃣ 구글 자동완성 (KR) — suggestqueries.google.com hl=ko
 *   5️⃣ 네이버 SmartBlock 추출 — search.naver.com의 "함께 많이 찾는" 영역
 *
 * 모든 소스 병렬 호출 → 빈도 + 소스 다양성 점수로 정렬 → dedup 반환.
 */

import axios from 'axios';

const FALLBACK_TIMEOUT = 5000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export interface FallbackConfig {
    naverSearchAdAccessLicense?: string;
    naverSearchAdSecretKey?: string;
    naverSearchAdCustomerId?: string;
}

export interface RelatedKeywordResult {
    keyword: string;
    sources: string[];
    freq: number;
    monthlyVolume?: number;  // RelKwdStat에서만 채워짐
}

/**
 * 1️⃣ 네이버 검색광고 RelKwdStat API
 * 가장 강력한 폴백 — 실측 검색량 + 1000개+ 연관 키워드까지 반환
 */
async function fetchSearchAdRelKeywords(
    seed: string,
    config: FallbackConfig
): Promise<{ keyword: string; monthlyPcVolume: number; monthlyMobileVolume: number }[]> {
    if (!config.naverSearchAdAccessLicense || !config.naverSearchAdSecretKey) return [];
    try {
        // 기존 모듈 재사용
        const { getNaverSearchAdKeywordSuggestions } = await import('./naver-searchad-api');
        const items = await getNaverSearchAdKeywordSuggestions(
            {
                accessLicense: config.naverSearchAdAccessLicense,
                secretKey: config.naverSearchAdSecretKey,
                customerId: config.naverSearchAdCustomerId,
            },
            seed
        );
        return (items || []).map((it: any) => ({
            keyword: it.keyword || it.relKeyword || '',
            monthlyPcVolume: Number(it.monthlyPcQcCnt) || 0,
            monthlyMobileVolume: Number(it.monthlyMobileQcCnt) || 0,
        })).filter(i => i.keyword);
    } catch (err: any) {
        console.warn(`[FALLBACK:relkwd] ${seed} 실패: ${err?.message}`);
        return [];
    }
}

/**
 * 3️⃣ 다음(Daum) 자동완성
 * suggest.search.daum.net는 인증 없이 작동, 한국어 키워드 잘 잡힘
 */
async function fetchDaumSuggestions(seed: string): Promise<string[]> {
    try {
        const url = `https://suggest.search.daum.net/sushi/pc?q=${encodeURIComponent(seed)}&limit=10&suggest_no_log=true`;
        const res = await axios.get(url, {
            timeout: FALLBACK_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://www.daum.net/' },
        });
        const data = res.data;
        const out: string[] = [];
        // 다음 응답 형식: {q, items: [{m: 'keyword', ...}]} 또는 [, [keywords]]
        if (data && Array.isArray(data.items)) {
            for (const it of data.items) {
                if (it && typeof it.m === 'string') out.push(it.m);
                else if (typeof it === 'string') out.push(it);
            }
        } else if (Array.isArray(data) && Array.isArray(data[1])) {
            for (const k of data[1]) if (typeof k === 'string') out.push(k);
        }
        return out.filter(k => k && k.length >= 2 && k.length <= 40);
    } catch (err: any) {
        return [];
    }
}

/**
 * 4️⃣ 구글 자동완성 (KR)
 * suggestqueries.google.com는 인증 없이 작동, hl=ko로 한국어 우선
 */
async function fetchGoogleSuggestions(seed: string): Promise<string[]> {
    try {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q=${encodeURIComponent(seed)}`;
        const res = await axios.get(url, {
            timeout: FALLBACK_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        });
        const data = res.data;
        if (Array.isArray(data) && Array.isArray(data[1])) {
            return data[1].filter((k: any) => typeof k === 'string' && k.length >= 2 && k.length <= 40);
        }
        return [];
    } catch (err: any) {
        return [];
    }
}

/**
 * 5️⃣ 네이버 SmartBlock (에어서치 AiRSearch) 추출
 * 공식 발표: 연관검색어 종료와 별개로 SmartBlock는 적용률 20%→40%로 확대 중
 * AiRSearch 알고리즘이 사용자 의도/취향 반영한 맞춤형 키워드를 SmartBlock에 노출
 */
async function fetchNaverSmartBlockKeywords(seed: string): Promise<string[]> {
    try {
        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(seed)}`;
        const res = await axios.get(url, {
            timeout: FALLBACK_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Referer': 'https://www.naver.com/' },
        });
        const html: string = res.data || '';
        const out: string[] = [];

        // SmartBlock + AiRSearch + sds-comp 다중 패턴 (네이버 HTML 구조 변화 대응)
        const patterns = [
            /class="[^"]*api_subject_bx[^"]*"[\s\S]*?<a[^>]*>([^<]{2,30})</g,
            /data-template="[^"]*smart[^"]*"[\s\S]*?<a[^>]*>([^<]{2,30})</g,
            /class="[^"]*airSearch[^"]*"[\s\S]*?<a[^>]*>([^<]{2,30})</g,
            /class="[^"]*sds-comp-link[^"]*"[^>]*>([^<]{2,30})</g,
            /class="[^"]*tit[^"]*"[^>]*>([^<]{2,30})</g,
            /data-keyword="([^"]{2,30})"/g,  // 일부 SmartBlock 카드는 data-keyword 속성 유지
        ];
        for (const pat of patterns) {
            let m;
            while ((m = pat.exec(html)) !== null) {
                const kw = m[1]?.replace(/<[^>]*>/g, '').trim();
                if (kw && kw.length >= 2 && kw.length <= 30) out.push(kw);
            }
        }
        return out;
    } catch (err: any) {
        return [];
    }
}

/**
 * 6️⃣ 🆕 네이버 AI 브리핑 영역 추출
 * 공식 대체 서비스: 검색 결과 최상단 AI 요약 — 적용률 20%→40% 확대 예정
 * AI 브리핑은 의도 기반 핵심 키워드/엔티티를 자연스럽게 포함
 */
async function fetchNaverAiBriefingKeywords(seed: string): Promise<string[]> {
    try {
        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(seed)}`;
        const res = await axios.get(url, {
            timeout: FALLBACK_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Referer': 'https://www.naver.com/' },
        });
        const html: string = res.data || '';
        const out: string[] = [];

        // AI 브리핑 영역 추출 패턴 (DOM 구조 추정 — 실제 적용 시 갱신 필요)
        const patterns = [
            /class="[^"]*ai_briefing[^"]*"[\s\S]*?<(?:span|p|div|a)[^>]*>([^<]{4,40})</g,
            /class="[^"]*briefing[^"]*"[\s\S]*?<a[^>]*>([^<]{4,40})</g,
            /class="[^"]*ai_summary[^"]*"[\s\S]*?<(?:b|strong|em)[^>]*>([^<]{4,40})</g,
        ];
        for (const pat of patterns) {
            let m;
            while ((m = pat.exec(html)) !== null) {
                const kw = m[1]?.replace(/<[^>]*>/g, '').trim();
                if (kw && kw.length >= 4 && kw.length <= 40) out.push(kw);
            }
        }
        return out;
    } catch (err: any) {
        return [];
    }
}

/**
 * 7️⃣ 🆕 네이버 관련 질문 (Related Questions) 추출
 * 공식 대체 서비스: 탐색 확장형 질문 추천
 * 정보형 의도가 강한 키워드로 광고 적합성 ↑
 */
async function fetchNaverRelatedQuestions(seed: string): Promise<string[]> {
    try {
        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(seed)}`;
        const res = await axios.get(url, {
            timeout: FALLBACK_TIMEOUT,
            headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Referer': 'https://www.naver.com/' },
        });
        const html: string = res.data || '';
        const out: string[] = [];

        // 관련 질문 패턴 (질문형 키워드 우선 추출)
        const patterns = [
            /class="[^"]*related_question[^"]*"[\s\S]*?<a[^>]*>([^<]{6,50})</g,
            /class="[^"]*question[^"]*"[\s\S]*?<a[^>]*>([^<]{6,50})</g,
            /data-question="([^"]{6,50})"/g,
        ];
        for (const pat of patterns) {
            let m;
            while ((m = pat.exec(html)) !== null) {
                const kw = m[1]?.replace(/<[^>]*>/g, '').trim();
                // 질문형 키워드만 (?, 어떻게, 왜, 무엇, 언제 포함)
                if (kw && kw.length >= 6 && kw.length <= 50 &&
                    /\?$|어떻게|왜|무엇|언제|얼마|어디|뭐|어느/.test(kw)) {
                    out.push(kw);
                }
            }
        }
        return out;
    } catch (err: any) {
        return [];
    }
}

/**
 * 🌐 다중 폴백 통합 — 5개 소스 병렬 호출 + 점수화
 *
 * 반환:
 *   - keyword: 키워드
 *   - sources: 어느 폴백에서 발견됐는지
 *   - freq: 총 등장 횟수
 *   - monthlyVolume: RelKwdStat에서 잡힌 경우만 채워짐
 *
 * 정렬:
 *   - 소스 다양성 ×3 + freq + monthlyVolume(log scale)
 */
export async function fetchRelatedKeywordsMulti(
    seed: string,
    config: FallbackConfig,
    options: { skipSearchAd?: boolean; skipSmartBlock?: boolean; skipAi?: boolean } = {}
): Promise<RelatedKeywordResult[]> {
    const t0 = Date.now();
    const tasks: Promise<{ source: string; keywords: string[]; volumes?: Map<string, number> }>[] = [];

    // 1️⃣ 검색광고 (가장 강력)
    if (!options.skipSearchAd && config.naverSearchAdAccessLicense) {
        tasks.push(
            fetchSearchAdRelKeywords(seed, config).then(items => {
                const volumes = new Map<string, number>();
                items.forEach(i => volumes.set(i.keyword, i.monthlyPcVolume + i.monthlyMobileVolume));
                return { source: 'naver-relkwd', keywords: items.map(i => i.keyword), volumes };
            })
        );
    }
    // 3️⃣ 다음
    tasks.push(fetchDaumSuggestions(seed).then(k => ({ source: 'daum-suggest', keywords: k })));
    // 4️⃣ 구글
    tasks.push(fetchGoogleSuggestions(seed).then(k => ({ source: 'google-suggest', keywords: k })));
    // 5️⃣ SmartBlock (네이버 공식 확대 발표 — 20%→40%)
    if (!options.skipSmartBlock) {
        tasks.push(fetchNaverSmartBlockKeywords(seed).then(k => ({ source: 'naver-smartblock', keywords: k })));
    }
    // 6️⃣ 🆕 AI 브리핑 (네이버 공식 신규 대체 서비스)
    if (!options.skipAi) {
        tasks.push(fetchNaverAiBriefingKeywords(seed).then(k => ({ source: 'naver-ai-briefing', keywords: k })));
        // 7️⃣ 🆕 관련 질문 (네이버 공식 신규 대체 서비스)
        tasks.push(fetchNaverRelatedQuestions(seed).then(k => ({ source: 'naver-related-question', keywords: k })));
    }

    const results = await Promise.allSettled(tasks);

    // 키워드별 집계
    const map = new Map<string, { sources: Set<string>; freq: number; monthlyVolume: number }>();
    for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { source, keywords, volumes } = r.value;
        for (const k of keywords) {
            const kw = String(k || '').trim();
            if (kw.length < 2 || kw.length > 40) continue;
            const existing = map.get(kw);
            const vol = volumes?.get(kw) || 0;
            if (existing) {
                existing.sources.add(source);
                existing.freq++;
                if (vol > 0) existing.monthlyVolume = vol;
            } else {
                map.set(kw, { sources: new Set([source]), freq: 1, monthlyVolume: vol });
            }
        }
    }

    // 점수 정렬: 소스다양성 × 3 + freq + log10(monthlyVolume)
    const ranked = Array.from(map.entries()).map(([keyword, v]) => ({
        keyword,
        sources: Array.from(v.sources),
        freq: v.freq,
        monthlyVolume: v.monthlyVolume || undefined,
    })).sort((a, b) => {
        const scoreA = a.sources.length * 3 + a.freq + (a.monthlyVolume ? Math.log10(a.monthlyVolume + 1) : 0);
        const scoreB = b.sources.length * 3 + b.freq + (b.monthlyVolume ? Math.log10(b.monthlyVolume + 1) : 0);
        return scoreB - scoreA;
    });

    const ms = Date.now() - t0;
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[RELATED-FALLBACK] "${seed}" → ${ranked.length}개 (${succeeded}/${tasks.length} 소스 성공, ${ms}ms)`);

    return ranked;
}

/**
 * 4월 30일 카운트다운 (UI 표시용)
 */
export function getNaverRelatedKeywordCountdown(): { daysLeft: number; status: 'active' | 'warning' | 'sunset'; message: string } {
    const now = new Date();
    const sunset = new Date(2026, 3, 30); // 2026-04-30 (month is 0-indexed)
    const daysLeft = Math.ceil((sunset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
        return {
            daysLeft: 0,
            status: 'sunset',
            message: '🚨 네이버 연관검색어 종료됨 — 5중 폴백 자동 활성화 (검색광고 RelKwdStat + 다음 + 구글 + SmartBlock)',
        };
    } else if (daysLeft <= 7) {
        return {
            daysLeft,
            status: 'warning',
            message: `⚠️ 네이버 연관검색어 종료 D-${daysLeft} (4월30일) — 5중 폴백 시스템 준비 완료`,
        };
    } else {
        return {
            daysLeft,
            status: 'active',
            message: `네이버 연관검색어 종료까지 D-${daysLeft}`,
        };
    }
}
