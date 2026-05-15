import { fetchStarNewsFresh } from '../src/utils/starnews-trending';
(async () => {
  const items = await fetchStarNewsFresh({ maxMinutesAgo: 180, limit: 15 });
  console.log(`[TEST] fresh 기사 ${items.length}건 (최근 3시간, 비경쟁 우선)\n`);
  items.forEach((i, idx) => {
    const flag = i.competing ? '🔴 경쟁' : '🟢 선점';
    console.log(`  ${idx + 1}. ${flag} [${i.category}] (${i.ago})`);
    console.log(`      ${i.title}`);
  });
  process.exit(0);
})();
