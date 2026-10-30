import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.abc.types.traits.*;
import com.jpexs.decompiler.flash.tags.Tag;

/** Test copy only: aliases call the candidate's original private method bodies unchanged. Never publish this SWF. */
class BattleLoaderTestAliases {
 public static void main(String[] args)throws Exception {
  SWF swf=new SWF(new FileInputStream(args[0]),true);int aliases=0;
  for(var p:swf.getAS3Packs()) {
   String method=switch(p.getClassPath().toString()) {
    case "yishi.datas.battle.ResourceModel" -> "publicSkillLoadComplete";
    case "battle.view.GameView" -> "__onComplete";
    case "battle.skillsys.loader.SkillResourceLoader" -> "skillLoadComplete";
    case "yishi.view.tools.PetFormationGameView" -> "__onComplete";
    case "yishi.manager.TempleteManager" -> "ConfigInfosBack";
    default -> null;
   };
   if(method==null)continue;
   var abc=p.abc;
   for(int index=0;index<abc.instance_info.size();index++) {
    var info=abc.instance_info.get(index);
    if(!p.getClassPath().className.equals(abc.constants.getString(info.getName(abc.constants).name_index)))continue;
    for(var traits:List.of(info.instance_traits,abc.class_info.get(index).static_traits))
    for(var trait:new ArrayList<>(traits.traits)) {
     if(trait instanceof TraitMethodGetterSetter original && method.equals(abc.constants.getString(abc.constants.getMultiname(trait.name_index).name_index))) {
      var alias=original.clone();alias.name_index=abc.constants.getPublicQnameId("__test_"+method,true);alias.disp_id=0;
      traits.traits.set(traits.traits.indexOf(original),alias);((Tag)abc.parentTag).setModified(true);aliases++;
     }
    }
   }
  }
  if(aliases!=5)throw new IllegalStateException("Expected five test-only aliases");
  try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}
 }
}

