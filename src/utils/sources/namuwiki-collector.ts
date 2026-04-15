/**
 * 나무위키 최근변경 — 신조어/이슈 조기 탐지
 *
 * 합법성: 공개 페이지(특수:최근변경) 공개 메타데이터.
 * 차별점: 편집 폭발 문서 = 이슈 발생 즉시 감지. 검색량 폭발보다 24h+ 선행.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface NamuRecentChange {
    title: string;
    timestamp?: string;
    editDelta?: number;
    url: string;
}

const RECENT_URL = 'https://namu.wiki/RecentChanges';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

export async function fetchNamuRecentChanges(): Promise<NamuRecentChange[]> {
    try {
        const res = await axios.get(RECENT_URL, {
            timeout: 20000,
            headers: {
                'User-Agent': UA,
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });

        return parseRecentChanges(res.data);
    } catch (err: any) {
        console.error('[namuwiki] 최근변경 수집 실패:', err.message);
        return [];
    }
}

function parseRecentChanges(html: string): NamuRecentChange[] {
    const $ = cheerio.load(html);
    const changes: NamuRecentChange[] = [];
    const seen = new Map<string, number>();

    $('a[href^="/w/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const title = decodeURIComponent(href.replace('/w/', '')).replace(/_/g, ' ');
        if (!title || title.length > 50) return;
        if (title.startsWith('special:') || title.startsWith('파일:') || title.startsWith('분류:')) return;

        seen.set(title, (seen.get(title) || 0) + 1);
    });

    for (const [title, count] of seen.entries()) {
        if (count < 1) continue;
        changes.push({
            title,
            editDelta: count,
            url: `https://namu.wiki/w/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        });
    }

    return changes
        .sort((a, b) => (b.editDelta || 0) - (a.editDelta || 0))
        .slice(0, 100);
}

/**
 * 편집 폭발 문서 = 이슈/신조어 후보
 */
export async function getHotNamuTopics(minEdits: number = 3): Promise<NamuRecentChange[]> {
    const all = await fetchNamuRecentChanges();
    return all.filter(c => (c.editDelta || 0) >= minEdits);
}
