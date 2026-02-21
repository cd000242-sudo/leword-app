/**
 * 실시간 검색어 전체 테스트
 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);


 * 환경변수에서 API 키 로드
 */

import * as dotenv from 'dotenv';
dotenv.config();

// 환경변수 확인
console.log('='.repeat(70));
console.log('🔑 환경변수 확인');
console.log('='.repeat(70));
console.log(`NAVER_CLIENT_ID: ${process.env.NAVER_CLIENT_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`NAVER_CLIENT_SECRET: ${process.env.NAVER_CLIENT_SECRET ? '✅ 설정됨' : '❌ 없음'}`);

async function testRealtimeKeywords() {
  console.log('\n' + '='.repeat(70));
  console.log('📡 실시간 검색어 테스트');
  console.log('='.repeat(70));
  
  // 1. 네이트 테스트 (Puppeteer)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 1. 네이트 실시간 검색어 (Puppeteer)');
  console.log('━'.repeat(70));
  
  try {
    const { getNateRealtimeKeywordsWithPuppeteer } = await import('./src/utils/nate-realtime-api');
    const nateKeywords = await getNateRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 네이트: ${nateKeywords.length}개 키워드`);
    nateKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 네이트 오류: ${error.message}`);
  }
  
  // 2. 다음 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 2. 다음 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getDaumRealtimeKeywordsWithPuppeteer } = await import('./src/utils/daum-realtime-api');
    const daumKeywords = await getDaumRealtimeKeywordsWithPuppeteer(10);
    
    console.log(`\n✅ 다음: ${daumKeywords.length}개 키워드`);
    daumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ 다음 오류: ${error.message}`);
  }
  
  // 3. ZUM 테스트
  console.log('\n' + '━'.repeat(70));
  console.log('📌 3. ZUM 실시간 검색어');
  console.log('━'.repeat(70));
  
  try {
    const { getZumRealtimeKeywords } = await import('./src/utils/realtime-search-keywords');
    const zumKeywords = await getZumRealtimeKeywords(10);
    
    console.log(`\n✅ ZUM: ${zumKeywords.length}개 키워드`);
    zumKeywords.forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
    });
  } catch (error: any) {
    console.error(`❌ ZUM 오류: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ 테스트 완료');
  console.log('='.repeat(70));
}

testRealtimeKeywords().catch(console.error);

