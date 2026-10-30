import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
/** Test-copy dependency fixtures; copies the production gate expressions unchanged. */
class SoulSealTestAliases{
 static AVM2Instruction i(int op,int...a){return new AVM2Instruction(0,op,a);}
 static AVM2Code code(List<AVM2Instruction> list){AVM2Code c=new AVM2Code();c.code.addAll(list);return c;}
 public static void main(String[] args)throws Exception{
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var p:s.getAS3Packs()){
   if(p.getClassPath().toString().equals("armyII.viewII.equip.EquipView")){
    var a=p.abc;var b=a.findBodyByClassAndName("EquipView","refreshView");var old=b.getCode();old.markOffsets();int start=-1,end=-1;
    for(int n=2;n<old.code.size();n++)if(old.code.get(n).definition.instructionName.equals("pushbyte")){
     if(old.code.get(n).operands[0]==35)start=n-2;
     if(start>=0&&old.code.get(n).operands[0]==55){end=n-2;break;}
    }
    if(start<0||end<start)throw new Error("Inventory seal block not found");
    Map<Long,Integer> offsets=new HashMap<>();
    List<AVM2Instruction> out=new ArrayList<>(List.of(i(0xd0),i(0x30)));Map<Integer,Long> jumps=new HashMap<>();
    for(int n=start;n<end;n++){
     var x=old.code.get(n);offsets.put(x.getAddress(),out.size());int op=x.definition.instructionCode;int[] args1=x.operands==null?new int[0]:x.operands.clone();
     if(op>=0x0c&&op<=0x1a)jumps.put(out.size(),x.getAddress()+x.getBytesLength()+x.operands[0]);
     if(x.definition.instructionName.equals("getlex")){
      String name=a.constants.getString(a.constants.getMultiname(args1[0]).name_index);
      if(Set.of("_strip1","_jewelSuitBtn","_seniorJewelSuitBtn","_jewelJSuitLevel").contains(name)){out.add(i(0xd0));op=0x66;args1[0]=a.constants.getPublicQnameId("__test"+name,true);}
     }out.add(i(op,args1));
    }
    offsets.put(old.code.get(end).getAddress(),out.size());out.add(i(0x47));int[] positions=new int[out.size()+1];for(int n=0;n<out.size();n++)positions[n+1]=positions[n]+out.get(n).getBytesLength();
    for(var jump:jumps.entrySet())out.get(jump.getKey()).operands[0]=positions[offsets.get(jump.getValue())]-positions[jump.getKey()+1];
    b.setCode(code(out));b.setModified();
    for(String getter:List.of("thane","playerInfo")){var g=a.findBodyByClassAndName("EquipView",getter);a.method_info.get(g.method_info).ret_type=0;g.setCode(code(List.of(i(0xd0),i(0x66,a.constants.getPublicQnameId("__test_"+getter,true)),i(0x48))));g.setModified();}
    for(var info:a.instance_info)if("EquipView".equals(a.constants.getString(info.getName(a.constants).name_index))){info.flags&=~1;var ctor=a.findBody(info.iinit_index);ctor.setCode(code(List.of(i(0xd0),i(0x30),i(0xd0),i(0x49,0),i(0x47))));ctor.setModified();
     for(var trait:info.instance_traits.traits)if(trait instanceof TraitMethodGetterSetter m&&"refreshView".equals(a.constants.getString(a.constants.getMultiname(trait.name_index).name_index)))m.name_index=a.constants.getPublicQnameId("__test_refresh",true);
    }((Tag)a.parentTag).setModified(true);count++;
   }
   if(p.getClassPath().toString().equals("armyII.viewII.equip.JewelFrame")){
   var a=p.abc;
   for(String name:List.of("initView","refreshView")){
    var b=a.findBodyByClassAndName("JewelFrame",name);var old=b.getCode().code;int start=-1,end=-1;
    if(name.equals("initView")){
     for(int n=0;n<old.size();n++){var x=old.get(n);if(x.definition.instructionName.equals("getproperty")&&"jewelGrades".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index))){start=n-1;for(int j=n+3;j<old.size();j++)if(old.get(j).definition.instructionName.equals("iffalse")&&!old.get(j-1).definition.instructionName.equals("dup")){end=j;break;}break;}}
    }else{
     for(int n=0;n<old.size();n++)if(old.get(n).definition.instructionName.equals("lessthan")){end=n+1;for(int j=n-1;j>=0;j--)if(old.get(j).definition.instructionName.equals("getproperty")&&"seniorStoreGrade".equals(a.constants.getString(a.constants.getMultiname(old.get(j).operands[0]).name_index))){start=j-1;break;}if(start>=0)break;}
    }
    if(start<0||end<start)throw new Error("Gate not found "+name);
    List<AVM2Instruction> list=new ArrayList<>(List.of(i(0xd0),i(0x30)));for(int n=start;n<end;n++){var x=old.get(n);list.add(i(x.definition.instructionCode,x.operands==null?new int[0]:x.operands.clone()));}list.add(i(0x48));b.setCode(code(list));a.method_info.get(b.method_info).ret_type=0;b.setModified();
   }
   for(String getter:List.of("thane","playerInfo")){var b=a.findBodyByClassAndName("JewelFrame",getter);a.method_info.get(b.method_info).ret_type=0;b.setCode(code(List.of(i(0xd0),i(0x66,a.constants.getPublicQnameId("__test_"+getter,true)),i(0x48))));b.setModified();}
   for(var info:a.instance_info)if("JewelFrame".equals(a.constants.getString(info.getName(a.constants).name_index))){info.flags&=~1;var ctor=a.findBody(info.iinit_index);ctor.setCode(code(List.of(i(0xd0),i(0x30),i(0xd0),i(0x49,0),i(0x47))));ctor.setModified();
    for(var trait:info.instance_traits.traits)if(trait instanceof TraitMethodGetterSetter m){String name=a.constants.getString(a.constants.getMultiname(trait.name_index).name_index);if("initView".equals(name)||"refreshView".equals(name))m.name_index=a.constants.getPublicQnameId(name.equals("initView")?"__test_gate":"__test_cap",true);}
   }((Tag)a.parentTag).setModified(true);count++;
  }
  }
  if(count!=2)throw new Error("Expected JewelFrame and EquipView");try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
