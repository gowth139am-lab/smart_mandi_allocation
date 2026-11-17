# Relational schema summary

Source of truth: `database/postgresql/01_core_tables.sql` through `08_sale_cancellation.sql`.

| Relation | Primary key | Foreign keys / notable constraints |
|---|---|---|
| users | `user_id` | Unique `username`, `email`; role and status checks |
| user_phones | (`user_id`, `phone_number`) | `user_id` → users |
| farmers | `farmer_id` | Unique `user_id` → users |
| buyers | `buyer_id` | Unique `user_id` → users; buyer status check |
| farms | `farm_id` | `farmer_id` → farmers; positive nullable area check |
| crops | `crop_id` | Unique crop name; nonnegative storage-days check |
| crop_varieties | `variety_id` | `crop_id` → crops; unique (`crop_id`, `variety_name`); unique (`variety_id`, `crop_id`) supports composite reference |
| produce_lots | `lot_id` | `farm_id` → farms, `crop_id` → crops, composite (`variety_id`, `crop_id`) → crop_varieties; quantity, status, and expiry checks |
| markets | `market_id` | Market status check |
| market_crops | (`market_id`, `crop_id`) | Both columns reference parent tables; associative M:N relation |
| price_records | `price_record_id` | Composite (`market_id`, `crop_id`) → market_crops; nonnegative and ordered price checks |
| buyer_demands | `demand_id` | `buyer_id` → buyers, `crop_id` → crops; quantity, status, and price checks |
| sales | `sale_id` | Farmer, buyer, optional market references; status/payment checks |
| sale_items | `sale_item_id` | Sale, lot, optional demand references; positive quantity, nonnegative unit price; generated subtotal |
| payments | `payment_id` | `sale_id` → sales; positive amount, unique transaction reference, status check |
| deliveries | `delivery_id` | Unique `sale_id` → sales enforces at most one delivery per sale |

`market_crops` and `user_phones` use composite primary keys. The DDL's foreign keys use PostgreSQL's default delete/update actions; cascading deletion is not declared. The market price table does not declare uniqueness on (`market_id`, `crop_id`, `price_date`), so duplicate prevention is not a schema constraint in these files.

Views in `04_indexes_views.sql`: `available_produce_view`, `buyer_open_demands_view`, `market_price_comparison_view`, and `sale_summary_view`. The allocation and cancellation functions and triggers are in `05_allocation_engine.sql`, `06_allocation_function.sql`, and `08_sale_cancellation.sql`.
