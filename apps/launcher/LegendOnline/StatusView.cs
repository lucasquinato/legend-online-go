using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class StatusView : CardView
{
	private string title = "";

	private string message = "";

	private string detail = "";

	private bool spinner;

	private float progress = -1f;

	private TabState presentation = TabState.Stopped;

	private bool Minimal => presentation == TabState.Starting || presentation == TabState.Reconnecting;

	private Color accent = Theme.Accent;

	private readonly List<StatusButton> buttons = new List<StatusButton>();

	private StatusButton hover;

	private StatusButton pressed;

	private readonly Timer anim = new Timer();

	public string Detail
	{
		get
		{
			return detail;
		}
		set
		{
			if (detail != value)
			{
				detail = value;
				Invalidate();
			}
		}
	}

	public float Progress
	{
		get
		{
			return progress;
		}
		set
		{
			if (Math.Abs(progress - value) > 0.001f)
			{
				progress = value;
				UpdateAnimation();
				Invalidate();
			}
		}
	}

	public string Title => title;

	protected override Size CardSize
	{
		get
		{
			int num = Theme.S(150) + Theme.S(92) + Theme.S(56);
			if (buttons.Count > 0)
			{
				num += Theme.S(52);
			}
			return new Size(Theme.S(400), num);
		}
	}

	public StatusView()
	{
		anim.Interval = 16;
		Timer timer = anim;
		EventHandler value = delegate
		{
			if (base.Visible)
			{
				Invalidate(SpinnerBounds());
			}
		};
		timer.Tick += value;
	}

	public void Show(string title, string message, bool spinner, Color accent, params StatusButton[] buttons)
	{
		this.title = title;
		presentation = TabState.Stopped;
		this.message = message;
		this.spinner = spinner;
		this.accent = accent;
		detail = "";
		progress = -1f;
		this.buttons.Clear();
		this.buttons.AddRange(buttons);
		hover = (pressed = null);
		AccessibleName = title + ". " + message;
		UpdateAnimation();
		Invalidate();
	}

	public void SetPresentation(TabState state)
	{
		presentation = state;
		hover = pressed = null;
		Cursor = Cursors.Default;
		if (Minimal)
		{
			AccessibleName = state == TabState.Starting ? "Legend Online Go. Entrando..." : "Reconectando... Tentando reconectar a cada 5 segundos";
		}
		UpdateAnimation();
		Invalidate();
	}

	private void UpdateAnimation()
	{
		anim.Enabled = Visible && (Minimal ? presentation == TabState.Reconnecting || progress < 0f : spinner);
	}

	private int MinimalTop => Math.Max(Theme.S(16), (Height - Theme.S(presentation == TabState.Starting ? 92 : 108)) / 2);

	private Rectangle ProgressBounds()
	{
		int width = Math.Max(1, Math.Min(Theme.S(240), Width - Theme.S(48)));
		return new Rectangle((Width - width) / 2, MinimalTop + Theme.S(88), width, Math.Max(1, Theme.S(4)));
	}

	private Rectangle SpinnerBounds()
	{
		if (Minimal)
		{
			if (presentation == TabState.Starting)
			{
				Rectangle bar = ProgressBounds();
				bar.Inflate(2, 2);
				return bar;
			}
			int size = Theme.S(24);
			return new Rectangle((Width - size) / 2, MinimalTop + Theme.S(84), size, size);
		}
		Rectangle cardBounds = base.CardBounds;
		int num = Theme.S(58) + Theme.S(16);
		return new Rectangle(cardBounds.X + (cardBounds.Width - num) / 2, cardBounds.Y + Theme.S(26) - Theme.S(8), num, num);
	}

	protected override void OnVisibleChanged(EventArgs e)
	{
		base.OnVisibleChanged(e);
		UpdateAnimation();
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		Theme.Prepare(graphics);
		if (Minimal)
		{
			PaintMinimal(graphics);
			return;
		}
		PaintBackground(graphics);
		Rectangle cardBounds = base.CardBounds;
		int num = PaintHeader(graphics, cardBounds);
		if (spinner)
		{
			Rectangle rectangle = SpinnerBounds();
			RectangleF rect = new RectangleF(rectangle.X + Theme.S(3), rectangle.Y + Theme.S(3), rectangle.Width - Theme.S(6), rectangle.Height - Theme.S(6));
			float startAngle = (float)(Environment.TickCount % 1100) / 1100f * 360f;
			using Pen pen = new Pen(Theme.WithAlpha(accent, 230), Theme.S(2.5f));
			LineCap startCap = (pen.EndCap = LineCap.Round);
			pen.StartCap = startCap;
			graphics.DrawArc(pen, rect, startAngle, 70f);
		}
		int num2 = Theme.S(30);
		Theme.DrawText(r: new RectangleF(cardBounds.X + num2, num + Theme.S(6), cardBounds.Width - num2 * 2, Theme.S(26)), g: graphics, text: title, font: Theme.Font(12f, strong: true), color: Theme.Text, align: StringAlignment.Center);
		Theme.DrawWrapped(graphics, message, Theme.Ui, Theme.Muted, new RectangleF(cardBounds.X + num2, num + Theme.S(38), cardBounds.Width - num2 * 2, Theme.S(54)), StringAlignment.Center);
		int num3 = num + Theme.S(96);
		if (progress >= 0f)
		{
			RectangleF r = new RectangleF(cardBounds.X + Theme.S(60), num3, cardBounds.Width - Theme.S(120), Theme.S(4));
			Theme.FillRound(graphics, Theme.Field, r, Theme.S(2));
			Theme.FillRound(graphics, accent, new RectangleF(r.X, r.Y, Math.Max(Theme.S(4), r.Width * Math.Min(1f, progress)), r.Height), Theme.S(2));
		}
		if (detail.Length > 0)
		{
			Theme.DrawText(graphics, detail, Theme.UiSmall, Theme.Faint, new RectangleF(cardBounds.X + num2, num3 + Theme.S(10), cardBounds.Width - num2 * 2, Theme.S(20)), StringAlignment.Center);
		}
		if (buttons.Count <= 0)
		{
			return;
		}
		int num4 = Theme.S(38);
		int num5 = Theme.S(10);
		int num6 = (cardBounds.Width - num2 * 2 - num5 * (buttons.Count - 1)) / buttons.Count;
		int num7 = cardBounds.X + num2;
		int num8 = cardBounds.Bottom - Theme.S(26) - num4;
		foreach (StatusButton button in buttons)
		{
			button.Bounds = new Rectangle(num7, num8, num6, num4);
			bool flag = button == hover;
			Color c = ((!button.Primary) ? (flag ? Theme.Pressed : Theme.Surface) : (flag ? Theme.AccentHover : Theme.Accent));
			Theme.FillRound(graphics, c, button.Bounds, Theme.S(9));
			if (!button.Primary)
			{
				Theme.StrokeRound(graphics, Theme.SurfaceBorder, button.Bounds, Theme.S(9));
			}
			Theme.DrawText(graphics, button.Text, Theme.UiStrong, button.Primary ? Theme.AccentText : Theme.Text, button.Bounds, StringAlignment.Center);
			num7 += num6 + num5;
		}
	}

	private void PaintMinimal(Graphics g)
	{
		// Use the existing workspace surface, without a card, image, border or glow.
		g.Clear(BackColor);
		bool entering = presentation == TabState.Starting;
		int top = MinimalTop;
		RectangleF titleBounds = new RectangleF(Theme.S(16), top, Math.Max(1, Width - Theme.S(32)), Theme.S(28));
		Theme.DrawText(g, entering ? "Legend Online Go" : "Reconectando...", Theme.Title, Theme.Text, titleBounds, StringAlignment.Center);
		RectangleF textBounds = new RectangleF(Theme.S(16), top + Theme.S(40), Math.Max(1, Width - Theme.S(32)), Theme.S(24));
		Theme.DrawText(g, entering ? "Entrando..." : "Tentando reconectar a cada 5 segundos", Theme.Ui, Theme.Muted, textBounds, StringAlignment.Center);
		if (entering)
		{
			Rectangle bar = ProgressBounds();
			Theme.FillRound(g, Theme.FieldBorder, bar, Theme.S(2));
			if (progress >= 0f)
			{
				float width = bar.Width * Math.Max(0f, Math.Min(1f, progress));
				if (width > 0f) Theme.FillRound(g, Theme.Accent, new RectangleF(bar.X, bar.Y, width, bar.Height), Theme.S(2));
			}
			else
			{
				// No percentage is claimed while session verification has no byte progress.
				float width = bar.Width * 0.3f;
				float phase = (float)(0.5 - 0.5 * Math.Cos((Environment.TickCount % 1800) / 1800.0 * Math.PI * 2));
				Theme.FillRound(g, Theme.Accent, new RectangleF(bar.X + (bar.Width - width) * phase, bar.Y, width, bar.Height), Theme.S(2));
			}
		}
		else
		{
			Rectangle bounds = SpinnerBounds();
			bounds.Inflate(-Theme.S(2), -Theme.S(2));
			using Pen pen = new Pen(Theme.Muted, Theme.S(2f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
			g.DrawArc(pen, bounds, (Environment.TickCount % 1100) / 1100f * 360f, 270f);
		}
	}

	private StatusButton HitTest(Point p)
	{
		if (Minimal) return null;
		foreach (StatusButton button in buttons)
		{
			if (button.Bounds.Contains(p))
			{
				return button;
			}
		}
		return null;
	}

	protected override void OnMouseMove(MouseEventArgs e)
	{
		base.OnMouseMove(e);
		StatusButton statusButton = HitTest(e.Location);
		Cursor = ((statusButton != null) ? Cursors.Hand : Cursors.Default);
		if (statusButton != hover)
		{
			hover = statusButton;
			Invalidate();
		}
	}

	protected override void OnMouseLeave(EventArgs e)
	{
		base.OnMouseLeave(e);
		if (hover != null)
		{
			hover = null;
			Invalidate();
		}
	}

	protected override void OnMouseDown(MouseEventArgs e)
	{
		base.OnMouseDown(e);
		pressed = ((e.Button == MouseButtons.Left) ? HitTest(e.Location) : null);
	}

	protected override void OnMouseUp(MouseEventArgs e)
	{
		base.OnMouseUp(e);
		StatusButton statusButton = HitTest(e.Location);
		if (statusButton != null && statusButton == pressed && statusButton.Click != null)
		{
			statusButton.Click();
		}
		pressed = null;
	}

	public bool PressButton(string text)
	{
		foreach (StatusButton button in buttons)
		{
			if (string.Equals(button.Text, text, StringComparison.OrdinalIgnoreCase) && button.Click != null)
			{
				button.Click();
				return true;
			}
		}
		return false;
	}

	public string ButtonList()
	{
		List<string> list = new List<string>();
		foreach (StatusButton button in buttons)
		{
			list.Add(button.Text);
		}
		return string.Join("|", list.ToArray());
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing)
		{
			anim.Dispose();
		}
		base.Dispose(disposing);
	}
}
