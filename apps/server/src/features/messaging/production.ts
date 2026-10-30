import type { DatabaseSync } from "node:sqlite";
import { passiveIncomeIntervalMs } from "./policy.js";

export interface ProductionMessageCursor {
  sequence: number;
  reportedAt: number;
}
export interface MessageReceipts {
  version: 1;
  production: ProductionMessageCursor;
}

/** Install before accruing this login; never announce the account's historical ledger. */
export function initialProductionCursor(db: DatabaseSync, userId: number, now: number): ProductionMessageCursor {
  const row = db.prepare("SELECT COALESCE(MAX(seq),0) AS sequence FROM currency_transactions WHERE user_id=? AND currency='gold' AND reason='townhall:production'").get(userId)!;
  return { sequence: Number(row.sequence), reportedAt: now };
}

/** Read actual credits only. This adapter never changes balances or recomputes production. */
export function pendingProductionSummary(db: DatabaseSync, userId: number, cursor: ProductionMessageCursor, now: number): { cursor: ProductionMessageCursor; gold: number; text: string } | undefined {
  if (now - cursor.reportedAt < passiveIncomeIntervalMs) return;
  const row = db.prepare(`SELECT COALESCE(MAX(seq),0) AS sequence,COALESCE(SUM(delta),0) AS gold
    FROM currency_transactions WHERE seq>? AND user_id=? AND currency='gold'
    AND reason='townhall:production' AND delta>0`).get(cursor.sequence, userId)!;
  const gold = Number(row.gold);
  if (!gold) return;
  return {
    cursor: { sequence: Number(row.sequence), reportedAt: now },
    gold,
    text: `Produção da prefeitura: ${gold} de ouro acumulados desde o último resumo.`,
  };
}
