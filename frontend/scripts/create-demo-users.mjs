import bcrypt from "bcryptjs";
import pg from "pg";

const DEMO_USERNAMES = ["demo_farmer", "demo_buyer_a", "demo_buyer_b"];
const { DATABASE_URL, DEMO_PASSWORD } = process.env;
const selectedUsername = process.env.DEMO_USERNAME?.trim();
if (!DATABASE_URL || !DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
  throw new Error("Set DATABASE_URL and DEMO_PASSWORD (at least 8 characters)");
}
if (selectedUsername && !DEMO_USERNAMES.includes(selectedUsername)) {
  throw new Error(`DEMO_USERNAME must be one of: ${DEMO_USERNAMES.join(", ")}`);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
try {
  await client.connect();
  const usernames = selectedUsername ? [selectedUsername] : DEMO_USERNAMES;
  const existingUsers = await client.query(
    "SELECT username FROM users WHERE username = ANY($1::text[])",
    [usernames],
  );
  if (selectedUsername && existingUsers.rowCount === 0) {
    throw new Error(`Demo account not found: ${selectedUsername}`);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const result = await client.query(
    `UPDATE users
     SET password_hash = $1
     WHERE username = ANY($2::text[])
     RETURNING username`,
    [passwordHash, usernames],
  );
  console.log(`Updated password hashes for ${result.rowCount} demo user(s).`);
} finally {
  await client.end();
}
