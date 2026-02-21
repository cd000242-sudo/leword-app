/**
 * 네이버 크롤러 스텁
 * 실제 구현이 필요한 경우 여기에 추가
 */

export async function searchNaverWithApi(
  query: string,
  credentials?: any,
  type?: string,
  options?: any
): Promise<any[]> {
  try {
    const clientId = credentials?.clientId || credentials?.customerId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = credentials?.clientSecret || credentials?.secretKey || process.env['NAVER_CLIENT_SECRET'] || '';
    if (!clientId || !clientSecret) return [];

    const apiType = (type || 'news').toLowerCase();
    const allowed = new Set(['news', 'blog', 'cafearticle', 'webkr']);
    const finalType = allowed.has(apiType) ? apiType : 'news';

    const display = typeof options?.display === 'number' ? options.display : 10;
    const sort = options?.sort || 'sim';
    const start = typeof options?.start === 'number' ? options.start : 1;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timeoutMs = typeof options?.timeout === 'number' ? options.timeout : 5000;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    const apiUrl = `https://openapi.naver.com/v1/search/${finalType}.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${encodeURIComponent(sort)}`;
    const response = await fetch(apiUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Accept': 'application/json'
      },
      signal: controller?.signal
    });

    if (timer) clearTimeout(timer);
    if (!response.ok) return [];

    const data: any = await response.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];

    // 공통 포맷으로 정규화
    return items.map((item: any) => ({
      title: (item?.title || '').replace(/<[^>]*>/g, ''),
      description: (item?.description || '').replace(/<[^>]*>/g, ''),
      link: item?.link || item?.originallink || '',
      pubDate: item?.pubDate
    }));
  } catch {
    return [];
  }
}

