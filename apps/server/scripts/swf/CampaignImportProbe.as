package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];private var fixture:String;
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();requests.push(u);u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;fixture=job.battleFixture;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("error "+e.error);quit();}
  private function next():void{if(!plans.length){try{for each(var name:String in checks)log("verified "+name+" "+domain.getDefinition(name));test();}catch(e:Error){log("error "+e+" "+e.getStackTrace());quit();}return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var u:URLLoader=new URLLoader();requests.push(u);u.dataFormat="binary";u.addEventListener("complete",function(e:Event):void{l.loadBytes(u.data,ctx);});u.load(new URLRequest(p));}
  private function test():void{var u:URLLoader=new URLLoader();requests.push(u);u.dataFormat="binary";u.addEventListener("complete",function(e:Event):void{try{
   var View:Class=domain.getDefinition("map.campaign.mediator.singlecampaign.SingleCampaignNpcAvatarView") as Class;var Data:Class=domain.getDefinition("yishi.datas.templates.SingleCampaignDataTempInfo") as Class;var Info:Class=domain.getDefinition("com.pickgliss.loader.data.LoaderInfo") as Class;
   var view:Object=new View();libs.push(view);view._controller={monsterDefineDic:{}};view._data=new Data();view._data.ResPath="probe_missing_render";view.swfPath="probe-campaign-avatar";
   try{view.__loadedCompleteHandler(new Info(),u.data);}catch(failure:Error){if(failure.errorID==3226){log("baseline-campaign-import-3226-reproduced");quit();return;}throw failure;}
   var loader:Loader=view._loader as Loader;if(!loader)throw new Error("No native avatar loader");loader.contentLoaderInfo.addEventListener("complete",function(e:Event):void{try{if(!e.currentTarget.applicationDomain.hasDefinition("BattleImportFixture"))throw new Error("Fixture code missing");setTimeout(function():void{if(view._loader!==null)log("error Native completion callback did not release loader");else log("campaign-avatar-native-import-passed");quit();},200);}catch(error:Error){log("error "+error);quit();}},false,100);
  }catch(error:Error){log("error "+error+" "+error.getStackTrace());quit();}});u.load(new URLRequest(fixture));}
 }
}
