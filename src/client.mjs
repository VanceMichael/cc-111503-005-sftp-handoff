import ssh2 from 'ssh2';
import { promisify } from 'node:util';

export async function connect(source) {
  const client = new ssh2.Client();
  await new Promise((resolve, reject) => {
    client.once('ready', resolve); client.once('error', reject);
    client.connect({ host: source.host, port: source.port, username: source.username,
      password: source.password, hostHash: 'sha256', hostVerifier: hash => hash === source.fingerprint,
      readyTimeout: 3000 });
  });
  const sftp = await new Promise((resolve, reject) => client.sftp((error, stream) => error ? reject(error) : resolve(stream)));
  return { client, sftp, readFile: promisify(sftp.readFile.bind(sftp)),
    list: promisify(sftp.readdir.bind(sftp)),
    close: () => new Promise(resolve => { client.once('close', resolve); client.end(); }) };
}

export async function preview(source, store) {
  const session = await connect(source);
  try {
    const entries = await session.list('/inbox');
    const bytes = await session.readFile(source.manifestPath);
    const evidence = store.saveEvidence('manifest', { path: source.manifestPath }, bytes);
    return { mode: 'directory-preview', entries: entries.map(row => ({ name: row.filename, size: row.attrs.size })),
      manifest: JSON.parse(bytes), evidence };
  } finally { await session.close(); }
}
