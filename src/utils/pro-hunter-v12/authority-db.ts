// PRO Hunter v12 — 도메인 권위 DB
// 작성: 2026-04-15 (Tier 2)
// SERP 크롤 시 매번 상위 블로거를 집계 → 시간이 쌓이면 "어느 블로거가 어느 분야 독점"을 자동으로 알게 됨

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { FetchedPost } from './serp-content-fetcher';

export interface BloggerRecord {
  bloggerId: string;         // blog.naver.com/{id}에서 추출
  bloggerName: string;
  totalAppearances: number;  // 전체 SERP에서 몇 번 노출됐나
  top3Appearances: number;   // 1~3위 노출 횟수
  top1Count: number;         // 1위 횟수
  categories: Record<string, number>;  // 카테고리별 카운트
  recentKeywords: string[];  // 최근 30개 키워드 (LRU)
  avgRank: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface AuthorityStore {
  version: 1;
  bloggers: Record<string, BloggerRecord>;
  totalSerpsProcessed: number;
  lastProcessedAt: number;
}

const FILE_NAME = 'authority-db.json';

function getStorePath(): string {
  const dir = path.join(app.getPath('userData'), 'pro-hunter-v12');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILE_NAME);
}

function loadStore(): AuthorityStore {
  try {
    const p = getStorePath();
    if (!fs.existsSync(p)) return { version: 1, bloggers: {}, totalSerpsProcessed: 0, lastProcessedAt: 0 };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
  } catch {}
  return { version: 1, bloggers: {}, totalSerpsProcessed: 0, lastProcessedAt: 0 };
}

function saveStore(store: AuthorityStore): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf8');
}

function extractBloggerId(url: string): string | null {
  const m = url.match(/blog\.naver\.com\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * SERP 결과를 Authority DB에 기록
 */
export function recordSerp(keyword: string, posts: FetchedPost[], category?: string): void {
  if (posts.length === 0) return;

  const store = loadStore();
  const cat = category || 'uncategorized';

  for (const p of posts) {
    const bloggerId = extractBloggerId(p.url);
    if (!bloggerId) continue;

    let rec = store.bloggers[bloggerId];
    if (!rec) {
      rec = {
        bloggerId,
        bloggerName: p.bloggerName || bloggerId,
        totalAppearances: 0,
        top3Appearances: 0,
        top1Count: 0,
        categories: {},
        recentKeywords: [],
        avgRank: 0,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
      };
      store.bloggers[bloggerId] = rec;
    }

    rec.totalAppearances++;
    if (p.rank <= 3) rec.top3Appearances++;
    if (p.rank === 1) rec.top1Count++;
    rec.categories[cat] = (rec.categories[cat] || 0) + 1;
    rec.lastSeenAt = Date.now();

    // recentKeywords LRU (30개)
    rec.recentKeywords = [keyword, ...rec.recentKeywords.filter((k) => k !== keyword)].slice(0, 30);

    // 평균 순위 업데이트 (incremental)
    rec.avgRank = Math.round(((rec.avgRank * (rec.totalAppearances - 1)) + p.rank) / rec.totalAppearances * 10) / 10;
  }

  store.totalSerpsProcessed++;
  store.lastProcessedAt = Date.now();
  saveStore(store);
}

export interface CompetitorInsight {
  keyword: string;
  topCompetitors: Array<{
    bloggerId: string;
    bloggerName: string;
    authorityLevel: 'dominant' | 'strong' | 'regular' | 'new';
    totalAppearances: number;
    top3Appearances: number;
    top1Count: number;
    avgRank: number;
    topCategories: string[];
    isSpecialist: boolean;    // 해당 카테고리 전문가
  }>;
  insights: string[];
}

/**
 * 특정 키워드/카테고리의 상위 블로거 insight
 */
export function getCompetitorInsight(category?: string): CompetitorInsight {
  const store = loadStore();
  const blogger = Object.values(store.bloggers);

  // 카테고리 필터
  const filtered = category
    ? blogger.filter((b) => (b.categories[category] || 0) > 0)
    : blogger;

  // 상위 노출 기준 정렬
  const sorted = filtered
    .sort((a, b) => b.top3Appearances * 10 + b.totalAppearances - (a.top3Appearances * 10 + a.totalAppearances))
    .slice(0, 10);

  const topCompetitors = sorted.map((b) => {
    const cats = Object.entries(b.categories).sort((a, c) => c[1] - a[1]);
    const topCats = cats.slice(0, 3).map(([k]) => k);
    const totalInCat = category ? b.categories[category] || 0 : b.totalAppearances;
    const catRatio = b.totalAppearances > 0 ? totalInCat / b.totalAppearances : 0;

    let authorityLevel: 'dominant' | 'strong' | 'regular' | 'new';
    if (b.top3Appearances >= 10) authorityLevel = 'dominant';
    else if (b.top3Appearances >= 5) authorityLevel = 'strong';
    else if (b.totalAppearances >= 3) authorityLevel = 'regular';
    else authorityLevel = 'new';

    return {
      bloggerId: b.bloggerId,
      bloggerName: b.bloggerName,
      authorityLevel,
      totalAppearances: b.totalAppearances,
      top3Appearances: b.top3Appearances,
      top1Count: b.top1Count,
      avgRank: b.avgRank,
      topCategories: topCats,
      isSpecialist: catRatio >= 0.6,
    };
  });

  // insights 자동 생성
  const insights: string[] = [];
  const dominant = topCompetitors.filter((c) => c.authorityLevel === 'dominant');
  if (dominant.length >= 3) {
    insights.push(
      `⚠ 이 카테고리는 소수 블로거(${dominant.map((d) => d.bloggerName).slice(0, 3).join(', ')})가 지배`
    );
  }
  const specialists = topCompetitors.filter((c) => c.isSpecialist);
  if (specialists.length >= 2) {
    insights.push(`📊 ${specialists.length}명의 전문 블로거 존재 — 아마추어 글은 밀릴 가능성 높음`);
  }
  if (topCompetitors.length < 5) {
    insights.push('🟢 경쟁자 풀이 작음 — 기회 존재');
  }

  return {
    keyword: category || 'all',
    topCompetitors,
    insights,
  };
}

export function getAuthorityStats(): { totalBloggers: number; totalSerps: number; lastProcessedAt: number } {
  const store = loadStore();
  return {
    totalBloggers: Object.keys(store.bloggers).length,
    totalSerps: store.totalSerpsProcessed,
    lastProcessedAt: store.lastProcessedAt,
  };
}
