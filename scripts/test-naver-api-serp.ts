// 네이버 블로그 검색 API 로 노출 확인 — 차단 없이 정확 측정
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// .env 또는 config 파일에서 키 가져오기 시도
function loadKeys() {
  const candidatePaths = [
    path.join(process.env.APPDATA || '', 'leword', 'config.json'),
    path.join(process.env.APPDATA || '', 'blogger-admin-panel', 'config.json'),
    'C:/Users/park/AppData/Roaming/leword/config.json',
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.naverClientId && cfg.naverClientSecret) {
          console.log(`[KEYS] found: ${p}`);
          return { id: cfg.naverClientId, secret: cfg.naverClientSecret };
        }
      }
    } catch {}
  }
  // env
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    return { id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET };
  }
  return null;
}

(async () => {
  const keys = loadKeys();
  if (!keys) {
    console.error('❌ 네이버 API 키 없음 (config 파일 또는 환경변수)');
    process.exit(1);
  }

  const target = 'leader_248';
  const queries = ['고유가 피해지원금', '부모급여 신청', '소상공인 지원금', '재테크 입문'];

  for (const q of queries) {
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(q)}&display=30&sort=sim`;
    try {
      const r = await axios.get(url, {
        headers: { 'X-Naver-Client-Id': keys.id, 'X-Naver-Client-Secret': keys.secret },
        timeout: 10000, validateStatus: () => true,
      });
      if (r.status !== 200) { console.log(`[${q}] status=${r.status}`); continue; }
      const items = r.data?.items || [];
      let rank = 0;
      const seen = new Set<string>();
      const found: any[] = [];
      const sample: string[] = [];
      for (const it of items) {
        const link = String(it.link || '');
        const m = link.match(/(?:m\.)?blog\.naver\.com\/([^/?#"]+)\/(\d+)/i);
        if (!m) continue;
        const key = `${m[1]}/${m[2]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rank++;
        if (rank <= 5) sample.push(`#${rank} ${m[1]}`);
        if (m[1] === target) found.push({ rank, post: m[2] });
      }
      console.log(`[${q}] 총 ${rank}건, ${target} 발견: ${found.length ? '#'+found[0].rank : '❌'} | top 5: ${sample.join(' / ')}`);
    } catch (e: any) {
      console.log(`[${q}] err: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  process.exit(0);
})();
