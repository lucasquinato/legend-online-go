import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  GoldLedger,
  GOLD_SCHEMA,
  MAX_GOLD,
  nextGoldBalance,
  canChangeGold,
} from "../src/gold.js";

test("ouro valida saldo, valores inteiros, insuficiência e limite do protocolo", () => {
  assert.equal(nextGoldBalance(100, 50), 150);
  assert.equal(nextGoldBalance(100, -100), 0);
  assert.equal(nextGoldBalance(MAX_GOLD - 1, 1), MAX_GOLD);
  for (const [balance, delta] of [
    [100, -101],
    [MAX_GOLD, 1],
    [0, 0.5],
    [-1, 1],
    [NaN, 1],
    [0, Infinity],
    [0, Number.MAX_SAFE_INTEGER + 1],
  ]) {
    assert.equal(canChangeGold(balance!, delta!), false);
    assert.throws(() => nextGoldBalance(balance!, delta!));
  }
});

test("lançamento registra a origem e impede repetição, inclusive com uma nova instância", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(GOLD_SCHEMA);
    const ledger = new GoldLedger(db, () => 1900000000000);
    const economy = { gold_total_count: 100 };
    assert.equal(
      ledger.change(economy, 1, 30, "mission:7", "mission:7:reward"),
      true,
    );
    assert.equal(economy.gold_total_count, 130);
    assert.equal(
      new GoldLedger(db).change(
        economy,
        1,
        30,
        "mission:7",
        "mission:7:reward",
      ),
      false,
    );
    assert.equal(economy.gold_total_count, 130);
    assert.throws(
      () => ledger.change(economy, 1, 40, "mission:7", "mission:7:reward"),
      /reutilizado/,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!.n,
      1,
    );
    const row = db
      .prepare(
        "SELECT reason,delta,balance_before,balance_after FROM gold_transactions",
      )
      .get()!;
    assert.deepEqual(
      { ...row },
      {
        reason: "mission:7",
        delta: 30,
        balance_before: 100,
        balance_after: 130,
      },
    );
    const other = { gold_total_count: 10 };
    assert.equal(
      ledger.change(other, 2, 30, "mission:7", "mission:7:reward"),
      true,
    );
    assert.equal(other.gold_total_count, 40);
    assert.throws(
      () => ledger.change(economy, 1, -131, "upgrade"),
      /insuficiente/,
    );
    assert.equal(economy.gold_total_count, 130);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!.n,
      2,
    );
  } finally {
    db.close();
  }
});
