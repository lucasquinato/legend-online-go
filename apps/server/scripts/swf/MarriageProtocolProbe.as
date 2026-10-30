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

  private function packet(hex:String):Object {var Packet:Class=domain.getDefinition("yishi.comm.PackageIn") as Class;var p:Object=new Packet();for(var i:int=0;i<hex.length;i+=2)p.writeByte(parseInt(hex.substr(i,2),16));p.position=0;p.readHeader();return p;}
  private function verify(fixture:Object):void {try{
   var Data:Class=domain.getDefinition("com.road.yishi.proto.marriage.MarriageDataMsg") as Class;
   var Info:Class=domain.getDefinition("com.road.yishi.proto.marriage.MarriageMsg") as Class;
   var EventClass:Class=domain.getDefinition("yishi.events.SLGSocketEvent") as Class;
   var Socket:Object=domain.getDefinition("yishi.service.managers.SocketManager");
   var Manager:Object=domain.getDefinition("managers.MarryManager");
   var info:Object=packet(fixture.info).readBody(new Info());var QP:Class=domain.getDefinition("com.road.yishi.proto.marriage.MarriageProMsg") as Class;var quality:Object=packet(fixture.quality).readBody(new QP());if(quality.property2!=1||quality.property3!=1)throw new Error("Native pending consent fields differ");log("marriage-native-quality-packet-passed");
   if(info.userId!=1952||info.state!=3||info.nickName!="Social1952"||info.questCount!=7||info.answerNum!=1)throw new Error("Native marriage info fields differ");
   var NativeInfo:Class=domain.getDefinition("mvc.module.marry.MarryInfo") as Class;var dateInfo:Object=new NativeInfo();dateInfo.marriageTime=info.marriageTime;if(!isFinite(Number(dateInfo.marriageTime))||Number(dateInfo.marriageTime)<=0)throw new Error("Marriage date setter rejected wire format");dateInfo.marriageTime="1970-01-01 00:00:00";if(!isFinite(Number(dateInfo.marriageTime)))throw new Error("Empty engagement date is invalid");log("marriage-native-date-setter-passed");
   Manager.instance.setup();Socket.instance.dispatchEvent(new EventClass("SLGSocketEvent357",packet(fixture.data)));
   var m:Object=Manager.instance.model;
   if(m.marriangeState!=3||m.marriageData.userId!=1951||m.marriageData.ringInfo.ringGrade!=9||m.marriageData.ringInfo.ringSkill!="9999,9989"||m.marriageData.happyInfo.happyGrade!=4||m.marriageData.mateHappyInfo.happyGrade!=3)throw new Error("Native marriage model was not synchronized");
   var h:Object=packet(fixture.heart).readBody(new (domain.getDefinition("com.road.yishi.proto.marriage.MarriageHeartMsg") as Class)());
   if(h.curQuestion.options.length!=4||h.curQuestion.optionA!=-1||h.maxOrder!=10)throw new Error("Native heart fields differ");
   var RoomEnter:Class=domain.getDefinition("com.road.yishi.proto.room.RoomEnterMsg") as Class;
   var wr:Object=packet(fixture.weddingRoom).readBody(new RoomEnter());var hr:Object=packet(fixture.homeRoom).readBody(new RoomEnter());
   if(!wr.player[0].onlineState||wr.player[0].playerId!=1951||wr.player[0].campaignId!=4303||!hr.player[0].onlineState||hr.player[0].campaignId!=5601)throw new Error("Instance presence is invisible/offline in native decoder");
   var Nodes:Class=domain.getDefinition("com.road.yishi.proto.campaign.CampaignNodeListMsg") as Class;var nodes:Object=packet(fixture.weddingNodes).readBody(new Nodes());
   var Confirm:Class=domain.getDefinition("com.road.yishi.proto.campaign.CampaignConfirmMsg") as Class;var dialog:Object=packet(fixture.weddingDialog).readBody(new Confirm());
   if(nodes.node[0].campDataId!=3||nodes.node[1].campDataId!=8||dialog.nodeId!=nodes.node[0].campDataId||dialog.type!=11)throw new Error("Wedding NPC identity/dialog differs in native decoder");
   Socket.instance.dispatchEvent(new EventClass("SLGSocketEvent4674",packet(fixture.weddingState)));
   if(m.weddingInfo.property2!=3||m.weddingInfo.userIdA!=1951)throw new Error("Reception state is not synchronized");
   log("wedding-home-native-presence-npc-reception-passed");
   Socket.instance.dispatchEvent(new EventClass("SLGSocketEvent4656",packet(fixture.proposalAdd)));if(!m.proposeDic[1952])throw new Error("Native pending proposal was not added");
   Socket.instance.dispatchEvent(new EventClass("SLGSocketEvent4656",packet(fixture.proposalRemove)));if(m.proposeDic[1952])throw new Error("Native accepted proposal remained pending");
   var FrameManager:Object=domain.getDefinition("yishi.manager.EnterFrameManager");FrameManager.instance.setup(stage);
   Socket.instance.dispatchEvent(new EventClass("SLGSocketEvent4672",packet(fixture.carriage)));
   if(m.carList.length!=1||m.carList[0].userIdA!=1951||m.carList[0].userIdB!=1952||m.carList[0].jobA!=3||m.carList[0].jobB!=5||m.carList[0].pathInfo.length<2)throw new Error("Native carriage route or characters not initialized");
   var Exit:Class=domain.getDefinition("com.road.yishi.proto.room.RoomExitRspMsg") as Class;var exitInfo:Object=packet(fixture.exit).readBody(new Exit());if(exitInfo.playerId!=1951)throw new Error("Native scene exit targets another player");
   var Update:Class=domain.getDefinition("com.road.yishi.proto.campaign.CampaignNodeUpdateMsg") as Class;var cake:Object=packet(fixture.cake).readBody(new Update());if(cake.nodeId!=430302||cake.nodeState!=1||cake.sonType!=8002)throw new Error("Native reception visual update differs");
   log("wedding-native-proposal-cleared-carriage-exit-props-passed");
   log("marriage-native-protocol-and-model-passed");
  }catch(e:Error){log("error "+e+" "+e.getStackTrace());}quit();}
 }
}
