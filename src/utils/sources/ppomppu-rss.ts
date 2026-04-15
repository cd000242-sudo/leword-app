/**
 * 뽐뿌 핫딜 RSS 수집
 *
 * 합법성: 공개 RSS 피드. 상품명·가격 정보는 사실 정보.
 * 차별점: 핫딜 게시 = 구매의도 100%. 네이버 검색 대비 6~24h 선행.
 */

import axios from 'axios';

export interface PpomppuHotdeal {
    title: string;
    link: string;
    pubDate: string;
    productName?: string;
    price?: string;
    shop?: string;
}

const FEEDS = {
    domestic: 'https://www.ppomppu.co.kr/rss.php?id=ppomppu',
    foreign: 'https://www.ppomppu.co.kr/rss.php?id=ppomppu4',
};

export async function fetchPpomppuHotdeals(category: 'domestic' | 'foreign' | 'both' = 'both'): Promise<PpomppuHotdeal[]> {
    const feeds = category === 'both' ? [FEEDS.domestic, FEEDS.foreign] : [FEEDS[category]];
    const all: PpomppuHotdeal[] = [];

    for (const url of feeds) {
        try {
            const res = await axios.get(url, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0 LEWORD/1.0' },
                responseType: 'text',
            });
            all.push(...parseRss(res.data));
        } catch (err: any) {
            console.error(`[ppomppu-rss] ${url} 실패:`, err.message);
        }
    }

    return all;
}

function parseRss(xml: string): PpomppuHotdeal[] {
    const items = xml.split('<item>').slice(1);
    const deals: PpomppuHotdeal[] = [];

    for (const raw of items) {
        const itemEnd = raw.indexOf('</item>');
        const item = itemEnd > 0 ? raw.substring(0, itemEnd) : raw;

        const title = stripCdata(extract(item, '<title>', '</title>'));
        const link = stripCdata(extract(item, '<link>', '</link>'));
        const pubDate = extract(item, '<pubDate>', '</pubDate>');

        if (!title) continue;

        const parsed = parseHotdealTitle(title);
        deals.push({
            title,
            link,
            pubDate,
            ...parsed,
        });
    }

    return deals;
}

/**
 * 뽐뿌 게시물 제목 패턴 파싱
 * 예: "[쿠팡] 다이슨 V15 디텍트 (1,049,000원/무료)"
 */
function parseHotdealTitle(title: string): { productName?: string; price?: string; shop?: string } {
    const result: { productName?: string; price?: string; shop?: string } = {};

    const shopMatch = title.match(/^\[([^\]]+)\]/);
    if (shopMatch) result.shop = shopMatch[1].trim();

    const priceMatch = title.match(/\(([\d,]+)원/);
    if (priceMatch) result.price = priceMatch[1] + '원';

    let productName = title.replace(/^\[[^\]]+\]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (productName) result.productName = productName;

    return result;
}

function extract(s: string, start: string, end: string): string {
    const i = s.indexOf(start);
    if (i < 0) return '';
    const j = s.indexOf(end, i + start.length);
    if (j < 0) return '';
    return s.substring(i + start.length, j).trim();
}

function stripCdata(s: string): string {
    return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

/**
 * 24시간 내 신규 상품명 빈도 집계
 * 동일 상품이 여러 채널에 반복 등장 = 강한 수요 신호
 */
export async function getHotProductFrequency(): Promise<Array<{ product: string; count: number; deals: PpomppuHotdeal[] }>> {
    const deals = await fetchPpomppuHotdeals('both');
    const map = new Map<string, PpomppuHotdeal[]>();

    for (const d of deals) {
        if (!d.productName) continue;
        // 첫 명사 2~3개만 키로 사용 (정규화)
        const key = d.productName.split(/\s+/).slice(0, 3).join(' ');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(d);
    }

    return Array.from(map.entries())
        .map(([product, deals]) => ({ product, count: deals.length, deals }))
        .filter(x => x.count >= 1)
        .sort((a, b) => b.count - a.count)
        .slice(0, 100);
}
