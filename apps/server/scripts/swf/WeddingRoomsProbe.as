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


  private function verify(fixture:Object):void{try{
   var F:Class=domain.getDefinition("marry.room.MarryRoomListFrame") as Class;
   var R:Class=domain.getDefinition("mvc.module.marry.MarryRoomInfo") as Class;
   var Panel:Class=domain.getDefinition("com.pickgliss.ui.controls.ScrollPanel") as Class;
   var Button:Class=domain.getDefinition("com.pickgliss.ui.controls.IconButton") as Class;
   log("room-before-frame");var f:Object=new F();log("room-before-init");f.initItem();log("room-after-init");
   if(f._itemList.length!=4)throw new Error("Wrong native card capacity");
   if(f._itemList[0]._info!==null){log("wedding-room-baseline-stale-cards-reproduced");quit();return;}
   log("room-before-controls");f._panel=new Panel();f._myBtn=new Button();log("room-after-controls");
   var rooms:Array=[];for(var n:int=0;n<6;n++){var r:Object=new R();r.userIdA=2000+n;r.userIdB=3000+n;r.nickNameA="Local"+n;r.property6=1;rooms.push(r);}
   f._infoList=rooms;log("room-before-refresh");f.refreshView();log("room-after-refresh");if(f._itemList.length!=6)throw new Error("Real local rooms were not added");
   for(n=0;n<6;n++)if(f._itemList[n]._info!==rooms[n])throw new Error("Wrong room assignment");
   f._infoList=[rooms[0]];f.refreshView();for(n=1;n<6;n++)if(f._itemList[n]._info!==null)throw new Error("Stale room card survived list reduction");
   f._infoList=[];f.refreshView();for(n=0;n<6;n++)if(f._itemList[n]._info!==null)throw new Error("Occupied room survived empty list");
   log("wedding-room-empty-grow-shrink-clear-passed");
  }catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();}
 }
}
