import type { CityPacket } from "../../city-state.js";
import { MessageCenter } from "./controller.js";
import { presentSystemMessage } from "./policy.js";

/** Transient feedback suppression, separate from the stable message controller. */
export class RejectionFeedback {
  private readonly center: MessageCenter;
  private readonly shown = new Map<string, number>();
  constructor(userId: number, private readonly now = Date.now) {
    this.center = new MessageCenter(userId);
  }

  prepare(reason: string, action = reason): CityPacket[] {
    const now = this.now(), key = `${action}\n${reason}`, previous = this.shown.get(key);
    if (previous !== undefined && now >= previous && now - previous < 2000) return [];
    for (const [id, at] of this.shown)
      if (now < at || now - at >= 2000) this.shown.delete(id);
    if (this.shown.size >= 128) this.shown.delete(this.shown.keys().next().value!);
    const delivery = presentSystemMessage(this.center, "error", reason);
    this.shown.set(key, now);
    return delivery.packets;
  }
}

const actions: Readonly<Record<number, string>> = Object.freeze({
  5014: "resgatar esta missão", 5019: "coletar esta recompensa de tempo online",
  5022: "retirar estes anexos do correio", 5039: "entrar nesta campanha",
  5155: "selecionar esta tropa", 5156: "evoluir esta tropa", 5180: "concluir esta etapa",
  5184: "redefinir estas habilidades", 5185: "aprender esta habilidade",
  8203: "realizar esta pesquisa", 8594: "consumir este item", 15044: "realizar esta ação na fazenda",
});
export function unavailableActionText(opcode: number): string {
  const action = actions[opcode];
  return action ? `Não foi possível ${action}. Verifique os requisitos e os recursos disponíveis.`
    : "Esta ação ainda não está disponível no servidor local.";
}
export function alreadyCompletedText(opcode: number): string {
  if (opcode === 5014) return "A recompensa desta missão já foi resgatada.";
  if (opcode === 5019) return "Esta recompensa de tempo online já foi coletada.";
  if (opcode === 5022) return "Estes anexos do correio já foram recolhidos.";
  return "Esta ação já foi concluída.";
}
