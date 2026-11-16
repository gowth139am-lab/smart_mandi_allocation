const requiredEnvironment = [
  "DATABASE_URL",
  "TEST_SESSION_BUYER_USERNAME",
  "TEST_SESSION_BUYER_PASSWORD",
];
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
let assert;
let Client;

function requireTestConfiguration() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing test configuration: ${missing.join(", ")}`);
  }
  if (process.env.TEST_SESSION_BUYER_USERNAME !== "auth_session_fixture") {
    throw new Error("TEST_SESSION_BUYER_USERNAME must be the isolated auth_session_fixture account");
  }
  if (process.env.TEST_SESSION_BUYER_PASSWORD.length > 128) {
    throw new Error("TEST_SESSION_BUYER_PASSWORD exceeds the credentials provider limit");
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (database !== "smart_mandi_test_auth") {
    throw new Error("DATABASE_URL must target the isolated smart_mandi_test_auth database");
  }

  const baseUrl = new URL(BASE_URL);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("BASE_URL must use HTTP or HTTPS");
  }
}

function setCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined
    ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/)
    : [];
}

function cookiePair(setCookieHeader) {
  const pair = setCookieHeader.split(";", 1)[0].trim();
  return pair.includes("=") ? pair : "";
}

function cookieName(cookie) {
  const separator = cookie.indexOf("=");
  return separator < 0 ? "" : cookie.slice(0, separator).trim();
}

function sessionCookieBase(name) {
  return name.match(/^((?:(?:__Secure|__Host)-)?authjs\.session-token)(?:\.\d+)?$/)?.[1] || null;
}

function isSessionCookieName(name, baseName) {
  return name === baseName || name.startsWith(`${baseName}.`) && /^\d+$/.test(name.slice(baseName.length + 1));
}

function setCookieExpiry(header) {
  const attributes = header.split(";").slice(1).map((attribute) => attribute.trim());
  const maxAge = attributes
    .map((attribute) => attribute.match(/^max-age=(-?\d+)$/i))
    .find(Boolean);
  const expires = attributes
    .map((attribute) => attribute.match(/^expires=(.+)$/i))
    .find(Boolean);
  const expiredByMaxAge = maxAge ? Number(maxAge[1]) <= 0 : false;
  const expiryTime = expires ? Date.parse(expires[1]) : NaN;
  const expiredByDate = !Number.isNaN(expiryTime) && expiryTime <= Date.now();
  const empty = cookiePair(header).slice(cookiePair(header).indexOf("=") + 1) === "";
  const details = [];
  if (maxAge) {
    details.push(`Max-Age=${maxAge[1]}${expiredByMaxAge ? " (expired)" : " (not expired)"}`);
  }
  if (expires) {
    details.push(
      `Expires=${Number.isNaN(expiryTime) ? "invalid" : expiredByDate ? "past" : "future"}`,
    );
  }
  const expiryDescription = details.length ? details.join(", ") : "no expiration attributes";

  return {
    expired: expiredByMaxAge || expiredByDate,
    empty,
    description: expiredByMaxAge || expiredByDate
      ? `${empty ? "cleared and expired" : "expired"} (${expiryDescription})`
      : empty
        ? `empty value but not expired (cookie entry may remain; ${expiryDescription})`
        : `remained present (${expiryDescription})`,
  };
}

function inspectSessionCookie(response, baseName) {
  const headers = setCookieHeaders(response);
  const matches = headers.filter((header) =>
    isSessionCookieName(cookieName(cookiePair(header)), baseName),
  );
  const states = matches.map(setCookieExpiry);
  return {
    headerCount: headers.length,
    expired: states.length > 0 && states.every((state) => state.expired),
    description: states.length
      ? states.map((state) => state.description).join(", ")
      : "no matching Set-Cookie header; browser cookie remains unchanged",
  };
}

function cookiePairs(response) {
  return setCookieHeaders(response).map(cookiePair).filter(Boolean);
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

function csrfCookie(response) {
  const pairs = cookiePairs(response).filter((pair) =>
    /^(?:(?:__Secure|__Host)-)?authjs\.csrf-token=/.test(pair),
  );
  if (pairs.length !== 1) {
    throw new Error("Auth.js CSRF endpoint did not set exactly one CSRF cookie");
  }
  return pairs[0];
}

async function authenticateBuyer() {
  const csrf = await requestJson("/api/auth/csrf");
  assert.equal(csrf.response.status, 200, "Auth.js CSRF endpoint must be available");
  assert.equal(typeof csrf.data?.csrfToken, "string", "Auth.js must return its CSRF token");
  const csrfPair = csrfCookie(csrf.response);
  console.log(
    `OBSERVED - CSRF endpoint: inspected ${setCookieHeaders(csrf.response).length} Set-Cookie header(s); CSRF cookie present`,
  );

  const callback = await fetch(new URL("/api/auth/callback/credentials", BASE_URL), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfPair,
    },
    body: new URLSearchParams({
      csrfToken: csrf.data.csrfToken,
      callbackUrl: BASE_URL,
      identifier: process.env.TEST_SESSION_BUYER_USERNAME,
      password: process.env.TEST_SESSION_BUYER_PASSWORD,
    }),
  });
  const headers = setCookieHeaders(callback);
  const issuedPairs = headers.map(cookiePair).filter(Boolean);
  const bases = [...new Set(issuedPairs.map(cookieName).map(sessionCookieBase).filter(Boolean))];
  assert.ok(
    callback.status === 200 || callback.status === 302 || callback.status === 303,
    `Auth.js credentials callback returned unexpected HTTP ${callback.status}`,
  );
  assert.equal(bases.length, 1, "Credentials callback must issue exactly one Auth.js session cookie");

  const baseName = bases[0];
  const sessionPairs = issuedPairs.filter((pair) =>
    isSessionCookieName(cookieName(pair), baseName),
  );
  assert.ok(sessionPairs.length > 0, "Credentials callback must issue an Auth.js session cookie");
  assert.ok(
    sessionPairs.every((pair) => pair.slice(pair.indexOf("=") + 1) !== ""),
    "Credentials callback must issue non-empty session cookie values",
  );
  console.log(
    `PASSED - Auth.js credentials login issued ${baseName}; inspected ${headers.length} Set-Cookie header(s)`,
  );
  return { cookie: sessionPairs.join("; "), name: baseName };
}

async function expectInvalidSession(name, cookie, sessionName) {
  const result = await requestJson("/api/auth/session", { cookie });
  const cookieState = inspectSessionCookie(result.response, sessionName);
  const sessionState = result.data?.user ? "authenticated session returned" : "no authenticated session";
  console.log(
    `OBSERVED - ${name}: ${sessionState}; session cookie: ${cookieState.description} ` +
    `(inspected ${cookieState.headerCount} Set-Cookie header(s))`,
  );
  assert.equal(result.response.status, 200, `${name}: unexpected session endpoint status`);
  assert.equal(result.data, null, `${name}: invalidated JWT must return no session`);
  console.log(`PASSED - ${name}`);
}

function safeErrorMessage(error) {
  let message = error instanceof Error ? error.message : "Unexpected integration-test failure";
  const password = process.env.TEST_SESSION_BUYER_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;
  if (password) message = message.split(password).join("[redacted]");
  if (databaseUrl) message = message.split(databaseUrl).join("[redacted database URL]");
  return message.replace(/postgres(?:ql)?:\/\/[^/\s]+@/gi, "postgresql://[redacted]@");
}

async function main() {
  requireTestConfiguration();
  const [assertModule, postgresModule] = await Promise.all([
    import("node:assert/strict"),
    import("pg"),
  ]);
  assert = assertModule.default;
  Client = postgresModule.Client;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let connected = false;
  let buyerProfile = null;
  let profileRemoved = false;
  let originalUser = null;
  let userId = null;

  try {
    await client.connect();
    connected = true;
    const user = await client.query(
      `SELECT user_id::text AS user_id, username, role, status
       FROM users WHERE username = $1`,
      [process.env.TEST_SESSION_BUYER_USERNAME],
    );
    assert.equal(user.rowCount, 1, "The configured test buyer must exist exactly once");
    originalUser = user.rows[0];
    userId = originalUser.user_id;
    assert.equal(originalUser.username, "auth_session_fixture");
    assert.equal(originalUser.role, "BUYER", "The test fixture must have BUYER role");
    assert.equal(originalUser.status, "ACTIVE", "The test buyer must be active before testing");

    const buyer = await client.query(
      `SELECT buyer_id, user_id, business_name, buyer_type, contact_person,
              address, district, state, status
       FROM buyers WHERE user_id = $1`,
      [userId],
    );
    assert.equal(buyer.rowCount, 1, "The test buyer profile must exist exactly once");
    buyerProfile = buyer.rows[0];
    assert.equal(buyerProfile.status, "ACTIVE", "The test buyer profile must be active");

    const authenticated = await authenticateBuyer();
    const originalCookie = authenticated.cookie;
    const authSessionCookieName = authenticated.name;
    const active = await requestJson("/api/auth/session", { cookie: originalCookie });
    const activeCookieState = inspectSessionCookie(active.response, authSessionCookieName);
    console.log(
      `OBSERVED - Active session: ${active.data?.user ? "authenticated session returned" : "no authenticated session"}; ` +
      `session cookie: ${activeCookieState.description} ` +
      `(inspected ${activeCookieState.headerCount} Set-Cookie header(s))`,
    );
    assert.equal(active.response.status, 200);
    assert.equal(active.data?.user?.user_id, userId,
      "Credentials login session must match the database user ID");
    assert.equal(active.data?.user?.role, "BUYER");
    console.log("PASSED - Active buyer session fixture identity");

    await client.query("UPDATE users SET status = 'INACTIVE' WHERE user_id = $1", [userId]);
    await expectInvalidSession("Inactive account invalidates its JWT", originalCookie, authSessionCookieName);
    await client.query("UPDATE users SET status = $2 WHERE user_id = $1", [userId, originalUser.status]);

    await client.query("UPDATE users SET role = 'ADMIN' WHERE user_id = $1", [userId]);
    await expectInvalidSession("Role change invalidates the old JWT", originalCookie, authSessionCookieName);
    await client.query("UPDATE users SET role = $2 WHERE user_id = $1", [userId, originalUser.role]);

    profileRemoved = true;
    await client.query("DELETE FROM buyers WHERE buyer_id = $1", [buyerProfile.buyer_id]);
    await expectInvalidSession("Missing buyer profile invalidates its JWT", originalCookie, authSessionCookieName);
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
    assert.equal(csrf.response.status, 200, "Auth.js CSRF endpoint must be available for logout");
    assert.equal(typeof csrf.data?.csrfToken, "string", "Auth.js must return its CSRF token for logout");
    const csrfPair = csrfCookie(csrf.response);
    console.log(
      `OBSERVED - Logout CSRF endpoint: inspected ${setCookieHeaders(csrf.response).length} Set-Cookie header(s)`,
    );

    const logout = await fetch(new URL("/api/auth/signout", BASE_URL), {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `${originalCookie}; ${csrfPair}`,
      },
      body: new URLSearchParams({ csrfToken: csrf.data.csrfToken }),
    });
    const logoutCookieState = inspectSessionCookie(logout, authSessionCookieName);
    console.log(
      `OBSERVED - Logout: session cookie ${logoutCookieState.description} ` +
      `(inspected ${logoutCookieState.headerCount} Set-Cookie header(s))`,
    );
    assert.ok(
      logout.status === 200 || logout.status === 302 || logout.status === 303,
      `Auth.js signout must succeed, got HTTP ${logout.status}`,
    );
    assert.ok(
      logoutCookieState.expired,
      `Logout must expire ${authSessionCookieName} with Max-Age<=0 or a past Expires value`,
    );
    console.log("PASSED - Logout expires the browser session cookie");

    const browserSession = await requestJson("/api/auth/session", { cookie: csrfPair });
    const browserCookieState = inspectSessionCookie(browserSession.response, authSessionCookieName);
    console.log(
      `OBSERVED - Follow-up browser session: ${browserSession.data?.user ? "authenticated session returned" : "no authenticated session"}; ` +
      `session cookie: ${browserCookieState.description} ` +
      `(inspected ${browserCookieState.headerCount} Set-Cookie header(s))`,
    );
    assert.equal(browserSession.response.status, 200);
    assert.equal(browserSession.data, null, "A browser without the session cookie must be unauthenticated");
    console.log("PASSED - Browser session is unauthenticated after logout");

    const copiedToken = await requestJson("/api/auth/session", { cookie: originalCookie });
    const copiedCookieState = inspectSessionCookie(copiedToken.response, authSessionCookieName);
    console.log(
      `OBSERVED - Copied JWT replay: ${copiedToken.data?.user ? "authenticated session returned" : "no authenticated session"}; ` +
      `session cookie: ${copiedCookieState.description} ` +
      `(inspected ${copiedCookieState.headerCount} Set-Cookie header(s))`,
    );
    assert.equal(copiedToken.response.status, 200);
    if (copiedToken.data?.user?.user_id === userId) {
      console.log("INFO - A copied pre-logout JWT remains replayable; logout clears the browser cookie but does not revoke JWTs server-side");
    } else {
      assert.equal(copiedToken.data, null, "Unexpected post-logout session response");
      console.log("INFO - The copied pre-logout JWT did not produce an authenticated session");
    }
  } finally {
    if (connected) {
      try {
        if (profileRemoved && buyerProfile) {
          await client.query(
            `INSERT INTO buyers
               (buyer_id, user_id, business_name, buyer_type, contact_person,
                address, district, state, status)
             OVERRIDING SYSTEM VALUE
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (buyer_id) DO UPDATE SET
               user_id = EXCLUDED.user_id,
               business_name = EXCLUDED.business_name,
               buyer_type = EXCLUDED.buyer_type,
               contact_person = EXCLUDED.contact_person,
               address = EXCLUDED.address,
               district = EXCLUDED.district,
               state = EXCLUDED.state,
               status = EXCLUDED.status`,
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
      } finally {
        try {
          if (originalUser) {
            await client.query(
              "UPDATE users SET role = $2, status = $3 WHERE user_id = $1",
              [userId, originalUser.role, originalUser.status],
            );
          }
        } finally {
          await client.end();
        }
      }
    }
  }
}

main().catch((error) => {
  console.error("Auth session integration test failed:", safeErrorMessage(error));
  process.exitCode = 1;
});
