// 데스크탑 SERP 로 사용자 블로그 매칭 풀 검증
import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractBlogIdPostNo(url: string): { blogId: string; postNo: string } {
  const m1 = url.match(/PostView\.naver\?blogId=([^&]+)&logNo=(\d+)/i);
  if (m1) return { blogId: m1[1], postNo: m1[2] };
  const m2 = url.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/i);
  if (m2) return { blogId: m2[1], postNo: m2[2] };
  return { blogId: '', postNo: '' };
}

async function find(keyword: string, targetBlog: string) {
  const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
  const r = await axios.get(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', 'Referer': 'https://www.naver.com/' },
    timeout: 12000, responseType: 'text', validateStatus: () => true,
  });
  if (r.status !== 200) return console.log(`[${keyword}] status=${r.status}`);
  const $ = cheerio.load(r.data);
  const seen = new Set<string>();
  const found: any[] = [];
  let rank = 0;
  $('a').each((_i, a) => {
    const href = String($(a).attr('href') || '');
    const m = href.match(/(?:m\.)?blog\.naver\.com\/([^/?#"]+)\/(\d+)/i);
    if (!m) return;
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) return;
    seen.add(key);
    rank++;
    if (rank > 30) return;
    if (m[1] === targetBlog) found.push({ rank, post: m[2] });
  });
  console.log(`[${keyword}] 총 ${rank}개 SERP — ${targetBlog} 발견: ${found.length ? '#'+found[0].rank : '❌'}`);
}

(async () => {
  for (const q of [
    '고유가 피해지원금',
    '고유가 피해지원금 2차',
    '부모급여',
    '부모급여 신청',
    '건강보험료 기준',
  ]) {
    await find(q, 'rimi_77-');
    await new Promise(r => setTimeout(r, 800));
  }
  process.exit(0);
})();
