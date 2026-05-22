const { PrismaClient } = require("@prisma/client");

// PgBouncer (Supabase pooler on port 6543) runs in transaction mode,
// which is incompatible with PostgreSQL prepared statements.
// Setting `prepared_statements=false` via the datasource engine type
// is handled by the `?pgbouncer=true` flag in DATABASE_URL.
// We also use a global singleton to avoid exhausting the connection pool
// in development (Next.js / nodemon hot-reload creates new instances).

const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
