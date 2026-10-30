import {spouse} from "./marriage.js";
import { socialPresence } from "./state.js";
import type { Store } from "../../store.js";
import type { CitySave } from "../../city-world.js";
import type { Message } from "../../messages.js";
import { classForIcon } from "../../combat.js";

/** Public models only: never expose the owner's inventory or captured player IDs. */
export function inspectPlayer(store: Store, uid: number, live?: CitySave): { player: Message; army: Message; items: Message[]; hide: boolean; detail: Message } | undefined {
  const p = store.tutorialProfile(uid);
  if (!p?.active) return;
  const row = live ? undefined : store.db.prepare("SELECT state FROM city_worlds WHERE user_id=?").get(uid);
  const saved: CitySave | undefined = live ?? (row ? JSON.parse(String(row.state)) : undefined);
  const { army = {}, hero = {}, player = {}, items = {} } = saved?.state ?? {};
  const fashion=saved?.fashion,styles=saved?.cosmeticIds??{};
  const cosmetic=(part:number,field:number)=>Number(Object.values(items).find(i=>Number(i.id)===Number(styles[String(part)]))?.template_id??fashion?.fields[String(field)]??0);
  const progress=store.db.prepare("SELECT name FROM sqlite_master WHERE name='social_marriage_progress'").get()?store.db.prepare('SELECT data FROM social_marriage_progress WHERE user_id=?').get(uid):undefined,ring=progress?JSON.parse(String(progress.data)):{};
  const publicHero={...hero,hero_id:uid,player_id:uid,tempate_id:p.icon,head_id:p.icon,nick_name:p.nickname,fashion_grades:fashion?.level??0,fashion_gp:fashion?.xp??0,fashion_arm:cosmetic(109,3),fashion_cloth:cosmetic(110,4),fashion_hat:cosmetic(111,5),fashion_wing:cosmetic(112,6),ring_grade:ring.ringGrade??0,nick_nameB:store.tutorialProfile(progress?spouse(store,uid):0)?.nickname??""};
  return {
    player: { userId: uid, nickName: p.nickname, isExist: 1, sexs: p.sex, pics: p.icon, head_id: p.icon,
      gp:player.gp??0, seniorStoreGrade:player.seniorStoreGrade??0, grades: player.grades ?? 1, fightingCapacity: hero.fighting_capacity ?? 0, state: socialPresence(store,uid), job: classForIcon(p.icon),
      is_vip: false, trans_grade: 0, storeGrade: player.storeGrade ?? 0, consortiaID: 0, consortiaName: "" },
    army: { army_id: uid, player_id: uid, nick_name: p.nickname, map_id: saved?.map ?? 1,
      store_grade:player.storeGrade??0,senior_store_grade:player.seniorStoreGrade??0,consortia_id:player.consortia_id??0,consortia_name:player.consortia_name??"",cur_pos_x: army.cur_pos_x ?? 0, cur_pos_y: army.cur_pos_y ?? 0, appellid: player.appell_id ?? 0,
      simple_hero: publicHero,
      armyPawn: (army.armyPawn ?? []).map((pawn: Message) => ({ ...structuredClone(pawn), army_id: uid })) },
    items: Object.values(items).filter(i => i.exist && Number(i.bag_type) === 4 && Number(i.object_id) === Number(hero.hero_id))
      .map(i => ({ ...structuredClone(i), user_id: uid, object_id: uid })),
    detail:{grade:Number(player.grades??1),fightCapacity:Number(hero.fighting_capacity??0),star:Object.values(saved?.cosmos?.instances??{}).filter(star=>star.bag===2).map(star=>({id:star.id,template_id:star.templateId,object_id:uid,pos:star.pos,bag_type:star.bag,grade:star.level,gp:star.xp})),starAdd:(saved?.cosmos?.slots??[]).map((slot,pos)=>({pos,grade:slot.grade}))},
    hide: !!army.hide,
  };
}
