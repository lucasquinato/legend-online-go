using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace LegendOnline;

internal sealed class ReleaseFile
{
    public string Path;
    public string Sha256;
    public long Bytes;
}
internal sealed class ReleaseData
{
    public string Version;
    public ReleaseFile[] Files;
}
internal static class ReleaseWire
{
    internal static bool SafePath(string value)
    {
        if (string.IsNullOrEmpty(value) || value.Length >= 240 || !Regex.IsMatch(value, "^[A-Za-z0-9_./ -]+$") || value.StartsWith("/")) return false;
        foreach (var part in value.Split('/'))
            if (part == "" || part == "." || part == ".." || part.EndsWith(".") || part.EndsWith(" ") || Regex.IsMatch(part, "^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)", RegexOptions.IgnoreCase)) return false;
        return true;
    }
    internal static Uri TrustedUrl(string url)
    {
        var uri = new Uri(url);
        if ((!uri.IsLoopback && uri.Scheme != "https") || (uri.Scheme != "http" && uri.Scheme != "https") || uri.UserInfo.Length != 0) throw new Exception("Origem de atualização inválida.");
        return uri;
    }
    internal static byte[] Download(string url, long maximum)
    {
        var request = (HttpWebRequest)WebRequest.Create(TrustedUrl(url));
        request.AllowAutoRedirect = false; request.Timeout = 15000; request.ReadWriteTimeout = 15000;
        request.UserAgent = "LegendOnlineGo-Updater/1";
        using (var response = (HttpWebResponse)request.GetResponse()) {
            if (response.StatusCode != HttpStatusCode.OK || response.ContentLength > maximum) throw new Exception("Resposta de atualização inválida.");
            using (var input = response.GetResponseStream()) using (var output = new MemoryStream()) {
                var buffer = new byte[65536]; int count;
                while ((count = input.Read(buffer, 0, buffer.Length)) > 0) { if (output.Length + count > maximum) throw new Exception("Download excede o limite."); output.Write(buffer, 0, count); }
                return output.ToArray();
            }
        }
    }
    internal static ReleaseData ReadManifest(string url)
    {
        var json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024 };
        var envelope = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(Download(url, 2 * 1024 * 1024)));
        var payload = Convert.FromBase64String((string)envelope["payload"]);
        var signature = Convert.FromBase64String((string)envelope["signature"]);
        using (var rsa = new RSACryptoServiceProvider(new CspParameters(24))) {
            rsa.PersistKeyInCsp = false; rsa.FromXmlString(UpdateTrust.PublicKeyXml);
            if (!rsa.VerifyData(payload, CryptoConfig.MapNameToOID("SHA256"), signature)) throw new Exception("Assinatura de atualização inválida.");
        }
        var data = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(payload));
        string version = (string)data["version"];
        if (Convert.ToInt32(data["schema"]) != 1 || (string)data["kind"] != "launcher" || !Regex.IsMatch(version, "^\\d+\\.\\d+\\.\\d+$") || Convert.ToInt32(data["protocol"]) != 1) throw new Exception("Manifesto incompatível.");
        var rows = (System.Collections.ICollection)data["files"]; if (rows.Count == 0 || rows.Count > 1000) throw new Exception("Lista de arquivos inválida.");
        var files = new List<ReleaseFile>(); var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase); long total = 0;
        foreach (Dictionary<string, object> row in rows) {
            var file = new ReleaseFile { Path = (string)row["path"], Sha256 = (string)row["sha256"], Bytes = Convert.ToInt64(row["bytes"]) };
            if (!SafePath(file.Path) || !seen.Add(file.Path) || !Regex.IsMatch(file.Sha256, "^[a-f0-9]{64}$") || file.Bytes <= 0 || file.Bytes > 256L * 1024 * 1024) throw new Exception("Arquivo inválido no manifesto.");
            total += file.Bytes; if (total > 512L * 1024 * 1024) throw new Exception("Pacote excede o limite.");files.Add(file);
        }
        if (!seen.Contains("LegendOnline.exe") || !seen.Contains("LegendOnline.Updater.exe")) throw new Exception("Pacote incompleto.");
        return new ReleaseData { Version = version, Files = files.ToArray() };
    }
    internal static string Hash(byte[] bytes)
    {
        using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }
}
