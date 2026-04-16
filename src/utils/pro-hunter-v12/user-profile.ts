// PRO Hunter v12 — 사용자 블로그 프로파일
// 작성: 2026-04-15
// 사용자 블로그 URL 등록 → 평균 지수/카테고리 자동 측정 → 예측에 반영

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface UserProfile {
  blogUrl: string;             // https://blog.naver.com/{id}
  blogId: string;
  blogIndex: number;           // 0~100
  experienceMonths: number;
  avgPostWordCount: number;
  category?: string;
  totalPosts?: number;
  registeredAt: number;
  lastMeasuredAt: number;
  manualOverride?: boolean;    // 사용자가 수동 설정한 경우
}

const FILE_NAME = 'user-profile.json';

function getProfilePath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

export function loadProfile(): UserProfile | null {
  try {
    const p = getProfilePath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as UserProfile;
  } catch (err) {
    console.error('[USER-PROFILE] 로드 실패:', err);
    return null;
  }
}

export function saveProfile(profile: UserProfile): void {
  try {
    fs.writeFileSync(getProfilePath(), JSON.stringify(profile, null, 2), 'utf8');
    console.log('[USER-PROFILE] ✅ 저장:', profile.blogId);
  } catch (err) {
    console.error('[USER-PROFILE] 저장 실패:', err);
    throw err;
  }
}

export function deleteProfile(): void {
  const p = getProfilePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function extractBlogId(url: string): string | null {
  const m = url.match(/blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * 사용자 블로그 측정 (간단 추정)
 * - blog.naver.com 메인에서 글 수, 운영 기간 추정
 * - 블로그 지수는 글 수 + 평균 길이로 거친 추정
 */
export async function measureBlog(url: string): Promise<UserProfile> {
  const blogId = extractBlogId(url);
  if (!blogId) throw new Error('네이버 블로그 URL이 아닙니다 (blog.naver.com/{id})');

  // 동적 import (puppeteer 무거움)
  const puppeteer = (await import('puppeteer')).default;
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
    await page.goto(`https://blog.naver.com/${blogId}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise((r) => setTimeout(r, 1500));

    // mainFrame 진입
    const mainFrame = page.frames().find((f) => f.url().includes('blog.naver.com') && f.url() !== `https://blog.naver.com/${blogId}`)
      || page.mainFrame();

    const data = await mainFrame.evaluate(() => {
      // 글 수 (네이버 블로그 카테고리 카운트 또는 PostList)
      let totalPosts = 0;
      const countTexts = document.body.innerText.match(/(\d{1,4})개의\s*글|글\s*(\d{1,4})개/g) || [];
      for (const t of countTexts) {
        const n = parseInt(t.replace(/[^\d]/g, ''), 10);
        if (n > totalPosts) totalPosts = n;
      }

      // 카테고리 추정
      const catLinks = Array.from(document.querySelectorAll('.category, .gnb_lst, .blog_category a'));
      const categories = catLinks.map((a) => (a as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 5);

      return { totalPosts, categories };
    }).catch(() => ({ totalPosts: 0, categories: [] as string[] }));

    // 운영 개월 추정 (글 수 기반)
    const totalPosts = data.totalPosts || 0;
    let experienceMonths = totalPosts < 10 ? 1 : totalPosts < 50 ? 3 : totalPosts < 200 ? 6 : totalPosts < 500 ? 12 : totalPosts < 1000 ? 24 : 36;

    // 블로그 지수: accurate-blog-index-extractor 우선 사용
    let blogIndex = 30;
    try {
      const { getExtractorInstance } = await import('../accurate-blog-index-extractor');
      const extractor = getExtractorInstance();
      const accurateResult = await extractor.extractAccurateBlogIndex(blogId);
      if (accurateResult && accurateResult.blogIndex > 0) {
        // 0~200,000 스케일을 0~100으로 정규화 (log scale)
        const log = Math.log10(accurateResult.blogIndex + 1) / Math.log10(200001);
        blogIndex = Math.round(log * 100);
        if (accurateResult.stats.blogAgeYears) {
          experienceMonths = Math.max(experienceMonths, accurateResult.stats.blogAgeYears * 12);
        }
        console.log(`[USER-PROFILE] 정밀 측정: raw=${accurateResult.blogIndex}, normalized=${blogIndex}, conf=${accurateResult.confidence}`);
      } else {
        // fallback: 글 수 기반 추정
        if (totalPosts >= 1000) blogIndex = 75;
        else if (totalPosts >= 500) blogIndex = 65;
        else if (totalPosts >= 200) blogIndex = 55;
        else if (totalPosts >= 50) blogIndex = 45;
        else if (totalPosts >= 10) blogIndex = 35;
      }
    } catch (err) {
      console.warn('[USER-PROFILE] 정밀 추출 실패, 폴백 사용:', (err as Error).message);
      if (totalPosts >= 1000) blogIndex = 75;
      else if (totalPosts >= 500) blogIndex = 65;
      else if (totalPosts >= 200) blogIndex = 55;
      else if (totalPosts >= 50) blogIndex = 45;
      else if (totalPosts >= 10) blogIndex = 35;
    }

    return {
      blogUrl: url,
      blogId,
      blogIndex,
      experienceMonths,
      avgPostWordCount: 1200, // 기본값 (정확한 측정은 글 별 크롤 필요)
      category: data.categories[0],
      totalPosts,
      registeredAt: Date.now(),
      lastMeasuredAt: Date.now(),
      manualOverride: false,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * 사용자 능력 객체로 변환 (win-predictor 입력용)
 */
export function profileToCapability(profile: UserProfile | null) {
  if (!profile) {
    return { blogIndex: 40, experienceMonths: 6, avgPostWordCount: 1000 };
  }
  return {
    blogIndex: profile.blogIndex,
    experienceMonths: profile.experienceMonths,
    avgPostWordCount: profile.avgPostWordCount,
    category: profile.category,
  };
}
