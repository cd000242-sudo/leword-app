/**
 * 외부유입용 에이전트 호출 — 지식인 답변 초안 · 레이더 판 평가(2026-10-06 분리).
 * 원래 web-bridge-host 안에만 있어 사이트(127.0.0.1 브리지)로만 탔다. 글 한 편 유입 설계실(앱 화면)도 같은 것을
 * 써야 해서 꺼냈다 — 프롬프트를 두 곳에 복사하면 한쪽만 고쳐지는 사고가 난다. 동작은 옮기기 전과 같다.
 */

export interface KinAnswerInput { title: string; body?: string; withLink: boolean; blogUrl?: string; provider?: string }

/*
 * 지식인 답변 초안(사장님 확정 2026-08-20) — 답변 교리를 프롬프트에 박아
 * 본인 구독으로 생성한다. 게시는 안 한다: 초안만 돌려주고 사용자가 직접
 * 하나씩 단다(자동화는 효과 실측 후 결정).
 */
export async function kinAnswerViaAgent({ title, body, withLink, blogUrl, provider }: KinAnswerInput): Promise<{ answer: string; provider: string }> {
  const { runWithAnyAgent } = await import('../utils/agent-cli/runAny');
  const { createDefaultAgentChain } = await import('../utils/agent-cli/defaultChain');
  const prompt = [
    '너는 네이버 지식인에서 답변을 다는 평범한 사람이다. 아래 질문에 답해라.',
    '',
    `질문 제목: ${title}`,
    ...(body ? [`질문 내용: ${body}`] : []),
    '',
    '규칙 — 하나라도 어기면 실패다:',
    '- AI 가 쓴 티가 0 이어야 한다: 목록·번호·헤더·굵은 글씨 금지, 인사·자기소개 금지,',
    '  "도움이 되셨길 바랍니다"류 맺음말 금지. 아는 사람이 말해 주듯 문단 1~2개.',
    '- 깔끔·담백·정확: 질문이 물은 것만 답한다. 장황하면 실패.',
    '- 모르는 것을 지어내지 마라. 확실한 것만 쓰고, 불확실한 부분은 빼라.',
    '- 말하듯 쓴다: ~돼요/~합니다 혼용, "생각보다 금방 됩니다" 같은 체감 표현 허용.',
    withLink
      ? `- 답변 끝에 이 주소를 사람 말투 한 문장으로 자연스럽게 붙여라: ${blogUrl}`
        + ' (예: "절차 정리해 둔 글이 있어서 남깁니다: …"). 광고 문구 금지.'
      : '- 링크·홍보 문구를 넣지 마라.',
    '',
    '답변 본문만 출력해라 — 따옴표·머리말 없이.',
  ].join('\n');
  // 선택한 엔진을 먼저 쓰고, 실패하면 공통 순서로 나머지를 시도한다.
  const chain = createDefaultAgentChain({ preferredProvider: provider });
  const run = await runWithAnyAgent(prompt, chain, { timeoutMs: 90_000 });
  return { answer: String(run.reply || '').trim(), provider: run.provider };
}

export interface RadarEvaluateInput { items: Array<{ title: string; source: string; link: string }>; myTitle: string; mySummary: string; provider?: string }

export async function radarEvaluateViaAgent({ items, myTitle, mySummary, provider }: RadarEvaluateInput): Promise<{ evaluations: any[]; provider: string }> {
  const { runWithAnyAgent } = await import('../utils/agent-cli/runAny');
  const { createDefaultAgentChain } = await import('../utils/agent-cli/defaultChain');
  const { buildRadarEvaluatePrompt, parseRadarVerdicts } = await import('../utils/radar-evaluate-prompt');
  const prompt = buildRadarEvaluatePrompt({ items, myTitle, mySummary });
  const chain = createDefaultAgentChain({ preferredProvider: provider });
  const run = await runWithAnyAgent(prompt, chain, {
    timeoutMs: 150_000,
    validate: (reply) => { if (parseRadarVerdicts(reply).length === 0) throw new Error('평가를 읽지 못했습니다'); },
  });
  return { evaluations: parseRadarVerdicts(String(run.reply || '')), provider: run.provider };
}
