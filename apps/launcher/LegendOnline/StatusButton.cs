using System;
using System.Drawing;

namespace LegendOnline;

internal sealed class StatusButton
{
	public string Text;

	public bool Primary;

	public Action Click;

	public Rectangle Bounds;

	public StatusButton(string text, bool primary, Action click)
	{
		Text = text;
		Primary = primary;
		Click = click;
	}
}
