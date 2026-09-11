import { describe, expect, it } from 'vitest';
import { isNewsyTitle, hasHumanVoice, NEWSY_TAILS } from '../topic-briefs';

/**
 * 뉴스 제목을 그대로 옮겨 놓던 것(2026-09-11).
 *
 * 사장님 "제목후보는 누구나 생각할수있고 ai로 돌리면 누구나 뽑을수있는 그런 제목이야
 *        누가 쓰겠니 나같아도 안쓸것같은데" → "유튜브 제목을 정할때 자극적으로 정하자나? 그걸참고해봐"
 *
 * 오늘 오후 회차가 실제로 내놓은 것:
 *   곽빈 아시안게임 키플레이어로 꼽힌 이유          ← 통신사 헤드라인
 *   하반기 공채 삼성·한화손보 9월 중순 원서접수      ← 기사 리드
 *   LG전자 휴머노이드 액추에이터 연내 양산 나선다     ← 보도 말투
 *   [인용] 곽빈 올 시즌 11승 7패 평균자책점 2.26 기록  ← 답을 제목에서 다 줘 버림
 *   [AI답변] 곽빈 올 시즌 성적 어떻게 되는지          ← 검색창에 치는 말이지 제목이 아님
 *
 * 원인은 프롬프트에 서로 반대인 규칙을 같이 넣은 것이다:
 *   [인용] "카드의 숫자·날짜를 제목에 넣어라"  vs  공통 "답을 제목에 다 적지 마라"
 *   [AI답변] "되는지·인가요로 끝내라"          →  "…어떻게 되는지" 로봇 말투가 고정된다
 *
 * 이 프로젝트에는 이미 교리가 있다(feedback_home_title_doctrine, 사장님이 4회 반복해 확정):
 *   메인키워드 + 서브키워드 + **자극적인 강한 훅** + 사람냄새 — 넷 다.
 *   앵커: "포켓몬고 위치정보 오류 이러니까 바로 풀리네요"
 * 오늘의 글감 프롬프트가 그 교리를 안 쓰고 있었다.
 */
describe('보도 말투를 잡아낸다', () => {
  it('오늘 실제로 나온 기사형 제목을 잡는다', () => {
    for (const t of [
      '곽빈 아시안게임 키플레이어로 꼽힌 이유',
      'LG전자 휴머노이드 액추에이터 연내 양산 나선다',
      '하반기 공채 삼성·한화손보 9월 중순 원서접수',
      '상병수당 2027년 도입 앞두고 열린 공청회',
    ]) {
      expect(isNewsyTitle(t), `못 잡음: ${t}`).toBe(true);
    }
  });

  it('교리 앵커는 안 잡는다 — 이게 잡히면 규칙이 틀린 것이다', () => {
    expect(isNewsyTitle('포켓몬고 위치정보 오류 이러니까 바로 풀리네요')).toBe(false);
    expect(isNewsyTitle('김부장 드라마만 보고 결말 안다고 하면 큰일 납니다')).toBe(false);
  });

  it('사람 말투로 고쳐 쓴 것은 통과한다', () => {
    for (const t of [
      '독감 유행 한 달 빨라진 이유 병원에서 듣고 놀랐어요',
      '하반기 공채 원서 내기 전에 이것부터 확인 안 하면 후회해요',
      '곽빈 와일드카드 발탁 팬들이 갈린 진짜 이유가 있더라고요',
    ]) {
      expect(isNewsyTitle(t), `잘못 잡음: ${t}`).toBe(false);
    }
  });

  it('잡는 말이 무엇인지 드러나 있다 — 숨은 규칙을 만들지 않는다', () => {
    expect(NEWSY_TAILS.length).toBeGreaterThan(3);
  });
});

describe('사람 냄새가 있는지 본다', () => {
  it('구어체 어미가 있으면 사람 말투로 본다', () => {
    expect(hasHumanVoice('이러니까 바로 풀리네요')).toBe(true);
    expect(hasHumanVoice('안 하면 후회해요')).toBe(true);
    expect(hasHumanVoice('갈린 진짜 이유가 있더라고요')).toBe(true);
    expect(hasHumanVoice('큰일 납니다')).toBe(true);
  });

  it('보고서 말투는 사람 말투로 안 본다', () => {
    expect(hasHumanVoice('연내 양산 나선다')).toBe(false);
    expect(hasHumanVoice('9월 중순 원서접수')).toBe(false);
    expect(hasHumanVoice('키플레이어로 꼽힌 이유')).toBe(false);
  });
});

describe('프롬프트가 교리를 들고 있다', () => {
  it('자극·훅·사람냄새를 시키고, 앵커를 보여 준다', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'topic-briefs.ts'), 'utf8');
    expect(src).toContain('포켓몬고 위치정보 오류 이러니까 바로 풀리네요');
    expect(src).toMatch(/자극/);
    expect(src).toMatch(/기사 제목|보도|뉴스 제목/);
  });

  it('서로 반대인 규칙을 없앴다 — 인용 갈래가 답을 다 적게 시키지 않는다', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'topic-briefs.ts'), 'utf8');
    expect(src, '아직 숫자를 제목에 박으라고 시킨다').not.toContain('카드에 있는 **숫자나 날짜**를 제목 안에 넣어라');
  });
});

describe('기사형 제목을 실제로 버린다', () => {
  it('sanitizeTitles 가 보도 말투를 떨어뜨린다', async () => {
    const { sanitizeTitles } = await import('../topic-briefs');
    const kws = ['곽빈', '곽빈 아시안게임'];
    const out = sanitizeTitles([
      { target: '검색', type: '정리형', text: '곽빈 아시안게임 대표팀 와일드카드로 합류했다' },
      { target: '검색', type: '경험형', text: '곽빈 아시안게임 발탁 팬들이 갈린 진짜 이유가 있더라고요' },
    ], '다른 제목', 4, kws);
    const texts = out.map((t) => t.text);
    expect(texts, '기사형이 살아남았다').not.toContain('곽빈 아시안게임 대표팀 와일드카드로 합류했다');
    expect(texts).toContain('곽빈 아시안게임 발탁 팬들이 갈린 진짜 이유가 있더라고요');
  });

  it('버리는 이유가 코드에 드러나 있다', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'topic-briefs.ts'), 'utf8');
    expect(src).toContain('isNewsyTitle(text)');
  });
});

describe('사람 말투를 앞세운다', () => {
  /*
   * 꼬리 목록만으로는 못 잡는다 — 실측(2026-09-11 오후 회차 73개):
   *   기사형으로 걸린 것 7개(9.6%) · **사람 말투 0개**.
   *   "독감 유행 왜 예년보다 한 달 빨라졌나" 는 꼬리에 안 걸리는데 여전히 신문 제목이다.
   * 진짜 신호는 '사람 말투가 없다' 인데, 그걸 그대로 탈락시키면 그 회차가 통째로 빈다.
   * 그래서 버리지 않고 **앞세운다.** 고르는 건 사장님이 한다.
   */
  it('같은 갈래 안에서 사람 말투가 먼저 온다', async () => {
    const { sanitizeTitles } = await import('../topic-briefs');
    const kws = ['독감 유행'];
    const out = sanitizeTitles([
      { target: '검색', type: '정리형', text: '독감 유행 왜 예년보다 한 달 빨라졌나' },
      { target: '검색', type: '경험형', text: '독감 유행 한 달 빨라진 이유 병원에서 듣고 놀랐어요' },
    ], '다른 제목', 4, kws);
    expect(out[0].text).toBe('독감 유행 한 달 빨라진 이유 병원에서 듣고 놀랐어요');
  });

  it('사람 말투가 하나도 없어도 회차가 비지 않는다', async () => {
    const { sanitizeTitles } = await import('../topic-briefs');
    const out = sanitizeTitles([
      { target: '검색', type: '정리형', text: '독감 유행 왜 예년보다 한 달 빨라졌나' },
    ], '다른 제목', 4, ['독감 유행']);
    expect(out).toHaveLength(1);
  });
});
