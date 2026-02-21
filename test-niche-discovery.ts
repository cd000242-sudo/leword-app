/**
 * 🎯 틈새 키워드(빈집털이) 실제 결과 테스트
 * - 현재 저장소에서 진짜 돈되는 키워드가 있는지 확인
 */

import * as fs from 'fs';
import * as path from 'path';

const storagePath = path.join(process.cwd(), 'data', 'keywords-storage.json');

if (!fs.existsSync(storagePath)) {
    console.log('❌ Storage file not found. 앱에서 키워드 수집을 먼저 실행하세요.');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
const keywords = data.keywords as any[];

console.log(`\n========== 저장소 분석: ${keywords.length}개 키워드 ==========\n`);

// 분석
const now = new Date();

// 1. 유효한 키워드 필터링
const valid = keywords.filter(kw => new Date(kw.validUntil) > now && kw.searchVolume && kw.documentCount);
console.log(`유효한 키워드: ${valid.length}개`);

// 2. 틈새 분석
interface NicheKeyword {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    goldenRatio: number;
    grade: string;
    type: string;
    score: number;
    category: string;
}

const analyzed: NicheKeyword[] = valid.map(kw => {
    const sv = kw.searchVolume || 0;
    const dc = kw.documentCount || 1;
    const goldenRatio = sv / dc;

    let type = 'none';
    let score = 0;

    // 빈집털이: 검색량 500+, 문서수 < 500
    if (sv >= 500 && dc < 500) {
        type = 'empty_house';
        score = 90 + Math.min(10, sv / 500);
    }
    // 꿀통: 검색량 5000+, 비율 3.0 이상
    else if (sv >= 5000 && goldenRatio >= 3.0) {
        type = 'gold_mine';
        score = 80 + Math.min(20, goldenRatio * 2);
    }
    // 블루오션: 비율 2.0 이상, 검색량 300+
    else if (goldenRatio >= 2.0 && sv >= 300) {
        type = 'blue_ocean';
        score = 60 + Math.min(30, goldenRatio * 5);
    }
    else {
        score = goldenRatio * 10;
    }

    return {
        keyword: kw.keyword,
        searchVolume: sv,
        documentCount: dc,
        goldenRatio: Math.round(goldenRatio * 100) / 100,
        grade: kw.grade,
        type,
        score: Math.round(score),
        category: kw.category
    };
});

// 틈새 타입별 분류
const emptyHouse = analyzed.filter(k => k.type === 'empty_house');
const goldMine = analyzed.filter(k => k.type === 'gold_mine');
const blueOcean = analyzed.filter(k => k.type === 'blue_ocean');
const general = analyzed.filter(k => k.type === 'none');

console.log(`\n--- 틈새 타입별 분류 ---`);
console.log(`🏠 빈집털이 (Empty House): ${emptyHouse.length}개`);
console.log(`💰 꿀통 (Gold Mine): ${goldMine.length}개`);
console.log(`🌊 블루오션: ${blueOcean.length}개`);
console.log(`📄 일반: ${general.length}개`);

// 3. 상위 빈집털이 키워드 출력
console.log(`\n========== 🏠 빈집털이 TOP 10 (진짜 돈되는 키워드) ==========\n`);
emptyHouse
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .forEach((k, i) => {
        console.log(`${i + 1}. "${k.keyword}"`);
        console.log(`   검색량: ${k.searchVolume.toLocaleString()} | 문서수: ${k.documentCount.toLocaleString()} | 비율: ${k.goldenRatio}`);
        console.log(`   등급: ${k.grade} | 점수: ${k.score} | 카테고리: ${k.category}`);
        console.log('');
    });

// 4. 상위 꿀통 키워드 출력
console.log(`\n========== 💰 꿀통 TOP 10 (대량 트래픽) ==========\n`);
goldMine
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 10)
    .forEach((k, i) => {
        console.log(`${i + 1}. "${k.keyword}"`);
        console.log(`   검색량: ${k.searchVolume.toLocaleString()} | 문서수: ${k.documentCount.toLocaleString()} | 비율: ${k.goldenRatio}`);
        console.log('');
    });

// 5. 상위 블루오션 키워드 출력
console.log(`\n========== 🌊 블루오션 TOP 10 ==========\n`);
blueOcean
    .sort((a, b) => b.goldenRatio - a.goldenRatio)
    .slice(0, 10)
    .forEach((k, i) => {
        console.log(`${i + 1}. "${k.keyword}" (비율: ${k.goldenRatio})`);
        console.log(`   검색량: ${k.searchVolume.toLocaleString()} | 문서수: ${k.documentCount.toLocaleString()}`);
        console.log('');
    });

// 6. 카테고리별 분포 (지원금/리빙 확인)
console.log(`\n========== 카테고리별 분포 ==========\n`);
const catDist: Record<string, number> = {};
analyzed.forEach(k => {
    catDist[k.category] = (catDist[k.category] || 0) + 1;
});
Object.entries(catDist)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
        console.log(`${cat}: ${count}개`);
    });

console.log(`\n========== 테스트 완료 ==========\n`);
