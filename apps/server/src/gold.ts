import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Message } from "./messages.js";
import {
  CurrencyError,
  nextCurrencyBalance,
} from "./features/currencies/catalog.js";

// CastleYieldMsg.gold_total_count uses a signed INT32 in the recovered protocol.
export const MAX_GOLD = 2147483647;
export const GOLD_SCHEMA = `CREATE TABLE IF NOT EXISTS gold_transactions(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, operation_id TEXT NOT NULL,
  at TEXT NOT NULL, reason TEXT NOT NULL,
  delta INTEGER NOT NULL, balance_before INTEGER NOT NULL, balance_after INTEGER NOT NULL,
  UNIQUE(user_id,operation_id));`;

export class GoldError extends CurrencyError {}
export function nextGoldBalance(balance: number, delta: number): number {
  try {
    return nextCurrencyBalance("gold", balance, delta);
  } catch (error) {
    if (error instanceof CurrencyError) throw new GoldError(error.message);
    throw error;
  }
}
export function canChangeGold(balance: number, delta: number): boolean {
  try {
    nextGoldBalance(balance, delta);
    return true;
  } catch {
    return false;
  }
}

/** Caller commits this entry and the gameplay effect in the same SQLite transaction. */
export class GoldLedger {
  constructor(
    private db: DatabaseSync,
    private now = Date.now,
  ) {}
  change(
    economy: Message,
    userId: number,
    delta: number,
    reason: string,
    operationId: string = randomUUID(),
  ): boolean {
    const previous = this.db
      .prepare(
        "SELECT delta,reason FROM gold_transactions WHERE user_id=? AND operation_id=?",
      )
      .get(userId, operationId);
    if (previous) {
      if (previous.delta !== delta || previous.reason !== reason)
        throw new GoldError("Identificador de operação de ouro reutilizado");
      return false;
    }
    const before = economy.gold_total_count;
    const after = nextGoldBalance(before, delta);
    this.db
      .prepare(
        "INSERT INTO gold_transactions(user_id,operation_id,at,reason,delta,balance_before,balance_after) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        userId,
        operationId,
        new Date(this.now()).toISOString(),
        reason,
        delta,
        before,
        after,
      );
    economy.gold_total_count = after;
    return true;
  }
}
