/* Dev utility: attach a project to a porteur (E2E test bootstrap).
   Usage: node assign-project-porteur.js <projetId> <userId> */
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_DB,
  });
  await client.connect();
  const [projetId, userId] = [process.argv[2], Number(process.argv[3])];
  const res = await client.query(
    'UPDATE "projet" SET "porteurId" = $2 WHERE "id" = $1 RETURNING "id", "titre", "porteurId"',
    [projetId, userId],
  );
  console.log(JSON.stringify(res.rows));
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
