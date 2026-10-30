using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace LegendOnline;

internal sealed class LauncherState
{
	public const int Version = 1;

	public readonly List<SlotInfo> Slots = new List<SlotInfo>();

	public string ActiveId = "";

	public Rectangle Bounds = Rectangle.Empty;

	public bool Maximized;

	public readonly List<string> KnownUsers = new List<string>();

	private string path;

	public static LauncherState Load(string path)
	{
		LauncherState launcherState = new LauncherState();
		launcherState.path = path;
		if (!File.Exists(path))
		{
			return launcherState;
		}
		try
		{
			if (!(new JavaScriptSerializer().DeserializeObject(File.ReadAllText(path, Encoding.UTF8)) is Dictionary<string, object> d))
			{
				return launcherState;
			}
			if (Get(d, "slots") is object[] array)
			{
				object[] array2 = array;
				foreach (object obj in array2)
				{
					if (obj is Dictionary<string, object> d2)
					{
						SlotInfo slotInfo = new SlotInfo();
						slotInfo.Id = Get(d2, "id") as string;
						if (!string.IsNullOrEmpty(slotInfo.Id))
						{
							slotInfo.User = (Get(d2, "user") as string) ?? "";
							slotInfo.TicketProtected = (Get(d2, "ticket") as string) ?? "";
							slotInfo.Muted = Get(d2, "muted") is bool && (bool)Get(d2, "muted");
							launcherState.Slots.Add(slotInfo);
						}
					}
				}
			}
			launcherState.ActiveId = (Get(d, "active") as string) ?? "";
			if (Get(d, "knownUsers") is object[] array3)
			{
				object[] array4 = array3;
				foreach (object obj2 in array4)
				{
					if (obj2 is string)
					{
						launcherState.KnownUsers.Add((string)obj2);
					}
				}
			}
			if (Get(d, "window") is Dictionary<string, object> d3)
			{
				launcherState.Bounds = new Rectangle(Int(d3, "x"), Int(d3, "y"), Int(d3, "width"), Int(d3, "height"));
				launcherState.Maximized = Get(d3, "maximized") is bool && (bool)Get(d3, "maximized");
			}
		}
		catch (Exception ex)
		{
			Log.Info("[launcher] state.json ilegível, começando do zero: " + ex.Message);
		}
		return launcherState;
	}

	public void RememberUser(string user)
	{
		KnownUsers.RemoveAll((string u) => string.Equals(u, user, StringComparison.OrdinalIgnoreCase));
		KnownUsers.Insert(0, user);
		if (KnownUsers.Count > 16)
		{
			KnownUsers.RemoveRange(16, KnownUsers.Count - 16);
		}
	}

	public void Save()
	{
		List<object> list = new List<object>();
		foreach (SlotInfo slot in Slots)
		{
			Dictionary<string, object> dictionary = new Dictionary<string, object>();
			dictionary["id"] = slot.Id;
			dictionary["user"] = slot.User;
			dictionary["ticket"] = slot.TicketProtected;
			dictionary["muted"] = slot.Muted;
			list.Add(dictionary);
		}
		Dictionary<string, object> dictionary2 = new Dictionary<string, object>();
		dictionary2["version"] = 1;
		dictionary2["slots"] = list;
		dictionary2["active"] = ActiveId;
		dictionary2["knownUsers"] = KnownUsers;
		if (!Bounds.IsEmpty)
		{
			Dictionary<string, object> dictionary3 = new Dictionary<string, object>();
			dictionary3["x"] = Bounds.X;
			dictionary3["y"] = Bounds.Y;
			dictionary3["width"] = Bounds.Width;
			dictionary3["height"] = Bounds.Height;
			dictionary3["maximized"] = Maximized;
			dictionary2["window"] = dictionary3;
		}
		try
		{
			string sourceFileName = path + ".tmp";
			File.WriteAllText(sourceFileName, new JavaScriptSerializer().Serialize(dictionary2), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
			if (File.Exists(path))
			{
				File.Replace(sourceFileName, path, null);
			}
			else
			{
				File.Move(sourceFileName, path);
			}
		}
		catch (IOException ex)
		{
			Log.Info("[launcher] state.json não salvo: " + ex.Message);
		}
		catch (UnauthorizedAccessException ex2)
		{
			Log.Info("[launcher] state.json não salvo: " + ex2.Message);
		}
	}

	private static object Get(Dictionary<string, object> d, string key)
	{
		if (!d.TryGetValue(key, out var value))
		{
			return null;
		}
		return value;
	}

	private static int Int(Dictionary<string, object> d, string key)
	{
		object obj = Get(d, key);
		if (!(obj is int))
		{
			return 0;
		}
		return (int)obj;
	}
}
