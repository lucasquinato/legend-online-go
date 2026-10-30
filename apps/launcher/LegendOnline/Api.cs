using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Cache;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace LegendOnline;

internal static class Api
{
	public static Control Ui;

	private static readonly string UserAgent = "LegendOnline/" + Program.Version + " (Windows; launcher)";

	public static void Login(string user, string password, Action<ApiResult> done)
	{
		Dictionary<string, object> dictionary = new Dictionary<string, object>();
		dictionary["username"] = user;
		dictionary["password"] = password;
		Post("login", dictionary, done);
	}

	public static void Register(string user, string password, Action<ApiResult> done)
	{
		Dictionary<string, object> dictionary = new Dictionary<string, object>();
		dictionary["username"] = user;
		dictionary["password"] = password;
		Post("register", dictionary, done);
	}

	public static void Resume(string user, string ticket, Action<ApiResult> done)
	{
		Dictionary<string, object> dictionary = new Dictionary<string, object>();
		dictionary["username"] = user;
		dictionary["ticket"] = ticket;
		Post("resume", dictionary, done);
	}

	public static void Recharge(string user, string ticket, Action<ApiResult> done)
	{
		Dictionary<string, object> dictionary = new Dictionary<string, object>();
		dictionary["username"] = user;
		dictionary["ticket"] = ticket;
		Post("recharge", dictionary, done);
	}

	private static void Post(string action, Dictionary<string, object> body, Action<ApiResult> done)
	{
		string json = new JavaScriptSerializer().Serialize(body);
		ThreadPool.QueueUserWorkItem(delegate
		{
			ApiResult apiResult = Request("POST", Program.ApiOrigin + "/launcher/api/" + action, json, 15000);
			if (!apiResult.Network && !apiResult.Ok && apiResult.Error.Length == 0)
			{
				apiResult.Error = "Resposta inválida do servidor.";
			}
			Deliver(done, apiResult);
		});
	}

	public static ApiResult Request(string method, string url, string json, int timeoutMs, bool quiet = false)
	{
		ApiResult apiResult = new ApiResult();
		try
		{
			HttpWebRequest httpWebRequest = (HttpWebRequest)WebRequest.Create(url);
			httpWebRequest.Method = method;
			httpWebRequest.UserAgent = UserAgent;
			httpWebRequest.Accept = "application/json";
			httpWebRequest.Timeout = timeoutMs;
			httpWebRequest.ReadWriteTimeout = timeoutMs;
			httpWebRequest.KeepAlive = true;
			httpWebRequest.Proxy = null;
			httpWebRequest.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
			httpWebRequest.CachePolicy = new RequestCachePolicy(RequestCacheLevel.NoCacheNoStore);
			if (json != null)
			{
				byte[] bytes = Encoding.UTF8.GetBytes(json);
				httpWebRequest.ContentType = "application/json";
				httpWebRequest.ContentLength = bytes.Length;
				using Stream stream = httpWebRequest.GetRequestStream();
				stream.Write(bytes, 0, bytes.Length);
			}
			string text;
			using (HttpWebResponse httpWebResponse = (HttpWebResponse)httpWebRequest.GetResponse())
			{
				using StreamReader streamReader = new StreamReader(httpWebResponse.GetResponseStream(), Encoding.UTF8);
				text = streamReader.ReadToEnd();
			}
			Parse(text, apiResult);
		}
		catch (WebException ex)
		{
			if (ex.Response is HttpWebResponse httpWebResponse2)
			{
				try
				{
					using StreamReader streamReader2 = new StreamReader(httpWebResponse2.GetResponseStream(), Encoding.UTF8);
					Parse(streamReader2.ReadToEnd(), apiResult);
				}
				catch (Exception)
				{
				}
				if (apiResult.Error.Length == 0)
				{
					apiResult.Error = "O servidor respondeu com erro (" + (int)httpWebResponse2.StatusCode + ").";
				}
				httpWebResponse2.Close();
			}
			else
			{
				apiResult.Network = true;
				apiResult.Error = ((ex.Status == WebExceptionStatus.TrustFailure || ex.Status == WebExceptionStatus.SecureChannelFailure) ? "Conexão segura com o servidor falhou. Confira a data e a hora do Windows." : "Sem conexão com o servidor. Confira a internet e tente de novo.");
				if (!quiet)
				{
					Log.Info(string.Concat("[api] ", method, " ", url, ": ", ex.Status, " ", ex.Message));
				}
			}
		}
		catch (Exception ex3)
		{
			apiResult.Network = true;
			apiResult.Error = "Sem conexão com o servidor. Confira a internet e tente de novo.";
			if (!quiet)
			{
				Log.Info("[api] " + method + " " + url + ": " + ex3.Message);
			}
		}
		return apiResult;
	}

	private static void Parse(string text, ApiResult r)
	{
		Dictionary<string, object> dictionary = null;
		try
		{
			dictionary = new JavaScriptSerializer().DeserializeObject(text) as Dictionary<string, object>;
		}
		catch (ArgumentException)
		{
		}
		catch (InvalidOperationException)
		{
		}
		if (dictionary != null)
		{
			r.Body = dictionary;
			r.Ok = dictionary.TryGetValue("ok", out var value) && value is bool && (bool)value;
			if (!r.Ok)
			{
				r.Error = r.Str("error");
			}
		}
	}

	private static void Deliver(Action<ApiResult> done, ApiResult r)
	{
		Control ui = Ui;
		if (ui == null || ui.IsDisposed || !ui.IsHandleCreated)
		{
			return;
		}
		try
		{
			ui.BeginInvoke(done, r);
		}
		catch (InvalidOperationException)
		{
		}
	}

	public static void OpenInBrowser(string url)
	{
		if (!Uri.TryCreate(url, UriKind.Absolute, out var result) || (result.Scheme != Uri.UriSchemeHttp && result.Scheme != Uri.UriSchemeHttps))
		{
			return;
		}
		try
		{
			ProcessStartInfo processStartInfo = new ProcessStartInfo(result.AbsoluteUri);
			processStartInfo.UseShellExecute = true;
			Process.Start(processStartInfo);
		}
		catch (Exception ex)
		{
			Log.Info("[launcher] não abriu " + result.Host + ": " + ex.Message);
		}
	}
}
