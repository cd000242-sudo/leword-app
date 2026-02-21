
import { getFreshKeywordsAPI, resetFreshKeywordsAPI } from './src/utils/mass-collection/fresh-keywords-api';
import { getCollectorScheduler, resetCollectorScheduler } from './src/utils/mass-collection/keyword-collector-scheduler';
import { getKeywordStorage, resetKeywordStorage } from './src/utils/mass-collection/keyword-storage';

async function testFix() {
    console.log('🧪 Testing One Click Magic Fix...');

    // Reset everything to empty state
    resetFreshKeywordsAPI();
    resetCollectorScheduler();
    resetKeywordStorage();

    const storage = getKeywordStorage();
    await storage.clear(); // Make sure db is empty

    const api = getFreshKeywordsAPI();

    // Conf: collector with small limit for speed
    const scheduler = getCollectorScheduler({
        maxKeywordsPerSource: 3, // Small batch
        sources: ['naver_autocomplete', 'google'] // Fast sources
    });

    console.log('🚀 Calling getNicheKeywords(count=5)...');
    const start = Date.now();

    // This should trigger auto-collect AND auto-metric-update
    const result = await api.getNicheKeywords({ count: 5 });

    const duration = Date.now() - start;

    console.log(`\n⏱️ Duration: ${duration}ms`);
    console.log(`✅ Result Count: ${result.keywords.length}`);
    console.log(`📊 Valid Count (Summary): ${result.summary.validCount}`);

    result.keywords.forEach(k => {
        console.log(`  - [${k.keyword}] Vol: ${k.searchVolume}, Niche: ${k.nicheInfo?.type}`);
    });

    if (result.keywords.length > 0 && result.keywords.every(k => k.searchVolume !== undefined)) {
        console.log('✨ SUCCESS: Keywords returned with volume data!');
    } else {
        console.log('❌ FAILURE: No keywords or missing volume.');
    }
}

testFix().catch(console.error);
