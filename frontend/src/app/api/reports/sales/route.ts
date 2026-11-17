import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { query } from "@/lib/db/postgres";
import { parseDateOnly } from "@/lib/validators/database";

const SALE_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

type TotalRow = {
  total_sales: string;
  total_sale_amount: string;
};

type StatusRow = {
  status: (typeof SALE_STATUSES)[number];
  count: string;
};

type QuantityRow = {
  unit: string;
  quantity: string;
};

type PaymentRow = {
  collected_payment_amount: string;
};

type MonthlyRow = {
  month: string;
  sales_count: string;
  total_sale_amount: string;
};

type CropRow = {
  crop_id: string;
  crop_name: string;
  unit: string;
  sales_count: string;
  total_quantity: string;
  total_sale_amount: string;
};

type MarketRow = {
  market_id: string | null;
  market_name: string;
  sales_count: string;
  total_sale_amount: string;
};

export async function GET(request: Request) {
  try {
    const access = await requireAdmin();
    if ("error" in access) return access.error;

    const searchParams = new URL(request.url).searchParams;
    const fromValue = searchParams.get("from");
    const toValue = searchParams.get("to");
    const from = fromValue === null ? null : parseDateOnly(fromValue);
    const to = toValue === null ? null : parseDateOnly(toValue);

    if (fromValue !== null && !from) {
      return NextResponse.json(
        { success: false, message: "The from date must be a valid YYYY-MM-DD date" },
        { status: 400 },
      );
    }
    if (toValue !== null && !to) {
      return NextResponse.json(
        { success: false, message: "The to date must be a valid YYYY-MM-DD date" },
        { status: 400 },
      );
    }
    if (from && to && from > to) {
      return NextResponse.json(
        { success: false, message: "The from date must be on or before the to date" },
        { status: 400 },
      );
    }

    const maximumMonths = 36;
    const shiftMonth = (value: string, delta: number, day: "first" | "same" = "same") => {
      const [year, month, date] = value.split("-").map(Number);
      const monthIndex = year * 12 + month - 1 + delta;
      const boundedMonthIndex = Math.min(9999 * 12 + 11, Math.max(12, monthIndex));
      const targetYear = Math.floor(boundedMonthIndex / 12);
      const targetMonth = boundedMonthIndex % 12 + 1;
      const leapYear = targetYear % 4 === 0 && (targetYear % 100 !== 0 || targetYear % 400 === 0);
      const daysInTargetMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][targetMonth - 1];
      const targetDay = day === "first"
        ? 1
        : Math.min(date, daysInTargetMonth);
      return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
    };
    const today = new Date();
    const defaultTo = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    const defaultFromDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
    const defaultFrom = `${defaultFromDate.getUTCFullYear()}-${String(defaultFromDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const effectiveFrom = from ?? (to ? shiftMonth(to, -(maximumMonths - 1), "first") : defaultFrom);
    const effectiveTo = to ?? (from ? shiftMonth(from, maximumMonths - 1) : defaultTo);
    const startMonth = new Date(`${effectiveFrom}T00:00:00Z`);
    const endMonth = new Date(`${effectiveTo}T00:00:00Z`);
    const monthSpan = (endMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12 + endMonth.getUTCMonth() - startMonth.getUTCMonth();
    if (monthSpan >= maximumMonths) {
      return NextResponse.json(
        { success: false, message: `The reporting range cannot exceed ${maximumMonths} calendar months` },
        { status: 400 },
      );
    }

    const dateParams = [effectiveFrom, effectiveTo];
    const [
      totalsResult,
      statusesResult,
      quantitiesResult,
      paymentsResult,
      monthlyResult,
      cropsResult,
      marketsResult,
    ] = await Promise.all([
      query<TotalRow>(
        `SELECT COUNT(*)::text AS total_sales,
                COALESCE(SUM(total_amount), 0)::text AS total_sale_amount
         FROM sale_summary_view
         WHERE sale_status <> 'CANCELLED'
           AND ($1::date IS NULL OR sale_date >= $1::date)
           AND ($2::date IS NULL OR sale_date <= $2::date)`,
        dateParams,
      ),
      query<StatusRow>(
        `SELECT sale_status AS status, COUNT(*)::text AS count
         FROM sales
         WHERE ($1::date IS NULL OR sale_date >= $1::date)
           AND ($2::date IS NULL OR sale_date <= $2::date)
         GROUP BY sale_status
         ORDER BY sale_status`,
        dateParams,
      ),
      query<QuantityRow>(
        `SELECT pl.unit, COALESCE(SUM(si.quantity), 0)::text AS quantity
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.sale_id
         JOIN produce_lots pl ON pl.lot_id = si.lot_id
         WHERE s.sale_status <> 'CANCELLED'
           AND ($1::date IS NULL OR s.sale_date >= $1::date)
           AND ($2::date IS NULL OR s.sale_date <= $2::date)
         GROUP BY pl.unit
         ORDER BY pl.unit`,
        dateParams,
      ),
      query<PaymentRow>(
        `SELECT COALESCE(SUM(p.amount), 0)::text AS collected_payment_amount
         FROM payments p
         JOIN sales s ON s.sale_id = p.sale_id
         WHERE p.status = 'SUCCESS'
           AND s.sale_status <> 'CANCELLED'
           AND ($1::date IS NULL OR s.sale_date >= $1::date)
           AND ($2::date IS NULL OR s.sale_date <= $2::date)`,
        dateParams,
      ),
      query<MonthlyRow>(
        `WITH RECURSIVE month_calendar(month_start, end_month) AS (
           SELECT DATE_TRUNC('month', $1::date)::date,
                  DATE_TRUNC('month', $2::date)::date
           UNION ALL
           SELECT (month_start + INTERVAL '1 month')::date, end_month
           FROM month_calendar
           WHERE month_start < end_month
         ), filtered_month_sales AS (
           SELECT DATE_TRUNC('month', sale_date)::date AS month_start,
                  COUNT(*) AS sales_count,
                  COALESCE(SUM(total_amount), 0) AS total_sale_amount
           FROM sale_summary_view
           WHERE sale_status <> 'CANCELLED'
             AND sale_date >= $1::date
             AND sale_date <= $2::date
           GROUP BY DATE_TRUNC('month', sale_date)::date
         )
         SELECT TO_CHAR(calendar.month_start, 'YYYY-MM') AS month,
                COALESCE(month_sales.sales_count, 0)::text AS sales_count,
                COALESCE(month_sales.total_sale_amount, 0)::text AS total_sale_amount
         FROM month_calendar calendar
         LEFT JOIN filtered_month_sales month_sales USING (month_start)
         ORDER BY calendar.month_start`,
        dateParams,
      ),
      query<CropRow>(
        `SELECT c.crop_id::text AS crop_id,
                c.crop_name,
                pl.unit,
                COUNT(DISTINCT s.sale_id)::text AS sales_count,
                COALESCE(SUM(si.quantity), 0)::text AS total_quantity,
                COALESCE(SUM(si.subtotal), 0)::text AS total_sale_amount
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.sale_id
         JOIN produce_lots pl ON pl.lot_id = si.lot_id
         JOIN crops c ON c.crop_id = pl.crop_id
         WHERE s.sale_status <> 'CANCELLED'
           AND ($1::date IS NULL OR s.sale_date >= $1::date)
           AND ($2::date IS NULL OR s.sale_date <= $2::date)
         GROUP BY c.crop_id, c.crop_name, pl.unit
         ORDER BY c.crop_name, pl.unit, c.crop_id`,
        dateParams,
      ),
      query<MarketRow>(
        `SELECT m.market_id::text AS market_id,
                COALESCE(m.market_name, 'No market selected') AS market_name,
                COUNT(*)::text AS sales_count,
                COALESCE(SUM(s.total_amount), 0)::text AS total_sale_amount
         FROM sales s
         LEFT JOIN markets m ON m.market_id = s.market_id
         WHERE s.sale_status <> 'CANCELLED'
           AND ($1::date IS NULL OR s.sale_date >= $1::date)
           AND ($2::date IS NULL OR s.sale_date <= $2::date)
         GROUP BY m.market_id, m.market_name
         ORDER BY market_name, m.market_id`,
        dateParams,
      ),
    ]);

    const statusCounts = new Map(
      statusesResult.rows.map(({ status, count }) => [status, count]),
    );
    const totals = totalsResult.rows[0];
    const payments = paymentsResult.rows[0];

    return NextResponse.json({
      success: true,
      filters: { from: effectiveFrom, to: effectiveTo },
      summary: {
        totalSales: totals.total_sales,
        totalSaleAmount: totals.total_sale_amount,
        quantitySoldByUnit: quantitiesResult.rows.map(({ unit, quantity }) => ({
          unit,
          quantity,
        })),
        collectedPaymentAmount: payments.collected_payment_amount,
      },
      saleCountsByStatus: SALE_STATUSES.map((status) => ({
        status,
        count: statusCounts.get(status) ?? "0",
      })),
      monthlySales: monthlyResult.rows.map((row) => ({
        month: row.month,
        salesCount: row.sales_count,
        totalSaleAmount: row.total_sale_amount,
      })),
      cropSales: cropsResult.rows.map((row) => ({
        cropId: row.crop_id,
        cropName: row.crop_name,
        unit: row.unit,
        salesCount: row.sales_count,
        totalQuantity: row.total_quantity,
        totalSaleAmount: row.total_sale_amount,
      })),
      marketSales: marketsResult.rows.map((row) => ({
        marketId: row.market_id,
        marketName: row.market_name,
        salesCount: row.sales_count,
        totalSaleAmount: row.total_sale_amount,
      })),
    });
  } catch (error) {
    console.error("Admin sales report GET failed:", error);
    return NextResponse.json(
      { success: false, message: "Could not generate sales report" },
      { status: 500 },
    );
  }
}
