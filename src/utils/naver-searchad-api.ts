/**
 * 네이버 검색광고 키워드 도구 API
 * 정확한 PC/모바일 검색량 조회
 */

import { createHash, createHmac } from 'crypto';

let lastSearchAdRequestAt = 0;

export interface NaverSearchAdConfig {
  accessLicense: string;
  secretKey: string;
  customerId?: string; // 고객 ID (X-Customer 헤더에 사용)
}

export interface KeywordSearchVolume {
  keyword: string;
  pcSearchVolume: number | null;
  mobileSearchVolume: number | null;
  totalSearchVolume: number | null;
  competition?: string;
  monthlyPcQcCnt?: number | null;
  monthlyMobileQcCnt?: number | null;
}

/**
 * HTML 엔티티 디코딩
 */
const decodeHtmlEntities = (str: string): string => {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
};

/**
 * 검색량 숫자 파싱 (문자열 "< 10" 등을 0으로 변환 - 실제 검색량 10 미만 표시)
 */
const parseVolumeValue = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const strValue = String(value);

  // "< 10" 패턴 감지: 검색량이 10 미만인 경우 0으로 반환 (UI에서 "< 10"으로 표시)
  if (strValue.includes('<') || strValue.toLowerCase().includes('less')) {
    return 0; // 0을 반환하여 UI에서 "< 10"으로 표시하도록 함
  }

  // 일반 숫자 파싱: 모든 비숫자 제거
  const cleaned = strValue.replace(/[^0-9]/g, '');
  if (!cleaned) return 0;

  const parsed = parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * API 요청을 위한 키워드 전처리
 */
const buildProcessedKeyword = (cleanKeyword: string): string => {
  let processedKeyword = cleanKeyword
    .replace(/['"]/g, '')
    .replace(/[&<>]/g, '')
    .replace(/[^\w\s가-힣]/g, '')
    .trim()
    .replace(/\s+/g, '+');

  if (!processedKeyword || processedKeyword.length === 0) {
    processedKeyword = cleanKeyword.trim();
  }
  if (processedKeyword.length > 15) {
    processedKeyword = processedKeyword.substring(0, 15).trim();
  }
  return processedKeyword;
};

/**
 * 네이버 검색광고 API 서명 생성
 */
function generateSignature(
  method: string,
  uri: string,
  timestamp: string,
  secretKey: string
): string {
  const message = `${timestamp}.${method.toUpperCase()}.${uri}`;
  return createHmac('sha256', secretKey)
    .update(message, 'utf8')
    .digest('base64');
}

/**
 * 여러 키워드의 검색량을 한꺼번에 또는 순차적으로 조회
 */
/**
 * 여러 키워드의 검색량을 한꺼번에 조회 (5개씩 배치 처리로 최적화)
 */
export async function getNaverSearchAdKeywordVolume(
  config: NaverSearchAdConfig,
  keywords: string[]
): Promise<KeywordSearchVolume[]> {
  if (!config.accessLicense || !config.secretKey) {
    throw new Error('네이버 검색광고 API 인증 정보가 필요합니다');
  }

  let customerId: string;
  if (config.customerId && typeof config.customerId === 'string' && config.customerId.trim() !== '') {
    customerId = config.customerId.trim();
  } else {
    const parts = config.accessLicense.split(':');
    if (parts.length > 1 && parts[0] && typeof parts[0] === 'string' && parts[0].trim() !== '') {
      customerId = parts[0].trim();
    } else {
      customerId = config.accessLicense.substring(0, Math.min(10, config.accessLicense.length));
    }
  }

  const results: KeywordSearchVolume[] = [];
  const cleanKeywords = (keywords || []).map(k => String(k || '').trim()).filter(Boolean);

  // 5개씩 묶어서 처리 (API 제한 최적화)
  const chunkSize = 5;
  for (let i = 0; i < cleanKeywords.length; i += chunkSize) {
    const chunk = cleanKeywords.slice(i, i + chunkSize);
    const hintKeywordsValue = chunk.map(k => buildProcessedKeyword(k)).join(',');

    try {
      const apiUrl = 'https://api.searchad.naver.com/keywordstool';
      const uri = '/keywordstool';
      const method = 'GET';
      const timestamp = String(Date.now());

      const params = new URLSearchParams();
      params.append('hintKeywords', hintKeywordsValue);
      params.append('showDetail', '1');

      const signature = generateSignature(method, uri, timestamp, config.secretKey);
      const headers: Record<string, string> = {
        'X-Timestamp': timestamp,
        'X-API-KEY': config.accessLicense,
        'X-Signature': signature,
        'X-Customer': customerId
      };

      // Rate Limit 조절 (배치 요청이므로 간격을 조금 더 둠)
      const minIntervalMs = 500; // 5개 묶음이므로 500ms 간격 (기존 250ms -> 500ms로 안전하게)
      const now = Date.now();
      lastSearchAdRequestAt = Math.max(now, lastSearchAdRequestAt + minIntervalMs);
      const waitMs = lastSearchAdRequestAt - now;
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
      // lastSearchAdRequestAt = Date.now(); // 중복 업데이트 제거

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 타임아웃 20초

      const response = await fetch(`${apiUrl}?${params.toString()}`, {
        method,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[NAVER-SEARCHAD] 배치 요청 실패 (${response.status}): ${chunk.join(',')}`);
        // 실패 시 해당 청크의 키워드들은 null 처리
        chunk.forEach(k => results.push({ keyword: k, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: null }));
        continue;
      }

      const data = await response.json();
      const keywordList = data.keywordList || data.relKeywordList || (data.result && (data.result.keywordList || data.result.relKeywordList)) || [];

      // 결과 매핑: 요청한 키워드를 찾아 결과에 넣기
      for (const requestedKw of chunk) {
        const normalizedRequest = requestedKw.toLowerCase().replace(/\s+/g, '');

        // 1차: 정확히 일치하는 항목 찾기
        let match = keywordList.find((item: any) => {
          const rel = decodeHtmlEntities(item.relKeyword || '').toLowerCase().replace(/\s+/g, '');
          return rel === normalizedRequest;
        });

        // 2차: 정확 일치 실패 시, 포함 관계 매칭 시도 (한미반도체 주가 → 한미반도체주가)
        if (!match) {
          match = keywordList.find((item: any) => {
            const rel = decodeHtmlEntities(item.relKeyword || '').toLowerCase().replace(/\s+/g, '');
            return rel.includes(normalizedRequest) || normalizedRequest.includes(rel);
          });
        }

        // 3차: 청크에 키워드가 1개뿐이면 API 첫 번째 결과 사용 (hintKeyword로 요청했으므로 연관성 높음)
        if (!match && chunk.length === 1 && keywordList.length > 0) {
          match = keywordList[0];
          console.log(`[NAVER-SEARCHAD] ⚠️ 정확 매칭 실패, 첫 번째 결과 사용: "${requestedKw}" → "${match?.relKeyword}"`);
        }

        if (match) {
          const pc = parseVolumeValue(match.monthlyPcQcCnt);
          const mo = parseVolumeValue(match.monthlyMobileQcCnt);
          const total = (pc !== null || mo !== null) ? ((pc || 0) + (mo || 0)) : null;

          results.push({
            keyword: requestedKw,
            pcSearchVolume: pc,
            mobileSearchVolume: mo,
            totalSearchVolume: total,
            competition: match.compIdx || match.competition,
            monthlyPcQcCnt: pc,
            monthlyMobileQcCnt: mo
          });
        } else {
          // 결과 목록에 없음 -> 검색량 0 또는 null로 처리?
          // 보통 hintKeyword에 넣었는데 안 나오면 검색량이 매우 적거나 없는 경우임.
          // "< 10"도 목록에는 나오므로, 아예 안 나오는 건 데이터 없음.
          console.log(`[NAVER-SEARCHAD] ⚠️ "${requestedKw}" 검색량 조회 실패 - API 응답에 결과 없음`);
          results.push({ keyword: requestedKw, pcSearchVolume: 0, mobileSearchVolume: 0, totalSearchVolume: 0 });
        }
      }

    } catch (error: any) {
      console.error(`[NAVER-SEARCHAD] 배치 에러: ${chunk.join(',')} - ${error.message}`);
      chunk.forEach(k => results.push({ keyword: k, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: null }));
    }
  }

  return results;
}

export interface KeywordSuggestion {
  keyword: string;
  pcSearchVolume: number;
  mobileSearchVolume: number;
  totalSearchVolume: number;
  competition?: string;
  monthlyPcQcCnt?: number;
  monthlyMobileQcCnt?: number;
}

/**
 * 연관 키워드 제안 조회
 */
export async function getNaverSearchAdKeywordSuggestions(
  config: NaverSearchAdConfig,
  seedKeyword: string,
  limit: number = 200
): Promise<KeywordSuggestion[]> {
  const accessLicense = config.accessLicense ?? '';
  const secretKey = config.secretKey ?? '';

  if (!accessLicense || !secretKey) {
    throw new Error('네이버 검색광고 API 인증 정보가 필요합니다');
  }

  let customerId = config.customerId || '';
  if (!customerId) {
    const parts = accessLicense.split(':');
    customerId = parts.length > 1 ? parts[0] : accessLicense.substring(0, 10);
  }

  const method = 'GET';
  const uri = '/keywordstool';
  const apiUrl = 'https://api.searchad.naver.com/keywordstool';

  const processedSeed = buildProcessedKeyword(seedKeyword);
  const params = new URLSearchParams();
  params.append('hintKeywords', processedSeed);
  params.append('showDetail', '1');

  try {
    const timestamp = String(Date.now());
    const signature = generateSignature(method, uri, timestamp, secretKey);
    const headers = {
      'X-Timestamp': timestamp,
      'X-API-KEY': accessLicense,
      'X-Signature': signature,
      'X-Customer': customerId
    };

    // Rate Limit 조절 (Atomic-like scheduling)
    const now = Date.now();
    lastSearchAdRequestAt = Math.max(now, lastSearchAdRequestAt + 500); // 최소 0.5초 간격 유지
    const waitMs = lastSearchAdRequestAt - now;
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

    const response = await fetch(`${apiUrl}?${params.toString()}`, { method, headers });
    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    const keywordList = data.keywordList || data.relKeywordList || (data.result && (data.result.keywordList || data.result.relKeywordList)) || [];

    const suggestions: KeywordSuggestion[] = keywordList.map((item: any) => {
      const pc = parseVolumeValue(item.monthlyPcQcCnt) || 0;
      const mo = parseVolumeValue(item.monthlyMobileQcCnt) || 0;
      return {
        keyword: decodeHtmlEntities(item.relKeyword || ''),
        pcSearchVolume: pc,
        mobileSearchVolume: mo,
        totalSearchVolume: pc + mo,
        competition: item.compIdx,
        monthlyPcQcCnt: pc,
        monthlyMobileQcCnt: mo
      };
    });

    return suggestions
      .filter(s => s.keyword && s.keyword !== seedKeyword)
      .sort((a, b) => b.totalSearchVolume - a.totalSearchVolume)
      .slice(0, limit);

  } catch (error: any) {
    console.warn('[NAVER-SEARCHAD] 제안 조회 실패:', error.message);
    return [];
  }
}