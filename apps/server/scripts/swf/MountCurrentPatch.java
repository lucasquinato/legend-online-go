import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.tags.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;
class MountCurrentPatch {
 static int q(ABC abc,String pkg,String name){return abc.constants.getQnameId(name,Namespace.KIND_PACKAGE,pkg,true);}
 static AVM2Instruction ins(int opcode,int...args){return new AVM2Instruction(0,opcode,args);}
 public static void main(String[] args)throws Exception{
  SWF swf=new SWF(new FileInputStream(args[0]),true);int patched=0;
  for(ScriptPack p:swf.getAS3Packs())if(p.getClassPath().toString().equals("mounts.MountsFrame")){
   ABC abc=p.abc;MethodBody body=abc.findBodyByClassAndName("MountsFrame","__refiningSoulBtnHandler");AVM2Code code=new AVM2Code();
   code.code.addAll(Arrays.asList(ins(0xd0),ins(0x30),ins(0x60,q(abc,"com.pickgliss.utils","SoundManager")),ins(0x66,abc.constants.getPublicQnameId("instance",true)),ins(0x2c,abc.constants.getStringId("022",true)),ins(0x4f,abc.constants.getPublicQnameId("play",true),1),ins(0x60,q(abc,"yishi.manager","ArmyManager")),ins(0x66,abc.constants.getPublicQnameId("instance",true)),ins(0x66,abc.constants.getPublicQnameId("thane",true)),ins(0x66,abc.constants.getPublicQnameId("grades",true)),ins(0x24,80),ins(0x18,0),ins(0x60,q(abc,"yishi.view.tips","MessageTipManager")),ins(0x46,abc.constants.getPublicQnameId("instance",true),0),ins(0x2c,abc.constants.getStringId("Refino Espiritual de Fera exige nível 80.",true)),ins(0x4f,abc.constants.getPublicQnameId("show",true),1),ins(0x47),ins(0x60,q(abc,"com.pickgliss.ui","ComponentFactory")),ins(0x66,abc.constants.getPublicQnameId("Instance",true)),ins(0x2c,abc.constants.getStringId("mountrefiningsoul.MountRefiningSoulFrame",true)),ins(0x46,abc.constants.getPublicQnameId("creatComponentByStylename",true),1),ins(0x4f,abc.constants.getPublicQnameId("show",true),0),ins(0x47)));
   int jump=0;for(int i=12;i<17;i++)jump+=code.code.get(i).getBytesLength();code.code.get(11).operands[0]=jump;body.setCode(code);body.max_stack=Math.max(3,body.max_stack);((Tag)abc.parentTag).setModified(true);patched++;
  }
  if(patched!=1)throw new IllegalStateException("Expected exactly one current mount button");
  try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
