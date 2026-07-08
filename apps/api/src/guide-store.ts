/**
 * 📚 LEWORD 가이드(콘텐츠) 저장소 — 고CPC SEO 콘텐츠 페이지용
 *
 * 애드센스 달러 채굴 구조: LEWORD가 찾은 고CPC 황금키워드 → 콘텐츠갭을 메우는 고품질 글 →
 * /leword/guide/<slug> 로 서버렌더(색인 가능) → 애드센스(고CPC 니치 = 높은 RPM).
 *
 * DB 없음. 코드베이스 관행대로 /data 볼륨(Docker named volume, 재배포 생존)에 JSON 저장.
 * - /data/guides/<slug>.json  : 글 1개
 * - /data/guides/index.json   : 발행글 목록(sitemap/인덱스용, 경량)
 *
 * 발행(status:'published')된 글만 index/sitemap 에 노출 (초안은 관리자 검수 대기 = 대량자동생성 제재 회피).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GuideArticle {
  slug: string;
  title: string;
  description: string;
  category: string;
  keyword: string;
  cpc?: number | null;
  markdown: string;
  faq?: Array<{ q: string; a: string }>;
  status: 'draft' | 'published';
  createdAt: number;
  updatedAt: number;
  publishedAt?: number | null;
}

export interface GuideIndexEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: number;
}

function dataDir(): string {
  const dir =
    process.env['LEWORD_SERVER_USER_DATA'] ||
    process.env['LEWORD_MOBILE_DATA_DIR'] ||
    process.env['LEWORD_MOBILE_CACHE_DIR'] ||
    (fs.existsSync('/data') ? '/data' : '') ||
    path.join(os.tmpdir(), 'leword');
  return dir;
}

function guidesDir(): string {
  return path.join(dataDir(), 'guides');
}
function guideFile(slug: string): string {
  return path.join(guidesDir(), `${sanitizeSlug(slug)}.json`);
}
function indexFile(): string {
  return path.join(guidesDir(), 'index.json');
}

/** 슬러그 정규화: 소문자 영숫자+하이픈만 (경로 주입 방지) */
export function sanitizeSlug(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function ensureDir(): void {
  try {
    fs.mkdirSync(guidesDir(), { recursive: true });
  } catch {
    // 런타임은 캐시 없이도 동작
  }
}

export function getGuide(slug: string): GuideArticle | null {
  try {
    const f = guideFile(slug);
    if (!fs.existsSync(f)) return null;
    const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!parsed || typeof parsed.slug !== 'string') return null;
    return parsed as GuideArticle;
  } catch {
    return null;
  }
}

/** 발행된 글 목록(최신순) — sitemap/인덱스용 */
export function listPublishedGuides(): GuideIndexEntry[] {
  try {
    const f = indexFile();
    if (!fs.existsSync(f)) return [];
    const parsed = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rows: GuideIndexEntry[] = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return rows
      .filter((r) => r && r.slug && r.publishedAt)
      .sort((a, b) => b.publishedAt - a.publishedAt);
  } catch {
    return [];
  }
}

function rebuildIndex(): void {
  ensureDir();
  const entries: GuideIndexEntry[] = [];
  try {
    for (const name of fs.readdirSync(guidesDir())) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      try {
        const a = JSON.parse(fs.readFileSync(path.join(guidesDir(), name), 'utf8')) as GuideArticle;
        if (a && a.status === 'published' && a.slug) {
          entries.push({
            slug: a.slug,
            title: a.title,
            description: a.description,
            category: a.category,
            publishedAt: a.publishedAt || a.updatedAt || a.createdAt,
          });
        }
      } catch {
        /* skip bad file */
      }
    }
  } catch {
    /* no dir yet */
  }
  try {
    fs.writeFileSync(indexFile(), JSON.stringify({ entries }), 'utf8');
  } catch {
    /* ignore */
  }
}

/** 글 저장(생성/수정) + 인덱스 갱신. 발행 시 publishedAt 세팅. */
export function saveGuide(input: Partial<GuideArticle> & { slug: string; title: string; markdown: string }): GuideArticle {
  ensureDir();
  const now = Date.now();
  const slug = sanitizeSlug(input.slug);
  const existing = getGuide(slug);
  const status: 'draft' | 'published' = input.status || existing?.status || 'draft';
  const article: GuideArticle = {
    slug,
    title: input.title,
    description: input.description ?? existing?.description ?? '',
    category: input.category ?? existing?.category ?? '',
    keyword: input.keyword ?? existing?.keyword ?? '',
    cpc: input.cpc ?? existing?.cpc ?? null,
    markdown: input.markdown,
    faq: input.faq ?? existing?.faq ?? [],
    status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    publishedAt:
      status === 'published' ? (existing?.publishedAt || now) : (existing?.publishedAt ?? null),
  };
  fs.writeFileSync(guideFile(slug), JSON.stringify(article, null, 2), 'utf8');
  rebuildIndex();
  return article;
}

export function deleteGuide(slug: string): boolean {
  try {
    const f = guideFile(slug);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    rebuildIndex();
    return true;
  } catch {
    return false;
  }
}
