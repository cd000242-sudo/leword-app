/**
 * 🧪 크롤러 테스트 스크립트 V2 - 개선된 노이즈 필터
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const keyword = process.argv[2] || '다또아';

async function testCrawler() {
    console.log(`\n========== 크롤러 테스트 V2: "${keyword}" ==========\n`);

    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

        const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // 개선된 셀렉터 로직 테스트
        const results = await page.evaluate(() => {
            const data = {
                snippets: [] as string[],
                related: [] as string[]
            };

            const noiseWords = [
                '검색어 저장', '자동완성', '도움말', '로그인', '로그아웃', '기록', '삭제',
                '검색어끄기', '컨텍스트', '검색 이력', '더보기', '이전', '다음', '펴고 접기',
                'Keep에 저장', 'Keep에 바로', '문서 저장하기', '바로가기', '메뉴 영역',
                '본문 영역', '설정이 초기화', '최근 검색어', '추천 검색어', '일시적인 오류',
                '다시 시도', '레이어 닫기', '네이버 멤버십', '알림을 모두', '즐겨찾기',
                'naver.search', 'function()', 'jQuery', 'startApplication',
                // 추가 노이즈 패턴
                '정보확인', '열고 닫기', '직접 관리', '인플루언서', '네이버 인플루언서',
                '관련도순', '최신순', '모바일 메인', '언론사', '네이버뉴스',
                'tv.naver.com', 'blog.naver.com', '약 1.1', '창작자의 콘텐츠',
                '팔로우', '팬', '활동하는', '온라인콘텐츠창작자', '사이트인스타그램'
            ];

            const isNoise = (text: string) => {
                if (!text || text.length < 15) return true; // 최소 길이 증가
                if (text.length > 300) return true;
                if (/^[\d\s\.\/\:\-]+$/.test(text)) return true;
                return noiseWords.some(nw => text.includes(nw));
            };

            // 1. 메인 검색 결과 섹션 (.sc_new, .api_subject_bx)
            document.querySelectorAll('.sc_new, .api_subject_bx').forEach(section => {
                section.querySelectorAll('a, span, p, div, strong, em').forEach(el => {
                    const t = el.textContent?.trim();
                    if (t && t.length > 15 && t.length < 200 && !isNoise(t)) {
                        if (!data.snippets.includes(t)) {
                            data.snippets.push(t);
                        }
                    }
                });
            });

            // 2. 인물정보 (.info_group) - 소속만 추출
            document.querySelectorAll('.info_group .txt').forEach(el => {
                const t = el.textContent?.trim();
                if (t && t.length > 2 && t.length < 50 && !isNoise(t)) {
                    if (!data.snippets.includes(t)) {
                        data.snippets.push(`[소속] ${t}`);
                    }
                }
            });

            return data;
        });

        // 후처리 - 뉴스 헤드라인만 남기기
        const cleanSnippets = results.snippets
            .filter(t => {
                // 실제 뉴스/콘텐츠 패턴 체크
                const isRealContent =
                    t.includes('사망') || t.includes('뷰티') || t.includes('크리에이터') ||
                    t.includes('유튜버') || t.includes('향년') || t.includes('소식') ||
                    t.includes('논란') || t.includes('결혼') || t.includes('열애') ||
                    t.includes('배우') || t.includes('가수') || t.includes('아이돌') ||
                    t.startsWith('[소속]');
                return isRealContent;
            })
            .slice(0, 10);

        console.log(`✅ 고품질 스니펫 ${cleanSnippets.length}개 추출됨:\n`);
        cleanSnippets.forEach((s, i) => console.log(`${i + 1}. ${s.substring(0, 100)}...`));

    } catch (error: any) {
        console.error('에러:', error.message);
    } finally {
        await browser.close();
    }
}

testCrawler().catch(console.error);
