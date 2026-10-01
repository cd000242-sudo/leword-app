import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_TITLE_COUNT,
  BENCHMARK_TITLE_MAX_CHARS,
  BENCHMARK_TITLE_MIN_CHARS,
  feedTitleSamples,
  homefeedTitleRuleLines,
  parseBenchmarkTitleKinds,
  TITLE_FRAME_REPEAT_CAP,
  buildBenchmarkTitlePrompt,
  cardsFromBenchmarks,
  checkBenchmarkTitle,
  checkFeedTitle,
  homefeedTitleSurfaceReasons,
  isQuoteStarter,
  isSpokenEnding,
  parseBenchmarkTitleReply,
  quoteStarterCap,
  spokenEndingCap,
  titleEndingKey,
  titlesForCards,
  type BenchmarkTitleCard,
} from '../benchmark-title-engine';

const card: BenchmarkTitleCard = {
  id: 'abc123',
  keyword: '장기전세 20년 만기 연장',
  category: '생활경제·주거',
  title: '20년 만기 앞둔 장기전세, 연장·분양전환·이주 지원은 어떻게 다를까',
  summary: '서울시는 장기전세 만기 원칙과 조건에 맞는 가구의 이주 상담을 설명했습니다. 3억 원 지원 주장은 확인되지 않았습니다.',
  sourceTitles: ['20년 만기 앞둔 장기전세, 연장·분양전환·이주 지원은 어떻게 다를까'],
  relatedKeywords: ['장기전세', '만기', '연장'],
};

describe('cardsFromBenchmarks', () => {
  it('낡은 소재·협찬 소재는 제목을 짓지 않는다', () => {
    const payload = { candidates: [
      { id: 'a', keyword: '가 나', title: 't', category: 'c', summary: 's', status: 'review-now', flags: [], sources: [{ title: 'x' }] },
      { id: 'b', keyword: '가 나', title: 't', category: 'c', summary: 's', status: 'stale', flags: [], sources: [] },
      { id: 'c', keyword: '가 나', title: 't', category: 'c', summary: 's', status: 'verify', flags: ['sponsored'], sources: [] },
    ] };
    expect(cardsFromBenchmarks(payload).map((row) => row.id)).toEqual(['a']);
  });
});

describe('checkBenchmarkTitle', () => {
  it('교리를 지킨 제목은 통과한다', () => {
    expect(checkBenchmarkTitle('장기전세 20년 살고 나면 이주 상담부터 받게 되더라고요', card)).toEqual([]);
  });
  it('쉼표 이분법·라벨형·콜론·과장어·재료 밖 숫자는 떨어진다', () => {
    expect(checkBenchmarkTitle('장기전세 만기, 연장 방법', card)).toContain('COMMA_SPLIT');
    expect(checkBenchmarkTitle('장기전세 만기 앞두고 이주 상담 받았는데, 결과가 달랐네요', card)).toContain('COMMA_SPLIT');
    expect(checkBenchmarkTitle('장기전세 만기 총정리 한눈에 보기', card)).toContain('CLICHE');
    expect(checkBenchmarkTitle('장기전세 만기: 이주 상담 안내', card)).toContain('AI_TELL');
    expect(checkBenchmarkTitle('장기전세 만기 충격 반전 이주 상담', card)).toContain('HYPE_WORD');
    expect(checkBenchmarkTitle('장기전세 만기 5억 받는다는 말 들어보셨나요', card)).toContain('UNSUPPORTED_NUMBER');
  });
  it('기준어가 없거나 기사 제목을 베끼면 떨어진다', () => {
    expect(checkBenchmarkTitle('20년 살면 내 집이 되는 줄 알았는데요', card)).toContain('NO_ANCHOR');
    expect(checkBenchmarkTitle('20년 만기 앞둔 장기전세 연장·분양전환·이주 지원은 어떻게 다를까', card)).toContain('ARTICLE_COPY');
  });
  it('avoidTitles(홈판 본보기)는 베끼기만 잡는다 — 그 안의 숫자·과장어는 재료가 아니다', () => {
    const withAvoid = { ...card, avoidTitles: ['"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', '전기차 세금 혜택 2029년 끝난다는 말에 계약자들이 먼저 보는 것'] };
    expect(checkBenchmarkTitle('"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', withAvoid)).toContain('ARTICLE_COPY');
    expect(checkBenchmarkTitle('장기전세 만기 2029년 이주 상담 받아 보니 다른 조건', withAvoid)).toContain('UNSUPPORTED_NUMBER');
    // 본보기가 없으면(옛 카드) 같은 제목이 베끼기로 잡히지 않는다
    expect(checkBenchmarkTitle('"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정', card)).not.toContain('ARTICLE_COPY');
  });
  it('홈판 어투의 쉼표는 둔다 — 인용 속 쉼표 · 기준어가 아닌 사실 마디 뒤 쉼표(홈판 실측 90일: 쉼표 든 제목 30%)', () => {
    expect(checkBenchmarkTitle('"연장 되는 줄 알았는데, 아니었다" 장기전세 만기 이주 상담 후기', card)).toEqual([]);
    expect(checkBenchmarkTitle('장기전세 만기 가구 이주 상담 시작, 분양전환은 따로 있었다', card)).toEqual([]);
  });
  it('길이 상한(홈판 실측 중앙 40자 · 상위 75% 47자 → 50자)을 넘으면 떨어진다', () => {
    expect(BENCHMARK_TITLE_MAX_CHARS).toBe(50);
    expect(checkBenchmarkTitle('장기전세 만기가 다가오는데 연장이 되는지 분양전환이 되는지 이주 지원까지 전부 알아봤더니 생각과 달랐어요', card)).toContain('TOO_LONG');
    // 49자 — 옛 38자 상한이면 떨어졌을 홈판 어투 길이
    expect(checkBenchmarkTitle('장기전세 만기 앞두고 이주 상담 먼저 받으라는데 분양전환 조건은 왜 아무도 말을 안 할까', card)).not.toContain('TOO_LONG');
  });
  it('완성된 제목만 — 28자 미만 · 말을 걸다 만 꼬리는 떨어진다(2026-10-01 "제목을 만들다 만 느낌", 우리 판 중앙 27자 vs 홈판 실측 38자)', () => {
    expect(BENCHMARK_TITLE_MIN_CHARS).toBe(28);
    expect(checkFeedTitle('장기전세 만기 이주 상담 결과', card)).toContain('TOO_SHORT');
    expect(checkFeedTitle('장기전세 20년 만기 앞두고 이주 상담 받은 집들 어떻게 됐냐면', card)).toContain('DANGLING_TAIL');
    expect(checkFeedTitle('장기전세 20년 만기 앞두고 이주 상담 받은 결과가 이렇다는데', card)).toContain('DANGLING_TAIL');
    expect(checkFeedTitle('장기전세 20년 만기 앞두고 이주 상담에서 들은 말이요', card)).toContain('DANGLING_TAIL');
    // 홈판 실측 모양: 앞 박자 … 뒤 박자, 끝은 무엇을 얻는지 드러나는 명사구
    expect(checkFeedTitle('20년 살고 나가라더니… 장기전세 만기 가구가 받은 이주 상담 조건', card)).toEqual([]);
  });
  it('무엇이 어떻게인지 없는 껍데기 후킹은 떨어진다(2026-09-30 첫 판 20개 전부)', () => {
    expect(checkBenchmarkTitle('장기전세 만기 두고 반응이 갈리네요', card)).toContain('HOLLOW_HOOK');
    expect(checkBenchmarkTitle('장기전세 연장 안 되는 이유가 있네요', card)).toContain('HOLLOW_HOOK');
    expect(checkBenchmarkTitle('장기전세 만기 앞두고 분위기가 달라졌대요', card)).toContain('HOLLOW_HOOK');
    expect(checkBenchmarkTitle('장기전세 만기 지나면 말이 달라지더라고요', card)).toContain('HOLLOW_HOOK');
  });
  it('사실 재료(facts)가 붙은 카드는 붙여 묻는 말·기사 속 말 하나가 제목에 있어야 한다 — 벤치마크 판(facts 없음)은 그대로', () => {
    const withFacts: BenchmarkTitleCard = { ...card, relatedKeywords: ['장기전세 분양전환', '장기전세 이주지원'], facts: ['서울시 장기전세 만기 가구 이주 상담 시작'] };
    expect(checkBenchmarkTitle('장기전세 20년 살고 나면 어디로 가야 하나 싶더라고요', withFacts)).toContain('NO_SUB');
    expect(checkBenchmarkTitle('장기전세 20년 살고 나면 이주 상담부터 받게 되더라고요', withFacts)).toEqual([]);
    expect(checkBenchmarkTitle('장기전세 분양전환 되는 집은 따로 있었네요', withFacts)).toEqual([]);
    expect(checkBenchmarkTitle('장기전세 20년 살고 나면 어디로 가야 하나 싶더라고요', card)).toEqual([]);
    // 기사 제목을 베끼면 재료여도 실패
    expect(checkBenchmarkTitle('서울시 장기전세 만기 가구 이주 상담 시작', withFacts)).toContain('ARTICLE_COPY');
  });
});

describe('homefeedTitleSurfaceReasons — 카드 없이 제목만 보는 표면 규칙(홈판 본보기 고르기가 쓴다)', () => {
  it('길이 · 상투구 · AI 티 · 껍데기 후킹만 본다 — 기준어·재료·쉼표는 카드가 있어야 하니 안 본다', () => {
    expect(homefeedTitleSurfaceReasons('"그 집 또 갔다" 이번엔 줄이 반대편까지 이어진 사정')).toEqual([]);
    expect(homefeedTitleSurfaceReasons('짧다')).toEqual(['TOO_SHORT']);
    expect(homefeedTitleSurfaceReasons('장기전세 만기 총정리 한눈에 보기')).toEqual(['CLICHE']);
    expect(homefeedTitleSurfaceReasons('장기전세 만기: 이주 상담 안내')).toEqual(['AI_TELL']);
    expect(homefeedTitleSurfaceReasons('장기전세 만기 두고 반응이 갈리네요')).toEqual(['HOLLOW_HOOK']);
    expect(homefeedTitleSurfaceReasons('장기전세 만기가 다가오는데 연장이 되는지 분양전환이 되는지 이주 지원까지 전부 알아봤더니 생각과 달랐어요')).toEqual(['TOO_LONG']);
    // 쉼표 라벨형 · 과장어 · 기준어 없음은 여기서 안 잡힌다
    expect(homefeedTitleSurfaceReasons('장기전세 만기, 연장 방법 충격')).toEqual([]);
  });
  it('checkBenchmarkTitle 과 같은 이유 코드를 낸다 — 두 검사가 갈라지지 않는다', () => {
    for (const title of ['장기전세 만기 총정리 한눈에 보기', '장기전세 만기: 이주 상담 안내', '장기전세 만기 두고 반응이 갈리네요']) {
      const surface = homefeedTitleSurfaceReasons(title);
      expect(checkBenchmarkTitle(title, card).filter((reason) => surface.includes(reason))).toEqual(surface);
    }
  });
});

describe('titleEndingKey · isQuoteStarter · isSpokenEnding — 판 전체 틀 상한의 재료', () => {
  it('끝 두 글자(문장부호 제외)와 따옴표 스타터를 읽는다', () => {
    expect(titleEndingKey('장기전세 만기 앞두고 이주 상담 받더라고요')).toBe('고요');
    expect(titleEndingKey('장기전세 만기 이주 상담 받았네요?')).toBe('네요');
    expect(titleEndingKey('장기전세 만기 뒤 이주 지원 조건')).toBe('조건');
    expect(titleEndingKey('장기전세 만기 after 20y')).toBe('');
    expect(isQuoteStarter('"이러니까 바로 풀리네요" 장기전세 만기 이주 상담')).toBe(true);
    expect(isQuoteStarter('장기전세 만기 "이러니까" 상담')).toBe(false);
    expect(TITLE_FRAME_REPEAT_CAP).toBe(3);
  });
  it('구어 어미(~네요·~고요·~대요·~죠…)는 끝의 문장부호·따옴표를 벗기고 본다 — 명사 끊기는 아니다', () => {
    expect(isSpokenEnding('장기전세 만기 이주 상담 받았네요?')).toBe(true);
    expect(isSpokenEnding('장기전세 만기 앞두고 이주 상담 받더라고요')).toBe(true);
    expect(isSpokenEnding('"이러니까 바로 풀리네요" 장기전세 만기 이주 상담이죠')).toBe(true);
    expect(isSpokenEnding('장기전세 만기 뒤 이주 지원 조건')).toBe(false);
    expect(isSpokenEnding('장기전세 만기 뒤 남는 것은 뭘까')).toBe(false);
  });
  it('따옴표 스타터는 판의 절반(홈판 실측 하루 20건 중 중앙 8), 구어 어미는 판의 열에 하나(실측 1% · 2026-10-01 사장님 "만들다 만 느낌") — 작은 판은 바닥값', () => {
    expect(quoteStarterCap(20)).toBe(10);
    expect(quoteStarterCap(4)).toBe(TITLE_FRAME_REPEAT_CAP);
    expect(spokenEndingCap(20)).toBe(2);
    expect(spokenEndingCap(6)).toBe(2);
  });
});

describe('parseBenchmarkTitleReply', () => {
  it('JSON 배열에서 id 별 제목을 꺼낸다', () => {
    const reply = '설명\n[{"id":"abc123","titles":["가","나"]},{"id":"zzz","titles":["다"]}]';
    const parsed = parseBenchmarkTitleReply(reply);
    expect(parsed.get('abc123')).toEqual(['가', '나']);
    expect(parsed.get('zzz')).toEqual(['다']);
  });
  it('배열이 아니면 빈 결과다', () => {
    expect(parseBenchmarkTitleReply('없음').size).toBe(0);
  });
});

describe('buildBenchmarkTitlePrompt', () => {
  it('카드 id·재료·개수를 싣는다', () => {
    const prompt = buildBenchmarkTitlePrompt([card]);
    expect(prompt).toContain('abc123');
    expect(prompt).toContain(card.summary);
    expect(prompt).toContain('쉼표');
  });
  it('홈판 실측 모양(두 박자 말줄임 · 숫자 · 완결된 명사구 끝)과 실제 홈판 제목 본보기를 싣는다 — 본보기는 베끼지 말라고 못박는다', () => {
    const prompt = buildBenchmarkTitlePrompt([card], ['’79세’ 윤여정, 조용히 전해진 소식… 눈물 바다']);
    expect(prompt).toMatch(/말줄임/);
    expect(prompt).toMatch(/완결/);
    expect(prompt).toMatch(/어떻게 됐냐면/);
    expect(prompt).toContain('’79세’ 윤여정, 조용히 전해진 소식… 눈물 바다');
    expect(prompt).toMatch(/베끼지/);
  });
});

describe('feedTitleSamples — 실제 홈판에 오른 제목 본보기(어드바이저 실측, 저장소에 실은 표본)', () => {
  it('표면 규칙을 통과한 것만 · 같은 끝맺음은 하나씩 · 상한까지', () => {
    const samples = feedTitleSamples(12);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(12);
    expect(samples.every((title) => homefeedTitleSurfaceReasons(title).length === 0)).toBe(true);
    expect(new Set(samples.map(titleEndingKey)).size).toBe(samples.length);
  });
});

describe('titlesForCards', () => {
  it('검사를 통과한 제목만 20개까지 남기고 안 준 카드는 버린다', async () => {
    // 재료에 없는 숫자는 떨어지므로 변주는 한글 음절로만 한다. 끝은 명사구(구어 어미는 판에 둘까지).
    const good = Array.from({ length: 24 }, (_, i) => `장기전세 만기 앞두고 ${String.fromCharCode(0xac00 + i * 37)}씨네가 받은 이주 상담 ${['조건', '순서', '차이', '결과'][i % 4]}`);
    const reply = JSON.stringify([
      { id: 'abc123', titles: [...good, '장기전세 만기, 연장 방법', '장기전세 만기 총정리'] },
      { id: 'ghost', titles: ['장기전세 유령'] },
    ]);
    const result = await titlesForCards([card], async () => ({ reply, provider: 'claude' }));
    expect(result.provider).toBe('claude');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe('abc123');
    expect(result.results[0].titles).toHaveLength(BENCHMARK_TITLE_COUNT);
    expect(result.results[0].rejected.map((row) => row.reasons[0])).toEqual(expect.arrayContaining(['COMMA_SPLIT', 'CLICHE']));
  });
  it('구어 어미로 끝나는 제목은 카드당 둘까지 — 넘치면 SPOKEN_REPEAT 로 떨어진다', async () => {
    const spoken = ['다르네요', '그렇더라고요', '바뀌었대요', '남았네요'].map((end) => `장기전세 20년 만기 앞두고 이주 상담 받아 보니 조건이 ${end}`);
    const result = await titlesForCards([card], async () => ({ reply: JSON.stringify([{ id: 'abc123', titles: spoken }]), provider: 'claude' }));
    expect(result.results[0].titles).toHaveLength(2);
    expect(result.results[0].rejected.map((row) => row.reasons[0])).toEqual(['SPOKEN_REPEAT', 'SPOKEN_REPEAT']);
  });
  it('본보기(실제 홈판 제목)를 그대로 베끼면 떨어진다', async () => {
    // 숫자 · 과장어 없이 다른 규칙은 다 통과하는 제목 — 본보기가 없으면 살아남고, 본보기면 ARTICLE_COPY 로만 떨어져야 한다.
    const sample = '조용히 전해진 소식… 장기전세 만기 가구가 눈물 쏟은 이주 상담';
    const reply = JSON.stringify([{ id: 'abc123', titles: [sample] }]);
    expect((await titlesForCards([card], async () => ({ reply, provider: 'claude' }))).results[0].titles).toEqual([sample]);
    const copied = await titlesForCards([card], async () => ({ reply, provider: 'claude' }), [sample]);
    expect(copied.results).toHaveLength(0);
  });
  it('같은 제목은 한 번만 센다', async () => {
    const reply = JSON.stringify([{ id: 'abc123', titles: ['장기전세 20년 만기 앞두고 이주 상담 받아보니 다르네요', '장기전세 20년 만기 앞두고 이주 상담 받아보니 다르네요!'] }]);
    const result = await titlesForCards([card], async () => ({ reply, provider: 'codex' }));
    expect(result.results[0].titles).toHaveLength(1);
  });
});

describe('원제목 변주 + 새 각도 반반(2026-10-01 사장님 "벤치마킹 제목이랑 갭 차이가 너무 크다" — 겹침 중앙 0.20)', () => {
  const src = { ...card, title: '"원래 좋아했다" 장기전세 20년 만기 가구, 알고보니 이주 상담이 먼저', sourceTitles: ['"원래 좋아했다" 장기전세 20년 만기 가구, 알고보니 이주 상담이 먼저'] };
  it('변주는 원제목과 70% 미만이면 통과(새 각도는 50% 미만) — 핵심 후킹을 살린 변주를 베끼기로 버리지 않는다', () => {
    const variant = '"원래 좋아했다" 장기전세 20년 만기 가구가 이주 상담부터 받은 사정';
    expect(checkFeedTitle(variant, src, 'angle')).toContain('ARTICLE_COPY');
    expect(checkFeedTitle(variant, src, 'variant')).toEqual([]);
    expect(checkFeedTitle(src.title, src, 'variant')).toContain('ARTICLE_COPY');
  });
  it('변주가 원제목에서 너무 멀어지면(겹침 25% 미만) VARIANT_DRIFT — 핵심 후킹을 버린 변주', () => {
    expect(checkFeedTitle('분양전환 조건 몰랐던 장기전세 만기 가구가 놓친 서류 한 장', src, 'variant')).toContain('VARIANT_DRIFT');
  });
  it('홈판 본보기(avoidTitles) 베끼기는 변주여도 50% 기준 그대로', () => {
    const withAvoid = { ...src, avoidTitles: ['조용히 전해진 소식… 장기전세 만기 가구가 눈물 쏟은 이주 상담'] };
    expect(checkFeedTitle('조용히 전해진 소식… 장기전세 만기 가구가 눈물 쏟은 이주 상담', withAvoid, 'variant')).toContain('ARTICLE_COPY');
  });
  it('답의 variants · angles 를 읽고, 옛 titles 답은 새 각도로 읽는다', () => {
    const kinds = parseBenchmarkTitleKinds(JSON.stringify([{ id: 'a', variants: ['v1'], angles: ['a1'] }, { id: 'b', titles: ['t1'] }]));
    expect(kinds.get('a')).toEqual({ variants: ['v1'], angles: ['a1'] });
    expect(kinds.get('b')).toEqual({ variants: [], angles: ['t1'] });
  });
  it('변주 10 · 새 각도 10 을 번갈아 싣고, 한쪽이 모자라면 다른 쪽으로 채운다', async () => {
    const syll = (i: number) => String.fromCharCode(0xac00 + i * 37);
    const variants = Array.from({ length: 12 }, (_, i) => `"원래 좋아했다" 장기전세 20년 만기 ${syll(i)}씨네가 이주 상담부터 받은 사정`);
    const angles = Array.from({ length: 4 }, (_, i) => `분양전환 앞둔 ${syll(i + 20)}씨네 장기전세 만기 서류 순서 차이`);
    const reply = JSON.stringify([{ id: src.id, variants, angles }]);
    const result = await titlesForCards([src], async () => ({ reply, provider: 'claude' }), []);
    const titles = result.results[0].titles;
    expect(titles).toHaveLength(16);
    expect(titles.slice(0, 4)).toEqual([variants[0], angles[0], variants[1], angles[1]]);
    expect(titles.filter((t) => t.startsWith('"원래')).length).toBe(12);
  });
  it('벤치마크 프롬프트는 두 묶음을 청하고, 원제목 비슷하면 실패라는 공통 문장을 변주 허용 문장으로 바꾼다 — 오늘 쓸 글 문장은 그대로', () => {
    const prompt = buildBenchmarkTitlePrompt([src], []);
    expect(prompt).toMatch(/variants/);
    expect(prompt).toMatch(/angles/);
    expect(prompt).toMatch(/핵심 후킹/);
    expect(prompt).not.toContain('재료의 제목을 조금 바꾼 제목 금지');
    expect(homefeedTitleRuleLines().join('\n')).toContain('재료의 제목을 조금 바꾼 제목 금지');
  });
});
