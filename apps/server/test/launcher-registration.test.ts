import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { publicEncrypt, createPublicKey, constants } from "node:crypto";
import { Store, ReplayAuth } from "../src/store.js";
import { GameServer } from "../src/game.js";
import { buildHttp } from "../src/http.js";
import { loadConfig, projectRoot } from "../src/config.js";

function setup() {
  mkdirSync(join(projectRoot, ".test-data"), { recursive: true });
  const dir = mkdtempSync(join(projectRoot, ".test-data", "launcher-register-"));
  for (const folder of ["city", "tutorial"]) { mkdirSync(join(dir, folder)); copyFileSync(join(projectRoot, "data", folder, "scenario.json"), join(dir, folder, "scenario.json")); }
  const config = { ...loadConfig(), mode: "tutorial" as const, tutorialEngine: "dynamic" as const, dataDir: dir, gamePort: 0, capturePackets: false };
  const store = new Store(dir), auth = new ReplayAuth(store), game = new GameServer(config, store, auth), app = buildHttp(config, store, auth, game);
  const register = (username: string, password = "test-password-123") => app.inject({ method: "POST", url: "/launcher/api/register", headers: { "content-type": "application/json" }, payload: JSON.stringify({ username, password }) });
  return { store, auth, game, app, register, async cleanup() { await app.close(); await game.close(); store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test("cadastro do launcher emite sessão, preserva contas antigas e abre personagem novo no tutorial", async () => {
  const s = setup(); try {
    await s.store.createUser("existing", "old-password-123", 1901);
    const response = await s.register("new_mage"); assert.equal(response.statusCode, 200);
    const account = response.json(); assert.equal(account.ok, true); assert.equal(account.username, "new_mage"); assert.ok(account.ticket);
    const uid = s.store.user("new_mage")!.id; assert.equal(uid, 1902);
    assert.equal(s.store.validate(account.ticket, "new_mage"), uid);
    assert.equal(s.store.tutorialProfile(uid)!.active, 0); assert.equal(s.store.tutorialProfile(uid)!.process, 0);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM city_worlds WHERE user_id=?").get(uid)!.n, 0);
    assert.ok(await s.store.authenticate("existing", "old-password-123"));
    const login = await s.app.inject({ method: "POST", url: "/launcher/api/login", headers: { "content-type": "application/json" }, payload: JSON.stringify({ username: "new_mage", password: "test-password-123" }) });
    assert.equal(login.json().ok, true);
    assert.match((await s.app.inject("/loginselectlist?username=new_mage")).body, /Active="false"/);
    const encrypted = publicEncrypt({ key: createPublicKey({ key: s.auth.jwk, format: "jwk" }), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(`new_mage|${account.ticket}|1234567|${uid}`)).toString("base64");
    const session = s.auth.login(encrypted);
    const character = await s.app.inject({ method: "POST", url: "/visualizeregister", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ userid: String(uid), key: session.proof, nickname: "NovaMaga", sex: "1", icon: "3", camp: "1" }).toString() });
    assert.match(character.body, /value="true"/); assert.equal(s.store.tutorialProfile(uid)!.icon, 3);
    assert.equal(s.store.tutorialProfile(uid)!.process, 10000);
    assert.ok(s.game.world(uid).login().length > 0);
    const energy = s.store.db.prepare("SELECT m.detail FROM account_grants g JOIN local_mail m ON m.mail_id=g.mail_id AND m.user_id=g.user_id WHERE g.user_id=? AND g.grant_key='starter-energy-v1'").all(uid);
    assert.equal(energy.length, 1); const supplied = JSON.parse(String(energy[0]!.detail));
    assert.equal(supplied.annex1Name, 2030503); assert.equal(supplied.annex1Count, 9999);
  } finally { await s.cleanup(); }
});

test("cadastros concorrentes têm IDs exclusivos; duplicatas e entradas inválidas não deixam registros", async () => {
  const s = setup(); try {
    const responses = await Promise.all([s.register("first_user"), s.register("second_user"), s.register("first_user")]);
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 200, 409]);
    const users = s.store.db.prepare("SELECT id FROM users").all(); assert.equal(new Set(users.map(u => u.id)).size, 2);
    for (const [name, password] of [["x", "test-password-123"], ["bad name", "test-password-123"], ["valid_user", "short"], ["valid_user", "a".repeat(257)]]) {
      const r = await s.register(name!, password!); assert.equal(r.statusCode, 400); assert.equal(r.json().ok, false);
    }
    const invalid = await s.app.inject({ method: "POST", url: "/launcher/api/register", headers: { "content-type": "application/json" }, payload: "{invalid" });
    assert.equal(invalid.statusCode, 400); assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM users").get()!.n, 2);
  } finally { await s.cleanup(); }
});

test("falha ao preparar a conta desfaz perfil, usuário, correio e sessão", async () => {
  const s = setup(); try {
    s.store.ensureEnergyMail = () => { throw Error("injected failure"); };
    await assert.rejects(s.store.registerUser("rollback_user", "test-password-123"), /injected failure/);
    for (const table of ["users", "tutorial_profiles", "local_mail", "account_grants", "tickets"]) assert.equal(s.store.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n, 0);
  } finally { await s.cleanup(); }
});
