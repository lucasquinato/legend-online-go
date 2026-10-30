using System;
using System.Security.Cryptography;
using System.Text;

namespace LegendOnline;

internal sealed class SlotInfo
{
	public string Id;

	public string User = "";

	public string TicketProtected = "";

	public bool Muted;

	private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("LegendOnline.ticket.v1");

	public string Ticket
	{
		get
		{
			if (string.IsNullOrEmpty(TicketProtected))
			{
				return "";
			}
			try
			{
				byte[] bytes = ProtectedData.Unprotect(Convert.FromBase64String(TicketProtected), Entropy, DataProtectionScope.CurrentUser);
				return Encoding.UTF8.GetString(bytes);
			}
			catch (CryptographicException)
			{
				return "";
			}
			catch (FormatException)
			{
				return "";
			}
		}
		set
		{
			TicketProtected = (string.IsNullOrEmpty(value) ? "" : Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value), Entropy, DataProtectionScope.CurrentUser)));
		}
	}

	public bool HasLogin
	{
		get
		{
			if (User.Length > 0)
			{
				return TicketProtected.Length > 0;
			}
			return false;
		}
	}

	public static SlotInfo New()
	{
		SlotInfo slotInfo = new SlotInfo();
		slotInfo.Id = Guid.NewGuid().ToString("N").Substring(0, 10);
		return slotInfo;
	}
}
