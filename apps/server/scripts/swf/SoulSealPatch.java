import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Advanced soul seal only; ordinary seal method and costs remain protected. */
class SoulSealPatch {
 static AVM2Instruction i(int op,int...a){return new AVM2Instruction(0,op,a);}
 static int member(ABC a,MethodBody b,String name){for(var x:b.getCode().code)if(x.operands!=null&&x.operands.length>0&&Set.of("getlex","getproperty","callproperty","callpropvoid").contains(x.definition.instructionName)){int n=x.operands[0];if(name.equals(a.constants.getString(a.constants.getMultiname(n).name_index)))return n;}throw new IllegalStateException("Missing "+name);}
 static class Edit {
  List<AVM2Instruction> list=new ArrayList<>();Map<String,Integer> labels=new HashMap<>();Map<Integer,String> jumps=new HashMap<>();
  Edit add(int op,int...a){list.add(i(op,a));return this;}Edit label(String name){labels.put(name,list.size());return this;}Edit branch(int op,String target){jumps.put(list.size(),target);return add(op,0);}
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
  SWF s=new SWF(new FileInputStream(args[0]),true);boolean ui=args[2].equals("ui");int count=0;
  Map<String,String> gates=Map.of("bag.helper.GoodsCheck","getGemAdd","yishi.view.tips.goods.InlayItem","getDiscription","yishi.view.tips.goods.EquipGemTipItem","getAddDiscription","dragontalker.DragonTalkerSymbiotePropHelper","getAddDiscription");
  for(var p:s.getAS3Packs()){
   var a=p.abc;String cls=p.getClassPath().toString(),simple=cls.substring(cls.lastIndexOf('.')+1);
   if(ui&&cls.equals("armyII.viewII.equip.JewelFrame")){
    for(String name:List.of("initView","__updateHandler","refreshView")){
     var b=a.findBodyByClassAndName(simple,name);var c=b.getCode().code;Map<Integer,Range> edits=new HashMap<>();
     if(!name.equals("refreshView")){for(int n=0;n<c.size();n++)if(c.get(n).definition.instructionName.equals("getproperty")&&"vocationGrades".equals(a.constants.getString(a.constants.getMultiname(c.get(n).operands[0]).name_index))){edits.put(n-1,new Range(n+3,new Edit().add(0x60,member(a,b,"thane")).add(0x66,a.constants.getPublicQnameId("grades",true)).add(0x24,80).add(0xb0)));}}
     else{int n=0;for(;n<c.size();n++)if(c.get(n).definition.instructionName.equals("getproperty")&&"vocationLevel".equals(a.constants.getString(a.constants.getMultiname(c.get(n).operands[0]).name_index)))break;if(n==c.size())throw new Error("Missing cap");edits.put(n-1,new Range(n+3,new Edit().add(0x24,100)));}
     if(edits.size()!=1)throw new Error("Expected one advanced gate "+name);apply(b,edits,Map.of());count++;
    }((Tag)a.parentTag).setModified(true);
   }
   if(ui&&cls.equals("armyII.viewII.equip.EquipView")){
    var b=a.findBodyByClassAndName(simple,"refreshView");var c=b.getCode().code;Map<Integer,Range> edits=new HashMap<>();
    for(int n=1;n<c.size()-2;n++)if(c.get(n).definition.instructionName.equals("getproperty")&&"vocationGrades".equals(a.constants.getString(a.constants.getMultiname(c.get(n).operands[0]).name_index))&&c.get(n-1).definition.instructionName.equals("getlex")&&c.get(n-1).operands[0]==member(a,b,"playerInfo")){
     edits.put(n-1,new Range(n+3,new Edit().add(0x60,member(a,b,"thane")).add(0x66,a.constants.getPublicQnameId("grades",true)).add(0x24,80).add(0xb0)));
    }
    if(edits.size()!=1)throw new Error("Expected one inventory advanced soul gate");apply(b,edits,Map.of());((Tag)a.parentTag).setModified(true);count++;
   }
   if(!ui&&cls.equals("yishi.utils.GoodsHelp")){
    var b=a.findBodyByClassAndName(simple,"getSeniorJewelEffecyByGrade");AVM2Code c=new AVM2Code();c.code.addAll(List.of(i(0xd0),i(0x30),i(0xd1),i(0x24,5),i(0xa2),i(0x48)));b.setCode(c);b.setModified();((Tag)a.parentTag).setModified(true);count++;
   }
   if(!ui&&gates.containsKey(cls)){
    var b=a.findBodyByClassAndName(simple,gates.get(cls));var c=b.getCode().code;int n=0;for(;n<c.size();n++)if(c.get(n).definition.instructionName.equals("getproperty")&&"vocationGrades".equals(a.constants.getString(a.constants.getMultiname(c.get(n).operands[0]).name_index)))break;
    if(n==c.size()||c.get(n+1).operands[0]!=0)throw new Error("Unexpected preview gate "+cls);
    apply(b,Map.of(n-1,new Range(n+3,new Edit().add(0x60,member(a,b,"thane")).add(0x66,a.constants.getPublicQnameId("grades",true)).add(0x24,80).add(0xb0))),Map.of());((Tag)a.parentTag).setModified(true);count++;
   }
  }
  if(count!=(ui?4:5))throw new Error("Expected advanced methods, got "+count);try(var out=new FileOutputStream(args[1])){s.saveTo(out);}System.out.println("Advanced soul seal patched: "+count);
 }
}
