/* Dev utility: mark a user's email as verified (E2E test bootstrap). */
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
  const email = process.argv[2] || 'test.e2e@beown.dev';
  const res = await client.query(
    'UPDATE "user_emails" SET "isVerified" = true, "verifiedDate" = NOW() WHERE "email" = $1 RETURNING "email", "isVerified"',
    [email],
  );
  console.log(JSON.stringify(res.rows));
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
