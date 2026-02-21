import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';
import * as fs from 'fs';

async function test() {
    console.log('🚀 생활 꿀팁 키워드 발굴 시작...');
    try {
        const result = await huntProTrafficKeywords({
            mode: 'realtime',
            category: 'life_tips',
            count: 20,
            forceRefresh: true
        } as any);

        fs.writeFileSync('life-tips-keywords-final.json', JSON.stringify(result, null, 2));
        console.log('✅ life-tips-keywords-final.json 저장 완료');
    } catch (error) {
        console.error('❌ 에러 발생:', error);
    }
}

test();
