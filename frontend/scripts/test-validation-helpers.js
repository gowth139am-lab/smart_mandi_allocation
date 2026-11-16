async function main() {
  const [assertModule, fs, path, ts, vm] = await Promise.all([
    import("node:assert/strict"),
    import("node:fs"),
    import("node:path"),
    import("typescript"),
    import("node:vm"),
  ]);
  const source = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "validators", "database.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, module: { exports } });
  const { parseDateOnly, parsePostgresNumeric, parsePositiveBigintId } = exports;
  const assert = assertModule.strict;

  assert.equal(parsePositiveBigintId("1"), "1");
  assert.equal(parsePositiveBigintId("9223372036854775807"), "9223372036854775807");
  for (const value of ["", "0", "-1", "01", "1.0", "9223372036854775808", "1".repeat(20)]) {
    assert.equal(parsePositiveBigintId(value), null, `invalid BIGINT ID ${value}`);
  }
  assert.equal(parsePositiveBigintId(Number.MAX_SAFE_INTEGER + 1), null);

  for (const value of ["2024-02-29", "2026-04-30", "2000-02-29"]) {
    assert.equal(parseDateOnly(value), value);
  }
  for (const value of [
    "2026-02-31",
    "2026-04-31",
    "1900-02-29",
    "2026-13-01",
    "0000-01-01",
    "2026-01-01T00:00:00Z",
    "01/02/2026",
  ]) {
    assert.equal(parseDateOnly(value), null, `invalid date ${value}`);
  }

  assert.equal(parsePostgresNumeric("999999999.999", 12, 3, true), "999999999.999");
  assert.equal(parsePostgresNumeric("0.001", 12, 3, true), "0.001");
  assert.equal(parsePostgresNumeric("0001.20", 12, 3, true), "1.20");
  for (const value of ["0", "-1", "1000000000", "1.0001", "1e2", "Infinity", "NaN"]) {
    assert.equal(parsePostgresNumeric(value, 12, 3, true), null, `invalid quantity ${value}`);
  }

  assert.equal(parsePostgresNumeric("9999999999.99", 12, 2, false), "9999999999.99");
  assert.equal(parsePostgresNumeric("0", 12, 2, false), "0");
  for (const value of ["10000000000", "1.001", "-0.01", "1e2"]) {
    assert.equal(parsePostgresNumeric(value, 12, 2, false), null, `invalid price ${value}`);
  }
  assert.equal(parsePostgresNumeric(Number.POSITIVE_INFINITY, 12, 2, false), null);

  console.log("Passed date-only, PostgreSQL NUMERIC, and BIGINT validator tests.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
