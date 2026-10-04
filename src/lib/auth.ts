import { betterAuth } from "better-auth";
import mysql from "mysql2/promise";
import { mobileAuthPlugin } from "./auth/mobile-plugin";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const useSsl =
  process.env.MYSQL_SSL === "true" ||
  process.env.MYSQL_HOST?.includes("tidbcloud.com") ||
  process.env.MYSQL_HOST?.includes("aivencloud.com") ||
  process.env.DATABASE_URL?.includes("ssl");

const sslConfig = useSsl
  ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED === "true" }
  : undefined;

const mysqlPool =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("mysql")
    ? mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_POOL_MAX || 10),
        queueLimit: 0,
        ssl: sslConfig,
      })
    : mysql.createPool({
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || "pawnify_db",
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_POOL_MAX || 10),
        queueLimit: 0,
        ssl: sslConfig,
      });

export const auth = betterAuth({
  database: mysqlPool,
  secret:
    process.env.BETTER_AUTH_SECRET ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : "pawnify-dev-secret-key-32-chars-minimum-12345"),
  baseURL: appUrl,
  trustedOrigins: [
    appUrl,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean) as string[],
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60, // Update session every hour
    additionalFields: {
      calculationMode: {
        type: "string",
        required: false,
        defaultValue: "NORMAL",
        input: false, // Protected against client tampering
      },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "STAFF",
        input: false,
      },
      phone: {
        type: "string",
        required: false,
        input: true,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
      hiddenPasswordHash: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  plugins: [mobileAuthPlugin()],
});

export type Session = typeof auth.$Infer.Session;
