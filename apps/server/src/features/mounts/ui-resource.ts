import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync, deflateSync } from "node:zlib";
import { projectRoot } from "../../config.js";

type MountManifestEntry = {
  module: number;
  file: string;
  sha256: string;
  md5: string;
  bytes: number;
  sourceSha256: string;
  releaseIndexSha256: string;
  audit: { sourceSha256: string; candidateSha256: string; emptyAbc: boolean; duplicates: boolean; protectedTagsByteIdentical: boolean };
};

const folder = join(projectRoot, "reference/mounts/local-ui");
const release = JSON.parse(readFileSync(join(projectRoot, "reference/ui-compat/release-lock.json"), "utf8"));

const manifest = JSON.parse(
  readFileSync(join(folder, "manifest.json"), "utf8"),
) as MountManifestEntry[];

// Permite desativar módulos individualmente para diagnóstico.
// Exemplo: DISABLE_MOUNT_MODULES=14,15
const disabledModules = new Set(
  (process.env.DISABLE_MOUNT_MODULES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isInteger),
);

// Carrega e verifica a integridade dos módulos locais.
const resources = manifest.map((row) => {
  const bytes = readFileSync(join(folder, row.file));

  const baseline = release.modules[row.module];
  if (!baseline || row.sourceSha256 !== baseline.sha256 || row.releaseIndexSha256 !== release.index.sha256 ||
      row.audit?.sourceSha256 !== baseline.sha256 || row.audit?.candidateSha256 !== row.sha256 ||
      row.audit.emptyAbc || row.audit.duplicates || !row.audit.protectedTagsByteIdentical)
    throw new Error(`Módulo ${row.module} sem validação da versão-base/proteção de interfaces; execute scripts/build-mount-ui.mjs`);

  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (bytes.length !== row.bytes || sha256 !== row.sha256) {
    throw new Error(`Módulo de montarias ${row.module} ausente ou corrompido`);
  }

  return { ...row, bytes };
});

// Mantém somente os módulos habilitados.
// A mesma seleção é aplicada aos arquivos e aos manifestos.
const activeResources = resources.filter(
  (row) => !disabledModules.has(row.module),
);

/**
 * Retorna o SWF local correspondente ao caminho solicitado.
 *
 * Aceita o nome canônico ou a versão com o MD5 registrado
 * no manifesto local.
 *
 * Módulos desativados continuam sendo carregados normalmente
 * pelo mecanismo original de recursos do servidor.
 */
export function mountUiResource(path: string) {
  return activeResources.find(
    (row) =>
      path === `/cdn/${row.module}.png` ||
      path === `/cdn/${row.module}_${row.md5}.png`,
  );
}

/**
 * Atualiza os índices de recursos do Flash.
 *
 * - code_md5.dat: duas camadas de zlib.
 * - size.xml: XML sem compressão.
 * - Somente módulos habilitados são modificados.
 * - Os demais registros permanecem inalterados.
 */
export function mountUiIndex(path: string, raw: Buffer): Buffer {
  if (path !== "/client/code_md5.dat" && path !== "/client/size.xml") {
    return raw;
  }

  // Sem módulos ativos, preserva o índice original.
  if (activeResources.length === 0) {
    return raw;
  }

  const compressed = path.endsWith(".dat");

  let text = (compressed ? inflateSync(inflateSync(raw)) : raw).toString(
    "utf8",
  );

  for (const resource of activeResources) {
    let found = false;

    const pattern = new RegExp(
      String.raw`<Item\b[^>]*\bname="${resource.module}\.png"[^>]*/>`,
      "g",
    );

    text = text.replace(pattern, (row) => {
      found = true;

      return row
        .replace(/\bmd5="[^"]*"/, `md5="${resource.md5}"`)
        .replace(/\bsize="[^"]*"/, `size="${resource.bytes.length}"`);
    });

    if (!found) {
      throw new Error(
        `Módulo ${resource.module} ausente do manifesto do Flash: ${path}`,
      );
    }
  }

  const result = Buffer.from(text, "utf8");

  return compressed ? deflateSync(deflateSync(result)) : result;
}
