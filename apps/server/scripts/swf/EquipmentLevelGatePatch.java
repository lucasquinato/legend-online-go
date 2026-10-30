import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.tags.*;
/** Two explicit gates only: equipment refinement and halidom recipes unlock at 80. */
class EquipmentLevelGatePatch {
 public static void main(String[] args)throws Exception{
  SWF swf=new SWF(new FileInputStream(args[0]),true);int changes=0;
  for(ScriptPack p:swf.getAS3Packs()){
   String cls=p.getClassPath().toString();boolean bag=cls.equals("armyII.viewII.equip.EquipView"),compose=cls.equals("store.compose.ComposeSubListView");if(!bag&&!compose)continue;
   ABC a=p.abc;MethodBody b=a.findBodyByClassAndName(bag?"EquipView":"ComposeSubListView",bag?"refreshView":"refreshData");var code=b.getCode().code;int grades=-1,n=0;
   for(var x:code)if(x.definition.instructionName.equals("getproperty")&&"grades".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index)))grades=x.operands[0];
   if(grades<0)throw new IllegalStateException("Missing level property");
   for(int j=0;j<code.size()-1;j++){var x=code.get(j);var next=code.get(j+1);if(!x.definition.instructionName.equals("getproperty")||!"vocationGrades".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index)))continue;
    if(bag){var owner=code.get(j-1);if(owner.operands==null||owner.operands.length==0||!Set.of("getlex","getproperty").contains(owner.definition.instructionName)||!"thane".equals(a.constants.getString(a.constants.getMultiname(owner.operands[0]).name_index)))continue;}
    if(!next.definition.instructionName.equals("pushbyte")||next.operands[0]!=0)throw new IllegalStateException("Unexpected advancement gate");int len=x.getBytesLength();x.operands[0]=grades;next.operands[0]=79;if(x.getBytesLength()!=len)throw new IllegalStateException("Gate instruction size changed");n++;
   }
   if(n!=(bag?1:3))throw new IllegalStateException("Unexpected gate count "+n);b.setModified();((Tag)a.parentTag).setModified(true);changes++;
  }
  if(changes!=1)throw new IllegalStateException("Expected one gate method");try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}System.out.println("Equipment level-80 gates patched");
 }
}
