import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { fixture } from '../src/station.mjs';
import { preview, connect } from '../src/client.mjs';
import { Inbox } from '../src/store.mjs';

test('the source is an actual host-verified SFTP connection with short reads', async () => {
  const source = await fixture(); const store = new Inbox();
  try {
    const result = await preview(source, store); assert.equal(result.manifest.batchId, 'B1');
    assert.ok(source.calls.filter(row => row.operation === 'read').length > 2);
  } finally { store.close(); await source.close(); }
});
test('an opened handle survives replacement of its path', async () => {
  const source = await fixture('replace'); const session = await connect(source);
  try {
    const handle = await promisify(session.sftp.open.bind(session.sftp))('/inbox/result.csv', 'r');
    const bytes = Buffer.alloc(7);
    const count = await new Promise((resolve, reject) => session.sftp.read(handle, bytes, 0, 7, 0,
      (error, amount) => error ? reject(error) : resolve(amount)));
    assert.equal(bytes.subarray(0, count).toString(), 'specime');
    await promisify(session.sftp.close.bind(session.sftp))(handle);
  } finally { await session.close(); await source.close(); }
});
