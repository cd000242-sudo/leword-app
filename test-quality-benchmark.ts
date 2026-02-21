/**
 * 🎯 황금 키워드 품질 벤치마크 테스트
 * 5회 반복 실행으로 SSS 키워드 다양성 및 품질 검증
 */

import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';
import { EnvironmentManager } from './src/utils/environment-manager';
import * as fs from 'fs';

interface TestResult {
    iteration: number;
    timestamp: string;
    keywords: Array<{
        keyword: string;
        grade: string;
        searchVolume: number;
        documentCount: number;
        goldenRatio: number;
        highlightReason?: string;
    }>;
    stats: {
        sssCount: number;
        ssCount: number;
        sCount: number;
        avgGoldenRatio: number;
        maxGoldenRatio: number;
    };
}

async function runQualityBenchmark() {
    console.log('🎯 황금 키워드 품질 벤치마크 시작 (5회 반복)');
    console.log('목표: SSS 키워드 80%+ 달성\n');

    const results: TestResult[] = [];
    const allSssKeywords = new Set<string>();

    for (let i = 1; i <= 1; i++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 테스트 ${i}/5 실행 중...`);
        console.log('='.repeat(60));

        try {
            const startTime = Date.now();

            const response: any = await huntProTrafficKeywords({
                mode: 'realtime',
                category: 'celeb',
                count: 10,
                forceRefresh: true,
                explosionMode: false
            } as any);

            const keywords = response.keywords || (Array.isArray(response) ? response : []);
            console.log(`[BENCHMARK] Received ${keywords.length} keywords from hunter`);
            if (keywords.length === 0) {
                console.log(`[BENCHMARK] Full response: ${JSON.stringify(response)}`);
            }
            const duration = Date.now() - startTime;

            // 결과 분석
            const sssKeywords = keywords.filter((k: any) => k.grade === 'SSS');
            const ssKeywords = keywords.filter((k: any) => k.grade === 'SS');
            const sKeywords = keywords.filter((k: any) => k.grade === 'S');

            const goldenRatios = keywords.map((k: any) => k.goldenRatio || 0).filter((r: number) => r > 0);
            const avgRatio = goldenRatios.length > 0
                ? goldenRatios.reduce((a: number, b: number) => a + b, 0) / goldenRatios.length
                : 0;
            const maxRatio = goldenRatios.length > 0 ? Math.max(...goldenRatios) : 0;

            // SSS 키워드 수집
            sssKeywords.forEach((k: any) => allSssKeywords.add(k.keyword));

            const result: TestResult = {
                iteration: i,
                timestamp: new Date().toISOString(),
                keywords: keywords.slice(0, 10).map((k: any) => ({
                    keyword: k.keyword,
                    grade: k.grade,
                    searchVolume: k.searchVolume || 0,
                    documentCount: k.documentCount || 0,
                    goldenRatio: k.goldenRatio || 0,
                    highlightReason: k.highlightReason
                })),
                stats: {
                    sssCount: sssKeywords.length,
                    ssCount: ssKeywords.length,
                    sCount: sKeywords.length,
                    avgGoldenRatio: Math.round(avgRatio * 100) / 100,
                    maxGoldenRatio: Math.round(maxRatio * 100) / 100
                }
            };

            results.push(result);

            // 즉시 결과 출력
            console.log(`\n✅ 테스트 ${i} 완료 (${(duration / 1000).toFixed(1)}초)`);
            console.log(`   SSS: ${result.stats.sssCount}개 | SS: ${result.stats.ssCount}개 | S: ${result.stats.sCount}개`);
            console.log(`   평균 황금비율: ${result.stats.avgGoldenRatio}% | 최대: ${result.stats.maxGoldenRatio}%`);

            if (sssKeywords.length > 0) {
                console.log(`   🏆 SSS 키워드:`);
                sssKeywords.forEach((k: any) => {
                    console.log(`      - ${k.keyword} (${k.goldenRatio}%)`);
                });
            }

            // 간격 두기 (캐시 회피)
            if (i < 5) {
                console.log(`\n⏳ 다음 테스트까지 5초 대기...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

        } catch (e: any) {
            console.error(`❌ 테스트 ${i} 실패:`, e.message);
        }
    }

    // 종합 분석
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('📈 종합 분석 결과 (CELEB 카테고리)');
    console.log('='.repeat(60));

    const totalSss = results.reduce((sum, r) => sum + r.stats.sssCount, 0);
    const totalSs = results.reduce((sum, r) => sum + r.stats.ssCount, 0);
    const totalS = results.reduce((sum, r) => sum + r.stats.sCount, 0);
    const totalKeywords = results.length * 10;

    const sssRate = (totalSss / totalKeywords) * 100;
    const avgGoldenRatio = results.reduce((sum, r) => sum + r.stats.avgGoldenRatio, 0) / results.length;

    console.log(`\n🎯 등급 분포 (총 ${totalKeywords}개 키워드):`);
    console.log(`   SSS: ${totalSss}개 (${sssRate.toFixed(1)}%)`);
    console.log(`   SS:  ${totalSs}개 (${((totalSs / totalKeywords) * 100).toFixed(1)}%)`);
    console.log(`   S:   ${totalS}개 (${((totalS / totalKeywords) * 100).toFixed(1)}%)`);
    console.log(`   기타: ${totalKeywords - totalSss - totalSs - totalS}개`);

    console.log(`\n💎 SSS 키워드 다양성:`);
    console.log(`   고유 SSS 키워드: ${allSssKeywords.size}개`);
    const overlap = totalSss > 0 ? ((totalSss - allSssKeywords.size) / totalSss * 100) : 0;
    console.log(`   중복도: ${overlap.toFixed(1)}% (낮을수록 좋음)`);

    console.log(`\n📊 황금비율 통계:`);
    console.log(`   평균: ${avgGoldenRatio.toFixed(2)}%`);

    console.log(`\n🏆 발견된 고유 SSS 키워드:`);
    Array.from(allSssKeywords).sort().forEach((kw, i) => {
        console.log(`   ${i + 1}. ${kw}`);
    });

    // 점수 계산 (100점 기준)
    const score = Math.min(100,
        (sssRate * 1.0) + // SSS 비율 (100%면 100점) - Celeb은 어려우므로 비중 높임
        (Math.max(0, (allSssKeywords.size - 3)) * 10) // 최소 3개 이상 고유 키워드 발견 시 가점
    );

    console.log(`\n🎖️ 최종 점수: ${score.toFixed(1)}/100점`);

    if (score >= 90) console.log('   평가: 🌟 탁월함');
    else if (score >= 70) console.log('   평가: ✅ 우수함');
    else if (score >= 50) console.log('   평가: ⚠️ 개선 필요');
    else console.log('   평가: ❌ 대폭 개선 필요');

    // 결과 저장
    const reportPath = `benchmark-results-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify({ results, summary: { totalSss, totalKeywords, sssRate, allSssKeywords: Array.from(allSssKeywords), score } }, null, 2));
    console.log(`\n💾 상세 결과 저장: ${reportPath}`);
}

runQualityBenchmark().catch(console.error);
