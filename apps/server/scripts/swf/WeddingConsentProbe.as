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


  public static var liveDomain:ApplicationDomain;public static var quality:Object;public static var cate:Object;public static var answers:Array=[];
  public static function answer(accepted:Boolean):void{answers.push(accepted);}
  public static function makeControl(key:String):Object{var name:String=key.indexOf("rewardItem")>=0?"yishi.view.community.BaseItemView":key.indexOf("rewardIcon")>=0?"yishi.view.community.BaseIconView":key.indexOf("priceNum")>=0?"": "com.pickgliss.ui.text.FilterFrameText";if(name=="")return new flash.display.BitmapData(1,1);var C:Class=liveDomain.getDefinition(name) as Class;return new C();}
  private function verify(fixture:Object):void{try{
   liveDomain=domain;var Cate:Class=domain.getDefinition("yishi.datas.templates.cate.MarryQualityTemplateCate") as Class;cate=new Cate(null);var F:Class=domain.getDefinition("marry.quality.MarryConfirmFrame") as Class;var Q:Class=domain.getDefinition("mvc.module.marry.MarryQuality") as Class;var T:Class=domain.getDefinition("yishi.datas.templates.MarryQualityData") as Class;var Text:Class=domain.getDefinition("com.pickgliss.ui.text.GradientText") as Class;var Manager:Object=domain.getDefinition("managers.MarryManager");Manager.instance.model.selfMarryInfo.userId=1952;Manager.instance.model.selfMarryInfo.state=1;
   for(var id:int=1;id<=3;id++){quality=new T();quality.TemplateId=id;quality.Points=1200;var q:Object=new Q();q.qualityId=id;q.payType=1;q.opType=5;var f:Object=new F();f._quality=q;f._noblePriceText=new Text();f._commonPriceText=new Text();f._kiloPrice=new Sprite();log("consent-before-preview-"+id);try{f.addReward();}catch(e:Error){if(e.message=="legacy-cloth-preview"){log("wedding-consent-baseline-zero-cloth-reproduced");quit();return;}throw e;}if(!f._rewardList||f._rewardList.length<5)throw new Error("Incomplete native confirmation rewards");f.dispose();if(answers.length)throw new Error("Frame replacement declined ceremony");}
   // Native handlers must submit exactly one explicit answer for accept/close.
   log("consent-before-accept");q=new Q();q.qualityId=1;q.payType=1;q.opType=5;f=new F();f._quality=q;f.__confirmBtnHandler(null);if(answers.length!=1||answers[0]!==true)throw new Error("Accept sent an extra decline");answers=[];
   log("consent-before-close");q=new Q();q.opType=5;f=new F();f._quality=q;var E:Class=domain.getDefinition("com.pickgliss.events.FrameEvent") as Class;f.__frameResponse(new E(0));if(answers.length!=1||answers[0]!==false)throw new Error("Explicit close did not decline");answers=[];
   log("consent-before-split");q=new Q();q.opType=5;q.payType=2;f=new F();f._quality=q;f.singlePayAlertBack(true,false);if(answers.length!=1||answers[0]!==true)throw new Error("Split payment consent sent duplicate answer");
   log("wedding-consent-preview-accept-close-replace-passed");
  }catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();}
 }
}


