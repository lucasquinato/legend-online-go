import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  realpathSync,
  appendFileSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import {
  randomBytes,
  createHash,
  scrypt,
  timingSafeEqual,
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  constants,
} from "node:crypto";
import { promisify } from "node:util";
import { projectRoot } from "./config.js";
import { fields } from "./protocol.js";
import { GOLD_SCHEMA } from "./gold.js";
import { CURRENCY_SCHEMA } from "./features/currencies/ledger.js";
import { currencyAnnexes } from "./features/currencies/catalog.js";
import { SOCIAL_SCHEMA } from "./features/social/index.js";
import { FARM_SCHEMA } from "./features/farm/index.js";
import { TrafficRecorder } from "./traffic.js";

const derive = promisify(scrypt);
interface User {
  id: number;
  username: string;
  salt: string;
  hash: string;
}
export class Store {
  readonly db: DatabaseSync;
  private readonly traffic: TrafficRecorder;
  readonly onlineUsers = new Set<number>();
  readonly visitedFarms = new Map<number, number>();
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    const rel = relative(realpathSync(projectRoot), realpathSync(dir));
    if (rel.startsWith(".."))
      throw new Error("Dados fora da pasta do servidor");
    this.db = new DatabaseSync(join(dir, "state.sqlite"));
    // Configure before any schema/migration or application write.
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db.exec(GOLD_SCHEMA);
    this.db.exec(CURRENCY_SCHEMA);
    this.db.exec(SOCIAL_SCHEMA);
    this.db.exec(FARM_SCHEMA);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS dependencies(path TEXT PRIMARY KEY,status INTEGER,bytes INTEGER,sha256 TEXT,seen_at TEXT,hits INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS traffic(direction TEXT,opcode INTEGER,packets INTEGER DEFAULT 1,bytes INTEGER,PRIMARY KEY(direction,opcode));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS tutorial_events(
      seq INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,kind TEXT NOT NULL,user_id INTEGER,connection TEXT,detail TEXT NOT NULL);`);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS tutorial_profiles(user_id INTEGER PRIMARY KEY,active INTEGER DEFAULT 0,process INTEGER DEFAULT 0,nickname TEXT DEFAULT '',sex INTEGER DEFAULT 0,icon INTEGER DEFAULT 0);`,
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS tutorial_worlds(user_id INTEGER PRIMARY KEY,state TEXT NOT NULL)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS city_worlds(user_id INTEGER PRIMARY KEY,state TEXT NOT NULL)",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS local_mail(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,mail_id INTEGER UNIQUE,detail TEXT NOT NULL)",
    );
    if (
      !this.db
        .prepare("PRAGMA table_info(local_mail)")
        .all()
        .some((r) => r.name === "min_level")
    )
      this.db.exec(
        "ALTER TABLE local_mail ADD COLUMN min_level INTEGER NOT NULL DEFAULT 0",
      );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS account_grants(user_id INTEGER NOT NULL,grant_key TEXT NOT NULL,mail_id INTEGER NOT NULL,PRIMARY KEY(user_id,grant_key))",
    );
    this.traffic = new TrafficRecorder(join(dir, "state.sqlite"));
  }
  private async passwordCredentials(username: string, password: string): Promise<{ salt: string; hash: string }> {
    if (
      !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
      password.length < 10 ||
      password.length > 256
    )
      throw new Error(
        "Use usuário de 3–20 caracteres e senha de 10–256 caracteres",
      );
    const salt = randomBytes(16).toString("hex");
    const hash = ((await derive(password, salt, 64)) as Buffer).toString("hex");
    return { salt, hash };
  }
  async createUser(
    username: string,
    password: string,
    userId = 1265,
  ): Promise<void> {
    const { salt, hash } = await this.passwordCredentials(username, password);
    this.db.exec("SAVEPOINT create_local_user");
    try {
      this.db
        .prepare("INSERT INTO users(id,username,salt,hash) VALUES(?,?,?,?)")
        .run(userId, username, salt, hash);
      this.ensureEnergyMail(userId);
      this.db.exec("RELEASE create_local_user");
    } catch (error) {
      this.db.exec("ROLLBACK TO create_local_user; RELEASE create_local_user");
      throw error;
    }
  }
  /** Allocate only after the asynchronous hash, inside the same registration transaction. */
  async registerUser(username: string, password: string): Promise<{ username: string; ticket: string; userId: number }> {
    const { salt, hash } = await this.passwordCredentials(username, password);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.user(username)) throw new Error("Este usuário já está cadastrado");
      const userId = Math.max(1824, Number(this.db.prepare("SELECT MAX(id) AS id FROM users").get()!.id ?? 0)) + 1;
      this.db.prepare("INSERT INTO users(id,username,salt,hash) VALUES(?,?,?,?)").run(userId, username, salt, hash);
      this.initTutorialProfile(userId);
      this.ensureEnergyMail(userId);
      const ticket = this.issue(userId);
      this.db.exec("COMMIT");
      return { username, ticket, userId };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async resetTutorialAccounts(
    username: string,
    password: string,
    keepOnlyDefault = false,
  ): Promise<{ accounts: number; userId: number }> {
    if (
      !/^[a-zA-Z0-9_]{3,20}$/.test(username) ||
      password.length < 10 ||
      password.length > 256
    )
      throw new Error("Usuário ou senha local inválidos");
    const salt = randomBytes(16).toString("hex");
    const hash = ((await derive(password, salt, 64)) as Buffer).toString("hex");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.user(username);
      const userId =
        existing?.id ??
        Math.max(
          1824,
          Number(
            this.db.prepare("SELECT MAX(id) AS id FROM users").get()!.id ?? 0,
          ),
        ) + 1;
      this.db
        .prepare(
          "INSERT INTO users(id,username,salt,hash) VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET salt=excluded.salt,hash=excluded.hash",
        )
        .run(userId, username, salt, hash);
      this.db
        .exec(`INSERT OR IGNORE INTO tutorial_profiles(user_id) SELECT id FROM users;
        UPDATE tutorial_profiles SET active=0,process=0,nickname='',sex=0,icon=0;
        DELETE FROM tutorial_worlds;
        DELETE FROM city_worlds;
        DELETE FROM gold_transactions;
        DELETE FROM currency_transactions;
        DELETE FROM local_mail;
        DELETE FROM account_grants;
        DELETE FROM local_farms;
        DELETE FROM local_friends;
        DELETE FROM friend_requests;
        DELETE FROM local_events;
        DELETE FROM tickets;`);
      if (keepOnlyDefault) {
        this.db.prepare("DELETE FROM users WHERE id<>?").run(userId);
        this.db
          .prepare("DELETE FROM tutorial_profiles WHERE user_id<>?")
          .run(userId);
      }
      const accounts = Number(
        this.db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n,
      );
      this.ensureEnergyMails();
      this.db.exec("COMMIT");
      return { accounts, userId };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  initTutorialProfile(userId: number): void {
    this.db
      .prepare("INSERT OR IGNORE INTO tutorial_profiles(user_id) VALUES(?)")
      .run(userId);
  }
  sendLocalItems(
    userId: number,
    title: string,
    items: { template: number; count: number }[],
    minLevel = 0,
    contents = "Materiais para testes locais de evolução das modas.",
    sender = "Servidor local",
  ): number {
    if (
      !this.db.prepare("SELECT id FROM users WHERE id=?").get(userId) ||
      !items.length ||
      items.length > 5 ||
      !Number.isSafeInteger(minLevel) ||
      minLevel < 0 ||
      items.some(
        (i) =>
          !Number.isSafeInteger(i.template) ||
          (i.template <= 0 &&
            i.template !== -700 &&
            !currencyAnnexes[i.template]) ||
          !Number.isSafeInteger(i.count) ||
          i.count <= 0,
      )
    )
      throw new Error("Correio local inválido");
    this.db.exec("SAVEPOINT local_mail_send");
    try {
      const row = this.db
        .prepare(
          "INSERT INTO local_mail(user_id,detail,min_level) VALUES(?,'{}',?)",
        )
        .run(userId, minLevel);
      const seq = Number(row.lastInsertRowid),
        id = 1000000 + seq;
      if (20000000 + seq * 5 + 5 > 2147483647)
        throw new Error("Limite de IDs de correio");
      const mail: Record<string, any> = {
        id,
        mailType: 2,
        sendId: 0,
        sendNickName: sender,
        receiveId: userId,
        receiveNickName: "",
        sendDate: new Date().toISOString().slice(0, 19).replace("T", " "),
        readDate: "2999-01-01 00:00:00",
        isExist: 1,
        title,
        contents,
        removeDate: "2999-01-01 00:00:00",
        validityDate: 365,
        sendType: 4,
        sendPlayerGrades: 0,
      };
      for (let n = 1; n <= 5; n++) {
        const item = items[n - 1];
        mail[`annex${n}`] = item ? 20000000 + seq * 5 + n : 0;
        mail[`annex${n}Name`] = item?.template ?? 0;
        mail[`annex${n}Count`] = item?.count ?? 0;
        mail[`isAnnex${n}`] = 0;
      }
      this.db
        .prepare("UPDATE local_mail SET mail_id=?,detail=? WHERE seq=?")
        .run(id, JSON.stringify(mail), seq);
      this.db.exec("RELEASE local_mail_send");
      return id;
    } catch (error) {
      this.db.exec("ROLLBACK TO local_mail_send; RELEASE local_mail_send");
      throw error;
    }
  }
  ensureEnergyMails(): void {
    for (const user of this.db.prepare("SELECT id FROM users").all())
      this.ensureEnergyMail(Number(user.id));
  }
  ensureEnergyMail(userId: number): number {
    return this.sendLocalItemsOnce(
      userId,
      "starter-energy-v1",
      "Suprimento de energia",
      [{ template: 2030503, count: 9999 }],
      "Um pack de Poção de Energia Avançado para continuar a campanha. Cada poção fornece 50 de energia.",
    );
  }
  sendLocalItemsOnce(
    userId: number,
    key: string,
    title: string,
    items: { template: number; count: number }[],
    contents: string,
    sender = "Servidor local",
  ): number {
    const old = this.db
      .prepare(
        "SELECT mail_id FROM account_grants WHERE user_id=? AND grant_key=?",
      )
      .get(userId, key);
    if (old) return Number(old.mail_id);
    this.db.exec("SAVEPOINT energy_mail_grant");
    try {
      const id = this.sendLocalItems(userId, title, items, 0, contents, sender);
      this.db
        .prepare(
          "INSERT INTO account_grants(user_id,grant_key,mail_id) VALUES(?,?,?)",
        )
        .run(userId, key, id);
      this.db.exec("RELEASE energy_mail_grant");
      return id;
    } catch (error) {
      this.db.exec("ROLLBACK TO energy_mail_grant; RELEASE energy_mail_grant");
      throw error;
    }
  }
  tutorialProfile(userId: number):
    | {
        active: number;
        process: number;
        nickname: string;
        sex: number;
        icon: number;
      }
    | undefined {
    return this.db
      .prepare("SELECT * FROM tutorial_profiles WHERE user_id=?")
      .get(userId) as unknown as ReturnType<Store["tutorialProfile"]>;
  }
  user(username: string): User | undefined {
    return this.db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username) as unknown as User | undefined;
  }
  async authenticate(
    username: string,
    password: string,
  ): Promise<User | undefined> {
    const user = this.user(username);
    const salt = user?.salt ?? "invalid-user";
    const hash = (await derive(password, salt, 64)) as Buffer;
    return user && timingSafeEqual(hash, Buffer.from(user.hash, "hex"))
      ? user
      : undefined;
  }
  issue(userId: number): string {
    const ticket = randomBytes(32).toString("hex");
    this.db.prepare("DELETE FROM tickets WHERE expires<?").run(Date.now());
    this.db
      .prepare("INSERT INTO tickets VALUES(?,?,?)")
      .run(this.tokenHash(ticket), userId, Date.now() + 12 * 3600_000);
    return ticket;
  }
  validate(ticket: string, username: string): number | undefined {
    const user = this.user(username);
    const row = this.db
      .prepare("SELECT user_id FROM tickets WHERE token_hash=? AND expires>?")
      .get(this.tokenHash(ticket), Date.now());
    return row && user && Number(row.user_id) === user.id ? user.id : undefined;
  }
  private tokenHash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
  dependency(path: string, status: number, bytes: number, hash: string): void {
    this.db
      .prepare(
        `INSERT INTO dependencies VALUES(?,?,?,?,?,1) ON CONFLICT(path) DO UPDATE SET status=excluded.status,bytes=excluded.bytes,sha256=excluded.sha256,seen_at=excluded.seen_at,hits=hits+1`,
      )
      .run(path, status, bytes, hash, new Date().toISOString());
  }
  record(
    direction: "in" | "out",
    packet: Buffer,
    capture: boolean,
    connection: string,
  ): void {
    const opcode = packet.readUInt16BE(6);
    const userId = packet.readInt32BE(8);
    if (capture && direction === "out" && opcode === 20001)
      this.tutorialEvent("tcp-login", userId, { connection }, connection);
    if (capture && direction === "out" && opcode === 5017) {
      try {
        const progress = fields(packet.subarray(20)).find(
          (f) => f.number === 1 && f.wire === 0,
        );
        if (progress)
          this.tutorialEvent(
            "progress",
            userId,
            { process: Number(progress.value) },
            connection,
          );
      } catch {
        /* A captura bruta continua disponível para diagnosticar este pacote. */
      }
    }
    // Sem credenciais de login e sem conteúdo do chat no arquivo de captura.
    if (capture && ![20001, 83, 8806, 15005, 8198, 15023, 4231, 4236].includes(opcode)) {
      const file = join(
        this.dir,
        `packets-${new Date().toISOString().slice(0, 10)}.jsonl`,
      );
      appendFileSync(
        file,
        JSON.stringify({
          at: new Date().toISOString(),
          connection,
          userId,
          direction,
          opcode,
          frame: packet.toString("base64"),
        }) + "\n",
      );
    }
    this.traffic.record(direction, opcode, packet.length);
  }
  tutorialEvent(
    kind: string,
    userId: number,
    detail: unknown,
    connection = "",
  ): void {
    this.db
      .prepare(
        "INSERT INTO tutorial_events(at,kind,user_id,connection,detail) VALUES(?,?,?,?,?)",
      )
      .run(
        new Date().toISOString(),
        kind,
        userId,
        connection,
        JSON.stringify(detail),
      );
  }
  close(): void {
    try {
      this.traffic.close();
    } finally {
      this.db.close();
    }
  }
}
export class ReplayAuth {
  private readonly privateKey;
  readonly jwk;
  private proofs = new Map<string, { userId: number; expires: number }>();
  constructor(private store: Store) {
    const path = join(store.dir, "replay-rsa.pem");
    const configured = process.env.GAME_AUTH_PRIVATE_KEY_BASE64;
    if (!configured && !existsSync(path))
      writeFileSync(
        path,
        generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
          type: "pkcs8",
          format: "pem",
        }),
        { mode: 0o600 },
      );
    this.privateKey = createPrivateKey(configured ? Buffer.from(configured, "base64") : readFileSync(path));
    this.jwk = createPublicKey(this.privateKey).export({ format: "jwk" });
  }
  login(encrypted: string): { userId: number; proof: string } {
    const plain = privateDecrypt(
      { key: this.privateKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(encrypted, "base64"),
    ).toString("utf8");
    const [encodedUser, ticket, temporary, id] = plain.split("|");
    if (!encodedUser || !ticket || !temporary || !/^\d{1,8}$/.test(temporary))
      throw new Error("Login inválido");
    const username = decodeURIComponent(encodedUser);
    const userId = this.store.validate(ticket, username);
    if (!userId || String(userId) !== id) throw new Error("Login inválido");
    const proof = createHash("md5").update(temporary).digest("hex");
    for (const [key, value] of this.proofs)
      if (value.expires < Date.now()) this.proofs.delete(key);
    this.proofs.set(proof, { userId, expires: Date.now() + 30 * 60_000 });
    return { userId, proof };
  }
  validate(proof: string, userId: number): boolean {
    const entry = this.proofs.get(proof);
    return Boolean(
      entry && entry.userId === userId && entry.expires > Date.now(),
    );
  }
}
