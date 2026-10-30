import type { Message } from "../../messages.js";
import { typeName } from "../../messages.js";
import { fields } from "../../protocol.js";
import type { TutorialResponse } from "../../tutorial.js";
import type { CityPacket } from "../../city-state.js";
import { GoldError } from "../../gold.js";
import {
  InventoryError,
  itemTemplate,
  inventoryUpdates,
} from "../../inventory.js";
import { applyAttributes, AttributeCalculator } from "../../attributes.js";
import { fashionAttributeSources } from "../attributes/fashion.js";
import {
  advanceFashion,
  fashionProgress,
  fashionBody,
  fashionXp,
  fashionLevels,
  MAX_FASHION_LEVEL,
} from "./progression.js";
import {
  initialRefinement,
  planRefinement,
  refinementBody,
} from "./refinement.js";
import { appraisalPlan, appraisalValues } from "./appraisal.js";
import type { FashionContext, FashionSave } from "./state.js";
import { FashionAppearance } from "./appearance.js";

export function configureFashionProtocol(
  outgoing: Record<number, string>,
): void {
  outgoing[8595] = typeName("fashion.FashionMsg");
  outgoing[8631] = typeName("fashion.FashionMsg");
  outgoing[8781] = typeName("fashion.FashionMsg");
}

/** Completed fashion behavior; infrastructure is supplied by the city host. */
export class FashionFeature {
  private readonly appearance: FashionAppearance;
  constructor(private readonly context: FashionContext) {
    this.appearance = new FashionAppearance(context, () =>
      this.ensureFashion(),
    );
  }

  equippedFashionItems(): Message[] {
    return this.appearance.equippedFashionItems();
  }

  moveItem(
    r: Message,
    source: Message | undefined,
  ): TutorialResponse[] | undefined {
    return this.appearance.moveItem(r, source);
  }

  handle(
    op: number,
    r: Message | undefined,
    packet: Buffer,
  ): TutorialResponse[] | undefined {
    if (op === 9582)
      return this.appearance.saveFashionAppearance(packet.subarray(20));
    if (op === 9635) return this.refineFashion(packet.subarray(20));
    if (op === 8595 && r) return this.appearance.selectFashion(r);
    if (op === 8631 && r) return this.appearance.markFashionSeen(r);
    if (op === 8781 && r) return this.appraiseFashion(r);
    if (op === 8594 && r) return this.consumeFashion(r);
    return undefined;
  }

  model(packet: CityPacket): CityPacket | undefined {
    if (packet.opcode === 408)
      return {
        ...packet,
        message: undefined,
        body: refinementBody(
          this.context.saved.refinement ?? initialRefinement(),
        ),
      };
    if (packet.opcode === 301 && this.context.saved.fashion)
      return {
        ...packet,
        message: undefined,
        body: fashionBody(this.context.saved.fashion),
      };
    if (packet.opcode === 4542)
      return {
        ...packet,
        message: {
          info: Object.values(this.context.state.fashions),
          fashionIds: this.context.state.fashionIds,
        },
      };
    return undefined;
  }

  syncAttributes(): void {
    Object.assign(this.context.saved.attributes!.sources, fashionAttributeSources(this.ensureFashion().level, this.context.state.fashions, this.context.saved.refinement));
  }
  initialRage(): number {
    return Number(AttributeCalculator.calculate(this.context.saved.attributes!).total_initial_fury ?? 0);
  }

  isFashion(item: Message): boolean {
    return fashionXp(item.template_id) > 0;
  }

  private ensureFashion(): NonNullable<FashionSave["fashion"]> {
    if (!this.context.saved.fashion) {
      let body = this.context.state.packets[301]?.body;
      for (const index of this.context.saved.used) {
        const c = this.context.scenario.cases[index];
        if (c?.opcode === 8594)
          body = c.responses.find((p) => p.opcode === 301)?.body ?? body;
      }
      const progress = fashionProgress(body);
      this.context.saved.fashion = {
        ...progress,
        baselineLevel: progress.level,
      };
    }
    return this.context.saved.fashion;
  }

  private appraiseFashion(r: Message): TutorialResponse[] {
    try {
      return this.context.atomicMutation(() => {
        if (this.context.state.player.grades < 27)
          throw new InventoryError("Avaliação de moda exige nível 27");
        const template = Number(r.template_id),
          owned = this.context.state.fashions[template];
        if (!owned)
          throw new InventoryError("Moda ainda não desbloqueada na coleção");
        const plan = appraisalPlan(
          template,
          Number(owned.appraisal_skill ?? 0),
        );
        const before = structuredClone(this.context.state.items);
        this.context.ensureAttributes();
        if (plan.gold)
          this.context.gold.change(
            this.context.state.economy,
            this.context.userId,
            -plan.gold,
            `fashion:appraisal:${template}`,
          );
        if (plan.souls) {
          this.context
            .inventory(this.context.state)
            .consumeTemplate(208020, plan.souls);
        }
        owned.appraisal_skill = plan.skill;
        this.context.saved.attributes!.sources["fashion:appraisal"] = {
          kind: "permanent",
          evidence: "observed-delta",
          values: appraisalValues(this.context.state.fashions),
          derivePrimary: true,
        };
        this.syncAttributes();
        applyAttributes(
          this.context.saved.attributes!,
          this.context.state.hero,
        );
        this.context.persist();
        return [
          this.context.packet({
            opcode: 115,
            message: {
              moved: inventoryUpdates(before, this.context.state.items),
            },
          }),
          ...[4542, 109, 113, 3, 150].map((opcode) =>
            this.context.packet({ opcode, message: {} }, true),
          ),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError || error instanceof GoldError)
        return [this.context.notice(error.message)];
      throw error;
    }
  }

  private refineFashion(body: Buffer): TutorialResponse[] {
    const current = () =>
      this.context.packet({
        opcode: 408,
        body: refinementBody(
          this.context.saved.refinement ?? initialRefinement(),
        ),
      });
    try {
      const values = new Map<number, number>();
      for (const f of fields(body)) {
        const value = Number(f.value);
        if (
          f.wire !== 0 ||
          ![1, 2, 3].includes(f.number) ||
          values.has(f.number) ||
          !Number.isSafeInteger(value) ||
          value < 0
        )
          throw new InventoryError("Pedido de refinação inválido");
        values.set(f.number, value);
      }
      if (values.get(1) === 1) return [current()];
      if (values.get(1) !== 2)
        throw new InventoryError("Operação de refinação inválida");
      return this.context.atomicMutation(() => {
        const type = values.get(2)!,
          count = values.get(3)!;
        const planned = planRefinement(
          this.context.saved.refinement ?? initialRefinement(),
          this.context.state.fashions,
          type,
          count,
        );
        const before = structuredClone(this.context.state.items);
        this.context
          .inventory(this.context.state)
          .consumeTemplate(2131521, planned.consumed);
        this.context.saved.refinement = planned.progress;
        this.context.persist();
        this.context.store.tutorialEvent(
          "fashion-refined",
          this.context.userId,
          {
            type,
            requested: count,
            consumed: planned.consumed,
            ...planned.progress[type],
          },
        );
        return [
          this.context.packet({
            opcode: 115,
            message: {
              moved: inventoryUpdates(before, this.context.state.items),
            },
          }),
          current(),
          ...[113, 3, 150, 4542].map((opcode) =>
            this.context.packet({ opcode, message: {} }, true),
          ),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError)
        return [this.context.notice(error.message), current()];
      throw error;
    }
  }

  private consumeFashion(r: Message): TutorialResponse[] {
    try {
      return this.context.atomicMutation(() => {
        const item = this.context.state.items["0:0:0"];
        const count = Number(r.count);
        if (!item || !fashionXp(item.template_id))
          throw new InventoryError(
            "Coloque uma Alma, Amuleto ou peça de moda no slot de absorção.",
          );
        if (!Number.isSafeInteger(count) || count <= 0 || count > item.count)
          throw new InventoryError(
            "Quantidade de moda inválida. O item foi preservado.",
          );
        this.context.ensureAttributes();
        const progress = this.ensureFashion(),
          beforeLevel = progress.level;
        const row = itemTemplate(item.template_id)!;
        const type = Number(row.SonType),
          piece = [109, 110, 111, 112].includes(type);
        const xp =
          progress.level >= MAX_FASHION_LEVEL && piece
            ? 0
            : fashionXp(item.template_id) * count;
        if (xp) advanceFashion(progress, xp);
        for (let level = beforeLevel + 1; level <= progress.level; level++) {
          const unlocked = Number(fashionLevels.get(level)?.ActiveObject ?? 0);
          if (unlocked)
            this.context.state.fashions[unlocked] ??= {
              temp_id: unlocked,
              is_switch: 0,
              appraisal_skill: 0,
            };
        }
        const before = structuredClone(this.context.state.items);
        this.context.inventory(this.context.state).consume("0:0:0", count);
        if ([109, 110, 111, 112].includes(type)) {
          this.context.state.fashions[item.template_id] ??= {
            temp_id: item.template_id,
            is_switch: 0,
            appraisal_skill: 0,
          };
          const attribute = {
            109: "wing",
            110: "hat",
            111: "fashion_arm",
            112: "fashion_cloth",
          }[type]!;
          this.context.state.army[attribute] = row.Avata ?? "";
          progress.fields[String({ 109: 3, 110: 4, 111: 5, 112: 6 }[type]!)] =
            item.template_id;
        }
        this.syncAttributes();
        applyAttributes(this.context.saved.attributes!, this.context.state.hero);
        this.context.state.packets[301] = {
          opcode: 301,
          body: fashionBody(progress),
        };
        this.appearance.applyFashionAppearance();
        this.equippedFashionItems();
        this.context.persist();
        this.context.store.tutorialEvent(
          "fashion-consumed",
          this.context.userId,
          {
            template: item.template_id,
            count,
            xp,
            beforeLevel,
            level: progress.level,
            remainingXp: progress.xp,
          },
        );
        return [
          this.context.packet({
            opcode: 115,
            message: {
              moved: inventoryUpdates(before, this.context.state.items),
            },
          }),
          this.context.packet(this.context.state.packets[301]!),
          this.context.packet({
            opcode: 4487,
            message: {
              compose_result: 1,
              compose_templateId: item.template_id,
              $9: { wire: 0, value: String(xp) },
            },
          }),
          this.context.packet({ opcode: 4542, message: {} }, true),
          this.context.packet({ opcode: 113, message: {} }, true),
          this.context.packet({ opcode: 3, message: {} }, true),
          this.context.packet({ opcode: 150, message: {} }, true),
          ...this.appearance.cosmeticPackets(),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError) {
        this.context.rejection(error.message);
        return [
          this.context.packet({ opcode: 4487, message: { compose_result: 0 } }),
          this.context.notice(error.message),
        ];
      }
      throw error;
    }
  }
}
