const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
let assert;
let Client;
const requiredEnvironment = [
  "DATABASE_URL",
  "TEST_FARMER_COOKIE",
  "TEST_OTHER_FARMER_COOKIE",
  "TEST_BUYER_COOKIE",
  "TEST_FARMER_USER_ID",
  "TEST_OTHER_FARMER_USER_ID",
  "TEST_OTHER_FARM_ID",
  "TEST_CROP_ID",
];

function requireEnvironment() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing test configuration: ${missing.join(", ")}`);
  }
  const database = new URL(process.env.DATABASE_URL).pathname.slice(1);
  if (!database.startsWith("smart_mandi_test_")) {
    throw new Error("DATABASE_URL must target a disposable smart_mandi_test_* database");
  }
}

function positiveIntegerText(name) {
  const value = process.env[name];
  if (!/^[1-9]\d*$/.test(value || "")) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function requestJson(path, { cookie, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(new URL(path, BASE_URL), { ...options, headers });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${options.method || "GET"} ${path} returned non-JSON`);
  }
  return { response, data };
}

async function expectStatus(name, result, status) {
  assert.equal(
    result.response.status,
    status,
    `${name}: expected HTTP ${status}, received ${result.response.status}: ${JSON.stringify(result.data)}`,
  );
  console.log(`PASSED - ${name}`);
}

async function verifySessionFixture(name, cookie, expectedUserId, expectedRole) {
  const result = await requestJson("/api/auth/session", { cookie });
  assert.equal(
    result.response.status,
    200,
    `${name}: authenticated session endpoint returned HTTP ${result.response.status}`,
  );
  assert.equal(
    result.data?.user?.user_id,
    expectedUserId,
    `${name}: session user_id does not match the configured fixture user`,
  );
  assert.equal(
    result.data?.user?.role,
    expectedRole,
    `${name}: session role does not match ${expectedRole}`,
  );
  console.log(`PASSED - ${name} matches ${expectedRole} user ${expectedUserId}`);
}

async function verifyFixtures(
  client,
  farmerUserId,
  otherFarmerUserId,
  buyerUserId,
  otherFarmId,
  cropId,
) {
  assert.notEqual(farmerUserId, otherFarmerUserId,
    "Fixture users must be different");

  const farmerResult = await client.query(
    `SELECT u.user_id::text AS user_id
     FROM users u
     JOIN farmers f ON f.user_id = u.user_id
     WHERE u.user_id = ANY($1::bigint[]) AND u.role = 'FARMER' AND u.status = 'ACTIVE'`,
    [[farmerUserId, otherFarmerUserId]],
  );
  const activeFarmers = new Set(farmerResult.rows.map(({ user_id }) => user_id));
  assert.ok(activeFarmers.has(farmerUserId), "TEST_FARMER_USER_ID must be an active farmer");
  assert.ok(activeFarmers.has(otherFarmerUserId),
    "TEST_OTHER_FARMER_USER_ID must be a different active farmer");

  const buyerResult = await client.query(
    `SELECT u.user_id::text AS user_id
     FROM users u
     JOIN buyers b ON b.user_id = u.user_id
     WHERE u.user_id = $1
       AND u.role = 'BUYER'
       AND u.status = 'ACTIVE'
       AND b.status = 'ACTIVE'`,
    [buyerUserId],
  );
  assert.equal(buyerResult.rowCount, 1,
    "TEST_BUYER_COOKIE must belong to an active buyer account and buyer profile");

  const farmResult = await client.query(
    `SELECT f.farm_id::text AS farm_id, u.user_id::text AS user_id
     FROM farms f
     JOIN farmers fr ON fr.farmer_id = f.farmer_id
     JOIN users u ON u.user_id = fr.user_id
     WHERE f.farm_id = $1`,
    [otherFarmId],
  );
  assert.equal(farmResult.rowCount, 1, "TEST_OTHER_FARM_ID must identify an existing farm");
  assert.equal(farmResult.rows[0].user_id, otherFarmerUserId,
    "TEST_OTHER_FARM_ID must belong to TEST_OTHER_FARMER_USER_ID");

  const cropResult = await client.query(
    "SELECT crop_id FROM crops WHERE crop_id = $1",
    [cropId],
  );
  assert.equal(cropResult.rowCount, 1, "TEST_CROP_ID must identify an existing crop");
}

async function main() {
  requireEnvironment();
  const [assertModule, postgresModule] = await Promise.all([
    import("node:assert"),
    import("pg"),
  ]);
  assert = assertModule.strict;
  Client = postgresModule.Client;

  const farmerUserId = positiveIntegerText("TEST_FARMER_USER_ID");
  const otherFarmerUserId = positiveIntegerText("TEST_OTHER_FARMER_USER_ID");
  const otherFarmId = positiveIntegerText("TEST_OTHER_FARM_ID");
  const cropId = positiveIntegerText("TEST_CROP_ID");

  await verifySessionFixture(
    "TEST_FARMER_COOKIE",
    process.env.TEST_FARMER_COOKIE,
    farmerUserId,
    "FARMER",
  );
  await verifySessionFixture(
    "TEST_OTHER_FARMER_COOKIE",
    process.env.TEST_OTHER_FARMER_COOKIE,
    otherFarmerUserId,
    "FARMER",
  );

  const buyerSession = await requestJson("/api/auth/session", {
    cookie: process.env.TEST_BUYER_COOKIE,
  });
  assert.equal(
    buyerSession.response.status,
    200,
    `TEST_BUYER_COOKIE: authenticated session endpoint returned HTTP ${buyerSession.response.status}`,
  );
  const buyerUserId = buyerSession.data?.user?.user_id;
  assert.match(
    buyerUserId || "",
    /^[1-9]\d*$/,
    "TEST_BUYER_COOKIE must authenticate an account with a positive user_id",
  );
  assert.equal(
    buyerSession.data?.user?.role,
    "BUYER",
    "TEST_BUYER_COOKIE must authenticate a buyer account",
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let connected = false;

  try {
    console.log(`PASSED - TEST_BUYER_COOKIE matches BUYER user ${buyerUserId}`);
    await client.connect();
    connected = true;
    await verifyFixtures(
      client,
      farmerUserId,
      otherFarmerUserId,
      buyerUserId,
      otherFarmId,
      cropId,
    );
    console.log("PASSED - PostgreSQL verified active role profiles and farm/crop fixture ownership");

    await expectStatus(
      "Unauthenticated farm listing",
      await requestJson("/api/farmer/farms"),
      401,
    );
    await expectStatus(
      "Unauthenticated farm creation",
      await requestJson("/api/farmer/farms", {
        method: "POST",
        body: JSON.stringify({ farmName: "Unauthenticated Farm" }),
      }),
      401,
    );
    await expectStatus(
      "Buyer cannot list farms",
      await requestJson("/api/farmer/farms", {
        cookie: process.env.TEST_BUYER_COOKIE,
      }),
      403,
    );
    await expectStatus(
      "Buyer cannot create farms",
      await requestJson("/api/farmer/farms", {
        method: "POST",
        cookie: process.env.TEST_BUYER_COOKIE,
        body: JSON.stringify({ farmName: "Unauthorized Farm" }),
      }),
      403,
    );
    await expectStatus(
      "Reject missing farm name",
      await requestJson("/api/farmer/farms", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify({ location: "Village" }),
      }),
      400,
    );
    await expectStatus(
      "Reject invalid area",
      await requestJson("/api/farmer/farms", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify({ farmName: "Invalid Area", areaAcres: "0" }),
      }),
      400,
    );
    await expectStatus(
      "Reject area with unsupported precision",
      await requestJson("/api/farmer/farms", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify({ farmName: "Invalid Precision", areaAcres: "1.234" }),
      }),
      400,
    );
    for (const [label, body] of [
      ["farm name longer than PostgreSQL column limit", { farmName: "F".repeat(101) }],
      ["location longer than PostgreSQL column limit", { farmName: "Invalid Location", location: "L".repeat(201) }],
      ["soil type longer than PostgreSQL column limit", { farmName: "Invalid Soil", soilType: "S".repeat(101) }],
      ["irrigation type longer than PostgreSQL column limit", { farmName: "Invalid Irrigation", irrigationType: "I".repeat(101) }],
      ["area beyond PostgreSQL numeric precision", { farmName: "Invalid Maximum", areaAcres: "100000000" }],
    ]) {
      await expectStatus(
        `Reject ${label}`,
        await requestJson("/api/farmer/farms", {
          method: "POST",
          cookie: process.env.TEST_FARMER_COOKIE,
          body: JSON.stringify(body),
        }),
        400,
      );
    }
    await expectStatus(
      "Reject client-supplied farmer identity",
      await requestJson("/api/farmer/farms", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify({
          farmName: "Forged Owner",
          farmer_id: 999999,
          user_id: 999999,
        }),
      }),
      400,
    );

    const ownFarmsBefore = await requestJson("/api/farmer/farms", {
      cookie: process.env.TEST_FARMER_COOKIE,
    });
    await expectStatus("Farmer can list own farms", ownFarmsBefore, 200);
    assert.ok(
      ownFarmsBefore.data.farms.every((farm) => farm.id !== otherFarmId),
      "First farmer's farm list must not include the other farmer's farm",
    );
    const otherFarms = await requestJson("/api/farmer/farms", {
      cookie: process.env.TEST_OTHER_FARMER_COOKIE,
    });
    await expectStatus("Second farmer can list own farms", otherFarms, 200);
    assert.ok(otherFarms.data.farms.some((farm) => farm.id === otherFarmId),
      "Second farmer's farm list should include their verified fixture farm");

    const farmName = `Farm onboarding test ${Date.now()}`;
    const created = await requestJson("/api/farmer/farms", {
      method: "POST",
      cookie: process.env.TEST_FARMER_COOKIE,
      body: JSON.stringify({
        farmName,
        location: "Automated test",
        areaAcres: "1.25",
        soilType: "Loam",
        irrigationType: "Drip",
      }),
    });
    await expectStatus("Farmer creates a farm", created, 201);
    assert.ok(created.data.farm?.id, "Farm creation must return its database ID");

    const createdOwner = await client.query(
      `SELECT u.user_id::text AS user_id
       FROM farms f
       JOIN farmers fr ON fr.farmer_id = f.farmer_id
       JOIN users u ON u.user_id = fr.user_id
       WHERE f.farm_id = $1`,
      [created.data.farm.id],
    );
    assert.equal(createdOwner.rows[0]?.user_id, farmerUserId,
      "The created farm must belong to the authenticated farmer");

    const ownFarmsAfter = await requestJson("/api/farmer/farms", {
      cookie: process.env.TEST_FARMER_COOKIE,
    });
    await expectStatus("Farmer list refresh includes created farm", ownFarmsAfter, 200);
    assert.ok(ownFarmsAfter.data.farms.some((farm) => farm.id === created.data.farm.id));

    const otherFarmsAfter = await requestJson("/api/farmer/farms", {
      cookie: process.env.TEST_OTHER_FARMER_COOKIE,
    });
    await expectStatus("Other farmer cannot list newly created farm", otherFarmsAfter, 200);
    assert.ok(otherFarmsAfter.data.farms.every((farm) => farm.id !== created.data.farm.id));

    const invalidLot = await requestJson("/api/farmer/lots", {
      method: "POST",
      cookie: process.env.TEST_FARMER_COOKIE,
      body: JSON.stringify({
        farmId: otherFarmId,
        cropId,
        initialQuantity: 1,
        harvestDate: new Date().toISOString().slice(0, 10),
      }),
    });
    await expectStatus("Farmer cannot create lot using another farmer's farm", invalidLot, 400);

    const createdLot = await requestJson("/api/farmer/lots", {
      method: "POST",
      cookie: process.env.TEST_FARMER_COOKIE,
      body: JSON.stringify({
        farmId: created.data.farm.id,
        cropId,
        initialQuantity: 1,
        harvestDate: new Date().toISOString().slice(0, 10),
      }),
    });
    await expectStatus("Farmer can create a lot under the newly created farm", createdLot, 201);
    console.log("Farm API integration checks completed.");
    console.log("One farm and one produce lot were inserted and remain in PostgreSQL.");
  } finally {
    if (connected) await client.end();
  }
}

main().catch((error) => {
  console.error("Farmer farm API tests failed:", error.message);
  process.exitCode = 1;
});
