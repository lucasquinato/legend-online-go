import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
/** Isolated UI fixtures only; candidate gate method instructions remain unchanged. */
class RuneGateTestAliases {
 static AVM2Instruction i(int op,int...v){return new AVM2Instruction(0,op,v);}
 static AVM2Code code(AVM2Instruction...v){AVM2Code c=new AVM2Code();c.code.addAll(Arrays.asList(v));return c;}
 public static void main(String[] args)throws Exception{
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var p:s.getAS3Packs()){
   String cls=p.getClassPath().toString(),simple=cls.substring(cls.lastIndexOf('.')+1);
   if(!Set.of("armyII.viewII.rune.RuneItemView","armyII.viewII.rune.RuneUpgradeView","yishi.manager.PlayerManager").contains(cls))continue;
   var a=p.abc;
   for(var info:a.instance_info)if(a.constants.getString(info.getName(a.constants).name_index).equals(simple)){
    info.flags&=~1;
    if(!simple.equals("PlayerManager")){var ctor=a.findBody(info.iinit_index);ctor.setCode(code(i(0xd0),i(0x30),i(0xd0),i(0x49,0),i(0x47)));ctor.setModified();}
    for(var t:info.instance_traits.traits){String name=a.constants.getString(a.constants.getMultiname(t.name_index).name_index);
     if(t instanceof TraitSlotConst slot&&name.equals("_data")){a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(name,true)).namespace_index;slot.type_index=a.constants.getPublicQnameId("Object",true);}
     if(t instanceof TraitMethodGetterSetter m&&Set.of("needShowAddBtn","__upgradeBtnClickHandler").contains(name))m.name_index=a.constants.getPublicQnameId("__test_"+name,true);
    }
    String getter=simple.equals("PlayerManager")?"currentPlayerModel":simple.equals("RuneUpgradeView")?"controler":null;
    if(getter!=null){var b=a.findBodyByClassAndName(simple,getter);a.method_info.get(b.method_info).ret_type=0;b.setCode(code(i(0xd0),i(0x66,a.constants.getPublicQnameId("__test_fixture",true)),i(0x48)));b.setModified();}
   }
   ((Tag)a.parentTag).setModified(true);count++;
  }
  if(count!=(args[2].equals("core")?1:2))throw new IllegalStateException("Unexpected fixture class count "+count);try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
