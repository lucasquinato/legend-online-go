using System.Drawing;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class DarkMenuColors : ProfessionalColorTable
{
	public override Color ToolStripDropDownBackground => Theme.Surface;

	public override Color ImageMarginGradientBegin => Theme.Surface;

	public override Color ImageMarginGradientMiddle => Theme.Surface;

	public override Color ImageMarginGradientEnd => Theme.Surface;

	public override Color MenuBorder => Theme.SurfaceBorder;

	public override Color MenuItemBorder => Theme.Pressed;

	public override Color MenuItemSelected => Theme.Pressed;

	public override Color MenuItemSelectedGradientBegin => Theme.Pressed;

	public override Color MenuItemSelectedGradientEnd => Theme.Pressed;

	public override Color MenuItemPressedGradientBegin => Theme.Pressed;

	public override Color MenuItemPressedGradientEnd => Theme.Pressed;

	public override Color SeparatorDark => Theme.SurfaceBorder;

	public override Color SeparatorLight => Theme.Surface;
}
