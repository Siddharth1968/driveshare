import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve('.local/postgres');
await mkdir(resolve('.local'), { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'driveshare',
  password: 'driveshare_local',
  port: 5432,
  persistent: true,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
if (!existsSync(resolve(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
for (const name of ['driveshare', 'driveshare_test']) {
  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (!rows.length) await client.query(`CREATE DATABASE ${name}`);
}
await client.end();
console.log(
  'Local PostgreSQL ready at 127.0.0.1:5432. Databases: driveshare, driveshare_test. Keep this terminal running.',
);
async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60000);
