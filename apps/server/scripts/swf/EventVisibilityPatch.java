import java.io.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.avm2.AVM2Code;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.abc.types.ABCException;
import com.jpexs.decompiler.flash.tags.Tag;

/** Expose every configured toolbar entry for local inspection; keep click/game rules. */
class EventVisibilityPatch {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var pack:swf.getAS3Packs())if(pack.getClassPath().toString().equals("ui.toptoolbar.TopBtnCheckShowHelper")) {
   var body=pack.abc.findBodyByClassAndName("TopBtnCheckShowHelper","checkIsShow");
   if(body==null)throw new IllegalStateException("Missing visibility helper");
   AVM2Code code=new AVM2Code();
   // Boolean(template): show all actual rows, but keep null/undefined hidden.
   code.code.add(new AVM2Instruction(0,0xd0,new int[0]));
   code.code.add(new AVM2Instruction(0,0x30,new int[0]));
   code.code.add(new AVM2Instruction(0,0xd1,new int[0]));
   code.code.add(new AVM2Instruction(0,0x76,new int[0]));
   code.code.add(new AVM2Instruction(0,0x48,new int[0]));
   body.setCode(code);body.exceptions=new ABCException[0];body.setModified();
   ((Tag)pack.abc.parentTag).setModified(true);count++;
  }
  if(count!=1)throw new IllegalStateException("Expected one visibility method, found "+count);
  try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
