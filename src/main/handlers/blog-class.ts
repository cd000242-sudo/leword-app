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
import { EnvironmentManager } from '../../utils/environment-manager';
import { measureMyRanks } from './blog-class-rank';
import { buildEnvelope, type BlogEnvelope, type WonRow } from '../../utils/blog-class/envelope';

export const BLOG_CLASS_PROGRESS_CHANNEL = 'blog-class-progress';

/** 기본 표본. 순위 실측(2단계)이 이 수만큼 돌기 때문에 늘릴 때는 시간을 각오해야 한다. */
const DEFAULT_SAMPLE = 50;
/**
 * 중간 저장 간격. 기록이 60KB 대라 매 줄마다 쓰면 80번을 쓴다 — 그만큼 자주 쓸 이유가 없다.
 * 순위 한 건이 약 2초이므로 6초면 두세 줄마다 한 번이다. 끊겨도 잃는 건 그 몇 줄이다.
 */
const PARTIAL_SAVE_MS = 6000;
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
  /** 내가 이긴 자리 — 순위를 실제로 잰 행. 안 쟀으면 빈 배열. */
  wonRows?: WonRow[];
  /** 내가 이겨본 크기. 이긴 기록이 없으면 null — 기본값을 지어내지 않는다. */
  envelope?: BlogEnvelope | null;
  rankSummary?: { candidates: number; withVolume: number; ranked: number; won: number; blocked: number; seconds: number };
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
  step: '블로그' | '글 목록' | '인플루언서' | '검색어' | '순위' | '자리' | '정리';
  received: number;
  total: number | null;
  message: string;
}

/** 검색광고 자격 — 순위 실측 전에 "실제로 쓰이는 말"만 남기는 데 쓴다. */
function searchAdConfig(cfg: any) {
  return {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
}

/**
 * 한 번 재고 저장한다. 요청 수는 블로그 1 + 인플루언서 1 + 글 목록 ⌈표본/30⌉ + 개설일 1.
 * 표본 50이면 5회다 — 1,336개 블로그라도 45회를 다 받지 않는다.
 */
export async function measureBlogClass(
  input: string,
  options: { sample?: number; withRanks?: boolean; maxRank?: number; onProgress?: (progress: BlogClassProgress) => void; fetchImpl?: FetchLike } = {},
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
  /*
   * 2단계 — 내 순위 실측 → 봉투("내가 이겨본 크기").
   * 초보자에게 제일 필요한 답이 여기서 나온다: "이건 네가 이겨본 크기다".
   * 건당 약 2초라 시간이 걸린다. 그래서 1단계 카드를 먼저 저장해 두고 이어서 잰다 —
   * 도중에 앱을 닫아도 블로그 사실은 남는다.
   */
  writeRecord(record);
  if (options.withRanks !== false) {
    const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
      ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
    let lastPartialAt = 0;
    const ranked = await measureMyRanks(
      swept.posts.map((post) => ({
        title: post.title,
        url: `https://blog.naver.com/${blogId}/${post.logNo}`,
        publishedOn: post.publishedOn,
        searchable: post.searchable,
      })),
      searchAdConfig(manager.getConfig()),
      {
        maxRank: options.maxRank,
        // 블로그 설정에서 고른 대표 주제 — 이긴 행에 달려 봉투의 '잘 이기는 이야기'가 된다.
        blogTopic: snapshot?.declaredTopic || null,
        onProgress: (p) => report({ step: p.phase, received: p.done, total: p.total, message: p.message }),
        // 잰 줄이 생기는 대로 담아 둔다. 끊겨도 그때까지 잰 것은 남는다.
        onRows: (rows) => {
          record.wonRows = [...rows];
          record.envelope = buildEnvelope(rows);
          const now = Date.now();
          if (now - lastPartialAt < PARTIAL_SAVE_MS) return;
          lastPartialAt = now;
          try { writeRecord(record); } catch { /* 저장 못 해도 재는 것은 계속한다 */ }
        },
      },
    );
    record.wonRows = ranked.rows;
    record.envelope = ranked.envelope;
    record.rankSummary = ranked.summary;
  }

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
    ipcMain.handle('blog-class-measure', async (event, payload?: { blogUrl?: string; sample?: number; withRanks?: boolean; maxRank?: number }) => {
      const input = String(payload?.blogUrl || '').trim() || readLatest()?.blogId || '';
      if (!input) {
        return { success: false, error: '내 블로그 주소를 한 번만 넣어 주세요 (예: blog.naver.com/내아이디)' };
      }
      try {
        const record = await measureBlogClass(input, {
          sample: payload?.sample,
          withRanks: payload?.withRanks !== false,
          maxRank: payload?.maxRank,
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
