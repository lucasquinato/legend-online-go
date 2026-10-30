package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verifyFilters():void {
   var Handler:Object=domain.getDefinition("battle.handler.BufferHandler");
   var Damage:Class=domain.getDefinition("battle.data.DamageData") as Class;
   var Battle:Object=domain.getDefinition("battle.BattleManager");
   var Model:Class=domain.getDefinition("yishi.datas.BattleModel") as Class;
   Battle.getInstance().model=new Model();
   for each(var flag:int in [0,1]) {
    var damage:Object=new Damage();damage.extraData=flag;damage.damageValue=-750;damage.displayBlood=750;
    damage.target=42;damage.leftValue=10000;damage.bloodType=6;damage.hpMaxAdd=0;
    var attack:Object=Handler.__test_convert(damage,42);
    if(attack.extraData!=flag||attack.damageValue!=-750||attack.roleId!=42||attack.leftHp!=10000||attack.hpMaxAdd!=0)throw new Error("Healing conversion lost data");
   }
   log("critical-healing-conversion-passed");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){var c:Object=domain.getDefinition(name);log("verified "+name+" "+c);}verifyFilters();}catch(e:Error){log("error "+e.toString()+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
 }
}
