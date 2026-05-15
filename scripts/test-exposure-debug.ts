// 사용자 블로그가 진짜로 top 30 미진입인지 vs 매칭 버그인지 확인
// 1) site:blog.naver.com/{id} 로 인덱싱 확인
// 2) 글 제목 일부로 검색 → 블로그 글이 어디 있는지 확인
import axios from 'axios';
import * as cheerio from 'cheerio';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

async function check(blogId: string, queries: string[]) {
  for (const q of queries) {
    const url = `https://m.search.naver.com/search.naver?where=view&query=${encodeURIComponent(q)}`;
    try {
      const r = await axios.get(url, { headers: { 'User-Agent': MOBILE_UA }, timeout: 12000, responseType: 'text' });
      const $ = cheerio.load(r.data);
      const seen = new Set<string>();
      const links: { rank: number; blog: string; post: string; isTarget: boolean }[] = [];
      let rank = 0;
      $('a').each((_i, a) => {
        const href = String($(a).attr('href') || '');
        const m = href.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/i);
        if (!m) return;
        const key = `${m[1]}/${m[2]}`;
        if (seen.has(key)) return;
        seen.add(key);
        rank++;
        if (rank > 30) return;
        const isTarget = m[1] === blogId;
        links.push({ rank, blog: m[1], post: m[2], isTarget });
      });
      const target = links.find(l => l.isTarget);
      console.log(`\n[${q}]`);
      console.log(`  총 ${rank}개 결과 (top 30)`);
      if (target) {
        console.log(`  ✅ ${blogId} 발견: #${target.rank} (post ${target.post})`);
      } else {
        console.log(`  ❌ ${blogId} 없음 — top 5: ${links.slice(0, 5).map(l => `${l.blog}#${l.rank}`).join(' / ')}`);
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (e: any) {
      console.log(`[${q}] err: ${e.message}`);
    }
  }
}

(async () => {
  console.log('=== 글 제목 핵심 키워드로 노출 확인 ===');
  await check('rimi_77-', [
    '고유가 피해지원금',
    '고유가 피해지원금 건강보험료',
    '피해지원금 자가진단',
    '부모급여 신청',
    '소상공인 지원금',
    '5월 18일 통장 25만원',
    '건강보험료 기준 1분 자가진단',
  ]);

  console.log('\n\n=== 글 제목 그대로 (정확 검색) ===');
  await check('rimi_77-', [
    '하위 70% 고유가 피해지원금 건강보험료',
    '5월 18일부터 통장에 25만원',
    '"고유가 피해지원금 자가진단"',
  ]);

  process.exit(0);
})();
