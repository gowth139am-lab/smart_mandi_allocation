const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
let assert;
let MongoClient;
let Long;
let Double;
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
  "TEST_BUYER_USER_ID",
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

  const postgresDatabase = new URL(process.env.DATABASE_URL).pathname.slice(1);
  if (!postgresDatabase.startsWith("smart_mandi_test_")) {
    throw new Error("DATABASE_URL must target a disposable smart_mandi_test_* database");
  }
  if (!process.env.MONGODB_DB.startsWith("smart_mandi_test_")) {
    throw new Error("MONGODB_DB must target a disposable smart_mandi_test_* database");
  }
}

function positiveBigint(name) {
  const value = process.env[name];
  if (!/^[1-9]\d*$/.test(value || "")) {
    throw new Error(`${name} must be a positive integer`);
  }
  if (
    value.length > 19 ||
    (value.length === 19 && value > "9223372036854775807")
  ) {
    throw new Error(`${name} must fit a positive PostgreSQL BIGINT`);
  }
  return value;
}

function safeDatabaseIds(values, label) {
  return values.flatMap(({ id }) => {
    if (!/^[1-9]\d{0,18}$/.test(id) ||
      (id.length === 19 && id > "9223372036854775807")) {
      throw new Error(`${label} contains an invalid PostgreSQL ID`);
    }
    return [id];
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

async function verifySessionFixture(cookie, expectedUserId, expectedRole) {
  const result = await requestJson("/api/auth/session", { cookie });
  assert.equal(result.response.status, 200, "Auth.js session endpoint must respond");
  assert.equal(result.data?.user?.user_id, expectedUserId,
    `Configured cookie must authenticate TEST user ${expectedUserId}`);
  assert.equal(result.data?.user?.role, expectedRole,
    `Configured cookie must authenticate a ${expectedRole}`);
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
        lot_id: lotIds === null
          ? { $type: ["int", "long", "double"] }
          : { $in: lotIds.map((id) => Long.fromString(String(id))) },
        crop_id: { $type: ["int", "long", "double"] },
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
    { $sort: { crop_id: 1, assessed_grade: 1, crop_name: 1 } },
  ];
}

async function expectedReport(collection, lotIds = null) {
  const rows = await collection.aggregate(reportPipeline(lotIds)).toArray();
  const serialized = JSON.parse(JSON.stringify(rows, (_key, value) =>
    value && typeof value === "object" && value._bsontype === "Long"
      ? value.toString()
      : value,
  ));
  return serialized.map((entry) => ({ ...entry, crop_id: String(entry.crop_id) }));
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
  Long = mongodb.Long;
  Double = mongodb.Double;
  Client = postgresModule.Client;

  const fixtures = {
    farmerUserId: positiveBigint("TEST_FARMER_USER_ID"),
    otherFarmerUserId: positiveBigint("TEST_OTHER_FARMER_USER_ID"),
    buyerUserId: positiveBigint("TEST_BUYER_USER_ID"),
    adminUserId: positiveBigint("TEST_ADMIN_USER_ID"),
    ownLotId: positiveBigint("TEST_OWN_LOT_ID"),
    ownCropId: positiveBigint("TEST_OWN_CROP_ID"),
    otherLotId: positiveBigint("TEST_OTHER_LOT_ID"),
    otherCropId: positiveBigint("TEST_OTHER_CROP_ID"),
    mismatchCropId: positiveBigint("TEST_MISMATCH_CROP_ID"),
  };
  assert.notEqual(fixtures.farmerUserId, fixtures.otherFarmerUserId,
    "The configured farmer user IDs must differ");
  await verifySessionFixture(
    process.env.TEST_FARMER_COOKIE,
    fixtures.farmerUserId,
    "FARMER",
  );
  await verifySessionFixture(
    process.env.TEST_OTHER_FARMER_COOKIE,
    fixtures.otherFarmerUserId,
    "FARMER",
  );
  await verifySessionFixture(
    process.env.TEST_BUYER_COOKIE,
    fixtures.buyerUserId,
    "BUYER",
  );
  await verifySessionFixture(
    process.env.TEST_ADMIN_COOKIE,
    fixtures.adminUserId,
    "ADMIN",
  );

  const postgres = new Client({ connectionString: process.env.DATABASE_URL });
  const mongo = new MongoClient(process.env.MONGODB_URI, { promoteLongs: false });
  let postgresConnected = false;
  let mongoConnected = false;
  const compatibilityObservationIds = [];
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
    const legacyLotId = Number(fixtures.ownLotId);
    const legacyCropId = Number(fixtures.ownCropId);
    const legacyInspectorId = Number(fixtures.farmerUserId);
    assert.ok(
      Number.isSafeInteger(legacyLotId) &&
      Number.isSafeInteger(legacyCropId) &&
      Number.isSafeInteger(legacyInspectorId),
      "Legacy numeric compatibility fixture IDs must be JavaScript safe integers",
    );
    const legacyObservation = await collection.insertOne({
      lot_id: legacyLotId,
      crop_id: legacyCropId,
      crop_name: "Legacy numeric compatibility fixture",
      inspection_date: new Date(),
      inspector: "Legacy numeric compatibility fixture",
      inspector_id: legacyInspectorId,
      measurements: { compatibility: 1 },
      assessed_grade: "C",
    });
    compatibilityObservationIds.push(legacyObservation.insertedId);
    const legacyDoubleObservation = await collection.insertOne({
      lot_id: Double.fromString(String(legacyLotId)),
      crop_id: Double.fromString(String(legacyCropId)),
      crop_name: "Legacy double BSON compatibility fixture",
      inspection_date: new Date(),
      inspector: "Legacy double BSON compatibility fixture",
      inspector_id: Double.fromString(String(legacyInspectorId)),
      measurements: { compatibility: 1 },
      assessed_grade: "C",
    });
    compatibilityObservationIds.push(legacyDoubleObservation.insertedId);
    const largeIdObservation = await collection.insertOne({
      lot_id: Long.fromString("9007199254740993"),
      crop_id: Long.fromString("9007199254740995"),
      crop_name: "Large BIGINT compatibility fixture",
      inspection_date: new Date(),
      inspector: "Large BIGINT compatibility fixture",
      inspector_id: Long.fromString("9007199254740997"),
      measurements: { compatibility: 1 },
      assessed_grade: "C",
    });
    compatibilityObservationIds.push(largeIdObservation.insertedId);
    const legacyRead = await requestJson(
      `/api/quality-observations?lot_id=${fixtures.ownLotId}`,
      { cookie: process.env.TEST_FARMER_COOKIE },
    );
    await expectStatus("Legacy numeric BSON observation remains readable", legacyRead, 200);
    assert.ok(legacyRead.data.observations?.some(
      (item) => item._id === legacyObservation.insertedId.toString(),
    ));
    assert.equal(
      typeof legacyRead.data.observations.find((item) => item._id === legacyObservation.insertedId.toString()).lot_id,
      "string",
    );
    assert.ok(legacyRead.data.observations.some(
      (item) => item._id === legacyDoubleObservation.insertedId.toString() &&
        item.lot_id === fixtures.ownLotId,
    ), "Legacy BSON double IDs must remain readable using exact decimal-string filters");
    console.log("PASSED - Legacy numeric BSON IDs are readable and serialized as decimal strings");
    const largeIdRead = await requestJson(
      "/api/quality-observations?lot_id=9007199254740993",
      { cookie: process.env.TEST_ADMIN_COOKIE },
    );
    await expectStatus("BSON Long IDs above Number.MAX_SAFE_INTEGER are readable", largeIdRead, 200);
    const largeObservation = largeIdRead.data.observations?.find(
      (item) => item._id === largeIdObservation.insertedId.toString(),
    );
    assert.equal(largeObservation?.lot_id, "9007199254740993");
    assert.equal(largeObservation?.crop_id, "9007199254740995");
    assert.equal(largeObservation?.inspector_id, "9007199254740997");

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
    const storedObservation = await collection.findOne({
      _id: new mongodb.ObjectId(ownCreate.data.observationId),
    });
    assert.ok(Long.isLong(storedObservation?.lot_id), "New lot_id values must use BSON Long");
    assert.ok(Long.isLong(storedObservation?.crop_id), "New crop_id values must use BSON Long");
    assert.ok(Long.isLong(storedObservation?.inspector_id), "New inspector_id values must use BSON Long");

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
    const farmerReport = await verifyReport(
      "Farmer report includes legacy numeric BSON observations",
      process.env.TEST_FARMER_COOKIE,
      collection,
      ownFarmerLotIds,
    );
    assert.ok(farmerReport.some((entry) =>
      entry.crop_name === "Legacy numeric compatibility fixture",
    ), "Farmer report must aggregate the legacy numeric compatibility observation");
    assert.ok(farmerReport.some((entry) =>
      entry.crop_name === "Legacy double BSON compatibility fixture",
    ), "Farmer report must aggregate legacy BSON double IDs");
    const adminReport = await verifyReport(
      "Admin can read all quality observations, including both test farmers",
      process.env.TEST_ADMIN_COOKIE,
      collection,
    );
    assert.ok(adminReport.some((entry) =>
      entry.crop_name === "Large BIGINT compatibility fixture",
    ), "Admin report must aggregate observations whose IDs exceed Number.MAX_SAFE_INTEGER");
    assert.ok(adminReport.some((entry) => entry.crop_id === "9007199254740995"),
      "Admin report must preserve BSON Long crop IDs above Number.MAX_SAFE_INTEGER");

    const fixtureObservations = await collection.find({
      lot_id: { $in: [fixtures.ownLotId, fixtures.otherLotId].map((id) => Long.fromString(id)) },
      inspector_id: {
        $in: [fixtures.farmerUserId, fixtures.otherFarmerUserId, fixtures.adminUserId]
          .map((id) => Long.fromString(id)),
      },
    }).toArray();
    assert.ok(fixtureObservations.some((item) =>
      String(item.lot_id) === fixtures.ownLotId && String(item.inspector_id) === fixtures.farmerUserId,
    ), "The first farmer observation must be present in MongoDB");
    assert.ok(fixtureObservations.some((item) =>
      String(item.lot_id) === fixtures.otherLotId && String(item.inspector_id) === fixtures.otherFarmerUserId,
    ), "The second farmer observation must be present in MongoDB");
    assert.ok(fixtureObservations.some((item) =>
      String(item.lot_id) === fixtures.otherLotId && String(item.inspector_id) === fixtures.adminUserId,
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
    if (compatibilityObservationIds.length && mongoConnected) {
      await mongo.db(process.env.MONGODB_DB)
        .collection("quality_observations")
        .deleteMany({ _id: { $in: compatibilityObservationIds } });
    }
    if (postgresConnected) await postgres.end();
    if (mongoConnected) await mongo.close();
  }
}

main().catch((error) => {
  console.error("MongoDB API tests failed:", error.message);
  process.exitCode = 1;
});
