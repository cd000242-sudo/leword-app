#!/usr/bin/env node
/**
 * 제휴 캠페인 재수집 — 한 명령.
 *
 * 전에는 셋으로 나뉘어 있었다: --scrape → parse → 사이트 레포로 복사·커밋.
 * 손으로 이어 붙이다 보면 두 번째를 빼먹은 채 "갱신했다" 고 믿게 된다.
 *
 *   node scripts/affiliate-refresh.js
 *     채집 → 파싱 → 사이트 레포에 복사까지. 발행(커밋·푸시)은 하지 않는다.
 *   node scripts/affiliate-refresh.js --publish
 *     위에 더해 그 파일 하나만 커밋하고 푸시한다.
 *   node scripts/affiliate-refresh.js --autoLogin
 *     세션이 풀렸으면 로그인 창을 띄우고, 로그인 뒤 채집을 한 번 더 시도한다.
 *
 * 세션: tmp/affiliate-profile (쿠키만. 비밀번호는 어디에도 저장되지 않는다)
 *
 * ## 왜 발행이 기본이 아닌가 (2026-08-11 확인)
 *
 * 사이트(cd000242-sudo/naver)에 이 파일을 **읽는 쪽이 아직 없다**.
 * spa/src 어디에서도 affiliate-campaigns.json 을 fetch 하지 않는다. 그래서 지금
 * 푸시하면 아무도 안 보는 파일이 배포에 실린다. 화면이 붙은 뒤 --publish 를 쓰거나,
 * 이 주석과 함께 기본값을 바꾸면 된다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, 'tmp', 'affiliate-profile');
const SCRAPE_SUMMARY = path.join(ROOT, 'tmp', 'affiliate-campaigns.json');
const SNAPSHOT = path.join(ROOT, 'tmp', 'affiliate-campaigns-public.json');

/** 사이트 레포. 경로가 사람마다 다를 수 있어 환경변수로 덮을 수 있게 둔다. */
const SITE_REPO = process.env.NAVER_SITE_REPO
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '리더 네이버 자동화');
const SITE_RELATIVE = path.join('spa', 'public', 'data', 'affiliate-campaigns.json');

const hasFlag = (name) => process.argv.includes(`--${name}`);
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  return result.status === 0;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 세션이 풀렸는가.
 *
 * 두 신호를 쓴다 — 하나만 보면 놓친다.
 *   ① 채집기가 화면에서 '로그인' 글자를 봤다(maybeLoggedOut)
 *   ② 목록 후보가 0건이다 — 로그인 화면에서는 목록 XHR 자체가 안 뜬다
 */
function expiredSites(summary) {
  const out = [];
  for (const [id, site] of Object.entries((summary && summary.sites) || {})) {
    const noList = !site.listCandidates || site.listCandidates.length === 0;
    if (site.maybeLoggedOut || noList) {
      out.push({ id, label: site.label || id, reason: site.maybeLoggedOut ? '로그인 화면으로 보임' : '목록 응답 0건' });
    }
  }
  return out;
}

function announceLogin(expired) {
  console.log('\n' + '='.repeat(72));
  console.log('세션이 풀린 것으로 보입니다 — 갱신을 멈춥니다(옛 목록을 새것처럼 내보내지 않기 위해).');
  for (const site of expired) console.log(`  · ${site.label} — ${site.reason}`);
  console.log('\n다시 로그인하려면:');
  console.log('  node scripts/affiliate-campaigns.js --login    (창 두 개에서 각각 로그인)');
  console.log('  node scripts/affiliate-refresh.js              (로그인 뒤 다시 실행)');
  console.log('한 번에 하려면: node scripts/affiliate-refresh.js --autoLogin');
  console.log('='.repeat(72));
}

/** 스냅샷의 사이트별 건수. 발행 전 안전 점검에 쓴다. */
function itemCounts(snapshot) {
  const counts = {};
  for (const [id, site] of Object.entries((snapshot && snapshot.sites) || {})) {
    counts[id] = (site.items || []).length;
  }
  return counts;
}

function main() {
  const limit = arg('limit', '24');
  const autoLogin = hasFlag('autoLogin');

  if (!fs.existsSync(PROFILE_DIR)) {
    console.log('브라우저 프로필이 없습니다 — 최초 1회 로그인이 필요합니다.');
    if (!autoLogin) {
      console.log('  node scripts/affiliate-campaigns.js --login');
      process.exit(3);
    }
    if (!run('affiliate-campaigns.js', ['--login'])) process.exit(3);
  }

  // ── 1) 채집 ───────────────────────────────────────────────────────────
  // --skipScrape 는 이미 뜬 원문으로 다시 돌릴 때 쓴다(파서를 고쳤을 때).
  const skipScrape = hasFlag('skipScrape');
  console.log(skipScrape ? '\n[1/4] 채집 건너뜀 — 기존 원문을 씁니다' : '\n[1/4] 캠페인 채집');
  if (!skipScrape && !run('affiliate-campaigns.js', ['--scrape'])) {
    console.error('채집 실패 — 여기서 멈춥니다.');
    process.exit(1);
  }

  let expired = expiredSites(readJson(SCRAPE_SUMMARY));
  if (expired.length > 0) {
    if (!autoLogin) {
      announceLogin(expired);
      process.exit(3);
    }
    console.log('\n세션 만료 감지 — 로그인 창을 엽니다.');
    for (const site of expired) console.log(`  · ${site.label} — ${site.reason}`);
    if (!run('affiliate-campaigns.js', ['--login'])) process.exit(3);
    console.log('\n[1/4 다시] 로그인 뒤 재채집');
    if (!run('affiliate-campaigns.js', ['--scrape'])) process.exit(1);
    expired = expiredSites(readJson(SCRAPE_SUMMARY));
    if (expired.length > 0) {
      announceLogin(expired);
      process.exit(3);
    }
  }

  // ── 2) 파싱 + 실측 판정 ───────────────────────────────────────────────
  console.log('\n[2/4] 상품명 → 핵심 검색어 → 검색량·문서수·상위10 정면 실측');
  if (!run('affiliate-campaigns-parse.js', [`--limit=${limit}`])) {
    console.error('파싱 실패 — 여기서 멈춥니다.');
    process.exit(1);
  }

  // ── 3) 발행 전 안전 점검 ──────────────────────────────────────────────
  console.log('\n[3/4] 발행 전 점검');
  const snapshot = readJson(SNAPSHOT);
  const counts = itemCounts(snapshot);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`  이번 수집: ${Object.entries(counts).map(([id, n]) => `${id} ${n}건`).join(' · ') || '없음'} (합계 ${total})`);
  if (total === 0) {
    console.error('  0건입니다 — 빈 목록으로 덮어쓰지 않고 멈춥니다.');
    process.exit(4);
  }

  const target = path.join(SITE_REPO, SITE_RELATIVE);
  const previous = readJson(target);
  if (previous) {
    /*
     * 갑자기 반토막이 나면 대개 한쪽 콘솔의 응답 모양이 바뀐 것이다.
     * 그걸 그대로 발행하면 화면에서 상품이 조용히 사라진다 — 멈추고 사람이 본다.
     */
    const before = Object.values(itemCounts(previous)).reduce((sum, n) => sum + n, 0);
    if (before > 0 && total < before * 0.5) {
      console.error(`  지난 발행 ${before}건 → 이번 ${total}건. 절반 아래로 줄어 멈춥니다(--force 로 무시).`);
      if (!hasFlag('force')) process.exit(4);
    }
  }

  // ── 4) 사이트 레포로 복사 ─────────────────────────────────────────────
  console.log('\n[4/4] 사이트 레포 반영');
  if (!fs.existsSync(SITE_REPO)) {
    console.error(`  사이트 레포를 찾지 못했습니다: ${SITE_REPO}`);
    console.error('  NAVER_SITE_REPO 환경변수로 경로를 지정하세요.');
    process.exit(5);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(SNAPSHOT, target);
  console.log(`  복사 완료 → ${target}`);

  if (!hasFlag('publish')) {
    console.log('\n발행은 하지 않았습니다(사이트에 이 파일을 읽는 화면이 아직 없습니다).');
    console.log('발행하려면: node scripts/affiliate-refresh.js --publish');
    return;
  }

  /*
   * 그 파일 하나만 커밋한다. 사이트 레포는 작업 트리가 지저분한 상태로 있는 일이
   * 잦아서(실측: 삭제 대기 파일 다수), 전체 커밋은 남의 변경을 끌고 들어간다.
   */
  const git = (args) => spawnSync('git', args, { cwd: SITE_REPO, stdio: 'inherit' }).status === 0;
  const stamp = (snapshot && snapshot.collectedAt) || new Date().toISOString();
  if (!git(['add', '--', SITE_RELATIVE])) process.exit(6);
  const message = `chore(affiliate): 캠페인 스냅샷 갱신 (${stamp}, ${total}건)`;
  if (!git(['commit', '-m', message, '--', SITE_RELATIVE])) {
    console.log('  커밋할 변경이 없습니다(내용 동일).');
    return;
  }
  if (!git(['push', 'origin', 'HEAD'])) {
    console.error('  푸시 실패 — 커밋은 남아 있습니다. 수동으로 푸시하세요.');
    process.exit(6);
  }
  console.log('  발행 완료 — deploy-pages.yml 이 배포합니다.');
}

main();
