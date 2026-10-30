import type { CityPacket } from "../../city-state.js";
import { defaultPresentation, messagePresentations } from "./presentations.js";
import type { MessagePresentation, SelfMessageDelivery, SystemMessage } from "./types.js";

/** Pure, per-character controller. It never grants resources or broadcasts. */
export class MessageCenter {
  constructor(readonly recipientId: number) {
    if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || recipientId > 2147483647)
      throw new Error("Destinatário de mensagem inválido");
  }

  prepare(input: SystemMessage): SelfMessageDelivery {
    if (typeof input.text !== "string" || !input.text.trim())
      throw new Error("Mensagem de sistema vazia");
    if (input.delayMs !== undefined && (!Number.isFinite(input.delayMs) || input.delayMs < 0))
      throw new Error("Prazo de mensagem inválido");
    const presentation = input.presentation ?? defaultPresentation[input.kind];
    const parts = messagePresentations[presentation];
    if (!parts) throw new Error("Apresentação de mensagem indisponível");
    return {
      recipientId: this.recipientId,
      packets: parts.map(part => ({
        opcode: part.opcode,
        message: {
          ...part.fields,
          ...(part.identifyRecipient ? { other_id: this.recipientId } : {}),
          encode_msg: input.text,
        },
        ...(input.delayMs === undefined ? {} : { delayMs: input.delayMs }),
      })),
    };
  }

  notice(text: string): CityPacket {
    return this.prepare({ kind: "info", text }).packets[0]!;
  }

  reward(text: string, delayMs = 0): CityPacket {
    return this.prepare({ kind: "reward", text, delayMs }).packets[0]!;
  }

  guidance(text: string): CityPacket[] {
    return this.prepare({ kind: "guidance", text }).packets;
  }

  rewardWithAlert(text: string, presentation: Extract<MessagePresentation, "chat-and-alert" | "alert-and-chat"> = "alert-and-chat"): CityPacket[] {
    return this.prepare({ kind: "reward", text, presentation }).packets;
  }
}
