/**
 * 추가 RSS 컬렉터 — 데이터 소스 풀 확장 (28개 → 50개+)
 *  - 언론사 카테고리별 RSS (IT/생활/문화/스포츠 등)
 *  - 공공기관 RSS (보건복지부, 고용노동부, 환경부 등)
 *  - 모두 공개 RSS, 제목에서 한국어 명사 추출
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractKoreanNouns } from './youtube-kr-rss';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 8000;

async function fetchRssTitles(urls: string[]): Promise<string[]> {
    const titles: string[] = [];
    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                timeout: TIMEOUT,
                headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,text/xml,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' },
                validateStatus: s => s < 500,
            });
            if (typeof res.data !== 'string') continue;
            const $ = cheerio.load(res.data, { xmlMode: true });
            $('item > title').each((_, el) => {
                const t = $(el).text().trim().replace(/\s+/g, ' ');
                if (t && t.length >= 6 && t.length <= 100) titles.push(t);
            });
        } catch (err: any) {
            // 단일 실패 무시
        }
    }
    return titles;
}

function buildKeywords(titles: string[], boost: string[] = []): Array<{ keyword: string; frequency: number }> {
    if (titles.length === 0) return [];
    const freq = extractKoreanNouns(titles);
    for (const t of titles) {
        for (const kw of boost) {
            if (t.includes(kw)) freq.set(kw, (freq.get(kw) || 0) + 1);
        }
    }
    return Array.from(freq.entries())
        .filter(([kw]) => kw.length >= 2 && kw.length <= 15)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([keyword, frequency]) => ({ keyword, frequency }));
}

// === 1. ZDNet Korea IT/스타트업 ===
export async function getZdnetKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://feeds.feedburner.com/zdkorea']),
        ['AI', '스타트업', '클라우드', '반도체', '플랫폼', '구독']
    );
}

// === 2. 디지털타임스 IT ===
export async function getDigitalTimesKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.dt.co.kr/rss/section_main.xml']),
        ['IT', 'AI', '반도체', '디지털', '플랫폼']
    );
}

// === 3. 매일경제 부동산 ===
export async function getMkRealestateKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.mk.co.kr/rss/50300009/']),
        ['아파트', '청약', '분양', '재건축', '전세', '월세', '주담대']
    );
}

// === 4. 머니투데이 산업 ===
export async function getMtIndustryKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://rss.mt.co.kr/mt_industry.xml']),
        ['창업', '소상공인', '사업자', '플랫폼', '구독']
    );
}

// === 5. 한겨레 문화 ===
export async function getHaniCultureKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.hani.co.kr/rss/culture/']),
        ['공연', '전시', '영화', '드라마', '도서', '여행']
    );
}

// === 6. SBS 연예/문화 ===
export async function getSbsEntertainmentKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07']),
        ['드라마', '예능', '아이돌', '영화']
    );
}

// === 7. 보건복지부 보도자료 (공공) ===
export async function getMohwKeywords() {
    return buildKeywords(
        await fetchRssTitles([
            'https://www.mohw.go.kr/synap/rssService.es?rss=mid',  // 정확한 URL은 사이트 가이드 따름
            'https://www.korea.kr/rss/policy.xml',
        ]),
        ['지원금', '복지', '바우처', '의료', '돌봄', '장애인', '노인', '아동']
    );
}

// === 8. 고용노동부 + 일자리 ===
export async function getMoelKeywords() {
    return buildKeywords(
        await fetchRssTitles([
            'https://www.korea.kr/rss/dept_moel.xml',
            'https://www.work.go.kr/rss/wr_news.xml',
        ]),
        ['취업', '실업급여', '내일배움', '국민취업', '구직급여', '청년수당']
    );
}

// === 9. 환경부 (에너지/친환경) ===
export async function getEnvKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.korea.kr/rss/dept_me.xml']),
        ['에너지바우처', '탄소중립', '친환경', '재활용', '미세먼지', '폭염', '한파']
    );
}

// === 10. 농림축산식품부 (농산물/식품) ===
export async function getMafraKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.korea.kr/rss/dept_mafra.xml']),
        ['농산물', '제철', '식품', '직거래', '농민기본소득', '쌀', '한우']
    );
}

// === 11. 디지털데일리 IT ===
export async function getDigitalDailyKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.ddaily.co.kr/rss/all.xml']),
        ['AI', '반도체', '클라우드', '5G', '메타버스']
    );
}

// === 12. 헤럴드경제 라이프 ===
export async function getHeraldLifeKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://biz.heraldcorp.com/rss/060000000000.xml']),
        ['리빙', '뷰티', '패션', '여행', '맛집']
    );
}

// === 13. 베이비뉴스 (육아) ===
export async function getBabyNewsKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.ibabynews.com/rss/allArticle.xml']),
        ['육아', '신생아', '유아', '어린이집', '유치원', '출산', '임신', '돌잔치']
    );
}

// === 14. 우먼타임스 (여성/뷰티) ===
export async function getWomenTimesKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.womentimes.co.kr/rss/allArticle.xml']),
        ['뷰티', '패션', '여성', '커리어', '결혼', '육아']
    );
}

// === 15. 펫타임스 (반려동물) ===
export async function getPetTimesKeywords() {
    return buildKeywords(
        await fetchRssTitles(['https://www.pettimes.kr/rss/allArticle.xml']),
        ['강아지', '고양이', '반려동물', '사료', '간식', '용품', '훈련']
    );
}
