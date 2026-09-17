/**
 * 홈판 신호 공개 발행 — 사이트가 앱 없이도 읽는 정적 JSON(2026-09-17).
 *
 * 사장님: "사이트는 굳이 앱을 안 켜도 보이도록 해 줄래."
 *
 * 그전에는 사이트가 브리지(127.0.0.1)만 불러서, 앱이 꺼지면 "앱이 꺼져 있습니다" 안내만 떴다.
 * 다른 보드(황금 · 제휴 · 실검 틈새 · 추천키워드)는 전부 정적 JSON 을 읽어 앱 없이 보인다 — 홈판만 없었다.
 *
 * 모양은 브리지 응답(service.stories)과 같게 둔다. 그래야 사이트가 코드 한 벌로 브리지 · 정적을 다 그린다.
 * 내 PC 상태(runtime · settings)만 뺀다 — 남의 화면에 내 수집기 상태가 갈 이유가 없다.
 *
 * 이 파일은 순수 함수만 둔다(파일 쓰기 · 커밋 없음). 기존 보드 발행기와 같은 규칙이다.
 */
import * as path from 'path';

export const HOMEFEED_PUBLIC_SCHEMA = 'homefeed-public-v1';

/** 사이트 레포 안에서 공개 데이터가 놓이는 자리 — 다른 보드와 같은 폴더. */
export const SITE_DATA_RELATIVE = path.join('spa', 'public', 'data');

/** 발행 파일 이름 — 사이트는 /data/homefeed-stories.json 으로 읽는다. */
export const HOMEFEED_PUBLIC_FILE = 'homefeed-stories.json';

/** 앱 브리지 응답(service.stories)에서 공개본이 쓰는 부분만. */
export interface HomefeedBridgeLike {
  computedAt?: unknown;
  snapshotAt?: unknown;
  historySnapshots?: unknown;
  storedSnapshots?: unknown;
  sources?: unknown;
  counts?: unknown;
  stories?: unknown;
  publicDetails?: Record<string, unknown>;
}

export interface HomefeedPublicPayload {
  schemaVersion: typeof HOMEFEED_PUBLIC_SCHEMA;
  publishedAt: string;
  computedAt: string | null;
  snapshotAt: string | null;
  historySnapshots: number;
  storedSnapshots: number;
  sources: unknown[];
  counts: { status: Record<string, number>; window: Record<string, number> };
  stories: unknown[];
  publicDetails: Record<string, unknown>;
}

function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function countMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === 'number' && Number.isFinite(count)) out[key] = count;
  }
  return out;
}

/**
 * 공개 발행본을 만든다. 실을 스토리가 없으면 null — 부르는 쪽이 기존 파일을 그대로 둔다.
 *
 * 빈 회차로 덮으면 사이트가 통째로 비어 보인다(기존 보드 발행기가 같은 사고를 막는 장치를 갖고 있다).
 * 앱 응답도 바깥 입력으로 본다 — 목록 모양이 아니면 만들지 않는다.
 */
export function buildHomefeedPublicPayload(
  bridge: HomefeedBridgeLike | null | undefined,
  _previous: HomefeedPublicPayload | null | undefined,
  options: { nowMs: number },
): HomefeedPublicPayload | null {
  if (!bridge || typeof bridge !== 'object') return null;
  const stories = Array.isArray(bridge.stories) ? bridge.stories : null;
  if (!stories || stories.length === 0) return null;
  const counts = (bridge.counts && typeof bridge.counts === 'object' ? bridge.counts : {}) as { status?: unknown; window?: unknown };
  return {
    schemaVersion: HOMEFEED_PUBLIC_SCHEMA,
    publishedAt: new Date(options.nowMs).toISOString(),
    computedAt: isoOrNull(bridge.computedAt),
    snapshotAt: isoOrNull(bridge.snapshotAt),
    historySnapshots: typeof bridge.historySnapshots === 'number' ? bridge.historySnapshots : 0,
    storedSnapshots: typeof bridge.storedSnapshots === 'number' ? bridge.storedSnapshots : 0,
    sources: Array.isArray(bridge.sources) ? bridge.sources : [],
    counts: { status: countMap(counts.status), window: countMap(counts.window) },
    stories: stories.map(publicSummary),
    publicDetails: Object.fromEntries(Object.entries(bridge.publicDetails ?? {}).filter(([id]) => stories.some((row: any) => row?.id === id))
      .map(([id, detail]) => [id, publicDetail(detail)])),
  };
}

/** 명시된 공개 필드만 복사한다. 생성/편집 서비스의 개인 결과를 통째로 발행하지 않는다. */
const SUMMARY_KEYS = ['id', 'issueKey', 'keyword', 'category', 'capturedAt', 'window', 'status', 'anchor', 'delta', 'deltaReason',
  'signals', 'tensions', 'funGap', 'alternativeAngles', 'payoffCount', 'noSearchPassed', 'tellable', 'firstCard', 'visualStrategy', 'thumbnail', 'risks'] as const;
function publicSummary(value: unknown): Record<string, unknown> {
  const row = value && typeof value === 'object' ? value as Record<string, any> : {};
  const editorial = row.editorial?.public === true ? { ...row.editorial, selection: null, error: null } : undefined;
  return { ...Object.fromEntries(SUMMARY_KEYS.filter((key) => key in row).map((key) => [key, row[key]])),
    // 실수로 개인 목록을 전달해도 작성안에서 파생한 문구까지 공개하지 않는다.
    ...(row.editorial && !editorial ? { noSearchPassed: false, tellable: null, firstCard: { headline1: '', headline2: null, hook: null, possible: false } } : {}),
    ...(editorial ? { editorial } : {}), progress: { titles: false, selected: false, drafts: 0, images: 0 } };
}
function publicDetail(value: unknown): Record<string, unknown> {
  const row = value && typeof value === 'object' ? value as Record<string, any> : {};
  // 입력은 발행 전용 projection에서 오지만 assets를 다시 비워 실수로 개인 작업물이 섞이는 것을 막는다.
  return { story: row.story, editorial: row.editorial?.public === true ? { ...row.editorial, selection: null, error: null } : null,
    readOnly: true, timeline: [], assets: { review: null, titles: null, prompts: [], promptsRefinedBy: null, selection: null, drafts: [], images: [] } };
}

/** 사이트 폴더를 자동으로 찾을 때 훑는 자리 — 바탕화면 · 문서 아래의 흔한 이름. */
const SITE_FOLDER_NAMES: readonly string[] = ['리더 네이버 자동화', 'naver'];
const SITE_PARENTS: readonly string[] = ['Desktop', 'Documents', 'OneDrive/Desktop', 'OneDrive/문서'];

/**
 * 공개본을 쓸 폴더를 정한다. 설정 칸이 먼저고, 비었거나 틀렸으면 바탕화면 · 문서에서 찾는다.
 *
 * 설정한 경로가 틀렸는데 조용히 실패하면 "발행했다"고 믿게 된다 — 그래서 틀리면 자동 찾기로 넘어간다.
 * 아무 데도 없으면 null 이고, 부르는 쪽은 발행을 건너뛰되 수집 회차는 그대로 산다.
 */
export function resolveSiteDataDir(input: { configured: string; home: string; exists: (target: string) => boolean }): string | null {
  const configured = String(input.configured || '').trim();
  if (configured) {
    const direct = path.join(configured, SITE_DATA_RELATIVE);
    if (input.exists(direct)) return direct;
    // 사장님이 data 폴더 자체를 적었을 수도 있다.
    if (input.exists(configured) && configured.replace(/\\/g, '/').endsWith('spa/public/data')) return configured;
  }
  for (const parent of SITE_PARENTS) {
    for (const name of SITE_FOLDER_NAMES) {
      const candidate = path.join(input.home, ...parent.split('/'), name, SITE_DATA_RELATIVE);
      if (input.exists(candidate)) return candidate;
    }
  }
  return null;
}
