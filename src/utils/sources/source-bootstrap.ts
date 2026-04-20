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
// kream: 서버 차단으로 제거됨. namuwiki: SPA 변경으로 HTML 파싱 불가
// Phase 1 — community expansion
import { getDcinsideKeywords } from './dcinside-best-collector';
import { getFmkoreaKeywords } from './fmkorea-collector';
import { getMlbparkKeywords } from './mlbpark-collector';
import { getInvenKeywords } from './inven-collector';
import { getRuliwebKeywords } from './ruliweb-collector';
// Phase 2 — news / policy
import { getPolicyKeywords } from './korea-kr-policy-rss';
import { getNaverNewsRankingKeywords } from './naver-news-ranking';
import { getYnaBreakingKeywords } from './yna-breaking-rss';
// Phase 3 — supplementary
import { getClienKeywords } from './clien-collector';
import { getTodayhumorKeywords } from './todayhumor-collector';
import { getNatepannKeywords } from './natepann-collector';
// Phase 4 — idle 자산 활용 래퍼 (google-paa / meta-adlib 은 bot 차단 확정으로 제거됨)
import { getBigkindsSeedKeywords } from './bigkinds-wrapper';
// Phase 5 — 고CPC 공백 커버
import { getMomCafeKeywords } from './mom-cafe-collector';
import { getRealestateKeywords } from './realestate-collector';
import { getHealthKeywords } from './health-collector';
import { getFinanceKeywords } from './finance-collector';
import { getRecipeKeywords } from './recipe-collector';

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

    // namuwiki: SPA 엔진 변경으로 HTML 파싱 불가 → 제거됨

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

    // kream: 서버 차단으로 제거됨

    // === Phase 1: 커뮤니티 확장 (5개) ===
    registerSource({
        id: 'dcinside',
        label: '디시인사이드 실베',
        tier: 'pro',
        domain: 'gall.dcinside.com',
        description: '국내 최대 커뮤니티 실시간 베스트, 광범위 카테고리',
        fetchKeywords: async () => {
            const kws = await getDcinsideKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'fmkorea',
        label: '에펨코리아 인기글',
        tier: 'pro',
        domain: 'www.fmkorea.com',
        description: '남초 대표 커뮤니티, 스포츠/게임/IT 이슈 집중',
        fetchKeywords: async () => {
            const kws = await getFmkoreaKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'mlbpark',
        label: 'MLB파크 불펜',
        tier: 'pro',
        domain: 'mlbpark.donga.com',
        description: '스포츠/시사/연예 복합 이슈 집결지',
        fetchKeywords: async () => {
            const kws = await getMlbparkKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'gamenews',
        label: '게임뉴스(디스이즈게임+게임톡)',
        tier: 'pro',
        domain: 'www.thisisgame.com',
        description: '게임 신작/업데이트/업계 이슈 — 게임 블로거용 고CPC',
        fetchKeywords: async () => {
            const kws = await getInvenKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'ruliweb',
        label: '루리웹 베스트',
        tier: 'pro',
        domain: 'bbs.ruliweb.com',
        description: '서브컬처/게임/애니 트렌드 감지',
        fetchKeywords: async () => {
            const kws = await getRuliwebKeywords();
            return kws.map(k => k.keyword);
        },
    });

    // === Phase 2: 이슈/정책 소스 (3개) ===
    registerSource({
        id: 'korea-kr',
        label: '정책브리핑(korea.kr)',
        tier: 'pro',
        domain: 'www.korea.kr',
        description: '정부 정책/지원금 공식 RSS (고CPC 블루오션)',
        fetchKeywords: async () => {
            const kws = await getPolicyKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'naver-news',
        label: '네이버 뉴스 랭킹',
        tier: 'pro',
        domain: 'news.naver.com',
        description: '실시간 많이 본 뉴스 — 검색 의도 직결',
        fetchKeywords: async () => {
            const kws = await getNaverNewsRankingKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'yna-breaking',
        label: '연합뉴스 속보 RSS',
        tier: 'pro',
        domain: 'www.yna.co.kr',
        description: '통신사 속보 — 이슈 블로거 선점용',
        fetchKeywords: async () => {
            const kws = await getYnaBreakingKeywords();
            return kws.map(k => k.keyword);
        },
    });

    // === Phase 3: 보완 커뮤니티 (3개) ===
    registerSource({
        id: 'clien',
        label: '클리앙 새로운 소식',
        tier: 'pro',
        domain: 'www.clien.net',
        description: 'IT/가전/생활 집단지성 트렌드',
        fetchKeywords: async () => {
            const kws = await getClienKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'todayhumor',
        label: '오유 베오베',
        tier: 'pro',
        domain: 'www.todayhumor.co.kr',
        description: '일반 유저 이슈·밈 집중지표',
        fetchKeywords: async () => {
            const kws = await getTodayhumorKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'natepann',
        label: '네이트판',
        tier: 'pro',
        domain: 'pann.nate.com',
        description: '10~30대 여초 커뮤니티, 일상/연애/이슈 바이럴',
        fetchKeywords: async () => {
            const kws = await getNatepannKeywords();
            return kws.map(k => k.keyword);
        },
    });

    // === Phase 4: 기존 자산 래핑 (bigkinds만 — 나머지 2개는 bot 차단으로 제거) ===
    registerSource({
        id: 'bigkinds',
        label: '빅카인즈 뉴스버즈',
        tier: 'pro',
        domain: 'www.bigkinds.or.kr',
        description: '한국언론재단 뉴스 빅데이터 — 언급 집중 키워드',
        fetchKeywords: async () => await getBigkindsSeedKeywords(),
    });

    // === Phase 5: 고CPC 공백 카테고리 (5개) ===
    registerSource({
        id: 'mom-cafe',
        label: '맘카페·육아',
        tier: 'pro',
        domain: 'section.blog.naver.com',
        description: '육아/유아 블로그 — 고CPC 육아용품 구매 선행',
        fetchKeywords: async () => {
            const kws = await getMomCafeKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'realestate',
        label: '부동산 이슈',
        tier: 'pro',
        domain: 'land.naver.com',
        description: '청약/분양/재건축/대출 등 부동산 고CPC 키워드',
        fetchKeywords: async () => {
            const kws = await getRealestateKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'health',
        label: '건강·의료',
        tier: 'pro',
        domain: 'www.yna.co.kr',
        description: '병원·영양제·질환 — 의료 블로그 최상위 CPC',
        fetchKeywords: async () => {
            const kws = await getHealthKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'finance',
        label: '재테크·주식',
        tier: 'pro',
        domain: 'finance.naver.com',
        description: '금리·종목·ETF·코인 — 금융 블로그 고CPC',
        fetchKeywords: async () => {
            const kws = await getFinanceKeywords();
            return kws.map(k => k.keyword);
        },
    });

    registerSource({
        id: 'recipe',
        label: '만개의레시피',
        tier: 'pro',
        domain: 'www.10000recipe.com',
        description: '요리·레시피 — 음식 블로그 저경쟁 롱테일',
        fetchKeywords: async () => {
            const kws = await getRecipeKeywords();
            return kws.map(k => k.keyword);
        },
    });

    console.log(`[bootstrap] ✅ ${getRegistryCount()}개 소스 등록 완료`);
}

function getRegistryCount(): number {
    // Lazy import 방지를 위해 직접 카운트
    return 28;
}
