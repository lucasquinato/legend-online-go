import {
  createServer,
  createConnection,
  type Server,
  type Socket,
} from "node:net";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Config } from "./config.js";
import {
  FrameReader,
  crypt,
  checksum,
  loginFields,
  fields,
  frame,
  protoString,
  protoInt,
} from "./protocol.js";
import { Store, ReplayAuth } from "./store.js";
import { TutorialWorld } from "./world.js";
import { localPresence } from "./features/social/index.js";
import { GlobalChat } from "./features/messaging/global-chat.js";
import { BuildingUpdates } from "./features/settlement/building-updates.js";
import { tutorialGrade } from "./combat.js";
import {
  loadScenario,
  matchRequest,
  type TutorialScenario,
  type TutorialResponse,
  BACKGROUND_REQUESTS,
  skillOrderMismatch,
} from "./tutorial.js";

export interface Snapshot {
  userId: number;
  login: string[];
  initial: string[];
}
export class GameServer {
  private readonly globalChat: GlobalChat;
  readonly server: Server;
  private connections = new Set<Socket>();
  private upstreamPort: number;
  private snapshot?: Snapshot;
  readonly tutorial?: TutorialScenario;
  private worlds = new Map<number, TutorialWorld>();
  private worldSessions = new Set<number>();
  world(userId: number): TutorialWorld {
    let world = this.worlds.get(userId);
    if (!world) {
      world = new TutorialWorld(this.store, this.tutorial!, userId);
      this.worlds.set(userId, world);
    }
    return world;
  }
  resetWorld(userId: number): void {
    this.worlds.get(userId)?.city()?.disconnect();
    this.worlds.delete(userId);
    this.store.db
      .prepare("DELETE FROM city_worlds WHERE user_id=?")
      .run(userId);
    this.store.db
      .prepare("DELETE FROM tutorial_worlds WHERE user_id=?")
      .run(userId);
  }
  constructor(
    readonly config: Config,
    private store: Store,
    private auth: ReplayAuth,
    private log: (event: string, detail?: unknown) => void = () => {},
  ) {
    this.globalChat = new GlobalChat(store);
    if (config.mode !== "online") store.ensureEnergyMails();
    this.upstreamPort = config.upstreamGamePort;
    if (config.mode === "tutorial") this.tutorial = loadScenario(store);
    if (config.mode === "replay") {
      this.snapshot = JSON.parse(
        readFileSync(config.fixturePath, "utf8"),
      ) as Snapshot;
      for (const text of [...this.snapshot!.login, ...this.snapshot!.initial]) {
        const p = Buffer.from(text, "base64");
        if (
          p.length < 20 ||
          p.readUInt16BE(2) !== p.length ||
          p.readUInt16BE(4) !== checksum(p)
        )
          throw new Error("Fixture TCP inválida");
      }
    }
    this.server = createServer((socket) => {
      this.connections.add(socket);
      socket.once("close", () => this.connections.delete(socket));
      socket.setNoDelay(true);
      socket.on("error", () => {});
      if (config.mode === "online") this.relay(socket);
      else if (
        config.mode === "tutorial" &&
        config.tutorialEngine !== "capture"
      )
        this.playWorld(socket);
      else if (config.mode === "tutorial") this.playTutorial(socket);
      else this.replay(socket);
    });
  }
  private playWorld(socket: Socket): void {
    const buildings = new BuildingUpdates();
    let buildingClientReady = false;
    const reader = new FrameReader(),
      connection = randomUUID();
    let sendKey = Buffer.alloc(0),
      world: TutorialWorld | undefined;
    let detachChat: (() => void) | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const send = (responses: TutorialResponse[]) => {
      let last = 0;
      for (const response of responses) {
        // Snapshot readiness at enqueue time: delayed login packets must not
        // populate the delivery cache before Flash initializes BuildingManager.
        const buildingsReady = buildingClientReady;
        last = Math.max(last, response.delayMs);
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (socket.destroyed) return;
          try {
            if (response.battleId && response.battleId !== (world?.city()?.battleIdentity() ?? world?.state.battle?.id)) return;
            const scene = world?.city();
            const level = scene ? Number(scene.state.player.grades) : world
              ? tutorialGrade(world.state.wins, world.state.cityEntered) : 0;
            const packet = buildings.filter(Buffer.from(response.frame, "base64"), level, buildingsReady);
            const opcode = packet.readUInt16BE(6);
            // A delayed duplicate prepare must not reopen a finished maze battle.
            if (opcode === 157 && scene && scene.saved.map >= 8001 && scene.saved.map <= 8130 && scene.saved.battle?.finished) return;
            if (scene && scene.saved.map >= 8001 && scene.saved.map <= 8130 && [125, 127, 128, 157, 21, 131].includes(opcode))
              this.store.tutorialEvent("labyrinth-wire", world!.userId, {
                opcode,
                map: scene.saved.map,
                body: packet.subarray(20).toString("base64"),
              });
            this.store.record(
              "in",
              packet,
              this.config.capturePackets,
              connection,
            );
            socket.write(crypt(packet, sendKey));
          } catch (error) {
            this.log("world-send-error", {
              message: error instanceof Error ? error.message : String(error),
            });
            socket.destroy();
          }
        }, last);
        timers.add(timer);
      }
    };
    const pulse = setInterval(() => {
      if (!world) return;
      try {
        send(world.tick());
      } catch (error) {
        this.log("world-error", {
          message: error instanceof Error ? error.message : String(error),
        });
        socket.destroy();
      }
    }, 100);
    socket.once("close", () => {
      detachChat?.();
      clearInterval(pulse);
      for (const timer of timers) clearTimeout(timer);
      if (world) {
        try {
          world.city()?.disconnect();
          world.save();
          this.worlds.delete(world.userId);
        } catch (error) {
          // Retain the in-memory world if its final save failed.
          this.log("world-save-error", {
            userId: world.userId,
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.worldSessions.delete(world.userId);
        }
        try {
          localPresence(this.store, world.userId, false);
        } catch (error) {
          this.log("world-presence-error", {
            userId: world.userId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
    socket.setTimeout(300000, () => socket.destroy());
    socket.on("data", (chunk) => {
      try {
        reader.push(chunk, (packet) => {
          this.store.record(
            "out",
            packet,
            this.config.capturePackets,
            connection,
          );
          if (!world) {
            if (packet.readUInt16BE(6) !== 20001)
              throw new Error("Login obrigatório");
            const login = loginFields(packet),
              uid = packet.readInt32BE(8);
            if (
              !this.auth.validate(login.proof, uid) ||
              !this.store.tutorialProfile(uid)?.active
            )
              throw new Error("Sessão inválida");
            if (this.worldSessions.has(uid))
              throw new Error("Já existe uma sessão de jogo para esta conta");
            world = this.world(uid);
            reader.key = Buffer.from(login.key);
            sendKey = Buffer.from(login.key);
            this.worldSessions.add(uid);
            detachChat = this.globalChat.attach(uid, send, () => world!.city()?.currentTitleIdentity().id ?? 0);
            localPresence(this.store, uid, true);
            send(world.login());
            this.globalChat.ready(uid);
            return;
          }
          if (packet.readInt32BE(8) !== world.userId)
            throw new Error("UID inválido");
          if (packet.readUInt16BE(6) === 8271) buildingClientReady = true;
          if (this.globalChat.handle(world.userId, packet)) return;
          send(world.handle(packet));
        });
      } catch (error) {
        this.log("world-session-error", {
          message: error instanceof Error ? error.message : String(error),
        });
        socket.destroy();
      }
    });
  }
  private playTutorial(socket: Socket): void {
    const scenario = this.tutorial!;
    const reader = new FrameReader();
    const id = randomUUID();
    let sendKey = Buffer.alloc(0);
    let authenticated = false;
    let cursor = 0;
    const statePackets = new Map<number, string>();
    let lastDue = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    socket.once("close", () => {
      for (const timer of timers) clearTimeout(timer);
    });
    const send = (packets: TutorialResponse[]) => {
      const now = Date.now();
      for (const response of packets) {
        if (
          !Number.isFinite(response.delayMs) ||
          response.delayMs < 0 ||
          response.delayMs > 3600_000
        )
          throw new Error("Prazo inválido na captura");
        const due = Math.max(lastDue, now + response.delayMs);
        lastDue = due;
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            if (socket.destroyed) return;
            try {
              const packet = Buffer.from(response.frame, "base64");
              statePackets.set(packet.readUInt16BE(6), response.frame);
              this.store.record("in", packet, false, id);
              socket.write(crypt(packet, sendKey));
            } catch (error) {
              this.log("tutorial-send-error", {
                message: error instanceof Error ? error.message : String(error),
              });
              socket.destroy();
            }
          },
          Math.max(0, due - Date.now()),
        );
        timers.add(timer);
      }
    };
    socket.setTimeout(300_000, () => socket.destroy());
    socket.on("data", (chunk) => {
      try {
        reader.push(chunk, (packet) => {
          const opcode = packet.readUInt16BE(6);
          this.store.record("out", packet, false, id);
          if (!authenticated) {
            if (opcode !== 20001) throw new Error("Login obrigatório");
            const login = loginFields(packet);
            if (
              packet.readInt32BE(8) !== scenario.userId ||
              !this.auth.validate(login.proof, scenario.userId)
            )
              throw new Error("Sessão inválida");
            authenticated = true;
            reader.key = Buffer.from(login.key);
            sendKey = Buffer.from(login.key);
            send(scenario.login);
            return;
          }
          if (BACKGROUND_REQUESTS.has(opcode)) {
            if (opcode === 20008) {
              const time = new Date()
                .toISOString()
                .slice(0, 19)
                .replace("T", " ");
              send([
                {
                  frame: frame(
                    4234,
                    scenario.userId,
                    Buffer.concat([protoString(1, time),protoInt(2, Date.now())]),
                  ).toString("base64"),
                  delayMs: 0,
                },
              ]);
            } else {
              const code =
                opcode === 5015 ? 109 : opcode === 15013 ? 85 : undefined;
              const packet = code ? statePackets.get(code) : undefined;
              if (packet) send([{ frame: packet, delayMs: 0 }]);
            }
            return;
          }
          const step = scenario.steps[cursor];
          const skillOrder = step
            ? skillOrderMismatch(packet, Buffer.from(step.request, "base64"))
            : undefined;
          if (skillOrder) {
            this.store.tutorialEvent(
              "skill-order",
              scenario.userId,
              { cursor, ...skillOrder },
              id,
            );
            const body = Buffer.concat([
              protoString(1, skillOrder.battle),
              protoInt(2, skillOrder.hero),
              protoInt(3, skillOrder.skill),
              protoInt(4, 1),
            ]);
            send([
              {
                frame: frame(75, scenario.userId, body).toString("base64"),
                delayMs: 0,
              },
            ]);
            return;
          }
          // O fim de uma animação pode repetir pause/continue. A mesma chamada não cria outra ação.
          if (
            [10010, 10022].includes(opcode) &&
            (!step ||
              !matchRequest(packet, Buffer.from(step.request, "base64"))) &&
            scenario.steps
              .slice(0, cursor)
              .some((previous) =>
                matchRequest(packet, Buffer.from(previous.request, "base64")),
              )
          )
            return;
          if (
            !step ||
            !matchRequest(packet, Buffer.from(step.request, "base64"))
          ) {
            this.store.tutorialEvent(
              "divergence",
              scenario.userId,
              {
                cursor,
                received: opcode,
                expected: step
                  ? Buffer.from(step.request, "base64").readUInt16BE(6)
                  : null,
                actualBody:
                  opcode === 20001 || opcode === 83
                    ? undefined
                    : packet.subarray(20).toString("base64"),
                expectedBody: step
                  ? Buffer.from(step.request, "base64")
                      .subarray(20)
                      .toString("base64")
                  : undefined,
              },
              id,
            );
            this.log("tutorial-sequence-diverged", { cursor, opcode });
            socket.destroy();
            return;
          }
          cursor++;
          if (opcode === 5017) {
            const progress = fields(packet.subarray(20)).find(
              (f) => f.number === 1 && f.wire === 0,
            );
            if (progress)
              this.store.db
                .prepare(
                  "UPDATE tutorial_profiles SET process=? WHERE user_id=?",
                )
                .run(Number(progress.value), scenario.userId);
          }
          send(step.responses);
          if (cursor === scenario.steps.length)
            this.store.tutorialEvent(
              "scenario-requests-complete",
              scenario.userId,
              { steps: cursor, lastProcess: scenario.lastProcess },
              id,
            );
        });
      } catch {
        socket.destroy();
      }
    });
  }
  setUpstreamPort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Porta anunciada inválida");
    this.upstreamPort = port;
  }
  get activeConnections(): number {
    return this.config.mode === "online"
      ? Math.floor(this.connections.size / 2)
      : this.connections.size;
  }
  private relay(client: Socket): void {
    const id = randomUUID();
    const upstream = createConnection({
      host: this.config.upstreamGameHost,
      port: this.upstreamPort,
    });
    const outbound = new FrameReader();
    const inbound = new FrameReader();
    let observed = true;
    upstream.setNoDelay(true);
    this.connections.add(upstream);
    upstream.once("close", () => {
      this.connections.delete(upstream);
      client.destroy();
    });
    client.once("close", () => upstream.destroy());
    upstream.on("error", (err) => {
      this.log("upstream-tcp-error", {
        code: (err as NodeJS.ErrnoException).code,
      });
      client.destroy();
    });
    upstream.setTimeout(300_000, () => upstream.destroy());
    function observe(
      reader: FrameReader,
      chunk: Buffer,
      direction: "in" | "out",
      self: GameServer,
    ): void {
      if (!observed) return;
      try {
        reader.push(chunk, (packet) => {
          self.store.record(direction, packet, self.config.capturePackets, id);
          if (direction === "out" && packet.readUInt16BE(6) === 20001) {
            const negotiated = loginFields(packet).key;
            outbound.key = Buffer.from(negotiated);
            inbound.key = Buffer.from(negotiated);
          }
        });
      } catch {
        observed = false;
        self.log("protocol-observation-stopped", { connection: id });
      }
    }
    client.on("data", (chunk) => observe(outbound, chunk, "out", this));
    upstream.on("data", (chunk) => observe(inbound, chunk, "in", this));
    // O tráfego é encaminhado sem recriptografar ou editar pacotes.
    client.pipe(upstream);
    upstream.pipe(client);
  }
  private replay(socket: Socket): void {
    const reader = new FrameReader();
    const id = randomUUID();
    let sendKey = Buffer.alloc(0);
    let authenticated = false;
    let initialSent = false;
    const send = (items: string[]) => {
      for (const item of items) {
        const packet = Buffer.from(item, "base64");
        this.store.record("in", packet, false, id);
        socket.write(crypt(packet, sendKey));
      }
    };
    socket.setTimeout(60_000, () => socket.destroy());
    socket.on("data", (chunk) => {
      try {
        reader.push(chunk, (packet) => {
          const opcode = packet.readUInt16BE(6);
          this.store.record("out", packet, false, id);
          if (!authenticated) {
            if (opcode !== 20001)
              throw new Error("Login deve ser o primeiro pacote");
            const login = loginFields(packet);
            const uid = packet.readInt32BE(8);
            if (
              !this.auth.validate(login.proof, uid) ||
              uid !== this.snapshot!.userId
            )
              throw new Error("Sessão inválida");
            authenticated = true;
            reader.key = Buffer.from(login.key);
            sendKey = Buffer.from(login.key);
            send(this.snapshot!.login);
            return;
          }
          if (opcode === 8224 && !initialSent) {
            initialSent = true;
            send(this.snapshot!.initial);
            return;
          }
          // Replay não aceita mutações: fecha em vez de fingir que salvou uma ação.
          this.log("replay-unsupported-opcode", { opcode });
          socket.end();
        });
      } catch {
        socket.destroy();
      }
    });
  }
  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.gamePort, this.config.gameHost, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }
  async close(): Promise<void> {
    const closed = [...this.connections].map(
      (socket) =>
        new Promise<void>((resolve) => {
          socket.once("close", () => resolve());
          socket.destroy();
        }),
    );
    await Promise.all(closed);
    if (this.server.listening)
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
