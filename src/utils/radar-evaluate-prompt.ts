/**
 * 외부유입 레이더 평가 프롬프트 — 앱(본인 구독)으로 넘어갈 때 쓴다.
 *
 * 왜 앱에도 있나(사장님 지시 2026-08-23): 사이트 토큰 하나가 죽으면 레이더가
 * 통째로 멈췄다. 키워드 분석·유튜브 글감은 앱으로 넘어가는 길이 있는데
 * 레이더만 없었다. 앱만 켜 두면 사이트 토큰이 만료돼도 계속 돈다.
 *
 * 브리지 원칙: 사이트는 **재료만** 보낸다(후보 목록 + 내 글 요지).
 * 문장은 여기서 만든다 — 임의 프롬프트가 실행 경로로 흘러가지 않게.
 */

export interface RadarCandidate {
  title: string;
  source: string;
  link: string;
}

export interface RadarVerdict {
  index: number;
  relevance: number;
  urgency: number;
  commercialValue: number;
  trafficPotential: number;
  contentMatch: number;
  spamRisk: number;
  why: string;
}

export function buildRadarEvaluatePrompt(input: {
  items: RadarCandidate[];
  myTitle: string;
  mySummary: string;
}): string {
  const lines = input.items.map((item, i) => `${i + 1}. [${item.source || '판 미상'}] ${item.title}`);
  return [
    '너는 검색 유입을 만드는 블로그 운영자다. 아래는 내 글 하나와,',
    '그 글이 답이 될 만한 질문·게시글 후보다. 각 후보가 **지금 답을 달 가치가 있는지**',
    '판단하라.',
    '',
    `내 글 제목: ${input.myTitle || '(없음)'}`,
    input.mySummary ? `내 글 요지: ${input.mySummary}` : '',
    '',
    '후보:',
    ...lines,
    '',
    '각 후보를 0~100 으로 평가하라. 제목에서 읽히는 것만 근거로 쓴다 —',
    '열어 보지 않았으므로 본문 내용을 지어내지 마라.',
    '- relevance: 내 글 주제와 얼마나 맞는가',
    '- urgency: 묻는 사람이 지금 급한가',
    '- commercialValue: 돈이 걸린 문제인가',
    '- trafficPotential: 답을 달면 사람이 넘어올 만한가',
    '- contentMatch: 내 글이 실제로 그 답을 갖고 있는가',
    '- spamRisk: 링크를 달면 광고로 보여 지워질 위험 (높을수록 나쁘다)',
    '- why: 한 문장 근거',
    '',
    'JSON 하나만 출력: {"evaluations":[{"index":1,"relevance":0,"urgency":0,',
    '"commercialValue":0,"trafficPotential":0,"contentMatch":0,"spamRisk":0,"why":"..."}]}',
  ].filter(Boolean).join('\n');
}

/** 응답에서 평가만 추려 낸다. 형식이 어긋난 항목은 버린다 — 0 으로 채우지 않는다. */
export function parseRadarVerdicts(text: string): RadarVerdict[] {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: unknown = null;
  try { parsed = JSON.parse(match[0]); } catch { return []; }
  const rows = (parsed as { evaluations?: unknown })?.evaluations;
  if (!Array.isArray(rows)) return [];
  const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  };
  return rows.map((row) => {
    const item = (row || {}) as Record<string, unknown>;
    const index = Number(item.index);
    if (!Number.isFinite(index) || index < 1) return null;
    return {
      index,
      relevance: num(item.relevance),
      urgency: num(item.urgency),
      commercialValue: num(item.commercialValue),
      trafficPotential: num(item.trafficPotential),
      contentMatch: num(item.contentMatch),
      spamRisk: num(item.spamRisk),
      why: String(item.why || '').slice(0, 200),
    };
  }).filter((row): row is RadarVerdict => row !== null);
}
