const fs = require('fs');
const path = require('path');
const { isKeywordMatchingCategory } = require(path.join(__dirname, '..', 'dist', 'utils', 'category-classifier'));
const isKeywordInSelectedCategory = isKeywordMatchingCategory;

const cachePath = 'C:\\Users\\박성현\\AppData\\Roaming\\blogger-admin-panel\\keyword-cache.json';
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
const complete = Object.entries(cache).filter(([k, v]) => (v.searchVolume || 0) > 0 && (v.documentCount || 0) > 0);
console.log(`총 ${Object.keys(cache).length}개 중 완전 데이터: ${complete.length}`);

// Dedupe: clean(공백제거) 버전 중복 제거 → 원본 키워드만
const dedupedComplete = new Map();
for (const [k, v] of complete) {
  // 공백 있는 버전 우선 선호
  const canonKey = k;
  if (k.includes(' ') || !dedupedComplete.has(k.replace(/\s/g, ''))) {
    dedupedComplete.set(k, v);
  }
}
console.log(`  (중복 제거 후 실질: ${dedupedComplete.size})`);

const cats = ['life_tips', 'electronics', 'beauty', 'health', 'finance', 'recipe', 'food', 'fashion', 'realestate'];
for (const cat of cats) {
  const match = [...dedupedComplete.entries()].filter(([k]) => isKeywordInSelectedCategory(k, cat));
  console.log(`  ${cat.padEnd(12)}: ${match.length}개`);
}

console.log('\n=== life_tips 샘플 ===');
const lifeTipsMatch = [...dedupedComplete.entries()].filter(([k]) => isKeywordInSelectedCategory(k, 'life_tips'));
for (const [k, v] of lifeTipsMatch.slice(0, 15)) {
  console.log(`  "${k}" sv=${v.searchVolume} dc=${v.documentCount}`);
}
