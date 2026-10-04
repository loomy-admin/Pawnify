import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { verifyPassword } from "better-auth/crypto";
import { z } from "zod";
import mysql from "mysql2/promise";

/**
 * Normalizes an Indian phone number.
 * Strips out whitespace, hyphens, parentheses, and leading '+91', '91', or '0'.
 */
export function normalizeIndianMobile(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Validates whether the given string is a valid 10-digit Indian mobile number.
 * Valid Indian mobile numbers are 10 digits and start with 6, 7, 8, or 9.
 */
export function isValidIndianMobile(phone: string): boolean {
  const normalized = normalizeIndianMobile(phone);
  return /^[6-9]\d{9}$/.test(normalized);
}

/** Lazily-created raw mysql2 pool for auth lookups — avoids Sequelize bundling issues */
let rawPool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!rawPool) {
    rawPool = mysql.createPool({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "pawnify_db",
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return rawPool;
}

export const mobileAuthPlugin = () => ({
  id: "mobile-auth",
  endpoints: {
    signInMobile: createAuthEndpoint(
      "/sign-in/mobile",
      {
        method: "POST",
        body: z.object({
          phone: z.string(),
          password: z.string(),
        }),
      },
      async (ctx) => {
        const { phone, password } = ctx.body;

        // 1. Validate format
        if (!isValidIndianMobile(phone)) {
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid mobile number or password",
          });
        }

        const normalizedPhone = normalizeIndianMobile(phone);

        // 2. Lookup user directly via raw mysql2 (bypasses Sequelize bundling issues)
        const pool = getPool();
        const [userRows] = await pool.execute<mysql.RowDataPacket[]>(
          "SELECT id, name, email, emailVerified, image, role, phone, isActive, hiddenPasswordHash, createdAt, updatedAt FROM `user` WHERE phone = ? LIMIT 1",
          [normalizedPhone]
        );

        const userRow = userRows[0];

        if (!userRow || userRow.isActive === 0 || userRow.isActive === false) {
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid mobile number or password",
          });
        }

        // 3. Lookup credential account
        const [accountRows] = await pool.execute<mysql.RowDataPacket[]>(
          "SELECT id, password FROM `account` WHERE userId = ? AND providerId = 'credential' LIMIT 1",
          [userRow.id]
        );

        const accountRow = accountRows[0];

        let calculationMode: "NORMAL" | "FIFTY_PERCENT" | null = null;

        // 4. Check normal credential password
        if (accountRow?.password) {
          try {
            const isNormalMatch = await verifyPassword({
              hash: accountRow.password as string,
              password,
            });
            if (isNormalMatch) {
              calculationMode = "NORMAL";
            }
          } catch {
            // Verification error handled silently
          }
        }

        // 5. Check hidden password if normal didn't match
        if (!calculationMode && userRow.hiddenPasswordHash) {
          try {
            const isHiddenMatch = await verifyPassword({
              hash: userRow.hiddenPasswordHash as string,
              password,
            });
            if (isHiddenMatch) {
              calculationMode = "FIFTY_PERCENT";
            }
          } catch {
            // Verification error handled silently
          }
        }

        // 6. Reject if neither matched
        if (!calculationMode) {
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid mobile number or password",
          });
        }

        // 7. Build plain user object matching Better Auth's internal shape
        const user = {
          id: userRow.id as string,
          name: userRow.name as string,
          email: userRow.email as string,
          emailVerified: Boolean(userRow.emailVerified),
          image: (userRow.image as string) ?? null,
          role: userRow.role as string,
          phone: (userRow.phone as string) ?? null,
          isActive: Boolean(userRow.isActive),
          createdAt: userRow.createdAt as Date,
          updatedAt: userRow.updatedAt as Date,
        };

        // 8. Create session via Better Auth internal adapter (matches official sign-in pattern)
        const session = await ctx.context.internalAdapter.createSession(
          user.id,
          false, // dontRememberMe
          { calculationMode } // override — persisted in session row
        );

        if (!session) {
          ctx.context.logger.error("Failed to create session for user", user.id);
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to create session",
          });
        }

        // 9. Set signed session cookie (matches official sign-in.mjs pattern exactly)
        await setSessionCookie(ctx, { session, user }, false);

        // 10. Return success response
        return ctx.json({
          token: session.token,
          user: {
            id: user.id,
            name: user.name,
            role: user.role,
            phone: user.phone,
          },
        });
      }
    ),
  },
});
