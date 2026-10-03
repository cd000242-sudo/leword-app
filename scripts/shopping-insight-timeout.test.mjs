import test from 'node:test';
import assert from 'node:assert/strict';
import { probeShoppingClicks } from './shopping-insight.mjs';
test('a stalled shopping response is unmeasured and cannot stall the collection indefinitely', async () => {
 const original = globalThis.fetch;
 globalThis.fetch = async (_url, {signal}) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), {once:true}));
 try { assert.equal(await probeShoppingClicks('test', 'fixture-id', 'fixture-key', { timeoutMs: 1000 }), undefined); }
 finally { globalThis.fetch = original; }
});
