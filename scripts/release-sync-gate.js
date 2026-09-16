/**
 * 릴리즈 전 원격 동기 문지기.
 *
 * 왜 필요한가:
 *  `npm run release` 는 작업트리를 그대로 빌드하지만, electron-builder 가 만드는 태그는
 *  원격 기본 브랜치의 마지막 커밋에 붙는다. 로컬 커밋을 안 밀어 둔 채 릴리즈하면
 *  태그가 '옛 코드'를 가리켜, 나중에 태그를 되짚었을 때 배포된 것과 다른 소스가 나온다.
 *  2026-09-16 에 실제로 났다 — v2.49.132 · v2.49.133 태그가 둘 다 v2.49.131 커밋을 가리켰다.
 *
 * 무엇을 막는가:
 *  - HEAD 가 origin/main 보다 앞서 있으면(밀지 않은 커밋이 있으면) 릴리즈를 시작하지 않는다.
 *  - HEAD 가 뒤처져 있어도 멈춘다(빌드한 코드와 태그가 갈라지는 건 마찬가지다).
 *  - src · ui · preload.ts 에 미커밋 변경이 있으면 경고만 한다(남의 작업일 수 있어 막지는 않는다).
 *
 * 건너뛰려면 LEWORD_RELEASE_SKIP_SYNC_GATE=1 을 준다. 의도를 밝히고 넘기라는 뜻이다.
 */
const { execFileSync } = require('child_process');

const BRANCH = process.env.LEWORD_RELEASE_BRANCH || 'main';

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim();
}

function fail(lines) {
  console.error('\n[릴리즈 문지기] 멈춤 — 태그와 소스가 어긋난 채로 나갈 수 있다.');
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

function main() {
  if (process.env.LEWORD_RELEASE_SKIP_SYNC_GATE === '1') {
    console.log('[릴리즈 문지기] 건너뜀(LEWORD_RELEASE_SKIP_SYNC_GATE=1).');
    process.exit(0);
  }

  try {
    git(['fetch', 'origin', BRANCH, '--quiet']);
  } catch (error) {
    fail([
      `원격을 읽지 못했다: ${error && error.message ? error.message : error}`,
      '네트워크를 확인하고 다시 실행하라. 그래도 내야 하면 LEWORD_RELEASE_SKIP_SYNC_GATE=1.',
    ]);
  }

  let ahead = 0;
  let behind = 0;
  try {
    const counts = git(['rev-list', '--left-right', '--count', `HEAD...origin/${BRANCH}`]);
    const [a, b] = counts.split(/\s+/).map((value) => Number(value) || 0);
    ahead = a;
    behind = b;
  } catch (error) {
    fail([`원격 ${BRANCH} 와 비교하지 못했다: ${error && error.message ? error.message : error}`]);
  }

  if (ahead > 0 || behind > 0) {
    // 목록을 전부 찍으면(브랜치를 잘못 지정하면 수백 개가 된다) 릴리즈 로그를 덮는다. 최근 것만 보인다.
    const MAX_LIST = 15;
    const unpushed = ahead > 0
      ? git(['log', `origin/${BRANCH}..HEAD`, '--oneline', `--max-count=${MAX_LIST}`]).split('\n').filter(Boolean)
      : [];
    const rest = ahead > MAX_LIST ? [`  …그 밖 ${ahead - MAX_LIST}개`] : [];
    fail([
      `HEAD 가 origin/${BRANCH} 와 다르다 — 안 민 커밋 ${ahead}개 · 안 받은 커밋 ${behind}개.`,
      ...(unpushed.length > 0 ? ['', '안 민 커밋(최근순):', ...unpushed.map((line) => `  ${line}`), ...rest] : []),
      '',
      `먼저 git push origin ${BRANCH} (뒤처졌으면 git pull --rebase) 로 맞춘 다음 릴리즈하라.`,
    ]);
  }

  const dirty = git(['status', '--porcelain', '--untracked-files=no', '--', 'src', 'ui', 'preload.ts']);
  if (dirty) {
    console.warn('[릴리즈 문지기] 주의 — 미커밋 소스 변경이 그대로 빌드에 실린다:');
    for (const line of dirty.split('\n')) console.warn(`  ${line}`);
    console.warn('  내 변경이 아니면 커밋 여부를 확인하고 진행하라.');
  }

  console.log(`[릴리즈 문지기] 통과 — HEAD 가 origin/${BRANCH} 와 같다.`);
  process.exit(0);
}

main();
