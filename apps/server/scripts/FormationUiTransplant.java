import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.tags.*;import com.jpexs.decompiler.flash.abc.*;
class FormationUiTransplant {
 static SWF load(String path)throws Exception{return new SWF(new FileInputStream(path),true);}
 static boolean selected(ScriptPack p){return p.getClassPath().packageStr.toRawString().equals("armyII.viewII.lineUp");}
 public static void main(String[] args)throws Exception{
  SWF target=load(args[0]), legacy=load(args[1]), guard=load(args[2]);
  Map<String,ABC> donors=new LinkedHashMap<>();
  for(ScriptPack p:legacy.getAS3Packs())if(selected(p))donors.put(p.getClassPath().toString(),p.abc);
  for(ScriptPack p:guard.getAS3Packs())if(p.getClassPath().toString().equals("armyII.viewII.lineUp.LineUpView"))donors.put(p.getClassPath().toString(),p.abc);
  if(donors.size()!=5)throw new IllegalStateException("Unexpected formation class count: "+donors.size());
  Set<ABC> changed=new HashSet<>();
  for(ScriptPack p:target.getAS3Packs())if(donors.containsKey(p.getClassPath().toString())){changed.add(p.abc);p.delete(p.abc,true);}
  for(ABC abc:changed){abc.pack();((Tag)abc.parentTag).setModified(true);}
  for(Tag t:new ArrayList<Tag>(target.getTags().toArrayList()))if(t instanceof ABCContainerTag && ((ABCContainerTag)t).getABC().script_info.isEmpty())target.removeTag(t);
  int position=target.getTags().size()-1;for(int i=0;i<target.getTags().size();i++)if(target.getTags().get(i).getId()==1){position=i;break;}
  for(Map.Entry<String,ABC> entry:donors.entrySet()){
   ABC abc=entry.getValue();if(abc.script_info.size()!=1 || abc.instance_info.size()!=1)throw new IllegalStateException("Donor must contain exactly one original class");
   DoABC2Tag t=new DoABC2Tag(target);t.flags=1;t.name=entry.getKey();t.setABC(abc);abc.parentTag=t;t.setModified(true);target.addTag(position++,t);
  }
  Set<String> names=new HashSet<>();for(ScriptPack p:target.getAS3Packs())if(!names.add(p.getClassPath().toString()))throw new IllegalStateException("Duplicate class: "+p.getClassPath());
  for(Tag t:target.getTags())if(t instanceof ABCContainerTag && ((ABCContainerTag)t).getABC().script_info.isEmpty())throw new IllegalStateException("Empty ABC remains");
  try(OutputStream out=new FileOutputStream(args[3])){target.saveTo(out);}
  System.out.println("Formation classes transplanted without recompilation: "+donors.keySet());
 }
}
