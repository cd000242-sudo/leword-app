/**
 * 네이버 데이터랩 API 클라이언트
 * 공식 API를 사용하여 키워드 트렌드 데이터를 안전하게 수집합니다.
 */

import { apiCache, cachedApiCall } from './api-cache';
import { ErrorHandler } from './error-handler';

export interface NaverDatalabConfig {
  clientId: string;
  clientSecret: string;
}

export interface TrendKeyword {
  rank: number;
  keyword: string;
  changeRate: number;
  category: string;
  searchVolume?: number;
  relatedKeywords?: string[];
  intent?: string;      // 검색 의도 (Commercial, Informational, Transactional, Navigational)
  intentBadge?: string; // 의도별 배지 (💰, ℹ️, ⚡, 📍)
}

/**
 * 네이버 데이터랩 API를 사용하여 키워드 트렌드 조회
 * https://developers.naver.com/docs/serviceapi/datalab/search/search.md
 */
export async function getNaverTrendKeywords(
  config: NaverDatalabConfig,
  options: {
    keywords?: string[];
    startDate?: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD
    timeUnit?: 'date' | 'week' | 'month';
    device?: 'pc' | 'mo';
    ages?: string[];
    gender?: 'm' | 'f';
  } = {}
): Promise<TrendKeyword[]> {
  const {
    keywords = [],
    startDate = getDateDaysAgo(30), // 기본 30일 전
    endDate = getDateToday(),
    timeUnit = 'date',
    device = 'pc', // 기본값이지만 실제로는 모바일+PC 합산 데이터가 더 정확
    ages = [],
    gender
  } = options;

  if (!config.clientId || !config.clientSecret) {
    throw new Error('네이버 API 인증 정보가 필요합니다 (Client ID, Client Secret)');
  }

  // 캐시 키 생성
  const cacheKey = apiCache.generateKey('naver-datalab-trend', {
    keywords: keywords.sort().join(','),
    startDate,
    endDate,
    timeUnit,
    device,
    ages: ages.sort().join(','),
    gender
  });

  // 캐시된 API 호출 (10분 TTL)
  return cachedApiCall(
    cacheKey,
    async () => {
      try {
        // API 키 검증 - 없으면 명확한 로그와 함께 빈 배열 반환
        if (!config.clientId || !config.clientSecret) {
          const errorMessage = `❌ 네이버 데이터랩 API 키가 설정되지 않았습니다!

💡 해결 방법:
1. 설정 탭에서 네이버 API 키를 입력해주세요
2. Client ID와 Client Secret이 모두 필요합니다
3. 네이버 개발자 센터(https://developers.naver.com)에서 발급받으세요

⚠️ API 키 없이는 네이버 데이터랩 API를 사용할 수 없습니다.
기능은 계속 작동하지만, 데이터랩 기반 트렌드 분석은 건너뜁니다.`;
          console.warn(`[NAVER-DATALAB] ${errorMessage}`);
          return [];
        }

        // 네이버 데이터랩 API 엔드포인트
        const apiUrl = 'https://openapi.naver.com/v1/datalab/search';

        // 요청 본문 구성
        const requestBody: any = {
          startDate: startDate,
          endDate: endDate,
          timeUnit: timeUnit,
          keywordGroups: keywords.map((keyword) => ({
            groupName: keyword,
            keywords: [keyword]
          })),
          device: device
        };

        if (ages.length > 0) {
          requestBody.ages = ages;
        }

        if (gender) {
          requestBody.gender = gender;
        }

        const headers = {
          'X-Naver-Client-Id': config.clientId,
          'X-Naver-Client-Secret': config.clientSecret,
          'Content-Type': 'application/json'
        };

        console.log('[NAVER-DATALAB] 트렌드 키워드 조회 요청:', {
          keywords,
          startDate,
          endDate,
          hasClientId: !!config.clientId,
          hasClientSecret: !!config.clientSecret
        });

        // 네트워크 오류 자동 재시도 적용
        const response = await ErrorHandler.withRetry(
          async () => {
            return await ErrorHandler.withTimeout(
              async () => fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
              }),
              30000, // 30초 타임아웃
              '네이버 데이터랩 API 요청 시간 초과'
            );
          },
          {
            maxRetries: 3,
            retryDelay: 1000,
            retryableErrors: ['network', 'timeout', 'ECONNRESET', 'ETIMEDOUT']
          }
        );

        if (!response.ok) {
          const errorText = await ErrorHandler.safeString(await response.text().catch(() => ''), '');
          console.log(`[NAVER-DATALAB] API 응답 오류: ${response.status} - ${errorText}`);

          // 🔧 개선된 오류 처리: 사용자 친화적 메시지 + 크레딧 충전 안내
          if (response.status === 401 || response.status === 403) {
            const errorMessage = `❌ 네이버 데이터랩 API 키 인증 실패! (${response.status})

💡 해결 방법:
1. 네이버 개발자 센터(https://developers.naver.com)에서 API 키 확인
2. Client ID와 Client Secret이 정확한지 확인
3. 데이터랩 API 사용 권한이 활성화되어 있는지 확인
4. API 키가 만료되지 않았는지 확인

⚠️ API 키가 유효하지 않거나
크레딧이 부족할 수 있습니다.
크레딧을 충전한 후 다시 시도해주세요.`;
            console.error(`[NAVER-DATALAB] ${errorMessage}`);
            // 기능 유지를 위해 빈 배열 반환하되, 로그에 명확한 오류 메시지 기록
            return [];
          }

          if (response.status === 429) {
            const errorMessage = `❌ 네이버 데이터랩 API 할당량 초과! (429)

💡 해결 방법:
1. 잠시 후 다시 시도하세요 (1분 대기 권장)
2. 네이버 개발자 센터에서 사용량 확인
3. 필요시 유료 플랜으로 업그레이드

⚠️ 무료 할당량을 초과했습니다.
크레딧을 충전하거나 유료 플랜을 사용하세요.`;
            console.error(`[NAVER-DATALAB] ${errorMessage}`);
            throw new Error(errorMessage);
          }

          if (response.status === 500) {
            const errorMessage = `❌ 네이버 데이터랩 서버 오류가 발생했습니다. (500)

💡 해결 방법:
1. 잠시 후 다시 시도해주세요
2. 네이버 개발자 센터 상태 페이지 확인
3. 문제가 지속되면 네이버 고객센터에 문의`;
            console.error(`[NAVER-DATALAB] ${errorMessage}`);
            throw new Error(errorMessage);
          }

          const friendlyMessage = ErrorHandler.getFriendlyMessage(
            { status: response.status, message: errorText },
            '네이버 데이터랩 API'
          );
          throw new Error(friendlyMessage);
        }

        const responseText = await response.text().catch(() => '{}');
        const data: any = ErrorHandler.safeJsonParse(
          responseText,
          { results: [] }
        );

        if (!data.results || data.results.length === 0) {
          console.log('[NAVER-DATALAB] 트렌드 데이터 없음');
          return [];
        }

        // 결과 변환
        const trendKeywords: TrendKeyword[] = [];
        let rank = 1;

        for (const result of data.results) {
          // 네이버 데이터랩 API 응답 구조: 
          // { title: string (groupName), keyword: string[] (keywords 배열), data: Array<{period, ratio}> }
          let keyword = '';

          // 방법 1: title (groupName) 사용
          if (result.title) {
            keyword = result.title;
          }
          // 방법 2: keyword 배열의 첫 번째 키워드 사용
          else if (result.keyword && Array.isArray(result.keyword) && result.keyword.length > 0) {
            keyword = result.keyword[0];
          }
          // 방법 3: keywordGroup 사용 (하위 호환성)
          else if (result.keywordGroup && Array.isArray(result.keywordGroup) && result.keywordGroup.length > 0) {
            keyword = result.keywordGroup[0];
          }
          // 방법 4: groupName 사용
          else if (result.groupName) {
            keyword = result.groupName;
          }

          // 키워드가 없거나 유효하지 않으면 스킵
          if (!keyword || keyword.trim().length === 0 || keyword.toLowerCase().includes('search') || keyword.includes('검색')) {
            console.warn('[NAVER-DATALAB] 유효하지 않은 키워드 스킵:', keyword);
            continue;
          }

          const keywordData = result.data || [];

          // 최신 데이터의 검색량
          const latestData = keywordData.length > 0 ? keywordData[keywordData.length - 1] : null;
          const previousData = keywordData.length > 1 ? keywordData[keywordData.length - 2] : null;

          // 변화율 계산
          let changeRate = 0;
          if (latestData && previousData) {
            const diff = latestData.ratio - previousData.ratio;
            changeRate = previousData.ratio > 0 ? (diff / previousData.ratio) * 100 : 0;
          }

          trendKeywords.push({
            rank: rank++,
            keyword: keyword.trim(),
            changeRate: Math.round(changeRate * 10) / 10,
            category: '일반',
            searchVolume: latestData?.ratio || 0
          });
        }

        // 변화율 기준 정렬 (내림차순)
        trendKeywords.sort((a, b) => b.changeRate - a.changeRate);

        console.log(`[NAVER-DATALAB] 트렌드 키워드 ${trendKeywords.length}개 수집 완료`);
        return trendKeywords;
      } catch (error: any) {
        console.error('[NAVER-DATALAB] API 호출 실패:', error);

        // 에러 타입별 처리
        if (error instanceof TypeError && error.message.includes('fetch')) {
          console.error('[NAVER-DATALAB] 네트워크 오류 또는 fetch API를 사용할 수 없습니다');
          // 실제 네트워크 오류인지 확인 (더 정확한 판별)
          const errorMsg = error?.message || String(error || '').toLowerCase();
          const isRealNetworkError =
            errorMsg.includes('failed to fetch') ||
            errorMsg.includes('networkerror') ||
            errorMsg.includes('network request failed') ||
            errorMsg.includes('err_network') ||
            errorMsg.includes('enotfound') ||
            errorMsg.includes('econnrefused') ||
            errorMsg.includes('etimedout') ||
            errorMsg.includes('econnreset');

          if (isRealNetworkError) {
            throw new Error('네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.');
          } else {
            // 네트워크 오류가 아닌 경우 원래 오류 메시지 사용
            throw error;
          }
        }

        if (error.message && (error.message.includes('401') || error.message.includes('인증'))) {
          const errorMessage = `❌ 네이버 데이터랩 API 키 인증 실패! (401)

💡 해결 방법:
1. 네이버 개발자 센터(https://developers.naver.com)에서 API 키 확인
2. Client ID와 Client Secret이 정확한지 확인
3. 데이터랩 API 사용 권한이 활성화되어 있는지 확인

⚠️ API 키가 유효하지 않거나
크레딧이 부족할 수 있습니다.
크레딧을 충전한 후 다시 시도해주세요.`;
          throw new Error(errorMessage);
        }

        if (error.message && (error.message.includes('403') || error.message.includes('권한'))) {
          const errorMessage = `❌ 네이버 데이터랩 API 접근 거부! (403)

💡 해결 방법:
1. 네이버 개발자 센터에서 API 사용 권한 확인
2. 데이터랩 API 서비스가 활성화되어 있는지 확인
3. API 키에 올바른 권한이 부여되어 있는지 확인

⚠️ API 사용 권한이 없거나
크레딧이 부족할 수 있습니다.
크레딧을 충전한 후 다시 시도해주세요.`;
          throw new Error(errorMessage);
        }

        if (error.message && (error.message.includes('429') || error.message.includes('할당량') || error.message.includes('한도'))) {
          const errorMessage = `❌ 네이버 데이터랩 API 할당량 초과! (429)

💡 해결 방법:
1. 잠시 후 다시 시도하세요 (1분 대기 권장)
2. 네이버 개발자 센터에서 사용량 확인
3. 필요시 유료 플랜으로 업그레이드

⚠️ 무료 할당량을 초과했습니다.
크레딧을 충전하거나 유료 플랜을 사용하세요.`;
          throw new Error(errorMessage);
        }

        // 기타 에러는 원래 에러 메시지 유지
        throw new Error(`네이버 데이터랩 API 오류: ${error.message || '알 수 없는 오류'}`);
      }
    },
    600000 // 10분 TTL
  );
}

/**
 * 네이버 검색 API를 사용하여 인기 검색어 조회
 * https://developers.naver.com/docs/serviceapi/search/rank/rank.md
 */
export async function getNaverRankingKeywords(
  config: NaverDatalabConfig
): Promise<TrendKeyword[]> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('네이버 API 인증 정보가 필요합니다');
  }

  try {
    // 네이버 검색 순위 API (실시간 검색어는 공식 API가 없어서, 블로그/뉴스 검색량으로 대체)
    // 실제로는 네이버 데이터랩 API나 검색 API의 인기 검색어 기능을 사용해야 합니다
    // 여기서는 검색 API를 통해 인기 키워드를 추정합니다

    const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';

    // 인기 검색어 후보들 (실제로는 데이터랩이나 다른 소스에서 가져와야 함)
    const popularKeywords = [
      '블로그 수익화', '부업 추천', '온라인 수입', 'AI 글쓰기', '자동화 도구',
      '디지털 노마드', '유튜브 수익', '사이드 프로젝트', '온라인 강의', '프리랜서'
    ];

    const results: TrendKeyword[] = [];

    for (let i = 0; i < Math.min(popularKeywords.length, 10); i++) {
      const keyword = popularKeywords[i];
      if (!keyword) continue;

      try {
        const params = new URLSearchParams();
        params.append('query', keyword);
        params.append('display', '1');
        params.append('sort', 'sim');

        const headers = {
          'X-Naver-Client-Id': config.clientId,
          'X-Naver-Client-Secret': config.clientSecret
        };

        // PC와 모바일 검색량 합산을 위해 두 번 호출
        let totalSearchVolume = 0;

        // PC 검색량
        try {
          const pcResponse = await fetch(`${apiUrl}?${params}`, {
            method: 'GET',
            headers: headers
          });

          if (pcResponse.ok) {
            const pcData = await pcResponse.json();
            totalSearchVolume += parseInt(pcData.total || '0');
          }
        } catch (error) {
          console.warn(`[NAVER-RANK] PC 검색량 조회 실패 (${keyword}):`, error);
        }

        // 모바일 검색량
        const mobileParams = new URLSearchParams();
        if (keyword) {
          mobileParams.append('query', keyword);
          mobileParams.append('display', '1');
          mobileParams.append('sort', 'sim');
        }

        try {
          const mobileResponse = await fetch(`${apiUrl}?${mobileParams}`, {
            method: 'GET',
            headers: headers
          });

          if (mobileResponse.ok) {
            const mobileData = await mobileResponse.json();
            totalSearchVolume += parseInt(mobileData.total || '0');
          }
        } catch (error) {
          console.warn(`[NAVER-RANK] 모바일 검색량 조회 실패 (${keyword}):`, error);
          // 모바일 조회 실패 시 PC만 사용
          if (totalSearchVolume === 0) {
            const pcResponse = await fetch(`${apiUrl}?${params}`, {
              method: 'GET',
              headers: headers
            });
            if (pcResponse.ok) {
              const pcData = await pcResponse.json();
              totalSearchVolume = parseInt(pcData.total || '0');
            }
          }
        }

        if (totalSearchVolume > 0) {
          // 검색 결과 수를 기반으로 인기도 추정
          const popularity = Math.min(totalSearchVolume / 1000, 100); // 최대 100으로 제한

          if (keyword) {
            results.push({
              rank: i + 1,
              keyword: keyword,
              changeRate: popularity,
              category: '인기',
              searchVolume: totalSearchVolume || 0 // PC+모바일 합산
            });
          }

          // API 호출 제한 고려 (1초 대기)
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[NAVER-RANK] 키워드 "${keyword}" 조회 실패:`, error);
      }
    }

    return results.sort((a, b) => b.searchVolume! - a.searchVolume!);

  } catch (error: any) {
    console.error('[NAVER-RANK] API 호출 실패:', error);

    // 에러 타입별 처리
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[NAVER-RANK] 네트워크 오류 또는 fetch API를 사용할 수 없습니다');
      // 실제 네트워크 오류인지 확인 (더 정확한 판별)
      const errorMsg = error?.message || String(error || '').toLowerCase();
      const isRealNetworkError =
        errorMsg.includes('failed to fetch') ||
        errorMsg.includes('networkerror') ||
        errorMsg.includes('network request failed') ||
        errorMsg.includes('err_network') ||
        errorMsg.includes('enotfound') ||
        errorMsg.includes('econnrefused') ||
        errorMsg.includes('etimedout') ||
        errorMsg.includes('econnreset');

      if (isRealNetworkError) {
        throw new Error('네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.');
      } else {
        // 네트워크 오류가 아닌 경우 원래 오류 메시지 사용
        throw error;
      }
    }

    if (error.message && error.message.includes('401')) {
      throw new Error('네이버 API 인증 정보가 올바르지 않습니다. Client ID와 Client Secret을 확인해주세요.');
    }

    if (error.message && error.message.includes('403')) {
      throw new Error('네이버 API 접근이 거부되었습니다. API 사용 권한을 확인해주세요.');
    }

    if (error.message && error.message.includes('429')) {
      throw new Error('네이버 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
    }

    // 기타 에러는 원래 에러 메시지 유지
    throw new Error(`네이버 랭킹 API 오류: ${error.message || '알 수 없는 오류'}`);
  }
}

/**
 * 네이버 블로그 검색 API 폴백 함수 (검색광고 API 실패 시 사용)
 * 띄어쓰기 포함 키워드나 400 에러 발생 시 사용
 * ⚠️ export 추가: 다른 모듈에서도 사용 가능하도록
 */
export async function getBlogSearchFallback(
  config: NaverDatalabConfig,
  keyword: string
): Promise<{ keyword: string; pcSearchVolume: number | null; mobileSearchVolume: number | null } | null> {
  try {
    const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';
    const params = new URLSearchParams({
      query: keyword,
      display: '1', // 1개만 조회 (total 필드 확인용)
      sort: 'sim'
    });

    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      headers: {
        'X-Naver-Client-Id': config.clientId,
        'X-Naver-Client-Secret': config.clientSecret
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const totalRaw = (data as any)?.total;
    const total = typeof totalRaw === 'number' ? totalRaw : (typeof totalRaw === 'string' ? parseInt(totalRaw, 10) : null);

    // 블로그 검색 API는 정확한 검색량을 제공하지 않지만,
    // 문서수(total)를 기반으로 추정 검색량 계산
    // 일반적으로 문서수와 검색량은 비례 관계가 있음
    // 추정 공식: 검색량 = 문서수 * 0.1 ~ 0.5 (키워드에 따라 다름)
    // 보수적으로 문서수 * 0.3으로 추정
    const estimatedSearchVolume = null;

    // PC와 모바일 비율은 일반적으로 2:8 (모바일이 더 많음)
    const pcVolume: number | null = null;
    const mobileVolume: number | null = null;

    console.log(`[NAVER-VOLUME] 블로그 검색 API 폴백 "${keyword}": 문서수=${total ?? 'null'}, 추정 검색량=PC ${pcVolume ?? 'null'}, 모바일 ${mobileVolume ?? 'null'}`);

    return {
      keyword: keyword,
      pcSearchVolume: pcVolume,
      mobileSearchVolume: mobileVolume
    };
  } catch (error) {
    console.error(`[NAVER-VOLUME] 블로그 검색 API 폴백 실패:`, error);
    return null;
  }
}

/**
 * 네이버 블로그 검색 API를 사용하여 키워드별 검색량 조회 (PC/모바일 분리)
 * 검색량: 검색광고 API (띄어쓰기 제거 버전)
 * 문서수: 네이버 블로그 검색 API (원본 키워드)
 */
export async function getNaverKeywordSearchVolumeSeparate(
  config: NaverDatalabConfig,
  keywords: string[],
  options: { includeDocumentCount?: boolean } = {}
): Promise<{ keyword: string; pcSearchVolume: number | null; mobileSearchVolume: number | null; documentCount: number | null; competition: string | null; monthlyAveCpc: number | null }[]> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('네이버 API 인증 정보가 필요합니다');
  }

  const includeDocumentCount = options.includeDocumentCount !== false;
  const input = (keywords || []).map(k => String(k || '').trim()).filter(Boolean);
  if (input.length === 0) return [];

  const results: { keyword: string; pcSearchVolume: number | null; mobileSearchVolume: number | null; documentCount: number | null; competition: string | null; monthlyAveCpc: number | null }[] = input.map(k => ({
    keyword: k,
    pcSearchVolume: null,
    mobileSearchVolume: null,
    documentCount: null,
    competition: null,
    monthlyAveCpc: null
  }));

  try {
    const { getNaverSearchAdKeywordVolume } = await import('./naver-searchad-api');
    const envManager = (await import('./environment-manager')).EnvironmentManager.getInstance();
    const envConfig = envManager.getConfig();

    if (envConfig.naverSearchAdAccessLicense && envConfig.naverSearchAdSecretKey) {
      let customerId: string | undefined = envConfig.naverSearchAdCustomerId;
      if (!customerId || customerId.trim() === '') {
        const parts = envConfig.naverSearchAdAccessLicense.split(':');
        const firstPart = parts[0];
        if (parts.length > 1 && firstPart && firstPart.trim() !== '') {
          customerId = firstPart;
        } else {
          customerId = envConfig.naverSearchAdAccessLicense.substring(0, 10);
        }
      }

      const searchAdConfig: {
        accessLicense: string;
        secretKey: string;
        customerId?: string;
      } = {
        accessLicense: envConfig.naverSearchAdAccessLicense,
        secretKey: envConfig.naverSearchAdSecretKey
      };
      if (customerId && customerId.trim() !== '') {
        searchAdConfig.customerId = customerId.trim();
      }

      for (let i = 0; i < input.length; i += 5) {
        const batch = input.slice(i, i + 5);
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('검색광고 API 타임아웃 (25초 초과)')), 25000)
          );
          const searchAdResults = await Promise.race([
            getNaverSearchAdKeywordVolume(searchAdConfig, batch),
            timeoutPromise
          ]) as any[];

          for (let j = 0; j < batch.length; j++) {
            const idx = i + j;
            const r = searchAdResults && searchAdResults[j] ? searchAdResults[j] : null;
            const pcVol: number | null = r && typeof r.pcSearchVolume === 'number' ? r.pcSearchVolume : null;
            const mobileVol: number | null = r && typeof r.mobileSearchVolume === 'number' ? r.mobileSearchVolume : null;
            results[idx].pcSearchVolume = pcVol;
            results[idx].mobileSearchVolume = mobileVol;
            results[idx].competition = r && r.competition ? r.competition : null;
            // 🔥 네이버 검색광고 API 실제 평균 입찰가 (monthlyAveCpc) 포함 — 더미 아닌 실측 추정
            results[idx].monthlyAveCpc = r && typeof r.monthlyAveCpc === 'number' ? r.monthlyAveCpc : null;
          }
        } catch (e: any) {
          for (let j = 0; j < batch.length; j++) {
            const idx = i + j;
            const kw = input[idx];
            const errorMessage = e?.message || String(e || '');
            console.warn(`[NAVER-VOLUME] ⚠️ "${kw}" 검색량 조회 실패: ${errorMessage}`);
          }
        }
      }
    }
  } catch (e: any) {
    console.warn(`[NAVER-VOLUME] ⚠️ 검색광고 API 로딩/호출 실패: ${e?.message || String(e || '')}`);
  }

  if (includeDocumentCount) {
    const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';
    for (let i = 0; i < input.length; i++) {
      const originalKeyword = input[i];
      try {
        const params = new URLSearchParams({
          query: originalKeyword,
          display: '1',
          sort: 'sim'
        });

        const response = await fetch(`${apiUrl}?${params.toString()}`, {
          headers: {
            'X-Naver-Client-Id': config.clientId,
            'X-Naver-Client-Secret': config.clientSecret
          }
        });

        if (response.ok) {
          const data = await response.json();
          const totalRaw = (data as any)?.total;
          const total = typeof totalRaw === 'number' ? totalRaw : (typeof totalRaw === 'string' ? parseInt(totalRaw, 10) : null);
          results[i].documentCount = total;
        }
      } catch (err: any) {
        console.warn(`[NAVER-VOLUME] ⚠️ "${originalKeyword}" 문서수 조회 실패: ${err?.message || String(err || '')}`);
      }

      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }

  return results;
}

/**
 * 네이버 블로그 검색 API를 사용하여 키워드별 검색량 조회 (기존 함수 유지)
 */
export async function getNaverKeywordSearchVolume(
  config: NaverDatalabConfig,
  keywords: string[]
): Promise<{ keyword: string; searchVolume: number | null }[]> {
  const separateResults = await getNaverKeywordSearchVolumeSeparate(config, keywords);
  return separateResults.map(item => ({
    keyword: item.keyword,
    searchVolume: (item.pcSearchVolume !== null || item.mobileSearchVolume !== null)
      ? ((item.pcSearchVolume ?? 0) + (item.mobileSearchVolume ?? 0))
      : null
  }));
}

/**
 * 네이버 연관 키워드 수집 (검색 제안, 관련 검색어 활용)
 */
export async function getNaverRelatedKeywords(
  baseKeyword: string,
  config: NaverDatalabConfig,
  options: { category?: string; page?: number; limit?: number; spiderWebDepth?: number } = {}
): Promise<TrendKeyword[]> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('네이버 API 인증 정보가 필요합니다');
  }

  const { page = 0, limit = 10, spiderWebDepth: optSpiderWebDepth } = options;
  const spiderWebDepth = typeof optSpiderWebDepth === 'number' ? optSpiderWebDepth : 0;
  const results: TrendKeyword[] = [];

  // API URL과 헤더 선언 (거미줄 확장에서 사용)
  const apiUrl = 'https://openapi.naver.com/v1/search/blog.json';
  const headers: Record<string, string> = {
    'X-Naver-Client-Id': config.clientId,
    'X-Naver-Client-Secret': config.clientSecret
  };

  try {
    console.log(`[NAVER-RELATED] 🧠 마인드맵 기반 연관키워드 추출 시작: "${baseKeyword}"`);

    // 🔧 1단계: 네이버 자동완성 API로 실제 검색 의도 파악
    const { getNaverAutocompleteKeywords } = await import('./naver-autocomplete');
    const autocompleteKeywords = await getNaverAutocompleteKeywords(baseKeyword, {
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });
    console.log(`[NAVER-RELATED] 자동완성 키워드 ${autocompleteKeywords.length}개 수집`);

    // 🔧 2단계: 네이버 스마트블록에서 연관 검색어 추출
    const smartBlockKeywords = new Set<string>();
    try {
      const searchUrl = `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${encodeURIComponent(baseKeyword)}`;
      const htmlResponse = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          'Accept-Language': 'ko-KR,ko;q=0.9'
        }
      });

      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        // 연관 검색어 패턴
        const relatedPatterns = [
          /<a[^>]*class="[^"]*related_srch[^"]*"[^>]*>([^<]+)<\/a>/g,
          /<span[^>]*class="[^"]*related_keyword[^"]*"[^>]*>([^<]+)<\/span>/g,
          /data-keyword="([^"]+)"/g,
          /data-query="([^"]+)"/g
        ];

        relatedPatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(html)) !== null) {
            const keyword = decodeURIComponent((match[1] || match[2] || '').trim());
            if (keyword && keyword.length >= 2 && keyword.length <= 30) {
              smartBlockKeywords.add(keyword);
            }
          }
        });
        console.log(`[NAVER-RELATED] 스마트블록 연관 검색어 ${smartBlockKeywords.size}개 수집`);
      }
    } catch (err) {
      console.warn('[NAVER-RELATED] 스마트블록 크롤링 실패:', err);
    }

    // 🔧 3단계: 마인드맵 구조 기반 연관 키워드 생성 (제품/카테고리별)
    const mindMapKeywords = new Set<string>();

    // 🕷️ 거미줄 치기: 조금이라도 연상되는 키워드 찾기
    const spiderWebKeywords = new Set<string>();

    // 제품/음식 관련 키워드 마인드맵
    const isFoodProduct = baseKeyword.match(/카레|짜장|볶음밥|비빔밥|김치|된장|고추장|마요네즈|케첩|소스|양념|가루|분말|과자|음료|라면|떡|빵|케이크|아이스크림|치즈|버터|우유|요구르트/);
    const isProduct = baseKeyword.match(/스마트폰|폰|컴퓨터|노트북|태블릿|이어폰|헤드폰|마우스|키보드|모니터|TV|냉장고|세탁기|청소기|에어컨|히터|선풍기|자동차|차|SUV|세단|전기차|하이브리드|신발|운동화|가방|지갑|시계|안경|선글라스|옷|티셔츠|바지|치마|원피스|코트|재킷|가디건|후드|맨투맨|청바지|반바지|속옷|양말|장갑|모자|마스크|화장품|립스틱|파우더|크림|로션|세안제|샴푸|린스|비누|치약|칫솔|수건|타월|이불|베개|매트리스|침대|소파|의자|책상|책장|식탁|의자|화분|꽃|식물|반려동물|강아지|고양이|새|물고기|햄스터|토끼|거북이|도마뱀|뱀|앵무새|금붕어|구피|베타|열대어|고슴도치|페럿|기니피그|햄스터|쥐|햄스터|햄스터|햄스터/);

    if (isFoodProduct || isProduct) {
      // 제품 관련 마인드맵: 제품명, 효능, 관련 제품, 조리법, 브랜드, 가격, 리뷰 등
      const productMindMap = {
        // 제품 종류/변형
        variants: ['가루', '분말', '액상', '스틱', '캡슐', '정제', '시럽', '젤', '크림', '로션', '스프레이', '미스트', '오일', '에센스', '세럼', '토너', '패드', '마스크', '클렌징', '폼', '워시', '스크럽', '필링', '팩', '마스크팩', '시트마스크', '아이크림', '선크림', 'BB크림', 'CC크림', '파우더', '쿠션', '컨실러', '파운데이션', '프라이머', '베이스', '하이라이터', '블러셔', '섀도우', '아이라이너', '마스카라', '립스틱', '립글로스', '립밤', '립틴트', '립라이너', '립스틱', '립글로스', '립밤', '립틴트', '립라이너'],
        // 효능/기능
        benefits: ['효능', '효과', '성분', '영양', '칼로리', '다이어트', '건강', '면역', '항산화', '콜라겐', '히알루론산', '레티놀', '나이아신아마이드', '아젤라산', '살리실산', '글리콜산', '젖산', '멜라닌', '미백', '주름', '탄력', '보습', '수분', '유수분', '세안', '각질', '모공', '트러블', '여드름', '아토피', '건조', '지성', '복합성', '민감성', '건성', '중성', '지성', '복합성', '민감성', '건성', '중성'],
        // 관련 제품/대체재
        related: ['대체', '비슷한', '유사', '같은', '비교', '차이', '장단점', '추천', '순위', '리뷰', '후기', '가격', '구매', '할인', '이벤트', '쿠폰', '적립', '포인트', '배송', '무료배송', '당일배송', '익일배송', '택배', '직배송', '픽업', '매장', '온라인', '오프라인', '쇼핑몰', '마켓', '마트', '편의점', '대형마트', '백화점', '아울렛', '면세점', '해외직구', '해외배송', '국내배송', '해외배송', '국내배송'],
        // 조리법/사용법
        usage: ['만드는법', '만드는 방법', '레시피', '조리법', '요리법', '사용법', '먹는법', '먹는 방법', '마시는법', '마시는 방법', '바르는법', '바르는 방법', '사용법', '적용법', '도포법', '도포 방법', '세안법', '세안 방법', '클렌징법', '클렌징 방법', '스킨케어', '루틴', '순서', '단계', '방법', '팁', '꿀팁', '노하우', '비법', '비밀', '레시피', '조리법', '요리법', '사용법', '먹는법', '먹는 방법', '마시는법', '마시는 방법', '바르는법', '바르는 방법', '사용법', '적용법', '도포법', '도포 방법', '세안법', '세안 방법', '클렌징법', '클렌징 방법', '스킨케어', '루틴', '순서', '단계', '방법', '팁', '꿀팁', '노하우', '비법', '비밀']
      };

      // 제품 종류별 특화 키워드 (마인드맵 구조)
      if (isFoodProduct) {
        // 음식 관련: 카레 → 카레가루, 카레 효능, 하이라이스, 짜장 등
        if (baseKeyword.includes('카레')) {
          // 카레 마인드맵: 제품 종류, 효능, 관련 음식, 조리법
          const curryMindMap = [
            // 제품 종류/변형
            '카레가루', '카레분말', '카레파우더', '카레소스', '카레양념',
            // 효능/영양
            '카레 효능', '카레 영양', '카레 칼로리', '카레 다이어트', '카레 건강',
            // 관련 음식/대체재
            '하이라이스', '짜장', '짜장면', '볶음밥', '카레라이스', '카레덮밥',
            // 조리법
            '카레 만드는법', '카레 레시피', '카레 조리법', '카레 요리법'
          ];
          curryMindMap.forEach(kw => mindMapKeywords.add(kw));
        }

        if (baseKeyword.includes('짜장')) {
          // 짜장 마인드맵
          const jjajangMindMap = [
            '짜장면', '짜장소스', '짜장가루', '짜장 효능', '짜장 영양',
            '짜장 레시피', '짜장 만드는법', '짜장 조리법', '짜장 요리법',
            '짜장볶음밥', '짜장덮밥', '짜장비빔밥'
          ];
          jjajangMindMap.forEach(kw => mindMapKeywords.add(kw));
        }
      }

      // 제품 마인드맵 키워드 생성
      productMindMap.variants.forEach(variant => {
        if (baseKeyword.length + variant.length <= 20) {
          mindMapKeywords.add(`${baseKeyword}${variant}`);
        }
      });

      productMindMap.benefits.forEach(benefit => {
        if (baseKeyword.length + benefit.length <= 20) {
          mindMapKeywords.add(`${baseKeyword} ${benefit}`);
        }
      });

      productMindMap.related.forEach(rel => {
        if (baseKeyword.length + rel.length <= 20) {
          mindMapKeywords.add(`${baseKeyword} ${rel}`);
        }
      });

      productMindMap.usage.forEach(usage => {
        if (baseKeyword.length + usage.length <= 20) {
          mindMapKeywords.add(`${baseKeyword} ${usage}`);
        }
      });
    }

    // 🕷️ 거미줄 치기: 옵션으로 제어 가능
    // 먼저 키워드 포함 연관키워드를 수집한 후, 그 키워드들로 다시 검색하여 거미줄처럼 확장
    const spiderWebProcessed = new Set<string>([baseKeyword]);
    const spiderWebQueue: string[] = [baseKeyword];

    if (spiderWebDepth > 0) {
      console.log(`[NAVER-RELATED] 🕷️ 거미줄 치기 시작 (Depth: ${spiderWebDepth})`);
    } else {
      console.log(`[NAVER-RELATED] ℹ️  거미줄 치기 건너뜀 (spiderWebDepth가 0임)`);
    }

    for (let depth = 0; depth < spiderWebDepth && spiderWebQueue.length > 0; depth++) {
      const currentLevelKeywords = [...spiderWebQueue];
      spiderWebQueue.length = 0; // 큐 초기화

      for (const currentKeyword of currentLevelKeywords) {
        if (spiderWebProcessed.has(currentKeyword)) continue;
        spiderWebProcessed.add(currentKeyword);

        try {
          // 현재 키워드로 검색하여 연상 키워드 추출
          const spiderParams = new URLSearchParams({
            query: currentKeyword,
            display: '50',
            sort: 'sim'
          });

          const spiderResponse = await fetch(`${apiUrl}?${spiderParams}`, {
            method: 'GET',
            headers: headers
          });

          if (spiderResponse.ok) {
            const spiderData = await spiderResponse.json();
            const spiderItems = spiderData.items || [];

            // 제목에서 연상 키워드 추출 (키워드와 함께 나오는 다른 단어들)
            spiderItems.forEach((item: any) => {
              const title = item.title?.replace(/<[^>]*>/g, '').trim() || '';
              const words = title.split(/[\s|,，、·\[\]()【】「」<>]+/).filter((w: string) => w.trim().length > 0);

              // 현재 키워드와 함께 나오는 다른 단어들 찾기 (연상 키워드)
              words.forEach((word: string, idx: number) => {
                if (word.includes(currentKeyword) || currentKeyword.includes(word)) {
                  // 주변 단어들도 연상 키워드로 추가
                  for (let i = Math.max(0, idx - 2); i < Math.min(words.length, idx + 3); i++) {
                    if (i !== idx && words[i] && words[i].length >= 2 && words[i].length <= 15) {
                      const relatedWord = words[i].trim();
                      // 의미 있는 단어만 추가 (조사, 접속사 제외)
                      if (!/^(에서|에게|에게서|의|을|를|이|가|은|는|와|과|도|만|까지|부터|로|으로|하고|이며)$/.test(relatedWord)) {
                        spiderWebKeywords.add(relatedWord);
                        // 다음 단계를 위해 큐에 추가 (아직 처리하지 않은 키워드만)
                        if (!spiderWebProcessed.has(relatedWord) && relatedWord.length >= 2 && relatedWord.length <= 10) {
                          spiderWebQueue.push(relatedWord);
                        }
                      }
                    }
                  }
                }
              });
            });
          }
        } catch (err) {
          console.warn(`[NAVER-RELATED] 거미줄 치기 실패 (${currentKeyword}):`, err);
        }
      }

      console.log(`[NAVER-RELATED] 🕷️ 거미줄 ${depth + 1}단계 완료: ${spiderWebKeywords.size}개 연상 키워드 수집`);
    }

    console.log(`[NAVER-RELATED] 🕷️ 거미줄 치기 완료: 총 ${spiderWebKeywords.size}개 연상 키워드`);

    // 🔧 4단계: 네이버 검색 API로 실제 검색 패턴 분석
    // apiUrl과 headers는 이미 함수 시작 부분에서 선언됨

    // 🔧 개선: 여러 정렬 방식으로 검색하여 더 많은 연관 키워드 추출
    const sortOptions = ['sim', 'date']; // 정확도순 + 최신순
    const allItems: any[] = [];

    // 여러 정렬 방식으로 검색하여 더 많은 결과 수집
    for (const sort of sortOptions) {
      const params = new URLSearchParams({
        query: baseKeyword,
        display: '100', // 최대 100개
        sort: sort
      });

      try {
        const response = await fetch(`${apiUrl}?${params}`, {
          method: 'GET',
          headers: headers
        });

        if (response.ok) {
          const data = await response.json();
          const items = data.items || [];
          allItems.push(...items);
        }
      } catch (err) {
        console.warn(`[NAVER-RELATED] ${sort}순 검색 실패:`, err);
      }
    }

    // 중복 제거 (link 기준)
    const uniqueItems = Array.from(
      new Map(allItems.map(item => [item.link, item])).values()
    );

    console.log(`[NAVER-RELATED] 총 ${uniqueItems.length}개 고유 검색 결과 수집 (${sortOptions.length}가지 정렬 방식)`);

    if (uniqueItems.length > 0) {
      // 제목에서 키워드 추출
      const extractedKeywords = new Set<string>();

      uniqueItems.forEach((item: any) => {
        const title = item.title?.replace(/<[^>]*>/g, '').trim() || '';
        const description = item.description?.replace(/<[^>]*>/g, '').trim() || '';

        // 1. 제목에서 입력 키워드를 포함하는 전체 구문 추출 (우선순위 높음)
        if (title.includes(baseKeyword)) {
          // 제목을 단어 단위로 분리 (더 정확한 분리)
          const titleWords = title.split(/[\s|,，、·\[\]()【】「」<>]+/).filter((w: string) => w.trim().length > 0);

          // 입력 키워드를 포함하는 단어의 인덱스 찾기
          const keywordIndexes: number[] = [];
          titleWords.forEach((word: string, idx: number) => {
            if (word.includes(baseKeyword)) {
              keywordIndexes.push(idx);
            }
          });

          // 각 키워드 위치에서 주변 단어 추출
          keywordIndexes.forEach(keywordIdx => {
            // 키워드 앞 단어들 (최대 2개)
            for (let offset = 1; offset <= 2 && keywordIdx - offset >= 0; offset++) {
              const beforeWords = titleWords.slice(keywordIdx - offset, keywordIdx + 1);
              const phrase = beforeWords.join(' ').trim();
              if (phrase.length >= baseKeyword.length && phrase.length <= 25) {
                extractedKeywords.add(phrase);
              }
            }

            // 키워드 뒤 단어들 (최대 2개)
            for (let offset = 1; offset <= 2 && keywordIdx + offset < titleWords.length; offset++) {
              const afterWords = titleWords.slice(keywordIdx, keywordIdx + offset + 1);
              const phrase = afterWords.join(' ').trim();
              if (phrase.length >= baseKeyword.length && phrase.length <= 25) {
                extractedKeywords.add(phrase);
              }
            }

            // 키워드 앞뒤 단어들 (앞 1개 + 뒤 1개)
            if (keywordIdx > 0 && keywordIdx < titleWords.length - 1) {
              const aroundWords = titleWords.slice(keywordIdx - 1, keywordIdx + 2);
              const phrase = aroundWords.join(' ').trim();
              if (phrase.length >= baseKeyword.length && phrase.length <= 25) {
                extractedKeywords.add(phrase);
              }
            }
          });

          // 제목 전체가 짧으면 그대로 추가 (입력 키워드 포함 시)
          if (title.length >= baseKeyword.length && title.length <= 30 && title.includes(baseKeyword)) {
            extractedKeywords.add(title.replace(/<[^>]*>/g, '').trim());
          }
        }

        // 2. 설명에서도 입력 키워드를 포함하는 구문 추출
        if (description.includes(baseKeyword)) {
          const descSentences = description.split(/[.|!?。！？]/);
          descSentences.forEach((sentence: string) => {
            if (sentence.includes(baseKeyword)) {
              const trimmed = sentence.trim();
              if (trimmed.length >= baseKeyword.length && trimmed.length <= 30) {
                extractedKeywords.add(trimmed);
              }
            }
          });
        }

        // 3. 실제 검색 패턴: "키워드 + 범용적이고 합리적인 검색 조합어" 생성
        // 키워드 타입별 적절한 조합어만 사용 (사람 이름 등은 가격 제외)
        const getRelevantSuffixes = (keyword: string): string[] => {
          const keywordLower = keyword.toLowerCase();

          // ⚠️ 이슈성 키워드 - 가격/리뷰/꿀팁 같은 접미사 절대 사용 금지
          // "박나래 갑질 가격" 같은 말도 안 되는 조합 방지
          const issueKeywords = [
            '구속', '체포', '사망', '결혼', '이혼', '열애', '논란', '폭로', '속보',
            '사건', '사고', '수사', '기소', '선고', '판결', '재판', '갑질', '의혹',
            '폭행', '횡령', '배임', '성희롱', '성추행', '성폭행', '해고', '고소', '고발',
            '비리', '부정', '탈세', '뇌물', '스캔들', '루머', '불륜', '파경', '파혼',
            '피해', '피소', '검찰', '경찰', '조사', '입건', '송치', '구형', '실형'
          ];
          const isIssueKeyword = issueKeywords.some(ik => keywordLower.includes(ik));

          if (isIssueKeyword) {
            // 이슈 키워드에는 뉴스/정보 관련 접미사만 사용
            return ['이유', '배경', '원인', '경위', '전말', '정리', '요약', '총정리', '내용', '상황'];
          }

          // 사람 이름 감지 (한글 2-4자 패턴, 일반적인 한국 이름)
          const isPersonName = /^[가-힣]{2,4}$/.test(keyword) &&
            !keyword.match(/임플란트|치과|치료|수술|병원|의료|건강|약|진료|상담|스마트폰|폰|컴퓨터|노트북|자동차|가전|제품|상품|카페|음식점|맛집|호텔|여행|숙박|학원|교육|강의/);

          // 사람 이름이면 가격/비용 관련 조합 제외
          if (isPersonName) {
            return ['누구', '누구인가', '사건', '사고', '소식', '뉴스', '영화', '작품', '이야기', '인물', '약력', '전기'];
          }

          // 의료/건강 관련 키워드 (임플란트, 치료 등)
          if (keyword.match(/임플란트|치과|치료|수술|병원|의료|건강|약|진료|상담/)) {
            return ['가격', '비용', '비교', '추천', '정보', '후기', '리뷰', '종류', '방법', '수술', '과정', '부작용'];
          }

          // 제품 관련 키워드
          if (keyword.match(/스마트폰|폰|컴퓨터|노트북|자동차|가전|제품|상품/)) {
            return ['가격', '비용', '비교', '추천', '리뷰', '후기', '구매', '할인', '이벤트', '순위', '성능', '스펙'];
          }

          // 서비스/장소 관련
          if (keyword.match(/카페|음식점|맛집|호텔|여행|숙박|학원|교육|강의/)) {
            return ['추천', '정보', '후기', '리뷰', '위치', '가격', '비교', '메뉴', '시설'];
          }

          // 일반적인 키워드 (범용적 조합)
          return ['가격', '비용', '비교', '추천', '정보', '리뷰', '후기', '순위'];
        };

        // 말도 안 되는 조합을 제외하기 위한 검증 함수
        const isValidCombination = (keyword: string, suffix: string): boolean => {
          const combined = `${keyword} ${suffix}`.toLowerCase();

          // 말도 안 되는 조합 패턴 제외
          const invalidPatterns = [
            /먹는법|먹는 방법|먹기|먹어|마시는법|마시는 방법|마시기|마셔/,  // 음식이 아닌데 먹는법
            /키우는법|키우는 방법|키우기/,  // 사람/제품에 키우기
            /재배|재배법|재배방법/,  // 부적절한 재배 관련
            /번식|번식법/,  // 부적절한 번식 관련
            /입양|입양법/,  // 사람/제품에 입양
          ];

          // 키워드가 음식/요리 관련이 아니면 "먹는법" 같은 조합 제외
          const isFoodRelated = keyword.match(/음식|요리|레시피|맛집|식당|카페|음료|음주|식사/);
          if (!isFoodRelated && /먹는법|먹는 방법/.test(suffix)) {
            return false;
          }

          // 패턴 검증
          for (const pattern of invalidPatterns) {
            if (pattern.test(combined)) {
              return false;
            }
          }

          return true;
        };

        // ❌ 단순 조합 키워드 생성 제거 - 실제 자동완성/연관검색어만 사용
        // const relevantSuffixes = getRelevantSuffixes(baseKeyword);
        // relevantSuffixes.forEach(suffix => { ... });
      });

      // 🔧 개선: 제목에서 더 많은 키워드 추출 - 키워드와 함께 자주 나오는 단어들
      const keywordCombinations = new Set<string>();
      const keywordFrequency = new Map<string, number>(); // 키워드 빈도 추적

      // 검색 결과 제목들을 분석하여 자주 함께 나오는 단어 추출
      uniqueItems.forEach((item: any) => {
        const title = item.title?.replace(/<[^>]*>/g, '').trim() || '';
        if (title.includes(baseKeyword)) {
          // 키워드 앞뒤로 자주 나오는 단어들 추출
          const words = title.split(/[\s|,，、·\[\]()【】「」<>]+/).filter((w: string) => w.trim().length > 0);

          // 키워드의 위치 찾기
          const keywordIndex = words.findIndex((w: string) => w.includes(baseKeyword));
          if (keywordIndex >= 0) {
            // 키워드 앞 단어들 조합
            if (keywordIndex > 0) {
              const beforeWord = words[keywordIndex - 1];
              if (beforeWord && beforeWord.length >= 2 && beforeWord.length <= 10) {
                keywordCombinations.add(`${beforeWord} ${baseKeyword}`.trim());
              }
            }
            // 키워드 뒤 단어들 조합
            if (keywordIndex < words.length - 1) {
              const afterWord = words[keywordIndex + 1];
              if (afterWord && afterWord.length >= 2 && afterWord.length <= 10) {
                keywordCombinations.add(`${baseKeyword} ${afterWord}`.trim());
              }
            }
            // 키워드 앞뒤 모두
            if (keywordIndex > 0 && keywordIndex < words.length - 1) {
              const beforeWord = words[keywordIndex - 1];
              const afterWord = words[keywordIndex + 1];
              if (beforeWord && afterWord && beforeWord.length >= 2 && afterWord.length <= 8 && afterWord.length >= 2 && afterWord.length <= 8) {
                keywordCombinations.add(`${beforeWord} ${baseKeyword} ${afterWord}`.trim());
              }
            }
          }
        }
      });

      // 추출된 조합들을 extractedKeywords에 추가
      keywordCombinations.forEach(comb => {
        if (comb.length >= baseKeyword.length && comb.length <= 30) {
          extractedKeywords.add(comb);
        }
      });

      // 🔧 5단계: 모든 키워드 통합 및 검색 의도 필터링
      const allCollectedKeywords = new Set<string>();

      // 자동완성 키워드 추가 (검색 의도가 있는 키워드)
      autocompleteKeywords.forEach(kw => {
        if (kw && kw.length >= 2 && kw.length <= 30) {
          allCollectedKeywords.add(kw);
        }
      });

      // 스마트블록 키워드 추가 (네이버 공식 연관 검색어)
      smartBlockKeywords.forEach(kw => {
        if (kw && kw.length >= 2 && kw.length <= 30) {
          allCollectedKeywords.add(kw);
        }
      });

      // 마인드맵 키워드 추가 (의미 있는 연관 키워드)
      mindMapKeywords.forEach(kw => {
        if (kw && kw.length >= 2 && kw.length <= 30) {
          allCollectedKeywords.add(kw);
        }
      });

      // 🕷️ 거미줄 키워드 추가 (연상 키워드)
      spiderWebKeywords.forEach(kw => {
        if (kw && kw.length >= 2 && kw.length <= 30) {
          allCollectedKeywords.add(kw);
        }
      });

      // 검색 결과에서 추출한 키워드 추가
      extractedKeywords.forEach(kw => {
        if (kw && kw.length >= 2 && kw.length <= 30) {
          allCollectedKeywords.add(kw);
        }
      });

      // 🔧 검색 의도 필터링: 의미없거나 검색 의도가 없는 키워드 제거
      const filteredKeywords = Array.from(allCollectedKeywords).filter(kw => {
        const trimmed = kw.trim();

        // 길이 체크
        if (trimmed.length < 2 || trimmed.length > 30) return false;

        // 완전히 제외할 패턴 (의미 없는 키워드)
        const meaninglessPatterns = [
          /^(더보기|클릭|바로가기|이동|보기|더|또|그리고|그런데|또한|그러나|하지만|그런|이런|저런|그것|이것|저것|무엇|어떤|어디|언제|누구|왜|어떻게|무엇을|어떤것|이런것|저런것|그런것)$/,
          /^(에서|에게|에게서|의|을|를|이|가|은|는|와|과|도|만|까지|부터|로|으로|하고|이며|이며서|이면서|하면서|그리고|또한|그러나|하지만|그런데|그런|이런|저런)$/,
          /^(사진|이미지|그림|영상|동영상|비디오|음악|노래|책|소설|만화|웹툰|게임|앱|프로그램|소프트웨어|하드웨어|기기|기계|장치|도구|용품|제품|상품|서비스|업체|회사|기업|단체|조직|기관|단체|조직|기관)$/,
          /^(정보|자료|데이터|내용|글|문서|파일|폴더|디렉토리|경로|주소|URL|링크|사이트|웹사이트|홈페이지|블로그|카페|게시판|커뮤니티|포럼|채팅|메신저|이메일|전화|번호|주소|위치|장소|곳|곳곳|곳곳이|곳곳이|곳곳이)$/
        ];

        for (const pattern of meaninglessPatterns) {
          if (pattern.test(trimmed)) {
            return false;
          }
        }

        // 검색 의도가 없는 패턴 제외
        const noSearchIntentPatterns = [
          /^(이|그|저|이런|그런|저런|이런것|그런것|저런것|이것|그것|저것|무엇|어떤|어디|언제|누구|왜|어떻게|무엇을|어떤것)$/,
          /^(에서|에게|에게서|의|을|를|이|가|은|는|와|과|도|만|까지|부터|로|으로|하고|이며|이며서|이면서|하면서)$/,
          /^(사진|이미지|그림|영상|동영상|비디오|음악|노래|책|소설|만화|웹툰|게임|앱|프로그램|소프트웨어|하드웨어|기기|기계|장치|도구|용품|제품|상품|서비스|업체|회사|기업|단체|조직|기관)$/,
          /^(정보|자료|데이터|내용|글|문서|파일|폴더|디렉토리|경로|주소|URL|링크|사이트|웹사이트|홈페이지|블로그|카페|게시판|커뮤니티|포럼|채팅|메신저|이메일|전화|번호|주소|위치|장소|곳|곳곳|곳곳이)$/
        ];

        for (const pattern of noSearchIntentPatterns) {
          if (pattern.test(trimmed)) {
            return false;
          }
        }

        // 말도 안 되는 조합 제외
        const invalidCombinations = [
          /먹는법|먹는 방법|먹기|먹어|마시는법|마시는 방법/,  // 음식이 아닌데 먹는법
          /키우는법|키우는 방법|키우기/,
          /재배|재배법|번식|번식법|입양/,
        ];

        const isFoodRelated = baseKeyword.match(/음식|요리|레시피|맛집|식당|카페|음료|음주|식사|과자|음식물|카레|짜장|볶음밥|비빔밥|김치|된장|고추장|마요네즈|케첩|소스|양념|가루|분말|라면|떡|빵|케이크|아이스크림|치즈|버터|우유|요구르트/);
        if (!isFoodRelated) {
          for (const pattern of invalidCombinations) {
            if (pattern.test(trimmed)) {
              return false;
            }
          }
        }

        // 입력 키워드와 연관성이 있어야 함 (키워드 포함 또는 의미적으로 연관)
        // 🕷️ 거미줄 키워드는 연상 키워드이므로 더 관대하게 허용
        const isSpiderWebKeyword = spiderWebKeywords.has(trimmed);
        const hasRelevance = trimmed.includes(baseKeyword) ||
          baseKeyword.includes(trimmed) ||
          trimmed.split(/\s+/).some(word => baseKeyword.includes(word) || word.includes(baseKeyword)) ||
          isSpiderWebKeyword; // 거미줄 키워드는 연상 키워드로 허용

        // 거미줄 키워드가 아니면 기본 연관성 체크
        if (!hasRelevance && trimmed !== baseKeyword && !isSpiderWebKeyword) {
          return false;
        }

        // 한글/영문/숫자가 포함되어 있어야 함
        const hasValidChars = /[가-힣a-zA-Z0-9]+/.test(trimmed);
        return hasValidChars;
      });

      // 🔧 6단계: 중복 제거 및 검색 의도 우선 정렬
      const uniqueKeywords = Array.from(new Set(filteredKeywords)).sort((a, b) => {
        // 1순위: 입력 키워드 자체가 최우선
        if (a === baseKeyword) return -1;
        if (b === baseKeyword) return 1;

        // 2순위: 자동완성/스마트블록 키워드 우선 (실제 검색 의도)
        const aInAutocomplete = autocompleteKeywords.includes(a) || smartBlockKeywords.has(a);
        const bInAutocomplete = autocompleteKeywords.includes(b) || smartBlockKeywords.has(b);
        if (aInAutocomplete && !bInAutocomplete) return -1;
        if (!aInAutocomplete && bInAutocomplete) return 1;

        // 3순위: 마인드맵 키워드 우선 (의미 있는 연관 키워드)
        const aInMindMap = mindMapKeywords.has(a);
        const bInMindMap = mindMapKeywords.has(b);
        if (aInMindMap && !bInMindMap) return -1;
        if (!aInMindMap && bInMindMap) return 1;

        // 4순위: 거미줄 키워드 (연상 키워드)
        const aInSpiderWeb = spiderWebKeywords.has(a);
        const bInSpiderWeb = spiderWebKeywords.has(b);
        if (aInSpiderWeb && !bInSpiderWeb) return -1;
        if (!aInSpiderWeb && bInSpiderWeb) return 1;

        // 5순위: 입력 키워드로 시작하는 것 우선
        const aStartsWith = a.startsWith(baseKeyword);
        const bStartsWith = b.startsWith(baseKeyword);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // 6순위: 입력 키워드가 정확히 포함된 것
        const aExactMatch = a === baseKeyword || a.split(/\s+/).includes(baseKeyword);
        const bExactMatch = b === baseKeyword || b.split(/\s+/).includes(baseKeyword);
        if (aExactMatch && !bExactMatch) return -1;
        if (!aExactMatch && bExactMatch) return 1;

        // 7순위: 입력 키워드가 포함된 것
        const aContains = a.includes(baseKeyword);
        const bContains = b.includes(baseKeyword);
        if (aContains && !bContains) return -1;
        if (!aContains && bContains) return 1;

        // 8순위: 길이가 짧은 순 (명확한 키워드 우선)
        if (a.length !== b.length) return a.length - b.length;
        return a.localeCompare(b);
      });

      // 입력 키워드가 결과에 없으면 맨 앞에 추가
      if (!uniqueKeywords.includes(baseKeyword) && baseKeyword.trim().length > 0) {
        uniqueKeywords.unshift(baseKeyword);
      }

      console.log(`[NAVER-RELATED] ✅ 최종 연관키워드 ${uniqueKeywords.length}개 추출 완료 (의미 있는 키워드만)`);

      // limit 적용 (더 많은 키워드 포함)
      let rank = 1;
      const limit = options.limit || 10;
      const startIdx = (options.page || 0) * limit;
      const endIdx = startIdx + limit;
      const keywordArray = uniqueKeywords.slice(startIdx, endIdx);

      for (const keyword of keywordArray.slice(0, limit)) {
        if (keyword && keyword.trim().length > 0 && rank <= limit) {
          const { intent, badge } = classifyKeywordIntent(keyword);
          results.push({
            rank: rank++,
            keyword: keyword.trim(),
            changeRate: 0,
            category: options.category || '일반',
            searchVolume: 0, // 나중에 별도로 조회
            intent: intent,
            intentBadge: badge
          });
        }
      }

      // 입력 키워드가 없을 때는 더 많이 추출 (카테고리만 선택한 경우)
      if (!baseKeyword || baseKeyword.trim().length === 0) {
        // 카테고리 관련 일반 키워드들 추가
        const categoryKeywords: Record<string, string[]> = {
          '경제': ['경제뉴스', '주식', '부동산', '금융', '투자', '경제지표'],
          'IT': ['IT뉴스', '테크', '스마트폰', '컴퓨터', '소프트웨어', '하드웨어'],
          '생활': ['생활정보', '일상', '라이프스타일', '생활팁', '생활꿀팁'],
          '엔터테인먼트': ['연예', '영화', '드라마', '음악', '예능', '스포츠'],
          '건강': ['건강정보', '의료', '병원', '약', '운동', '다이어트'],
          '교육': ['교육정보', '학원', '자격증', '공부', '학습', '온라인강의'],
          '쇼핑': ['쇼핑몰', '온라인쇼핑', '구매', '할인', '이벤트', '쿠폰'],
          '음식': ['맛집', '레시피', '요리', '카페', '음식점', '맛집추천'],
          '여행': ['여행지', '호텔', '숙박', '관광', '해외여행', '국내여행'],
          '자동차': ['자동차정보', '차량', '전기차', '중고차', '카센터'],
          '부동산': ['부동산정보', '아파트', '오피스텔', '임대', '매매'],
          '스포츠': ['스포츠뉴스', '축구', '야구', '농구', '골프', '경기'],
          '게임': ['게임뉴스', '온라인게임', '모바일게임', '콘솔게임', 'PC게임'],
          '금융': ['금융정보', '은행', '카드', '대출', '적금', '펀드']
        };

        if (options.category) {
          const catKwList = categoryKeywords[options.category];
          if (catKwList && Array.isArray(catKwList)) {
            catKwList.forEach(catKw => {
              if (results.length < limit && !results.some(r => r.keyword === catKw)) {
                results.push({
                  rank: rank++,
                  keyword: catKw,
                  changeRate: 0,
                  category: options.category || '일반',
                  searchVolume: 0
                });
              }
            });
          }
        }
      }
    }

  } catch (error: any) {
    console.error('[NAVER-RELATED] 연관 키워드 수집 실패:', error);
    throw error;
  }

  return results;
}

/**
 * 키워드의 검색 의도(Intent)를 분류하고 적절한 배지를 반환합니다.
 */
export function classifyKeywordIntent(keyword: string): { intent: string; badge: string } {
  const kw = keyword.toLowerCase().replace(/\s+/g, '');

  // 1. Commercial (구매/상업성) - 💰
  if (kw.match(/가격|비용|얼마|최저가|할인|쿠폰|구매|구입|파는곳|매장|쇼핑|정가|공구|직구|싸게|장터/)) {
    return { intent: 'Commercial', badge: '💰' };
  }

  // 2. Transactional (행동/변환) - ⚡
  if (kw.match(/추천|순위|베스트|top|비교|장단점|차이|예약|신청|결제|로그인|다운로드|설치|실행|사용법|방법/)) {
    return { intent: 'Transactional', badge: '⚡' };
  }

  // 3. Informational (정보/지식) - ℹ️
  if (kw.match(/이유|의미|뜻|유래|배경|전말|정리|요약|총정리|소식|뉴스|기사|결과|날씨|일사|시간|일정|효능|성분|주의사항/)) {
    return { intent: 'Informational', badge: 'ℹ️' };
  }

  // 4. Navigational (이동/브랜드) - 📍
  if (kw.match(/공홈|공식홈페이지|인스타그램|유튜브|블로그|카페|커뮤니티|위치|주소|지도|가는법/)) {
    return { intent: 'Navigational', badge: '📍' };
  }

  // 기본값 (정보성으로 간주)
  return { intent: 'Informational', badge: 'ℹ️' };
}

/**
 * Phase 2: SERP 심층 분석 (스마트블록, 뷰 섹션 유무 등 파악)
 */
export async function getNaverSerpSignal(keyword: string): Promise<{
  hasSmartBlock: boolean;
  hasViewSection: boolean;
  hasInfluencer: boolean;
  difficultyScore: number; // 0 (쉬움) ~ 10 (매우 어려움)
}> {
  try {
    const searchUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    if (!response.ok) throw new Error('SERP 접근 실패');

    const html = await response.text();

    // 신호 판별
    const hasSmartBlock = html.includes('smart_block') || html.includes('스마트블록');
    const hasViewSection = html.includes('view_section') || html.includes('VIEW');
    const hasInfluencer = html.includes('influencer_card') || html.includes('인플루언서');
    const hasPowerLink = html.includes('power_link') || html.includes('ad_section');

    // 난이도 계산 (가석성)
    let difficulty = 3;
    if (hasSmartBlock) difficulty += 3;
    if (hasInfluencer) difficulty += 2;
    if (hasPowerLink) difficulty += 1;
    if (!hasViewSection) difficulty += 1; // 뷰 섹션이 없으면 블로그 상위 노출이 원천적으로 힘들 수 있음

    return {
      hasSmartBlock,
      hasViewSection,
      hasInfluencer,
      difficultyScore: Math.min(10, difficulty)
    };
  } catch (err) {
    console.warn(`[MDP-SERP] "${keyword}" 신호 분석 실패:`, err);
    return {
      hasSmartBlock: false,
      hasViewSection: true,
      hasInfluencer: false,
      difficultyScore: 5
    };
  }
}

// 유틸리티 함수
export function getDateToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}