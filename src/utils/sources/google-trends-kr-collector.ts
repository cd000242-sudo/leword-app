/**
 * 구글 트렌드 KR 실시간 인기 검색어 수집기 (RSS)
 *
 * 소스: https://trends.google.com/trending/rss?geo=KR  (2026 신 URL — 구 daily/rss 는 404)
 * 특징: RSS <item><title> 이 곧 트렌딩 "검색어"(예: 스페이스x, 신세계, 이경규).
 *       기사 제목이 아니라 이미 검색어 형태 → 명사 추출 없이 그대로 시드로 쓴다.
 *       <ht:approx_traffic>("1000+") 를 빈도 신호로 활용.
 *
 * 왜 필요? korea.kr 등 정부 RSS 가 전부 404 로 죽은 반면, 구글 트렌드는 살아있고
 *          실검 폐지 이후 "지금 뜨는 검색어"를 얻을 수 있는 몇 안 되는 공개 소스.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const GOOGLE_TRENDS_KR_RSS = 'https://trends.google.com/trending/rss?geo=KR';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 8000;

function parseApproxTraffic(raw: string): number {
  // "1,000+" / "20,000+" → 숫자
  const n = parseInt(String(raw || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function getGoogleTrendsKrKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
  try {
    const res = await axios.get(GOOGLE_TRENDS_KR_RSS, {
      timeout: TIMEOUT,
      responseType: 'text',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      validateStatus: (s) => s < 500,
    });
    if (typeof res.data !== 'string' || !res.data) return [];

    const $ = cheerio.load(res.data, { xmlMode: true });
    const out: Array<{ keyword: string; frequency: number }> = [];
    const seen = new Set<string>();

    $('item').each((_idx, el) => {
      const keyword = $(el).children('title').first().text().trim().replace(/\s+/g, ' ');
      // 트렌딩 검색어는 짧은 명사/구 — 기사 헤드라인/문장은 제외
      if (!keyword || keyword.length < 2 || keyword.length > 20) return;
      const key = keyword.replace(/\s+/g, '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      // <ht:approx_traffic> 는 네임스페이스 태그라 자식 중 이름에 approx_traffic 포함된 것을 찾는다
      let trafficRaw = '';
      $(el).children().each((_i, c) => {
        const name = String((c as { tagName?: string; name?: string }).tagName
          || (c as { name?: string }).name || '').toLowerCase();
        if (name.includes('approx_traffic')) trafficRaw = $(c).text();
      });
      const traffic = parseApproxTraffic(trafficRaw);

      out.push({ keyword, frequency: Math.max(1, Math.round(traffic / 100)) });
    });

    return out.slice(0, 40);
  } catch {
    // 단일 소스 실패는 무시 (aggregator 가 allSettled 로 격리)
    return [];
  }
}
