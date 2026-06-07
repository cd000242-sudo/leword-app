const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MIN_NODE = [22, 13, 0];

function parseVersion(raw) {
  const match = String(raw || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function satisfies(version) {
  if (!version) return false;
  for (let index = 0; index < MIN_NODE.length; index += 1) {
    if (version[index] > MIN_NODE[index]) return true;
    if (version[index] < MIN_NODE[index]) return false;
  }
  return true;
}

function versionLabel(version) {
  return version ? `v${version.join('.')}` : 'unknown';
}

function bundledNodeCandidates() {
  const candidates = [];
  if (process.env.LEWORD_MOBILE_NODE) {
    candidates.push(process.env.LEWORD_MOBILE_NODE);
  }

  const userRoots = [
    process.env.USERPROFILE,
    'C:\\Users\\박성현',
    'C:\\Users\\park',
  ].filter(Boolean);

  for (const root of userRoots) {
    candidates.push(path.join(
      root,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'bin',
      'node.exe',
    ));
  }

  return [...new Set(candidates)];
}

function readNodeVersion(executable) {
  if (!executable || !fs.existsSync(executable)) return null;
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return {
    executable,
    version: parseVersion(result.stdout),
  };
}

const currentVersion = parseVersion(process.version);
const candidates = bundledNodeCandidates()
  .map(readNodeVersion)
  .filter(Boolean);

const usable = [
  { executable: process.execPath, version: currentVersion },
  ...candidates,
].find((candidate) => satisfies(candidate.version));

if (!usable) {
  const seen = [
    `current ${process.execPath} ${versionLabel(currentVersion)}`,
    ...candidates.map((candidate) => `${candidate.executable} ${versionLabel(candidate.version)}`),
  ].join(' | ');
  throw new Error(`Expo SDK 56 native builds require Node >= ${MIN_NODE.join('.')}; checked ${seen}`);
}

console.log(`[mobile-native-env-gate] passed with ${usable.executable} ${versionLabel(usable.version)}`);
