import { rankGoldenDiscoveryResults, type GoldenDiscoveryLike } from '../golden-discovery-floor';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function sss(keyword: string, searchVolume: number, documentCount: number): GoldenDiscoveryLike {
  return {
    keyword,
    grade: 'SSS',
    score: 88,
    searchVolume,
    totalSearchVolume: searchVolume,
    documentCount,
    goldenRatio: Number((searchVolume / documentCount).toFixed(2)),
    cpc: 80,
    category: 'policy',
    source: 'searchad',
    intent: '신청 방법',
  };
}

// 데스크톱 앱이 쓰는 공유 랭킹(rankGoldenDiscoveryResults)도 저볼륨·저경쟁을 우선해야 한다.
const items: GoldenDiscoveryLike[] = [
  sss('다이어트 보조제 추천', 35000, 900),       // 대형 헤드 (고볼륨)
  sss('주휴수당 신청방법', 900, 120),            // 초보 winnable (저볼륨·저경쟁)
  sss('치아보험 면책기간 조회', 700, 90),         // 초보 winnable
];

const ranked = rankGoldenDiscoveryResults(items, 10, false, { honorRequestedLimit: true });
const order = ranked.map((item) => item.keyword);
const idxWinnable = Math.min(order.indexOf('주휴수당 신청방법'), order.indexOf('치아보험 면책기간 조회'));
const idxHead = order.indexOf('다이어트 보조제 추천');

assert('shared desktop ranking surfaces low-volume winnable before high-volume head',
  idxWinnable >= 0 && idxHead >= 0 && idxWinnable < idxHead,
  `order=${order.join(' | ')}`);

console.log('[golden-floor-winnability-rank.test] passed', { order });
process.exit(0);
