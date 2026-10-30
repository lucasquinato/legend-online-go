using System;
using System.Drawing;
using System.Runtime.InteropServices;

namespace LegendOnline;

internal static class Dpi
{
	public struct RECT
	{
		public int Left;

		public int Top;

		public int Right;

		public int Bottom;
	}

	[DllImport("user32.dll")]
	private static extern int GetDpiForWindow(IntPtr hwnd);

	public static int ForWindow(IntPtr h)
	{
		try
		{
			int dpiForWindow = GetDpiForWindow(h);
			if (dpiForWindow > 0)
			{
				return dpiForWindow;
			}
		}
		catch (EntryPointNotFoundException)
		{
		}
		using Graphics graphics = Graphics.FromHwnd(h);
		return (int)graphics.DpiX;
	}
}
