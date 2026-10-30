import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { projectRoot } from "../../config.js";
import type { Store } from "../../store.js";
import { CityWorld, type CitySave } from "../../city-world.js";
import type { Message } from "../../messages.js";
import { itemTemplate } from "../../inventory.js";
import { classForIcon } from "../../combat.js";
import { equipmentSkills, equipmentProperties } from "../equipment/content.js";
import { equipmentGems } from "../equipment/gems.js";
import { equipmentStarCap } from "../equipment/requirements.js";
import { templates as cosmosTemplates } from "../cosmos/content.js";
import { basicSkills, createSkills, learnSkill, setSkillKeys, skillBudget, spent, type SkillSave } from "../skills/index.js";
import { CurrencyLedger, currencies, currencyBalance } from "../currencies/index.js";

const catalog = JSON.parse(readFileSync(join(projectRoot, "reference/item-templates.json"), "utf8")).items as Record<string, Record<string, string>>;
const statFields = ["Power", "Agility", "Intellect", "Physique", "Captain", "Attack", "Defence", "MagicAttack", "MagicDefence", "Live", "ForceHit", "Parry", "Conat", "Penetrate", "Strength", "Tenacity", "StunAttr"];
const pairs: Record<string, string> = { Attack: "MagicAttack", MagicAttack: "Attack", Power: "Intellect", Intellect: "Power" };
const stats = (row: Message, swap = false) => statFields.map(k => Number(row[swap ? pairs[k] ?? k : k] ?? 0)).join(",");
const sameTier = (a: Message, b: Message) => ["MasterType", "SonType", "Profile", "NeedGrades", "StrengthenMax"].every(k => String(a[k]) === String(b[k])) && equipmentStarCap(a) === equipmentStarCap(b);

/** Explicit content equivalents, never forged item definitions or negative stat corrections. */
export class MirrorContent {
  readonly conversions = new Map<string, number>();
  private itemCache = new Map<number, number>();
  constructor(readonly job: number, readonly sex: number, readonly physical: boolean) {}
  item(id: number): number {
    if (id <= 0) return id;
    const cached = this.itemCache.get(id); if (cached !== undefined) return cached;
    const t = itemTemplate(id); if (!t) return id;
    let next = id;
    if (Number(t.MasterType) === 1 && Number(t.Job) > 0 && Number(t.Job) !== this.job) {
      const candidates = Object.keys(catalog).map(Number).map(itemTemplate).filter((r): r is Record<string, string> => !!r &&
        Number(r.Job) === this.job && [2, this.sex].includes(Number(r.Sexs)) && sameTier(t, r));
      const preferred = id + (this.job - Number(t.Job)) * 100;
      const initial = id + (this.job - Number(t.Job)) * 1000;
      const match = candidates.find(r => Number(r.TemplateId) === preferred) ?? candidates.find(r => Number(r.TemplateId) === initial)
        ?? candidates.sort((a, b) => Math.abs(Number(a.TemplateId) - id) - Math.abs(Number(b.TemplateId) - id))[0];
      if (!match) throw new Error(`Sem equipamento equivalente de classe: ${id} → ${this.job}`);
      next = Number(match.TemplateId);
    } else if (this.physical && equipmentGems.has(id) && (Number(t.MagicAttack ?? 0) || Number(t.Intellect ?? 0))) {
      const match = [...equipmentGems].map(itemTemplate).find(r => r && Number(r.Profile) === Number(t.Profile) &&
        Number(r.TemplateId) % 100 === id % 100 && stats(r) === stats(t, true));
      if (!match) throw new Error(`Sem gema física equivalente: ${id}`);
      next = Number(match.TemplateId);
    }
    this.itemCache.set(id, next); if (next !== id) this.conversions.set(`item:${id}->${next}`, (this.conversions.get(`item:${id}->${next}`) ?? 0) + 1);
    return next;
  }
  affix(id: number): number {
    if (!this.physical || !id) return id;
    const row = equipmentProperties.get(id), skill = equipmentSkills.get(id);
    if (!row || !skill || !(Number(row.MagicAttack ?? 0) || Number(row.Intellect ?? 0) || Number(row.Attack ?? 0) || Number(row.Power ?? 0))) return id;
    const match = [...equipmentSkills.values()].find(s => s.MasterType === skill.MasterType && s.Grades === skill.Grades &&
      equipmentProperties.has(Number(s.TemplateId)) && stats(equipmentProperties.get(Number(s.TemplateId))!) === stats(row, true));
    if (!match) throw new Error(`Sem bônus físico equivalente: ${id}`);
    return Number(match.TemplateId);
  }
  equipment(item: Message): void {
    const previous = Number(item.template_id); item.template_id = this.item(previous);
    if (Number(itemTemplate(previous)?.MasterType) !== 1) return;
    for (let n = 1; n <= 4; n++) if (Number(item[`join_${n}`]) > 0) item[`join_${n}`] = this.item(Number(item[`join_${n}`]));
    for (let n = 1; n <= 5; n++) if (Number(item[`random_skill_${n}`]) > 0) item[`random_skill_${n}`] = this.affix(Number(item[`random_skill_${n}`]));
  }
  cosmos(id: number): number {
    const t = cosmosTemplates.get(id);
    if (!this.physical || !t || !(Number(t.MagicAttack) || Number(t.Intellect))) return id;
    const match = [...cosmosTemplates.values()].find(r => r.Profile === t.Profile && r.NeedGrades === t.NeedGrades &&
      String(r.DefaultSkill ?? "") === String(t.DefaultSkill ?? "") && stats(r) === stats(t, true));
    if (!match) throw new Error(`Sem Cosmo físico equivalente: ${id}`);
    return Number(match.TemplateId);
  }
}

function classSkills(source: SkillSave, state: CitySave["state"], job: number): SkillSave {
  const target = createSkills({ skill_script: "", fast_key: "" }, job, Number(state.player.grades));
  target.unlocked = source.unlocked;
  for (let page = 0; page < 2; page++) {
    target.active = page;
    const wanted = new Map((source.pages[page]?.learned ?? []).flatMap(id => {
      const row = basicSkills.get(id); return row ? [[job * 100 + Number(row.SonType) % 100, Number(row.Grades)] as const] : [];
    }));
    const budget = Math.min(skillBudget(state.player.grades), spent(source.pages[page]!));
    // Buy real, legal ranks: each class has its own caps and prerequisites.
    for (let pass = 0; pass < 100 && spent(target.pages[page]!) < budget; pass++) {
      const candidates = [...basicSkills.values()].filter(r => Number(r.MasterType) === job && Number(r.NeedPlayerGrade) <= state.player.grades)
        .sort((a, b) => Number((wanted.get(Number(b.SonType)) ?? 0) >= Number(b.Grades)) - Number((wanted.get(Number(a.SonType)) ?? 0) >= Number(a.Grades)) || Number(a.Grades) - Number(b.Grades) || Number(a.TemplateId) - Number(b.TemplateId));
      let learned = false;
      for (const row of candidates) try { learnSkill(target, state, Number(row.TemplateId)); learned = true; break; } catch { /* try the next legal rank */ }
      if (!learned) break;
    }
    const requested = String(source.pages[page]?.keys ?? "").split(",").filter(Boolean).map(Number).map(k => k > 0 ? job * 100 + k % 100 : -1);
    const available = target.pages[page]!.learned.map(id => basicSkills.get(id)!).filter(r => Number(r.UseWay) === 1).map(r => Number(r.SonType));
    const keys = requested.map(k => available.includes(k) ? k : -1);
    for (const k of available) if (!keys.includes(k) && keys.includes(-1)) keys[keys.indexOf(-1)] = k;
    setSkillKeys(target, keys.slice(0, 5).join(",") + ",");
  }
  target.active = source.active; return target;
}

/** Only identity-bearing fields are rewritten; balances/counts/template IDs are not UIDs. */
function reidentify(value: any, source: number, target: number, sourceName: string, targetName: string): void {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (["user_id", "userId", "player_id", "playerId", "army_id", "hero_id", "object_id", "receiveId"].includes(key) && item === source) value[key] = target;
    else if (["nick_name", "nickName", "receiveNickName"].includes(key) && item === sourceName) value[key] = targetName;
    else reidentify(item, source, target, sourceName, targetName);
  }
}

export function mirrorAccountProgress(store: Store, sourceId: number, targetIds: number[], now = Date.now()) {
  if (!targetIds.length || new Set([sourceId, ...targetIds]).size !== targetIds.length + 1) throw new Error("Contas de espelhamento inválidas");
  if ([sourceId, ...targetIds].some(id => store.onlineUsers.has(id))) throw new Error("Desconecte as contas antes de espelhar o progresso");
  const sourceProfile = store.tutorialProfile(sourceId)!, row = store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(sourceId);
  if (!sourceProfile?.active || !row) throw new Error("Origem sem personagem e cidade");
  const original = JSON.parse(String(row.state)) as CitySave;
  const sourceMails = store.db.prepare("SELECT * FROM local_mail WHERE user_id=? ORDER BY seq").all(sourceId);
  const grants = store.db.prepare("SELECT * FROM account_grants WHERE user_id=?").all(sourceId);
  const tutorial = store.db.prepare("SELECT state FROM tutorial_worlds WHERE user_id=?").get(sourceId);
  const farm = store.db.prepare("SELECT state FROM local_farms WHERE user_id=?").get(sourceId);
  const results: Message[] = [];
  store.db.exec("BEGIN IMMEDIATE");
  try {
    for (const targetId of targetIds) {
      const profile = store.tutorialProfile(targetId);
      if (!profile?.active) throw new Error(`Destino sem personagem: ${targetId}`);
      const previousRow = store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(targetId);
      const previous = previousRow ? JSON.parse(String(previousRow.state)) as CitySave : undefined;
      const saved = structuredClone(original), job = classForIcon(profile.icon), content = new MirrorContent(job, profile.sex, classForIcon(sourceProfile.icon) === 3 && job !== 3);
      reidentify(saved, sourceId, targetId, sourceProfile.nickname, profile.nickname);
      saved.map = 1; delete saved.battle; delete saved.location; delete saved.instanceFury; delete saved.campaignRun;
      if (saved.skyRealm) { saved.skyRealm.active = false; delete saved.skyRealm.route; }
      Object.assign(saved.state.player, { nick_name: profile.nickname, pic: profile.icon, sex: profile.sex });
      Object.assign(saved.state.hero, { nick_name: profile.nickname, tempate_id: profile.icon, head_id: profile.icon });
      Object.assign(saved.state.army, { nick_name: profile.nickname, hero_tempId: profile.icon, job, map_id: 1 });
      for (const item of Object.values(saved.state.items)) content.equipment(item);
      if (saved.cosmos) for (const star of [...Object.values(saved.cosmos.instances), ...Object.values(saved.cosmos.suspended ?? {})]) star.templateId = content.cosmos(star.templateId);
      saved.skills = classSkills(original.skills!, saved.state, job);
      // Offers/proposals belong to the old item templates and are not committed upgrades.
      saved.purification = {}; saved.forgeOrigins = {};
      const mailIds = new Map<number, number>();
      store.db.prepare("DELETE FROM local_mail WHERE user_id=?").run(targetId);
      store.db.prepare("DELETE FROM account_grants WHERE user_id=?").run(targetId);
      for (const mail of sourceMails) {
        const detail = JSON.parse(String(mail.detail)); reidentify(detail, sourceId, targetId, sourceProfile.nickname, profile.nickname);
        const seq = Number(store.db.prepare("INSERT INTO local_mail(user_id,detail,min_level) VALUES(?,?,?)").run(targetId, "{}", mail.min_level!).lastInsertRowid);
        const id = 1000000 + seq; mailIds.set(Number(mail.mail_id), id); detail.id = id; detail.receiveId = targetId;
        for (let n = 1; n <= 5; n++) {
          if (Number(detail[`annex${n}`]) > 0) detail[`annex${n}`] = 20000000 + seq * 5 + n;
          if (Number(detail[`annex${n}Name`]) > 0) detail[`annex${n}Name`] = content.item(Number(detail[`annex${n}Name`]));
        }
        store.db.prepare("UPDATE local_mail SET mail_id=?,detail=? WHERE seq=?").run(id, JSON.stringify(detail), seq);
      }
      for (const grant of grants) store.db.prepare("INSERT INTO account_grants(user_id,grant_key,mail_id) VALUES(?,?,?)").run(targetId, grant.grant_key!, mailIds.get(Number(grant.mail_id)) ?? grant.mail_id!);
      saved.pendingMailNotices = (saved.pendingMailNotices ?? []).map(id => mailIds.get(id) ?? id);
      saved.deletedMailIds = (saved.deletedMailIds ?? []).map(id => mailIds.get(id) ?? id);
      saved.state.mails = Object.fromEntries(Object.entries(saved.state.mails).map(([id, m]) => {
        const next = mailIds.get(Number(id)) ?? Number(id); return [String(next), { ...m, id: next }];
      }));
      // Audit histories belong to their original accounts. Completed objectives,
      // grant receipts and the production cursor are already in the cloned save.
      if (previous) for (const currency of Object.keys(currencies) as (keyof typeof currencies)[]) {
        const delta = currencyBalance(saved.state, currency) - currencyBalance(previous.state, currency);
        if (delta) new CurrencyLedger(store.db, () => now).change(previous.state, targetId, currency, delta, "account:mirror", `account:mirror:${randomUUID()}:${currency}`);
      }
      if (farm) {
        const data = JSON.parse(String(farm.state)); reidentify(data, sourceId, targetId, sourceProfile.nickname, profile.nickname);
        store.db.prepare("INSERT INTO local_farms(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state").run(targetId, JSON.stringify(data));
      }
      if (tutorial) store.db.prepare("INSERT INTO tutorial_worlds(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state").run(targetId, String(tutorial.state));
      store.db.prepare("UPDATE tutorial_profiles SET process=? WHERE user_id=?").run(sourceProfile.process, targetId);
      store.db.prepare("DELETE FROM local_events WHERE user_id=?").run(targetId);
      store.db.prepare("INSERT INTO city_worlds(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state").run(targetId, JSON.stringify(saved));
      const world = new CityWorld(store, targetId, () => now); world.state.hero.hp = world.state.hero.total_live; world.persist();
      results.push({ userId: targetId, nickname: profile.nickname, job, level: world.state.player.grades,
        attack: world.state.hero.total_phy_attack, magic: world.state.hero.total_magic_attack, hp: world.state.hero.total_live,
        defence: world.state.hero.total_phy_defence, resistance: world.state.hero.total_magic_defence, power: world.state.hero.fighting_capacity,
        items: Object.keys(world.state.items).length, mails: sourceMails.length, conversions: Object.fromEntries(content.conversions) });
    }
    store.db.exec("COMMIT"); return results;
  } catch (error) { store.db.exec("ROLLBACK"); throw error; }
}
