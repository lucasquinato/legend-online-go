import {marriagePurchaseEntries,buyMarriage} from "./features/social/shop.js";
import {FateFeature,type FateSave} from "./features/fate/index.js";
import {DragonSoulFeature,type DragonSoulSave} from "./features/dragon-soul/index.js";
import {synchronizeAdvancedSoul,upgradeAdvancedSoul,ADVANCED_SOUL_ITEM} from "./features/soul-seal/index.js";
import { synchronizedTime } from "./game-clock.js";
import { ResidenceFeature } from "./features/residence/feature.js";
import { ResidenceError } from "./features/residence/economy.js";
import { initialResidence, settleResidence, type ResidenceSave } from "./features/residence/economy.js";
import { equippedBattleSkills } from "./features/battle/tactical-ai.js";
import { automaticModeMessage, setBattleAutomatic } from "./features/battle/automatic.js";
import { pauseInitiative } from "./features/battle/initiative.js";
import { populateAutomatic } from "./features/battle/engine.js";
import { syncBattlePressure } from "./features/battle/pressure.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store.js";
import {
  decodeMessage,
  encodeMessage,
  typeName,
  type Message,
} from "./messages.js";
import { fields, frame, protoInt, protoString } from "./protocol.js";
import { type TutorialResponse } from "./tutorial.js";
import {
  applyCityPatch,
  valueAt,
  type CityState,
  type CityPacket,
  type CityPatch,
} from "./city-state.js";
import {
  createAdventure,
  advanceAdventure,
  adventureSkill,
  adventureTargets,
  migrateAdventure,
  readyAdventure,
  setAdventurePaused,
  adventureSelection,
  type AdventureBattle,
  type AdventureReference,
} from "./adventure-combat.js";
import { classForIcon, skillTemplates } from "./combat.js";
import { closingDelay } from "./features/battle/timing.js";
import { MessageCenter, systemMessageText, acquisitionSnapshot, acquisitionGains, acquisitionText, type AcquisitionGain } from "./features/messaging/index.js";
import { RejectionFeedback, unavailableActionText, alreadyCompletedText } from "./features/messaging/index.js";
import { presentSystemMessage, initialProductionCursor, pendingProductionSummary, type MessageReceipts } from "./features/messaging/index.js";
import { starterTemplate } from "./starter-equipment.js";
import { moveEquipment } from "./features/equipment/index.js";
import { synchronizeEquipmentAppearance, applyBattleEquipmentAppearance } from "./features/equipment/appearance.js";
import { synthesizeEquipment,normalizeEquipmentAffixes } from "./features/equipment/content.js";
import { upgradeRefinement } from "./features/equipment/refinement.js";
import { forgeItem, moveForgeItem, luckyStoneRecipes, synthesizeLuckyStone, strengthenEquipment, type ForgeOrigins } from "./features/equipment/forge.js";
import { ensureEquipmentSockets, gemRecipes, accessoryRecipes, synthesizeGem, insertGem, socketOperation, upgradeSoul, drillOffers, DRILL } from "./features/equipment/gems.js";
import {decomposeGems,convertGems,forgeGem} from "./features/equipment/gem-operations.js";
import {purifyEquipment,applyPurification,type PurificationSave} from "./features/equipment/purification.js";
import {castEquipment} from "./features/equipment/casting.js";
import {forgeOffers,forgeMaterialPrice} from "./features/equipment/materials.js";
import { rollInitialEquipment, synchronizeInitialEquipment } from "./features/attributes/initial-equipment.js";
import { startingFury, finishedFury, type InstanceFury } from "./features/attributes/fury.js";
import { createSkills, syncSkills, learnSkill, setSkillKeys, resetSkillPage, switchSkillPage, syncSkillAttributes, initialSkills, SkillError, type SkillSave } from "./features/skills/index.js";
import { createRunes, syncRunes, runeModel, operateRune, moveRuneMaterial, RuneError, type RuneSave } from "./features/runes/index.js";
import { runePurchaseEntries, buyRunes } from "./features/runes/shop.js";
import {
  LabyrinthFeature,
  LabyrinthError,
  isLabyrinthMap,
  type LabyrinthSave,
} from "./features/labyrinth/index.js";
import { LabyrinthBot } from "./features/labyrinth/bot.js";
import { normalizeLabyrinthQuestConditions } from "./features/labyrinth/quest.js";
import { labyrinthFloors, type LabyrinthDrop } from "./features/labyrinth/content.js";
import { projectRoot } from "./config.js";
import { randomUUID } from "node:crypto";
import { storyQuests, questClaimed, questParents, questInDateWindow, markQuestClaimed, questSnapshot, updateStoryObjectives } from "./features/quests/index.js";
import {
  SettlementFeature,
  SettlementError,
  type SettlementSave,
} from "./features/settlement/index.js";
import { synthesizeFarm, farmRecipes } from "./features/farm/recipes.js";
import { NavigationFeature, NavigationError } from "./features/navigation/index.js";
import { FarmFeature, FarmError } from "./features/farm/index.js";
import { MarriageFeature } from "./features/social/marriage.js";
import { teams } from "./features/social/teams.js";
import { nativePacket } from "./features/social/protocol.js";
import { SocialFeature, SocialError } from "./features/social/index.js";
import {
  pawnTemplates,
  buildingTemplates,
} from "./features/settlement/content.js";
import {
  CurrencyLedger,
  CurrencyError,
  currencyAtPath,
  currencyBalance,
  setCurrencyBalance,
  nextCurrencyBalance,
  currencies,
  currencyAnnexes,
  type Currency,
} from "./features/currencies/index.js";
import {
  grantExperience,
  experienceReward,
  repairExperience,
  ExperienceError,
} from "./progression.js";
import { GoldLedger, GoldError, canChangeGold } from "./gold.js";
import { moveStorage, arrangeStorage, expansion, storageCapacity, stoneCapacity, permanentCapacity, expired, serverDate, dateTime, storageEligible, stackSignature, storageRules, storageDestination, validateStorageDestination, transferTreasures } from "./features/inventory/storage.js";
import { createProtection, checkProtection, lockStorage, type StorageProtection } from "./features/inventory/protection.js";
import {
  campaignDefinitions,
  campaignQuests,
  campaignByMap,
  campaignBattleIndices,
  addCampaignBattles,
  addExpandedCampaignBattles,
  isCampaignBattle,
  campaignCardDeck,
  campaignRank,
  campaignRules,
  grantChapterRewards,
  CampaignSweep,
  type SweepSave,
  type HeroEntrySave,
  heroEntries,
  reserveHeroEntries,
  type CampaignDefinition,
  type CampaignCard,
} from "./features/campaign/index.js";
import {
  FashionFeature,
  configureFashionProtocol,
  type FashionSave,
} from "./features/fashion/index.js";
import { MountFeature, MountError, type MountSave } from "./features/mounts/index.js";
import { CosmosFeature, CosmosError, type CosmosSave } from "./features/cosmos/index.js";
import { TattooFeature, TattooError, tattooSchemas, type TattooSave } from "./features/tattoo/index.js";
import { SkyRealm, SkyError, skyWire, type SkySave } from "./features/sky-realm/index.js";
import { cosmosQuests } from "./features/cosmos/content.js";
import { initializeTitleSave, validateTitleSave, selectTitle, TitleStateError, type TitleSave } from "./features/titles/state.js";
import { titleCatalog } from "./features/titles/content.js";
import { TitleReconciler } from "./features/titles/reconciliation.js";
import { localTitleFactReader } from "./features/titles/local-facts.js";
import { synchronizeTitleAttributes } from "./features/titles/attributes.js";
import { titleUnlockQuest, synchronizeTitleUnlockQuest } from "./features/titles/quest.js";
import { TitleProtocolError, titleSchemas, titleRequest, titleList, titleIdentity, pendingTitleNotifications, pendingTitleRemovalText, titleObtainedPacket } from "./features/titles/protocol.js";
import { expireTitles, nextTitleDeadline, TitleMaintenance, type TitleMaintenanceSnapshot } from "./features/titles/lifecycle.js";
import { mountQuests, updateMountObjectives } from "./features/mounts/quests.js";
import {
  Inventory,
  InventoryError,
  type InventoryIds,
  inventoryUpdates,
  sellPrice,
  itemTemplate,
} from "./inventory.js";
import {
  AttributeCalculator,
  type AttributeState,
  isAttribute,
  applyAttributes,
  synchronizeNaturalAttributes,
} from "./attributes.js";
import { gameDay } from "./game-clock.js";
const questTemplates: Message[] = JSON.parse(
  readFileSync(join(projectRoot, "reference/city-quests.json"), "utf8"),
);
const questGoods: Message[] = JSON.parse(
  readFileSync(join(projectRoot, "reference/quest-goods.json"), "utf8"),
);
const questConditions: Message[] = JSON.parse(
  readFileSync(
    join(projectRoot, "reference/city-quest-conditions.json"),
    "utf8",
  ),
);
for (const q of [...campaignQuests, ...storyQuests, ...cosmosQuests, ...mountQuests, titleUnlockQuest]) {
  if (!questTemplates.some(t => t.TemplateId === q.template.TemplateId))
    questTemplates.push(q.template);
  for (const condition of q.conditions)
    if (!questConditions.some(c => JSON.stringify(c) === JSON.stringify(condition)))
      questConditions.push(condition);
  for (const item of q.items)
    if (!questGoods.some(i => JSON.stringify(i) === JSON.stringify(item)))
      questGoods.push(item);
}
normalizeLabyrinthQuestConditions(questConditions);
export interface CityCase {
  opcode: number;
  request?: Message;
  body: string;
  responses: CityPacket[];
  patches: CityPatch[];
  at: string;
}
export interface CityScenario {
  version: 1;
  userId: number;
  icon: number;
  nickname: string;
  startedAt: string;
  initial: CityState;
  cases: CityCase[];
  queries: CityCase[];
  questCatalog: Record<string, Message>;
  battles: AdventureReference[];
  incoming: Record<number, string>;
  outgoing: Record<number, string>;
}
export interface CitySave extends FashionSave {
  version: 1;
  state: CityState;
  used: number[];
  won: number[];
  startedAt: number;
  lastBoxAt?: number;
  map: number;
  wedding?: {id:number};
  location?: CityPacket[];
  skyRealm?: SkySave;
  battle?: AdventureBattle;
  repairVersion?: number;
  campaignEntered?: boolean;
  completedCampaigns?: number[];
  campaignRun?: {
    id: string;
    campaignId?: number;
    paid: boolean;
    rewarded?: boolean;
    won: number[];
    completed: boolean;
    cards?: { deck: CampaignCard[]; selected?: number; reward?: Message };
  };
  friends?: Message[];
  attributes?: AttributeState;
  attributeMigration?: { version: 2; at: string; legacy?: AttributeState; panel: Message };
  instanceFury?: InstanceFury;
  inventory?: InventoryIds;
  forgeOrigins?: ForgeOrigins;
  purification?: PurificationSave;
  pendingMailNotices?: number[];
  deletedMailIds?: number[];
  settlement?: SettlementSave;
  farmPlanted?: number;
  residence?: ResidenceSave;
  labyrinth?: LabyrinthSave;
  questCounters?: Record<string, number>;
  sweep?: SweepSave;
  heroEntries?: HeroEntrySave;
  storageProtection?: StorageProtection;
  treasureRoutingVersion?: 1;
  skills?: SkillSave;
  runes?: RuneSave;
  mounts?: MountSave;
  cosmos?: CosmosSave;
  tattoo?: TattooSave;
  fate?: FateSave;
  dragonSoul?: DragonSoulSave;
  vip?: { level: number; expiresAt: number };
  titles?: TitleSave;
  messageReceipts?: MessageReceipts;
}
export function hasCity(store: Store): boolean {
  return existsSync(join(store.dir, "city/scenario.json"));
}
export class CityWorld {
  readonly scenario: CityScenario;
  readonly saved: CitySave;
  private gold: GoldLedger;
  private readonly currencyLedger: CurrencyLedger;
  private readonly messages: MessageCenter;
  private readonly rejectionFeedback: RejectionFeedback;
  private readonly fashion: FashionFeature;
  private readonly mounts: MountFeature;
  private readonly cosmos: CosmosFeature;
  private readonly tattoo: TattooFeature;
  private readonly fate: FateFeature;
  private readonly dragonSoul: DragonSoulFeature;
  private readonly titleReconciler = new TitleReconciler(titleCatalog);
  private readonly titleMaintenance = new TitleMaintenance(titleCatalog);
  private titleExpiryWake?: { save: TitleSave; at: number };
  private titlesLoginReconciled = false;
  private titleDeliveryFingerprint = "";
  private titleClientReady = false;
  private mutationSequence = 0;
  private readonly settlement: SettlementFeature;
  private readonly farm: FarmFeature;
  private readonly seafaring: NavigationFeature;
  private readonly residence: ResidenceFeature;
  private readonly social: SocialFeature;
  private readonly marriage: MarriageFeature;
  private lastSettlementTick = 0;
  private taxDeadline = 0;
  private readonly labyrinth: LabyrinthFeature;
  private readonly labyrinthBot: LabyrinthBot;
  private loadedCampaign?: number;
  private readonly sweep: CampaignSweep;
  private storagePasswordConfirmed = false;
  private readonly sky: SkyRealm;
  constructor(
    readonly store: Store,
    readonly userId: number,
    private now = Date.now,
  ) {
    this.messages = new MessageCenter(userId);
    this.rejectionFeedback = new RejectionFeedback(userId, now);
    this.currencyLedger = new CurrencyLedger(store.db, now);
    this.gold = this.currencyLedger.goldAdapter();
    this.scenario = JSON.parse(
      readFileSync(join(store.dir, "city/scenario.json"), "utf8"),
    );
    addCampaignBattles(this.scenario.battles);
    this.scenario.incoming[4151] = typeName("campaign.RankListRspMsg");
    this.scenario.incoming[4282] = typeName("simple.PropertyMsg");
    this.scenario.outgoing[5122] = typeName("campaign.CampaignReqMsg");
    this.scenario.outgoing[8479] = typeName("player.PayTypeMsg");
    this.scenario.outgoing[8644] = typeName("player.PayTypeMsg");
    this.scenario.outgoing[8480] = typeName("army.HeroSkillChangeMsg");
    this.scenario.incoming[69] = typeName("battle.UserStopMsg");
    this.scenario.outgoing[8624] = typeName("item.ItemSellReqMsg");
    Object.assign(this.scenario.outgoing, {
      5010: typeName("player.PayTypeMsg"),
      8220: typeName("item.ArrangeReq"),
      8819: typeName("active.RentalBagOpReqMsg"),
      9569: typeName("player.PayTypeMsg"),
      8346: typeName("item.ItemRemoveMsg"),
      8806: typeName("player.VicePasswordMsg"),
      8809: typeName("player.LockAndUnlockMsg"),
    });
    this.scenario.incoming[4709] = typeName("active.RentalBagOpResMsg");
    this.scenario.incoming[4696] = typeName("player.VicePasswordMsg");
    configureFashionProtocol(this.scenario.outgoing);
    this.scenario.outgoing[5006] = typeName("item.ItemUseMsg");
    this.scenario.outgoing[8327] = typeName("player.PlayerOpMsg");
    this.scenario.outgoing[5154] = typeName("shop.ShopMsg");
    this.scenario.incoming[93] = typeName("army.ArmyPawnUpdatedMsg");
    this.scenario.incoming[95] = typeName("army.ArmyPawnInfoMsg");
    this.scenario.incoming[4187] = typeName("building.BuildOrderList");
    this.scenario.incoming[4186] = typeName("army.ArmyFightPosEditListMsg");
    this.scenario.incoming[4495] = typeName("army.HeroRuneOpMsg");
    this.scenario.outgoing[8605] = typeName("army.HeroRuneOpMsg");
    this.scenario.outgoing[10020] = typeName("battle.AttackModeMsg");
    this.scenario.incoming[77] = typeName("battle.AttackModeMsg");
    this.scenario.outgoing[10499] = typeName("battle.BattleItemMsg");
    this.scenario.incoming[158] = typeName("battle.ItemUseResultMsg");
    this.scenario.incoming[4361] = typeName("battle.BattleNoticeMsg");
    this.scenario.incoming[85] = typeName("friend.RecommendListMsg");
    this.scenario.incoming[137] = typeName("campaign.CampaignReportMsg");
    this.scenario.incoming[4425] = typeName("campaign.CampaignSweepRsp");
    this.scenario.outgoing[8528] = typeName("campaign.CampaignSweepReq");
    this.scenario.outgoing[8299] = typeName("campaign.TowerInfoReqMsg");
    this.scenario.incoming[4948] = typeName("campaign.SingleHeroCountMsg");
    this.scenario.incoming[4484] = titleSchemas.list;
    this.scenario.incoming[4491] = titleSchemas.obtained;
    this.scenario.outgoing[8597] = titleSchemas.request;
    this.scenario.outgoing[8970] = typeName("shop.ShopCarListMsg");
    this.scenario.outgoing[9592] = typeName("item.ItemUseStoreReqMsg");
    this.scenario.incoming[4783] = typeName("shop.ShopCarListMsg");
    const row = store.db
      .prepare("SELECT state FROM city_worlds WHERE user_id=?")
      .get(userId);
    this.saved = row
      ? JSON.parse(String(row.state))
      : {
          version: 1,
          state: structuredClone(this.scenario.initial),
          used: [],
          won: [],
          startedAt: now(),
          map: 1,
        };
    initializeTitleSave(this.saved, now(), {
      selectedId: this.saved.state.player.appell_id,
      attributesUnlocked: this.saved.state.player.applle_property_Open,
    });
    this.saved.messageReceipts ??= {
      version: 1,
      production: initialProductionCursor(store.db, userId, now()),
    };
    this.labyrinth = new LabyrinthFeature(this.saved, this.scenario, now);
    addExpandedCampaignBattles(this.scenario.battles);
    this.labyrinth.synchronize();
    this.sweep = new CampaignSweep(
      this.saved,
      userId,
      this.currencyLedger,
      now,
      () => this.clearedCampaigns(),
      (definition, key) => this.awardSweep(definition, key),
    );
    this.labyrinthBot = new LabyrinthBot(this.saved, this.labyrinth, userId, this.currencyLedger, now,
      (mode, multiplier) => {
        this.labyrinth.selectMode(mode);
        if (!this.labyrinth.progress().entered && multiplier === 2)
          this.inventory(this.state).consumeTemplate(208008, mode === 8001 ? 1 : 3);
        this.labyrinth.begin(multiplier);
      },
      floor => {
        this.labyrinth.progress().floor = floor;
        const xp = this.labyrinth.experience();
        grantExperience(this.state.player, xp);
        const index = this.labyrinth.battleIndex();
        if (!this.saved.won.includes(index)) this.saved.won.push(index);
        this.labyrinth.victory();
        let drops: LabyrinthDrop[] = [];
        if (labyrinthFloors.get(this.labyrinth.map)!.drops.length) {
          drops = this.labyrinth.chestDrops(this.labyrinth.map * 100 + 3);
          this.depositLabyrinthDrops(drops);
          this.labyrinth.collectChest();
        }
        return { gp: xp, items: drops.map(d => ({ template_id: d.templateId, count: d.count })) };
      });
    this.settlement = new SettlementFeature(
      this.saved,
      store,
      userId,
      this.scenario.userId,
      this.currencyLedger,
      now,
    );
    this.social = new SocialFeature(store, userId);
    this.farm = new FarmFeature(
      this.saved,
      store,
      userId,
      this.scenario.userId,
      this.currencyLedger,
      () => this.inventory(this.state),
      now,
    );
    this.lastSettlementTick = now();
    this.social.clean();
    this.saved.friends = this.social.list();
    for (const op of [
      78, 79, 80, 84, 85, 160, 161, 165, 4156, 4246, 4273, 4190, 4146, 4386,
      4387,
    ])
      delete this.state.packets[op];
    this.farm.synchronize();
    const previousLevel = this.state.player.grades;
    if (repairExperience(this.state.player))
      store.tutorialEvent("city-experience-repaired", userId, {
        beforeLevel: previousLevel,
        level: this.state.player.grades,
        xp: this.state.player.gp,
        totalXp: this.state.player.totalGp,
      });
    const world = this;
    this.fashion = new FashionFeature({
      get state() {
        return world.state;
      },
      get saved() {
        return world.saved;
      },
      get scenario() {
        return world.scenario;
      },
      store,
      userId,
      gold: this.gold,
      inventory: (state) => this.inventory(state, true),
      packet: (packet, refresh) => this.packet(packet, refresh),
      persist: () => this.persist(),
      atomicMutation: (action) => this.atomicMutation(action),
      ensureAttributes: () => this.ensureAttributes(),
      notice: (message) => this.notice(message),
      rejection: (reason) => { this.logRejection(reason); return []; },
    });
    this.mounts = new MountFeature({
      get state() { return world.state; },
      get saved() { return world.saved; },
      userId, ledger: this.currencyLedger,
      protocolUserId: this.scenario.userId,
      now: () => this.now(),
      inventory: () => this.inventory(this.state, true),
      persist: () => this.persist(),
      atomic: action => this.atomicMutation(action),
    });
    this.cosmos = new CosmosFeature({
      get state() { return world.state; },
      get saved() { return world.saved; },
      userId, ledger: this.currencyLedger, now: () => this.now(),
      persist: () => this.persist(), atomic: action => this.atomicMutation(action),
    });
    this.fate = new FateFeature({get state(){return world.state;},get saved(){return world.saved;},userId,ledger:this.currencyLedger,inventory:()=>this.inventory(this.state),now:()=>this.now(),persist:()=>this.persist(),atomic:action=>this.atomicMutation(action)});
    this.dragonSoul = new DragonSoulFeature({get state(){return world.state;},get saved(){return world.saved;},inventory:()=>this.inventory(this.state),persist:()=>this.persist(),atomic:action=>this.atomicMutation(action)});
    this.scenario.outgoing[8641]=typeName("fate.FateEditMsg");this.scenario.outgoing[9689]=typeName("player.CommonMsg");
    this.scenario.incoming[4555]=typeName("fate.FateListMsg");
    for(const op of [8626,8627])this.scenario.outgoing[op]=typeName("fate.FateEditMsg");
    this.scenario.incoming[4544]=typeName("fate.FateListMsg");this.scenario.incoming[4545]=typeName("fate.FateEditMsg");
    this.tattoo = new TattooFeature({
      get state(){return world.state;},get saved(){return world.saved;},
      userId,ledger:this.currencyLedger,inventory:()=>this.inventory(this.state),
      persist:()=>this.persist(),atomic:action=>this.atomicMutation(action),
    });
    for(const op of [9568,9603] as const)this.scenario.outgoing[op]=tattooSchemas[op];
    for(const op of [274,346] as const)this.scenario.incoming[op]=tattooSchemas[op];
    this.saved.residence ??= initialResidence(this.now());
    this.residence = new ResidenceFeature({store,userId,uid:this.scenario.userId,get saved(){return world.saved;},ledger:this.currencyLedger,now:()=>this.now(),persist:()=>this.persist(),atomic:action=>this.atomicMutation(action),
      room:()=>{const source=this.scenario.queries.flatMap(q=>q.responses).find(p=>p.opcode===21&&p.message?.player)?.message;const room=structuredClone(source??{result:1,player:[]});room.result=1;room.player=[{...(room.player?.find((p:Message)=>p.player_id===this.scenario.userId)??{}),player_id:this.scenario.userId,hero_id:this.scenario.userId,army_id:this.scenario.userId,nick_name:store.tutorialProfile(userId)!.nickname,template_id:store.tutorialProfile(userId)!.icon,head_id:store.tutorialProfile(userId)!.icon,grades:this.state.player.grades}];return room;},
      notice:text=>presentSystemMessage(this.messages,"reward-log",text).packets });
    this.seafaring = new NavigationFeature({ store, userId, get state() { return world.state; },
      inventory: () => this.inventory(this.state), ledger: this.currencyLedger, now: () => this.now(),
      persist: () => this.persist(), atomic: action => this.atomicMutation(action) });
    this.marriage = new MarriageFeature({store,uid:userId,get saved(){return world.saved;},inventory:()=>this.inventory(this.state),ledger:this.currencyLedger,now:()=>this.now(),persist:()=>this.persist(),atomic:fn=>this.atomicMutation(fn),notice:text=>presentSystemMessage(this.messages,"guidance",text).packets});
    this.sky = new SkyRealm({ store, uid: userId, saved: this.saved,
      persist: () => this.persist(), atomic: action => this.atomicMutation(action),andrew:node=>this.marriage.visitNode(node) });
    teams(store).register(userId,()=>({player_id:userId,army_id:userId,hero_id:userId,template_id:store.tutorialProfile(userId)!.icon,head_id:store.tutorialProfile(userId)!.icon,nick_name:store.tutorialProfile(userId)!.nickname,grades:this.state.player.grades,fighting_capacity:this.state.hero.fighting_capacity,campaign_id:this.saved.map,cur_pos_x:this.state.army.cur_pos_x,cur_pos_y:this.state.army.cur_pos_y,...Object.fromEntries(["arm","cloth","wing","hat","fashion_arm","fashion_cloth","hide","mount_tempId","mount_grade"].map(k=>[k,this.state.army[k]]))}));
    if (!row) {
      const profile = store.tutorialProfile(userId)!;
      for (const mail of Object.values(this.state.mails)) {
        mail.readDate = "2999-01-01 00:00:00";
        mail.isExist = 1;
        mail.sendDate = new Date(now())
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        (this.saved.pendingMailNotices ??= []).push(mail.id);
      }
      const job = classForIcon(profile.icon);
      const tutorialRow = this.store.db.prepare("SELECT state FROM tutorial_worlds WHERE user_id=?").get(userId);
      const initialEquipment = tutorialRow ? JSON.parse(String(tutorialRow.state)).initialEquipment : undefined;
      this.state.hero.skill_script = initialSkills(job).join(",") + ",";
      this.state.hero.fast_key = `${job * 100 + 7},${job * 100 + 8},-1,-1,-1,`;
      for (const item of Object.values(this.state.items)) {
        item.template_id = starterTemplate(item.template_id, job);
        const previous = initialEquipment?.[item.template_id];
        if (previous) for (let n=1;n<=5;n++) item[`random_skill_${n}`] = previous[`random_skill_${n}`] ?? 0;
        else rollInitialEquipment(item);
      }
      if (job !== 1) {
        this.state.hero.skill_script = this.classSkills(
          this.state.hero.skill_script,
        );
        this.state.hero.fast_key = this.classKeys(this.state.hero.fast_key);
      }
      this.state.player.time_get = 0;
      this.state.player.time_process = 0;
      this.state.hero.tempate_id = profile.icon;
      this.persist();
    }
    if (this.saved.battle && !this.saved.battle.finished) {
      const e=this.saved.battle.engine;
      if(e?.initiative)pauseInitiative(e,e.initiative.lastAt);
      this.saved.battle.ready = false;
      this.saved.battle.started = false;
      this.saved.battle.paused = false;
      this.saved.battle.frame = 27;
    }
    this.repairState();
    this.inventory(this.state).normalizeIds();
    for(const item of Object.values(this.state.items))ensureEquipmentSockets(item);
    if (stoneCapacity(this.state.player) > 0 && this.saved.treasureRoutingVersion !== 1) {
      try {
        transferTreasures(this.inventory(this.state), this.state.player, this.now());
        this.saved.treasureRoutingVersion = 1;
      } catch (error) {
        if (!(error instanceof InventoryError)) throw error;
        // Do not block login or lose legacy items when the separate bag is full.
        this.store.tutorialEvent("treasure-migration-deferred", this.userId, { reason: error.message });
      }
    }
    this.syncLocalMail();
    this.fashion.equippedFashionItems();
    // A campaign may finish before its quest is accepted. Do not expose partial quest rows.
    for (const [id, q] of Object.entries(this.state.quests))
      if (!q.template_id) delete this.state.quests[id];
    this.updateObjectives();
    this.syncAutoQuests();
    if (
      this.saved.map === 1 &&
      this.saved.won.includes(0) &&
      this.saved.won.includes(1)
    )
      this.finishCampaign();
    grantChapterRewards(store, userId, this.clearedCampaigns());
    this.persist();
    this.taxDeadline = this.saved.settlement!.taxReadyAt;
    this.titleDeliveryFingerprint = this.titleFingerprint();
  }
  private repairState(): void {
    if (this.saved.repairVersion === 2) return;
    // Earlier transitions set captured absolute capacity, despite a different level.
    const capacity =
      Number(this.scenario.initial.hero.fighting_capacity) +
      this.saved.used.reduce(
        (sum, index) =>
          sum +
          this.scenario.cases[index]!.patches.filter(
            (p) =>
              p.path[0] === "hero" &&
              p.path[1] === "fighting_capacity" &&
              typeof p.before === "number" &&
              typeof p.after === "number",
          ).reduce((n, p) => n + p.after - p.before, 0),
        0,
      );
    this.state.hero.fighting_capacity = capacity;
    this.syncHero();
    for (const [key, item] of Object.entries(this.state.items))
      if (item.bag_type === 0 && !this.fashion.isFashion(item)) {
        const original = Object.values(this.scenario.initial.items).find(
          (i) => i.id === item.id,
        );
        const target =
          original &&
          !this.state.items[`4:${this.scenario.userId}:${original.pos}`]
            ? { bag: 4, obj: this.scenario.userId, pos: original.pos }
            : { bag: 1, obj: 0, pos: this.freeSlot(1, 0) };
        if (target.pos < 0) continue;
        delete this.state.items[key];
        Object.assign(item, {
          bag_type: target.bag,
          object_id: target.obj,
          pos: target.pos,
        });
        this.state.items[`${target.bag}:${target.obj}:${target.pos}`] = item;
        this.store.tutorialEvent("city-item-recovered", this.userId, {
          id: item.id,
          bag: target.bag,
          pos: target.pos,
        });
      }
    this.saved.repairVersion = 2;
  }
  private syncHero(calculate = true): void {
    if (this.saved.map === 1) delete this.saved.instanceFury;
    this.state.hero.grade = this.state.player.grades;
    const profile = this.store.tutorialProfile(this.userId)!;
    this.state.hero.tempate_id = profile.icon;
    this.state.hero.nick_name = profile.nickname;
    Object.assign(this.state.player, {
      pic: profile.icon,
      sex: profile.sex,
      nick_name: profile.nickname,
    });
    Object.assign(this.state.army, {
      hero_tempId: profile.icon,
      job: classForIcon(profile.icon),
      nick_name: profile.nickname,
      map_id: this.saved.map,
    });
    this.ensureAttributes();
    this.settlement.synchronize();
    if (!this.saved.skills || this.saved.skills.job !== classForIcon(profile.icon)) {
      this.saved.skills = createSkills(this.state.hero, classForIcon(profile.icon), Number(this.state.player.grades));
      this.store.tutorialEvent("skills-migrated", this.userId, { job: this.saved.skills.job, level: this.state.player.grades, learned: this.saved.skills.pages[0]!.learned });
    }
    syncSkills(this.saved.skills, this.state);
    syncRunes(this.saved.runes ??= createRunes(this.now()), this.state, this.now());
    synchronizeNaturalAttributes(
      this.saved.attributes!,
      Number(this.state.player.grades),
      classForIcon(profile.icon),
    );
    synchronizeAdvancedSoul(this.state.player);
    synchronizeInitialEquipment(this.saved.attributes!.sources, this.state.items, Number(this.state.hero.hero_id),Number(this.state.player.storeGrade??0),Number(this.state.player.grades)>=80?Number(this.state.player.equipment_refining_grade??0):0,Number(this.state.player.grades)>=80?Number(this.state.player.seniorStoreGrade??0):0);
    synchronizeEquipmentAppearance(this.state);
    this.marriage?.synchronize();
    this.fashion.syncAttributes();
    this.settlement.syncAttributes();
    syncSkillAttributes(this.saved.skills, this.saved.attributes!);
    this.mounts.synchronize();
    this.cosmos.synchronize();
    this.tattoo.synchronize();
    this.fate.synchronize();
    this.dragonSoul.synchronize();
    if (calculate) this.applyHeroAttributes();
  }
  private applyHeroAttributes(): void {
    synchronizeTitleAttributes(this.saved.attributes!.sources, this.saved.titles!, titleCatalog, {
      job: this.state.army.job, level: Number(this.state.player.grades), now: this.now(),
    });
    applyAttributes(this.saved.attributes!, this.state.hero);
    this.settlement.synchronizeProduction();
    const title = this.currentTitleIdentity();
    this.state.player.appell_id = title.id;
    this.state.player.applle_property_Open = Number(title.attributesUnlocked);
    this.state.army.appellid = title.id;
    this.state.player.fighting_capacity = this.state.hero.fighting_capacity;
    this.state.army.fightingCapacity = this.state.hero.fighting_capacity;
    this.state.army.grades = this.state.player.grades;
    this.state.army.simple_hero_info = structuredClone(this.state.hero);
  }
  private freeSlot(bag: number, obj: number): number {
    if ([1, 34].includes(bag)) return this.inventory(this.state).freeSlot(bag, obj);
    for (let pos = 0; pos < 100; pos++)
      if (!this.state.items[`${bag}:${obj}:${pos}`]) return pos;
    return -1;
  }

  private gainCharacterExperience(amount: number): void {
    try {
      grantExperience(this.state.player, amount);
    } catch (error) {
      if (error instanceof ExperienceError)
        throw new InventoryError(error.message);
      throw error;
    }
  }
  changeCurrency(
    currency: Currency,
    delta: number,
    reason: string,
    operationId?: string,
  ): TutorialResponse[] {
    return this.atomicMutation(() => {
      this.currencyLedger.change(
        this.state,
        this.userId,
        currency,
        delta,
        reason,
        operationId,
      );
      this.persist();
      return [
        this.packet({ opcode: currencies[currency].model, message: {} }, true),
      ];
    });
  }
  private useGoldBag(r: Message): TutorialResponse[] {
    try {
      return this.atomicMutation(() => {
        const rewardsBefore = acquisitionSnapshot(this.state);
        const key = `${r.bag_type}:0:${r.pos}`,
          item = this.state.items[key],
          count = Number(r.count),
          row = itemTemplate(item?.template_id);
        if (
          r.bag_type !== 1 ||
          !item ||
          ![2030102, 2126449, 2030500, 2030501, 2030502, 2030503, 208061].includes(
            item.template_id,
          )
        )
          throw new InventoryError(
            "O efeito desse consumível ainda não foi reconstruído. O item foi preservado.",
          );
        if (!Number.isSafeInteger(count) || count <= 0 || count > item.count)
          throw new InventoryError("Quantidade inválida");
        const before = structuredClone(this.state.items);
        const energy = Number(row?.Property1) === 5;
        const dust = item.template_id === 208061;
        const rawGain = Number(dust ? row!.Property1 : row!.Property2) * count;
        const gain = energy
          ? Math.max(0, Math.min(rawGain, 200 - this.state.player.weary))
          : rawGain;
        this.currencyLedger.change(
          this.state,
          this.userId,
          dust ? "illusionDust" : energy ? "energy" : "gold",
          gain,
          `item:${dust ? "illusion-dust" : energy ? "energy" : "gold-bag"}:${item.template_id}`,
        );
        this.inventory(this.state).consume(key, count);
        const gains = acquisitionGains(rewardsBefore, acquisitionSnapshot(this.state));
        this.persist();
        return [
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
          this.packet({ opcode: dust ? 4725 : energy ? 3 : 109, message: {} }, true),
          ...this.acquisitionNotice(gains, `pelo consumo de [${row!.TemplateName}]`),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError || error instanceof CurrencyError)
        return [this.notice(error.message)];
      throw error;
    }
  }

  private syncAutoQuests(): void {
    for (const template of questTemplates) {
      const id = Number(template.TemplateId);
      if (!questInDateWindow(template, this.now())) {
        if (this.state.quests[id]?.is_accept && !questClaimed(this.state, id))
          delete this.state.quests[id];
        continue;
      }
      if (
        this.state.quests[id] ||
        questClaimed(this.state, id) ||
        template.IsAuto !== "true" ||
        this.state.player.grades < Number(template.NeedMinLevel) ||
        this.state.player.grades > Number(template.NeedMaxLevel)
      )
        continue;
      if (questParents(template).some(p => !questClaimed(this.state, p)))
        continue;
      const model = this.questModel(id);
      if (model)
        this.state.quests[id] = {
          ...structuredClone(model),
          is_accept: 1,
          is_complete: 0,
          condition_1: 0,
          condition_2: 0,
          condition_3: 0,
          condition_4: 0,
          add_date: new Date(this.now()).toISOString().slice(0, 19).replace("T", " "),
        };
    }
    this.updateObjectives();
  }
  get state() {
    return this.saved.state;
  }
  private ensureAttributes(): void {
    if (this.saved.attributes?.calculationVersion === 2) return;
    this.saved.attributeMigration = { version: 2, at: new Date(this.now()).toISOString(), legacy: this.saved.attributes ? structuredClone(this.saved.attributes) : undefined, panel: structuredClone(this.state.hero) };
    this.saved.attributes = { version: 1, calculationVersion: 2, sources: {} };
    if (this.saved.settlement) this.saved.settlement.attributesMigrated = true;
  }
  persist() {
    if (this.saved.residence) settleResidence(this.saved.residence, this.now());
    for(const item of Object.values(this.state.items))normalizeEquipmentAffixes(item,this.saved.purification?.[String(item.id)]);
    validateTitleSave(this.saved.titles);
    this.labyrinth.synchronize();
    this.syncLocalMail();
    this.syncHero(false);
    synchronizeTitleUnlockQuest(this.state, this.now());
    // Account progression and its complete city state must commit together.
    const previousTitles = this.saved.titles!;
    const titleNow = this.now();
    const expiry = expireTitles(previousTitles, titleCatalog, {
      subjectId: this.userId, job: this.state.army.job, now: titleNow,
      reason: this.titlesLoginReconciled ? "gameplay" : "login",
    });
    const titles = this.titleReconciler.prepare(expiry.state, {
      subjectId: this.userId, job: this.state.army.job, now: titleNow,
      reason: this.titlesLoginReconciled ? "gameplay" : "login",
      attributeUnlock: { level: Number(this.state.player.grades), questClaimed: questClaimed(this.state, 936) },
      readFact: localTitleFactReader(this.saved, this.userId, titleNow),
    });
    const previousProjection = {
      attributes: structuredClone(this.saved.attributes), hero: structuredClone(this.state.hero),
      playerPower: this.state.player.fighting_capacity, armyPower: this.state.army.fightingCapacity,
      titleId: this.state.player.appell_id, titleUnlocked: this.state.player.applle_property_Open, armyTitle: this.state.army.appellid,
      armyGrades: this.state.army.grades, simpleHero: this.state.army.simple_hero_info,
    };
    this.store.db.exec("SAVEPOINT city_save");
    try {
      this.saved.titles = titles.state;
      this.applyHeroAttributes();
      this.store.db
        .prepare(
          "INSERT INTO city_worlds(user_id,state) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state=excluded.state",
        )
        .run(this.userId, JSON.stringify(this.saved));
      this.store.db
        .prepare("UPDATE tutorial_profiles SET process=? WHERE user_id=?")
        .run(this.state.player.novice_process, this.userId);
      this.store.db.exec("RELEASE city_save");
      this.titleReconciler.accept(titles);
      this.titleExpiryWake = { save: titles.state, at: nextTitleDeadline(titles.state) };
      this.titlesLoginReconciled = true;
    } catch (error) {
      this.saved.titles = previousTitles;
      this.saved.attributes = previousProjection.attributes;
      for (const key of Object.keys(this.state.hero)) delete this.state.hero[key];
      Object.assign(this.state.hero, previousProjection.hero);
      this.state.player.fighting_capacity = previousProjection.playerPower;
      Object.assign(this.state.player, { appell_id: previousProjection.titleId, applle_property_Open: previousProjection.titleUnlocked });
      Object.assign(this.state.army, { fightingCapacity: previousProjection.armyPower, grades: previousProjection.armyGrades, simple_hero_info: previousProjection.simpleHero, appellid: previousProjection.armyTitle });
      this.store.db.exec("ROLLBACK TO city_save; RELEASE city_save");
      throw error;
    }
  }
  private classSkills(value: string): string {
    const job = classForIcon(this.store.tutorialProfile(this.userId)!.icon);
    return String(value ?? "")
      .split(",")
      .map((v) =>
        Number(v) >= 10000 && Number(v) < 20000
          ? String(job * 10000 + (Number(v) % 10000))
          : v,
      )
      .join(",");
  }
  private classKeys(value: string): string {
    const job = classForIcon(this.store.tutorialProfile(this.userId)!.icon);
    return String(value ?? "")
      .split(",")
      .map((v) =>
        Number(v) >= 100 && Number(v) < 200
          ? String(job * 100 + (Number(v) % 100))
          : v,
      )
      .join(",");
  }
  private translate(value: any, toLocal: boolean): any {
    const from = toLocal ? this.scenario.userId : this.userId,
      to = toLocal ? this.userId : this.scenario.userId;
    if (Array.isArray(value))
      return value.map((v) => this.translate(v, toLocal));
    if (value && typeof value === "object") {
      const out: Message = {};
      for (const [k, v] of Object.entries(value)) {
        // Balances/XP are quantities, even when their value equals an account ID.
        const quantity = [
          "gold_total_count",
          "point",
          "gift_token",
          "strategy",
          "crystals_count",
          "weary",
          "amount",
          "gp",
          "totalGp",
          "total_gp",
          "count",
          "own_pawns",
          "reward_count",
          "temp_data",
          "skill_Data",
          "skill_Per",
          "effect_Data",
          "effect_Per",
          "bag_Data",
          "bag_Per",
          "star_Data",
          "star_Per",
          "hp",
          "init_hp",
          "max_hp",
        ].includes(k);
        out[k] =
          quantity || isAttribute(k)
            ? structuredClone(v)
            : this.translate(v, toLocal);
      }
      return out;
    }
    if (typeof value === "number") {
      if (value === from) return to;
      if (value === 100000000 + from) return 100000000 + to;
      if (value >= from * 100000 && value < (from + 1) * 100000)
        return to * 100000 + (value - from * 100000);
    }
    if (
      toLocal &&
      typeof value === "string" &&
      value === this.scenario.nickname
    )
      return this.store.tutorialProfile(this.userId)!.nickname;
    return value;
  }
  private personalize(m: Message): Message {
    const result = this.translate(m, true),
      profile = this.store.tutorialProfile(this.userId)!;
    const visit = (v: any) => {
      if (!v || typeof v !== "object") return;
      for (const child of Object.values(v)) visit(child);
      if (v.player_id === this.userId && "simple_hero_info" in v) {
        Object.assign(v, this.translate(this.state.army, true));
        v.simple_hero_info = this.translate(this.state.hero, true);
      }
      if (v.player_id === this.userId && "tempate_id" in v && "grade" in v)
        Object.assign(v, this.translate(this.state.hero, true));
      if (v.player_id === this.userId && "template_id" in v && "grades" in v) {
        v.template_id = v.head_id = profile.icon;
        v.grades = this.state.player.grades;
        v.nick_name = profile.nickname;
        v.fighting_capacity = this.state.hero.fighting_capacity;
      }
      if (v.player_id === this.userId && "pic" in v) {
        v.pic = profile.icon;
        v.sex = profile.sex;
        v.job = profile.icon;
      }
      if (v.player_id === this.userId && "tempate_id" in v) {
        v.tempate_id = profile.icon;
        v.head_id = profile.icon;
      }
      if (v.player_id === this.userId && "skill_script" in v) {
        v.skill_script = this.classSkills(v.skill_script);
        v.fast_key = this.classKeys(v.fast_key);
      }
      if (v.type === 1 && v.user_id === this.userId && "living_id" in v) {
        v.user_pics = v.temp_id = v.head_id = profile.icon;
      }
      if (v.player_id === this.userId && "hero_tempId" in v) {
        v.hero_tempId = profile.icon;
        v.job = classForIcon(profile.icon);
      }
      if (v.player_id === this.userId) {
        if ("appellid" in v) v.appellid = this.currentTitleIdentity().id;
        if ("appell_id" in v) v.appell_id = this.currentTitleIdentity().id;
        if ("applle_property_Open" in v) v.applle_property_Open = Number(this.currentTitleIdentity().attributesUnlocked);
      }
    };
    visit(result);
    return result;
  }
  private model(packet: CityPacket): CityPacket {
    const mountModel = packet.message ? this.mounts.model(packet) : undefined;
    if (mountModel) return mountModel;
    const fashion = this.fashion.model(packet);
    if (fashion) return fashion;
    let m = structuredClone(packet.message);
    switch (packet.opcode) {
      case 4234:
        m = synchronizedTime(this.now());
        break;
      case 3:
        m = {
          ...this.state.player,
          $135: {wire:0,value:String(this.state.player.equipment_refining_grade??0)},
          $136: {wire:0,value:String(this.state.player.equipment_refining_gp??0)},
          hasVicePassword: this.saved.storageProtection ? 1 : 0,
          time_run: Math.floor(
            (this.now() - (this.saved.lastBoxAt ?? this.saved.startedAt)) /
              1000,
          ),
        };
        delete m.equipment_refining_grade;
        delete m.equipment_refining_gp;
        break;
      case 4484:
        m = titleList(this.saved.titles!, titleCatalog, this.titleContext());
        break;
      case 4948:
        m = { count: heroEntries(this.saved, this.now()), buy_count: 0 };
        break;
      case 109:
        m = this.state.economy;
        break;
      case 4725:
        m = this.state.packets[4725]?.message ?? m;
        break;
      case 4151:
        m = {
          rankInfo: this.clearedCampaigns().map((campaignId) => ({
            campaign_id: campaignId,
            user_id: this.scenario.userId,
            rank: campaignRank(campaignId),
          })),
        };
        break;
      case 21:
        if (m?.player)
          m.player = m.player.map((p: Message) =>
            p.player_id === this.scenario.userId
              ? {
                  ...p,
                  campaign_id: this.saved.map,
                  grades: this.state.player.grades,
                  template_id: this.state.hero.tempate_id,
                  head_id: this.store.tutorialProfile(this.userId)!.icon,
                  nick_name: this.store.tutorialProfile(this.userId)!.nickname,
                  fighting_capacity: this.state.hero.fighting_capacity,
                  appellid: this.currentTitleIdentity().id,
                  is_vip: 0,
                  vip_type: 0,
                  mount_tempId: this.state.army.mount_tempId ?? 0,
                  mount_grade: this.state.army.mount_grade ?? 0,
                  arm: this.state.army.arm ?? "",
                  cloth: this.state.army.cloth ?? "",
                  wing: this.state.army.wing ?? "",
                  hat: this.state.army.hat ?? "",
                  fashion_arm: this.state.army.fashion_arm ?? "",
                  fashion_cloth: this.state.army.fashion_cloth ?? "",
                  ...(p.$55
                    ? {
                        $55: {
                          wire: 2,
                          value: Buffer.from(String(this.userId)).toString(
                            "base64",
                          ),
                        },
                      }
                    : {}),
                }
              : p,
          );
        break;
      case 4:
        m = {
          time: this.state.player.time_process,
          operate: this.state.player.time_get,
          timerun: Math.floor(
            (this.now() - (this.saved.lastBoxAt ?? this.saved.startedAt)) /
              1000,
          ),
        };
        break;
      case 113:
        m = { ...this.state.hero, grade: this.state.player.grades };
        break;
      case 4155:
        m = { buildOrder: this.settlement.orders() };
        break;
      case 150:
        m = { ...this.state.army, simple_hero_info: this.state.hero };
        break;
      case 100:
        m = {
          armyPawn: (this.state.pawnStock ?? []).filter(
            (p) =>
              Number(
                buildingTemplates.get(
                  Number(pawnTemplates.get(p.tempate_id)?.NeedBuilding),
                )?.BuildingGrade ?? 0,
              ) <= this.state.player.grades,
          ),
        };
        break;
      case 93:
        m = { armyPawn: this.state.army.armyPawn ?? [] };
        break;
      case 64:
        m = { ...m, fast_key: this.state.hero.fast_key, set_result: 1 };
        break;
      case 131:
        m = { ...this.state.army, simple_hero_info: this.state.hero };
        break;
      case 140:
        if ([this.scenario.userId, this.userId].includes(m?.army?.player_id))
          m = { ...m, army: this.state.army };
        break;
      case 112:
        m = questSnapshot(this.state, questTemplates);
        break;
      case 115:
        m = {
          moved: [
            ...Object.values(this.state.items),
            ...this.fashion.equippedFashionItems(),
          ].map((item) => ({
            change_type: item.bag_type,
            change_obj_id: item.object_id,
            change_pos: item.pos,
            item,
          })),
        };
        break;
      case 4130:
        m = {
          result: 1,
          building: m?.building ?? Object.values(this.state.buildings),
        };
        break;
      case 4131:
        m = { mailInfos: Object.values(this.state.mails).filter(mail => mail.isExist !== 0 && !this.saved.deletedMailIds?.includes(mail.id)) };
        break;
      case 4205:
        m = this.labyrinth.tower(
          packet.message?.campaign_id === 8101 ? 8101 : 8001,
        );
        break;
      case 4373:
        m = this.labyrinth.list().message;
        break;
      case 4386:
        if (packet.message?.user_id)
          m = this.state.farms[packet.message.user_id] ?? packet.message;
        break;
      case 4387:
        if (packet.message?.user_id) {
          const farm = this.state.farms[packet.message.user_id];
          m = {
            ...packet.message,
            farmLandInfo: (packet.message.farmLandInfo ?? []).map(
              (row: Message) => ({
                ...row,
                ...farm?.farmLandInfo?.find((p: Message) => p.pos === row.pos),
                op_type: row.op_type,
                result: row.result,
              }),
            ),
          };
        }
        break;
    }
    return { ...packet, message: m };
  }
  packet(packet: CityPacket, refresh = false): TutorialResponse {
    if(packet.opcode===4662&&!packet.authoritative)return this.packet(this.marriage.rooms()[0]!);

    if(packet.message && [78,79,84,160,161,165].includes(packet.opcode))packet=nativePacket(packet.opcode,({78:"simple.FriendInfoMsg",79:"friend.FriendRelationMsg",84:"friend.FriendRelationMsg",160:"friend.FriendRelationMsg",161:"friend.FriendRelationMsg",165:"simple.FriendInfoMsg"} as Record<number,string>)[packet.opcode]!,packet.message,packet.delayMs);
    if(packet.authoritative && packet.body!==undefined)return {frame:frame(packet.opcode,this.userId,Buffer.from(packet.body,"base64")).toString("base64"),delayMs:packet.delayMs??0};
    if(packet.opcode===4555){const own=this.dragonSoul.packets()[0]!;return {frame:frame(4555,this.userId,Buffer.from(own.body!,"base64")).toString("base64"),delayMs:packet.delayMs??0};}
    // Account models are always authoritative, including scene transitions loaded
    // from captures. A missing refresh flag must never replay another character.
    const ownModel = [4234, 3, 109, 113, 131, 150, 21, 140, 4948, 4484].includes(
      packet.opcode,
    );
    if (
      ownModel &&
      !packet.message &&
      packet.body &&
      this.scenario.incoming[packet.opcode]
    )
      packet = {
        ...packet,
        message: decodeMessage(
          this.scenario.incoming[packet.opcode]!,
          Buffer.from(packet.body, "base64"),
        ),
      };
    const p = refresh || ownModel ? this.model(packet) : packet;
    const name = this.scenario.incoming[p.opcode];
    const body =
      p.message && name
        ? encodeMessage(name, this.personalize(p.message))
        : Buffer.from(p.body ?? "", "base64");
    return {
      frame: frame(p.opcode, this.userId, body).toString("base64"),
      delayMs: p.delayMs ?? 0,
      ...([75, 153, 154, 156, 157, 4361, 4103].includes(p.opcode) && this.saved.battle ? { battleId: this.saved.battle.id } : {}),
    };
  }
  bootstrap(): TutorialResponse[] {
    this.marriage.beginScene();
    if (this.labyrinthBot.active) {
      try {
        this.atomicMutation(() => {
          const packets = this.labyrinthBot.tick();
          if (packets.length) {
            this.updateObjectives();
            this.syncAutoQuests();
            this.persist();
          }
        });
      } catch (error) {
        if (!(error instanceof InventoryError || error instanceof CurrencyError || error instanceof LabyrinthError)) throw error;
        // The regular tick reports a full backpack and retries without losing rewards.
      }
    }
    const campaign = this.importedCampaign();
    const campaignReconnect = campaign?.map === this.saved.map && campaign.entry
      ? [
          campaign.entry,
          ...(campaign.load ?? []),
          ...(campaign.stages ?? []).flatMap((stage, index) =>
            this.saved.campaignRun!.won.includes(this.currentCampaignIndices()[index]!) && stage.movie
              ? [stage.movie]
              : [],
          ),
        ]
      : undefined;
    // A fresh client has no campaign room. RoomEnter (21) alone cannot open
    // its scene: restore RoomCreated (125) first, even before the first load.
    const sceneEntry = this.sky.active ? [] : this.marriage.wedding.active ? this.marriage.wedding.reconnect() : this.residence.active ? this.residence.reconnect() : this.labyrinth.active
      ? this.labyrinth.reconnect()
      : (campaignReconnect ?? this.saved.location ?? []);
    this.farm.synchronize();
    this.saved.friends = this.social.list();
    // Keep login initialization in its observed order, including repeated models.
    // Opcode 6 is the scene-entry callback, not disposable background traffic.
    const captured =
      this.scenario.queries.find((c) => c.opcode === 8271)?.responses ?? [];
    const represented = new Set(captured.map((p) => p.opcode));
    const packets = [
      ...captured,
      ...Object.values(this.state.packets).filter(
        (p) => !represented.has(p.opcode),
      ),
    ].filter(
      (p) =>
        ![357,4656,4657,4658,4662,4673,4674,49100,4555,4556,4557,4544,4545,274,346,4234,4753,4757,341,342,343,178,6, 115, 112, 4130, 4131, 4495, 4542, 4155, 4205, 4373, 4386, 4387, 4426, 4427, 4459, 4679, 4973, 4974, 4975, 305, 4178, 4179, 4180, 4479, 4677, 4592, 4593, 4594, 4595, 4597, 4606, 4607].includes(
          p.opcode,
        ),
    );
    packets.push(
      { opcode: 4234, message: synchronizedTime(this.now()) },
      ...this.mounts.initialPackets(),
      ...this.cosmos.initialPackets(),
      ...this.tattoo.packets(),
      ...this.fate.packets(),
      ...this.dragonSoul.packets(),
      ...this.seafaring.initialPackets(),
      ...this.residence.initialPackets(),
      { opcode: 4495, message: { opType: 2, opResult: true, runeInfo: runeModel(this.saved.runes!, this.scenario.userId) } },
      ...[115, 112, 4130, 4131, 4542, 4155].map((opcode) => ({
        opcode,
        message: {},
      })),
    );
    const result = packets
      .filter(
        (p) =>
          ![
            78, 79, 80, 84, 85, 160, 161, 165, 4156, 4246, 4273, 4157, 4190,
            4146, 4484, 4491,
          ].includes(p.opcode),
      )
      .map((p, i) => this.packet({ ...p, delayMs: 30 + i * 2 }, true));
    result.push(
      this.packet({ ...this.labyrinth.list(), delayMs: 380 }, true),
      this.packet({ opcode: 4948, message: {}, delayMs: 380 }, true),
      ...sceneEntry.map((p, i) =>
        this.packet(
          {
            ...p,
            delayMs:
              400 + (campaignReconnect ? 0 : this.labyrinth.active ? (p.delayMs ?? i * 5) : i * 5),
          },
          [3, 21, 109, 113, 150, 4205, 131].includes(p.opcode),
        ),
      ),
    );
    result.push(
      ...(this.saved.friends ?? []).map((f) =>
        this.packet({ opcode: 78, message: f, delayMs: 380 }),
      ),
    );
    result.push(
      ...this.farm
        .initialPackets()
        .map((p) => this.packet({ ...p, delayMs: 390 })),
      ...this.marriage.snapshot().filter(p=>p.opcode!==4658).map(p=>this.packet({...p,delayMs:395})),
      ...teams(this.store).initial(this.userId).map(p=>this.packet({...p,delayMs:395})),
      ...this.social.initial().map(p=>this.packet({...p,delayMs:380})),
      ...this.social.requests().map((p) => this.packet({ ...p, delayMs: 395 })),
      this.packet({
        opcode: 4186,
        message: {
          armyFightPos: [
            {
              user_id: this.scenario.userId,
              hero_pos: this.saved.settlement!.formation.hero,
              pawn_pos: this.saved.settlement!.formation.pawn,
            },
          ],
        },
        delayMs: 390,
      }),
    );
    const loginState =
      this.saved.battle && !this.saved.battle.finished
        ? 5
        : this.saved.map !== 1 && !this.sky.active
          ? 4
          : 1;
    result.push(
      this.packet({
        opcode: 6,
        message: { player_id: this.scenario.userId, state: loginState },
        delayMs: 450,
      }),
    );
    if (this.saved.battle && !this.saved.battle.finished)
      result.push(this.prepare(600));
    if (campaignByMap.has(this.saved.map)) {
      result.push(this.campaignProgress(650));
      if (this.saved.campaignRun?.completed)
        result.push(...this.campaignResultPackets(700));
    }
    result.push(
      ...this.labyrinthBot.snapshot().map(p => this.packet({ ...p, delayMs: 850 })),
      ...this.sweep.snapshot().map((p) => this.packet({ ...p, delayMs: 850 })),
    );
    result.push(...this.atomicMutation(() => this.productionNotices()));
    result.push(...this.deliverTitles(true));
    if (this.sky.active) result.push(...this.sky.enter().map((p, i) => skyWire({ ...p, delayMs: 600 + i * 10 }, this.userId)));
    return result;
  }
  private titleContext() {
    return { job: this.state.army.job as 1 | 2 | 3, level: Number(this.state.player.grades), now: this.now() };
  }
  currentTitleIdentity() {
    return titleIdentity(this.saved.titles!, titleCatalog, this.titleContext());
  }
  /** Internal server hook for ranking/VIP services. Never called from a client opcode. */
  applyTitleMaintenanceSnapshot(snapshot: TitleMaintenanceSnapshot) {
    return this.atomicMutation(() => {
      const result = this.titleMaintenance.prepare(this.saved.titles!, snapshot, {
        subjectId: this.userId, ...this.titleContext(), reason: "gameplay",
      });
      if (result.changed) { this.saved.titles = result.state; this.persist(); }
      return { status: result.status, grantedIds: result.grantedIds, revokedIds: result.revokedIds, expiredIds: result.expiredIds };
    });
  }
  private titleFingerprint(): string {
    const context = this.titleContext();
    return JSON.stringify([this.saved.titles, context.job, context.level, this.currentTitleIdentity()]);
  }
  private titleRequest(body: Buffer): TutorialResponse[] {
    try {
      const r = titleRequest(body);
      return this.atomicMutation(() => {
        if (!r.look) selectTitle(this.saved.titles!, titleCatalog, r.appellId, this.titleContext().job, this.now());
        return this.deliverTitles(true);
      });
    } catch (error) {
      if (error instanceof TitleProtocolError || error instanceof TitleStateError) return [this.notice(error.message)];
      throw error;
    }
  }
  private deliverTitles(force = false): TutorialResponse[] {
    if (force) this.titleClientReady = true;
    if (!this.titleClientReady) return [];
    const context = this.titleContext(), save = this.saved.titles!;
    const drain = (!this.saved.battle || this.saved.battle.finished) && (save.pendingAcquisitions?.some(n => n.obtainedAt <= context.now) || save.pendingRemovals?.some(n => n.removedAt <= context.now));
    if (!force && !drain && this.titleDeliveryFingerprint === this.titleFingerprint()) return [];
    const result = this.atomicMutation(() => {
      const notices = drain ? pendingTitleNotifications(save, titleCatalog, context) : {};
      const removedText = drain ? pendingTitleRemovalText(save, titleCatalog, context) : undefined;
      if (drain) {
        if (save.pendingAcquisitions) save.pendingAcquisitions = save.pendingAcquisitions.filter(n => n.obtainedAt > context.now);
        if (save.pendingRemovals) save.pendingRemovals = save.pendingRemovals.filter(n => n.removedAt > context.now);
      }
      this.persist();
      const packets = [
        this.packet({ opcode: 3, message: {} }, true),
        this.packet({ opcode: 113, message: {} }, true),
        this.packet({ opcode: 150, message: {} }, true),
        this.packet({ opcode: 4484, message: {} }, true),
      ];
      if (notices.nativeId) packets.push(this.packet(titleObtainedPacket(notices.nativeId)));
      if (notices.text) packets.push(...presentSystemMessage(this.messages, "acquisition", notices.text).packets.map(p => this.packet(p)));
      if (removedText) packets.push(...presentSystemMessage(this.messages, "guidance", removedText).packets.map(p => this.packet(p)));
      return packets;
    });
    this.titleDeliveryFingerprint = this.titleFingerprint();
    return result;
  }
  login(): TutorialResponse[] {
    return [3, 109, 113, 4948, 4130].map((opcode, i) =>
      this.packet({ opcode, message: {}, delayMs: i * 2 }, true),
    );
  }
  private logRejection(reason: string): void {
    this.store.tutorialEvent("city-rejected", this.userId, { reason });
  }
  private rejection(reason: string, action = reason): TutorialResponse[] {
    this.logRejection(reason);
    return this.rejectionFeedback.prepare(reason, action).map(packet => this.packet(packet));
  }
  private mutationRejection(op: number, request: Message | undefined, matching: CityCase[] = []): TutorialResponse[] {
    // These requests also participate in automatic tutorial/quest synchronization.
    if ([5012, 5017].includes(op)) { this.logRejection(unavailableActionText(op)); return []; }
    const pending = matching.find(c => !this.saved.used.includes(this.scenario.cases.indexOf(c)));
    const reason = pending ? this.guardFailure(pending) ?? unavailableActionText(op)
      : matching.length ? alreadyCompletedText(op) : unavailableActionText(op);
    return this.rejection(reason, `action:${op}:${request?.template_id ?? request?.time ?? ""}`);
  }
  private notice(message: string): TutorialResponse {
    return this.packet(presentSystemMessage(this.messages, "notice", message).packets[0]!);
  }
  private labyrinthRequirement(message: string): TutorialResponse[] {
    return presentSystemMessage(this.messages, "guidance", message).packets.map(packet => this.packet(packet));
  }
  private rewardChat(message: string, delayMs = 0): TutorialResponse {
    return this.packet(presentSystemMessage(this.messages, "reward-log", message, delayMs).packets[0]!);
  }
  private acquisitionNotice(gains: readonly AcquisitionGain[], source: string, delayMs = 0): TutorialResponse[] {
    const text = acquisitionText(gains, source);
    return text ? presentSystemMessage(this.messages, "acquisition", text, delayMs)
      .packets.map(packet => this.packet(packet)) : [];
  }
  private productionNotices(): TutorialResponse[] {
    if (this.saved.battle && !this.saved.battle.finished) return [];
    const receipt = this.saved.messageReceipts!;
    const summary = pendingProductionSummary(this.store.db, this.userId, receipt.production, this.now());
    if (!summary) return [];
    const packets = presentSystemMessage(this.messages, "passive-income", summary.text).packets;
    receipt.production = summary.cursor;
    this.persist();
    return packets.map(packet => this.packet(packet));
  }
  private request(packet: Buffer): Message | undefined {
    const op = packet.readUInt16BE(6),
      name = this.scenario.outgoing[op];
    try {
      return name
        ? this.translate(decodeMessage(name, packet.subarray(20)), false)
        : undefined;
    } catch {
      return undefined;
    }
  }
  private sameRequest(
    c: CityCase,
    op: number,
    m: Message | undefined,
    packet: Buffer,
  ): boolean {
    if (c.opcode !== op) return false;
    if (m && c.request) {
      if (op === 5014)
        return (
          m.template_id === c.request.template_id &&
          (m.reward_item_id ?? 0) === (c.request.reward_item_id ?? 0)
        );
      return (
        JSON.stringify(Object.entries(m).sort()) ===
        JSON.stringify(Object.entries(c.request).sort())
      );
    }
    return Buffer.from(c.body, "base64").equals(packet.subarray(20));
  }
  private guarded(c: CityCase): boolean {
    return this.guardFailure(c) === undefined;
  }
  private guardFailure(c: CityCase): string | undefined {
    const r = c.request ?? {};
    if (c.opcode === 5014) {
      const q = this.state.quests[r.template_id];
      if (questClaimed(this.state, r.template_id)) return alreadyCompletedText(5014);
      if (!q?.is_accept) return "Aceite esta missão antes de resgatar a recompensa.";
      if (!q.is_complete) return "Conclua os objetivos desta missão antes de resgatar a recompensa.";
    }
    if (c.opcode === 8296 && r.choose_index === 1) {
      if (
        !Object.values(this.state.items).some(
          (i) => i.template_id === 208008 && i.count > 0,
        )
      )
        return "Você não possui a chave necessária para esta entrada no labirinto.";
    }
    if (c.opcode === 8203) {
      const p = c.patches.find(
        (p) => p.path[0] === "buildings" && p.path.at(-1) === "template_id",
      );
      if (p && valueAt(this.state, p.path) !== p.before) return "Esta pesquisa não está disponível no nível atual da construção.";
    }
    if (c.opcode === 8594) {
      const p = c.patches.find(
        (p) => p.path[0] === "items" && p.after === undefined,
      );
      if (
        !p ||
        this.state.items[p.path[1]!]?.template_id !== p.before?.template_id
      )
        return "O item necessário não está disponível nesta posição da mochila.";
    }
    if (c.opcode === 15044) {
      const farm = this.state.farms[r.friend_id],
        plot = farm?.farmLandInfo?.find((p: Message) => p.pos === r.pos);
      if (!plot) return "Terreno de fazenda indisponível.";
      if (r.op_type === 1 && plot.item_template_id) return "Este terreno já possui uma plantação.";
      if (r.op_type === 1) {
        const seed = this.state.items[`1:0:${r.bag_pos}`];
        if (!seed || seed.template_id !== r.template_id || seed.count < 1)
          return "A semente necessária não está disponível na mochila.";
      }
      if (r.op_type === 3 && !plot.is_grass) return "Este terreno não precisa de limpeza.";
      if (r.op_type === 14 && !plot.is_can_reap) return "A plantação ainda não pode ser coletada.";
    }
    if (
      c.opcode === 5019 &&
      (this.now() - (this.saved.lastBoxAt ?? this.saved.startedAt) <
        r.time * 60000 ||
        (r.time === 10 && this.state.player.time_process !== 5))
    )
      return "Esta recompensa de tempo online ainda não está disponível. Aguarde o tempo indicado na janela.";
    if (c.opcode === 5185) {
      const list = String(this.state.hero.skill_script).split(",").map(Number);
      if (list.includes(r.skill_temp_id)) return "Esta habilidade já foi aprendida.";
      if (this.state.hero.skill_point < 1) return "Pontos de habilidade insuficientes.";
    }
    for (const p of c.patches) {
      try {
        const change = this.currencyPatch(this.state, p);
        if (change) {
          nextCurrencyBalance(
            change.currency,
            currencyBalance(this.state, change.currency),
            change.delta,
          );
        }
      } catch (error) {
        return error instanceof CurrencyError ? error.message : "Não foi possível validar os recursos necessários para esta ação.";
      }
    }
    return undefined;
  }
  private atomicMutation<T>(action: () => T): T {
    const previous = structuredClone(this.saved);
    const previousLabyrinthScene = this.labyrinth.sceneMap;
    const name = `city_mutation_${++this.mutationSequence}`;
    this.store.db.exec(`SAVEPOINT ${name}`);
    try {
      const result = action();
      this.store.db.exec(`RELEASE ${name}`);
      return result;
    } catch (error) {
      this.store.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      for (const key of Object.keys(this.saved))
        delete (this.saved as any)[key];
      Object.assign(this.saved, previous);
      this.labyrinth.restoreScene(previousLabyrinthScene);
      throw error;
    }
  }
  private applyGameplayPatch(
    state: CityState,
    patch: CityPatch,
    reason: string,
    operationId: string,
  ): void {
    if (patch.path[0] === "items") {
      this.applyInventoryPatch(state, patch);
      return;
    }
    if (
      patch.path[0] === "player" &&
      ["grades", "gp", "totalGp"].includes(patch.path[1]!)
    )
      return;
    const change = this.currencyPatch(state, patch);
    if (!change) {
      applyCityPatch(state, patch);
      return;
    }
    if (patch.path[0] === "packets") {
      const balance = currencyBalance(state, change.currency);
      applyCityPatch(state, patch);
      setCurrencyBalance(state, change.currency, balance);
    }
    if (
      !this.currencyLedger.change(
        state,
        this.userId,
        change.currency,
        change.delta,
        reason,
        operationId,
      )
    )
      throw new CurrencyError("Operação de moeda já recebida");
  }
  private currencyPatch(
    state: CityState,
    patch: CityPatch,
  ): { currency: Currency; delta: number } | undefined {
    const currency = currencyAtPath(state, patch.path);
    if (currency) {
      if (typeof patch.before !== "number" || typeof patch.after !== "number")
        throw new CurrencyError("Alteração de moeda sem quantidade conhecida");
      return { currency, delta: patch.after - patch.before };
    }
    if (patch.path[0] === "packets" && patch.path[1] === "4725") {
      const before = structuredClone(state),
        after = structuredClone(state);
      applyCityPatch(before, { ...patch, after: patch.before });
      applyCityPatch(after, patch);
      return {
        currency: "labyrinthCoin",
        delta:
          currencyBalance(after, "labyrinthCoin") -
          currencyBalance(before, "labyrinthCoin"),
      };
    }
    return undefined;
  }
  private inventory(state: CityState, legacy = false): Inventory {
    // PlayerInfo.bagDefaultCount in the recovered client is 42.
    const extra = Number(state.player.bag_count ?? 0);
    const capacity =
      42 + (Number.isSafeInteger(extra) && extra >= 0 ? extra : 0);
    return new Inventory(
      state.items,
      (this.saved.inventory ??= { nextId: 1 }),
      (bag, owner) => owner === 0 && [1, 34].includes(bag)
        ? storageCapacity(state.player, bag, this.now())
        : capacity,
      {
        created: item=>{rollInitialEquipment(item);ensureEquipmentSockets(item);},
        destination: item => storageDestination(state.player, item),
        validateDestination: (item, bag, owner) => validateStorageDestination(state.player, item, bag, owner),
        ...(!legacy ? {
        signature: stackSignature,
        usable: item => !item.is_locked && !expired(item, this.now()) &&
          !(item.bag_type === 1 && state.player.status > 0 &&
            item.pos >= permanentCapacity(state.player) &&
            dateTime(state.player.rentalBagTime) <= this.now()),
        materialBags: (template, bag) => bag === 1 && stoneCapacity(state.player) > 0 && storageEligible({ template_id: template }) ? [1, 34] : [bag],
        } : {}),
      },
    );
  }
  private syncLocalMail(): void {
    for (const row of this.store.db
      .prepare(
        "SELECT mail_id,detail FROM local_mail WHERE user_id=? AND min_level<=?",
      )
      .all(this.userId, Number(this.state.player.grades ?? 0))) {
      if (this.saved.deletedMailIds?.includes(Number(row.mail_id))) continue;
      const existing = this.state.mails[String(row.mail_id)];
      if (existing) {
        if (existing.isExist === 0) continue;
        const source = JSON.parse(String(row.detail));
        if (source.sendNickName === "Email do sistema" && source.title.startsWith("Conclusão de campanha"))
          for (const key of ["sendNickName", "title", "contents"]) existing[key] = source[key];
        // EmailInfo.isRead uses year 2999 as unread. The original placeholder expired these deliveries.
        if (existing.readDate === "2000-01-01 00:00:00")
          existing.readDate = "2999-01-01 00:00:00";
        existing.isExist = 1;
        continue;
      }
      const mail = JSON.parse(String(row.detail));
      if (mail.readDate === "2000-01-01 00:00:00")
        mail.readDate = "2999-01-01 00:00:00";
      mail.isExist = 1;
      mail.sendDate = new Date(this.now())
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      mail.receiveNickName =
        this.store.tutorialProfile(this.userId)?.nickname ?? "";
      this.state.mails[mail.id] = mail;
      (this.saved.pendingMailNotices ??= []).push(mail.id);
    }
  }
  private claimLocalMail(r: Message): TutorialResponse[] | undefined {
    const ids: number[] = r.mailsIdArray ?? [],
      positions: number[] = r.position ?? [];
    try {
      return this.atomicMutation(() => {
        this.syncLocalMail();
        if (
          !ids.length ||
          ids.length !== positions.length ||
          ids.length > 300 ||
          ids.some((id) => !Number.isSafeInteger(id) || !this.state.mails[id] || this.state.mails[id].isExist === 0 || this.saved.deletedMailIds?.includes(id))
        )
          throw new InventoryError(
            "Seleção de emails inválida",
          );
        const rewardsBefore = acquisitionSnapshot(this.state);
        const before = structuredClone(this.state.items),
          inventory = this.inventory(this.state);
        const visited = new Set<string>();
        for (let j = 0; j < ids.length; j++) {
          const mail = this.state.mails[ids[j]!]!,
            position = positions[j]!;
          if (!mail)
            throw new InventoryError(
              "Esse email ainda não foi entregue ao personagem.",
            );
          if (!Number.isInteger(position) || position < 0 || position > 5)
            throw new InventoryError("Anexo inválido");
          mail.readDate = serverDate(this.now());
          for (const n of position === 0 ? [1, 2, 3, 4, 5] : [position]) {
            const key = `${mail.id}:${n}`;
            if (visited.has(key)) throw new InventoryError("Anexo repetido");
            visited.add(key);
            if (mail[`isAnnex${n}`] || !mail[`annex${n}`]) continue;
            if (mail[`annex${n}Name`] === -700) {
              this.gainCharacterExperience(mail[`annex${n}Count`]);
            } else if (currencyAnnexes[mail[`annex${n}Name`]]) {
              this.currencyLedger.change(
                this.state,
                this.userId,
                currencyAnnexes[mail[`annex${n}Name`]]!,
                mail[`annex${n}Count`],
                "mail:resource",
                `mail:${mail.id}:annex:${n}`,
              );
            } else
              inventory.add(
                {
                  template_id: mail[`annex${n}Name`],
                  count: mail[`annex${n}Count`],
                  bag_type: 1,
                  object_id: 0,
                  pos: 0,
                  exist: 1,
                  bind: 1,
                  used: 0,
                  user_id: this.userId,
                  strengthen_grade: 0,
                  join_1: -1,
                  join_2: -1,
                  join_3: -1,
                  join_4: -1,
                },
                mail[`annex${n}Count`],
              );
            mail[`isAnnex${n}`] = 1;
          }
        }
        const gains = acquisitionGains(rewardsBefore, acquisitionSnapshot(this.state));
        this.persist();
        return [
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
          this.packet({ opcode: 4131, message: {} }, true),
          this.packet({ opcode: 114, message: { pickupResult: [...new Set(ids)].map(mail_id => ({ mail_id, attach_index: 0, result: 1 })) } }),
          this.packet({ opcode: 109, message: {} }, true),
          this.packet({ opcode: 4725, message: {} }, true),
          this.packet({ opcode: 3, message: {} }, true),
          this.packet({ opcode: 113, message: {} }, true),
          this.packet({ opcode: 150, message: {} }, true),
          ...this.acquisitionNotice(gains, "pelos anexos do correio"),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError || error instanceof CurrencyError) {
        this.logRejection(error.message);
        return [this.notice(error.message)];
      }
      throw error;
    }
  }
  private deleteMail(r: Message): TutorialResponse[] {
    try {
      return this.atomicMutation(() => {
        const ids: number[] = r.delList ?? [];
        if (!Array.isArray(ids) || !ids.length || ids.length > 300 || new Set(ids).size !== ids.length ||
          ids.some(id => !Number.isSafeInteger(id) || !this.state.mails[id] || this.state.mails[id].isExist === 0 || this.saved.deletedMailIds?.includes(id)))
          throw new InventoryError("Seleção de emails inválida");
        const deleted: number[] = [], protectedIds: number[] = [];
        for (const id of ids) {
          const mail = this.state.mails[id]!;
          if ([1,2,3,4,5].some(n => mail[`annex${n}`] && !mail[`isAnnex${n}`])) { protectedIds.push(id); continue; }
          // Keep a persisted tombstone so synchronized/captured envelopes cannot reappear.
          mail.isExist = 0; deleted.push(id);
          (this.saved.deletedMailIds ??= []).push(id);
          this.store.db.prepare("DELETE FROM local_mail WHERE user_id=? AND mail_id=?").run(this.userId, id);
        }
        this.saved.pendingMailNotices = this.saved.pendingMailNotices?.filter(id => !deleted.includes(id));
        this.persist();
        return [this.packet({ opcode: 4132, message: { delList: deleted } }),
          ...(protectedIds.length ? [this.notice("Emails com anexos foram preservados. Extraia os anexos antes de excluir.")] : [])];
      });
    } catch (error) {
      if (error instanceof InventoryError) return [this.notice(error.message)];
      throw error;
    }
  }
  private composeEquipment(r: Message): TutorialResponse[] {
    try {
      return this.atomicMutation(() => {
        const before = structuredClone(this.state.items), profile = this.store.tutorialProfile(this.userId)!;
        const template = farmRecipes.some(row=>Number(row.Id)===Number(r.compose_id))
          ? synthesizeFarm(this.inventory(this.state),r,Number(this.state.player.grades),this.userId,amount=>{this.currencyLedger.change(this.state,this.userId,"gold",-amount,"farm:synthesis");})
          : gemRecipes.has(Number(r.compose_id))||accessoryRecipes.has(Number(r.compose_id))
          ? synthesizeGem(this.inventory(this.state),r,Number(this.state.player.grades),this.userId,
            amount=>{this.gold.change(this.state.economy,this.userId,-amount,"gem-synthesis");})
          : luckyStoneRecipes.has(Number(r.compose_id))
          ? synthesizeLuckyStone(this.inventory(this.state), r, Number(this.state.player.grades), this.userId,
            amount => { this.gold.change(this.state.economy, this.userId, -amount, "lucky-stone-synthesis"); })
          : synthesizeEquipment(this.inventory(this.state), r, Number(this.state.player.grades), classForIcon(profile.icon), this.userId, Number(this.state.hero.hero_id),
            amount => { this.gold.change(this.state.economy, this.userId, -amount, "equipment-synthesis"); });
        this.persist();
        return [this.packet({ opcode: 115, message: { moved: inventoryUpdates(before, this.state.items) } }),
          this.packet({ opcode: 109, message: {} }, true),
          ...[113,150,3].map(opcode => this.packet({ opcode, message: {} }, true)),
          this.packet({ opcode: 89, message: { compose_result: 1, compose_templateId: template } })];
      });
    } catch (error) {
      if (error instanceof InventoryError || error instanceof CurrencyError) return [this.notice(error.message), this.packet({ opcode: 89, message: { compose_result: 0 } })];
      throw error;
    }
  }
  private strengthenItem(r: Message): TutorialResponse[] {
    try {
      return this.atomicMutation(() => {
        if(this.saved.battle && !this.saved.battle.finished)throw new InventoryError("Aguarde o fim da batalha para fortalecer equipamentos");
        const before=structuredClone(this.state.items);
        const result=strengthenEquipment(this.inventory(this.state),r,Number(this.state.hero.hero_id),
          cost=>{this.gold.change(this.state.economy,this.userId,-cost,"equipment-strengthening");});
        this.updateObjectives();this.syncAutoQuests();this.persist();
        return [this.packet({opcode:115,message:{moved:inventoryUpdates(before,this.state.items)}}),
          ...[109,113,150,3,112].map(opcode=>this.packet({opcode,message:{}},true)),
          this.packet({opcode:86,message:result})];
      });
    }catch(error){
      if(error instanceof InventoryError || error instanceof CurrencyError)return [this.notice(error.message),this.packet({opcode:86,message:{streng_result:0}})];
      throw error;
    }
  }
  private addDrills(count:number,payType:number,offerId=838,cart=false):void{
    const offer=[...drillOffers,...forgeOffers].find(o=>Number(o.Id)===offerId);
    if(!offer||!Number.isSafeInteger(count)||count<1||count>9999||!(cart?[1,2]:[0,1]).includes(payType))throw new InventoryError("Compra de perfuradores inválida");
    const price=Number(offer.GiftToken||offer.Point)*count;
    const bound=cart?(payType===2?Math.min(price,Number(this.state.player.gift_token)):0):(payType===0?price:0);
    this.currencyLedger.changeMany(this.state,this.userId,{boundDiamonds:-bound,diamonds:-(price-bound)},"shop:drill");
    this.inventory(this.state).add({template_id:Number(offer.ItemId),bag_type:1,object_id:0,pos:0,count,exist:1,bind:bound>0?1:0,used:0,user_id:this.userId,strengthen_grade:0,join_1:-1,join_2:-1,join_3:-1,join_4:-1},count);
  }
  private buyDrills(op:number,r:Message):TutorialResponse[]|undefined{
    const entries=op===5154?[{shopId:r.buyInfo?.good_id,count:r.buyInfo?.count,payType:r.pay_type??0}]:r.carItemInfo;
    if(!Array.isArray(entries)||!entries.some(e=>[...drillOffers,...forgeOffers].some(o=>Number(o.Id)===Number(e.shopId))))return;
    try{return this.atomicMutation(()=>{
      if(r.receiveUserId&&![this.userId,this.scenario.userId].includes(Number(r.receiveUserId)))throw new InventoryError("Destinatário inválido");
      if(r.buyInfo?.receive_id&&![this.userId,this.scenario.userId].includes(Number(r.buyInfo.receive_id)))throw new InventoryError("Destinatário inválido");
      const before=structuredClone(this.state.items);
      for(const entry of entries)this.addDrills(Number(op===5154?entry.count:entry.counts),Number(entry.payType??0),Number(entry.shopId),op===8970);
      this.persist();return[this.packet({opcode:115,message:{moved:inventoryUpdates(before,this.state.items)}}),this.packet({opcode:3,message:{}},true),
        this.packet(op===5154?{opcode:90,message:{buyInfo:{...r.buyInfo,result:1}}}:{opcode:4783,message:{result:0,carItemInfo:entries}})];
    });}catch(error){if(error instanceof InventoryError||error instanceof CurrencyError)return[this.notice(error.message)];throw error;}
  }
  private gemRequest(op:number,r:Message):TutorialResponse[]{
    try{return this.atomicMutation(()=>{
      if(this.saved.battle&&!this.saved.battle.finished)throw new InventoryError("Aguarde o fim da batalha para usar a forja");
      const before=structuredClone(this.state.items),inventory=this.inventory(this.state);
      const debit=(gold:number)=>{this.gold.change(this.state.economy,this.userId,-gold,op===5151?"gem-insertion":"gem-removal");};
      if(op===5151)insertGem(inventory,r,this.userId,debit);
      else if(op===5152)socketOperation(inventory,r,this.userId,debit,()=>this.addDrills(1,Number(r.pay_type??0)));
      else if(op===9592)upgradeRefinement(inventory,this.state.player,Number(this.state.player.grades),r);
      else if(Number(r.templateId)===ADVANCED_SOUL_ITEM)upgradeAdvancedSoul(inventory,this.state.player,r);
      else upgradeSoul(inventory,this.state.player,r);
      this.persist();return[this.packet({opcode:115,message:{moved:inventoryUpdates(before,this.state.items)}}),
        ...[109,3,113,150].map(opcode=>this.packet({opcode,message:{}},true))];
    });}catch(error){if(error instanceof InventoryError||error instanceof CurrencyError)return[this.notice(error.message),this.packet({opcode:3,message:{}},true)];throw error;}
  }
  private forgeGemRequest(op:number,r:Message):TutorialResponse[]{
    try{return this.atomicMutation(()=>{
      if(this.saved.battle&&!this.saved.battle.finished)throw new InventoryError("Aguarde o fim da batalha para usar a forja");
      const before=structuredClone(this.state.items),inventory=this.inventory(this.state);
      const debit=(gold:number)=>{this.gold.change(this.state.economy,this.userId,-gold,op===8340?"gem-decomposition":"gem-conversion");};
      if(op===8340)decomposeGems(inventory,this.userId,debit);else convertGems(inventory,r,this.userId,debit);
      this.persist();return[this.packet({opcode:115,message:{moved:inventoryUpdates(before,this.state.items)}}),
        this.packet({opcode:109,message:{}},true),this.packet({opcode:3,message:{}},true),...(op===8340?[this.packet({opcode:4260,message:{}})]:[])];
    });}catch(error){if(error instanceof InventoryError||error instanceof CurrencyError)return[this.notice(error.message)];throw error;}
  }
  private equipmentRefinement(op:number,r:Message):TutorialResponse[]{
    try{return this.atomicMutation(()=>{
      if(this.saved.battle&&!this.saved.battle.finished)throw new InventoryError("Aguarde o fim da batalha para usar a forja");
      const save=this.saved.purification??={},inventory=this.inventory(this.state),before=structuredClone(this.state.items);
      if(op===8464){
        const item=Object.values(this.state.items).find(i=>i.id===Number(r.item_id)),proposal=item&&save[String(item.id)];
        const valid=proposal&&proposal.templateId===item.template_id&&proposal.before.every((id,n)=>id===Number(item[`random_skill_${n+1}`]??0));
        return[this.packet({opcode:4368,message:valid?{result:1,randomSkill:proposal.skills,lockPos:proposal.locks}:{result:0,randomSkill:[],lockPos:[]}})];
      }
      const buy=(id:number,count:number,payType:number)=>{
        const price=forgeMaterialPrice(id);if(!price)throw new InventoryError("Este material ainda não possui oferta por diamantes");
        const cost=price*count,bound=payType===0?Math.min(cost,currencyBalance(this.state,"boundDiamonds")):0;
        this.currencyLedger.changeMany(this.state,this.userId,{boundDiamonds:-bound,diamonds:-(cost-bound)},op===8644?"casting:materials":"purification:materials");return bound>0;
      };
      const callbacks:TutorialResponse[]=[];
      if(op===8336){if(Number(this.state.player.grades)<19)throw new InventoryError("Purificação exige nível 19");const proposal=purifyEquipment(inventory,save,r,buy);callbacks.push(this.packet({opcode:4258,message:{randomSkill:proposal.skills}}));}
      else if(op===8339)applyPurification(inventory,save);
      else{const result=castEquipment(inventory,Number(this.state.player.grades),r,gold=>{this.gold.change(this.state.economy,this.userId,-gold,"equipment-casting");},buy);callbacks.push(this.packet({opcode:4558,message:result}));}
      this.persist();return[this.packet({opcode:115,message:{moved:inventoryUpdates(before,this.state.items)}}),
        ...[109,3,113,150].map(opcode=>this.packet({opcode,message:{}},true)),...callbacks];
    });}catch(error){if(error instanceof InventoryError||error instanceof CurrencyError)return[this.notice(error.message)];throw error;}
  }
  private applyInventoryPatch(
    state: CityState,
    p: CityPatch,
    reference?: Message,
  ): void {
    const key = p.path[1]!;
    const before =
      reference ?? (p.path.length === 2 ? p.before : state.items[key]);
    const inventory = this.inventory(state);
    const locate = () =>
      Object.entries(state.items).find(
        ([k, i]) =>
          i.template_id === before?.template_id &&
          (k === key || i.id === before?.id),
      ) ??
      Object.entries(state.items).find(
        ([, i]) =>
          i.template_id === before?.template_id &&
          i.bag_type === before?.bag_type,
      );
    if (p.path.length === 2 && !p.before && p.after) {
      inventory.add(
        {
          ...p.after,
          template_id: starterTemplate(
            p.after.template_id,
            classForIcon(this.store.tutorialProfile(this.userId)!.icon),
          ),
        },
        p.after.count,
      );
      return;
    }
    const found = locate();
    if (!found) throw new InventoryError("Item da operação não disponível");
    const [actualKey, item] = found;
    if (p.path.length === 2) {
      if (!p.after) {
        inventory.consume(actualKey, before.count);
        return;
      }
      if (p.after.template_id !== before.template_id) {
        inventory.consume(actualKey, before.count);
        inventory.add(p.after, p.after.count);
        return;
      }
      const delta = p.after.count - before.count;
      if (delta > 0) inventory.add(item, delta);
      if (delta < 0) inventory.consume(actualKey, -delta);
      for (const [field, value] of Object.entries(p.after))
        if (
          !["id", "count", "bag_type", "pos", "object_id", "user_id"].includes(
            field,
          )
        )
          item[field] = structuredClone(value);
    } else if (p.path[2] === "count") {
      const delta = p.after - p.before;
      if (delta > 0) inventory.add(item, delta);
      if (delta < 0) inventory.consume(actualKey, -delta);
    } else {
      if (
        p.path.length !== 3 ||
        ["id", "pos", "bag_type", "object_id"].includes(p.path[2]!)
      )
        throw new InventoryError("Alteração de item não suportada");
      if (p.after === undefined) delete item[p.path[2]!];
      else item[p.path[2]!] = structuredClone(p.after);
    }
  }
  private referenceItems(index: number): Record<string, Message> {
    const reference = {
      items: structuredClone(this.scenario.initial.items),
    } as CityState;
    for (const c of this.scenario.cases.slice(0, index))
      for (const p of c.patches)
        if (p.path[0] === "items") applyCityPatch(reference, p);
    return reference.items;
  }
  private goldReason(c: CityCase): string {
    if (c.opcode === 5014) return `mission:${c.request?.template_id}`;
    if (c.opcode === 5019) return `online-time:${c.request?.time}`;
    if (c.opcode === 8203)
      return `building:${Number(c.request?.building_id) % 10000}`;
    if (c.opcode === 15044) return `farm:${c.request?.op_type}`;
    if (c.opcode === 5022) return "mail";
    if (c.opcode === 5038) return `campaign:${c.request?.para_int1}`;
    return `gameplay:${c.opcode}`;
  }
  private execute(c: CityCase, index: number): TutorialResponse[] {
    try {
      return this.atomicMutation(() => this.executeCase(c, index));
    } catch (error) {
      if (error instanceof InventoryError) {
        this.logRejection(error.message);
        return [this.notice(error.message)];
      }
      if (error instanceof CurrencyError || error instanceof ExperienceError)
        return [this.notice(error.message)];
      throw error;
    }
  }
  private executeCase(
    c: CityCase,
    index: number,
    repeatOperation?: string,
  ): TutorialResponse[] {
    if (
      (!repeatOperation && this.saved.used.includes(index)) ||
      !this.guarded(c)
    )
      return this.mutationRejection(c.opcode, c.request, [c]);
    this.ensureAttributes();
    const next = structuredClone(this.state);
    const rewardsBefore = [5014, 5019, 5022].includes(c.opcode) ? acquisitionSnapshot(this.state) : undefined;
    const xp = experienceReward(c.patches);
    if (xp) grantExperience(next.player, xp);
    const capturedLevelUp = c.patches.some(
      (p) => p.path.join(".") === "player.grades",
    );
    const gainedLevel = next.player.grades > this.state.player.grades;
    const referenceItems = this.referenceItems(index);
    const previousItems = structuredClone(this.state.items);
    for (const p of c.patches) {
      if (
        next.player.grades > 10 &&
        capturedLevelUp &&
        (p.path[0] === "hero" ||
          (p.path[0] === "army" &&
            ["simple_hero_info", "armyPawn"].includes(p.path[1]!)) ||
          p.path.join(".") === "player.fighting_capacity" ||
          p.path.join(".") === "army.fightingCapacity")
      )
        continue;
      if (
        capturedLevelUp &&
        !gainedLevel &&
        (p.path[0] === "hero" ||
          (p.path[0] === "army" &&
            ["simple_hero_info", "armyPawn"].includes(p.path[1]!)) ||
          p.path.join(".") === "player.fighting_capacity" ||
          p.path.join(".") === "army.fightingCapacity")
      )
        continue;
      if (
        p.path[0] === "quests" &&
        p.path.length > 2 &&
        !next.quests[p.path[1]!]?.template_id
      )
        continue;
      if (c.opcode === 5017 && p.path[0] !== "player") continue;
      if (c.opcode === 5017 && p.path[1] !== "novice_process") continue;
      if (
        c.opcode === 15044 &&
        c.request?.op_type === 1 &&
        p.path[0] === "items"
      )
        continue;
      if (c.opcode === 5014 && p.path[0] === "farms") continue;
      if (c.opcode === 5014 && p.path[0] === "player" && ["quest_site", "quest_site_len"].includes(p.path[1]!)) continue;
      if (c.opcode === 5185 && p.path[0] === "hero" && p.path[1] === "fast_key")
        continue;
      if (
        c.opcode === 5185 &&
        p.path[0] === "hero" &&
        p.path[1] === "skill_script"
      )
        continue;
      if (p.path[0] === "items") {
        this.applyInventoryPatch(next, p, referenceItems[p.path[1]!]);
        continue;
      }
      const questTemplate = c.opcode === 5014 ? questTemplates.find(t => Number(t.TemplateId) === c.request?.template_id) : undefined;
      const rewardField = { "economy.gold_total_count": "RewardGold", "player.strategy": "RewardStrategy", "economy.crystals_count": "RewardCrystal" }[p.path.join(".")];
      const annexCurrency = currencyAtPath(next, p.path);
      const annexReward = questTemplate && annexCurrency ? questGoods
        .filter(i => Number(i.TemplateId) === c.request?.template_id && currencyAnnexes[Number(i.RewardItemID)] === annexCurrency &&
          (!Number(i.ToJob) || Number(i.ToJob) === classForIcon(this.store.tutorialProfile(this.userId)!.icon)) &&
          (i.IsSelect !== "true" || Number(i.RewardItemID) === c.request?.reward_item_id))
        .reduce((total, i) => total + Number(i.RewardItemCount), 0) : 0;
      // Captured gold deltas may include passive city income. Use the quest's
      // explicit reward amount; production remains in its own ledger.
      const authoritativePatch = questTemplate && rewardField
        ? { ...p, after: Number(p.before) + Number(questTemplate[rewardField]) + annexReward }
        : p;
      this.applyGameplayPatch(
        next,
        authoritativePatch,
        this.goldReason(c),
        `${repeatOperation ?? `capture:${c.at}:${c.opcode}:case:${index}`}:${c.patches.indexOf(p)}`,
      );
    }
    if (c.opcode === 5185) {
      const skill =
        classForIcon(this.store.tutorialProfile(this.userId)!.icon) * 10000 +
        (c.request!.skill_temp_id % 10000);
      next.hero.skill_script =
        [
          ...new Set([
            ...String(this.state.hero.skill_script).split(",").filter(Boolean),
            String(skill),
          ]),
        ].join(",") + ",";
    }
    next.hero.skill_script = this.classSkills(next.hero.skill_script);
    next.hero.fast_key = this.classKeys(next.hero.fast_key);
    if (c.opcode === 15044 && c.request?.op_type === 1) {
      const key = `1:0:${c.request.bag_pos}`;
      this.inventory(next).consume(key, 1);
      const plot = next.farms[c.request.friend_id]?.farmLandInfo?.find(
        (p: Message) => p.pos === c.request!.pos,
      );
      if (plot) {
        const duration =
          Date.parse(plot.mature_time) - Date.parse(plot.add_time);
        plot.add_time = new Date(this.now())
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        plot.mature_time = new Date(this.now() + duration)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      }
    }
    // Captured attribute panels are observations, never sources in the local calculator.
    const gains = rewardsBefore ? acquisitionGains(rewardsBefore, acquisitionSnapshot(next)) : [];
    this.saved.state = next;
    if (c.opcode === 5014) markQuestClaimed(this.state, c.request!.template_id, this.now());
    this.syncHero();
    if (!this.saved.used.includes(index)) this.saved.used.push(index);
    if (c.opcode === 5019) this.saved.lastBoxAt = this.now();
    this.persist();
    this.syncAutoQuests();
    this.persist();
    const excluded = new Set([
      83, 84, 85, 111, 4234, 157, 153, 154, 156, 75, 115, 4484, 4491, 4592, 4593, 4594, 4595, 4597, 4606, 4607,
    ]);
    const result = c.responses
      .filter((p) => !excluded.has(p.opcode) && !(c.opcode === 5014 && [52, 112].includes(p.opcode)))
      .map((p, i) => {
        return this.packet(
          {
            ...p,
            ...(p.opcode === 52 && c.opcode === 5014
              ? { message: { ...p.message, isJump: 0 } }
              : {}),
            delayMs: 30 + i * 5,
          },
          ![52, 114, 4487].includes(p.opcode),
        );
      });
    if (c.opcode === 5014) result.push(...this.questDelivery(c.request!.template_id, 220));
    result.push(
      ...this.login().map((p, i) => ({ ...p, delayMs: 300 + i * 2 })),
    );
    const moved = inventoryUpdates(previousItems, this.state.items);
    if (moved.length)
      result.unshift(this.packet({ opcode: 115, message: { moved } }));
    result.push(this.packet({ opcode: 112, message: {}, delayMs: 320 }, true));
    if (rewardsBefore) result.push(...this.acquisitionNotice(gains,
      c.opcode === 5014 ? "pela missão" : c.opcode === 5019 ? "pela recompensa de tempo online" : "pelos anexos do correio", 330));
    return result;
  }
  private updateObjectives(): void {
    const complete = (id: number, progress: number) => {
      const q = this.state.quests[id];
      const goal = Number(
        questConditions.find((c) => Number(c.TemplateId) === id)?.Para2 ?? 1,
      );
      if (q?.is_accept) {
        q.condition_1 = Math.min(goal, progress);
        q.is_complete = progress >= goal ? 1 : 0;
      }
    };
    const recruits = Math.max(
      Number(this.state.quests[1834]?.condition_1 ?? 0),
      Number(this.state.economy.cur_population ?? 0),
      (this.state.pawnStock ?? []).reduce((n, p) => n + p.own_pawns, 0) +
        (this.state.army.armyPawn ?? []).reduce(
          (n: number, p: Message) => n + p.own_pawns,
          0,
        ),
    );
    complete(1834, recruits);
    complete(
      1836,
      this.saved.won.includes(0) && this.saved.won.includes(1) ? 1 : 0,
    );
    complete(
      1839,
      Math.max(
        this.saved.farmPlanted ?? 0,
        (this.state.farms[this.scenario.userId]?.farmLandInfo ?? []).filter(
          (p: Message) => p.pos < 1000 && p.item_template_id,
        ).length,
      ),
    );
    // Backend and Flash use the same first-floor goal. The client also checks
    // maxIndex locally, so changing only QuestInfo.is_complete is insufficient.
    const firstMazeVictory = this.saved.labyrinth?.cleared.includes(1) ||
      Number(this.saved.labyrinth?.record ?? 0) >= 1 || this.saved.won.includes(2);
    const mazeQuestGoal = Number(questConditions.find(c => Number(c.TemplateId) === 1840)?.Para2 ?? 1);
    complete(1840, firstMazeVictory ? mazeQuestGoal : Number(this.state.quests[1840]?.condition_1 ?? 0));
    complete(
      1854,
      (this.saved.friends ?? []).filter((f) => f.relation === 1).length,
    );
    for (const q of campaignQuests) {
      const condition = q.conditions.find((c) => c.CondictionType === "14");
      if (condition)
        complete(
          Number(q.template.TemplateId),
          this.clearedCampaigns().includes(Number(condition.Para1)) ? 1 : 0,
        );
    }
    updateStoryObjectives(this.state, this.clearedCampaigns(), this.saved.questCounters ?? {}, (campaign, template) => {
      if (this.clearedCampaigns().includes(campaign)) return true;
      if (!campaignDefinitions.has(campaign)) return false;
      return campaignBattleIndices(campaign).some(index => this.saved.won.includes(index) &&
        this.scenario.battles[index]?.prepare.heros?.some((hero: Message) => hero.side === 2 && hero.temp_id === template));
    });
    updateMountObjectives(this.state, this.mounts.grade);
  }
  private questModel(id: number): Message | undefined {
    if (!questTemplates.some(q => Number(q.TemplateId) === id)) return undefined;
    return this.scenario.questCatalog[id] ?? {
      template_id: id, is_complete: 0, is_accept: 0, is_select: 1,
      condition_1: 0, condition_2: 0, condition_3: 0, condition_4: 0,
      completed_date: "2000-01-01 00:00:00", repeat_finish: 0,
      add_date: new Date(this.now()).toISOString().slice(0, 19).replace("T", " "),
    };
  }
  private questDelivery(id: number, delayMs = 0): TutorialResponse[] {
    return [
      this.packet({ opcode: 112, message: questSnapshot(this.state, questTemplates, id), delayMs }),
      this.packet({ opcode: 52, message: { template_id: id, isJump: 0 }, delayMs: delayMs + 1 }),
      this.packet({ opcode: 112, message: questSnapshot(this.state, questTemplates), delayMs: delayMs + 2 }),
    ];
  }
  private claimCampaignQuest(r: Message): TutorialResponse[] | undefined {
    const definition =
      campaignQuests.find(
        (q) => Number(q.template.TemplateId) === r.template_id,
      ) ??
      mountQuests.find(q => Number(q.template.TemplateId) === r.template_id) ??
      (() => {
        const template = questTemplates.find(
          (q) => Number(q.TemplateId) === r.template_id,
        );
        return template &&
          this.questModel(r.template_id) &&
          !this.scenario.cases.some(
            (c) =>
              c.opcode === 5014 && c.request?.template_id === r.template_id,
          )
          ? {
              template,
              items: questGoods.filter(
                (i) => Number(i.TemplateId) === r.template_id,
              ),
            }
          : undefined;
      })();
    if (!definition) return undefined;
    try {
      return this.atomicMutation(() => {
        this.updateObjectives();
        const q = this.state.quests[r.template_id];
        if (!q?.is_accept || !q.is_complete || questClaimed(this.state, r.template_id))
          return this.rejection(questClaimed(this.state, r.template_id)
            ? alreadyCompletedText(5014) : "Missão ainda não concluída", `quest:${r.template_id}`);
        const rewardsBefore = acquisitionSnapshot(this.state);
        const before = structuredClone(this.state.items),
          t = definition.template;
        for (const [field, currency] of [
          ["RewardGold", "gold"],
          ["RewardCrystal", "lightCrystal"],
          ["RewardStrategy", "spirit"],
        ] as const) {
          const amount = Number(t[field] ?? 0);
          if (amount)
            this.currencyLedger.change(
              this.state,
              this.userId,
              currency,
              amount,
              `quest:${r.template_id}`,
              `quest:${r.template_id}:${currency}`,
            );
        }
        const xp = Number(t.RewardPlayGP ?? 0);
        if (xp) grantExperience(this.state.player, xp);
        const job = classForIcon(this.store.tutorialProfile(this.userId)!.icon);
        for (const item of definition.items) {
          if (Number(item.ToJob) && Number(item.ToJob) !== job) continue;
          if (
            item.IsSelect === "true" &&
            Number(item.RewardItemID) !== r.reward_item_id
          )
            continue;
          const currency = currencyAnnexes[Number(item.RewardItemID)];
          if (currency) {
            this.currencyLedger.change(this.state, this.userId, currency, Number(item.RewardItemCount),
              `quest:${r.template_id}:item`, `quest:${r.template_id}:item:${item.RewardItemID}`);
            continue;
          }
          this.grantCampaignItem(
            {
              template_id: Number(item.RewardItemID),
              bind: 1,
              used: 0,
              strengthen_grade: 0,
              join_1: -1,
              join_2: -1,
              join_3: -1,
              join_4: -1,
            },
            Number(item.RewardItemCount),
          );
        }
        const gains = acquisitionGains(rewardsBefore, acquisitionSnapshot(this.state));
        markQuestClaimed(this.state, r.template_id, this.now());
        this.syncAutoQuests();
        this.syncHero();
        this.persist();
        return [
          ...this.questDelivery(r.template_id),
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
          this.packet({ opcode: 112, message: {} }, true),
          ...this.login(),
          ...this.acquisitionNotice(gains, "pela missão"),
        ];
      });
    } catch (error) {
      if (
        error instanceof InventoryError ||
        error instanceof CurrencyError ||
        error instanceof ExperienceError
      )
        return [this.notice(error.message)];
      throw error;
    }
  }
  private acceptQuests(ids: number[]): TutorialResponse[] {
    const pending: Message[] = [];
    for (const id of ids) {
      const template = questTemplates.find((q) => Number(q.TemplateId) === id),
        model = this.questModel(id);
      if (!template || !model) continue;
      if (
        this.state.quests[id]?.is_accept ||
        this.state.quests[id]?.is_complete ||
        questClaimed(this.state, id)
      )
        continue;
      if (
        this.state.player.grades < Number(template.NeedMinLevel) ||
        this.state.player.grades > Number(template.NeedMaxLevel) ||
        !questInDateWindow(template, this.now()) ||
        questParents(template).some(p => !questClaimed(this.state, p))
      )
        continue;
      pending.push({
        ...structuredClone(model),
        is_accept: 1,
        is_complete: 0,
        condition_1: 0,
        condition_2: 0,
        condition_3: 0,
        condition_4: 0,
        add_date: new Date(this.now())
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
      });
    }
    for (const q of pending) this.state.quests[q.template_id] = q;
    this.syncAutoQuests();
    this.persist();
    return [this.packet({ opcode: 112, message: {} }, true)];
  }
  private moveItem(r: Message): TutorialResponse[] {
    r = { begin_obj_id: 0, end_obj_id: 0, count: 0, ...r };
    const a = `${r.begin_bag_type}:${r.begin_obj_id}:${r.begin_pos}`;
    const source = this.state.items[a];
    if (source && Number(itemTemplate(source.template_id)?.SonType) === 302 && (r.begin_bag_type === 0 || r.end_bag_type === 0)) {
      try { return this.atomicMutation(() => {
        const before = structuredClone(this.state.items);
        if (this.saved.battle && !this.saved.battle.finished) throw new RuneError("Conclua a batalha antes de modificar runas");
        moveRuneMaterial(this.state, this.inventory(this.state), r); this.persist();
        return [this.packet({ opcode: 115, message: { moved: inventoryUpdates(before, this.state.items) } })];
      }); } catch (error) {
        if (!(error instanceof RuneError || error instanceof InventoryError)) throw error;
        return [this.packet({ opcode: 115, message: { moved: [
          { change_type: r.begin_bag_type, change_obj_id: r.begin_obj_id, change_pos: r.begin_pos, ...(source ? { item: source } : {}) },
          { change_type: r.end_bag_type, change_obj_id: r.end_obj_id, change_pos: r.end_pos, ...(this.state.items[`${r.end_bag_type}:${r.end_obj_id}:${r.end_pos}`] ? { item: this.state.items[`${r.end_bag_type}:${r.end_obj_id}:${r.end_pos}`] } : {}) },
        ] } }), this.notice(error.message)];
      }
    }
    const cosmeticMove = this.fashion.moveItem(r, source);
    if (cosmeticMove) return cosmeticMove;
    if(!source&&r.begin_bag_type===0&&r.begin_obj_id===0&&[0,1].includes(r.begin_pos)&&r.end_bag_type===1&&r.end_obj_id===0){
      const target=this.state.items[`1:0:${r.end_pos}`];
      return[this.packet({opcode:115,message:{moved:[{change_type:0,change_obj_id:0,change_pos:r.begin_pos},
        ...(Number.isInteger(r.end_pos)&&r.end_pos>=0?[{change_type:1,change_obj_id:0,change_pos:r.end_pos,...(target?{item:target}:{})}]:[])]}})];
    }
    if (r.count === 0 && source) r.count = source.count;
    if (r.end_pos === -1)
      r.end_pos = this.freeSlot(r.end_bag_type, r.end_obj_id);
    const d = `${r.end_bag_type}:${r.end_obj_id}:${r.end_pos}`;
    const item = this.state.items[a],
      occupied = this.state.items[d];
    if((r.begin_bag_type===0||r.end_bag_type===0)&&item&&forgeGem(item.template_id)){
      try{return this.atomicMutation(()=>{
        if(this.saved.battle&&!this.saved.battle.finished)throw new InventoryError("Aguarde o fim da batalha para usar a forja");
        if(![0,1,34].includes(r.begin_bag_type)||![0,1,34].includes(r.end_bag_type)||r.begin_obj_id||r.end_obj_id||
          (r.end_bag_type===0&&(!Number.isInteger(r.end_pos)||r.end_pos<0||r.end_pos>11))||
          (r.end_bag_type===0&&r.end_pos>0&&Number(itemTemplate(item.template_id)?.SonType)!==228))throw new InventoryError("Slot de gema inválido");
        const before=structuredClone(this.state.items),inventory=this.inventory(this.state);
        if(!Number.isSafeInteger(r.count)||r.count<1||r.count>item.count)throw new InventoryError("Quantidade de gema inválida");
        r={...r,count:item.count};
        if(r.end_bag_type===0&&occupied){
          if(a===d||!forgeGem(occupied.template_id))throw new InventoryError("O slot contém um item de outra funcionalidade");
          const incoming=inventory.consume(a,r.count),returned=inventory.consume(d,occupied.count);
          inventory.add({...returned,bag_type:1,object_id:0,pos:0},returned.count);
          inventory.items[d]={...incoming,bag_type:0,object_id:0,pos:r.end_pos};
        }else
        if(r.begin_bag_type===0&&r.end_bag_type===1&&storageDestination(this.state.player,{...item,bag_type:1})===34){
          const returned=inventory.consume(a,r.count);inventory.add({...returned,bag_type:1,object_id:0,pos:0},returned.count);
        }else inventory.move(r);
        this.persist();const moved=inventoryUpdates(before,this.state.items);
        if(!moved.some(i=>i.change_type===r.end_bag_type&&i.change_obj_id===r.end_obj_id&&i.change_pos===r.end_pos))moved.push({change_type:r.end_bag_type,change_obj_id:r.end_obj_id,change_pos:r.end_pos,...(this.state.items[d]?{item:this.state.items[d]}:{})});
        return[this.packet({opcode:115,message:{moved}})];
      });}catch(error){if(error instanceof InventoryError)return[this.notice(error.message)];throw error;}
    }
    if ((r.begin_bag_type===0 || r.end_bag_type===0) && forgeItem(item)) {
      try {
        return this.atomicMutation(()=>{
          if(this.saved.battle && !this.saved.battle.finished)throw new InventoryError("Aguarde o fim da batalha para usar a forja");
          const before=structuredClone(this.state.items),profile=this.store.tutorialProfile(this.userId)!;
          moveForgeItem(this.inventory(this.state),r,{heroId:Number(this.state.hero.hero_id),job:classForIcon(profile.icon),sex:profile.sex,level:Number(this.state.player.grades),capacity:storageCapacity(this.state.player,1,this.now())},this.saved.forgeOrigins??={});
          this.persist();
          const moved=inventoryUpdates(before,this.state.items);
          if(!moved.some(i=>i.change_type===r.end_bag_type&&i.change_obj_id===r.end_obj_id&&i.change_pos===r.end_pos))moved.push({change_type:r.end_bag_type,change_obj_id:r.end_obj_id,change_pos:r.end_pos,...(this.state.items[d]?{item:this.state.items[d]}:{})});
          return [this.packet({opcode:115,message:{moved}}),
            ...[113,150,3].map(opcode=>this.packet({opcode,message:{}},true))];
        });
      }catch(error){
        if(!(error instanceof InventoryError))throw error;
        return [this.packet({opcode:115,message:{moved:[
          {change_type:r.begin_bag_type,change_obj_id:r.begin_obj_id,change_pos:r.begin_pos,...(item?{item}:{})},
          {change_type:r.end_bag_type,change_obj_id:r.end_obj_id,change_pos:r.end_pos,...(occupied?{item:occupied}:{})}
        ]}}),this.notice(error.message)];
      }
    }
    if (r.begin_bag_type === 4 || r.end_bag_type === 4) {
      try {
        return this.atomicMutation(() => {
          if (this.saved.battle && !this.saved.battle.finished) throw new InventoryError("Aguarde o fim da batalha para trocar equipamentos");
          const before = structuredClone(this.state.items), profile = this.store.tutorialProfile(this.userId)!;
          moveEquipment(this.inventory(this.state, true), r, {
            heroId: Number(this.state.hero.hero_id), job: classForIcon(profile.icon), sex: profile.sex, level: Number(this.state.player.grades), capacity: storageCapacity(this.state.player, 1, this.now()),
          });
          this.persist(); // syncHero replaces the equipped sources in the central calculator.
          return [
            this.packet({ opcode: 115, message: { moved: inventoryUpdates(before, this.state.items) } }),
            ...[113, 150, 3].map(opcode => this.packet({ opcode, message: {} }, true)),
          ];
        });
      } catch (error) {
        if (!(error instanceof InventoryError)) throw error;
        return [this.packet({ opcode: 115, message: { moved: [
          { change_type: r.begin_bag_type, change_obj_id: r.begin_obj_id, change_pos: r.begin_pos, ...(item ? { item } : {}) },
          { change_type: r.end_bag_type, change_obj_id: r.end_obj_id, change_pos: r.end_pos, ...(occupied ? { item: occupied } : {}) },
        ].filter(s => Number.isInteger(s.change_pos) && s.change_pos >= 0) } }), this.notice(error.message)];
      }
    }
    if (
      item &&
      ((r.end_bag_type === 0 && !this.fashion.isFashion(item)) ||
        r.begin_bag_type === 4 ||
        r.end_bag_type === 4)
    ) {
      // Equipment attribute recalculation and forge outcomes are not reconstructed yet.
      // Keep the authoritative location and restore both client slots after optimistic movement.
      if (r.begin_bag_type === 0 && r.end_bag_type === 1) {
        /* allow an old stranded item to leave */
      } else {
        this.store.tutorialEvent("city-rejected", this.userId, {
          reason: "Movimento para forja/equipamento não implementado",
          request: r,
        });
        return [
          this.packet({
            opcode: 115,
            message: {
              moved: [
                {
                  change_type: r.begin_bag_type,
                  change_obj_id: r.begin_obj_id,
                  change_pos: r.begin_pos,
                  item,
                },
                {
                  change_type: r.end_bag_type,
                  change_obj_id: r.end_obj_id,
                  change_pos: r.end_pos,
                  ...(occupied ? { item: occupied } : {}),
                },
              ],
            },
          }),
          this.notice(
            "Encantamento e troca de equipamentos ainda não estão disponíveis. O item foi mantido no lugar de origem.",
          ),
        ];
      }
    }
    try {
      return this.atomicMutation(() => {
        if (
          ![0, 1, 34].includes(r.begin_bag_type) ||
          ![0, 1, 34].includes(r.end_bag_type) ||
          r.begin_obj_id !== 0 ||
          r.end_obj_id !== 0
        )
          throw new InventoryError("Bolsa de item inválida");
        const before = structuredClone(this.state.items);
        if ([1, 34].includes(r.begin_bag_type) && [1, 34].includes(r.end_bag_type))
          moveStorage(this.inventory(this.state, true), this.state.player, r, this.now());
        else this.inventory(this.state).move(r);
        this.persist();
        return [
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError) {
        this.logRejection(error.message);
        const slots = [
          [r.begin_bag_type, r.begin_obj_id, r.begin_pos],
          [r.end_bag_type, r.end_obj_id, r.end_pos],
        ];
        return [
          this.packet({
            opcode: 115,
            message: {
              moved: slots
                .filter((s) => Number.isInteger(s[2]) && s[2] >= 0)
                .map(([bag, owner, pos]) => ({
                  change_type: bag,
                  change_obj_id: owner,
                  change_pos: pos,
                  ...(this.state.items[`${bag}:${owner}:${pos}`]
                    ? { item: this.state.items[`${bag}:${owner}:${pos}`] }
                    : {}),
                })),
            },
          }),
          this.notice(error.message),
        ];
      }
      throw error;
    }
  }
  private sellItems(r: Message, batch: boolean): TutorialResponse[] {
    try {
      return this.atomicMutation(() => {
        const before = structuredClone(this.state.items);
        const inventory = this.inventory(this.state);
        const bag = batch ? 1 : (r.begin_bag_type ?? 1);
        const requests: Message[] = batch
          ? r.selledItemInfos
          : [{ pos: r.begin_pos }];
        if (
          !Array.isArray(requests) ||
          !requests.length ||
          requests.length > 100 ||
          (!batch &&
            (![1, 34].includes(bag) || (r.begin_obj_id ?? 0) !== 0))
        )
          throw new InventoryError("Pedido de venda inválido");
        const positions = new Set<number>();
        let total = 0;
        for (const request of requests) {
          if (
            !Number.isSafeInteger(request.pos) ||
            request.pos < 0 ||
            positions.has(request.pos)
          )
            throw new InventoryError("Posição de venda inválida ou repetida");
          positions.add(request.pos);
          const key = `${bag}:0:${request.pos}`,
            item = this.state.items[key];
          if (!item) throw new InventoryError("Item para venda não encontrado");
          if (item.is_locked) throw new InventoryError("Desbloqueie o item antes de vender");
          if (expired(item, this.now())) throw new InventoryError("Item com validade vencida");
          const count = batch ? request.count : item.count;
          if (!Number.isSafeInteger(count) || count < 1 || count > item.count)
            throw new InventoryError("Quantidade de venda inválida");
          total += sellPrice(item) * count;
          inventory.consume(key, count);
        }
        this.gold.change(
          this.state.economy,
          this.userId,
          total,
          "inventory-sale",
        );
        this.persist();
        this.store.tutorialEvent("inventory-sale", this.userId, {
          gold: total,
          items: requests.map((request) => ({
            template: before[`${bag}:0:${request.pos}`]!.template_id,
            id: before[`${bag}:0:${request.pos}`]!.id,
            count: batch ? request.count : before[`${bag}:0:${request.pos}`]!.count,
          })),
        });
        return [
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
          this.packet({ opcode: 109, message: {} }, true),
          ...this.acquisitionNotice([{ label: currencies.gold.label, amount: total }], "pela venda de itens"),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError || error instanceof GoldError) {
        this.logRejection(error.message);
        return [this.notice(error.message)];
      }
      throw error;
    }
  }
  private storageRequest(op: number, r: Message): TutorialResponse[] {
    try {
      return this.atomicMutation(() => {
        const before = structuredClone(this.state.items), result: TutorialResponse[] = [];
        const pay = (cost: number, option: number, reason: string) => {
          if (![0, 1].includes(option)) throw new InventoryError("Forma de pagamento inválida");
          const bound = option === 0 ? Math.min(cost, currencyBalance(this.state, "boundDiamonds")) : 0;
          this.currencyLedger.changeMany(this.state, this.userId, {
            ...(bound ? { boundDiamonds: -bound } : {}),
            ...(cost > bound ? { diamonds: -(cost - bound) } : {}),
          }, reason);
        };
        if (op === 8809) {
          lockStorage(this.state.items, r, this.storagePasswordConfirmed);
        } else if (op === 8220) {
          arrangeStorage(this.inventory(this.state), this.state.player, r, this.now());
        } else if (op === 5010) {
          const purchase = expansion(this.state.player, r.property1);
          pay(purchase.cost, r.pay_type, "inventory-expand");
          this.state.player.bag_count = purchase.extra;
          result.push(this.packet({ opcode: 3, message: {} }, true));
        } else if (op === 8819) {
          if (r.op_type !== 1 || permanentCapacity(this.state.player) !== 224)
            throw new InventoryError("Expanda a mochila permanente antes de alugar");
          const cost = storageRules.rentalCosts[r.param2];
          if (!cost) throw new InventoryError("Prazo de aluguel inválido");
          pay(cost, r.param1, "inventory-rent");
          this.state.player.rentalBagTime = serverDate(Math.max(this.now(), dateTime(this.state.player.rentalBagTime) || 0) + Number(r.param2) * 86400000);
          this.state.player.status = 2;
          result.push(this.packet({ opcode: 4709, message: {
            op_type: 1, rentalBagTime: this.state.player.rentalBagTime, status: 2,
            $4: { wire: 0, value: "0" },
          } }), this.packet({ opcode: 3, message: {} }, true));
        } else if (op === 9569) {
          if (stoneCapacity(this.state.player) > 0) throw new InventoryError("Bolsa de tesouros já liberada");
          pay(storageRules.treasureCost, r.pay_type, "inventory-stone-bag");
          this.state.player.$125 = { wire: 0, value: "245" };
          transferTreasures(this.inventory(this.state), this.state.player, this.now());
          this.saved.treasureRoutingVersion = 1;
          result.push(this.packet({ opcode: 3, message: {} }, true));
          // The client only listens for the event; this acknowledgement has no body.
          result.push({ frame: frame(276, this.userId, Buffer.alloc(0)).toString("base64"), delayMs: 0 });
        } else if (op === 8346) {
          if (![1, 34].includes(r.bag_type) || !Number.isSafeInteger(r.pos) || r.pos < 0)
            throw new InventoryError("Posição de mochila inválida");
          const key = `${r.bag_type}:0:${r.pos}`, item = this.state.items[key];
          if (!item) return [];
          if (!expired(item, this.now())) throw new InventoryError("Este item ainda não expirou");
          delete this.state.items[key];
        }
        this.persist();
        const moved = inventoryUpdates(before, this.state.items);
        if (moved.length) result.unshift(this.packet({ opcode: 115, message: { moved } }));
        return result;
      });
    } catch (error) {
      if (error instanceof InventoryError || error instanceof CurrencyError || error instanceof GoldError) {
        this.logRejection(error.message);
        // A snapshot alone cannot remove phantom client slots after an optimistic
        // permutation. Include empty destinations as tombstones as well.
        const slots = new Set(Object.keys(this.state.items));
        if (op === 8220 && [1, 34].includes(r.bagType))
          for (const entry of (Array.isArray(r.arrangeInfo) ? r.arrangeInfo.slice(0, 600) : []))
            for (const pos of [entry.oldplace, entry.newplace])
              if (Number.isSafeInteger(pos) && pos >= 0 && pos < (r.bagType === 1 ? 322 : 280)) slots.add(`${r.bagType}:0:${pos}`);
        const moved = [...slots].map(key => {
          const [bag, owner, pos] = key.split(":").map(Number);
          return { change_type: bag, change_obj_id: owner, change_pos: pos,
            ...(this.state.items[key] ? { item: this.state.items[key] } : {}) };
        });
        return [this.packet({ opcode: 115, message: { moved } }), this.notice(error.message)];
      }
      throw error;
    }
  }
  private storagePassword(r: Message): TutorialResponse[] {
    const previous = this.storagePasswordConfirmed;
    try {
      return this.atomicMutation(() => {
        if (r.op_type === 1) {
          if (!checkProtection(this.saved.storageProtection, r.input_pass)) {
            this.storagePasswordConfirmed = false;
            throw new InventoryError("Senha secundária incorreta");
          }
        } else if (r.op_type === 2) {
          if (this.saved.storageProtection) throw new InventoryError("Senha secundária já cadastrada");
          if (r.input_pass !== r.new_pass) throw new InventoryError("As senhas secundárias não coincidem");
          this.saved.storageProtection = createProtection(r.new_pass);
        } else if (r.op_type === 3) {
          if (!checkProtection(this.saved.storageProtection, r.pre_pass)) throw new InventoryError("Senha secundária incorreta");
          this.saved.storageProtection = createProtection(r.new_pass);
        } else if ([5, 6].includes(r.op_type)) {
          return [this.packet({ opcode: 4696, message: { op_type: r.op_type, result: 0 } })];
        } else throw new InventoryError("Recuperação de senha secundária ainda não reconstruída; a proteção foi mantida");
        this.storagePasswordConfirmed = true;
        this.state.player.hasVicePassword = 1;
        this.persist();
        return [this.packet({ opcode: 4696, message: { op_type: r.op_type, result: 1 } }), this.packet({ opcode: 3, message: {} }, true)];
      });
    } catch (error) {
      this.storagePasswordConfirmed = r.op_type === 1 ? false : previous;
      if (error instanceof InventoryError) return [this.packet({ opcode: 4696, message: { op_type: r.op_type, result: 0 } }), this.notice(error.message)];
      throw error;
    }
  }
  private query(
    op: number,
    r: Message | undefined,
    packet: Buffer,
  ): TutorialResponse[] {
    if (op === 5015) return [this.packet({ opcode: 109, message: {} }, true)];
    if (op === 9536) {
      const operation = Number(r?.op ?? r?.$1?.value ?? 1);
      if (operation !== 1)
        return [this.notice("Compra de tentativas heroicas ainda não disponível.")];
      return [this.packet({ opcode: 4948, message: {} }, true)];
    }
    if (op === 5019) return [this.packet({ opcode: 4, message: {} }, true)];
    if (op === 8625) return [this.packet({ opcode: 4542, message: {} }, true)];
    if (op === 8297)
      return [
        this.packet(
          {
            opcode: 4205,
            message: { campaign_id: r?.index === 1 ? 8101 : 8001 },
          },
          true,
        ),
      ];
    if (op === 15044 && r?.op_type === 0) {
      const f = this.state.farms[r.friend_id];
      return f
        ? [this.packet({ opcode: 4386, message: f })]
        : this.rejection("Esta fazenda não está disponível no servidor local.");
    }
    const c =
      this.scenario.queries.find((c) => this.sameRequest(c, op, r, packet)) ??
      this.scenario.queries.find((c) => c.opcode === op);
    return c
      ? c.responses
          .filter(
            (p) =>
              ![
                83, 84, 111, 153, 154, 156, 157, 75, 125, 21, 22, 4165, 140, 4592, 4593, 4594, 4595, 4597, 4606, 4607,
              ].includes(p.opcode) &&
              !(this.labyrinth.active && [127, 128, 130, 131].includes(p.opcode)),
          )
          .map((p, i) => this.packet({ ...p, delayMs: 20 + i * 2 }, true))
      : [];
  }
  private prepare(delayMs = 0): TutorialResponse {
    migrateAdventure(this.saved.battle!, this.scenario.battles[this.saved.battle!.reference]!, this.state, AttributeCalculator.combat(this.saved.attributes!));
    const b = this.saved.battle!;
    if(b.engine)syncBattlePressure(b.engine,b.prepare);
    const p = structuredClone(b.prepare);
    const actor = b.engine?.actors.find(a => a.id === b.hero);
    if (actor && actor.permanentModifiers === undefined) actor.permanentModifiers = AttributeCalculator.combat(this.saved.attributes!);
    if (actor) { actor.equippedSkills ??= equippedBattleSkills(actor.learned,this.state.hero.fast_key); p.attack_model=actor.autoBattle?1:2; }
    for (const h of [...(p.heros ?? []), ...(p.soldiers ?? [])]) {
      const f = b.fighters.find((f) => f.living_id === h.living_id)!;
      h.hp = h.init_hp = f.hp;
      if (h.living_id === b.hero) {
        h.sp = b.sp;
        applyBattleEquipmentAppearance(h, this.state.army);
      }
      // Hero buffers are instances of this battle, never the captured account's effects.
      if ((p.heros ?? []).includes(h)) h.buffers = f.buffers ?? [];
    }
    p.coolDown = (p.coolDown ?? []).map((v: Message) => ({
      ...v,
      cool_down: Math.max(0, (b.cooldowns[v.templated_id] ?? 0) - this.now()),
    }));
    return this.packet({ opcode: 157, message: p, delayMs });
  }
  private furyInstance(): string | undefined {
    if (this.labyrinth.active) return `labyrinth:${this.labyrinth.mode}:${this.labyrinth.progress().runId}`;
    if (campaignByMap.has(this.saved.map)) return `campaign:${this.ensureCampaignRun().id}`;
    return undefined;
  }
  startBattle(index: number): TutorialResponse[] {
    if (this.saved.battle && !this.saved.battle.finished)
      return [this.prepare()];
    if (
      (isCampaignBattle(index) ? this.campaignWins() : this.saved.won).includes(
        index,
      )
    )
      return this.rejection("Encontro já concluído");
    if (index === 1 && !this.campaignWins().includes(0))
      return this.rejection("Conclua a primeira batalha da campanha");
    if (isCampaignBattle(index) && index >= 3) {
      const expected = this.currentCampaignIndices().find(
        (i) => !this.campaignWins().includes(i),
      );
      if (expected !== index)
        return this.rejection("Encontro fora da etapa atual da campanha");
    }
    this.syncHero();
    const instance = this.furyInstance();
    this.saved.battle = createAdventure(
      this.scenario.battles[index]!,
      index,
      this.state,
      startingFury(this.fashion.initialRage(), instance, this.saved.instanceFury),
      AttributeCalculator.combat(this.saved.attributes!),
    );
    this.persist();
    return [
      ...(this.labyrinth.isBattle(index)
        ? [this.packet(this.labyrinth.battleStarted())]
        : []),
      this.prepare(100),
    ];
  }
  private campaignCompletion(): CityCase | undefined {
    return this.scenario.cases.find(
      (c) =>
        c.opcode === 5038 &&
        c.request?.para_int1 === 1021 &&
        c.responses.some((p) => p.opcode === 135),
    );
  }
  private campaignWins(): number[] {
    return this.saved.campaignRun?.won ?? this.saved.won;
  }
  private clearedCampaigns(): number[] {
    return [
      ...new Set([
        ...(this.saved.completedCampaigns ?? []),
        ...(this.saved.won.includes(0) && this.saved.won.includes(1)
          ? [1001]
          : []),
      ]),
    ];
  }
  private currentCampaignIndices(): number[] {
    return campaignBattleIndices(this.saved.campaignRun?.campaignId ?? 1001);
  }
  private importedCampaign(): CampaignDefinition | undefined {
    const definition = campaignDefinitions.get(
      this.saved.campaignRun?.campaignId ?? 1001,
    );
    return definition?.legacy ? undefined : definition;
  }
  private ensureCampaignRun(): NonNullable<CitySave["campaignRun"]> {
    return (this.saved.campaignRun ??= {
      id: randomUUID(),
      paid: Boolean(this.saved.campaignEntered && this.saved.map === 1021),
      campaignId: 1001,
      won: this.saved.won.filter((i) => i < 2),
      completed: false,
    });
  }
  private finishCampaign(): TutorialResponse[] {
    return this.finishCampaignRun();
  }
  private campaignProgress(delayMs = 0): TutorialResponse {
    const definition = campaignDefinitions.get(
      this.saved.campaignRun?.campaignId ?? 1001,
    )!;
    const nodes =
      definition.nodeIndices ?? definition.stages!.map((s) => s.nodeIndex);
    const indices = this.currentCampaignIndices();
    const next = indices.findIndex((i) => !this.campaignWins().includes(i));
    // SingleCampaignNpcNode compares curIndex with the table's Index (not ordinal).
    return this.packet({
      opcode: 4282,
      body: protoInt(1, next < 0 ? 5 : nodes[next]!).toString("base64"),
      delayMs,
    });
  }
  private campaignResultPackets(delayMs = 0): TutorialResponse[] {
    const definition = campaignDefinitions.get(
      this.saved.campaignRun?.campaignId ?? 1001,
    )!;
    const completion = definition.legacy
      ? this.campaignCompletion()!.responses
      : definition.completion!;
    const report = structuredClone(completion.find((p) => p.opcode === 137)!);
    report.message ??= decodeMessage(
      this.scenario.incoming[137]!,
      Buffer.from(report.body!, "base64"),
    );
    report.message.total_appraisal = campaignRank(definition.id);
    if (this.saved.campaignRun?.rewarded === false) {
      for (const key of [
        "total_gp",
        "pet_gp",
        "vipJoin",
        "propJoin",
        "otherJoin",
      ])
        report.message[key] = 0;
      return [
        this.campaignProgress(delayMs),
        this.packet({ ...report, delayMs: delayMs + 100 }),
        this.packet(
          { opcode: 4151, message: {}, delayMs: delayMs + 110 },
          true,
        ),
        this.packet({ opcode: 134, body: "", delayMs: delayMs + 9000 }),
      ];
    }
    const cards = completion.find((p) => p.opcode === 135)!;
    // Resultmc has 125 frames; SimpleMovie finishes on the following frame.
    // At the clearance asset's 24 FPS that takes 5250 ms. Keep 250 ms of
    // margin, without inheriting network/player delays from online captures.
    const gap = 5500;
    const result = [
      this.campaignProgress(delayMs),
      this.packet({ ...report, delayMs: delayMs + 100 }),
      this.packet({ opcode: 4151, message: {}, delayMs: delayMs + 110 }, true),
      this.packet({ ...cards, delayMs: delayMs + 100 + gap }),
    ];
    const receipt = this.saved.campaignRun?.cards?.reward;
    if (receipt)
      result.push(
        this.packet({
          opcode: 26,
          message: receipt,
          delayMs: delayMs + gap + 400,
        }),
      );
    return result;
  }
  private grantCampaignItem(model: Message, count: number): void {
    this.inventory(this.state).add(
      {
        ...model,
        bag_type: 1,
        object_id: 0,
        user_id: this.scenario.userId,
        pos: 0,
      },
      count,
    );
  }
  private awardSweep(definition: CampaignDefinition, key: string): Message {
    const legacy = definition.legacy ? this.scenario.battles.slice(0, 2) : [];
    const xp = definition.legacy
      ? experienceReward(this.campaignCompletion()!.patches) +
        legacy.reduce((n, b) => n + experienceReward(b.rewardPatches ?? []), 0)
      : Number(definition.completionXp ?? 0) +
        (definition.stages ?? []).reduce((n, s) => n + s.xp, 0);
    const spirit = definition.legacy
      ? legacy
          .flatMap((b) => b.rewardPatches ?? [])
          .filter((p) => p.path.join(".") === "player.strategy")
          .reduce((n, p) => n + Number(p.after) - Number(p.before), 0)
      : (definition.stages ?? []).reduce((n, s) => n + s.spirit, 0);
    const card = campaignCardDeck(definition.cardPool, 1)[0]!;
    const items: { model: Message; count: number }[] = [
      {
        model: {
          template_id: card.templateId,
          bind: card.bind,
          used: 0,
          strengthen_grade: 0,
          join_1: -1,
          join_2: -1,
          join_3: -1,
          join_4: -1,
        },
        count: card.count,
      },
    ];
    if (definition.observedDrops?.potion)
      items.push({ model: definition.observedDrops.potion, count: 5 });
    for (const stage of definition.stages ?? [])
      items.push(...(stage.drops ?? []));
    for (const patch of legacy.flatMap((b) => b.rewardPatches ?? []))
      if (
        patch.path[0] === "items" &&
        patch.after?.template_id &&
        !patch.before
      )
        items.push({ model: patch.after, count: patch.after.count });
    const before = structuredClone(this.state.items),
      ids = structuredClone(this.saved.inventory);
    let mailIn = 0;
    try {
      for (const item of items) this.grantCampaignItem(item.model, item.count);
    } catch (error) {
      if (!(error instanceof InventoryError)) throw error;
      // Deliver the complete reward instead of leaving a partial inventory credit.
      this.state.items = before;
      this.saved.inventory = ids;
      this.store.sendLocalItemsOnce(
        this.userId,
        key,
        "Recompensa do bot",
        items.map((i) => ({ template: i.model.template_id, count: i.count })),
        "A mochila estava cheia. Aqui está a recompensa desta tentativa do bot.",
      );
      mailIn = 1;
    }
    if (xp) grantExperience(this.state.player, xp);
    if (spirit)
      this.currencyLedger.change(
        this.state,
        this.userId,
        "spirit",
        spirit,
        "campaign:bot:reward",
        key,
      );
    return {
      gp: xp,
      gold: 0,
      items: items.map((i) => ({
        template_id: i.model.template_id,
        count: i.count,
      })),
      mailIn,
    };
  }
  private buyEnergyPotion(r: Message): TutorialResponse[] | undefined {
    const b = r.buyInfo,
      offer = campaignRules.energyShop.find(
        (o) => Number(o.Id) === Number(b?.good_id),
      );
    if (!offer) return;
    try {
      return this.atomicMutation(() => {
        const count = Number(b.count);
        if (
          !Number.isSafeInteger(count) ||
          count < 1 ||
          count > 9999 ||
          (b.receive_id &&
            ![this.userId, this.scenario.userId].includes(Number(b.receive_id)))
        )
          throw new InventoryError("Compra de poção inválida");
        // The recovered offers allow either bound or ordinary diamonds at 25 each.
        const currency = r.pay_type === 1 ? "diamonds" : "boundDiamonds";
        const price = Number(offer.GiftToken || offer.Point);
        const before = structuredClone(this.state.items);
        this.currencyLedger.change(
          this.state,
          this.userId,
          currency,
          -price * count,
          "shop:energy-potion",
        );
        this.grantCampaignItem(
          {
            template_id: Number(offer.ItemId),
            bind: 1,
            used: 0,
            strengthen_grade: 0,
            join_1: -1,
            join_2: -1,
            join_3: -1,
            join_4: -1,
          },
          count,
        );
        this.persist();
        return [
          this.packet({
            opcode: 90,
            message: { buyInfo: { ...b, result: 1 } },
          }),
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
          ...this.login(),
        ];
      });
    } catch (error) {
      if (
        error instanceof InventoryError ||
        error instanceof CurrencyError ||
        error instanceof GoldError
      )
        return [this.notice(error.message)];
      throw error;
    }
  }
  private buyEnergyCart(r: Message): TutorialResponse[] | undefined {
    const entries = r.carItemInfo;
    if (
      !Array.isArray(entries) ||
      !entries.some((e) =>
        campaignRules.energyShop.some((o) => Number(o.Id) === Number(e.shopId)),
      )
    )
      return;
    try {
      return this.atomicMutation(() => {
        if (
          entries.length > 20 ||
          (r.receiveUserId &&
            r.receiveUserId !== this.userId &&
            r.receiveUserId !== this.scenario.userId)
        )
          throw new InventoryError("Carrinho inválido");
        const before = structuredClone(this.state.items);
        for (const entry of entries) {
          const offer = campaignRules.energyShop.find(
              (o) => Number(o.Id) === Number(entry.shopId),
            ),
            count = Number(entry.counts);
          if (
            !offer ||
            !Number.isSafeInteger(count) ||
            count < 1 ||
            count > 9999 ||
            ![1, 2].includes(entry.payType)
          )
            throw new InventoryError(
              "O carrinho deve conter apenas poções de energia válidas",
            );
          const price = Number(offer.GiftToken || offer.Point) * count;
          const bound =
            entry.payType === 2
              ? Math.min(price, this.state.player.gift_token)
              : 0;
          this.currencyLedger.changeMany(
            this.state,
            this.userId,
            { boundDiamonds: -bound, diamonds: -(price - bound) },
            "shop:energy-potion",
          );
          this.grantCampaignItem(
            {
              template_id: Number(offer.ItemId),
              bind: 1,
              used: 0,
              strengthen_grade: 0,
              join_1: -1,
              join_2: -1,
              join_3: -1,
              join_4: -1,
            },
            count,
          );
        }
        this.persist();
        return [
          this.packet({ opcode: 4783, message: { ...r, result: 1 } }),
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
          ...this.login(),
        ];
      });
    } catch (error) {
      if (
        error instanceof InventoryError ||
        error instanceof CurrencyError ||
        error instanceof GoldError
      )
        return [
          this.notice(error.message),
          this.packet({ opcode: 4783, message: { ...r, result: 2 } }),
        ];
      throw error;
    }
  }
  private finishCampaignRun(): TutorialResponse[] {
    const definition = campaignDefinitions.get(
      this.saved.campaignRun?.campaignId ?? 1001,
    );
    if (
      !definition ||
      this.saved.campaignRun?.completed ||
      this.currentCampaignIndices().some(
        (i) => !this.campaignWins().includes(i),
      )
    )
      return [];
    if (
      definition.legacy &&
      !this.saved.campaignRun &&
      this.saved.used.includes(
        this.scenario.cases.indexOf(this.campaignCompletion()!),
      )
    )
      return [];
    const run = this.saved.campaignRun ?? this.ensureCampaignRun();
    try {
      return this.atomicMutation(() => {
        const xp = definition.legacy
          ? experienceReward(this.campaignCompletion()!.patches)
          : definition.completionXp;
        if (xp && run.rewarded !== false)
          grantExperience(this.state.player, xp);
        const index = definition.legacy
          ? this.scenario.cases.indexOf(this.campaignCompletion()!)
          : -1;
        if (index >= 0 && !this.saved.used.includes(index))
          this.saved.used.push(index);
        if (run.rewarded !== false)
          run.cards = { deck: campaignCardDeck(definition.cardPool, 5) };
        if (!(this.saved.completedCampaigns ??= []).includes(definition.id))
          this.saved.completedCampaigns.push(definition.id);
        run.completed = true;
        grantChapterRewards(this.store, this.userId, this.clearedCampaigns());
        // Result UI is reconstructed on reconnect; no captured card receipt is replayed.
        this.saved.location = (this.saved.location ?? []).filter(
          (p) => ![137, 135, 26].includes(p.opcode),
        );
        this.syncHero();
        this.updateObjectives();
        this.syncAutoQuests();
        const resultPackets = this.campaignResultPackets();
        if (run.rewarded === false) {
          this.saved.map = 1;
          delete this.saved.location;
        }
        this.persist();
        return [
          ...resultPackets,
          ...(xp && run.rewarded !== false ? [this.rewardChat(
            systemMessageText.campaignCompletionXp(xp), 120)] : []),
          this.packet({ opcode: 112, message: {} }, true),
          ...this.login(),
        ];
      });
    } catch (error) {
      if (
        error instanceof InventoryError ||
        error instanceof CurrencyError ||
        error instanceof ExperienceError
      )
        return [this.notice(error.message)];
      throw error;
    }
  }
  private chooseCampaignCard(r: Message | undefined): TutorialResponse[] {
    const run = this.saved.campaignRun,
      cards = run?.cards;
    if (
      !campaignByMap.has(this.saved.map) ||
      !run?.completed ||
      !cards ||
      r?.para_int1 !== this.scenario.userId
    )
      return this.rejection("Cartas de campanha indisponíveis");
    const index = r.para_int2;
    if (!Number.isInteger(index) || index < 0 || index >= cards.deck.length)
      return this.rejection("Carta inválida");
    if (cards.selected !== undefined)
      return index === cards.selected
        ? [this.packet({ opcode: 26, message: cards.reward })]
        : this.rejection("Recompensa desta campanha já escolhida");
    try {
      return this.atomicMutation(() => {
        const before = structuredClone(this.state.items),
          drop = cards.deck[index]!;
        this.grantCampaignItem(
          {
            template_id: drop.templateId,
            bind: drop.bind,
            used: 0,
            strengthen_grade: 0,
            join_1: -1,
            join_2: -1,
            join_3: -1,
            join_4: -1,
          },
          drop.count,
        );
        cards.selected = index;
        cards.reward = {
          player_id: this.scenario.userId,
          name: this.scenario.nickname,
          pay: 0,
          index,
          template_id: drop.templateId,
          count: drop.count,
          bind: drop.bind,
          random_skill_1: 0,
          random_skill_2: 0,
          random_skill_3: 0,
          random_skill_4: 0,
          random_skill_5: 0,
        };
        this.persist();
        return [
          this.packet({
            opcode: 115,
            message: { moved: inventoryUpdates(before, this.state.items) },
          }),
          this.packet({ opcode: 26, message: cards.reward, delayMs: 10 }),
          this.rewardChat(systemMessageText.campaignCardItem(itemTemplate(drop.templateId)?.TemplateName ?? `Item ${drop.templateId}`, drop.count), 20),
        ];
      });
    } catch (error) {
      if (error instanceof InventoryError) return [this.notice(error.message)];
      throw error;
    }
  }
  private loadImportedCampaign(): TutorialResponse[] {
    const definition = this.importedCampaign()!,
      run = this.saved.campaignRun!;
    if (this.currentCampaignIndices().every((i) => run.won.includes(i)))
      return run.completed
        ? this.campaignResultPackets()
        : this.finishCampaign();
    try {
      return this.atomicMutation(() => {
        if (!run.paid && run.rewarded !== false) {
          if (definition.definition.DifficultyGrade === "2")
            reserveHeroEntries(this.saved, 1, this.now());
          this.currencyLedger.change(
            this.state,
            this.userId,
            "energy",
            -20,
            `campaign:${definition.id}:entry`,
            `campaign:${run.id}:entry`,
          );
          run.paid = true;
        }
        if (run.rewarded === false) run.paid = true;
        this.saved.map = definition.map;
        const completed = this.currentCampaignIndices().filter((i) =>
          run.won.includes(i),
        ).length;
        const movies = (definition.stages ?? [])
          .slice(0, completed)
          .flatMap((s) => (s.movie ? [s.movie] : []));
        this.saved.location = [...(definition.load ?? []), ...movies];
        this.persist();
        // Reconnect needs RoomEnter; a callback in the same scene must not recreate it.
        const alreadyLoaded = this.loadedCampaign === definition.map;
        this.loadedCampaign = definition.map;
        const replies =
          completed && alreadyLoaded
            ? [
                ...(definition.load ?? []).filter((p) => p.opcode === 20),
                ...movies.slice(-1),
              ]
            : [...(definition.load ?? []), ...movies.slice(-1)];
        return [
          ...replies.map((p, i) =>
            this.packet({ ...p, delayMs: 10 + i * 10 }, true),
          ),
          this.campaignProgress(50),
          ...this.login(),
        ];
      });
    } catch (error) {
      if (error instanceof CurrencyError) return [this.notice(error.message)];
      throw error;
    }
  }
  private leaveCampaign(): TutorialResponse[] {
    return this.atomicMutation(() => {
      const result = campaignByMap.has(this.saved.map)
        ? this.finishCampaign()
        : [];
      if (
        campaignByMap.has(this.saved.map) &&
        this.saved.battle?.reference !== undefined &&
        isCampaignBattle(this.saved.battle.reference) &&
        this.saved.battle &&
        !this.saved.battle.finished
      ) {
        delete this.saved.battle;
        this.state.army.state = 0;
      }
      if (
        this.labyrinth.active &&
        this.labyrinth.isBattle(this.saved.battle?.reference ?? -1) &&
        this.saved.battle &&
        !this.saved.battle.finished
      ) {
        delete this.saved.battle;
        this.state.army.state = 0;
      }
      delete this.saved.instanceFury;
      this.saved.map = 1;
      delete this.saved.location;
      this.persist();
      return result;
    });
  }
  private navigation(
    op: number,
    r: Message | undefined,
    packet: Buffer,
  ): TutorialResponse[] | undefined {
    // 5035 is sent automatically when entering/returning to a campaign scene.
    // Its captured reply is the untouched floor 1 snapshot, not a generic ACK.
    // Maze entry/victory already delivered the authoritative scene for this map.
    if (op === 5035 && this.labyrinth.active) {
      if (r?.state === 4 && this.labyrinth.floorCleared)
        return this.labyrinth.refresh().map(p => this.packet(p));
      return [];
    }
    if (op === 5035 && campaignByMap.has(this.saved.map))
      return r?.state === 4 ? [this.campaignProgress(), ...this.login()] : [];
    if (
      op === 8666 &&
      campaignByMap.has(this.saved.map) &&
      !this.saved.campaignRun?.paid
    )
      return this.rejection("Carregue a campanha antes de iniciar o encontro");
    if (op === 8666 && this.importedCampaign()?.map === this.saved.map) {
      const index = this.currentCampaignIndices().find(
        (i) => !this.campaignWins().includes(i),
      );
      return index === undefined
        ? this.finishCampaign()
        : this.startBattle(index);
    }
    if (op === 8666 && this.saved.map === 1021)
      return this.campaignWins().includes(0) && this.campaignWins().includes(1)
        ? this.finishCampaign()
        : this.startBattle(this.campaignWins().includes(0) ? 1 : 0);
    if (op === 5125 && this.labyrinth.active) {
      try {
        this.labyrinth.assertAccess();
      } catch (error) {
        if (error instanceof LabyrinthError) return [this.notice(error.message)];
        throw error;
      }
      const node = Number(
        fields(packet.subarray(20)).find((f) => f.number === 1)?.value,
      );
      if (node === this.labyrinth.map * 100 + 2) {
        if (this.labyrinth.floorCleared)
          return [
            ...this.labyrinth.refresh().map(p => this.packet(p)),
            this.notice(
              "Monstro já derrotado. Use o portal para o próximo piso.",
            ),
          ];
        // A duplicate arrival must not enqueue another 157 behind the first.
        if (this.saved.battle && !this.saved.battle.finished &&
            this.saved.battle.reference === this.labyrinth.battleIndex()) return [];
        return this.startBattle(this.labyrinth.battleIndex());
      }
      if (node === this.labyrinth.map * 100 + 3) {
        try {
          return this.atomicMutation(() => {
            const before = structuredClone(this.state.items);
            const drops = this.labyrinth.chestDrops(node);
            this.depositLabyrinthDrops(drops);
            const collected = this.labyrinth.collectChest();
            const lootText = systemMessageText.collectedItems(drops
              .slice().sort((a, b) => Number(a.templateId === 208009) - Number(b.templateId === 208009))
              .map(drop => ({ name: itemTemplate(drop.templateId)!.TemplateName!, count: drop.count })));
            const packets = [
              collected[0]!,
              { opcode: 4725, message: {} },
              {
                opcode: 115,
                message: { moved: inventoryUpdates(before, this.state.items) },
              },
              ...presentSystemMessage(this.messages, "chest-reward", lootText).packets,
              ...collected.slice(1),
            ];
            this.persist();
            return packets.map((p) =>
              this.packet(p, [4205, 4373, 4725].includes(p.opcode)),
            );
          });
        } catch (error) {
          if (error instanceof LabyrinthError)
            return this.labyrinthRequirement(error.message);
          if (
            error instanceof LabyrinthError ||
            error instanceof InventoryError ||
            error instanceof CurrencyError
          )
            return [this.notice(error.message)];
          throw error;
        }
      }
      if (node === this.labyrinth.map * 100 + 4) {
        try {
          return this.atomicMutation(() => {
          const packets = this.labyrinth.usePortal();
          if (!packets)
            return this.labyrinthRequirement("Derrote o monstro antes de usar o portal.");
          if (
            this.labyrinth.finalFloor &&
            this.labyrinth.progress().completed
          ) {
            delete this.saved.battle;
            return [
              this.packet(this.labyrinth.list(), true),
              ...this.navigation(5025, { msg: "" }, packet)!,
              this.packet({ ...this.labyrinth.completion(), delayMs: 100 }),
            ];
          }
          this.updateObjectives();
          this.persist();
          return [
            ...packets.map((p, i) =>
              this.packet(
                { ...p, delayMs: p.delayMs ?? i * 5 },
                [21, 131, 4205].includes(p.opcode),
              ),
            ),
            this.packet({ opcode: 112, message: {} }, true),
          ];
          });
        } catch (error) {
          if (error instanceof LabyrinthError)
            return this.labyrinthRequirement(error.message);
          throw error;
        }
      }
      return [
        this.notice("Encontro fora do conteúdo de labirinto recuperado."),
      ];
    }
    if (op === 8299) {
      try {
        return this.atomicMutation(() => {
          if (![0, 1].includes(r?.index)) throw new LabyrinthError("Modalidade de redefinição inválida.");
          const packets = this.labyrinth.reset(r!.index === 1 ? 8101 : 8001);
          this.persist();
          return packets.map(p => this.packet(p));
        });
      } catch (error) {
        if (error instanceof LabyrinthError) return [this.notice(error.message)];
        throw error;
      }
    }
    if (op === 8296) {
      if (this.labyrinthBot.active) return [this.notice("Encerre o bot antes de entrar no labirinto.")];
      if (![8001, 8101].includes(r?.campaign_id))
        return [this.notice("Labirinto fora da referência.")];
      try {
        return this.atomicMutation(() => {
          if (
            ![0, 1].includes(r!.choose_index) ||
            ![1, 2].includes(r!.is_double)
          )
            throw new LabyrinthError("Modalidade de entrada inválida.");
          this.labyrinth.selectMode(r!.campaign_id);
          const renewed = this.labyrinth.renewDailyRun();
          const progress = this.labyrinth.progress();
          if (r!.choose_index === 0 && !progress.entered && !renewed)
            throw new LabyrinthError("Inicie o percurso antes de continuar.");
          const before = structuredClone(this.state.items);
          if (!progress.entered && r!.is_double === 2)
            this.inventory(this.state).consumeTemplate(
              208008,
              this.labyrinth.mode === 8001 ? 1 : 3,
            );
          this.labyrinth.begin(r!.is_double);
          const packets = this.labyrinth.enter();
          this.updateObjectives();
          this.persist();
          return [
            this.packet({
              opcode: 115,
              message: { moved: inventoryUpdates(before, this.state.items) },
            }),
            ...packets.map((p, i) =>
              this.packet(
                { ...p, delayMs: p.delayMs ?? i * 5 },
                [21, 131, 4205].includes(p.opcode),
              ),
            ),
          ];
        });
      } catch (error) {
        if (error instanceof LabyrinthError || error instanceof InventoryError)
          return [this.notice(error.message)];
        throw error;
      }
    }
    if (op === 5038) {
      const map = r?.para_int1;
      if (this.importedCampaign()?.map === map)
        return this.loadImportedCampaign();
      if (map === 1021) {
        const completed =
          this.campaignWins().includes(0) && this.campaignWins().includes(1);
        if (completed) {
          this.saved.map = 1021;
          const result = this.finishCampaign();
          this.persist();
          return result.length
            ? result
            : [this.packet({ opcode: 112, message: {} }, true)];
        }
        // After the first fight the original client expects the campaign movie/state
        // update, not a fresh RoomEnter snapshot of the untouched map.
        const intermediate = this.campaignWins().includes(0)
          ? this.scenario.cases.find(
              (c) =>
                c.opcode === 5038 &&
                c.request?.para_int1 === 1021 &&
                c.responses.some((p) => p.opcode === 4382) &&
                !c.responses.some((p) => p.opcode === 135),
            )
          : undefined;
        if (intermediate) {
          this.saved.map = 1021;
          this.saved.location = [
            ...(this.saved.location ?? []).filter((p) => p.opcode !== 4382),
            ...intermediate.responses.filter((p) => p.opcode === 4382),
          ];
          this.persist();
          return intermediate.responses
            .map((p, i) => this.packet({ ...p, delayMs: i * 5 }, true))
            .concat(this.campaignProgress(50));
        }
        const c = this.scenario.queries.find(
          (c) =>
            c.opcode === 5038 &&
            c.request?.para_int1 === 1021 &&
            c.responses.some((p) => p.opcode === 21),
        );
        if (!c) return [this.notice("Campanha indisponível.")];
        try {
          this.atomicMutation(() => {
            const run = this.ensureCampaignRun();
            if (!run.paid && run.rewarded !== false) {
              this.currencyLedger.change(
                this.state,
                this.userId,
                "energy",
                -20,
                "campaign:1001:entry",
                `campaign:${run.id}:entry`,
              );
              run.paid = true;
            }
            if (run.rewarded === false) run.paid = true;
            this.saved.campaignEntered = true;
            this.saved.map = 1021;
            this.saved.location = c.responses.filter((p) =>
              [21, 125, 127, 130, 131, 20, 4165].includes(p.opcode),
            );
            this.persist();
          });
        } catch (error) {
          if (error instanceof CurrencyError)
            return [this.notice(error.message)];
          throw error;
        }
        return c.responses
          .filter((p) => ![83, 84, 157, 153, 154, 75].includes(p.opcode))
          .map((p, i) =>
            this.packet(
              { ...p, delayMs: i * 5 },
              [3, 109, 113, 150].includes(p.opcode),
            ),
          )
          .concat(this.campaignProgress(50));
      }
      if (isLabyrinthMap(map)) {
        if (
          !this.labyrinth.active ||
          !this.labyrinth.progress().entered ||
          map !== this.labyrinth.map
        )
          return [
            this.notice(
              "O próximo piso só pode ser acessado pelo portal liberado.",
            ),
          ];
        return this.atomicMutation(() => {
          const packets = this.labyrinth.load();
          this.persist();
          return packets.map((p, i) =>
            this.packet(
              { ...p, delayMs: i * 5 },
              [21, 131, 4205].includes(p.opcode),
            ),
          );
        });
      }
    }
    if (op === 5025) {
      if (
        this.saved.campaignRun?.completed &&
        this.saved.campaignRun.cards?.selected === undefined &&
        this.saved.campaignRun.cards &&
        campaignByMap.has(this.saved.map)
      )
        return [this.notice("Escolha a carta de recompensa antes de sair.")];
      const completion = this.leaveCampaign();
      const c = this.scenario.queries.find((c) => c.opcode === 5025);
      return [
        ...completion,
        ...(c
          ? c.responses.filter(p => ![4592, 4593, 4594, 4595, 4597, 4606, 4607].includes(p.opcode)).map((p, i) =>
              this.packet(
                { ...p, delayMs: i * 5 },
                [3, 109, 113, 150].includes(p.opcode),
              ),
            )
          : []),
      ];
    }
    return undefined;
  }
  private exitWedding():TutorialResponse[]{
    this.marriage.wedding.leave();
    // The wedding guide returns to the sky and then walks to carriage node 21.
    // Returning only the castle models loses that destination on the client.
    const realm=this.sky.enter();
    return [...[3,109,113,150].map(opcode=>this.packet({opcode,message:{}},true)),this.packet(nativePacket(15,"room.RoomExitRspMsg",{player_id:this.userId,exit_type:0,param1:0})),...realm.map(p=>skyWire({...p,delayMs:50+(p.delayMs??0)},this.userId))];
  }
  private handleSettlement(
    op: number,
    r: Message | undefined,
  ): TutorialResponse[] | undefined {
    if (op === 8970 && r) {
      const potion = this.buyEnergyCart(r);
      if (potion) return potion;
    }
    if (op === 5154 && r) {
      const potion = this.buyEnergyPotion(r);
      if (potion) return potion;
    }
    if (
      ![
        8203, 5155, 5156, 5157, 5158, 8276, 8327, 15044, 8231, 8219, 15017,
        5178, 5154, 8970, 15003, 15004, 15012, 15013, 15042, 8279, 15025,15026,15027,15028,15043,
      ].includes(op)
    )
      return;
    try {
      return this.atomicMutation(() => {
        let packets: CityPacket[] | undefined;
        let taxGold = 0;
        let sanctuaryText: string | undefined;
        // Care/tree/shop/bot feedback belongs to Flash. Harvest/steal have no native resource text.
        const harvestBefore = op === 15044 && [6, 14].includes(Number(r?.op_type))
          ? acquisitionSnapshot(this.state) : undefined;
        if ([5155, 5156, 5157, 5158].includes(op) && r)
          packets = this.settlement.troop(op, r);
        else if (op === 8276 && r) packets = this.settlement.formation(r);
        else if (op === 8203 && r) packets = this.settlement.research(r, text => { sanctuaryText = text; });
        else if (op === 8327 && r) packets = this.settlement.taxes(r.op, gold => { taxGold += gold; });
        else if (op === 8279)
          packets = [
            {
              opcode: 4187,
              message: {
                buildOrder: this.settlement.orders(),
              },
            },
            {
              opcode: 4242,
              message: {
                left_impose: this.saved.settlement!.taxes,
                max_impose: 5,
              },
            },
          ];
        else
          packets =
            this.farm.handle(op, r ?? {}) ?? this.social.handle(op, r ?? {});
        if (!packets) return;
        if (op === 8276) {
          const counters = (this.saved.questCounters ??= {});
          counters.formation = (counters.formation ?? 0) + 1;
        }
        if ([15003, 15004, 15012].includes(op))
          packets.push({ opcode: 112, message: {} },...this.farm.friendStates());
        this.saved.friends = this.social.list();
        this.updateObjectives();
        if ([5155, 5156, 5157, 5158, 8276, 8203].includes(op))
          packets.push({ opcode: 112, message: {} });
        // Capture before persist synchronizes passive production, so it is never reported as a harvest.
        const harvestText = harvestBefore ? acquisitionText(
          acquisitionGains(harvestBefore, acquisitionSnapshot(this.state)),
          Number(r?.op_type) === 14 ? "pela colheita na fazenda de um amigo" : "pela colheita da fazenda",
        ) : undefined;
        this.persist();
        if (sanctuaryText) packets.push(...presentSystemMessage(this.messages, "reward-log", sanctuaryText).packets);
        if (op === 8327) this.taxDeadline = this.saved.settlement!.taxReadyAt;
        const taxText = acquisitionText([{ label: currencies.gold.label, amount: taxGold }], "pela coleta de impostos");
        if (taxText) packets.push(...presentSystemMessage(this.messages, "acquisition", taxText).packets);
        if (harvestText) packets.push(...presentSystemMessage(this.messages, "reward-log", harvestText).packets);
        return packets.map((p) =>
          this.packet(
            p,
            [3, 109, 113, 150, 100, 93, 112, 4130].includes(p.opcode),
          ),
        );
      });
    } catch (error) {
      if (
        error instanceof SettlementError ||
        error instanceof FarmError ||
        error instanceof SocialError ||
        error instanceof CurrencyError ||
        error instanceof GoldError ||
        error instanceof InventoryError ||
        error instanceof ExperienceError
      ) {
        this.store.tutorialEvent("city-rejected", this.userId, {
          opcode: op,
          reason: error.message,
        });
        // result=1 triggers FarmLandItem/FarmAnimalItem.showFailTip in the open farm.
        // Keep the precise server reason in chat without a second screen alert.
        const farmFailure = op === 15044 && r && Number.isSafeInteger(r.pos) && r.pos >= 0;
        const packets = farmFailure
          ? presentSystemMessage(this.messages, "native-error", error.message).packets.map(p => this.packet(p))
          : [this.notice(error.message)];
        if (op === 8327)
          packets.push(
            this.packet({ opcode: 151, message: this.settlement.orders()[2]! }),
            this.packet({
              opcode: 4242,
              message: {
                left_impose: this.saved.settlement!.taxes,
                max_impose: 5,
              },
            }),
          );
        if (farmFailure)
          packets.push(
            this.packet({
              opcode: 4387,
              message: {
                user_id: r.friend_id || this.scenario.userId,
                farmLandInfo: [
                  {
                    user_id: r.friend_id || this.scenario.userId,
                    pos: r.pos,
                    op_type: r.op_type,
                    result: 1,
                  },
                ],
              },
            }),
          );
        return packets;
      }
      throw error;
    }
  }
  handle(packet: Buffer): TutorialResponse[] {
    const level = this.state.player.grades;
    const result = this.handleRequest(packet);
    if ([5017,8516].includes(packet.readUInt16BE(6))) result.push(...this.marriage.sceneReady().map(p=>this.packet(p)));
    if (this.state.player.grades !== level) {
      this.syncAutoQuests();
      this.persist();
      result.push(
        ...[4130, 100, 93, 109, 112].map((opcode) =>
          this.packet({ opcode, message: {} }, true),
        ),
      );
    }
    if (!this.saved.battle || this.saved.battle.finished) result.push(...this.deliverTitles());
    result.push(...this.sky.tick().map(p => skyWire(p, this.userId)));
    result.push(...this.marriage.tick().map(p=>this.packet(p)));
    result.push(...this.marriage.wedding.tick().map(p=>this.packet(p)));
    result.push(...this.residence.tick().map(p=>this.packet(p)));
    return result;
  }
  disconnect(): void { this.sky.disconnect(); this.residence.disconnect(); this.marriage.disconnect(); teams(this.store).disconnect(this.userId); }
  battleIdentity(): string | undefined { return this.sky.duelBattleId ?? this.saved.battle?.id; }
  private handleRequest(packet: Buffer): TutorialResponse[] {
    const skyOp = packet.readUInt16BE(6);
    try {
      const teamPackets=[8734,8736,8737,8738,8739,8740,8741,8807,8808].includes(skyOp)?this.atomicMutation(()=>teams(this.store).handle(this.userId,skyOp,packet.subarray(20))):undefined;
      if(teamPackets)return teamPackets.map(p=>this.packet(p));
      if (this.sky.active && ([8689, 5025].includes(skyOp) || (skyOp === 8747 && decodeMessage(typeName("simple.PropertyMsg"), packet.subarray(20)).param7))) {
        this.sky.leave();
        // The castle button changes scene on the client; supply its live account models.
        return [...this.login(), this.packet({ opcode: 4130, message: {} }, true)];
      }
      if (this.sky.active && [5035, 8747].includes(skyOp)) return [];
      if (this.sky.active && (skyOp === 5004 || (skyOp === 8994 && decodeMessage(typeName("simple.PropertyMsg"), packet.subarray(20)).param1 === 3))) return [];
      const skyPackets = this.sky.handle(skyOp, packet.subarray(20));
      if (skyPackets) return [...skyPackets.map(p => skyWire(p, this.userId)),...(skyOp===8688?this.marriage.carriageSnapshot().map(p=>this.packet({...p,delayMs:200})):[])];
    } catch (error) {
      if (error instanceof SkyError || error instanceof SocialError) return [this.notice(error.message)];
      throw error;
    }
    if (packet.readUInt16BE(6) === 8597) return this.titleRequest(packet.subarray(20));
    const op = packet.readUInt16BE(6),
      r = this.request(packet);
    if(r){const entries=marriagePurchaseEntries(op,r);if(entries)return this.buyMarriageItems(op,r,entries);}
    if (r) { const entries = runePurchaseEntries(op, r); if (entries) return this.buyRuneItems(op, r, entries); }
    if(r&&[5154,8970].includes(op)){const drills=this.buyDrills(op,r);if(drills)return drills;}
    if(r&&[5151,5152,8484,9592].includes(op))return this.gemRequest(op,r);
    if([8340,8538].includes(op))return this.forgeGemRequest(op,r??{});
    if([8464,8336,8339,8644].includes(op))return this.equipmentRefinement(op,r??{});
    if(this.saved.wedding&&([5025,5120].includes(op)||op===5125&&decodeMessage(typeName("campaign.CampaignReqMsg"),packet.subarray(20)).para_int1===this.saved.map*100+1))return this.exitWedding();
    if (op===5120 && this.residence.active) return this.navigation(5025,{msg:""},packet)!;
    try {
      const weddingPackets=this.marriage.wedding.handle(op,packet.subarray(20));
      if(weddingPackets)return weddingPackets.map(p=>this.packet(p));
      const marriagePackets=this.marriage.handle(op,packet.subarray(20));
      if(marriagePackets)return marriagePackets.map(p=>this.packet(p,Boolean(p.message)&&[3,109,113,150].includes(p.opcode)));
      const residencePackets = this.residence.handle(op, packet.subarray(20));
      if (residencePackets) return residencePackets.map(p=>this.packet(p,Boolean(p.message)&&p.opcode!==115));
      const navigationPackets = this.seafaring.handle(op, packet.subarray(20));
      if (navigationPackets) return navigationPackets.map(p => this.packet(p, Boolean(p.message) && p.opcode !== 115));
      const fatePackets=this.fate.handle(op,packet.subarray(20));
      if(fatePackets)return fatePackets.map(p=>this.packet(p,p.opcode!==115&&!!p.message));
      const dragonPackets=this.dragonSoul.handle(op,packet.subarray(20));
      if(dragonPackets)return dragonPackets.map(p=>this.packet(p,p.opcode!==115&&!!p.message));
      const tattooPackets=this.tattoo.handle(op,packet.subarray(20));
      if(tattooPackets)return tattooPackets.map(p=>this.packet(p,p.opcode!==115&&!!p.message));
      const cosmosPackets = this.cosmos.handle(op, packet.subarray(20));
      if (cosmosPackets) return cosmosPackets.map(p => this.packet(p, Boolean(p.message)));
      const materialPackets = r ? this.mounts.buyStarMaterial(op, r) : undefined;
      if (materialPackets) return materialPackets.map(p => this.packet(p, Boolean(p.message) && p.opcode !== 115));
      const mountPackets = this.mounts.handle(op, packet.subarray(20));
      if (mountPackets) return mountPackets.map(p => this.packet(p, Boolean(p.message) && p.opcode !== 115));
      if (op === 5006 && r) {
        const cardPackets = this.mounts.useCard(r);
        if (cardPackets) return cardPackets.map(p => this.packet(p, Boolean(p.message) && p.opcode !== 115));
      }
    } catch (error) {
      if (op===8627&&(error instanceof InventoryError||error instanceof CurrencyError)) return [this.notice(error.message),this.packet({opcode:4545,message:{is_success:false,turn_num:1}})];
      if (error instanceof TattooError || error instanceof SocialError || error instanceof ResidenceError || error instanceof NavigationError || error instanceof CosmosError || error instanceof MountError || error instanceof InventoryError || error instanceof CurrencyError || error instanceof GoldError) return [this.notice(error.message)];
      throw error;
    }
    if (![20008, 20010, 5015, 5035, 10007, 10008, 8271, 8281].includes(op))
      this.store.tutorialEvent("city-request", this.userId, {
        opcode: op,
        request: op === 8806 ? { op_type: r?.op_type } : r,
        body: r ? undefined : packet.subarray(20).toString("base64"),
      });
    if (op === 8271) return this.bootstrap();
    if ([5185, 5184, 5167, 8479, 8480].includes(op) && r) return this.skillRequest(op, r);
    if (op === 8605 && r) return this.runeRequest(r);
    if (op === 8281)
      return [
        this.packet({ opcode: 4130, message: {} }, true),
        this.packet({ opcode: 109, message: {} }, true),
      ];
    const feature = this.handleSettlement(op, r);
    if (feature) return feature;
    const b = this.saved.battle;
    if (op === 10007) {
      const id = fields(packet.subarray(20)).find((f) => f.number === 2)?.value;
      if (b && !b.finished) {
        if (!Buffer.isBuffer(id) || id.toString() !== b.id)
          return [this.prepare()];
        readyAdventure(b, this.now());
        this.persist();
      }
      return [];
    }
    if (op === 10010 || op === 10022) {
      const id = fields(packet.subarray(20)).find((f) => f.number === 2)?.value;
      if (!b || !Buffer.isBuffer(id) || id.toString() !== b.id) return [];
      setAdventurePaused(b,op===10010,this.now());
      this.persist();
      return op === 10010
        ? [this.packet({ opcode: 69, message: { type: 1, order: 0 } })]
        : [];
    }
    if (op === 10020) {
      const request=decodeMessage(typeName("battle.AttackModeMsg"),packet.subarray(20));
      if (!b?.engine||b.finished||b.finishing||request.battle_id!==b.id||![1,2].includes(Number(request.mode))||
          (request.userId!==undefined&&Number(request.userId)!==this.userId)) return [];
      const actor=b.engine.actors.find(a=>a.id===b.hero)!;
      actor.equippedSkills ??= equippedBattleSkills(actor.learned,this.state.hero.fast_key);
      if (!setBattleAutomatic(b.engine,b.hero,request.mode===1,this.now())) return [];
      populateAutomatic(b.engine,this.now());
      b.prepare.attack_model=request.mode;this.persist();
      return [this.packet({opcode:77,message:automaticModeMessage(b.engine,b.hero,this.userId,b.id)})];
    }
    if (op === 10499) {
      const request=decodeMessage(typeName("battle.BattleItemMsg"),packet.subarray(20));
      const rune=b?.engine?.actors.find(a=>a.id===b.hero)?.runes?.find(r=>r.skillId===Number(request.skillTempId));
      const ok=!!b&&request.battleId===b.id&&Number(request.userId)===b.hero&&!!rune&&adventureSkill(b,rune.skillId,this.now());
      this.persist();
      return [this.packet({opcode:158,message:{uItemId:rune?.runeId??0,bagPos:rune?.slot??0,count:rune?Math.max(0,rune.maxUses-(b!.engine!.actors.find(a=>a.id===b!.hero)!.uses[rune.skillId]??0)):0,result:ok?0:1,living_id:b?.hero??0,temp_id:rune?.skillId??Number(request.skillTempId??0),type:1}}),
        ...(ok?[this.packet({opcode:75,message:adventureSelection(b!,b!.hero,rune!.skillId,true,this.now())})]:[])];
    }
    if (op === 10008) {
      const f = fields(packet.subarray(20)),
        s = (n: number) => f.find((v) => v.number === n)?.value;
      const id = Buffer.isBuffer(s(1)) ? (s(1) as Buffer).toString() : "";
      const skill = Number(s(3));
      const ok =
        !!b &&
        id === b.id &&
        Number(s(2)) === b.hero &&
        adventureSkill(b, skill, this.now());
      this.persist();
      return [
        this.packet({
          opcode: 75,
          message: {
            battle_id: id,
            hero_index_id: Number(s(2)),
            skill_id: skill,
            result: ok ? 0 : 1,
            cast_time: ok?adventureSelection(b!,b!.hero,skill,true,this.now()).cast_time:0,
            qte_time: 0,
            targetIndexs: ok ? adventureTargets(b!) : [],
          },
        }),
      ];
    }
    const nav = this.navigation(op, r, packet);
    if (nav) return nav;
    if (op === 8528 && r) {
      try {
        return this.atomicMutation(() => {
          if (r.sweep_type === 1 && this.labyrinthBot.active) throw new LabyrinthError("Encerre o bot do labirinto primeiro.");
          const packets = r.sweep_type === 2 ? this.labyrinthBot.handle(r) : this.sweep.handle(r);
          this.updateObjectives();
          this.syncAutoQuests();
          this.persist();
          return packets.map((p) =>
            this.packet(p, [3, 109, 113, 150, 115, 112, 4205, 4373, 4725].includes(p.opcode)),
          );
        });
      } catch (error) {
        if (
          error instanceof LabyrinthError ||
          error instanceof CurrencyError ||
          error instanceof GoldError ||
          error instanceof InventoryError ||
          error instanceof ExperienceError
        )
          return [this.notice(error.message)];
        throw error;
      }
    }
    if (op === 5122) return this.chooseCampaignCard(r);
    if (op === 5124) {
      const path = fields(packet.subarray(20))
        .filter((f) => f.number === 3 && Buffer.isBuffer(f.value))
        .at(-1)?.value;
      if (Buffer.isBuffer(path)) {
        const list = fields(path),
          x = Number(list.find((f) => f.number === 1)?.value),
          y = Number(list.find((f) => f.number === 2)?.value);
        if ([x, y].every((v) => Number.isInteger(v) && v >= 0 && v < 100000)) {
          this.state.army.cur_pos_x = Math.floor(x / 20);
          this.state.army.cur_pos_y = Math.floor(y / 20);
          this.persist();
        }
      }
      return [];
    }
    if (op === 5005 && r) return this.moveItem(r);
    if ([5010, 8220, 8819, 9569, 8346, 8809].includes(op) && r) return this.storageRequest(op, r);
    if (op === 8806 && r) return this.storagePassword(r);
    const fashionResult = this.fashion.handle(op, r, packet);
    if (fashionResult) return fashionResult;
    if ((op === 5007 || op === 8624) && r)
      return this.sellItems(r, op === 8624);
    if (op === 5022 && r) {
      const result = this.claimLocalMail(r);
      if (result) return result;
    }
    if (op === 8206 && r) return this.deleteMail(r);
    if (op === 5153 && r) return this.composeEquipment(r);
    if (op === 5150 && r) return this.strengthenItem(r);
    if (op === 5006 && r) return this.useGoldBag(r);
    if (op === 5006)
      return [
        this.notice(
          "O efeito desse consumível ainda não foi reconstruído. O item foi preservado.",
        ),
      ];
    if ([5150, 5151, 5152, 5153, 8336].includes(op))
      return [
        this.notice(
          "A forja ainda não foi reconstruída. Nenhum item ou recurso foi consumido.",
        ),
      ];
    if (op === 5017 && r) {
      this.setProgress(Number(r.novice_process));
      this.syncAutoQuests();
      this.persist();
      return [this.packet({ opcode: 112, message: {} }, true), ...this.login()];
    }
    if (op === 5039 && r) {
      if (this.labyrinthBot.active) return [this.notice("Encerre o bot do labirinto antes de entrar na campanha.")];
      const definition =
        r.para_int1 === 1 ? campaignDefinitions.get(r.para_int2) : undefined;
      const c = this.scenario.queries.find(
        (c) =>
          c.opcode === 5039 &&
          c.request?.para_int1 === r.para_int1 &&
          c.request?.para_int2 === r.para_int2,
      );
      if (!definition || (!c && !definition.entry))
        return [
          this.notice(
            "Esta campanha ainda não está disponível no servidor local.",
          ),
        ];
      if (this.sweep.active)
        return [
          this.notice("Conclua ou cancele o bot antes de entrar na campanha."),
        ];
      if (definition.definition.DifficultyGrade === "2") {
        const normal = campaignRules.campaigns.find(
          (c) =>
            c.AreaId === definition.definition.AreaId &&
            c.DifficultyGrade === "1",
        );
        if (
          !normal ||
          !this.clearedCampaigns().includes(Number(normal.CampaignId))
        )
          return [
            this.notice(
              "Conclua esta fase no modo normal para liberar o modo herói.",
            ),
          ];
      }
      if (this.saved.battle && !this.saved.battle.finished)
        return [
          this.notice("Conclua a batalha atual antes de entrar na campanha."),
        ];
      if (
        this.saved.campaignRun?.completed &&
        this.saved.campaignRun.cards &&
        this.saved.campaignRun.cards.selected === undefined &&
        campaignByMap.has(this.saved.map)
      )
        return [
          this.notice(
            "Escolha a carta de recompensa antes de entrar em outra campanha.",
          ),
        ];
      const previous = Number(definition.definition.PreCampaignId);
      if (previous && !this.clearedCampaigns().includes(previous))
        return [
          this.notice("Conclua a campanha anterior para liberar esta fase."),
        ];
      const resuming =
        this.saved.map === definition.map &&
        this.saved.campaignRun &&
        (this.saved.campaignRun.campaignId ?? 1001) === definition.id &&
        !this.saved.campaignRun.completed;
      if (this.state.player.grades < Number(definition.definition.MinLevel))
        return [
          this.notice(
            `${definition.definition.CampaignName} exige nível ${definition.definition.MinLevel}.`,
          ),
        ];
      this.atomicMutation(() => {
        if (
          !resuming &&
          (this.saved.campaignRun?.paid !== false ||
            this.saved.campaignRun.completed ||
            (this.saved.campaignRun.campaignId ?? 1001) !== definition.id)
        ) {
          this.saved.campaignRun = {
            id: randomUUID(),
            campaignId: definition.id,
            paid: false,
            rewarded:
              this.state.player.weary >= 20 &&
              (definition.definition.DifficultyGrade !== "2" ||
                heroEntries(this.saved, this.now()) > 0),
            won: [],
            completed: false,
          };
          delete this.saved.location;
        }
        this.saved.map = definition.map;
        if (!resuming) {
          const member = definition.load?.find(p => p.opcode === 21)?.message?.player?.find((p:Message) => p.player_id === this.scenario.userId);
          if (member) Object.assign(this.state.army,{map_id:definition.map,cur_pos_x:member.cur_pos_x,cur_pos_y:member.cur_pos_y,state:0});
        }
        this.persist();
      });
      // Cached PVE scenes can initialize before enterOver emits 5038. Supply the
      // current member in the entry burst rather than waiting on that callback.
      // Charging energy remains exclusively in loadImportedCampaign(), once per run.
      const entryPackets = definition.entry
        ? [
            { opcode: 4165, message: { army_id: this.scenario.userId } },
            definition.entry,
            ...(definition.load ?? []).filter(p => [21, 20, 127, 130].includes(p.opcode)),
          ]
        : c!.responses;
      return entryPackets
        .filter((p) => ![83, 84, 112].includes(p.opcode))
        .map((p) => this.packet({ ...p, delayMs: 0 }, true));
    }
    if (op === 5180 && r) {
      if (
        campaignByMap.has(this.saved.map) &&
        this.currentCampaignIndices().every((i) =>
          this.campaignWins().includes(i),
        )
      ) {
        if (!this.saved.campaignRun?.completed) return this.finishCampaign();
        if (
          this.saved.campaignRun.cards &&
          this.saved.campaignRun.cards.selected === undefined
        )
          return [this.notice("Escolha a carta de recompensa antes de sair.")];
      }
      const result = this.leaveCampaign();
      return [
        ...result,
        this.packet({ opcode: 134, body: "" }),
        this.packet({ opcode: 112, message: {} }, true),
      ];
    }
    if (op === 5014 && r) {
      const result = this.claimCampaignQuest(r);
      if (result) return result;
    }
    if (op === 5012 && r) return this.acceptQuests(r.questId ?? []);
    if (op === 5167 && r) {
      const keys = String(r.fast_key ?? "")
        .split(",")
        .filter(Boolean)
        .map(Number);
      const learned = String(this.state.hero.skill_script)
        .split(",")
        .map(Number);
      if (
        keys.length > 5 ||
        keys.some(
          (k) => k !== -1 && !learned.some((id) => Math.floor(id / 100) === k),
        )
      )
        return this.rejection("Atalho de habilidade não aprendida");
      this.state.hero.fast_key = r.fast_key;
      this.persist();
      return [
        this.packet({
          opcode: 64,
          message: { fast_key: r.fast_key, set_result: 1 },
        }),
      ];
    }
    const mutation =
      [
        5014, 5012, 5017, 5155, 5156, 5039, 5180, 5184, 5185, 8203, 5022, 8594,
      ].includes(op) ||
      (op === 5019 && r?.operate === 1) ||
      (op === 15044 && r?.op_type !== 0);
    if (mutation) {
      const candidates = this.scenario.cases
        .map((c, index) => ({ c, index }))
        .filter(
          (v) =>
            this.sameRequest(v.c, op, r, packet) &&
            !this.saved.used.includes(v.index) &&
            this.guarded(v.c),
        );
      const candidate = candidates[0];
      return candidate
        ? this.execute(candidate.c, candidate.index)
        : this.mutationRejection(op, r, this.scenario.cases.filter(c => this.sameRequest(c, op, r, packet)));
    }
    return this.query(op, r, packet);
  }
  private buyMarriageItems(op:number,r:Message,entries:Message[]):TutorialResponse[]{try{return this.atomicMutation(()=>{const before=structuredClone(this.state.items);buyMarriage(this.state,this.inventory(this.state),this.currencyLedger,this.userId,this.scenario.userId,op,r,entries);this.persist();return [this.packet({opcode:115,message:{moved:inventoryUpdates(before,this.state.items)}}),this.packet({opcode:3,message:{}},true),this.packet({opcode:109,message:{}},true),...(op===8970?[this.packet({opcode:4783,message:{result:1,carItemInfo:entries}})]:[]),this.packet({opcode:90,message:{buyInfo:{good_id:entries[0]?.shopId,count:entries[0]?.counts,receive_id:this.userId,result:1}}})];});}catch(error){if(!(error instanceof InventoryError||error instanceof CurrencyError))throw error;this.store.tutorialEvent("city-rejected",this.userId,{opcode:op,system:"marriage-shop",reason:error.message,offers:entries.map(e=>({shopId:e.shopId,counts:e.counts}))});return [this.notice(error.message),...(op===8970?[this.packet({opcode:4783,message:{result:0,carItemInfo:entries}})]:[]),this.packet({opcode:90,message:{buyInfo:{good_id:entries[0]?.shopId,result:0}}})];}}
  private buyRuneItems(opcode: number, request: Message, entries: Message[]): TutorialResponse[] {
    const callback = (result: number) => this.packet({ opcode: 90, message: { buyInfo: { good_id: entries[0]?.shopId, count: entries[0]?.counts, receive_id: this.scenario.userId, result } } });
    try { return this.atomicMutation(() => {
      const before = structuredClone(this.state.items);
      buyRunes(this.state, this.inventory(this.state), this.currencyLedger, this.userId, this.scenario.userId, opcode, request, entries);
      this.persist();
      // Quick buy sends 8970 but BuyFrameI awaits 90; publish inventory before its callback learns/promotes.
      return [this.packet({ opcode: 115, message: { moved: inventoryUpdates(before, this.state.items) } }), this.packet({ opcode: 3, message: {} }, true),
        ...(opcode === 8970 ? [this.packet({ opcode: 4783, message: { ...request, result: 1 } })] : []), callback(1)];
    }); } catch (error) {
      if (!(error instanceof RuneError || error instanceof InventoryError || error instanceof CurrencyError)) throw error;
      return [this.notice(error.message), ...(opcode === 8970 ? [this.packet({ opcode: 4783, message: { result: 0 } })] : []), callback(0)];
    }
  }
  private runeRequest(request: Message): TutorialResponse[] {
    try { return this.atomicMutation(() => {
      if (Number(request.user_id) !== this.scenario.userId) throw new RuneError("Personagem inválido");
      if (this.saved.battle && !this.saved.battle.finished) throw new RuneError("Conclua a batalha antes de modificar runas");
      this.syncHero(); const before = structuredClone(this.state.items);
      operateRune(this.saved.runes!, this.state, this.inventory(this.state), request, this.now());
      this.persist();
      return [this.packet({ opcode: 115, message: { moved: inventoryUpdates(before, this.state.items) } }),
        this.packet({ opcode: 4495, message: { user_id: this.scenario.userId, opType: Number(request.opType), opResult: true, runeInfo: runeModel(this.saved.runes!, this.scenario.userId) } }),
        ...[113, 150].map(opcode => this.packet({ opcode, message: {} }, true))];
    }); } catch (error) {
      if (!(error instanceof RuneError || error instanceof InventoryError)) throw error;
      return [this.packet({ opcode: 4495, message: { opType: Number(request.opType), opResult: false } }), this.notice(error.message)];
    }
  }
  private skillRequest(op: number, request: Message): TutorialResponse[] {
    try {
      return this.atomicMutation(() => {
        if (this.saved.battle && !this.saved.battle.finished) throw new SkillError("Conclua a batalha antes de modificar habilidades");
        this.syncHero();
        const skills = this.saved.skills!;
        let learned: Message | undefined;
        const pay = (amount: number) => {
          if (![0, 1].includes(Number(request.pay_type ?? 0))) throw new SkillError("Forma de pagamento inválida");
          const bound = Number(request.pay_type ?? 0) === 0 ? Math.min(amount, currencyBalance(this.state, "boundDiamonds")) : 0;
          if (currencyBalance(this.state, "diamonds") < amount - bound) throw new SkillError("Diamantes insuficientes");
          this.currencyLedger.changeMany(this.state, this.userId, { boundDiamonds: -bound, diamonds: -(amount - bound) }, "skills:basic", randomUUID());
        };
        if (op === 5185) {
          if (Number(request.type ?? 0) !== 0) throw new SkillError("Esta operação atende apenas habilidades da profissão inicial");
          learned = learnSkill(skills, this.state, Number(request.skill_temp_id));
        }
        if (op === 5167) setSkillKeys(skills, String(request.fast_key ?? ""));
        if (op === 5184) {
          if (Number(request.type ?? 0) !== 0) throw new SkillError("Reset de talentos não disponível nesta etapa");
          if (this.state.player.grades >= 25) pay(100);
          resetSkillPage(skills);
        }
        if (op === 8479 && !skills.unlocked) {
          if (this.state.player.grades < 38) throw new SkillError("A segunda distribuição exige nível 38");
          pay(600); skills.unlocked = true;
        }
        if (op === 8480) switchSkillPage(skills, Number(request.index));
        this.persist();
        const response = [3, 150, 113].map(opcode => this.packet({ opcode, message: {} }, true));
        if (learned) response.push(this.packet({ opcode: 60, message: { template_id: Number(learned.TemplateId), index: Number(learned.Index), type: 0 } }));
        if (op === 5184) response.push(this.packet({ opcode: 61, message: { reset_result: true, type: 0 } }));
        response.push(this.packet({ opcode: 64, message: { fast_key: this.state.hero.fast_key, set_result: 1 } }));
        return response;
      });
    } catch (error) {
      if (error instanceof SkillError || error instanceof CurrencyError) return [this.notice(error.message)];
      throw error;
    }
  }
  private depositLabyrinthDrops(drops: LabyrinthDrop[]): void {
    for (const drop of drops) {
      if (drop.templateId === 208009)
        this.currencyLedger.change(
          this.state, this.userId, "labyrinthCoin", drop.count,
          `labyrinth:${this.labyrinth.mode}:chest`,
          `labyrinth:${this.labyrinth.progress().runId}:${this.labyrinth.map}:chest`,
        );
      else
        this.inventory(this.state).add(
          { ...structuredClone(drop.model!), bag_type: 1, object_id: 0,
            user_id: this.scenario.userId, pos: -1 }, drop.count,
        );
    }
  }
  tick(): TutorialResponse[] {
    let notices: TutorialResponse[] = [];
    if (this.titleExpiryWake?.save !== this.saved.titles) this.titleExpiryWake = { save: this.saved.titles!, at: nextTitleDeadline(this.saved.titles!) };
    if (this.now() >= this.titleExpiryWake!.at) this.atomicMutation(() => this.persist());
    notices.push(...this.mounts.tick().map(p => this.packet(p, Boolean(p.message) && p.opcode !== 115)));
    notices.push(...this.sky.tick().map(p => skyWire(p, this.userId)));
    notices.push(...this.marriage.tick().map(p=>this.packet(p)));
    notices.push(...this.marriage.wedding.tick().map(p=>this.packet(p)));
    notices.push(...this.residence.tick().map(p=>this.packet(p)));
    if (this.labyrinthBot.active) {
      try {
        notices.push(...this.atomicMutation(() => {
          const packets = this.labyrinthBot.tick();
          if (!packets.length) return [];
          this.updateObjectives();
          this.syncAutoQuests();
          this.persist();
          return packets.map(p => this.packet(p, [3, 109, 113, 150, 115, 112, 4205, 4373, 4725].includes(p.opcode)));
        }));
      } catch (error) {
        if (error instanceof InventoryError || error instanceof CurrencyError || error instanceof LabyrinthError) {
          notices.push(this.notice(error.message));
          // Retry later without committing any part of a failed reward.
          notices.push(...this.atomicMutation(() => {
            const s = this.labyrinth.data.bot!;
            s.nextAt = this.now() + 6000;
            this.persist();
            return [];
          }));
        } else throw error;
      }
    }
    notices.push(...this.seafaring.tick().map(p => this.packet(p, Boolean(p.message))));
    if (this.sweep.active) {
      notices.push(
        ...this.atomicMutation(() => {
          const packets = this.sweep.tick();
          if (!packets.length) return [];
          this.updateObjectives();
          this.syncAutoQuests();
          this.persist();
          return packets.map((p) =>
            this.packet(p, [3, 109, 113, 150, 115, 112, 4205, 4373, 4725].includes(p.opcode)),
          );
        }),
      );
    }
    if (this.saved.settlement!.taxDay !== gameDay(this.now()) || (this.taxDeadline > 0 && this.now() >= this.taxDeadline)) {
      if (this.now() >= this.taxDeadline) this.taxDeadline = 0;
      this.persist();
      notices.push(
        this.packet({ opcode: 151, message: this.settlement.orders()[2]! }),
        this.packet({
          opcode: 4242,
          message: { left_impose: this.saved.settlement!.taxes, max_impose: 5 },
        }),
      );
    }
    teams(this.store).tick(this.userId);
    if (this.social.hasEvents())
      notices.push(
        ...this.atomicMutation(() => {
          const received = this.social.drain();
          const socialRefresh=received.some(p=>p.opcode===0&&p.message?.socialRefresh);
          const pending=received.filter(p=>p.opcode!==0);
          if(received.some(p=>p.opcode===0&&Number(p.message?.weddingExit)===this.saved.wedding?.id)&&this.marriage.wedding.active){notices.push(...this.exitWedding());}

          if(received.some(p=>[78,79].includes(p.opcode)))pending.push(...this.farm.friendStates());
          if(socialRefresh){this.marriage.synchronize();this.persist();pending.push(...this.marriage.snapshot().filter(p=>p.opcode!==4658),...[3,113,150].map(opcode=>({opcode,message:{}})));}
          if (pending.length) {
            this.saved.friends = this.social.list();
            this.farm.synchronize();
            this.updateObjectives();
            this.persist();
            pending.push({
              opcode: 112,
              message: {
                quest: Object.values(this.state.quests),
                states: this.state.player.quest_site,
                states_length: this.state.player.quest_site_len,
              },
            });
          }
          return pending.map((p) => this.packet(p));
        }),
      );
    if (this.now() - this.lastSettlementTick >= 60000) {
      this.lastSettlementTick = this.now();
      notices.push(
        ...this.atomicMutation(() => {
          this.persist();
          this.farm.synchronize();
          return [
            this.packet({ opcode: 109, message: {} }, true),
            this.packet({ opcode: 151, message: this.settlement.orders()[2]! }),
            this.packet({ opcode: 4242, message: { left_impose: this.saved.settlement!.taxes, max_impose: 5 } }),
            ...this.farm.tickPackets().map((p) => this.packet(p)),
            ...this.productionNotices(),
          ];
        }),
      );
    }
    if (this.saved.pendingMailNotices?.length) {
      const ids = this.saved.pendingMailNotices;
      this.saved.pendingMailNotices = [];
      this.persist();
      notices.push(
        ...ids.map((id) =>
          this.packet({
            opcode: 148,
            message: { player_id: this.userId, mail_id: id },
          }),
        ),
      );
    }
    if (!this.saved.battle || this.saved.battle.finished) return [...notices, ...this.deliverTitles()];
    try {
      return [...notices, ...this.atomicMutation(() => this.tickBattle())];
    } catch (error) {
      if (
        error instanceof CurrencyError ||
        error instanceof InventoryError ||
        error instanceof ExperienceError
      )
        return [...notices, ...this.rejection(error.message)];
      throw error;
    }
  }
  private tickBattle(): TutorialResponse[] {
    const b = this.saved.battle;
    if (!b) return [];
    const ref = this.scenario.battles[b.reference]!;
    const events = advanceAdventure(b, ref, this.now());
    if (!events.length) return [];
    const result = events.map((p) => this.packet(p));
    if (b.finished) {
      this.saved.instanceFury = finishedFury(this.furyInstance(), b.sp);
      let labyrinthUpdates: CityPacket[] = [];
      this.state.hero.hp = b.fighters.find((f) => f.living_id === b.hero)!.hp;
      if (
        b.won &&
        !(
          isCampaignBattle(b.reference) ? this.campaignWins() : this.saved.won
        ).includes(b.reference)
      ) {
        if (isCampaignBattle(b.reference) && this.saved.campaignRun)
          this.saved.campaignRun.won.push(b.reference);
        if (!this.saved.won.includes(b.reference))
          this.saved.won.push(b.reference);
        const definition = this.importedCampaign();
        const stage =
          definition?.stages?.[
            this.currentCampaignIndices().indexOf(b.reference)
          ];
        const rewarded =
          !isCampaignBattle(b.reference) ||
          this.saved.campaignRun?.rewarded !== false;
        if (stage && rewarded) {
          const before = structuredClone(this.state.items);
          if (stage.xp) grantExperience(this.state.player, stage.xp);
          if (stage.spirit)
            this.currencyLedger.change(
              this.state,
              this.userId,
              "spirit",
              stage.spirit,
              `campaign:${definition!.id}:battle`,
              `campaign:${this.saved.campaignRun!.id}:battle:${b.reference}:spirit`,
            );
          if (stage.gold)
            this.currencyLedger.change(this.state, this.userId, "gold", stage.gold,
              `campaign:${definition!.id}:battle`,
              `campaign:${this.saved.campaignRun!.id}:battle:${b.reference}:gold`);
          for (const drop of stage.drops ?? [])
            this.grantCampaignItem(drop.model, drop.count);
          if (
            b.reference === this.currentCampaignIndices().at(-1) &&
            definition?.observedDrops?.potion
          )
            this.grantCampaignItem(definition.observedDrops.potion, 5);
          const moved = inventoryUpdates(before, this.state.items);
          if (moved.length)
            result.push(
              this.packet({ opcode: 115, message: { moved }, delayMs: 5500 }),
            );
        }
        // Apply only the observed reward deltas, once. Other packets are UI models.
        for (const patch of stage || !rewarded ? [] : (ref.rewardPatches ?? []))
          if (!["hero", "army"].includes(patch.path[0]!))
            this.applyGameplayPatch(
              this.state,
              patch,
              `battle:${b.reference}`,
              `battle:${b.reference < 2 ? (this.saved.campaignRun?.id ?? "legacy") : "legacy"}:${b.reference}:${(ref.rewardPatches ?? []).indexOf(patch)}`,
            );
        const xp =
          stage || !rewarded ? 0 : experienceReward(ref.rewardPatches ?? []);
        if (xp) grantExperience(this.state.player, xp);
        const battleXp = stage && rewarded ? stage.xp : xp;
        if (isCampaignBattle(b.reference) && battleXp > 0)
          result.push(this.rewardChat(systemMessageText.campaignBattleXp(battleXp), 5600));
        if (this.labyrinth.isBattle(b.reference)) {
          const labyrinthXp = this.labyrinth.experience();
          grantExperience(this.state.player, labyrinthXp);
          result.push(this.rewardChat(systemMessageText.labyrinthFloorXp(
            labyrinthXp, this.labyrinth.progress().floor,
            this.labyrinth.mode === 8001 ? "Labirinto" : "Abismo",
          ), 5600));
          labyrinthUpdates = this.labyrinth.victory();
        }
        this.syncAutoQuests();
        result.push(
          this.packet({ opcode: 112, message: {}, delayMs: 5500 }, true),
        );
        result.push(
          ...ref.rewards
            .filter(
              (p) =>
                ![3, 109, 113, 100].includes(p.opcode) &&
                !(this.labyrinth.isBattle(b.reference) && p.opcode === 128) &&
                (rewarded || ![115, 135, 26].includes(p.opcode)),
            )
            .map((p, i) => {
              if (this.labyrinth.isBattle(b.reference) && p.opcode === 4103)
                p = {
                  ...p,
                  message: {
                    ...p.message,
                    gp_bonus: this.labyrinth.experience(),
                    pet_gp_bonus: this.labyrinth.experience(),
                  },
                };
              if (!rewarded && p.opcode === 4103)
                p = {
                  ...p,
                  message: {
                    ...p.message,
                    gp_bonus: 0,
                    strategy_bonus: 0,
                    gold_bonus: 0,
                    pet_gp_bonus: 0,
                  },
                };
              return this.packet({ ...p, delayMs: 5500 + i * 5 }, true);
            }),
        );
        // After the report, disable the enemy and open the portal before
        // restoring the player's movement/collision state.
        if (this.labyrinth.isBattle(b.reference))
          result.push(
            ...labyrinthUpdates.map((p, i) =>
              this.packet({ ...p, delayMs: 5560 + i * 5 }),
            ),
          );
        // Table-generated hero encounters have no captured reward packet. The
        // client still requires BattleResultMsg to leave the battle scene.
        if (
          isCampaignBattle(b.reference) &&
          !ref.rewards.some((p) => p.opcode === 4103)
        )
          result.push(
            this.packet({
              opcode: 4103,
              delayMs: 5550,
              message: {
                battle_result: 1,
                strategy_bonus: rewarded ? Number(stage?.spirit ?? 0) : 0,
                gp_bonus: rewarded ? Number(stage?.xp ?? 0) : 0,
                battle_scene: 3,
                fail_count: 0,
                gold_bonus: 0,
                pet_gp_bonus: 0,
              },
            }),
          );
      }
      if (!b.won)
        result.push(
          this.packet({
            opcode: 4103,
            delayMs: 5500,
            message: {
              battle_result: 0,
              strategy_bonus: 0,
              gp_bonus: 0,
              battle_scene: this.labyrinth.isBattle(b.reference)
                ? 10
                : b.prepare.battle_type,
              fail_count: 1,
              gold_bonus: 0,
              pet_gp_bonus: 0,
            },
          }),
        );
      this.state.army.state = 0;
      if (!b.won && this.labyrinth.isBattle(b.reference))
        result.push(
          ...this.labyrinth.defeat().map((p, i) =>
            this.packet({ ...p, delayMs: 5560 + i * 5 }),
          ),
        );
      this.syncHero();
      result.push(
        this.packet({
          opcode: 140,
          delayMs: 6200,
          message: { updated_type: 3, army: this.state.army },
        }),
      );
      if (isCampaignBattle(b.reference) && campaignByMap.has(this.saved.map))
        result.push(this.campaignProgress(6205));
      result.push(
        ...this.login().map((p, i) => ({ ...p, delayMs: 6000 + i * 2 })),
      );
      // Preserve packet order, but remove the historical 5.5–6.2s idle delays.
      const endDelay = closingDelay(events.find(p => p.opcode === 154)?.delayMs ?? 0);
      for (let i = events.length; i < result.length; i++) result[i] = {
        ...result[i]!, delayMs: endDelay + (i - events.length) * 5, battleId: b.id,
      };
    }
    this.persist();
    return result;
  }
  setProgress(process: number): boolean {
    if (![19500, 20000, 21000, 23000, 25000, 26000].includes(process))
      return false;
    this.state.player.novice_process = Math.max(
      this.state.player.novice_process ?? 19500,
      process,
    );
    this.persist();
    return true;
  }
  private escape(value: any): string {
    return String(value ?? "").replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  }
  starXml(ids = ""): string { return this.cosmos.xml(ids); }
  mailXml(ids = "0", reqType = 0): string {
    this.syncLocalMail();
    const requested =
      ids === "0"
        ? undefined
        : new Set(
            ids
              .split(",")
              .map(Number)
              .filter((n) => Number.isSafeInteger(n) && n > 0),
          );
    if (reqType === 1 && requested) {
      for (const id of requested) {
        const mail = this.state.mails[id];
        if (mail?.readDate?.startsWith("2999-"))
          mail.readDate = new Date(this.now())
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");
      }
    }
    this.persist();
    return (
      "<root>" +
      Object.values(this.state.mails)
        .filter((mail) => mail.isExist !== 0 && !this.saved.deletedMailIds?.includes(mail.id) && (!requested || requested.has(mail.id)))
        .map((mail) => {
          const m = this.personalize(mail);
          const attr = Object.entries(m)
            .filter(([k]) => !k.startsWith("$") && k !== "isExist")
            .map(
              ([k, v]) =>
                `${k === "sendPlayerGrades" ? "SendPlayerGrade" : k[0]!.toUpperCase() + k.slice(1)}="${this.escape(k.startsWith("isAnnex") ? !!v : v)}"`,
            );
          attr.push('IsExist="true"');
          return "<Info " + attr.join(" ") + "/>";
        })
        .join("") +
      "</root>"
    );
  }
  itemXml(ids: string): string {
    this.syncLocalMail();
    const attrs = (m: Message) =>
      Object.entries(m)
        .map(([k, v]) => `${k}="${this.escape(v)}"`)
        .join(" ");
    const prototypes = this.scenario.cases
      .flatMap((c) => c.responses)
      .filter((p) => p.opcode === 115)
      .flatMap((p) =>
        (p.message?.moved ?? []).map((v: Message) => v.item).filter(Boolean),
      );
    const rows: string[] = [];
    for (const id of ids.split(",").map(Number))
      for (const mail of Object.values(this.state.mails))
        for (let i = 1; i <= 5; i++)
          if (mail["annex" + i] === id) {
            const item =
              prototypes.find(
                (v: Message) => v.template_id === mail["annex" + i + "Name"],
              ) ??
              (itemTemplate(mail["annex" + i + "Name"])
                ? {
                    template_id: mail["annex" + i + "Name"],
                    pos: 0,
                    bind: 1,
                    strengthen_grade: 0,
                  }
                : undefined);
            if (item)
              rows.push(
                "<Info " +
                  attrs({
                    id,
                    templateId: item.template_id,
                    userId: this.userId,
                    count: mail["annex" + i + "Count"],
                    pos: item.pos,
                    objectId: 0,
                    bagType: 1,
                    isExist: true,
                    isBinds: !!item.bind,
                    isUsed: false,
                    beginDate: "2000-01-01 00:00:00",
                    strengthenGrade: item.strengthen_grade ?? 0,
                    join1: -1,
                    join2: -1,
                    join3: -1,
                    join4: -1,
                  }) +
                  "/>",
              );
          }
    return "<root>" + rows.join("") + "</root>";
  }
}
