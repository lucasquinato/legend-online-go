using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class EngineServer : IDisposable
{
	private readonly TcpListener listener;

	private readonly Control ui;

	private readonly Dictionary<string, EngineProcess> byToken = new Dictionary<string, EngineProcess>();

	private readonly object gate = new object();

	private volatile bool disposed;

	public readonly int Port;

	public EngineServer(Control ui)
	{
		this.ui = ui;
		listener = new TcpListener(IPAddress.Loopback, 0);
		listener.Start();
		Port = ((IPEndPoint)listener.LocalEndpoint).Port;
		Thread thread = new Thread(AcceptLoop);
		thread.IsBackground = true;
		thread.Name = "engine-ipc";
		thread.Start();
		Log.Info("[ipc] escutando em 127.0.0.1:" + Port);
	}

	public void Register(EngineProcess e)
	{
		lock (gate)
		{
			byToken[e.Token] = e;
		}
	}

	public void Unregister(EngineProcess e)
	{
		lock (gate)
		{
			byToken.Remove(e.Token);
		}
	}

	private void AcceptLoop()
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
				if (disposed)
				{
					break;
				}
				continue;
			}
			catch (ObjectDisposedException)
			{
				break;
			}
			c.NoDelay = true;
			Thread thread = new Thread((ThreadStart)delegate
			{
				ReadLoop(c);
			});
			thread.IsBackground = true;
			thread.Name = "engine-conn";
			thread.Start();
		}
	}

	private void ReadLoop(TcpClient c)
	{
		EngineProcess value = null;
		try
		{
			using StreamReader streamReader = new StreamReader(c.GetStream(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
			string text;
			while ((text = streamReader.ReadLine()) != null)
			{
				string[] array = text.Split('\t');
				if (value == null)
				{
					if (array.Length < 3 || array[0] != "hello")
					{
						break;
					}
					lock (gate)
					{
						byToken.TryGetValue(array[1], out value);
					}
					if (value == null)
					{
						Log.Info("[ipc] conexão com token desconhecido, fechada");
						break;
					}
					value.Attach(c);
				}
				EngineProcess target = value;
				string[] fields = array;
				Post(delegate
				{
					target.Receive(fields);
				});
			}
		}
		catch (IOException)
		{
		}
		catch (ObjectDisposedException)
		{
		}
		finally
		{
			c.Close();
			if (value != null)
			{
				EngineProcess target2 = value;
				Post(delegate
				{
					target2.Receive(new string[1] { "bye" });
				});
			}
		}
	}

	private void Post(MethodInvoker action)
	{
		if (ui.IsDisposed || !ui.IsHandleCreated)
		{
			return;
		}
		try
		{
			ui.BeginInvoke(action);
		}
		catch (InvalidOperationException)
		{
		}
	}

	public void Dispose()
	{
		disposed = true;
		listener.Stop();
	}
}
