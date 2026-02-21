
import { detectSmartBlockType } from './src/utils/naver-smart-block-extractor';
import { getTitleGenerator } from './src/utils/mass-collection/keyword-title-generator';
import { FreshKeyword } from './src/utils/mass-collection/fresh-keywords-api';

async function runTest() {
    console.log('🧪 Title Generator Upgrade Test');

    const keywords = ['숙행', '국세청', '안성기', '삼성화재', '부산은행'];

    for (const kw of keywords) {
        console.log(`\nAnalyzing '${kw}'...`);
        try {
            const type = await detectSmartBlockType(kw);
            console.log(`> Detected Type: ${type}`);

            const mockKw: any = {
                id: 'test',
                keyword: kw,
                category: 'celeb', // Use a valid one just in case
                source: 'related', // valid
                collectedAt: new Date().toISOString(),
                searchVolume: 1000,
                documentCount: 10,
                grade: 'S',
                goldenRatio: 100,
                freshness: 100,
                smartBlockType: type || undefined
            };

            const titles = getTitleGenerator().generateTitles(mockKw, 3);
            console.log(`> Generated Titles:`);
            titles.forEach(t => console.log(`  - ${t}`));

        } catch (e) {
            console.error(`Error analyzing ${kw}:`, e);
        }
    }
}

runTest();
