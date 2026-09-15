/**
 * 이슈 카테고리 — 검색어 · 표본 제목의 사전 매칭(규칙). 추론이 아니다.
 *
 * KNOWN ANCHOR(사람들이 1초에 알아보는 기준어)와 이미지 전략이 이 값을 쓴다.
 * 어느 사전에도 안 걸리면 'unknown'(미분류) — 억지로 넣지 않는다.
 * 검색어에 걸린 말은 두 번 센다(제목보다 이슈를 더 곧게 가리킨다). 동점이면 아래 순서가 앞선 쪽.
 */
import type { HomefeedCategory } from './types';

const CATEGORY_RULES: ReadonlyArray<{ category: HomefeedCategory; re: RegExp }> = [
  { category: 'incident', re: /(사고|사건|화재|폭발|체포|구속|검거|경찰|숨진|사망|실종|추락|피의자|살인|폭행|흉기|참사|붕괴|침수)/gu },
  { category: 'weather', re: /(날씨|태풍|폭염|폭우|장마|한파|폭설|미세먼지|기상청|호우|강풍|지진)/gu },
  { category: 'entertainment', re: /(배우|가수|아이돌|걸그룹|보이그룹|드라마|예능|방송|열애|결혼|이혼|컴백|유튜버|영화|시청률|출연|\bMC\b|연예|소속사|앨범|뮤직비디오|팬미팅|콘서트)/giu },
  { category: 'sports', re: /(야구|축구|농구|배구|골프|선수|감독|경기(?!도)|우승|리그|올림픽|월드컵|국가대표|홈런|\bKBO\b|\bEPL\b|\bMLB\b)/giu },
  { category: 'policy', re: /(정부|정책|국회|대통령|장관|법안|개정안|시행|지원금|보조금|복지|세금|세법|국세청|교육부|총리|여당|야당|선거|의원)/gu },
  { category: 'money', re: /(주가|코인|비트코인|금리|환율|연봉|월급|적금|예금|대출|투자|증시|코스피|코스닥|상장|공모주|억\s?원|조\s?원|수익률|배당)/gu },
  { category: 'house', re: /(아파트|전세|월세|청약|분양|집값|부동산|인테리어|리모델링|이사|주택|원룸)/gu },
  { category: 'car', re: /(신차|자동차|전기차|\bSUV\b|세단|현대차|기아|테슬라|제네시스|\bBMW\b|벤츠|하이브리드|연비|리콜)/giu },
  { category: 'tech', re: /(아이폰|갤럭시|애플|삼성전자|구글|챗GPT|오픈AI|인공지능|\bAI\b|반도체|스마트폰|업데이트)/giu },
  { category: 'food', re: /(맛집|음식|레시피|편의점|신메뉴|치킨|라면|커피|디저트|김밥|떡볶이|식당|급식|과자)/gu },
  { category: 'travel', re: /(여행|항공|호텔|축제|관광|공항|휴가|해외여행|비자|항공권|리조트)/gu },
  { category: 'health', re: /(건강|질환|암\s?(?:진단|환자|치료|판정|수술)|바이러스|감염|백신|다이어트|수면|증상|치매|독감)/gu },
  { category: 'work', re: /(직장|회사원|채용|퇴사|취업|공무원|알바|노조|파업|해고|성과급|사직)/gu },
  { category: 'family', re: /(육아|부모|아이(?!돌|폰|유|패드)|자녀|가족|결혼식|임신|출산|어린이집|유치원|학부모|시댁|며느리)/gu },
];

export const CATEGORY_LABEL: Readonly<Record<HomefeedCategory, string>> = Object.freeze({
  entertainment: '연예 · 방송',
  sports: '스포츠',
  money: '돈 · 경제',
  house: '집 · 부동산',
  car: '자동차',
  tech: 'IT · 기기',
  food: '음식',
  travel: '여행',
  work: '직장',
  family: '가족 · 육아',
  health: '건강',
  policy: '정책 · 사회',
  incident: '사건 · 사고',
  weather: '날씨',
  unknown: '미분류',
});

function countMatches(re: RegExp, text: string): number {
  return (text.match(re) || []).length;
}

/** 검색어와 표본 제목으로 카테고리를 고른다. 아무 사전에도 안 걸리면 'unknown'. */
export function classifyHomefeedCategory(keyword: string, titles: readonly string[]): HomefeedCategory {
  const titleText = titles.join('\n');
  let best: HomefeedCategory = 'unknown';
  let bestCount = 0;
  for (const rule of CATEGORY_RULES) {
    const count = countMatches(rule.re, String(keyword || '')) * 2 + countMatches(rule.re, titleText);
    if (count > bestCount) {
      best = rule.category;
      bestCount = count;
    }
  }
  return best;
}
