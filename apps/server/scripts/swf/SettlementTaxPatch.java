import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.tags.Tag;
class SettlementTaxPatch {
 public static void main(String[] args)throws Exception {
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("buildings.politics.view.LevyView")){
   var a=p.abc;var b=a.findBodyByClassAndName("LevyView","refreshView");var code=b.getCode();code.markOffsets();
   if(args.length==1){for(int n=0;n<code.code.size();n++){var x=code.code.get(n);String name="";if(x.operands!=null&&x.operands.length>0&&Set.of("getproperty","callproperty","getlex","setproperty").contains(x.definition.instructionName))name=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);System.out.println(n+" "+x+" "+name);}return;}
   if(code.code.size()!=109 || !code.code.get(43).definition.instructionName.equals("pushbyte") || code.code.get(43).operands[0]!=6)throw new IllegalStateException("Unexpected levy baseline");
   for(int n:new int[]{25,99}){var x=code.code.get(n);if(!x.definition.instructionName.equals("pushbyte")||x.operands[0]!=14)throw new IllegalStateException("Unexpected level gate");x.operands[0]=10;}
   int length=0;for(int n=40;n<97;n++)length+=code.code.get(n).getBytesLength();
   ArrayList<AVM2Instruction> replacement=new ArrayList<>();
   replacement.add(new AVM2Instruction(0,0x60,new int[]{a.constants.getQnameId("ResourceManager",Namespace.KIND_PACKAGE,"yishi.manager",true)}));
   for(String field:new String[]{"instance","gold","baseYield"})replacement.add(new AVM2Instruction(0,0x66,new int[]{a.constants.getPublicQnameId(field,true)}));
   replacement.add(new AVM2Instruction(0,0x73,new int[0]));replacement.add(new AVM2Instruction(0,0xd5,new int[0]));
   replacement.add(new AVM2Instruction(0,0xd1,new int[0]));replacement.add(new AVM2Instruction(0,0x70,new int[0]));replacement.add(new AVM2Instruction(0,0xd6,new int[0]));
   int used=0;for(var x:replacement)used+=x.getBytesLength();if(used>length)throw new IllegalStateException("Replacement too large");
   for(int n=used;n<length;n++)replacement.add(new AVM2Instruction(0,0x02,new int[0]));
   code.code.subList(40,97).clear();code.code.addAll(40,replacement);b.setCode(code);b.setModified();((Tag)a.parentTag).setModified(true);count++;
  }
  if(count!=1)throw new IllegalStateException("Expected one levy method");try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
