import "dotenv/config";
import { auth } from "../src/lib/auth";

async function main() {
  console.log("Testing signInEmail...");
  try {
    const res = await auth.api.signInEmail({
      body: { email: "admin@pawnify.com", password: "password123" },
    });
    console.log("LOGIN SUCCESS! User:", res.user.email, res.user.id);
  } catch (err) {
    console.error("LOGIN FAILED:", err);
  }

  console.log("Testing mobile signIn...");
  try {
    const res2 = await auth.api.signInMobile({
      body: { phone: "9876543210", password: "password123" },
    });
    console.log("MOBILE LOGIN SUCCESS!", res2);
  } catch (err) {
    console.error("MOBILE LOGIN FAILED:", err);
  }

  process.exit(0);
}

main();
