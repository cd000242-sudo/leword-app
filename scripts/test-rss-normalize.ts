// 다양한 입력이 RSS URL 로 잘 변환되는지 테스트
function normalize(input: string): string | null {
  const s = String(input || '').trim();
  if (!s) return null;
  const rssWithXml = s.match(/rss\.blog\.naver\.com\/([^/?#]+)\.xml/i);
  if (rssWithXml) return `https://rss.blog.naver.com/${rssWithXml[1]}.xml`;
  const rssNoXml = s.match(/rss\.blog\.naver\.com\/([^/?#]+)/i);
  if (rssNoXml) {
    const id = rssNoXml[1].replace(/\.xml$/i, '');
    return `https://rss.blog.naver.com/${id}.xml`;
  }
  const pvMatch = s.match(/PostView\.naver\?blogId=([^&]+)/i);
  if (pvMatch) return `https://rss.blog.naver.com/${pvMatch[1]}.xml`;
  const urlMatch = s.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)/i);
  if (urlMatch && urlMatch[1].toLowerCase() !== 'postview.naver') {
    return `https://rss.blog.naver.com/${urlMatch[1]}.xml`;
  }
  if (/^[a-zA-Z0-9._-]+$/.test(s)) return `https://rss.blog.naver.com/${s}.xml`;
  return null;
}

const cases = [
  'rimi_77-',
  'blog.naver.com/rimi_77-',
  'https://blog.naver.com/rimi_77-',
  'https://blog.naver.com/rimi_77-/224286769443',
  'https://m.blog.naver.com/rimi_77-',
  'https://m.blog.naver.com/rimi_77-/224286769443',
  'https://blog.naver.com/PostView.naver?blogId=rimi_77-&logNo=224286769443',
  'https://rss.blog.naver.com/rimi_77-.xml',
  'rss.blog.naver.com/rimi_77-',
  'naver_search',
  'kim.with.dot',
  '',
  '!@#$%^',
];

for (const c of cases) {
  console.log(`"${c}" → ${normalize(c)}`);
}
