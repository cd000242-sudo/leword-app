import { promises as fs } from 'fs';
import * as path from 'path';
import { CtaRole } from '../core/types';

type SnippetType = 'cta' | 'imagePrompt';

interface SnippetBase {
  id: string;
  tags?: string[];
  description?: string;
  usageCount?: number;
  lastUsedAt?: string;
  category?: string; // 포스팅별 카테고리/폴더
}

export interface CtaSnippet extends SnippetBase {
  type: 'cta';
  role: CtaRole;
  text: string;
  hook: string;
  urlTemplate?: string;
}

export interface ImagePromptSnippet extends SnippetBase {
  type: 'imagePrompt';
  prompt: string;
  style?: string;
  sectionIds?: string[];
  tone?: string;
}

export interface SnippetLibraryFile {
  version: number;
  ctas: CtaSnippet[];
  imagePrompts: ImagePromptSnippet[];
  categories: string[]; // 포스팅별 카테고리 목록
}

const DEFAULT_LIBRARY: SnippetLibraryFile = {
  version: 1,
  ctas: [
    {
      id: 'cta-official-info',
      type: 'cta',
      role: 'information',
      text: '2025년 공식 안내 바로 보기',
      hook: '💡 최신 정보를 놓치지 않으려면 지금 확인하세요 👇',
      urlTemplate: '{OFFICIAL_URL}',
      tags: ['official', 'seo', 'government']
    },
    {
      id: 'cta-shopping-buy',
      type: 'cta',
      role: 'application',
      text: '지금 바로 혜택받고 신청하기',
      hook: '🎁 한정 혜택이 곧 종료됩니다. 지금 바로 신청하세요 👇',
      tags: ['shopping', 'conversion', 'limited']
    },
    {
      id: 'cta-support-center',
      type: 'cta',
      role: 'support',
      text: '전문 상담원과 바로 연결',
      hook: '🤝 전문가 상담을 통해 맞춤 솔루션을 받아보세요 👇',
      tags: ['support', 'consulting']
    }
  ],
  imagePrompts: [
    {
      id: 'img-shopping-desire',
      type: 'imagePrompt',
      prompt:
        'High-quality lifestyle photography of a satisfied customer using the product indoors, warm natural lighting, optimistic mood, Korean setting',
      tags: ['shopping', 'desire', 'testimonial'],
      sectionIds: ['desire_stage'],
      tone: 'warm'
    },
    {
      id: 'img-shopping-action',
      type: 'imagePrompt',
      prompt:
        'Clean modern promotional banner with bold typography, countdown timer motif, vibrant gradient background, emphasize urgency and premium benefits',
      tags: ['shopping', 'action', 'urgency'],
      sectionIds: ['action_stage'],
      tone: 'bold'
    },
    {
      id: 'img-faq-support',
      type: 'imagePrompt',
      prompt:
        'Minimalist illustration of friendly customer support scene, bright colors, flat design, Korean text placeholders',
      tags: ['faq', 'support'],
      tone: 'friendly'
    }
  ],
  categories: []
};

let libraryCache: { data: SnippetLibraryFile; mtimeMs: number } | null = null;

const LIBRARY_FILENAME = 'snippet-library.json';

function getLibraryPath(): string {
  // Electron 환경에서는 userData 디렉토리 사용
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), LIBRARY_FILENAME);
    }
  } catch {
    // Electron이 아닌 환경에서는 process.cwd() 사용
  }
  return path.join(process.cwd(), 'data', LIBRARY_FILENAME);
}

async function ensureLibraryFile(): Promise<void> {
  const filePath = getLibraryPath();
  const dir = path.dirname(filePath);
  
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(DEFAULT_LIBRARY, null, 2), 'utf-8');
  }
}

async function loadLibraryFile(): Promise<SnippetLibraryFile> {
  await ensureLibraryFile();
  const filePath = getLibraryPath();
  const stat = await fs.stat(filePath);
  if (libraryCache && libraryCache.mtimeMs === stat.mtimeMs) {
    return libraryCache.data;
  }

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed: SnippetLibraryFile = JSON.parse(raw);
    libraryCache = { data: parsed, mtimeMs: stat.mtimeMs };
    return parsed;
  } catch (error) {
    console.log('[SNIPPET] 라이브러리 로드 실패, 기본값 사용:', (error as Error).message);
    libraryCache = { data: DEFAULT_LIBRARY, mtimeMs: stat.mtimeMs };
    return DEFAULT_LIBRARY;
  }
}

async function persistLibrary(data: SnippetLibraryFile): Promise<void> {
  const filePath = getLibraryPath();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  libraryCache = { data, mtimeMs: Date.now() };
}

function scoreSnippet(tags: string[] = [], targetTags: string[] = []): number {
  if (tags.length === 0 || targetTags.length === 0) return 0;
  let score = 0;
  const lowerTarget = targetTags.map((tag) => tag.toLowerCase());
  tags.forEach((tag) => {
    if (lowerTarget.includes(tag.toLowerCase())) {
      score += 2;
    } else if (lowerTarget.some((target) => target.includes(tag.toLowerCase()))) {
      score += 1;
    }
  });
  return score;
}

export interface RecommendationContext {
  contentMode?: string | undefined;
  sectionId?: string | undefined;
  tags?: string[] | undefined;
  keywords?: string[] | undefined;
}

export async function readSnippetLibrary(): Promise<SnippetLibraryFile> {
  return await loadLibraryFile();
}

export async function writeSnippetLibrary(data: SnippetLibraryFile): Promise<void> {
  await persistLibrary(data);
}

export async function getRecommendedCtaSnippet(
  context: RecommendationContext,
  preferredRole?: CtaRole
): Promise<CtaSnippet | null> {
  const library = await loadLibraryFile();
  const tags = [
    context.contentMode || '',
    context.sectionId || '',
    ...(context.tags || []),
    ...(context.keywords || [])
  ].filter(Boolean);

  let candidates = library.ctas;
  if (preferredRole) {
    candidates = candidates.filter((snippet) => snippet.role === preferredRole);
  }

  const scored = candidates
    .map((snippet) => ({
      snippet,
      score:
        (preferredRole && snippet.role === preferredRole ? 3 : 0) +
        scoreSnippet(snippet.tags, tags) +
        Math.min(snippet.usageCount ?? 0, 20) * 0.05
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.snippet ?? null;
}

export async function getRecommendedImagePromptSnippet(
  context: RecommendationContext
): Promise<ImagePromptSnippet | null> {
  const library = await loadLibraryFile();
  const tags = [
    context.contentMode || '',
    context.sectionId || '',
    ...(context.tags || []),
    ...(context.keywords || [])
  ].filter(Boolean);

  const candidates = library.imagePrompts.filter((snippet) => {
    if (context.sectionId && snippet.sectionIds && snippet.sectionIds.length > 0) {
      return snippet.sectionIds.includes(context.sectionId);
    }
    return true;
  });

  const scored = candidates
    .map((snippet) => ({
      snippet,
      score: scoreSnippet(snippet.tags, tags) + Math.min(snippet.usageCount ?? 0, 20) * 0.05
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.snippet ?? null;
}

export async function markSnippetUsed(snippetId: string, type: SnippetType): Promise<void> {
  const library = await loadLibraryFile();
  const list = type === 'cta' ? library.ctas : library.imagePrompts;
  const target = list.find((item) => item.id === snippetId);
  if (target) {
    target.usageCount = (target.usageCount ?? 0) + 1;
    target.lastUsedAt = new Date().toISOString();
    await persistLibrary(library);
  }
}

/**
 * 카테고리별 스니펫 조회
 */
export async function getSnippetsByCategory(
  type: SnippetType,
  category?: string
): Promise<(CtaSnippet | ImagePromptSnippet)[]> {
  const library = await loadLibraryFile();
  const list = type === 'cta' ? library.ctas : library.imagePrompts;
  if (!category) {
    return list;
  }
  return list.filter(snippet => snippet.category === category);
}

/**
 * 카테고리 생성
 */
export async function createSnippetCategory(categoryName: string): Promise<boolean> {
  const library = await loadLibraryFile();
  if (library.categories.includes(categoryName)) {
    return false; // 이미 존재
  }
  
  library.categories.push(categoryName);
  await persistLibrary(library);
  return true;
}

/**
 * 카테고리 삭제
 */
export async function deleteSnippetCategory(categoryName: string): Promise<boolean> {
  const library = await loadLibraryFile();
  const index = library.categories.indexOf(categoryName);
  if (index === -1) return false;
  
  library.categories.splice(index, 1);
  
  // 해당 카테고리의 스니펫들의 카테고리 제거
  library.ctas.forEach(cta => {
    if (cta.category === categoryName) {
      delete cta.category;
    }
  });
  library.imagePrompts.forEach(prompt => {
    if (prompt.category === categoryName) {
      delete prompt.category;
    }
  });
  
  await persistLibrary(library);
  return true;
}

/**
 * 스니펫 카테고리 변경
 */
export async function updateSnippetCategory(
  snippetId: string,
  type: SnippetType,
  category?: string
): Promise<boolean> {
  const library = await loadLibraryFile();
  const list = type === 'cta' ? library.ctas : library.imagePrompts;
  const snippet = list.find(item => item.id === snippetId);
  if (!snippet) return false;
  
  if (category) {
    snippet.category = category;
    // 카테고리 목록 업데이트
    if (!library.categories.includes(category)) {
      library.categories.push(category);
    }
  } else {
    delete snippet.category;
  }
  
  await persistLibrary(library);
  return true;
}

