package {
 import flash.display.Sprite;import flash.display.Loader;import flash.system.LoaderContext;import flash.system.ApplicationDomain;import flash.net.URLLoader;import flash.net.URLRequest;import flash.events.Event;import flash.events.UncaughtErrorEvent;import flash.utils.getDefinitionByName;import flash.utils.setTimeout;
 public class MountRuntimeProbe extends Sprite {
  private var plans:Array;private var checks:Array;private var domain:ApplicationDomain;private var libs:Array=[];private var requests:Array=[];private var fixture:String;
  public function MountRuntimeProbe(){domain=new ApplicationDomain(ApplicationDomain.currentDomain);loaderInfo.uncaughtErrorEvents.addEventListener("uncaughtError",err);var u:URLLoader=new URLLoader();u.addEventListener("complete",function(e:Event):void{var job:Object=JSON.parse(u.data);plans=job.files;checks=job.classes;fixture=job.fixture;next();});u.load(new URLRequest("http://127.0.0.1:18883/plan"));}
  private function log(s:String):void{var u:URLLoader=new URLLoader();requests.push(u);u.load(new URLRequest("http://127.0.0.1:18883/log?text="+encodeURIComponent(s)));}
  private function quit():void{setTimeout(function():void{var c:Object=getDefinitionByName("flash.desktop.NativeApplication");c.nativeApplication.exit(0);},500);}
  private function err(e:UncaughtErrorEvent):void{e.preventDefault();log("uncaught "+e.error);quit();}
  private function verify():void {
   var Goods:Class=domain.getDefinition("yishi.datas.goods.GoodsInfo") as Class;
   var Controller:Class=domain.getDefinition("mvc.controler.StoreControler") as Class;
   var control:Object=new Controller();var ordinary:Object=new Goods();ordinary.templateId=1;
   if(ordinary.MOULD_MAX_GRADE!=80||ordinary.MOULD_MAX_RANK!=8)throw new Error("Wrong basic mould limits");
   ordinary.templateId=2;if(ordinary.MOULD_MAX_GRADE!=160||ordinary.MOULD_MAX_RANK!=16)throw new Error("Wrong advanced mould limits");
   for each(var special:int in [1170003,1170007,1180003,1180010]){ordinary.templateId=special;var cap:int=special%10000>=7?160:80;if(ordinary.MOULD_MAX_GRADE!=cap||ordinary.MOULD_MAX_RANK!=cap/10)throw new Error("Wrong halidom mould limit "+special);}
   var Check:Object=domain.getDefinition("bag.helper.GoodsCheck");var Hero:Class=domain.getDefinition("yishi.datas.playerinfo.ThaneInfo") as Class;var hero:Object=new Hero();hero.vocationGrades=0;
   for each(var family:int in [117,118])for(var tier:int=3;tier<=10;tier++){
    ordinary.templateId=family*10000+tier;
    hero.grades=79;if(Check.isVocationFix(hero,ordinary.templateInfo,false)||Check.isGradeFix(hero,ordinary.templateInfo,false))throw new Error("Halidom equipped before 80");
    hero.grades=80;if(!Check.isVocationFix(hero,ordinary.templateInfo,false)||!Check.isGradeFix(hero,ordinary.templateInfo,false)||!Check.isGradeFix(hero,ordinary.templateInfo,true))throw new Error("Halidom still requires advancement "+ordinary.templateId);
   }
   log("halidom-level-80-without-advancement-passed");
   for each(var id:int in [1,2,3,4]){ordinary.templateId=id;var allowed:Boolean=id==3;
    if(control.canReslove(ordinary)!=allowed||control.canShowForReslove(ordinary)!=allowed||control.checkSelectResolveItemValid(ordinary)!=allowed)throw new Error("Decomposition category leak "+id);
   }
   log("forge-behavior-passed");
  }
  private function next():void{
   if(!plans.length){try{for each(var name:String in checks){var c:Object=domain.getDefinition(name);log("verified "+name+" "+c);}verify();if(fixture){verifyAffixes();return;}}catch(e:Error){log("error "+e.toString()+" "+e.getStackTrace());}quit();return;}
   var p:String=plans.shift();var l:Loader=new Loader();libs.push(l);l.uncaughtErrorEvents.addEventListener("uncaughtError",err);l.contentLoaderInfo.addEventListener("complete",function(e:Event):void{log("loaded "+p);next();});l.contentLoaderInfo.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});var ctx:LoaderContext=new LoaderContext(false,domain);ctx["allowCodeImport"]=true;var bytes:URLLoader=new URLLoader();requests.push(bytes);bytes.dataFormat="binary";bytes.addEventListener("complete",function(e:Event):void{l.loadBytes(bytes.data,ctx);});bytes.load(new URLRequest(p));
  }
  private function verifyAffixes():void{
   var u:URLLoader=new URLLoader();requests.push(u);u.addEventListener("ioError",function(e:Event):void{log("error "+e);quit();});
   u.addEventListener("complete",function(e:Event):void{try{
    var rows:Object=JSON.parse(u.data);
    var Factory:Object=domain.getDefinition("yishi.utils.ClassFactory");
    var Skill:Class=domain.getDefinition("yishi.datas.templates.SkillTempInfo") as Class;
    var Property:Class=domain.getDefinition("yishi.datas.templates.SkillPropertyTempInfo") as Class;
    for each(var row:Object in rows.skills){var skill:Object=Factory.createInstanceIII(Skill,new XML(row.xml));if(skill.TemplateId!=row.id||skill.Grades!=row.stars||skill.TemplateName!=row.name||skill.MasterType!=row.pool)throw new Error("Skill table mismatch "+row.id);}
    for each(var entry:Object in rows.properties){var property:Object=Factory.createInstanceIII(Property,new XML(entry.xml));if(property.TemplateId!=entry.id||property[entry.field]!=entry.value||property.AddType!=1)throw new Error("Property table mismatch "+entry.id);}
    if(rows.skills.length!=rows.expectedCount||rows.properties.length!=rows.expectedCount)throw new Error("Incomplete progression fixture");
    log("affix-progression-runtime-passed");
   }catch(error:Error){log("error "+error+" "+error.getStackTrace());}quit();});u.load(new URLRequest(fixture));
  }
 }
}
