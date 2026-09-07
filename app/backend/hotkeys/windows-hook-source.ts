// Compiled in a hidden helper, keeping the hook message loop off Electron's thread.
export const WINDOWS_HOOK_SOURCE = String.raw`
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public static class CubbyShortcutHook {
  delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  struct Binding { public string Id; public int Modifiers; public int Key; }
  static Binding[] bindings = new Binding[0];
  static readonly HashSet<int> swallowed = new HashSet<int>();
  static readonly BlockingCollection<string> output = new BlockingCollection<string>(64);
  static readonly HookProc callback = Handle;
  static IntPtr hook;
  static long heartbeat;

  static bool Down(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }
  static IntPtr Handle(int code, IntPtr message, IntPtr data) {
    if (code < 0) return CallNextHookEx(hook, code, message, data);
    int msg = message.ToInt32(), key = Marshal.ReadInt32(data);
    bool up = msg == 0x101 || msg == 0x105;
    bool down = msg == 0x100 || msg == 0x104;
    if (up && swallowed.Remove(key)) return new IntPtr(1);
    if (down && swallowed.Contains(key)) return new IntPtr(1);
    if (down) {
      int mods = (Down(0x11) ? 1 : 0) | (Down(0x12) ? 2 : 0) | (Down(0x10) ? 4 : 0) | ((Down(0x5B) || Down(0x5C)) ? 8 : 0);
      foreach (Binding binding in Volatile.Read(ref bindings)) {
        if (binding.Key != key || binding.Modifiers != mods) continue;
        // Do not swallow input if the event consumer is stalled.
        if (!output.TryAdd("hit:" + binding.Id)) break;
        swallowed.Add(key);
        if ((mods & 10) != 0) {
          // Mask a lone Win/Alt release without changing any held modifier.
          keybd_event(0xE8, 0, 0, UIntPtr.Zero);
          keybd_event(0xE8, 0, 2, UIntPtr.Zero);
        }
        return new IntPtr(1);
      }
    }
    return CallNextHookEx(hook, code, message, data);
  }

  public static void Run() {
    heartbeat = Stopwatch.GetTimestamp();
    var writer = new Thread(() => {
      try { foreach (string line in output.GetConsumingEnumerable()) Console.WriteLine(line); }
      catch { Environment.Exit(1); }
    });
    writer.IsBackground = true;
    writer.Start();
    hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
    if (hook == IntPtr.Zero) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    var reader = new Thread(() => {
      try {
        string line;
        while ((line = Console.ReadLine()) != null) {
          Interlocked.Exchange(ref heartbeat, Stopwatch.GetTimestamp());
          if (line == "ping") continue;
          string[] command = line.Split('|');
          int sequence = int.Parse(command[0]);
          var next = new List<Binding>();
          foreach (string item in command[1].Split(';')) {
            if (item.Length == 0) continue;
            string[] parts = item.Split(',');
            string id = parts[0];
            int modifiers = int.Parse(parts[1]), key = int.Parse(parts[2]);
            if ((id != "wake" && id != "clipboard" && id != "pinboard") || modifiers < 0 || modifiers > 15 || key < 8 || key > 255 || next.Count >= 3) throw new ArgumentException();
            next.Add(new Binding { Id = id, Modifiers = modifiers, Key = key });
          }
          Volatile.Write(ref bindings, next.ToArray());
          output.Add("applied:" + sequence);
        }
      } catch { }
      // Parent exit or a broken pipe must always release the hook.
      Environment.Exit(0);
    });
    reader.IsBackground = true;
    reader.Start();
    var lease = new System.Threading.Timer(_ => {
      if ((Stopwatch.GetTimestamp() - Interlocked.Read(ref heartbeat)) / (double)Stopwatch.Frequency > 10) Environment.Exit(0);
    }, null, 2000, 2000);
    output.Add("ready");
    try { Application.Run(); }
    finally { UnhookWindowsHookEx(hook); lease.Dispose(); }
  }
}
`;
