import "dotenv/config";
export * from "./db/index";
import { sequelize, runTransaction } from "./db/index";

/**
 * Runs operations inside a managed Sequelize transaction with automatic retry on deadlocks.
 */
export async function runSerializable<T>(
  fn: (tx: any) => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  return runTransaction(fn, undefined, maxAttempts);
}
