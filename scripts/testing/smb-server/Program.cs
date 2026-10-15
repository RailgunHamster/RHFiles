using System.Net;
using SMBLibrary;
using SMBLibrary.Server;
using SMBLibrary.Win32;
using SMBLibrary.Authentication.GSSAPI;
using SMBLibrary.Authentication.NTLM;

var root = Path.GetFullPath(args[0]);
if (!Directory.Exists(root) || !root.Split(Path.DirectorySeparatorChar).Contains("test-artifacts", StringComparer.OrdinalIgnoreCase))
    throw new ArgumentException("Only a dedicated test-artifacts directory may be served");
var share = new FileSystemShare("QA", new NTDirectoryFileSystem(root));
share.AccessRequested += (_, request) => request.Allow = request.RequestedAccess == FileAccess.Read;
var shares = new SMBShareCollection(); shares.Add(share);
// Synthetic fixture account only. No Windows accounts or SMB services changed.
var security = new GSSProvider(new IndependentNTLMAuthenticationProvider(user => user == "qa" ? "qa-pass" : user == "Guest" ? "" : null));
var server = new FixtureServer(shares, security);
server.LogEntryAdded += (_, entry) => Console.WriteLine($"{entry.Severity}: {entry.Message}");
server.StartLoopback(1445);
Console.WriteLine("Read-only SMB2 fixture: 127.0.0.1:1445/QA");
Console.CancelKeyPress += (_, e) => { server.Stop(); Environment.Exit(0); };
await Task.Delay(Timeout.Infinite);

class FixtureServer(SMBShareCollection shares, GSSProvider security) : SMBServer(shares, security)
{
    public void StartLoopback(int port) => Start(IPAddress.Loopback, SMBTransportType.DirectTCPTransport, port, false, true, false, null);
}
