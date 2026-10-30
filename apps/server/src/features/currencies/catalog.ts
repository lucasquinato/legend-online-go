import type { Message } from "../../messages.js";

export class CurrencyError extends Error {}
export const INT32_MAX = 2147483647;
export const currencies = {
  gold: {
    label: "ouro",
    root: "economy",
    field: "gold_total_count",
    max: INT32_MAX,
    model: 109,
  },
  diamonds: {
    label: "diamantes",
    root: "player",
    field: "point",
    max: INT32_MAX,
    model: 3,
  },
  boundDiamonds: {
    label: "diamantes vinculados",
    root: "player",
    field: "gift_token",
    max: INT32_MAX,
    model: 3,
  },
  spirit: {
    label: "espírito",
    root: "player",
    field: "strategy",
    max: Number.MAX_SAFE_INTEGER,
    model: 3,
  },
  lightCrystal: {
    label: "cristais de luz",
    root: "economy",
    field: "crystals_count",
    max: INT32_MAX,
    model: 109,
  },
  energy: {
    label: "energia",
    root: "player",
    field: "weary",
    max: INT32_MAX,
    model: 3,
  },
  labyrinthCoin: {
    label: "moedas do labirinto",
    root: "token",
    field: "11",
    max: INT32_MAX,
    model: 4725,
  },
  mountEssence: {
    label: "essência da fera",
    root: "token",
    field: "14",
    max: INT32_MAX,
    model: 4725,
  },
  guildFang:{label:"dentes do terror",root:"token",field:"6",max:INT32_MAX,model:4725},
  gameCoin:{label:"moedas do jogo",root:"token",field:"15",max:INT32_MAX,model:4725},
  arenaMedal:{label:"medalhas de arena",root:"token",field:"8",max:INT32_MAX,model:4725},
  navigationCoin: {
    label: "moedas de navegação", root: "token", field: "101", max: INT32_MAX, model: 4725,
  },
  illusionDust: {
    label: "pó da ilusão",
    root: "token",
    field: "27",
    max: INT32_MAX,
    model: 4725,
  },
} as const;
export type Currency = keyof typeof currencies;
// Resource annex IDs recovered from ItemTempInfo in the cached tempinfos.xml.
export const currencyAnnexes: Record<number, Currency> = {
  [-100]: "gold",
  [-300]: "spirit",
  [-400]: "diamonds",
  [-500]: "boundDiamonds",
  [-600]: "lightCrystal",
  [-3000]: "mountEssence",
  [-1400]: "guildFang",
  [-4000]: "gameCoin",
};
export interface CurrencyState {
  economy: Message;
  player?: Message;
  packets?: Record<
    string,
    { opcode: number; message?: Message; body?: string; delayMs?: number }
  >;
}

export function nextCurrencyBalance(
  currency: Currency,
  balance: number,
  delta: number,
): number {
  const { label, max } = currencies[currency];
  if (
    !Number.isSafeInteger(balance) ||
    balance < 0 ||
    balance > max ||
    !Number.isSafeInteger(delta)
  )
    throw new CurrencyError(`Saldo ou quantidade de ${label} inválidos`);
  const next = balance + delta;
  if (!Number.isSafeInteger(next) || next > max)
    throw new CurrencyError(`Limite de ${label} excedido`);
  if (next < 0)
    throw new CurrencyError(
      `${label === "ouro" ? "Ouro" : label} insuficiente`,
    );
  return next;
}
export function currencyBalance(
  state: CurrencyState,
  currency: Currency,
): number {
  const spec = currencies[currency];
  if (spec.root === "token")
    return Number(
      state.packets?.[4725]?.message?.tokenInfos?.find(
        (t: Message) => t.masterType === Number(spec.field),
      )?.amount ?? 0,
    );
  return Number(state[spec.root]?.[spec.field] ?? 0);
}
export function setCurrencyBalance(
  state: CurrencyState,
  currency: Currency,
  amount: number,
): void {
  const spec = currencies[currency];
  if (spec.root === "token") {
    const packet = ((state.packets ??= {})[4725] ??= {
      opcode: 4725,
      message: { tokenInfos: [] },
    });
    const tokens = ((packet.message ??= {}).tokenInfos ??= []);
    let token = tokens.find((t: Message) => t.masterType === Number(spec.field));
    if (!token) {
      token = { masterType: Number(spec.field), amount: 0, expiredDate: "" };
      tokens.push(token);
    }
    token.amount = amount;
  } else (state[spec.root] ??= {})[spec.field] = amount;
}
export function currencyAtPath(
  state: CurrencyState,
  path: string[],
): Currency | undefined {
  for (const [key, spec] of Object.entries(currencies))
    if (path.length === 2 && path[0] === spec.root && path[1] === spec.field)
      return key as Currency;
  if (
    path.length === 6 &&
    path.slice(0, 4).join(".") === "packets.4725.message.tokenInfos" &&
    path[5] === "amount" &&
    state.packets?.[4725]?.message?.tokenInfos?.[Number(path[4])]?.masterType !== undefined
  )
    return (Object.entries(currencies).find(([, spec]) => spec.root === "token" && Number(spec.field) === state.packets?.[4725]?.message?.tokenInfos?.[Number(path[4])]?.masterType)?.[0]) as Currency | undefined;
  return undefined;
}
