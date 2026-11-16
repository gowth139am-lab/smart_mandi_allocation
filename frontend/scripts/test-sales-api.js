const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const DATABASE_URL = process.env.DATABASE_URL;
const PASSWORD = process.env.TEST_SALES_PASSWORD || "G3-sales-test-password";
const suffix = Date.now();
const FARMER_A_USERNAME = `g3_sales_farmer_a_${suffix}`;
const FARMER_B_USERNAME = `g3_sales_farmer_b_${suffix}`;
const BUYER_A_USERNAME = `g3_sales_buyer_a_${suffix}`;
const BUYER_B_USERNAME = `g3_sales_buyer_b_${suffix}`;
let assert;
let bcrypt;
let Client;

function databaseName() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  const parsed = new URL(DATABASE_URL);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^smart_mandi_test_g3_[A-Za-z0-9_]+$/.test(name)) {
    throw new Error("DATABASE_URL must target a smart_mandi_test_g3_* database");
  }
  return name;
}

function cookiePairs(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  }
  const combined = response.headers.get("set-cookie");
  return combined
    ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/).map((value) => value.split(";", 1)[0])
    : [];
}

function cookieValue(pairs, prefix) {
  return pairs.find((pair) => pair.startsWith(`${prefix}=`)) || "";
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(new URL(path, BASE_URL), { ...options, headers });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${options.method || "GET"} ${path} returned non-JSON`);
    }
  }
  return { response, data };
}

async function login(username) {
  const csrf = await requestJson("/api/auth/csrf");
  assert.equal(csrf.response.status, 200);
  const csrfCookie = cookieValue(cookiePairs(csrf.response), "authjs.csrf-token");
  assert.ok(csrfCookie, "CSRF cookie must be set");

  const callback = await fetch(new URL("/api/auth/callback/credentials", BASE_URL), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookie,
    },
    body: new URLSearchParams({
      csrfToken: csrf.data.csrfToken,
      callbackUrl: BASE_URL,
      identifier: username,
      password: PASSWORD,
    }),
  });
  assert.ok([200, 302, 303].includes(callback.status));

  const sessionCookie = cookiePairs(callback)
    .filter((pair) => /(?:^|__Secure-|__Host-)authjs\.session-token/.test(pair))
    .join("; ");
  assert.ok(sessionCookie, "Credentials callback must set a session cookie");
  return sessionCookie;
}

async function assertDatabase(client, expectedName) {
  const result = await client.query("SELECT current_database() AS database_name");
  assert.equal(result.rows[0].database_name, expectedName);
}

async function expectStatus(name, result, status) {
  assert.equal(
    result.response.status,
    status,
    `${name}: expected ${status}, received ${result.response.status}: ${JSON.stringify(result.data)}`,
  );
  console.log(`PASS ${name}`);
}

async function createSale(cookie, buyerId, allocations) {
  const result = await requestJson("/api/sales", {
    method: "POST",
    cookie,
    body: JSON.stringify({ buyerId: String(buyerId), allocations }),
  });
  return result;
}

async function main() {
  const [assertModule, bcryptModule, pgModule] = await Promise.all([
    import("node:assert/strict"),
    import("bcryptjs"),
    import("pg"),
  ]);
  assert = assertModule.default;
  bcrypt = bcryptModule.default;
  Client = pgModule.Client;

  const expectedDatabase = databaseName();
  const client = new Client({ connectionString: DATABASE_URL });
  let connected = false;
  let fixture;
  const saleIds = [];
  let paidSaleId;
  let paidLotId;
  let paidDemandId;

  try {
    await client.connect();
    connected = true;
    await assertDatabase(client, expectedDatabase);

    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const users = {};
    for (const [key, username, fullName, email, role] of [
      ["farmerA", FARMER_A_USERNAME, "G3 Farmer A", `${FARMER_A_USERNAME}@example.test`, "FARMER"],
      ["farmerB", FARMER_B_USERNAME, "G3 Farmer B", `${FARMER_B_USERNAME}@example.test`, "FARMER"],
      ["buyerA", BUYER_A_USERNAME, "G3 Buyer A", `${BUYER_A_USERNAME}@example.test`, "BUYER"],
      ["buyerB", BUYER_B_USERNAME, "G3 Buyer B", `${BUYER_B_USERNAME}@example.test`, "BUYER"],
    ]) {
      const result = await client.query(
        `INSERT INTO users (username, password_hash, full_name, email, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING user_id`,
        [username, passwordHash, fullName, email, role],
      );
      users[key] = result.rows[0].user_id;
    }

    const farmerA = await client.query(
      "INSERT INTO farmers (user_id) VALUES ($1) RETURNING farmer_id",
      [users.farmerA],
    );
    const farmerB = await client.query(
      "INSERT INTO farmers (user_id) VALUES ($1) RETURNING farmer_id",
      [users.farmerB],
    );
    const buyerA = await client.query(
      "INSERT INTO buyers (user_id, business_name, contact_person, address) VALUES ($1, 'G3 Buyer A Business', 'G3 Buyer A', '') RETURNING buyer_id",
      [users.buyerA],
    );
    const buyerB = await client.query(
      "INSERT INTO buyers (user_id, business_name, contact_person, address) VALUES ($1, 'G3 Buyer B Business', 'G3 Buyer B', '') RETURNING buyer_id",
      [users.buyerB],
    );
    const farmA = await client.query(
      "INSERT INTO farms (farmer_id, farm_name) VALUES ($1, 'G3 Farm A') RETURNING farm_id",
      [farmerA.rows[0].farmer_id],
    );
    const farmB = await client.query(
      "INSERT INTO farms (farmer_id, farm_name) VALUES ($1, 'G3 Farm B') RETURNING farm_id",
      [farmerB.rows[0].farmer_id],
    );
    const crop = await client.query("SELECT crop_id FROM crops ORDER BY crop_id LIMIT 1");
    assert.equal(crop.rowCount, 1, "The isolated database must contain a crop");

    const lots = {};
    for (const [key, farmId] of [
      ["lotA1", farmA.rows[0].farm_id],
      ["lotA2", farmA.rows[0].farm_id],
      ["lotB", farmB.rows[0].farm_id],
    ]) {
      const result = await client.query(
        `INSERT INTO produce_lots
           (farm_id, crop_id, harvest_date, initial_quantity, available_quantity, unit, grade)
         VALUES ($1, $2, CURRENT_DATE, 10, 10, 'kg', 'A')
         RETURNING lot_id`,
        [farmId, crop.rows[0].crop_id],
      );
      lots[key] = result.rows[0].lot_id;
    }

    const demands = {};
    for (const [key, buyerId] of [
      ["demandA1", buyerA.rows[0].buyer_id],
      ["demandA2", buyerA.rows[0].buyer_id],
      ["demandB", buyerB.rows[0].buyer_id],
    ]) {
      const result = await client.query(
        `INSERT INTO buyer_demands
           (buyer_id, crop_id, required_quantity, remaining_quantity,
            minimum_grade, maximum_price, location)
         VALUES ($1, $2, 10, 10, 'B', 30, 'G3 test')
         RETURNING demand_id`,
        [buyerId, crop.rows[0].crop_id],
      );
      demands[key] = result.rows[0].demand_id;
    }

    fixture = {
      userIds: Object.values(users),
      farmerA: farmerA.rows[0].farmer_id,
      farmerB: farmerB.rows[0].farmer_id,
      buyerA: buyerA.rows[0].buyer_id,
      buyerB: buyerB.rows[0].buyer_id,
      farmA: farmA.rows[0].farm_id,
      farmB: farmB.rows[0].farm_id,
      lots,
      demands,
    };
    await client.query("COMMIT");

    await expectStatus(
      "Unauthenticated sale creation is rejected",
      await requestJson("/api/sales", {
        method: "POST",
        body: JSON.stringify({ buyerId: fixture.buyerA, allocations: [] }),
      }),
      401,
    );

    const farmerACookie = await login(FARMER_A_USERNAME);
    const farmerBCookie = await login(FARMER_B_USERNAME);
    const buyerACookie = await login(BUYER_A_USERNAME);
    const buyerBCookie = await login(BUYER_B_USERNAME);

    const salesOptions = await requestJson("/api/farmer/sales/options", {
      cookie: farmerACookie,
    });
    await expectStatus("Farmer can load sale options", salesOptions, 200);
    assert.ok(
      salesOptions.data.buyers.some((buyer) => buyer.id === String(fixture.buyerA)),
      "Sale options must include active buyers",
    );
    assert.ok(
      salesOptions.data.demands.some((demand) => demand.id === String(fixture.demands.demandA1)),
      "Sale options must include eligible open demands",
    );
    console.log("PASS sale options include only farmer-usable reference data");
    await expectStatus(
      "Buyer cannot load farmer sale options",
      await requestJson("/api/farmer/sales/options", { cookie: buyerACookie }),
      403,
    );

    await expectStatus(
      "Empty allocation list is rejected",
      await createSale(farmerACookie, fixture.buyerA, []),
      400,
    );

    await client.query("UPDATE buyers SET status = 'INACTIVE' WHERE buyer_id = $1", [fixture.buyerB]);
    const inactiveBuyer = await createSale(farmerACookie, fixture.buyerB, [{
      lotId: fixture.lots.lotA1,
      demandId: fixture.demands.demandB,
      quantity: "1.000",
      pricePerUnit: "25.00",
    }]);
    await expectStatus("Inactive buyer cannot be selected", inactiveBuyer, 400);
    await client.query("UPDATE buyers SET status = 'ACTIVE' WHERE buyer_id = $1", [fixture.buyerB]);

    const farmerBSale = await createSale(farmerBCookie, fixture.buyerB, [{
      lotId: fixture.lots.lotB,
      demandId: fixture.demands.demandB,
      quantity: "1.000",
      pricePerUnit: "25.00",
    }]);
    await expectStatus("Farmer B creates a sale", farmerBSale, 201);
    saleIds.push(farmerBSale.data.id);

    await expectStatus(
      "Farmer A cannot view Farmer B sale",
      await requestJson(`/api/sales/${farmerBSale.data.id}`, { cookie: farmerACookie }),
      404,
    );
    await expectStatus(
      "Farmer A cannot cancel Farmer B sale",
      await requestJson(`/api/sales/${farmerBSale.data.id}/cancel`, {
        method: "POST",
        cookie: farmerACookie,
      }),
      404,
    );
    const buyerBList = await requestJson("/api/sales", { cookie: buyerBCookie });
    await expectStatus("Buyer B can list own sales", buyerBList, 200);
    assert.ok(buyerBList.data.sales.some((sale) => sale.id === farmerBSale.data.id));
    console.log("PASS Buyer B listing contains own sale");
    await expectStatus(
      "Buyer B can view own sale",
      await requestJson(`/api/sales/${farmerBSale.data.id}`, { cookie: buyerBCookie }),
      200,
    );
    await expectStatus(
      "Buyer A cannot view Buyer B sale",
      await requestJson(`/api/sales/${farmerBSale.data.id}`, { cookie: buyerACookie }),
      404,
    );
    await expectStatus(
      "Farmer B can cancel own sale with empty body",
      await requestJson(`/api/sales/${farmerBSale.data.id}/cancel`, {
        method: "POST",
        cookie: farmerBCookie,
      }),
      200,
    );

    const twoItemSale = await createSale(farmerACookie, fixture.buyerA, [
      {
        lotId: fixture.lots.lotA1,
        demandId: fixture.demands.demandA1,
        quantity: "2.000",
        pricePerUnit: "25.00",
      },
      {
        lotId: fixture.lots.lotA2,
        demandId: fixture.demands.demandA2,
        quantity: "3.000",
        pricePerUnit: "20.00",
      },
    ]);
    await expectStatus("Successful two-item sale", twoItemSale, 201);
    saleIds.push(twoItemSale.data.id);
    assert.equal(twoItemSale.data.saleItemIds.length, 2);
    const twoItemState = await client.query(
      `SELECT
         (SELECT available_quantity FROM produce_lots WHERE lot_id = $1) AS lot_one,
         (SELECT available_quantity FROM produce_lots WHERE lot_id = $2) AS lot_two,
         (SELECT remaining_quantity FROM buyer_demands WHERE demand_id = $3) AS demand_one,
         (SELECT remaining_quantity FROM buyer_demands WHERE demand_id = $4) AS demand_two,
         (SELECT total_amount FROM sales WHERE sale_id = $5) AS total_amount`,
      [
        fixture.lots.lotA1,
        fixture.lots.lotA2,
        fixture.demands.demandA1,
        fixture.demands.demandA2,
        twoItemSale.data.id,
      ],
    );
    assert.equal(String(twoItemState.rows[0].lot_one), "8.000");
    assert.equal(String(twoItemState.rows[0].lot_two), "7.000");
    assert.equal(String(twoItemState.rows[0].demand_one), "8.000");
    assert.equal(String(twoItemState.rows[0].demand_two), "7.000");
    assert.equal(String(twoItemState.rows[0].total_amount), "110.00");
    console.log("PASS both lots, demands, and sale total updated");

    const buyerAList = await requestJson("/api/sales", { cookie: buyerACookie });
    await expectStatus("Buyer A can list own sales", buyerAList, 200);
    assert.ok(buyerAList.data.sales.some((sale) => sale.id === twoItemSale.data.id));
    console.log("PASS Buyer A listing contains own sale");
    const buyerADetail = await requestJson(`/api/sales/${twoItemSale.data.id}`, { cookie: buyerACookie });
    await expectStatus("Buyer A can view own sale", buyerADetail, 200);
    assert.equal(buyerADetail.data.items.length, 2);
    console.log("PASS Buyer A sees both sale items");

    const beforeRollback = await client.query(
      `SELECT
         (SELECT available_quantity FROM produce_lots WHERE lot_id = $1) AS inventory,
         (SELECT remaining_quantity FROM buyer_demands WHERE demand_id = $2) AS demand,
         (SELECT COUNT(*) FROM sales WHERE farmer_id = $3) AS sales_count`,
      [fixture.lots.lotA1, fixture.demands.demandA1, fixture.farmerA],
    );
    const rollbackAttempt = await createSale(farmerACookie, fixture.buyerA, [
      {
        lotId: fixture.lots.lotA1,
        demandId: fixture.demands.demandA1,
        quantity: "2.000",
        pricePerUnit: "25.00",
      },
      {
        lotId: fixture.lots.lotA1,
        demandId: fixture.demands.demandA1,
        quantity: "9.000",
        pricePerUnit: "25.00",
      },
    ]);
    await expectStatus("Failed second item returns conflict", rollbackAttempt, 409);
    assert.equal(rollbackAttempt.data.message, "Allocation conflicts with available inventory");
    const afterRollback = await client.query(
      `SELECT
         (SELECT available_quantity FROM produce_lots WHERE lot_id = $1) AS inventory,
         (SELECT remaining_quantity FROM buyer_demands WHERE demand_id = $2) AS demand,
         (SELECT COUNT(*) FROM sales WHERE farmer_id = $3) AS sales_count`,
      [fixture.lots.lotA1, fixture.demands.demandA1, fixture.farmerA],
    );
    assert.deepEqual(afterRollback.rows[0], beforeRollback.rows[0]);
    console.log("PASS failed second item rolls back sale and first allocation");

    const safeConflict = await createSale(farmerACookie, fixture.buyerA, [{
      lotId: fixture.lots.lotA1,
      demandId: fixture.demands.demandA1,
      quantity: "100.000",
      pricePerUnit: "25.00",
    }]);
    await expectStatus("Known SQL conflict returns 409", safeConflict, 409);
    assert.equal(safeConflict.data.message, "Allocation conflicts with available inventory");
    assert.ok(!JSON.stringify(safeConflict.data).includes("Available:"));
    console.log("PASS known SQL conflict is client-safe");

    await expectStatus(
      "Malformed cancellation JSON returns 400",
      await requestJson(`/api/sales/${twoItemSale.data.id}/cancel`, {
        method: "POST",
        cookie: farmerACookie,
        body: "{",
      }),
      400,
    );
    await expectStatus(
      "Empty-body cancellation works",
      await requestJson(`/api/sales/${twoItemSale.data.id}/cancel`, {
        method: "POST",
        cookie: farmerACookie,
      }),
      200,
    );

    const paidSale = await createSale(farmerACookie, fixture.buyerA, [{
      lotId: fixture.lots.lotA1,
      demandId: fixture.demands.demandA1,
      quantity: "1.000",
      pricePerUnit: "25.00",
    }]);
    await expectStatus("Paid-sale fixture creation", paidSale, 201);
    saleIds.push(paidSale.data.id);
    paidSaleId = paidSale.data.id;
    paidLotId = fixture.lots.lotA1;
    paidDemandId = fixture.demands.demandA1;
    await client.query(
      "INSERT INTO payments (sale_id, amount, status) VALUES ($1, 25, 'SUCCESS')",
      [paidSaleId],
    );
    const paidCancellation = await requestJson(`/api/sales/${paidSaleId}/cancel`, {
      method: "POST",
      cookie: farmerACookie,
      body: JSON.stringify({ reason: "Paid test" }),
    });
    await expectStatus("Paid sale cannot be cancelled through API", paidCancellation, 409);
    assert.equal(paidCancellation.data.message, "Paid sale cannot be cancelled until refund processing");
    assert.ok(!JSON.stringify(paidCancellation.data).includes("Successful payment exists"));
    console.log("PASS paid-sale API error is client-safe");

    const concurrentRequests = await Promise.all([
      createSale(farmerACookie, fixture.buyerA, [{
        lotId: fixture.lots.lotA2,
        demandId: fixture.demands.demandA2,
        quantity: "6.000",
        pricePerUnit: "25.00",
      }]),
      createSale(farmerACookie, fixture.buyerA, [{
        lotId: fixture.lots.lotA2,
        demandId: fixture.demands.demandA2,
        quantity: "6.000",
        pricePerUnit: "25.00",
      }]),
    ]);
    const concurrentSuccesses = concurrentRequests.filter((result) => result.response.status === 201);
    const concurrentConflicts = concurrentRequests.filter((result) => result.response.status === 409);
    for (const result of concurrentSuccesses) saleIds.push(result.data.id);
    assert.equal(concurrentSuccesses.length, 1, "Only one request may allocate six units");
    assert.equal(concurrentConflicts.length, 1);
    assert.equal(concurrentConflicts[0].data.message, "Allocation conflicts with available inventory");
    const concurrentState = await client.query(
      `SELECT
         (SELECT available_quantity FROM produce_lots WHERE lot_id = $1) AS inventory,
         (SELECT remaining_quantity FROM buyer_demands WHERE demand_id = $2) AS demand`,
      [fixture.lots.lotA2, fixture.demands.demandA2],
    );
    assert.equal(String(concurrentState.rows[0].inventory), "4.000");
    assert.equal(String(concurrentState.rows[0].demand), "4.000");
    console.log("PASS concurrent API requests cannot oversell the same lot");
  } finally {
    if (connected) {
      await assertDatabase(client, expectedDatabase);
      if (fixture) {
        await client.query("BEGIN");
        if (paidSaleId) {
          await client.query(
            `UPDATE produce_lots
             SET available_quantity = available_quantity + 1,
                 status = CASE WHEN available_quantity + 1 >= initial_quantity THEN 'AVAILABLE' ELSE 'PARTIALLY_SOLD' END
             WHERE lot_id = $1`,
            [paidLotId],
          );
          await client.query(
            `UPDATE buyer_demands
             SET remaining_quantity = remaining_quantity + 1,
                 status = CASE WHEN remaining_quantity + 1 >= required_quantity THEN 'OPEN' ELSE 'PARTIALLY_FULFILLED' END
             WHERE demand_id = $1`,
            [paidDemandId],
          );
          await client.query("DELETE FROM payments WHERE sale_id = $1", [paidSaleId]);
        }
        await client.query("ALTER TABLE sale_items DISABLE TRIGGER trg_immutable_sale_item");
        if (saleIds.length) {
          await client.query("DELETE FROM sale_items WHERE sale_id = ANY($1::bigint[])", [saleIds]);
          await client.query("DELETE FROM sales WHERE sale_id = ANY($1::bigint[])", [saleIds]);
        }
        await client.query("DELETE FROM buyer_demands WHERE demand_id = ANY($1::bigint[])", [[
          fixture.demands.demandA1,
          fixture.demands.demandA2,
          fixture.demands.demandB,
        ]]);
        await client.query("DELETE FROM produce_lots WHERE lot_id = ANY($1::bigint[])", [[
          fixture.lots.lotA1,
          fixture.lots.lotA2,
          fixture.lots.lotB,
        ]]);
        await client.query("DELETE FROM farms WHERE farm_id = ANY($1::bigint[])", [[fixture.farmA, fixture.farmB]]);
        await client.query("DELETE FROM farmers WHERE farmer_id = ANY($1::bigint[])", [[fixture.farmerA, fixture.farmerB]]);
        await client.query("DELETE FROM buyers WHERE buyer_id = ANY($1::bigint[])", [[fixture.buyerA, fixture.buyerB]]);
        await client.query("DELETE FROM users WHERE user_id = ANY($1::bigint[])", [fixture.userIds]);
        await client.query("ALTER TABLE sale_items ENABLE TRIGGER trg_immutable_sale_item");
        await client.query("COMMIT");
        await assertDatabase(client, expectedDatabase);
        console.log("PASS isolated fixture cleanup and trigger restoration");
      }
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error(`Sales API integration test failed: ${error.message}`);
  process.exitCode = 1;
});
