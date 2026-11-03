
BEGIN;

-- ==========================================
-- 1. GRADE RANKING FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION grade_rank(p_grade TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE UPPER(BTRIM(p_grade))
        WHEN 'A' THEN 3
        WHEN 'B' THEN 2
        WHEN 'C' THEN 1
        ELSE NULL
    END;
$$;


-- ==========================================
-- 2. INVENTORY VALIDATION TRIGGER FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION validate_sale_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale sales%ROWTYPE;
    v_lot produce_lots%ROWTYPE;
    v_demand buyer_demands%ROWTYPE;

    v_lot_farmer_id BIGINT;

    v_actual_grade INTEGER;
    v_required_grade INTEGER;

BEGIN

    -- Basic quantity and price validation

    IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
        RAISE EXCEPTION 'Sale quantity must be positive';
    END IF;

    IF NEW.price_per_unit IS NULL OR NEW.price_per_unit < 0 THEN
        RAISE EXCEPTION 'Invalid sale price';
    END IF;


    -- Lock and retrieve the sale record

    SELECT *
    INTO v_sale
    FROM sales
    WHERE sale_id = NEW.sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale record not found';
    END IF;

    IF v_sale.sale_status NOT IN ('PENDING', 'CONFIRMED') THEN
        RAISE EXCEPTION 'This sale cannot accept additional items';
    END IF;


    -- Lock produce lot to prevent simultaneous overselling

    SELECT *
    INTO v_lot
    FROM produce_lots
    WHERE lot_id = NEW.lot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produce lot not found';
    END IF;

    IF v_lot.status NOT IN ('AVAILABLE', 'PARTIALLY_SOLD') THEN
        RAISE EXCEPTION 'Produce lot is not available';
    END IF;

    IF v_lot.expiry_date IS NOT NULL
       AND v_lot.expiry_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Produce lot has expired';
    END IF;

    IF v_lot.available_quantity < NEW.quantity THEN
        RAISE EXCEPTION
            'Insufficient inventory. Available: %, Requested: %',
            v_lot.available_quantity, NEW.quantity;
    END IF;


    -- Check whether the lot belongs to the sale's farmer

    SELECT farmer_id
    INTO v_lot_farmer_id
    FROM farms
    WHERE farm_id = v_lot.farm_id;

    IF v_lot_farmer_id <> v_sale.farmer_id THEN
        RAISE EXCEPTION 'Produce lot does not belong to this farmer';
    END IF;


    -- Validate buyer demand when demand_id is provided

    IF NEW.demand_id IS NOT NULL THEN

        SELECT *
        INTO v_demand
        FROM buyer_demands
        WHERE demand_id = NEW.demand_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Buyer demand not found';
        END IF;

        IF v_demand.buyer_id <> v_sale.buyer_id THEN
            RAISE EXCEPTION 'Demand does not belong to this buyer';
        END IF;

        IF v_demand.crop_id <> v_lot.crop_id THEN
            RAISE EXCEPTION 'Crop does not match buyer demand';
        END IF;

        IF v_demand.status NOT IN ('OPEN', 'PARTIALLY_FULFILLED') THEN
            RAISE EXCEPTION 'Buyer demand is not open';
        END IF;

        IF v_demand.remaining_quantity < NEW.quantity THEN
            RAISE EXCEPTION 'Quantity exceeds remaining buyer demand';
        END IF;

        IF v_demand.maximum_price IS NOT NULL
           AND NEW.price_per_unit > v_demand.maximum_price THEN
            RAISE EXCEPTION 'Sale price exceeds buyer maximum price';
        END IF;


        -- Compare actual grade with minimum required grade

        IF v_demand.minimum_grade IS NOT NULL THEN

            v_actual_grade := grade_rank(v_lot.grade);

            v_required_grade := grade_rank(v_demand.minimum_grade);

            IF v_actual_grade IS NULL
               OR v_required_grade IS NULL THEN
                RAISE EXCEPTION 'Invalid or unsupported quality grade';
            END IF;

            IF v_actual_grade < v_required_grade THEN
                RAISE EXCEPTION 'Produce does not satisfy minimum grade';
            END IF;

        END IF;


        -- Update buyer demand quantity

        UPDATE buyer_demands
        SET
            remaining_quantity =
                remaining_quantity - NEW.quantity,

            status = CASE
                WHEN remaining_quantity - NEW.quantity = 0
                    THEN 'FULFILLED'
                ELSE 'PARTIALLY_FULFILLED'
            END

        WHERE demand_id = NEW.demand_id;

    END IF;


    -- Update available produce quantity

    UPDATE produce_lots
    SET
        available_quantity =
            available_quantity - NEW.quantity,

        status = CASE
            WHEN available_quantity - NEW.quantity = 0
                THEN 'SOLD'
            ELSE 'PARTIALLY_SOLD'
        END

    WHERE lot_id = NEW.lot_id;

    RETURN NEW;

END;
$$;


-- ==========================================
-- 3. CREATE INVENTORY VALIDATION TRIGGER
-- ==========================================

DROP TRIGGER IF EXISTS trg_validate_sale_item
ON sale_items;

CREATE TRIGGER trg_validate_sale_item
BEFORE INSERT ON sale_items
FOR EACH ROW
EXECUTE FUNCTION validate_sale_item();


-- ==========================================
-- 4. SALE TOTAL UPDATE FUNCTION
-- ==========================================

CREATE OR REPLACE FUNCTION update_sale_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    UPDATE sales
    SET total_amount = (
        SELECT COALESCE(SUM(subtotal), 0)
        FROM sale_items
        WHERE sale_id = NEW.sale_id
    )
    WHERE sale_id = NEW.sale_id;

    RETURN NEW;

END;
$$;


-- ==========================================
-- 5. CREATE SALE TOTAL TRIGGER
-- ==========================================

DROP TRIGGER IF EXISTS trg_update_sale_total
ON sale_items;

CREATE TRIGGER trg_update_sale_total
AFTER INSERT ON sale_items
FOR EACH ROW
EXECUTE FUNCTION update_sale_total();

COMMIT;

