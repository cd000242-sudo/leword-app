const path = require('path');
const { getAllKeywordsWithCompleteData, getCacheStats } = require(path.join(__dirname, '..', 'dist', 'utils', 'persistent-keyword-cache'));

console.log('[TEST] getCacheStats():', getCacheStats());
const all = getAllKeywordsWithCompleteData();
console.log(`[TEST] getAllKeywordsWithCompleteData(): ${all.length}개`);
for (const item of all.slice(0, 10)) {
  console.log(`  "${item.keyword}" sv=${item.searchVolume} dc=${item.documentCount}`);
}
