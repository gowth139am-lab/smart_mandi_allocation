
BEGIN;

-- 1. PRODUCE_LOTS
-- Stores harvested produce from individual farms.

CREATE TABLE produce_lots (
    lot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    farm_id BIGINT NOT NULL
        REFERENCES farms(farm_id),

    crop_id BIGINT NOT NULL
        REFERENCES crops(crop_id),

    variety_id BIGINT,

    harvest_date DATE NOT NULL,

    initial_quantity NUMERIC(12,3) NOT NULL
        CHECK (initial_quantity > 0),

    available_quantity NUMERIC(12,3) NOT NULL
        CHECK (available_quantity >= 0),

    unit VARCHAR(30) NOT NULL,

    grade VARCHAR(20),

    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN (
            'AVAILABLE',
            'PARTIALLY_SOLD',
            'SOLD',
            'EXPIRED',
            'INACTIVE'
        )),

    expiry_date DATE,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CHECK (available_quantity <= initial_quantity),

    CHECK (
        expiry_date IS NULL
        OR expiry_date >= harvest_date
    ),

    FOREIGN KEY (variety_id, crop_id)
        REFERENCES crop_varieties(variety_id, crop_id)
);


-- 2. MARKETS
-- Stores agricultural market information.

CREATE TABLE markets (
    market_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    market_name VARCHAR(150) NOT NULL,

    market_type VARCHAR(50),

    address TEXT,

    district VARCHAR(100),

    state VARCHAR(100),

    latitude NUMERIC(10,7),

    longitude NUMERIC(10,7),

    contact_phone VARCHAR(20),

    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);


-- 3. MARKET_CROPS
-- Associative table connecting markets and crops.
-- Implements the M:N relationship.

CREATE TABLE market_crops (
    market_id BIGINT NOT NULL
        REFERENCES markets(market_id),

    crop_id BIGINT NOT NULL
        REFERENCES crops(crop_id),

    PRIMARY KEY (market_id, crop_id)
);


-- 4. PRICE_RECORDS
-- Stores daily crop prices for each agricultural market.

CREATE TABLE price_records (
    price_record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    market_id BIGINT NOT NULL,

    crop_id BIGINT NOT NULL,

    price_date DATE NOT NULL,

    min_price NUMERIC(12,2) NOT NULL
        CHECK (min_price >= 0),

    max_price NUMERIC(12,2) NOT NULL
        CHECK (max_price >= min_price),

    modal_price NUMERIC(12,2) NOT NULL,

    arrival_quantity NUMERIC(12,3)
        CHECK (arrival_quantity >= 0),

    unit VARCHAR(30),

    source VARCHAR(150),

    FOREIGN KEY (market_id, crop_id)
        REFERENCES market_crops(market_id, crop_id),

    CHECK (
        modal_price >= min_price
        AND modal_price <= max_price
    )
);


-- 5. BUYER_DEMANDS
-- Stores crop requirements posted by buyers.

CREATE TABLE buyer_demands (
    demand_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    buyer_id BIGINT NOT NULL
        REFERENCES buyers(buyer_id),

    crop_id BIGINT NOT NULL
        REFERENCES crops(crop_id),

    required_quantity NUMERIC(12,3) NOT NULL
        CHECK (required_quantity > 0),

    remaining_quantity NUMERIC(12,3) NOT NULL
        CHECK (remaining_quantity >= 0),

    minimum_grade VARCHAR(20),

    maximum_price NUMERIC(12,2)
        CHECK (maximum_price IS NULL OR maximum_price >= 0),

    required_date DATE,

    location VARCHAR(200),

    status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN (
            'OPEN',
            'PARTIALLY_FULFILLED',
            'FULFILLED',
            'CANCELLED',
            'EXPIRED'
        )),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CHECK (remaining_quantity <= required_quantity)
);

COMMIT;

