using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace LegendOnline;

internal static class UpdateSupport
{
    internal static bool RecoverIfNeeded()
    {
        if (!File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".update", "transaction.json"))) return false;
        RunUpdater(true); return true;
    }

    internal static void Check(Form form)
    {
        ThreadPool.QueueUserWorkItem(delegate {
            try {
                string endpoint = Program.ApiOrigin.TrimEnd('/') + "/updates/launcher/stable.json";
                var release = ReleaseWire.ReadManifest(endpoint);
                if (new Version(release.Version) <= new Version(Program.Version)) return;
                if (form.IsDisposed || !form.IsHandleCreated) return;
                form.BeginInvoke((Action)(() => {
                    if (MessageBox.Show(form, "A versão " + release.Version + " está disponível. Fechar o jogo e atualizar agora?", "Atualização", MessageBoxButtons.YesNo, MessageBoxIcon.Information) != DialogResult.Yes) return;
                    RunUpdater(false); form.Close();
                }));
            } catch (Exception error) {
                Log.Info("[update] verificação não concluída: " + error.GetType().Name);
            }
        });
    }

    private static void RunUpdater(bool recover)
    {
        string installed = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "LegendOnline.Updater.exe");
        string temp = Path.Combine(Path.GetTempPath(), "legend-online-go-update-" + Guid.NewGuid().ToString("N") + ".exe");
        File.Copy(installed, temp);
        var start = new ProcessStartInfo(temp);
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.Arguments = "--install \"" + AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\') + "\" --parent " + Process.GetCurrentProcess().Id + " --server \"" + Program.ApiOrigin + "\"" + (recover ? " --recover" : "");
        Process.Start(start);
    }
}
