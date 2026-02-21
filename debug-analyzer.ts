
import { getKeywordStorage } from './src/utils/mass-collection/keyword-storage';
import { getFreshKeywordsAPI } from './src/utils/mass-collection/fresh-keywords-api';

async function analyzeKeywords() {
    console.log('🧐 Analyzing Stored Keywords Quality...');

    const storage = getKeywordStorage();
    const api = getFreshKeywordsAPI();

    // 1. Check Raw Storage
    const allKeywords = await storage.getAll(); // Assuming getAll exists or getValidKeywords with lenient filters
    const validKeywords = await storage.getValidKeywords({ validOnly: true });

    console.log(`\n📦 Storage Status:`);
    console.log(`- Total Raw: ${allKeywords ? allKeywords.length : 'N/A'}`);
    console.log(`- Valid (72h): ${validKeywords.length}`);

    if (validKeywords.length === 0) {
        console.log('⚠️ No valid keywords found. Collector might be failing completely.');
        return;
    }

    // 2. Simulate metrics analysis
    let lowVolume = 0;
    let noNicheType = 0;
    let passedNiche = 0;
    const nicheTypes = { 'empty_house': 0, 'gold_mine': 0, 'blue_ocean': 0, 'none': 0 };

    console.log('\n📊 Quality Check (Sample of Valid Keywords):');

    // We need to run getFreshKeywords logic to see niche types
    const freshResult = await api.getFreshKeywords({
        count: 100,
        minSearchVolume: 0, // Get everything
        minGrade: undefined
    });

    const analyzed = freshResult.keywords;

    analyzed.forEach(k => {
        const type = k.nicheInfo?.type || 'none';
        nicheTypes[type]++;

        if ((k.searchVolume || 0) < 500) lowVolume++;

        if (type !== 'none' && (k.searchVolume || 0) >= 500) passedNiche++;
    });

    console.log(`- Analyzed Count: ${analyzed.length}`);
    console.log(`- Low Volume (< 500): ${lowVolume}`);
    console.log(`- Niche Types Distribution:`, nicheTypes);
    console.log(`- **Qualified for 'One Click'** (Niche Type + Vol>=500): ${passedNiche}`);

    // 3. Show samples of disqualified
    console.log('\n🗑️ Disqualified Samples (Low Volume or No Niche Type):');
    const disqualified = analyzed.filter(k => (k.searchVolume || 0) < 500 || k.nicheInfo?.type === 'none').slice(0, 5);
    disqualified.forEach(k => {
        console.log(`  - "${k.keyword}": Vol=${k.searchVolume}, Ratio=${k.goldenRatio?.toFixed(2)}, Type=${k.nicheInfo?.type}`);
    });

    // 4. Show qualified
    console.log('\n✨ Qualified Samples:');
    const qualified = analyzed.filter(k => (k.searchVolume || 0) >= 500 && k.nicheInfo?.type !== 'none').slice(0, 5);
    qualified.forEach(k => {
        console.log(`  - "${k.keyword}": Vol=${k.searchVolume}, Ratio=${k.goldenRatio?.toFixed(2)}, Type=${k.nicheInfo?.type}`);
    });
}

analyzeKeywords().catch(console.error);
