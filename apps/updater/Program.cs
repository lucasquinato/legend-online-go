using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace LegendOnline;

internal static class UpdaterProgram
{
    private static bool noLaunch;
    private static Dictionary<string, string> Args(string[] args) {
        var data = new Dictionary<string, string>();
        for (int i = 0; i < args.Length; i++) { var name = args[i]; data[name] = i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[++i] : "true"; } return data;
    }
    [STAThread]
    private static int Main(string[] args)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        var options = Args(args); bool verify = options.ContainsKey("--verify-only");
        noLaunch = options.ContainsKey("--no-launch");
        string install = options.ContainsKey("--install") ? Path.GetFullPath(options["--install"]) : null;
        string server = options.ContainsKey("--server") ? ReleaseWire.TrustedUrl(options["--server"]).GetLeftPart(UriPartial.Authority) : null;
        string journal = install == null ? null : Path.Combine(install, ".update", "transaction.json");
        try {
            if (!verify) {
                if (install == null || server == null || !File.Exists(Path.Combine(install, "LegendOnline.exe"))) throw new Exception("Instalação inválida.");
                int parent;
                if (options.ContainsKey("--parent") && int.TryParse(options["--parent"], out parent)) {
                    try { var process = Process.GetProcessById(parent); if (!process.WaitForExit(60000)) throw new Exception("Feche o launcher antes de atualizar."); } catch (ArgumentException) { }
                }
                if (File.Exists(journal)) Restore(install, journal);
                if (options.ContainsKey("--recover")) { Start(install, server); return 0; }
            }
            string endpoint = verify ? options["--manifest"] : server + "/updates/launcher/stable.json";
            var release = ReleaseWire.ReadManifest(endpoint);
            if (!verify && new Version(release.Version) <= System.Reflection.AssemblyName.GetAssemblyName(Path.Combine(install, "LegendOnline.exe")).Version) { Start(install, server); return 0; }
            var stage = Path.Combine(Path.GetTempPath(), "legend-online-go-package-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(stage);
            try {
                foreach (var file in release.Files) {
                    string path = string.Join("/", Array.ConvertAll(file.Path.Split('/'), Uri.EscapeDataString));
                    var url = new Uri(new Uri(endpoint), "files/" + release.Version + "/" + path);
                    byte[] bytes = ReleaseWire.Download(url.AbsoluteUri, file.Bytes);
                    if (bytes.LongLength != file.Bytes || ReleaseWire.Hash(bytes) != file.Sha256) throw new Exception("Falha de integridade: " + file.Path);
                    string dest = Path.Combine(stage, file.Path.Replace('/', Path.DirectorySeparatorChar)); Directory.CreateDirectory(Path.GetDirectoryName(dest)); File.WriteAllBytes(dest, bytes);
                }
                if (verify) { Console.WriteLine("verified " + release.Version + " files=" + release.Files.Length); return 0; }
                var backup = Path.Combine(install, ".update", "backup-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(backup);
                var entries = new List<object>();
                foreach (var file in release.Files) {
                    string dest = Path.Combine(install, file.Path.Replace('/', Path.DirectorySeparatorChar)); bool existed = File.Exists(dest);
                    if (existed) { string copy = Path.Combine(backup, file.Path.Replace('/', Path.DirectorySeparatorChar)); Directory.CreateDirectory(Path.GetDirectoryName(copy)); File.Copy(dest, copy); }
                    entries.Add(new Dictionary<string, object> { { "path", file.Path }, { "existed", existed } });
                }
                File.WriteAllText(journal + ".next", new JavaScriptSerializer().Serialize(new { backup = Path.GetFileName(backup), files = entries }), Encoding.UTF8);
                File.Move(journal + ".next", journal);
                foreach (var file in release.Files) { string dest = Path.Combine(install, file.Path.Replace('/', Path.DirectorySeparatorChar)); Directory.CreateDirectory(Path.GetDirectoryName(dest)); File.Copy(Path.Combine(stage, file.Path.Replace('/', Path.DirectorySeparatorChar)), dest, true); }
                File.Delete(journal); // Commit only after every installed file has been replaced.
                Console.WriteLine("installed " + release.Version); Start(install, server); return 0;
            } finally { try { Directory.Delete(stage, true); } catch { } }
        } catch (Exception error) {
            if (verify) { Console.Error.WriteLine(error.Message); return 1; }
            try { if (journal != null && File.Exists(journal)) Restore(install, journal); } catch { MessageBox.Show("A restauração precisa ser concluída ao reabrir o launcher. O backup foi preservado.", "Atualização"); return 2; }
            MessageBox.Show("Atualização não aplicada: " + error.Message, "Legend Online Go");
            if (install != null && server != null) Start(install, server); return 1;
        }
    }
    private static void Restore(string install, string journal) {
        var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(journal));
        string name = (string)data["backup"]; if (!name.StartsWith("backup-") || !ReleaseWire.SafePath(name) || name.Contains("/")) throw new Exception("Backup inválido.");
        foreach (Dictionary<string, object> row in (System.Collections.IEnumerable)data["files"]) {
            string path = (string)row["path"]; if (!ReleaseWire.SafePath(path)) throw new Exception("Caminho inválido na restauração.");
            string target = Path.Combine(install, path.Replace('/', Path.DirectorySeparatorChar));
            if ((bool)row["existed"]) File.Copy(Path.Combine(install, ".update", name, path.Replace('/', Path.DirectorySeparatorChar)), target, true); else if (File.Exists(target)) File.Delete(target);
        }
        File.Delete(journal);
    }
    private static void Start(string install, string server) { if(noLaunch)return;Process.Start(new ProcessStartInfo(Path.Combine(install, "LegendOnline.exe"), "--server=\"" + server + "\"") { UseShellExecute = false, WorkingDirectory = install }); }
}
