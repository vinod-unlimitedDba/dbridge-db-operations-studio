using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

internal static class PortableLauncher
{
    private static string SelectDataDirectory()
    {
        string executableFolder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        string[] candidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DBridge Portable"),
            Path.Combine(executableFolder, "DBridge-Data"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "DBridge Portable Data")
        };
        foreach (string candidate in candidates)
        {
            try
            {
                Directory.CreateDirectory(candidate);
                string probe = Path.Combine(candidate, ".write-test-" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                return candidate;
            }
            catch { }
        }
        throw new UnauthorizedAccessException("No writable folder is available for local DBridge session data.");
    }

    [STAThread]
    private static int Main()
    {
        string work = Path.Combine(Path.GetTempPath(), "DBridge-Portable-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(work);
            string archive = Path.Combine(work, "DBridge-Portable.zip");
            using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("DBridgePayload"))
            {
                if (source == null) throw new InvalidOperationException("The embedded DBridge payload is missing.");
                using (FileStream destination = File.Create(archive)) source.CopyTo(destination);
            }

            ZipFile.ExtractToDirectory(archive, work);
            File.Delete(archive);
            string app = Path.Combine(work, "DBridge-Portable");
            string runtime = Path.Combine(app, "node.exe");
            string server = Path.Combine(app, "server.mjs");
            if (!File.Exists(runtime) || !File.Exists(server)) throw new FileNotFoundException("The portable runtime could not be unpacked.");
            string data = SelectDataDirectory();

            ProcessStartInfo start = new ProcessStartInfo
            {
                FileName = runtime,
                Arguments = "\"" + server + "\"",
                WorkingDirectory = app,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Normal
            };
            start.EnvironmentVariables["DBRIDGE_DATA_DIR"] = data;
            using (Process process = Process.Start(start))
            {
                if (process == null) throw new InvalidOperationException("The local DBridge service did not start.");
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "DBridge could not start.\n\n" + error.Message + "\n\nTry the ZIP edition if company security blocks portable executables.",
                "DBridge Advanced Portable",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            for (int attempt = 0; attempt < 4; attempt++)
            {
                try
                {
                    if (Directory.Exists(work)) Directory.Delete(work, true);
                    break;
                }
                catch
                {
                    Thread.Sleep(500);
                }
            }
        }
    }
}
