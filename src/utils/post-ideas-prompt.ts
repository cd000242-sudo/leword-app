/**
 * 글감 추론 프롬프트 — 앱(구독 CLI) 경로의 정본.
 *
 * 왜 앱에도 두나: 사이트의 글감 카드는 클라우드 워커를 부른다. 워커는 사이트에
 * 저장된 토큰이 있어야 돌고, 이 PC 의 CLI 로그인(코덱스·제미나이·그록)에는
 * 닿을 수 없다. 그래서 앱이 켜져 있고 엔진이 다 연동돼 있는데도 화면은
 * "연동하세요"를 띄웠다(사장님 지적 2026-08-22, 하네스 agent-wiring-audit.js
 * 로 확인 — 유튜브 글감·외부유입 레이더가 서버 경로만 갖고 있었다).
 *
 * 브리지가 임의 프롬프트를 받아 주면 사용자가 방문한 아무 사이트나 이 PC 의
 * 구독을 태울 수 있다. 그래서 브리지는 **재료만** 받고 문장은 여기서 만든다.
 *
 * 문면은 워커(tmp/cf-worker/worker.js 의 postIdeasFrom)와 같아야 한다 —
 * 같은 버튼이 어느 경로로 가든 같은 결과를 내야 하기 때문이다. 한쪽을 고치면
 * 다른 쪽도 같이 고친다.
 */

/** 글감 재료 — 어디서 온 씨앗인지에 따라 앞머리가 달라진다. */
export type PostIdeaSeed =
  | { kind: 'keyword'; keyword: string; context?: string }
  | { kind: 'kin'; title: string; body?: string };

export interface PostIdea {
  keyword: string;
  sub?: string;
  why?: string;
  clickWhy?: string;
  seo?: string;
  home?: string;
}

function seedLines(seed: PostIdeaSeed): string[] {
  if (seed.kind === 'kin') {
    const title = String(seed.title || '').slice(0, 200);
    const body = String(seed.body || '').slice(0, 4000);
    return [
      '아래 지식인 질문을 읽고, 이 질문을 계기로 **쓸 수 있는 블로그 글**의 키워드와 제목을 만들어라.',
      '',
      `질문 제목: ${title}`,
      ...(body ? [`질문 내용: ${body}`] : []),
    ];
  }
  const keyword = String(seed.keyword || '').slice(0, 60);
  const context = String(seed.context || '').slice(0, 200);
  return [
    '아래 검색어는 지금 유튜브에서 화제인 영상에서 나왔고, 네이버에는 아직 글이 적다.',
    '이 검색어로 **지금 쓰면 선점되는 블로그 글**의 키워드와 제목을 만들어라.',
    '',
    `검색어: ${keyword}`,
    ...(context ? [`화제가 된 영상 제목: ${context}`] : []),
  ];
}

export function buildPostIdeasPrompt(seed: PostIdeaSeed): string {
  return [
    '너는 네이버 블로그 검색 유입을 잘 아는 편집자다.',
    ...seedLines(seed),
    '',
    '키워드 규칙: 이 주제를 찾는 사람이 네이버에 **실제로 칠 법한 검색어**만. 2~4어절.',
    '주어진 재료에 없는 사실·지역·수치를 지어내지 마라. 3~5개.',
    '',
    '제목 규칙(키워드마다 두 개):',
    '- seo: 키워드로 시작 + 구체 정보(절차·비교·조건). 40자 이내. 검색 결과에서 고르게 만든다.',
    '- home: 홈판(디스커버) 노출용. **공식은 넷 다 갖춰야 한다** —',
    '  ① 그 키워드(무슨 글인지 제목만 봐도 알게) ② 서브 키워드 하나(조건·상황·대상)',
    '  ③ 끝판왕급 강한 후킹 ④ 사람냄새. 38자 이내.',
    '  키워드가 빠져 "신고했으면 끝인 줄 알았는데" 처럼 무슨 글인지 모르게 되면 실패다.',
    '  **키워드는 문장 속에 녹여라. 쉼표로 끊어 앞에 붙이면 실패다.**',
    '    나쁨: "보이스피싱 환급금, 신고했는데 언제까지 기다려야 하나요"',
    '    좋음: "보이스피싱 환급금 신고만 하면 끝인 줄 알았는데 아니더라고요"',
    '    좋음: "보이스피싱 지급정지 걸었는데 여기서부터가 진짜더라고요"',
    '  AI 가 쓴 티가 0 이어야 한다: 말하듯(~네요/~어요/~더라고요),',
    '  답은 숨기고(무엇이 아닌지까지만),',
    '  사람의 흔적(삽질·후기·실제 문구), 독자의 진짜 공포·억울함에서 끌어온 자극.',
    '  라벨형("총정리","핵심 정리") 금지.',
    '',
    '',
    '**제목을 쓰기 전에 반드시 먼저 정하라: "이 제목을 왜 클릭하나?"**',
    '누가(어떤 상황에 놓인 사람이) 무엇이 궁금하거나 불안해서 손가락을 멈추는지,',
    '그리고 이 글이 그 사람에게 무엇을 준다고 약속하는지를 clickWhy 에 한 줄로 적어라.',
    '그 동기가 제목에서 읽혀야 한다 — 읽는 사람이 맥락을 못 잡는 후킹, 말이 안 되는',
    '호기심 유발, 본문이 못 지킬 약속은 전부 실패다. 지어낸 반전도 금지.',
    '',
    '서브 키워드는 **home 안에 그대로 들어 있는 말**로 적어라. 지어낸 요약이 아니라',
    '제목에서 오려낸 조각이어야 한다(조건·상황·대상 — 예: "카펫에서", "3겹", "처음 사는 사람").',
    '',
    'JSON 하나만 출력: {"ideas":[{"keyword":"...","sub":"home 안에 들어 있는 서브 키워드","why":"이 키워드가 나오는 이유 한 줄","clickWhy":"누가 왜 클릭하는가 한 줄","seo":"...","home":"..."}]}',
  ].join('\n');
}

/**
 * 모델 응답에서 ideas 를 꺼낸다.
 * 모델이 설명을 앞뒤에 붙이는 일이 잦아 가장 바깥 중괄호만 도려낸다.
 * 못 읽으면 빈 배열이다 — 지어내지 않는다.
 */
export function parsePostIdeas(text: string): PostIdea[] {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const ideas = (parsed as { ideas?: unknown })?.ideas;
  if (!Array.isArray(ideas)) return [];
  return ideas
    .map((row) => {
      const item = row as Record<string, unknown>;
      const keyword = String(item.keyword || '').trim();
      if (!keyword) return null;
      return {
        keyword,
        sub: String(item.sub || '').trim() || undefined,
        why: String(item.why || '').trim() || undefined,
        clickWhy: String(item.clickWhy || '').trim() || undefined,
        seo: String(item.seo || '').trim() || undefined,
        home: String(item.home || '').trim() || undefined,
      } as PostIdea;
    })
    .filter((row): row is PostIdea => row !== null)
    .slice(0, 5);
}
