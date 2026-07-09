/**
 * C4 web 이식: 데스크톱 발굴 결과를 서버 LIVE 황금키워드 보드로 push하는 업로더.
 *
 * - 운영자 전용: LEWORD_LIVE_GOLDEN_INGEST_URL + LEWORD_LIVE_GOLDEN_INGEST_TOKEN
 *   env 가 둘 다 설정된 머신에서만 동작. 일반 사용자 배포판은 env 미설정이라 무동작.
 * - 실측 provenance 가 확인되는 행만 전송: SearchAd PC/모바일 분리 검색량 + 실측 문서수가
 *   있는 행(추정 경로는 분리 검색량을 채우지 않는다 — mdp-engine.MDPResult 주석 참조).
 *   측정 메타 단언은 pc-engine-executor(metricFromShoppingDiscoverySeed) 관례와 동일.
 * - 예상순위/트래픽/수익 같은 추정치 필드는 전송하지 않는다(추정치 UI 노출 금지).
 *   C2/C4 부가필드는 신뢰 플래그가 참일 때만 화이트리스트로 동봉(서버가 재검증).
 * - 발굴 흐름에 절대 회귀를 만들지 않는다: 호출부는 fire-and-forget, 여기서도 throw 하지 않는다.
 */

import axios from 'axios';

const UPLOAD_TIMEOUT_MS = 15_000;
const MAX_UPLOAD_ROWS = 240;

export interface LiveBoardUploadTarget {
    url: string;
    token: string;
}

export function liveBoardUploadTarget(): LiveBoardUploadTarget | null {
    const url = String(process.env['LEWORD_LIVE_GOLDEN_INGEST_URL'] || '').trim();
    const token = String(process.env['LEWORD_LIVE_GOLDEN_INGEST_TOKEN'] || '').trim();
    if (!url || !token) return null;
    return { url, token };
}

function toFinite(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function uploadRowFromDiscoveryResult(result: unknown): Record<string, unknown> | null {
    const row = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
    const keyword = String(row['keyword'] || '').trim();
    const pc = toFinite(row['pcSearchVolume']);
    const mobile = toFinite(row['mobileSearchVolume']);
    const searchVolume = toFinite(row['searchVolume']) ?? (pc !== null && mobile !== null ? pc + mobile : null);
    const documentCount = toFinite(row['documentCount']);
    if (
        !keyword
        || pc === null
        || mobile === null
        || pc + mobile <= 0
        || searchVolume === null
        || searchVolume <= 0
        || documentCount === null
        || documentCount <= 0
    ) {
        return null;
    }
    const vacancySlots = toFinite(row['vacancySlots']);
    const briefRecommendedWords = toFinite(row['briefRecommendedWords']);
    return {
        keyword,
        grade: typeof row['grade'] === 'string' ? row['grade'] : undefined,
        score: toFinite(row['score']),
        pcSearchVolume: pc,
        mobileSearchVolume: mobile,
        totalSearchVolume: searchVolume,
        documentCount,
        goldenRatio: toFinite(row['goldenRatio']),
        cpc: toFinite(row['cpc']),
        category: typeof row['category'] === 'string' ? row['category'] : undefined,
        intent: typeof row['intent'] === 'string' ? row['intent'] : undefined,
        searchVolumeSource: 'searchad',
        searchVolumeConfidence: 'high',
        isSearchVolumeEstimated: false,
        documentCountSource: 'naver-api',
        documentCountConfidence: 'high',
        isDocumentCountEstimated: false,
        isMeasured: true,
        ...(row['serpMeasured'] === true && typeof row['winnable'] === 'boolean'
            ? { serpMeasured: true, winnable: row['winnable'] }
            : {}),
        ...(row['vacancyReliable'] === true && vacancySlots !== null && vacancySlots >= 0
            ? {
                vacancyReliable: true,
                vacancySlots,
                ...(typeof row['vacancyAction'] === 'string' ? { vacancyAction: row['vacancyAction'] } : {}),
            }
            : {}),
        ...(row['briefMeasured'] === true && briefRecommendedWords !== null && briefRecommendedWords > 0
            ? {
                briefMeasured: true,
                briefRecommendedWords,
                ...(Array.isArray(row['briefMustInclude'])
                    ? { briefMustInclude: (row['briefMustInclude'] as unknown[]).slice(0, 8) }
                    : {}),
            }
            : {}),
    };
}

export interface LiveBoardUploadResult {
    uploaded: number;
    skipped: number;
    accepted?: number;
}

export async function uploadGoldenBoardCandidates(
    results: unknown[],
    options: { source?: string } = {},
): Promise<LiveBoardUploadResult | null> {
    const target = liveBoardUploadTarget();
    if (!target) return null;
    const list = Array.isArray(results) ? results : [];
    const rows = list
        .map(uploadRowFromDiscoveryResult)
        .filter((row): row is Record<string, unknown> => row !== null)
        .slice(0, MAX_UPLOAD_ROWS);
    if (rows.length === 0) {
        return { uploaded: 0, skipped: list.length };
    }
    try {
        const response = await axios.post(
            target.url,
            { source: options.source || 'desktop-mdp-discovery', items: rows },
            {
                timeout: UPLOAD_TIMEOUT_MS,
                headers: { Authorization: `Bearer ${target.token}` },
            },
        );
        const accepted = toFinite(response?.data?.accepted);
        console.log(`[LIVE-BOARD-UPLOAD] ${rows.length}개 전송, 서버 수용 ${accepted ?? '?'}개`);
        return { uploaded: rows.length, skipped: list.length - rows.length, accepted: accepted ?? undefined };
    } catch (err) {
        console.warn('[LIVE-BOARD-UPLOAD] 서버 push 실패(발굴은 정상):', (err as Error)?.message || err);
        return { uploaded: 0, skipped: list.length };
    }
}
