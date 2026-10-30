import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
/** Test copies only: constructor fixtures and aliases never enter the release. */
class TattooUiTestAliases{
 static AVM2Instruction i(int op,int...a){return new AVM2Instruction(0,op,a);}
 static AVM2Code code(List<AVM2Instruction> list){AVM2Code c=new AVM2Code();c.code.addAll(list);return c;}
 public static void main(String[] args)throws Exception{
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var p:s.getAS3Packs()){
   String cls=p.getClassPath().toString(),simple=cls.substring(cls.lastIndexOf('.')+1);
   if(!Set.of("armyII.ArmyFrameII","armyII.viewII.tattoo.TattooView").contains(cls))continue;
   var a=p.abc;boolean army=simple.equals("ArmyFrameII");
   MethodBody method=a.findBodyByClassAndName(simple,"initView");var original=method.getCode().code;List<AVM2Instruction> fixture=new ArrayList<>(List.of(i(0xd0),i(0x30)));
   if(army){
    int gate=-1;
    for(int n=0;n<original.size()-2;n++){var x=original.get(n);if(x.definition.instructionName.equals("getproperty")){String name=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);if(("grades".equals(name)||"vocationGrades".equals(name))&&original.get(n+1).definition.instructionName.equals("pushbyte")&&Set.of(0,69).contains(original.get(n+1).operands[0])&&original.get(n+2).definition.instructionName.equals("ifngt"))gate=n;}}
    if(gate<0)throw new IllegalStateException("Tattoo gate not found");
    for(int n=gate-1;n<=gate+1;n++)fixture.add(i(original.get(n).definition.instructionCode,original.get(n).operands.clone()));fixture.add(i(0xaf));fixture.add(i(0x48));
   }else{
    int start=-1;for(int n=0;n<original.size();n++)if(original.get(n).definition.instructionName.equals("pushstring")&&"nível ".equals(a.constants.getString(original.get(n).operands[0])))start=n;
    if(start<0)fixture.add(i(0x2c,a.constants.getStringId("profissão",true)));
    else{
     fixture.addAll(List.of(i(0xd0),i(0x66,a.constants.getPublicQnameId("__test_index",true)),i(0x63,6)));
     for(int n=start;n<original.size();n++){var x=original.get(n);fixture.add(i(x.definition.instructionCode,x.operands==null?new int[0]:x.operands.clone()));if(x.definition.instructionCode==0xa0)break;}
    }
    fixture.add(i(0x48));
    var model=a.findBodyByClassAndName(simple,"model");a.method_info.get(model.method_info).ret_type=0;model.setCode(code(List.of(i(0xd0),i(0x66,a.constants.getPublicQnameId("__test_model",true)),i(0x48))));model.setModified();
   }
   method.setCode(code(fixture));a.method_info.get(method.method_info).ret_type=0;method.max_stack=12;method.setModified();
   for(var info:a.instance_info)if(a.constants.getString(info.getName(a.constants).name_index).equals(simple)){
    info.flags&=~1;var ctor=a.findBody(info.iinit_index);ctor.setCode(code(List.of(i(0xd0),i(0x30),i(0xd0),i(0x49,0),i(0x47))));ctor.setModified();
    for(var trait:info.instance_traits.traits){String name=a.constants.getString(a.constants.getMultiname(trait.name_index).name_index);
     if(trait instanceof TraitSlotConst slot&&Set.of("_isSelf","_thaneInfo","_imprintBtn","_imprintImage","_lockImage").contains(name)){
      a.constants.getMultiname(trait.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(name,true)).namespace_index;slot.type_index=0;
     }
     if(trait instanceof TraitMethodGetterSetter m&&Set.of("initView","setImprintState").contains(name))m.name_index=a.constants.getPublicQnameId(name.equals("initView")?(army?"__test_gate":"__test_tip"):"__test_imprint",true);
    }
   }
   ((Tag)a.parentTag).setModified(true);count++;
  }
  if(count!=2)throw new IllegalStateException("Expected two fixture classes");try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
