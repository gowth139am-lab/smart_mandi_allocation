# Smart Mandi Allocation System

DBMS Level 3 mini-project for farmer produce allocation using Next.js,
PostgreSQL, and MongoDB.

## Architecture

- `frontend/`: Next.js + TypeScript application and API routes.
- PostgreSQL database `smart_mandi_db`: users, roles, crops, inventory,
  demands, sales, payments, and delivery.
- MongoDB database `smart_mandi_nosql`, collection `quality_observations`:
  numeric `lot_id`/`crop_id`, `crop_name`, `inspection_date`, `inspector`,
  numeric `inspector_id`, `measurements`, and `assessed_grade`.

## Setup

1. Create PostgreSQL database `smart_mandi_db` and run the SQL files in order:
   `database/postgresql/01_core_tables.sql` through `08_sale_cancellation.sql`.
2. Optionally run `database/postgresql/07_sample_data.sql` for non-authentication
   demo records. It intentionally does not contain usable passwords.
3. Copy `frontend/.env.example` to `frontend/.env.local` and set
   `DATABASE_URL`, `MONGODB_URI`, `MONGODB_DB=smart_mandi_nosql`, and a long
   `AUTH_SECRET`. Never commit `.env.local`.
4. Install and start the app:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

5. To enable the sample users, choose a local password and run:

   ```powershell
   $env:DEMO_PASSWORD = "choose-a-local-password"
   npm run setup:demo-users
   ```

   This hashes the supplied password and updates only the `demo_*` users.

## Validation

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

After starting the app and configuring MongoDB:

```powershell
npm run setup:mongodb
npm run test:mongodb
```

The MongoDB API test requires an authenticated browser session for the
protected observation endpoints. Test registration/login first, then run it
with a session-aware API client if needed.

After initializing the isolated PostgreSQL audit database with sample data,
run the sale-item immutability regression test:

```powershell
psql -X -v ON_ERROR_STOP=1 -d smart_mandi_audit_db -f database/postgresql/tests/01_sale_items_immutability.sql
```
