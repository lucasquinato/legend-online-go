using System;
using System.IO;
using System.Text;

namespace LegendOnline;

internal static class Log
{
	private static readonly object Gate = new object();

	public static void Info(string msg)
	{
		string text = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + msg;
		lock (Gate)
		{
			try
			{
				string text2 = Path.Combine(Program.DataDir, "launcher.log");
				FileInfo fileInfo = new FileInfo(text2);
				if (fileInfo.Exists && fileInfo.Length > 4194304)
				{
					File.Copy(text2, text2 + ".old", overwrite: true);
					File.Delete(text2);
				}
				File.AppendAllText(text2, text + Environment.NewLine, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
			}
			catch (IOException)
			{
			}
			catch (UnauthorizedAccessException)
			{
			}
		}
	}
}
