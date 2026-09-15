/**
 * 글감 주제 판정(쇼핑 · 정책 · AI) — 앱 브리지용 프롬프트와 파서.
 *
 * 사이트 AI 는 앱 브리지 전용이다(2026-09-16 사장님 결정 "브리지 전용으로 정리" · "앱 브리지로 옮기기").
 * 워커(gapTopicClassify)에만 있던 판정을 앱으로 옮겼다. 프롬프트 · 20개 묶음 · 번호 매핑은 워커와 같다 —
 * 사이트가 쓰던 결과 모양({ keyword, shopping, policy, ai })과 수집분별 캐시를 그대로 쓸 수 있게.
 * 점수 · 수치를 만들지 않는다. 셋 다 예/아니오 분류다.
 */
import { tryExtractJson } from './agent-cli/parse';

/** 한 번에 다 물으면 출력이 잘린다(레이더 실측 교훈) — 20개씩 묶는다. */
export const GAP_TOPICS_CHUNK = 20;

export interface GapTopicVerdict {
  keyword: string;
  shopping: boolean;
  policy: boolean;
  ai: boolean;
}

export function chunkGapTopicKeywords(keywords: string[]): string[][] {
  const chunks: string[][] = [];
  for (let offset = 0; offset < keywords.length; offset += GAP_TOPICS_CHUNK) {
    chunks.push(keywords.slice(offset, offset + GAP_TOPICS_CHUNK));
  }
  return chunks;
}

export function buildGapTopicsPrompt(chunk: string[]): string {
  return [
    '너는 네이버 블로그 글감 분류자다. 각 검색어를 판정하라.',
    '- shopping: 이 검색어로 검색한 사람이 살 수 있는 구체적 물건(제품·소모품·굿즈)이 있는가 — 제휴 링크를 걸 만한가',
    '- policy: 정부 지원금·복지·정책·제도 관련인가',
    '- ai: AI 도구·서비스·인공지능 주제인가',
    '확실할 때만 true 다. 모르면 false — 지어내지 마라.',
    '',
    chunk.map((keyword, index) => `${index + 1}. ${keyword}`).join('\n'),
    '',
    'JSON 하나만: {"topics":[{"index":1,"shopping":false,"policy":false,"ai":false}]}',
    `검색어는 ${chunk.length}개다 — 전부 판정하라.`,
  ].join('\n');
}

/** 답을 판정 목록으로 — 묶음 밖 번호 · 겹친 번호는 버리고, true 가 아닌 값은 false 로 본다. */
export function parseGapTopics(reply: string, chunk: string[]): GapTopicVerdict[] {
  const parsed = tryExtractJson(String(reply || '')) as { topics?: unknown } | undefined;
  const rows = parsed && Array.isArray(parsed.topics) ? parsed.topics : [];
  const seen = new Set<number>();
  const verdicts: GapTopicVerdict[] = [];
  for (const row of rows as Array<Record<string, unknown> | null>) {
    const index = Number(row?.index);
    if (!row || !Number.isInteger(index) || index < 1 || index > chunk.length || seen.has(index)) continue;
    seen.add(index);
    verdicts.push({
      keyword: chunk[index - 1],
      shopping: row.shopping === true,
      policy: row.policy === true,
      ai: row.ai === true,
    });
  }
  return verdicts;
}
