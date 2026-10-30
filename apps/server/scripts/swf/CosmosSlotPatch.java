import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Only slot-ten gates; preserves advancement gates on refinement and Sacred Cosmos. */
class CosmosSlotPatch {
 static AVM2Instruction i(int op,int...a){return new AVM2Instruction(0,op,a);}
 static int member(ABC a,MethodBody b,String name){for(var x:b.getCode().code)if(x.operands!=null&&x.operands.length>0&&Set.of("getlex","getproperty","callproperty","callpropvoid").contains(x.definition.instructionName)){int n=x.operands[0];if(name.equals(a.constants.getString(a.constants.getMultiname(n).name_index)))return n;}throw new IllegalStateException("Missing "+name);}
 static class Edit {
  List<AVM2Instruction> list=new ArrayList<>();Map<String,Integer> labels=new HashMap<>();Map<Integer,String> jumps=new HashMap<>();
  Edit add(int op,int...a){list.add(i(op,a));return this;}Edit label(String name){labels.put(name,list.size());return this;}Edit branch(int op,String target){jumps.put(list.size(),target);return add(op,0);}
  Edit level(ABC a,MethodBody b,int threshold,int compare){return add(0x60,member(a,b,"thane")).add(0x66,member(a,b,"grades")).add(0x24,threshold).add(compare);}
  Edit ninth(ABC a,MethodBody b){return add(0x60,member(a,b,"TaskManage")).add(0x66,member(a,b,"instance")).add(0x25,1802).add(0x46,member(a,b,"IsTaskFinish"),1);}
 }
 record Range(int end,Edit edit){}
 static void apply(MethodBody b,Map<Integer,Range> changes,Map<Integer,Integer> redirects){
  if(b.exceptions.length!=0)throw new IllegalStateException("Unexpected exceptions");
  AVM2Code old=b.getCode();old.markOffsets();Map<Integer,Integer> byOffset=new HashMap<>();for(int n=0;n<old.code.size();n++)byOffset.put((int)old.code.get(n).getAddress(),n);byOffset.put((int)old.getEndOffset(),old.code.size());
  Edit out=new Edit();
  for(int n=0;n<old.code.size();){out.label("old"+n);Range r=changes.get(n);if(r!=null){int start=out.list.size();out.list.addAll(r.edit.list);for(var l:r.edit.labels.entrySet())out.labels.put(l.getKey(),start+l.getValue());for(var j:r.edit.jumps.entrySet())out.jumps.put(start+j.getKey(),j.getValue());n=r.end;continue;}
   var x=old.code.get(n);int op=x.definition.instructionCode;if(op==0x1b)throw new IllegalStateException("Unexpected switch");
   if(op>=0x0c&&op<=0x1a){int target=byOffset.get((int)x.getAddress()+x.getBytesLength()+x.operands[0]);out.branch(op,"old"+redirects.getOrDefault(n,target));}else out.list.add(i(op,x.operands==null?new int[0]:x.operands.clone()));n++;
  }
  out.label("old"+old.code.size());int[] pos=new int[out.list.size()+1];for(int n=0;n<out.list.size();n++)pos[n+1]=pos[n]+out.list.get(n).getBytesLength();
  for(var j:out.jumps.entrySet()){Integer target=out.labels.get(j.getValue());if(target==null)throw new IllegalStateException("Branch into replaced range: "+j.getValue());out.list.get(j.getKey()).operands[0]=pos[target]-pos[j.getKey()+1];}
  AVM2Code code=new AVM2Code();code.code.addAll(out.list);b.setCode(code);b.max_stack=Math.max(b.max_stack,12);b.setModified();
 }
 static MethodBody setter(ABC a,String clazz,String name){for(var info:a.instance_info)if(clazz.equals(a.constants.getString(info.getName(a.constants).name_index)))for(var trait:info.instance_traits.traits)if(trait instanceof com.jpexs.decompiler.flash.abc.types.traits.TraitMethodGetterSetter m && m.kindType==3 && name.equals(a.constants.getString(a.constants.getMultiname(m.name_index).name_index)))return a.findBody(m.method_info);throw new IllegalStateException("Missing setter "+clazz+"."+name);}
 public static void main(String[] args)throws Exception{
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(ScriptPack p:s.getAS3Packs()){
   ABC a=p.abc;String cls=p.getClassPath().toString();
   if(cls.equals("yishi.manager.StarManager")){
    MethodBody b=a.findBodyByClassAndName("StarManager","moveToEquip");if(b.getCode().code.size()!=403)throw new IllegalStateException("Unexpected StarManager baseline");
    Map<Integer,Range> changes=new HashMap<>();
    // Count ninth and tenth independently: ninth keeps quest 1802 + level 60.
    changes.put(51,new Range(79,new Edit().ninth(a,b).branch(0x12,"countTen").level(a,b,60,0xb0).branch(0x12,"countTen").add(0x62,9).add(0x24,1).add(0xa0).add(0x73).add(0x63,9).label("countTen").level(a,b,80,0xb0).branch(0x12,"old79").add(0x62,9).add(0x24,1).add(0xa0).add(0x73).add(0x63,9)));
    // Build the normal free-slot list from open slots only, including slot ten without the ninth quest.
    changes.put(142,new Range(145,new Edit().add(0x62,6).add(0x24,8).branch(0x13,"freeEight").add(0x62,6).add(0x24,9).branch(0x13,"freeTen").add(0x60,member(a,b,"thane")).add(0x66,member(a,b,"grades")).add(0x62,6).add(0x24,1).add(0xa0).add(0x24,10).add(0xa2).branch(0x15,"old145").branch(0x10,"freeTake").label("freeEight").ninth(a,b).branch(0x12,"old145").level(a,b,60,0xb0).branch(0x12,"old145").branch(0x10,"freeTake").label("freeTen").level(a,b,80,0xb0).branch(0x12,"old145").label("freeTake").add(0xd3).add(0x62,6).add(0x4f,member(a,b,"push"),1)));
    changes.put(176,new Range(188,new Edit().level(a,b,80,0xb0)));
    changes.put(222,new Range(233,new Edit().level(a,b,80,0xb0)));
    changes.put(328,new Range(340,new Edit().level(a,b,80,0xad)));
    // Replace obsolete advancement warning with the actual level requirement.
    changes.put(374,new Range(379,new Edit().add(0x2c,a.constants.getStringId("Décimo slot de Cosmo liberado no nível 80.",true))));
    apply(b,changes,Map.of(174,188));((Tag)a.parentTag).setModified(true);count++;
   }
   if(cls.equals("star.view.EquipStarListView"))for(String method:List.of("initView","__refreshStarTroughInfo")){
    MethodBody b=a.findBodyByClassAndName("EquipStarListView",method);boolean init=method.equals("initView");if(b.getCode().code.size()!=(init?296:152))throw new IllegalStateException("Unexpected view baseline "+method+" "+b.getCode().code.size());
    Map<Integer,Range> changes=new HashMap<>();int start=init?259:118,end=init?270:129,tooltip=init?278:137;
    changes.put(start,new Range(end,new Edit().level(a,b,80,0xb0)));
    int refinement=init?178:39;
    changes.put(refinement,new Range(refinement+2,new Edit().add(0x60,member(a,b,"thane")).add(0x66,member(a,b,"grades")).add(0x24,10).add(0xa3).add(0x73)));
    changes.put(tooltip,new Range(tooltip+5,new Edit().add(0x2c,a.constants.getStringId("Décimo slot de Cosmo liberado no nível 80.",true))));
    apply(b,changes,Map.of());((Tag)a.parentTag).setModified(true);count++;
   }
   if(cls.equals("star.HoroscopeFrame")){
    MethodBody b=a.findBodyByClassAndName("HoroscopeFrame","initView");
    if(b.getCode().code.size()!=156)throw new IllegalStateException("Unexpected HoroscopeFrame");
    apply(b,Map.of(150,new Range(154,new Edit().add(0x60,member(a,b,"thane")).add(0x66,a.constants.getPublicQnameId("grades",true)).add(0x24,80).add(0xb0))),Map.of());
    ((Tag)a.parentTag).setModified(true);count++;
   }
   if(cls.equals("cell.view.starbag.StarBagCell")){
    MethodBody b=setter(a,"StarBagCell","data");int index=-1;
    for(int n=0;n<b.getCode().code.size();n++){var x=b.getCode().code.get(n);if(x.definition.instructionName.equals("getproperty")&&a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index).equals("vocationLevel")){if(index!=-1)throw new IllegalStateException("Ambiguous gate");index=n;}}
    if(index<1)throw new IllegalStateException("Missing refinement gate");
    Edit gate=new Edit().add(0x60,a.constants.getQnameId("ArmyManager",Namespace.KIND_PACKAGE,"yishi.manager",true)).add(0x66,a.constants.getPublicQnameId("instance",true)).add(0x66,a.constants.getPublicQnameId("thane",true)).add(0x66,a.constants.getPublicQnameId("grades",true)).add(0x24,10).add(0xa3).add(0x73);
    apply(b,Map.of(index-1,new Range(index+1,gate)),Map.of());((Tag)a.parentTag).setModified(true);count++;
   }
  }
  if(count!=2&&count!=3)throw new IllegalStateException("Unexpected patched count "+count);try(var out=new FileOutputStream(args[1])){s.saveTo(out);}System.out.println("Cosmos slot-ten methods patched: "+count);
 }
}
