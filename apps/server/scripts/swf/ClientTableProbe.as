package {
 import flash.display.Sprite;
 import flash.display.Loader;
 import flash.events.Event;
 import flash.events.UncaughtErrorEvent;
 import flash.net.URLLoader;
 import flash.net.URLRequest;
 import flash.system.ApplicationDomain;
 import flash.system.LoaderContext;
 import flash.utils.ByteArray;
 import flash.utils.setTimeout;
 import flash.desktop.NativeApplication;

 public class MountRuntimeProbe extends Sprite {
  private var domain:ApplicationDomain = new ApplicationDomain(ApplicationDomain.currentDomain);
  private var libraries:Array = [];
  private var requests:Array = [];
  private var plans:Array;
  private var checks:Array;
  private var fixture:String;
  private var loader:Object;
  public function MountRuntimeProbe() {
   loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError", uncaught);
   var u:URLLoader = new URLLoader(); requests.push(u);
   u.addEventListener("complete", function(e:Event):void {
    var p:Object=JSON.parse(u.data); plans=p.files; checks=p.classes; fixture=p.fixture; next();
   });
   u.load(new URLRequest("http://127.0.0.1:18883/plan"));
  }
  private function log(text:String):void { var u:URLLoader=new URLLoader(); requests.push(u); u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(text))); }
  private function quit():void { setTimeout(function():void { NativeApplication.nativeApplication.exit(0); },500); }
  private function uncaught(e:UncaughtErrorEvent):void { e.preventDefault(); log("uncaught "+e.error); quit(); }
  private function next():void {
   if(!plans.length) {
    try { for each(var name:String in checks) log("verified "+name+" "+domain.getDefinition(name)); loadFixture(); }
    catch(e:Error) { log("error "+e+" "+e.getStackTrace()); quit(); }
    return;
   }
   var path:String=plans.shift(); var l:Loader=new Loader(); libraries.push(l);
   l.uncaughtErrorEvents.addEventListener("uncaughtError",uncaught);
   l.contentLoaderInfo.addEventListener("complete",function(e:Event):void { log("loaded "+path); next(); });
   l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void { log("error "+e); quit(); });
   var context:LoaderContext=new LoaderContext(false,domain); context["allowCodeImport"]=true;
   var bytes:URLLoader=new URLLoader(); requests.push(bytes); bytes.dataFormat="binary";
   bytes.addEventListener("complete",function(e:Event):void { l.loadBytes(bytes.data,context); });
   bytes.load(new URLRequest(path));
  }
  private function loadFixture():void {
   var u:URLLoader=new URLLoader(); requests.push(u);
   u.addEventListener("complete",function(e:Event):void {
    try {
     var p:Object=JSON.parse(u.data);
     if(Math.abs(Number(p.oldHeader)-Number(p.actualPayloadBytes))<3000) throw new Error("Missing stale-header reproduction");
     log("stale-header-rejection-reproduced");
     var Base:Class=domain.getDefinition("com.pickgliss.loaderii.BaseLoaderII") as Class;
     var Info:Class=domain.getDefinition("com.pickgliss.loader.data.LoaderInfo") as Class;
     loader=new Base(); var info:Object=new Info(); info.oneselfSize=true; info.url=p.url;
     info.errorFun=function(a:*,b:*):void { log("error native loader rejected corrected bundle"); quit(); };
     loader.info=info;
     loader.addEventListener("complete",function(event:Event):void {
      try {
       var data:ByteArray=Object(event).data as ByteArray;
       if(!data) throw new Error("Native loader returned no tables");
       data.uncompress(); data.position=0;
       var version:uint=data.readUnsignedInt();
       var count:int=0;
       if(version!=uint(p.version)) throw new Error("Table version changed");
       while(data.bytesAvailable>0) {
        var n:int=data.readByte(); var name:String=data.readUTFBytes(n); var length:int=data.readInt();
        if(length<0||length>data.bytesAvailable) throw new Error("Invalid table record "+name);
        // Use AIR's E4X parser too: a complete download must contain valid table XML.
        var table:XML=new XML(data.readUTFBytes(length)); count++;
       }
       if(count!=int(p.tables)) throw new Error("Missing tables: "+count);
       log("native-table-loader-passed tables="+count+" bytes="+data.length);
      } catch(failure:Error) { log("error "+failure+" "+failure.getStackTrace()); }
      quit();
     });
     loader.startLoad(p.url);
    } catch(failure:Error) { log("error "+failure+" "+failure.getStackTrace()); quit(); }
   });
   u.load(new URLRequest(fixture));
  }
 }
}
