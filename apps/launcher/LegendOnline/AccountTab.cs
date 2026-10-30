using System;
using System.Drawing;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class AccountTab : IDisposable
{
	private const int HangMs = 45000;
	internal const int ReconnectDelayMs = 5000;

	public readonly SlotInfo Info;

	public readonly Panel Host;

	public TabState State;

	public bool Online;

	public int Fps = -1;

	public int MemoryMb = -1;

	private readonly MainForm form;

	private readonly LoginView login;

	private readonly StatusView status;

	private EngineProcess engine;

	private bool kicked;

	private int attempts;

	private int nextAttemptTick;

	private string reconnectReason = "";

	private readonly Timer tick = new Timer();

	private int startedTick;

	private int lastPerfTick;

	private bool hung;

	private bool disposed;

	private string pendingTicket = "";

	public string DisplayName
	{
		get
		{
			if (Info.User.Length <= 0)
			{
				return "Nova conta";
			}
			return Info.User;
		}
	}

	public bool Busy
	{
		get
		{
			if (State != TabState.Starting)
			{
				return State == TabState.Reconnecting;
			}
			return true;
		}
	}

	public bool Shown
	{
		get
		{
			if (form.ActiveTab == this)
			{
				return form.WindowState != FormWindowState.Minimized;
			}
			return false;
		}
	}

	public IntPtr EngineWindow
	{
		get
		{
			if (engine == null)
			{
				return IntPtr.Zero;
			}
			return engine.Window;
		}
	}

	public LoginView LoginForm => login;

	public StatusView StatusScreen => status;

	public event EventHandler Changed;

	public AccountTab(SlotInfo info, MainForm form)
	{
		Info = info;
		this.form = form;
		Host = new Panel();
		Host.Dock = DockStyle.Fill;
		Host.BackColor = Theme.Background;
		Panel host = Host;
		EventHandler value = delegate
		{
			if (engine != null)
			{
				engine.Resize(Host.ClientSize);
			}
		};
		host.Resize += value;
		login = new LoginView(form.State.KnownUsers);
		login.Dock = DockStyle.Fill;
		login.Visible = false;
		login.Submit += OnSubmit;
		Host.Controls.Add(login);
		status = new StatusView();
		status.Dock = DockStyle.Fill;
		status.Visible = false;
		Host.Controls.Add(status);
		tick.Interval = 500;
		tick.Tick += OnTick;
		tick.Start();
	}

	public void Begin()
	{
		if (Info.HasLogin)
		{
			Resume();
		}
		else
		{
			ShowLogin("", "");
		}
	}

	private void ShowLogin(string prefill, string error)
	{
		StopEngine();
		State = TabState.Login;
		Online = false;
		status.Visible = false;
		login.Visible = true;
		login.BringToFront();
		login.SetBusy(on: false);
		login.SetMode(registerMode: false);
		login.UserText = ((prefill.Length > 0) ? prefill : Info.User);
		login.ClearPasswords();
		if (error.Length > 0)
		{
			login.ShowError(error);
		}
		if (form.ActiveTab == this)
		{
			login.FocusFirstEmpty();
		}
		RaiseChanged();
	}

	private void OnSubmit(string user, string password, bool register)
	{
		login.SetBusy(on: true);
		login.ShowInfo("");
		Action<ApiResult> done = delegate(ApiResult r)
		{
			if (!disposed)
			{
				login.SetBusy(on: false);
				if (!r.Ok)
				{
					login.ShowError(r.Error);
					login.FocusFirstEmpty();
				}
				else
				{
					login.ClearPasswords();
					SetLogin(r.Str("username"), r.Str("ticket"));
					Log.Info("[" + Info.Id + "] " + (register ? "conta criada" : "login") + ": " + Info.User);
					Play(r.Str("ticket"));
				}
			}
		};
		if (register)
		{
			Api.Register(user, password, done);
		}
		else
		{
			Api.Login(user, password, done);
		}
	}

	private void SetLogin(string user, string ticket)
	{
		Info.User = user;
		Info.Ticket = ticket;
		if (user.Length > 0)
		{
			form.State.RememberUser(user);
		}
		form.SaveState();
	}

	public void Logout()
	{
		Log.Info("[" + Info.Id + "] sair da conta " + Info.User);
		string user = Info.User;
		Info.Ticket = "";
		form.SaveState();
		ShowLogin(user, "");
	}

	private void Resume()
	{
		string ticket = Info.Ticket;
		if (Info.User.Length == 0 || ticket.Length == 0)
		{
			ShowLogin("", "");
			return;
		}
		ShowStatus(TabState.Starting, "Entrando como " + Info.User, "Conferindo a sessão…", true, Theme.Accent);
		Api.Resume(Info.User, ticket, delegate(ApiResult r)
		{
			if (!disposed && State == TabState.Starting)
			{
				if (r.Ok)
				{
					Play(ticket);
				}
				else if (r.Network)
				{
					Lost("Sem conexão com o servidor.");
				}
				else
				{
					Log.Info("[" + Info.Id + "] sessão recusada: " + r.Error);
					Info.Ticket = "";
					form.SaveState();
					ShowLogin(Info.User, r.Error);
				}
			}
		});
	}

	private void Play(string ticket)
	{
		StopEngine();
		kicked = false;
		Online = false;
		Fps = (MemoryMb = -1);
		ShowStatus(TabState.Starting, "Entrando como " + Info.User, "Abrindo o jogo…", true, Theme.Accent);
		status.Progress = 0f;
		pendingTicket = ticket;
		startedTick = Environment.TickCount;
		EngineProcess engineProcess = form.Pool.Take();
		if (engineProcess != null)
		{
			engine = engineProcess;
			engine.Message += OnEngineMessage;
			engine.ProcessExited += OnEngineExited;
			Log.Info("[" + Info.Id + "] usando o motor reserva (pid " + engine.Pid + ")");
			RaiseChanged();
			EmbedAndPlay(0);
		}
		else
		{
			engine = new EngineProcess(form.Engines, form, Info.Id);
			engine.Message += OnEngineMessage;
			engine.ProcessExited += OnEngineExited;
			try
			{
				engine.Start();
			}
			catch (Exception ex)
			{
				Log.Info("[" + Info.Id + "] motor não abriu: " + ex.Message);
				engine = null;
				Stop("Não foi possível abrir o jogo", "O Windows não deixou abrir o motor do jogo (" + ex.Message + "). Reinstale o launcher.");
				return;
			}
			RaiseChanged();
		}
	}

	private void OnEngineMessage(EngineProcess e, string[] f)
	{
		if (e != engine)
		{
			return;
		}
		switch (f[0])
		{
		case "hello":
			Log.Info("[" + Info.Id + "] motor pronto em " + (Environment.TickCount - startedTick) + " ms");
			EmbedAndPlay(0);
			break;
		case "state":
			OnEngineState(f);
			break;
		case "key":
			if (f.Length > 1)
			{
				form.HandleShortcut(f[1]);
			}
			break;
		case "perf":
			lastPerfTick = Environment.TickCount;
			if (hung)
			{
				Unhung();
			}
			if (f.Length > 2)
			{
				int.TryParse(f[1], out Fps);
				int.TryParse(f[2], out MemoryMb);
				RaiseChanged();
			}
			break;
		case "shot":
			form.OnEngineShot(this, (f.Length > 1) ? f[1] : "");
			break;
		case "log":
			if (f.Length > 1)
			{
				Log.Info("[" + Info.Id + "] " + f[1]);
			}
			break;
		case "bye":
			if (!e.Exited && State != TabState.Login)
			{
				Log.Info("[" + Info.Id + "] motor fechou a conexão");
			}
			break;
		}
	}

	private void EmbedAndPlay(int tries)
	{
		EngineProcess e = engine;
		if (e == null || disposed)
		{
			return;
		}
		if (!e.Embed(Host.Handle, Host.ClientSize))
		{
			if (tries < 50)
			{
				Timer t = new Timer();
				t.Interval = 100;
				t.Tick += delegate
				{
					t.Dispose();
					if (e == engine)
					{
						EmbedAndPlay(tries + 1);
					}
				};
				t.Start();
			}
			else
			{
				Log.Info("[" + Info.Id + "] janela do motor não encontrada");
				Lost("O jogo não abriu a janela.");
			}
		}
		else
		{
			e.Send("play", Program.GameOrigin, Info.User, pendingTicket, Info.Muted ? "1" : "0");
			e.SetForeground(Shown);
			pendingTicket = "";
			status.Detail = "";
		}
	}

	private void OnEngineState(string[] f)
	{
		switch ((f.Length > 1) ? f[1] : "")
		{
		case "loading":
		{
			if (f.Length > 3 && long.TryParse(f[2], out var result) && long.TryParse(f[3], out var result2) && result2 > 0)
			{
				status.Progress = Math.Min(1f, (float)result / (float)result2);
			}
			break;
		}
		case "started":
			engine.Started = true;
			engine.SetForeground(Shown);
			State = TabState.Playing;
			lastPerfTick = Environment.TickCount;
			hung = false;
			status.Visible = false;
			login.Visible = false;
			engine.Resize(Host.ClientSize);
			if (form.ActiveTab == this && form.ContainsFocus)
			{
				engine.Focus();
			}
			Log.Info("[" + Info.Id + "] jogo na tela em " + (Environment.TickCount - startedTick) + " ms");
			RaiseChanged();
			break;
		case "online":
			Online = true;
			attempts = 0;
			RaiseChanged();
			break;
		case "kicked":
			kicked = true;
			break;
		case "offline":
			Online = false;
			if (kicked)
			{
				Stop("Conta aberta em outro lugar", "Esta conta entrou no jogo em outro computador ou aba, e esta conexão foi encerrada.", new StatusButton("Jogar aqui", primary: true, Reconnect));
			}
			else
			{
				Lost("A conexão com o servidor caiu.");
			}
			break;
		case "failed":
			Lost("O jogo não carregou.");
			break;
		}
	}

	private void OnEngineExited(EngineProcess e, int code)
	{
		if (e == engine)
		{
			Log.Info("[" + Info.Id + "] motor terminou (código " + code + ")");
			engine = null;
			Online = false;
			if (State == TabState.Playing || State == TabState.Starting)
			{
				Lost("O jogo fechou inesperadamente.");
			}
		}
	}

	private void Hung()
	{
		hung = true;
		Log.Info("[" + Info.Id + "] o jogo não responde há " + (Environment.TickCount - lastPerfTick) / 1000 + " s");
		status.Show("O jogo não está respondendo", "Esta conta travou. As outras abas continuam normais. Reinicie esta conta ou espere mais um pouco.", false, Theme.Busy, new StatusButton("Esperar", primary: false, Unhung), new StatusButton("Reiniciar", primary: true, Reconnect));
		status.Visible = true;
		status.BringToFront();
		RaiseChanged();
	}

	private void Unhung()
	{
		if (hung)
		{
			hung = false;
			lastPerfTick = Environment.TickCount;
			if (State == TabState.Playing)
			{
				status.Visible = false;
				FocusGame();
			}
			RaiseChanged();
		}
	}

	private void Lost(string reason)
	{
		StopEngine();
		Online = false;
		reconnectReason = reason;
		attempts++;
		int num = ReconnectDelayMs;
		nextAttemptTick = Environment.TickCount + num;
		Log.Info(string.Concat("[", Info.Id, "] ", reason, " Tentativa ", attempts, " em ", num / 1000, " s (servidor ", form.Monitor.Current, ")"));
		if (attempts > 8)
		{
			Stop("Não foi possível reconectar", reason + " Tente de novo daqui a pouco.", new StatusButton("Tentar de novo", primary: true, Reconnect));
			return;
		}
		ShowStatus(TabState.Reconnecting, "Reconectando…", reason, true, Theme.Busy, new StatusButton("Reconectar agora", primary: true, Reconnect));
		form.Monitor.Hurry(on: true);
		UpdateReconnectText();
	}

	private void OnTick(object sender, EventArgs e)
	{
		if (State == TabState.Playing && !hung && engine != null && Environment.TickCount - lastPerfTick > 45000)
		{
			Hung();
		}
		if (State == TabState.Reconnecting)
		{
			UpdateReconnectText();
			if (form.Monitor.Current == ServerMonitor.Status.Online && Environment.TickCount - nextAttemptTick >= 0)
			{
				Resume();
			}
		}
	}

	private void UpdateReconnectText()
	{
		if (form.Monitor.Current != ServerMonitor.Status.Online)
		{
			status.Detail = ((form.Monitor.Current == ServerMonitor.Status.Offline) ? "Servidor fora do ar ou sem internet. Entrando assim que ele voltar." : "Procurando o servidor…");
			return;
		}
		int num = (nextAttemptTick - Environment.TickCount + 999) / 1000;
		status.Detail = ((num > 0) ? ("Tentando de novo em " + num + " s") : "Tentando agora…");
	}

	public void Reconnect()
	{
		if (State != TabState.Login)
		{
			Log.Info(string.Concat("[", Info.Id, "] reconectar (", State, ")"));
			attempts = 0;
			form.Monitor.Hurry(on: true);
			Resume();
		}
	}

	private void Stop(string title, string message, params StatusButton[] buttons)
	{
		StopEngine();
		Online = false;
		ShowStatus(TabState.Stopped, title, message, spinner: false, Theme.Danger, buttons);
		if (buttons.Length == 0)
		{
			status.Show(title, message, false, Theme.Danger, new StatusButton("Tentar de novo", primary: true, Reconnect));
		}
		RaiseChanged();
	}

	private void ShowStatus(TabState state, string title, string message, bool spinner, Color accent, params StatusButton[] buttons)
	{
		State = state;
		login.Visible = false;
		status.Show(title, message, spinner, accent, buttons);
		status.SetPresentation(state);
		status.Visible = true;
		status.BringToFront();
		RaiseChanged();
	}

	private void StopEngine()
	{
		if (engine != null)
		{
			EngineProcess engineProcess = engine;
			engine = null;
			engineProcess.Message -= OnEngineMessage;
			engineProcess.ProcessExited -= OnEngineExited;
			engineProcess.Stop();
		}
	}

	public void SetMuted(bool muted)
	{
		Info.Muted = muted;
		if (engine != null)
		{
			engine.Send("mute", muted ? "1" : "0");
		}
		form.SaveState();
		RaiseChanged();
	}

	public void SetActive(bool active)
	{
		if (engine != null)
		{
			engine.SetForeground(Shown);
		}
		if (active)
		{
			if (State == TabState.Playing && engine != null)
			{
				engine.Focus();
			}
			else if (State == TabState.Login)
			{
				login.FocusFirstEmpty();
			}
		}
	}

	public void UpdateShown()
	{
		if (engine != null)
		{
			engine.SetForeground(Shown);
		}
	}

	public void FocusGame()
	{
		if (State == TabState.Playing && engine != null)
		{
			engine.Focus();
		}
	}

	public void OpenRecharge()
	{
		string ticket = Info.Ticket;
		if (Info.User.Length == 0 || ticket.Length == 0)
		{
			Api.OpenInBrowser("https://legendremake.com/recarga");
			return;
		}
		Api.Recharge(Info.User, ticket, delegate(ApiResult r)
		{
			Api.OpenInBrowser(r.Ok ? r.Str("url") : "https://legendremake.com/recarga");
		});
	}

	public bool RequestShot(string path)
	{
		if (engine == null || State != TabState.Playing)
		{
			return false;
		}
		engine.Send("shot", path);
		return true;
	}

	private void RaiseChanged()
	{
		this.Changed?.Invoke(this, EventArgs.Empty);
	}

	public void Dispose()
	{
		disposed = true;
		tick.Dispose();
		StopEngine();
		Host.Dispose();
	}
}
