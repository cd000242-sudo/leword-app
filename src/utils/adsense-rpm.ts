/**
 * 애드센스 **실측** 수익 장부 — 글 주소별 수익·페이지뷰를 받아 RPM 을 낸다.
 *
 * 왜 이렇게 하나:
 * ① "키워드별 RPM" 을 주는 API 는 없다. 있는 것은 글 주소별 실적(PAGE_URL 차원)뿐이다.
 *    어떤 글이 어떤 키워드용인지는 사장님만 아니까, 그 매핑을 붙여야 비로소
 *    '키워드별 실측 RPM' 이 된다.
 * ② RPM 지표를 직접 받지 않고 **우리가 나눈다**(수익 ÷ 페이지뷰 × 1000).
 *    차원·지표 조합에 호환 제한이 있다고만 문서에 적혀 있고 PAGE_URL 과 RPM 지표를
 *    같이 쓸 수 있는지는 확인되지 않았다(2026-08-23 조사). 수익과 페이지뷰는 기본
 *    지표라 안전하고, 나눗셈은 단순 산술이라 추정이 아니다.
 * ③ **아직 안 쓴 키워드의 RPM 은 알 수 없다.** 그런 값을 만들어 내지 않는다.
 *    여기 있는 숫자는 전부 사장님 글에서 실제로 발생한 것이다.
 *
 * [주의] 애드센스는 당일 수치를 추정으로 주고 며칠 뒤 확정한다. 그래서 기본
 * 조회 구간은 어제까지다 — 확정 안 된 값을 실적으로 싣지 않기 위해서다.
 */

const API_BASE = 'https://adsense.googleapis.com/v2';

export interface AdSenseAccount {
  name: string;        // 'accounts/pub-XXXXXXXX'
  displayName?: string;
  currencyCode?: string;
}

export interface PageEarnings {
  /** 글 주소(애드센스가 준 그대로). */
  pageUrl: string;
  /** 기간 합계 수익(계정 통화). */
  earnings: number;
  /** 기간 합계 페이지뷰. */
  pageViews: number;
  /** 수익 ÷ 페이지뷰 × 1000. 페이지뷰가 0 이면 null — 0 으로 적지 않는다. */
  rpm: number | null;
}

export class AdSenseAuthError extends Error {}

async function apiGet(path: string, accessToken: string, params?: URLSearchParams): Promise<any> {
  const url = `${API_BASE}${path}${params ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) {
    throw new AdSenseAuthError(`애드센스 인증이 필요합니다 (${res.status})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`애드센스 API 실패 ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** 이 계정으로 볼 수 있는 애드센스 계정 목록. 보통 하나다. */
export async function listAccounts(accessToken: string): Promise<AdSenseAccount[]> {
  const json = await apiGet('/accounts', accessToken);
  return (json.accounts || []).map((a: any) => ({
    name: a.name,
    displayName: a.displayName,
    currencyCode: a.currencyCode,
  }));
}

function ymd(date: Date): { y: number; m: number; d: number } {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/**
 * 글 주소별 수익·페이지뷰를 받는다.
 *
 * @param days 며칠치를 합칠 것인가(기본 28). 끝은 **어제**다 — 오늘 값은 아직 추정이다.
 */
export async function fetchPageEarnings(
  accountName: string,
  accessToken: string,
  options: { days?: number; limit?: number; endDate?: Date; currencyCode?: string } = {},
): Promise<{ rows: PageEarnings[]; startDate: string; endDate: string; currency: string }> {
  const days = Math.max(1, Math.min(365, Math.floor(options.days ?? 28)));
  const end = options.endDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // 어제
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const s = ymd(start);
  const e = ymd(end);

  const params = new URLSearchParams();
  params.set('dateRange', 'CUSTOM');
  params.set('startDate.year', String(s.y));
  params.set('startDate.month', String(s.m));
  params.set('startDate.day', String(s.d));
  params.set('endDate.year', String(e.y));
  params.set('endDate.month', String(e.m));
  params.set('endDate.day', String(e.d));
  params.append('dimensions', 'PAGE_URL');
  params.append('metrics', 'ESTIMATED_EARNINGS');
  params.append('metrics', 'PAGE_VIEWS');
  params.append('orderBy', '-ESTIMATED_EARNINGS');
  /*
   * 통화 지정(사장님 지시 2026-08-28 "달러로 나와야 됩니다").
   * currencyCode 는 ISO-4217 이고, 안 보내면 계정 통화로 온다 — 구글이 환산해 준다.
   * 우리가 환율을 곱하지 않는다: 그건 추정이 되고, 어제 환율과 오늘 환율이 다르다.
   */
  if (options.currencyCode) params.set('currencyCode', options.currencyCode);
  params.set('limit', String(Math.max(1, Math.min(5000, Math.floor(options.limit ?? 1000)))));

  const json = await apiGet(`/${accountName}/reports:generate`, accessToken, params);

  /*
   * 응답은 headers 순서대로 cells 가 온다. 지표 이름으로 자리를 찾는다 —
   * 순서를 가정하면 구글이 열을 하나 끼워 넣는 날 조용히 틀린 숫자가 된다.
   */
  const headers: string[] = (json.headers || []).map((h: any) => String(h.name || ''));
  const idxUrl = headers.indexOf('PAGE_URL');
  const idxEarn = headers.indexOf('ESTIMATED_EARNINGS');
  const idxViews = headers.indexOf('PAGE_VIEWS');
  if (idxUrl < 0 || idxEarn < 0 || idxViews < 0) {
    throw new Error(`애드센스 응답에 필요한 열이 없습니다: ${headers.join(', ')}`);
  }

  const rows: PageEarnings[] = (json.rows || []).map((row: any) => {
    const cells = row.cells || [];
    const pageUrl = String(cells[idxUrl]?.value ?? '');
    const earnings = Number(cells[idxEarn]?.value ?? 0) || 0;
    const pageViews = Number(cells[idxViews]?.value ?? 0) || 0;
    return {
      pageUrl,
      earnings,
      pageViews,
      // 페이지뷰가 0 이면 RPM 은 정의되지 않는다. 0 으로 적으면 "돈 안 되는 글"로 오독된다.
      rpm: pageViews > 0 ? (earnings / pageViews) * 1000 : null,
    };
  }).filter((r: PageEarnings) => r.pageUrl);

  const fmt = (d: { y: number; m: number; d: number }) =>
    `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;

  return {
    rows,
    startDate: fmt(s),
    endDate: fmt(e),
    currency: String(json.headers?.[idxEarn]?.currencyCode || ''),
  };
}
