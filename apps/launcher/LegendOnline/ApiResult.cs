using System;
using System.Collections.Generic;

namespace LegendOnline;

internal sealed class ApiResult
{
	public bool Ok;

	public bool Network;

	public string Error = "";

	public Dictionary<string, object> Body = new Dictionary<string, object>();

	public string Str(string key)
	{
		if (!Body.TryGetValue(key, out var value) || value == null)
		{
			return "";
		}
		return Convert.ToString(value);
	}

	public int Int(string key)
	{
		if (!Body.TryGetValue(key, out var value) || !(value is int))
		{
			return -1;
		}
		return (int)value;
	}
}
