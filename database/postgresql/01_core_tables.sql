
BEGIN;

-- 1. USERS TABLE
-- Stores common information and login details.

CREATE TABLE users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('FARMER', 'BUYER', 'ADMIN')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- 2. USER_PHONES TABLE
-- Allows a user to have multiple phone numbers.

CREATE TABLE user_phones (
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    phone_number VARCHAR(20) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, phone_number)
);


-- 3. FARMERS TABLE
-- Stores farmer-specific information.

CREATE TABLE farmers (
    farmer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    village VARCHAR(100),
    district VARCHAR(100),
    state VARCHAR(100),
    pin_code VARCHAR(10)
);


-- 4. BUYERS TABLE
-- Stores buyer and business information.

CREATE TABLE buyers (
    buyer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id),
    business_name VARCHAR(150) NOT NULL,
    buyer_type VARCHAR(50),
    contact_person VARCHAR(100),
    address TEXT,
    district VARCHAR(100),
    state VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);


-- 5. FARMS TABLE
-- Every farm belongs to one farmer.

CREATE TABLE farms (
    farm_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    farmer_id BIGINT NOT NULL REFERENCES farmers(farmer_id),
    farm_name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    area_acres NUMERIC(10,2)
        CHECK (area_acres > 0),
    soil_type VARCHAR(100),
    irrigation_type VARCHAR(100)
);


-- 6. CROPS TABLE
-- Stores general agricultural crop information.

CREATE TABLE crops (
    crop_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crop_name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(100),
    unit VARCHAR(30) NOT NULL,
    typical_storage_days INTEGER
        CHECK (typical_storage_days >= 0)
);


-- 7. CROP_VARIETIES TABLE
-- Each crop can have multiple varieties.

CREATE TABLE crop_varieties (
    variety_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crop_id BIGINT NOT NULL REFERENCES crops(crop_id),
    variety_name VARCHAR(100) NOT NULL,
    description TEXT,
    UNIQUE (crop_id, variety_name),
    UNIQUE (variety_id, crop_id)
);

COMMIT;
