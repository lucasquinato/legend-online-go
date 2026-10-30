import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
/** Test copy only: replace UI dependencies with fixtures, keeping refreshList instructions unchanged. */
class TitleSearchTestAliases {
 static AVM2Code code(AVM2Instruction...v){AVM2Code c=new AVM2Code();c.code.addAll(Arrays.asList(v));return c;}
 static AVM2Instruction i(int op,int...v){return new AVM2Instruction(0,op,v);}
 public static void main(String[] args)throws Exception{
  SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
  for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("appell.AppellFrame")){
   var a=p.abc;
   for(var info:a.instance_info)if(a.constants.getString(info.getName(a.constants).name_index).equals("AppellFrame")){
    info.flags&=~1;
    var ctor=a.findBody(info.iinit_index);ctor.setCode(code(i(0xd0),i(0x30),i(0xd0),i(0x49,0),i(0x47)));ctor.setModified();
    for(var t:info.instance_traits.traits){String name=a.constants.getString(a.constants.getMultiname(t.name_index).name_index);
     if(t instanceof TraitSlotConst slot&&Set.of("_listPanel","_searchTxt","_tipTxt","_lookAppellId","_appellList").contains(name)){
      a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(name,true)).namespace_index;
      if(Set.of("_listPanel","_searchTxt","_tipTxt").contains(name))slot.type_index=a.constants.getPublicQnameId("Object",true);
     }
     if(t instanceof TraitMethodGetterSetter m&&name.equals("refreshList"))m.name_index=a.constants.getPublicQnameId("__test_refreshList",true);
    }
    var getter=a.findBodyByClassAndName("AppellFrame","model");a.method_info.get(getter.method_info).ret_type=0;
    getter.setCode(code(i(0xd0),i(0x66,a.constants.getPublicQnameId("__test_model",true)),i(0x48)));getter.setModified();
   }
   ((Tag)a.parentTag).setModified(true);count++;
  }
  if(count!=1)throw new IllegalStateException();try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
