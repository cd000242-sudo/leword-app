/**
 * 기사 대표이미지(og:image) — 워커 브리프의 fetchArticleImage 를 앱으로 옮겼다.
 *
 * 이미지 '후보' 주소만 꺼낸다. 사용 허가 · 워터마크 여부는 여기서 알 수 없다(화면은 권리 확인 필요로 표기).
 * 집 회선 보호: 기사 주소마다 한 번만 받고(캐시), 받을 때는 직렬 · 간격을 둔다.
 */
import type { HomefeedStore, OgCacheFile } from './store';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const MAX_HTML_CHARS = 200_000;
const MAX_ENTRIES = 3000;

/** 기사 페이지 head 의 og:image 를 꺼낸다. 못 꺼내면 null. */
export async function fetchOgImage(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Promise<string | null> {
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    const found = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html)
      || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
    if (!found) return null;
    let src = String(found[1]).replace(/&amp;/g, '&').trim();
    if (src.startsWith('//')) src = `https:${src}`;
    return /^https?:\/\//i.test(src) && src.length <= 1000 ? src : null;
  } catch {
    return null;
  }
}

export interface OgImageResolver {
  /** 캐시에 있으면 그 값, 없으면 받아서 적는다. */
  resolve(url: string): Promise<string | null>;
  /** 이번 회차에 실제로 받으러 간 수. */
  fetchedCount(): number;
  /** 캐시를 파일에 적는다. */
  flush(): void;
}

export function createOgImageResolver(
  store: Pick<HomefeedStore, 'readOgCache' | 'writeOgCache'>,
  options: { fetchImpl?: typeof fetch; delayMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): OgImageResolver {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delayMs = options.delayMs ?? 1500;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const cache: OgCacheFile = store.readOgCache();
  let fetched = 0;
  let dirty = false;

  return {
    async resolve(url) {
      const hit = cache.entries[url];
      if (hit) return hit.image;
      if (fetched > 0) await sleep(delayMs);
      fetched += 1;
      const image = await fetchOgImage(url, fetchImpl);
      cache.entries[url] = { image, at: new Date(now()).toISOString() };
      dirty = true;
      return image;
    },
    fetchedCount: () => fetched,
    flush() {
      if (!dirty) return;
      const keys = Object.keys(cache.entries);
      if (keys.length > MAX_ENTRIES) {
        const keep = keys
          .sort((a, b) => Date.parse(cache.entries[b].at) - Date.parse(cache.entries[a].at))
          .slice(0, MAX_ENTRIES);
        cache.entries = Object.fromEntries(keep.map((key) => [key, cache.entries[key]]));
      }
      store.writeOgCache(cache);
      dirty = false;
    },
  };
}
