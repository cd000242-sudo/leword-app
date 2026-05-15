// v2.42.68 시맨틱 sibling 검증 — "2026 소상공인 지원금" 입력 시
// "고유가 피해지원금", "3차 민생지원금" 같은 헤드명사 공유 sibling이 나오는지
import { generateKeywordMindmap, extractAllKeywords } from '../src/utils/keyword-mindmap';

(async () => {
  const seed = '2026 소상공인 지원금';
  console.log(`[TEST] seed: "${seed}"`);
  const start = Date.now();
  const mindmap = await generateKeywordMindmap(seed, {
    maxDepth: 1,
    maxKeywordsPerLevel: 60,
    smartExpansion: true,
  });
  const all = extractAllKeywords(mindmap);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[TEST] ${elapsed}s, 총 ${all.length}개 발굴`);

  // 헤드 명사(지원금) 공유 + 소상공인 미포함 = 진짜 sibling
  const siblings = all.filter(k =>
    k !== seed && k.includes('지원금') && !k.includes('소상공인') && !k.includes('2026')
  );
  console.log(`\n[TEST] 시맨틱 sibling (지원금 ∩ ¬소상공인 ∩ ¬2026): ${siblings.length}개`);
  siblings.slice(0, 30).forEach(k => console.log(`   - ${k}`));

  // prefix 확장 (기존 mindmap이 잘하던 것)
  const prefixExtensions = all.filter(k => k !== seed && k.startsWith('2026 소상공인'));
  console.log(`\n[TEST] prefix 확장: ${prefixExtensions.length}개`);
  prefixExtensions.slice(0, 10).forEach(k => console.log(`   - ${k}`));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
