
import { getCollectorScheduler, resetCollectorScheduler } from './src/utils/mass-collection/keyword-collector-scheduler';
import { getKeywordStorage, resetKeywordStorage } from './src/utils/mass-collection/keyword-storage';

async function debugCollector() {
    console.log('🐞 Starting Collector Debugger...');

    // Reset singletons to ensure fresh state
    resetCollectorScheduler();
    resetKeywordStorage();

    const scheduler = getCollectorScheduler({
        autoStart: false,
        intervalMs: 1000 * 60,
        sources: ['zum', 'nate', 'daum', 'signal', 'google', 'naver_autocomplete'],
        maxKeywordsPerSource: 5 // Quick test
    });

    console.log('🚀 Triggering collectNow()...');
    const result = await scheduler.collectNow();

    console.log('\n📊 Collection Result:');
    console.log(`Success: ${result.success}`);
    console.log(`Total Collected: ${result.totalCollected}`);
    console.log(`New Added: ${result.newKeywords}`);
    console.log(`Errors: ${result.errors.length}`);

    console.log('\n🔍 By Source Details:');
    for (const [source, stats] of Object.entries(result.bySource)) {
        const s = stats as { collected: number, errors: string[] };
        console.log(`[${source}] Collected: ${s.collected}, Errors: ${s.errors.length}`);
        if (s.errors.length > 0) {
            console.log(`   ⚠️ First Error: ${s.errors[0]}`);
        }
    }

    // Storage Stats
    const storage = getKeywordStorage();
    const stats = await storage.getStats();
    console.log('\n💾 Storage Stats:');
    console.log(`Total Persisted: ${stats.totalKeywords}`);
}

debugCollector().catch(console.error);
