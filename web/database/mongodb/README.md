# MongoDB Module - Smart Mandi Allocation

## 1. Purpose

MongoDB stores flexible crop quality observations for produce lots.

PostgreSQL remains the primary relational database for farmers,
buyers, crops, produce lots, inventory and sales.

## 2. Database

Database name: smart_mandi_db

Collection: quality_observations

## 3. Document structure

{
  "lotId": "TEST-LOT-001",
  "cropId": "CROP-TOMATO",
  "observedAt": "Date",
  "inspectorId": "INSPECTOR-001",
  "observationType": "QUALITY_CHECK",
  "attributes": {
    "firmness": "Good",
    "ripeness": "Ripe",
    "bruising": "Low",
    "colour": "Red"
  },
  "overallGrade": "A",
  "notes": "Development test observation"
}

## 4. Indexes

- lotId + observedAt
- cropId + observedAt
- inspectorId

## 5. APIs

GET /api/health/mongodb
Checks MongoDB connectivity.

GET /api/quality-observations
Retrieves quality observations.

GET /api/quality-observations?lotId=TEST-LOT-001
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

The following development checks have passed:

- MongoDB connection health API
- Collection creation
- Index creation
- Quality observation insertion
- Quality observation retrieval
- Invalid input rejection (HTTP 400)
- Quality aggregation
- Production build

## 8. Integration note

The lotId and cropId fields are logical references to
PostgreSQL records. Cross-database validation must be
integrated with the PostgreSQL module before final release.
