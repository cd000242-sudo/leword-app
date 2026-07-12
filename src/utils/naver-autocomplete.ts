/**
 * 🔥🔥🔥 네이버 자동완성 API - 끝판왕 버전 🔥🔥🔥
 * 
 * 다중 API 병렬 호출로 100% 성공률 달성!
 * - PC 자동완성 API
 * - 모바일 자동완성 API  
 * - 쇼핑 자동완성 API
 * - 통합검색 연관검색어
 */

import axios from 'axios';
import { stableHash } from './deterministic-random';
import { rankKeywordExpansionCandidates } from './keyword-expansion-ranker';

export interface NaverApiConfig {
  clientId: string;
  clientSecret: string;
  skipSearchAdRelated?: boolean;
}

// API 설정
const CONFIG = {
  TIMEOUT: 5000,
  MAX_RETRIES: 3,
};

// User-Agent 목록 (랜덤 선택)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const MOBILE_USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
];

const PERSON_CONTEXT_RE = /(나이|부모|가족|아버지|어머니|엄마|아빠|형제|프로필|인스타|근황|출연|출연진|예능|드라마|다시보기|방송시간|유튜브|배우|가수|개그맨|셰프|작가|감독|선수|아이돌|소속사|학력|고향|일정|팬미팅|공식입장)/;
const NON_PERSON_SINGLE_TOKEN_RE = /(제네시스|카니발|아반떼|쏘렌토|아이오닉|그랜저|임플란트|에어컨|냉장고|세탁기|청소기|제습기|영양제|비타민|유산균|오메가|노트북|운동화|향수|화장품|지원금|보조금|대출|보험|부동산|아파트|청약)/;
const LOW_VALUE_AUTOCOMPLETE_REPEAT_TOKEN_RE = /^(?:20\d{2}|최신|오늘|이번주|추천|후기|리뷰|비교|가격|설치|용량|신청|조회|정리|총정리|체크리스트|실사용|할인|정보|구매처|최저가|출시일|스펙)$/u;
const LOW_VALUE_AUTOCOMPLETE_COMPACT_CHAIN_RE = /(추천20\d{2}|20\d{2}추천|추천사용법|추천용량|추천최저가|최저가추천|추천가격|가격추천|추천구매처|추천할인정보|추천출시일|추천스펙|비교후기|비교가격|비교구매처|비교최저가|가격후기|가격할인정보|가격구매처|가격출시일|최저가후기|최저가실사용|최저가구매처|구매처최저가|구매처실사용|실사용후기|할인실사용|할인정보후기|추천실사용|스펙스펙|스펙추천|스펙후기|스펙비교|스펙출시일)/u;
const AUTOCOMPLETE_GENERIC_INTENT_TOKEN_RE = /^(?:20\d{2}|\d+월|최신|오늘|이번주|추천|후기|리뷰|비교|가격|설치|용량|신청|조회|정리|총정리|체크리스트|실사용|할인|정보|방법|가이드|사용법|주의사항|전기세|전기요금|청소|렌탈|구매처|최저가|출시일|스펙|가성비|소음|조건|순위|필터교체|필터)$/u;

function isLikelyPersonAutocompleteQuery(query: string, candidates: string[] = []): boolean {
  const normalized = String(query || '').replace(/\s+/g, ' ').trim();
  if (!/^[가-힣]{2,8}$/.test(normalized)) return false;
  if (NON_PERSON_SINGLE_TOKEN_RE.test(normalized)) return false;
  return PERSON_CONTEXT_RE.test(`${normalized} ${candidates.slice(0, 80).join(' ')}`);
}

function autocompleteTokens(query: string): string[] {
  return String(query || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^\dA-Za-z가-힣]/g, '').trim())
    .filter(Boolean);
}

function compactAutocompleteQuery(query: string): string {
  return String(query || '')
    .replace(/\s+/g, '')
    .replace(/[^\dA-Za-z가-힣]/g, '')
    .toLowerCase();
}

function isLowValueAutocompleteQuery(query: string): boolean {
  const clean = String(query || '').replace(/\s+/g, ' ').trim();
  if (!clean) return true;
  if (LOW_VALUE_AUTOCOMPLETE_COMPACT_CHAIN_RE.test(compactAutocompleteQuery(clean))) return true;
  const tokens = autocompleteTokens(clean);
  const seen = new Set<string>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key) && LOW_VALUE_AUTOCOMPLETE_REPEAT_TOKEN_RE.test(token)) return true;
    seen.add(key);
  }
  const genericCount = tokens.filter((token) => AUTOCOMPLETE_GENERIC_INTENT_TOKEN_RE.test(token)).length;
  let trailingGenericRun = 0;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (!AUTOCOMPLETE_GENERIC_INTENT_TOKEN_RE.test(tokens[i])) break;
    trailingGenericRun += 1;
  }
  if (genericCount >= 3 && tokens.length >= 4) return true;
  if (trailingGenericRun >= 2 && tokens.length >= 4) return true;
  return false;
}

function getRandomUA(mobile = false): string {
  const list = mobile ? MOBILE_USER_AGENTS : USER_AGENTS;
  return list[stableHash(mobile ? 'naver-mobile-ua' : 'naver-pc-ua') % list.length];
}

/**
 * 🔥 PC 자동완성 API (ac.search.naver.com)
 */
async function fetchPCAutocomplete(query: string): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const response = await axios.get('https://ac.search.naver.com/nx/ac', {
      params: {
        q: query,
        con: 1,
        frm: 'nv',
        ans: 2,
        r_format: 'json',
        r_enc: 'UTF-8',
        r_unicode: 0,
        t_koreng: 1,
        run: 2,
        rev: 4,
        q_enc: 'UTF-8'
      },
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'application/json',
        'Referer': 'https://search.naver.com/'
      },
      timeout: CONFIG.TIMEOUT
    });
    
    if (response.data?.items) {
      for (const itemGroup of response.data.items) {
        if (Array.isArray(itemGroup)) {
          for (const item of itemGroup) {
            if (Array.isArray(item) && item[0]) {
              const kw = String(item[0]).trim();
              if (kw.length >= 2) results.push(kw);
            }
          }
        }
      }
    }
  } catch (e) {
    // 실패 무시
  }
  
  return results;
}

/**
 * 🔥 모바일 자동완성 API (mac.search.naver.com) - 더 많은 결과!
 */
async function fetchMobileAutocomplete(query: string): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const response = await axios.get('https://mac.search.naver.com/mobile/ac', {
      params: {
        q: query,
        st: 1,
        frm: 'mobile_nv',
        r_format: 'json',
        _callback: ''
      },
      headers: {
        'User-Agent': getRandomUA(true),
        'Accept': 'application/json'
      },
      timeout: CONFIG.TIMEOUT
    });
    
    if (response.data?.items) {
      for (const itemGroup of response.data.items) {
        if (Array.isArray(itemGroup)) {
          for (const item of itemGroup) {
            if (Array.isArray(item) && item[0]) {
              const kw = String(item[0]).trim();
              if (kw.length >= 2) results.push(kw);
            } else if (typeof item === 'string' && item.length >= 2) {
              results.push(item);
            }
          }
        }
      }
    }
  } catch (e) {
    // 실패 무시
  }
  
  return results;
}

/**
 * 🔥 쇼핑 자동완성 API (더 다양한 상업 키워드!)
 */
async function fetchShoppingAutocomplete(query: string): Promise<string[]> {
  const results: string[] = [];
  
  try {
    const response = await axios.get('https://ac.shopping.naver.com/ac', {
      params: {
        q: query,
        frm: 'shopping',
        r_format: 'json'
      },
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'application/json',
        'Referer': 'https://shopping.naver.com/'
      },
      timeout: CONFIG.TIMEOUT
    });
    
    if (response.data?.items) {
      for (const itemGroup of response.data.items) {
        if (Array.isArray(itemGroup)) {
          for (const item of itemGroup) {
            if (Array.isArray(item) && item[0]) {
              const kw = String(item[0]).trim();
              if (kw.length >= 2) results.push(kw);
            }
          }
        }
      }
    }
  } catch (e) {
    // 실패 무시
  }
  
  return results;
}

/**
 * 🔥 연관검색어 — 2026-04-30 네이버 종료 대응 다중 폴백
 *  - 기존: search.naver.com HTML 크롤링 (data-keyword/lst_related/related_srch)
 *  - 신규: 5중 폴백 (검색광고 RelKwdStat + 다음 + 구글 + SmartBlock)
 *  - search.naver.com는 SmartBlock 추출에서 시도되며, lst_related는 4월30일부터 0건 예상
 */
async function fetchRelatedKeywords(query: string, skipSearchAd = false): Promise<string[]> {
  try {
    const { fetchRelatedKeywordsMulti } = await import('./related-keyword-fallback');
    const { EnvironmentManager } = await import('./environment-manager');
    const env = EnvironmentManager.getInstance().getConfig();
    const results = await fetchRelatedKeywordsMulti(query, {
      naverSearchAdAccessLicense: env.naverSearchAdAccessLicense,
      naverSearchAdSecretKey: env.naverSearchAdSecretKey,
      naverSearchAdCustomerId: env.naverSearchAdCustomerId,
    }, { skipSearchAd });
    return results.slice(0, 30).map(r => r.keyword);
  } catch (err: any) {
    console.warn(`[FALLBACK] fetchRelatedKeywords 폴백 실패: ${err?.message}`);
    return [];
  }
}

/**
 * 🔥🔥🔥 끝판왕 자동완성 - 병렬 다중 API 호출 🔥🔥🔥
 */
export async function getNaverAutocompleteKeywords(
  baseKeyword: string,
  config: NaverApiConfig
): Promise<string[]> {
  const normalizedBaseKeyword = String(baseKeyword || '').replace(/\s+/g, ' ').trim();
  if (isLowValueAutocompleteQuery(normalizedBaseKeyword)) {
    console.log(`[NAVER-AUTOCOMPLETE] 🧹 저품질 조립형 입력 제외: "${normalizedBaseKeyword}"`);
    return [];
  }
  console.log(`[NAVER-AUTOCOMPLETE] 🚀 끝판왕 자동완성 시작: "${normalizedBaseKeyword}"`);
  
  const keywordMap = new Map<string, { keyword: string; sources: Set<string>; freq: number }>();
  const addKeyword = (keyword: string, source: string) => {
    const kw = String(keyword || '').trim();
    if (!kw) return;
    const key = kw.toLowerCase().replace(/\s+/g, '');
    const existing = keywordMap.get(key);
    if (existing) {
      existing.sources.add(source);
      existing.freq++;
    } else {
      keywordMap.set(key, { keyword: kw, sources: new Set([source]), freq: 1 });
    }
  };
  
  try {
    // 🔥 병렬로 4개 API 동시 호출!
    const [pcResults, mobileResults, shoppingResults, relatedResults] = await Promise.allSettled([
      fetchPCAutocomplete(baseKeyword),
      fetchMobileAutocomplete(baseKeyword),
      fetchShoppingAutocomplete(baseKeyword),
      fetchRelatedKeywords(baseKeyword, config.skipSearchAdRelated === true)
    ]);
    
    // 결과 수집
    if (pcResults.status === 'fulfilled') {
      pcResults.value.forEach(kw => addKeyword(kw, 'naver-pc'));
      console.log(`[NAVER-AUTOCOMPLETE] ✅ PC API: ${pcResults.value.length}개`);
    }
    if (mobileResults.status === 'fulfilled') {
      mobileResults.value.forEach(kw => addKeyword(kw, 'naver-mobile'));
      console.log(`[NAVER-AUTOCOMPLETE] ✅ 모바일 API: ${mobileResults.value.length}개`);
    }
    if (shoppingResults.status === 'fulfilled') {
      shoppingResults.value.forEach(kw => addKeyword(kw, 'naver-shopping'));
      console.log(`[NAVER-AUTOCOMPLETE] ✅ 쇼핑 API: ${shoppingResults.value.length}개`);
    }
    if (relatedResults.status === 'fulfilled') {
      relatedResults.value.forEach(kw => addKeyword(kw, 'naver-relkwd'));
      console.log(`[NAVER-AUTOCOMPLETE] ✅ 연관검색어: ${relatedResults.value.length}개`);
    }
    
    console.log(`[NAVER-AUTOCOMPLETE] 📊 1차 수집 완료: ${keywordMap.size}개`);
    
    // 🔥 키워드가 부족하면 자모 확장
    if (keywordMap.size < 30) {
      const jamoList = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
      
      const jamoPromises = jamoList.map(jamo => fetchMobileAutocomplete(`${baseKeyword} ${jamo}`));
      const jamoResults = await Promise.allSettled(jamoPromises);
      
      jamoResults.forEach(result => {
        if (result.status === 'fulfilled') {
          result.value.forEach(kw => addKeyword(kw, 'naver-jamo'));
        }
      });
      
      console.log(`[NAVER-AUTOCOMPLETE] 📊 자모 확장 후: ${keywordMap.size}개`);
    }
    
    // 🔥 수익화 접미사 확장
    if (keywordMap.size < 50) {
      const currentCandidates = Array.from(keywordMap.values()).map(item => item.keyword);
      const suffixes = isLikelyPersonAutocompleteQuery(baseKeyword, currentCandidates)
        ? ['나이', '프로필', '인스타', '출연', '예능', '다시보기', '근황', '가족', '부모', '소속사', '방송시간', '일정']
        : ['추천', '비교', '가격', '후기', '방법', '종류', '순위', '장단점'];
      
      const suffixPromises = suffixes.map(suffix => fetchMobileAutocomplete(`${baseKeyword} ${suffix}`));
      const suffixResults = await Promise.allSettled(suffixPromises);
      
      suffixResults.forEach(result => {
        if (result.status === 'fulfilled') {
          result.value.forEach(kw => addKeyword(kw, 'naver-suffix'));
        }
      });
      
      console.log(`[NAVER-AUTOCOMPLETE] 📊 접미사 확장 후: ${keywordMap.size}개`);
    }
    
    // 필터링 및 관련성 정렬
    const candidates = Array.from(keywordMap.values())
      .filter(item => {
        const kw = item.keyword;
        if (!kw || kw.length < 2 || kw.length > 50) return false;
        if (kw === baseKeyword) return false;
        if (/^[\d\s\.\,\-\_]+$/.test(kw)) return false;
        if (/[<>{}[\]\\\/]/.test(kw)) return false;
        return true;
      })
      .map(item => ({
        keyword: item.keyword,
        sources: Array.from(item.sources),
        freq: item.freq,
      }));
    let ranked = rankKeywordExpansionCandidates(baseKeyword, candidates, {
      limit: 100,
      minScore: 34,
      fallbackMinScore: 24,
      minKeep: 20,
      ensureIntentCoverage: true,
      intentCoverageMin: 30,
      allowSyntheticFallback: false,
    });
    if (ranked.length < 20) {
      ranked = rankKeywordExpansionCandidates(baseKeyword, candidates, {
        limit: 100,
        minScore: 24,
        fallbackMinScore: 18,
        minKeep: 20,
        ensureIntentCoverage: true,
        intentCoverageMin: 30,
        allowSyntheticFallback: false,
      });
    }
    const result = ranked.map(item => item.keyword);
    
    console.log(`[NAVER-AUTOCOMPLETE] ✅ 최종 ${result.length}개 반환`);
    return result;
    
  } catch (error: any) {
    console.error('[NAVER-AUTOCOMPLETE] ❌ 오류:', error.message);
    return [];
  }
}

/**
 * 실수요 검증용 경량 자동완성 프로브 (키워드당 2 호출: PC+모바일).
 *
 * 기존 getNaverAutocompleteKeywords 는 자모/접미사 확장까지 키워드당 20~30회 호출하는
 * 수집기라 검증 용도로 부적합하고, 내부에서 오류를 삼켜 "장애"와 "제안 없음(유령)"을
 * 구분할 수 없다. 이 프로브는 실패 여부(ok)를 보존한다 — ok=false 면 판정 보류해야 한다.
 */
export interface NaverAutocompleteEchoProbe {
  ok: boolean;
  suggestions: string[];
}

function parseAutocompleteEchoItems(data: unknown): string[] {
  const results: string[] = [];
  const items = (data as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return results;
  for (const itemGroup of items) {
    if (!Array.isArray(itemGroup)) continue;
    for (const item of itemGroup) {
      if (Array.isArray(item) && item[0]) {
        const kw = String(item[0]).trim();
        if (kw.length >= 2) results.push(kw);
      } else if (typeof item === 'string' && item.length >= 2) {
        results.push(item);
      }
    }
  }
  return results;
}

export async function probeNaverAutocompleteSuggestions(query: string): Promise<NaverAutocompleteEchoProbe> {
  const clean = String(query || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: true, suggestions: [] };
  const attempts = await Promise.allSettled([
    axios.get('https://ac.search.naver.com/nx/ac', {
      params: { q: clean, con: 1, frm: 'nv', ans: 2, r_format: 'json', r_enc: 'UTF-8', r_unicode: 0, t_koreng: 1, run: 2, rev: 4, q_enc: 'UTF-8' },
      headers: { 'User-Agent': getRandomUA(), 'Accept': 'application/json', 'Referer': 'https://search.naver.com/' },
      timeout: CONFIG.TIMEOUT,
    }).then((response) => parseAutocompleteEchoItems(response.data)),
    axios.get('https://mac.search.naver.com/mobile/ac', {
      params: { q: clean, st: 1, frm: 'mobile_nv', r_format: 'json', _callback: '' },
      headers: { 'User-Agent': getRandomUA(true), 'Accept': 'application/json' },
      timeout: CONFIG.TIMEOUT,
    }).then((response) => parseAutocompleteEchoItems(response.data)),
  ]);
  const fulfilled = attempts.filter(
    (attempt): attempt is PromiseFulfilledResult<string[]> => attempt.status === 'fulfilled',
  );
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const attempt of fulfilled) {
    for (const kw of attempt.value) {
      const key = kw.toLowerCase().replace(/\s+/g, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      suggestions.push(kw);
    }
  }
  return { ok: fulfilled.length > 0, suggestions };
}
