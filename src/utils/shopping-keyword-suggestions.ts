/**
 * 쇼핑 커넥트 자동 추천 키워드
 *
 * 소스 우선순위:
 *   1. rich-feed 디스크 캐시(오늘의 황금키워드) — 있으면 최우선
 *   2. 정적 커머스 풀 (블루오션 + 고CPC 카테고리)
 *
 * UI 열리자마자 노출 → 클릭만 하면 검색 실행.
 */

// 카테고리별 커머스 키워드 — 블로그 전환율 높은 영역 중심
const COMMERCE_SEEDS: Record<string, string[]> = {
  '🎧 가전/디지털': [
    '무선 이어폰', '블루투스 스피커', '공기청정기', '로봇청소기',
    '무선 청소기', '에어프라이어', '가습기', '식기세척기',
    '스마트워치', '모니터', '게이밍 키보드', '노트북 거치대',
  ],
  '💄 뷰티/화장품': [
    '쿠션 팩트', '아이크림', '선크림', '앰플',
    '클렌징 오일', '토너패드', '시트 마스크', '남자 스킨로션',
  ],
  '💪 건강/다이어트': [
    '비타민D', '프로바이오틱스', '오메가3', '루테인',
    '콜라겐', '밀크씨슬', '단백질 보충제', '다이어트 보조제',
  ],
  '⛺ 캠핑/아웃도어': [
    '캠핑 의자', '텐트', '침낭', '등산 배낭',
    '캠핑 테이블', '랜턴', '화목난로', '캠핑카',
  ],
  '👶 육아/유아': [
    '유모차', '카시트', '분유', '기저귀',
    '젖병', '이유식 용기', '아기 침대', '아기 의자',
  ],
  '🏠 주방/생활': [
    '프라이팬', '식칼 세트', '전기밥솥', '커피머신',
    '밥그릇 세트', '물병', '텀블러', '수건 세트',
  ],
  '🏃 운동/피트니스': [
    '요가매트', '아령', '실내자전거', '러닝머신',
    '헬스 장갑', '줄넘기', '폼롤러', '요가복',
  ],
  '🐶 반려동물': [
    '강아지 사료', '고양이 모래', '자동 급식기', '반려견 하우스',
    '고양이 스크래쳐', '펫 카메라',
  ],
  '🛏️ 침구/인테리어': [
    '구스 이불', '메모리폼 베개', '라텍스 매트리스',
    '블랙아웃 커튼', 'LED 스탠드',
  ],
};

export interface SuggestionGroup {
  category: string;
  keywords: string[];
}

/**
 * 정적 풀 + (옵션) 동적 피드 합병
 * 각 카테고리에서 2-4개씩 랜덤 샘플링 → 30개 내외
 */
export function getStaticShoppingSuggestions(perCategory: number = 3): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  for (const [category, all] of Object.entries(COMMERCE_SEEDS)) {
    // 시간 기반 회전(6시간마다 다른 샘플) — Math.random 금지 (grading 규칙이 아니라 샘플링이라 허용되나, 회전으로 대체)
    const shift = Math.floor(Date.now() / (6 * 60 * 60_000)) % Math.max(1, all.length);
    const rotated = [...all.slice(shift), ...all.slice(0, shift)];
    groups.push({ category, keywords: rotated.slice(0, perCategory) });
  }
  return groups;
}

/**
 * rich-feed 디스크 캐시에서 커머스성 키워드 추출
 * - 문서수 보유 + 카테고리가 전체/정보성 아닌 것
 * - 최근 24시간 내 것만
 */
export function getDynamicSuggestionsFromRichFeed(): string[] {
  try {
    const fs = require('fs');
    const path = require('path');
    let cachePath: string;
    try {
      const { app } = require('electron');
      cachePath = path.join(app.getPath('userData'), 'rich-feed-cache.json');
    } catch {
      const os = require('os');
      cachePath = path.join(os.tmpdir(), 'leword-rich-feed-cache.json');
    }

    if (!fs.existsSync(cachePath)) return [];
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!data || !Array.isArray(data.rows)) return [];
    if (Date.now() - (data.timestamp || 0) > 24 * 60 * 60_000) return [];

    // 커머스 가능한 것만 필터 — 인물명·이슈 제외
    const commerceCategories = new Set([
      '뷰티/화장품', '주방용품', '차량관리/정비', '노트북/PC/태블릿',
      '요리/레시피', 'AI도구', '취업/이직', '생활 꿀팁', '전체',
    ]);

    return data.rows
      .filter((r: any) => {
        if (!r.keyword) return false;
        if (r.documentCount <= 0) return false;
        if (commerceCategories.has(r.category)) return true;
        // 기본 카테고리가 이슈/인물명성이면 제외
        return false;
      })
      .slice(0, 15)
      .map((r: any) => String(r.keyword).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ============================================================
// 정적 풀 실시간 황금순 검증
// ============================================================

interface VerifiedKeyword {
  keyword: string;
  category: string;
  searchVolume: number;
  documentCount: number;
  goldenRatio: number;
}

interface VerifiedCache {
  timestamp: number;
  items: VerifiedKeyword[];
}

const VERIFIED_CACHE_TTL = 24 * 60 * 60_000; // 24시간

function getVerifiedCachePath(): string {
  try {
    const { app } = require('electron');
    if (app?.getPath) {
      const path = require('path');
      return path.join(app.getPath('userData'), 'shopping-suggestions-verified.json');
    }
  } catch {}
  const os = require('os');
  const path = require('path');
  return path.join(os.tmpdir(), 'leword-shopping-suggestions-verified.json');
}

function readVerifiedCache(): VerifiedCache | null {
  try {
    const fs = require('fs');
    const file = getVerifiedCachePath();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - (parsed.timestamp || 0) > VERIFIED_CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeVerifiedCache(cache: VerifiedCache): void {
  try {
    const fs = require('fs');
    fs.writeFileSync(getVerifiedCachePath(), JSON.stringify(cache), 'utf8');
  } catch {}
}

/**
 * 모든 정적 키워드를 네이버 API로 검증 → goldenRatio 계산 → 상위 N개 반환
 * 24h 캐시 사용 (첫 호출 시 10~15초 소요, 이후 즉시)
 */
export async function getVerifiedShoppingSuggestions(limit: number = 30): Promise<VerifiedKeyword[]> {
  const cached = readVerifiedCache();
  if (cached) {
    return cached.items.slice(0, limit);
  }

  // 캐시 없으면 실시간 검증
  const allSeeds: Array<{ keyword: string; category: string }> = [];
  for (const [category, keywords] of Object.entries(COMMERCE_SEEDS)) {
    for (const kw of keywords) {
      allSeeds.push({ keyword: kw, category });
    }
  }

  try {
    const { EnvironmentManager } = require('./environment-manager');
    const cfg: any = EnvironmentManager.getInstance().getConfig();
    const clientId = cfg.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
    const clientSecret = cfg.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';
    if (!clientId || !clientSecret) return [];

    const { getNaverKeywordSearchVolumeSeparate } = require('./naver-datalab-api');
    const keywords = allSeeds.map(s => s.keyword);

    // 배치 30개씩 조회
    const verified: VerifiedKeyword[] = [];
    for (let i = 0; i < keywords.length; i += 30) {
      const batch = keywords.slice(i, i + 30);
      const seedInfo = allSeeds.slice(i, i + 30);
      try {
        const sigs = await getNaverKeywordSearchVolumeSeparate(
          { clientId, clientSecret },
          batch,
          { includeDocumentCount: true }
        );
        for (let j = 0; j < sigs.length; j++) {
          const sig = sigs[j];
          const info = seedInfo[j];
          if (!sig || !info) continue;
          const sv = (sig.pcSearchVolume || 0) + (sig.mobileSearchVolume || 0);
          const dc = sig.documentCount ?? 0;
          if (sv < 100 || dc <= 0) continue;
          const goldenRatio = sv / Math.max(1, dc);
          verified.push({
            keyword: info.keyword,
            category: info.category,
            searchVolume: sv,
            documentCount: dc,
            goldenRatio: parseFloat(goldenRatio.toFixed(2)),
          });
        }
      } catch (e: any) {
        console.warn('[shopping-suggestions] 배치 검증 실패:', e?.message);
      }
    }

    // goldenRatio 내림차순 정렬
    verified.sort((a, b) => b.goldenRatio - a.goldenRatio);

    // 캐시 저장
    writeVerifiedCache({ timestamp: Date.now(), items: verified });

    return verified.slice(0, limit);
  } catch (e: any) {
    console.error('[shopping-suggestions] 검증 실패:', e?.message);
    return [];
  }
}

/**
 * 통합 제안 — 동적 피드(황금순) + 정적 검증(황금순) + 미검증 카테고리(탐색용)
 */
export async function getShoppingSuggestions(): Promise<{
  dynamic: string[];
  verified: VerifiedKeyword[];
  static: SuggestionGroup[];
}> {
  const dynamic = getDynamicSuggestionsFromRichFeed();

  // 정적 풀 검증은 캐시 있을 때만 즉시 반환. 없으면 백그라운드로.
  const cached = readVerifiedCache();
  const verified = cached ? cached.items.slice(0, 30) : [];

  // 캐시 없으면 백그라운드에서 트리거 (await 안 함)
  if (!cached) {
    getVerifiedShoppingSuggestions(30).catch(() => {});
  }

  return {
    dynamic,
    verified,
    static: getStaticShoppingSuggestions(3),
  };
}
