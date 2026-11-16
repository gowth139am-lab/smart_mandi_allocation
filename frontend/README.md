# Smart Mandi frontend

This is the existing Next.js application for Smart Mandi Allocation System.
See the repository [README](../README.md) for PostgreSQL, MongoDB, environment,
demo-user, and validation instructions.

Common commands:

```powershell
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

The MongoDB API integration tests require a running app, PostgreSQL and
MongoDB, plus cookie values from active farmer, second-farmer, buyer, and admin
sessions. The test queries PostgreSQL before making API requests to verify that
the configured users are different farmer profiles, that each configured lot
actually belongs to the expected farmer, and that each crop ID matches its lot.
It also verifies the mismatch crop exists. Configure these values in the same
PowerShell session before running the test:

```powershell
$env:DATABASE_URL = "postgresql://<user>:<password>@localhost:5432/smart_mandi_test_quality"
$env:MONGODB_URI = "<MongoDB connection string>"
$env:MONGODB_DB = "smart_mandi_test_quality"
$env:TEST_FARMER_COOKIE = "authjs.session-token=<farmer-session-token>"
$env:TEST_OTHER_FARMER_COOKIE = "authjs.session-token=<second-farmer-session-token>"
$env:TEST_BUYER_COOKIE = "authjs.session-token=<buyer-session-token>"
$env:TEST_ADMIN_COOKIE = "authjs.session-token=<admin-session-token>"
$env:TEST_FARMER_USER_ID = "<farmer users.user_id>"
$env:TEST_OTHER_FARMER_USER_ID = "<different farmer users.user_id>"
$env:TEST_BUYER_USER_ID = "<buyer users.user_id>"
$env:TEST_ADMIN_USER_ID = "<admin users.user_id>"
$env:TEST_OWN_LOT_ID = "<lot owned by the first farmer>"
$env:TEST_OWN_CROP_ID = "<crop_id for that lot>"
$env:TEST_OTHER_LOT_ID = "<lot owned by the second farmer>"
$env:TEST_OTHER_CROP_ID = "<crop_id for the second farmer's lot>"
$env:TEST_MISMATCH_CROP_ID = "<positive crop ID different from TEST_OWN_CROP_ID>"
npm run test:mongodb
```

For secure cookies, use the actual cookie name and value shown by the browser
(often `__Secure-authjs.session-token`); provide only the cookie pair, not
other request headers. The API-test script verifies report results against
MongoDB observations aggregated for the PostgreSQL-verified farmer lot sets.
Admins may create observations for any valid lot as an explicit override;
farmers may create observations only for lots on farms they own.

The test inserts three persistent observations: one by each farmer on their
own lot, and one by the admin on the second farmer's lot to exercise the admin
override. It does not delete or reset MongoDB records. Use a disposable test
database and fixtures matching the configured IDs.

All integration scripts that can access or mutate database data reject a
PostgreSQL database name or MongoDB database name that does not start with
`smart_mandi_test_`. Never point them at `smart_mandi_db` or `smart_mandi_nosql`.
The MongoDB API test also adds and removes three temporary compatibility
observations in its disposable database.

PostgreSQL IDs use signed `BIGINT`, so quality-observation `lot_id`, `crop_id`,
and `inspector_id` are stored as BSON `Long` (signed 64-bit integer) and
serialized over the API as decimal strings. The collection validator continues
to accept existing numeric BSON `int`, `long`, and `double` observations.
MongoDB numeric comparisons and report filters include those legacy numeric
documents, while farmer lot scopes are built from exact PostgreSQL decimal
strings and converted to BSON `Long` without JavaScript `Number` conversion.

The farmer farm-management integration test also requires a running app,
PostgreSQL, and authenticated farmer, second-farmer, and buyer cookies. Set
`DATABASE_URL`, `TEST_FARMER_COOKIE`, `TEST_OTHER_FARMER_COOKIE`,
`TEST_BUYER_COOKIE`, and the fixture IDs below, then run:

```powershell
$env:TEST_FARMER_USER_ID = "<active farmer users.user_id>"
$env:TEST_OTHER_FARMER_USER_ID = "<different active farmer users.user_id>"
$env:TEST_OTHER_FARM_ID = "<farm owned by TEST_OTHER_FARMER_USER_ID>"
$env:TEST_CROP_ID = "<existing crop_id>"
npm run test:farmer-farms
```

For that script, set `DATABASE_URL` to a disposable database named
`smart_mandi_test_*`; successful runs insert one farm and one produce lot
permanently in that disposable database.

Before opening a PostgreSQL connection or making any mutating request, the
test sends each supplied cookie to the application's `/api/auth/session`
endpoint. It checks both farmer `user_id` values and roles against their
configured fixture IDs, and obtains the buyer `user_id` from that trusted
server-side session. It then verifies in PostgreSQL that the buyer profile and
user are active, along with the farmer and farm fixture relationships.
Incorrect, expired, or mismatched cookies fail the test before farm creation.

The test verifies these fixture relationships directly in PostgreSQL before
making requests. It inserts one farm and one produce lot for the first farmer
and does not delete or reset database records. Use a disposable database;
successful test runs leave both records in PostgreSQL.

The S3 validation helper tests are offline and do not access a database:

```powershell
npm run test:validation
```

The buyer/farmer API validation integration test requires a running app,
PostgreSQL, and two authenticated buyers and farmers. It verifies all session
cookie identities through `/api/auth/session` and checks demand/lot ownership
in PostgreSQL before running. Configure the cookies and fixtures below, then
run `npm run test:buyer-farmer-api`:

```powershell
$env:DATABASE_URL = "<PostgreSQL connection string>"
$env:TEST_BUYER_COOKIE = "authjs.session-token=<buyer-session-token>"
$env:TEST_OTHER_BUYER_COOKIE = "authjs.session-token=<second-buyer-session-token>"
$env:TEST_BUYER_USER_ID = "<first buyer users.user_id>"
$env:TEST_OTHER_BUYER_USER_ID = "<different buyer users.user_id>"
$env:TEST_OWN_DEMAND_ID = "<demand owned by the first buyer>"
$env:TEST_OTHER_DEMAND_ID = "<demand owned by the second buyer>"
$env:TEST_FARMER_COOKIE = "authjs.session-token=<farmer-session-token>"
$env:TEST_OTHER_FARMER_COOKIE = "authjs.session-token=<second-farmer-session-token>"
$env:TEST_FARMER_USER_ID = "<first farmer users.user_id>"
$env:TEST_OTHER_FARMER_USER_ID = "<different farmer users.user_id>"
$env:TEST_OWN_LOT_ID = "<lot owned by the first farmer>"
$env:TEST_OTHER_LOT_ID = "<lot owned by the second farmer>"
npm run test:buyer-farmer-api
```

This integration script verifies read/update/delete isolation, invalid and
missing IDs, invalid dates and NUMERIC values, and unauthenticated access. It
does not create, update, delete, or reset database records.

The Auth.js session integration test logs in as the dedicated
`auth_session_fixture` buyer through the real Auth.js CSRF and credentials
callback endpoints. It resolves that account's ID from PostgreSQL, verifies its
active buyer profile, and tests inactive-user, role-change,
missing-buyer-profile, and logout behavior. It temporarily changes only that
fixture and restores its original role, status, and buyer profile in `finally`
cleanup. The buyer fixture must have no dependent records preventing temporary
profile removal. Use only the isolated `smart_mandi_test_auth` database:

```powershell
$env:BASE_URL = "http://localhost:3000"
$env:DATABASE_URL = "postgresql://<user>:<password>@localhost:5432/smart_mandi_test_auth"
$env:TEST_SESSION_BUYER_USERNAME = "auth_session_fixture"
$secret = Read-Host "Test buyer password" -AsSecureString
$env:TEST_SESSION_BUYER_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
npm run test:auth-session
Remove-Item Env:\TEST_SESSION_BUYER_PASSWORD
```

`BASE_URL` defaults to `http://localhost:3000`. The test refuses databases
other than `smart_mandi_test_auth`, and refuses usernames other than the
dedicated fixture. The password is entered as a hidden PowerShell prompt and
kept only in the current process environment; do not put it in a script,
`.env` file committed to Git, or command-line argument.

The test checks the session endpoint response and independently inspects all
`Set-Cookie` headers for the configured Auth.js session-cookie name. For account
invalidation it reports whether the cookie was cleared, expired, or left
present; a `null` session response alone does not prove the browser cookie was
removed. Logout must set `Max-Age` to zero or less, or a past `Expires` value
for that cookie; an empty cookie value without expiration is reported but does
not pass the logout-clearance check. JWT logout clears the browser cookie, but
there is no server-side token-revocation record, so a separately copied JWT may
remain replayable until expiry if the account later becomes valid again.
