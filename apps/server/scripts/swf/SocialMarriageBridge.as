package {
 import flash.display.Sprite;import flash.utils.getDefinitionByName;
 public class MountRuntimeProbe extends Sprite {
  private static var data:Object;private static var listening:Boolean=false;private static var requested:Boolean=false;
  public static function adapt(model:Object):Object {
   setup();if(data)return wrap(data);
   return model.marriageData;
  }
  public static function ensureConfirmStyles():void {var F:Class=getDefinitionByName("com.pickgliss.ui.ComponentFactory") as Class;F.Instance.setup(new XML('<style name="marriage.local.confirm"><components><component classname="com.pickgliss.ui.image.ScaleFrameImage" stylename="asset.core.ringUpBack1" resourceLink="asset.core.ringUpBack,asset.core.ringUpBack,asset.core.ringUpBack,asset.core.ringUpBack" /></components></style>')); }
  private static function typed(name:String,value:Object):Object{var C:Class=getDefinitionByName("mvc.module.marry."+name) as Class;var out:Object=new C();for(var key:String in value)out[key]=value[key];return out;}
  private static function wrap(value:Object):Object{var D:Class=getDefinitionByName("mvc.module.marry.MarriageData") as Class;var out:Object=new D();out.userId=value.userId;out.type=value.type;out.ringInfo=typed("MarriageRingInfo",value.ringInfo);out.happyInfo=typed("MarriageHappyInfo",value.happyInfo);out.mateHappyInfo=typed("MarriageHappyInfo",value.mateHappyInfo);out.godTreeInfo=typed("MarriageGodTreeInfo",value.godTreeInfo);return out;}
  public static function state(model:Object):int {setup();return data?int(data.marriageState):int(model.selfMarryInfo.state);}
  public static function getMarryQualityCosts(id:int):int {var T:Class=getDefinitionByName("yishi.manager.TempleteManager") as Class;var q:Object=T.instance.getMarryQualityTemplateCate.getTempById(id);return q?int(q.Points):0;}
  private static function setup():void {if(!listening){var S:Class=getDefinitionByName("yishi.service.managers.SocketManager") as Class;S.instance.addEventListener("SLGSocketEvent49100",receive);listening=true;}if(!requested){requested=true;send(8759,1000);}}
  private static function receive(e:Object):void {var P:Class=getDefinitionByName("com.road.yishi.proto.simple.PropertyMsg") as Class;var r:Object=e.data.readBody(new P());data=JSON.parse(r.param4);var M:Class=getDefinitionByName("yishi.utils.MsgMan") as Class;M.notifyObserver("MarryEventType.MARRIAGE_DATA",data);}
  public static function send(code:int,op:int,p1:int=0,p2:int=0,text:String="",pay:int=0):void {var Out:Class=getDefinitionByName("yishi.comm.PackageOut") as Class;var P:Class=getDefinitionByName("com.road.yishi.proto.marriage.MarriageOpMsg") as Class;var S:Class=getDefinitionByName("yishi.service.managers.SocketManager") as Class;var body:Object=new P();body.opType=op;body.property1=p1;body.property2=p2;body.property3=text;body.payType=pay;S.instance.socket.sendProtobuffer(new Out(code),body);}
  public static function riseSatisfactory(item:int,count:int):void{send(8759,11,item,count);}
  public static function skillUse(value:String):void{send(8759,19,0,0,value);}
  public static function helpMateTrain(pay:int=0):void{send(8759,18,0,0,"",pay);}
  public static function findMates():void{send(8759,20);}
  public static function opMarryTree(op:int,pay:int=-1,value:int=-1):void{send(8773,op,value,0,"",pay);}
 }
}
