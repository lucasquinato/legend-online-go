import type { MessageCenter } from "./controller.js";
import type { MessagePresentation, SelfMessageDelivery, SystemMessageKind } from "./types.js";

export type MessagePurpose = "notice" | "error" | "native-error" | "acquisition" | "reward-log" | "guidance" | "chest-reward" | "passive-income" | "screen-info";
interface DeliveryPolicy {
  readonly kind: SystemMessageKind;
  readonly presentation: MessagePresentation;
}
export const systemMessagePolicy: Readonly<Record<MessagePurpose, DeliveryPolicy>> = Object.freeze({
  notice: Object.freeze({ kind: "info", presentation: "center" }),
  error: Object.freeze({ kind: "error", presentation: "center" }),
  "native-error": Object.freeze({ kind: "error", presentation: "chat" }),
  acquisition: Object.freeze({ kind: "reward", presentation: "chat-and-alert" }),
  "reward-log": Object.freeze({ kind: "reward", presentation: "chat" }),
  guidance: Object.freeze({ kind: "guidance", presentation: "chat-and-alert" }),
  "chest-reward": Object.freeze({ kind: "reward", presentation: "alert-and-chat" }),
  "passive-income": Object.freeze({ kind: "reward", presentation: "chat" }),
  "screen-info": Object.freeze({ kind: "info", presentation: "alert" }),
});
export const passiveIncomeIntervalMs = 60000;

/** Purpose selects policy; business systems and the controller need no layout branches. */
export function presentSystemMessage(center: MessageCenter, purpose: MessagePurpose, text: string, delayMs?: number): SelfMessageDelivery {
  return center.prepare({ ...systemMessagePolicy[purpose], text, ...(delayMs === undefined ? {} : { delayMs }) });
}
