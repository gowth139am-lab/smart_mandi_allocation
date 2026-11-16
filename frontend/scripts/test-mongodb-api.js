const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
let assert;
let MongoClient;
let Client;
const requiredEnvironment = [
  "DATABASE_URL",
  "MONGODB_URI",
  "MONGODB_DB",
  "TEST_FARMER_COOKIE",
  "TEST_OTHER_FARMER_COOKIE",
  "TEST_BUYER_COOKIE",
  "TEST_ADMIN_COOKIE",
  "TEST_FARMER_USER_ID",
  "TEST_OTHER_FARMER_USER_ID",
  "TEST_ADMIN_USER_ID",
  "TEST_OWN_LOT_ID",
  "TEST_OWN_CROP_ID",
  "TEST_OTHER_LOT_ID",
  "TEST_OTHER_CROP_ID",
  "TEST_MISMATCH_CROP_ID",
];

function requireEnvironment() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing test configuration: ${missing.join(", ")}`);
  }
}

function positiveSafeInteger(name) {
  const value = process.env[name];
  if (!/^[1-9]\d*$/.test(value || "")) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return parsed;
}

function safeDatabaseIds(values, label) {
  return values.flatMap(({ id }) => {
    if (!/^[1-9]\d*$/.test(id)) {
      throw new Error(`${label} contains an invalid PostgreSQL ID`);
    }
    const numberId = Number(id);
    if (!Number.isSafeInteger(numberId)) {
      throw new Error(`${label} contains an ID outside the supported numeric range`);
    }
    return [numberId];
  });
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

async function expectStatus(name, result, expectedStatus) {
  assert.equal(
    result.response.status,
    expectedStatus,
    `${name}: expected HTTP ${expectedStatus}, received ${result.response.status}: ${JSON.stringify(result.data)}`,
  );
  console.log(`PASSED - ${name}`);
}

function observationPayload(lotId, cropId, overrides = {}) {
  return {
    lot_id: lotId,
    crop_id: cropId,
    measurements: {
      firmness: 3.8,
      ripeness: "Ripe",
      bruising_percentage: 2,
      colour: "Red",
    },
    assessed_grade: "A",
    ...overrides,
  };
}

async function verifyFixtures(postgres, fixtures) {
  const result = await postgres.query(
    `SELECT f.farmer_id::text AS farmer_id,
            u.user_id::text AS user_id,
            pl.lot_id::text AS lot_id,
            pl.crop_id::text AS crop_id
     FROM produce_lots pl
     JOIN farms f ON f.farm_id = pl.farm_id
     JOIN farmers fr ON fr.farmer_id = f.farmer_id
     JOIN users u ON u.user_id = fr.user_id
     WHERE pl.lot_id = ANY($1::bigint[])`,
    [[fixtures.ownLotId, fixtures.otherLotId]],
  );

  const ownLot = result.rows.find(({ lot_id }) => lot_id === String(fixtures.ownLotId));
  const otherLot = result.rows.find(({ lot_id }) => lot_id === String(fixtures.otherLotId));
  assert.ok(ownLot, "TEST_OWN_LOT_ID must identify an existing produce lot");
  assert.ok(otherLot, "TEST_OTHER_LOT_ID must identify an existing produce lot");
  assert.equal(ownLot.user_id, String(fixtures.farmerUserId),
    "TEST_OWN_LOT_ID must belong to TEST_FARMER_USER_ID in PostgreSQL");
  assert.equal(otherLot.user_id, String(fixtures.otherFarmerUserId),
    "TEST_OTHER_LOT_ID must belong to TEST_OTHER_FARMER_USER_ID in PostgreSQL");
  assert.notEqual(ownLot.farmer_id, otherLot.farmer_id,
    "The configured lots must belong to two different farmer profiles");
  assert.equal(ownLot.crop_id, String(fixtures.ownCropId),
    "TEST_OWN_CROP_ID must match TEST_OWN_LOT_ID");
  assert.equal(otherLot.crop_id, String(fixtures.otherCropId),
    "TEST_OTHER_CROP_ID must match TEST_OTHER_LOT_ID");

  const mismatchCrop = await postgres.query(
    "SELECT crop_id FROM crops WHERE crop_id = $1 AND crop_id <> $2",
    [fixtures.mismatchCropId, fixtures.ownCropId],
  );
  assert.equal(mismatchCrop.rowCount, 1,
    "TEST_MISMATCH_CROP_ID must be an existing crop different from TEST_OWN_CROP_ID");

  const farmerLots = await postgres.query(
    `SELECT f.farmer_id::text AS farmer_id, pl.lot_id::text AS id
     FROM produce_lots pl
     JOIN farms f ON f.farm_id = pl.farm_id
     WHERE f.farmer_id = ANY($1::bigint[])`,
    [[ownLot.farmer_id, otherLot.farmer_id]],
  );
  return {
    ownFarmerLotIds: safeDatabaseIds(
      farmerLots.rows.filter(({ farmer_id }) => farmer_id === ownLot.farmer_id),
      "First farmer lot fixtures",
    ),
    otherFarmerLotIds: safeDatabaseIds(
      farmerLots.rows.filter(({ farmer_id }) => farmer_id === otherLot.farmer_id),
      "Second farmer lot fixtures",
    ),
  };
}

function reportPipeline(lotIds = null) {
  return [
    {
      $match: {
        lot_id: lotIds === null ? { $type: "number" } : { $in: lotIds },
        crop_id: { $type: "number" },
        assessed_grade: { $in: ["A", "B", "C"] },
        inspection_date: { $type: "date" },
      },
    },
    {
      $group: {
        _id: {
          crop_id: "$crop_id",
          crop_name: "$crop_name",
          assessed_grade: "$assessed_grade",
        },
        observationCount: { $sum: 1 },
        latestInspection: { $max: "$inspection_date" },
        uniqueLots: { $addToSet: "$lot_id" },
      },
    },
    {
      $project: {
        _id: 0,
        crop_id: "$_id.crop_id",
        crop_name: "$_id.crop_name",
        assessed_grade: "$_id.assessed_grade",
        observationCount: 1,
        distinctLotCount: { $size: "$uniqueLots" },
        latestInspection: 1,
      },
    },
    { $sort: { crop_id: 1, assessed_grade: 1 } },
  ];
}

async function expectedReport(collection, lotIds = null) {
  const rows = await collection.aggregate(reportPipeline(lotIds)).toArray();
  return JSON.parse(JSON.stringify(rows));
}

async function verifyReport(name, cookie, collection, lotIds = null) {
  const result = await requestJson("/api/reports/quality", { cookie });
  await expectStatus(name, result, 200);
  assert.deepEqual(result.data.report, await expectedReport(collection, lotIds),
    `${name}: report contents do not match the authorized MongoDB lot scope`);
  return result.data.report;
}

async function main() {
  requireEnvironment();
  const [assertModule, mongodb, postgresModule] = await Promise.all([
    import("node:assert"),
    import("mongodb"),
    import("pg"),
  ]);
  assert = assertModule.strict;
  MongoClient = mongodb.MongoClient;
  Client = postgresModule.Client;

  const fixtures = {
    farmerUserId: positiveSafeInteger("TEST_FARMER_USER_ID"),
    otherFarmerUserId: positiveSafeInteger("TEST_OTHER_FARMER_USER_ID"),
    adminUserId: positiveSafeInteger("TEST_ADMIN_USER_ID"),
    ownLotId: positiveSafeInteger("TEST_OWN_LOT_ID"),
    ownCropId: positiveSafeInteger("TEST_OWN_CROP_ID"),
    otherLotId: positiveSafeInteger("TEST_OTHER_LOT_ID"),
    otherCropId: positiveSafeInteger("TEST_OTHER_CROP_ID"),
    mismatchCropId: positiveSafeInteger("TEST_MISMATCH_CROP_ID"),
  };
  assert.notEqual(fixtures.farmerUserId, fixtures.otherFarmerUserId,
    "The configured farmer user IDs must differ");

  const postgres = new Client({ connectionString: process.env.DATABASE_URL });
  const mongo = new MongoClient(process.env.MONGODB_URI);
  let postgresConnected = false;
  let mongoConnected = false;
  try {
    await postgres.connect();
    postgresConnected = true;
    const { ownFarmerLotIds, otherFarmerLotIds } =
      await verifyFixtures(postgres, fixtures);
    assert.ok(ownFarmerLotIds.includes(fixtures.ownLotId));
    assert.ok(otherFarmerLotIds.includes(fixtures.otherLotId));
    console.log("PASSED - PostgreSQL verified both fixture lot ownerships and crop relationships");

    await mongo.connect();
    mongoConnected = true;
    const collection = mongo.db(process.env.MONGODB_DB).collection("quality_observations");

    console.log("1. Reject unauthenticated observation creation");
    await expectStatus(
      "Unauthenticated POST",
      await requestJson("/api/quality-observations", {
        method: "POST",
        body: JSON.stringify(observationPayload(fixtures.ownLotId, fixtures.ownCropId)),
      }),
      401,
    );

    console.log("2. Verify farmer ownership enforcement");
    const ownCreate = await requestJson("/api/quality-observations", {
      method: "POST",
      cookie: process.env.TEST_FARMER_COOKIE,
      body: JSON.stringify(observationPayload(fixtures.ownLotId, fixtures.ownCropId, {
        inspector: "Client Supplied Inspector",
        inspector_id: 987654321,
        farmer_id: 987654321,
      })),
    });
    await expectStatus("Farmer creates observation for own lot", ownCreate, 201);
    assert.equal(ownCreate.data.observation?.inspector_id, fixtures.farmerUserId,
      "The first farmer cookie must authenticate as TEST_FARMER_USER_ID");
    assert.notEqual(ownCreate.data.observation?.inspector, "Client Supplied Inspector");
    assert.equal(Object.hasOwn(ownCreate.data.observation || {}, "farmer_id"), false);

    await expectStatus(
      "Farmer cannot create observation for another farmer's lot",
      await requestJson("/api/quality-observations", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify(observationPayload(fixtures.otherLotId, fixtures.otherCropId)),
      }),
      403,
    );
    await expectStatus(
      "Reject crop ID mismatch",
      await requestJson("/api/quality-observations", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify(observationPayload(fixtures.ownLotId, fixtures.mismatchCropId)),
      }),
      400,
    );

    console.log("3. Verify the second farmer and explicit admin override");
    const otherCreate = await requestJson("/api/quality-observations", {
      method: "POST",
      cookie: process.env.TEST_OTHER_FARMER_COOKIE,
      body: JSON.stringify(observationPayload(fixtures.otherLotId, fixtures.otherCropId)),
    });
    await expectStatus("Second farmer creates observation for own lot", otherCreate, 201);
    assert.equal(otherCreate.data.observation?.inspector_id, fixtures.otherFarmerUserId,
      "The second farmer cookie must authenticate as TEST_OTHER_FARMER_USER_ID");

    const adminCreate = await requestJson("/api/quality-observations", {
      method: "POST",
      cookie: process.env.TEST_ADMIN_COOKIE,
      body: JSON.stringify(observationPayload(fixtures.otherLotId, fixtures.otherCropId)),
    });
    await expectStatus("Admin override creates observation for another farmer's valid lot", adminCreate, 201);
    assert.equal(adminCreate.data.observation?.inspector_id, fixtures.adminUserId,
      "The admin cookie must authenticate as TEST_ADMIN_USER_ID");

    console.log("4. Verify observation read permissions");
    const ownRead = await requestJson(
      `/api/quality-observations?lot_id=${fixtures.ownLotId}`,
      { cookie: process.env.TEST_FARMER_COOKIE },
    );
    await expectStatus("Farmer reads own lot observations", ownRead, 200);
    assert.ok(ownRead.data.observations?.some((item) => item.lot_id === fixtures.ownLotId));
    await expectStatus(
      "Farmer cannot read another farmer's observations",
      await requestJson(`/api/quality-observations?lot_id=${fixtures.otherLotId}`, {
        cookie: process.env.TEST_FARMER_COOKIE,
      }),
      403,
    );
    const otherRead = await requestJson(
      `/api/quality-observations?lot_id=${fixtures.otherLotId}`,
      { cookie: process.env.TEST_OTHER_FARMER_COOKIE },
    );
    await expectStatus("Second farmer reads their own lot observations", otherRead, 200);
    assert.ok(otherRead.data.observations?.some((item) => item.lot_id === fixtures.otherLotId));
    await expectStatus(
      "Buyer cannot read observations",
      await requestJson("/api/quality-observations", {
        cookie: process.env.TEST_BUYER_COOKIE,
      }),
      403,
    );
    await expectStatus(
      "Admin can read all observations",
      await requestJson("/api/quality-observations", {
        cookie: process.env.TEST_ADMIN_COOKIE,
      }),
      200,
    );

    console.log("5. Verify report contents are scoped by PostgreSQL-verified lot ownership");
    await verifyReport(
      "Farmer report excludes the second farmer's observations",
      process.env.TEST_FARMER_COOKIE,
      collection,
      ownFarmerLotIds,
    );
    await verifyReport(
      "Second farmer can read own-lot quality report",
      process.env.TEST_OTHER_FARMER_COOKIE,
      collection,
      otherFarmerLotIds,
    );
    await verifyReport(
      "Admin can read all quality observations, including both test farmers",
      process.env.TEST_ADMIN_COOKIE,
      collection,
    );

    const fixtureObservations = await collection.find({
      lot_id: { $in: [fixtures.ownLotId, fixtures.otherLotId] },
      inspector_id: { $in: [fixtures.farmerUserId, fixtures.otherFarmerUserId, fixtures.adminUserId] },
    }).toArray();
    assert.ok(fixtureObservations.some((item) =>
      item.lot_id === fixtures.ownLotId && item.inspector_id === fixtures.farmerUserId,
    ), "The first farmer observation must be present in MongoDB");
    assert.ok(fixtureObservations.some((item) =>
      item.lot_id === fixtures.otherLotId && item.inspector_id === fixtures.otherFarmerUserId,
    ), "The second farmer observation must be present in MongoDB");
    assert.ok(fixtureObservations.some((item) =>
      item.lot_id === fixtures.otherLotId && item.inspector_id === fixtures.adminUserId,
    ), "The admin override observation must be present in MongoDB");
    console.log("PASSED - Admin report includes the persisted observations for both farmers");

    await expectStatus(
      "Buyer cannot read quality report",
      await requestJson("/api/reports/quality", {
        cookie: process.env.TEST_BUYER_COOKIE,
      }),
      403,
    );

    console.log("6. Reject invalid IDs, grades, dates, and measurements");
    await expectStatus(
      "Reject malformed lot ID",
      await requestJson("/api/quality-observations", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify(observationPayload("1e2", fixtures.ownCropId)),
      }),
      400,
    );
    await expectStatus(
      "Reject malformed crop ID",
      await requestJson("/api/quality-observations", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify(observationPayload(fixtures.ownLotId, "1.5")),
      }),
      400,
    );
    await expectStatus(
      "Reject malformed GET lot ID",
      await requestJson("/api/quality-observations?lot_id=1e2", {
        cookie: process.env.TEST_FARMER_COOKIE,
      }),
      400,
    );
    await expectStatus(
      "Return not found for missing lot",
      await requestJson("/api/quality-observations?lot_id=9007199254740991", {
        cookie: process.env.TEST_FARMER_COOKIE,
      }),
      404,
    );
    await expectStatus(
      "Reject unsupported grade",
      await requestJson("/api/quality-observations", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify(observationPayload(fixtures.ownLotId, fixtures.ownCropId, {
          assessed_grade: "D",
        })),
      }),
      400,
    );
    await expectStatus(
      "Reject invalid calendar date",
      await requestJson("/api/quality-observations", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify(observationPayload(fixtures.ownLotId, fixtures.ownCropId, {
          inspection_date: "2026-02-31",
        })),
      }),
      400,
    );
    await expectStatus(
      "Reject invalid measurement value",
      await requestJson("/api/quality-observations", {
        method: "POST",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify(observationPayload(fixtures.ownLotId, fixtures.ownCropId, {
          measurements: { firmness: { value: 3.8 } },
        })),
      }),
      400,
    );
    await expectStatus(
      "Reject unauthenticated observation read",
      await requestJson("/api/quality-observations"),
      401,
    );

    console.log("Integration checks completed; three observations were inserted and remain in MongoDB.");
  } finally {
    if (postgresConnected) await postgres.end();
    if (mongoConnected) await mongo.close();
  }
}

main().catch((error) => {
  console.error("MongoDB API tests failed:", error.message);
  process.exitCode = 1;
});
