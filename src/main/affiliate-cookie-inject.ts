/**
 * 수집 직전 쿠키 주입 — 얇은 실행부. 수집기와 같은 userDataDir·같은 크롬으로 퍼핏티어를 잠깐 띄워
 * 저장된 쿠키를 넣고 닫는다. 실패해도 던지지 않는다(회차를 막지 않음). 쿠키 값은 로그에 안 남긴다.
 */
import { toPuppeteerCookies, type SessionCookie } from '../utils/affiliate-session-cookies';

export interface InjectOptions {
  profileDir: string;
  chromePath?: string;
  cookies: SessionCookie[];
  /** 테스트·검증용 주입점. 기본은 실제 puppeteer. */
  launcher?: (options: Record<string, unknown>) => Promise<{
    newPage: () => Promise<{ setCookie: (...c: any[]) => Promise<void> }>;
    close: () => Promise<void>;
  }>;
}

export async function injectSessionCookies(opts: InjectOptions): Promise<{ injected: number; error?: string }> {
  const prepared = toPuppeteerCookies(opts.cookies, Math.floor(Date.now() / 1000));
  if (prepared.length === 0) return { injected: 0 };
  let browser: Awaited<ReturnType<NonNullable<InjectOptions['launcher']>>> | null = null;
  try {
    const launch = opts.launcher ?? ((o) => require('puppeteer').launch(o));
    browser = await launch({
      ...(opts.chromePath ? { executablePath: opts.chromePath } : {}),
      headless: true,
      userDataDir: opts.profileDir,
      args: ['--lang=ko-KR', '--disable-blink-features=AutomationControlled'],
    });
    const page = await browser.newPage();
    let injected = 0;
    // 한 개가 거절돼도 나머지는 넣는다.
    for (const cookie of prepared) {
      try { await page.setCookie(cookie); injected++; } catch { /* 이 쿠키만 건너뜀 */ }
    }
    return { injected };
  } catch (error: any) {
    return { injected: 0, error: String(error?.message || error).slice(0, 120) };
  } finally {
    try { await browser?.close(); } catch { /* 이미 닫힘 */ }
  }
}
