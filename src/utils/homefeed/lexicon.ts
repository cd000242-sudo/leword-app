/**
 * 홈판 신호 표면 사전 — 긴장 유형 · 사건 사실 말 · 과장어 · 루머 · 팬 전용 · 장면 단서.
 *
 * 전부 기사 제목 표면에서만 찾는다. 걸린 말과 그 제목(주소)을 근거로 함께 싣고, 걸리지 않은 것은 만들지 않는다.
 */
import type { HomefeedTensionType } from './types';

export const TENSION_RULES: ReadonlyArray<{ type: Exclude<HomefeedTensionType, 'number_conflict' | 'scale_mismatch'>; re: RegExp }> = [
  { type: 'relationship_shift', re: /(열애설|결혼설|이혼설|결혼|이혼|열애|결별|파경|재결합|합류|탈퇴|이적|불화|화해|임신|득남|득녀|교제)/u },
  { type: 'expectation_break', re: /(알고\s?보니|반전|오히려|뜻밖|의외|예상\s?밖|정작|깜짝|이례적)/u },
  { type: 'action_reversal', re: /(취소|철회|번복|백지화|보류|연기|중단|재개|뒤집|유턴|돌연)/u },
  { type: 'identity_contrast', re: /(출신|전직|정체|이었던|였던|전\s?(?:국가대표|아나운서|아이돌|의사|검사|판사|기자))/u },
  { type: 'past_vs_now', re: /(당시|\d+\s?년\s?만|\d+\s?년\s?전|과거|그때|근황|달라진|변신)/u },
  { type: 'result_first', re: /(결국|끝내|마침내|드디어|결과는|최종)/u },
  { type: 'hidden_reason', re: /(이유|비결|까닭|속사정|배경은|왜(?=\s|\?|$))/u },
  /**
   * 맞수 비교 · 대체 구도 — 스포츠 제목의 절반은 "누가 누구보다"로 걸린다.
   * 실측(2026-09-17): '이불킥 폰세 상위 호환', '강정호 키움 틀렸고 NC 데이비슨'.
   */
  { type: 'rival_compare', re: /(상위\s?호환|하위\s?호환|대체자?|맞대결|맞수|라이벌|틀렸고|비교|누가\s?더|낫다|앞선다|제쳤|밀렸|물려준)/u },
];

/** 숫자와 붙으면 숫자 충돌이 되는 대비 말. */
export const NUMBER_CONTRAST_RE = /(보다|대비|→|만에|뿐|불과|넘어|돌파|반토막|급등|급락|추월|역전|\bvs\b)/iu;

/** 큰 돈 단위 + 일상 사물 = 규모 불일치. */
export const BIG_MONEY_RE = /\d+(?:[.,]\d+)*\s?(?:조|억|천만)/u;
export const PRICED_OBJECT_RE = /(억\s?원?짜리|천만\s?원짜리|만\s?원짜리)/u;
export const OBJECT_WORDS_RE = /(라면|커피|치킨|옷|가방|신발|시계|반지|목걸이|반찬|김밥|떡볶이|빵|티셔츠|케이크|도시락|햄버거|피자|과자|화장품|운동화|패딩|자전거|텀블러)/u;

/**
 * 사건 사실 말 — 정보층(REVEAL DEPTH)의 '사건' 층. 질문 틀(이유 · 비결)은 사실이 아니라 넣지 않는다.
 *
 * 2026-09-17 보강: 경기 · 연예 서사 말을 넣는다. 그 전에는 연예 '사건'(결혼 · 이혼 · 이적)에 치우쳐,
 * 그날 들어온 스포츠 10건에서 걸림 말이 0건이었다 — '압승' · '선발 제외' · '생존'을 하나도 못 읽었다.
 * 긴 말을 앞에 두어야 짧은 말이 먼저 먹지 않는다('선발 제외'가 '제외'로 잘리지 않게).
 */
export const EVENT_FACT_RE = /(선발\s?제외|명단\s?제외|목격담|목격|결혼|이혼|열애|결별|파경|재결합|합류|탈퇴|이적|영입|은퇴|복귀|임신|출산|득남|득녀|사망|체포|구속|기소|선고|고소|소송|분쟁|합의|사과|해명|반박|인정|부인|고백|폭로|취소|철회|번복|연기|중단|재개|출시|공개|발표|우승|준우승|압승|완승|쾌승|역전승|참패|완패|연승|연패|탈락|강등|승격|생존|확정|폐지|인상|인하|급등|급락|변신|이별|입증|폭발)/gu;

/** 제목 과장어 — 근거 없이 쓰면 OVER. */
export const HYPE_WORDS_RE = /(충격|경악|발칵|난리|대박|역대급|초유|전말|소름|실화냐|미쳤|폭로)/gu;

/**
 * 제목에 쓴 과장어 중 근거 기사 제목에 없는 것만 돌려준다.
 *
 * 기사가 실제로 "미쳤다" · "대박"이라고 썼다면 그건 지어낸 과장이 아니라 그 바닥의 말이다.
 * 실측(2026-09-17): 스포츠 원천 10건 중 2건이 그 말을 제목에 그대로 쓰고 있었는데,
 * 과장어 사전이 근거를 보지 않아 멀쩡한 소재까지 OVER 로 떨어졌다.
 */
export function hypeWordsBeyondEvidence(title: string, evidenceTitles: readonly string[]): string[] {
  const used = String(title || '').match(HYPE_WORDS_RE) ?? [];
  if (used.length === 0) return [];
  const evidence = evidenceTitles.join(' ');
  return [...new Set(used)].filter((word) => !evidence.includes(word));
}

/** 루머 표지 · 확인 표지. 모든 표본이 루머 표지뿐이고 확인 표지가 하나도 없으면 DROP 위험. */
export const RUMOR_RE = /((?:열애|결혼|이혼|불화|결별|임신|은퇴|사망|잠적|교체)설|루머|카더라|찌라시|의혹|추측)/u;
export const CONFIRM_RE = /(공식|확인|인정|발표|밝혀|입장|직접)/u;

/** 팬 전용 말 — 표본 과반이 이것뿐이면 일반 독자가 1초에 못 알아본다. */
export const FAN_ONLY_RE = /(팬덤|팬미팅|직캠|포토카드|음원\s?차트|컴백\s?티저|응원봉|팬사인회|스밍|총공)/u;

/** 장면 · 실물 단서 — 사진이 호기심을 키우는 제목. */
export const VISUAL_CUE_RE = /(공개|포착|사진|모습|근황|패션|인테리어|실물|비주얼|자태|현장|영상)/u;
