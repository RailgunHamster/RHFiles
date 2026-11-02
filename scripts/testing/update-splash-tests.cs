// Disposable, synthetic windows only. Compiled alongside the actual helper source.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
internal static class SplashTests
{
    static readonly BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static object Invoke(object form, string name, params object[] args)
    { return form.GetType().GetMethod(name, Private).Invoke(form,args); }
    static Process Spawn(string file, string args)
    { return Process.Start(new ProcessStartInfo(file,args){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(file)}); }
    static void Stop(Process p) { if(p==null)return; try { if(!p.HasExited)p.Kill();p.WaitForExit(5000); }finally{p.Dispose();} }
    static void Wait(Func<bool> condition, string message)
    { var timer=Stopwatch.StartNew();while(timer.ElapsedMilliseconds<10000){Application.DoEvents();if(condition())return;Thread.Sleep(40);}throw new Exception(message); }
    [STAThread] static int Main(string[] args)
    {
        if(args.Length>0 && args[0]=="--window")
        { Application.Run(new Form {Text="RHFiles synthetic splash test",Width=300,Height=100});return 0; }
        if(args.Length>0 && args[0]=="--exit") {Thread.Sleep(1500);return 7;}
        try
        {
            Application.EnableVisualStyles();
            var parsed=SplashConfig.Parse(new[]{"--timeout-ms","0","--language","en","--mode","portable"});
            Check(parsed.TimeoutMs==1000&&parsed.Language=="en"&&parsed.Mode=="portable","Configuration bounds");
            string home=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string root=Directory.GetParent(home).FullName;
            string me=Assembly.GetExecutingAssembly().Location;
            string other=Path.Combine(root,"other installation");Directory.CreateDirectory(other);
            string wrong=Path.Combine(other,Path.GetFileName(me));File.Copy(me,wrong,true);
            Process wrongProcess=null,rightProcess=null,updateProcess=null;
            try
            {
                wrongProcess=Spawn(wrong,"--window");
                Wait(()=>{wrongProcess.Refresh();return wrongProcess.MainWindowHandle!=IntPtr.Zero;},"Wrong fixture window missing");
                using(var form=new RHFilesSplashForm(new SplashConfig {RootDir=root,MainExe=Path.GetFileName(me),Language="en",ReadyFile=Path.Combine(root,"ready")}))
                {
                    form.Show();Application.DoEvents();
                    Check(File.ReadAllText(Path.Combine(root,"ready"))=="ready","Readiness handshake");
                    Check((IntPtr)Invoke(form,"FindNewMainWindow")==IntPtr.Zero,"Must ignore other installations and existing process");
                    rightProcess=Spawn(me,"--window");
                    Wait(()=>(IntPtr)Invoke(form,"FindNewMainWindow")!=IntPtr.Zero,"Must find the new window from this installation");
                    form.Close();
                }
                Stop(rightProcess);rightProcess=null;
                string update=Path.Combine(root,"Update.exe");File.Copy(me,update,true);
                using(var form=new RHFilesSplashForm(new SplashConfig {RootDir=root,MainExe=Path.GetFileName(me),Language="en"}))
                {
                    form.Show();Application.DoEvents();updateProcess=Spawn(update,"--exit");
                    Invoke(form,"ObserveUpdater");
                    Check(form.GetType().GetField("updater",Private).GetValue(form)!=null,"Track this installation's updater");
                    updateProcess.WaitForExit();Invoke(form,"OnProbeTick",new object[]{null,EventArgs.Empty});
                    Check(((string)form.GetType().GetField("failure",Private).GetValue(form)).Contains("7"),"Nonzero exit must be a visible failure, not success");
                    Check(form.Visible,"Failure remains visible until dismissed");form.Close();
                }
                foreach(string theme in new[]{"light","dark","sand","mist","forest","slate"})
                {
                    foreach(string lang in new[]{"zh","en"})
                    using(var form=new RHFilesSplashForm(new SplashConfig {Theme=theme,Language=lang,FromVersion="0.1.98",ToVersion="0.1.99",DemoMs=1000,LogoPath=args.Length>0?args[0]:""}))
                    { form.Show();Application.DoEvents();Invoke(form,"SaveSnapshot",Path.Combine(root,theme+"-"+lang+".png"));form.Close(); }
                }
                using(var form=new RHFilesSplashForm(new SplashConfig {Theme="dark",CustomBg="#123456",CustomText="#ffffff",CustomAccent="#ff9500",Language="en",TimeoutMs=1000}))
                {
                    form.Show();Application.DoEvents();Thread.Sleep(1100);Invoke(form,"OnProbeTick",new object[]{null,EventArgs.Empty});
                    Check(form.Visible && form.GetType().GetField("failure",Private).GetValue(form)!=null,"Timeout remains explicit and is not treated as success");form.Close();
                }
                Console.WriteLine("PASS: ready handshake, exact installation/new-process matching, updater failure, timeout, 12 theme/locale renders");
            }
            finally {Stop(wrongProcess);Stop(rightProcess);Stop(updateProcess);}
            return 0;
        }
        catch(Exception ex) {Console.Error.WriteLine(ex);return 1;}
    }
}
