import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Only tattoo tab, slot tooltips and engraving gates; no profession spoofing. */
class TattooUiPatch {
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
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(ScriptPack p:s.getAS3Packs()){
   String cls=p.getClassPath().toString();ABC a=p.abc;
   if(cls.equals("armyII.ArmyFrameII")){
    MethodBody b=a.findBodyByClassAndName("ArmyFrameII","initView");var code=b.getCode().code;int replaced=0;
    for(int n=0;n<code.size()-1;n++){var x=code.get(n);
     if(x.definition.instructionName.equals("getproperty")&&"vocationGrades".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index))){
      if(!code.get(n+1).definition.instructionName.equals("pushbyte")||code.get(n+1).operands[0]!=0)throw new IllegalStateException("Unexpected tattoo tab gate");
      int len=x.getBytesLength();x.operands[0]=member(a,b,"grades");code.get(n+1).operands[0]=69;if(x.getBytesLength()!=len)throw new IllegalStateException("Gate encoding changed");replaced++;
     }
    }
    if(replaced!=1)throw new IllegalStateException("Expected one tattoo tab gate");b.setModified();((Tag)a.parentTag).setModified(true);count++;
   }
   if(cls.equals("armyII.viewII.tattoo.TattooView")){
    for(String method:List.of("initView","refresh")){
     MethodBody b=a.findBodyByClassAndName("TattooView",method);boolean init=method.equals("initView");
     int start=init?235:98,end=init?244:107,index=init?6:4;
     if(!"getShortVocationName".equals(a.constants.getString(a.constants.getMultiname(b.getCode().code.get(end-1).operands[0]).name_index)))throw new IllegalStateException("Unexpected tattoo tooltip baseline");
     Edit e=new Edit().add(0x2c,a.constants.getStringId("nível ",true));
     for(int level:new int[]{70,70,72,72,74,76,78,80})e.add(0x24,level);
     e.add(0x56,8).add(0x62,index).add(0x66,64).add(0xa0);
     apply(b,Map.of(start,new Range(end,e)),Map.of());count++;
    }
    MethodBody b=a.findBodyByClassAndName("TattooView","setImprintState");
    if(!"IsTaskFinish".equals(a.constants.getString(a.constants.getMultiname(b.getCode().code.get(33).operands[0]).name_index)))throw new IllegalStateException("Unexpected engraving gate");
    // Self views are constructed with _thaneInfo=null. Read the actual own
    // character, as the original initView/refresh do, rather than inspection data.
    MethodBody init=a.findBodyByClassAndName("TattooView","initView");
    Edit gate=new Edit().add(0x60,member(a,init,"ArmyManager")).add(0x66,member(a,init,"instance")).add(0x66,member(a,init,"thane")).add(0x66,a.constants.getPublicQnameId("grades",true)).add(0x24,80).add(0xb0);
    Edit tip=new Edit().add(0x60,member(a,b,"_lockImage")).add(0x2c,a.constants.getStringId("Gravações liberadas no nível 80.",true)).add(0x61,b.getCode().code.get(70).operands[0]);
    apply(b,Map.of(29,new Range(34,gate),54,new Range(71,tip)),Map.of());count++;((Tag)a.parentTag).setModified(true);
   }
  }
  if(count!=4)throw new IllegalStateException("Expected four tattoo presentation methods, got "+count);
  try(var out=new FileOutputStream(args[1])){s.saveTo(out);}System.out.println("Tattoo level gates and slot tooltips patched");
 }
}
