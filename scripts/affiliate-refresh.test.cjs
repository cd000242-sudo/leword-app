const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'affiliate-refresh.js'), 'utf8');
function run(flags) {
  const calls = [], copies = [];
  const snapshot = { sites: { toss: { status: 'ready', items: [{ name: 'product' }] }, brandconnect: { status: 'ready', items: [{ name: 'product' }] } } };
  vm.runInNewContext(source, {
    __dirname, console: { log() {}, error() {} },
    process: { argv: ['node', 'refresh', ...flags], execPath: 'electron', execArgv: ['-r', 'shim.js'], env: {}, exit: code => { throw new Error(`exit:${code}`); } },
    require: id => id === 'fs' ? {
      existsSync: p => !p.endsWith(path.join('spa', 'package.json')),
      readFileSync: p => JSON.stringify(p.endsWith('affiliate-campaigns.json') ? { sites: {} } : snapshot),
      mkdirSync() {}, copyFileSync: (...a) => copies.push(a),
    } : id === 'child_process' ? { spawnSync: (...a) => { calls.push(a); return { status: 0 }; } } : require(id),
  });
  return { calls, copies };
}
test('app local collection needs no site checkout and passes runtime preload to children', () => {
  const result = run(['--localOnly']);
  assert.equal(result.calls.length, 2);
  for (const [, args] of result.calls) assert.deepEqual(Array.from(args.slice(0, 2)), ['-r', 'shim.js']);
  assert.equal(result.copies.length, 0);
  assert(result.calls[1][1].some(x => x.startsWith('--previous=') && x.endsWith('affiliate-campaigns-public.json')));
});
test('local collection cannot accidentally publish', () => {
  assert.throws(() => run(['--localOnly', '--publish']), /localOnly/);
});
test('explicit site publication still requires a real site checkout', () => {
  assert.throws(() => run(['--publish']), /NAVER_SITE_REPO/);
});
