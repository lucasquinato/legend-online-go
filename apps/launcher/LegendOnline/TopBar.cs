using System;
using System.Drawing;
using System.Windows.Forms;

namespace LegendOnline;

// One client-drawn caption. Account/session ownership remains in MainForm.
internal sealed class TopBar : Control
{
    public const int BarHeight = 40;
    private readonly MainForm owner;
    private readonly Timer anim = new Timer();
    private readonly ToolTip tip = new ToolTip();
    private readonly Rectangle[] buttons = new Rectangle[6];
    private Rectangle account, status, pingStatus, playersStatus;
    private int hover = -1, pressed = -1;
    private AccountDropdown dropdown;
    private bool dropdownWasOpen;
    internal bool AccountsOpen => dropdown != null && dropdown.Visible;

    public TopBar(MainForm owner)
    {
        this.owner = owner;
        SetStyle(ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.StandardDoubleClick, true);
        Height = Theme.S(BarHeight);
        BackColor = Theme.Bar;
        AccessibleName = "Barra do Legend Online Go";
        TabStop = true;
        anim.Interval = 100;
        anim.Tick += delegate { Invalidate(); if (dropdown != null) dropdown.RefreshAccounts(); if (!Animating()) anim.Stop(); };
    }

    private bool Animating()
    {
        if (owner.Monitor.Current == ServerMonitor.Status.Checking) return true;
        foreach (AccountTab tab in owner.Tabs) if (tab.Busy) return true;
        return false;
    }

    public void UpdateView()
    {
        if (IsDisposed) return;
        if (Animating()) anim.Start(); else anim.Stop();
        if (dropdown != null) dropdown.RefreshAccounts();
        Invalidate();
    }

    // Identical status mapping and pulse to the former tab presentation.
    internal static Color AccountColor(AccountTab tab)
    {
        float pulse = 0.5f + 0.5f * (float)Math.Sin((Environment.TickCount % 1400) / 1400.0 * Math.PI * 2);
        return tab.Busy ? Theme.WithAlpha(tab.State == TabState.Reconnecting ? Theme.Danger : Theme.Busy, (int)(110 + 145 * pulse))
            : tab.State == TabState.Playing ? (tab.Online ? Theme.Online : Theme.Busy)
            : tab.State == TabState.Stopped ? Theme.Danger : Theme.Idle;
    }

    private string PingText()
    {
        if (owner.Monitor.Current == ServerMonitor.Status.Online) return owner.Monitor.LatencyMs + " ms";
        return owner.Monitor.Current == ServerMonitor.Status.Offline ? "Servidor fora do ar" : "Conectando…";
    }

    private string PlayersText()
    {
        int players = owner.Monitor.Players;
        return owner.Monitor.Current == ServerMonitor.Status.Online && players >= 0 ? players.ToString() : "—";
    }

    private void LayoutBar(Graphics g)
    {
        int w = Theme.S(32), gap = Theme.S(3), right = Width - Theme.S(4);
        for (int i = 5; i >= 0; i--) { buttons[i] = new Rectangle(right - w, Theme.S(5), w, Height - Theme.S(10)); right -= w + gap; }
        int titleWidth = (int)Math.Ceiling(g.MeasureString("Legend Online Go", Theme.UiStrong).Width);
        int left = Theme.S(12) + titleWidth + Theme.S(22);
        int playersWidth = (int)Math.Ceiling(g.MeasureString(PlayersText(), Theme.UiSmall).Width) + Theme.S(24);
        int naturalStatus = (int)Math.Ceiling(g.MeasureString(PingText(), Theme.UiSmall).Width) + Theme.S(24) + Theme.S(16) + playersWidth;
        // Reserve the action group first; truncate account text before anything can overlap.
        int statusWidth = Math.Max(0, Math.Min(naturalStatus, right - left - Theme.S(150)));
        status = new Rectangle(left, 0, statusWidth, Height);
        playersWidth = Math.Min(playersWidth, Math.Max(0, statusWidth - Theme.S(64)));
        int pingWidth = Math.Max(0, statusWidth - playersWidth - Theme.S(16));
        pingStatus = new Rectangle(left, 0, pingWidth, Height);
        playersStatus = new Rectangle(status.Right - playersWidth, 0, playersWidth, Height);
        int start = status.Right + Theme.S(12);
        account = new Rectangle(start, Theme.S(5), Math.Max(0, Math.Min(Theme.S(320), right - start - Theme.S(12))), Height - Theme.S(10));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        Theme.Prepare(g);
        g.Clear(Theme.Bar);
        LayoutBar(g);
        Theme.DrawText(g, "Legend Online Go", Theme.UiStrong, Theme.Text, new RectangleF(Theme.S(12), 0, status.Left - Theme.S(20), Height), StringAlignment.Near);
        if (status.Width > 0)
        {
            int ms = owner.Monitor.LatencyMs;
            Color c = owner.Monitor.Current == ServerMonitor.Status.Online ? (ms < 0 ? Theme.Idle : ms <= 120 ? Theme.Online : ms <= 250 ? Theme.Busy : Theme.Danger)
                : owner.Monitor.Current == ServerMonitor.Status.Offline ? Theme.Danger : Theme.Busy;
            DrawStatus(g, pingStatus, PingText(), c, true);
            DrawStatus(g, playersStatus, PlayersText(), Theme.Muted, false);
        }
        if (account.Width > Theme.S(44))
        {
            if (hover == 6 || (dropdown != null && dropdown.Visible)) Theme.FillRound(g, Theme.Hover, account, Theme.S(Theme.AccountCornerRadius));
            AccountTab tab = owner.ActiveTab;
            Theme.FillCircle(g, tab == null ? Theme.Idle : AccountColor(tab), account.Left + Theme.S(12), Height / 2f, Theme.S(6));
            Theme.DrawText(g, tab == null ? "Nenhuma conta" : "Conta: " + tab.DisplayName, Theme.Ui, Theme.Text,
                new RectangleF(account.Left + Theme.S(24), account.Top, Math.Max(0, account.Width - Theme.S(48)), account.Height), StringAlignment.Near);
            using (Pen pen = new Pen(Theme.Muted, Theme.S(1f)))
            {
                int x = account.Right - Theme.S(14), y = Height / 2;
                g.DrawLines(pen, new[] { new Point(x - Theme.S(3), y - Theme.S(2)), new Point(x, y + Theme.S(1)), new Point(x + Theme.S(3), y - Theme.S(2)) });
            }
        }
        for (int i = 0; i < buttons.Length; i++)
        {
            Rectangle r = buttons[i];
            if (hover == i) Theme.FillRound(g, i == 5 ? Theme.Danger : pressed == i ? Theme.Pressed : Theme.Hover, r, Theme.S(4));
            Color color = i == 5 && hover == i ? Color.White : Theme.Muted;
            PointF center = new PointF(r.Left + r.Width / 2f, r.Top + r.Height / 2f);
            if (i == 0) Theme.DrawGlyph(g, owner.ActiveTab != null && owner.ActiveTab.Info.Muted ? Theme.GlyphMute : Theme.GlyphVolume, Theme.S(12f), color, center, 0);
            else if (i == 1) Theme.DrawText(g, "F5", Theme.UiSmall, color, r, StringAlignment.Center);
            else if (i == 2) Theme.DrawGlyph(g, owner.IsFullscreen ? Theme.GlyphWindowed : Theme.GlyphFullscreen, Theme.S(12f), color, center, 0);
            else
            {
                using (Pen pen = new Pen(color, Math.Max(1, Theme.S(1))))
                {
                    float x = center.X, y = center.Y, s = Theme.S(4);
                    if (i == 3) g.DrawLine(pen, x - s, y + 1, x + s, y + 1);
                    if (i == 4)
                    {
                        if (owner.WindowState == FormWindowState.Maximized)
                        {
                            g.DrawRectangle(pen, x - s + 2, y - s - 2, s * 2, s * 2);
                            using (SolidBrush brush = new SolidBrush(hover == i ? Theme.Hover : BackColor)) g.FillRectangle(brush, x - s, y - s, s * 2, s * 2);
                        }
                        g.DrawRectangle(pen, x - s, y - s, s * 2, s * 2);
                    }
                    if (i == 5) { g.DrawLine(pen, x - s, y - s, x + s, y + s); g.DrawLine(pen, x + s, y - s, x - s, y + s); }
                }
            }
        }
        using (Pen pen = new Pen(Theme.Hairline)) g.DrawLine(pen, 0, Height - 1, Width, Height - 1);
    }

    private void DrawStatus(Graphics g, Rectangle bounds, string text, Color iconColor, bool network)
    {
        if (bounds.Width <= Theme.S(24)) return;
        PointF at = new PointF(bounds.Left, (Height - Theme.S(16)) / 2f);
        if (network) Theme.DrawNetwork(g, iconColor, at);
        else Theme.DrawPeople(g, iconColor, at);
        Theme.DrawText(g, text, Theme.UiSmall, Theme.Muted,
            new RectangleF(bounds.Left + Theme.S(24), 0, bounds.Width - Theme.S(24), Height), StringAlignment.Near);
    }

    private int Hit(Point p)
    {
        for (int i = 0; i < buttons.Length; i++) if (buttons[i].Contains(p)) return i;
        if (account.Contains(p)) return 6;
        if (status.Contains(p)) return 7;
        return -1;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        int h = Hit(e.Location);
        if (h == hover) return;
        hover = h;
        Cursor = h >= 0 && h <= 6 ? Cursors.Hand : Cursors.Default;
        string[] tips = { "Silenciar / ativar som", "Reconectar esta conta (F5)", "Tela cheia (F11)", "Minimizar", "Maximizar / restaurar", "Fechar Legend Online Go", owner.ActiveTab == null ? "Abrir contas" : owner.ActiveTab.DisplayName + " — botão direito: ações da conta", "Ping até o servidor e jogadores online" };
        tip.SetToolTip(this, h < 0 ? "" : tips[h]);
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hover = -1; Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        pressed = Hit(e.Location);
        dropdownWasOpen = dropdown != null && dropdown.Visible;
        if (e.Button == MouseButtons.Left && pressed == -1 && e.Clicks == 1) owner.DragWindow();
        Invalidate();
    }
    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        base.OnMouseDoubleClick(e);
        if (e.Button == MouseButtons.Left && Hit(e.Location) == -1) owner.ToggleMaximize();
    }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        int h = Hit(e.Location), p = pressed;
        pressed = -1;
        Invalidate();
        if (h != p) return;
        if (e.Button == MouseButtons.Right && h == 6 && owner.ActiveTab != null) { owner.ShowTabMenu(owner.ActiveTab, PointToScreen(new Point(account.Left, account.Bottom))); return; }
        if (e.Button != MouseButtons.Left) return;
        switch (h)
        {
            case 0: owner.ToggleMute(); break;
            case 1: owner.ReconnectActive(); break;
            case 2: owner.ToggleFullscreen(); break;
            case 3: owner.WindowState = FormWindowState.Minimized; break;
            case 4: owner.ToggleMaximize(); break;
            case 5: owner.Close(); break;
            case 6: if (!dropdownWasOpen) ShowAccounts(); break;
        }
    }
    private void ShowAccounts()
    {
        if (dropdown == null)
        {
            dropdown = new AccountDropdown(owner);
            dropdown.Closed += delegate
            {
                Invalidate();
                // Resolve the active session after the menu action has selected it.
                if (!owner.IsDisposed && owner.IsHandleCreated)
                    owner.BeginInvoke((MethodInvoker)delegate { if (!owner.IsDisposed && owner.ActiveTab != null) owner.ActiveTab.FocusGame(); });
            };
        }
        dropdown.Open(this, new Point(account.Left, account.Bottom + Theme.S(4)), Math.Max(Theme.S(260), account.Width));
        Invalidate();
    }
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.Space || keyData == Keys.Enter || keyData == (Keys.Down | Keys.Alt)) { ShowAccounts(); return true; }
        return base.ProcessCmdKey(ref msg, keyData);
    }
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x84)
        {
            Point screen = new Point(unchecked((short)m.LParam.ToInt64()), unchecked((short)(m.LParam.ToInt64() >> 16)));
            if (owner.ResizeHitTest(owner.PointToClient(screen)) != 0) { m.Result = new IntPtr(-1); return; }
        }
        base.WndProc(ref m);
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { anim.Dispose(); tip.Dispose(); if (dropdown != null) dropdown.Dispose(); }
        base.Dispose(disposing);
    }
}
