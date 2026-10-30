using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace LegendOnline;

internal sealed class ControlServer : IDisposable
{
	private readonly MainForm form;

	private readonly TcpListener listener;

	private volatile bool disposed;

	private readonly AutoResetEvent shotDone = new AutoResetEvent(initialState: false);

	private string shotResult = "";

	public ControlServer(MainForm form, int port)
	{
		this.form = form;
		listener = new TcpListener(IPAddress.Loopback, port);
		listener.Start();
		Thread thread = new Thread(Loop);
		thread.IsBackground = true;
		thread.Start();
		Log.Info("[control] comandos de teste em 127.0.0.1:" + port);
	}

	private void Loop()
	{
		while (!disposed)
		{
			TcpClient c;
			try
			{
				c = listener.AcceptTcpClient();
			}
			catch (SocketException)
			{
				break;
			}
			catch (ObjectDisposedException)
			{
				break;
			}
			Thread thread = new Thread((ThreadStart)delegate
			{
				Serve(c);
			});
			thread.IsBackground = true;
			thread.Start();
		}
	}

	private void Serve(TcpClient c)
	{
		try
		{
			using (c)
			{
				using StreamReader streamReader = new StreamReader(c.GetStream(), Encoding.UTF8);
				using StreamWriter streamWriter = new StreamWriter(c.GetStream(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
				streamWriter.AutoFlush = true;
				string text;
				while ((text = streamReader.ReadLine()) != null)
				{
					string text2;
					try
					{
						text2 = Run(text.Trim());
					}
					catch (Exception ex)
					{
						text2 = "erro: " + ex.Message;
					}
					streamWriter.WriteLine(text2.Replace("\r", " ").Replace("\n", " "));
				}
			}
		}
		catch (IOException)
		{
		}
	}

	private string OnUi(Func<string> f)
	{
		return (string)form.Invoke(f);
	}

	private string Run(string line)
	{
		string[] array = line.Split(new char[1] { ' ' }, 2);
		string text = array[0];
		string arg = ((array.Length > 1) ? array[1] : "");
		switch (text)
		{
		case "state":
			return OnUi(StateJson);
		case "shot":
			return Shot(arg);
		case "login":
			return OnUi(delegate
			{
				string[] array3 = arg.Split(' ');
				AccountTab activeTab = form.ActiveTab;
				if (activeTab == null || activeTab.State != TabState.Login || array3.Length < 2)
				{
					return "erro: aba não está no login";
				}
				activeTab.LoginForm.Fill(array3[0], array3[1], array3.Length > 2 && array3[2] == "register");
				activeTab.LoginForm.DoSubmit();
				return "ok";
			});
		case "press":
			return OnUi(() => (form.ActiveTab == null || !form.ActiveTab.StatusScreen.PressButton(arg)) ? "erro: botão não encontrado" : "ok");
		case "add":
			return OnUi(delegate
			{
				form.AddAccount();
				return "ok";
			});
		case "select":
			return OnUi(delegate
			{
				form.SelectTab(form.Tabs[int.Parse(arg) - 1]);
				return "ok";
			});
		case "close":
			return OnUi(delegate
			{
				form.CloseTab(form.Tabs[int.Parse(arg) - 1]);
				return "ok";
			});
		case "mute":
			return OnUi(delegate
			{
				form.ToggleMute();
				return "ok";
			});
		case "reconnect":
			return OnUi(delegate
			{
				form.ReconnectActive();
				return "ok";
			});
		case "logout":
			return OnUi(delegate
			{
				form.ActiveTab.Logout();
				return "ok";
			});
		case "fullscreen":
			return OnUi(delegate
			{
				form.ToggleFullscreen();
				return "ok";
			});
		case "quit":
			return OnUi(delegate
			{
				IntPtr engineWindow = form.Tabs[int.Parse(arg) - 1].EngineWindow;
				Win32.GetWindowThreadProcessId(engineWindow, out var pid);
				if (pid == 0)
				{
					return "erro: sem motor";
				}
				Process.GetProcessById((int)pid).Kill();
				return "ok";
			});
		case "click":
		{
			string[] array2 = arg.Split(' ');
			return Mouse(int.Parse(array2[0]), int.Parse(array2[1]));
		}
		case "key":
		{
			IntPtr h2 = Engine();
			int value2 = int.Parse(arg);
			Win32.PostMessage(h2, 256u, new IntPtr(value2), IntPtr.Zero);
			Win32.PostMessage(h2, 257u, new IntPtr(value2), new IntPtr(-1073741823));
			return "ok";
		}
		case "type":
		{
			IntPtr h = Engine();
			string text2 = arg;
			foreach (char value in text2)
			{
				Win32.PostMessage(h, 258u, new IntPtr(value), IntPtr.Zero);
			}
			return "ok";
		}
		default:
			return "erro: comando desconhecido";
		}
	}

	private IntPtr Engine()
	{
		return (IntPtr)form.Invoke((Func<IntPtr>)(() => (form.ActiveTab == null) ? IntPtr.Zero : form.ActiveTab.EngineWindow));
	}

	private string Mouse(int x, int y)
	{
		IntPtr intPtr = Engine();
		if (intPtr == IntPtr.Zero)
		{
			return "erro: sem jogo na aba";
		}
		IntPtr l = new IntPtr((y << 16) | (x & 0xFFFF));
		Win32.PostMessage(intPtr, 512u, IntPtr.Zero, l);
		Thread.Sleep(30);
		Win32.PostMessage(intPtr, 513u, new IntPtr(1), l);
		Thread.Sleep(60);
		Win32.PostMessage(intPtr, 514u, IntPtr.Zero, l);
		return "ok";
	}

	private string Shot(string path)
	{
		if (path.Length == 0)
		{
			return "erro: falta o arquivo";
		}
		path = Path.GetFullPath(path);
		string enginePng = Path.Combine(Path.GetTempPath(), "legend-engine-shot-" + Guid.NewGuid().ToString("N") + ".png");
		bool waitEngine = false;
		Rectangle engineAt = Rectangle.Empty;
		Bitmap bitmap = (Bitmap)form.Invoke((Func<Bitmap>)delegate
		{
			Size clientSize = form.ClientSize;
			Point point = form.PointToScreen(Point.Empty);
			Bitmap bitmap2 = new Bitmap(Math.Max(1, form.Width), Math.Max(1, form.Height));
			form.DrawToBitmap(bitmap2, new Rectangle(Point.Empty, form.Size));
			Bitmap result = bitmap2.Clone(new Rectangle(point.X - form.Left, point.Y - form.Top, Math.Max(1, clientSize.Width), Math.Max(1, clientSize.Height)), bitmap2.PixelFormat);
			bitmap2.Dispose();
			AccountTab activeTab = form.ActiveTab;
			if (activeTab != null && activeTab.State == TabState.Playing && activeTab.RequestShot(enginePng))
			{
				waitEngine = true;
				engineAt = form.RectangleToClient(activeTab.Host.RectangleToScreen(activeTab.Host.ClientRectangle));
			}
			return result;
		});
		using (bitmap)
		{
			if (waitEngine && shotDone.WaitOne(10000) && File.Exists(enginePng))
			{
				using (Image image = Image.FromFile(enginePng))
				{
					using Graphics graphics = Graphics.FromImage(bitmap);
					graphics.DrawImage(image, engineAt.X, engineAt.Y, image.Width, image.Height);
				}
				try
				{
					File.Delete(enginePng);
				}
				catch (IOException)
				{
				}
			}
			bitmap.Save(path, ImageFormat.Png);
		}
		return "ok " + path + (waitEngine ? "" : " (sem jogo)");
	}

	public void OnEngineShot(AccountTab t, string result)
	{
		shotResult = result;
		shotDone.Set();
	}

	private string StateJson()
	{
		List<object> list = new List<object>();
		foreach (AccountTab tab in form.Tabs)
		{
			Dictionary<string, object> dictionary = new Dictionary<string, object>();
			dictionary["id"] = tab.Info.Id;
			dictionary["user"] = tab.Info.User;
			dictionary["state"] = tab.State.ToString();
			dictionary["online"] = tab.Online;
			dictionary["fps"] = tab.Fps;
			dictionary["mb"] = tab.MemoryMb;
			dictionary["muted"] = tab.Info.Muted;
			dictionary["active"] = tab == form.ActiveTab;
			dictionary["status"] = (tab.StatusScreen.Visible ? (tab.StatusScreen.Title + " | " + tab.StatusScreen.Detail + " | " + tab.StatusScreen.ButtonList()) : "");
			dictionary["window"] = tab.EngineWindow.ToInt64();
			list.Add(dictionary);
		}
		Dictionary<string, object> dictionary2 = new Dictionary<string, object>();
		dictionary2["tabs"] = list;
		dictionary2["server"] = form.Monitor.Current.ToString();
		dictionary2["ping"] = form.Monitor.LatencyMs;
		dictionary2["players"] = form.Monitor.Players;
		dictionary2["boot"] = form.Monitor.Boot;
		dictionary2["fullscreen"] = form.IsFullscreen;
		dictionary2["client"] = form.ClientSize.Width + "x" + form.ClientSize.Height;
		return new JavaScriptSerializer().Serialize(dictionary2);
	}

	public void Dispose()
	{
		disposed = true;
		listener.Stop();
	}
}
