#!/usr/bin/env node
/**
 * 네이버 실시간 검색어 스냅샷 — 선점 보드가 "이미 대중화됐는가" 를 재는 재료.
 *
 * 왜 필요한가 (2026-08-11 확인):
 *   보드 워크플로가 --signals 를 안 넘겨서 실시간 집합이 늘 비어 있었다. 그러면
 *   `inRealtimeNow` 가 전 행 false 가 되고, 화면에는 "실시간 검색어에는 아직 없다 —
 *   대중화 전이다" 가 근거로 붙는다. **재보지도 않고 한 말**이라 이건 실측이 아니다.
 *
 * 공급원은 네이버(signal.bz) 하나다 — 사장님 지시.
 *   보드가 판정하는 자리는 네이버 검색 자리다. 다음·네이트·ZUM 의 이슈어를 섞으면
 *   네이버 자리와 무관한 말이 "이미 대중화됐다" 판정을 흔든다. 크롤러를 넷 돌리면
 *   넷의 사망을 매 회차 지켜봐야 하는 문제도 있다.
 *
 * 못 받으면 **파일을 안 쓴다.** 빈 파일을 남기면 아래 단계가 "실시간에 없음" 과
 * "못 쟀음" 을 구별할 수 없다. 파일이 없으면 그 자체로 '못 쟀음' 이다.
 *
 * 사용: node scripts/realtime-signals.js --out=signals.json [--limit=20]
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

async function main() {
  const outPath = arg('out');
  if (!outPath) {
    console.error('--out=<경로> 가 필요합니다.');
    process.exit(2);
  }
  const limit = Number(arg('limit', '20')) || 20;
  const resolved = path.resolve(outPath);

  const { getNaverRealtimeKeywords } = require('../src/utils/realtime-search-keywords');
  let rows = [];
  try {
    rows = await getNaverRealtimeKeywords(limit);
  } catch (error) {
    console.error(`실시간 수집 실패: ${String(error && error.message || error).slice(0, 160)}`);
    rows = [];
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    /*
     * 옛 스냅샷을 남겨 두면 다음 단계가 그걸 오늘 것으로 읽는다.
     * 지운다 — '못 쟀음' 이 정확한 상태다.
     */
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    console.error('실시간 검색어 0건 — 스냅샷을 쓰지 않습니다(다음 단계가 "못 쟀음"으로 다룹니다).');
    process.exit(0);
  }

  // loadRealtime 이 읽는 모양(lanes[].items[]) 그대로 낸다.
  const payload = {
    collectedAt: new Date().toISOString(),
    source: 'naver-signal.bz',
    lanes: [{
      lane: 'realtime',
      items: rows.map((row) => ({
        keyword: String(row.keyword || '').trim(),
        rank: row.rank ?? null,
        change: row.change || null,
      })).filter((row) => row.keyword),
    }],
  };

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(payload, null, 1), 'utf8');
  console.log(`실시간 검색어 ${payload.lanes[0].items.length}건 → ${outPath}`);
  console.log(`  ${payload.lanes[0].items.slice(0, 5).map((r) => r.keyword).join(' · ')}`);
}

main().catch((error) => { console.error('실패:', error.message); process.exit(1); });
