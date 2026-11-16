const requiredEnvironment = [
  "DATABASE_URL",
  "TEST_BUYER_COOKIE",
  "TEST_OTHER_BUYER_COOKIE",
  "TEST_BUYER_USER_ID",
  "TEST_OTHER_BUYER_USER_ID",
  "TEST_OWN_DEMAND_ID",
  "TEST_OTHER_DEMAND_ID",
  "TEST_FARMER_COOKIE",
  "TEST_OTHER_FARMER_COOKIE",
  "TEST_FARMER_USER_ID",
  "TEST_OTHER_FARMER_USER_ID",
  "TEST_OWN_LOT_ID",
  "TEST_OTHER_LOT_ID",
];
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
let assertStrict;
let Client;

function requireEnvironment() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing test configuration: ${missing.join(", ")}`);
}

function positiveId(name) {
  const value = process.env[name];
  if (!/^[1-9]\d{0,18}$/.test(value || "")) {
    throw new Error(`${name} must be a positive PostgreSQL BIGINT`);
  }
  if (value.length === 19 && value > "9223372036854775807") {
    throw new Error(`${name} exceeds PostgreSQL BIGINT`);
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
  assertStrict.equal(
    result.response.status,
    status,
    `${name}: expected HTTP ${status}, received ${result.response.status}: ${JSON.stringify(result.data)}`,
  );
  console.log(`PASSED - ${name}`);
}

async function verifySession(cookie, userId, role, name) {
  const result = await requestJson("/api/auth/session", { cookie });
  assertStrict.equal(result.response.status, 200, `${name}: session endpoint failed`);
  assertStrict.equal(result.data?.user?.user_id, userId, `${name}: unexpected session user`);
  assertStrict.equal(result.data?.user?.role, role, `${name}: unexpected session role`);
}

async function main() {
  requireEnvironment();
  const [assertModule, postgresModule] = await Promise.all([
    import("node:assert"),
    import("pg"),
  ]);
  assertStrict = assertModule.strict;
  Client = postgresModule.Client;

  const buyerUserId = positiveId("TEST_BUYER_USER_ID");
  const otherBuyerUserId = positiveId("TEST_OTHER_BUYER_USER_ID");
  const farmerUserId = positiveId("TEST_FARMER_USER_ID");
  const otherFarmerUserId = positiveId("TEST_OTHER_FARMER_USER_ID");
  const ownDemandId = positiveId("TEST_OWN_DEMAND_ID");
  const otherDemandId = positiveId("TEST_OTHER_DEMAND_ID");
  const ownLotId = positiveId("TEST_OWN_LOT_ID");
  const otherLotId = positiveId("TEST_OTHER_LOT_ID");

  assertStrict.notEqual(buyerUserId, otherBuyerUserId);
  assertStrict.notEqual(farmerUserId, otherFarmerUserId);
  await verifySession(process.env.TEST_BUYER_COOKIE, buyerUserId, "BUYER", "Buyer fixture");
  await verifySession(process.env.TEST_OTHER_BUYER_COOKIE, otherBuyerUserId, "BUYER", "Other buyer fixture");
  await verifySession(process.env.TEST_FARMER_COOKIE, farmerUserId, "FARMER", "Farmer fixture");
  await verifySession(process.env.TEST_OTHER_FARMER_COOKIE, otherFarmerUserId, "FARMER", "Other farmer fixture");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const demands = await client.query(
      `SELECT d.demand_id::text AS demand_id, u.user_id::text AS user_id,
              c.crop_name
       FROM buyer_demands d
       JOIN buyers b ON b.buyer_id = d.buyer_id
       JOIN users u ON u.user_id = b.user_id
       JOIN crops c ON c.crop_id = d.crop_id
       WHERE d.demand_id = ANY($1::bigint[])`,
      [[ownDemandId, otherDemandId]],
    );
    const demandById = new Map(demands.rows.map((row) => [row.demand_id, row]));
    assertStrict.equal(demandById.get(ownDemandId)?.user_id, buyerUserId,
      "TEST_OWN_DEMAND_ID must belong to TEST_BUYER_USER_ID");
    assertStrict.equal(demandById.get(otherDemandId)?.user_id, otherBuyerUserId,
      "TEST_OTHER_DEMAND_ID must belong to TEST_OTHER_BUYER_USER_ID");

    const lots = await client.query(
      `SELECT pl.lot_id::text AS lot_id, u.user_id::text AS user_id,
              pl.farm_id::text AS farm_id, pl.crop_id::text AS crop_id,
              pl.harvest_date::text AS harvest_date,
              (pl.harvest_date - 1)::text AS date_before_harvest
       FROM produce_lots pl
       JOIN farms f ON f.farm_id = pl.farm_id
       JOIN farmers fr ON fr.farmer_id = f.farmer_id
       JOIN users u ON u.user_id = fr.user_id
       WHERE pl.lot_id = ANY($1::bigint[])`,
      [[ownLotId, otherLotId]],
    );
    const lotById = new Map(lots.rows.map((row) => [row.lot_id, row]));
    assertStrict.equal(lotById.get(ownLotId)?.user_id, farmerUserId,
      "TEST_OWN_LOT_ID must belong to TEST_FARMER_USER_ID");
    assertStrict.equal(lotById.get(otherLotId)?.user_id, otherFarmerUserId,
      "TEST_OTHER_LOT_ID must belong to TEST_OTHER_FARMER_USER_ID");

    const maxId = "9223372036854775807";
    const absent = await client.query(
      `SELECT
         NOT EXISTS (SELECT 1 FROM buyer_demands WHERE demand_id = $1) AS demand_absent,
         NOT EXISTS (SELECT 1 FROM produce_lots WHERE lot_id = $1) AS lot_absent`,
      [maxId],
    );
    assertStrict.equal(absent.rows[0].demand_absent, true, "maximum BIGINT demand ID must be unused");
    assertStrict.equal(absent.rows[0].lot_absent, true, "maximum BIGINT lot ID must be unused");

    await expectStatus("Unauthenticated buyer demand list",
      await requestJson("/api/buyer/demands"), 401);
    await expectStatus("Unauthenticated farmer lot list",
      await requestJson("/api/farmer/lots"), 401);

    await expectStatus("Buyer can read own demand",
      await requestJson(`/api/buyer/demands/${ownDemandId}`, { cookie: process.env.TEST_BUYER_COOKIE }), 200);
    for (const [name, method] of [["read", "GET"], ["update", "PUT"], ["cancel", "DELETE"]]) {
      await expectStatus(`Buyer cannot ${name} another buyer's demand`,
        await requestJson(`/api/buyer/demands/${otherDemandId}`, {
          cookie: process.env.TEST_BUYER_COOKIE,
          method,
          ...(method === "PUT" ? { body: JSON.stringify({ minimumGrade: "A", maximumPrice: "1.00", requiredDate: null, location: "Test" }) } : {}),
        }), 404);
    }

    await expectStatus("Farmer can read own lot",
      await requestJson(`/api/farmer/lots/${ownLotId}`, { cookie: process.env.TEST_FARMER_COOKIE }), 200);
    for (const [name, method] of [["read", "GET"], ["update", "PUT"], ["delete", "DELETE"]]) {
      await expectStatus(`Farmer cannot ${name} another farmer's lot`,
        await requestJson(`/api/farmer/lots/${otherLotId}`, {
          cookie: process.env.TEST_FARMER_COOKIE,
          method,
          ...(method === "PUT" ? { body: JSON.stringify({ grade: "A" }) } : {}),
        }), 404);
    }

    for (const id of ["0", "-1", "abc", "9223372036854775808", "1".repeat(20)]) {
      await expectStatus(`Reject malformed buyer demand ID ${id}`,
        await requestJson(`/api/buyer/demands/${id}`, { cookie: process.env.TEST_BUYER_COOKIE }), 400);
    }
    await expectStatus("Missing buyer demand ID",
      await requestJson(`/api/buyer/demands/${maxId}`, { cookie: process.env.TEST_BUYER_COOKIE }), 404);
    for (const id of ["0", "-1", "abc", "9223372036854775808", "1".repeat(20)]) {
      await expectStatus(`Reject malformed farmer lot ID ${id}`,
        await requestJson(`/api/farmer/lots/${id}`, { cookie: process.env.TEST_FARMER_COOKIE }), 400);
    }
    await expectStatus("Missing farmer lot ID",
      await requestJson(`/api/farmer/lots/${maxId}`, { cookie: process.env.TEST_FARMER_COOKIE }), 404);

    const demandFixture = demandById.get(ownDemandId);
    const invalidDemandCases = [
      ["zero quantity", { requiredQuantity: "0" }],
      ["negative quantity", { requiredQuantity: "-1" }],
      ["quantity exceeds NUMERIC(12,3)", { requiredQuantity: "1000000000" }],
      ["quantity over-precision", { requiredQuantity: "1.0001" }],
      ["price over-precision", { requiredQuantity: "1", maximumPrice: "1.001" }],
      ["price exceeds NUMERIC(12,2)", { requiredQuantity: "1", maximumPrice: "10000000000" }],
      ["impossible demand date", { requiredQuantity: "1", requiredDate: "2026-02-31" }],
    ];
    for (const [name, change] of invalidDemandCases) {
      await expectStatus(`Reject ${name}`,
        await requestJson("/api/buyer/demands", {
          method: "POST",
          cookie: process.env.TEST_BUYER_COOKIE,
          body: JSON.stringify({
            cropName: demandFixture.crop_name,
            requiredQuantity: "1",
            minimumGrade: "A",
            maximumPrice: "1.00",
            requiredDate: "2027-01-01",
            location: "Test location",
            ...change,
          }),
        }), 400);
    }
    await expectStatus("Reject impossible buyer demand update date",
      await requestJson(`/api/buyer/demands/${ownDemandId}`, {
        method: "PUT",
        cookie: process.env.TEST_BUYER_COOKIE,
        body: JSON.stringify({
          minimumGrade: "A",
          maximumPrice: "1.00",
          requiredDate: "2026-02-31",
          location: "Test location",
        }),
      }), 400);

    const lotFixture = lotById.get(ownLotId);
    const invalidLotCases = [
      ["quantity exceeds NUMERIC(12,3)", { initialQuantity: "1000000000" }],
      ["quantity over-precision", { initialQuantity: "1.0001" }],
      ["impossible harvest date", { harvestDate: "2026-02-31" }],
      ["expiry before harvest", { harvestDate: "2026-05-01", expiryDate: "2026-04-30" }],
    ];
    for (const [name, change] of invalidLotCases) {
      await expectStatus(`Reject ${name}`,
        await requestJson("/api/farmer/lots", {
          method: "POST",
          cookie: process.env.TEST_FARMER_COOKIE,
          body: JSON.stringify({
            farmId: lotFixture.farm_id,
            cropId: lotFixture.crop_id,
            initialQuantity: "1.000",
            harvestDate: lotFixture.harvest_date,
            expiryDate: null,
            grade: "A",
            ...change,
          }),
        }), 400);
    }
    await expectStatus("Reject impossible farmer lot update date",
      await requestJson(`/api/farmer/lots/${ownLotId}`, {
        method: "PUT",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify({ harvestDate: "2026-02-31" }),
      }), 400);
    await expectStatus("Reject expiry before existing harvest date on update",
      await requestJson(`/api/farmer/lots/${ownLotId}`, {
        method: "PUT",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify({ expiryDate: lotFixture.date_before_harvest }),
      }), 400);
    await expectStatus("Reject expiry before supplied harvest date on update",
      await requestJson(`/api/farmer/lots/${ownLotId}`, {
        method: "PUT",
        cookie: process.env.TEST_FARMER_COOKIE,
        body: JSON.stringify({ harvestDate: "2026-05-01", expiryDate: "2026-04-30" }),
      }), 400);
  } finally {
    if (connected) await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
