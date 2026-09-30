import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_TITLE_COUNT,
  TITLE_FRAME_REPEAT_CAP,
  buildBenchmarkTitlePrompt,
  cardsFromBenchmarks,
  checkBenchmarkTitle,
  isQuoteStarter,
  parseBenchmarkTitleReply,
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
    expect(checkBenchmarkTitle('장기전세 만기 총정리 한눈에 보기', card)).toContain('CLICHE');
    expect(checkBenchmarkTitle('장기전세 만기: 이주 상담 안내', card)).toContain('AI_TELL');
    expect(checkBenchmarkTitle('장기전세 만기 충격 반전 이주 상담', card)).toContain('HYPE_WORD');
    expect(checkBenchmarkTitle('장기전세 만기 5억 받는다는 말 들어보셨나요', card)).toContain('UNSUPPORTED_NUMBER');
  });
  it('기준어가 없거나 기사 제목을 베끼면 떨어진다', () => {
    expect(checkBenchmarkTitle('20년 살면 내 집이 되는 줄 알았는데요', card)).toContain('NO_ANCHOR');
    expect(checkBenchmarkTitle('20년 만기 앞둔 장기전세 연장·분양전환·이주 지원은 어떻게 다를까', card)).toContain('ARTICLE_COPY');
  });
  it('길이 상한을 넘으면 떨어진다', () => {
    expect(checkBenchmarkTitle('장기전세 만기가 다가오는데 연장이 되는지 분양전환이 되는지 이주 지원까지 전부 알아봤더니 생각과 달랐어요', card)).toContain('TOO_LONG');
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

describe('titleEndingKey · isQuoteStarter — 판 전체 틀 상한(3개)의 재료', () => {
  it('끝 두 글자(문장부호 제외)와 따옴표 스타터를 읽는다', () => {
    expect(titleEndingKey('장기전세 만기 앞두고 이주 상담 받더라고요')).toBe('고요');
    expect(titleEndingKey('장기전세 만기 이주 상담 받았네요?')).toBe('네요');
    expect(titleEndingKey('장기전세 만기 뒤 이주 지원 조건')).toBe('조건');
    expect(titleEndingKey('장기전세 만기 after 20y')).toBe('');
    expect(isQuoteStarter('"이러니까 바로 풀리네요" 장기전세 만기 이주 상담')).toBe(true);
    expect(isQuoteStarter('장기전세 만기 "이러니까" 상담')).toBe(false);
    expect(TITLE_FRAME_REPEAT_CAP).toBe(3);
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
});

describe('titlesForCards', () => {
  it('검사를 통과한 제목만 20개까지 남기고 안 준 카드는 버린다', async () => {
    // 재료에 없는 숫자는 떨어지므로 변주는 한글 음절로만 한다.
    const good = Array.from({ length: 24 }, (_, i) => `장기전세 만기 앞두고 이주 상담 받아보니 ${['이렇네요', '다르네요', '갈리네요', '묻더라고요'][i % 4]} ${String.fromCharCode(0xac00 + i * 37)}`);
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
  it('같은 제목은 한 번만 센다', async () => {
    const reply = JSON.stringify([{ id: 'abc123', titles: ['장기전세 만기 이주 상담 받아보니 다르네요', '장기전세 만기 이주 상담 받아보니 다르네요!'] }]);
    const result = await titlesForCards([card], async () => ({ reply, provider: 'codex' }));
    expect(result.results[0].titles).toHaveLength(1);
  });
});
