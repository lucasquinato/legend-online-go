import { test } from "node:test";
import assert from "node:assert/strict";
import { gameDay, gameTimeZone, gameResetHour } from "../src/game-clock.js";
test("dia global vira às 04h de São Paulo, sem depender do relógio do cliente", () => {
  assert.equal(gameTimeZone, "America/Sao_Paulo");
  assert.equal(gameResetHour, 4);
  assert.equal(gameDay(Date.parse("2031-01-01T06:59:59.999Z")), "2030-12-31");
  assert.equal(gameDay(Date.parse("2031-01-01T07:00:00.000Z")), "2031-01-01");
  assert.equal(gameDay(Date.parse("2031-05-12T03:00:00.000Z")), "2031-05-11");
});
