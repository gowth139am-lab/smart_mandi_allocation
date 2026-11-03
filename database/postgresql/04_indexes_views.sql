
BEGIN;

-- ==========================================
-- PART A: INDEXES
-- ==========================================

-- 1. Find farms belonging to a farmer
CREATE INDEX IF NOT EXISTS idx_farms_farmer
ON farms(farmer_id);


-- 2. Search available produce by crop
CREATE INDEX IF NOT EXISTS idx_available_produce_crop
ON produce_lots(crop_id, available_quantity)
WHERE available_quantity > 0;


-- 3. Search buyer demands by crop and status
CREATE INDEX IF NOT EXISTS idx_buyer_demands_crop_status
ON buyer_demands(crop_id, status)
WHERE remaining_quantity > 0;


-- 4. Compare market prices by crop and date
CREATE INDEX IF NOT EXISTS idx_price_crop_date
ON price_records(crop_id, price_date DESC);


-- 5. Retrieve farmer sales by date
CREATE INDEX IF NOT EXISTS idx_sales_farmer_date
ON sales(farmer_id, sale_date DESC);


-- 6. Retrieve buyer sales by date
CREATE INDEX IF NOT EXISTS idx_sales_buyer_date
ON sales(buyer_id, sale_date DESC);


-- 7. Find sale items belonging to a sale
CREATE INDEX IF NOT EXISTS idx_sale_items_sale
ON sale_items(sale_id);


-- 8. Find payments belonging to a sale
CREATE INDEX IF NOT EXISTS idx_payments_sale
ON payments(sale_id);


-- ==========================================
-- PART B: VIEWS
-- ==========================================

-- 1. Available produce view
-- Combines produce, crop, farm and farmer details.

CREATE OR REPLACE VIEW available_produce_view AS
SELECT
    pl.lot_id,
    c.crop_name,
    cv.variety_name,
    f.farm_name,
    u.full_name AS farmer_name,
    pl.harvest_date,
    pl.expiry_date,
    pl.initial_quantity,
    pl.available_quantity,
    pl.unit,
    pl.grade,
    pl.status
FROM produce_lots pl
JOIN crops c
    ON pl.crop_id = c.crop_id
LEFT JOIN crop_varieties cv
    ON pl.variety_id = cv.variety_id
    AND pl.crop_id = cv.crop_id
JOIN farms f
    ON pl.farm_id = f.farm_id
JOIN farmers fr
    ON f.farmer_id = fr.farmer_id
JOIN users u
    ON fr.user_id = u.user_id
WHERE pl.available_quantity > 0
AND pl.status IN ('AVAILABLE', 'PARTIALLY_SOLD')
AND (pl.expiry_date IS NULL OR pl.expiry_date >= CURRENT_DATE);


-- 2. Open buyer demands view
-- Displays buyers who still have unfulfilled demand.

CREATE OR REPLACE VIEW buyer_open_demands_view AS
SELECT
    d.demand_id,
    u.full_name AS buyer_contact,
    b.business_name,
    c.crop_name,
    d.required_quantity,
    d.remaining_quantity,
    d.minimum_grade,
    d.maximum_price,
    d.required_date,
    d.location,
    d.status
FROM buyer_demands d
JOIN buyers b
    ON d.buyer_id = b.buyer_id
JOIN users u
    ON b.user_id = u.user_id
JOIN crops c
    ON d.crop_id = c.crop_id
WHERE d.remaining_quantity > 0
AND d.status IN ('OPEN', 'PARTIALLY_FULFILLED');


-- 3. Market price comparison view
-- Displays crop prices across different markets.

CREATE OR REPLACE VIEW market_price_comparison_view AS
SELECT
    m.market_id,
    m.market_name,
    c.crop_id,
    c.crop_name,
    p.price_date,
    p.min_price,
    p.max_price,
    p.modal_price,
    p.arrival_quantity,
    p.unit,
    p.source
FROM price_records p
JOIN markets m
    ON p.market_id = m.market_id
JOIN crops c
    ON p.crop_id = c.crop_id;


-- 4. Sale summary view
-- Combines sale details with its item quantities.

CREATE OR REPLACE VIEW sale_summary_view AS
SELECT
    s.sale_id,
    s.sale_date,
    s.farmer_id,
    s.buyer_id,
    s.sale_status,
    s.payment_status,
    s.total_amount,
    COUNT(si.sale_item_id) AS total_items,
    COALESCE(SUM(si.quantity), 0) AS total_quantity
FROM sales s
LEFT JOIN sale_items si
    ON s.sale_id = si.sale_id
GROUP BY
    s.sale_id,
    s.sale_date,
    s.farmer_id,
    s.buyer_id,
    s.sale_status,
    s.payment_status,
    s.total_amount;

COMMIT;

