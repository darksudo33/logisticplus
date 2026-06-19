import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus";

export const pool = new Pool({ connectionString });

pool.on("error", (error) => {
  console.warn("PostgreSQL idle client error:", error?.message || String(error));
});

export async function checkDatabase() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}
