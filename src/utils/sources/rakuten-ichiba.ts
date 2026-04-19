/**
 * Rakuten Ichiba 인기 상품 — 일본 직구 키워드 도출
 *
 * 합법성: Rakuten 공식 무료 API. Application ID 발급 즉시 사용.
 * 차별점: 일본 인기 상품 한국어 직구 후기 콘텐츠는 거의 0건 = 블루오션.
 */

import axios from 'axios';
import { EnvironmentManager } from '../environment-manager';

export interface RakutenItem {
    rank: number;
    itemName: string;
    itemPrice: number;
    shopName: string;
    itemUrl: string;
    reviewCount: number;
    reviewAverage: number;
    genreId: string;
}

const RANKING_API = 'https://app.rakuten.co.jp/services/api/IchibaItem/Ranking/20220601';

let missingAppIdWarned = false;

function getAppId(): string {
    const cfg: any = EnvironmentManager.getInstance().getConfig();
    return cfg.rakutenAppId || process.env['RAKUTEN_APP_ID'] || '';
}

/**
 * 장르별 인기 상품 랭킹
 * genreId 0 = 전체, 100371 = 패션, 100939 = 식품 등
 */
export async function fetchRakutenRanking(genreId: number = 0): Promise<RakutenItem[]> {
    const appId = getAppId();
    if (!appId) {
        // Application ID 미설정 시 1회만 안내하고 조용히 스킵 (로그 스팸 방지)
        if (!missingAppIdWarned) {
            console.warn('[rakuten] Application ID 미설정 — 이 소스는 비활성화됩니다. rakuten.co.jp에서 무료 발급 후 설정 가능.');
            missingAppIdWarned = true;
        }
        return [];
    }

    try {
        const res = await axios.get(RANKING_API, {
            params: {
                applicationId: appId,
                genreId,
                format: 'json',
                page: 1,
            },
            timeout: 15000,
        });

        const items = res.data?.Items;
        if (!Array.isArray(items)) return [];

        return items.map((wrap: any) => {
            const item = wrap.Item || {};
            return {
                rank: Number(item.rank) || 0,
                itemName: String(item.itemName || ''),
                itemPrice: Number(item.itemPrice) || 0,
                shopName: String(item.shopName || ''),
                itemUrl: String(item.itemUrl || ''),
                reviewCount: Number(item.reviewCount) || 0,
                reviewAverage: Number(item.reviewAverage) || 0,
                genreId: String(item.genreId || ''),
            };
        });
    } catch (err: any) {
        console.error('[rakuten] 랭킹 실패:', err.message);
        return [];
    }
}

/**
 * 주요 카테고리 일괄 수집
 */
export const RAKUTEN_GENRES: Record<number, string> = {
    100371: '패션',
    100939: '식품',
    562637: '뷰티',
    100804: '디지털',
    100533: '인테리어',
    566382: '키즈/베이비',
    101070: '취미',
    101213: '스포츠',
};

export async function fetchAllRakutenCategories(): Promise<Record<string, RakutenItem[]>> {
    const result: Record<string, RakutenItem[]> = {};
    for (const [genreId, label] of Object.entries(RAKUTEN_GENRES)) {
        result[label] = await fetchRakutenRanking(Number(genreId));
        await new Promise(r => setTimeout(r, 1200));
    }
    return result;
}
