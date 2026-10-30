import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.tags.Tag;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.traits.*;
class WeddingFullWindowFixtures {
 static AVM2Instruction i(int op,int...x){return new AVM2Instruction(0,op,x);}static void code(com.jpexs.decompiler.flash.abc.types.MethodBody b,AVM2Instruction...x){if(b==null)throw new IllegalStateException("Missing fixture method");var c=new AVM2Code();c.code.addAll(List.of(x));b.setCode(c);b.max_stack=8;b.max_regs=Math.max(b.max_regs,5);b.setModified();}
 public static void main(String[]args)throws Exception{var s=new SWF(new FileInputStream(args[0]),true);for(var p:s.getAS3Packs()){var a=p.abc;String full=p.getClassPath().toString(),simple=p.getClassPath().className;int probe=a.constants.getPublicQnameId("MountRuntimeProbe",true);
  if(simple.equals("TempleteManager"))code(a.findBodyByClassAndName(simple,"getMarryQualityTemplateCate"),i(0xd0),i(0x30),i(0x60,probe),i(0x66,a.constants.getPublicQnameId("cate",true)),i(0x48));
  if(simple.equals("MarryQualityTemplateCate"))code(a.findBodyByClassAndName(simple,"getTempById"),i(0xd0),i(0x30),i(0x60,probe),i(0x66,a.constants.getPublicQnameId("quality",true)),i(0x48));
  if(simple.equals("TempleteManager"))code(a.findBodyByClassAndName(simple,"getTemplateByLevelAndType"),i(0xd0),i(0x30),i(0x20),i(0x48));
  if(simple.equals("LanguageMgr"))code(a.findBodyByClassAndName(simple,"GetTranslation"),i(0xd0),i(0x30),i(0xd1),i(0x48));
  if(simple.equals("PathManager"))code(a.findBodyByClassAndName(simple,"resourcePath"),i(0xd0),i(0x30),i(0x2c,a.constants.getStringId("http://127.0.0.1:8080/cdn/",true)),i(0x48));
  ((Tag)a.parentTag).setModified(true);
 }try(var out=new FileOutputStream(args[1])){s.saveTo(out);}}
}
