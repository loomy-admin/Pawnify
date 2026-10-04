import { Sequelize, Transaction } from "sequelize";
import mysql2 from "mysql2";

const globalForSequelize = globalThis as unknown as {
  sequelize: Sequelize | undefined;
};

function createSequelizeInstance(): Sequelize {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.startsWith("mysql")) {
    return new Sequelize(databaseUrl, {
      dialect: "mysql",
      dialectModule: mysql2,
      pool: {
        max: Number(process.env.DB_POOL_MAX || 10),
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        decimalNumbers: true,
      },
      logging: process.env.DEBUG === "true" ? console.log : false,
    });
  }

  return new Sequelize(
    process.env.MYSQL_DATABASE || "pawnify_db",
    process.env.MYSQL_USER || "root",
    process.env.MYSQL_PASSWORD || "",
    {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      dialect: "mysql",
      dialectModule: mysql2,
      pool: {
        max: Number(process.env.DB_POOL_MAX || 10),
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        decimalNumbers: true,
      },
      logging: process.env.DEBUG === "true" ? console.log : false,
    }
  );
}

export const sequelize =
  globalForSequelize.sequelize ?? createSequelizeInstance();

if (process.env.NODE_ENV !== "production") {
  globalForSequelize.sequelize = sequelize;
}

/**
 * Executes operations inside a managed Sequelize transaction with retry capability
 * for deadlock or lock timeout conflicts.
 */
export async function runTransaction<T>(
  callback: (transaction: Transaction) => Promise<T>,
  isolationLevel: Transaction.ISOLATION_LEVELS = Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sequelize.transaction(
        {
          isolationLevel,
        },
        async (t) => {
          return await callback(t);
        }
      );
    } catch (err: unknown) {
      const errorMsg = String(err);
      const isLockConflict =
        errorMsg.includes("Deadlock") ||
        errorMsg.includes("Lock wait timeout") ||
        errorMsg.includes("ER_LOCK_DEADLOCK");

      if (!isLockConflict || attempt === maxAttempts) {
        throw err;
      }
    }
  }
  throw new Error("Transaction failed after maximum retry attempts");
}
