using System;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class EnginePool : IDisposable
{
	private readonly EngineServer server;

	private readonly Control ui;

	private readonly Timer timer = new Timer();

	private EngineProcess spare;

	private bool spareReady;

	private int count;

	public Func<bool> Busy;

	public EnginePool(EngineServer server, Control ui)
	{
		this.server = server;
		this.ui = ui;
		timer.Interval = 4000;
		Timer obj = timer;
		EventHandler value = delegate
		{
			EnsureSpare();
		};
		obj.Tick += value;
		timer.Start();
	}

	public EngineProcess Take()
	{
		if (spare == null || !spareReady || spare.Exited)
		{
			return null;
		}
		EngineProcess engineProcess = spare;
		engineProcess.Message -= OnSpareMessage;
		engineProcess.ProcessExited -= OnSpareExited;
		spare = null;
		spareReady = false;
		return engineProcess;
	}

	private void EnsureSpare()
	{
		if (spare != null)
		{
			return;
		}
		Func<bool> busy = Busy;
		if (busy != null && busy())
		{
			return;
		}
		count++;
		spare = new EngineProcess(server, ui, "reserva" + count);
		spare.Message += OnSpareMessage;
		spare.ProcessExited += OnSpareExited;
		try
		{
			spare.Start();
			spare.SetForeground(foreground: false);
		}
		catch (Exception ex)
		{
			Log.Info("[launcher] motor reserva não abriu: " + ex.Message);
			spare = null;
			timer.Interval = 60000;
		}
	}

	private void OnSpareMessage(EngineProcess e, string[] f)
	{
		if (e == spare && !(f[0] != "hello"))
		{
			e.Window = Win32.FindEngineWindow(e.Pid, "LegendEngine " + e.SlotId);
			spareReady = e.Window != IntPtr.Zero;
		}
	}

	private void OnSpareExited(EngineProcess e, int code)
	{
		if (e == spare)
		{
			spare = null;
			spareReady = false;
		}
	}

	public void Dispose()
	{
		timer.Dispose();
		if (spare != null)
		{
			spare.Stop();
		}
		spare = null;
	}
}
