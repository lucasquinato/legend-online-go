using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class MainForm : Form
{
	public const int MaxAccounts = 8;

	private const int WM_DPICHANGED = 736;

	public readonly LauncherState State;

	public readonly EngineServer Engines;

	public readonly ServerMonitor Monitor;

	public readonly EnginePool Pool;

	private readonly List<AccountTab> tabs = new List<AccountTab>();

	private readonly TopBar bar;

	private readonly Panel content;

	private AccountTab active;

	private ControlServer control;

	private bool fullscreen;

	private FormWindowState preFullscreenState;

	private Rectangle preFullscreenBounds;

	private FormWindowState lastWindowState;

	public IList<AccountTab> Tabs => tabs;

	public AccountTab ActiveTab => active;

	public bool IsFullscreen => fullscreen;

	public MainForm(LauncherState state)
	{
		State = state;
		Text = "Legend Online Go";
		FormBorderStyle = FormBorderStyle.None;
		SetStyle(ControlStyles.ResizeRedraw, true);
		BackColor = Theme.Background;
		base.AutoScaleMode = AutoScaleMode.None;
		base.KeyPreview = true;
		Icon appIcon = Assets.AppIcon;
		if (appIcon != null)
		{
			base.Icon = appIcon;
		}
		Api.Ui = this;
		Engines = new EngineServer(this);
		Monitor = new ServerMonitor(this);
		Pool = new EnginePool(Engines, this);
		Pool.Busy = delegate
		{
			foreach (AccountTab tab in tabs)
			{
				if (tab.State == TabState.Starting)
				{
					return true;
				}
			}
			return false;
		};
		bar = new TopBar(this);
		bar.Dock = DockStyle.Top;
		content = new Panel();
		content.Dock = DockStyle.Fill;
		content.BackColor = Theme.Background;
		base.Controls.Add(content);
		base.Controls.Add(bar);
		Monitor.Changed += delegate
		{
			bar.UpdateView();
			bool flag = false;
			foreach (AccountTab tab2 in tabs)
			{
				if (tab2.State == TabState.Reconnecting)
				{
					flag = true;
				}
			}
			if (!flag)
			{
				Monitor.Hurry(on: false);
			}
		};
		if (Program.ControlPort > 0)
		{
			control = new ControlServer(this, Program.ControlPort);
		}
	}

	protected override void OnHandleCreated(EventArgs e)
	{
		base.OnHandleCreated(e);
		ApplyDpi(Dpi.ForWindow(base.Handle));
		DarkTitleBar(base.Handle);
	}

	protected override void OnLoad(EventArgs e)
	{
		base.OnLoad(e);
		RestoreWindowBounds();
		if (State.Slots.Count == 0)
		{
			State.Slots.Add(SlotInfo.New());
		}
		AccountTab accountTab = null;
		foreach (SlotInfo slot in State.Slots)
		{
			AccountTab accountTab2 = CreateTab(slot);
			if (slot.Id == State.ActiveId || accountTab == null)
			{
				accountTab = accountTab2;
			}
		}
		SelectTab(accountTab);
		accountTab.Begin();
		foreach (AccountTab tab in tabs)
		{
			if (tab != accountTab)
			{
				tab.Begin();
			}
		}
		SaveState();
	}

	private AccountTab CreateTab(SlotInfo info)
	{
		AccountTab t = new AccountTab(info, this);
		t.Changed += delegate
		{
			if (t == active)
			{
				UpdateTitle();
			}
			bar.UpdateView();
		};
		tabs.Add(t);
		content.Controls.Add(t.Host);
		t.Host.Visible = false;
		return t;
	}

	public void AddAccount()
	{
		if (tabs.Count < 8)
		{
			SlotInfo slotInfo = SlotInfo.New();
			State.Slots.Add(slotInfo);
			Log.Info("[launcher] aba nova " + slotInfo.Id);
			AccountTab accountTab = CreateTab(slotInfo);
			SelectTab(accountTab);
			accountTab.Begin();
			SaveState();
		}
	}

	public void SelectTab(AccountTab t)
	{
		if (t != null && t != active)
		{
			AccountTab accountTab = active;
			active = t;
			t.Host.Visible = true;
			t.Host.BringToFront();
			if (accountTab != null)
			{
				accountTab.Host.Visible = false;
				accountTab.SetActive(active: false);
			}
			t.SetActive(active: true);
			State.ActiveId = t.Info.Id;
			UpdateTitle();
			bar.UpdateView();
			SaveState();
		}
	}

	public void CloseTab(AccountTab t)
	{
		if (tabs.Count > 1 && (t.State != TabState.Playing || DarkDialog.Confirm(this, "Fechar " + t.DisplayName + "?", "O jogo desta conta será fechado e o login salvo nesta aba, esquecido.", "Fechar conta")))
		{
			Log.Info("[launcher] fechar aba " + t.Info.Id + " (" + t.Info.User + ")");
			int val = tabs.IndexOf(t);
			tabs.Remove(t);
			State.Slots.Remove(t.Info);
			if (t == active)
			{
				active = null;
				SelectTab(tabs[Math.Min(val, tabs.Count - 1)]);
			}
			content.Controls.Remove(t.Host);
			t.Dispose();
			bar.UpdateView();
			SaveState();
		}
	}

	private void CycleTab(int dir)
	{
		if (tabs.Count >= 2 && active != null)
		{
			SelectTab(tabs[(tabs.IndexOf(active) + dir + tabs.Count) % tabs.Count]);
		}
	}

	public void ReconnectActive()
	{
		if (active != null)
		{
			active.Reconnect();
		}
	}

	public void ToggleMute()
	{
		if (active != null)
		{
			active.SetMuted(!active.Info.Muted);
		}
	}

	public void ShowTabMenu(AccountTab t, Point screen)
	{
		ContextMenuStrip menu = new ContextMenuStrip();
		menu.Renderer = new DarkMenuRenderer();
		menu.ShowImageMargin = false;
		menu.Font = Theme.Ui;
		menu.BackColor = Theme.Surface;
		menu.Padding = new Padding(2, 4, 2, 4);
		ToolStripMenuItem toolStripMenuItem = AddMenuItem(menu, "Reconectar", "F5", delegate
		{
			SelectTab(t);
			t.Reconnect();
		});
		toolStripMenuItem.Enabled = t.State != TabState.Login;
		AddMenuItem(menu, t.Info.Muted ? "Ativar som" : "Silenciar", null, delegate
		{
			t.SetMuted(!t.Info.Muted);
		});
		menu.Items.Add(new ToolStripSeparator());
		ToolStripMenuItem toolStripMenuItem2 = AddMenuItem(menu, "Sair da conta", null, delegate
		{
			SelectTab(t);
			t.Logout();
		});
		toolStripMenuItem2.Enabled = t.State != TabState.Login;
		AddMenuItem(menu, "Comprar diamantes", null, delegate { t.OpenRecharge(); });
		if (tabs.Count > 1)
		{
			ToolStripMenuItem toolStripMenuItem3 = AddMenuItem(menu, "Fechar aba", "Ctrl+W", delegate
			{
				CloseTab(t);
			});
			toolStripMenuItem3.Tag = "danger";
		}
		menu.Closed += delegate
		{
			BeginInvoke(new MethodInvoker(menu.Dispose));
		};
		menu.Show(screen);
	}

	private static ToolStripMenuItem AddMenuItem(ContextMenuStrip menu, string text, string shortcut, EventHandler click)
	{
		ToolStripMenuItem toolStripMenuItem = new ToolStripMenuItem(text);
		toolStripMenuItem.Padding = new Padding(Theme.S(6), Theme.S(5), Theme.S(6), Theme.S(5));
		toolStripMenuItem.ForeColor = Theme.Text;
		if (shortcut != null)
		{
			toolStripMenuItem.ShortcutKeyDisplayString = shortcut;
		}
		toolStripMenuItem.Click += click;
		menu.Items.Add(toolStripMenuItem);
		return toolStripMenuItem;
	}

	private void UpdateTitle()
	{
		Text = "Legend Online Go";
	}

	public void HandleShortcut(string name)
	{
		switch (name)
		{
		case "F5":
			ReconnectActive();
			return;
		case "F11":
			ToggleFullscreen();
			return;
		case "Ctrl+T":
			AddAccount();
			return;
		case "Ctrl+W":
			if (active != null)
			{
				CloseTab(active);
			}
			return;
		case "Ctrl+Tab":
			CycleTab(1);
			return;
		case "Ctrl+Shift+Tab":
			CycleTab(-1);
			return;
		}
		if (name.StartsWith("Ctrl+") && name.Length == 6 && char.IsDigit(name[5]))
		{
			int num = name[5] - 49;
			if (num >= 0 && num < tabs.Count)
			{
				SelectTab(tabs[num]);
			}
		}
	}

	protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
	{
		string text = null;
		Keys keys = keyData & Keys.KeyCode;
		Keys keys2 = keyData & Keys.Modifiers;
		switch (keyData)
		{
		case Keys.F5:
			text = "F5";
			break;
		case Keys.F11:
			text = "F11";
			break;
		case Keys.T | Keys.Control:
			text = "Ctrl+T";
			break;
		case Keys.W | Keys.Control:
			text = "Ctrl+W";
			break;
		case Keys.Tab | Keys.Control:
			text = "Ctrl+Tab";
			break;
		case Keys.Tab | Keys.Shift | Keys.Control:
			text = "Ctrl+Shift+Tab";
			break;
		default:
			if (keys2 == Keys.Control && keys >= Keys.D1 && keys <= Keys.D9)
			{
				text = "Ctrl+" + (int)(keys - 48);
			}
			break;
		}
		if (text != null)
		{
			HandleShortcut(text);
			return true;
		}
		return base.ProcessCmdKey(ref msg, keyData);
	}

	protected override void OnActivated(EventArgs e)
	{
		base.OnActivated(e);
		if (active != null)
		{
			BeginInvoke((MethodInvoker)delegate
			{
				if (!IsDisposed && active != null && !bar.AccountsOpen) active.FocusGame();
			});
		}
	}

	public void ToggleFullscreen()
	{
		SuspendLayout();
		if (!fullscreen)
		{
			preFullscreenState = base.WindowState;
			if (base.WindowState == FormWindowState.Maximized)
			{
				base.WindowState = FormWindowState.Normal;
			}
			preFullscreenBounds = base.Bounds;
			fullscreen = true;
			base.WindowState = FormWindowState.Maximized;
		}
		else
		{
			fullscreen = false;
			base.WindowState = FormWindowState.Normal;
			base.Bounds = preFullscreenBounds;
			if (preFullscreenState == FormWindowState.Maximized)
			{
				base.WindowState = FormWindowState.Maximized;
			}
			fullscreen = false;
		}
		ResumeLayout();
		bar.UpdateView();
		if (active != null)
		{
			active.FocusGame();
		}
	}

	private void RestoreWindowBounds()
	{
		Rectangle bounds = State.Bounds;
		bool flag = false;
		if (!bounds.IsEmpty && bounds.Width >= MinimumSize.Width && bounds.Height >= MinimumSize.Height)
		{
			Screen[] allScreens = Screen.AllScreens;
			foreach (Screen screen in allScreens)
			{
				if (screen.WorkingArea.IntersectsWith(bounds))
				{
					flag = true;
				}
			}
		}
		if (flag)
		{
			base.StartPosition = FormStartPosition.Manual;
			base.Bounds = bounds;
			if (State.Maximized)
			{
				base.WindowState = FormWindowState.Maximized;
			}
		}
		else
		{
			Rectangle workingArea = Screen.FromHandle(base.Handle).WorkingArea;
			Size size = new Size(Math.Min(Theme.S(1280), workingArea.Width - Theme.S(40)), Math.Min(Theme.S(720) + bar.Height, workingArea.Height - Theme.S(40)));
			base.Bounds = new Rectangle(workingArea.X + (workingArea.Width - size.Width) / 2, workingArea.Y + (workingArea.Height - size.Height) / 2, size.Width, size.Height);
		}
	}

	public void SaveState()
	{
		if (fullscreen)
		{
			State.Bounds = preFullscreenBounds;
			State.Maximized = preFullscreenState == FormWindowState.Maximized;
		}
		else if (base.IsHandleCreated && base.WindowState != FormWindowState.Minimized)
		{
			State.Bounds = ((base.WindowState == FormWindowState.Normal) ? base.Bounds : base.RestoreBounds);
			State.Maximized = base.WindowState == FormWindowState.Maximized;
		}
		State.Save();
	}

	protected override void OnResize(EventArgs e)
	{
		base.OnResize(e);
		if (bar != null) bar.UpdateView();
		bool flag = lastWindowState == FormWindowState.Minimized;
		bool flag2 = base.WindowState == FormWindowState.Minimized;
		lastWindowState = base.WindowState;
		if (flag == flag2)
		{
			return;
		}
		foreach (AccountTab tab in tabs)
		{
			tab.UpdateShown();
		}
	}

	protected override void OnResizeEnd(EventArgs e)
	{
		base.OnResizeEnd(e);
		SaveState();
	}

	protected override void OnFormClosing(FormClosingEventArgs e)
	{
		SaveState();
		base.OnFormClosing(e);
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing)
		{
			foreach (AccountTab tab in tabs)
			{
				tab.Dispose();
			}
			if (control != null)
			{
				control.Dispose();
			}
			Pool.Dispose();
			Monitor.Dispose();
			Engines.Dispose();
		}
		base.Dispose(disposing);
	}

	protected override void WndProc(ref Message m)
	{
		if (m.Msg == 0x85 || m.Msg == 0x86)
		{
			// Suppress native non-client painting, including the inactive white frame.
			m.Result = m.Msg == 0x86 ? new IntPtr(1) : IntPtr.Zero;
			return;
		}
		// Keep native sizing/snap semantics, but let the client draw the entire frame.
		if (m.Msg == 0x83 && m.WParam != IntPtr.Zero)
		{
			m.Result = IntPtr.Zero;
			return;
		}
		if (m.Msg == 0x84)
		{
			Point p = PointToClient(new Point(unchecked((short)m.LParam.ToInt64()), unchecked((short)(m.LParam.ToInt64() >> 16))));
			int hit = ResizeHitTest(p);
			if (hit != 0) { m.Result = new IntPtr(hit); return; }
		}
		if (m.Msg == 0x24)
		{
			base.WndProc(ref m);
			MinMaxInfo info = (MinMaxInfo)Marshal.PtrToStructure(m.LParam, typeof(MinMaxInfo));
			Screen screen = Screen.FromHandle(Handle);
			Rectangle area = fullscreen ? screen.Bounds : screen.WorkingArea;
			info.MaxPosition = new Point(area.X - screen.Bounds.X, area.Y - screen.Bounds.Y);
			info.MaxSize = area.Size;
			info.MinTrackSize = MinimumSize;
			Marshal.StructureToPtr(info, m.LParam, false);
			return;
		}
		if (m.Msg == 736)
		{
			int dpi = m.WParam.ToInt32() & 0xFFFF;
			Dpi.RECT rECT = (Dpi.RECT)Marshal.PtrToStructure(m.LParam, typeof(Dpi.RECT));
			ApplyDpi(dpi);
			base.Bounds = fullscreen ? Screen.FromHandle(Handle).Bounds : new Rectangle(rECT.Left, rECT.Top, rECT.Right - rECT.Left, rECT.Bottom - rECT.Top);
		}
		else
		{
			base.WndProc(ref m);
		}
	}

	private void ApplyDpi(int dpi)
	{
		Theme.Scale = (float)dpi / 96f;
		Rectangle work = Screen.FromHandle(Handle).WorkingArea;
		MinimumSize = new Size(Math.Min(Theme.S(1000), work.Width), Math.Min(Theme.S(640), work.Height));
		bar.Height = Theme.S(TopBar.BarHeight);
		Padding = new Padding(Theme.S(4), 0, Theme.S(4), Theme.S(4));
		bar.UpdateView();
		foreach (AccountTab tab in tabs)
		{
			tab.LoginForm.LayoutFields();
		}
		Invalidate(invalidateChildren: true);
	}

	protected override CreateParams CreateParams
	{
		get
		{
			CreateParams cp = base.CreateParams;
			cp.Style |= 0x40000 | 0x20000 | 0x10000 | 0x80000;
			return cp;
		}
	}

	[StructLayout(LayoutKind.Sequential)]
	private struct MinMaxInfo
	{
		public Point Reserved;
		public Size MaxSize;
		public Point MaxPosition;
		public Size MinTrackSize;
		public Size MaxTrackSize;
	}

	internal int ResizeHitTest(Point p)
	{
		if (fullscreen || WindowState != FormWindowState.Normal) return 0;
		int edge = Theme.S(5);
		bool left = p.X < edge, right = p.X >= ClientSize.Width - edge;
		bool top = p.Y < edge, bottom = p.Y >= ClientSize.Height - edge;
		if (top) return left ? 13 : (right ? 14 : 12);
		if (bottom) return left ? 16 : (right ? 17 : 15);
		return left ? 10 : (right ? 11 : 0);
	}

	[DllImport("user32.dll")]
	private static extern bool ReleaseCapture();
	[DllImport("user32.dll")]
	private static extern IntPtr SendMessage(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam);

	internal void DragWindow()
	{
		if (fullscreen) return;
		ReleaseCapture();
		SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero);
	}

	internal void ToggleMaximize()
	{
		if (fullscreen) ToggleFullscreen();
		else WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
		SaveState();
	}

	[DllImport("dwmapi.dll")]
	private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

	private static void DarkTitleBar(IntPtr handle)
	{
		try
		{
			int policy = 1; // DWMNCRP_DISABLED: the launcher owns the entire frame.
			DwmSetWindowAttribute(handle, 2, ref policy, 4);
			int value = 1;
			if (DwmSetWindowAttribute(handle, 20, ref value, 4) != 0)
			{
				DwmSetWindowAttribute(handle, 19, ref value, 4);
			}
			int value2 = Theme.Bar.R | (Theme.Bar.G << 8) | (Theme.Bar.B << 16);
			DwmSetWindowAttribute(handle, 35, ref value2, 4);
		}
		catch (DllNotFoundException)
		{
		}
		catch (EntryPointNotFoundException)
		{
		}
	}

	public void OnEngineShot(AccountTab t, string result)
	{
		if (control != null)
		{
			control.OnEngineShot(t, result);
		}
	}
}
