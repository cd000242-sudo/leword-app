/**
 * 더쿠 핫게시글 수집 — 여성·뷰티·아이돌·드라마 트렌드
 *
 * 합법성: 공개 게시글 제목만 수집, 작성자/개인정보 제외, rate limit 준수.
 * 차별점: 여성 소비 트렌드 2~4일 선행. 한국 키워드 도구 0% 활용.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

export interface TheqooPost {
    title: string;
    url: string;
    category?: string;
    commentCount?: number;
    viewCount?: number;
}

const HOT_URL = 'https://theqoo.net/hot';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchTheqooHot(): Promise<TheqooPost[]> {
    try {
        const res = await axios.get(HOT_URL, {
            timeout: 15000,
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });

        const $ = cheerio.load(res.data);
        const posts: TheqooPost[] = [];

        $('table.bd_lst tbody tr').each((_, el) => {
            const $tr = $(el);
            const $titleA = $tr.find('td.title a').first();
            const title = $titleA.text().trim().replace(/\s+/g, ' ');
            const href = $titleA.attr('href') || '';
            const category = $tr.find('td.cate').text().trim();
            const comment = parseInt($tr.find('td.title .replyNum').text().trim() || '0', 10);
            const view = parseInt($tr.find('td.m_no').text().trim().replace(/,/g, '') || '0', 10);

            if (title && title.length > 3 && href) {
                posts.push({
                    title,
                    url: href.startsWith('http') ? href : `https://theqoo.net${href}`,
                    category: category || undefined,
                    commentCount: comment || undefined,
                    viewCount: view || undefined,
                });
            }
        });

        return posts;
    } catch (err: any) {
        console.error('[theqoo] 핫게시글 수집 실패:', err.message);
        return [];
    }
}

/**
 * 더쿠 인기글 제목에서 키워드 추출
 */
export async function getTheqooKeywords(): Promise<Array<{ keyword: string; frequency: number }>> {
    const posts = await fetchTheqooHot();
    const titles = posts.map(p => p.title);
    const freq = extractKoreanNouns(titles);

    return Array.from(freq.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}

/**
 * 실시간 인물/그룹명 추출 — 빈도 기반
 *  - 여러 게시글에 반복 등장하는 토큰 = 인물·그룹명일 가능성 높음
 *  - 조사/일반 명사/동사 제외
 *  - 범용 이벤트 키워드와 조합용 seed로만 사용 (하드코딩 금지)
 */
export async function getLiveCelebNames(): Promise<string[]> {
    const posts = await fetchTheqooHot();
    if (posts.length === 0) return [];

    // 인물·그룹명이 아닌 일반 명사/조사/부사 블랙리스트
    const BLACKLIST = new Set([
        // 시간/부사
        '오늘', '지금', '어제', '방금', '최근', '현재', '진짜', '완전', '정말',
        '갑자기', '결국', '오늘도', '아직', '이미', '이번', '지난', '다음',
        // 일반 동사/상태
        '있다', '없다', '된다', '안된다', '이다', '아니다', '같다', '다르다',
        '그래도', '그러나', '하지만', '그런데', '그리고',
        // 자주 나오는 일반 명사
        '사진', '영상', '기사', '뉴스', '사건', '사고', '상황', '이야기', '모습',
        '반응', '의견', '생각', '느낌', '분위기', '지역', '시간', '날씨',
        '사람', '그녀', '그가', '그게', '이게', '저게', '우리', '자기',
        // 이모지/축약
        'jpg', 'gif', 'mp4', 'feat', 'with',
    ]);

    const freq = new Map<string, number>();
    const POST_LIMIT = 120;

    for (const post of posts.slice(0, POST_LIMIT)) {
        let title = (post.title || '').trim();
        if (!title) continue;

        // 괄호·이모지·특수문자 제거
        title = title
            .replace(/\[[^\]]*\]/g, ' ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/[^\w가-힣\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // 토큰 분리: 한글 2~5자 (인물·그룹명 길이) 또는 영문 2~10자
        const tokens = title.split(/\s+/).filter(t => {
            if (BLACKLIST.has(t)) return false;
            // 한글 2~5자
            if (/^[가-힣]{2,5}$/.test(t)) return true;
            // 영문/영문+숫자 2~10자 (그룹명: BTS, NewJeans, IVE 등)
            if (/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(t)) return true;
            return false;
        });

        // 중복 방지: 한 게시글 내에선 각 토큰 1번만 카운트
        const uniqueInPost = new Set(tokens);
        for (const tok of uniqueInPost) {
            freq.set(tok, (freq.get(tok) || 0) + 1);
        }
    }

    // 2회 이상 등장 = 여러 게시글에서 언급 = 인물·그룹일 가능성 ↑
    // 빈도 내림차순, 상위 25개
    return Array.from(freq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([name]) => name);
}

/**
 * @deprecated getLiveCelebNames() 사용 권장 - 하드코딩 없이 인물 추출 후 조합
 */
export async function getTheqooCelebSeeds(): Promise<string[]> {
    return getLiveCelebNames();
}

/**
 * 실시간 이슈 '원본 문구' 직접 추출 — 커뮤니티에서 이슈화된 raw 표현
 *
 * 목적: 블로거가 기자보다 빠르게 이슈 글 선점하려면 롱테일 조합이 아니라
 *       **커뮤니티에서 이미 회자되는 원본 문구**를 그대로 시드로 써야 함.
 *
 * 예: 제목 "이진호 건강 이상으로 활동 중단 ㄷㄷ"
 *     → 추출: "이진호 건강", "건강 이상", "활동 중단"
 *
 * 반환: 빈도 2회+ 원본 구문 (롱테일 생성 금지)
 */
export async function getLiveCelebIssues(): Promise<string[]> {
    const posts = await fetchTheqooHot();
    if (posts.length === 0) return [];

    const BLACKLIST = new Set([
        // 일반 조사/부사/감탄
        '오늘', '지금', '어제', '진짜', '완전', '정말', '갑자기', '결국', '아직',
        '있다', '없다', '된다', '이다', '그래도', '하지만',
        // 뉴스 수사학
        '속보', '단독', '충격', '긴급', '경악', '파문', '반전',
        // 일반 명사
        '사진', '영상', '기사', '뉴스', '사건', '상황', '모습', '반응',
        '사람', '여성', '남성', '그녀', '그가',
        // 이모지/영문 축약
        'jpg', 'gif', 'ㄷㄷ', 'ㅋㅋ', 'ㅎㅎ',
    ]);

    const isValidTok = (t: string): boolean => {
        if (BLACKLIST.has(t)) return false;
        if (t.length < 2) return false;
        if (/^\d+$/.test(t)) return false;
        // 한글 2~5자 또는 영문/숫자 2~10자
        if (/^[가-힣]{2,5}$/.test(t)) return true;
        if (/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(t)) return true;
        return false;
    };

    const phraseFreq = new Map<string, number>();
    for (const post of posts.slice(0, 150)) {
        let title = (post.title || '').trim();
        if (!title) continue;

        // 괄호·이모지·특수문자 제거
        title = title
            .replace(/\[[^\]]*\]/g, ' ')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/[^\w가-힣\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = title.split(/\s+/).filter(isValidTok);
        if (tokens.length < 2) continue;

        // 연속 2토큰 구문 추출 (bi-gram) — 원본 문맥 유지
        for (let i = 0; i < tokens.length - 1; i++) {
            const phrase = `${tokens[i]} ${tokens[i + 1]}`;
            if (phrase.length > 25) continue;
            phraseFreq.set(phrase, (phraseFreq.get(phrase) || 0) + 1);
        }
    }

    // 빈도 2회 이상 등장한 '원본 이슈 문구'만 시드로
    return Array.from(phraseFreq.entries())
        .filter(([_, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([phrase]) => phrase);
}
