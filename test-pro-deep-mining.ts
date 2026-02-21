
import { huntProTrafficKeywords } from './src/utils/pro-traffic-keyword-hunter';

async function testProDeepMining() {
    console.log('🚀 Testing Traffic Hunter Pro with Ultimate Deep Mining...');

    try {
        const result = await huntProTrafficKeywords({
            mode: 'category',
            category: 'life_tips',
            seedKeywords: ['원룸청소', '자취꿀팁', '세탁기청소'], // Explicit seeds for deep mining
            count: 30,
            forceRefresh: true,
            explosionMode: true,
            useDeepMining: true
        });

        console.log(`\n✅ Hunt Complete! Found ${result.keywords.length} keywords.`);

        let deepMinedCount = 0;
        console.log('\n🔎 Checking for Deep Mined Keywords (Source check)...');

        result.keywords.forEach(k => {
            if (k.source && k.source.startsWith('deep_mining')) {
                deepMinedCount++;
                console.log(`✨ [Deep Mined] ${k.keyword} (Source: ${k.source}) (Vol: ${k.searchVolume}, Doc: ${k.documentCount})`);
            }
        });

        console.log(`\n📊 Summary:`);
        console.log(`Total Keywords: ${result.keywords.length}`);
        console.log(`Deep Mined Keywords: ${deepMinedCount}`);

        if (deepMinedCount > 0) {
            console.log('\n✅ SUCCESS: Deep mining logic successfully integrated and found hidden gems!');
        } else {
            console.warn('\n⚠️ WARNING: No deep mined keywords found in the final result. They might have been filtered out or not discovered.');
        }

    } catch (error) {
        console.error('❌ Test Failed:', error);
    }
}

testProDeepMining();
