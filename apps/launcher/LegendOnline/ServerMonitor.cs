using System;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class ServerMonitor : IDisposable
{
	public enum Status
	{
		Checking,
		Online,
		Offline
	}

	private const int NormalMs = 5000;

	private const int FastMs = 5000;

	public Status Current;

	public int LatencyMs = -1;

	public int Players = -1;

	public string Boot = "";

	public int LastOkTick;

	private readonly Control ui;

	private readonly System.Threading.Timer timer;

	private int busy;

	private bool fast;

	private int failures;

	private bool disposed;

	private readonly int[] samples = new int[5];

	private int sampleCount;

	public event EventHandler Changed;

	public ServerMonitor(Control ui)
	{
		this.ui = ui;
		timer = new System.Threading.Timer(Tick, null, 0, NormalMs);
	}

	public void Hurry(bool on)
	{
		if (!disposed && on != fast)
		{
			fast = on;
			timer.Change(on ? 0 : NormalMs, on ? FastMs : NormalMs);
		}
	}

	private void Tick(object _)
	{
		if (Interlocked.Exchange(ref busy, 1) == 1)
		{
			return;
		}
		try
		{
			Stopwatch stopwatch = Stopwatch.StartNew();
			ApiResult apiResult = Api.Request("GET", Program.GameOrigin + "/launcher/api/status", null, 6000, quiet: true);
			int ms = (int)stopwatch.ElapsedMilliseconds;
			bool ok = apiResult.Ok;
			Status current = Current;
			if (ok)
			{
				failures = 0;
				AddSample(ms);
				Players = apiResult.Int("online");
				string text = apiResult.Str("boot");
				if (Boot.Length > 0 && text != Boot)
				{
					Log.Info("[server] reiniciou (boot " + Boot + " -> " + text + ")");
				}
				Boot = text;
				LastOkTick = Environment.TickCount;
				Current = Status.Online;
			}
			else
			{
				failures++;
				if (failures >= 2 || Current == Status.Checking)
				{
					Current = Status.Offline;
					sampleCount = 0;
					LatencyMs = -1;
				}
			}
			if (Current != current)
			{
				Log.Info(string.Concat("[server] ", Current, ok ? (" " + LatencyMs + " ms, " + Players + " online") : (" (" + apiResult.Error + ")")));
			}
			Raise();
		}
		finally
		{
			Interlocked.Exchange(ref busy, 0);
		}
	}

	private void AddSample(int ms)
	{
		if (sampleCount < samples.Length)
		{
			samples[sampleCount++] = ms;
		}
		else
		{
			Array.Copy(samples, 1, samples, 0, samples.Length - 1);
			samples[samples.Length - 1] = ms;
		}
		int[] array = new int[sampleCount];
		Array.Copy(samples, array, sampleCount);
		Array.Sort(array);
		LatencyMs = array[sampleCount / 2];
	}

	private void Raise()
	{
		if (disposed || ui.IsDisposed || !ui.IsHandleCreated)
		{
			return;
		}
		try
		{
			ui.BeginInvoke((MethodInvoker)delegate
			{
				this.Changed?.Invoke(this, EventArgs.Empty);
			});
		}
		catch (InvalidOperationException)
		{
		}
	}

	public void Dispose()
	{
		disposed = true;
		timer.Dispose();
	}
}
