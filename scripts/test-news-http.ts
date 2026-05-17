// Windows 콘솔에서 UTF-8 출력
process.stdout.setDefaultEncoding && process.stdout.setDefaultEncoding('utf-8');
import { getNaverPopularNews } from '../src/utils/naver-news-crawler';
(async () => {
  const t = Date.now();
  const r = await getNaverPopularNews();
  const el = ((Date.now() - t) / 1000).toFixed(1);
  // Buffer 로 명시 출력 (Windows cp949 회피)
  const out = (s: string) => process.stdout.write(Buffer.from(s + '\n', 'utf-8'));
  out(`총 ${r.news.length}건, success=${r.success}, ${el}s`);
  out(`카테고리: ${JSON.stringify(r.categoryStats)}`);
  out('샘플 5건:');
  r.news.slice(0, 5).forEach(n => out(`  #${n.rank} [${n.category}] ${n.title.slice(0, 60)} (${n.press})`));
  process.exit(0);
})();
