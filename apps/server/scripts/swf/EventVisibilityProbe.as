package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var rows:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;var f:URLLoader=new URLLoader();requests.push(f);f.addEventListener("complete",function(e:Event):void{rows=JSON.parse(f.data).buttons;next();});f.load(new URLRequest(job.fixture));});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verifyVisibility():void {
   var Helper:Object=domain.getDefinition("ui.toptoolbar.TopBtnCheckShowHelper");
   var Template:Class=domain.getDefinition("yishi.datas.templates.TopToolBtnTempInfo") as Class;
   var count:int=0;var children:int=0;
   for each(var row:Object in rows){var item:Object=new Template();item.BtnKey=row.BtnKey;item.TemplateId=int(row.TemplateId);item.BoxType=int(row.BoxType);item.BoxTypeTo=int(row.BoxTypeTo);if(!Helper.instance.checkIsShow(item))throw new Error("Hidden configured event: "+row.BtnKey);count++;if(item.BoxTypeTo>0)children++;}
   if(count!=96||children!=7)throw new Error("Unexpected toolbar fixture "+count+"/"+children);
   if(Helper.instance.checkIsShow(null))throw new Error("Null template became visible");
   log("event-visibility-96-passed");log("event-grouping-seven-children-preserved");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){var c:Object=domain.getDefinition(name);log("verified "+name+" "+c);}verifyVisibility();}catch(e:Error){log("error "+e.toString()+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
 }
}
