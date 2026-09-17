import { describe, expect, it } from 'vitest';
import { classifyHomefeedCategory } from '../homefeed/category';
import { EVENT_FACT_RE, HYPE_WORDS_RE, TENSION_RULES, hypeWordsBeyondEvidence } from '../homefeed/lexicon';
import { detectTensions, freshDeltaOf } from '../homefeed/story';
import { at, issue, sample, snapshot } from './homefeed-fixtures';

/**
 * 홈판 신호 — 스포츠 · 연예 소재가 후킹 재료로 잡히는가(2026-09-17 실주행 표본).
 *
 * 사장님 지적: "홈판에는 스포츠 · 연예 이슈 · 스타가 많이 뜨는데, 강력한 후킹을 만들 수 있는 키워드를 잡아야 한다."
 * 실측(2026-09-17 04:05 원천): 스포츠 10건 중 후킹 재료 0건, 연예 10건 중 2건.
 * 원인은 사전이 연예 사건 말(결혼 · 이혼 · 이적)에 치우쳐 경기 서사 말을 하나도 모르기 때문이다.
 * 아래 표본은 전부 그날 실제로 들어온 제목이다 — 지어낸 문장이 아니다.
 */

/** 2026-09-17 스포츠 레인 실측 10건. */
const SPORTS_TITLES: readonly string[] = [
  '강정호 키움 틀렸고 NC 데이비슨',
  '김민재 수비 에이스 미쳤다 독일',
  '이불킥 폰세 상위 호환 KBO',
  '손흥민 선발 제외 침묵 SON',
  '이강인 대박 7번 물려준 그리즈만도',
  '이도류 한국 야구 대박 터지나',
  '이럴수 배지환 ML 생존 벼랑',
  '안세영 돌아왔다 압승 쾌승 유럽',
  '전북현대 아슬아슬했던 디펜딩 챔피언 코리아컵',
  '영입 손흥민 떠난 1년 토트넘',
];

/** 2026-09-17 연예 이슈 레인 실측 10건. */
const ENTERTAINMENT_TITLES: readonly string[] = [
  "'좋을텐데 리메이크' 윤후, 가수 선배에게 샤라웃 당해",
  "리센느 미나미, '야호'와 이별 \"하루에 삼십번 외쳐..이제는 마지막\"",
  '정성일, 연진이 딸도 박수쳤다..장발에서 댄디컷 변신',
  "'스윙스 소속사' 래퍼 김감전, 집유 중 또 대마 투약 혐의로 구속",
  'BJ 파이, 성추행 가해자 무죄에 안 좋은 선택..父 "중환자실서 치료"',
  '리센느 미나미, 대세 입증 "광고 문의만 100개..잘 시간도 부족"',
  '조준호, 눈 밑 지방 재배치 시술 고백 "쌍둥이 조준현 얼굴 보고 충격"',
  "고지용, 전처 허양임 상대로 '양육비·면접교섭' 법적 분쟁",
  "청하·남유정, 폰 켜고 의자에 다리 척…소극장 '관크' 목격담 일파만파",
  '서인영, 행사비 100만원에 폭발 "소속사 대표 카드 뺏어서 명품백 구입"',
];

/** 제목 하나에서 잡히는 후킹 재료(사건 사실 말 + 긴장 말) 수. */
function hookMaterialCount(title: string): number {
  const facts = title.match(EVENT_FACT_RE) ?? [];
  const tensions = TENSION_RULES.filter((rule) => rule.re.test(title));
  return facts.length + tensions.length;
}

function withMaterial(titles: readonly string[]): string[] {
  return titles.filter((title) => hookMaterialCount(title) > 0);
}

describe('스포츠 소재가 후킹 재료로 잡힌다', () => {
  it('실측 10건 중 최소 7건에서 걸림 말이 나온다', () => {
    const hit = withMaterial(SPORTS_TITLES);
    expect(hit.length).toBeGreaterThanOrEqual(7);
  });

  it('경기 서사 말(압승 · 선발 제외 · 생존 · 복귀 · 영입)을 사실 말로 센다', () => {
    expect('안세영 돌아왔다 압승 쾌승 유럽'.match(EVENT_FACT_RE)).toContain('압승');
    expect('손흥민 선발 제외 침묵 SON'.match(EVENT_FACT_RE)).toContain('선발 제외');
    expect('이럴수 배지환 ML 생존 벼랑'.match(EVENT_FACT_RE)).toContain('생존');
    expect('영입 손흥민 떠난 1년 토트넘'.match(EVENT_FACT_RE)).toContain('영입');
  });

  it('맞수 비교 · 대체 구도를 긴장으로 읽는다', () => {
    const types = (title: string) => TENSION_RULES.filter((rule) => rule.re.test(title)).map((rule) => rule.type);
    expect(types('이불킥 폰세 상위 호환 KBO')).toContain('rival_compare');
    expect(types('강정호 키움 틀렸고 NC 데이비슨')).toContain('rival_compare');
  });

  it('선수 이름만 있는 제목도 스포츠로 분류된다 — 미분류면 사진 전략이 안 붙는다', () => {
    expect(classifyHomefeedCategory('손흥민 선발 제외 침묵 SON', ['손흥민 선발 제외 침묵 SON'])).toBe('sports');
    expect(classifyHomefeedCategory('안세영 돌아왔다 압승 쾌승 유럽', ['안세영 돌아왔다 압승 쾌승 유럽'])).toBe('sports');
  });
});

describe('연예 소재가 후킹 재료로 잡힌다', () => {
  it('실측 10건 중 최소 7건에서 걸림 말이 나온다', () => {
    const hit = withMaterial(ENTERTAINMENT_TITLES);
    expect(hit.length).toBeGreaterThanOrEqual(7);
  });

  it('고백 · 논란 · 분쟁 · 목격 같은 말을 사실 말로 센다', () => {
    expect('조준호, 눈 밑 지방 재배치 시술 고백'.match(EVENT_FACT_RE)).toContain('고백');
    expect("고지용, 전처 허양임 상대로 '양육비·면접교섭' 법적 분쟁".match(EVENT_FACT_RE)).toContain('분쟁');
    expect("청하·남유정, 소극장 '관크' 목격담 일파만파".match(EVENT_FACT_RE)).toContain('목격담');
  });

  it('스타 이름과 방송 맥락이 있으면 연예로 분류된다', () => {
    expect(classifyHomefeedCategory("'좋을텐데 리메이크' 윤후, 가수 선배에게 샤라웃 당해", ["'좋을텐데 리메이크' 윤후, 가수 선배에게 샤라웃 당해"])).toBe('entertainment');
  });
});

describe('기사에 실제로 있는 말은 과장이 아니다', () => {
  it('근거 제목에 있는 말이면 과장어로 치지 않는다', () => {
    const evidence = ['김민재 수비 에이스 미쳤다 독일', '이도류 한국 야구 대박 터지나'];
    expect(hypeBeyondEvidence('김민재 수비 미쳤다', evidence)).toEqual([]);
    expect(hypeBeyondEvidence('이 소식 대박', evidence)).toEqual([]);
  });

  it('근거에 없는 과장어는 그대로 걸러낸다', () => {
    const evidence = ['손흥민 선발 제외 침묵 SON'];
    expect(hypeBeyondEvidence('손흥민 충격 전말', evidence)).toEqual(['충격', '전말']);
  });

  it('사전 자체는 그대로 둔다 — 근거 없이 쓰면 여전히 과장이다', () => {
    expect('충격 경악 발칵'.match(HYPE_WORDS_RE)).toEqual(['충격', '경악', '발칵']);
  });
});

describe('후킹 세기로 소재를 줄세운다', () => {
  it('재료가 많은 제목이 앞에 온다', () => {
    const ordered = [...SPORTS_TITLES, ...ENTERTAINMENT_TITLES]
      .map((title) => ({ title, score: hookMaterialCount(title) }))
      .sort((a, b) => b.score - a.score);
    expect(ordered[0].score).toBeGreaterThan(0);
    expect(ordered[0].score).toBeGreaterThanOrEqual(ordered[ordered.length - 1].score);
  });

  it('실제 스토리 판정에서도 걸림 말이 생긴다 — 새 사실이 없으면 긴장으로라도 잡는다', () => {
    const before = [sample('손흥민 토트넘 훈련 참가', { url: 'https://a.com/0', press: 'a.com' })];
    const after = [
      sample('손흥민 선발 제외 침묵 SON', { url: 'https://a.com/1', press: 'a.com', image: 'https://img.a.com/1.jpg' }),
      sample('손흥민 복귀 임박 압승 이끈다', { url: 'https://b.com/2', press: 'b.com' }),
    ];
    const rows = [
      snapshot(at(0), [issue('손흥민', { category: 'sports', ranks: { 'signal.bz': 9 }, samples: before })]),
      snapshot(at(40), [issue('손흥민', { category: 'sports', ranks: { 'signal.bz': 4 }, samples: after })]),
    ];
    const { delta } = freshDeltaOf(rows[1].issues[0], { capturedAt: rows[0].capturedAt, issue: rows[0].issues[0] });
    const tensions = detectTensions(after, 3);
    expect(Boolean(delta) || tensions.length > 0).toBe(true);
  });
});

/** 제목에 쓰인 과장어 중 근거 제목에 없는 것만 돌려준다. */
function hypeBeyondEvidence(title: string, evidenceTitles: readonly string[]): string[] {
  return hypeWordsBeyondEvidence(title, evidenceTitles);
}
