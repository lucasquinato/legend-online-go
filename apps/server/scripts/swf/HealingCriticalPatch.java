import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.avm2.instructions.AVM2Instruction;
import com.jpexs.decompiler.flash.abc.types.traits.TraitMethodGetterSetter;
import com.jpexs.decompiler.flash.tags.Tag;

/** Preserve the native critical flag when a buff's DamageData becomes AttackData. */
class HealingCriticalPatch {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var p:swf.getAS3Packs())if(p.getClassPath().toString().equals("battle.handler.BufferHandler")) {
   var abc=p.abc;var body=abc.findBodyByClassAndName("BufferHandler","convertDamageDataToAttackData");
   if(args.length>2&&args[2].equals("--test-alias")) {
    for(var info:abc.class_info)for(var trait:new ArrayList<>(info.static_traits.traits))
     if(trait instanceof TraitMethodGetterSetter original&&original.method_info==body.method_info) {
      var alias=original.clone();alias.name_index=abc.constants.getPublicQnameId("__test_convert",true);alias.disp_id=0;
      info.static_traits.traits.set(info.static_traits.traits.indexOf(original),alias);count++;
     }
   } else {
    var code=body.getCode();int at=-1;
    if(body.exceptions.length!=0)throw new IllegalStateException("Unexpected exception handlers");
    for(int n=0;n<code.code.size();n++) {
     var x=code.code.get(n);String name=x.definition.instructionName;
     if(name.startsWith("if")||name.equals("jump")||name.equals("lookupswitch"))throw new IllegalStateException("Branch before allocation");
     if(name.equals("setproperty")&&abc.constants.getString(abc.constants.getMultiname(x.operands[0]).name_index).equals("hpMaxAdd")){at=n+1;break;}
    }
    if(at<0)throw new IllegalStateException("Missing pre-loop assignment boundary");
    int extra=abc.constants.getPublicQnameId("extraData",true);
    code.code.addAll(at,List.of(new AVM2Instruction(0,0x62,new int[]{4}),new AVM2Instruction(0,0xd1,new int[0]),new AVM2Instruction(0,0x66,new int[]{extra}),new AVM2Instruction(0,0x61,new int[]{extra})));
    body.setCode(code);body.max_stack=Math.max(2,body.max_stack);body.setModified();count++;
   }
   ((Tag)abc.parentTag).setModified(true);
  }
  if(count!=1)throw new IllegalStateException("Expected one conversion method, found "+count);
  try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}
