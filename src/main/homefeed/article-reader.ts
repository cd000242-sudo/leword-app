/** Small, opt-in Naver news reader. No arbitrary URL retrieval or script execution. */
import * as cheerio from 'cheerio';
import type { EditorialSource } from '../../utils/homefeed/editorial-types';
import { canonicalEditorialUrl, editorialSourceHash } from '../../utils/homefeed/editorial';

const MAX_ARTICLES = 3;
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 2;

function supported(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (url.hostname === 'n.news.naver.com' && /^\/(?:mnews\/)?article\/\d{3}\/\d{6,14}\/?$/.test(url.pathname)) return url;
    if (url.hostname === 'news.naver.com' && url.pathname === '/main/read.naver' && /^\d{3}$/.test(url.searchParams.get('oid') || '') && /^\d{6,14}$/.test(url.searchParams.get('aid') || '')) return url;
    return null;
  } catch { return null; }
}

async function boundedHtml(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.ok || !/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || '')) {
    await response.body?.cancel();
    throw new Error('unsupported response');
  }
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES || !response.body) { await response.body?.cancel(); throw new Error('article too large or empty'); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error('article timed out');
      const chunk = await reader.read();
      if (signal.aborted) throw new Error('article timed out');
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('article too large');
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function extract(html: string): { text: string; imageUrl: string | null } | null {
  const $ = cheerio.load(html);
  $('script, style, iframe, noscript, figure, .end_photo_org, .link_news, .reporter_area, .byline').remove();
  const root = $('#dic_area, #newsct_article, #articleBodyContents').first();
  if (!root.length) return null;
  root.find('br').replaceWith('\n');
  root.find('p').each((_index, element) => { $(element).append('\n'); });
  let text = root.text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  text = text.slice(0, 18_000);
  // Preserve complete sentences only, including negation/quotes. Do not append a
  // period to a truncated clause and pretend the missing context was retrieved.
  const endings = [...text.matchAll(/[.!?。！？]["”’」』)]?(?=\s|$)/g)];
  const last = endings[endings.length - 1];
  if (!last) return null;
  text = text.slice(0, (last.index ?? 0) + last[0].length).trim();
  if (text.length < 80 || endings.length < 2 || /(?:\.{2,}|…)\s*$/.test(text)) return null;
  const rawImage = $('meta[property="og:image"]').attr('content');
  let imageUrl: string | null = null;
  if (rawImage) { try { const url = new URL(rawImage); if (url.protocol === 'https:' && !url.username && !url.password) imageUrl = url.toString(); } catch { /* optional metadata */ } }
  return { text, imageUrl };
}

async function readSource(source: EditorialSource, fetchImpl: typeof fetch): Promise<EditorialSource> {
  const fallback: EditorialSource = { ...source, fetchStatus: 'unavailable' };
  let url = supported(source.url);
  if (!url) return fallback;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const response = await fetchImpl(url.toString(), { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'LEWORD-Homefeed/1.0' } });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        const next = location ? supported(new URL(location, url).toString()) : null;
        if (!next || redirects === MAX_REDIRECTS) return fallback;
        url = next;
        continue;
      }
      const article = extract(await boundedHtml(response, controller.signal));
      if (!article) return fallback;
      const enriched: EditorialSource = { ...source, level: 'body', text: article.text, fetchStatus: 'ok', imageUrl: source.imageUrl || article.imageUrl };
      enriched.contentHash = editorialSourceHash(enriched);
      return enriched;
    }
    return fallback;
  } catch { return fallback; } finally { clearTimeout(timer); }
}

export async function enrichEditorialSources(sources: readonly EditorialSource[], options: { fetchImpl?: typeof fetch } = {}): Promise<EditorialSource[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const scheduled = new Map<string, Promise<EditorialSource>>();
  for (const source of sources) {
    const key = canonicalEditorialUrl(source.url) ?? source.url;
    if (!scheduled.has(key) && scheduled.size < MAX_ARTICLES && supported(source.url)) scheduled.set(key, readSource(source, fetchImpl));
  }
  return Promise.all(sources.map(async (source) => {
    const key = canonicalEditorialUrl(source.url) ?? source.url;
    const pending = scheduled.get(key);
    if (pending) return { ...await pending, id: source.id };
    return supported(source.url) ? { ...source } : { ...source, fetchStatus: 'unavailable' as const };
  }));
}
