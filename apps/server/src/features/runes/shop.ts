import type { Message } from "../../messages.js";
import type { CityState } from "../../city-state.js";
import { itemTemplate, type Inventory } from "../../inventory.js";
import { tables } from "../settlement/content.js";
import { CurrencyLedger, currencyBalance } from "../currencies/index.js";
import { RuneError } from "./index.js";

export const runeOffers = tables.ShopTempInfos!.filter(row => Number(row.ShopType) === 1 && Number(itemTemplate(row.ItemId)?.SonType) === 302);
export function runePurchaseEntries(opcode: number, request: Message): Message[] | undefined {
  if (![5154, 8970].includes(opcode)) return;
  const entries = opcode === 5154
    ? [{ shopId: request.buyInfo?.good_id, counts: request.buyInfo?.count, payType: request.pay_type ?? 0 }]
    : request.carItemInfo;
  if (Array.isArray(entries) && entries.some(entry => runeOffers.some(row => Number(row.Id) === Number(entry.shopId)))) return entries;
}
/** The caller commits currency, inventory and account save in one transaction. */
export function buyRunes(state: CityState, inventory: Inventory, ledger: CurrencyLedger, userId: number, protocolUserId: number, opcode: number, request: Message, entries: Message[]): void {
  const receiver = opcode === 5154 ? request.buyInfo?.receive_id : request.receiveUserId;
  if ((receiver && ![userId, protocolUserId].includes(Number(receiver))) || !entries.length || entries.length > 20)
    throw new RuneError("Compra de runas inválida; envie apenas para sua conta");
  if (request.discountTempId || request.item_template_id || request.buyInfo?.is_discount || entries.some(e => e.isDiscountShop))
    throw new RuneError("Esta oferta de runas não aceita desconto ou cupom");
  for (const entry of entries) {
    const offer = runeOffers.find(row => Number(row.Id) === Number(entry.shopId)), count = Number(entry.counts), payType = Number(entry.payType);
    if (!offer || !Number.isSafeInteger(count) || count < 1 || count > 9999 || !(opcode === 5154 ? [0, 1] : [1, 2]).includes(payType))
      throw new RuneError("Oferta, quantidade ou pagamento de runa inválido");
    if (Number(state.player.grades) < Number(offer.NeedGrades)) throw new RuneError(`Compra requer nível ${offer.NeedGrades}`);
    const unitPrice = Number(offer.Point) || Number(offer.GiftToken), price = unitPrice * count;
    if (!Number.isSafeInteger(price) || price <= 0) throw new RuneError("Preço de runa indisponível");
    const useBound = opcode === 5154 ? payType === 0 : payType === 2;
    const bound = useBound && Number(offer.GiftToken) > 0 ? Math.min(price, currencyBalance(state, "boundDiamonds")) : 0;
    ledger.changeMany(state, userId, { boundDiamonds: -bound, diamonds: -(price - bound) }, `runes:shop:${offer.Id}`);
    inventory.add({ template_id: Number(offer.ItemId), bag_type: 1, object_id: 0, pos: -1, bind: bound > 0 ? 1 : 0, used: 0,
      strengthen_grade: 0, join_1: -1, join_2: -1, join_3: -1, join_4: -1 }, count);
  }
}
