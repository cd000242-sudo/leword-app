/** Shared, bounded inventory generation. Callers supply enriched facts and CLI timeouts. */
import {
  buildBriefPrompt, validateBriefs, dropRepeats, excludeListOf, roundDayOf,
  type FactCard, type TopicBrief, type BriefRound,
} from '../utils/topic-briefs';
import { tryExtractJson } from '../utils/agent-cli/parse';
import { reviewTopicBriefs } from './topic-brief-pipeline';
import { DEFAULT_BRIEF_GOAL, normalizeBriefGoal } from '../utils/topic-brief-policy';

export interface BriefInventoryField {
  field: string;
  facts: readonly FactCard[];
  /** Maximum rows requested in one generation call (1–4). */
  targetCount?: number;
  /** Per-edition category quota, separate from generation batch size. */
  desiredTarget?: number;
}
export interface BriefInventoryContext {
  field: string;
  /** Zero is the initial pass; one and two are the only permitted refill passes. */
  pass: number;
  stage: 'generate' | 'review';
  count: number;
}
export interface BriefInventoryFailure {
  field: string;
  pass: number;
  stage: 'generate' | 'review' | 'refresh';
  reason: string;
}
export interface BriefInventoryProgress {
  field: string;
  pass: number;
  stage: 'field' | 'error' | 'complete';
  actualCount: number;
  added: number;
  reason?: string;
}
export interface BriefInventoryMetadata {
  targetCount: number;
  actualCount: number;
  /** Quantity completion only; each row still retains its independent editorial status. */
  complete: boolean;
  shortfall: number;
  shortfallReason: string;
  refillRounds: number;
  attempts: number;
  supportedCount: number;
  byField: Record<string, number>;
  desiredByField: Record<string, number>;
  shortfallByField: Record<string, number>;
  failures: BriefInventoryFailure[];
}
export interface BriefInventoryOptions {
  fields: readonly BriefInventoryField[];
  today: Date;
  /** Earlier slots only. Use preserveRicherBriefRound for a replacement of the same slot. */
  priorRounds?: readonly BriefRound[];
  goal?: number;
  maxRefillRounds?: number;
  cancelled?: () => boolean;
  maxDurationMs?: number;
  now?: () => number;
  run: (prompt: string, context: BriefInventoryContext) => Promise<string>;
  /** Optional additional already-enriched facts; no fetching/enrichment occurs inside this module. */
  refreshFacts?: (field: string, context: { pass: number; facts: readonly FactCard[]; excludedKeywords: readonly string[] }) => Promise<readonly FactCard[]>;
  onProgress?: (progress: BriefInventoryProgress) => void;
}

const keywordKey = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const bounded = (value: number | undefined, fallback: number, minimum: number, maximum: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.floor(value))) : fallback;
const goalOf = normalizeBriefGoal;
const priority = (field: string) => /지원금|복지|정책/.test(field) ? 0 : /사업|비즈니스|소상공인|창업/.test(field) ? 1 : /경제|금융|부동산/.test(field) ? 2 : /이슈|사회/.test(field) ? 3 : 4;
const uniqueCount = (briefs: readonly TopicBrief[]) => new Set(briefs.filter(brief => typeof brief?.coreKeyword === 'string' && brief.coreKeyword.trim() && brief.title && brief.facts?.length).map(brief => keywordKey(brief.coreKeyword))).size;

/** Duplicated rows do not count toward finishing a scheduled slot. */
export function isBriefRoundComplete(round: Pick<BriefRound, 'briefs'> | null | undefined, goal = DEFAULT_BRIEF_GOAL,
  allocations?: readonly Pick<BriefInventoryField, 'field' | 'desiredTarget'>[]): boolean {
  if (!round || !Array.isArray(round.briefs) || uniqueCount(round.briefs) < goalOf(goal)) return false;
  if (!allocations?.length) return true;
  const canonicalField = (field: string) => field === '부동산·생활경제' ? '생활경제·부동산' : field === '시사·이슈' ? '주요 이슈' : field;
  // A keyword counts once across categories, matching generation's global deduplication.
  const seen = new Set<string>();
  const byField = new Map<string, number>();
  for (const brief of round.briefs) {
    if (typeof brief?.coreKeyword !== 'string' || !brief.coreKeyword.trim() || !brief.title || !brief.facts?.length) continue;
    const key = keywordKey(brief.coreKeyword);
    if (seen.has(key)) continue;
    seen.add(key);
    const field = canonicalField(brief.field);
    byField.set(field, (byField.get(field) || 0) + 1);
  }
  return allocations.every(allocation => (byField.get(canonicalField(allocation.field)) || 0) >= bounded(allocation.desiredTarget, 0, 0, goalOf(goal)));
}

/** Keep an existing richer edition without pretending its old evidence was just collected. */
export function preserveRicherBriefRound<T extends Pick<BriefRound, 'slot' | 'builtAt' | 'briefs' | 'day'>>(next: T, previous?: T | null): T {
  if (!previous || previous.slot !== next.slot || !Number.isFinite(Date.parse(previous.builtAt)) || !Number.isFinite(Date.parse(next.builtAt))) return next;
  // 회차 날짜는 day(예약이 정한 날) 우선 — 늦게 돈 예약이 builtAt 으로는 다음 날이어도 제 회차다.
  return roundDayOf(previous) === roundDayOf(next) && uniqueCount(previous.briefs) > uniqueCount(next.briefs) ? previous : next;
}

function mergeFacts(fresh: readonly FactCard[], existing: readonly FactCard[]): FactCard[] {
  const ids = new Set<string>(), links = new Set<string>();
  return [...fresh, ...existing].filter(fact => {
    if (!fact?.id || !fact.link || ids.has(fact.id) || links.has(fact.link)) return false;
    ids.add(fact.id); links.add(fact.link); return true;
  });
}

/** First try every field, then at most two priority-ordered refill passes. Never synthesize filler. */
export async function generateBriefInventory(options: BriefInventoryOptions): Promise<{
  briefs: TopicBrief[];
  inventory: BriefInventoryMetadata;
  dropped: Array<{ field: string; title: string; reason: string }>;
}> {
  const goal = goalOf(options.goal), maxRefill = bounded(options.maxRefillRounds, 2, 0, 2);
  const now = options.now || Date.now;
  const deadline = now() + bounded(options.maxDurationMs, 40 * 60_000, 1, 60 * 60_000);
  const prior = options.priorRounds || [];
  const fields = options.fields.filter((item, index, all) => item.field && all.findIndex(other => other.field === item.field) === index);
  const factsByField = new Map(fields.map(item => [item.field, mergeFacts(item.facts, [])]));
  const usedLinks = new Map(fields.map(item => [item.field, new Set<string>()]));
  const shownLinks = new Map(fields.map(item => [item.field, new Set<string>()]));
  const briefs: TopicBrief[] = [], failures: BriefInventoryFailure[] = [];
  const dropped: Array<{ field: string; title: string; reason: string }> = [];
  const seen = new Set(prior.flatMap(round => round.briefs.map(brief => keywordKey(brief.coreKeyword))));
  const hasQuotas = fields.some(field => field.desiredTarget !== undefined);
  const quotaOf = (field: BriefInventoryField) => hasQuotas ? bounded(field.desiredTarget, 0, 0, goal) : goal;
  const countOf = (field: BriefInventoryField) => briefs.filter(brief => brief.field === field.field).length;
  // The same source can support different questions; only repeated source AND intent are duplicates.
  const eventKey = (brief: TopicBrief) => {
    if (!brief.primaryIntent?.trim() || !brief.facts?.[0]?.link) return '';
    try { const url = new URL(brief.facts[0].link); url.hash = ''; return `${url.href}|${keywordKey(brief.primaryIntent)}`; } catch { return ''; }
  };
  const events = new Set(prior.flatMap(round => round.briefs.map(eventKey)).filter(Boolean));
  let attempts = 0, refillRounds = 0;
  const throwIfCancelled = () => { if (options.cancelled?.()) throw new Error('글감 발굴을 취소했습니다.'); };
  const report = (event: BriefInventoryProgress) => { try { options.onProgress?.(event); } catch { /* Progress must not discard a completed batch. */ } };
  const failure = (field: string, pass: number, stage: BriefInventoryFailure['stage']) => {
    const reason = stage === 'refresh' ? '추가 근거 수집에 실패해 확보된 자료로 계속합니다.' : stage === 'review' ? '독립 근거 검토에 실패해 추가 확인 상태로 남깁니다.' : '글감 생성에 실패해 다른 분야와 보충 발굴을 계속합니다.';
    failures.push({ field, pass, stage, reason });
    report({ field, pass, stage: 'error', actualCount: briefs.length, added: 0, reason });
  };

  generation: for (let pass = 0; pass <= maxRefill; pass++) {
    throwIfCancelled();
    if (pass > 0 && briefs.length >= goal) break;
    if (pass > 0) refillRounds = pass;
    const ordered = pass === 0 ? fields : [...fields].sort((a, b) => {
      const deficit = (field: BriefInventoryField) => (quotaOf(field) - countOf(field)) / Math.max(1, quotaOf(field));
      return deficit(b) - deficit(a) || priority(a.field) - priority(b.field);
    });
    for (const field of ordered) {
      throwIfCancelled();
      if (briefs.length >= goal) break;
      if (countOf(field) >= quotaOf(field)) continue;
      let catalog = factsByField.get(field.field) || [];
      if (pass > 0 && options.refreshFacts) {
        try {
          const fresh = await options.refreshFacts(field.field, { pass, facts: [...catalog], excludedKeywords: [...seen] });
          throwIfCancelled();
          catalog = mergeFacts(fresh, catalog); factsByField.set(field.field, catalog);
        } catch { throwIfCancelled(); failure(field.field, pass, 'refresh'); }
      }
      const batchSize = bounded(field.targetCount, 4, 1, 4);
      const batches = hasQuotas ? Math.ceil((quotaOf(field) - countOf(field)) / batchSize) : 1;
      for (let batch = 0; batch < batches; batch++) {
        throwIfCancelled();
        if (briefs.length >= goal || countOf(field) >= quotaOf(field)) break;
        const consumed = usedLinks.get(field.field)!;
        const shown = shownLinks.get(field.field)!;
        // Newly fetched and uncited articles lead every refill; cited facts remain available as context.
        const unused = catalog.filter(fact => !consumed.has(fact.link));
        // Rotate article ordering so later batches see additional evidence first.
        const offset = options.refreshFacts ? 0 : ((pass + batch) * 3) % Math.max(1, unused.length);
        const rotated = [...unused.slice(offset), ...unused.slice(0, offset)];
        const facts = [...rotated.filter(fact => !shown.has(fact.link)), ...rotated.filter(fact => shown.has(fact.link)), ...catalog.filter(fact => consumed.has(fact.link))].slice(0, 24);
        if (!facts.length) {
          report({ field: field.field, pass, stage: 'field', actualCount: briefs.length, added: 0, reason: '확보된 근거가 없습니다.' });
          break;
        }
        const count = Math.min(batchSize, goal - briefs.length, quotaOf(field) - countOf(field));
        const currentExclusions = briefs.map(brief => `${brief.title}(${brief.coreKeyword})`);
        const prompt = buildBriefPrompt(field.field, facts, options.today, count, [...currentExclusions, ...excludeListOf(prior, field.field)]);
        if (now() >= deadline) {
          failures.push({ field: field.field, pass, stage: 'generate', reason: '발굴 시간 한도에 도달해 확보된 결과를 보존합니다.' });
          break generation;
        }
        let parsed: unknown;
        attempts++;
        for (const fact of facts) shown.add(fact.link);
        try {
          parsed = tryExtractJson(await options.run(prompt, { field: field.field, pass, stage: 'generate', count }));
          throwIfCancelled();
          if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
        } catch { throwIfCancelled(); failure(field.field, pass, 'generate'); break; }
        const validated = validateBriefs((parsed as unknown[]).slice(0, count), facts, field.field, options.today);
        dropped.push(...validated.dropped.map(item => ({ field: field.field, ...item })));
        const deduped = dropRepeats(validated.ok, prior);
        dropped.push(...deduped.repeated.map(brief => ({ field: field.field, title: brief.title, reason: '앞 회차와 같은 검색어' })));
        const unique: TopicBrief[] = [];
        const batchSeen = new Set(seen);
        const batchEvents = new Set(events);
        for (const brief of deduped.kept) {
          const key = keywordKey(brief.coreKeyword);
          if (batchSeen.has(key)) { dropped.push({ field: field.field, title: brief.title, reason: '이번 회차와 같은 검색어' }); continue; }
          const event = eventKey(brief);
          if (hasQuotas && event && batchEvents.has(event)) { dropped.push({ field: field.field, title: brief.title, reason: '같은 출처와 같은 질문의 중복 글감' }); continue; }
          if (event) batchEvents.add(event);
          batchSeen.add(key); unique.push(brief);
        }
        const reviewed = await reviewTopicBriefs(unique, facts, async reviewPrompt => {
          try {
            throwIfCancelled();
            const reply = await options.run(reviewPrompt, { field: field.field, pass, stage: 'review', count: unique.length });
            throwIfCancelled();
            if (!Array.isArray(tryExtractJson(reply))) throw new Error('Expected review array');
            return reply;
          } catch (error) { throwIfCancelled(); failure(field.field, pass, 'review'); throw error; }
        });
        // reviewTopicBriefs deliberately catches provider errors, so cancellation must propagate here.
        throwIfCancelled();
        for (const brief of reviewed) {
          if (briefs.length >= goal || countOf(field) >= quotaOf(field)) break;
          seen.add(keywordKey(brief.coreKeyword)); events.add(eventKey(brief)); briefs.push(brief);
          for (const fact of facts) if (brief.factIds.includes(fact.id)) consumed.add(fact.link);
        }
        report({ field: field.field, pass, stage: 'field', actualCount: briefs.length, added: reviewed.length });
        if (!reviewed.length) break;
      }
    }
  }
  throwIfCancelled();
  const shortfall = Math.max(0, goal - briefs.length);
  const desiredByField = hasQuotas ? Object.fromEntries(fields.map(field => [field.field, quotaOf(field)])) : {};
  const shortfallByField = hasQuotas ? Object.fromEntries(fields.map(field => [field.field, Math.max(0, quotaOf(field) - countOf(field))])) : {};
  const inventory: BriefInventoryMetadata = {
    targetCount: goal, actualCount: briefs.length, complete: shortfall === 0, shortfall,
    shortfallReason: shortfall ? `중복 제거와 근거 검증 후 ${shortfall}개가 부족합니다.${failures.length ? ' 일부 생성·검토·수집 호출이 실패했습니다.' : ' 확보된 자료에서 추가 글감을 찾지 못했습니다.'}` : '',
    refillRounds, attempts, supportedCount: briefs.filter(brief => brief.editorial?.status === 'supported').length,
    desiredByField, shortfallByField,
    byField: Object.fromEntries(fields.map(field => [field.field, briefs.filter(brief => brief.field === field.field).length])), failures,
  };
  report({ field: '', pass: refillRounds, stage: 'complete', actualCount: briefs.length, added: 0, ...(shortfall ? { reason: inventory.shortfallReason } : {}) });
  return { briefs, inventory, dropped };
}
