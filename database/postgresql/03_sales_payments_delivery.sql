
BEGIN;

-- 1. SALES TABLE
-- Stores transactions between farmers and buyers.

CREATE TABLE sales (
    sale_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    farmer_id BIGINT NOT NULL
        REFERENCES farmers(farmer_id),

    buyer_id BIGINT NOT NULL
        REFERENCES buyers(buyer_id),

    market_id BIGINT
        REFERENCES markets(market_id),

    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,

    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (total_amount >= 0),

    sale_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (sale_status IN (
            'PENDING',
            'CONFIRMED',
            'COMPLETED',
            'CANCELLED'
        )),

    payment_status VARCHAR(30) NOT NULL DEFAULT 'UNPAID'
        CHECK (payment_status IN (
            'UNPAID',
            'PARTIALLY_PAID',
            'PAID',
            'REFUNDED'
        )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

cancelled_at TIMESTAMPTZ,

cancellation_reason TEXT
);


-- 2. SALE_ITEMS TABLE
-- Stores individual produce lots included in a sale.
-- demand_id connects the sale item to the buyer's demand.

CREATE TABLE sale_items (
    sale_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    sale_id BIGINT NOT NULL
        REFERENCES sales(sale_id),

    lot_id BIGINT NOT NULL
        REFERENCES produce_lots(lot_id),

    demand_id BIGINT
        REFERENCES buyer_demands(demand_id),

    quantity NUMERIC(12,3) NOT NULL
        CHECK (quantity > 0),

    price_per_unit NUMERIC(12,2) NOT NULL
        CHECK (price_per_unit >= 0),

    subtotal NUMERIC(14,2)
        GENERATED ALWAYS AS (quantity * price_per_unit) STORED
);


-- 3. PAYMENTS TABLE
-- A sale can have multiple payment records.

CREATE TABLE payments (
    payment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    sale_id BIGINT NOT NULL
        REFERENCES sales(sale_id),

    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,

    amount NUMERIC(14,2) NOT NULL
        CHECK (amount > 0),

    payment_type VARCHAR(50),

    transaction_reference VARCHAR(150) UNIQUE,

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING',
            'SUCCESS',
            'FAILED',
            'REFUNDED'
        ))
);


-- 4. DELIVERIES TABLE
-- Every sale can have at most one delivery record.

CREATE TABLE deliveries (
    delivery_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    sale_id BIGINT NOT NULL UNIQUE
        REFERENCES sales(sale_id),

    pickup_location TEXT,

    delivery_location TEXT,

    scheduled_date DATE,

    actual_date DATE,

    transport_cost NUMERIC(12,2)
        CHECK (transport_cost >= 0),

    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING',
            'IN_TRANSIT',
            'DELIVERED',
            'CANCELLED'
        ))
);

COMMIT;

