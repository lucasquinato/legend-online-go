import java.io.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;import com.jpexs.decompiler.flash.tags.Tag;
class NavigationShopPatch {
 public static void main(String[] args)throws Exception {
  SWF s=new SWF(new FileInputStream(args[0]),true);int changed=0;
  for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("view.subshop.NavigationShopFrame")){
   var a=p.abc;var b=a.findBodyByClassAndName("NavigationShopFrame","refreshView");var code=b.getCode();
   if(args.length==1){for(int i=0;i<code.code.size();i++){var x=code.code.get(i);String name="";if(x.operands!=null&&x.operands.length>0&&java.util.Set.of("getproperty","setproperty","getlex").contains(x.definition.instructionName))name=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);System.out.println(i+" "+x+" "+name);}return;}
   for(int i=0;i<code.code.size()-1;i++){
    var x=code.code.get(i);if(!x.definition.instructionName.equals("getlex"))continue;
    String field=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);var value=code.code.get(i+1);
    if(field.equals("_quickRefreshBtn")&&value.definition.instructionName.equals("pushfalse")){code.code.set(i+1,new AVM2Instruction(0,0x26,new int[0]));changed++;}
    if(field.equals("_freeRefreshBtn")&&value.definition.instructionName.equals("pushtrue")){code.code.set(i+1,new AVM2Instruction(0,0x27,new int[0]));changed++;}
   }
   b.setCode(code);b.setModified();((Tag)a.parentTag).setModified(true);
  }
  if(changed!=2)throw new IllegalStateException("Expected exactly two shop visibility flags; found "+changed);try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
