using System.Windows.Forms;

namespace LegendOnline;

internal sealed class DarkMenuRenderer : ToolStripProfessionalRenderer
{
	public DarkMenuRenderer()
		: base(new DarkMenuColors())
	{
		base.RoundedEdges = false;
	}

	protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
	{
		bool flag = e.Item is ToolStripMenuItem toolStripMenuItem && e.Text == toolStripMenuItem.ShortcutKeyDisplayString;
		if (!e.Item.Enabled || flag)
		{
			e.TextColor = Theme.Faint;
		}
		else if (e.Item.Tag as string == "danger")
		{
			e.TextColor = Theme.Danger;
		}
		else
		{
			e.TextColor = Theme.Text;
		}
		base.OnRenderItemText(e);
	}
}
