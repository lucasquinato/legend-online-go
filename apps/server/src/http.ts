import { registerReleaseRoutes } from "./releases.js";
import {localMarriageTables} from "./features/social/client-tables.js";
import {socialResource,socialResourceHash,socialResourceIndex} from "./features/social/ui-resource.js";
import {localSoulFateTables} from "./features/fate/client-tables.js";
import { navigationShopResource, navigationShopResourceHash, navigationShopResourcePath, navigationShopResourceIndex } from "./features/residence/navigation-shop-ui.js";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyRequest,
} from "fastify";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  inventoryResourcePath,
  inventoryResourceIndex,
} from "./features/inventory/ui-resource.js";
import {
  mountUiResource,
  mountUiIndex,
} from "./features/mounts/ui-resource.js";
import { localCampaignConfig } from "./features/campaign/config-overrides.js";
import { localSkillTables } from "./features/skills/descriptions.js";
import { localResidenceTables } from "./features/navigation/client-tables.js";
import { residenceResource, residenceResourceHash, residenceResourcePath, residenceResourceIndex } from "./features/residence/ui-resource.js";
import { localSettlementTables } from "./features/settlement/client-tables.js";
import { gameTimeZone, gameResetHour, gameDay } from "./game-clock.js";
import { settlementResource, settlementResourceHash, settlementResourcePath, settlementResourceIndex } from "./features/settlement/ui-resource.js";
import { localTitleQuestTables } from "./features/titles/quest.js";
import { localMountTables } from "./features/mounts/catalog-overrides.js";
import { localMountTutorialTables } from "./features/mounts/tutorial-quests.js";
import { localLabyrinthQuestTables } from "./features/labyrinth/quest.js";
import { mountButtonLabel, mountButtonIndex, mountStylePath } from "./features/mounts/button-label.js";
import { soulLanguagePath, soulLanguageResource } from "./features/mounts/soul-language.js";
import { equipmentLanguageResource } from "./features/equipment/language.js";
import { formationResource, formationResourcePath, formationResourceHash, formationResourceIndex } from "./features/skills/formation-resource.js";
import {
  energyDialogResource,
  energyDialogIndex,
  energyDialogPath,
  energyDialogSourcePath,
} from "./features/campaign/ui-resource.js";
import { AssetCache, isAsset } from "./assets.js";
import { dashboard } from "./dashboard.js";
import type { Config } from "./config.js";
import { Store, ReplayAuth } from "./store.js";
import type { GameServer } from "./game.js";
import { policyXml } from "./policy.js";
import { heroTemplates, BALANCE_VERSION } from "./combat.js";
import { deflateSync } from "node:zlib";
import { HttpArchive } from "./http-capture.js";
import { cosmosIconResource } from "./features/cosmos/resources.js";
import { localCosmosTables } from "./features/cosmos/client-tables.js";
import { localEquipmentTables } from "./features/equipment/client-tables.js";
import { localTattooTables } from "./features/tattoo/client-tables.js";
import { chatResource, chatResourceHash, chatResourceIndex } from "./features/messaging/chat-resource.js";

function xml(value: unknown): string {
  return String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
function body(request: FastifyRequest): Record<string, string> {
  const text = Buffer.isBuffer(request.body)
    ? request.body.toString("utf8")
    : "";
  if (String(request.headers["content-type"]).includes("application/json")) {
    const value: unknown = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Objeto JSON esperado");
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => typeof v === "string"),
    );
  }
  return Object.fromEntries(new URLSearchParams(text));
}
export function buildHttp(
  config: Config,
  store: Store,
  auth: ReplayAuth,
  game: GameServer,
): FastifyInstance {
  const app = Fastify({
    logger: {
      level: "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 2 * 1024 * 1024,
  });
  app.removeAllContentTypeParsers();
  registerReleaseRoutes(app);
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, data, done) =>
    done(null, data),
  );
  const boot = randomUUID();
  const assets = new AssetCache(config, store);
  const httpArchive = new HttpArchive(store.dir);
  app.get("/server/diagnostics/battle-client", async (request, reply) => {
    if (config.mode !== "tutorial") return reply.code(404).send();
    const q = request.query as Record<string, string>;
    const message = String(q.message ?? "").slice(0, 4000);
    // Native probes deliberately stop before template initialization; they are not gameplay failures.
    if (!message.includes("MountRuntimeProbe"))
      store.tutorialEvent("battle-client", 0, { phase: String(q.phase ?? "").slice(0, 80), message });
    return { ok: true };
  });
  app.get("/server/diagnostics/formation", async (request, reply) => {
    if (config.mode !== "tutorial") return reply.code(404).send();
    const q = request.query as Record<string, string>;
    store.tutorialEvent("formation-ui", 0, { phase: String(q.phase ?? "").slice(0, 160), message: String(q.message ?? "").slice(0, 4000) });
    return { ok: true };
  });
  app.get("/server/inspection", async (_request, reply) =>
    reply.type("text/html").send(dashboard),
  );
  app.get("/server/assets/file/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const asset = assets.list().find((a) => a.id === id);
    if (!asset) return reply.code(404).send({ ok: false });
    if (!(await assets.verify(asset)))
      return reply
        .code(503)
        .send({ ok: false, error: "Arquivo ausente ou corrompido" });
    return reply
      .type(asset.content_type)
      .send(createReadStream(assets.file(asset)));
  });
  async function serveAsset(url: URL, reply: import("fastify").FastifyReply) {
    try {
      const socialBytes=config.mode==='tutorial'?socialResource(url.pathname):undefined;
      if(socialBytes){reply.header('cache-control','no-store');reply.header('x-asset-sha256',socialResourceHash);return reply.type('application/octet-stream').send(socialBytes);}
      const chatBytes = config.mode === "tutorial" ? chatResource(url.pathname) : undefined;
      if (chatBytes) {
        store.dependency(url.pathname, 200, chatBytes.length, chatResourceHash);
        reply.header("cache-control", "no-store");
        reply.header("x-asset-sha256", chatResourceHash);
        reply.header("x-asset-saved", "true");
        return reply.type("application/octet-stream").send(chatBytes);
      }
      if (config.mode === "tutorial" && navigationShopResourcePath(url.pathname)) {
        const bytes=navigationShopResource();store.dependency(url.pathname,200,bytes.length,navigationShopResourceHash);
        reply.header("cache-control","no-store");reply.header("x-asset-sha256",navigationShopResourceHash);reply.header("x-asset-saved","true");
        return reply.type("application/octet-stream").send(bytes);
      }
      const mountResource =
        config.mode === "tutorial" ? mountUiResource(url.pathname) : undefined;
      // if (/^\/cdn\/(?:14|15)(?:_[a-f0-9]{8})?\.png$/i.test(url.pathname)) {
      //   app.log.info(
      //     {
      //       path: url.pathname,
      //       source: mountResource ? "SWF LOCAL" : "RECURSO ORIGINAL",
      //       md5: mountResource?.md5 ?? null,
      //       bytes: mountResource?.bytes.length ?? null,
      //     },
      //     "Diagnóstico de carregamento de SWF",
      //   );
      // }
      if (mountResource) {
        store.dependency(
          url.pathname,
          200,
          mountResource.bytes.length,
          mountResource.sha256,
        );
        reply.header("cache-control", "no-store");
        reply.header("x-asset-sha256", mountResource.sha256);
        reply.header("x-asset-saved", "true");
        return reply.type("application/octet-stream").send(mountResource.bytes);
      }
      if (config.mode === "tutorial" && (inventoryResourcePath(url.pathname) || formationResourcePath(url.pathname))) {
        const bytes = formationResource();
        store.dependency(
          url.pathname,
          200,
          bytes.length,
          formationResourceHash,
        );
        reply.header("cache-control", "no-store");
        reply.header("x-asset-sha256", formationResourceHash);
        reply.header("x-asset-saved", "true");
        return reply.type("application/octet-stream").send(bytes);
      }
      if (config.mode === "tutorial" && residenceResourcePath(url.pathname)) {
        reply.header("cache-control", "no-store");reply.header("x-asset-sha256",residenceResourceHash);
        return reply.type("application/octet-stream").send(residenceResource());
      }
      if (config.mode === "tutorial" && settlementResourcePath(url.pathname)) {
        reply.header("cache-control", "no-store");
        reply.header("x-asset-sha256", settlementResourceHash);
        reply.header("x-asset-saved", "true");
        return reply.type("application/octet-stream").send(settlementResource());
      }
      const localEnergy =
        config.mode === "tutorial" && energyDialogPath(url.pathname);
      // The local checksum names a derivative, which does not exist upstream.
      const cosmosIcon = config.mode === "tutorial" ? await cosmosIconResource(assets, url.pathname) : undefined;
      const asset = cosmosIcon ?? await assets.get(
        localEnergy
          ? new URL(energyDialogSourcePath, config.upstreamOrigin)
          : url,
      );
      if (
        config.mode === "tutorial" &&
        ["/client/code_md5.dat", "/client/size.xml"].includes(url.pathname)
      ) {
        const styles = await assets.get(new URL(mountStylePath, config.upstreamOrigin));
        const bytes = navigationShopResourceIndex(url.pathname, mountButtonIndex(url.pathname, chatResourceIndex(url.pathname, mountUiIndex(
          url.pathname,
          formationResourceIndex(url.pathname, inventoryResourceIndex(
            url.pathname,
            socialResourceIndex(url.pathname, residenceResourceIndex(url.pathname, settlementResourceIndex(url.pathname, energyDialogIndex(url.pathname, readFileSync(assets.file(asset)))!))),
          )),
        )), mountButtonLabel(readFileSync(assets.file(styles)))));
        reply.header("cache-control", "no-store");
        reply.header(
          "x-asset-sha256",
          createHash("sha256").update(bytes).digest("hex"),
        );
        reply.header("x-asset-saved", "true");
        reply.header("content-length", bytes.length);
        return reply.type(asset.content_type).send(bytes);
      }
      if (localEnergy) {
        reply.header("cache-control", "no-store");
        const bytes = energyDialogResource(asset.sha256);
        if (!bytes)
          throw new Error(
            "Versão do módulo de campanha não corresponde ao aviso local",
          );
        store.dependency(
          url.pathname,
          200,
          bytes.length,
          createHash("sha256").update(bytes).digest("hex"),
        );
        reply.header(
          "x-asset-sha256",
          createHash("sha256").update(bytes).digest("hex"),
        );
        reply.header("x-asset-saved", "true");
        reply.header("content-length", bytes.length);
        return reply.type(asset.content_type).send(bytes);
      }
      if (config.mode === "tutorial" && url.pathname === mountStylePath) {
        const bytes = mountButtonLabel(readFileSync(assets.file(asset)));
        reply.header("cache-control", "no-store");
        reply.header("x-asset-sha256", createHash("sha256").update(bytes).digest("hex"));
        reply.header("x-asset-saved", "true");
        reply.header("content-length", bytes.length);
        return reply.type(asset.content_type).send(bytes);
      }
      if (config.mode === "tutorial" && url.pathname === soulLanguagePath) {
        const bytes = equipmentLanguageResource(soulLanguageResource(url.pathname, readFileSync(assets.file(asset)))!);
        reply.header("cache-control", "no-store");
        reply.header("x-asset-sha256", createHash("sha256").update(bytes).digest("hex"));
        reply.header("x-asset-saved", "true");
        reply.header("content-length", bytes.length);
        return reply.type(asset.content_type).send(bytes);
      }
      if (config.mode === "tutorial" && url.pathname === "/xml/tempinfos.xml") {
        reply.header("cache-control", "no-store");
        const bytes = localLabyrinthQuestTables(localMountTutorialTables(localMountTables(localTitleQuestTables(localEquipmentTables(localSoulFateTables(localTattooTables(localCosmosTables(localSkillTables(
          localMarriageTables(localResidenceTables(localSettlementTables(localCampaignConfig(readFileSync(assets.file(asset)))))),
        )))))))));
        reply.header(
          "x-asset-sha256",
          createHash("sha256").update(bytes).digest("hex"),
        );
        reply.header("x-asset-saved", "true");
        reply.header("content-length", bytes.length);
        return reply.type(asset.content_type).send(bytes);
      }
      reply.header("x-asset-sha256", asset.sha256);
      reply.header("x-asset-saved", "true");
      reply.header("content-length", asset.bytes);
      return reply
        .type(asset.content_type)
        .send(createReadStream(assets.file(asset)));
    } catch (error) {
      return reply
        .code((error as { statusCode?: number }).statusCode ?? 502)
        .send({
          ok: false,
          error: "Recurso não disponível",
          path: url.pathname,
        });
    }
  }
  app.get("/server/assets", async () => ({
    mode: config.resourceMode ?? "cache-first",
    assets: assets.list(),
  }));
  app.get("/server/assets/verify", async () => {
    const result = [];
    for (const asset of assets.list())
      result.push({ ...asset, valid: await assets.verify(asset) });
    return {
      complete: result.every((a) => a.valid),
      checked: result.length,
      assets: result,
    };
  });
  app.setErrorHandler((error, _request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    app.log.error({ event: "http-error", status }, "Falha HTTP");
    reply.code(status).send({
      ok: false,
      error: status === 400 ? "Requisição inválida" : "Falha no servidor",
    });
  });
  app.get("/healthz", async () => ({
    ok: true,
    mode: config.mode,
    balanceVersion: BALANCE_VERSION,
    calendar: { timeZone: gameTimeZone, resetHour: gameResetHour, day: gameDay(Date.now()) },
    boot,
    gameListening: game.server.listening,
    resourceMode: config.resourceMode,
    capture: {
      tcp: config.mode === "online" && config.capturePackets,
      http: config.mode === "online" && config.capturePackets,
      assets: config.resourceMode !== "offline",
    },
  }));
  if (config.mode === "tutorial") app.all("/xml/skycastlerobot_unzip.xml", async (_request, reply) =>
    reply.header("cache-control", "no-store").type("application/xml").send("<root/>"));
  app.get("/crossdomain.xml", async (_request, reply) =>
    reply.type("application/xml").send(policyXml(config.gamePort)),
  );
  app.get("/server/dependencies", async () =>
    store.db.prepare("SELECT * FROM dependencies ORDER BY path").all(),
  );
  app.get("/server/protocols", async () =>
    store.db.prepare("SELECT * FROM traffic ORDER BY direction,opcode").all(),
  );
  app.get("/server/gold", async () => ({
    transactions: store.db
      .prepare(
        "SELECT seq,user_id,at,reason,delta,balance_before,balance_after FROM gold_transactions ORDER BY seq DESC LIMIT 100",
      )
      .all(),
    note: "Histórico das movimentações locais registradas a partir da centralização do ouro. Não reconstrói lançamentos antigos nem inclui a conta online.",
  }));
  app.get("/server/city", async () => ({
    mode: config.mode,
    worlds: store.db
      .prepare("SELECT user_id,state FROM city_worlds ORDER BY user_id")
      .all()
      .map((row) => ({
        userId: row.user_id,
        state: JSON.parse(String(row.state)),
      })),
    rejected: store.db
      .prepare(
        "SELECT * FROM tutorial_events WHERE kind='city-rejected' ORDER BY seq DESC LIMIT 100",
      )
      .all(),
    scope:
      "Campanhas recuperadas, labirinto com 100 pisos e abismo com 30 pisos; combate livre, portais, baús e progresso persistente.",
  }));
  app.get("/server/tutorial", async () => ({
    mode: config.mode,
    engine: config.tutorialEngine ?? "dynamic",
    worlds: store.db
      .prepare("SELECT user_id,state FROM tutorial_worlds ORDER BY user_id")
      .all()
      .map((row) => ({
        userId: row.user_id,
        state: JSON.parse(String(row.state)),
      })),
    events: store.db
      .prepare("SELECT * FROM tutorial_events ORDER BY seq")
      .all(),
    savedAssets: assets.list().length,
    missing: store.db
      .prepare("SELECT * FROM dependencies WHERE status<>200 ORDER BY path")
      .all(),
    note:
      config.mode === "tutorial"
        ? config.tutorialEngine === "capture"
          ? "Replay estrito da captura."
          : "Tutorial e continuação inicial na cidade com estado e combate locais. Consulte /server/city para cobertura e ações recusadas."
        : "Captura do tutorial online. As respostas de gameplay ainda precisam ser transformadas em handlers locais.",
  }));
  app.get("/", async () => ({
    name: "wartune_server",
    mode: config.mode,
    health: "/healthz",
  }));

  if (config.mode === "online") {
    app.all("/*", async (request, reply) => {
      const path = request.raw.url ?? "/";
      const upstream = new URL(path, config.upstreamOrigin);
      if (upstream.origin !== config.upstreamOrigin)
        return reply.code(400).send({ ok: false, error: "Destino inválido" });
      if (request.method === "GET" && isAsset(upstream.pathname))
        return serveAsset(upstream, reply);
      const headers: Record<string, string> = {
        "user-agent": "LegendOnline-Node-Gateway/0.1",
      };
      for (const name of ["content-type", "accept", "cookie"])
        if (typeof request.headers[name] === "string")
          headers[name] = request.headers[name]!;
      let response: Response;
      try {
        response = await fetch(upstream, {
          method: request.method,
          headers,
          body:
            ["GET", "HEAD"].includes(request.method) ||
            !Buffer.isBuffer(request.body)
              ? undefined
              : new Uint8Array(request.body),
          redirect: "manual",
          signal: AbortSignal.timeout(config.upstreamTimeoutMs),
        });
      } catch {
        return reply
          .code(502)
          .send({ ok: false, error: "Servidor online indisponível" });
      }
      reply.code(response.status);
      for (const name of ["content-type", "cache-control", "last-modified"]) {
        const value = response.headers.get(name);
        if (value) reply.header(name, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      const location = response.headers.get("location");
      if (location) {
        const url = new URL(location, upstream);
        reply.header(
          "location",
          url.origin === config.upstreamOrigin
            ? config.publicOrigin + url.pathname + url.search
            : url.href,
        );
      }
      const pathname = upstream.pathname;
      const capture = config.capturePackets
        ? httpArchive.begin(
            request.method,
            upstream,
            String(request.headers["content-type"] ?? ""),
            Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
            response.status,
            response.headers.get("content-type") ?? "",
          )
        : undefined;
      if (
        [
          "/updateplayernovice",
          "/visualizeregister",
          "/visualizeregister2",
          "/loginselectlist",
        ].includes(pathname)
      ) {
        const content = await response.text();
        capture?.save(Buffer.from(content));
        let input: Record<string, string> = {};
        try {
          input = {
            ...Object.fromEntries(upstream.searchParams),
            ...body(request),
          };
        } catch {
          /* Não persiste parâmetros inválidos. */
        }
        const allowed = [
          "userid",
          "op",
          "noviceprocess",
          "nickname",
          "camp",
          "sex",
          "icon",
          "jumpnovice",
        ];
        store.tutorialEvent("http", Number(input.userid) || 0, {
          path: pathname,
          status: response.status,
          input: Object.fromEntries(
            Object.entries(input).filter(([name]) => allowed.includes(name)),
          ),
          response: content,
        });
        return reply.send(content);
      }
      if (pathname === "/client/config.xml" && response.ok) {
        let content = await response.text();
        capture?.save(Buffer.from(content));
        // Todas as referências ao mesmo backend passam pelo gateway, inclusive CDN.
        content = content.replaceAll(
          config.upstreamOrigin,
          config.publicOrigin,
        );
        content = content.replace(
          /(<SocktPath\b[^>]*\bvalue\s*=\s*["'])[^"']*(["'])/,
          `$1${xml(config.advertisedGameHost)}$2`,
        );
        content = content.replace(
          /(<SocktPath\b[^>]*\bSocketPort\s*=\s*["'])[^"']*(["'])/,
          `$1${config.gamePort}$2`,
        );
        return reply.send(content);
      }
      if (["/login", "/login2"].includes(pathname) && response.ok) {
        let content = await response.text();
        const address = /\bAddress\s*=\s*["']([^"']+)["']/.exec(content)?.[1];
        const port = Number(/\bPort\s*=\s*["'](\d+)["']/.exec(content)?.[1]);
        if (address && address !== config.upstreamGameHost)
          return reply
            .code(502)
            .send(
              "Servidor de jogo anunciado não corresponde ao upstream configurado",
            );
        if (address && Number.isInteger(port)) {
          game.setUpstreamPort(port);
          content = content
            .replace(
              /\bAddress\s*=\s*["'][^"']+["']/,
              `Address="${xml(config.advertisedGameHost)}"`,
            )
            .replace(/\bPort\s*=\s*["']\d+["']/, `Port="${config.gamePort}"`);
        }
        return reply.send(content);
      }
      if (
        pathname.startsWith("/launcher/api/") &&
        response.headers.get("content-type")?.includes("json")
      ) {
        const value = (await response.json()) as Record<string, unknown>;
        if (typeof value.url === "string") {
          const url = new URL(value.url, config.upstreamOrigin);
          if (url.origin === config.upstreamOrigin)
            value.url = config.publicOrigin + url.pathname + url.search;
        }
        return reply.send(value);
      }
      if (!response.body || request.method === "HEAD") {
        capture?.save(Buffer.alloc(0));
        return reply.send();
      }
      const stream = Readable.fromWeb(response.body as never);
      return reply.send(capture ? capture.stream(stream) : stream);
    });
    return app;
  }

  app.get("/launcher/api/status", async () => ({
    ok: true,
    online: game.activeConnections,
    boot,
  }));
  app.post("/launcher/api/login", async (request, reply) => {
    let input: Record<string, string>;
    try {
      input = body(request);
    } catch {
      return reply.code(400).send({ ok: false, error: "JSON inválido" });
    }
    const password = input.password ?? "";
    if (password.length > 256)
      return reply.code(400).send({ ok: false, error: "Senha inválida" });
    const user = await store.authenticate(input.username ?? "", password);
    if (!user)
      return reply.send({ ok: false, error: "Usuário ou senha inválidos" });
    return { ok: true, username: user.username, ticket: store.issue(user.id) };
  });
  app.post("/launcher/api/resume", async (request) => {
    const input = body(request);
    const id = store.validate(input.ticket ?? "", input.username ?? "");
    return id
      ? { ok: true, username: input.username, ticket: input.ticket }
      : { ok: false, error: "Sessão inválida" };
  });
  app.post("/launcher/api/register", { bodyLimit: 4096 }, async (request, reply) => {
    if (config.mode !== "tutorial" || config.tutorialEngine === "capture")
      return reply.code(409).send({ ok: false, error: "Cadastro local requer o servidor dinâmico" });
    let input: Record<string, string>;
    try { input = body(request); }
    catch { return reply.code(400).send({ ok: false, error: "Dados de cadastro inválidos" }); }
    const username = (input.username ?? "").trim(), password = input.password ?? "";
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username) || password.length < 10 || password.length > 256)
      return reply.code(400).send({ ok: false, error: "Use usuário de 3–20 letras, números ou _ e senha de 10–256 caracteres" });
    try {
      const registered = await store.registerUser(username, password);
      return { ok: true, username: registered.username, ticket: registered.ticket };
    } catch (error) {
      if (store.user(username)) return reply.code(409).send({ ok: false, error: "Este usuário já está cadastrado" });
      request.log.error({ err: error }, "Falha ao criar conta local");
      return reply.code(500).send({ ok: false, error: "Não foi possível criar a conta; tente novamente" });
    }
  });
  app.get("/client/config.xml", async (_request, reply) => {
    const modulus = Buffer.concat([
      Buffer.from([0]),
      Buffer.from(auth.jwk.n!, "base64url"),
    ]).toString("base64");
    const exponent = Buffer.from(auth.jwk.e!, "base64url").toString("base64");
    reply.type("application/xml");
    return `<?xml version="1.0"?><root><config><LANGUAGE value="zh_cn"/><REQUEST_PATH value="${xml(config.publicOrigin)}/"/><CastleServicePath value="${xml(config.publicOrigin)}/messagebroker/amf"/><OuterCityServicePath value="${xml(config.publicOrigin)}/messagebroker/amf"/><FOWARDSITE siteName="Local replay" value="${xml(config.publicOrigin)}/"/><SocktPath value="${xml(config.advertisedGameHost)}" SocketPort="${config.gamePort}"/><TEMPLATE_PATH value="${xml(config.publicOrigin)}/xml/"/><ResourcePath value="${xml(config.publicOrigin)}/cdn/"/><Backup_ResourcePath value="${xml(config.publicOrigin)}/cdn/"/><FACE_NUM value="20"/><VERSION value="1.3.0"/><SITES><NODE site="broas_0905"><CLIENT_LOGIN_PATH value="${xml(config.publicOrigin)}/"/><SITE value="${xml(config.publicOrigin)}/"/><RSAKey PublicKeyModulus="${modulus}" publicExponent="${exponent}"/></NODE></SITES></config></root>`;
  });
  app.get("/loginselectlist", async (request, reply) => {
    const username = (request.query as Record<string, string>).username ?? "";
    const user = store.user(username);
    reply.type("application/xml");
    return user
      ? `<root><Item ID="${user.id}" Active="${config.mode === "tutorial" ? Boolean(store.tutorialProfile(user.id)?.active) : true}"/></root>`
      : "<root/>";
  });
  app.post("/login", async (request, reply) => {
    reply.type("application/xml");
    try {
      const result = auth.login(body(request).p ?? "");
      return `<root value="true" message="Login Succeed" userId="${result.userId}" Address="${xml(config.advertisedGameHost)}" Port="${config.gamePort}" CurrentServerName="${xml(game.tutorial?.serverName ?? "Local Replay")}"/>`;
    } catch {
      return '<root value="false" message="Login inválido" userId="0"/>';
    }
  });
  app.post("/updateplayernovice", async (request, reply) => {
    const input = body(request);
    const uid = Number(input.userid);
    if (!auth.validate(input.key ?? "", uid))
      return reply.code(403).send("Sessão inválida");
    if (config.mode === "tutorial") {
      const profile = store.tutorialProfile(uid);
      if (!profile) return reply.code(404).send("Personagem não encontrado");
      const process = Number(input.noviceprocess);
      if (input.op === "1") {
        if (config.tutorialEngine !== "capture") {
          if (!game.world(uid).setProgress(process))
            return reply.code(409).send("Marco ainda não liberado");
          return reply
            .type("text/plain")
            .send(String(store.tutorialProfile(uid)!.process));
        }
        if (
          !Number.isInteger(process) ||
          process < 0 ||
          process > 99900 ||
          process % 100 !== 0
        )
          return reply.code(400).send("Marco inválido");
        store.db
          .prepare("UPDATE tutorial_profiles SET process=? WHERE user_id=?")
          .run(process, uid);
      }
      return reply
        .type("text/plain")
        .send(String(store.tutorialProfile(uid)!.process));
    }
    return reply.type("text/plain").send("99900");
  });
  if (config.mode === "tutorial") {
    for (const path of ["/maillist", "/itemlist", "/starlist"]) {
      app.post(path, async (request, reply) => {
        const input = body(request);
        const uid = Number(input.userId);
        if (!auth.validate(input.key ?? "", uid)) return reply.code(403).send();
        const city = game.world(uid).city();
        if (!city) return reply.code(409).send("Conclua o tutorial primeiro");
        const content =
          path === "/starlist"
            ? city.starXml(input.starId ?? input.itemId ?? "")
            : path === "/maillist"
            ? city.mailXml(input.mailId ?? "0", Number(input.reqType ?? 0))
            : city.itemXml(input.itemId ?? "");
        return reply
          .type("application/octet-stream")
          .send(deflateSync(Buffer.from(content, "utf8")));
      });
    }
    app.all("/visualizeregister", async (request, reply) => {
      const input = {
        ...(request.query as Record<string, string>),
        ...body(request),
      };
      const uid = Number(input.userid);
      reply.type("application/xml");
      if (
        !auth.validate(input.key ?? "", uid) ||
        !store.tutorialProfile(uid) ||
        (config.tutorialEngine === "capture" && uid !== game.tutorial!.userId)
      )
        return reply
          .code(403)
          .send('<root value="false" type="1" message="Sessão inválida"/>');
      const expected = game.tutorial!.registration;
      if (config.tutorialEngine !== "capture") {
        const icon = Number(input.icon),
          sex = Number(input.sex),
          hero = heroTemplates.get(icon),
          nickname = (input.nickname ?? "").trim();
        if (!hero || sex !== Number(hero.Sexs) || Number(input.camp) !== 1)
          return '<root value="false" type="1" message="Personagem inválido"/>';
        if (!/^[\p{L}\p{N}_ -]{2,20}$/u.test(nickname))
          return '<root value="false" type="1" message="Nome inválido: use 2–20 letras, números, espaços ou sublinhado"/>';
        if (store.tutorialProfile(uid)!.active)
          return '<root value="false" type="1" message="Esta conta já possui personagem"/>';
        store.db
          .prepare(
            "UPDATE tutorial_profiles SET active=1,process=10000,nickname=?,sex=?,icon=? WHERE user_id=?",
          )
          .run(nickname, sex, icon, uid);
        game.resetWorld(uid);
        return '<root value="true" type="0" message="Success"/>';
      }
      if (
        Number(input.sex) !== expected.sex ||
        Number(input.icon) !== expected.icon ||
        Number(input.camp) !== expected.camp
      )
        return `<root value="false" type="1" message="Este percurso foi capturado com sexo ${expected.sex}, ícone ${expected.icon}. Selecione o mesmo personagem para reproduzir o tutorial."/>`;
      if (input.nickname !== expected.nickname)
        return `<root value="false" type="1" message="Para esta reprodução, use o nome ${xml(expected.nickname)}."/>`;
      store.db
        .prepare(
          "UPDATE tutorial_profiles SET active=1,nickname=?,sex=?,icon=? WHERE user_id=?",
        )
        .run(expected.nickname, expected.sex, expected.icon, uid);
      return '<root value="true" type="0" message="Success"/>';
    });
  }
  app.post("/flashversionservlet", async (_request, reply) =>
    reply.type("text/plain").send("OK"),
  );
  // Nesta fase os recursos visuais permanecem online, mesmo no modo replay.
  app.get("/*", async (request, reply) => {
    const path = request.raw.url ?? "/";
    if (!/^\/(client|cdn|xml)\//.test(path))
      return reply.code(501).send({
        ok: false,
        error: "Endpoint ainda não implementado no replay",
      });
    const url = new URL(path, config.upstreamOrigin);
    if (url.origin !== config.upstreamOrigin) return reply.code(400).send();
    return serveAsset(url, reply);
  });
  return app;
}
