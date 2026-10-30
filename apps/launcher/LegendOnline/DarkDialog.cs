using System.Drawing;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class DarkDialog : Form
{
	private readonly string title;

	private readonly string message;

	private readonly string okText;

	private Rectangle okRect;

	private Rectangle cancelRect;

	private int hover;

	protected override CreateParams CreateParams
	{
		get
		{
			CreateParams createParams = base.CreateParams;
			createParams.ClassStyle |= 131072;
			return createParams;
		}
	}

	public static bool Confirm(IWin32Window owner, string title, string message, string okText)
	{
		using DarkDialog darkDialog = new DarkDialog(title, message, okText);
		return darkDialog.ShowDialog(owner) == DialogResult.OK;
	}

	private DarkDialog(string title, string message, string okText)
	{
		this.title = title;
		this.message = message;
		this.okText = okText;
		base.FormBorderStyle = FormBorderStyle.None;
		base.StartPosition = FormStartPosition.CenterParent;
		base.ShowInTaskbar = false;
		base.KeyPreview = true;
		base.AutoScaleMode = AutoScaleMode.None;
		base.ClientSize = new Size(Theme.S(380), Theme.S(172));
		BackColor = Theme.Surface;
		SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		int num = Theme.S(116);
		int num2 = Theme.S(34);
		int num3 = base.ClientSize.Height - Theme.S(24) - num2;
		okRect = new Rectangle(base.ClientSize.Width - Theme.S(24) - num, num3, num, num2);
		cancelRect = new Rectangle(okRect.Left - Theme.S(8) - num, num3, num, num2);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		Theme.Prepare(graphics);
		graphics.Clear(Theme.Surface);
		using (Pen pen = new Pen(Theme.SurfaceBorder))
		{
			graphics.DrawRectangle(pen, 0, 0, base.Width - 1, base.Height - 1);
		}
		Theme.DrawText(graphics, title, Theme.Font(11.5f, strong: true), Theme.Text, new RectangleF(Theme.S(24), Theme.S(18), base.ClientSize.Width - Theme.S(48), Theme.S(28)), StringAlignment.Near);
		Theme.DrawWrapped(graphics, message, Theme.Ui, Theme.Muted, new RectangleF(Theme.S(24), Theme.S(56), base.ClientSize.Width - Theme.S(48), Theme.S(52)), StringAlignment.Near);
		Theme.FillRound(graphics, (hover == 2) ? Theme.Mix(Theme.Pressed, Color.White, 0.06f) : Theme.Pressed, cancelRect, Theme.S(8));
		Theme.DrawText(graphics, "Cancelar", Theme.UiStrong, Theme.Text, cancelRect, StringAlignment.Center);
		Theme.FillRound(graphics, (hover == 1) ? Theme.Mix(Theme.Danger, Color.White, 0.12f) : Theme.Danger, okRect, Theme.S(8));
		Theme.DrawText(graphics, okText, Theme.UiStrong, Color.White, okRect, StringAlignment.Center);
	}

	protected override void OnMouseMove(MouseEventArgs e)
	{
		int num = (okRect.Contains(e.Location) ? 1 : (cancelRect.Contains(e.Location) ? 2 : 0));
		Cursor = ((num != 0) ? Cursors.Hand : Cursors.Default);
		if (num != hover)
		{
			hover = num;
			Invalidate();
		}
	}

	protected override void OnMouseUp(MouseEventArgs e)
	{
		if (e.Button == MouseButtons.Left)
		{
			if (okRect.Contains(e.Location))
			{
				base.DialogResult = DialogResult.OK;
			}
			else if (cancelRect.Contains(e.Location))
			{
				base.DialogResult = DialogResult.Cancel;
			}
		}
	}

	protected override void OnKeyDown(KeyEventArgs e)
	{
		if (e.KeyCode == Keys.Escape)
		{
			base.DialogResult = DialogResult.Cancel;
		}
		else if (e.KeyCode == Keys.Return)
		{
			base.DialogResult = DialogResult.OK;
		}
	}
}
