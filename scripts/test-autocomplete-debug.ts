// 자동완성 단독 호출 디버그
(async () => {
  const fetch = (await import('node-fetch')).default;
  const queries = ['지원금', '정부 지원금', '2026 지원금', '민생 지원금', '소상공인 지원금'];

  for (const q of queries) {
    const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://search.naver.com/',
        },
      });
      const text = await r.text();
      console.log(`\n[${q}] status=${r.status} bytes=${text.length}`);
      if (r.status === 200) {
        try {
          const data = JSON.parse(text);
          if (data.items?.[0]) {
            const items = (data.items[0] as any[]).slice(0, 8).map((i: any) => i[0]);
            console.log(`  items[0] (${data.items[0].length}): ${JSON.stringify(items)}`);
          } else {
            console.log(`  no items`);
          }
        } catch (e: any) {
          console.log(`  json parse err: ${e.message}, head=${text.slice(0, 100)}`);
        }
      } else {
        console.log(`  body head: ${text.slice(0, 200)}`);
      }
    } catch (e: any) {
      console.log(`[${q}] fetch err: ${e.message}`);
    }
  }
  process.exit(0);
})();
