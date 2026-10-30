package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verify():void{
   var helper:Object=domain.getDefinition("yishi.utils.GoodsHelp");
   if(helper.getJewelEffecyByGrade(50)!=200||helper.getJewelEffecyByGrade(70)!=320||helper.getJewelEffecyByGrade(80)!=400)throw new Error("Ordinary soul changed");
   for(var g:int=80;g<=100;g++)if(helper.getSeniorJewelEffecyByGrade(g)!=400+5*(g-80))throw new Error("Advanced percentage incorrect "+g);
   log("advanced-soul-percent-passed");
   if(checks.indexOf("armyII.viewII.equip.JewelFrame")<0)return;
   var Frame:Class=domain.getDefinition("armyII.viewII.equip.JewelFrame") as Class;
   var view:Object=new Frame();
   view.__test_thane={grades:80,jewelGrades:80,seniorStoreGrade:80};view.__test_playerInfo={vocationGrades:0,vocationLevel:0};
   if(!view.__test_gate())throw new Error("Advanced soul requires profession");
   view.__test_thane.grades=79;if(view.__test_gate())throw new Error("Advanced soul below character 80");view.__test_thane.grades=80;
   view.__test_thane.jewelGrades=79;if(view.__test_gate())throw new Error("Ordinary soul requirement bypassed");view.__test_thane.jewelGrades=80;
   view.__test_thane.seniorStoreGrade=99;if(!view.__test_cap())throw new Error("Advanced soul blocked before 100");view.__test_thane.seniorStoreGrade=100;if(view.__test_cap())throw new Error("Advanced soul exceeds 100");
   log("advanced-soul-ui-gates-passed");
   if(checks.indexOf("armyII.viewII.equip.EquipView")>=0){
    var Bag:Class=domain.getDefinition("armyII.viewII.equip.EquipView") as Class;
    var bag:Object=new Bag();bag.__test_thane={grades:80,jewelGrades:80,seniorStoreGrade:80};bag.__test_playerInfo={vocationGrades:0};
    bag.__test_strip1={};bag.__test_jewelSuitBtn={};bag.__test_seniorJewelSuitBtn={};bag.__test_jewelJSuitLevel={};
    for each(var level:int in [80,81,93,100]){
     bag.__test_thane.seniorStoreGrade=level;bag.__test_refresh();
     if(!bag.__test_seniorJewelSuitBtn.visible||bag.__test_jewelSuitBtn.visible||bag.__test_jewelJSuitLevel.text!=String(level))throw new Error("Inventory advanced icon/level incorrect "+level);
    }
    bag.__test_thane.jewelGrades=79;bag.__test_refresh();
    if(bag.__test_seniorJewelSuitBtn.visible||!bag.__test_jewelSuitBtn.visible||bag.__test_jewelJSuitLevel.text!="79")throw new Error("Inventory ordinary seal changed");
    bag.__test_thane.jewelGrades=80;bag.__test_thane.grades=79;bag.__test_refresh();
    if(bag.__test_seniorJewelSuitBtn.visible||bag.__test_jewelJSuitLevel.text!="80")throw new Error("Inventory advanced icon below 80");
    log("advanced-soul-inventory-icon-level-passed");
   }
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){log("verified "+name+" "+domain.getDefinition(name));}verify();}catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});
   var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
 }
}
