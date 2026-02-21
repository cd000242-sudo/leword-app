/**
 * 🧪 종합 테스트: 카테고리별 유효기간 + 크롤러 + 카테고리 감지
 */

// ============================================================================
// 1. 카테고리별 유효기간 테스트
// ============================================================================

console.log('\n========== 1. 카테고리별 유효기간 테스트 ==========\n');

function getValidityHours(category: string): number {
    switch (category) {
        case 'celeb':
        case 'news':
        case 'issue':
            return 24;
        case 'sports':
            return 36;
        case 'policy':
        case 'finance':
            return 48;
        case 'life_tips':
        case 'health':
        case 'it':
        case 'travel':
        default:
            return 72;
    }
}

const testCategories = [
    { category: 'celeb', expected: 24, example: '다또아' },
    { category: 'news', expected: 24, example: '속보' },
    { category: 'policy', expected: 48, example: '청년지원금' },
    { category: 'finance', expected: 48, example: '주식' },
    { category: 'life_tips', expected: 72, example: '인테리어' },
    { category: 'it', expected: 72, example: '아이폰' },
];

testCategories.forEach(({ category, expected, example }) => {
    const actual = getValidityHours(category);
    const status = actual === expected ? '✅' : '❌';
    console.log(`${status} ${category} (${example}): ${actual}시간 (예상: ${expected}시간)`);
});

// ============================================================================
// 2. 카테고리 감지 테스트
// ============================================================================

console.log('\n========== 2. 카테고리 감지 테스트 ==========\n');

function detectCategory(keyword: string): string {
    const kw = keyword.toLowerCase();

    if (/아이돌|가수|배우|연예인|드라마|영화|콘서트|앨범|컴백|뮤비|예능/.test(kw)) {
        return 'celeb';
    }
    if (/아이폰|갤럭시|노트북|컴퓨터|앱|어플|인공지능|ai|gpt|it|테크|코딩|프로그래밍/.test(kw)) {
        return 'it';
    }
    if (/주식|코인|투자|대출|금리|부동산|청약|적금|계좌|연금|보험/.test(kw)) {
        return 'finance';
    }
    if (/지원금|보조금|청년|복지|정책|신청|정부|혜택|무료|출산|육아지원|국민지원|긴급지원|소상공인|신청방법|지원대상|신청기간|청년정책|복지혜택|무료교육|취업지원|창업지원|주거지원|수당/.test(kw)) {
        return 'policy';
    }
    if (/육아|결혼|집|인테리어|요리|레시피|청소|정리|생활|꿀팁|이케아|무인양품|리빙템|수납|홈카페|가전추천|에어프라이어|세탁기|냉장고|공기청정기|청소기추천|살림팁|알뜨살뜨|다이소/.test(kw)) {
        return 'life_tips';
    }
    if (/여행|맛집|카페|호텔|리조트|관광|숙소|펜션|항공|해외/.test(kw)) {
        return 'travel';
    }

    return 'general';
}

const categoryTests = [
    { keyword: '청년지원금 신청방법', expected: 'policy' },
    { keyword: '출산지원금 2026', expected: 'policy' },
    { keyword: '소상공인 긴급지원금', expected: 'policy' },
    { keyword: '이케아 수납 추천', expected: 'life_tips' },
    { keyword: '에어프라이어 추천', expected: 'life_tips' },
    { keyword: '홈카페 꿀템', expected: 'life_tips' },
    { keyword: '다또아 사망', expected: 'general' }, // 연예인 이름은 celeb 패턴에 없음
    { keyword: '아이돌 컴백', expected: 'celeb' },
    { keyword: '아이폰16 출시일', expected: 'it' },
];

categoryTests.forEach(({ keyword, expected }) => {
    const actual = detectCategory(keyword);
    const status = actual === expected ? '✅' : '❌';
    console.log(`${status} "${keyword}": ${actual} (예상: ${expected})`);
});

// ============================================================================
// 3. 다또아 만료 시뮬레이션
// ============================================================================

console.log('\n========== 3. 다또아 키워드 만료 시뮬레이션 ==========\n');

const now = new Date('2026-01-03T15:47:00+09:00'); // 현재 시각
const daddoaCollectedAt = new Date('2026-01-01T07:55:11.050Z'); // 다또아 수집 시각

// 기존 72시간 기준
const oldValidUntil = new Date(daddoaCollectedAt.getTime() + 72 * 60 * 60 * 1000);
const oldIsValid = oldValidUntil > now;

// 새 24시간 기준 (celeb 카테고리)
const newValidUntil = new Date(daddoaCollectedAt.getTime() + 24 * 60 * 60 * 1000);
const newIsValid = newValidUntil > now;

console.log(`수집 시각: ${daddoaCollectedAt.toISOString()}`);
console.log(`현재 시각: ${now.toISOString()}`);
console.log(`경과 시간: ${Math.round((now.getTime() - daddoaCollectedAt.getTime()) / (1000 * 60 * 60))}시간`);
console.log('');
console.log(`[기존] 72시간 만료: ${oldValidUntil.toISOString()} → 유효: ${oldIsValid ? '예' : '아니오'}`);
console.log(`[신규] 24시간 만료: ${newValidUntil.toISOString()} → 유효: ${newIsValid ? '예 ❌' : '아니오 ✅'}`);

if (!newIsValid) {
    console.log('\n🎉 다또아는 이제 만료되어 더 이상 추천되지 않습니다!');
}

// ============================================================================
// 4. 크롤러 테스트 (지원금 키워드)
// ============================================================================

console.log('\n========== 4. 크롤러 테스트 (지원금 키워드) ==========\n');

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function testCrawler(keyword: string) {
    console.log(`크롤링 테스트: "${keyword}"`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        const results = await page.evaluate(() => {
            const snippets: string[] = [];
            const noiseWords = ['검색어 저장', '자동완성', '로그인', 'Keep에 저장', '바로가기', '정보확인'];

            document.querySelectorAll('.sc_new, .api_subject_bx').forEach(section => {
                section.querySelectorAll('a, span, p, div, strong').forEach(el => {
                    const t = el.textContent?.trim();
                    if (t && t.length > 20 && t.length < 200 && !noiseWords.some(nw => t.includes(nw))) {
                        if (!snippets.includes(t)) {
                            snippets.push(t);
                        }
                    }
                });
            });

            return snippets.slice(0, 5);
        });

        console.log(`✅ ${results.length}개 스니펫 추출됨:`);
        results.forEach((s, i) => console.log(`   ${i + 1}. ${s.substring(0, 70)}...`));

    } catch (error: any) {
        console.error('❌ 크롤링 실패:', error.message);
    } finally {
        await browser.close();
    }
}

// 지원금 키워드 테스트
testCrawler('청년지원금 2026').then(() => {
    console.log('\n========== 테스트 완료 ==========');
}).catch(console.error);
