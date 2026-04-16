// PRO Hunter v12 — 구글 SERP 분석
// 작성: 2026-04-15 (Tier 2)
// Google Custom Search API로 상위 10개 URL 수집 + Puppeteer로 본문 크롤
// 네이버 + 구글 이중 타겟 전략 지원

import puppeteer from 'puppeteer';
import { EnvironmentManager } from '../environment-manager';

export interface GoogleSerpItem {
  rank: number;
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  domain: string;
  isKoreanBlog: boolean;   // 네이버/티스토리/브런치 등
  isAdsense: boolean;      // 광고
}

export interface GoogleSerpAnalysis {
  keyword: string;
  totalResults: number | null;
  items: GoogleSerpItem[];
  koreanBlogRatio: number;       // 한국 블로그 비율 (0~1)
  topDomains: Array<{ domain: string; count: number }>;
  hasFeaturedSnippet: boolean;
  hasPeopleAlsoAsk: boolean;
  googleFriendly: boolean;       // 개인 블로그가 진입 가능한가
  opportunityScore: number;      // 0~100
  recommendation: string;
  source: 'api' | 'scrape';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isKoreanBlogDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    d.includes('blog.naver.com') ||
    d.includes('tistory.com') ||
    d.includes('brunch.co.kr') ||
    d.includes('velog.io') ||
    d.includes('blog.me') ||
    d.includes('post.naver.com')
  );
}

/**
 * Google Custom Search API로 상위 결과 수집
 * API 키 없으면 스크레이핑 폴백 (제한적)
 */
export async function fetchGoogleTop10(keyword: string): Promise<GoogleSerpAnalysis | null> {
  const env = EnvironmentManager.getInstance().getConfig();
  const apiKey = env.googleCseKey || env.googleApiKey;
  const cseId = env.googleCseId || env.googleCseCx;

  let items: GoogleSerpItem[] = [];
  let source: 'api' | 'scrape' = 'api';
  let totalResults: number | null = null;

  if (apiKey && cseId) {
    try {
      const axios = (await import('axios')).default;
      const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: apiKey,
          cx: cseId,
          q: keyword,
          num: 10,
          lr: 'lang_ko',
          gl: 'kr',
        },
        timeout: 10000,
      });
      const data = res.data;
      totalResults = Number(data?.searchInformation?.totalResults) || null;
      items = (data?.items || []).map((it: any, i: number) => {
        const domain = extractDomain(it.link || '');
        return {
          rank: i + 1,
          title: it.title || '',
          link: it.link || '',
          snippet: it.snippet || '',
          displayLink: it.displayLink || '',
          domain,
          isKoreanBlog: isKoreanBlogDomain(domain),
          isAdsense: false,
        };
      });
    } catch (err: any) {
      console.warn('[GOOGLE-SERP] API 실패, 스크레이핑 폴백:', err?.message);
      source = 'scrape';
    }
  } else {
    source = 'scrape';
  }

  // 폴백: Puppeteer로 google.com/search 스크레이핑
  if (items.length === 0) {
    try {
      items = await scrapeGoogle(keyword);
      source = 'scrape';
    } catch (err) {
      console.error('[GOOGLE-SERP] 스크레이핑 실패:', (err as Error).message);
      return null;
    }
  }

  if (items.length === 0) return null;

  // 분석
  const koreanBlogCount = items.filter((i) => i.isKoreanBlog).length;
  const koreanBlogRatio = koreanBlogCount / items.length;

  const domainMap = new Map<string, number>();
  for (const it of items) {
    domainMap.set(it.domain, (domainMap.get(it.domain) || 0) + 1);
  }
  const topDomains = Array.from(domainMap.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 기회 점수
  let score = 50;
  if (koreanBlogRatio >= 0.5) score += 25;
  else if (koreanBlogRatio >= 0.3) score += 10;
  else if (koreanBlogRatio < 0.1) score -= 25;

  // 중복 도메인이 많으면 기회 낮음 (대형 언론/쇼핑몰 지배)
  if (topDomains[0] && topDomains[0].count >= 4) score -= 15;

  score = Math.max(0, Math.min(100, score));

  let recommendation: string;
  if (score >= 75) {
    recommendation = '🟢 구글도 공략 가능 — 한국 블로그 상위권에 다수 포진, 양쪽 타겟 추천';
  } else if (score >= 50) {
    recommendation = '🟡 구글은 보조 — 네이버 중심으로 가되 구글 SEO도 함께 신경';
  } else if (koreanBlogRatio < 0.1) {
    recommendation = '🔴 구글은 대형 사이트 지배 — 네이버에만 집중 권장';
  } else {
    recommendation = '🟠 구글 기회 낮음 — 선택적 공략';
  }

  return {
    keyword,
    totalResults,
    items,
    koreanBlogRatio: Math.round(koreanBlogRatio * 100) / 100,
    topDomains,
    hasFeaturedSnippet: false,
    hasPeopleAlsoAsk: false,
    googleFriendly: koreanBlogRatio >= 0.3,
    opportunityScore: score,
    recommendation,
    source,
  };
}

async function scrapeGoogle(keyword: string): Promise<GoogleSerpItem[]> {
  const { findChromePath } = await import('../chrome-finder');
  const chromePath = findChromePath();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=kr&num=10`,
      { waitUntil: 'domcontentloaded', timeout: 25000 }
    );
    await new Promise((r) => setTimeout(r, 2000));

    const results = await page.evaluate(() => {
      const out: Array<{ title: string; link: string; snippet: string }> = [];
      const nodes = document.querySelectorAll('div.g, div[data-header-feature]');
      for (const n of Array.from(nodes)) {
        const a = n.querySelector('a');
        const h3 = n.querySelector('h3');
        if (!a || !h3) continue;
        const href = (a as HTMLAnchorElement).href;
        const title = (h3 as HTMLElement).innerText;
        const snippetEl = n.querySelector('div[data-sncf], .VwiC3b');
        const snippet = (snippetEl as HTMLElement | null)?.innerText || '';
        if (href && title) out.push({ title, link: href, snippet });
        if (out.length >= 10) break;
      }
      return out;
    });

    return results.map((r, i) => {
      const domain = extractDomain(r.link);
      return {
        rank: i + 1,
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        displayLink: domain,
        domain,
        isKoreanBlog: isKoreanBlogDomain(domain),
        isAdsense: false,
      };
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
