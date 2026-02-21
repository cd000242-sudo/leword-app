import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';
import * as fs from 'fs';

async function test() {
    try {
        const result = await huntProTrafficKeywords({
            mode: 'realtime',
            category: 'celeb',
            count: 20,
            forceRefresh: true
        } as any);

        fs.writeFileSync('celeb-keywords-final.json', JSON.stringify(result, null, 2));
        console.log('✅ celeb-keywords-final.json 저장 완료');
    } catch (error) {
        console.error('❌ 에러 발생:', error);
    }
}

test();
