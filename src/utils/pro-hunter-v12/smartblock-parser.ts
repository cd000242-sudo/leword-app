// PRO Hunter v12 — 네이버 스마트블록 SERP 파서
// 작성: 2026-04-15
// 네이버 검색 결과에서 인기글/VIEW/지식iN/쇼핑/카페/인플루언서 등 블록별 분석

import puppeteer, { Browser } from 'puppeteer';

export type SmartBlockType =
  | 'popular_post'      // 인기글
  | 'view'              // VIEW (블로그 섹션)
  | 'influencer'        // 인플루언서
  | 'knowledge_in'      // 지식iN
  | 'shopping'          // 쇼핑
  | 'cafe'              // 카페
  | 'news'              // 뉴스
  | 'video'             // 동영상
  | 'image'             // 이미지
  | 'place'             // 플레이스
  | 'power_link'        // 파워링크 (광고)
  | 'webdoc'            // 웹문서
  | 'other';

export interface SmartBlock {
  type: SmartBlockType;
  displayName: string;
  position: number;           // 상단부터 순서 (1이 가장 위)
  itemCount: number;          // 블록 내 아이템 수
  hasAd: boolean;
  dominance: number;          // 화면 점유율 추정 (0~100)
  canPenetrate: boolean;      // 일반 블로그가 진입 가능한가
  strategy: string;           // 해당 블록 침투 전략
}

export interface SmartBlockAnalysis {
  keyword: string;
  totalBlocks: number;
  blocks: SmartBlock[];
  blogFriendly: boolean;            // 블로그 섹션이 존재하고 상위에 있는가
  shoppingDominant: boolean;        // 쇼핑이 지배적인가
  ysPowerLinkCount: number;         // 파워링크 광고 수
  topBlockType: SmartBlockType | null;
  recommendation: string;
  bloggerOpportunityScore: number;  // 0~100 블로거 기회 점수
}

const SEARCH_URL = (kw: string) =>
  `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${encodeURIComponent(kw)}`;

const BLOCK_LABELS: Record<SmartBlockType, string> = {
  popular_post: '🔥 인기글',
  view: '📝 VIEW (블로그)',
  influencer: '⭐ 인플루언서',
  knowledge_in: '💡 지식iN',
  shopping: '🛒 쇼핑',
  cafe: '☕ 카페',
  news: '📰 뉴스',
  video: '📹 동영상',
  image: '🖼️ 이미지',
  place: '📍 플레이스',
  power_link: '💰 파워링크',
  webdoc: '🌐 웹문서',
  other: '❓ 기타',
};

function classifyBlock(text: string, className: string): SmartBlockType {
  const t = text.toLowerCase();
  const c = className.toLowerCase();
  if (t.includes('인기글') || c.includes('popular')) return 'popular_post';
  if (t.includes('인플루언서') || c.includes('influencer')) return 'influencer';
  if (t.includes('지식in') || t.includes('지식iN') || c.includes('kin')) return 'knowledge_in';
  if (t.includes('쇼핑') || c.includes('shop')) return 'shopping';
  if (t.includes('카페') || c.includes('cafe')) return 'cafe';
  if (t.includes('뉴스') || c.includes('news')) return 'news';
  if (t.includes('동영상') || t.includes('비디오') || c.includes('video')) return 'video';
  if (t.includes('이미지') || c.includes('image')) return 'image';
  if (t.includes('플레이스') || t.includes('지도') || c.includes('place')) return 'place';
  if (t.includes('파워링크') || c.includes('powerlink')) return 'power_link';
  if (t.includes('view') || t.includes('블로그') || c.includes('blog')) return 'view';
  if (t.includes('웹문서') || c.includes('webdoc')) return 'webdoc';
  return 'other';
}

function strategyForBlock(type: SmartBlockType): { canPenetrate: boolean; strategy: string } {
  switch (type) {
    case 'popular_post':
      return {
        canPenetrate: true,
        strategy: '최신성 + 체류시간 + CTR 극대화. 제목에 "2026" "최신" 포함, 첫 200자에 결론 제시',
      };
    case 'view':
      return {
        canPenetrate: true,
        strategy: '블로그 지수 + 키워드 밀도. 본문 1500자+ + 이미지 8장+ + 필수 키워드 5회+',
      };
    case 'influencer':
      return {
        canPenetrate: false,
        strategy: '인플루언서 계정만 진입 가능 — 일반 블로그는 우회 (다른 블록 타겟)',
      };
    case 'knowledge_in':
      return {
        canPenetrate: true,
        strategy: '지식iN 답변자로 활동 → 답변에 내 블로그 링크 → 이중 노출',
      };
    case 'shopping':
      return {
        canPenetrate: false,
        strategy: '쇼핑은 상품 판매자만 — 블로그로 뚫기 불가. 키워드를 틀거나 블로그 섹션 추가 노출 공략',
      };
    case 'cafe':
      return {
        canPenetrate: false,
        strategy: '카페 게시글만 — 해당 주제 카페에 글 투고 전략',
      };
    case 'news':
      return {
        canPenetrate: false,
        strategy: '언론사 기사만 — 블로그로 뚫기 불가',
      };
    case 'video':
      return {
        canPenetrate: true,
        strategy: '본문에 YouTube 임베드 추가하면 동영상 섹션에 반영될 가능성',
      };
    case 'image':
      return {
        canPenetrate: true,
        strategy: '이미지 alt 태그 + 파일명에 키워드. 본문 상단에 고품질 이미지 배치',
      };
    case 'place':
      return {
        canPenetrate: false,
        strategy: '네이버 플레이스 등록 사업자만',
      };
    case 'power_link':
      return {
        canPenetrate: false,
        strategy: '광고 — 네이버 검색광고 집행 필요',
      };
    case 'webdoc':
      return { canPenetrate: true, strategy: '웹문서는 일반적으로 영향력 낮음' };
    default:
      return { canPenetrate: false, strategy: '기타 블록 — 전략 미상' };
  }
}

export async function analyzeSmartBlocks(keyword: string): Promise<SmartBlockAnalysis> {
  const { findChromePath } = await import('../chrome-finder');
  const chromePath = findChromePath();
  const browser: Browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(SEARCH_URL(keyword), { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2500));

    // 네이버 통합검색의 섹션 블록 수집 (P1 #2: 셀렉터 강화)
    // 페이지 로딩 + 스크롤로 lazy 섹션 트리거
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 500));

    const rawBlocks = await page.evaluate(() => {
      const results: Array<{ text: string; className: string; itemCount: number; top: number; height: number }> = [];

      // 2026년 네이버 통합검색 셀렉터 (다양한 버전 대응)
      const selectors = [
        // 최신 (sc_ prefix)
        'section[class*="sc_"]',
        'div[class*="sc_"]',
        // 그룹 컨테이너
        '.group_news',
        '.group_shop',
        '.group_blog',
        '.group_kin',
        '.group_video',
        '.group_image',
        // 일반 섹션
        '.api_subject_bx',
        '.sp_nreview',
        '.sp_blog',
        '.sp_cafe',
        '.sp_kin',
        '.sp_news',
        '.sp_shop',
        '.sp_influencer',
        // 통합 검색 결과 박스
        '.bx_type_basic',
        '.section_tab',
        'section',
      ];
      const collected = new Set<Element>();
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.height < 80 || rect.height > 3000) return;
            // 부모가 이미 collected에 있으면 제외
            for (const existing of collected) {
              if (existing.contains(el) || el.contains(existing)) return;
            }
            collected.add(el);
          });
        } catch {}
      }

      // 폴백: 아무것도 못 찾았으면 main_pack 하위 직접 자식 모두
      if (collected.size === 0) {
        const mainPack = document.querySelector('#main_pack, .main_pack, #container');
        if (mainPack) {
          Array.from(mainPack.children).forEach((child) => {
            const rect = child.getBoundingClientRect();
            if (rect.height >= 80 && rect.height <= 3000) {
              collected.add(child);
            }
          });
        }
      }

      for (const el of Array.from(collected)) {
        const rect = el.getBoundingClientRect();
        // 섹션 제목 찾기 (다양한 위치)
        const header = el.querySelector(
          'h2, h3, .api_title, .sub_title, .title, .fds-comps-header, [class*="title"]'
        );
        const headerText = (header as HTMLElement | null)?.innerText || '';
        const fullText = (el as HTMLElement).innerText || '';
        const text = headerText || fullText.slice(0, 200);
        const className = (el as HTMLElement).className || '';
        // 아이템 카운트
        const itemCount = el.querySelectorAll(
          'li, .bx, .lst_item, a[href*="blog.naver.com"], a[href*="cafe.naver.com"], a[href*="kin.naver.com"], .news_area, .shop_area, .video_area'
        ).length;
        results.push({
          text: text.slice(0, 300),
          className,
          itemCount,
          top: rect.top + window.scrollY,
          height: rect.height,
        });
      }
      return results;
    });

    // 정렬 (위에서부터)
    rawBlocks.sort((a, b) => a.top - b.top);

    const blocks: SmartBlock[] = [];
    const seenTypes = new Set<string>();
    let ysPowerLinkCount = 0;

    for (let i = 0; i < rawBlocks.length; i++) {
      const rb = rawBlocks[i];
      const type = classifyBlock(rb.text, rb.className);
      if (type === 'other' && seenTypes.has('other')) continue;
      if (seenTypes.has(type) && type !== 'power_link') continue;
      seenTypes.add(type);

      const hasAd = rb.text.includes('광고') || rb.className.includes('ad');
      if (type === 'power_link') ysPowerLinkCount++;

      const { canPenetrate, strategy } = strategyForBlock(type);

      blocks.push({
        type,
        displayName: BLOCK_LABELS[type],
        position: blocks.length + 1,
        itemCount: rb.itemCount,
        hasAd,
        dominance: Math.min(100, Math.round(rb.height / 10)),
        canPenetrate,
        strategy,
      });

      if (blocks.length >= 12) break;
    }

    // 블로그 친화도 분석
    const viewBlock = blocks.find((b) => b.type === 'view');
    const popularBlock = blocks.find((b) => b.type === 'popular_post');
    const shopBlock = blocks.find((b) => b.type === 'shopping');
    const newsBlock = blocks.find((b) => b.type === 'news');
    const cafeBlock = blocks.find((b) => b.type === 'cafe');

    const blogFriendly = !!(viewBlock || popularBlock);
    const shoppingDominant = !!(shopBlock && shopBlock.position <= 3);
    const newsDominant = !!(newsBlock && newsBlock.position <= 2);

    // 기회 점수 계산
    let score = 50;
    if (viewBlock) score += viewBlock.position <= 3 ? 30 : 15;
    if (popularBlock) score += popularBlock.position <= 3 ? 20 : 10;
    if (shoppingDominant) score -= 25;
    if (newsDominant) score -= 20;
    if (cafeBlock && cafeBlock.position <= 3) score -= 10;
    if (ysPowerLinkCount >= 3) score -= 10;
    score = Math.max(0, Math.min(100, score));

    // 추천 전략
    let recommendation: string;
    if (score >= 75) {
      recommendation = `🟢 블로그 친화 — ${blocks.length}개 블록 중 블로그/인기글 상위 배치. 정상 작성 시 노출 유력`;
    } else if (score >= 50) {
      recommendation = '🟡 중간 난이도 — 블로그 섹션 있으나 다른 블록과 경쟁. 체류시간/CTR 극대화 필수';
    } else if (shoppingDominant) {
      recommendation = '🔴 쇼핑 지배 — 블로그 진입 어려움. 다른 키워드 추천 또는 하위 블로그 섹션만 노출 공략';
    } else if (newsDominant) {
      recommendation = '🔴 뉴스 지배 — 시사/이슈 키워드로 보임. 언론사와 경쟁 불가';
    } else {
      recommendation = '🟠 기회 낮음 — 다른 블록이 SERP를 장악. 키워드 변경 권장';
    }

    return {
      keyword,
      totalBlocks: blocks.length,
      blocks,
      blogFriendly,
      shoppingDominant,
      ysPowerLinkCount,
      topBlockType: blocks[0]?.type || null,
      recommendation,
      bloggerOpportunityScore: score,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
