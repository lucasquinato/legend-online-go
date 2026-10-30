package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verify():void{
   var Army:Object=domain.getDefinition("yishi.manager.ArmyManager");
   var Frame:Class=domain.getDefinition("armyII.ArmyFrameII") as Class;
   var View:Class=domain.getDefinition("armyII.viewII.tattoo.TattooView") as Class;
   var frame:Object=new Frame();
   Army.instance.thane.vocationGrades=0;Army.instance.thane.grades=69;
   if(frame.__test_gate())throw new Error("Tatuagens abriram abaixo de 70");
   Army.instance.thane.grades=70;if(!frame.__test_gate())throw new Error("Tatuagens exigem profissão no nível 70");
   var view:Object=new View();view._isSelf=true;view._thaneInfo=null;Army.instance.thane.grades=79;
   view._imprintBtn={};view._imprintImage={};view._lockImage={};
   view.__test_model={holeInfoIIs:[],getHasImprintCount:function(a:Array):int{return 0;}};
   view.__test_imprint();if(view._imprintBtn.enable)throw new Error("Gravação abriu abaixo de 80");
   if(view._lockImage.tipData!="Gravações liberadas no nível 80.")throw new Error("Tooltip ainda exige missão");
   Army.instance.thane.grades=80;view.__test_imprint();if(!view._imprintBtn.enable||view._lockImage.visible)throw new Error("Gravação exige missão no nível 80");
   var levels:Array=[70,70,72,72,74,76,78,80];
   for(var i:int=0;i<8;i++){view.__test_index=i;if(view.__test_tip()!="nível "+levels[i])throw new Error("Tooltip de nível incorreto "+i);}
   view._isSelf=false;view._thaneInfo={tattooPrintHoles:[]};view.__test_imprint();
   if(view._imprintBtn.visible||!view._imprintImage.visible||view._lockImage.visible)throw new Error("Inspeção de outro personagem alterada");
   log("tattoo-self-view-null-safe-passed");
   log("tattoo-gates-behavior-passed");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){log("verified "+name+" "+domain.getDefinition(name));}verify();}catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});
   var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
 }
}
