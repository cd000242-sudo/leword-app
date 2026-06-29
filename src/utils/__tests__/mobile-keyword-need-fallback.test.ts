import { judgeKeywordMetric } from '../../mobile/keyword-ai-judge';
import type { MobileKeywordMetric } from '../../mobile/contracts';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function measured(
  keyword: string,
  totalSearchVolume: number,
  documentCount: number,
  category = 'electronics',
): MobileKeywordMetric {
  const pcSearchVolume = Math.round(totalSearchVolume * 0.25);
  return {
    keyword,
    grade: 'SS',
    score: 0,
    totalSearchVolume,
    pcSearchVolume,
    mobileSearchVolume: totalSearchVolume - pcSearchVolume,
    documentCount,
    goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
    category,
    intent: 'live-golden',
    source: 'searchad',
    evidence: ['searchad-volume', 'naver-openapi-document-count'],
    searchVolumeSource: 'searchad',
    searchVolumeConfidence: 'high',
    isSearchVolumeEstimated: false,
    documentCountSource: 'naver-api',
    documentCountConfidence: 'high',
    isDocumentCountEstimated: false,
    isMeasured: true,
  } as unknown as MobileKeywordMetric;
}

const now = new Date('2026-06-29T09:00:00.000Z');

// 1) 액션 토큰(가격/비교/후기/추천/방법…)이 전혀 없지만 실측 저경쟁인 진짜 니즈키워드.
//    Phase 2 이전: needIntent='weak' → 다운스트림에서 weak-need-intent 로 탈락.
//    Phase 2 이후: 메트릭 fallback 으로 'medium' 승격 → 발행 가능.
const winnable = judgeKeywordMetric(measured('위닉스 창문형 에어컨', 1100, 350), now);
assert('measured low-competition keyword without action token is promoted off weak',
  winnable.needIntent !== 'weak',
  `needIntent=${winnable.needIntent} score=${winnable.score} verdict=${winnable.verdict}`);
assert('measured low-competition keyword is not excluded',
  winnable.verdict !== 'exclude',
  `verdict=${winnable.verdict} score=${winnable.score}`);

// 2) 또 다른 토큰 없는 저경쟁 키워드 (장소/제품명 류).
const winnable2 = judgeKeywordMetric(measured('백운계곡 캠핑장', 700, 90, 'travel_domestic'), now);
assert('bare place-name low-competition keyword promoted off weak',
  winnable2.needIntent !== 'weak',
  `needIntent=${winnable2.needIntent} score=${winnable2.score} verdict=${winnable2.verdict}`);

// 3) 가드: 고경쟁(문서수 큼) 키워드는 fallback 대상이 아니다 (저경쟁이 핵심 전제).
const highComp = judgeKeywordMetric(measured('공기청정기', 5000, 9000), now);
assert('high-competition bare keyword stays weak (fallback requires low docs)',
  highComp.needIntent === 'weak',
  `needIntent=${highComp.needIntent} docs=9000`);

// 4) 가드: lotto/lookup 류는 여전히 weak + 제외 (과승격 방지).
const lookup = judgeKeywordMetric(measured('로또 당첨번호', 800, 120, 'life_tips'), now);
assert('low-value lookup keyword still weak',
  lookup.needIntent === 'weak',
  `needIntent=${lookup.needIntent} verdict=${lookup.verdict}`);
assert('low-value lookup keyword still excluded',
  lookup.verdict === 'exclude',
  `verdict=${lookup.verdict}`);

console.log('[mobile-keyword-need-fallback.test] passed', {
  winnable: `${winnable.needIntent}/${winnable.verdict}/${winnable.score}`,
  winnable2: `${winnable2.needIntent}/${winnable2.verdict}/${winnable2.score}`,
  highComp: `${highComp.needIntent}`,
  lookup: `${lookup.needIntent}/${lookup.verdict}`,
});

process.exit(0);
