using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace LegendOnline;

internal static class Theme
{
	public const int AccountCornerRadius = 5;

	// Small outline icons, drawn directly so no icon-font dependency is required.
	public static void DrawNetwork(Graphics g, Color color, PointF at)
	{
		using Pen pen = new Pen(color, S(1.6f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		for (int i = 0; i < 4; i++)
		{
			float x = at.X + S(2f + i * 4f);
			g.DrawLine(pen, x, at.Y + S(14f), x, at.Y + S(12f - i * 3f));
		}
	}

	public static void DrawPeople(Graphics g, Color color, PointF at)
	{
		using Pen pen = new Pen(color, S(1.5f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
		g.DrawEllipse(pen, at.X + S(4f), at.Y + S(1f), S(6f), S(6f));
		g.DrawArc(pen, at.X + S(10f), at.Y + S(2f), S(5f), S(5f), -80, 160);
		g.DrawBezier(pen, at.X + S(1f), at.Y + S(14f), at.X + S(1f), at.Y + S(8f), at.X + S(13f), at.Y + S(8f), at.X + S(13f), at.Y + S(14f));
		g.DrawBezier(pen, at.X + S(12f), at.Y + S(10f), at.X + S(15f), at.Y + S(10f), at.X + S(16f), at.Y + S(12f), at.X + S(16f), at.Y + S(14f));
	}

	public static readonly Color Bar = Color.FromArgb(10, 10, 12);

	public static readonly Color Hairline = Color.FromArgb(32, 32, 36);

	public static readonly Color Background = Color.FromArgb(14, 14, 16);

	public static readonly Color Card = Color.FromArgb(24, 24, 27);

	public static readonly Color CardBorder = Color.FromArgb(40, 40, 46);

	public static readonly Color Field = Color.FromArgb(17, 17, 19);

	public static readonly Color FieldBorder = Color.FromArgb(48, 48, 54);

	public static readonly Color Surface = Color.FromArgb(30, 30, 34);

	public static readonly Color SurfaceBorder = Color.FromArgb(50, 50, 56);

	public static readonly Color Hover = Color.FromArgb(28, 28, 32);

	public static readonly Color Pressed = Color.FromArgb(42, 42, 47);

	public static readonly Color Text = Color.FromArgb(236, 234, 240);

	public static readonly Color Muted = Color.FromArgb(150, 147, 158);

	public static readonly Color Faint = Color.FromArgb(98, 96, 106);

	public static readonly Color Accent = Color.FromArgb(217, 180, 108);

	public static readonly Color AccentHover = Color.FromArgb(227, 194, 131);

	public static readonly Color AccentText = Color.FromArgb(28, 22, 12);

	public static readonly Color Online = Color.FromArgb(94, 205, 145);

	public static readonly Color Busy = Color.FromArgb(232, 176, 74);

	public static readonly Color Danger = Color.FromArgb(235, 107, 107);

	public static readonly Color Idle = Color.FromArgb(110, 108, 120);

	public static float Scale = 1f;

	private static readonly Dictionary<string, Font> fonts = new Dictionary<string, Font>();

	private static readonly string iconFamily = (FontExists("Segoe Fluent Icons") ? "Segoe Fluent Icons" : (FontExists("Segoe MDL2 Assets") ? "Segoe MDL2 Assets" : null));

	public static readonly string GlyphRefresh = ((iconFamily != null) ? "\ue72c" : "↻");

	public static readonly string GlyphAdd = ((iconFamily != null) ? "\ue710" : "+");

	public static readonly string GlyphClose = ((iconFamily != null) ? "\ue711" : "✕");

	public static readonly string GlyphVolume = ((iconFamily != null) ? "\ue767" : "♪");

	public static readonly string GlyphMute = ((iconFamily != null) ? "\ue74f" : "∅");

	public static readonly string GlyphFullscreen = ((iconFamily != null) ? "\ue740" : "⤢");

	public static readonly string GlyphWindowed = ((iconFamily != null) ? "\ue73f" : "⤡");

	public static readonly string GlyphPeople = ((iconFamily != null) ? "\ue716" : "☺");

	private static readonly Dictionary<string, GraphicsPath> glyphs = new Dictionary<string, GraphicsPath>();

	public static Font Ui => Font(9f, strong: false);

	public static Font UiSmall => Font(8.25f, strong: false);

	public static Font UiStrong => Font(9f, strong: true);

	public static Font Brand => Font(8.25f, strong: true);

	public static Font Title => Font(15f, strong: true);

	public static Font Input => Font(10.5f, strong: false);

	public static int S(int px)
	{
		return (int)Math.Round((float)px * Scale);
	}

	public static float S(float px)
	{
		return px * Scale;
	}

	public static Font Font(float size, bool strong)
	{
		string key = size + (strong ? "b" : "") + "@" + Scale;
		if (!fonts.TryGetValue(key, out var value))
		{
			value = new Font(strong ? "Segoe UI Semibold" : "Segoe UI", size * Scale * 96f / 72f, FontStyle.Regular, GraphicsUnit.Pixel);
			fonts[key] = value;
		}
		return value;
	}

	private static bool FontExists(string name)
	{
		using (InstalledFontCollection installedFontCollection = new InstalledFontCollection())
		{
			FontFamily[] families = installedFontCollection.Families;
			foreach (FontFamily fontFamily in families)
			{
				if (fontFamily.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
				{
					return true;
				}
			}
		}
		return false;
	}

	public static void Prepare(Graphics g)
	{
		g.SmoothingMode = SmoothingMode.AntiAlias;
		g.PixelOffsetMode = PixelOffsetMode.HighQuality;
		g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
		g.InterpolationMode = InterpolationMode.HighQualityBicubic;
	}

	public static GraphicsPath RoundRect(RectangleF r, float radius)
	{
		GraphicsPath graphicsPath = new GraphicsPath();
		float num = Math.Min(radius * 2f, Math.Min(r.Width, r.Height));
		if (num <= 0.5f)
		{
			graphicsPath.AddRectangle(r);
			return graphicsPath;
		}
		graphicsPath.AddArc(r.X, r.Y, num, num, 180f, 90f);
		graphicsPath.AddArc(r.Right - num, r.Y, num, num, 270f, 90f);
		graphicsPath.AddArc(r.Right - num, r.Bottom - num, num, num, 0f, 90f);
		graphicsPath.AddArc(r.X, r.Bottom - num, num, num, 90f, 90f);
		graphicsPath.CloseFigure();
		return graphicsPath;
	}

	public static void FillRound(Graphics g, Color c, RectangleF r, float radius)
	{
		using GraphicsPath path = RoundRect(r, radius);
		using SolidBrush brush = new SolidBrush(c);
		g.FillPath(brush, path);
	}

	public static void StrokeRound(Graphics g, Color c, RectangleF r, float radius)
	{
		using GraphicsPath path = RoundRect(new RectangleF(r.X + 0.5f, r.Y + 0.5f, r.Width - 1f, r.Height - 1f), radius);
		using Pen pen = new Pen(c, 1f);
		g.DrawPath(pen, path);
	}

	public static void FillCircle(Graphics g, Color c, float cx, float cy, float diameter)
	{
		using SolidBrush brush = new SolidBrush(c);
		g.FillEllipse(brush, cx - diameter / 2f, cy - diameter / 2f, diameter, diameter);
	}

	public static Color WithAlpha(Color c, int alpha)
	{
		return Color.FromArgb(Math.Max(0, Math.Min(255, alpha)), c.R, c.G, c.B);
	}

	public static Color Mix(Color a, Color b, float t)
	{
		return Color.FromArgb((int)((float)(int)a.R + (float)(b.R - a.R) * t), (int)((float)(int)a.G + (float)(b.G - a.G) * t), (int)((float)(int)a.B + (float)(b.B - a.B) * t));
	}

	public static void DrawGlyph(Graphics g, string glyph, float sizePx, Color color, PointF center, float angle)
	{
		string key = glyph + "@" + sizePx;
		if (!glyphs.TryGetValue(key, out var value))
		{
			value = new GraphicsPath();
			using (FontFamily family = new FontFamily(iconFamily ?? "Segoe UI Symbol"))
			{
				value.AddString(glyph, family, 0, sizePx, PointF.Empty, StringFormat.GenericTypographic);
			}
			RectangleF bounds = value.GetBounds();
			using (Matrix matrix = new Matrix())
			{
				matrix.Translate(0f - (bounds.X + bounds.Width / 2f), 0f - (bounds.Y + bounds.Height / 2f));
				value.Transform(matrix);
			}
			glyphs[key] = value;
		}
		GraphicsState gstate = g.Save();
		g.TranslateTransform(center.X, center.Y);
		if (angle != 0f)
		{
			g.RotateTransform(angle);
		}
		using (SolidBrush brush = new SolidBrush(color))
		{
			g.FillPath(brush, value);
		}
		g.Restore(gstate);
	}

	public static float DrawSpaced(Graphics g, string text, Font font, Color color, float x, float centerY, float spacing)
	{
		using (SolidBrush brush = new SolidBrush(color))
		{
			using StringFormat stringFormat = new StringFormat(StringFormat.GenericTypographic);
			stringFormat.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces;
			float height = font.GetHeight(g);
			for (int i = 0; i < text.Length; i++)
			{
				string text2 = text[i].ToString();
				g.DrawString(text2, font, brush, x, centerY - height / 2f, stringFormat);
				x += g.MeasureString(text2, font, PointF.Empty, stringFormat).Width + spacing;
			}
		}
		return x - spacing;
	}

	public static float MeasureSpaced(Graphics g, string text, Font font, float spacing)
	{
		using StringFormat stringFormat = new StringFormat(StringFormat.GenericTypographic);
		stringFormat.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces;
		float num = 0f;
		for (int i = 0; i < text.Length; i++)
		{
			num += g.MeasureString(text[i].ToString(), font, PointF.Empty, stringFormat).Width + spacing;
		}
		return num - spacing;
	}

	public static void DrawText(Graphics g, string text, Font font, Color color, RectangleF r, StringAlignment align)
	{
		using SolidBrush brush = new SolidBrush(color);
		using StringFormat stringFormat = new StringFormat();
		stringFormat.Alignment = align;
		stringFormat.LineAlignment = StringAlignment.Center;
		stringFormat.Trimming = StringTrimming.EllipsisCharacter;
		stringFormat.FormatFlags = StringFormatFlags.NoWrap;
		g.DrawString(text, font, brush, r, stringFormat);
	}

	public static void DrawWrapped(Graphics g, string text, Font font, Color color, RectangleF r, StringAlignment align)
	{
		using SolidBrush brush = new SolidBrush(color);
		using StringFormat stringFormat = new StringFormat();
		stringFormat.Alignment = align;
		stringFormat.LineAlignment = StringAlignment.Near;
		stringFormat.Trimming = StringTrimming.EllipsisWord;
		g.DrawString(text, font, brush, r, stringFormat);
	}
}
