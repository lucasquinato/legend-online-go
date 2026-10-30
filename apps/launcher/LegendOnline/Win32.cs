using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace LegendOnline;

internal static class Win32
{
	public delegate bool EnumProc(IntPtr h, IntPtr l);

	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
	private struct STARTUPINFO
	{
		public int cb;

		public string lpReserved;

		public string lpDesktop;

		public string lpTitle;

		public int dwX;

		public int dwY;

		public int dwXSize;

		public int dwYSize;

		public int dwXCountChars;

		public int dwYCountChars;

		public int dwFillAttribute;

		public int dwFlags;

		public short wShowWindow;

		public short cbReserved2;

		public IntPtr lpReserved2;

		public IntPtr hStdInput;

		public IntPtr hStdOutput;

		public IntPtr hStdError;
	}

	private struct PROCESS_INFORMATION
	{
		public IntPtr hProcess;

		public IntPtr hThread;

		public int dwProcessId;

		public int dwThreadId;
	}

	public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
	{
		public long PerProcessUserTimeLimit;

		public long PerJobUserTimeLimit;

		public uint LimitFlags;

		public UIntPtr MinimumWorkingSetSize;

		public UIntPtr MaximumWorkingSetSize;

		public uint ActiveProcessLimit;

		public UIntPtr Affinity;

		public uint PriorityClass;

		public uint SchedulingClass;
	}

	public struct IO_COUNTERS
	{
		public ulong ReadOperationCount;

		public ulong WriteOperationCount;

		public ulong OtherOperationCount;

		public ulong ReadTransferCount;

		public ulong WriteTransferCount;

		public ulong OtherTransferCount;
	}

	public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	{
		public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;

		public IO_COUNTERS IoInfo;

		public UIntPtr ProcessMemoryLimit;

		public UIntPtr JobMemoryLimit;

		public UIntPtr PeakProcessMemoryUsed;

		public UIntPtr PeakJobMemoryUsed;
	}

	public const int GWL_STYLE = -16;

	public const int GWL_EXSTYLE = -20;

	public const uint WS_CHILD = 1073741824u;

	public const uint WS_POPUP = 2147483648u;

	public const uint WS_CAPTION = 12582912u;

	public const uint WS_THICKFRAME = 262144u;

	public const uint WS_SYSMENU = 524288u;

	public const uint WS_MINIMIZEBOX = 131072u;

	public const uint WS_MAXIMIZEBOX = 65536u;

	public const uint WS_CLIPSIBLINGS = 67108864u;

	public const uint WS_CLIPCHILDREN = 33554432u;

	public const uint WS_BORDER = 8388608u;

	public const uint WS_EX_APPWINDOW = 262144u;

	public const uint WS_EX_WINDOWEDGE = 256u;

	public const uint WS_EX_DLGMODALFRAME = 1u;

	public const uint SWP_NOSIZE = 1u;

	public const uint SWP_NOMOVE = 2u;

	public const uint SWP_NOZORDER = 4u;

	public const uint SWP_NOACTIVATE = 16u;

	public const uint SWP_FRAMECHANGED = 32u;

	public const uint SWP_SHOWWINDOW = 64u;

	[DllImport("user32.dll")]
	public static extern bool EnumWindows(EnumProc f, IntPtr l);

	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);

	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	public static extern int GetClassName(IntPtr h, StringBuilder s, int n);

	[DllImport("user32.dll")]
	public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

	[DllImport("user32.dll")]
	public static extern int GetWindowLong(IntPtr h, int index);

	[DllImport("user32.dll")]
	public static extern int SetWindowLong(IntPtr h, int index, int value);

	[DllImport("user32.dll", SetLastError = true)]
	public static extern IntPtr SetParent(IntPtr child, IntPtr parent);

	[DllImport("user32.dll")]
	public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);

	[DllImport("user32.dll")]
	public static extern IntPtr SetFocus(IntPtr h);

	[DllImport("user32.dll")]
	public static extern bool IsWindow(IntPtr h);

	[DllImport("user32.dll")]
	public static extern bool IsWindowVisible(IntPtr h);

	[DllImport("user32.dll")]
	public static extern bool ShowWindow(IntPtr h, int cmd);

	[DllImport("user32.dll")]
	public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
	public static extern IntPtr CreateJobObject(IntPtr attrs, string name);

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr procAttrs, IntPtr threadAttrs, bool inheritHandles, uint flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);

	[DllImport("kernel32.dll")]
	private static extern uint ResumeThread(IntPtr thread);

	[DllImport("kernel32.dll")]
	private static extern bool CloseHandle(IntPtr h);

	public static Process StartEngine(string exe, string args)
	{
		STARTUPINFO si = new STARTUPINFO
		{
			cb = Marshal.SizeOf(typeof(STARTUPINFO))
		};
		StringBuilder cmd = new StringBuilder("\"" + exe + "\" " + args);
		if (!CreateProcess(exe, cmd, IntPtr.Zero, IntPtr.Zero, inheritHandles: false, 1028u, IntPtr.Zero, Path.GetDirectoryName(exe), ref si, out var pi))
		{
			throw new Win32Exception(Marshal.GetLastWin32Error());
		}
		try
		{
			Jobs.Add(pi.hProcess);
			Process processById = Process.GetProcessById(pi.dwProcessId);
			ResumeThread(pi.hThread);
			return processById;
		}
		finally
		{
			CloseHandle(pi.hThread);
			CloseHandle(pi.hProcess);
		}
	}

	[DllImport("kernel32.dll", SetLastError = true)]
	public static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint size);

	[DllImport("kernel32.dll", SetLastError = true)]
	public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

	public static IntPtr FindEngineWindow(int pid, string title)
	{
		IntPtr found = IntPtr.Zero;
		EnumWindows(delegate(IntPtr h, IntPtr l)
		{
			GetWindowThreadProcessId(h, out var pid2);
			if (pid2 != pid)
			{
				return true;
			}
			StringBuilder stringBuilder = new StringBuilder(128);
			GetClassName(h, stringBuilder, 128);
			StringBuilder stringBuilder2 = new StringBuilder(128);
			GetWindowText(h, stringBuilder2, 128);
			if (stringBuilder.ToString() == "ApolloRuntimeContentWindow" && stringBuilder2.ToString() == title)
			{
				found = h;
				return false;
			}
			return true;
		}, IntPtr.Zero);
		return found;
	}

	public static void MakeChild(IntPtr h, IntPtr parent, Size size)
	{
		uint windowLong = (uint)GetWindowLong(h, -16);
		windowLong &= 0x7F30FFFF;
		windowLong |= 0x46000000;
		SetWindowLong(h, -16, (int)windowLong);
		uint windowLong2 = (uint)GetWindowLong(h, -20);
		windowLong2 &= 0xFFFBFEFEu;
		SetWindowLong(h, -20, (int)windowLong2);
		if (SetParent(h, parent) == IntPtr.Zero)
		{
			Log.Info("[launcher] SetParent falhou: " + Marshal.GetLastWin32Error());
		}
		SetWindowPos(h, IntPtr.Zero, 0, 0, size.Width, size.Height, 52u);
	}
}
