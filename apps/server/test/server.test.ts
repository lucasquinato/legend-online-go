import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { createServer as httpServer } from "node:http";
import {
  createServer as tcpServer,
  createConnection,
  type AddressInfo,
} from "node:net";
import {
  publicEncrypt,
  createPublicKey,
  constants,
  createHash,
} from "node:crypto";
import { projectRoot, type Config } from "../src/config.js";
import { Store, ReplayAuth } from "../src/store.js";
import { GameServer } from "../src/game.js";
import { buildHttp } from "../src/http.js";
import {
  INITIAL_KEY,
  crypt,
  frame,
  FrameReader,
  protoString,
  protoInt,
  loginFields,
} from "../src/protocol.js";
import { createPolicyServer } from "../src/policy.js";
import { AssetCache } from "../src/assets.js";
import { HttpArchive } from "../src/http-capture.js";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { inflateSync } from "node:zlib";
import {
  compileTutorial,
  loadScenario,
  matchRequest,
} from "../src/tutorial.js";

function setup(mode: Config["mode"] = "replay") {
  const base = join(projectRoot, ".test-data");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "run-"));
  const config: Config = {
    mode,
    tutorialEngine: "capture",
    httpHost: "127.0.0.1",
    httpPort: 0,
    publicOrigin: "http://127.0.0.1:8080",
    gameHost: "127.0.0.1",
    gamePort: 0,
    advertisedGameHost: "127.0.0.1",
    upstreamOrigin: "https://servidor.legendremake.com",
    upstreamGameHost: "127.0.0.1",
    upstreamGamePort: 0,
    upstreamTimeoutMs: 10_000,
    dataDir: dir,
    fixturePath: join(projectRoot, "fixtures/bootstrap.json"),
    capturePackets: true,
  };
  const store = new Store(dir);
  if (mode === "tutorial") {
    mkdirSync(join(dir, "tutorial"), { recursive: true });
    writeFileSync(
      join(dir, "tutorial", "scenario.json"),
      JSON.stringify({
        version: 1,
        userId: 1810,
        connection: "mock-session",
        capturedAt: new Date().toISOString(),
        lastProcess: 19000,
        registration: { nickname: "Pirata", sex: 1, icon: 1, camp: 1 },
        login: [
          {
            frame: frame(3, 1810, protoInt(1, 1810)).toString("base64"),
            delayMs: 0,
          },
        ],
        steps: [
          {
            request: frame(10022, 1810, protoString(2, "battle-test")).toString(
              "base64",
            ),
            responses: [],
          },
          {
            request: frame(
              10008,
              1810,
              Buffer.concat([
                protoString(1, "battle-test"),
                protoInt(2, 3),
                protoInt(3, 30811),
              ]),
            ).toString("base64"),
            responses: [],
          },
          {
            request: frame(5017, 1810, protoInt(1, 19000)).toString("base64"),
            responses: [
              {
                frame: frame(1, 1810, protoInt(1, 19000)).toString("base64"),
                delayMs: 10,
              },
            ],
          },
        ],
      }),
    );
  }
  const auth = new ReplayAuth(store);
  const game = new GameServer(config, store, auth);
  const app = buildHttp(config, store, auth, game);
  return {
    config,
    store,
    auth,
    game,
    app,
    async close() {
      await game.close();
      await app.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("gateway preserva bytes HTTP/AMF completos e remove credenciais dos formulários e URLs", async () => {
  const s = setup("online"),
    binary = Buffer.from([0, 3, 0, 0, 1, 255, 128, 42]);
  const upstream = httpServer((req, res) => {
    res.setHeader("content-type", "application/x-amf");
    res.write(binary.subarray(0, 3));
    res.end(binary.subarray(3));
  });
  try {
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    s.config.upstreamOrigin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    const payload = Buffer.from([0, 3, 0, 0, 0, 1, 17, 10, 42]);
    const reply = await s.app.inject({
      method: "POST",
      url: "/messagebroker/amf",
      payload,
      headers: { "content-type": "application/x-amf" },
    });
    assert.deepEqual(reply.rawPayload, binary);
    await s.app.inject({
      method: "POST",
      url: "/maillist?key=query-secret",
      payload: "userId=1810&key=form-secret",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const dir = join(s.store.dir, "http"),
      index = readdirSync(dir).find((n) => n.endsWith(".jsonl"))!;
    const records = readFileSync(join(dir, index), "utf8")
      .trim()
      .split("\n")
      .map((v) => JSON.parse(v));
    assert.equal(records.length, 2);
    assert.deepEqual(readFileSync(join(dir, records[0].request.file)), payload);
    assert.deepEqual(readFileSync(join(dir, records[0].response.file)), binary);
    assert.equal(records[0].complete, true);
    assert.equal(
      records[0].response.sha256,
      createHash("sha256").update(binary).digest("hex"),
    );
    assert.doesNotMatch(JSON.stringify(records), /query-secret|form-secret/);
    assert.doesNotMatch(
      readFileSync(join(dir, records[1].request.file), "utf8"),
      /form-secret/,
    );
    const archive = new HttpArchive(s.store.dir);
    assert.equal(
      archive.begin(
        "POST",
        new URL("/launcher/api/login", s.config.upstreamOrigin),
        "application/json",
        Buffer.from('{"password":"never-save"}'),
        200,
        "application/json",
      ),
      undefined,
    );
  } finally {
    await s.close();
    upstream.closeAllConnections();
    await new Promise<void>((r) => upstream.close(() => r()));
  }
});

test("resposta HTTP interrompida não vira objeto completo e remove o arquivo temporário", async () => {
  const s = setup("online");
  try {
    const archive = new HttpArchive(s.store.dir),
      source = new Readable({
        read() {
          this.push(Buffer.from("partial"));
          this.destroy(new Error("interrupted"));
        },
      });
    const transfer = archive.begin(
      "POST",
      new URL("/messagebroker/amf", s.config.upstreamOrigin),
      "application/x-amf",
      Buffer.from([0, 3]),
      200,
      "application/x-amf",
    )!;
    const stream = transfer.stream(source);
    await assert.rejects(async () => {
      for await (const chunk of stream) {
        void chunk;
      }
    }, /interrupted/);
    const dir = join(s.store.dir, "http"),
      index = readdirSync(dir).find((n) => n.endsWith(".jsonl"))!;
    const record = JSON.parse(readFileSync(join(dir, index), "utf8").trim());
    assert.equal(record.complete, false);
    assert.equal(record.response, undefined);
    assert.ok(!readdirSync(dir).some((n) => n.endsWith(".part")));
  } finally {
    await s.close();
  }
});
function loginBody(proof: string, key: Buffer) {
  return Buffer.concat([
    protoString(2, proof),
    ...Array.from(key, (b) => protoInt(3, b)),
  ]);
}
async function receive(
  socket: ReturnType<typeof createConnection>,
  reader: FrameReader,
  expected: number,
  send: () => void,
): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const packets: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.off("data", onData);
      reject(new Error("TCP timeout"));
    }, 5000);
    function onData(chunk: Buffer) {
      try {
        reader.push(chunk, (p) => packets.push(p));
        if (packets.length >= expected) {
          clearTimeout(timer);
          socket.off("data", onData);
          resolve(packets);
        }
      } catch (e) {
        clearTimeout(timer);
        socket.off("data", onData);
        reject(e);
      }
    }
    socket.on("data", onData);
    send();
  });
}

test("TCP aceita pacotes fragmentados/coalescidos e rejeita adulteração", () => {
  const key = Buffer.from(INITIAL_KEY);
  const first = frame(
    20001,
    1265,
    loginBody("proof", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])),
  );
  const second = frame(8224, 1265, Buffer.from([8, 1]));
  const wire = Buffer.concat([crypt(first, key), crypt(second, key)]);
  const parser = new FrameReader();
  const result: Buffer[] = [];
  for (let i = 0; i < wire.length; i += 3)
    parser.push(wire.subarray(i, i + 3), (p) => result.push(p));
  assert.deepEqual(result, [first, second]);
  const damaged = frame(8224, 1265);
  damaged[12] = 1;
  assert.throws(
    () =>
      new FrameReader().push(
        crypt(damaged, Buffer.from(INITIAL_KEY)),
        () => {},
      ),
    /Checksum/,
  );
});

test("tutorial local valida criação, progresso HTTP/TCP e encerra ações fora do percurso", async () => {
  const s = setup("tutorial");
  let socket: ReturnType<typeof createConnection> | undefined;
  try {
    await s.store.createUser("tutorial_test", "a-test-password-123", 1810);
    s.store.initTutorialProfile(1810);
    const ticket = s.store.issue(1810);
    const key = createPublicKey({ key: s.auth.jwk, format: "jwk" });
    const temporary = "7654321";
    const p = publicEncrypt(
      { key, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(`tutorial_test|${ticket}|${temporary}|1810`),
    ).toString("base64");
    s.auth.login(p);
    const proof = createHash("md5").update(temporary).digest("hex");
    assert.match(
      (await s.app.inject("/loginselectlist?username=tutorial_test")).body,
      /Active="false"/,
    );
    const register = (icon: string) =>
      s.app.inject({
        method: "POST",
        url: "/visualizeregister",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams({
          userid: "1810",
          key: proof,
          nickname: "Pirata",
          sex: "1",
          icon,
          camp: "1",
        }).toString(),
      });
    assert.match((await register("2")).body, /value="false"/);
    assert.match((await register("1")).body, /value="true"/);
    assert.match(
      (await s.app.inject("/loginselectlist?username=tutorial_test")).body,
      /Active="true"/,
    );
    const progress = await s.app.inject({
      method: "POST",
      url: "/updateplayernovice",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        userid: "1810",
        key: proof,
        op: "1",
        noviceprocess: "10000",
      }).toString(),
    });
    assert.equal(progress.body, "10000");
    await s.game.listen();
    socket = createConnection({
      host: "127.0.0.1",
      port: (s.game.server.address() as AddressInfo).port,
    });
    await new Promise<void>((r, e) => {
      socket!.once("connect", r);
      socket!.once("error", e);
    });
    const chosen = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
      reader = new FrameReader();
    reader.key = Buffer.from(chosen);
    const hello = await receive(socket, reader, 1, () =>
      socket!.write(
        crypt(
          frame(20001, 1810, loginBody(proof, chosen)),
          Buffer.from(INITIAL_KEY),
        ),
      ),
    );
    assert.equal(hello[0]!.readUInt16BE(6), 3);
    const sendKey = Buffer.from(chosen);
    socket.write(
      crypt(frame(10022, 1810, protoString(2, "battle-test")), sendKey),
    );
    socket.write(
      crypt(frame(10022, 1810, protoString(2, "battle-test")), sendKey),
    );
    const skill = (id: number) =>
      frame(
        10008,
        1810,
        Buffer.concat([
          protoString(1, "battle-test"),
          protoInt(2, 3),
          protoInt(3, id),
        ]),
      );
    const deniedSkill = await receive(socket, reader, 1, () =>
      socket!.write(crypt(skill(30711), sendKey)),
    );
    assert.equal(deniedSkill[0]!.readUInt16BE(6), 75);
    assert.equal(s.store.tutorialProfile(1810)!.process, 10000);
    socket.write(crypt(skill(30811), sendKey));
    const response = await receive(socket, reader, 1, () =>
      socket!.write(crypt(frame(5017, 1810, protoInt(1, 19000)), sendKey)),
    );
    assert.equal(response[0]!.readUInt16BE(6), 1);
    assert.equal(s.store.tutorialProfile(1810)!.process, 19000);
    const closed = new Promise<void>((r) => socket!.once("close", () => r()));
    socket.write(crypt(frame(9999, 1810), sendKey));
    await closed;
    assert.equal(
      s.store.db
        .prepare(
          "SELECT count(*) AS n FROM tutorial_events WHERE kind='divergence'",
        )
        .get()?.n,
      1,
    );
  } finally {
    socket?.destroy();
    await s.close();
  }
});

test("compilador exige captura inicial e conserva ordem/tempo sem credenciais", async () => {
  const s = setup();
  try {
    mkdirSync(join(s.config.dataDir, "tutorial"), { recursive: true });
    assert.throws(() => compileTutorial(s.store, 1810), /Nenhuma sessão/);
    const connection = "tutorial-mock";
    const hello = frame(3, 1810, protoInt(1, 1810)),
      request = frame(5017, 1810, protoInt(1, 19000)),
      reply = frame(1, 1810, protoInt(1, 19000));
    s.store.tutorialEvent("tcp-login", 1810, { connection }, connection);
    s.store.tutorialEvent("http", 1810, {
      path: "/visualizeregister",
      input: { nickname: "Pirata", sex: "1", icon: "1", camp: "1" },
      response: '<root value="true"/>',
    });
    s.store.record("in", hello, true, connection);
    s.store.record("out", request, true, connection);
    s.store.record("in", reply, true, connection);
    const scenario = compileTutorial(s.store, 1810);
    assert.equal(scenario.steps.length, 1);
    assert.equal(scenario.lastProcess, 19000);
    assert.equal(loadScenario(s.store).userId, 1810);
    assert.equal(
      matchRequest(frame(5017, 1, protoInt(1, 19000)), request),
      true,
    );
    assert.equal(
      matchRequest(frame(5017, 1, protoInt(1, 18000)), request),
      false,
    );
    assert.equal(scenario.login[0]!.frame, hello.toString("base64"));
    assert.equal(
      scenario.steps[0]!.responses[0]!.frame,
      reply.toString("base64"),
    );
  } finally {
    await s.close();
  }
});

test("replay autentica por HTTP/RSA e entrega a captura por TCP negociado", async () => {
  const s = setup();
  let socket: ReturnType<typeof createConnection> | undefined;
  try {
    await s.store.createUser("pirata", "a-test-password-123");
    await s.game.listen();
    s.config.gamePort = (s.game.server.address() as AddressInfo).port;
    const denied = await s.app.inject({
      method: "POST",
      url: "/launcher/api/login",
      payload: { username: "pirata", password: "incorrect" },
    });
    assert.equal(denied.json().ok, false);
    const login = await s.app.inject({
      method: "POST",
      url: "/launcher/api/login",
      payload: { username: "pirata", password: "a-test-password-123" },
    });
    const ticket = login.json().ticket;
    assert.equal(login.json().ok, true);
    const resume = await s.app.inject({
      method: "POST",
      url: "/launcher/api/resume",
      payload: { username: "pirata", ticket },
    });
    assert.equal(resume.json().ok, true);
    const cfg = await s.app.inject("/client/config.xml");
    assert.match(cfg.body, /SocketPort="\d+"/);
    const n = cfg.body.match(/PublicKeyModulus="([^"]+)"/)![1];
    const e = cfg.body.match(/publicExponent="([^"]+)"/)![1];
    const publicKey = createPublicKey({
      key: {
        kty: "RSA",
        n: Buffer.from(n, "base64").subarray(1).toString("base64url"),
        e: Buffer.from(e, "base64").toString("base64url"),
      },
      format: "jwk",
    });
    const temporary = "1234567";
    const p = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(`pirata|${ticket}|${temporary}|1265`),
    ).toString("base64");
    const flash = await s.app.inject({
      method: "POST",
      url: "/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        p,
        site: "broas_0905",
        loginType: "4",
      }).toString(),
    });
    assert.match(flash.body, /value="true"/);
    const invalid = await s.app.inject({
      method: "POST",
      url: "/login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "p=bad",
    });
    assert.match(invalid.body, /value="false"/);
    const proof = createHash("md5").update(temporary).digest("hex");
    const chosen = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    socket = createConnection({ host: "127.0.0.1", port: s.config.gamePort });
    await new Promise<void>((resolve, reject) => {
      socket!.once("connect", resolve);
      socket!.once("error", reject);
    });
    const reader = new FrameReader();
    reader.key = Buffer.from(chosen);
    const snapshot = JSON.parse(readFileSync(s.config.fixturePath, "utf8"));
    const first = crypt(
      frame(20001, 1265, loginBody(proof, chosen)),
      Buffer.from(INITIAL_KEY),
    );
    const replies = await receive(socket, reader, snapshot.login.length, () => {
      socket!.write(first.subarray(0, 3));
      socket!.write(first.subarray(3));
    });
    assert.deepEqual(
      replies,
      snapshot.login.map((b: string) => Buffer.from(b, "base64")),
    );
    const initial = await receive(socket, reader, snapshot.initial.length, () =>
      socket!.write(
        crypt(frame(8224, 1265, Buffer.from([8, 1])), Buffer.from(chosen)),
      ),
    );
    assert.deepEqual(
      initial,
      snapshot.initial.map((b: string) => Buffer.from(b, "base64")),
    );
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n,
      1,
    );
  } finally {
    socket?.destroy();
    await s.close();
  }
});

test("gateway reescreve configuração/login, transmite TCP intacto e registra dependências", async () => {
  const s = setup("online");
  const received: Buffer[] = [];
  let client: ReturnType<typeof createConnection> | undefined;
  const mockTcp = tcpServer((socket) => {
    const reader = new FrameReader();
    let replyKey = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      received.push(chunk);
      reader.push(chunk, (p) => {
        const opcode = p.readUInt16BE(6);
        if (opcode === 20001) {
          const key = loginFields(p).key;
          reader.key = Buffer.from(key);
          replyKey = Buffer.from(key);
          const response = crypt(frame(3, 1265, Buffer.from([8, 1])), replyKey);
          socket.write(response.subarray(0, 2));
          socket.write(response.subarray(2));
        } else {
          socket.write(crypt(frame(4153, 1265, Buffer.from([8, 1])), replyKey));
        }
      });
    });
  });
  const mockHttp = httpServer((request, response) => {
    if (request.url === "/client/config.xml") {
      response.setHeader("content-type", "application/xml");
      response.end(
        `<root><REQUEST_PATH value="${s.config.upstreamOrigin}/"/><ResourcePath value="${s.config.upstreamOrigin}/cdn/"/><SocktPath value="127.0.0.1" SocketPort="9999"/></root>`,
      );
    } else if (request.url === "/login") {
      response.setHeader("content-type", "application/xml");
      response.end(
        `<root value="true" Address="127.0.0.1" Port="${(mockTcp.address() as AddressInfo).port}"/>`,
      );
    } else if (request.url === "/launcher/api/login") {
      let data = "";
      request.on("data", (b) => (data += b));
      request.on("end", () => {
        assert.equal(JSON.parse(data).username, "test");
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            ok: true,
            ticket: "mock-ticket",
            url: s.config.upstreamOrigin + "/play?key=mock-ticket",
          }),
        );
      });
    } else {
      response.setHeader("content-type", "application/octet-stream");
      response.end("sample-asset");
    }
  });
  try {
    await new Promise<void>((r) => mockTcp.listen(0, "127.0.0.1", r));
    await new Promise<void>((r) => mockHttp.listen(0, "127.0.0.1", r));
    s.config.upstreamOrigin = `http://127.0.0.1:${(mockHttp.address() as AddressInfo).port}`;
    const config = await s.app.inject("/client/config.xml");
    assert.match(config.body, /http:\/\/127\.0\.0\.1:8080\/cdn/);
    assert.match(config.body, /SocketPort="0"/);
    const login = await s.app.inject({
      method: "POST",
      url: "/launcher/api/login",
      payload: { username: "test", password: "not-recorded" },
    });
    assert.equal(
      login.json().url,
      "http://127.0.0.1:8080/play?key=mock-ticket",
    );
    await s.app.inject({
      method: "POST",
      url: "/login",
      payload: "p=opaque",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    await s.game.listen();
    const port = (s.game.server.address() as AddressInfo).port;
    const asset = await s.app.inject("/cdn/example.swf?rnd=private-query");
    assert.equal(asset.body, "sample-asset");
    const dependencies = (await s.app.inject("/server/dependencies")).json();
    assert.equal(dependencies[0].path, "/cdn/example.swf");
    assert.equal(
      dependencies[0].sha256,
      createHash("sha256").update("sample-asset").digest("hex"),
    );
    client = createConnection({ host: "127.0.0.1", port });
    await new Promise<void>((r, e) => {
      client!.once("connect", r);
      client!.once("error", e);
    });
    const chosen = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const reader = new FrameReader();
    reader.key = Buffer.from(chosen);
    const hello = crypt(
      frame(20001, 1265, loginBody("mock-proof", chosen)),
      Buffer.from(INITIAL_KEY),
    );
    const replies = await receive(client, reader, 1, () =>
      client!.write(hello),
    );
    assert.equal(replies[0]!.readUInt16BE(6), 3);
    const query = crypt(frame(8224, 1265), Buffer.from(chosen));
    const data = await receive(client, reader, 1, () => client!.write(query));
    assert.equal(data[0]!.readUInt16BE(6), 4153);
    assert.deepEqual(Buffer.concat(received), Buffer.concat([hello, query]));
    const protocols = (await s.app.inject("/server/protocols")).json();
    assert.ok(protocols.some((p: { opcode: number }) => p.opcode === 20001));
    const capture = readFileSync(
      join(
        s.config.dataDir,
        `packets-${new Date().toISOString().slice(0, 10)}.jsonl`,
      ),
      "utf8",
    );
    assert.doesNotMatch(capture, /mock-proof|mock-ticket|not-recorded|20001/);
  } finally {
    client?.destroy();
    await s.close();
    mockHttp.closeAllConnections();
    await new Promise<void>((r) => mockHttp.close(() => r()));
    await new Promise<void>((r) => mockTcp.close(() => r()));
  }
});

test("política Flash responde à solicitação fragmentada na conexão TCP", async () => {
  const server = createPolicyServer(5004);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const client = createConnection({
    host: "127.0.0.1",
    port: (server.address() as AddressInfo).port,
  });
  try {
    const reply = await new Promise<string>((resolve, reject) => {
      let data = "";
      client.on("data", (b) => (data += b));
      client.once("end", () => resolve(data));
      client.once("error", reject);
      client.write("<policy-file-");
      client.write("request/>\0");
    });
    assert.match(reply, /to-ports="5004"/);
    assert.ok(reply.endsWith("\0"));
  } finally {
    client.destroy();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("módulo da campanha atende offline o nome versionado publicado pelo Flash sem alterar o acervo online", async () => {
  const s = setup("tutorial");
  const originalDb = new DatabaseSync(join(projectRoot, "data/state.sqlite"), {
    readOnly: true,
  });
  try {
    s.config.resourceMode = "offline";
    const paths = [
      "/cdn/13.png",
      "/cdn/13_2b946fcf.png",
      "/client/code_md5.dat",
      "/client/size.xml",
    ];
    for (const path of paths) {
      const row = originalDb
        .prepare("SELECT * FROM assets WHERE path=?")
        .get(path)!;
      assert.ok(row, `Recurso original preservado: ${path}`);
      s.store.db
        .prepare("INSERT INTO assets VALUES(?,?,?,?,?,?)")
        .run(
          row.id!,
          row.path!,
          row.bytes!,
          row.sha256!,
          row.content_type!,
          row.saved_at!,
        );
      mkdirSync(join(s.config.dataDir, "assets/objects"), { recursive: true });
      writeFileSync(
        join(s.config.dataDir, "assets/objects", row.sha256 + ".bin"),
        readFileSync(
          join(projectRoot, "data/assets/objects", row.sha256 + ".bin"),
        ),
      );
    }
    const before = s.store.db.prepare("SELECT * FROM assets ORDER BY id").all();
    const index = await s.app.inject("/client/code_md5.dat?rnd=321");
    assert.equal(index.statusCode, 200);
    const xml = inflateSync(inflateSync(index.rawPayload)).toString();
    const row = xml.match(/<Item\b[^>]*name="13\.png"[^>]*\/>/)![0];
    const md5 = row.match(/\bmd5="([^"]+)"/)![1];
    const path = `/cdn/13_${md5}.png`;
    const versioned = await s.app.inject(path + "?rnd=123");
    assert.equal(versioned.statusCode, 200);
    assert.equal(
      createHash("md5").update(versioned.rawPayload).digest("hex").slice(8, 16),
      md5,
    );
    // Reproduce handleModule's direct CWS path, rather than just HTTP success.
    assert.equal(versioned.rawPayload.subarray(0, 3).toString(), "CWS");
    assert.equal(
      inflateSync(versioned.rawPayload.subarray(8)).length + 8,
      versioned.rawPayload.readUInt32LE(4),
    );
    assert.equal(versioned.headers["cache-control"], "no-store");
    assert.equal(
      versioned.headers["x-asset-sha256"],
      createHash("sha256").update(versioned.rawPayload).digest("hex"),
    );
    const sizes = (await s.app.inject("/client/size.xml")).body;
    const sizeRow = sizes.match(/<Item\b[^>]*name="13\.png"[^>]*\/>/)![0];
    assert.ok(sizeRow.includes(`size="${versioned.rawPayload.length}"`));
    assert.deepEqual(
      (await s.app.inject("/cdn/13.png")).rawPayload,
      versioned.rawPayload,
    );
    assert.deepEqual(
      (await s.app.inject(path + "?rnd=456")).rawPayload,
      versioned.rawPayload,
    );
    assert.equal(
      s.store.db
        .prepare("SELECT status FROM dependencies WHERE path=?")
        .get(path)?.status,
      200,
    );
    assert.equal((await s.app.inject("/cdn/13_00000000.png")).statusCode, 503);
    assert.deepEqual(
      s.store.db.prepare("SELECT * FROM assets ORDER BY id").all(),
      before,
    );
    // The proxy must still serve original bytes when switched back online.
    s.config.mode = "online";
    const source = before.find((a) => a.path === "/cdn/13.png")!;
    const original = await s.app.inject("/cdn/13.png");
    assert.equal(original.statusCode, 200);
    assert.equal(original.headers["x-asset-sha256"], source.sha256);
    assert.notDeepEqual(original.rawPayload, versioned.rawPayload);
    assert.equal((await s.app.inject(path)).statusCode, 503);
  } finally {
    originalDb.close();
    await s.close();
  }
});

test("transferência interrompida não é registrada como recurso completo", async () => {
  const s = setup("online");
  const upstream = httpServer((_request, response) => {
    response.setHeader("content-type", "application/octet-stream");
    response.setHeader("content-length", "1024");
    response.flushHeaders();
    response.write("partial");
    setTimeout(() => response.destroy(), 25);
  });
  try {
    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    s.config.upstreamOrigin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    assert.equal((await s.app.inject("/cdn/broken.swf")).statusCode, 502);
    const row = s.store.db
      .prepare("SELECT * FROM dependencies WHERE path=?")
      .get("/cdn/broken.swf");
    assert.equal(row?.status, 599);
    assert.equal(row?.bytes, 7);
    assert.equal(
      s.store.db.prepare("SELECT count(*) AS n FROM assets").get()?.n,
      0,
    );
    assert.ok(
      !readdirSync(join(s.config.dataDir, "assets")).some((f) =>
        f.endsWith(".part"),
      ),
    );
  } finally {
    await s.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test("acervo salva bytes completos, atende offline e rejeita corrupção/arquivo ausente", async () => {
  const s = setup("replay");
  let hits = 0;
  const original = Buffer.from([0, 255, 83, 87, 70, 1, 2]);
  const upstream = httpServer((_req, res) => {
    hits++;
    res.setHeader("content-type", "application/x-shockwave-flash");
    res.end(original);
  });
  try {
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    s.config.upstreamOrigin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    const first = await s.app.inject("/cdn/tutorial.swf?rnd=123");
    assert.deepEqual(first.rawPayload, original);
    assert.equal(first.headers["x-asset-saved"], "true");
    const again = await s.app.inject("/cdn/tutorial.swf?rnd=456");
    assert.deepEqual(again.rawPayload, original);
    assert.equal(hits, 1);
    const loader = await s.app.inject("/client/Loading.swf?v=100");
    assert.deepEqual(loader.rawPayload, original);
    assert.equal(hits, 2);
    s.config.resourceMode = "offline";
    upstream.closeAllConnections();
    await new Promise<void>((r) => upstream.close(() => r()));
    assert.deepEqual(
      (await s.app.inject("/client/Loading.swf?v=999999999999")).rawPayload,
      original,
    );
    assert.deepEqual(
      (await s.app.inject("/cdn/tutorial.swf")).rawPayload,
      original,
    );
    assert.equal((await s.app.inject("/cdn/missing.swf")).statusCode, 503);
    const cache = new AssetCache(s.config, s.store);
    const item = cache.list()[0]!;
    writeFileSync(cache.file(item), Buffer.alloc(original.length));
    assert.equal((await s.app.inject("/cdn/tutorial.swf")).statusCode, 503);
    assert.equal(
      (await s.app.inject("/server/assets/verify")).json().assets[0].valid,
      false,
    );
    const config = await s.app.inject("/client/config.xml");
    assert.doesNotMatch(
      config.body,
      new RegExp(
        s.config.upstreamOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    );
  } finally {
    if (upstream.listening) {
      upstream.closeAllConnections();
      await new Promise<void>((r) => upstream.close(() => r()));
    }
    await s.close();
  }
});
