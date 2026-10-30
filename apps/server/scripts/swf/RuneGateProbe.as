package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verify():void{
   var Frame:Class=domain.getDefinition("armyII.viewII.rune.RuneItemView") as Class;
   var Upgrade:Class=domain.getDefinition("armyII.viewII.rune.RuneUpgradeView") as Class;
   var Template:Class=domain.getDefinition("yishi.datas.templates.RuneTemplateInfo") as Class;
   var Player:Class=domain.getDefinition("yishi.datas.playerinfo.PlayerInfo") as Class;
   var Manager:Object=domain.getDefinition("yishi.manager.PlayerManager");
   var Army:Object=domain.getDefinition("yishi.manager.ArmyManager");
   log("rune-fixture-player");var player:Object=new Player();player.vocationGrades=0;
   log("rune-fixture-manager");Manager.instance.__test_fixture={playerInfo:player};Army.instance.thane.grades=79;
   log("rune-fixture-templates");var template:Object=new Template();template.Level=1;
   var target:Object=new Template();target.NeedGrade=91;
   log("rune-fixture-view");var view:Object=new Frame();view._data={grade:1,templateInfo:template,nextTemplateInfo:target};
   if(view.__test_needShowAddBtn())throw new Error("Advanced rune opened below 80");
   Army.instance.thane.grades=80;
   if(!view.__test_needShowAddBtn())throw new Error("Advanced rune still requires profession at 80");
   view._data.grade=0;if(view.__test_needShowAddBtn())throw new Error("Unlearned rune bypassed");view._data.grade=1;
   view._data.nextTemplateInfo=null;if(view.__test_needShowAddBtn())throw new Error("Maximum rank bypassed");view._data.nextTemplateInfo=target;
   template.Level=0;target.NeedGrade=40;Army.instance.thane.grades=39;if(view.__test_needShowAddBtn())throw new Error("Basic prerequisite bypassed");Army.instance.thane.grades=40;if(!view.__test_needShowAddBtn())throw new Error("Basic prerequisite broken");
   Army.instance.thane.grades=80;log("rune-fixture-upgrade");var upgraded:int=0;var upgrade:Object=new Upgrade();upgrade._data={grade:9,nextTemplateInfo:target,runeCurGp:100,runeId:219};target.NeedGrade=91;target.NeedGp=100;
   upgrade.__test_fixture={sendUpgradeRune:function(id:int):void{if(id!=219)throw new Error("Wrong rune upgrade");upgraded++;}};
   upgrade.__test___upgradeBtnClickHandler(null);if(upgraded!=1)throw new Error("Full advanced XP bar blocked at 80");
   log("rune-level-80-behavior-passed");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){log("verified "+name+" "+domain.getDefinition(name));}verify();}catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});
   var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
 }
}
