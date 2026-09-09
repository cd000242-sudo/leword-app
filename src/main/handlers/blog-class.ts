/**
 * 내 블로그 체급 IPC — 1단계 '블로그 사실'.
 *
 * 사장님 2026-09-10 "내 블로그 체급분석을 먼저 할 수 있다면 좋겠네" · "결과는 초보자들도 쉽게 알 수 있게".
 * 이 단계가 답하는 것: 내 블로그가 지금 어떤 상태인가(글 수·시작 시점·발행 리듬·방문자·이웃·주제·검색 허용).
 * 다음 단계(이긴 자리·봉투)는 여기서 받은 글 목록을 그대로 물려받는다.
 *
 * 비용 0. 네이버가 이미 화면에 싣는 것만 받는다 — 브라이트데이터도 AI API 도 쓰지 않는다.
 * 저장은 userData/blog-class/latest.json 한 벌 + 날짜별 스냅샷(추이용).
 */
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  extractBlogId,
  fetchBlogSnapshot,
  probeInfluencer,
  summarizeActivity,
  sweepPosts,
  type BlogPostRow,
  type BlogSnapshot,
  type FetchLike,
} from '../../utils/blog-class/naver-blog-facts';
import { describeBlogFacts, type BlogFactsCard } from '../../utils/blog-class/plain-words';

export const BLOG_CLASS_PROGRESS_CHANNEL = 'blog-class-progress';

/** 기본 표본. 순위 실측(2단계)이 이 수만큼 돌기 때문에 늘릴 때는 시간을 각오해야 한다. */
const DEFAULT_SAMPLE = 50;
const MAX_SAMPLE = 200;

export interface BlogClassRecord {
  blogId: string;
  measuredAt: string;
  snapshot: BlogSnapshot | null;
  activity: ReturnType<typeof summarizeActivity> | null;
  oldestPostOn: string | null;
  isInfluencer: boolean | null;
  sampledPosts: number;
  /** 2단계(제목 → 검색어 → 순위)가 쓰는 원료. 화면은 안 쓴다. */
  posts: BlogPostRow[];
  card: BlogFactsCard;
}

const DIR = () => path.join(app.getPath('userData'), 'blog-class');
const LATEST = () => path.join(DIR(), 'latest.json');
const SNAPSHOT_DIR = () => path.join(DIR(), 'snapshots');

function ensureDir(dir: string): void {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* 이미 있으면 그만 */ }
}

function readLatest(): BlogClassRecord | null {
  try {
    return JSON.parse(fs.readFileSync(LATEST(), 'utf8')) as BlogClassRecord;
  } catch {
    return null;
  }
}

function writeRecord(record: BlogClassRecord): void {
  ensureDir(DIR());
  ensureDir(SNAPSHOT_DIR());
  fs.writeFileSync(LATEST(), JSON.stringify(record, null, 2), 'utf8');
  // 추이용 스냅샷은 글 목록을 뺀 가벼운 판으로 남긴다 — 날마다 쌓여도 폴더가 붓지 않는다.
  const { posts, ...light } = record;
  const day = record.measuredAt.slice(0, 10);
  fs.writeFileSync(path.join(SNAPSHOT_DIR(), `${day}.json`), JSON.stringify(light, null, 2), 'utf8');
}

/** '9월 10일 05:12' — 화면 근거 문구에 그대로 쓴다. */
function koreanStamp(iso: string): string {
  const date = new Date(iso);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${two(date.getHours())}:${two(date.getMinutes())}`;
}

const nodeFetch: FetchLike = (url, init) => (globalThis as any).fetch(url, init);

export interface BlogClassProgress {
  step: '블로그' | '글 목록' | '인플루언서' | '정리';
  received: number;
  total: number | null;
  message: string;
}

/**
 * 한 번 재고 저장한다. 요청 수는 블로그 1 + 인플루언서 1 + 글 목록 ⌈표본/30⌉ + 개설일 1.
 * 표본 50이면 5회다 — 1,336개 블로그라도 45회를 다 받지 않는다.
 */
export async function measureBlogClass(
  input: string,
  options: { sample?: number; onProgress?: (progress: BlogClassProgress) => void; fetchImpl?: FetchLike } = {},
): Promise<BlogClassRecord> {
  const blogId = extractBlogId(input);
  if (!blogId) throw new Error('네이버 블로그 주소나 아이디를 넣어 주세요 (예: blog.naver.com/내아이디)');
  const fetchImpl = options.fetchImpl ?? nodeFetch;
  const sample = Math.min(MAX_SAMPLE, Math.max(1, options.sample || DEFAULT_SAMPLE));
  const report = options.onProgress ?? (() => {});

  report({ step: '블로그', received: 0, total: null, message: '블로그 화면을 여는 중…' });
  const snapshot = await fetchBlogSnapshot(blogId, fetchImpl);

  report({ step: '글 목록', received: 0, total: snapshot?.postCount ?? null, message: '글 목록을 받는 중…' });
  const swept = await sweepPosts(blogId, fetchImpl, {
    limit: sample,
    includeOldest: true,
    onProgress: (received, total) => report({
      step: '글 목록', received, total, message: `글 ${received}개를 읽었어요`,
    }),
  });

  report({ step: '인플루언서', received: swept.posts.length, total: swept.totalCount, message: '인플루언서 등록 여부를 보는 중…' });
  const isInfluencer = await probeInfluencer(blogId, fetchImpl);

  if (!snapshot && swept.posts.length === 0) {
    throw new Error(`'${blogId}' 블로그를 열지 못했어요. 주소가 맞는지, 비공개 블로그가 아닌지 확인해 주세요.`);
  }

  const measuredAt = new Date().toISOString();
  // 목록을 못 읽었으면 활동 사실을 만들지 않는다 — 0 이 사실로 저장되면 다음 단계까지 오염된다.
  const activity = swept.ok ? summarizeActivity(swept.posts, Date.parse(measuredAt)) : null;
  const oldestPostOn = swept.oldest?.publishedOn ?? activity?.oldestPostOn ?? null;
  const record: BlogClassRecord = {
    blogId,
    measuredAt,
    snapshot,
    activity,
    oldestPostOn,
    isInfluencer,
    sampledPosts: swept.posts.length,
    posts: swept.posts,
    card: describeBlogFacts({
      snapshot,
      activity,
      oldestPostOn,
      isInfluencer,
      sampledPosts: swept.posts.length,
      postListUnavailable: !swept.ok,
      measuredAt: koreanStamp(measuredAt),
    }),
  };
  report({ step: '정리', received: swept.posts.length, total: swept.totalCount, message: '정리하는 중…' });
  writeRecord(record);
  return record;
}

/** 화면이 보는 값 — 글 목록은 빼고 준다(렌더러로 200개를 넘길 이유가 없다). */
function forRenderer(record: BlogClassRecord | null) {
  if (!record) return null;
  const { posts, ...light } = record;
  return { ...light, postsAvailable: posts.length };
}

export function setupBlogClassHandlers(): void {
  if (!ipcMain.listenerCount('blog-class-get')) {
    ipcMain.handle('blog-class-get', async () => {
      const record = readLatest();
      return { success: true, record: forRenderer(record) };
    });
  }

  if (!ipcMain.listenerCount('blog-class-measure')) {
    ipcMain.handle('blog-class-measure', async (event, payload?: { blogUrl?: string; sample?: number }) => {
      const input = String(payload?.blogUrl || '').trim() || readLatest()?.blogId || '';
      if (!input) {
        return { success: false, error: '내 블로그 주소를 한 번만 넣어 주세요 (예: blog.naver.com/내아이디)' };
      }
      try {
        const record = await measureBlogClass(input, {
          sample: payload?.sample,
          onProgress: (progress) => {
            try { event.sender.send(BLOG_CLASS_PROGRESS_CHANNEL, progress); } catch { /* 창이 닫혔을 수 있다 */ }
          },
        });
        return { success: true, record: forRenderer(record) };
      } catch (error: any) {
        return { success: false, error: error?.message || '블로그를 읽지 못했어요' };
      }
    });
  }

  console.log('[BLOG-CLASS] ✅ 내 블로그 체급 핸들러 등록 완료');
}
