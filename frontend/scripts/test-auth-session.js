const requiredEnvironment = [
  "DATABASE_URL",
  "TEST_SESSION_BUYER_COOKIE",
  "TEST_SESSION_BUYER_USER_ID",
];
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
let assert;
let Client;

function requireTestDatabase() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing test configuration: ${missing.join(", ")}`);
  const database = new URL(process.env.DATABASE_URL).pathname.slice(1);
  if (!database.startsWith("smart_mandi_test_")) {
    throw new Error("DATABASE_URL must target a disposable smart_mandi_test_* database");
  }
  if (!/^[1-9]\d{0,18}$/.test(process.env.TEST_SESSION_BUYER_USER_ID)) {
    throw new Error("TEST_SESSION_BUYER_USER_ID must be a positive PostgreSQL BIGINT");
  }
}

async function requestJson(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(new URL(path, BASE_URL), { ...options, headers });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${options.method || "GET"} ${path} returned non-JSON`);
  }
  return { response, data };
}

async function expectInvalidSession(name, cookie) {
  const result = await requestJson("/api/auth/session", { cookie });
  assert.equal(result.response.status, 200, `${name}: unexpected session endpoint status`);
  assert.equal(result.data, null, `${name}: invalidated JWT must return no session`);
  console.log(`PASSED - ${name}`);
}

function cookiePairs(response) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return setCookies.map((value) => value.split(";", 1)[0]).filter(Boolean);
}

async function main() {
  requireTestDatabase();
  const [assertModule, postgresModule] = await Promise.all([
    import("node:assert/strict"),
    import("pg"),
  ]);
  assert = assertModule.default;
  Client = postgresModule.Client;

  const userId = process.env.TEST_SESSION_BUYER_USER_ID;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let connected = false;
  let buyerProfile = null;
  let profileRemoved = false;
  let originalUser = null;

  try {
    await client.connect();
    connected = true;
    const user = await client.query(
      `SELECT user_id::text AS user_id, role, status
       FROM users WHERE user_id = $1`,
      [userId],
    );
    assert.equal(user.rowCount, 1, "TEST_BUYER_USER_ID must exist");
    originalUser = user.rows[0];
    assert.equal(originalUser.role, "BUYER");
    assert.equal(originalUser.status, "ACTIVE");
    const buyer = await client.query(
      `SELECT buyer_id, user_id, business_name, buyer_type, contact_person,
              address, district, state, status
       FROM buyers WHERE user_id = $1`,
      [userId],
    );
    assert.equal(buyer.rowCount, 1, "Fixture buyer profile must exist");
    buyerProfile = buyer.rows[0];
    assert.equal(buyerProfile.status, "ACTIVE");

    const active = await requestJson("/api/auth/session", {
      cookie: process.env.TEST_SESSION_BUYER_COOKIE,
    });
    assert.equal(active.response.status, 200);
    assert.equal(active.data?.user?.user_id, userId,
      "TEST_SESSION_BUYER_COOKIE must authenticate the configured active buyer");
    assert.equal(active.data?.user?.role, "BUYER");
    console.log("PASSED - Active buyer session fixture identity");

    await client.query("UPDATE users SET status = 'INACTIVE' WHERE user_id = $1", [userId]);
    await expectInvalidSession("Inactive account invalidates its JWT", process.env.TEST_SESSION_BUYER_COOKIE);
    await client.query("UPDATE users SET status = $2 WHERE user_id = $1", [userId, originalUser.status]);

    await client.query("UPDATE users SET role = 'ADMIN' WHERE user_id = $1", [userId]);
    await expectInvalidSession("Role change invalidates the old JWT", process.env.TEST_SESSION_BUYER_COOKIE);
    await client.query("UPDATE users SET role = $2 WHERE user_id = $1", [userId, originalUser.role]);

    await client.query("DELETE FROM buyers WHERE buyer_id = $1", [buyerProfile.buyer_id]);
    profileRemoved = true;
    await expectInvalidSession("Missing buyer profile invalidates its JWT", process.env.TEST_SESSION_BUYER_COOKIE);
    await client.query(
      `INSERT INTO buyers
         (buyer_id, user_id, business_name, buyer_type, contact_person,
          address, district, state, status)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        buyerProfile.buyer_id,
        buyerProfile.user_id,
        buyerProfile.business_name,
        buyerProfile.buyer_type,
        buyerProfile.contact_person,
        buyerProfile.address,
        buyerProfile.district,
        buyerProfile.state,
        buyerProfile.status,
      ],
    );
    profileRemoved = false;

    const csrf = await requestJson("/api/auth/csrf");
    assert.equal(csrf.response.status, 200, "Auth.js CSRF endpoint must be available");
    assert.equal(typeof csrf.data?.csrfToken, "string", "Auth.js must return its CSRF token");
    const csrfCookie = cookiePairs(csrf.response).find((pair) =>
      pair.startsWith("authjs.csrf-token=") ||
      pair.startsWith("__Host-authjs.csrf-token=") ||
      pair.startsWith("__Secure-authjs.csrf-token="),
    );
    assert.ok(csrfCookie, "Auth.js must set its CSRF cookie");
    const logout = await fetch(new URL("/api/auth/signout", BASE_URL), {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `${process.env.TEST_SESSION_BUYER_COOKIE}; ${csrfCookie}`,
      },
      body: new URLSearchParams({ csrfToken: csrf.data.csrfToken }),
    });
    assert.ok(
      logout.status === 200 || logout.status === 302 || logout.status === 303,
      `Auth.js signout must succeed, got HTTP ${logout.status}`,
    );
    const sessionCookieCleared = cookiePairs(logout).some((pair) =>
      /^(?:(?:__Secure|__Host)-)?authjs\.session-token=/.test(pair) &&
      pair.endsWith("="),
    );
    assert.ok(sessionCookieCleared, "Logout must clear the Auth.js session cookie");
    await expectInvalidSession("Logout removes the browser session", csrfCookie);
  } finally {
    if (connected) {
      if (profileRemoved && buyerProfile) {
        await client.query(
          `INSERT INTO buyers
             (buyer_id, user_id, business_name, buyer_type, contact_person,
              address, district, state, status)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (buyer_id) DO NOTHING`,
          [
            buyerProfile.buyer_id,
            buyerProfile.user_id,
            buyerProfile.business_name,
            buyerProfile.buyer_type,
            buyerProfile.contact_person,
            buyerProfile.address,
            buyerProfile.district,
            buyerProfile.state,
            buyerProfile.status,
          ],
        );
      }
      if (originalUser) {
        await client.query(
          "UPDATE users SET role = $2, status = $3 WHERE user_id = $1",
          [userId, originalUser.role, originalUser.status],
        );
      }
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error("Auth session integration test failed:", error);
  process.exitCode = 1;
});
