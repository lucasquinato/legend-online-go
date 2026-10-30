import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.*;
import com.jpexs.decompiler.flash.abc.types.*;
import com.jpexs.decompiler.flash.abc.avm2.*;
import com.jpexs.decompiler.flash.abc.avm2.instructions.*;
import com.jpexs.decompiler.flash.tags.*;

// AIR rejects executable SWF bytes unless this exact LoaderContext permits code.
// Preserve the original renderer and insert only the missing context permission.
class FormationAirPatch {
 public static void main(String[] args) throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),true);int patched=0;
  for(ScriptPack pack:swf.getAS3Packs())if(pack.getClassPath().toString().equals("armyII.viewII.lineUp.LineUpFormationItem")){
   ABC abc=pack.abc;MethodBody body=abc.findBodyByClassAndName("LineUpFormationItem","__loadedCompleteHandler");
   AVM2Code code=body.getCode();int flag=abc.constants.getPublicQnameId("allowCodeImport",true);
   for(int i=code.code.size()-1;i>=0;i--){AVM2Instruction instruction=code.code.get(i);
    if(instruction.definition.instructionName.equals("callpropvoid") && instruction.operands.length==2 && instruction.operands[1]==2 && abc.constants.getString(abc.constants.getMultiname(instruction.operands[0]).name_index).equals("loadBytes")){
     // Stack is [loader, bytes, context]. Retain it for the original call.
     body.insertAll(i,Arrays.asList(new AVM2Instruction(0,0x2a,new int[0]),new AVM2Instruction(0,0x26,new int[0]),new AVM2Instruction(0,0x61,new int[]{flag})));
     body.max_stack+=2;body.setModified();patched++;
    }
   }
   ((Tag)abc.parentTag).setModified(true);
  }
  if(patched!=1)throw new IllegalStateException("Expected exactly one avatar loadBytes call, got "+patched);
  try(OutputStream output=new FileOutputStream(args[1])){swf.saveTo(output);}
  System.out.println("Patched formation avatar LoaderContext.allowCodeImport: "+patched);
 }
}
