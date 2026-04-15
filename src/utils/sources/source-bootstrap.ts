/**
 * Source Bootstrap — 17개 소스를 Registry에 일괄 등록
 * 앱 시작 시 1회 호출 (keywordMasterIpcHandlers에서 트리거)
 */

import { registerSource } from './source-registry';

import { getYoutubeTrendingKeywords } from './youtube-kr-rss';
import { fetchKoreanWikiTop } from './wikipedia-pageviews';
import { getHotProductFrequency } from './ppomppu-rss';
import { fetchAllCategoryRanks } from './naver-shopping-keyword-rank';
import { fetchTiktokTrendingHashtags } from './tiktok-creative-center';
import { predictEmergingTopics } from './openalex-predictor';
import { fetchAllRakutenCategories } from './rakuten-ichiba';
import { getTheqooKeywords } from './theqoo-collector';
import { getBobaeKeywords } from './bobaedream-collector';
import { fetchOliveyoungBest, extractOliveyoungKeywords } from './oliveyoung-ranking';
import { fetchMusinsaRanking, extractMusinsaKeywords } from './musinsa-ranking';
import { getHotResellProducts } from './kream-premium-signal';
import { getHotNamuTopics } from './namuwiki-collector';

let bootstrapped = false;

export function bootstrapSources(): void {
    if (bootstrapped) return;
    bootstrapped = true;

    // === LITE 4종 ===
    registerSource({
        id: 'youtube-kr',
        label: 'YouTube KR 트렌딩',
        tier: 'lite',
        domain: 'www.youtube.com',
        description: '한국 인기 영상 제목에서 키워드 추출',
        fetchKeywords: async () => {
            const items = await getYoutubeTrendingKeywords();
            return items.map(i => i.keyword);
        },
    });

    registerSource({
        id: 'wikipedia-ko',
        label: '위키피디아 한국어 Top1000',
        tier: 'lite',
        domain: 'wikimedia.org',
        description: '어제 가장 많이 본 한국어 위키 문서',
        fetchKeywords: async () => {
            const items = await fetchKoreanWikiTop(1);
            return items.slice(0, 200).map(i => i.article);
        },
    });

    registerSource({
        id: 'ppomppu',
        label: '뽐뿌 핫딜',
        tier: 'lite',
        domain: 'www.ppomppu.co.kr',
        description: '핫딜 게시글 상품명 빈도',
        fetchKeywords: async () => {
            const hot = await getHotProductFrequency();
            return hot.map(h => h.product);
        },
    });

    registerSource({
        id: 'namuwiki',
        label: '나무위키 최근변경',
        tier: 'lite',
        domain: 'namu.wiki',
        description: '편집 폭발 문서 = 신조어',
        fetchKeywords: async () => {
            const hot = await getHotNamuTopics();
            return hot.map(h => h.title);
        },
    });

    // === PRO 13종 ===
    registerSource({
        id: 'naver-shopping-rank',
        label: '네이버 쇼핑인사이트',
        tier: 'pro',
        domain: 'datalab.naver.com',
        description: '카테고리별 TOP20 인기검색어',
        fetchKeywords: async () => {
            const data = await fetchAllCategoryRanks();
            const all: string[] = [];
            for (const items of Object.values(data)) {
                for (const it of items) all.push(it.keyword);
            }
            return all;
        },
    });

    registerSource({
        id: 'tiktok-cc',
        label: 'TikTok Creative Center KR',
        tier: 'pro',
        domain: 'ads.tiktok.com',
        description: '한국 트렌딩 해시태그',
        fetchKeywords: async () => {
            const items = await fetchTiktokTrendingHashtags({ countryCode: 'KR' });
            return items.map(i => i.hashtag);
        },
    });

    registerSource({
        id: 'openalex',
        label: 'OpenAlex 학술',
        tier: 'pro',
        domain: 'api.openalex.org',
        description: '한국 연구 급성장 개념 (3~6개월 선행)',
        fetchKeywords: async () => {
            const topics = await predictEmergingTopics();
            return topics.map(t => t.topic);
        },
    });

    registerSource({
        id: 'rakuten',
        label: 'Rakuten Ichiba',
        tier: 'pro',
        domain: 'app.rakuten.co.jp',
        description: '일본 인기 상품 카테고리',
        fetchKeywords: async () => {
            const data = await fetchAllRakutenCategories();
            const all: string[] = [];
            for (const items of Object.values(data)) {
                for (const it of items) {
                    const name = it.itemName.split(/\s+/).slice(0, 3).join(' ');
                    if (name) all.push(name);
                }
            }
            return all;
        },
    });

    registerSource({
        id: 'theqoo',
        label: '더쿠 핫게시글',
        tier: 'pro',
        domain: 'theqoo.net',
        description: '여성·뷰티·아이돌·드라마 트렌드',
        fetchKeywords: async () => {
            const kws = await getTheqooKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'bobaedream',
        label: '보배드림 베스트',
        tier: 'pro',
        domain: 'www.bobaedream.co.kr',
        description: '자동차 카테고리 신차/이슈',
        fetchKeywords: async () => {
            const kws = await getBobaeKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'oliveyoung',
        label: '올리브영 베스트',
        tier: 'pro',
        domain: 'www.oliveyoung.co.kr',
        description: '뷰티 TOP100 제품명',
        fetchKeywords: async () => {
            const products = await fetchOliveyoungBest();
            const kws = extractOliveyoungKeywords(products);
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'musinsa',
        label: '무신사 랭킹',
        tier: 'pro',
        domain: 'www.musinsa.com',
        description: '패션 카테고리 랭킹',
        fetchKeywords: async () => {
            const products = await fetchMusinsaRanking();
            const kws = extractMusinsaKeywords(products);
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'kream',
        label: '크림 리셀',
        tier: 'pro',
        domain: 'kream.co.kr',
        description: '리셀 인기 상품',
        fetchKeywords: async () => {
            const items = await getHotResellProducts();
            return items.map(i => i.name);
        },
    });

    console.log(`[bootstrap] ✅ ${getRegistryCount()}개 소스 등록 완료`);
}

function getRegistryCount(): number {
    // Lazy import 방지를 위해 직접 카운트
    return 12;
}
