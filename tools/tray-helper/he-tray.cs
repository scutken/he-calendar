// =============================================================================
// 合社日历 · 系统托盘 helper（C# / raw Win32，无 WinForms）
//
// 为什么需要它
//   uTools 插件跑在 Electron 渲染进程里，没有 FFI；uTools 自身也没有任何托盘 API
//   （官方 utools.api.d.ts 里检索不到 tray）。托盘图标必须由"拥有真实 HWND + 消息循环"
//   的进程调用 Shell_NotifyIcon 创建，所以插件包里带一个独立小程序。
//
// 为什么不用 WinForms（实测数据）
//   WinForms 版：14.5 KB / 常驻 29.1 MB
//   本文件版本： 8.5 KB / 常驻 24.2 MB（含 GDI+ 动态画图标）
//   直接 P/Invoke 既省内存又省体积，且行为完全可控。
//
// 编译（不需要任何 SDK，用系统自带编译器）
//   C:\WINDOWS\Microsoft.NET\Framework64\v4.0.30319\csc.exe
//   见 tools/build-tray-helper.mjs
//   注意：该 csc 是 .NET Framework 4.8 自带的老编译器，只支持 C# 5
//   （不能用字符串插值、?.、nameof、表达式体成员等）
//
// 协议
//   入：--config <配置文件路径> --parent-pid <pid>
//       配置文件是行式格式（插件侧 src/tray/host.js 负责写），示例：
//         enabled=1
//         tooltip=%lunar% · 宜:%yi% · %time%
//         var.lunar=八月二十
//         menu=open|打开合社日历
//         menu=-|-
//         menu=quit|关闭托盘图标
//   出：stdout 每行一个 JSON 对象（字段极简，便于手写序列化）
//         {"type":"ready"} / {"type":"click","button":"left"}
//         {"type":"menu","item":"open"} / {"type":"tooltip","text":"..."}
//
// 刻意不做：不 hook 输入、不碰 explorer、不写注册表、不开机自启、不联网。
// =============================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class HeTray
{
    // ---------------------------------------------------------------- Win32
    private const int WM_APP = 0x8000;
    private const int WM_CALLBACK = WM_APP + 1;    // 托盘回调消息
    private const int WM_TIMER = 0x0113;
    private const int WM_DESTROY = 0x0002;
    private const int WM_CONTEXTMENU = 0x007B;     // v4 版本下的右键
    private const int WM_LBUTTONUP = 0x0202;
    private const int WM_RBUTTONUP = 0x0205;
    private const int NIN_SELECT = 0x0400;         // v4 版本下的左键单击
    private const int NIN_KEYSELECT = 0x0401;

    private const int NIM_ADD = 0x00000000;
    private const int NIM_MODIFY = 0x00000001;
    private const int NIM_DELETE = 0x00000002;
    private const int NIM_SETVERSION = 0x00000004;

    private const int NIF_MESSAGE = 0x00000001;
    private const int NIF_ICON = 0x00000002;
    private const int NIF_TIP = 0x00000004;
    private const int NIF_SHOWTIP = 0x00000080;    // 配合 v4 才允许 128 字符 tooltip

    private const int NOTIFYICON_VERSION_4 = 4;

    private const int MF_STRING = 0x00000000;
    private const int MF_SEPARATOR = 0x00000800;
    private const int TPM_RETURNCMD = 0x0100;
    private const int TPM_RIGHTBUTTON = 0x0002;
    private const int TPM_NONOTIFY = 0x0080;

    private const int SM_CXSMICON = 49;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATA
    {
        public int cbSize;
        public IntPtr hWnd;
        public int uID;
        public int uFlags;
        public int uCallbackMessage;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
        public int dwState;
        public int dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
        public int uVersion;                        // 与 uTimeout 共用（union）
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
        public int dwInfoFlags;
        public Guid guidItem;
        public IntPtr hBalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASSEX
    {
        public int cbSize;
        public int style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string lpszMenuName;
        public string lpszClassName;
        public IntPtr hIconSm;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public int message;
        public IntPtr wParam;
        public IntPtr lParam;
        public int time;
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern ushort RegisterClassEx(ref WNDCLASSEX c);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateWindowEx(int exStyle, string cls, string name, int style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern IntPtr DefWindowProc(IntPtr h, int m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] private static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG m);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG m);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] private static extern bool PostQuitMessage(int code);
    [DllImport("user32.dll")] private static extern IntPtr SetTimer(IntPtr h, IntPtr id, uint ms, IntPtr proc);
    [DllImport("user32.dll")] private static extern bool KillTimer(IntPtr h, IntPtr id);
    [DllImport("user32.dll")] private static extern IntPtr LoadIcon(IntPtr inst, IntPtr name);
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr h);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessage(string s);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(IntPtr menu, int flags, IntPtr id, string item);
    [DllImport("user32.dll")] private static extern bool DestroyMenu(IntPtr menu);
    [DllImport("user32.dll")] private static extern int TrackPopupMenu(IntPtr menu, int flags, int x, int y, int reserved, IntPtr hwnd, IntPtr rect);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern bool Shell_NotifyIcon(int msg, ref NOTIFYICONDATA data);
    [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string name);

    // ---------------------------------------------------------------- 状态
    private static WndProcDelegate _proc;                  // 必须保活：被 GC 回收后回调会崩
    private static IntPtr _hwnd = IntPtr.Zero;
    private static uint _taskbarCreated;

    private static string _configPath;
    private static int _parentPid;
    private static DateTime _configStamp = DateTime.MinValue;
    private static bool _configLoaded;

    private static readonly Dictionary<string, string> _scalars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, string> _vars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    private static readonly List<string[]> _menuItems = new List<string[]>();   // [id, label]

    private static NOTIFYICONDATA _data;
    private static bool _iconAdded;
    private static Icon _icon;
    private static int _iconSize;
    private static string _lastIconKey;
    private static string _lastTooltip;
    private static int _tooltipLimitedAt;                  // 记录被截断到多少字符（用于诊断上报）
    private static bool _exiting;
    private static DateTime _lastWatchdog = DateTime.MinValue;
    private static int _tickCount;

    private static Mutex _singleInstance;

    // ---------------------------------------------------------------- 入口
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--config" && i + 1 < args.Length) _configPath = args[++i];
                else if (args[i] == "--parent-pid" && i + 1 < args.Length) int.TryParse(args[++i], out _parentPid);
            }

            // 单实例：避免插件重复拉起导致出现两个托盘图标
            bool createdNew;
            _singleInstance = new Mutex(true, @"Local\he-calendar-tray-single", out createdNew);
            if (!createdNew)
            {
                Out("{\"type\":\"error\",\"message\":\"another instance is running\"}");
                return 3;
            }

            Out("{\"type\":\"start\",\"pid\":" + Process.GetCurrentProcess().Id
                + ",\"parentPid\":" + _parentPid
                + ",\"config\":\"" + Esc(_configPath) + "\""
                + ",\"clr\":\"" + Esc(Environment.Version.ToString()) + "\"}");

            if (string.IsNullOrEmpty(_configPath))
            {
                Out("{\"type\":\"error\",\"message\":\"missing --config\"}");
                return 2;
            }

            ReloadConfig(true);
            CreateTrayWindow();
            ApplyConfig(true);

            _taskbarCreated = RegisterWindowMessage("TaskbarCreated");
            SetTimer(_hwnd, new IntPtr(1), 1000, IntPtr.Zero);   // 1s：秒级 tooltip + 看门狗
            Out("{\"type\":\"ready\"}");

            MSG msg;
            while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            Cleanup();
            Out("{\"type\":\"exit\"}");
            return 0;
        }
        catch (Exception ex)
        {
            Out("{\"type\":\"error\",\"message\":\"" + Esc(ex.GetType().Name + ": " + ex.Message) + "\"}");
            Cleanup();
            return 1;
        }
    }

    // ---------------------------------------------------------------- 窗口
    private static void CreateTrayWindow()
    {
        _proc = WndProc;
        WNDCLASSEX wc = new WNDCLASSEX();
        wc.cbSize = Marshal.SizeOf(typeof(WNDCLASSEX));
        wc.lpfnWndProc = Marshal.GetFunctionPointerForDelegate(_proc);
        wc.hInstance = GetModuleHandle(null);
        wc.lpszClassName = "HeCalendarTrayWnd";
        if (RegisterClassEx(ref wc) == 0)
            throw new Exception("RegisterClassEx failed: " + Marshal.GetLastWin32Error());

        // HWND_MESSAGE(-3)：只收消息不显示，托盘图标只需要一个消息窗口
        _hwnd = CreateWindowEx(0, "HeCalendarTrayWnd", "he-calendar-tray", 0, 0, 0, 0, 0,
                               new IntPtr(-3), IntPtr.Zero, wc.hInstance, IntPtr.Zero);
        if (_hwnd == IntPtr.Zero)
            throw new Exception("CreateWindowEx failed: " + Marshal.GetLastWin32Error());
    }

    private static IntPtr WndProc(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_CALLBACK)
        {
            int evt = lParam.ToInt32() & 0xFFFF;     // v4 下 LOWORD 才是事件
            if (evt == WM_LBUTTONUP || evt == NIN_SELECT || evt == NIN_KEYSELECT)
            {
                Out("{\"type\":\"click\",\"button\":\"left\"}");
                return IntPtr.Zero;
            }
            if (evt == WM_RBUTTONUP || msg == WM_CONTEXTMENU)
            {
                ShowMenu();
                return IntPtr.Zero;
            }
            return IntPtr.Zero;
        }
        if (msg == WM_CONTEXTMENU)
        {
            ShowMenu();
            return IntPtr.Zero;
        }
        if (msg == WM_TIMER)
        {
            OnTick();
            return IntPtr.Zero;
        }
        if (_taskbarCreated != 0 && msg == (int)_taskbarCreated)
        {
            // 任务栏/explorer 重启后图标会消失，必须重新注册
            _iconAdded = false;
            _lastTooltip = null;
            AddOrModifyIcon();
            Out("{\"type\":\"taskbar-recreated\"}");
            return IntPtr.Zero;
        }
        if (msg == WM_DESTROY)
        {
            PostQuitMessage(0);
            return IntPtr.Zero;
        }
        return DefWindowProc(hWnd, msg, wParam, lParam);
    }

    // ---------------------------------------------------------------- 周期任务
    private static void OnTick()
    {
        _tickCount++;
        ReloadConfig(false);
        UpdateTooltip(false);
        UpdateIcon(false);

        if (_parentPid > 0 && (DateTime.UtcNow - _lastWatchdog).TotalSeconds >= 2)
        {
            _lastWatchdog = DateTime.UtcNow;
            try { Process.GetProcessById(_parentPid); }
            catch { RequestExit("parent-gone"); }
        }
    }

    private static void RequestExit(string reason)
    {
        if (_exiting) return;
        _exiting = true;
        Out("{\"type\":\"closing\",\"reason\":\"" + Esc(reason) + "\"}");
        Cleanup();
        if (_hwnd != IntPtr.Zero) PostMessage(_hwnd, (uint)WM_DESTROY, IntPtr.Zero, IntPtr.Zero);
        else PostQuitMessage(0);
    }

    private static void Cleanup()
    {
        if (_iconAdded)
        {
            _data.uFlags = 0;
            try { Shell_NotifyIcon(NIM_DELETE, ref _data); } catch { }
            _iconAdded = false;
        }
        if (_icon != null) { try { _icon.Dispose(); } catch { } _icon = null; }
        if (_iconSize > 0) { try { KillTimer(_hwnd, new IntPtr(1)); } catch { } }
        if (_singleInstance != null) { try { _singleInstance.ReleaseMutex(); } catch { } }
    }

    // ---------------------------------------------------------------- 配置
    private static void ReloadConfig(bool force)
    {
        try
        {
            if (string.IsNullOrEmpty(_configPath) || !File.Exists(_configPath)) return;
            DateTime stamp = File.GetLastWriteTimeUtc(_configPath);
            if (!force && stamp == _configStamp && _configLoaded) return;

            Dictionary<string, string> scalars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            Dictionary<string, string> vars = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            List<string[]> menus = new List<string[]>();

            string[] lines = File.ReadAllLines(_configPath, Encoding.UTF8);
            for (int i = 0; i < lines.Length; i++)
            {
                string line = lines[i];
                if (line == null) continue;
                line = line.Trim();
                if (line.Length == 0 || line[0] == '#') continue;
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                string key = line.Substring(0, eq).Trim();
                string val = line.Substring(eq + 1).Trim();
                if (key.StartsWith("var.", StringComparison.OrdinalIgnoreCase)) vars[key.Substring(4)] = val;
                else if (key.Equals("menu", StringComparison.OrdinalIgnoreCase))
                {
                    int bar = val.IndexOf('|');
                    menus.Add(bar < 0 ? new string[] { val, val } : new string[] { val.Substring(0, bar), val.Substring(bar + 1) });
                }
                else scalars[key] = val;
            }

            _scalars.Clear();
            foreach (KeyValuePair<string, string> kv in scalars) _scalars[kv.Key] = kv.Value;
            _vars.Clear();
            foreach (KeyValuePair<string, string> kv in vars) _vars[kv.Key] = kv.Value;
            _menuItems.Clear();
            _menuItems.AddRange(menus);

            _configStamp = stamp;
            _configLoaded = true;
            Out("{\"type\":\"config-loaded\",\"vars\":" + _vars.Count + ",\"menu\":" + _menuItems.Count + "}");
        }
        catch (Exception ex)
        {
            Out("{\"type\":\"error\",\"message\":\"config reload: " + Esc(ex.Message) + "\"}");
        }
    }

    private static string Cfg(string key, string fallback)
    {
        string v;
        if (_scalars.TryGetValue(key, out v) && !string.IsNullOrEmpty(v)) return v;
        return fallback;
    }

    private static int CfgInt(string key, int fallback)
    {
        int n;
        if (int.TryParse(Cfg(key, ""), out n)) return n;
        return fallback;
    }

    private static bool CfgBool(string key, bool fallback)
    {
        string v = Cfg(key, "");
        if (v == "1" || v.Equals("true", StringComparison.OrdinalIgnoreCase)) return true;
        if (v == "0" || v.Equals("false", StringComparison.OrdinalIgnoreCase)) return false;
        return fallback;
    }

    // ---------------------------------------------------------------- 托盘
    private static void ApplyConfig(bool force)
    {
        UpdateIcon(force);
        UpdateTooltip(force);
        AddOrModifyIcon();
    }

    private static void AddOrModifyIcon()
    {
        try
        {
            if (!CfgBool("enabled", true))
            {
                if (_iconAdded) { _data.uFlags = 0; Shell_NotifyIcon(NIM_DELETE, ref _data); _iconAdded = false; Out("{\"type\":\"hidden\"}"); }
                return;
            }
            if (_icon == null) UpdateIcon(true);

            if (!_iconAdded)
            {
                _data = new NOTIFYICONDATA();
                _data.cbSize = Marshal.SizeOf(typeof(NOTIFYICONDATA));
                _data.hWnd = _hwnd;
                _data.uID = 1;
                _data.uCallbackMessage = WM_CALLBACK;
                _data.szTip = string.IsNullOrEmpty(_lastTooltip) ? "合社日历" : _lastTooltip;
                _data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_SHOWTIP;
                _data.hIcon = _icon == null ? LoadIcon(IntPtr.Zero, new IntPtr(32512)) : _icon.Handle;

                bool ok = Shell_NotifyIcon(NIM_ADD, ref _data);
                Out("{\"type\":\"nim-add\",\"ok\":" + (ok ? "true" : "false") + ",\"tipLen\":" + _data.szTip.Length + "}");
                if (!ok) return;

                _data.uVersion = NOTIFYICON_VERSION_4;
                Shell_NotifyIcon(NIM_SETVERSION, ref _data);
                _iconAdded = true;
            }
            else
            {
                _data.uFlags = NIF_ICON | NIF_TIP | NIF_SHOWTIP;
                _data.hIcon = _icon == null ? _data.hIcon : _icon.Handle;
                _data.szTip = string.IsNullOrEmpty(_lastTooltip) ? "合社日历" : _lastTooltip;
                Shell_NotifyIcon(NIM_MODIFY, ref _data);
            }
        }
        catch (Exception ex)
        {
            Out("{\"type\":\"error\",\"message\":\"tray add: " + Esc(ex.Message) + "\"}");
        }
    }

    private static void UpdateTooltip(bool force)
    {
        string template = Cfg("tooltip", "%lunar%");
        int maxChars = CfgInt("maxTooltipChars", 127);
        if (maxChars < 8) maxChars = 8;
        if (maxChars > 127) maxChars = 127;

        StringBuilder sb = new StringBuilder(template);
        sb.Replace("%time%", DateTime.Now.ToString(Cfg("timeFormat", "HH:mm"), CultureInfo.InvariantCulture));
        sb.Replace("%timeSec%", DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
        sb.Replace("%date%", DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        sb.Replace("%year%", DateTime.Now.Year.ToString(CultureInfo.InvariantCulture));
        sb.Replace("%month%", DateTime.Now.Month.ToString(CultureInfo.InvariantCulture));
        sb.Replace("%day%", DateTime.Now.Day.ToString(CultureInfo.InvariantCulture));
        sb.Replace("%weekday%", WeekdayCn(DateTime.Now.DayOfWeek));

        foreach (KeyValuePair<string, string> kv in _vars) sb.Replace("%" + kv.Key + "%", kv.Value == null ? "" : kv.Value);

        string text = sb.ToString();
        // 清掉没能替换的占位符与多余分隔符，避免 tooltip 里出现 %xxx% 或连续 ··
        text = System.Text.RegularExpressions.Regex.Replace(text, "%[A-Za-z0-9_]+%", "");
        text = System.Text.RegularExpressions.Regex.Replace(text, "(\\s*·\\s*)+", " · ");
        text = text.Trim(' ', '·', '\t', '\r', '\n');
        if (text.Length == 0) text = "合社日历";

        _tooltipLimitedAt = 0;
        if (text.Length > maxChars)
        {
            text = text.Substring(0, maxChars - 1) + "…";
            _tooltipLimitedAt = maxChars;
        }

        if (!force && text == _lastTooltip) return;
        _lastTooltip = text;

        if (_iconAdded)
        {
            _data.uFlags = NIF_TIP | NIF_SHOWTIP;
            _data.szTip = text;
            bool ok = Shell_NotifyIcon(NIM_MODIFY, ref _data);
            if (!ok)
            {
                // 128 字符被拒时退回保守长度（63），确保 tooltip 一定可用
                string safe = text.Length > 63 ? text.Substring(0, 62) + "…" : text;
                _data.szTip = safe;
                ok = Shell_NotifyIcon(NIM_MODIFY, ref _data);
                Out("{\"type\":\"tooltip-truncated\",\"to\":" + safe.Length + ",\"ok\":" + (ok ? "true" : "false") + "}");
                _lastTooltip = safe;
                text = safe;
            }
        }
        Out("{\"type\":\"tooltip\",\"text\":\"" + Esc(text) + "\",\"length\":" + text.Length
            + (_tooltipLimitedAt > 0 ? ",\"limitedAt\":" + _tooltipLimitedAt : "") + "}");
    }

    private static string WeekdayCn(DayOfWeek d)
    {
        switch (d)
        {
            case DayOfWeek.Monday: return "周一";
            case DayOfWeek.Tuesday: return "周二";
            case DayOfWeek.Wednesday: return "周三";
            case DayOfWeek.Thursday: return "周四";
            case DayOfWeek.Friday: return "周五";
            case DayOfWeek.Saturday: return "周六";
            default: return "周日";
        }
    }

    // ---------------------------------------------------------------- 图标
    private static void UpdateIcon(bool force)
    {
        try
        {
            string mode = Cfg("icon.mode", "date");
            string text = Cfg("icon.text", "");
            if (text.Length == 0) text = DateTime.Now.Day.ToString(CultureInfo.InvariantCulture);
            string bg = Cfg("icon.bg", "#8C4A3C");
            string fg = Cfg("icon.fg", "#FFFFFF");
            string logo = Cfg("icon.logo", "");

            int size = GetSystemMetrics(SM_CXSMICON);
            if (size < 16) size = 16;
            if (size > 64) size = 64;
            _iconSize = size;

            string key = mode + "|" + text + "|" + bg + "|" + fg + "|" + size + "|" + logo;
            if (!force && key == _lastIconKey && _icon != null) return;

            Icon next = null;
            if (mode.Equals("logo", StringComparison.OrdinalIgnoreCase) && logo.Length > 0 && File.Exists(logo))
            {
                try { next = new Icon(logo); } catch { next = null; }
            }
            if (next == null) next = MakeDateIcon(text, ParseColor(bg, Color.FromArgb(140, 74, 60)), ParseColor(fg, Color.White), size);
            if (next == null) return;

            Icon old = _icon;
            _icon = next;
            _lastIconKey = key;
            if (old != null) { try { old.Dispose(); } catch { } }

            if (_iconAdded && !CfgBool("force-noicon", false))
            {
                _data.uFlags = NIF_ICON | NIF_TIP | NIF_SHOWTIP;
                _data.hIcon = _icon.Handle;
                _data.szTip = string.IsNullOrEmpty(_lastTooltip) ? "合社日历" : _lastTooltip;
                Shell_NotifyIcon(NIM_MODIFY, ref _data);
            }
            Out("{\"type\":\"icon\",\"mode\":\"" + Esc(mode) + "\",\"label\":\"" + Esc(text) + "\",\"size\":" + size + "}");
        }
        catch (Exception ex)
        {
            Out("{\"type\":\"error\",\"message\":\"icon: " + Esc(ex.Message) + "\"}");
        }
    }

    private static Color ParseColor(string hex, Color fallback)
    {
        try
        {
            if (string.IsNullOrEmpty(hex)) return fallback;
            hex = hex.TrimStart('#');
            if (hex.Length == 6)
            {
                int r = int.Parse(hex.Substring(0, 2), NumberStyles.HexNumber);
                int g = int.Parse(hex.Substring(2, 2), NumberStyles.HexNumber);
                int b = int.Parse(hex.Substring(4, 2), NumberStyles.HexNumber);
                return Color.FromArgb(r, g, b);
            }
        }
        catch { }
        return fallback;
    }

    /// 画"今天几号"：圆角底 + 居中大字。
    /// 不用 logo 直接缩的原因：手绘台历在 16px 下只剩一团米色，数字才看得清。
    private static Icon MakeDateIcon(string text, Color bg, Color fg, int size)
    {
        using (Bitmap bmp = new Bitmap(size, size))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                g.Clear(Color.Transparent);

                float radius = Math.Max(2f, size * 0.22f);
                float d = radius * 2f;
                using (GraphicsPath path = new GraphicsPath())
                {
                    path.AddArc(0.5f, 0.5f, d, d, 180, 90);
                    path.AddArc(size - 0.5f - d, 0.5f, d, d, 270, 90);
                    path.AddArc(size - 0.5f - d, size - 0.5f - d, d, d, 0, 90);
                    path.AddArc(0.5f, size - 0.5f - d, d, d, 90, 90);
                    path.CloseFigure();
                    using (SolidBrush brush = new SolidBrush(bg)) g.FillPath(brush, path);
                }

                float fontSize = text.Length >= 3 ? size * 0.40f : (text.Length == 2 ? size * 0.58f : size * 0.66f);
                using (Font font = new Font("Microsoft YaHei UI", fontSize, FontStyle.Bold, GraphicsUnit.Pixel))
                using (SolidBrush brush = new SolidBrush(fg))
                using (StringFormat sf = new StringFormat())
                {
                    sf.Alignment = StringAlignment.Center;
                    sf.LineAlignment = StringAlignment.Center;
                    g.DrawString(text, font, brush, new RectangleF(0, size * 0.02f, size, size), sf);
                }
            }
            IntPtr h = bmp.GetHicon();
            try { return (Icon)Icon.FromHandle(h).Clone(); }
            finally { DestroyIcon(h); }
        }
    }

    // ---------------------------------------------------------------- 菜单
    private static void ShowMenu()
    {
        try
        {
            if (_menuItems.Count == 0) { Out("{\"type\":\"click\",\"button\":\"right\"}"); return; }

            IntPtr menu = CreatePopupMenu();
            if (menu == IntPtr.Zero) return;
            List<string> ids = new List<string>();
            int cmd = 100;
            for (int i = 0; i < _menuItems.Count; i++)
            {
                string id = _menuItems[i][0];
                string label = _menuItems[i][1];
                if (id == "-") { AppendMenu(menu, MF_SEPARATOR, IntPtr.Zero, null); continue; }
                AppendMenu(menu, MF_STRING, new IntPtr(cmd), label);
                ids.Add(id);
                cmd++;
            }

            POINT pt;
            GetCursorPos(out pt);
            SetForegroundWindow(_hwnd);                     // TrackPopupMenu 的经典要求
            int picked = TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY,
                                        pt.x, pt.y, 0, _hwnd, IntPtr.Zero);
            PostMessage(_hwnd, 0x0000, IntPtr.Zero, IntPtr.Zero);   // WM_NULL：让菜单正常关闭
            DestroyMenu(menu);

            if (picked >= 100 && picked - 100 < ids.Count)
                Out("{\"type\":\"menu\",\"item\":\"" + Esc(ids[picked - 100]) + "\"}");
        }
        catch (Exception ex)
        {
            Out("{\"type\":\"error\",\"message\":\"menu: " + Esc(ex.Message) + "\"}");
        }
    }

    // ---------------------------------------------------------------- 输出
    private static string Esc(string s)
    {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.Length + 8);
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }

    private static void Out(string jsonLine)
    {
        try
        {
            Console.Out.WriteLine(jsonLine);
            Console.Out.Flush();
        }
        catch { /* 输出失败不能影响托盘本身 */ }
    }
}
