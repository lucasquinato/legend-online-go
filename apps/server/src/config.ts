import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = resolve(projectRoot, "../..");
const env = existsSync(resolve(repoRoot, ".env"))
  ? resolve(repoRoot, ".env")
  : resolve(repoRoot, ".env.example");
if (existsSync(env) && process.env.LEGEND_SKIP_ENV_FILE !== "true") loadEnvFile(env);

export interface Config {
  mode: "online" | "replay" | "tutorial";
  tutorialEngine?: "dynamic" | "capture";
  httpHost: string;
  httpPort: number;
  publicOrigin: string;
  gameHost: string;
  gamePort: number;
  policyPort?: number;
  advertisedGameHost: string;
  upstreamOrigin: string;
  upstreamGameHost: string;
  upstreamGamePort: number;
  upstreamTimeoutMs: number;
  dataDir: string;
  fixturePath: string;
  capturePackets: boolean;
  resourceMode?: "cache-first" | "online" | "offline";
}
function port(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error(`Porta inválida: ${name}`);
  return value;
}
export function loadConfig(): Config {
  const resourceMode = process.env.RESOURCE_MODE ?? "cache-first";
  if (!["cache-first", "online", "offline"].includes(resourceMode))
    throw new Error("RESOURCE_MODE deve ser cache-first, online ou offline");
  const mode = process.env.SERVER_MODE ?? "online";
  if (mode !== "online" && mode !== "replay" && mode !== "tutorial")
    throw new Error("SERVER_MODE deve ser online, replay ou tutorial");
  const dataDir = resolve(projectRoot, process.env.DATA_DIR ?? "data");
  const rel = relative(projectRoot, dataDir);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("DATA_DIR deve ficar dentro da pasta do servidor");
  const httpPort = port("HTTP_PORT", 8080);
  const publicOrigin = new URL(
    process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${httpPort}`,
  ).origin;
  const upstream = new URL(
    process.env.UPSTREAM_ORIGIN ?? "https://servidor.legendremake.com",
  );
  if (upstream.protocol !== "https:")
    throw new Error("UPSTREAM_ORIGIN deve usar HTTPS");
  const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 120_000);
  if (
    !Number.isInteger(upstreamTimeoutMs) ||
    upstreamTimeoutMs < 1000 ||
    upstreamTimeoutMs > 600_000
  )
    throw new Error("UPSTREAM_TIMEOUT_MS deve ficar entre 1000 e 600000");
  return {
    mode,
    tutorialEngine:
      process.env.TUTORIAL_ENGINE === "capture" ? "capture" : "dynamic",
    httpHost: process.env.HTTP_HOST ?? "127.0.0.1",
    httpPort,
    publicOrigin,
    gameHost: process.env.GAME_HOST ?? "127.0.0.1",
    gamePort: port("GAME_PORT", 5004),
    policyPort: port("POLICY_PORT", 843),
    advertisedGameHost: process.env.ADVERTISED_GAME_HOST ?? "127.0.0.1",
    upstreamOrigin: upstream.origin,
    upstreamGameHost: process.env.UPSTREAM_GAME_HOST ?? upstream.hostname,
    upstreamGamePort: port("UPSTREAM_GAME_PORT", 5004),
    upstreamTimeoutMs,
    dataDir,
    fixturePath: resolve(projectRoot, "fixtures/bootstrap.json"),
    capturePackets: process.env.CAPTURE_PACKETS !== "false",
    resourceMode: resourceMode as Config["resourceMode"],
  };
}
