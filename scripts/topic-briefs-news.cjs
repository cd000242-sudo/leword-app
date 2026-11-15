'use strict';
/**
 * 오늘의 글감 — 뉴스 수집기(실패 사유를 기록에 남긴다).
 *
 * 왜(2026-11-15): 예전에는 `if (!res.ok) return []` 와 `catch { return [] }` 로 실패를 삼켰다.
 * 그래서 한도·인증·서버 오류가 전부 "기사 0 → 근거 카드 0" 한 줄로만 보였고(실패 6회 연속),
 * 끝내는 "근거 부족 또는 검증·중복 제거 후 후보 없음" 이라는 엉뚱한 사유로 끝났다.
 *
 * 규칙:
 *  - 호출 하나가 끝내 실패하면 상태·본문 조각·응답 헤더(한도 관련만)를 기록에 남긴다. 같은 사유는 앞 3건만 자세히.
 *  - 일별 한도(quota)·인증 오류는 다시 시도해도 풀리지 않으므로 바로 멈추고, 남은 호출을 내보내지 않는다.
 *  - 속도 제한·5xx·네트워크 예외는 간격을 두고 두 번까지 다시 시도한다(같은 회차 안).
 *  - 연달아 5건 실패해도 멈춘다. 성공 한 건이 끼면 세기를 처음부터 한다.
 *  - 요청 헤더(키·시크릿)는 기록에 절대 싣지 않는다. 본문에 같은 값이 비치면 가린다.
 */

const NEWS_URL = 'https://openapi.naver.com/v1/search/news.json';
const RETRY_DELAYS_MS = [1500, 4000];
const REPEAT_BLOCK = 5;
const SAMPLE_LIMIT = 3;
const SNIPPET_MAX = 240;
const SAFE_HEADER = /^(retry-after|x-ratelimit-[\w-]+|x-rate-limit-[\w-]+|x-ncp-[\w-]+)$/i;

const DAILY_RE = /일별|일일|사용량 한도|한도가 초과|daily|quota exceeded|errorCode["']?\s*:\s*["']?010/i;
const RATE_RE = /rate limit exceeded|속도 제한|too many requests|errorCode["']?\s*:\s*["']?012/i;

/** 실패 응답을 갈라 다시 시도할 가치가 있는지 정한다. */
function classifyFailure(status, bodyText) {
  const body = String(bodyText || '');
  if (status === 429) {
    if (DAILY_RE.test(body) && !RATE_RE.test(body)) return { kind: 'quota', retryable: false, label: 'HTTP 429 일별 한도' };
    return { kind: 'rate', retryable: true, label: 'HTTP 429 속도 제한' };
  }
  if (status === 401 || status === 403) return { kind: 'auth', retryable: false, label: `HTTP ${status} 인증` };
  if (status >= 500) return { kind: 'server', retryable: true, label: `HTTP ${status} 서버` };
  return { kind: 'client', retryable: false, label: `HTTP ${status}` };
}

function createNewsFetcher({ fetchFn, headers, sleep, log }) {
  const secrets = Object.values(headers || {}).map(String).filter((v) => v.length >= 4);
  const stats = { calls: 0, ok: 0, empty: 0, failed: 0, retried: 0, skipped: 0 };
  const failures = new Map(); // label → { count, snippet }
  const logged = new Map(); // label → 자세히 적은 건수
  let consecutive = 0;
  let blocked = null;

  const clean = (text) => {
    let out = String(text || '').replace(/\s+/g, ' ').trim();
    for (const secret of secrets) out = out.split(secret).join('***');
    return out.length > SNIPPET_MAX ? `${out.slice(0, SNIPPET_MAX)}…` : out;
  };
  const safeHeaders = (response) => {
    const found = [];
    if (response && response.headers && typeof response.headers.forEach === 'function') {
      response.headers.forEach((value, name) => { if (SAFE_HEADER.test(name)) found.push(`${name.toLowerCase()}=${clean(value).slice(0, 80)}`); });
    }
    return found.join(' ');
  };
  const note = (failure, query, attemptNo, total) => {
    const seen = logged.get(failure.label) || 0;
    logged.set(failure.label, seen + 1);
    if (seen >= SAMPLE_LIMIT) return;
    const extra = [failure.headerNote && `헤더 ${failure.headerNote}`, failure.snippet && `본문 ${failure.snippet}`].filter(Boolean).join(' · ');
    log(`  뉴스 실패 [${failure.label}] "${query}" · 시도 ${attemptNo}/${total}${extra ? ` · ${extra}` : ''}`);
  };

  /** 한 번 부른다. 성공이면 { items }, 실패면 { failure }. */
  async function attempt(url) {
    let response;
    try {
      response = await fetchFn(url, { headers });
    } catch (error) {
      return { failure: { kind: 'network', retryable: true, label: '네트워크 예외', snippet: clean(error && error.message ? error.message : error), headerNote: '' } };
    }
    const hasText = typeof response.text === 'function';
    if (!response.ok) {
      const text = hasText ? await response.text().catch(() => '') : '';
      return { failure: { ...classifyFailure(response.status, text), snippet: clean(text), headerNote: safeHeaders(response) } };
    }
    let text = '';
    let data = null;
    if (hasText) {
      text = await response.text().catch(() => '');
      try { data = JSON.parse(text); } catch { data = null; }
    } else {
      data = await response.json().catch(() => null);
    }
    if (!data || !Array.isArray(data.items)) {
      return { failure: { kind: 'badBody', retryable: false, label: '본문 형식 이상', snippet: clean(text || JSON.stringify(data)), headerNote: '' } };
    }
    return { items: data.items };
  }

  async function newsItems(query) {
    if (blocked) { stats.skipped += 1; return []; }
    stats.calls += 1;
    const url = `${NEWS_URL}?query=${encodeURIComponent(query)}&display=50&sort=date`;
    const total = RETRY_DELAYS_MS.length + 1;
    let failure = null;
    for (let n = 0; n < total; n += 1) {
      const outcome = await attempt(url);
      if (outcome.items) {
        consecutive = 0;
        if (outcome.items.length === 0) stats.empty += 1; else stats.ok += 1;
        return outcome.items;
      }
      failure = outcome.failure;
      note(failure, query, n + 1, total);
      if (!failure.retryable || n === total - 1) break;
      stats.retried += 1;
      await sleep(RETRY_DELAYS_MS[n]);
    }
    stats.failed += 1;
    consecutive += 1;
    const entry = failures.get(failure.label) || { count: 0, snippet: failure.snippet };
    failures.set(failure.label, { count: entry.count + 1, snippet: entry.snippet || failure.snippet });
    if (failure.kind === 'quota' || failure.kind === 'auth') {
      blocked = { kind: failure.kind, label: failure.label, snippet: failure.snippet };
    } else if (consecutive >= REPEAT_BLOCK) {
      blocked = { kind: 'repeated', label: `${failure.label} ${consecutive}건 연속`, snippet: failure.snippet };
    }
    return [];
  }

  const failureList = () => [...failures.entries()].sort((a, b) => b[1].count - a[1].count);

  function summaryLine() {
    const detail = failureList().map(([label, { count }]) => `${label} ×${count}`).join(' · ');
    const parts = [`정상 ${stats.ok}`, `빈 응답 ${stats.empty}`, `실패 ${stats.failed}${detail ? ` [${detail}]` : ''}`, `재시도 ${stats.retried}`];
    if (blocked) parts.push(`중단: ${blocked.label}`, `건너뜀 ${stats.skipped}콜`);
    return `  뉴스 수집 ${stats.calls}콜 — ${parts.join(' · ')}`;
  }

  /** 근거 카드가 0장일 때 실패 사유로 붙일 한 문장. 할 말이 없으면 빈 글. */
  function diagnosis() {
    if (stats.calls === 0 && stats.skipped === 0) return '';
    if (stats.failed === 0) {
      return stats.ok === 0 && stats.empty > 0
        ? `뉴스 API 는 정상(HTTP 200)으로 답했으나 기사가 0건입니다(${stats.empty}콜). 질의어·응답 형식을 확인하세요.`
        : '';
    }
    const [label, { snippet }] = failureList()[0];
    const stop = blocked ? ` · 이후 호출은 내보내지 않았습니다(${blocked.label})` : '';
    return `뉴스 수집 ${stats.calls}콜 중 ${stats.failed}콜 실패 — ${label}${snippet ? `: ${snippet}` : ''}${stop}`;
  }

  return { newsItems, blocked: () => blocked, failedCalls: () => stats.failed, summaryLine, diagnosis, stats: () => ({ ...stats }) };
}

module.exports = { createNewsFetcher, classifyFailure };
