import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { GOLD_SCHEMA, GoldError } from "../src/gold.js";
import {
  currencies,
  currencyBalance,
  nextCurrencyBalance,
  CurrencyLedger,
  CurrencyError,
  CURRENCY_SCHEMA,
  type Currency,
  type CurrencyState,
} from "../src/features/currencies/index.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(GOLD_SCHEMA + CURRENCY_SCHEMA);
  return {
    db,
    ledger: new CurrencyLedger(db),
    state: {
      economy: { gold_total_count: 100 },
      player: {
        point: 100,
        gift_token: 100,
        strategy: 100,
        crystals_count: 0,
        weary: 100,
      },
      packets: {
        4725: {
          opcode: 4725,
          message: {
            tokenInfos: [
              { masterType: 1, amount: 7, expiredDate: "" },
              { masterType: 11, amount: 100, expiredDate: "" },
            ],
          },
        },
      },
    } as CurrencyState,
  };
}
test("moedas cadastradas têm saldos separados, limites de protocolo e lançamentos idempotentes", () => {
  const s = setup();
  try {
    for (const currency of Object.keys(currencies) as Currency[]) {
      const before = currencyBalance(s.state, currency);
      assert.equal(
        s.ledger.change(s.state, 1, currency, 50, "reward", "reward:1"),
        true,
      );
      assert.equal(
        new CurrencyLedger(s.db).change(
          s.state,
          1,
          currency,
          50,
          "reward",
          "reward:1",
        ),
        false,
      );
      assert.equal(currencyBalance(s.state, currency), before + 50);
      s.ledger.change(s.state, 1, currency, -20, "upgrade", "upgrade:1");
      assert.equal(currencyBalance(s.state, currency), before + 30);
      assert.throws(
        () => s.ledger.change(s.state, 1, currency, 51, "reward", "reward:1"),
        CurrencyError,
      );
      for (const [balance, delta] of [
        [0, -1],
        [0, 0.5],
        [currencies[currency].max, 1],
        [-1, 1],
      ])
        assert.throws(
          () => nextCurrencyBalance(currency, balance!, delta!),
          CurrencyError,
        );
    }
    assert.equal(
      s.db.prepare("SELECT count(*) AS n FROM currency_transactions").get()!.n,
      Object.keys(currencies).length * 2,
    );
    assert.equal(s.state.packets![4725]!.message!.tokenInfos[0].amount, 7);
    assert.equal(s.state.player!.crystals_count, 0); // Crystal balance belongs to economy, not PlayerInfo.
    s.ledger.change(s.state, 2, "diamonds", 1, "reward", "reward:1");
    assert.equal(currencyBalance(s.state, "diamonds"), 131);
  } finally {
    s.db.close();
  }
});
test("custo em várias moedas falha integralmente e conserva ouro e histórico antigos", () => {
  const s = setup();
  try {
    const before = structuredClone(s.state);
    assert.throws(
      () =>
        s.ledger.changeMany(
          s.state,
          1,
          { gold: -10, diamonds: -101 },
          "purchase",
          "purchase:1",
        ),
      /insuficiente/,
    );
    assert.deepEqual(s.state, before);
    assert.equal(
      s.db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!.n,
      0,
    );
    assert.equal(
      s.db.prepare("SELECT count(*) AS n FROM currency_transactions").get()!.n,
      0,
    );
    const adapter = s.ledger.goldAdapter();
    assert.throws(
      () => adapter.change(s.state.economy, 1, -101, "fashion"),
      GoldError,
    );
    adapter.change(s.state.economy, 1, -10, "fashion", "fashion:1");
    assert.equal(currencyBalance(s.state, "gold"), 90);
    assert.equal(
      s.db.prepare("SELECT count(*) AS n FROM gold_transactions").get()!.n,
      1,
    );
    assert.equal(
      s.db.prepare("SELECT count(*) AS n FROM currency_transactions").get()!.n,
      1,
    );
    s.ledger.changeMany(
      s.state,
      1,
      { diamonds: -10, boundDiamonds: -5 },
      "purchase",
      "purchase:2",
    );
    assert.equal(currencyBalance(s.state, "diamonds"), 90);
    assert.equal(currencyBalance(s.state, "boundDiamonds"), 95);
  } finally {
    s.db.close();
  }
});
