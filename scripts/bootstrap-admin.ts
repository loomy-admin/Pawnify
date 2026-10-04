/**
 * Production Admin Bootstrap Script for Pawnify (Pure Sequelize MySQL)
 *
 * Creates the initial ADMIN user safely without touching existing data.
 */

import "dotenv/config";
import { User, Op } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { hashPassword } from "better-auth/crypto";
import { normalizeIndianMobile, isValidIndianMobile } from "../src/lib/auth/mobile-plugin";

async function main() {
  const phone = process.env.ADMIN_PHONE || "9876543210";
  const email = process.env.ADMIN_EMAIL || "admin@pawnify.com";
  const name = process.env.ADMIN_NAME || "System Administrator";
  const password = process.env.ADMIN_PASSWORD || "password123";
  const hiddenPassword = process.env.ADMIN_HIDDEN_PASSWORD;

  if (!isValidIndianMobile(phone)) {
    console.error("❌ Error: Invalid 10-digit Indian mobile number provided for ADMIN_PHONE.");
    process.exit(1);
  }

  const normalizedPhone = normalizeIndianMobile(phone);

  console.log(`Checking for existing user with phone ${normalizedPhone} or email ${email}...`);

  const existing = await User.findOne({
    where: {
      [Op.or]: [{ phone: normalizedPhone }, { email }],
    },
  });

  if (existing) {
    console.log(`⚠️ User already exists (ID: ${existing.id}). Promoting to ADMIN and ensuring active status...`);
    let hiddenHash = existing.hiddenPasswordHash;
    if (hiddenPassword) {
      hiddenHash = await hashPassword(hiddenPassword);
    }
    await User.update(
      {
        role: "ADMIN",
        isActive: true,
        emailVerified: true,
        hiddenPasswordHash: hiddenHash,
      },
      { where: { id: existing.id } }
    );
    console.log(`✅ User ${existing.email} updated to ADMIN successfully.`);
    return;
  }

  console.log(`Creating initial admin user: ${email} (${normalizedPhone})...`);

  const hiddenHash = hiddenPassword ? await hashPassword(hiddenPassword) : null;

  const res = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
      phone: normalizedPhone,
    },
  });

  await User.update(
    {
      role: "ADMIN",
      emailVerified: true,
      isActive: true,
      phone: normalizedPhone,
      hiddenPasswordHash: hiddenHash,
    },
    { where: { id: res.user.id } }
  );

  console.log(`✅ Admin user successfully bootstrapped!`);
  console.log(`   Email: ${email}`);
  console.log(`   Phone: ${normalizedPhone}`);
  console.log(`   Role:  ADMIN`);
}

main()
  .catch((e) => {
    console.error("❌ Failed to bootstrap admin:", e);
    process.exit(1);
  });
