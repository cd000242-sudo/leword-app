import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ENDPOINT = 'repos/cd000242-sudo/naver/contents/spa/public/data/affiliate-campaigns.json';
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_AGE_MS = 72 * 3_600_000;
const LANES = ['toss', 'brandconnect'] as const;
export type AffiliatePublicationResult = { status: 'published' | 'skipped' | 'failed'; reason: string };
export interface AffiliatePublisherDependencies {
  enabled?: boolean;
  now?: () => number;
  /** Test seam only: production always uses the fixed repository and local gh authentication. */
  gh?: (args: string[], input?: string) => Promise<string>;
}

/** This dedicated operator opt-in is never enabled by ordinary API/license settings. */
export function isAffiliatePublishingEnabled(userData: string): boolean {
  try {
    const file = path.join(userData, 'affiliate-local', 'publish.json');
    return fs.statSync(file).size <= 1024 && JSON.parse(fs.readFileSync(file, 'utf8')).enabled === true;
  } catch { return false; }
}

function runGh(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '', bytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('github_timeout')); }, 30_000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('github_unavailable')); });
    child.stdin.on('error', () => { /* The process exit supplies a sanitized diagnostic. */ });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BYTES * 2) { child.kill(); return; }
      output += chunk;
    });
    child.stderr.on('data', chunk => { if (error.length < 8000) error += chunk; });
    child.on('close', code => {
      clearTimeout(timer);
      if (bytes > MAX_BYTES * 2) return reject(new Error('github_response_too_large'));
      if (code === 0) return resolve(output);
      reject(Object.assign(new Error('github_request_failed'), { status: /HTTP 409\b/.test(error) ? 409 : 0 }));
    });
    child.stdin.end(input);
  });
}

const object = (v: any): boolean => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: any, limit = 1000): string => typeof v === 'string' ? v.slice(0, limit) : '';
const number = (v: any): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
function date(v: any, now: number): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return null;
  const at = Date.parse(v);
  return Number.isFinite(at) && at >= Date.UTC(2020, 0, 1) && at <= now + 300_000 ? v : null;
}
function url(v: any): string {
  try {
    const u = new URL(text(v, 4000));
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password
      || !u.hostname.includes('.') || /(^localhost$|\.localhost$|\.local$|^\d+(?:\.\d+){3}$|:)/i.test(u.hostname)) return '';
    for (const key of [...u.searchParams.keys()]) {
      if (/(token|secret|key|auth|cookie|session|password|signature|credential)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.toString();
  } catch { return ''; }
}
function pickStrings(raw: any, keys: string[], limit = 1000): any {
  const out: any = {};
  for (const key of keys) if (typeof raw?.[key] === 'string') out[key] = text(raw[key], limit);
  return out;
}
function pickNumbers(raw: any, keys: string[]): any {
  const out: any = {};
  for (const key of keys) if (key in raw) out[key] = number(raw[key]);
  return out;
}
function serp(raw: any): any {
  return object(raw) ? pickNumbers(raw, ['sampled', 'exact', 'partial']) : null;
}
function seat(raw: any, now: number): any {
  if (!object(raw)) return null;
  return { ...pickStrings(raw, ['keyword', 'verdict']), ...pickNumbers(raw, ['openSlot', 'facing', 'sampled']), measuredAt: date(raw.measuredAt, now) };
}
function item(raw: any, now: number): any | null {
  if (!object(raw) || !text(raw.name).trim()) return null;
  const out: any = {
    ...pickStrings(raw, ['name', 'brand', 'reward', 'keyword', 'needKeyword', 'productId', 'consoleSection', 'shoppingCategory']),
    ...pickNumbers(raw, ['price', 'searchVolume', 'documentCount', 'needVolume', 'needDocs', 'needRatio', 'perSaleWon', 'consoleRank']),
    image: url(raw.image), url: url(raw.url), collectedAt: date(raw.collectedAt, now),
  };
  for (const key of ['inConsoleList', 'shoppingClicked', 'issuedOnly']) if (typeof raw[key] === 'boolean') out[key] = raw[key];
  for (const key of ['serpTop', 'needSerpTop']) if (key in raw) out[key] = serp(raw[key]);
  if ('seat' in raw) out.seat = seat(raw.seat, now);
  if (Array.isArray(raw.slots)) out.slots = raw.slots.slice(0, 30).filter(object).map((s: any) => ({
    ...pickStrings(s, ['keyword']), ...pickNumbers(s, ['volume', 'documentCount', 'ratio']), ...(s.seat ? { seat: seat(s.seat, now) } : {}),
  }));
  if (Array.isArray(raw.keywordEvidence)) out.keywordEvidence = raw.keywordEvidence.slice(0, 40).filter(object).map((e: any) => ({
    ...pickStrings(e, ['query', 'serpQuery', 'source']), ...pickNumbers(e, ['monthlySearches', 'documentCount']),
    serpTop: serp(e.serpTop), measuredAt: date(e.measuredAt, now),
  }));
  if (Array.isArray(raw.productEvidence)) out.productEvidence = raw.productEvidence.slice(0, 30).filter(object).map((e: any) => ({
    ...pickStrings(e, ['id', 'sourceType', 'excerpt'], 4000), sourceUrl: url(e.sourceUrl), verifiedAt: date(e.verifiedAt, now),
  }));
  if (object(raw.brief) && ['NOW', 'NEXT', 'ALWAYS'].includes(raw.brief.timing)) out.brief = {
    ...pickStrings(raw.brief, ['timing', 'primaryIntent', 'value', 'experience', 'differentiation', 'angle', 'basis'], 4000),
    builtAt: date(raw.brief.builtAt, now),
    facts: (Array.isArray(raw.brief.facts) ? raw.brief.facts : []).slice(0, 20).filter(object).map((f: any) => ({
      ...pickStrings(f, ['id', 'title', 'press']), link: url(f.link), publishedAt: date(f.publishedAt, now),
    })),
  };
  if (object(raw.aiTitle)) out.aiTitle = {
    ...pickStrings(raw.aiTitle, ['text', 'axis', 'whyClick', 'provider', 'status']),
    ...(Array.isArray(raw.aiTitle.evidenceIds) ? { evidenceIds: raw.aiTitle.evidenceIds.slice(0, 20).filter((x: any) => typeof x === 'string').map((x: string) => text(x)) } : {}),
    ...(Array.isArray(raw.aiTitle.claims) ? { claims: raw.aiTitle.claims.slice(0, 10).filter(object).map((c: any) => pickStrings(c, ['text', 'evidenceId', 'quote'])) } : {}),
  };
  // Stored recommendation verdicts are deliberately omitted: the site recomputes them from dated evidence.
  return out;
}

function project(raw: any, now: number): any | null {
  if (!object(raw) || !object(raw.sites)) return null;
  const sites: any = {};
  for (const id of LANES) {
    const lane = raw.sites[id];
    if (!object(lane) || !Array.isArray(lane.items) || lane.items.length > 2000) continue;
    sites[id] = {
      label: text(lane.label, 100) || (id === 'toss' ? '토스쇼핑 쉐어링크' : '브랜드커넥트'),
      items: lane.items.map((value: any) => item(value, now)).filter(Boolean),
      collectedAt: date(lane.collectedAt === undefined ? raw.collectedAt : lane.collectedAt, now),
      checkedAt: date(lane.checkedAt || raw.checkedAt || lane.collectedAt || raw.collectedAt, now),
      status: ['ready', 'login-required', 'collection-failed', 'incomplete'].includes(lane.status) ? lane.status : lane.status ? 'collection-failed' : 'ready',
    };
  }
  return Object.keys(sites).length ? { sites, enrichedAt: date(raw.enrichedAt, now) } : null;
}
const at = (v: any): number => Date.parse(v || '') || 0;
function merge(previous: any, incoming: any, now: number): any | null {
  const sites = { ...previous.sites };
  let eligible = false;
  let acceptedCollection = false;
  for (const id of LANES) {
    const next = incoming.sites[id], prior = sites[id];
    if (!next?.checkedAt || now - at(next.checkedAt) > MAX_AGE_MS) continue;
    if (prior && (at(prior.checkedAt) > at(next.checkedAt) || at(prior.collectedAt) > at(next.checkedAt))) continue;
    if (next.status === 'ready' && prior && at(prior.collectedAt) > at(next.collectedAt)) continue;
    eligible = true;
    const incomplete = next.items.length > 0 && prior?.items.length > 0 && next.items.length < prior.items.length * 0.5;
    const success = next.status === 'ready' && next.items.length > 0 && next.collectedAt
      && at(next.collectedAt) <= at(next.checkedAt) + 300_000 && now - at(next.collectedAt) <= MAX_AGE_MS && !incomplete;
    if (success) acceptedCollection = true;
    sites[id] = success ? next : {
      ...(prior || { label: next.label, items: [], collectedAt: null }),
      checkedAt: next.checkedAt,
      status: incomplete ? 'incomplete' : next.status === 'ready' ? 'collection-failed' : next.status,
    };
  }
  if (!eligible) return null;
  const latest = (field: string) => Object.values(sites).map((s: any) => s[field]).filter(Boolean).sort((a, b) => at(a) - at(b)).at(-1) || null;
  const enrichedAt = acceptedCollection && at(incoming.enrichedAt) > at(previous.enrichedAt) ? incoming.enrichedAt : previous.enrichedAt;
  return {
    collectedAt: latest('collectedAt'), checkedAt: latest('checkedAt'),
    ...(enrichedAt ? { enrichedAt } : {}),
    sites,
  };
}

/** Trusted main-process only. No renderer endpoint accepts snapshots or enables publication. */
export async function publishAppAffiliateSnapshot(raw: unknown, deps: AffiliatePublisherDependencies = {}): Promise<AffiliatePublicationResult> {
  if (deps.enabled !== true) return { status: 'skipped', reason: 'disabled' };
  const now = (deps.now || Date.now)();
  let incoming: any;
  try {
    if (Buffer.byteLength(JSON.stringify(raw) || '') > MAX_BYTES) throw new Error('oversize');
    incoming = project(raw, now);
  } catch { return { status: 'skipped', reason: 'invalid_or_stale_snapshot' }; }
  if (!incoming || !Object.values(incoming.sites).some((s: any) => s.checkedAt && now - at(s.checkedAt) <= MAX_AGE_MS)) {
    return { status: 'skipped', reason: 'invalid_or_stale_snapshot' };
  }
  const gh = deps.gh || runGh;
  const api = ['api', '--hostname', 'github.com'];
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const metadata = JSON.parse(await gh([...api, ENDPOINT + '?ref=main']));
      if (typeof metadata.sha !== 'string' || !/^[a-f0-9]{40}$/.test(metadata.sha) || !Number.isFinite(metadata.size) || metadata.size > MAX_BYTES) throw new Error('invalid_remote');
      const content = metadata.encoding === 'base64' && typeof metadata.content === 'string' && metadata.content.trim()
        ? Buffer.from(metadata.content, 'base64').toString('utf8')
        : await gh([...api, `repos/cd000242-sudo/naver/git/blobs/${metadata.sha}`, '-H', 'Accept: application/vnd.github.raw+json']);
      if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('invalid_remote');
      const original = JSON.parse(content);
      // A corrupt/future remote timestamp cannot be treated as an old record and overwritten.
      for (const value of [original, ...LANES.map(id => original?.sites?.[id]).filter(Boolean)]) {
        for (const key of ['collectedAt', 'checkedAt', 'enrichedAt']) {
          if (value?.[key] != null && !date(value[key], now)) throw new Error('invalid_remote');
        }
      }
      for (const id of LANES) {
        const lane = original?.sites?.[id];
        if (lane && (!Array.isArray(lane.items) || lane.items.length > 2000)) throw new Error('invalid_remote');
      }
      const previous = project(original, now);
      if (!previous) throw new Error('invalid_remote');
      const merged = merge(previous, incoming, now);
      if (!merged) return { status: 'skipped', reason: 'newer_remote' };
      const normalizedPrevious = {
        collectedAt: original.collectedAt || null, checkedAt: original.checkedAt || null,
        ...(previous.enrichedAt ? { enrichedAt: previous.enrichedAt } : {}), sites: previous.sites,
      };
      const payload = JSON.stringify(merged);
      if (payload === JSON.stringify(normalizedPrevious)) return { status: 'skipped', reason: 'already_published' };
      if (Buffer.byteLength(payload) > MAX_BYTES) throw new Error('snapshot_too_large');
      try {
        await gh([...api, '--method', 'PUT', ENDPOINT, '--input', '-'], JSON.stringify({
          message: 'fix: publish operator app affiliate snapshot', branch: 'main', sha: metadata.sha,
          content: Buffer.from(payload).toString('base64'),
        }));
        return { status: 'published', reason: 'app_snapshot_published' };
      } catch (error) {
        if ((error as any)?.status === 409 && attempt === 0) continue;
        throw error;
      }
    }
  } catch { return { status: 'failed', reason: 'github_publication_failed' }; }
  return { status: 'failed', reason: 'github_publication_failed' };
}

export const publishAffiliateSnapshot = publishAppAffiliateSnapshot;
