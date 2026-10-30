import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Message } from "../../messages.js";
import { GoldLedger, GoldError, nextGoldBalance } from "../../gold.js";
import {
  CurrencyError,
  currencyBalance,
  setCurrencyBalance,
  nextCurrencyBalance,
  type Currency,
  type CurrencyState,
} from "./catalog.js";

export const CURRENCY_SCHEMA = `CREATE TABLE IF NOT EXISTS currency_transactions(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  currency TEXT NOT NULL, operation_id TEXT NOT NULL, at TEXT NOT NULL, reason TEXT NOT NULL,
  delta INTEGER NOT NULL, balance_before INTEGER NOT NULL, balance_after INTEGER NOT NULL,
  UNIQUE(user_id,currency,operation_id));`;

/** The host commits its gameplay/save and these entries in the same transaction. */
export class CurrencyLedger {
  private readonly legacyGold: GoldLedger;
  constructor(
    private readonly db: DatabaseSync,
    private readonly now = Date.now,
  ) {
    this.legacyGold = new GoldLedger(db, now);
  }
  change(
    state: CurrencyState,
    userId: number,
    currency: Currency,
    delta: number,
    reason: string,
    operationId: string = randomUUID(),
  ): boolean {
    const previous = this.db
      .prepare(
        "SELECT delta,reason FROM currency_transactions WHERE user_id=? AND currency=? AND operation_id=?",
      )
      .get(userId, currency, operationId);
    if (previous) {
      if (previous.delta !== delta || previous.reason !== reason) {
        if (currency === "gold")
          throw new GoldError("Identificador de operação de ouro reutilizado");
        throw new CurrencyError(
          "Identificador de operação de moeda reutilizado",
        );
      }
      return false;
    }
    const before = currencyBalance(state, currency),
      after =
        currency === "gold"
          ? nextGoldBalance(before, delta)
          : nextCurrencyBalance(currency, before, delta);
    const name = `currency_${randomUUID().replaceAll("-", "")}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      if (
        currency === "gold" &&
        !this.legacyGold.change(
          { gold_total_count: before },
          userId,
          delta,
          reason,
          operationId,
        )
      ) {
        this.db.exec(`RELEASE ${name}`);
        return false;
      }
      this.db
        .prepare(
          "INSERT INTO currency_transactions(user_id,currency,operation_id,at,reason,delta,balance_before,balance_after) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          userId,
          currency,
          operationId,
          new Date(this.now()).toISOString(),
          reason,
          delta,
          before,
          after,
        );
      this.db.exec(`RELEASE ${name}`);
    } catch (error) {
      this.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw error;
    }
    setCurrencyBalance(state, currency, after);
    return true;
  }
  changeMany(
    state: CurrencyState,
    userId: number,
    deltas: Partial<Record<Currency, number>>,
    reason: string,
    operationId: string = randomUUID(),
  ): void {
    const staged = structuredClone(state),
      name = `currencies_${randomUUID().replaceAll("-", "")}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      for (const [currency, delta] of Object.entries(deltas))
        this.change(
          staged,
          userId,
          currency as Currency,
          delta!,
          reason,
          operationId,
        );
      this.db.exec(`RELEASE ${name}`);
    } catch (error) {
      this.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw error;
    }
    for (const key of Object.keys(deltas) as Currency[])
      setCurrencyBalance(state, key, currencyBalance(staged, key));
  }
  /** Preserve the finalized fashion API and the historical gold audit table. */
  goldAdapter(): GoldLedger {
    const ledger = this;
    return new (class extends GoldLedger {
      override change(
        economy: Message,
        userId: number,
        delta: number,
        reason: string,
        operationId: string = randomUUID(),
      ): boolean {
        return ledger.change(
          { economy },
          userId,
          "gold",
          delta,
          reason,
          operationId,
        );
      }
    })(this.db, this.now);
  }
}
