import { discoverMonthlyCategorySeeds } from '../src/utils/adsense-keyword-hunter';
import { bootstrapSources } from '../src/utils/sources/source-bootstrap';
import { EnvironmentManager } from '../src/utils/environment-manager';

(async () => {
    EnvironmentManager.getInstance();
    bootstrapSources();
    const r = await discoverMonthlyCategorySeeds(4, { topPerCategory: 8 });
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('🔬 4월 시즌 자동 발견 시드 (28개 소스 → 카테고리별 분류)');
    console.log('══════════════════════════════════════════════════════════');
    const order = ['beauty', 'fashion', 'travel', 'food', 'living', 'gardening', 'subsidy', 'health', 'parenting', 'gift', 'family', 'shopping', 'hobby', 'education', 'car', 'etc'];
    for (const cat of order) {
        const seeds = r[cat];
        if (!seeds || seeds.length === 0) continue;
        console.log(`\n[${cat.toUpperCase()}] ${seeds.length}개`);
        seeds.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    }
    process.exit(0);
})();
