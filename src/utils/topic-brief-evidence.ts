import type { BriefEditorial, FactCard, TopicBrief } from './topic-briefs';
import { extractDates } from './topic-brief-dates';
import { hasFabricatedExperience, sanitizeTitles } from './topic-brief-titles';

const text = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
const norm = (value: unknown) => text(value).normalize('NFKC').replace(/\s+/g, '');
const strings = (value: unknown, limit = 8) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map(text).filter(Boolean).slice(0, limit) : [];
const unique = <T>(values: T[]) => [...new Set(values)];
const idOf = (id: unknown) => String(id ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const sourceTexts = (fact: FactCard) => [fact.title, fact.snippet, fact.body || ''].filter(Boolean);
const safeMeta = (value: unknown, fallback = '') => hasFabricatedExperience(value) ? fallback : text(value).slice(0, 500);

/** 높은 경쟁을 vacancy 값으로 뒤집지 않는다. invalid/미측정은 추천에 쓰지 않는다. */
export function serpFitOf(facing: number | null, _vacancy: number | null): TopicBrief['serpFit'] {
  if (typeof facing !== 'number' || !Number.isInteger(facing) || facing < 0 || facing > 10) return '미측정';
  if (facing <= 2) return '높음';
  return facing <= 5 ? '보통' : '낮음';
}

/** 검증되지 않은 동의어·부분 토큰 확장을 피하고 원검색 전체가 보존된 좁은 말만 사용한다. */
export function isNarrowerKeyword(core: string, candidate: string): boolean {
  const original = norm(core).toLowerCase();
  const narrower = norm(candidate).toLowerCase();
  return original.length >= 2 && narrower.length > original.length && narrower.includes(original)
    && text(candidate).split(/\s+/).length <= 5;
}

function quantities(value: string): string[] {
  return [...value.matchAll(/\d[\d,]*(?:\.\d+)?\s*(?:(?:조|억|만|천)\s*)?(?:원|퍼센트|%|명|개|회|배|세|승|패|점|시간|분|개월|주간|일간|일\s*(?:이내|이상|이하)|월|년|일)(?!\d)/g)]
    .map(match => norm(match[0]).replace(/,/g, ''));
}

/** 전 출력에서 경험·날짜·단위가 있는 수치 날조를 먼저 거른다. 의미 검토는 별도 검토 단계가 담당한다. */
export function claimIssue(value: unknown, facts: FactCard[], anchor: Date): string | null {
  const output = text(value);
  if (!output) return null;
  if (hasFabricatedExperience(output)) return '제공되지 않은 직접 경험 주장';
  const sources = facts.flatMap(sourceTexts);
  const suppliedDates = new Set(facts.flatMap(f => [...f.dates, ...sourceTexts(f).flatMap(s => extractDates(s, f.publishedAt))]));
  const foreignDate = extractDates(output, anchor.toISOString()).find(date => !suppliedDates.has(date));
  if (foreignDate) return `근거에 없는 날짜 ${foreignDate}`;
  const sourceValues = new Set(sources.flatMap(quantities));
  const foreignQuantity = quantities(output).find(quantity => !sourceValues.has(quantity));
  if (foreignQuantity) return `근거에 없는 수치 ${foreignQuantity}`;
  const sourceNumbers = new Set(sources.flatMap(s => [...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => m[0].replace(/,/g, ''))));
  const foreignNumber = [...output.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => m[0].replace(/,/g, '')).find(number => !sourceNumbers.has(number));
  if (foreignNumber) return `근거에 없는 숫자 ${foreignNumber}`;
  return null;
}

/** 부정·조건절을 잘라 다른 뜻을 만들지 않도록 문장 전체 발췌만 지원한다. */
function isExactQuote(quote: string, fact: FactCard): boolean {
  const expected = norm(quote);
  if (quote.length < 8 || quote.length > 200 || /(?:\.{2,}|…)\s*$/.test(quote)) return false;
  return sourceTexts(fact).some(source => {
    if (norm(source) === expected) return true;
    const sentences = source.split(/(?<=[.!?。])\s+|[\r\n]+/).map(text).filter(Boolean);
    return sentences.some((_, index) => {
      let joined = '';
      for (let end = index; end < Math.min(index + 3, sentences.length); end++) {
        joined += norm(sentences[end]);
        if (joined === expected) return true;
        if (joined.length > expected.length) break;
      }
      return false;
    });
  });
}

const pending = (reason: string): BriefEditorial => ({ version: 2, status: 'needs_research', summary: '', audience: '', answers: [], missing: [reason, '요약을 뒷받침하는 원문 문장을 확인해야 합니다.', '독자의 핵심 질문에 답할 수 있는 근거가 부족합니다.'], outline: ['출처에서 확인된 사실', '추가 확인이 필요한 항목'], angle: '' });

/** 생성단계의 supported는 잠정값이다. 독립 review가 통과해야 최종 추천할 수 있다. */
export function validateEditorial(raw: unknown, facts: FactCard[], anchor: Date): BriefEditorial {
  if (!raw || typeof raw !== 'object' || (raw as any).version !== 2) return pending('기존 글감은 질문별 답과 출처 연결을 다시 검증해야 합니다.');
  const input = raw as Partial<BriefEditorial>;
  const byId = new Map(facts.map(f => [f.id, f]));
  const missingShapeValid = Array.isArray(input.missing) && input.missing.every(item => typeof item === 'string' && item.trim().length > 0);
  const missing = strings(input.missing, 12).map(item => safeMeta(item, '추가 사실 확인이 필요합니다.'));
  if (!missingShapeValid) missing.push('추가 확인 항목의 형식이 올바르지 않아 다시 검증해야 합니다.');
  const answers: BriefEditorial['answers'] = [];
  for (const candidate of Array.isArray(input.answers) ? input.answers.slice(0, 5) : []) {
    const question = text(candidate?.question);
    const answer = text(candidate?.answer);
    const ids = unique(strings(candidate?.factIds).map(idOf));
    const excerpts = (Array.isArray(candidate?.excerpts) ? candidate.excerpts.slice(0, 3) : [])
      .map(e => ({ factId: idOf(e?.factId), text: text(e?.text) }));
    const sources = ids.map(id => byId.get(id)).filter((f): f is FactCard => Boolean(f));
    const valid = question.length >= 4 && answer.length >= 8 && ids.length > 0 && sources.length === ids.length && excerpts.length > 0
      && ids.every(id => excerpts.some(e => e.factId === id))
      && excerpts.every(e => ids.includes(e.factId) && isExactQuote(e.text, byId.get(e.factId)!))
      && (norm(answer) === excerpts.map(e => norm(e.text)).join('') || excerpts.some(e => norm(e.text) === norm(answer)))
      && !claimIssue(question, sources, anchor) && !claimIssue(answer, sources, anchor);
    if (!valid) { missing.push(`${safeMeta(question, '핵심 질문') || '핵심 질문'} — 답과 원문 근거를 확인해야 합니다.`); continue; }
    answers.push({ question, answer, factIds: ids, excerpts });
  }
  let summary = text(input.summary);
  if (!summary || !facts.some(f => isExactQuote(summary, f)) || claimIssue(summary, facts, anchor)) {
    summary = answers[0]?.answer || '';
    missing.push('요약을 뒷받침하는 원문 문장을 확인해야 합니다.');
  }
  if (!answers.length) missing.push('독자의 핵심 질문에 답할 수 있는 근거가 부족합니다.');
  const checkedMeta = [input.audience, input.angle, ...strings(input.outline)];
  if (checkedMeta.some(value => claimIssue(value, facts, anchor))) missing.push('독자·구성 설명에 포함된 사실을 확인해야 합니다.');
  const reviewShapeValid = input.review && typeof input.review.passed === 'boolean' && Array.isArray(input.review.issues)
    && input.review.issues.every(issue => typeof issue === 'string' && issue.trim().length > 0);
  const review = input.review !== undefined || !missingShapeValid ? {
    passed: Boolean(reviewShapeValid && missingShapeValid && input.review!.passed && input.review!.issues.length === 0),
    issues: reviewShapeValid
      ? strings(input.review!.issues).map(issue => safeMeta(issue, '독립 검토에서 추가 확인을 요청했습니다.'))
      : ['독립 검토 결과의 형식이 올바르지 않아 다시 검증해야 합니다.'],
  } : undefined;
  if (review && !review.passed && !review.issues.length) review.issues.push('추가 확인 항목과 독립 검토 결과를 다시 검증해야 합니다.');
  return {
    version: 2,
    status: missing.length === 0 && answers.length > 0 && input.status === 'supported' && review?.passed !== false ? 'supported' : 'needs_research',
    summary, audience: safeMeta(input.audience), answers, missing: unique(missing).slice(0, 12),
    outline: strings(input.outline, 6).map(item => safeMeta(item)).filter(Boolean), angle: safeMeta(input.angle),
    ...(review ? { review } : {}),
  };
}

function persistedFacts(brief: TopicBrief): FactCard[] {
  return (brief.facts || []).map(f => ({ ...f, field: brief.field, snippet: f.snippet || '', body: (f.evidenceExcerpts || []).join('\n'), dates: extractDates(`${f.title} ${f.snippet || ''} ${(f.evidenceExcerpts || []).join(' ')}`, f.publishedAt) }));
}

/** 구형 JSON은 버리지 않는다. 안전한 원자료는 남기고 검증 전 출력의 확신과 경험만 제거한다. */
export function normalizeBriefForDisplay(brief: TopicBrief): TopicBrief {
  const facts = persistedFacts(brief);
  const published = new Date(facts[0]?.publishedAt || '2000-01-01T00:00:00Z');
  const anchor = Number.isNaN(published.getTime()) ? new Date('2000-01-01T00:00:00Z') : published;
  const editorial = validateEditorial(brief.editorial, facts, anchor);
  if (editorial.review?.passed !== true) editorial.status = 'needs_research';
  const coreKeyword = text(brief.coreKeyword);
  const safeTitle = `${coreKeyword || '글감'} 확인된 내용과 더 알아볼 점`;
  const title = claimIssue(brief.title, facts, anchor) ? safeTitle : text(brief.title) || safeTitle;
  const keywords = unique([coreKeyword, ...(brief.keywords || []).filter(k => isNarrowerKeyword(coreKeyword, k))].filter(Boolean));
  const alternative = brief.alternative && isNarrowerKeyword(coreKeyword, brief.alternative.keyword)
    ? { ...brief.alternative, serpFit: serpFitOf(brief.alternative.serpFacing, brief.alternative.serpVacancy) } : brief.alternative === undefined ? undefined : null;
  const result: TopicBrief = {
    ...brief, title, coreKeyword, keywords, editorial,
    value: claimIssue(brief.value, facts, anchor) ? editorial.summary : text(brief.value),
    primaryIntent: safeMeta(brief.primaryIntent, `${coreKeyword} 확인`),
    experience: safeMeta(brief.experience, '직접 경험은 별도로 확보해야 합니다.'),
    differentiation: safeMeta(brief.differentiation, editorial.angle),
    titles: sanitizeTitles(brief.titles, title, 4, keywords).filter(t => !claimIssue(t.text, facts, anchor)),
    serpFit: serpFitOf(brief.serpFacing, brief.serpVacancy), alternative,
    ...(brief.related ? { related: brief.related.filter(r => isNarrowerKeyword(coreKeyword, r.keyword)).map(r => ({ ...r, serpFit: serpFitOf(r.serpFacing ?? null, r.serpVacancy ?? null) })) } : {}),
    star: false,
  };
  delete result.recommendation;
  return recommend(result);
}

export const normalizeLegacyBrief = normalizeBriefForDisplay;

function recommend(brief: TopicBrief): TopicBrief {
  if (brief.editorial?.status !== 'supported' || brief.editorial.review?.passed !== true || brief.editorial.review.issues.length || !brief.editorial.answers.length || brief.editorial.missing.length) return brief;
  const candidates = [
    { keyword: brief.coreKeyword, searchVolume: brief.searchVolume, serpFacing: brief.serpFacing, serpVacancy: brief.serpVacancy },
    ...(brief.alternative && isNarrowerKeyword(brief.coreKeyword, brief.alternative.keyword) ? [brief.alternative] : []),
  ];
  const selected = candidates.find(candidate => serpFitOf(candidate.serpFacing, candidate.serpVacancy) === '높음' && typeof candidate.searchVolume === 'number' && Number.isFinite(candidate.searchVolume) && candidate.searchVolume >= 100);
  return selected ? { ...brief, star: true, recommendation: { keyword: selected.keyword, reason: `근거 검토 완료 · 월 검색량 ${selected.searchVolume.toLocaleString('ko-KR')} · 상위 10개 중 정면 글 ${selected.serpFacing}개` } } : brief;
}

export function finalizeBriefRecommendations(briefs: TopicBrief[]): TopicBrief[] {
  return briefs.map(normalizeBriefForDisplay);
}
