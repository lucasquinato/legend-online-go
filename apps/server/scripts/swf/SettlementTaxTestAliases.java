import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
/** Test-only UI dependency injection. refreshView's candidate code stays unchanged. */
class SettlementTaxTestAliases {
 public static void main(String[] args)throws Exception {
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("buildings.politics.view.LevyView")){
   var a=p.abc;
   // Baseline-only fixture: no magic-spring buff. Keep its old levy arithmetic intact.
   if(args.length>2){var b=a.findBodyByClassAndName("LevyView","refreshView");var c=b.getCode();if(c.code.size()!=109)throw new IllegalStateException();int len=0;for(int n=69;n<97;n++)len+=c.code.get(n).getBytesLength();c.code.subList(69,97).clear();for(int n=0;n<len;n++)c.code.add(69,new AVM2Instruction(0,0x02,new int[0]));b.setCode(c);b.setModified();}
   for(var info:a.instance_info)if(a.constants.getString(info.getName(a.constants).name_index).equals("LevyView")){
    var ctor=a.findBody(info.iinit_index);AVM2Code c=new AVM2Code();for(int op:new int[]{0xd0,0x30,0xd0})c.code.add(new AVM2Instruction(0,op,new int[0]));c.code.add(new AVM2Instruction(0,0x49,new int[]{0}));c.code.add(new AVM2Instruction(0,0x47,new int[0]));ctor.setCode(c);ctor.setModified();
    for(var t:info.instance_traits.traits){String name=a.constants.getString(a.constants.getMultiname(t.name_index).name_index);
     if(t instanceof TraitSlotConst slot&&Set.of("_levyBtn","_levyValueTxt","_levyGoldValueTxt").contains(name)){
      a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(name,true)).namespace_index;slot.type_index=a.constants.getPublicQnameId("Object",true);
     }
    }
   }
   ((Tag)a.parentTag).setModified(true);count++;
  }
  if(count!=1)throw new IllegalStateException();try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
