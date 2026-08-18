/**
 * API HUB 어댑터 순수 변환 테스트 — 주소 매핑과 헤더 교체가 전부이자 급소다.
 * (네트워크 프로브·fetch 폴백은 라이브 스모크로 별도 검증)
 */
import { describe, it, expect } from 'vitest';
import { mapLegacyUrlToHub, swapAuthHeaders, API_HUB_BASE_CANDIDATES } from '../naver-api-hub';

const BASE = API_HUB_BASE_CANDIDATES[0];

describe('mapLegacyUrlToHub', () => {
  it('검색 API: /v1/search/{type}.json → /search/v1/{type}, 쿼리스트링 보존', () => {
    expect(
      mapLegacyUrlToHub('https://openapi.naver.com/v1/search/blog.json?query=%EC%84%A0%ED%92%8D%EA%B8%B0&display=1', BASE)
    ).toBe(`${BASE}/search/v1/blog?query=%EC%84%A0%ED%92%8D%EA%B8%B0&display=1`);
    expect(mapLegacyUrlToHub('https://openapi.naver.com/v1/search/news.json?query=a', BASE)).toBe(
      `${BASE}/search/v1/news?query=a`
    );
    expect(mapLegacyUrlToHub('https://openapi.naver.com/v1/search/webkr.json?query=a', BASE)).toBe(
      `${BASE}/search/v1/webkr?query=a`
    );
    expect(mapLegacyUrlToHub('https://openapi.naver.com/v1/search/kin.json?query=a', BASE)).toBe(
      `${BASE}/search/v1/kin?query=a`
    );
  });

  it('데이터랩: /v1/datalab/search → /datalab/v1/search', () => {
    expect(mapLegacyUrlToHub('https://openapi.naver.com/v1/datalab/search', BASE)).toBe(
      `${BASE}/datalab/v1/search`
    );
  });

  it('완전 종료된 쇼핑 검색은 HUB 에도 없다 — 변환하지 않는다', () => {
    expect(mapLegacyUrlToHub('https://openapi.naver.com/v1/search/shop.json?query=a', BASE)).toBeNull();
  });

  it('네이버 외 URL·비매핑 경로는 건드리지 않는다', () => {
    expect(mapLegacyUrlToHub('https://api.naver.com/keywordstool', BASE)).toBeNull();
    expect(mapLegacyUrlToHub('https://example.com/v1/search/blog.json', BASE)).toBeNull();
  });
});

describe('swapAuthHeaders', () => {
  it('legacy 인증 헤더를 NCP 헤더로 바꾸고 나머지는 보존한다', () => {
    const swapped = swapAuthHeaders(
      { 'X-Naver-Client-Id': 'old-id', 'X-Naver-Client-Secret': 'old-secret', 'Content-Type': 'application/json' },
      { keyId: 'ncp-id', key: 'ncp-key' }
    );
    expect(swapped).toEqual({
      'Content-Type': 'application/json',
      'X-NCP-APIGW-API-KEY-ID': 'ncp-id',
      'X-NCP-APIGW-API-KEY': 'ncp-key',
    });
  });

  it('빈 헤더에서도 인증 헤더 두 개가 생긴다', () => {
    const swapped = swapAuthHeaders({}, { keyId: 'a', key: 'b' });
    expect(Object.keys(swapped).sort()).toEqual(['X-NCP-APIGW-API-KEY', 'X-NCP-APIGW-API-KEY-ID']);
  });
});
