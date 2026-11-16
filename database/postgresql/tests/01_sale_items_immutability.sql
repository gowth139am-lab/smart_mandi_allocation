BEGIN;

DO $$
DECLARE
    v_farmer_id BIGINT;
    v_buyer_id BIGINT;
    v_lot_id BIGINT;
    v_demand_id BIGINT;
    v_sale_id BIGINT;
    v_sale_item_id BIGINT;
    v_start_inventory NUMERIC;
    v_start_demand NUMERIC;
    v_start_total NUMERIC;
    v_allocated_inventory NUMERIC;
    v_allocated_demand NUMERIC;
    v_allocated_total NUMERIC;
    v_after_update_inventory NUMERIC;
    v_after_update_demand NUMERIC;
    v_after_update_total NUMERIC;
    v_after_delete_inventory NUMERIC;
    v_after_delete_demand NUMERIC;
    v_after_delete_total NUMERIC;
    v_update_error TEXT;
    v_delete_error TEXT;
BEGIN
    IF current_database() <> 'smart_mandi_audit_db' THEN
        RAISE EXCEPTION
            'This regression test must run against smart_mandi_audit_db, current database is %',
            current_database();
    END IF;

    SELECT f.farmer_id, b.buyer_id, pl.lot_id, d.demand_id
    INTO v_farmer_id, v_buyer_id, v_lot_id, v_demand_id
    FROM users farmer_user
    JOIN farmers f ON f.user_id = farmer_user.user_id
    JOIN users buyer_user ON buyer_user.username = 'demo_buyer_a'
    JOIN buyers b ON b.user_id = buyer_user.user_id
    JOIN produce_lots pl ON pl.farm_id = (
        SELECT farm_id
        FROM farms
        WHERE farmer_id = f.farmer_id
        ORDER BY farm_id
        LIMIT 1
    )
    JOIN buyer_demands d ON d.buyer_id = b.buyer_id
    WHERE farmer_user.username = 'demo_farmer'
      AND pl.available_quantity >= 100
      AND d.remaining_quantity >= 100
    ORDER BY pl.lot_id, d.demand_id
    LIMIT 1;

    IF v_farmer_id IS NULL
       OR v_buyer_id IS NULL
       OR v_lot_id IS NULL
       OR v_demand_id IS NULL THEN
        RAISE EXCEPTION 'Required demo fixture was not found';
    END IF;

    SELECT available_quantity
    INTO v_start_inventory
    FROM produce_lots
    WHERE lot_id = v_lot_id;

    SELECT remaining_quantity
    INTO v_start_demand
    FROM buyer_demands
    WHERE demand_id = v_demand_id;

    INSERT INTO sales (farmer_id, buyer_id)
    VALUES (v_farmer_id, v_buyer_id)
    RETURNING sale_id INTO v_sale_id;

    SELECT total_amount
    INTO v_start_total
    FROM sales
    WHERE sale_id = v_sale_id;

    v_sale_item_id := allocate_sale_item(
        v_sale_id,
        v_lot_id,
        v_demand_id,
        100,
        25
    );

    SELECT available_quantity
    INTO v_allocated_inventory
    FROM produce_lots
    WHERE lot_id = v_lot_id;

    SELECT remaining_quantity
    INTO v_allocated_demand
    FROM buyer_demands
    WHERE demand_id = v_demand_id;

    SELECT total_amount
    INTO v_allocated_total
    FROM sales
    WHERE sale_id = v_sale_id;

    IF v_allocated_inventory <> v_start_inventory - 100
       OR v_allocated_demand <> v_start_demand - 100
       OR v_allocated_total <> 2500 THEN
        RAISE EXCEPTION 'Allocation baseline state is incorrect';
    END IF;

    BEGIN
        UPDATE sale_items
        SET quantity = 50
        WHERE sale_item_id = v_sale_item_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_update_error := SQLERRM;
    END;

    SELECT available_quantity
    INTO v_after_update_inventory
    FROM produce_lots
    WHERE lot_id = v_lot_id;

    SELECT remaining_quantity
    INTO v_after_update_demand
    FROM buyer_demands
    WHERE demand_id = v_demand_id;

    SELECT total_amount
    INTO v_after_update_total
    FROM sales
    WHERE sale_id = v_sale_id;

    IF v_update_error IS DISTINCT FROM 'Sale items are immutable after insertion'
       OR v_after_update_inventory <> v_allocated_inventory
       OR v_after_update_demand <> v_allocated_demand
       OR v_after_update_total <> v_allocated_total THEN
        RAISE EXCEPTION
            'UPDATE immutability check failed: error=%, inventory=%, demand=%, total=%',
            v_update_error,
            v_after_update_inventory,
            v_after_update_demand,
            v_after_update_total;
    END IF;

    BEGIN
        DELETE FROM sale_items
        WHERE sale_item_id = v_sale_item_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_delete_error := SQLERRM;
    END;

    SELECT available_quantity
    INTO v_after_delete_inventory
    FROM produce_lots
    WHERE lot_id = v_lot_id;

    SELECT remaining_quantity
    INTO v_after_delete_demand
    FROM buyer_demands
    WHERE demand_id = v_demand_id;

    SELECT total_amount
    INTO v_after_delete_total
    FROM sales
    WHERE sale_id = v_sale_id;

    IF v_delete_error IS DISTINCT FROM 'Sale items are immutable after insertion'
       OR v_after_delete_inventory <> v_allocated_inventory
       OR v_after_delete_demand <> v_allocated_demand
       OR v_after_delete_total <> v_allocated_total THEN
        RAISE EXCEPTION
            'DELETE immutability check failed: error=%, inventory=%, demand=%, total=%',
            v_delete_error,
            v_after_delete_inventory,
            v_after_delete_demand,
            v_after_delete_total;
    END IF;

    RAISE NOTICE
        'PASS sale_items immutability: start_inventory=%, start_demand=%, start_total=%, allocated_inventory=%, allocated_demand=%, allocated_total=%, update_error=%, delete_error=%',
        v_start_inventory,
        v_start_demand,
        v_start_total,
        v_allocated_inventory,
        v_allocated_demand,
        v_allocated_total,
        v_update_error,
        v_delete_error;
END;
$$;

ROLLBACK;
