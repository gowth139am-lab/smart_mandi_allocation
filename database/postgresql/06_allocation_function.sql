
CREATE OR REPLACE FUNCTION allocate_sale_item(
    p_sale_id BIGINT,
    p_lot_id BIGINT,
    p_demand_id BIGINT,
    p_quantity NUMERIC,
    p_price_per_unit NUMERIC
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_item_id BIGINT;

BEGIN

    INSERT INTO sale_items (
        sale_id,
        lot_id,
        demand_id,
        quantity,
        price_per_unit
    )
    VALUES (
        p_sale_id,
        p_lot_id,
        p_demand_id,
        p_quantity,
        p_price_per_unit
    )
    RETURNING sale_item_id
    INTO v_sale_item_id;

    RETURN v_sale_item_id;

END;
$$;

