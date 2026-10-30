import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Hide presentation entries only. Retain the original controls, recipes and other methods. */
class ForgeUiPatch {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),true);int patched=0;
  for(ScriptPack p:swf.getAS3Packs()) {
   String name=p.getClassPath().toString();
   if(!name.equals("store.ComposeView1")&&!name.equals("store.compose.ComposeSubListView"))continue;
   ABC a=p.abc;MethodBody b=a.findBodyByClassAndName(name.substring(name.lastIndexOf('.')+1),name.endsWith("ComposeView1")?"initView":"refreshData");AVM2Code c=b.getCode();c.markOffsets();
   if(args.length==1){for(int n=0;n<c.code.size();n++){var x=c.code.get(n);String operand="";if(x.operands!=null&&x.operands.length>0&&Arrays.asList("getproperty","setproperty","callpropvoid","callproperty","getlex").contains(x.definition.instructionName))operand=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);System.out.println(name+" "+n+" "+x.getAddress()+" "+x.definition.instructionName+" "+Arrays.toString(x.operands)+" "+operand);}continue;}
   byte[] bytes=b.getCodeBytes().clone();int changes=0;
   if(name.endsWith("ComposeView1")) {
    for(int n=0;n<c.code.size()-1;n++){var x=c.code.get(n);var next=c.code.get(n+1);
     if(!x.definition.instructionName.equals("getlex"))continue;
     String field=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);
     if(!Set.of("_theseusBtn","_revengeBtn").contains(field))continue;
     if(!next.definition.instructionName.equals("callpropvoid")||!a.constants.getString(a.constants.getMultiname(next.operands[0]).name_index).equals("push"))continue;
     if(next.getBytesLength()!=3||next.operands[1]!=1)throw new IllegalStateException("Unexpected tab push");
     int pos=(int)next.getAddress();bytes[pos]=0x29;bytes[pos+1]=0x29;bytes[pos+2]=0x02;changes++;
    }
    if(changes!=2)throw new IllegalStateException("Expected two hidden tabs");
   } else {
    long continuation=c.code.stream().filter(x->x.definition.instructionName.equals("hasnext2")).reduce((x,y)->y).orElseThrow().getAddress();
    for(int n=0;n<c.code.size()-1;n++){var x=c.code.get(n);var next=c.code.get(n+1);
     if(!x.definition.instructionName.equals("pushbyte")||!Set.of(100,105,115).contains(x.operands[0]))continue;
     if(!next.definition.instructionName.equals("setlocal")||next.operands[0]!=5||x.getBytesLength()+next.getBytesLength()!=4)throw new IllegalStateException("Unexpected equipment category");
     int pos=(int)x.getAddress(),delta=(int)continuation-pos-4;
     bytes[pos]=0x10;bytes[pos+1]=(byte)delta;bytes[pos+2]=(byte)(delta>>8);bytes[pos+3]=(byte)(delta>>16);changes++;
    }
    if(changes!=3)throw new IllegalStateException("Expected three hidden equipment categories");
   }
   b.setCodeBytes(bytes);b.getCode();b.setModified();((Tag)a.parentTag).setModified(true);patched++;
  }
  if(args.length>1){if(patched!=2)throw new IllegalStateException("Expected exactly two methods");try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}}
 }
}
