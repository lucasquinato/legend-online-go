import type { CityPacket } from "../../city-state.js";

export type SystemMessageKind = "error" | "info" | "reward" | "guidance";
export type MessagePresentation = "chat" | "center" | "alert" | "chat-and-alert" | "alert-and-chat";

export interface SystemMessage {
  kind: SystemMessageKind;
  text: string;
  presentation?: MessagePresentation;
  delayMs?: number;
}

export interface SelfMessageDelivery {
  readonly recipientId: number;
  readonly packets: CityPacket[];
}
