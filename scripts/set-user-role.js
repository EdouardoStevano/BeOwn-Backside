/* Dev utility: change a user's role (E2E test bootstrap). Usage: node set-user-role.js email role */
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
  const email = process.argv[2];
  const role = process.argv[3] || 'investisseur';
  const res = await client.query(
    'UPDATE "users" u SET "role" = $2 FROM "user_emails" e WHERE e."userId" = u."userId" AND e."email" = $1 RETURNING u."userId", u."role"',
    [email, role],
  );
  console.log(JSON.stringify(res.rows));
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
