import { fetchStarNewsTrending } from '../src/utils/starnews-trending';
(async () => {
  const items = await fetchStarNewsTrending(12);
  console.log(`[TEST] starnews trending ${items.length}건\n`);
  items.forEach(i => console.log(`  ${i.rank}. ${i.isHot ? '🔥 ' : '   '}[${i.category}] ${i.title}`));
  process.exit(0);
})();
