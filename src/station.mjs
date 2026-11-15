import ssh2 from 'ssh2';
import { generateKeyPairSync, createHash } from 'node:crypto';

const { Server, utils } = ssh2;
const status = utils.sftp.STATUS_CODE;

export async function fixture(scenario = 'normal') {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const fingerprint = createHash('sha256').update(utils.parseKey(privateKey).getPublicSSH()).digest('hex');
  const payload = Buffer.from('specimen,result\nS-1,pass\nS-2,review\n');
  const checksum = createHash('sha256').update(payload).digest('hex');
  const manifest = Buffer.from(JSON.stringify({ batchId: 'B1', revision: 'r1',
    files: [{ path: '/inbox/result.csv', size: payload.length, sha256: checksum }] }));
  const files = new Map([['/inbox/manifest.json', manifest], ['/inbox/result.csv', payload]]);
  const calls = []; const connections = new Set();
  const attrs = bytes => ({ mode: 0o100644, uid: 1000, gid: 1000, size: bytes.length, atime: 1, mtime: 1 });
  const server = new Server({ hostKeys: [privateKey] }, client => {
    connections.add(client); client.on('close', () => connections.delete(client));
    client.on('error', () => {});
    client.on('authentication', context => {
      if (context.method === 'password' && context.username === 'fixture' && context.password === 'local-fixture') context.accept();
      else context.reject();
    });
    client.on('ready', () => client.on('session', accept => accept().on('sftp', acceptSftp => {
      const stream = acceptSftp(); const handles = new Map(); let next = 1;
      stream.on('REALPATH', (id, path) => stream.name(id, [{ filename: path, longname: path, attrs: {} }]));
      stream.on('OPENDIR', (id, path) => {
        const handle = Buffer.from(String(next++)); handles.set(handle.toString(), { directory: true, done: false }); stream.handle(id, handle);
      });
      stream.on('READDIR', (id, handle) => {
        const entry = handles.get(handle.toString());
        if (!entry || entry.done) return stream.status(id, status.EOF);
        entry.done = true;
        stream.name(id, [...files.entries()].map(([path, bytes]) => ({ filename: path.split('/').at(-1), longname: path, attrs: attrs(bytes) })));
      });
      stream.on('OPEN', (id, path) => {
        const bytes = files.get(path); calls.push({ operation: 'open', path });
        if (!bytes) return stream.status(id, status.NO_SUCH_FILE);
        const handle = Buffer.from(String(next++)); handles.set(handle.toString(), { path, bytes: Buffer.from(bytes) });
        stream.handle(id, handle);
        if (scenario === 'replace' && path === '/inbox/result.csv') files.set(path, Buffer.from('replacement'));
      });
      stream.on('READ', (id, handle, offset, length) => {
        const entry = handles.get(handle.toString());
        calls.push({ operation: 'read', path: entry?.path, offset, length });
        if (!entry) return stream.status(id, status.FAILURE);
        if (scenario === 'disconnect' && entry.path.endsWith('.csv') && offset > 0) return client.end();
        if (offset >= entry.bytes.length) return stream.status(id, status.EOF);
        stream.data(id, entry.bytes.subarray(offset, offset + Math.min(length, 7)));
      });
      const statPath = (id, path) => {
        const bytes = files.get(path);
        if (!bytes) return stream.status(id, status.NO_SUCH_FILE);
        stream.attrs(id, attrs(bytes));
      };
      stream.on('STAT', statPath); stream.on('LSTAT', statPath);
      stream.on('FSTAT', (id, handle) => {
        const entry = handles.get(handle.toString());
        if (entry?.bytes) stream.attrs(id, attrs(entry.bytes)); else stream.status(id, status.FAILURE);
      });
      stream.on('CLOSE', (id, handle) => { handles.delete(handle.toString()); stream.status(id, status.OK); });
    })));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { host: '127.0.0.1', port: server.address().port, username: 'fixture', password: 'local-fixture',
    fingerprint, manifestPath: '/inbox/manifest.json', calls,
    close: async () => { for (const client of connections) client.end(); await new Promise(resolve => server.close(resolve)); } };
}
