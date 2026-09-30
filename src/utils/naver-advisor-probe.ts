/**
 * 크리에이터 어드바이저 창구 실측 — 순수 함수(C 0단계, 2026-09-30).
 *
 * 사장님 "내 블로그를 주면 알고리즘이 어디에 특화되어있나 파악도가능할까? 그래야 어떤걸로 어떻게 글을 써야
 * 홈판에 유리한지 알수있자나". 공개 창구에는 글별 조회·공감·댓글 값이 없다(leadernam- 39편 실측: 전부 빈 값).
 * 글별 유입 경로(홈판·추천 vs 검색)는 로그인해야 보이는 크리에이터 어드바이저에만 있다.
 *
 * 그 화면이 실제로 부르는 JSON 창구가 무엇인지는 공개 문서가 없다. 그래서 0단계는 **로그인 창을 앱 안에서 띄우고
 * 어드바이저가 부르는 요청을 기록**하는 것이다. 이 파일은 그중 "무엇을 기록하고 무엇을 절대 기록하지 않는가"와
 * 기록 요약만 맡는다 — 일렉트론 창·디버거 붙이기는 handlers/naver-session.ts 에 있다.
 *
 * 절대 기록하지 않는 것: 로그인 페이지(nid.naver.com) 요청. 비밀번호·OTP 가 본문에 실린다.
 */
import { createHmac, randomUUID } from 'crypto';

/** 어드바이저 화면 호스트. 이 호스트의 XHR/Fetch 만 기록한다. */
export const ADVISOR_HOST = 'creator-advisor.naver.com';

/** 어드바이저 첫 화면. 로그인이 없으면 네이버가 nid 로 보낸 뒤 여기로 돌려준다. */
export const ADVISOR_HOME_URL = `https://${ADVISOR_HOST}/`;

/** 창구 경로 앞머리. 서명은 이 접두어를 포함한 pathname 으로 만든다(화면 번들 fJ 함수 실측). */
export const ADVISOR_API_PREFIX = '/api/v6';

/** 서명 비밀이 든 쿠키. 값 "비밀.나머지" 꼴이며 /accounts/channels 응답이 심는다. */
export const ADVISOR_KEY_COOKIE = '__ca_key';

/** 크롬 개발자 프로토콜이 붙이는 요청 종류 중 데이터 창구로 볼 것. */
const DATA_RESOURCE_TYPES = new Set(['XHR', 'Fetch']);

/**
 * 데이터 창구(홈·트렌드·유입분석·수익·대시보드)는 서명 없이는 전부 403 이다 — 2026-09-30 실측 45/45.
 * 화면 번들이 하는 그대로: 비밀 = __ca_key 쿠키의 '.' 앞 마디, 서명 = HMAC-SHA256(비밀, "METHOD|pathname|ts|nonce") 16진수.
 * pathname 에는 쿼리가 안 들어가고, /api/v6 접두어는 들어간다.
 */
export function advisorSecretFromCookie(value: string | undefined): string | null {
  // 화면(js-cookie)과 똑같이: 겉따옴표 벗기고 %XX 를 푼다.
  const raw = (value || '').replace(/^"|"$/g, '').replace(/(%[\dA-F]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch { return m; } });
  const [secret] = raw.split('.');
  return secret || null;
}

export interface AdvisorSignInput {
  secret: string;
  method: string;
  /** `/api/v6` 뒤의 상대경로(쿼리 포함 가능). */
  pathAndQuery: string;
  ts?: string;
  nonce?: string;
}

export function signAdvisorRequest(input: AdvisorSignInput): Record<'X-CA-Nonce' | 'X-CA-Ts' | 'X-CA-Sig', string> {
  const pathname = new URL(ADVISOR_API_PREFIX + input.pathAndQuery, ADVISOR_HOME_URL).pathname;
  const ts = input.ts ?? String(Date.now());
  const nonce = input.nonce ?? randomUUID();
  const sig = createHmac('sha256', input.secret)
    .update(`${input.method.toUpperCase()}|${pathname}|${ts}|${nonce}`)
    .digest('hex');
  return { 'X-CA-Nonce': nonce, 'X-CA-Ts': ts, 'X-CA-Sig': sig };
}

/** 기록 한 줄. 응답 본문은 머리만 남긴다 — 구조를 보는 데는 충분하고 파일이 붓지 않는다. */
export interface ProbeLine {
  at: string;
  method: string;
  url: string;
  status: number;
  mimeType: string;
  bodyBytes: number;
  bodyHead: string;
  /** POST 본문 머리. 어드바이저 호스트만 기록하므로 자격증명이 실릴 일은 없다. */
  postDataHead?: string;
  /** 화면이 붙인 서명 헤더(X-CA-*)만. 서명 규칙 대조용. */
  signHeaders?: Record<string, string>;
}

/** 창구별 요약 한 줄 — 실측 뒤 사람이 읽는 표. */
export interface ProbeEndpointSummary {
  method: string;
  path: string;
  count: number;
  statuses: number[];
  queryKeys: string[];
  sampleUrl: string;
  bodyHead: string;
}

/**
 * 어드바이저 호스트의 데이터 요청만 true. 로그인·비콘·다른 네이버 호스트는 전부 false.
 * 호스트를 정확히 비교한다 — `endsWith('naver.com')` 이면 nid 가 들어온다.
 */
export function shouldCaptureAdvisorCall(url: string, resourceType: string): boolean {
  if (!DATA_RESOURCE_TYPES.has(resourceType)) return false;
  try {
    return new URL(url).hostname === ADVISOR_HOST;
  } catch {
    return false;
  }
}

/** 일렉트론 기본 UA 에서 `Electron/x`·`앱이름/x` 토큰을 뗀다. 네이버 로그인이 낯선 브라우저로 보지 않게. */
export function browserLikeUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s+Electron\/\S+/g, '')
    .replace(/\s+leword[^\s/]*\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 네이버 로그인 쿠키 두 개(NID_AUT·NID_SES)가 다 있어야 로그인으로 본다. 하나만 남은 건 만료 잔재다. */
export function isNaverLoggedIn(cookies: ReadonlyArray<{ name: string }>): boolean {
  const names = new Set(cookies.map((cookie) => cookie.name));
  return names.has('NID_AUT') && names.has('NID_SES');
}

/** 기록 줄을 메서드+경로로 묶는다. 많이 불린 창구부터. 주소가 깨진 줄은 버린다. */
export function summarizeProbeLines(lines: readonly ProbeLine[]): ProbeEndpointSummary[] {
  const groups = new Map<string, { line: ProbeLine; parsed: URL; lines: ProbeLine[]; queryKeys: Set<string> }>();
  for (const line of lines) {
    let parsed: URL;
    try { parsed = new URL(line.url); } catch { continue; }
    const key = `${line.method} ${parsed.pathname}`;
    const existing = groups.get(key);
    const keys = Array.from(parsed.searchParams.keys());
    if (existing) {
      groups.set(key, {
        ...existing,
        lines: [...existing.lines, line],
        queryKeys: new Set([...existing.queryKeys, ...keys]),
        // 응답 머리는 본문이 있는 첫 줄을 쓴다 — 401 빈 응답이 표본을 가리지 않게.
        line: existing.line.bodyHead ? existing.line : line,
      });
    } else {
      groups.set(key, { line, parsed, lines: [line], queryKeys: new Set(keys) });
    }
  }
  return Array.from(groups.values())
    .map((group) => ({
      method: group.line.method,
      path: group.parsed.pathname,
      count: group.lines.length,
      statuses: Array.from(new Set(group.lines.map((entry) => entry.status))).sort((a, b) => a - b),
      queryKeys: Array.from(group.queryKeys).sort(),
      sampleUrl: group.line.url,
      bodyHead: group.line.bodyHead,
    }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}
