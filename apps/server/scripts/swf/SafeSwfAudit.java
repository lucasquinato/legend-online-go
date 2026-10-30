import java.io.*;import java.nio.file.*;import java.lang.reflect.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.tags.*;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;
class SafeSwfAudit {
 static String sha(String path)throws Exception{return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(Path.of(path))));}
 static SWF load(String p)throws Exception{return new SWF(new FileInputStream(p),true);}
 static void require(boolean ok,String reason){if(!ok)throw new IllegalStateException(reason);}
 static Set<String> classes(SWF s){Set<String> names=new TreeSet<>();for(ScriptPack p:s.getAS3Packs())require(names.add(p.getClassPath().toString()),"Duplicate class: "+p.getClassPath());return names;}
 static String fields(Object x)throws Exception{
  if(x==null)return "null";if(x instanceof Number||x instanceof Boolean||x instanceof String||x instanceof Enum)return x.toString();
  if(x.getClass().isArray()){StringBuilder b=new StringBuilder("[");for(int i=0;i<Array.getLength(x);i++)b.append(fields(Array.get(x,i))).append(';');return b+"]";}
  if(x instanceof Iterable){StringBuilder b=new StringBuilder("[");for(Object item:(Iterable)x)b.append(fields(item)).append(';');return b+"]";}
  Field[] fs=x.getClass().getFields();Arrays.sort(fs,Comparator.comparing(Field::getName));StringBuilder b=new StringBuilder(x.getClass().getName());
  for(Field f:fs)if(!Modifier.isStatic(f.getModifiers())&&!Arrays.asList("fileOffset","bytes","deleted","lastDispId").contains(f.getName()))b.append(f.getName()).append('=').append(fields(f.get(x))).append(';');return b.toString();
 }
 static void constants(ABC a,ABC b)throws Exception{
  for(String type:Arrays.asList("Int","UInt","Double","Decimal","Float","Float4","String","Namespace","NamespaceSet","Multiname")){
   Method count=a.constants.getClass().getMethod("get"+type+"Count"),get=a.constants.getClass().getMethod("get"+type,int.class);
   int n=(Integer)count.invoke(a.constants);require((Integer)count.invoke(b.constants)>=n,"Constant pool shrank: "+type);
   for(int i=1;i<n;i++)require(fields(get.invoke(a.constants,i)).equals(fields(get.invoke(b.constants,i))),"Existing constant changed: "+type+" #"+i);
  }
 }
 static MethodBody setter(ABC a,String clazz,String name){for(var info:a.instance_info)if(clazz.equals(a.constants.getString(info.getName(a.constants).name_index)))for(var trait:info.instance_traits.traits)if(trait instanceof com.jpexs.decompiler.flash.abc.types.traits.TraitMethodGetterSetter m && m.kindType==3 && name.equals(a.constants.getString(a.constants.getMultiname(m.name_index).name_index)))return a.findBody(m.method_info);throw new IllegalStateException("Missing setter "+clazz+"."+name);}
 public static void main(String[] args)throws Exception{
  SWF a=load(args[0]),b=load(args[1]);Set<String> allowed=new HashSet<>();for(int i=3;i<args.length;i++)allowed.add(args[i]);
  require(a.version==b.version,"SWF version changed");require(classes(a).equals(classes(b)),"Classes added/removed: wrong baseline or transplant");
  require(a.getTags().size()==b.getTags().size(),"Tag count/order changed");int untouched=0,changed=0,preservedMethods=0;
  for(int i=0;i<a.getTags().size();i++){
   Tag x=a.getTags().get(i),y=b.getTags().get(i);require(x.getId()==y.getId(),"Tag kind/order changed at "+i);
   if(y instanceof ABCContainerTag)require(!((ABCContainerTag)y).getABC().script_info.isEmpty(),"Empty ABC at "+i);
   if(Arrays.equals(x.getOriginalData(),y.getOriginalData())){untouched++;continue;}
   require(x instanceof ABCContainerTag&&y instanceof ABCContainerTag,"Asset/metadata tag modified outside scope: "+i);
   ABC aa=((ABCContainerTag)x).getABC(),bb=((ABCContainerTag)y).getABC();Set<Integer> methods=new HashSet<>();
   for(String spec:allowed){int dot=spec.lastIndexOf('.');String clazz=spec.substring(0,dot),method=spec.substring(dot+1);boolean inTag=false;for(ScriptPack p:a.getAS3Packs())if(p.abc==aa&&p.getClassPath().toString().equals(clazz))inTag=true;
    if(inTag){MethodBody body=method.endsWith("#set")?setter(aa,clazz.substring(clazz.lastIndexOf('.')+1),method.substring(0,method.length()-4)):aa.findBodyByClassAndName(clazz.substring(clazz.lastIndexOf('.')+1),method);require(body!=null,"Allowed method absent: "+spec);methods.add(body.method_info);}}
   require(!methods.isEmpty(),"Protected ABC changed at tag "+i);constants(aa,bb);
   require(fields(aa.instance_info).equals(fields(bb.instance_info)),"Class fields/inheritance changed");require(fields(aa.class_info).equals(fields(bb.class_info)),"Class initializer/traits changed");require(fields(aa.script_info).equals(fields(bb.script_info)),"Script initializer changed");
   require(fields(aa.method_info).equals(fields(bb.method_info)),"Method signatures changed");require(aa.bodies.size()==bb.bodies.size(),"Methods added/removed");
   for(MethodBody old:aa.bodies){MethodBody now=bb.findBody(old.method_info);require(now!=null,"Method removed");if(methods.contains(old.method_info)){changed++;continue;}
    require(Arrays.equals(old.getCodeBytes(),now.getCodeBytes())&&old.max_stack==now.max_stack&&old.max_regs==now.max_regs&&old.init_scope_depth==now.init_scope_depth&&old.max_scope_depth==now.max_scope_depth&&fields(old.exceptions).equals(fields(now.exceptions)),"Method outside allowlist changed: "+old.method_info);preservedMethods++;}
  }
  String report="{\"sourceSha256\":\""+sha(args[0])+"\",\"candidateSha256\":\""+sha(args[1])+"\",\"classes\":"+classes(a).size()+",\"unchangedTags\":"+untouched+",\"allowedMethods\":"+changed+",\"otherMethodsPreserved\":"+preservedMethods+",\"emptyAbc\":false,\"duplicates\":false,\"protectedTagsByteIdentical\":true}";
  Files.writeString(Path.of(args[2]),report);System.out.println(report);
 }
}
