/**
 * 네이버 로그인 창 + 크리에이터 어드바이저 창구 실측(C 0단계, 2026-09-30) — 앱 전용.
 *
 * 왜 필요한가: 사장님 "내 블로그를 주면 알고리즘이 어디에 특화되어있나 파악도가능할까?".
 * 글별로 홈판·추천에서 왔는지 검색에서 왔는지는 로그인해야 보이는 어드바이저에만 있다.
 * 공개 창구엔 조회·공감·댓글 값이 없다(leadernam- 39편 실측 전부 빈 값) — 대리 추정할 재료조차 없다.
 *
 * 이 파일이 하는 일:
 *  1. 보이는 창을 `persist:naver-login` 파티션으로 띄운다. 사장님이 직접 로그인·2차 인증. 비밀번호는 앱이 보지 않는다.
 *     쿠키는 크로미엄이 userData/Partitions 아래 OS 암호화로 보관한다 — 앱을 다시 켜도 남는다.
 *  2. 그 창에 개발자 프로토콜을 붙여 어드바이저 호스트의 XHR/Fetch 만 userData/naver-session/probe-날짜.jsonl 에 남긴다.
 *     로그인 페이지(nid) 요청은 절대 기록하지 않는다(utils/naver-advisor-probe.shouldCaptureAdvisorCall).
 *  3. 로그인 상태(쿠키 두 개)와 오늘 잡힌 창구 수를 화면에 알려 준다.
 *
 * 다음 단계(1단계 수집기)는 여기서 실측한 창구를 같은 파티션의 session.fetch 로 하루 한 번 부른다.
 */
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ADVISOR_API_PREFIX,
  ADVISOR_HOME_URL,
  ADVISOR_HOST,
  ADVISOR_KEY_COOKIE,
  advisorSecretFromCookie,
  browserLikeUserAgent,
  isNaverLoggedIn,
  shouldCaptureAdvisorCall,
  signAdvisorRequest,
  summarizeProbeLines,
  type ProbeLine,
} from '../../utils/naver-advisor-probe';

export const NAVER_SESSION_PARTITION = 'persist:naver-login';

/** 응답·요청 본문은 머리만. 구조를 보는 데는 충분하고 파일이 붓지 않는다. */
const BODY_HEAD_CHARS = 4000;

const DIR = () => path.join(app.getPath('userData'), 'naver-session');
const probeFile = (day: string) => path.join(DIR(), `probe-${day}.jsonl`);

let advisorWindow: BrowserWindow | null = null;

function ensureDir(): void {
  try { fs.mkdirSync(DIR(), { recursive: true }); } catch { /* 이미 있으면 그만 */ }
}

/** 오늘(로컬 날짜) 기록 파일의 줄 수. 없으면 0. */
function readProbeLines(day: string): ProbeLine[] {
  try {
    return fs.readFileSync(probeFile(day), 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ProbeLine);
  } catch {
    return [];
  }
}

function today(): string {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

function appendProbeLine(line: ProbeLine): void {
  ensureDir();
  fs.appendFileSync(probeFile(today()), JSON.stringify(line) + '\n', 'utf8');
}

async function naverCookies() {
  return session.fromPartition(NAVER_SESSION_PARTITION).cookies.get({ domain: '.naver.com' });
}

export interface NaverSessionStatus {
  loggedIn: boolean;
  windowOpen: boolean;
  probeFile: string;
  capturedToday: number;
  endpoints: ReturnType<typeof summarizeProbeLines>;
}

export async function naverSessionStatus(): Promise<NaverSessionStatus> {
  const cookies = await naverCookies();
  const day = today();
  const lines = readProbeLines(day);
  return {
    loggedIn: isNaverLoggedIn(cookies),
    windowOpen: !!advisorWindow && !advisorWindow.isDestroyed(),
    probeFile: probeFile(day),
    capturedToday: lines.length,
    endpoints: summarizeProbeLines(lines),
  };
}

/**
 * 개발자 프로토콜로 어드바이저 데이터 요청만 기록한다.
 * 요청은 requestWillBeSent 에서 받아 두고, 본문은 loadingFinished 뒤에만 읽을 수 있다.
 */
function attachProbe(win: BrowserWindow): void {
  const contents = win.webContents;
  const pending = new Map<string, { method: string; url: string; postDataHead?: string; signHeaders?: Record<string, string>; status: number; mimeType: string }>();
  try {
    contents.debugger.attach('1.3');
  } catch (error: any) {
    console.warn('[NAVER-SESSION] 디버거를 붙이지 못했다 — 창구 기록 없이 로그인만:', error?.message);
    return;
  }
  contents.debugger.on('message', async (_event, method, params) => {
    if (method === 'Network.requestWillBeSent') {
      const { requestId, request, type } = params;
      if (!shouldCaptureAdvisorCall(request?.url || '', type || '')) return;
      pending.set(requestId, {
        method: request.method,
        url: request.url,
        postDataHead: typeof request.postData === 'string' ? request.postData.slice(0, BODY_HEAD_CHARS) : undefined,
        // 화면이 붙이는 서명 헤더만(X-CA-*) — 쿠키·인증 헤더는 남기지 않는다. 서명 규칙 대조용.
        signHeaders: Object.fromEntries(Object.entries((request.headers || {}) as Record<string, string>).filter(([k]) => /^x-ca-/i.test(k))),
        status: 0,
        mimeType: '',
      });
      return;
    }
    if (method === 'Network.responseReceived') {
      const entry = pending.get(params.requestId);
      if (entry) pending.set(params.requestId, { ...entry, status: params.response?.status ?? 0, mimeType: params.response?.mimeType || '' });
      return;
    }
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const entry = pending.get(params.requestId);
      if (!entry) return;
      pending.delete(params.requestId);
      let bodyHead = '';
      let bodyBytes = 0;
      if (method === 'Network.loadingFinished') {
        try {
          const body = await contents.debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId });
          const text = body?.base64Encoded ? Buffer.from(body.body || '', 'base64').toString('utf8') : String(body?.body || '');
          bodyBytes = Buffer.byteLength(text, 'utf8');
          bodyHead = text.slice(0, BODY_HEAD_CHARS);
        } catch { /* 본문을 못 읽어도 창구 주소는 남긴다 */ }
      }
      try {
        appendProbeLine({
          at: new Date().toISOString(),
          method: entry.method,
          url: entry.url,
          status: entry.status,
          mimeType: entry.mimeType,
          bodyBytes,
          bodyHead,
          ...(entry.postDataHead ? { postDataHead: entry.postDataHead } : {}),
          ...(entry.signHeaders && Object.keys(entry.signHeaders).length ? { signHeaders: entry.signHeaders } : {}),
        });
      } catch (error: any) {
        console.warn('[NAVER-SESSION] 기록 실패:', error?.message);
      }
    }
  });
  contents.debugger.sendCommand('Network.enable').catch((error: any) => {
    console.warn('[NAVER-SESSION] Network.enable 실패:', error?.message);
  });
}

/** 보이는 창을 하나만 띄운다. 이미 열려 있으면 앞으로 가져온다. */
export function openAdvisorWindow(): void {
  if (advisorWindow && !advisorWindow.isDestroyed()) {
    advisorWindow.focus();
    return;
  }
  const ses = session.fromPartition(NAVER_SESSION_PARTITION);
  ses.setUserAgent(browserLikeUserAgent(app.userAgentFallback));
  const win = new BrowserWindow({
    width: 1240,
    height: 900,
    title: '네이버 로그인 · 크리에이터 어드바이저 (LEWORD 실측)',
    autoHideMenuBar: true,
    webPreferences: {
      partition: NAVER_SESSION_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  advisorWindow = win;
  win.on('closed', () => { advisorWindow = null; });
  attachProbe(win);
  win.loadURL(ADVISOR_HOME_URL).catch((error: any) => {
    console.warn('[NAVER-SESSION] 어드바이저 화면을 열지 못했다:', error?.message);
  });
}

/**
 * 로그인 세션(쿠키)으로 어드바이저 `/api/v6` 창구를 직접 부른다 — 창을 띄우지 않는다.
 * 0단계 실측용이자 1단계 수집기의 바탕. 응답은 문자열 그대로(해석은 부르는 쪽).
 */
export async function advisorFetch(pathAndQuery: string, extraHeaders: Record<string, string> = {}): Promise<{ status: number; body: string; signed: boolean }> {
  const ses = session.fromPartition(NAVER_SESSION_PARTITION);
  ses.setUserAgent(browserLikeUserAgent(app.userAgentFallback));
  // 화면은 요청마다 instanceId(세션당 UUID) 를 붙이고, 계정 창구가 그 요청에 서명 비밀을 심는다 — 같은 값을 계속 쓴다.
  // Referer 는 화면 주소여야 한다 — 루트 `/` 면 서명이 맞아도 403이고, 내 채널 창구(integrated-analysis·inflow-analysis·
  // revenue·dashboard·header)는 `/naver_blog/<channelId>` 까지 있어야 200(2026-09-30 실측 52건 403→200).
  const channelId = new URL(ADVISOR_API_PREFIX + pathAndQuery, ADVISOR_HOME_URL).searchParams.get('channelId') || '';
  const base = { Accept: 'application/json', Referer: `${ADVISOR_HOME_URL}naver_blog/${encodeURIComponent(channelId)}`, instanceId: advisorInstanceId, ...extraHeaders };
  const call = async (target: string, extra: Record<string, string>) => {
    try {
      return await ses.fetch(`https://${ADVISOR_HOST}${ADVISOR_API_PREFIX}${target}`, { headers: { ...base, ...extra } });
    } catch (error: any) {
      // 개발판 대조용: 어떤 헤더가 거절됐는지 보이게 사유를 담아 다시 던진다.
      throw new Error(`advisor fetch 실패: ${error?.message || error}`);
    }
  };
  const refreshSecret = async () => {
    await call('/accounts/channels', {}).catch(() => undefined);
    return advisorSecret(ses);
  };
  // 데이터 창구는 서명 없이는 403 — 비밀 쿠키가 없으면 계정 창구를 한 번 불러 심게 한다(화면 번들과 같은 순서).
  let secret = (await advisorSecret(ses)) || (await refreshSecret());
  const signedCall = async () => call(pathAndQuery, secret ? signAdvisorRequest({ secret, method: 'GET', pathAndQuery }) : {});
  let response = await signedCall();
  // 화면과 같은 재시도 한 번: 403 이면 비밀을 새로 받아 다시 부른다(키 만료·다른 instanceId 로 받은 키).
  if (response.status === 403) {
    secret = await refreshSecret();
    response = await signedCall();
  }
  return { status: response.status, body: await response.text(), signed: !!secret };
}

const advisorInstanceId = randomUUID();

/** 비밀 쿠키 — 도메인 필터는 상위 도메인(.naver.com) 쿠키를 놓치므로 주소 기준으로 찾는다. */
async function advisorSecret(ses: Electron.Session): Promise<string | null> {
  const cookies = await ses.cookies.get({ url: ADVISOR_HOME_URL, name: ADVISOR_KEY_COOKIE });
  return advisorSecretFromCookie(cookies[0]?.value);
}

export async function clearNaverSession(): Promise<void> {
  if (advisorWindow && !advisorWindow.isDestroyed()) advisorWindow.close();
  await session.fromPartition(NAVER_SESSION_PARTITION).clearStorageData();
}

export function setupNaverSessionHandlers(): void {
  if (!ipcMain.listenerCount('naver-session-status')) {
    ipcMain.handle('naver-session-status', async () => {
      try {
        return { success: true, status: await naverSessionStatus() };
      } catch (error: any) {
        return { success: false, error: error?.message || '로그인 상태를 읽지 못했어요' };
      }
    });
  }
  if (!ipcMain.listenerCount('naver-session-open')) {
    ipcMain.handle('naver-session-open', async () => {
      try {
        openAdvisorWindow();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message || '로그인 창을 열지 못했어요' };
      }
    });
  }
  if (!ipcMain.listenerCount('naver-session-clear')) {
    ipcMain.handle('naver-session-clear', async () => {
      try {
        await clearNaverSession();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message || '로그아웃하지 못했어요' };
      }
    });
  }
  console.log('[NAVER-SESSION] ✅ 네이버 로그인 창 핸들러 등록 완료');
}
