/** Explicit provisional balance authorized on 18/10/2026; replace here after verification. */
export const residencePolicy={unlockGold:10000000,unlockLevel:11,luxuryTarget:1000,furnitureDiamonds:100,furnitureLuxury:10,upgradeGold:1000000,maidDiamonds:200,maidDurationMs:43200*60000,
 animalDropPercent:20,animalGold:{2131260:500000,2131261:500000,2131262:1000000,2131263:500000,2131250:1000} as Record<number,number>,
 animalDrops:{2131260:2131267,2131261:2131268,2131262:2131266,2131263:2131265} as Record<number,number>,
 navigation:{restMs:10*60000,assistMs:10*60000,assistExpiryMs:600000,speedupDiamondsPerMinute:1,shopRefreshMs:4*3600000,
 qualityWeights:[50,25,15,8,2],fishingGold:5000,fishingCoins:2,fishingIntervalMs:20000,fishingDailyMax:30}};
export const furnitureFields=(row:Record<string,any>)=>({Luxury:Number(row.Luxury)>0?Number(row.Luxury):Number(row.Type)<=2?0:residencePolicy.furnitureLuxury*Math.max(1,Number(row.Grade)||1),NeedPoints:Number(row.NeedPoints)>0?Number(row.NeedPoints):residencePolicy.furnitureDiamonds});
export const animalShopRows=(base:Record<string,any>)=>Object.entries(residencePolicy.animalGold).map(([id,gold],i)=>({...base,Id:String(61001+i),ShopType:"6",Area:"62",ItemId:id,Gold:String(gold),Point:"0",GiftToken:"0",MazeCoin:"0",NeedGrades:"11",Sort:String(i+1)}));
