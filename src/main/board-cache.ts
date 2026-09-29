/** Public snapshots only. Reading a saved board never invokes an agent. */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { normalizeBriefBoard } from './topic-brief-pipeline';

export type BoardKey = 'topic-briefs' | 'issue-niche' | 'brief-titles';
type Shape = { [key: string]: true | 'textMatrix' | Shape | [Shape] };
const fields = (names: string): Shape => Object.fromEntries(names.split(' ').map(name => [name, true]));
const title = fields('text type target frame basis');
const metric = fields('keyword searchVolume serpFacing serpVacancy serpFit');
const searchVolumeEvidence = fields('source keyword measuredAt pc mobile pcUnder10 mobileUnder10 totalMin totalMax status');
const fact = fields('id title snippet evidenceExcerpts press link publishedAt');
const editorial: Shape = { ...fields('version status summary audience missing outline angle'), review: fields('passed issues'),
  answers: [{ ...fields('question answer factIds'), excerpts: [fields('factId text')] }] };
const writingPackage: Shape = { ...fields('version status title intro conclusion nextSteps missing sourceIds reviewedAt'),
  sections: [fields('heading paragraphs factIds')], faq: [fields('question answer factIds')],
  table: { ...fields('caption headers factIds'), rows: 'textMatrix' } };
const writingGuide: Shape = { ...fields('version direction mustInclude avoid seoTitles homeTitles relatedTerms'), images: [fields('sourceId url kind description captureArea')] };
const inventory: Shape = fields('targetCount actualCount complete shortfall shortfallReason supportedCount refillRounds attempts');
const brief: Shape = { ...fields('title timing types primaryIntent value experience differentiation coreKeyword keywords factIds field searchVolume searchVolumeUnder10 documentCount documentCountMeasuredAt serpFacing serpVacancy serpFit star'),
  facts: [fact], editorial, writingPackage, writingGuide, searchVolumeEvidence, titles: [title], alternative: metric, related: [metric], recommendation: fields('keyword reason') };
const issue: Shape = { ...fields('issue issueType lane issueStatus isHot why rowCount carried'),
  headlines: [fields('title press publishedAt link')], concentrated: [fields('keyword searchVolume origin')],
  nextWave: [fields('keyword reason searchVolume documentCount onBoard')] };
const issueRow: Shape = { ...fields('keyword issue topic lane issueType isDerived origin originReason verdict preemptionKind recommendationStatus exclusionReason documentCount documentCountMeasured searchVolume searchVolumeLt10 searchVolumeMeasuredAt hasLiveDemand demandStatus demandRecent7 demandRatio issueStatus isHot frontalDocCount freshFrontalCount reasons intentLabel adsenseFit adsenseReason kinCount measuredAt carried'),
  serp: fields('verdict reason exactTitleHits partialTitleHits sampledTitles topTitles measuredAt'), evidence: [fields('code text')],
  whySearch: fields('text basis'), titles: { seo: title, home: title }, subKeywords: [fields('keyword searchVolume frame')],
  keywordPool: [fields('keyword searchVolume documentCount source')], trend: fields('series label recommendation measuredAt'),
  kinTop: [fields('title link views answers')], monetize: { ...fields('verdict angle'), points: [fields('text')] } };

/** Structural whitelist, including nested objects. Unknown cache fields never escape. */
function project(value: any, shape: Shape): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(shape)) {
    const item = value[key];
    if (item === undefined) continue;
    if (rule === true) {
      if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) out[key] = item;
      else if (Array.isArray(item)) out[key] = item.filter(v => v === null || ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 300);
    } else if (rule === 'textMatrix') {
      out[key] = Array.isArray(item) ? item.slice(0, 30).filter(row => Array.isArray(row) && row.length <= 6 && row.every(cell => typeof cell === 'string')).map(row => row.map((cell: string) => cell.slice(0, 12_000))) : [];
    } else if (Array.isArray(rule)) {
      out[key] = Array.isArray(item) ? item.slice(0, 500).map(v => project(v, rule[0])).filter(Boolean) : [];
    } else out[key] = project(item, rule);
  }
  return out;
}
function fresh(value: unknown, nowMs: number, hours: number): boolean {
  const at = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(at) && at <= nowMs + 300_000 && nowMs - at <= hours * 3_600_000;
}
export function boardTime(key: BoardKey, board: any): string | null {
  const value = key === 'topic-briefs' ? board?.builtAt : key === 'issue-niche' ? board?.publishedAt : board?.generatedAt;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

export function publicBoard(key: BoardKey, raw: unknown, nowMs = Date.now()): any | null {
  if (!raw || typeof raw !== 'object') return null;
  if (key === 'topic-briefs') {
    const data: any = project(raw, { ...fields('builtAt day slot shelfDays'), inventory, briefs: [brief], rounds: [{ ...fields('day slot builtAt'), inventory, briefs: [brief] }] });
    if (!fresh(data.builtAt, nowMs, 72)) return null;
    data.briefs = (data.briefs || []).filter((b: any) => typeof b.title === 'string' && typeof b.coreKeyword === 'string' && b.facts?.length);
    // 회차는 7일 창고(2026-09-29) — 하루 여유를 둔 8일. 판 자체(builtAt)는 72시간 그대로.
    data.rounds = (data.rounds || []).filter((r: any) => fresh(r.builtAt, nowMs, 8 * 24)).map((r: any) => ({ ...r, briefs: (r.briefs || []).filter((b: any) => typeof b.title === 'string' && typeof b.coreKeyword === 'string' && b.facts?.length) })).filter((r: any) => r.briefs.length);
    if (!data.briefs.length && !data.rounds.length) return null;
    try { return normalizeBriefBoard(data); } catch { return null; }
  }
  if (key === 'issue-niche') {
    const data: any = project(raw, { ...fields('publishedAt generator schedule rejectedCount'), rows: [issueRow], observations: [issueRow], issues: [issue],
      measured: fields('issues candidates niche preemption pending'), freeSample: fields('day keywords') });
    if (!fresh(data.publishedAt, nowMs, 48)) return null;
    data.rows = (data.rows || []).filter((r: any) => fresh(r.measuredAt, nowMs, 48));
    data.observations = (data.observations || []).filter((r: any) => fresh(r.measuredAt, nowMs, 48));
    data.issues = (data.issues || []).filter((i: any) => typeof i.issue === 'string' && i.headlines?.length);
    return data.rows.length || data.observations.length || data.issues.length ? data : null;
  }
  const data: any = project(raw, { generatedAt: true, titles: [fields('keyword seo home summary at')] });
  data.titles = (data.titles || []).filter((t: any) => typeof t.keyword === 'string' && t.keyword.trim() && fresh(t.at, nowMs, 24) && (t.seo || t.home || t.summary));
  if (!data.titles.length) return null;
  return { generatedAt: data.titles.reduce((latest: string, t: any) => Date.parse(t.at) > Date.parse(latest) ? t.at : latest, data.titles[0].at), total: data.titles.length, titles: data.titles };
}

export function readBoardFile(file: string): unknown {
  try { if (fs.statSync(file).size > 8 * 1024 * 1024) return null; return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
export function atomicBoardWrite(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, JSON.stringify(value, null, 1), 'utf8'); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function writeSuccessfulBoard(file: string, key: BoardKey, raw: unknown, options: { nowMs?: number; cancelled?: boolean } = {}): boolean {
  if (options.cancelled) return false;
  const nowMs = options.nowMs ?? Date.now();
  const board = publicBoard(key, raw, nowMs);
  if (!board) return false;
  const previous = publicBoard(key, readBoardFile(file), nowMs);
  if (previous && Date.parse(boardTime(key, previous)!) > Date.parse(boardTime(key, board)!)) return false;
  atomicBoardWrite(file, board);
  return true;
}
