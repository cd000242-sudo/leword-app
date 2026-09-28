/** Only an explicit keyword request can reach the generator. Facts come from our fixed public snapshot. */
import { collectRows, titlesForBatch, type BriefTitleInput } from '../utils/brief-title-engine';
import { publicBoard } from './board-cache';

interface Deps {
  read: () => unknown;
  save: (board: unknown) => void;
  fetchSignals: () => Promise<unknown>;
  generate?: (rows: BriefTitleInput[]) => Promise<{ titles: any[] }>;
  now?: () => number;
}
function evidenceSignals(raw: any, keyword: string, nowMs: number): any {
  const items = (Array.isArray(raw?.lanes) ? raw.lanes : []).flatMap((lane: any) => Array.isArray(lane?.items) ? lane.items : []);
  const item = items.find((candidate: any) => String(candidate?.keyword || candidate?.title || '').trim() === keyword);
  const insight = item?.insight;
  const links = Array.isArray(insight?.links) ? insight.links : [];
  const stamp = insight?.collectedAt || insight?.latestArticleAt || raw?.updatedAt || raw?.generatedAt;
  const age = nowMs - Date.parse(stamp || '');
  if (!Number.isFinite(age) || age < -300_000 || age > 24 * 3_600_000) throw new Error('STALE_SOURCE');
  const facts = (Array.isArray(insight?.facts) ? insight.facts : []).filter((fact: any) => {
    if (typeof fact?.text !== 'string' || !Number.isInteger(fact.sourceIndex)) return false;
    try { const link = new URL(links[fact.sourceIndex]?.url); return ['http:', 'https:'].includes(link.protocol) && !link.username && !link.password; } catch { return false; }
  }).slice(0, 3).map((fact: any) => ({ text: fact.text.slice(0, 500) }));
  if (!facts.length) throw new Error('NO_LINKED_FACTS');
  return { lanes: [{ items: [{ keyword, expansions: [], insight: { facts } }] }] };
}

export function createBriefTitleService(deps: Deps) {
  const now = deps.now ?? Date.now;
  // One generation at a time; identical clicks share a job instead of spending twice.
  let flight: { keyword: string; promise: Promise<any> } | null = null;
  const generate = async (keyword: string): Promise<any> => {
    const cached = publicBoard('brief-titles', deps.read(), now());
    if (cached?.titles.some((t: any) => t.keyword === keyword)) return cached;
    if (flight) {
      if (flight.keyword === keyword) return flight.promise;
      throw new Error('TITLE_GENERATION_BUSY');
    }
    const job = (async () => {
      const signals = evidenceSignals(await deps.fetchSignals(), keyword, now());
      const rows = collectRows(signals);
      if (rows.length !== 1 || rows[0].keyword !== keyword) throw new Error('UNKNOWN_KEYWORD');
      const result = await (deps.generate ?? titlesForBatch)(rows);
      const at = new Date(now()).toISOString();
      const made = result.titles.filter(t => t.keyword === keyword).map(t => ({ ...t, at }));
      if (!made.length) throw new Error('NO_VALID_TITLES');
      // Read again after AI completes; another saved keyword must not disappear.
      const latest = publicBoard('brief-titles', deps.read(), now());
      const board = publicBoard('brief-titles', { titles: [...(latest?.titles || []).filter((t: any) => t.keyword !== keyword), ...made] }, now());
      if (!board) throw new Error('NO_VALID_TITLES');
      deps.save(board);
      return board;
    })();
    flight = { keyword, promise: job };
    try { return await job; } finally { flight = null; }
  };
  return { generate };
}

/** No browser-supplied URLs, redirects, credentials, or prompts. */
export async function fetchTitleSourceSnapshot(fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl('https://leaderspro.kr/data/source-signals.json', { redirect: 'error', signal: AbortSignal.timeout(12_000), cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('SOURCE_UNAVAILABLE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 4 * 1024 * 1024) throw new Error('SOURCE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
