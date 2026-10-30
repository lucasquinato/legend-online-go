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
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){var c:Object=domain.getDefinition(name);log("verified "+name+" "+c);}if(battleFixture){verifyBattleImports();return;}verifyFilters();}catch(e:Error){log("error "+e.toString()+" "+e.getStackTrace());}quit();return;}
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
         view.onComplete=function():void {
          log("battle-resource-imports-passed");
          try {
           var Formation:Class=domain.getDefinition("yishi.view.tools.PetFormationGameView") as Class;
           var FormationManager:Object=domain.getDefinition("managers.PetChallengeManager");
           var Templates:Object=domain.getDefinition("yishi.manager.TempleteManager");
           var Config:Class=domain.getDefinition("yishi.datas.templates.ConfigInfosTempInfo") as Class;
           var DictionaryClass:Class=getDefinitionByName("flash.utils.Dictionary") as Class;
           var configs:Object=new DictionaryClass();
           for each(var configName:String in ["Pet_Challenge_Default_Score_Line","Pet_Challenge_Count"]){var config:Object=new Config();config.ConfigName=configName;config.ConfigValue=configName=="Pet_Challenge_Count"?"10":"1,2,3";configs[configName]=config;}
           Templates.instance.__test_ConfigInfosBack(configs);
           // The isolated fixture has no logged-in player for setup's event subscriptions.
           // setup creates the real resource model before those subscriptions.
           try {FormationManager.instance.setup();} catch(setupError:Error) {if(!FormationManager.instance.model)throw setupError;}
           FormationManager.instance.model.addMultiClassResourcePath(info.url);
           var formation:Object=new Formation(false);libs.push(formation);formation.data=new Sprite();
           formation.onComplete=function():void {log("formation-preview-import-passed");quit();};
           formation.__test___onComplete(info,bytes.data);
          } catch(error:Error){log("error "+error+" "+error.getStackTrace());quit();}
         };
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
