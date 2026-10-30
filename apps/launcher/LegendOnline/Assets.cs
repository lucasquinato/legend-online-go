using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;

namespace LegendOnline;

internal static class Assets
{
	private static Image logo;
	private static Image loginLogo;

	public static Image LoginLogo
	{
		get
		{
			if (loginLogo == null)
			{
				using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("LegendOnline.logo.ico");
				if (stream == null) return Logo;
				using Icon icon = new Icon(stream, 48, 48);
				loginLogo = icon.ToBitmap();
			}
			return loginLogo;
		}
	}

	public static Image Logo
	{
		get
		{
			if (logo == null)
			{
				using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("LegendOnline.logo.png");
				logo = ((stream != null) ? Image.FromStream(stream) : new Bitmap(1, 1));
			}
			return logo;
		}
	}

	public static Icon AppIcon
	{
		get
		{
			using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("LegendOnline.logo.ico");
			return (stream != null) ? new Icon(stream) : null;
		}
	}

	public static void DrawLogo(Graphics g, RectangleF r)
	{
		using (GraphicsPath graphicsPath = new GraphicsPath())
		{
			graphicsPath.AddEllipse(r);
			GraphicsState gstate = g.Save();
			g.SetClip(graphicsPath);
			g.DrawImage(Logo, r);
			g.Restore(gstate);
		}
		using Pen pen = new Pen(Theme.WithAlpha(Theme.Accent, 210), Math.Max(1.5f, r.Width / 34f));
		g.DrawEllipse(pen, r);
	}
}
