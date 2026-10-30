package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];private var battleFixture:String;
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;battleFixture=job.battleFixture;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verifyFilters():void {
   var Model:Class=domain.getDefinition("chat.ChatModel") as Class;
   var Data:Class=domain.getDefinition("chat.datas.ChatData") as Class;
   log("chat-model-create");var model:Object=new Model();var channels:Array=[3,10,5,6,2,7,8,11,12,13,20];
   for each(var channel:int in channels){var item:Object=new Data();item.channel=channel;model.allChats.push(item);}
   for each(var selected:int in [0,3,10,5,6]){
    log("chat-filter-"+selected);model.currentOutChannel=selected;var rows:Object=model.getChatsByOutputChannel();
    var expected:int=selected==0?channels.length:1;
    if(rows.length!=expected)throw new Error("Wrong history size for "+selected+": "+rows.length);
    for each(var row:Object in rows)if(selected!=0&&row.channel!=selected)throw new Error("Channel leak "+selected);
   }
   // The client's input gates now admit a new character; level checks are verified by native code resolution and bytecode audit.
   log("chat-filters-passed");
   verifyBattleDispatch();
  }
  private function verifyBattleDispatch():void {
   var Packet:Class=domain.getDefinition("yishi.comm.PackageIn") as Class;
   var Prepare:Class=domain.getDefinition("com.road.yishi.proto.battle.BattlePrepareMsg") as Class;
   var Core:Object=domain.getDefinition("yishi.manager.CoreTransactionManager");
   var Battle:Object=domain.getDefinition("battle.BattleManager");
   var message:Object=new Prepare();message.battleId="native-dispatch-probe";
   var pkg:Object=new Packet();pkg.writeShort(0x71ab);pkg.writeShort(20);pkg.writeShort(0);pkg.writeShort(157);pkg.writeInt(1);pkg.writeInt(0);pkg.writeInt(0);
   message.writeExternal(pkg);pkg.position=0;pkg.readHeader();
   var reached:Boolean=false;
   try { Core.getInstance().handlerPackage(pkg); }
   catch(e:Error) {
    // This isolated probe has no gameplay template table; failing there is expected.
    var stack:String=e.getStackTrace()||"";
    reached=stack.indexOf("initBattleInfo")>=0 && Battle.getInstance().battleModel.battleId=="native-dispatch-probe";
    if(!reached)throw e;
   }
   if(!reached)throw new Error("Prepare dispatch did not reach battle initialization");
   log("battle-dispatch-passed");
  }
  private function verifyCosmos():void {
   var Army:Object=domain.getDefinition("yishi.manager.ArmyManager");
   var Stars:Object=domain.getDefinition("yishi.manager.StarManager");
   var Info:Class=domain.getDefinition("mvc.module.star.StarInfo") as Class;
   var Template:Class=domain.getDefinition("yishi.datas.templates.StarTemplate") as Class;
   var manager:Object=Stars.instance;manager.setup();Army.instance.thane.grades=80;
   var incoming:Object=new Info();incoming.template=new Template();incoming.template.Profile=7;incoming.template.MasterType=17;incoming.bagType=1;incoming.pos=0;
   // No quest log, no profession state. Compound must select the tenth slot even though ninth is locked.
   var selected:int=-1;try{manager.moveToEquip(incoming);}catch(slot:*){if(!(slot is int))throw slot;selected=int(slot);}
   if(selected!=9)throw new Error("Compound selected wrong slot without ninth quest: "+selected);
   incoming.template.MasterType=200;
   for(var pos:int=0;pos<8;pos++){
    var equipped:Object=new Info();equipped.template=new Template();equipped.template.Profile=5;equipped.template.MasterType=100+pos;equipped.bagType=2;equipped.pos=pos;
    manager.startList.add(pos,equipped);
   }
   selected=-1;try{manager.moveToEquip(incoming);}catch(target:*){if(!(target is int))throw target;selected=int(target);}
   if(selected!=9)throw new Error("Normal Cosmo selected wrong slot without ninth quest: "+selected);
   // A crit+penetration already equipped must not reject magic+penetration or attack+penetration.
   var crit:Object=new Info();crit.template=new Template();crit.template.Profile=7;crit.template.MasterType=19;crit.bagType=2;crit.pos=8;
   manager.startList.clear();manager.startList.add(8,crit);
   for each(var compoundType:int in [17,18]){
    incoming.template.MasterType=compoundType;selected=-1;
    try{manager.moveToEquip(incoming);}catch(compoundSlot:*){if(!(compoundSlot is int))throw compoundSlot;selected=int(compoundSlot);}
    if(selected!=9)throw new Error("Different penetration families conflicted: "+compoundType+" / 19");
   }
   log("cosmos-compound-families-passed");
   log("cosmos-slot-ten-behavior-passed");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){var c:Object=domain.getDefinition(name);log("verified "+name+" "+c);}if(battleFixture){verifyBattleImports();return;}verifyCosmos();verifyFilters();}catch(e:Error){log("error "+e.toString()+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
  private function verifyBattleImports():void {
   var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";
   bytes.addEventListener("complete",function(e:Event):void {
    try {
     var Resource:Class=domain.getDefinition("yishi.datas.battle.ResourceModel") as Class;
     var Info:Class=domain.getDefinition("com.pickgliss.loader.data.LoaderInfo") as Class;
     var View:Class=domain.getDefinition("battle.view.GameView") as Class;
     var Battle:Object=domain.getDefinition("battle.BattleManager");
     var model:Object=new Resource();Battle.getInstance().resourceModel=model;
     var info:Object=new Info();info.url="native-battle-fixture";model.addMultiClassResourcePath(info.url);
     model.__test_publicSkillLoadComplete(info,bytes.data);
     setTimeout(function():void {
      try {
       var content:Object=model.getInstanceByDefinition("BattleImportFixture");
       if(!("importMarker" in content)||content.importMarker!="battle-import-fixture")throw new Error("Skill bytecode was not imported");
       var Skills:Object=domain.getDefinition("battle.skillsys.loader.SkillResourceLoader");
       var skillModel:Object=new Resource();Battle.getInstance().resourceModel=skillModel;
       info.url="native-skill-fixture";skillModel.addMultiClassResourcePath(info.url);
       Skills.__test_skillLoadComplete(info,bytes.data);
       setTimeout(function():void {
        try {
         var skillContent:Object=skillModel.getInstanceByDefinition("BattleImportFixture");
         if(!("importMarker" in skillContent)||skillContent.importMarker!="battle-import-fixture")throw new Error("Skill effect bytecode was not imported");
         log("skill-effect-import-passed");
         var view:Object=new View(false);libs.push(view);view.data=new Sprite();
         view.onComplete=function():void {log("battle-resource-imports-passed");quit();};
         view.__test___onComplete(info,bytes.data);
        } catch(error:Error){log("error "+error+" "+error.getStackTrace());quit();}
       },300);
      } catch(error:Error){log("error "+error+" "+error.getStackTrace());quit();}
     },300);
    } catch(error:Error){log("error "+error+" "+error.getStackTrace());quit();}
   });
   bytes.load(new URLRequest(battleFixture));
  }
 }
}
