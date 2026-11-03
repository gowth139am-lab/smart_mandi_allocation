
BEGIN;

-- 1. CREATE DEMO USERS

INSERT INTO users
(username, password_hash, full_name, email, role)
VALUES
('demo_farmer', 'DEMO_ONLY_NOT_A_REAL_HASH',
 'Ravi Kumar', 'ravi@example.test', 'FARMER'),

('demo_buyer_a', 'DEMO_ONLY_NOT_A_REAL_HASH',
 'Amit Sharma', 'amit@example.test', 'BUYER'),

('demo_buyer_b', 'DEMO_ONLY_NOT_A_REAL_HASH',
 'Suresh Kumar', 'suresh@example.test', 'BUYER')
ON CONFLICT (username) DO NOTHING;


-- 2. CREATE FARMER PROFILE

INSERT INTO farmers
(user_id, village, district, state, pin_code)
SELECT
    user_id, 'Dharwad Village', 'Dharwad',
    'Karnataka', '580001'
FROM users
WHERE username = 'demo_farmer'
ON CONFLICT (user_id) DO NOTHING;


-- 3. CREATE BUYER PROFILES

INSERT INTO buyers
(user_id, business_name, buyer_type, contact_person,
 address, district, state)
SELECT
    user_id, 'Amit Wholesale', 'WHOLESALER',
    'Amit Sharma', 'Dharwad', 'Dharwad', 'Karnataka'
FROM users
WHERE username = 'demo_buyer_a'
AND NOT EXISTS (
    SELECT 1 FROM buyers
    WHERE user_id = users.user_id
);

INSERT INTO buyers
(user_id, business_name, buyer_type, contact_person,
 address, district, state)
SELECT
    user_id, 'Suresh Retailers', 'RETAILER',
    'Suresh Kumar', 'Hubballi', 'Dharwad', 'Karnataka'
FROM users
WHERE username = 'demo_buyer_b'
AND NOT EXISTS (
    SELECT 1 FROM buyers
    WHERE user_id = users.user_id
);


-- 4. CREATE FARM

INSERT INTO farms
(farmer_id, farm_name, location, area_acres,
 soil_type, irrigation_type)
SELECT
    f.farmer_id, 'Ravi Demo Farm',
    'Dharwad', 5.00, 'Black Soil', 'Drip Irrigation'
FROM farmers f
JOIN users u ON u.user_id = f.user_id
WHERE u.username = 'demo_farmer'
AND NOT EXISTS (
    SELECT 1 FROM farms existing
    WHERE existing.farmer_id = f.farmer_id
    AND existing.farm_name = 'Ravi Demo Farm'
);


-- 5. CREATE CROP

INSERT INTO crops
(crop_name, category, unit, typical_storage_days)
VALUES
('Tomato', 'Vegetable', 'kg', 7)
ON CONFLICT (crop_name) DO NOTHING;


-- 6. CREATE MARKET

INSERT INTO markets
(market_name, market_type, district, state)
SELECT
    'Dharwad Demo Market', 'WHOLESALE',
    'Dharwad', 'Karnataka'
WHERE NOT EXISTS (
    SELECT 1 FROM markets
    WHERE market_name = 'Dharwad Demo Market'
);


-- 7. ASSOCIATE MARKET WITH CROP

INSERT INTO market_crops (market_id, crop_id)
SELECT m.market_id, c.crop_id
FROM markets m
CROSS JOIN crops c
WHERE m.market_name = 'Dharwad Demo Market'
AND c.crop_name = 'Tomato'
ON CONFLICT DO NOTHING;


-- 8. INSERT MARKET PRICE

INSERT INTO price_records
(market_id, crop_id, price_date,
 min_price, max_price, modal_price,
 arrival_quantity, unit, source)
SELECT
    mc.market_id, mc.crop_id, CURRENT_DATE,
    20, 30, 25, 1000, 'kg', 'DEMO DATA'
FROM market_crops mc
JOIN markets m ON m.market_id = mc.market_id
JOIN crops c ON c.crop_id = mc.crop_id
WHERE m.market_name = 'Dharwad Demo Market'
AND c.crop_name = 'Tomato'
AND NOT EXISTS (
    SELECT 1 FROM price_records p
    WHERE p.market_id = mc.market_id
    AND p.crop_id = mc.crop_id
    AND p.price_date = CURRENT_DATE
);


-- 9. CREATE PRODUCE LOT OF 500 KG

INSERT INTO produce_lots
(farm_id, crop_id, harvest_date,
 initial_quantity, available_quantity,
 unit, grade, status, expiry_date)
SELECT
    f.farm_id, c.crop_id, CURRENT_DATE,
    500, 500, 'kg', 'A',
    'AVAILABLE', CURRENT_DATE + 7
FROM farms f
JOIN farmers fr ON fr.farmer_id = f.farmer_id
JOIN users u ON u.user_id = fr.user_id
CROSS JOIN crops c
WHERE u.username = 'demo_farmer'
AND f.farm_name = 'Ravi Demo Farm'
AND c.crop_name = 'Tomato'
AND NOT EXISTS (
    SELECT 1 FROM produce_lots pl
    WHERE pl.farm_id = f.farm_id
    AND pl.crop_id = c.crop_id
    AND pl.harvest_date = CURRENT_DATE
    AND pl.grade = 'A'
);


-- 10. CREATE BUYER A DEMAND

INSERT INTO buyer_demands
(buyer_id, crop_id, required_quantity,
 remaining_quantity, minimum_grade,
 maximum_price, required_date, location)
SELECT
    b.buyer_id, c.crop_id, 400, 400,
    'B', 30, CURRENT_DATE + 3, 'Dharwad'
FROM buyers b
JOIN users u ON u.user_id = b.user_id
CROSS JOIN crops c
WHERE u.username = 'demo_buyer_a'
AND c.crop_name = 'Tomato'
AND NOT EXISTS (
    SELECT 1 FROM buyer_demands d
    WHERE d.buyer_id = b.buyer_id
    AND d.crop_id = c.crop_id
    AND d.required_quantity = 400
    AND d.status IN ('OPEN', 'PARTIALLY_FULFILLED')
);


-- 11. CREATE BUYER B DEMAND

INSERT INTO buyer_demands
(buyer_id, crop_id, required_quantity,
 remaining_quantity, minimum_grade,
 maximum_price, required_date, location)
SELECT
    b.buyer_id, c.crop_id, 300, 300,
    'B', 28, CURRENT_DATE + 3, 'Hubballi'
FROM buyers b
JOIN users u ON u.user_id = b.user_id
CROSS JOIN crops c
WHERE u.username = 'demo_buyer_b'
AND c.crop_name = 'Tomato'
AND NOT EXISTS (
    SELECT 1 FROM buyer_demands d
    WHERE d.buyer_id = b.buyer_id
    AND d.crop_id = c.crop_id
    AND d.required_quantity = 300
    AND d.status IN ('OPEN', 'PARTIALLY_FULFILLED')
);

COMMIT;

