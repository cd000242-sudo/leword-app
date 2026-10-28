// LEWORD 세션 연결 — 크롬의 네이버·토스 쿠키를 같은 PC 의 LEWORD 앱(127.0.0.1:47615)으로만 보낸다.
// 쿠키 값은 팝업·로그·저장소 어디에도 남기지 않는다(저장하는 것은 시각과 있음/없음 요약뿐).

const BRIDGE_URL = 'http://127.0.0.1:47615/affiliate-session';
const PERIODIC_ALARM = 'leword-periodic';
const MORNING_ALARM = 'leword-morning';
const DEBOUNCE_ALARM = 'leword-debounce';
const WATCHED = new Set(['NID_AUT', 'NID_SES']);

/** 다음 05:30 KST(= 20:30 UTC 전날)의 시각(ms). */
function nextMorningMs(now = Date.now()) {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20, 30, 0);
  if (t <= now + 60000) t += 24 * 3600 * 1000;
  return t;
}

function scheduleAlarms() {
  chrome.alarms.create(PERIODIC_ALARM, { delayInMinutes: 1, periodInMinutes: 180 });
  chrome.alarms.create(MORNING_ALARM, { when: nextMorningMs() });
}

function isTossDomain(domain) {
  const host = String(domain || '').replace(/^\./, '').toLowerCase();
  return host === 'toss.im' || host.endsWith('.toss.im');
}

function isNaverDomain(domain) {
  const host = String(domain || '').replace(/^\./, '').toLowerCase();
  return host === 'naver.com' || host.endsWith('.naver.com');
}

async function collectCookies() {
  const [naver, toss] = await Promise.all([
    chrome.cookies.getAll({ domain: 'naver.com' }),
    chrome.cookies.getAll({ domain: 'toss.im' }),
  ]);
  const seen = new Set();
  const out = [];
  for (const c of [...naver, ...toss]) {
    if (!isNaverDomain(c.domain) && !isTossDomain(c.domain)) continue;
    const key = `${c.domain}|${c.path}|${c.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      ...(typeof c.expirationDate === 'number' ? { expirationDate: c.expirationDate } : {}),
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      sameSite: c.sameSite,
    });
  }
  return out;
}

async function sendNow(reason) {
  const at = new Date().toISOString();
  let cookies = [];
  try {
    cookies = await collectCookies();
    const naverNames = new Set(cookies.filter((c) => isNaverDomain(c.domain)).map((c) => c.name));
    const summary = {
      naverLogin: naverNames.has('NID_AUT') && naverNames.has('NID_SES'),
      tossCount: cookies.filter((c) => isTossDomain(c.domain)).length,
    };
    if (cookies.length === 0) {
      await chrome.storage.local.set({ last: { at, reason, result: 'empty', ...summary } });
      return;
    }
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies }),
    });
    await chrome.storage.local.set({ last: { at, reason, result: res.ok ? 'ok' : `http-${res.status}`, ...summary } });
  } catch {
    // 앱이 꺼져 있으면 조용히 실패 — 다음 알람에 다시 시도한다.
    await chrome.storage.local.set({ last: { at, reason, result: 'app-off' } });
  }
}

chrome.runtime.onInstalled.addListener(() => { scheduleAlarms(); sendNow('install'); });
chrome.runtime.onStartup.addListener(() => { scheduleAlarms(); sendNow('startup'); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MORNING_ALARM) {
    chrome.alarms.create(MORNING_ALARM, { when: nextMorningMs() });
    sendNow('morning');
  } else if (alarm.name === PERIODIC_ALARM) {
    sendNow('periodic');
  } else if (alarm.name === DEBOUNCE_ALARM) {
    sendNow('cookie-change');
  }
});

// 로그인 쿠키가 바뀌면 30초 디바운스(서비스워커가 잠들어도 살아남도록 알람으로).
chrome.cookies.onChanged.addListener((info) => {
  const c = info.cookie;
  if (!c) return;
  const relevant = (isNaverDomain(c.domain) && WATCHED.has(c.name)) || isTossDomain(c.domain);
  if (!relevant) return;
  chrome.alarms.create(DEBOUNCE_ALARM, { delayInMinutes: 0.5 });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'send-now') {
    sendNow('manual').then(() => sendResponse({ done: true }));
    return true;
  }
  return false;
});
