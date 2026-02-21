/**
 * 🧪 Instant Niche Finder 테스트
 */

import { findNicheKeywordsInstantly } from './src/utils/instant-niche-finder';
import * as fs from 'fs';
import * as path from 'path';

async function test() {
    console.log('\n========== Instant Niche Finder 테스트 ==========\n');

    // 설정 파일에서 API 키 로드
    const configPath = path.join(process.cwd(), 'data', 'config.json');
    let apiConfig = {
        accessLicense: '',
        secretKey: '',
        customerId: ''
    };

    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            apiConfig.accessLicense = config.naverSearchAdAccessLicense || '';
            apiConfig.secretKey = config.naverSearchAdSecretKey || '';
            apiConfig.customerId = config.naverSearchAdCustomerId || '';
        } catch (e) {
            console.log('설정 파일 파싱 실패');
        }
    }

    if (!apiConfig.accessLicense || !apiConfig.secretKey) {
        console.log('❌ 네이버 검색광고 API 키가 설정되지 않았습니다.');
        console.log('   data/config.json에 naverSearchAdAccessLicense, naverSearchAdSecretKey 설정 필요');
        return;
    }

    console.log('✅ API 키 확인됨');
    console.log('');

    // 테스트 실행
    const result = await findNicheKeywordsInstantly(apiConfig, {
        seeds: ['로봇청소기', '청년지원금', '에어프라이어'],
        suffixes: ['추천', '가성비', '순위', '비교'],
        minSearchVolume: 200,
        maxDocumentCount: 10000,
        targetCount: 10
    });

    if (result.success) {
        console.log(`\n🎯 ${result.keywords.length}개 틈새 키워드 발굴 완료!\n`);
        console.log(`   총 발견: ${result.stats.totalDiscovered}개`);
        console.log(`   메트릭 조회: ${result.stats.metricsChecked}개`);
        console.log(`   틈새 필터: ${result.stats.nicheFiltered}개`);
        console.log(`   소요시간: ${result.stats.timeMs}ms`);
        console.log('');

        result.keywords.forEach((kw, i) => {
            const emoji = kw.nicheType === 'empty_house' ? '🏠' : kw.nicheType === 'gold_mine' ? '💰' : '🌊';
            console.log(`${i + 1}. ${emoji} "${kw.keyword}"`);
            console.log(`   검색량: ${kw.searchVolume.toLocaleString()} | 문서수: ${kw.documentCount.toLocaleString()}`);
            console.log(`   비율: ${kw.goldenRatio} | 점수: ${kw.nicheScore} | 카테고리: ${kw.category}`);
            console.log('');
        });
    } else {
        console.log(`❌ 실패: ${result.error}`);
    }

    console.log('========== 테스트 완료 ==========\n');
}

test().catch(console.error);
