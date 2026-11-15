import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../src/station.mjs';
import * as intake from '../src/intake.mjs';
import { Inbox } from '../src/store.mjs';

async function run(scenario, check) {
  assert.equal(typeof intake.collect, 'function', 'collection entry is not available yet');
  const source = await fixture(scenario); const store = new Inbox();
  try {
    const result = await intake.collect(source, store);
    await check(result, source, store);
  } finally { store.close(); await source.close(); }
}

for (const scenario of ['normal', 'replace']) {
  test(scenario + ' validates the manifest against the opened object', async () => {
    await run(scenario, async result => {
      assert.equal(result.status, 'complete'); assert.equal(result.records.length, 1);
      assert.equal(result.records[0].path, '/inbox/result.csv');
      assert.equal(result.records[0].verified, true); assert.ok(result.records[0].evidence.length);
    });
  });
}
test('a read disconnect must return an incomplete receipt rather than publish partial data', async () => {
  await run('disconnect', async result => {
    assert.equal(result.status, 'incomplete'); assert.equal(result.records.filter(row => row.verified).length, 0);
  });
});
