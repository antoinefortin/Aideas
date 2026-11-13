using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace AudioDock;

public sealed class Job : INotifyPropertyChanged
{
    public string Url { get; init; } = "";
    private string status = "En attente", current = "";
    public string Status { get => status; set { status = value; Changed(nameof(Status)); } }
    public string Current { get => current; set { current = value; Changed(nameof(Current)); } }
    public event PropertyChangedEventHandler? PropertyChanged;
    private void Changed(string name) => PropertyChanged?.Invoke(this, new(name));
}

public partial class MainWindow : Window
{
    private readonly ObservableCollection<Job> jobs = new();
    private static readonly string Data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AudioDock");
    private static readonly string Tools = Path.Combine(Data, "tools");
    private static readonly string Settings = Path.Combine(Data, "settings.json");
    private CancellationTokenSource? cancellation;
    private bool busy;
    private sealed record Preferences(string Output, int Quality, bool Artwork, bool Archive, string[] Queue, bool DirectOutput = true);

    public MainWindow()
    {
        InitializeComponent();
        QueueList.ItemsSource = jobs;
        OutputPath.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyMusic), "AudioDock");
        try
        {
            if (File.Exists(Settings) && JsonSerializer.Deserialize<Preferences>(File.ReadAllText(Settings)) is { } p)
            {
                OutputPath.Text = p.Output; Quality.SelectedIndex = Math.Clamp(p.Quality, 0, 3);
                Artwork.IsChecked = p.Artwork; Archive.IsChecked = p.Archive;
                DirectOutput.IsChecked = p.DirectOutput;
                foreach (var url in p.Queue.Where(ValidUrl)) jobs.Add(new Job { Url = url });
            }
        }
        catch (Exception ex) { Log("Paramètres non chargés : " + ex.Message); }
    }

    internal static bool ValidUrl(string text) => Uri.TryCreate(text, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && uri.UserInfo.Length == 0 && uri.IsDefaultPort
        && (uri.Host.Equals("youtu.be", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("youtube.com", StringComparison.OrdinalIgnoreCase)
            || uri.Host.EndsWith(".youtube.com", StringComparison.OrdinalIgnoreCase));

    private void Log(string line)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(() => Log(line)); return; }
        // Keep the UI responsive even during very large channel exports.
        if (LogBox.Text.Length > 30000) LogBox.Text = LogBox.Text[^15000..];
        LogBox.AppendText(line + Environment.NewLine); LogBox.ScrollToEnd();
    }
    private void Save()
    {
        Directory.CreateDirectory(Data);
        var p = new Preferences(OutputPath.Text, Quality.SelectedIndex, Artwork.IsChecked == true,
            Archive.IsChecked == true, jobs.Where(j => j.Status != "Terminé").Select(j => j.Url).ToArray(), DirectOutput.IsChecked == true);
        File.WriteAllText(Settings + ".tmp", JsonSerializer.Serialize(p));
        File.Move(Settings + ".tmp", Settings, true);
    }
    private void AddClick(object sender, RoutedEventArgs e)
    {
        var lines = Urls.Text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).ToArray();
        var invalid = lines.Where(s => !ValidUrl(s)).ToArray();
        if (invalid.Length > 0) { MessageBox.Show("Utilisez une URL HTTPS YouTube valide par ligne.\n\n" + string.Join("\n", invalid.Take(5)), "Liens invalides"); return; }
        foreach (var url in lines.Distinct()) if (!jobs.Any(j => j.Url == url && j.Status != "Terminé")) jobs.Add(new Job { Url = url });
        Urls.Clear(); TrySave();
    }
    private void TrySave() { try { Save(); } catch (Exception ex) { Log("Sauvegarde : " + ex.Message); } }
    private void DestinationLostFocus(object sender, RoutedEventArgs e) => TrySave();
    internal static string NormalizeDestination(string text)
    {
        var path = Environment.ExpandEnvironmentVariables(text.Trim().Trim('"'));
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path))
            throw new ArgumentException("Saisissez un chemin complet, par exemple D:\\Musique\\Mes MP3, ou choisissez un dossier avec Parcourir.");
        return Path.GetFullPath(path);
    }
    internal static string OutputTemplate(bool direct) => direct
        ? "%(title)s [%(id)s].%(ext)s"
        : "%(uploader|Unknown)s/%(playlist_title|Singles)s/%(title)s [%(id)s].%(ext)s";
    private void BrowseClick(object sender, RoutedEventArgs e)
    {
        var picker = new OpenFolderDialog { Title = "Dossier de destination", Multiselect = false };
        if (picker.ShowDialog() == true) { OutputPath.Text = picker.FolderName; TrySave(); }
    }
    private void RemoveClick(object sender, RoutedEventArgs e)
    {
        if (!busy && QueueList.SelectedItem is Job job) { jobs.Remove(job); TrySave(); }
    }
    private void OpenClick(object sender, RoutedEventArgs e)
    {
        try { var path = NormalizeDestination(OutputPath.Text); Directory.CreateDirectory(path); OutputPath.Text = path; Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Dossier inaccessible"); }
    }
    private void SetBusy(bool value, bool installing = false)
    {
        busy = value; StartButton.IsEnabled = InstallButton.IsEnabled = RemoveButton.IsEnabled = !value;
        StopButton.IsEnabled = value; Quality.IsEnabled = Artwork.IsEnabled = Archive.IsEnabled = !value;
        OutputPath.IsEnabled = BrowseButton.IsEnabled = DirectOutput.IsEnabled = !value;
        Footer.Text = value ? installing ? "Installation des outils en cours…" : "Export en cours • Les liens ajoutés rejoignent la file." : "Prêt • Votre file et vos préférences sont sauvegardées.";
    }
    private void StopClick(object sender, RoutedEventArgs e) => cancellation?.Cancel();

    private async void StartClick(object sender, RoutedEventArgs e)
    {
        if (busy) return;
        if (!File.Exists(Path.Combine(Tools, "yt-dlp.exe")) || !File.Exists(Path.Combine(Tools, "ffmpeg.exe")) || !File.Exists(Path.Combine(Tools, "ffprobe.exe")) || !File.Exists(Path.Combine(Tools, "deno.exe")))
        { MessageBox.Show("Cliquez d’abord sur « Installer / mettre à jour les outils ». Une connexion Internet est nécessaire.", "Installation requise"); return; }
        if (!jobs.Any(j => j.Status != "Terminé")) { MessageBox.Show("Ajoutez des liens à la file."); return; }
        string output;
        try { output = NormalizeDestination(OutputPath.Text); OutputPath.Text = output; }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Dossier de destination invalide"); return; }
        var template = OutputTemplate(DirectOutput.IsChecked == true);
        var quality = ((ComboBoxItem)Quality.SelectedItem).Tag.ToString()!;
        var artwork = Artwork.IsChecked == true; var archive = Archive.IsChecked == true;
        using var cts = new CancellationTokenSource(); cancellation = cts; SetBusy(true);
        try
        {
            Directory.CreateDirectory(output);
            var pending = jobs.Where(j => j.Status != "Terminé").ToList();
            foreach (var job in pending) job.Status = "En attente";
            // One process per source keeps the archive serialized and allows new sources to join the batch.
            while (jobs.FirstOrDefault(j => j.Status == "En attente") is { } job)
            {
                cts.Token.ThrowIfCancellationRequested(); job.Status = "Connexion…";
                try
                {
                    var args = new List<string> { "--ignore-config", "--no-colors", "--newline", "--progress", "--yes-playlist", "--continue", "--no-overwrites",
                        "--windows-filenames", "--trim-filenames", "180", "--retries", "5", "--fragment-retries", "5",
                        "--match-filters", "!is_live", "--format", "bestaudio/best", "--extract-audio", "--audio-format", "mp3", "--audio-quality", quality,
                        "--embed-metadata", "--ffmpeg-location", Tools, "--js-runtimes", "deno:" + Path.Combine(Tools, "deno.exe"),
                        "--paths", output, "--output", template,
                        "--print", "before_dl:AD_TITLE:%(title)s", "--print", "after_move:AD_DONE:%(filepath)s",
                        "--no-simulate", "--progress-template", "download:AD_PROGRESS:%(progress._percent_str)s | %(progress._speed_str)s | ETA %(progress._eta_str)s" };
                    if (artwork) args.AddRange(new[] { "--embed-thumbnail", "--convert-thumbnails", "jpg" });
                    if (archive) args.AddRange(new[] { "--download-archive", Path.Combine(output, ".audiodock-archive.txt") });
                    args.Add("--"); args.Add(job.Url);
                    bool errors = false;
                    var code = await RunAsync(Path.Combine(Tools, "yt-dlp.exe"), args, line => Dispatcher.Invoke(() =>
                    {
                        if (line.StartsWith("AD_TITLE:")) { job.Current = line[9..]; job.Status = "Téléchargement…"; }
                        else if (line.StartsWith("AD_PROGRESS:")) job.Status = line[12..].Trim();
                        else if (line.StartsWith("AD_DONE:")) { job.Status = "MP3 enregistré"; Log(line[8..]); }
                        else { if (line.Contains("ERROR:")) errors = true; if (line.StartsWith("[ExtractAudio]")) job.Status = "Conversion MP3…"; Log(line); }
                    }), cts.Token);
                    job.Status = code == 0 && !errors ? "Terminé" : "Erreur / partiellement exporté";
                }
                catch (OperationCanceledException) { job.Status = "Arrêté — reprise possible"; throw; }
                catch (Exception ex) { job.Status = "Erreur"; Log(ex.Message); }
                TrySave();
            }
        }
        catch (OperationCanceledException) { Log("Export arrêté. Démarrer reprend les sources incomplètes."); }
        catch (Exception ex) { Log(ex.Message); MessageBox.Show(ex.Message, "Export impossible"); }
        finally { cancellation = null; SetBusy(false); TrySave(); }
    }

    private static async Task<int> RunAsync(string exe, IEnumerable<string> args, Action<string> onLine, CancellationToken token)
    {
        var info = new ProcessStartInfo(exe) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8, StandardErrorEncoding = System.Text.Encoding.UTF8 };
        info.Environment["PYTHONIOENCODING"] = "utf-8";
        foreach (var arg in args) info.ArgumentList.Add(arg);
        using var process = new Process { StartInfo = info };
        token.ThrowIfCancellationRequested(); process.Start();
        using var registration = token.Register(() => { try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { } });
        async Task Pump(StreamReader reader) { while (await reader.ReadLineAsync() is { } line) onLine(line); }
        await Task.WhenAll(Pump(process.StandardOutput), Pump(process.StandardError), process.WaitForExitAsync());
        token.ThrowIfCancellationRequested(); return process.ExitCode;
    }

    private async void InstallClick(object sender, RoutedEventArgs e)
    {
        if (busy) return;
        using var cts = new CancellationTokenSource(); cancellation = cts; SetBusy(true, true);
        var stage = Path.Combine(Data, "install-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(stage); Directory.CreateDirectory(Tools);
            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("AudioDock/1.0");
            async Task Download(string url, string file)
            {
                Log("Téléchargement : " + Path.GetFileName(file));
                using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cts.Token);
                response.EnsureSuccessStatusCode();
                await using var stream = await response.Content.ReadAsStreamAsync(cts.Token);
                await using var target = File.Create(file); await stream.CopyToAsync(target, cts.Token);
            }
            await Download("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", Path.Combine(stage, "yt-dlp.exe"));
            await Download("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", Path.Combine(stage, "ffmpeg.zip"));
            await Download("https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip", Path.Combine(stage, "deno.zip"));
            foreach (var zipName in new[] { "ffmpeg.zip", "deno.zip" })
            {
                using var zip = ZipFile.OpenRead(Path.Combine(stage, zipName));
                foreach (var name in zipName == "ffmpeg.zip" ? new[] { "ffmpeg.exe", "ffprobe.exe" } : new[] { "deno.exe" })
                {
                    cts.Token.ThrowIfCancellationRequested();
                    var entry = zip.Entries.Single(e2 => e2.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
                    await using var source = entry.Open(); await using var target = File.Create(Path.Combine(stage, name));
                    await source.CopyToAsync(target, cts.Token);
                }
            }
            foreach (var name in new[] { "yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe", "deno.exe" })
            {
                var flag = name.StartsWith("ff") ? "-version" : "--version";
                if (await RunAsync(Path.Combine(stage, name), new[] { flag }, Log, cts.Token) != 0) throw new IOException("Outil invalide : " + name);
            }
            cts.Token.ThrowIfCancellationRequested();
            foreach (var name in new[] { "yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe", "deno.exe" }) File.Move(Path.Combine(stage, name), Path.Combine(Tools, name), true);
            Log("Outils installés. Vous pouvez démarrer l’export.");
        }
        catch (OperationCanceledException) { Log("Installation annulée."); }
        catch (Exception ex) { Log(ex.Message); MessageBox.Show(ex.Message, "Installation impossible — réessayez"); }
        finally
        {
            try { if (Directory.Exists(stage)) Directory.Delete(stage, true); } catch (IOException) { }
            cancellation = null; SetBusy(false);
        }
    }
    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (busy) { e.Cancel = true; cancellation?.Cancel(); Log("Arrêt demandé. Fermez la fenêtre une fois l’opération arrêtée."); }
        else TrySave();
    }
}
