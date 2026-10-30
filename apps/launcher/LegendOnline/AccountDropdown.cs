using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace LegendOnline;

// A separate popup HWND keeps the list above the cross-process AIR child.
internal sealed class AccountDropdown : ToolStripDropDown
{
    private readonly AccountList list;
    private readonly ToolStripControlHost host;
    private readonly MainForm owner;
    private IntPtr mouseHook;
    private IntPtr keyboardHook;
    private readonly MouseHookProc mouseHookProc;
    private readonly MouseHookProc keyboardHookProc;
    private Size roundedSize;
    private int roundedRadius;

    private delegate IntPtr MouseHookProc(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int id, MouseHookProc callback, IntPtr module, uint thread);
    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr window, uint flags);

    public AccountDropdown(MainForm owner)
    {
        this.owner = owner;
        mouseHookProc = OutsideMouse;
        keyboardHookProc = MenuKeyboard;
        AutoClose = true;
        AutoSize = false;
        Padding = Padding.Empty;
        BackColor = Theme.Hover;
        DropShadowEnabled = false;
        Renderer = new BorderlessRenderer();
        list = new AccountList(owner, this);
        host = new ToolStripControlHost(list) { AutoSize = false, Margin = Padding.Empty, Padding = Padding.Empty };
        Items.Add(host);
    }

    protected override void OnOpened(EventArgs e)
    {
        base.OnOpened(e);
        // ToolStrip's thread-local message filter cannot see clicks in the AIR process.
        // Observe mouse-down only while this popup is visible; never consume input.
        mouseHook = SetWindowsHookEx(14, mouseHookProc, GetModuleHandle(null), 0);
        keyboardHook = SetWindowsHookEx(13, keyboardHookProc, GetModuleHandle(null), 0);
    }

    private IntPtr MenuKeyboard(int code, IntPtr message, IntPtr data)
    {
        // AIR may retain native keyboard focus. Route only menu navigation while
        // the popup is open and this application is foreground; game IPC is untouched.
        if (code >= 0 && Visible && IsHandleCreated && (message.ToInt32() == 0x100 || message.ToInt32() == 0x104))
        {
            IntPtr foreground = GetAncestor(GetForegroundWindow(), 2);
            if (foreground == owner.Handle || foreground == Handle)
            {
                Keys key = (Keys)Marshal.ReadInt32(data);
                if (key == Keys.Escape || key == Keys.Up || key == Keys.Down || key == Keys.Home || key == Keys.End
                    || key == Keys.Enter || key == Keys.Space || key == Keys.Delete)
                {
                    BeginInvoke((MethodInvoker)delegate { if (!IsDisposed && Visible) list.HandleMenuKey(key); });
                    return new IntPtr(1);
                }
            }
        }
        return CallNextHookEx(keyboardHook, code, message, data);
    }

    private IntPtr OutsideMouse(int code, IntPtr message, IntPtr data)
    {
        int msg = message.ToInt32();
        if (code >= 0 && (msg == 0x201 || msg == 0x204 || msg == 0x207 || msg == 0x20B)
            && Visible && !Bounds.Contains(Cursor.Position) && IsHandleCreated)
        {
            BeginInvoke((MethodInvoker)delegate { if (!IsDisposed && Visible) Close(ToolStripDropDownCloseReason.AppClicked); });
        }
        return CallNextHookEx(mouseHook, code, message, data);
    }

    private void ReleaseMouseHook()
    {
        if (keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(keyboardHook);
        keyboardHook = IntPtr.Zero;
        if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
        mouseHook = IntPtr.Zero;
    }

    protected override void OnClosed(ToolStripDropDownClosedEventArgs e)
    {
        ReleaseMouseHook();
        base.OnClosed(e);
    }

    protected override void Dispose(bool disposing)
    {
        ReleaseMouseHook();
        base.Dispose(disposing);
    }

    public void Open(Control anchor, Point at, int width)
    {
        list.Width = Math.Min(width, Screen.FromControl(anchor).WorkingArea.Width - Theme.S(16));
        list.RefreshAccounts();
        Fit();
        Show(anchor, at);
        list.Focus();
    }
    private void Fit()
    {
        if (host.Size != list.Size) host.Size = list.Size;
        Size desired = list.Size;
        if (Size != desired) Size = desired;
        UpdateCorners();
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        UpdateCorners();
    }

    private void UpdateCorners()
    {
        if (Width <= 0 || Height <= 0) return;
        int radius = Theme.S(Theme.AccountCornerRadius);
        if (roundedSize == Size && roundedRadius == radius) return;
        using (System.Drawing.Drawing2D.GraphicsPath path = Theme.RoundRect(new RectangleF(0, 0, Width, Height), radius))
        {
            Region previous = Region;
            Region = new Region(path);
            if (previous != null) previous.Dispose();
        }
        roundedSize = Size;
        roundedRadius = radius;
    }

    private sealed class BorderlessRenderer : ToolStripProfessionalRenderer
    {
        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
        {
            e.Graphics.Clear(e.ToolStrip.BackColor);
        }
        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e) { }
    }
    public void RefreshAccounts()
    {
        if (!Visible) return;
        list.RefreshAccounts();
        Fit();
    }

    private sealed class AccountList : Control
    {
        private readonly MainForm owner;
        private readonly AccountDropdown popup;
        private readonly List<AccountTab> rows = new List<AccountTab>();
        private int hover = -1, selected;
        private bool closeHover;
        private bool keyboardSelection;
        private int RowHeight => Theme.S(36);

        public AccountList(MainForm owner, AccountDropdown popup)
        {
            this.owner = owner;
            this.popup = popup;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
            BackColor = Theme.Hover;
            TabStop = true;
            AccessibleName = "Contas abertas; setas para navegar, Enter para selecionar, Delete para fechar";
        }
        public void RefreshAccounts()
        {
            bool changed = rows.Count != owner.Tabs.Count;
            if (!changed) for (int i = 0; i < rows.Count; i++) if (rows[i] != owner.Tabs[i]) { changed = true; break; }
            if (changed || !popup.Visible)
            {
                rows.Clear();
                foreach (AccountTab tab in owner.Tabs) rows.Add(tab);
                selected = Math.Max(0, rows.IndexOf(owner.ActiveTab));
            }
            Height = (rows.Count == 0 ? 1 : rows.Count) * RowHeight + Theme.S(9) + RowHeight;
            selected = Math.Min(selected, rows.Count);
            Invalidate();
        }
        private Rectangle CloseRect(int row) => new Rectangle(Width - Theme.S(31), row * RowHeight + Theme.S(7), Theme.S(23), RowHeight - Theme.S(14));
        private int AddTop => Math.Max(1, rows.Count) * RowHeight + Theme.S(9);
        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            Theme.Prepare(g);
            g.Clear(BackColor);
            for (int i = 0; i < rows.Count; i++)
            {
                AccountTab tab = rows[i];
                Rectangle row = new Rectangle(Theme.S(4), i * RowHeight + Theme.S(3), Width - Theme.S(8), RowHeight - Theme.S(4));
                if (hover == i || ((Focused || keyboardSelection) && selected == i) || tab == owner.ActiveTab)
                    Theme.FillRound(g, hover == i || ((Focused || keyboardSelection) && selected == i) ? Theme.Pressed : Theme.Surface, row, Theme.S(4));
                Theme.FillCircle(g, TopBar.AccountColor(tab), Theme.S(16), i * RowHeight + RowHeight / 2f, Theme.S(6));
                Theme.DrawText(g, tab.DisplayName, Theme.Ui, Theme.Text, new RectangleF(Theme.S(29), row.Top, Width - Theme.S(98), row.Height), StringAlignment.Near);
                if (tab == owner.ActiveTab) Theme.DrawText(g, "✓", Theme.Ui, Theme.Accent, new RectangleF(Width - Theme.S(62), row.Top, Theme.S(24), row.Height), StringAlignment.Center);
                if (rows.Count > 1)
                {
                    Rectangle close = CloseRect(i);
                    if (hover == i && closeHover) Theme.FillRound(g, Theme.Pressed, close, Theme.S(3));
                    Theme.DrawGlyph(g, Theme.GlyphClose, Theme.S(8f), hover == i && closeHover ? Theme.Danger : Theme.Faint, new PointF(close.Left + close.Width / 2f, close.Top + close.Height / 2f), 0);
                }
            }
            if (rows.Count == 0) Theme.DrawText(g, "Nenhuma conta aberta", Theme.Ui, Theme.Muted, new RectangleF(Theme.S(12), 0, Width - Theme.S(24), RowHeight), StringAlignment.Near);
            using (Pen pen = new Pen(Theme.Hairline)) g.DrawLine(pen, Theme.S(10), AddTop - Theme.S(5), Width - Theme.S(10), AddTop - Theme.S(5));
            if (hover == rows.Count || ((Focused || keyboardSelection) && selected == rows.Count)) Theme.FillRound(g, Theme.Pressed, new Rectangle(Theme.S(4), AddTop, Width - Theme.S(8), RowHeight - Theme.S(4)), Theme.S(4));
            Theme.DrawText(g, "+ Abrir nova conta", Theme.Ui, rows.Count < MainForm.MaxAccounts ? Theme.Text : Theme.Faint, new RectangleF(Theme.S(12), AddTop, Width - Theme.S(24), RowHeight - Theme.S(4)), StringAlignment.Near);
        }
        private int Hit(Point p)
        {
            if (p.Y >= AddTop) return rows.Count;
            int row = p.Y / RowHeight;
            return row < rows.Count ? row : -1;
        }
        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            keyboardSelection = false;
            int row = Hit(e.Location);
            bool close = row >= 0 && row < rows.Count && rows.Count > 1 && CloseRect(row).Contains(e.Location);
            if (hover == row && closeHover == close) return;
            hover = row; closeHover = close;
            Cursor = row < 0 || (row == rows.Count && rows.Count >= MainForm.MaxAccounts) ? Cursors.Default : Cursors.Hand;
            Invalidate();
        }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hover = -1; closeHover = false; Invalidate(); }
        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            int row = Hit(e.Location);
            if (row < 0) return;
            if (row < rows.Count && e.Button == MouseButtons.Right)
            {
                AccountTab tab = rows[row];
                Point point = PointToScreen(e.Location);
                popup.Close();
                owner.BeginInvoke((MethodInvoker)delegate { owner.ShowTabMenu(tab, point); });
                return;
            }
            if (e.Button == MouseButtons.Left) Choose(row, row < rows.Count && rows.Count > 1 && CloseRect(row).Contains(e.Location));
        }
        private void Choose(int row, bool close)
        {
            AccountTab tab = row < rows.Count ? rows[row] : null;
            popup.Close();
            if (tab == null) owner.AddAccount();
            else if (close) owner.CloseTab(tab);
            else owner.SelectTab(tab);
        }
        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            return HandleMenuKey(keyData) || base.ProcessCmdKey(ref msg, keyData);
        }

        internal bool HandleMenuKey(Keys keyData)
        {
            keyboardSelection = true;
            if (keyData == Keys.Escape) { popup.Close(); return true; }
            if (keyData == Keys.Down || keyData == Keys.Up)
            {
                selected = (selected + (keyData == Keys.Down ? 1 : rows.Count)) % (rows.Count + 1);
                Invalidate(); return true;
            }
            if (keyData == Keys.Home) { selected = 0; Invalidate(); return true; }
            if (keyData == Keys.End) { selected = rows.Count; Invalidate(); return true; }
            if (keyData == Keys.Enter || keyData == Keys.Space) { Choose(selected, false); return true; }
            if (keyData == Keys.Delete && selected < rows.Count && rows.Count > 1) { Choose(selected, true); return true; }
            return false;
        }
    }
}
