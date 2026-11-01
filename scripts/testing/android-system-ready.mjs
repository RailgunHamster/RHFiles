// sys.boot_completed may be stale while system_server is still restarting.
// PackageManager alone is also published before the Settings provider is ready.
export function androidSystemReady({boot,framework,settings,window,user}){
  return boot.trim()==='1'&&/^package:\/[^\r\n]+\.apk$/.test(framework.trim())&&
    settings.trim()==='1'&&window.trim()==='Service window: found'&&/^\d+$/.test(user.trim());
}
