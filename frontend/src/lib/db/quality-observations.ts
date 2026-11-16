import { query } from "@/lib/db/postgres";

export type QualityLotReference = {
  lot_id: string;
  crop_id: string;
  crop_name: string;
  farmer_id: string;
};

export async function getQualityLotReference(
  lotId: number,
): Promise<QualityLotReference | null> {
  const result = await query<QualityLotReference>(
    `SELECT pl.lot_id::text AS lot_id,
            pl.crop_id::text AS crop_id,
            c.crop_name,
            f.farmer_id::text AS farmer_id
     FROM produce_lots pl
     JOIN crops c ON c.crop_id = pl.crop_id
     JOIN farms f ON f.farm_id = pl.farm_id
     WHERE pl.lot_id = $1
     LIMIT 1`,
    [lotId],
  );

  return result.rows[0] ?? null;
}

export async function getFarmerQualityLotIds(
  farmerId: string,
): Promise<number[]> {
  const result = await query<{ lot_id: string }>(
    `SELECT pl.lot_id::text AS lot_id
     FROM produce_lots pl
     JOIN farms f ON f.farm_id = pl.farm_id
     WHERE f.farmer_id = $1`,
    [farmerId],
  );

  return result.rows.flatMap(({ lot_id }) => {
    if (!/^[1-9]\d*$/.test(lot_id)) return [];
    const id = Number(lot_id);
    return Number.isSafeInteger(id) ? [id] : [];
  });
}
