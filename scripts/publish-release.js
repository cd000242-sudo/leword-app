#!/usr/bin/env node
/**
 * GitHub Release Draft → Published + Latest 자동 전환.
 *
 * electron-builder 는 기본적으로 Release 를 Draft 로 생성하므로
 * 그대로 두면 electron-updater 가 `latest.yml` 을 못 찾음 (404).
 * 이 스크립트가 빌드 직후 Draft 를 공개로 전환하고 Latest 마킹까지 수행.
 *
 * 사전 조건:
 *   - gh CLI 설치 + 로그인 (`gh auth login`)
 *   - package.json 의 build.publish 에 owner/repo 지정
 *
 * 실행:
 *   node scripts/publish-release.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pkg = require('../package.json');
const version = pkg.version;
const tag = `v${version}`;

const publishCfg = Array.isArray(pkg.build?.publish)
  ? pkg.build.publish[0]
  : pkg.build?.publish;

const owner = publishCfg?.owner;
const repo = publishCfg?.repo;

if (!owner || !repo) {
  console.error('❌ package.json build.publish 에 owner/repo 가 없습니다');
  process.exit(1);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe' });
}

try {
  // Release 존재 확인
  console.log(`🔍 gh release view ${tag} --repo ${owner}/${repo}`);
  const info = run(`gh release view ${tag} --repo ${owner}/${repo} --json isDraft,tagName,name`);
  const parsed = JSON.parse(info);
  console.log(`   현재 상태: isDraft=${parsed.isDraft}, tagName=${parsed.tagName}`);

  // Draft → Published + Latest
  console.log(`🚀 gh release edit ${tag} --draft=false --latest`);
  run(`gh release edit ${tag} --repo ${owner}/${repo} --draft=false --latest`, { inherit: true });
  console.log(`✅ ${tag} → Published + Latest 완료`);

  // FIX-AUTO-UPDATE.bat 동봉 (있을 때만)
  const fixFile = path.join(__dirname, '..', 'release', 'FIX-AUTO-UPDATE.bat');
  if (fs.existsSync(fixFile)) {
    console.log(`📎 FIX-AUTO-UPDATE.bat 업로드 중`);
    run(`gh release upload ${tag} "${fixFile}" --repo ${owner}/${repo} --clobber`, { inherit: true });
    console.log(`   ✅ 업로드 완료`);
  }

  console.log(`\n🎉 배포 완료: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
} catch (err) {
  console.error(`❌ publish-release 실패: ${err.message}`);
  console.error(`\n힌트:`);
  console.error(`  - gh CLI 가 설치되어 있나요? (winget install GitHub.cli)`);
  console.error(`  - gh auth login 으로 인증했나요?`);
  console.error(`  - Release ${tag} 가 실제로 생성되었나요?`);
  console.error(`    (electron-builder --publish always 로 먼저 빌드)`);
  process.exit(1);
}
