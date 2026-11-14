const BASE_URL = "http://localhost:3000";

async function main() {
  console.log("\n1. Testing MongoDB health...");
  const health = await fetch(`${BASE_URL}/api/health/mongodb`);
  const healthData = await health.json();

  if (!health.ok || !healthData.success) {
    throw new Error("MongoDB health test failed");
  }
  console.log("PASSED");

  console.log("\n2. Testing valid observation insertion...");
  const post = await fetch(`${BASE_URL}/api/quality-observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lot_id: 1,
      crop_id: 1,
      inspector: "Admin Demo",
      inspector_id: null,
      measurements: {
        firmness: 3.8,
        ripeness: "Ripe",
        bruising_percentage: 2,
        colour: "Red"
      },
      assessed_grade: "A"
    })
  });

  const postData = await post.json();

  if (post.status !== 201 || !postData.success) {
    throw new Error(
      `Valid insertion failed. HTTP ${post.status}: ${JSON.stringify(postData)}`
    );
  }

  console.log("PASSED - ID:", postData.observationId);

  console.log("\n3. Testing observation retrieval...");
  const get = await fetch(
    `${BASE_URL}/api/quality-observations?lot_id=1`
  );
  const getData = await get.json();

  if (!get.ok || !getData.success || getData.count < 1) {
    throw new Error("Observation retrieval failed");
  }

  console.log("PASSED - Retrieved:", getData.count);

  console.log("\n4. Testing invalid input rejection...");
  const invalid = await fetch(`${BASE_URL}/api/quality-observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lot_id: 0,
      crop_id: 1,
      inspector: "Admin Demo",
      inspector_id: null,
      measurements: {},
      assessed_grade: "A"
    })
  });

  if (invalid.status !== 400) {
    throw new Error(
      `Expected HTTP 400, received ${invalid.status}`
    );
  }

  console.log("PASSED - Invalid input rejected");

  console.log("\n5. Testing quality report...");
  const report = await fetch(`${BASE_URL}/api/reports/quality`);
  const reportData = await report.json();

  if (!report.ok || !reportData.success) {
    throw new Error("Quality report test failed");
  }

  console.log("PASSED - Report groups:", reportData.totalGroups);

  console.log("\nALL FIVE MONGODB API TESTS PASSED!");
}

main().catch((error) => {
  console.error("\nTEST FAILED:", error.message);
  process.exitCode = 1;
});