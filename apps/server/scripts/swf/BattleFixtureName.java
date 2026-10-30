import java.io.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.*;
class BattleFixtureName {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),true);
  for(var pack:swf.getAS3Packs())if(pack.getClassPath().toString().equals("MountRuntimeProbe")){
   var abc=pack.abc;
   abc.constants.setString(abc.constants.getStringId("MountRuntimeProbe",false),"BattleImportFixture");
   ((Tag)abc.parentTag).setModified(true);
  }
  for(var tag:swf.getTags())if(tag instanceof SymbolClassTag symbols){
   for(int n=0;n<symbols.names.size();n++)if(symbols.names.get(n).equals("MountRuntimeProbe")){symbols.names.set(n,"BattleImportFixture");symbols.setModified(true);}
  }
  try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
