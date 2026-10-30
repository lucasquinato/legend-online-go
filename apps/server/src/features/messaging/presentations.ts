import type { Message } from "../../messages.js";
import type { MessagePresentation, SystemMessageKind } from "./types.js";

interface MessagePart {
  readonly opcode: number;
  readonly fields: Readonly<Message>;
  readonly identifyRecipient?: boolean;
}

const chat: MessagePart = Object.freeze({
  opcode: 83,
  fields: Object.freeze({ channel: 3, type: 0, name: "Sistema", is_centerTip: false }),
  identifyRecipient: true,
});
const center: MessagePart = Object.freeze({
  opcode: 83,
  fields: Object.freeze({ channel: 3, type: 0, name: "Servidor local", is_centerTip: true }),
  identifyRecipient: true,
});
const alert: MessagePart = Object.freeze({
  opcode: 111,
  fields: Object.freeze({ channel: 7 }),
});

// Presentation policy lives here; adding a layout does not change the controller.
export const messagePresentations: Readonly<Record<MessagePresentation, readonly MessagePart[]>> = Object.freeze({
  chat: Object.freeze([chat]),
  center: Object.freeze([center]),
  alert: Object.freeze([alert]),
  "chat-and-alert": Object.freeze([chat, alert]),
  "alert-and-chat": Object.freeze([alert, chat]),
});

export const defaultPresentation: Readonly<Record<SystemMessageKind, MessagePresentation>> = Object.freeze({
  error: "center",
  info: "center",
  reward: "chat",
  guidance: "chat-and-alert",
});
