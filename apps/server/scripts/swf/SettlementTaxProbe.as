package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verify():void{
   var Frame:Class=domain.getDefinition("buildings.politics.view.LevyView") as Class;
   var Template:Class=domain.getDefinition("yishi.datas.templates.BuildingTempInfo") as Class;
   var Build:Class=domain.getDefinition("mvc.module.buildings.BuildInfo") as Class;
   var Buildings:Object=domain.getDefinition("yishi.manager.BuildingManager");Buildings.instance.setup();
   var hall:Object=new Build();hall.buildingId=1;hall.property1=0;hall.property2=5;
   var template:Object=new Template();template.SonType=901;template.Property1=5000000;hall.template=template;
   Buildings.instance.model.addBuildInfo(hall);
   var Army:Object=domain.getDefinition("yishi.manager.ArmyManager");Army.instance.thane.grades=80;
   var Resource:Object=domain.getDefinition("yishi.manager.ResourceManager");
   var view:Object=new Frame();view._levyBtn={};view._levyValueTxt={};view._levyGoldValueTxt={};
   for each(var amount:int in [500000,5000000,7000000,0]){
    Resource.instance.gold.synchronizationResource(amount,0,2147483647);
    view.refreshView();
    if(view._levyGoldValueTxt.htmlText!=String(amount))throw new Error("Tax preview divergence: "+view._levyGoldValueTxt.htmlText+" expected "+amount);
   }
   hall.property1=5;view.refreshView();if(view._levyBtn.enable)throw new Error("Daily tax cap ignored");
   hall.property1=0;Army.instance.thane.grades=10;Resource.instance.gold.synchronizationResource(500000,0,2147483647);view.refreshView();
   if(!view._levyBtn.enable||view._levyGoldValueTxt.htmlText!="500000")throw new Error("Level 10 taxes unavailable");
   log("settlement-tax-preview-passed");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){log("verified "+name+" "+domain.getDefinition(name));}verify();}catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});
   var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
 }
}
