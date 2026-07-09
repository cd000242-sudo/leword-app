// PRO Hunter v12 — 상위 후보 빈집(vacancy) 심층분석 오케스트레이터 (C4 slice 2)
//
// vacancy-detector.analyzeVacancy(axios+cheerio, 키워드당 네이버 통합검색 1 GET)를 최종 랭킹의
// 상위 N개 골든 후보에만 돌려 'top10 중 블로거가 뚫을 수 있는 빈 슬롯 수(vacancySlots)'를 주입한다.
// puppeteer가 아니라 axios라 chrome 미설치/미가용 환경에서도 동작한다(=브라우저 미활성에도 승산 신호 제공).
//
// - opt-in: 명시 호출 시에만 네트워크. graceful-degrade: 키워드별 실패 시 unreliable(vacancySlots:null) 폴백.
// - analyzer 주입: analyzeVacancy 기본, 테스트는 mock 주입으로 순수 검증.
// deep-serp-enricher 와 동일한 오케스트레이션 계약(상위N 제한·동시성·dedup·폴백).

import { analyzeVacancy, type VacancyResult } from './vacancy-detector';

export type VacancyAnalyzer = (keyword: string) => Promise<VacancyResult>;

export interface VacancyEnrichOptions {
  /** 상위 몇 개만 분석할지 (기본 10, 상한 30). */
  topN?: number;
  /** 동시 요청 수 (기본 3, 상한 4 — 네이버 차단 회피). */
  concurrency?: number;
  /** 분석기 주입(테스트/대체용). 기본 analyzeVacancy(axios). */
  analyzer?: VacancyAnalyzer;
  onProgress?: (done: number, total: number, keyword: string) => void;
}

export const VACANCY_MAX_TOP_N = 30;

/** 측정 실패/미측정 중립 결과 — vacancySlots:null(신뢰 불가) 로 표시. */
export function unreliableVacancy(keyword: string): VacancyResult {
  return {
    keyword,
    totalSlotsAnalyzed: 0,
    influencerCount: 0,
    bigDomainCount: 0,
    vacancySlots: null as unknown as number,
    freshnessGap: 0,
    suggestedAction: '',
    domains: [],
    serpVersion: 'legacy',
  };
}

/** vacancy 결과가 신뢰 가능한 실측인가(vacancySlots 가 숫자). */
export function isVacancyReliable(v: VacancyResult | undefined): boolean {
  return !!v && typeof v.vacancySlots === 'number' && Number.isFinite(v.vacancySlots);
}

/**
 * 상위 후보 키워드들에 빈집 신호를 주입한다.
 * 반환: keyword → VacancyResult (실패 키워드는 unreliableVacancy 폴백).
 */
export async function enrichKeywordsWithVacancy(
  keywords: string[],
  options: VacancyEnrichOptions = {},
): Promise<Map<string, VacancyResult>> {
  const analyzer = options.analyzer ?? analyzeVacancy;
  const topN = Math.max(0, Math.min(VACANCY_MAX_TOP_N, Math.floor(options.topN ?? 10)));
  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 3)));

  const targets: string[] = [];
  const seen = new Set<string>();
  for (const kw of keywords) {
    const k = String(kw || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    targets.push(k);
    if (targets.length >= topN) break;
  }

  const out = new Map<string, VacancyResult>();
  if (targets.length === 0) return out;

  let cursor = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const kw = targets[cursor++];
      try {
        out.set(kw, await analyzer(kw));
      } catch (err) {
        console.warn(`[VACANCY] "${kw}" 빈집분석 실패 → unreliable 폴백:`, (err as Error)?.message || err);
        out.set(kw, unreliableVacancy(kw));
      } finally {
        done++;
        options.onProgress?.(done, targets.length, kw);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
  );
  return out;
}
