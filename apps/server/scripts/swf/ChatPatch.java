import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.*;
import com.jpexs.decompiler.flash.abc.types.*;
import com.jpexs.decompiler.flash.abc.avm2.*;
import com.jpexs.decompiler.flash.abc.avm2.instructions.*;
import com.jpexs.decompiler.flash.tags.*;

/** Chat methods and the explicit battle-dispatch compatibility bridge only. */
class ChatPatch {
 static AVM2Instruction i(int op,int... args){return new AVM2Instruction(0,op,args);}
 static int member(ABC a,MethodBody b,String name){
  for(AVM2Instruction x:b.getCode().code)if(x.operands!=null&&x.operands.length>0&&Arrays.asList("getproperty","setproperty","getlex","callproperty","callpropvoid").contains(x.definition.instructionName)){
   int n=x.operands[0];if(name.equals(a.constants.getString(a.constants.getMultiname(n).name_index)))return n;
  }
  throw new IllegalStateException("Missing member "+name);
 }
 static class Code {
  AVM2Code c=new AVM2Code();Map<String,Integer> labels=new HashMap<>();Map<Integer,String> jumps=new HashMap<>();
  Code add(int op,int...a){c.code.add(i(op,a));return this;}
  Code label(String s){labels.put(s,c.code.size());return this;}
  Code branch(int op,String target){jumps.put(c.code.size(),target);return add(op,0);}
  int position(String label){int pos=0;for(int n=0;n<labels.get(label);n++)pos+=c.code.get(n).getBytesLength();return pos;}
  void install(MethodBody b,int stack,int regs){
   int[] pos=new int[c.code.size()+1];for(int n=0;n<c.code.size();n++)pos[n+1]=pos[n]+c.code.get(n).getBytesLength();
   for(var j:jumps.entrySet())c.code.get(j.getKey()).operands[0]=pos[labels.get(j.getValue())]-pos[j.getKey()+1];
   b.setCode(c);b.max_stack=Math.max(stack,b.max_stack);b.max_regs=Math.max(regs,b.max_regs);b.exceptions=new ABCException[0];b.setModified();
  }
 }
 public static void main(String[] args)throws Exception{
  SWF swf=new SWF(new FileInputStream(args[0]),true);int changes=0;
  for(ScriptPack p:swf.getAS3Packs()){
   String cls=p.getClassPath().toString();ABC a=p.abc;
   if(cls.equals("chat.ChatModel")){
    MethodBody b=a.findBodyByClassAndName("ChatModel","getChatsByOutputChannel");
    MethodBody setter=null;
    // Resolve private slot from this class' existing setter code, not a guessed namespace.
    for(MethodBody m:a.bodies){try{member(a,m,"_currentOutChannel");member(a,m,"_filterChannels");setter=m;break;}catch(Exception ignored){}}
    if(setter==null)throw new IllegalStateException("Missing channel setter");
    int channel=member(a,setter,"_currentOutChannel"),all=member(a,b,"allChats");
    int late=0,vector=0,chat=0;
    for(AVM2Instruction x:b.getCode().code)if(x.operands!=null&&x.operands.length>0){
     if(x.definition.instructionName.equals("getproperty")&&a.constants.getMultiname(x.operands[0]).kind==0x1b)late=x.operands[0];
     if(x.definition.instructionName.equals("getlex")){
      String name=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);
      if(name.equals("Vector"))vector=x.operands[0];if(name.equals("ChatData"))chat=x.operands[0];
     }
    }
    if(late==0||vector==0||chat==0)throw new IllegalStateException("Missing original vector operands");
    int length=a.constants.getPublicQnameId("length",true),push=a.constants.getPublicQnameId("push",true),dataChannel=a.constants.getPublicQnameId("channel",true);
    new Code().add(0xd0).add(0x30).add(0x60,vector).add(0x60,chat).add(0x53,1).add(0x24,0).add(0x42,1).add(0xd5).add(0x24,0).add(0xd6)
     .label("loop").add(0x09).add(0xd2).add(0xd0).add(0x66,all).add(0x66,length).branch(0x18,"end")
     .add(0xd0).add(0x66,channel).add(0x24,0).branch(0x13,"take")
     .add(0xd0).add(0x66,all).add(0xd2).add(0x66,late).add(0x66,dataChannel).add(0xd0).add(0x66,channel).branch(0x14,"next")
     .label("take").add(0xd1).add(0xd0).add(0x66,all).add(0xd2).add(0x66,late).add(0x4f,push,1)
     .label("next").add(0xc2,2).branch(0x10,"loop").label("end").add(0xd1).add(0x48).install(b,4,3);
    ((Tag)a.parentTag).setModified(true);changes++;
   }
   if(cls.equals("chat.view.ChatOutputViewII")){
    MethodBody b=a.findBodyByClassAndName("ChatOutputViewII","checkShow");
    int model=member(a,b,"model"),out=member(a,b,"currentOutChannel"),channel=member(a,b,"channel");
    new Code().add(0xd0).add(0x30).add(0xd0).add(0x66,model).add(0x66,out).add(0x24,0).branch(0x13,"yes")
     .add(0xd1).add(0x66,channel).add(0xd0).add(0x66,model).add(0x66,out).add(0xab).add(0x48)
     .label("yes").add(0x26).add(0x48).install(b,2,2);
    ((Tag)a.parentTag).setModified(true);changes++;
   }
   if(cls.equals("chat.view.ChatInputViewII")){
    MethodBody b=a.findBodyByClassAndName("ChatInputViewII","smallBugleHandler");
    int manager=member(a,b,"ChatManager"),instance=member(a,b,"instance"),send=member(a,b,"chatBySmallBugle"),text=member(a,b,"_text");
    int argc=0;for(AVM2Instruction x:b.getCode().code)if(x.definition.instructionName.equals("callpropvoid")&&x.operands[0]==send)argc=x.operands[1];
    if(argc<4||argc>5)throw new IllegalStateException("Unexpected global chat arguments: "+argc);
    Code c=new Code().add(0xd0).add(0x30).add(0x60,manager).add(0x66,instance);
    for(int n=1;n<=argc;n++)c.add(0x62,n);
    c.add(0x4f,send,argc).add(0xd0).add(0x66,text).add(0x2c,a.constants.getStringId("",true)).add(0x61,a.constants.getPublicQnameId("text",true)).add(0x47).install(b,argc+1,argc+1);
    ((Tag)a.parentTag).setModified(true);changes++;
   }
   if(cls.equals("chat.utils.ChatHelper")){
    MethodBody b=a.findBodyByClassAndName("ChatHelper","checkCanSend");boolean patched=false;
    for(AVM2Instruction x:b.getCode().code)if(x.definition.instructionName.equals("pushbyte")&&x.operands[0]==6){x.operands[0]=0;patched=true;break;}
    if(!patched)throw new IllegalStateException("Missing level gate");b.setModified();((Tag)a.parentTag).setModified(true);changes++;
   }
   if(cls.equals("yishi.manager.CoreTransactionManager")){
    MethodBody b=a.findBodyByClassAndName("CoreTransactionManager","handlerPreparePkg");
    MethodBody setup=a.findBodyByClassAndName("CoreTransactionManager","setup");
    int register=member(a,setup,"registerAllHandler"),handlers=member(a,b,"_handlerList"),code=member(a,b,"code"),type=member(a,b,"CreateGameTransaction");
    int msg=member(a,b,"msgPkg"),handle=member(a,b,"handlePackage"),late=0;
    for(AVM2Instruction x:b.getCode().code)if(x.operands!=null&&x.definition.instructionName.equals("getproperty")&&a.constants.getMultiname(x.operands[0]).kind==0x1b)late=x.operands[0];
    if(late==0)throw new IllegalStateException("Missing handler index");
    int send=a.constants.getQnameId("sendToURL",Namespace.KIND_PACKAGE,"flash.net",true);
    int request=a.constants.getQnameId("URLRequest",Namespace.KIND_PACKAGE,"flash.net",true);
    String diagnostic="http://127.0.0.1:8080/server/diagnostics/battle-client?phase=";
    Code c=new Code().add(0xd0).add(0x30).label("try")
     .add(0x5d,send).add(0x60,request).add(0x2c,a.constants.getStringId(diagnostic+"prepare",true)).add(0x42,1).add(0x4f,send,1)
     .add(0xd0).add(0x4f,register,0)
     .add(0xd0).add(0x66,handlers).add(0xd1).add(0x66,code).add(0x66,late).add(0x86,type).add(0xd7)
     .add(0xd3).branch(0x12,"end")
     .add(0xd3).add(0xd1).add(0x4f,a.constants.getPublicQnameId("configure",true),1)
     .add(0xd3).add(0xd2).add(0x4f,msg,1).add(0xd3).add(0x4f,handle,0)
     .add(0x5d,send).add(0x60,request).add(0x2c,a.constants.getStringId(diagnostic+"initialized",true)).add(0x42,1).add(0x4f,send,1)
     .label("end").add(0x47)
     .label("catch").add(0x63,4).add(0xd0).add(0x30)
     .add(0x5d,send).add(0x60,request).add(0x2c,a.constants.getStringId(diagnostic+"error&message=",true))
     .add(0x5d,a.constants.getPublicQnameId("encodeURIComponent",true)).add(0x62,4).add(0x46,a.constants.getPublicQnameId("getStackTrace",true),0)
     .add(0x46,a.constants.getPublicQnameId("encodeURIComponent",true),1).add(0xa0).add(0x42,1).add(0x4f,send,1)
     .add(0x62,4).add(0x03);
    c.install(b,7,5);
    ABCException ex=new ABCException();ex.start=c.position("try");ex.end=c.position("catch");ex.target=ex.end;ex.type_index=a.constants.getPublicQnameId("Error",true);ex.name_index=0;b.exceptions=new ABCException[]{ex};
    ((Tag)a.parentTag).setModified(true);changes++;
   }
   List<String> airMethods=switch(cls){
    case "yishi.datas.battle.ResourceModel" -> List.of("onNPComplete1","onNPComplete2","onNPComplete3","onNPComplete4","onNPComplete5","onNPComplete6","resistResourceLoadComplete","publicSkillLoadComplete","battleMapComplete");
    case "battle.view.GameView" -> List.of("__onComplete");
    case "yishi.datas.battle.BattleOtherResByteLoader" -> List.of("btyeLoadComplete");
    case "battle.skillsys.loader.SkillResourceLoader" -> List.of("skillLoadComplete");
    case "yishi.view.tools.PetFormationGameView" -> List.of("__onComplete");
    default -> List.of();
   };
   if(!airMethods.isEmpty()){
    for(String name:airMethods){
     MethodBody b=a.findBodyByClassAndName(p.getClassPath().className,name);boolean patched=false;
     member(a,b,"allowCodeImport");member(a,b,"loadBytes");
     var instructions=b.getCode().code;
     for(int n=0;n<instructions.size();n++){
      AVM2Instruction x=instructions.get(n);
      if(x.definition.instructionName.equals("getproperty")&&"isDebug".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index))){
       // Keep every offset unchanged: consume DisplayLoader and supply true to the existing permission branch.
       int bytes=x.getBytesLength();instructions.set(n,i(0x29));instructions.add(n+1,i(0x26));
       for(int z=2;z<bytes;z++)instructions.add(n+z,i(0x02));
       patched=true;break;
      }
     }
     if(!patched)throw new IllegalStateException("Missing AIR code-import gate in "+name);
     b.setModified();changes++;
    }
    ((Tag)a.parentTag).setModified(true);
   }
  }
  if(changes!=18)throw new IllegalStateException("Expected eighteen compatibility/chat methods, got "+changes);
  try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
