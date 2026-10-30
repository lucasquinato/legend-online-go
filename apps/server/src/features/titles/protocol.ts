import { decodeMessage, encodeMessage, typeName, type Message } from "../../messages.js";
import type { CityPacket } from "../../city-state.js";
import type { TitleCatalog } from "./catalog.js";
import { selectedTitle, titleOwned, validateTitleSave, type TitleSave } from "./state.js";
import type { TitleAttributeContext } from "./attributes.js";
import { titleAttributesAvailable } from "./attributes.js";

export class TitleProtocolError extends Error {}
export const titleSchemas = Object.freeze({ request: typeName("player.AppellExchangeMsg"), list: typeName("player.AppellsMsg"), obtained: typeName("player.AppellExchangeMsg") });
export function titleRequest(body: Buffer): { appellId: number; look: boolean } {
  try {
    if (body.length > 128) throw new Error();
    const r = decodeMessage(titleSchemas.request, body);
    if (!Number.isSafeInteger(r.appellId) || r.appellId < 0 || r.appellId > 2147483647 || ![0, 1].includes(r.look) || Object.keys(r).some(k => !["appellId", "look"].includes(k))) throw new Error();
    if (r.look === 1 && r.appellId !== 0) throw new Error();
    return { appellId: r.appellId, look: r.look === 1 };
  } catch { throw new TitleProtocolError("Solicitação de títulos inválida."); }
}
export function titleList(save: TitleSave, catalog: TitleCatalog, context: TitleAttributeContext): Message {
  validateTitleSave(save);
  return { appells: catalog.list({ job: context.job }).map(title => {
    const entry = save.entries[title.id], isGet = titleOwned(save, catalog, title.id, context.now);
    return {
      appellId: title.id, isGet: Number(isGet), value: entry?.progress?.wireValue ?? "",
      // Explicit sentinel resets the client's mutable template after expiry/permanent reacquisition.
      validDate: isGet && entry!.ownership!.expiresAt !== null
        ? new Date(entry!.ownership!.expiresAt!).toISOString().slice(0, 19).replace("T", " ") : "2000-01-01 00:00:00",
    };
  }) };
}
export function titleListPacket(save: TitleSave, catalog: TitleCatalog, context: TitleAttributeContext): CityPacket {
  return { opcode: 4484, body: encodeMessage(titleSchemas.list, titleList(save, catalog, context)).toString("base64") };
}
export function titleIdentity(save: TitleSave, catalog: TitleCatalog, context: TitleAttributeContext): { id: number; attributesUnlocked: boolean } {
  return { id: selectedTitle(save, catalog, context.job, context.now), attributesUnlocked: titleAttributesAvailable(save, context.level, context.now) };
}
/** Does not consume the durable queue or change the selected title. */
export function pendingTitleNotifications(save: TitleSave, catalog: TitleCatalog, context: TitleAttributeContext): { nativeId?: number; text?: string } {
  const ids = [...new Set((save.pendingAcquisitions ?? []).filter(n => !n.retroactive && n.obtainedAt <= context.now).map(n => n.titleId))];
  const titles = ids.map(id => catalog.get(id)).filter(t => t && t.notifyOnAcquire && (t.job === 0 || t.job === context.job) && titleOwned(save, catalog, t.id, context.now));
  if (!titles.length) return {};
  // The recovered AppellGetView reads the equipped name, not the ID in 4491.
  if (titles.length === 1 && titles[0]!.id === selectedTitle(save, catalog, context.job, context.now)) return { nativeId: titles[0]!.id };
  const names = titles.slice(0, 3).map(t => `[${t!.title.replace(/<[^>]*>/g, "")}]`).join(", ");
  return { text: titles.length === 1 ? `Você obteve o título ${names}.` : `Você obteve ${titles.length} títulos: ${names}${titles.length > 3 ? " e outros" : ""}.` };
}
export function titleObtainedPacket(id: number): CityPacket {
  return { opcode: 4491, body: encodeMessage(titleSchemas.obtained, { appellId: id, look: 0 }).toString("base64") };
}
export function pendingTitleRemovalText(save: TitleSave, catalog: TitleCatalog, context: TitleAttributeContext): string | undefined {
  const ids = [...new Set((save.pendingRemovals ?? []).filter(n => !n.retroactive && n.removedAt <= context.now).map(n => n.titleId))];
  const titles = ids.map(id => catalog.get(id)).filter(t => t && (t.job === 0 || t.job === context.job) && !titleOwned(save, catalog, t.id, context.now));
  if (!titles.length) return undefined;
  const names = titles.slice(0, 3).map(t => `[${t!.title.replace(/<[^>]*>/g, "")}]`).join(", ");
  return titles.length === 1 ? `O título ${names} deixou de estar ativo: prazo encerrado ou condição não mantida.` : `${titles.length} títulos deixaram de estar ativos: ${names}${titles.length > 3 ? " e outros" : ""}.`;
}
