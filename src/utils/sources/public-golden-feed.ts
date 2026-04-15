/**
 * Public Golden Feed — 공개 황금키워드 실시간 피드
 *
 * 정책:
 *  - LITE 소스만 사용 (라이선스 무관, 누구나 접근 가능)
 *  - PRO 분석기 대비 "낮은 정밀도, 빠른 속도, 일반인 친화"
 *  - 자체 스코어링: (소스 매칭 수 × 신선도 × 빈도)
 *
 * 목적: 무료 사용자에게 LEWORD 가치 체험 → PRO 전환 깔때기
 */

import { callAllSources } from './source-registry';
import { getKeywordTrend } from './source-storage';

export interface PublicGoldenItem {
    keyword: string;
    score: number;
    sources: string[];
    sourceCount: number;
    risingRatio?: number;     // 어제 대비 (있을 경우)
    isNew: boolean;            // 신규 키워드
    suggestedTitle?: string;   // 자동 생성된 블로그 제목
}

export interface PublicGoldenFeed {
    timestamp: number;
    total: number;
    items: PublicGoldenItem[];
}

const STOP = new Set([
    '오늘', '지금', '진짜', '완전', '정말', '바로', '그냥', '이거', '저거', '있다', '없다',
    '대문', '한국', '대한민국', '서울', '관련', '특집', '뉴스', '소개', '공개', '발표',
    '시작', '종료', '오늘의', '이번', '지난', '최근', '계속', '다음', '먼저', '나중',
]);

function normalize(kw: string): string {
    return kw.trim()
        .replace(/^[#\[\(]+|[\]\)]+$/g, '')
        .replace(/\s+/g, ' ');
}

function isValid(kw: string): boolean {
    if (kw.length < 2 || kw.length > 25) return false;
    if (STOP.has(kw)) return false;
    if (/^\d+$/.test(kw)) return false;
    if (!/[가-힣a-zA-Z]/.test(kw)) return false;
    return true;
}

function generateTitle(keyword: string): string {
    const templates = [
        `${keyword} 완벽 정리 (2026 최신)`,
        `${keyword} 알아두면 좋은 5가지`,
        `${keyword}, 지금 뜨는 이유`,
        `${keyword} 후기 솔직 정리`,
        `${keyword} 추천 BEST`,
    ];
    return templates[Math.floor(keyword.length % templates.length)];
}

let cache: { feed: PublicGoldenFeed; expiresAt: number } | null = null;
const CACHE_TTL = 10 * 60_000; // 10분

export async function buildPublicGoldenFeed(forceRefresh: boolean = false): Promise<PublicGoldenFeed> {
    const now = Date.now();
    if (!forceRefresh && cache && cache.expiresAt > now) {
        return cache.feed;
    }

    // LITE 소스만 호출 (4개)
    const results = await callAllSources({ tier: 'lite', healthy: true });

    // keyword → sources[]
    const keywordSources = new Map<string, Set<string>>();
    const keywordFreq = new Map<string, number>();

    for (const [sourceId, result] of results.entries()) {
        if (!result.success) continue;
        for (const raw of result.keywords) {
            const kw = normalize(raw);
            if (!isValid(kw)) continue;
            if (!keywordSources.has(kw)) keywordSources.set(kw, new Set());
            keywordSources.get(kw)!.add(sourceId);
            keywordFreq.set(kw, (keywordFreq.get(kw) || 0) + 1);
        }
    }

    // 스코어링
    const items: PublicGoldenItem[] = [];
    for (const [kw, sources] of keywordSources.entries()) {
        const sourceCount = sources.size;
        const freq = keywordFreq.get(kw) || 1;

        // 다중 소스 매칭 보너스 (가장 강력한 신호)
        let score = sourceCount * 30;
        // 빈도 가산 (log scale)
        score += Math.min(20, Math.log2(freq + 1) * 6);

        // 시계열 급상승 보너스 (storage에 기록 있을 때만)
        let risingRatio: number | undefined;
        let isNew = false;
        for (const src of sources) {
            const trend = getKeywordTrend(src, kw);
            if (trend.ratio >= 2) {
                risingRatio = Math.max(risingRatio || 0, trend.ratio);
                score += Math.min(30, trend.ratio * 5);
            }
            if (trend.weekAvg === 0 && trend.today > 0) isNew = true;
        }
        if (isNew) score += 15;

        items.push({
            keyword: kw,
            score: Math.round(score),
            sources: Array.from(sources),
            sourceCount,
            risingRatio,
            isNew,
            suggestedTitle: generateTitle(kw),
        });
    }

    // 정렬 + 상위 30개
    items.sort((a, b) => b.score - a.score || b.sourceCount - a.sourceCount);
    const top = items.slice(0, 30);

    const feed: PublicGoldenFeed = {
        timestamp: now,
        total: items.length,
        items: top,
    };

    cache = { feed, expiresAt: now + CACHE_TTL };
    return feed;
}

export function clearFeedCache(): void {
    cache = null;
}
