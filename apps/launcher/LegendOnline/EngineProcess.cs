using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class EngineProcess : IDisposable
{
	public readonly string Token;

	public readonly string SlotId;

	public IntPtr Window = IntPtr.Zero;

	private readonly EngineServer server;

	private readonly Control ui;

	private Process process;

	private TcpClient client;

	private Stream stream;

	private readonly object sendGate = new object();

	private volatile bool exited;

	private bool disposed;

	public bool Started;

	public int Pid
	{
		get
		{
			if (process == null)
			{
				return 0;
			}
			return process.Id;
		}
	}

	public bool Exited => exited;

	public bool Ready => stream != null;

	public event Action<EngineProcess, string[]> Message;

	public event Action<EngineProcess, int> ProcessExited;

	public EngineProcess(EngineServer server, Control ui, string slotId)
	{
		this.server = server;
		this.ui = ui;
		SlotId = slotId;
		byte[] array = new byte[18];
		using (RandomNumberGenerator randomNumberGenerator = RandomNumberGenerator.Create())
		{
			randomNumberGenerator.GetBytes(array);
		}
		Token = Convert.ToBase64String(array).Replace('+', '-').Replace('/', '_');
	}

	public void Start()
	{
		server.Register(this);
		process = Win32.StartEngine(Program.EngineExe, "--ipc=" + server.Port + " --token=" + Token + " --slot=" + SlotId);
		process.EnableRaisingEvents = true;
		process.Exited += delegate
		{
			exited = true;
			int code = 0;
			try
			{
				code = process.ExitCode;
			}
			catch (InvalidOperationException)
			{
			}
			if (ui.IsDisposed || !ui.IsHandleCreated)
			{
				return;
			}
			try
			{
				ui.BeginInvoke((MethodInvoker)delegate
				{
					this.ProcessExited?.Invoke(this, code);
				});
			}
			catch (InvalidOperationException)
			{
			}
		};
		if (process.HasExited)
		{
			exited = true;
		}
		Log.Info("[" + SlotId + "] motor aberto, pid " + process.Id);
	}

	public void Attach(TcpClient c)
	{
		lock (sendGate)
		{
			client = c;
			stream = c.GetStream();
		}
	}

	public void Receive(string[] f)
	{
		if (!disposed)
		{
			this.Message?.Invoke(this, f);
		}
	}

	public void Send(params string[] fields)
	{
		for (int i = 0; i < fields.Length; i++)
		{
			fields[i] = (fields[i] ?? "").Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
		}
		byte[] bytes = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false).GetBytes(string.Join("\t", fields) + "\n");
		lock (sendGate)
		{
			if (stream == null)
			{
				return;
			}
			try
			{
				stream.Write(bytes, 0, bytes.Length);
			}
			catch (IOException)
			{
			}
			catch (ObjectDisposedException)
			{
			}
		}
	}

	public bool Embed(IntPtr parent, Size size)
	{
		if (Window == IntPtr.Zero)
		{
			Window = Win32.FindEngineWindow(Pid, "LegendEngine " + SlotId);
		}
		if (Window == IntPtr.Zero)
		{
			return false;
		}
		Win32.MakeChild(Window, parent, size);
		return true;
	}

	public void Resize(Size size)
	{
		if (Window != IntPtr.Zero)
		{
			Win32.SetWindowPos(Window, IntPtr.Zero, 0, 0, size.Width, size.Height, 20u);
		}
	}

	public void SetForeground(bool foreground)
	{
		if (process == null || exited)
		{
			return;
		}
		Send("front", foreground ? "1" : "0");
		if (Started && Window != IntPtr.Zero)
		{
			Win32.ShowWindow(Window, foreground ? 8 : 0);
		}
		try
		{
			process.PriorityClass = (foreground ? ProcessPriorityClass.Normal : ProcessPriorityClass.BelowNormal);
		}
		catch (InvalidOperationException)
		{
		}
		catch (Win32Exception)
		{
		}
	}

	public void Focus()
	{
		if (Window != IntPtr.Zero)
		{
			Win32.SetFocus(Window);
		}
	}

	public void Stop()
	{
		if (disposed)
		{
			return;
		}
		disposed = true;
		server.Unregister(this);
		Send("quit");
		Process p = process;
		if (p != null && !exited)
		{
			ThreadPool.QueueUserWorkItem(delegate
			{
				try
				{
					if (!p.WaitForExit(2500))
					{
						p.Kill();
					}
				}
				catch (InvalidOperationException)
				{
				}
				catch (Win32Exception)
				{
				}
			});
		}
		lock (sendGate)
		{
			if (client != null)
			{
				client.Close();
			}
			stream = null;
		}
	}

	public void Dispose()
	{
		Stop();
	}
}
