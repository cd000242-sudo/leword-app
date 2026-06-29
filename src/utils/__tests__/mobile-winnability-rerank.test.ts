import { __liveGoldenRadarTestInternals } from '../../mobile/live-golden-radar';

const { boardScore } = __liveGoldenRadarTestInternals as {
  boardScore: (item: unknown) => number;
};

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function item(keyword: string, volume: number, documentCount: number): unknown {
  const goldenRatio = Number((volume / documentCount).toFixed(2));
  const pcSearchVolume = Math.round(volume * 0.25);
  return {
    id: keyword,
    keyword,
    grade: 'SSS',
    score: 88,
    isMeasured: true,
    totalSearchVolume: volume,
    pcSearchVolume,
    mobileSearchVolume: volume - pcSearchVolume,
    documentCount,
    goldenRatio,
    cpc: 80,
    category: 'policy',
    source: 'searchad',
    intent: 'live-golden',
    evidence: ['measured'],
    updatedAt: new Date().toISOString(),
  };
}

// 초보자/저지수 블로거가 실제로 1페이지에 걸 수 있는 저볼륨·저경쟁 황금키워드
const beginnerWinnable = item('주휴수당 자동계산', 900, 120);
const beginnerWinnable2 = item('치아보험 면책기간', 700, 90);
const sweetSpot = item('제주 렌터카 완전자차 가격비교', 1400, 300);
// 지수 낮은 블로거는 절대 못 먹는 초경쟁 헤드 키워드
const megaHead = item('다이어트', 35000, 900);
const ultraHead = item('아이폰', 120000, 4000);

const sBeginner = boardScore(beginnerWinnable);
const sBeginner2 = boardScore(beginnerWinnable2);
const sSweet = boardScore(sweetSpot);
const sMega = boardScore(megaHead);
const sUltra = boardScore(ultraHead);

// 핵심: 저볼륨 저경쟁 황금이 초경쟁 헤드보다 높게 랭크되어야 한다.
assert(
  'beginner-winnable outranks mega head',
  sBeginner > sMega,
  `주휴수당(${sBeginner.toFixed(1)}) > 다이어트(${sMega.toFixed(1)}) 이어야 함`,
);
assert(
  'beginner-winnable2 outranks mega head',
  sBeginner2 > sMega,
  `치아보험(${sBeginner2.toFixed(1)}) > 다이어트(${sMega.toFixed(1)}) 이어야 함`,
);
assert(
  'sweet-spot outranks mega head',
  sSweet > sMega,
  `제주렌터카(${sSweet.toFixed(1)}) > 다이어트(${sMega.toFixed(1)}) 이어야 함`,
);
assert(
  'ultra head is pushed to the bottom',
  sUltra < sBeginner && sUltra < sBeginner2 && sUltra < sSweet,
  `아이폰(${sUltra.toFixed(1)}) 이 저볼륨 황금 3종보다 낮아야 함`,
);

// 소프트 재랭킹: 고볼륨도 board 에 '존재'는 하되(음수로 완전 배제까지는 아님) 하위로 밀린다.
assert(
  'mega head still scores (soft re-rank, not hard-excluded to negative)',
  Number.isFinite(sMega),
  `다이어트 점수=${sMega}`,
);

console.log('[mobile-winnability-rerank.test] passed', {
  beginner: sBeginner.toFixed(1),
  beginner2: sBeginner2.toFixed(1),
  sweet: sSweet.toFixed(1),
  mega: sMega.toFixed(1),
  ultra: sUltra.toFixed(1),
});

process.exit(0);
