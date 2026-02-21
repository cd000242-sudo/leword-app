/**
 * 🕵️ Benchmark Sniper Pro - 황금 키워드 1티어 블로거 추적기
 * 
 * 기능:
 * 1. 황금 키워드 상위 노출 블로거 실시간 크롤링
 * 2. 인플루언서 vs 재야의 고수 구분
 * 3. 점수 기반 벤치마킹 대상 선정
 * 4. 제목 패턴 및 키워드 전략 분석
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

export interface BloggerProfile {
    blogId: string;
    name: string;
    url: string;
    score: number;
    keywords: string[];
    titles: string[];
    isInfluencer: boolean;
    lastPostDate: string;
}

export interface BenchmarkResult {
    rank_type: string;
    name: string;
    score: number;
    main_keywords: string;
    title_patterns: string[];
    url: string;
    advice: string;
}

// ============================================================
// 🛠 [Util] 배치 처리 유틸리티 (속도 & 안전 밸런스)
// ============================================================
async function processInBatches<T, R>(
    items: T[],
    batchSize: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        // 배치 내 병렬 실행 (Promise.all)
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
        // 배치 사이 휴식 (탐지 회피)
        if (i + batchSize < items.length) {
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
        }
    }
    return results;
}

// ============================================================
// 🎯 [Core] 벤치마크 스나이퍼 (Ultimate Ver.)
// ============================================================
export async function benchmarkSniperPro(
    goldenKeywords: string[],
    existingBrowser?: any
): Promise<BenchmarkResult[]> {
    console.log(`\n🕵️‍♂️ [SNIPER] 황금 키워드 ${goldenKeywords.length}개를 장악한 '1티어 블로그' 추적 중...`);

    const shouldCloseBrowser = !existingBrowser;
    const browser = existingBrowser || await puppeteer.launch({ headless: "new" });
    const blogMap = new Map<string, BloggerProfile>();

    try {
        // 🔥 핵심: 3개씩 끊어서 병렬 처리 (속도 + 안전)
        await processInBatches(goldenKeywords, 3, async (keyword) => {
            let page;
            try {
                page = await browser.newPage();

                // 1. 리소스 최적화 (이미지/폰트 차단 -> 속도 3배 향상)
                await page.setRequestInterception(true);
                page.on('request', (req: any) => {
                    if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
                    else req.continue();
                });

                // 2. 모바일 환경 완벽 모사 (DOM 구조 일치화)
                await page.setViewport({ width: 375, height: 812 });
                await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

                // 3. 네이버 검색 (타임아웃 설정으로 좀비 프로세스 방지)
                await page.goto(`https://m.search.naver.com/search.naver?where=view&sm=tab_jum&query=${encodeURIComponent(keyword)}`, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });

                // 4. 데이터 추출 (2024년 최신 Naver 모바일 DOM 구조 대응)
                const data = await page.evaluate((kw: string) => {
                    const extracted: {
                        keyword: string;
                        rank: number;
                        title: string | undefined;
                        name: string | undefined;
                        date: string;
                        url: string;
                        id: string;
                        isInfluencer: boolean;
                    }[] = [];

                    // 다양한 셀렉터 시도 (네이버 DOM 변경 대응)
                    const selectors = [
                        '.total_wrap',
                        '.view_wrap li',
                        '.api_subject_bx .total_area',
                        'li.bx',
                        '.sp_view li',
                        '.lst_view li'
                    ];

                    let items: Element[] = [];
                    for (const sel of selectors) {
                        const found = document.querySelectorAll(sel);
                        if (found.length > 0) {
                            items = Array.from(found).filter(el => !el.classList.contains('type_ad'));
                            break;
                        }
                    }

                    if (items.length === 0) {
                        // 폴백: 모든 a 태그 중 blog.naver.com 링크 찾기
                        const allLinks = document.querySelectorAll('a[href*="blog.naver.com"]');
                        for (let i = 0; i < Math.min(allLinks.length, 3); i++) {
                            const link = allLinks[i] as HTMLAnchorElement;
                            const href = link.href;
                            const blogId = href.split('blog.naver.com/')[1]?.split('/')[0]?.split('?')[0] || '';
                            if (blogId && blogId.length > 2) {
                                extracted.push({
                                    keyword: kw,
                                    rank: i + 1,
                                    title: link.textContent?.trim()?.substring(0, 100),
                                    name: blogId,
                                    date: '',
                                    url: href,
                                    id: blogId,
                                    isInfluencer: false
                                });
                            }
                        }
                        return extracted;
                    }

                    // 상위 3개만 추출 (1페이지 상단 장악한 블로그만)
                    for (let i = 0; i < Math.min(items.length, 3); i++) {
                        const el = items[i];

                        // 타이틀 셀렉터들 (다양한 버전 대응)
                        const titleEl = el.querySelector('.title_link, .api_txt_lines, .total_tit, a.title, .tit, .title');
                        // 이름 셀렉터들
                        const nameEl = el.querySelector('.user_info .name, .sub_txt .name, .name, .source_box .name, .user_area .name, .source');
                        // 날짜 셀렉터들
                        const dateEl = el.querySelector('.sub_time, .date, .time, .sub_info');
                        // 링크 셀렉터들
                        let linkEl = el.querySelector('a.title_link, a.api_txt_lines, a.total_tit, a[href*="blog.naver.com"]') as HTMLAnchorElement;
                        if (!linkEl) linkEl = el.querySelector('a') as HTMLAnchorElement;

                        // 인플루언서 배지 확인
                        const influEl = el.querySelector('.sp_nreview, .ico_influencer, .badge_influencer, .influencer');

                        if (linkEl) {
                            let blogId = '';
                            const href = linkEl.href;

                            if (href.includes('blog.naver.com')) {
                                blogId = href.split('blog.naver.com/')[1]?.split('/')[0]?.split('?')[0] || '';
                            } else if (href.includes('tistory.com') || href.includes('velog.io')) {
                                try { blogId = new URL(href).hostname; } catch { }
                            } else {
                                try { blogId = new URL(href).hostname; } catch { }
                            }

                            if (blogId && blogId.length > 2) {
                                extracted.push({
                                    keyword: kw,
                                    rank: i + 1,
                                    title: titleEl?.textContent?.trim() || linkEl.textContent?.trim()?.substring(0, 100),
                                    name: nameEl?.textContent?.trim() || blogId,
                                    date: dateEl?.textContent?.trim() || '',
                                    url: href,
                                    id: blogId,
                                    isInfluencer: !!influEl
                                });
                            }
                        }
                    }
                    return extracted;
                }, keyword);


                // 5. 점수 집계 및 분석
                for (const item of data) {
                    if (!blogMap.has(item.id)) {
                        blogMap.set(item.id, {
                            blogId: item.id,
                            name: item.name || 'Unknown',
                            url: item.url,
                            score: 0,
                            keywords: [],
                            titles: [],
                            isInfluencer: item.isInfluencer,
                            lastPostDate: item.date
                        });
                    }
                    const profile = blogMap.get(item.id)!;

                    // [Scoring Logic]
                    // 1위: 10점, 2위: 7점, 3위: 5점
                    let point = item.rank === 1 ? 10 : item.rank === 2 ? 7 : 5;

                    // 💎 재야의 고수 가산점: 인플루언서 아닌데 상위권이면 +5점 (벤치마킹 1순위)
                    if (!item.isInfluencer) point += 5;

                    // ⚡ 최신성 가산점: 최근(1주 이내) 글이면 +3점 (살아있는 로직)
                    if (item.date.includes('전') || item.date.includes('어제') || item.date.includes('방금')) point += 3;

                    profile.score += point;

                    if (!profile.keywords.includes(item.keyword)) profile.keywords.push(item.keyword);
                    // 제목 패턴 분석을 위해 3개까지만 수집
                    if (item.title && profile.titles.length < 3) profile.titles.push(item.title);
                }

            } catch (e) {
                // 개별 키워드 에러는 무시하고 진행 (전체 프로세스 보호)
                console.warn(`[SNIPER] Skipped keyword: ${keyword}`);
            } finally {
                if (page) await page.close();
            }
        });

    } catch (e) {
        console.error("[SNIPER] Critical Error:", e);
    } finally {
        if (shouldCloseBrowser) await browser.close();
    }

    // 🏆 최종 TOP 5 선별 및 리포트 생성
    const topBloggers: BenchmarkResult[] = Array.from(blogMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5) // 최상위 5명
        .map(b => ({
            rank_type: b.isInfluencer ? '🟢인플루언서 (주제 참고)' : '💎재야의 고수 (스킬 복사)',
            name: b.name,
            score: b.score,
            main_keywords: b.keywords.slice(0, 5).join(', '), // 주요 키워드 최대 5개
            title_patterns: b.titles, // 따라해야 할 제목들
            url: b.url,
            // 액션 플랜 제공
            advice: b.isInfluencer
                ? "이 블로그의 '카테고리 구성'과 '전문성'을 벤치마킹하세요."
                : "이 블로그의 '키워드 배치', '체류시간 유도 장치', '썸네일'을 그대로 흡수하세요."
        }));

    console.log(`[SNIPER] ✅ TOP ${topBloggers.length}명의 벤치마킹 대상 선정 완료`);
    return topBloggers;
}

// ============================================================
// 🧪 [Test] 단독 실행용 테스트
// ============================================================
if (require.main === module) {
    (async () => {
        const testKeywords = ['아이폰16 케이스', '다이어트 식단', '2025 트렌드'];
        const result = await benchmarkSniperPro(testKeywords);
        console.log('\n🏆 벤치마킹 대상 블로거:');
        console.table(result.map(r => ({
            유형: r.rank_type,
            이름: r.name,
            점수: r.score,
            주요키워드: r.main_keywords
        })));
    })();
}
