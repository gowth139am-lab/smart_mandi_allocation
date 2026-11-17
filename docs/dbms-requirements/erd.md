# Smart Mandi relational ER diagram

This diagram is based on the PostgreSQL DDL in `database/postgresql/01_core_tables.sql`, `02_inventory_market_demand.sql`, and `03_sales_payments_delivery.sql`. Quality observations are shown separately because they are MongoDB documents with logical references, not PostgreSQL foreign keys.

```mermaid
erDiagram
    USERS ||--o| FARMERS : profile
    USERS ||--o| BUYERS : profile
    USERS ||--o{ USER_PHONES : has
    FARMERS ||--o{ FARMS : owns
    FARMS ||--o{ PRODUCE_LOTS : yields
    CROPS ||--o{ CROP_VARIETIES : has
    CROPS ||--o{ PRODUCE_LOTS : classifies
    CROP_VARIETIES o|--o{ PRODUCE_LOTS : variety
    MARKETS ||--o{ MARKET_CROPS : lists
    CROPS ||--o{ MARKET_CROPS : traded_as
    MARKET_CROPS ||--o{ PRICE_RECORDS : priced
    BUYERS ||--o{ BUYER_DEMANDS : posts
    CROPS ||--o{ BUYER_DEMANDS : requested
    FARMERS ||--o{ SALES : sells
    BUYERS ||--o{ SALES : buys
    MARKETS o|--o{ SALES : transacted_at
    SALES ||--o{ SALE_ITEMS : contains
    PRODUCE_LOTS ||--o{ SALE_ITEMS : allocated_from
    BUYER_DEMANDS o|--o{ SALE_ITEMS : fulfills
    SALES ||--o{ PAYMENTS : paid_by
    SALES ||--o| DELIVERIES : delivered_by
```

MongoDB `quality_observations` documents contain `lot_id`, `crop_id`, and `inspector_id`; only the lot ownership and crop reference are checked against PostgreSQL by application code. Mongo does not enforce those cross-database references as foreign keys.
