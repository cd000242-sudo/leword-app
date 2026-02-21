/**
 * 🔬 문서수 파싱 디버그
 */

import axios from 'axios';

async function debugDocCount(keyword: string) {
    console.log(`\n=== "${keyword}" 문서수 파싱 디버그 ===\n`);

    try {
        const url = `https://search.naver.com/search.naver?where=view&query=${encodeURIComponent(keyword)}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
            timeout: 8000
        });

        const html = response.data as string;

        // HTML 일부 출력
        console.log('HTML 길이:', html.length);

        // 문서수 관련 패턴 찾기
        const patterns = [
            /약\s+([0-9,]+)\s*건/,
            /([0-9,]+)\s*개의?\s*(?:검색|블로그)/,
            /총\s*([0-9,]+)\s*건/,
            /"count"\s*:\s*(\d+)/,
            /결과\s*([0-9,]+)/
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                console.log(`패턴 매치: ${pattern} -> "${match[0]}" (${match[1]})`);
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
        }

        // 문서수 관련 텍스트 추출
        const docCountArea = html.match(/.{0,50}문서.{0,50}|.{0,50}건.{0,50}|.{0,50}개의.{0,50}/g);
        if (docCountArea) {
            console.log('문서수 관련 텍스트:');
            docCountArea.slice(0, 5).forEach(t => console.log('  -', t.trim().substring(0, 80)));
        }

        console.log('❌ 문서수 파싱 실패');
        return 50000;

    } catch (error: any) {
        console.log('에러:', error.message);
        return 50000;
    }
}

async function test() {
    const keywords = ['로봇청소기 추천', '청년지원금 신청'];
    for (const kw of keywords) {
        await debugDocCount(kw);
    }
}

test().catch(console.error);
