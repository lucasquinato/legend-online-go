using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace LegendOnline;

internal abstract class CardView : Control
{
	protected abstract Size CardSize { get; }

	protected Rectangle CardBounds
	{
		get
		{
			Size cardSize = CardSize;
			return new Rectangle((base.Width - cardSize.Width) / 2, Math.Max(Theme.S(16), (base.Height - cardSize.Height) / 2 - Theme.S(10)), cardSize.Width, cardSize.Height);
		}
	}

	protected CardView()
	{
		SetStyle(ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		BackColor = Theme.Background;
	}

	protected void PaintBackground(Graphics g)
	{
		g.Clear(Theme.Background);
		Rectangle cardBounds = CardBounds;
		float num = Math.Max((float)cardBounds.Width * 1.25f, Theme.S(420));
		float num2 = Math.Max((float)cardBounds.Height * 0.95f, Theme.S(320));
		RectangleF rect = new RectangleF((float)cardBounds.X + (float)cardBounds.Width / 2f - num, (float)cardBounds.Y + (float)cardBounds.Height / 2f - num2, num * 2f, num2 * 2f);
		using (GraphicsPath graphicsPath = new GraphicsPath())
		{
			graphicsPath.AddEllipse(rect);
			using PathGradientBrush pathGradientBrush = new PathGradientBrush(graphicsPath);
			pathGradientBrush.CenterColor = Theme.WithAlpha(Theme.Accent, 22);
			pathGradientBrush.SurroundColors = new Color[1] { Theme.WithAlpha(Theme.Background, 0) };
			g.FillEllipse(pathGradientBrush, rect);
		}
		Theme.FillRound(g, Theme.Card, cardBounds, Theme.S(14));
		Theme.StrokeRound(g, Theme.CardBorder, cardBounds, Theme.S(14));
	}

	protected int PaintHeader(Graphics g, Rectangle card)
	{
		int num = Theme.S(58);
		Assets.DrawLogo(g, new RectangleF((float)card.X + (float)(card.Width - num) / 2f, card.Y + Theme.S(26), num, num));
		float num2 = Theme.MeasureSpaced(g, "LEGEND ONLINE", Theme.Brand, Theme.S(2.2f));
		Theme.DrawSpaced(g, "LEGEND ONLINE", Theme.Brand, Theme.Accent, (float)card.X + ((float)card.Width - num2) / 2f, card.Y + Theme.S(26) + num + Theme.S(18), Theme.S(2.2f));
		return card.Y + Theme.S(26) + num + Theme.S(34);
	}
}
