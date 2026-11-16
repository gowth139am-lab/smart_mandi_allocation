# MongoDB Module - Smart Mandi Allocation

## 1. Purpose

MongoDB stores flexible crop quality observations for produce lots.

PostgreSQL remains the primary relational database for farmers,
buyers, crops, produce lots, inventory and sales.

## 2. Database

Database name: smart_mandi_nosql

Collection: quality_observations

## 3. Document structure

{
  "lot_id": 1,
  "crop_id": 1,
  "inspection_date": "Date",
  "inspector": "Inspector name",
  "inspector_id": 1,
  "measurements": {
    "firmness": "Good",
    "ripeness": "Ripe",
    "bruising": "Low",
    "colour": "Red"
  },
  "assessed_grade": "A",
}

## 4. Indexes

- lot_id + inspection_date
- crop_id + inspection_date
- assessed_grade

## 5. APIs

GET /api/health/mongodb
Checks MongoDB connectivity.

GET /api/quality-observations
Retrieves quality observations.

GET /api/quality-observations?lot_id=1
Retrieves observations for a specific lot.

POST /api/quality-observations
Creates a quality observation.

GET /api/reports/quality
Generates a crop quality aggregation report.

## 6. MongoDB concepts demonstrated

- Flexible document structure
- JSON schema validation
- Collection indexes
- CRUD operations
- Aggregation pipeline
- Grouping and sorting
- Distinct lot counting

## 7. Testing

The following checks are available:

- MongoDB connection health API
- Collection creation
- Index creation
- Quality observation insertion
- Quality observation retrieval
- Invalid input rejection (HTTP 400)
- Quality aggregation
- Production build

## 8. Integration note

The lot_id and crop_id fields are logical references to
PostgreSQL records. Cross-database validation must be
performed by the API before an observation is stored.
