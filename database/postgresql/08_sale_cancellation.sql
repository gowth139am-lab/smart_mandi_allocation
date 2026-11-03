
CREATE OR REPLACE FUNCTION cancel_sale(
    p_sale_id BIGINT,
    p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale sales%ROWTYPE;
    v_lot_id BIGINT;
    v_demand_id BIGINT;
BEGIN

    -- Lock the sale record
    SELECT *
    INTO v_sale
    FROM sales
    WHERE sale_id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    IF v_sale.sale_status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Sale is already cancelled';
    END IF;

    IF v_sale.sale_status NOT IN ('PENDING', 'CONFIRMED') THEN
        RAISE EXCEPTION 'This sale cannot be cancelled';
    END IF;

    -- Do not cancel a successfully paid sale
    -- until refund handling is implemented.
    IF EXISTS (
        SELECT 1
        FROM payments
        WHERE sale_id = p_sale_id
        AND status = 'SUCCESS'
    ) THEN
        RAISE EXCEPTION
        'Successful payment exists. Process refund first.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM sale_items
        WHERE sale_id = p_sale_id
    ) THEN
        RAISE EXCEPTION 'Sale has no allocated items';
    END IF;

    -- Lock all affected produce lots in a consistent order
    FOR v_lot_id IN
        SELECT DISTINCT lot_id
        FROM sale_items
        WHERE sale_id = p_sale_id
        ORDER BY lot_id
    LOOP
        PERFORM 1
        FROM produce_lots
        WHERE lot_id = v_lot_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produce lot % not found', v_lot_id;
        END IF;
    END LOOP;

    -- Lock all affected demands
    FOR v_demand_id IN
        SELECT DISTINCT demand_id
        FROM sale_items
        WHERE sale_id = p_sale_id
        AND demand_id IS NOT NULL
        ORDER BY demand_id
    LOOP
        PERFORM 1
        FROM buyer_demands
        WHERE demand_id = v_demand_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Buyer demand % not found', v_demand_id;
        END IF;
    END LOOP;

    -- Prevent invalid inventory restoration
    IF EXISTS (
        SELECT 1
        FROM produce_lots pl
        JOIN (
            SELECT lot_id, SUM(quantity) AS restore_quantity
            FROM sale_items
            WHERE sale_id = p_sale_id
            GROUP BY lot_id
        ) x ON x.lot_id = pl.lot_id
        WHERE pl.available_quantity + x.restore_quantity
              > pl.initial_quantity
    ) THEN
        RAISE EXCEPTION 'Inventory restoration exceeds initial quantity';
    END IF;

    -- Prevent invalid demand restoration
    IF EXISTS (
        SELECT 1
        FROM buyer_demands d
        JOIN (
            SELECT demand_id, SUM(quantity) AS restore_quantity
            FROM sale_items
            WHERE sale_id = p_sale_id
            AND demand_id IS NOT NULL
            GROUP BY demand_id
        ) x ON x.demand_id = d.demand_id
        WHERE d.status NOT IN ('CANCELLED', 'EXPIRED')
        AND d.remaining_quantity + x.restore_quantity
            > d.required_quantity
    ) THEN
        RAISE EXCEPTION 'Demand restoration exceeds required quantity';
    END IF;

    -- Restore produce inventory
    UPDATE produce_lots pl
    SET
        available_quantity =
            pl.available_quantity + x.restore_quantity,

        status = CASE
            WHEN pl.expiry_date IS NOT NULL
                 AND pl.expiry_date < CURRENT_DATE
                THEN 'EXPIRED'
            WHEN pl.available_quantity + x.restore_quantity
                 >= pl.initial_quantity
                THEN 'AVAILABLE'
            ELSE 'PARTIALLY_SOLD'
        END

    FROM (
        SELECT lot_id, SUM(quantity) AS restore_quantity
        FROM sale_items
        WHERE sale_id = p_sale_id
        GROUP BY lot_id
    ) x
    WHERE pl.lot_id = x.lot_id;

    -- Restore buyer demand
    -- Cancelled or expired demands remain closed.
    UPDATE buyer_demands d
    SET
        remaining_quantity = CASE
            WHEN d.status IN ('CANCELLED', 'EXPIRED')
                THEN d.remaining_quantity
            ELSE d.remaining_quantity + x.restore_quantity
        END,

        status = CASE
            WHEN d.status IN ('CANCELLED', 'EXPIRED')
                THEN d.status
            WHEN d.remaining_quantity + x.restore_quantity
                 >= d.required_quantity
                THEN 'OPEN'
            ELSE 'PARTIALLY_FULFILLED'
        END

    FROM (
        SELECT demand_id, SUM(quantity) AS restore_quantity
        FROM sale_items
        WHERE sale_id = p_sale_id
        AND demand_id IS NOT NULL
        GROUP BY demand_id
    ) x
    WHERE d.demand_id = x.demand_id;

    -- Mark sale as cancelled
    UPDATE sales
    SET
        sale_status = 'CANCELLED',
        cancelled_at = CURRENT_TIMESTAMP,
        cancellation_reason =
            COALESCE(NULLIF(BTRIM(p_reason), ''), 'Not specified')

    WHERE sale_id = p_sale_id;

    RETURN 'Sale cancelled and inventory restoration completed';

END;
$$;

