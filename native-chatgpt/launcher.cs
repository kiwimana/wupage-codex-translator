using System;
using System.Diagnostics;
using System.IO;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Threading;

class Launcher {
  static string Quote(string s) {
    if (s.Contains("\"")) throw new ArgumentException("Invalid path");
    return "\"" + s + "\"";
  }
  static int Main(string[] args) {
    try {
      string directory = AppDomain.CurrentDomain.BaseDirectory;
      var config = new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(
        File.ReadAllText(Path.Combine(directory, "bridge.config.json")));
      var start = new ProcessStartInfo(config["nodePath"], Quote(Path.Combine(directory, "host.mjs")));
      foreach (string arg in args) start.Arguments += " " + Quote(arg);
      start.UseShellExecute = false; start.CreateNoWindow = true;
      start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
      start.WorkingDirectory = directory;
      var input = Console.OpenStandardInput();
      var header = ReadExact(input, 4);
      uint length = BitConverter.ToUInt32(header, 0);
      if (length == 0 || length > 262144) return 1;
      var payload = ReadExact(input, (int)length);
      using (var child = Process.Start(start)) {
        child.StandardInput.BaseStream.Write(header, 0, header.Length);
        child.StandardInput.BaseStream.Write(payload, 0, payload.Length);
        child.StandardInput.BaseStream.Flush();
        var incoming = new Thread(() => {
          try { while (input.ReadByte() >= 0) {} } catch {}
          finally { try { child.StandardInput.Close(); } catch {} }
        });
        incoming.IsBackground = true; incoming.Start();
        var errors = new Thread(() => { try { child.StandardError.BaseStream.CopyTo(Stream.Null); } catch {} });
        errors.IsBackground = true; errors.Start();
        child.StandardOutput.BaseStream.CopyTo(Console.OpenStandardOutput());
        child.WaitForExit(); errors.Join();
        return child.ExitCode;
      }
    } catch { return 1; }
  }
  static byte[] ReadExact(Stream stream, int count) {
    var data = new byte[count]; int offset = 0;
    while (offset < count) {
      int read = stream.Read(data, offset, count - offset);
      if (read == 0) throw new EndOfStreamException();
      offset += read;
    }
    return data;
  }
}
