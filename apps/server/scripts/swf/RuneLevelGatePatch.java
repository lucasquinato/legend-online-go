import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Only rune promotion/progression gates; no global profession spoofing. */
class RuneLevelGatePatch {
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
 public static void main(String[] args)throws Exception{
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(ScriptPack p:s.getAS3Packs()){
   String cls=p.getClassPath().toString();ABC a=p.abc;
   if(cls.equals("armyII.viewII.rune.RuneItemView")){
    MethodBody promote=a.findBodyByClassAndName("RuneItemView","__onPromotBtnClickHandler"),add=a.findBodyByClassAndName("RuneItemView","needShowAddBtn");
    if(promote.getCode().code.size()!=35||add.getCode().code.size()!=53)throw new IllegalStateException("Unexpected rune gate baseline");
    int grades=member(a,add,"grades"),thane=member(a,add,"thane");
    apply(promote,Map.of(12,new Range(15,new Edit().add(0x60,thane).add(0x66,grades).add(0x24,79)),18,new Range(21,new Edit().add(0x2c,a.constants.getStringId("Promoção de runas liberada no nível 80.",true)))),Map.of());
    // Replace only the advanced branch; basic rank prerequisites and cap checks stay intact.
    apply(add,Map.of(37,new Range(48,new Edit().add(0x60,thane).add(0x66,grades).add(0x24,80).add(0xb0))),Map.of());
    ((Tag)a.parentTag).setModified(true);count+=2;
   }
   if(cls.equals("armyII.viewII.rune.RuneUpgradeView")){
    MethodBody b=a.findBodyByClassAndName("RuneUpgradeView","__upgradeBtnClickHandler");
    if(b.getCode().code.size()!=56)throw new IllegalStateException("Unexpected rune upgrade baseline");
    Edit gate=new Edit().add(0x60,member(a,b,"thane")).add(0x66,member(a,b,"grades")).add(0x60,member(a,b,"_data")).add(0x66,member(a,b,"nextTemplateInfo")).add(0x66,member(a,b,"NeedGrade")).add(0xad)
     .add(0x60,member(a,b,"thane")).add(0x66,member(a,b,"grades")).add(0x24,80).add(0xad).add(0xa8);
    apply(b,Map.of(15,new Range(21,gate)),Map.of());((Tag)a.parentTag).setModified(true);count++;
   }
  }
  if(count!=3)throw new IllegalStateException("Expected three rune gate methods");try(var out=new FileOutputStream(args[1])){s.saveTo(out);}System.out.println("Rune level-80 gates patched");
 }
}
