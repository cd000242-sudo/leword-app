/**
 * 네이버 검색광고 키워드 도구 API
 * 정확한 PC/모바일 검색량 조회
 */

import { createHash, createHmac } from 'crypto';
import {
  searchAdAccountId,
  searchAdExhausted,
  searchAdRemaining,
  searchAdSoftCeiling,
  reserveSearchAdCall,
} from './searchad-quota-governor';
import {
  buildSearchAdAccountPool,
  selectSearchAdAccount,
} from './searchad-account-pool';
import { getSearchAdVolumeCached, setSearchAdVolumeCached } from './searchad-volume-cache';
import {
  alignSearchAdRowsByKeyword,
  SEARCHAD_KEYWORD_BINDING_VERSION,
  type SearchAdKeywordBindingVersion,
} from './searchad-result-alignment';

let lastSearchAdRequestAt = 0;
// 429 발생 시 적응형으로 상향(상한 4s), 성공 시 완만히 회복(하한 900ms) — rate-limit 자동 완화
let searchAdAdaptiveIntervalMs = 900;

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
  monthlyAveCpc?: number | null;
  pcSearchVolumeLt10?: boolean;
  mobileSearchVolumeLt10?: boolean;
  /**
   * v2.49.18: 휴리스틱 fallback (공통 토큰 매칭) 으로 다른 키워드의 sv 를 빌려온 경우 true.
   * 다운스트림 sanity-gate 의 SV_ESTIMATED 게이트가 SSS 자동 차단.
   * memory 규칙: "추정값 fallback 가드 — *Estimated 다운스트림 전파 필수".
   */
  svEstimated?: boolean;
  /**
   * Phase 2: 이 값이 측정된 시각(epoch ms). 캐시에서 서빙된 경우 과거 시각, 방금 API로 측정하면 now.
   * "N일 전 측정" 신선도 라벨용. 값 자체는 항상 실측 절대값(추정 아님).
   */
  measuredAtMs?: number;
  searchVolumeBindingVersion?: SearchAdKeywordBindingVersion;
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
 * 검색량 숫자 파싱. 문자열 "< 10"은 exact 0이 아니므로 null로 두고
 * 호출자가 per-device range flag로 별도 보존한다.
 */
const parseVolumeValue = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;

  const strValue = String(value).trim();
  const normalized = strValue.toLowerCase();

  // "< 10"은 bounded range이며 exact numeric zero와 구분해야 한다.
  if (/^<\s*10$/.test(normalized) || /^less\s+than\s+10$/.test(normalized)) {
    return null;
  }

  // 일반 숫자 파싱: 숫자/쉼표/소수점 외 문자가 섞인 값은 신뢰하지 않는다.
  const cleaned = strValue.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const isLessThanTenVolume = (value: number | string | null | undefined): boolean => {
  if (value === null || value === undefined || typeof value === 'number') return false;
  const strValue = String(value).trim().toLowerCase();
  return /^<\s*10$/.test(strValue) || /^less\s+than\s+10$/.test(strValue);
};

export type SearchAdVolumeLike = {
  monthlyPcQcCnt?: unknown;
  monthlyMobileQcCnt?: unknown;
  pcSearchVolume?: unknown;
  mobileSearchVolume?: unknown;
  pcSearchVolumeLt10?: unknown;
  mobileSearchVolumeLt10?: unknown;
  svEstimated?: unknown;
  isSearchVolumeEstimated?: unknown;
};

/**
 * Returns a total only when both device counts are exact. A SearchAd `<10`
 * token/flag, an estimated marker, or either missing device fails closed.
 */
export function exactSearchAdTotal(row: SearchAdVolumeLike | null | undefined): number | null {
  if (!row) return null;
  const pcRaw = row.monthlyPcQcCnt !== undefined
    ? row.monthlyPcQcCnt
    : row.pcSearchVolume;
  const mobileRaw = row.monthlyMobileQcCnt !== undefined
    ? row.monthlyMobileQcCnt
    : row.mobileSearchVolume;
  if (
    row.pcSearchVolumeLt10 === true
    || row.mobileSearchVolumeLt10 === true
    || row.svEstimated === true
    || row.isSearchVolumeEstimated === true
    || isLessThanTenVolume(pcRaw as any)
    || isLessThanTenVolume(mobileRaw as any)
  ) {
    return null;
  }
  const pc = parseVolumeValue(pcRaw as any);
  const mobile = parseVolumeValue(mobileRaw as any);
  return pc !== null && mobile !== null ? pc + mobile : null;
}

/**
 * API 요청을 위한 키워드 전처리
 */
const buildUntruncatedProcessedKeyword = (cleanKeyword: string): string => {
  // 🔥 중요: Naver SearchAd는 공백을 포함한 키워드를 합성어로 처리.
  // 공백을 +로 대체하면 "곰팡이+제거" 형태가 되어 검색량 0 반환됨.
  // 공백을 제거해 단일 토큰으로 전송 → 연관 키워드 목록이 정상 반환됨.
  let processedKeyword = cleanKeyword
    .replace(/['"]/g, '')
    .replace(/[&<>]/g, '')
    .replace(/[^\w\s가-힣]/g, '')
    .trim()
    .replace(/\s+/g, '');

  if (!processedKeyword || processedKeyword.length === 0) {
    processedKeyword = cleanKeyword.trim();
  }
  return processedKeyword;
};

const buildProcessedKeyword = (cleanKeyword: string): string => (
  buildUntruncatedProcessedKeyword(cleanKeyword).substring(0, 15).trim()
);

function preservesExactSearchAdHint(cleanKeyword: string): boolean {
  const requested = cleanKeyword.toLowerCase().replace(/[\s+]+/g, '');
  const processed = buildUntruncatedProcessedKeyword(cleanKeyword).toLowerCase();
  return Boolean(processed) && processed.length <= 15 && processed === requested;
}

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

function resolveSearchAdCustomerId(config: NaverSearchAdConfig): string {
  const explicit = String(config.customerId || '').trim();
  if (explicit) return explicit;
  const parts = config.accessLicense.split(':');
  if (parts.length > 1 && String(parts[0] || '').trim()) return String(parts[0]).trim();
  return config.accessLicense.substring(0, Math.min(10, config.accessLicense.length));
}

/**
 * 여러 키워드의 검색량을 한꺼번에 또는 순차적으로 조회
 */
/**
 * 여러 키워드의 검색량을 한꺼번에 조회 (5개씩 배치 처리로 최적화)
 */
export async function getNaverSearchAdKeywordVolume(
  config: NaverSearchAdConfig,
  keywords: string[],
  options: { recursive?: boolean; forceFresh?: boolean } = {}
): Promise<KeywordSearchVolume[]> {
  if (!config.accessLicense || !config.secretKey) {
    throw new Error('네이버 검색광고 API 인증 정보가 필요합니다');
  }

  // Phase 1C: 계정별 일일 쿼터를 보존하면서 가용 계정 풀에서 배치별로 선택한다.
  const accountPool = buildSearchAdAccountPool(config);

  const results: KeywordSearchVolume[] = [];
  const cleanKeywords = (keywords || []).map(k => String(k || '').trim()).filter(Boolean);

  // 🗄️ Phase 2 (read-before-measure): 신선(<30일)한 캐시 볼륨은 API 없이 서빙, 미스만 측정.
  //   네이버 월검색량은 월단위 집계 → 캐시값도 실측 절대값(UI 추정금지 규칙 준수). measuredAtMs 로 신선도 표기.
  //   세 경로(황금보드/PRO헌터/분석기)가 모두 이 캐시를 공유 → sv 100% 동일 유지.
  const toMeasure: string[] = [];
  for (const kw of cleanKeywords) {
    if (!options.forceFresh) {
      const cached = getSearchAdVolumeCached(kw);
      if (cached && typeof cached.total === 'number' && cached.total > 0) {
        results.push({
          keyword: kw,
          pcSearchVolume: cached.pc,
          mobileSearchVolume: cached.mo,
          totalSearchVolume: cached.total,
          competition: cached.comp,
          monthlyPcQcCnt: cached.pc,
          monthlyMobileQcCnt: cached.mo,
          monthlyAveCpc: cached.cpc ?? null,
          pcSearchVolumeLt10: false,
          mobileSearchVolumeLt10: false,
          svEstimated: false,
          measuredAtMs: cached.at,
        });
        continue;
      }
    }
    if (!preservesExactSearchAdHint(kw)) {
      results.push({ keyword: kw, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: null });
      continue;
    }
    toMeasure.push(kw);
  }

  // v2.49.21: 🚨 chunkSize 10 → 5 (CRITICAL FIX).
  //   실측 (scripts/verify-v2.49.20-chunksize.ts): chunkSize 7+ 에서 keywordList=0 (API 응답 폭망).
  //   chunkSize 5: keywordList 22개 + 정확 매칭 100% / chunkSize 10: 0% 매칭 → 모든 sv=null
  //   이게 사용자 보고 "SSS 결과 50+→2~3건" 의 진짜 원인. v2.27.4~v2.49.20 의 hotfix 들이
  //   다 이 깊은 버그를 못 보고 표면만 만짐.
  //   v2.49.18 휴리스틱 fallback 은 그대로 유지 (svEstimated 마킹). 정확 매칭 100% 보장 후
  //   사용자에게 결과 50~300건 복원 + 추정 칩으로 신뢰도 보장.
  const chunkSize = 4;
  for (let i = 0; i < toMeasure.length; i += chunkSize) {
    // 🛡️ Phase 1: 일일 쿼터 소프트 상한 도달 → 남은 키워드 전부 null(측정 스킵) 후 종료 (계정 25k 절대 안 넘김)
    const activeConfig = selectSearchAdAccount(accountPool);
    if (!activeConfig) {
      console.warn(`[NAVER-SEARCHAD] 🛡️ 일일 쿼터 소프트 상한(${searchAdSoftCeiling()}) 도달 — 잔여 ${toMeasure.length - i}개 미측정(null) 처리`);
      for (let j = i; j < toMeasure.length; j++) {
        results.push({ keyword: toMeasure[j], pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: null });
      }
      break;
    }
    const accountId = searchAdAccountId(activeConfig);
    const customerId = resolveSearchAdCustomerId(activeConfig);
    const chunk = toMeasure.slice(i, i + chunkSize);
    const hintKeywordsValue = chunk.map(k => buildProcessedKeyword(k)).join(',');

    try {
      const apiUrl = 'https://api.searchad.naver.com/keywordstool';
      const uri = '/keywordstool';
      const method = 'GET';
      const timestamp = String(Date.now());

      const params = new URLSearchParams();
      params.append('hintKeywords', hintKeywordsValue);
      params.append('showDetail', '1');

      const signature = generateSignature(method, uri, timestamp, activeConfig.secretKey);
      const headers: Record<string, string> = {
        'X-Timestamp': timestamp,
        'X-API-KEY': activeConfig.accessLicense,
        'X-Signature': signature,
        'X-Customer': customerId
      };

      // Rate Limit: 적응형 간격 준수 + 429/5xx 지수 백오프 재시도.
      //   429 시 청크를 통째 null 처리하면 측정 풀이 안 큰다 → 재시도로 회복.
      let response: Response | null = null;
      // Phase 1: 재시도 4→2 (×4 증폭 제거). 소프트상한 pre-check가 daily-429 자체를 예방하므로
      //   여기 도달하는 429는 대개 QPS 제한 → 짧은 백오프 재시도. 단 상한 도달 시엔 즉시 중단.
      const maxAttempts = 2;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const now = Date.now();
        lastSearchAdRequestAt = Math.max(now, lastSearchAdRequestAt + searchAdAdaptiveIntervalMs);
        const waitMs = lastSearchAdRequestAt - now;
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 타임아웃 20초
        if (!reserveSearchAdCall(accountId, 1)) {
          clearTimeout(timeoutId);
          break;
        }
        try {
          response = await fetch(`${apiUrl}?${params.toString()}`, { method, headers, signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }

        if (response.ok) {
          searchAdAdaptiveIntervalMs = Math.max(900, searchAdAdaptiveIntervalMs - 150); // 성공 시 완만히 회복
          break;
        }
        if (response.status === 429 || response.status >= 500) {
          searchAdAdaptiveIntervalMs = Math.min(4000, searchAdAdaptiveIntervalMs + 600); // 적응형 throttle 상향
          // 이미 소프트상한 도달이면 daily-quota 429로 간주 → 재시도는 쿼터만 태움 → 즉시 중단
          if (searchAdRemaining(accountId) <= 0) {
            console.warn(`[NAVER-SEARCHAD] 🛡️ 429 + 소프트상한 도달 → daily-quota 판단, 재시도 중단`);
            break;
          }
          const backoffMs = 1500 * Math.pow(2, attempt); // 1.5s → 3s (QPS 제한 회복)
          console.warn(`[NAVER-SEARCHAD] ${response.status} rate-limit, 재시도 ${attempt + 1}/${maxAttempts} (${backoffMs}ms 대기, 간격 ${searchAdAdaptiveIntervalMs}ms)`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        break; // 429/5xx 외 4xx — 재시도 무의미
      }

      if (!response || !response.ok) {
        console.warn(`[NAVER-SEARCHAD] 배치 요청 실패 (${response?.status ?? 'no-response'}): ${chunk.join(',')}`);
        // 재시도 소진 후에도 실패 — 해당 청크 null 처리
        chunk.forEach(k => results.push({ keyword: k, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: null }));
        continue;
      }

      const data = await response.json();
      const keywordList = data.keywordList || data.relKeywordList || (data.result && (data.result.keywordList || data.result.relKeywordList)) || [];

      // 결과 매핑: 요청한 키워드를 찾아 결과에 넣기
      // 정규화: 공백 + `+` 모두 제거 (Naver SearchAd가 "곰팡이 제거" → "곰팡이+제거"로 응답)
      const normalize = (s: string) => s.toLowerCase().replace(/[\s+]+/g, '');

      for (const requestedKw of chunk) {
        const normalizedRequest = normalize(requestedKw);

        // 1차: 정확히 일치하는 항목 찾기
        let match = keywordList.find((item: any) => {
          const rel = normalize(decodeHtmlEntities(item.relKeyword || ''));
          return rel === normalizedRequest;
        });

        // 정확 일치만 허용한다. 포함 매칭은 긴 키워드가 15자 hintKeyword로 잘릴 때
        // 더 짧은 연관어 검색량을 빌려오는 원인이 되어 황금보드/분석기 값이 달라진다.

        // v2.42.82: "단일 청크 fallback" 제거 — 첫 번째 결과를 가져오면 무관한
        // 키워드의 검색량을 사용자 키워드 값으로 잘못 표시함 (사용자 제보: 같은 키워드가
        // 마인드맵에서는 0, 키워드 조회에서는 970 — 후자가 fallback으로 가짜값을 가져왔던 것)
        // 정확/포함 매칭 실패 시 null 반환이 정직.

        if (match) {
          const pcRaw = match.monthlyPcQcCnt;
          const moRaw = match.monthlyMobileQcCnt;
          const pcSearchVolumeLt10 = isLessThanTenVolume(pcRaw);
          const mobileSearchVolumeLt10 = isLessThanTenVolume(moRaw);
          const hasLessThanTenRange = pcSearchVolumeLt10 || mobileSearchVolumeLt10;
          const pc = parseVolumeValue(pcRaw);
          const mo = parseVolumeValue(moRaw);
          const total = !hasLessThanTenRange && pc !== null && mo !== null
            ? pc + mo
            : null;
          const aveCpc = parseVolumeValue(match.monthlyAveCpc);
          const competition = match.compIdx || match.competition;

          // v2.49.22: 휴리스틱 fallback 완전 제거 (사용자 절대 요구: 모든 path 동일 sv).
          //   "황금키워드/PRO트래픽헌터/키워드분석기 - 하나라도 다르면 안 됨"
          //   세 path 모두 본 함수 getNaverSearchAdKeywordVolume 거침 → 휴리스틱 제거하면 100% 일치.
          //   휴리스틱이 다른 키워드 sv 빌려옴 = 본질적 mismatch 원인. 정확/포함 매칭 결과만 정직 반환.

          const measuredAtMs = Date.now();
          results.push({
            keyword: requestedKw,
            pcSearchVolume: pc,
            mobileSearchVolume: mo,
            totalSearchVolume: total,
            competition,
            monthlyPcQcCnt: pc,
            monthlyMobileQcCnt: mo,
            monthlyAveCpc: aveCpc,
            pcSearchVolumeLt10,
            mobileSearchVolumeLt10,
            svEstimated: hasLessThanTenRange,
            measuredAtMs,
          });
          // 🗄️ Phase 2: 실측 양수 볼륨을 캐시에 기록 → 다음 실행부터 재측정 스킵 (하루 24회 재측정 제거)
          if (!hasLessThanTenRange) {
            setSearchAdVolumeCached(requestedKw, { pc, mo, total, comp: competition, cpc: aveCpc });
          }
        } else {
          // 🔥 v2.24.0 P0-3: 매칭 실패 시 0 저장 → 캐시 영구 고착 (복구 불가). null 로 변경.
          //   0 은 "진짜 0건"이고 null 은 "데이터 없음" 의미 구분.
          console.log(`[NAVER-SEARCHAD] ⚠️ "${requestedKw}" 검색량 조회 실패 - API 응답에 결과 없음`);
          results.push({ keyword: requestedKw, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: null });
        }
      }

    } catch (error: any) {
      console.error(`[NAVER-SEARCHAD] 배치 에러: ${chunk.join(',')} - ${error.message}`);
      chunk.forEach(k => results.push({ keyword: k, pcSearchVolume: null, mobileSearchVolume: null, totalSearchVolume: null }));
    }
  }

  // 개별 재호출 fallback 제거 — 실측에서 회복률 0%로 효용 없고 Rate Limit 소진만 가속.
  // (Naver가 sv=0으로 반환하는 키워드는 실제로 데이터가 없음 — 단일 재호출해도 동일)

  // Cache hits are collected before API misses, so append order is not request
  // order. Every downstream consumer expects a one-to-one keyword row. Restore
  // that contract by exact normalized keyword identity and fail closed on gaps.
  return alignSearchAdRowsByKeyword(cleanKeywords, results).map((matched, index) => {
    if (!matched) {
      return {
        keyword: cleanKeywords[index],
        pcSearchVolume: null,
        mobileSearchVolume: null,
        totalSearchVolume: null,
      };
    }
    const pcRange = matched.pcSearchVolumeLt10 === true;
    const mobileRange = matched.mobileSearchVolumeLt10 === true;
    const hasKeywordBoundSplit = typeof matched.pcSearchVolume === 'number'
      && typeof matched.mobileSearchVolume === 'number'
      && !pcRange
      && !mobileRange;
    const hasKeywordBoundRange = (pcRange || mobileRange)
      && (pcRange || typeof matched.pcSearchVolume === 'number')
      && (mobileRange || typeof matched.mobileSearchVolume === 'number');
    return {
      ...matched,
      keyword: cleanKeywords[index],
      ...(hasKeywordBoundSplit || hasKeywordBoundRange
        ? { searchVolumeBindingVersion: SEARCHAD_KEYWORD_BINDING_VERSION }
        : {}),
    };
  });
}

export interface KeywordSuggestion {
  keyword: string;
  pcSearchVolume: number | null;
  mobileSearchVolume: number | null;
  totalSearchVolume: number | null;
  competition?: string;
  monthlyPcQcCnt?: number | null;
  monthlyMobileQcCnt?: number | null;
  monthlyAveCpc?: number | null;
  pcSearchVolumeLt10?: boolean;
  mobileSearchVolumeLt10?: boolean;
  svEstimated?: boolean;
  measuredAtMs?: number;
  searchVolumeBindingVersion?: SearchAdKeywordBindingVersion;
}

/**
 * 연관 키워드 제안 조회
 */
export async function getNaverSearchAdKeywordSuggestions(
  config: NaverSearchAdConfig,
  seedKeyword: string,
  limit: number = 200
): Promise<KeywordSuggestion[]> {
  // SearchAd hintKeywords is limited to 15 characters. A truncated seed returns
  // suggestions for a different keyword and spends quota on unusable evidence.
  if (!preservesExactSearchAdHint(seedKeyword)) {
    return [];
  }
  const activeConfig = selectSearchAdAccount(buildSearchAdAccountPool(config));
  const accessLicense = activeConfig?.accessLicense ?? '';
  const secretKey = activeConfig?.secretKey ?? '';

  if (!accessLicense || !secretKey) {
    throw new Error('네이버 검색광고 API 인증 정보가 필요합니다');
  }

  // Phase 1: 일일 쿼터 소프트 상한 도달 시 연관어 조회 스킵 (배경 발굴이 남은 쿼터를 태우지 않게)
  const accountId = searchAdAccountId({ accessLicense, customerId: activeConfig?.customerId });
  if (searchAdExhausted(accountId)) {
    return [];
  }

  const customerId = resolveSearchAdCustomerId(activeConfig!);

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

    if (!reserveSearchAdCall(accountId, 1)) return [];
    const response = await fetch(`${apiUrl}?${params.toString()}`, { method, headers });
    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    const keywordList = data.keywordList || data.relKeywordList || (data.result && (data.result.keywordList || data.result.relKeywordList)) || [];

    const measuredAtMs = Date.now();
    const suggestions: KeywordSuggestion[] = keywordList.flatMap((item: any) => {
      const pcSearchVolumeLt10 = isLessThanTenVolume(item.monthlyPcQcCnt);
      const mobileSearchVolumeLt10 = isLessThanTenVolume(item.monthlyMobileQcCnt);
      const hasLessThanTenRange = pcSearchVolumeLt10 || mobileSearchVolumeLt10;
      const pc = parseVolumeValue(item.monthlyPcQcCnt);
      const mo = parseVolumeValue(item.monthlyMobileQcCnt);
      if ((!pcSearchVolumeLt10 && pc === null) || (!mobileSearchVolumeLt10 && mo === null)) return [];
      const aveCpc = parseVolumeValue(item.monthlyAveCpc);
      return [{
        keyword: decodeHtmlEntities(item.relKeyword || ''),
        pcSearchVolume: pc,
        mobileSearchVolume: mo,
        totalSearchVolume: hasLessThanTenRange ? null : (pc as number) + (mo as number),
        competition: item.compIdx,
        monthlyPcQcCnt: pc,
        monthlyMobileQcCnt: mo,
        monthlyAveCpc: aveCpc,
        pcSearchVolumeLt10,
        mobileSearchVolumeLt10,
        svEstimated: hasLessThanTenRange,
        measuredAtMs,
        searchVolumeBindingVersion: SEARCHAD_KEYWORD_BINDING_VERSION,
      }];
    });

    const selectedSuggestions = suggestions
      .filter(s => s.keyword && s.keyword !== seedKeyword)
      .sort((a, b) => {
        const bLowerBound = b.totalSearchVolume ?? ((b.pcSearchVolume || 0) + (b.mobileSearchVolume || 0));
        const aLowerBound = a.totalSearchVolume ?? ((a.pcSearchVolume || 0) + (a.mobileSearchVolume || 0));
        return bLowerBound - aLowerBound;
      })
      .slice(0, limit);
    for (const suggestion of selectedSuggestions) {
      if (suggestion.svEstimated !== true) {
        setSearchAdVolumeCached(suggestion.keyword, {
          pc: suggestion.pcSearchVolume,
          mo: suggestion.mobileSearchVolume,
          total: suggestion.totalSearchVolume,
          comp: suggestion.competition,
          cpc: suggestion.monthlyAveCpc,
        });
      }
    }
    return selectedSuggestions;

  } catch (error: any) {
    console.warn('[NAVER-SEARCHAD] 제안 조회 실패:', error.message);
    return [];
  }
}
