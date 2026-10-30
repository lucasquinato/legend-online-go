package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verify():void{
   var Frame:Class=domain.getDefinition("appell.AppellFrame") as Class;
   var Template:Class=domain.getDefinition("yishi.datas.templates.AppellInfoTemplate") as Class;
   var Army:Object=domain.getDefinition("yishi.manager.ArmyManager");Army.instance.thane.appellId=11;
   var acquired:Object=new Template();acquired.TemplateId=11;acquired.Title="Guerreiro";acquired.isGet=true;
   var hidden:Object=new Template();hidden.TemplateId=12;hidden.Title="Glória\\nSuprema";hidden.isGet=false;
   var other:Object=new Template();other.TemplateId=13;other.Title="Mestre do Labirinto";other.isGet=true;
   log("title-create-frame");var view:Object=new Frame();var shown:Array=[];log("title-frame-created");
   var list:Object={};list.updateListView=function():void{};
   var vector:Object={};vector.clear=function():void{shown=[];};vector.append=function(row:Object):void{shown.push(row);};
   var panel:Object={};panel.vectorListModel=vector;panel.beginChanges=function():void{};panel.commitChanges=function():void{};panel.invalidateViewport=function():void{};panel.list=list;
   view._listPanel=panel;view._searchTxt={text:""};view._tipTxt={visible:true};view._lookAppellId=0;
   var model:Object={};model.getCurrentList=function():Array{return [acquired,other];};model.getListByType=function(type:int):Array{return [acquired,hidden,other];};view.__test_model=model;
   log("title-refresh-default");view.__test_refreshList(true);if(shown.length!=2||list.defaultSelectItemByCellValue!==acquired)throw new Error("Unfiltered tab changed");
   view._searchTxt.text="  GLORIA   SUPREMA  ";view._tipTxt.visible=false;view.__test_refreshList(true);
   if(shown.length!=1||shown[0]!==hidden||list.defaultSelectItemByCellValue!==hidden)throw new Error("Global accent/whitespace search or filtered selection failed");
   view._searchTxt.text="labirinto";view.__test_refreshList(true);if(shown.length!=1||shown[0]!==other||list.defaultSelectItemByCellValue!==other)throw new Error("Case-insensitive substring failed");
   view._searchTxt.text="zzzzz sem resultado";view.__test_refreshList(true);if(shown.length||list.defaultSelectItemByCellValue!==null)throw new Error("Empty search retained stale selection");
   view._searchTxt.text="";view._tipTxt.visible=true;view.__test_refreshList(true);if(shown.length!=2||list.defaultSelectItemByCellValue!==acquired||!acquired.isEquiped)throw new Error("Clearing search failed");
   log("title-search-behavior-passed");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){log("verified "+name+" "+domain.getDefinition(name));}verify();}catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});
   var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
 }
}
