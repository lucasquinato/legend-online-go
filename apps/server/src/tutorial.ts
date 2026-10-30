import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checksum, fields } from "./protocol.js";
import type { Store } from "./store.js";
export const BACKGROUND_REQUESTS = new Set([5020, 20008, 20010, 5015, 15013]);

export interface TutorialResponse {
  frame: string;
  delayMs: number;
  battleId?: string;
}
export interface TutorialStep {
  request: string;
  responses: TutorialResponse[];
}
export interface TutorialScenario {
  version: 1;
  userId: number;
  connection: string;
  capturedAt: string;
  lastProcess: number;
  serverName?: string;
  registration: { nickname: string; sex: number; icon: number; camp: number };
  login: TutorialResponse[];
  steps: TutorialStep[];
}
export function scenarioPath(store: Store): string {
  return join(store.dir, "tutorial", "scenario.json");
}
export function loadScenario(store: Store): TutorialScenario {
  const scenario = JSON.parse(
    readFileSync(scenarioPath(store), "utf8"),
  ) as TutorialScenario;
  if (
    scenario.version !== 1 ||
    !scenario.userId ||
    !scenario.login?.length ||
    !scenario.steps?.length
  )
    throw new Error("Captura de tutorial incompleta");
  for (const text of [
    ...scenario.login.map((r) => r.frame),
    ...scenario.steps.flatMap((s) => [
      s.request,
      ...s.responses.map((r) => r.frame),
    ]),
  ]) {
    const p = Buffer.from(text, "base64");
    if (
      p.length < 20 ||
      p.readUInt16BE(2) !== p.length ||
      p.readUInt16BE(4) !== checksum(p)
    )
      throw new Error("Pacote inválido no tutorial");
  }
  return scenario;
}
export function matchRequest(actual: Buffer, expected: Buffer): boolean {
  if (actual.readUInt16BE(6) !== expected.readUInt16BE(6)) return false;
  // O cabeçalho não faz parte da ação: UID, extras e checksum pertencem à sessão.
  // Compara campos Protobuf por número, permitindo outra ordem de serialização.
  const canonical = (p: Buffer) =>
    fields(p.subarray(20))
      .sort((a, b) => a.number - b.number || a.wire - b.wire)
      .map(
        (f) =>
          `${f.number}:${f.wire}:${Buffer.isBuffer(f.value) ? f.value.toString("hex") : f.value}`,
      )
      .join("|");
  try {
    return canonical(actual) === canonical(expected);
  } catch {
    return actual.subarray(20).equals(expected.subarray(20));
  }
}
export function skillOrderMismatch(
  actual: Buffer,
  expected: Buffer,
):
  | { battle: string; hero: number; skill: number; expectedSkill: number }
  | undefined {
  if (actual.readUInt16BE(6) !== 10008 || expected.readUInt16BE(6) !== 10008)
    return;
  const a = fields(actual.subarray(20)),
    e = fields(expected.subarray(20));
  const battleA = a.find((f) => f.number === 1 && f.wire === 2),
    battleE = e.find((f) => f.number === 1 && f.wire === 2);
  const heroA = a.find((f) => f.number === 2 && f.wire === 0),
    heroE = e.find((f) => f.number === 2 && f.wire === 0);
  const skillA = a.find((f) => f.number === 3 && f.wire === 0),
    skillE = e.find((f) => f.number === 3 && f.wire === 0);
  if (
    !battleA ||
    !battleE ||
    !Buffer.isBuffer(battleA.value) ||
    !Buffer.isBuffer(battleE.value) ||
    !battleA.value.equals(battleE.value) ||
    !heroA ||
    !heroE ||
    heroA.value !== heroE.value ||
    !skillA ||
    !skillE ||
    skillA.value === skillE.value
  )
    return;
  const skill = Number(skillA.value),
    expectedSkill = Number(skillE.value),
    hero = Number(heroA.value);
  if (
    ![skill, expectedSkill, hero].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647,
    )
  )
    return;
  return { battle: battleA.value.toString("utf8"), hero, skill, expectedSkill };
}
export function compileTutorial(
  store: Store,
  userId: number,
  connection?: string,
): TutorialScenario {
  const sessions = store.db
    .prepare(
      "SELECT connection,at FROM tutorial_events WHERE kind='tcp-login' AND user_id=? ORDER BY seq",
    )
    .all(userId);
  const session = connection
    ? sessions.find((s) => s.connection === connection)
    : sessions[0];
  if (!session)
    throw new Error("Nenhuma sessão TCP capturada para este personagem");
  const rows = readdirSync(store.dir)
    .filter((f) => /^packets-.*\.jsonl$/.test(f))
    .sort()
    .flatMap((f) =>
      readFileSync(join(store.dir, f), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    )
    .filter((r) => r.connection === session.connection);
  const registration = store.db
    .prepare(
      "SELECT detail FROM tutorial_events WHERE kind='http' AND user_id=? ORDER BY seq",
    )
    .all(userId)
    .map((r) => JSON.parse(String(r.detail)))
    .find(
      (e) =>
        /^\/visualizeregister2?$/.test(e.path) &&
        e.input.nickname &&
        /value=["']true["']/.test(e.response),
    );
  if (!registration)
    throw new Error("Criação do personagem não foi capturada pelo gateway");
  const progress = store.db
    .prepare(
      "SELECT detail FROM tutorial_events WHERE kind='progress' AND connection=? ORDER BY seq",
    )
    .all(String(session.connection))
    .map((r) => Number(JSON.parse(String(r.detail)).process));
  const lastProcess = Math.max(10000, ...progress);
  if (lastProcess < 13000)
    throw new Error(
      "A captura ainda não terminou a primeira etapa do tutorial",
    );
  const scenario: TutorialScenario = {
    version: 1,
    userId,
    connection: String(session.connection),
    capturedAt: new Date().toISOString(),
    lastProcess,
    registration: {
      nickname: registration.input.nickname,
      sex: Number(registration.input.sex),
      icon: Number(registration.input.icon),
      camp: Number(registration.input.camp),
    },
    login: [],
    steps: [],
  };
  let current: TutorialStep | undefined;
  let origin = Date.parse(String(session.at));
  for (const row of rows) {
    const packet = Buffer.from(row.frame, "base64");
    if (
      BACKGROUND_REQUESTS.has(packet.readUInt16BE(6)) &&
      row.direction === "out"
    )
      continue;
    if (row.direction === "out") {
      origin = Date.parse(row.at);
      current = { request: row.frame, responses: [] };
      scenario.steps.push(current);
    } else {
      const response = {
        frame: row.frame,
        delayMs: Math.max(0, Date.parse(row.at) - origin),
      };
      if (current) current.responses.push(response);
      else scenario.login.push(response);
    }
  }
  if (!scenario.login.length || !scenario.steps.length)
    throw new Error("Faltam os pacotes de entrada do tutorial");
  const battleRequest = scenario.steps.find(
    (s) => Buffer.from(s.request, "base64").readUInt16BE(6) === 10007,
  );
  if (battleRequest) {
    const name = fields(
      Buffer.from(battleRequest.request, "base64").subarray(20),
    ).find((f) => f.number === 3 && f.wire === 2);
    if (name && Buffer.isBuffer(name.value))
      scenario.serverName = name.value.toString("utf8");
  }
  writeFileSync(scenarioPath(store), JSON.stringify(scenario, null, 2));
  return scenario;
}
