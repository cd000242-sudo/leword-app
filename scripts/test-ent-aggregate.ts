import { fetchEntertainmentAggregate } from '../src/utils/entertainment-news-aggregator';
(async () => {
  const items = await fetchEntertainmentAggregate({ maxMinutesAgo: 180, limitPerSource: 8 });
  const byCat: Record<string, number> = {};
  items.forEach(i => byCat[i.sourceLabel] = (byCat[i.sourceLabel] || 0) + 1);
  console.log(`[TEST] 총 ${items.length}건\n매체별: ${JSON.stringify(byCat)}\n`);
  items.slice(0, 25).forEach((it, idx) => {
    const time = it.ago.padEnd(8);
    console.log(`  ${(idx + 1).toString().padStart(2)}. [${it.sourceLabel.padEnd(5)}] ${time} [${it.category}] ${it.title.slice(0, 70)}`);
  });
  process.exit(0);
})();
