import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
class FarmAnimalImportPatch {
 public static void main(String[] args)throws Exception{SWF s=new SWF(new FileInputStream(args[0]),true);int found=0;boolean test=args.length>2;
 for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("farm.view.FarmAnimalItem")){var a=p.abc;
 if(!test){var b=a.findBodyByClassAndName("FarmAnimalItem","__onComplete");var code=b.getCode();int count=0,flag=a.constants.getPublicQnameId("allowCodeImport",true);
 for(int n=code.code.size()-1;n>=0;n--){var x=code.code.get(n);if(x.definition.instructionName.equals("callpropvoid")&&x.operands.length==2&&x.operands[1]==2&&a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index).equals("loadBytes")){b.insertAll(n,Arrays.asList(new AVM2Instruction(0,0x2a,new int[0]),new AVM2Instruction(0,0x26,new int[0]),new AVM2Instruction(0,0x61,new int[]{flag})));count++;}}
 if(count!=1)throw new IllegalStateException("Expected exactly one animal loadBytes");b.max_stack+=2;b.setModified();
 }else{ // Test copy only: constructor/field access; native import callback stays byte-identical.
 for(var info:a.instance_info)if(a.constants.getString(info.getName(a.constants).name_index).equals("FarmAnimalItem")){
 var ctor=a.findBody(info.iinit_index);AVM2Code c=new AVM2Code();for(int op:new int[]{0xd0,0x30,0xd0})c.code.add(new AVM2Instruction(0,op,new int[0]));c.code.add(new AVM2Instruction(0,0x49,new int[]{0}));c.code.add(new AVM2Instruction(0,0x47,new int[0]));ctor.setCode(c);ctor.setModified();
 for(var t:info.instance_traits.traits){String name=a.constants.getString(a.constants.getMultiname(t.name_index).name_index);if(name.equals("_loader")||name.equals("__onComplete"))a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(name,true)).namespace_index;}
 }}((Tag)a.parentTag).setModified(true);found++;}
 if(found!=1)throw new IllegalStateException("Expected farm animal class");try(var out=new FileOutputStream(args[1])){s.saveTo(out);}}
}
