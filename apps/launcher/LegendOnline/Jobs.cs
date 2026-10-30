using System;
using System.Runtime.InteropServices;

namespace LegendOnline;

internal static class Jobs
{
	private static IntPtr job = IntPtr.Zero;

	public static void Add(IntPtr processHandle)
	{
		try
		{
			if (job == IntPtr.Zero)
			{
				job = Win32.CreateJobObject(IntPtr.Zero, null);
				Win32.JOBOBJECT_EXTENDED_LIMIT_INFORMATION structure = new Win32.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
				{
					BasicLimitInformation = 
					{
						LimitFlags = 8192u
					}
				};
				int num = Marshal.SizeOf(typeof(Win32.JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
				IntPtr intPtr = Marshal.AllocHGlobal(num);
				try
				{
					Marshal.StructureToPtr(structure, intPtr, fDeleteOld: false);
					if (!Win32.SetInformationJobObject(job, 9, intPtr, (uint)num))
					{
						Log.Info("[launcher] SetInformationJobObject falhou: " + Marshal.GetLastWin32Error());
					}
				}
				finally
				{
					Marshal.FreeHGlobal(intPtr);
				}
			}
			if (!Win32.AssignProcessToJobObject(job, processHandle))
			{
				Log.Info("[launcher] AssignProcessToJobObject falhou: " + Marshal.GetLastWin32Error());
			}
		}
		catch (Exception ex)
		{
			Log.Info("[launcher] job object: " + ex.Message);
		}
	}
}
