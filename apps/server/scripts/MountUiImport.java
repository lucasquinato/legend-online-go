import java.io.*;
import java.util.*;
import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.importers.*;

// Compile with the game's preserved core/loader definitions. No runtime access.
class MountUiImport {
  static SWF load(String path) throws Exception {
    try (InputStream input = new BufferedInputStream(new FileInputStream(path))) {
      return new SWF(input, true);
    }
  }
  public static void main(String[] args) throws Exception {
    SWF swf = load(args[0]);
    List<SWF> dependencies = new ArrayList<>();
    for (int i = 3; i < args.length; i++) dependencies.add(load(args[i]));
    int imported = new AS3ScriptImporter().importScripts(As3ScriptReplacerFactory.createFFDec(), args[2], swf.getAS3Packs(), dependencies);
    if (imported == 0) throw new IllegalStateException("No scripts imported");
    try (OutputStream output = new FileOutputStream(args[1])) { swf.saveTo(output); }
    System.out.println("Scripts imported: " + imported);
  }
}
