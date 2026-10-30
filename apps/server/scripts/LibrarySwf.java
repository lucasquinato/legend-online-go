import java.io.*;import com.jpexs.decompiler.flash.*;import com.jpexs.decompiler.flash.tags.*;
class LibrarySwf {public static void main(String[] a)throws Exception{SWF s=new SWF(new FileInputStream(a[0]),true);for(Tag t:s.getTags())if(t instanceof SymbolClassTag){((SymbolClassTag)t).removeCharacter(0);t.setModified(true);}try(OutputStream o=new FileOutputStream(a[1])){s.saveTo(o);}}}
