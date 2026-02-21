/**
 * 🔍 Puppeteer 크롤러 디버그 스크립트
 * 네이버 SERP의 실제 HTML 구조를 분석합니다.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

puppeteer.use(StealthPlugin());

const keyword = process.argv[2] || '다또아';

async function debugCrawl() {
    console.log(`\n========== 크롤러 디버그: "${keyword}" ==========\n`);

    const browser = await puppeteer.launch({
        headless: false, // 디버그용: 브라우저 표시
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        console.log(`URL: ${url}\n`);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // 전체 HTML 저장 (디버그용)
        const html = await page.content();
        fs.writeFileSync('debug-serp.html', html);
        console.log('✅ HTML 저장됨: debug-serp.html');

        // 스크린샷 저장
        await page.screenshot({ path: 'debug-serp.png', fullPage: true });
        console.log('✅ 스크린샷 저장됨: debug-serp.png');

        // 다양한 셀렉터 테스트
        const selectorTests = [
            // 뉴스
            '.news_tit',
            '.news_dsc',
            '.api_txt_lines',
            // VIEW/블로그
            '.total_tit',
            '.title_link',
            '.total_dsc',
            // 인물정보
            '.info_group',
            '.profile_info',
            '.detail_info',
            // 연관검색어
            '.lst_related_srch a',
            '.related_srch a',
            '.fds-comps-keyword-group a',
            // 일반 텍스트
            '[class*="tit"]',
            '[class*="desc"]',
            '[class*="txt"]',
            // 스마트블록
            '.smartblock',
            '.sc_new',
            '.api_subject_bx'
        ];

        console.log('\n========== 셀렉터별 매칭 결과 ==========\n');

        for (const selector of selectorTests) {
            try {
                const count = await page.$$eval(selector, els => els.length);
                const samples = await page.$$eval(selector, els =>
                    els.slice(0, 3).map(el => el.textContent?.trim().substring(0, 50) || '')
                );

                if (count > 0) {
                    console.log(`✅ ${selector}: ${count}개`);
                    samples.forEach((s, i) => console.log(`   ${i + 1}. "${s}..."`));
                } else {
                    console.log(`❌ ${selector}: 0개`);
                }
            } catch (e) {
                console.log(`⚠️ ${selector}: 에러`);
            }
        }

        // 모든 텍스트 노드 수집 (브루트포스)
        console.log('\n========== 모든 가시 텍스트 (상위 20개) ==========\n');
        const allTexts = await page.evaluate(() => {
            const texts: string[] = [];
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            while (walk.nextNode()) {
                const text = walk.currentNode.textContent?.trim();
                if (text && text.length > 10 && text.length < 200) {
                    texts.push(text);
                }
            }
            return [...new Set(texts)].slice(0, 50);
        });

        allTexts.slice(0, 20).forEach((t, i) => console.log(`${i + 1}. ${t}`));

        console.log('\n========== 디버그 완료 ==========');
        console.log('브라우저를 5초 후 닫습니다...');
        await new Promise(r => setTimeout(r, 5000));

    } catch (error: any) {
        console.error('에러:', error.message);
    } finally {
        await browser.close();
    }
}

debugCrawl().catch(console.error);
