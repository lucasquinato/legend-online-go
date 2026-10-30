import java.io.*;import com.jpexs.decompiler.flash.*;import com.jpexs.decompiler.flash.tags.*;
class MountTags {public static void main(String[] a)throws Exception{for(String p:a){SWF s=new SWF(new FileInputStream(p),true);System.out.println(p);for(Tag t:s.getTags())if(t.getId()!=82&&t.getId()!=1&&t.getId()!=0)System.out.println(t.getId()+" "+t.toString());}}}
