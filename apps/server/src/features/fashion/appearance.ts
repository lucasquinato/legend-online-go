import type { Message } from "../../messages.js";
import { fields } from "../../protocol.js";
import type { TutorialResponse } from "../../tutorial.js";
import { classForIcon } from "../../combat.js";
import { InventoryError, itemTemplate } from "../../inventory.js";
import { fashionBody } from "./progression.js";
import type { FashionContext, FashionSave } from "./state.js";

/** Collection viewing, selected/hidden visuals and virtual equipment slots. */
export class FashionAppearance {
  constructor(
    private readonly context: FashionContext,
    private readonly progress: () => NonNullable<FashionSave["fashion"]>,
  ) {}

  moveItem(
    r: Message,
    source: Message | undefined,
  ): TutorialResponse[] | undefined {
    if (
      !source &&
      r.begin_bag_type === 4 &&
      r.begin_obj_id === this.context.scenario.userId &&
      r.end_bag_type === 1
    ) {
      const cosmetic = this.equippedFashionItems().find(
        (i) => i.pos === r.begin_pos,
      );
      if (cosmetic)
        return this.context.atomicMutation(() => {
          const type = Number(itemTemplate(cosmetic.template_id)!.SonType),
            progress = this.progress();
          progress.fields[String({ 109: 3, 110: 4, 111: 5, 112: 6 }[type]!)] =
            0;
          this.context.state.army[
            {
              109: "wing",
              110: "hat",
              111: "fashion_arm",
              112: "fashion_cloth",
            }[type]!
          ] = "";
          const result = this.cosmeticPackets();
          if (r.end_pos >= 0) {
            const target = this.context.state.items[`1:0:${r.end_pos}`];
            result.push(
              this.context.packet({
                opcode: 115,
                message: {
                  moved: [
                    {
                      change_type: 1,
                      change_obj_id: 0,
                      change_pos: r.end_pos,
                      ...(target ? { item: target } : {}),
                    },
                  ],
                },
              }),
            );
          }
          this.context.persist();
          return result;
        });
    }
    return undefined;
  }

  equippedFashionItems(): Message[] {
    const progress = this.context.saved.fashion;
    if (!progress) return [];
    const result: Message[] = [];
    const slots: Record<number, number> = { 109: 8, 110: 9, 111: 11, 112: 10 };
    for (const [type, field] of Object.entries({
      109: 3,
      110: 4,
      111: 5,
      112: 6,
    })) {
      const template = progress.fields[String(field)] ?? 0;
      if (!template || !this.context.state.fashions[template]) continue;
      this.context.inventory(this.context.state);
      const ids = (this.context.saved.cosmeticIds ??= {});
      if (!ids[type]) ids[type] = this.context.saved.inventory!.nextId++;
      result.push({
        id: ids[type],
        template_id: template,
        pos: slots[Number(type)],
        exist: 1,
        object_id: this.context.scenario.userId,
        bag_type: 4,
        bind: 1,
        used: 1,
        count: 1,
        strengthen_grade: 0,
        join_1: -1,
        join_2: -1,
        join_3: -1,
        join_4: -1,
        user_id: this.context.scenario.userId,
      });
    }
    return result;
  }

  cosmeticPackets(): TutorialResponse[] {
    this.applyFashionAppearance();
    const equipped = this.equippedFashionItems();
    return [
      this.context.packet({
        opcode: 115,
        message: {
          moved: [8, 9, 10, 11].map((pos) => ({
            change_type: 4,
            change_obj_id: this.context.scenario.userId,
            change_pos: pos,
            ...(equipped.find((i) => i.pos === pos)
              ? { item: equipped.find((i) => i.pos === pos) }
              : {}),
          })),
        },
      }),
      this.context.packet({ opcode: 301, body: fashionBody(this.progress()) }),
      this.context.packet({ opcode: 150, message: {} }, true),
    ];
  }

  applyFashionAppearance(): void {
    const progress = this.progress();
    for (const [field, key] of [
      [3, "wing"],
      [4, "hat"],
      [5, "fashion_arm"],
      [6, "fashion_cloth"],
    ] as const) {
      const template = progress.fields[String(field)] ?? 0;
      this.context.state.army[key] =
        progress.fields[String(field + 4)] === 1
          ? ""
          : (itemTemplate(template)?.Avata ?? "");
    }
  }

  saveFashionAppearance(body: Buffer): TutorialResponse[] {
    try {
      return this.context.atomicMutation(() => {
        const progress = this.progress();
        const profile = this.context.store.tutorialProfile(
          this.context.userId,
        )!;
        const seen = new Set<number>();
        for (const f of fields(body)) {
          if (f.number < 3 || f.number > 10) continue;
          const value = Number(f.value);
          if (
            f.wire !== 0 ||
            seen.has(f.number) ||
            !Number.isSafeInteger(value) ||
            value < 0
          )
            throw new InventoryError("Seleção de moda inválida");
          seen.add(f.number);
          if (f.number >= 7) {
            if (value > 1)
              throw new InventoryError("Ocultação de moda inválida");
          } else if (value) {
            const row = itemTemplate(value);
            if (
              !this.context.state.fashions[value] ||
              Number(row?.SonType) !== f.number + 106
            )
              throw new InventoryError(
                "Moda ainda não desbloqueada nesta parte da coleção",
              );
            if (
              (Number(row!.Job) !== 0 &&
                Number(row!.Job) !== classForIcon(profile.icon)) ||
              (Number(row!.Sexs) !== 2 && Number(row!.Sexs) !== profile.sex)
            )
              throw new InventoryError(
                "Moda incompatível com a classe ou sexo do personagem",
              );
            this.context.state.fashions[value]!.is_switch = 1;
          }
          progress.fields[String(f.number)] = value;
        }
        // XP and level in the client's snapshot are never authoritative.
        this.context.state.army.hide = 0;
        const result = [
          ...this.cosmeticPackets(),
          this.context.packet({ opcode: 4542, message: {} }, true),
        ];
        this.context.persist();
        return result;
      });
    } catch (error) {
      if (error instanceof InventoryError)
        return [this.context.notice(error.message), ...this.cosmeticPackets()];
      throw error;
    }
  }

  selectFashion(r: Message): TutorialResponse[] {
    try {
      return this.context.atomicMutation(() => {
        const template = Number(r.template_id),
          row = itemTemplate(template),
          type = Number(row?.SonType);
        if (
          !this.context.state.fashions[template] ||
          ![109, 110, 111, 112].includes(type)
        )
          throw new InventoryError("Moda ainda não desbloqueada na coleção");
        const profile = this.context.store.tutorialProfile(
          this.context.userId,
        )!;
        if (
          (Number(row!.Job) !== 0 &&
            Number(row!.Job) !== classForIcon(profile.icon)) ||
          (Number(row!.Sexs) !== 2 && Number(row!.Sexs) !== profile.sex)
        )
          throw new InventoryError(
            "Moda incompatível com a classe ou sexo do personagem",
          );
        const progress = this.progress();
        this.context.state.fashions[template]!.is_switch = 1;
        progress.fields[String({ 109: 3, 110: 4, 111: 5, 112: 6 }[type]!)] =
          template;
        this.context.state.army[
          { 109: "wing", 110: "hat", 111: "fashion_arm", 112: "fashion_cloth" }[
            type
          ]!
        ] = row!.Avata ?? "";
        const result = [
          ...this.cosmeticPackets(),
          this.context.packet({ opcode: 4542, message: {} }, true),
        ];
        this.context.persist();
        return result;
      });
    } catch (error) {
      if (error instanceof InventoryError)
        return [this.context.notice(error.message)];
      throw error;
    }
  }

  markFashionSeen(r: Message): TutorialResponse[] {
    try {
      return this.context.atomicMutation(() => {
        const template = Number(r.template_id),
          owned = this.context.state.fashions[template];
        if (!Number.isSafeInteger(template) || template <= 0 || !owned)
          throw new InventoryError("Moda ainda não desbloqueada na coleção");
        // FashionBook.is_switch means the collection entry has been viewed.
        owned.is_switch = 1;
        this.context.persist();
        return [this.context.packet({ opcode: 4542, message: {} }, true)];
      });
    } catch (error) {
      if (error instanceof InventoryError)
        return [this.context.notice(error.message)];
      throw error;
    }
  }
}
