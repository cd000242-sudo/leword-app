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
import { rankRelatedKeywordCandidates } from './keyword-relevance';

const FALLBACK_TIMEOUT = 5000;
/*
 * 검색광고 소스만 따로 20초를 준다 (2026-09-15).
 *
 * 이 소스는 HTTP 가 느린 게 아니라 **공유 대기열**에 선다 — naver-searchad-api 는 프로세스
 * 전체가 한 줄로 서서 호출 간격(앱 0.5초, 샤드 회차는 LEWORD_SEARCHAD_MIN_INTERVAL_MS=3600)을
 * 지킨다. 동시에 부르는 쪽이 많을수록 뒷사람의 대기가 길어진다: 샤드에서 주제 6개가 나란히
 * 부르면 3.6초 × 6 ≈ 21.6초 — 09-14 샤드 로그의 중앙값 21,194ms 가 바로 이것이다.
 * 앱에서도 동시 30개면 0.5초 × 30 = 15초까지 선다.
 *
 * 5초로 끊으면 앱에서 검색량이 실린 연관어(이 모듈에서 검색량이 나오는 유일한 소스)를
 * 부하가 조금만 있어도 잃는다. 그래서 대기열 소스는 20초를 주되, 끊을 때는 **일도 같이
 * 끊는다** — 줄에 서기 전에 예상 대기가 예산을 넘으면 서지 않고(자리·쿼터·요청 다 안 씀),
 * 이미 서 있으면 abort 신호로 요청을 거둔다. 값만 버리고 비용은 그대로 치르는 일이 없다.
 */
const SEARCHAD_FALLBACK_TIMEOUT = 20000;
/** 줄에 설 때 허용하는 예상 대기 — 요청 자체(보통 1~2초)에 4초를 남긴다. */
const SEARCHAD_QUEUE_BUDGET_MS = SEARCHAD_FALLBACK_TIMEOUT - 4000;

/**
 * 약속 하나에 벽시계 상한을 씌운다. 넘기면 **거절**한다(빈 값으로 해결하지 않는다) —
 * 그래야 아래 "N/M 소스 성공" 집계에서 늦은 소스가 실패로 정직하게 세어진다.
 * 타이머는 끝나면 반드시 거둔다 — 안 거두면 회차마다 수천 개가 이벤트 루프를 붙잡는다.
 * 작업을 신호 받는 함수로 주면, 상한을 넘길 때 abort 를 보내 **일도 거둔다** — 그래야
 * 늦은 응답을 기다리는 대신 그 응답을 만드는 비용(대기열 자리·쿼터·요청)까지 끊긴다.
 */
export function withWallClock<T>(task: Promise<T> | ((signal: AbortSignal) => Promise<T>), ms: number): Promise<T> {
    const controller = new AbortController();
    const running = typeof task === 'function' ? Promise.resolve().then(() => task(controller.signal)) : task;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`wall-clock ${ms}ms 초과`));
        }, ms);
    });
    return Promise.race([running, deadline]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}
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
    config: FallbackConfig,
    signal?: AbortSignal
): Promise<{
    keyword: string;
    monthlyPcVolume: number | null;
    monthlyMobileVolume: number | null;
    totalSearchVolume: number | null;
}[]> {
    if (!config.naverSearchAdAccessLicense || !config.naverSearchAdSecretKey) return [];
    try {
        // 기존 모듈 재사용
        const {
            exactSearchAdTotal,
            getNaverSearchAdKeywordSuggestions,
        } = await import('./naver-searchad-api');
        const items = await getNaverSearchAdKeywordSuggestions(
            {
                accessLicense: config.naverSearchAdAccessLicense,
                secretKey: config.naverSearchAdSecretKey,
                customerId: config.naverSearchAdCustomerId,
            },
            seed,
            200,
            // 대기열이 예산 안에 차례를 못 주면 서지 않고 거절한다 · 상한에 걸리면 요청을 거둔다
            { maxWaitMs: SEARCHAD_QUEUE_BUDGET_MS, signal }
        );
        return (items || []).map((it: any) => ({
            keyword: it.keyword || it.relKeyword || '',
            monthlyPcVolume: typeof it.pcSearchVolume === 'number' ? it.pcSearchVolume : null,
            monthlyMobileVolume: typeof it.mobileSearchVolume === 'number' ? it.mobileSearchVolume : null,
            totalSearchVolume: exactSearchAdTotal(it),
        })).filter(i => i.keyword);
    } catch (err: any) {
        // 대기열 거절·abort 는 삼키지 않는다 — 아래 집계에서 "성공"으로 보이면 안 된다
        if (err?.name === 'SearchAdQueueBusyError' || err?.name === 'AbortError') throw err;
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

    /*
     * 벽시계 상한 — 소스 하나가 매달려도 여기서 끊는다 (2026-09-15).
     *
     * 실사고: 선점 보드 발굴 샤드 4개가 09-12 부터 **매 회차 240분 제한에 걸려 잘렸다**
     * (황금키워드 보드가 09-09 이후 6일간 안 바뀜). 샤드 하나 로그를 세니 이 함수 한 번이
     * 중앙값 21,194ms · 90% 21,410ms 였다. 09-07 정상 회차에서는 3,210ms 였다.
     *
     * 21초의 정체 — 다섯 HTTP 소스는 FALLBACK_TIMEOUT(5초)이 axios 옵션으로 걸려 있어
     * 5초를 못 넘긴다. 검색광고 소스는 HTTP 가 아니라 naver-searchad-api 의 **공유 대기열**에
     * 섰다: 샤드 회차는 호출 간격이 3.6초(LEWORD_SEARCHAD_MIN_INTERVAL_MS)이고 주제 6개가
     * 나란히 부르니 차례가 3.6 × 6 ≈ 21.6초 뒤에 온다. 그러고도 catch 가 [] 를 돌려
     * "6/6 소스 성공" 으로 찍혔다 — 기다림이 성공처럼 보였다.
     *
     * 그래서 소스마다 상한을 race 로 씌운다. HTTP 소스는 5초, 대기열 소스는 20초(위 설명).
     * 상한 안에 못 온 소스는 그 회차엔 없는 것으로 친다 — 나머지 소스가 답을 준다.
     * 대기열 소스는 끊을 때 일도 거둔다(abort). 결과 모양·점수·정렬은 그대로다.
     */
    // 1️⃣ 검색광고 (가장 강력)
    if (!options.skipSearchAd && config.naverSearchAdAccessLicense) {
        tasks.push(withWallClock((signal) => fetchSearchAdRelKeywords(seed, config, signal).then(items => {
            const volumes = new Map<string, number>();
            items.forEach(i => {
                if (i.totalSearchVolume !== null) {
                    volumes.set(i.keyword, i.totalSearchVolume);
                }
            });
            return { source: 'naver-relkwd', keywords: items.map(i => i.keyword), volumes };
        }), SEARCHAD_FALLBACK_TIMEOUT));
    }
    // 3️⃣ 다음
    tasks.push(withWallClock(fetchDaumSuggestions(seed).then(k => ({ source: 'daum-suggest', keywords: k })), FALLBACK_TIMEOUT));
    // 4️⃣ 구글
    tasks.push(withWallClock(fetchGoogleSuggestions(seed).then(k => ({ source: 'google-suggest', keywords: k })), FALLBACK_TIMEOUT));
    // 5️⃣ SmartBlock (네이버 공식 확대 발표 — 20%→40%)
    if (!options.skipSmartBlock) {
        tasks.push(withWallClock(fetchNaverSmartBlockKeywords(seed).then(k => ({ source: 'naver-smartblock', keywords: k })), FALLBACK_TIMEOUT));
    }
    // 6️⃣ 🆕 AI 브리핑 (네이버 공식 신규 대체 서비스)
    if (!options.skipAi) {
        tasks.push(withWallClock(fetchNaverAiBriefingKeywords(seed).then(k => ({ source: 'naver-ai-briefing', keywords: k })), FALLBACK_TIMEOUT));
        // 7️⃣ 🆕 관련 질문 (네이버 공식 신규 대체 서비스)
        tasks.push(withWallClock(fetchNaverRelatedQuestions(seed).then(k => ({ source: 'naver-related-question', keywords: k })), FALLBACK_TIMEOUT));
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
    const candidateRows = Array.from(map.entries()).map(([keyword, v]) => ({
        keyword,
        sources: Array.from(v.sources),
        freq: v.freq,
        monthlyVolume: v.monthlyVolume || undefined,
    }));
    let ranked = rankRelatedKeywordCandidates(seed, candidateRows, { limit: 200, minScore: 32 });
    if (ranked.length < 10) {
        ranked = rankRelatedKeywordCandidates(seed, candidateRows, { limit: 200, minScore: 24 });
    }

    const ms = Date.now() - t0;
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    // 시간 초과·대기열 거절로 빠진 소스를 따로 센다 — "6/6 성공" 이 21초짜리 기다림을 감추던 것이 실사고였다.
    const timedOut = results.filter(r => r.status === 'rejected' && /wall-clock/.test(String((r as PromiseRejectedResult).reason?.message || ''))).length;
    const queueBusy = results.filter(r => r.status === 'rejected' && (r as PromiseRejectedResult).reason?.name === 'SearchAdQueueBusyError').length;
    console.log(`[RELATED-FALLBACK] "${seed}" → ${ranked.length}개 (${succeeded}/${tasks.length} 소스 성공${timedOut ? ` · 시간초과 ${timedOut}` : ''}${queueBusy ? ` · 대기열 거절 ${queueBusy}` : ''}, ${ms}ms)`);

    return ranked.map(item => ({
        keyword: item.keyword,
        sources: item.sources || [],
        freq: item.freq || 1,
        monthlyVolume: item.monthlyVolume,
    }));
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
