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
  private function decode(hex:String):Object {
   var Packet:Class=domain.getDefinition("yishi.comm.PackageIn") as Class;
   var Prepare:Class=domain.getDefinition("com.road.yishi.proto.battle.BattlePrepareMsg") as Class;
   var packet:Object=new Packet();for(var i:int=0;i<hex.length;i+=2)packet.writeByte(parseInt(hex.substr(i,2),16));
   packet.position=0;packet.readHeader();return packet.readBody(new Prepare());
  }
  private function verify(fixture:Object):void {
   try {
    var Int64:Object=domain.getDefinition("battle.utils.Int64Utils");var failed:Boolean=false;
    try {Int64.int64ToNumber(decode(fixture.broken).heros[0].hp2);}catch(e:Error){failed=e.errorID==1009;log("baseline-missing-hp2 "+e);}
    if(!failed)throw new Error("Missing hp2 did not reproduce native null dereference");
    for each(var sample:Object in fixture.samples){
     var m:Object=decode(sample.packet);var own:int=0;
     for each(var h:Object in m.heros){
      if(Int64.int64ToNumber(h.hp)<=0||Int64.int64ToNumber(h.maxHp)<=0)throw new Error("Invalid native health");
      if(Int64.int64ToNumber(h.hp2)!=0||Int64.int64ToNumber(h.initHp2)!=0)throw new Error("Invalid secondary health");
      if(h.res===null||h.cloakPath===null||h.serverName===null)throw new Error("Missing native string defaults");
      if(h.userId==sample.uid&&h.side==m.side)own++;
     }
     if(own!=1)throw new Error("Native self hero identification failed");
     log("duel-native-prepare-passed uid="+sample.uid+" side="+m.side+" heroes="+m.heros.length);
    }
   }catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();
  }
 }
}
