package {
 import flash.display.Sprite;
 import flash.display.Loader;
 import flash.system.ApplicationDomain;
 import flash.system.LoaderContext;
 import flash.net.URLLoader;
 import flash.net.URLRequest;
 import flash.events.Event;
 import flash.events.UncaughtErrorEvent;
 import flash.utils.getDefinitionByName;
 import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var domain:ApplicationDomain;
  private var plan:Object;
  private var retained:Array=[];
  public function MountRuntimeProbe() {
   domain=new ApplicationDomain(ApplicationDomain.currentDomain);
   loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",function(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();});
   json("http://127.0.0.1:18883/plan",function(p:Object):void{plan=p;next();});
  }
  private function json(url:String, done:Function):void {
   var u:URLLoader=new URLLoader();retained.push(u);
   u.addEventListener("complete",function(e:Event):void{done(JSON.parse(u.data));});u.load(new URLRequest(url));
  }
  private function log(s:String):void {var u:URLLoader=new URLLoader();retained.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void {setTimeout(function():void{var app:Object=getDefinitionByName("flash.desktop.NativeApplication");app.nativeApplication.exit(0);},500);}
  private function next():void {
   if(!plan.files.length){for each(var name:String in plan.classes)log("verified "+name+" "+domain.getDefinition(name));json(plan.fixture,verify);return;}
   var url:String=plan.files.shift();var u:URLLoader=new URLLoader();u.dataFormat="binary";retained.push(u);
   u.addEventListener("complete",function(e:Event):void{
    var l:Loader=new Loader();retained.push(l);var ctx:LoaderContext=new LoaderContext(false,domain);ctx.allowCodeImport=true;
    l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+url);next();});l.loadBytes(u.data,ctx);
   });u.load(new URLRequest(url));
  }


  public static var cate:Object;public static var quality:Object;
  private function verify(fixture:Object):void{var legacy:Boolean=false;try{
   var Ref:Object=domain.getDefinition("com.pickgliss.toplevel.StageReferance");Ref.setup(stage);var Layers:Object=domain.getDefinition("com.pickgliss.ui.LayerManager");Layers.Instance.setup(stage);
   var Factory:Object=domain.getDefinition("com.pickgliss.ui.ComponentFactory");for(var key:String in fixture.styles)Factory.Instance.setup(new XML(fixture.styles[key]));log("full-window-styles-ready");
   var Bridge:Class=domain.getDefinition("SocialMarriageBridge") as Class;legacy=!Bridge.hasOwnProperty("ensureConfirmStyles");
   var Cate:Class=domain.getDefinition("yishi.datas.templates.cate.MarryQualityTemplateCate") as Class;cate=new Cate(null);var T:Class=domain.getDefinition("yishi.datas.templates.MarryQualityData") as Class;
   var Manager:Object=domain.getDefinition("managers.MarryManager");Manager.instance.model.selfMarryInfo.userId=1826;Manager.instance.model.selfMarryInfo.state=1;
   var Q:Class=domain.getDefinition("mvc.module.marry.MarryQuality") as Class;var D:Class=domain.getDefinition("mvc.ModuleFrameInfo") as Class;
   for each(var id:int in [1,2,3,1]){quality=new T();for each(var row:Object in fixture.qualities)if(int(row.TemplateId)==id)for(key in row)if(key in quality)quality[key]=row[key];
    log("full-window-before-constructor-"+id);var f:Object=Factory.Instance.createComponentGroupByStylename("marry.quality.MarryConfirmFrame",true);if(f==null)throw new Error("Frame group prevented reopening");log("full-window-after-constructor-"+id);
    var q:Object=new Q();q.qualityId=id;q.payType=id==2?2:1;q.opType=5;var d:Object=new D();d.frameData=q;f.show(d);if(!f.parent||!f.visible||f.width<300||f.height<200)throw new Error("Native frame was not displayed");log("full-window-native-styled-confirmation-shown-"+id);f.dispose();
   }
   log("wedding-native-styled-three-qualities-reopen-passed");
  }catch(e:Error){if(legacy&&e.errorID==1009){log("wedding-native-style-baseline-missing-payment-label");}else log("error "+e+" "+e.getStackTrace());}quit();}
 }
}
