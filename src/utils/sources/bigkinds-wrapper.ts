/**
 * BigKinds 시드 래퍼 — 한국언론재단 뉴스 빅데이터에서 핫 키워드 추출
 *
 * 전략: 광범위 루트 시드 → 최근 7일 뉴스 검색 → 제목에서 추가 명사 추출
 *       = "뉴스 언급 집중 키워드" 를 자동 감지.
 */

import { searchNews } from './bigkinds-news-buzz';
import { extractKoreanNouns } from './youtube-kr-rss';

const SEEDS = [
    '지원금', '부동산', '금리', '채용', '연봉',
    '전세', '청약', '정책', '대출', '투자',
];

export async function getBigkindsSeedKeywords(): Promise<string[]> {
    const allTitles: string[] = [];
    for (const seed of SEEDS) {
        try {
            const news = await searchNews(seed, 7);
            for (const n of news) {
                if (n.title && n.title.length >= 6 && n.title.length <= 100) {
                    allTitles.push(n.title);
                }
            }
            await new Promise(r => setTimeout(r, 1500));
        } catch (err: any) {
            console.warn(`[bigkinds-wrap] ${seed} 실패:`, err?.message);
        }
    }
    if (allTitles.length === 0) return [];
    const freq = extractKoreanNouns(allTitles);
    return Array.from(freq.entries())
        .filter(([kw, c]) => kw.length >= 2 && kw.length <= 15 && c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 120)
        .map(([k]) => k);
}
