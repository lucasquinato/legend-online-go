using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace LegendOnline;

internal static class Program
{
	internal const string ProductionHost = "servidor.legendremake.com";

	internal static string GameOrigin = "http://127.0.0.1:18080";

	internal static string ApiOrigin = "http://127.0.0.1:18080";

	internal static bool Production = false;

	internal static int ControlPort;

	internal static string DataDir;

	internal static string EngineExe;

	internal static string Version
	{
		get
		{
			Version version = typeof(Program).Assembly.GetName().Version;
			return version.Major + "." + version.Minor + "." + version.Build;
		}
	}

	[STAThread]
	private static int Main(string[] args)
	{
		foreach (string text in args)
		{
			if (text.StartsWith("--server="))
			{
				string text2 = text.Substring(9).Trim().TrimEnd('/');
				if (text2.IndexOf("://", StringComparison.Ordinal) < 0)
				{
					text2 = "http://" + text2;
				}
				GameOrigin = (ApiOrigin = text2);
				Production = false;
			}
			else if (text.StartsWith("--control="))
			{
				int.TryParse(text.Substring(10), out ControlPort);
			}
		}
		string folderPath = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
		DataDir = Path.Combine(folderPath, "LegendOnline", Production ? "launcher" : ("launcher-" + SafeName(new Uri(GameOrigin).Authority)));
		Directory.CreateDirectory(DataDir);
		EngineExe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "engine", "LegendEngine.exe");
		ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
		ServicePointManager.DefaultConnectionLimit = 8;
		ServicePointManager.Expect100Continue = false;
		Application.EnableVisualStyles();
		Application.SetCompatibleTextRenderingDefault(defaultValue: false);
		bool createdNew;
		using (new Mutex(initiallyOwned: true, "Local\\LegendOnline-" + SafeName(DataDir), out createdNew))
		{
			if (!createdNew)
			{
				FocusOtherInstance();
				return 0;
			}
			if (!File.Exists(EngineExe))
			{
				MessageBox.Show("Arquivos do jogo não encontrados (engine\\LegendEngine.exe).\nExtraia o launcher inteiro do .zip e tente de novo.", "Legend Online", MessageBoxButtons.OK, MessageBoxIcon.Hand);
				return 2;
			}
			Log.Info("[launcher] start v" + Version + " game=" + GameOrigin + " api=" + ApiOrigin + " data=" + DataDir);
			Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e)
			{
				Log.Info("[launcher] erro: " + e.Exception);
			};
			AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
			{
				Log.Info("[launcher] erro fatal: " + e.ExceptionObject);
			};
		if (UpdateSupport.RecoverIfNeeded()) return 0;
		LauncherState state = LauncherState.Load(Path.Combine(DataDir, "state.json"));
			using (MainForm mainForm = new MainForm(state))
			{
			mainForm.Shown += delegate { UpdateSupport.Check(mainForm); };
				Application.Run(mainForm);
			}
			Log.Info("[launcher] exit");
			return 0;
		}
	}

	internal static string SafeName(string s)
	{
		StringBuilder stringBuilder = new StringBuilder();
		foreach (char c in s)
		{
			stringBuilder.Append(char.IsLetterOrDigit(c) ? c : '_');
		}
		return stringBuilder.ToString();
	}

	[DllImport("user32.dll")]
	private static extern bool SetForegroundWindow(IntPtr hWnd);

	[DllImport("user32.dll")]
	private static extern bool ShowWindow(IntPtr hWnd, int cmd);

	[DllImport("user32.dll")]
	private static extern bool IsIconic(IntPtr hWnd);

	private static void FocusOtherInstance()
	{
		Process currentProcess = Process.GetCurrentProcess();
		Process[] processesByName = Process.GetProcessesByName(currentProcess.ProcessName);
		foreach (Process process in processesByName)
		{
			if (process.Id != currentProcess.Id && !(process.MainWindowHandle == IntPtr.Zero))
			{
				if (IsIconic(process.MainWindowHandle))
				{
					ShowWindow(process.MainWindowHandle, 9);
				}
				SetForegroundWindow(process.MainWindowHandle);
				break;
			}
		}
	}
}
