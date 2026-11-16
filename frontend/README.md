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
$env:DATABASE_URL = "<PostgreSQL connection string>"
$env:MONGODB_URI = "<MongoDB connection string>"
$env:MONGODB_DB = "smart_mandi_nosql"
$env:TEST_FARMER_COOKIE = "authjs.session-token=<farmer-session-token>"
$env:TEST_OTHER_FARMER_COOKIE = "authjs.session-token=<second-farmer-session-token>"
$env:TEST_BUYER_COOKIE = "authjs.session-token=<buyer-session-token>"
$env:TEST_ADMIN_COOKIE = "authjs.session-token=<admin-session-token>"
$env:TEST_FARMER_USER_ID = "<farmer users.user_id>"
$env:TEST_OTHER_FARMER_USER_ID = "<different farmer users.user_id>"
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
