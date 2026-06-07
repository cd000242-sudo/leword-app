const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function splitArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const options = {
    cwd: process.cwd(),
    commandArgs: separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv,
  };

  for (let index = 0; index < separatorIndex; index += 1) {
    if (argv[index] === '--cwd' && argv[index + 1]) {
      options.cwd = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

function candidates() {
  const roots = [
    process.env.USERPROFILE,
    'C:\\Users\\박성현',
    'C:\\Users\\park',
  ].filter(Boolean);

  return [...new Set([
    process.env.LEWORD_MOBILE_NODE,
    ...roots.map((root) => path.join(
      root,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'bin',
      'node.exe',
    )),
  ].filter(Boolean))];
}

function parseVersion(raw) {
  const match = String(raw || '').match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function satisfies(version) {
  if (!version) return false;
  const minimum = [22, 13, 0];
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] > minimum[index]) return true;
    if (version[index] < minimum[index]) return false;
  }
  return true;
}

function findNodeBinDir() {
  if (satisfies(parseVersion(process.version))) {
    return path.dirname(process.execPath);
  }

  for (const nodePath of candidates()) {
    if (!nodePath || !fs.existsSync(nodePath)) continue;
    const result = spawnSync(nodePath, ['--version'], { encoding: 'utf8' });
    if (result.status === 0 && satisfies(parseVersion(result.stdout))) {
      return path.dirname(nodePath);
    }
  }

  throw new Error('Mobile commands require Node >= 22.13. Set LEWORD_MOBILE_NODE or install Node 22+.');
}

const { cwd, commandArgs } = splitArgs(process.argv.slice(2));
if (commandArgs.length === 0) {
  throw new Error('Usage: node scripts/run-mobile-command.js [--cwd apps/mobile] -- <command> [args...]');
}

const nodeBinDir = findNodeBinDir();
const env = {
  ...process.env,
  PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH || ''}`,
};

const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
  cwd,
  env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
