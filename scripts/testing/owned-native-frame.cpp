// Test-only observation, guarded input/close and bounded owned main-client size.
// No hooks, foreign/desktop capture, or production diagnostic API.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <tlhelp32.h>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

static_assert(sizeof(BITMAPFILEHEADER)==14 && sizeof(BITMAPINFOHEADER)==40);
struct Handle { HANDLE value=INVALID_HANDLE_VALUE; explicit Handle(HANDLE v):value(v){} ~Handle(){if(value&&value!=INVALID_HANDLE_VALUE)CloseHandle(value);} };
static void require(bool value,const char* message){if(!value)throw std::runtime_error(message);}
static DWORD parent_of(DWORD id){
  Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0));
  require(snapshot.value!=INVALID_HANDLE_VALUE,"Cannot enumerate owned process identity");
  PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);
  for(BOOL ok=Process32FirstW(snapshot.value,&entry);ok;ok=Process32NextW(snapshot.value,&entry))if(entry.th32ProcessID==id)return entry.th32ParentProcessID;
  return 0;
}
static uint64_t created(HANDLE process){FILETIME start{},end{},kernel{},user{};require(GetProcessTimes(process,&start,&end,&kernel,&user),"Cannot verify process lifetime");return(uint64_t(start.dwHighDateTime)<<32)|start.dwLowDateTime;}
static uint64_t unix_millis(){FILETIME value{};GetSystemTimePreciseAsFileTime(&value);return(((uint64_t(value.dwHighDateTime)<<32)|value.dwLowDateTime)-116444736000000000ULL)/10000;}
static std::wstring full_path(const std::wstring& value){std::vector<wchar_t> result(32768);DWORD length=GetFullPathNameW(value.c_str(),DWORD(result.size()),result.data(),nullptr);require(length>0&&length<result.size(),"Invalid owned executable path");return{result.data(),length};}
static uint64_t verify_process(DWORD id,const std::wstring& expected){
  const DWORD parent=parent_of(GetCurrentProcessId());
  require(parent>0&&id!=GetCurrentProcessId()&&parent_of(id)==parent,"Capture target is not a sibling owned by the fixture");
  Handle owner(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,parent));
  Handle target(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,id));
  require(owner.value&&target.value,"Cannot query owned process identity");
  require(created(target.value)>=created(owner.value),"Capture target predates its claimed fixture");
  std::vector<wchar_t> image(32768);DWORD length=DWORD(image.size());
  require(QueryFullProcessImageNameW(target.value,0,image.data(),&length),"Cannot verify owned executable");
  const auto actual=full_path({image.data(),length}),requested=full_path(expected);
  require(_wcsicmp(actual.c_str(),requested.c_str())==0,"Owned executable identity mismatch");
  const auto separator=actual.find_last_of(L"\\/");
  require(_wcsicmp(actual.substr(separator==std::wstring::npos?0:separator+1).c_str(),L"rhfiles.exe")==0,"Only an owned RHFiles process may be observed");
  return created(target.value);
}
struct Windows {DWORD pid;std::vector<HWND> surfaces;bool presentation=false;};
static BOOL CALLBACK child_window(HWND window,LPARAM data){
  auto& state=*reinterpret_cast<Windows*>(data);DWORD process=0;GetWindowThreadProcessId(window,&process);
  wchar_t name[128]{};GetClassNameW(window,name,128);
  if(process==state.pid&&IsWindowVisible(window)&&std::wcscmp(name,L"RHFilesNativeVideoSurface")==0)state.surfaces.push_back(window);
  return TRUE;
}
static BOOL CALLBACK top_window(HWND window,LPARAM data){
  auto& state=*reinterpret_cast<Windows*>(data);DWORD process=0;GetWindowThreadProcessId(window,&process);
  if(process!=state.pid||!IsWindowVisible(window)||IsIconic(window))return TRUE;
  wchar_t caption[2048]{};GetWindowTextW(window,caption,2048);
  const std::wstring title(caption),suffix=L" \u00b7 RHFiles";
  // Player captions have this suffix. Presentation scope admits only the
  // exact library caption, never a grid or arbitrary process window.
  const bool matches=state.presentation?title==L"RHFiles \u00b7 RHVideo":title.size()>=suffix.size()&&title.compare(title.size()-suffix.size(),suffix.size(),suffix)==0;
  if(matches)EnumChildWindows(window,child_window,data);
  return TRUE;
}
static void owned_surface(HWND window,DWORD pid){DWORD process=0;GetWindowThreadProcessId(window,&process);wchar_t name[128]{};GetClassNameW(window,name,128);require(process==pid&&IsWindowVisible(window)&&std::wcscmp(name,L"RHFilesNativeVideoSurface")==0,"Owned video surface changed");}
static BYTE presentation_alpha(HWND window){
  require((GetWindowLongPtrW(window,GWL_EXSTYLE)&WS_EX_LAYERED)!=0,"Owned presentation is not a layered surface");
  COLORREF color{};BYTE alpha{};DWORD flags{};
  require(GetLayeredWindowAttributes(window,&color,&alpha,&flags)&&(flags&LWA_ALPHA),"Cannot observe owned presentation alpha");
  return alpha;
}
struct OwnedWindows {DWORD pid;HWND main{},library{};bool ambiguous=false;};
static BOOL CALLBACK owned_window(HWND window,LPARAM data){
  auto& state=*reinterpret_cast<OwnedWindows*>(data);DWORD process=0;GetWindowThreadProcessId(window,&process);
  if(process!=state.pid||!IsWindowVisible(window))return TRUE;
  wchar_t caption[2048]{};GetWindowTextW(window,caption,2048);
  if(std::wcscmp(caption,L"RHFiles")==0){state.ambiguous|=state.main!=nullptr;state.main=window;}
  if(std::wcscmp(caption,L"RHFiles \u00b7 RHVideo")==0){state.ambiguous|=state.library!=nullptr;state.library=window;}
  return TRUE;
}
static void owned_main(HWND window,DWORD pid){
  DWORD process=0;GetWindowThreadProcessId(window,&process);wchar_t caption[2048]{};GetWindowTextW(window,caption,2048);
  require(IsWindow(window)&&process==pid&&GetAncestor(window,GA_ROOT)==window&&IsWindowVisible(window)&&!IsIconic(window)&&std::wcscmp(caption,L"RHFiles")==0,"Owned main client changed");
}
static GUITHREADINFO thread_info(HWND window){GUITHREADINFO info{};info.cbSize=sizeof(info);require(GetGUIThreadInfo(GetWindowThreadProcessId(window,nullptr),&info),"Cannot query owned input focus");return info;}
static bool input_focus(HWND window,const GUITHREADINFO& info){return info.hwndFocus==window||IsChild(window,info.hwndFocus);}
// Only classify the verified sibling's own focus target. No foreign handles,
// captions, URLs or child-tree enumeration leave this observer.
static const char* focus_kind(HWND window,const GUITHREADINFO& info){
  if(info.hwndFocus==window)return "owned-root";
  if(!IsChild(window,info.hwndFocus))return "none";
  DWORD owner=0;GetWindowThreadProcessId(info.hwndFocus,&owner);DWORD expected=0;GetWindowThreadProcessId(window,&expected);
  if(owner!=expected)return "embedded-process-child";
  wchar_t name[128]{};GetClassNameW(info.hwndFocus,name,128);
  if(std::wcscmp(name,L"Chrome_RenderWidgetHostHWND")==0)return "webview-renderer";
  if(std::wcscmp(name,L"Chrome_WidgetWin_0")==0||std::wcscmp(name,L"Chrome_WidgetWin_1")==0)return "webview-widget";
  if(std::wcscmp(name,L"RHFilesNativeVideoSurface")==0)return "native-video";
  return "other-owned-child";
}
static int dimension(const wchar_t* raw,int minimum,int maximum){
  const std::wstring value(raw);require(!value.empty()&&value.size()<=4&&std::all_of(value.begin(),value.end(),[](wchar_t c){return c>=L'0'&&c<=L'9';}),"Invalid owned client dimension");
  const int result=std::stoi(value);require(result>=minimum&&result<=maximum,"Owned client dimension outside bounds");return result;
}
static void window_command(int argc,wchar_t** argv,DWORD pid,uint64_t process_created){
  const std::wstring command(argv[3]);
  if(command==L"player-close"){
    require(argc==4,"Player close accepts no path, key, handle or window selector");
    const auto started=GetTickCount64();HWND target{};
    do{
      Windows found{pid,{}};require(EnumWindows(top_window,reinterpret_cast<LPARAM>(&found)),"Cannot enumerate owned player");
      require(found.surfaces.size()<=1,"Ambiguous owned player surfaces");
      if(!found.surfaces.empty()){owned_surface(found.surfaces.front(),pid);target=GetAncestor(found.surfaces.front(),GA_ROOT);break;}
      Sleep(10);
    }while(GetTickCount64()-started<3000);
    require(target,"No visible owned player surface is present");DWORD process=0;GetWindowThreadProcessId(target,&process);
    require(process==pid&&IsWindow(target)&&IsWindowVisible(target),"Owned player root changed");
    // The full path/parent admission already ran. Recheck its SAME process
    // lifetime, not a second expensive system-wide process enumeration which
    // can turn a preparation-close test into a post-start close.
    Handle current(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid));require(current.value&&created(current.value)==process_created,"Owned player process lifetime changed");
    const auto at=unix_millis();require(PostMessageW(target,WM_CLOSE,0,0),"Cannot submit owned player close");
    const auto wait=GetTickCount64();while(IsWindow(target)&&GetTickCount64()-wait<1000)Sleep(1);
    const bool destroyed=!IsWindow(target);const auto end=unix_millis();
    std::printf("{\"protocol\":1,\"scope\":\"owned-sibling-windows\",\"pid\":%lu,\"target\":\"single-player\",\"transport\":\"win32-wm-close\",\"submitted\":true,\"observedAtMs\":%llu,\"destroyed\":%s,\"checkedAtMs\":%llu}\n",static_cast<unsigned long>(pid),static_cast<unsigned long long>(at),destroyed?"true":"false",static_cast<unsigned long long>(end));return;
  }
  require(((command==L"windows"||command==L"library-ping"||command==L"activate-main")&&argc==4)||((command==L"library-key"||command==L"main-client-size")&&argc==6),"Unsupported owned window command");
  WORD key=0;bool scan_mode=false;
  if(command==L"library-key"){
    const std::wstring name(argv[4]),encoding(argv[5]);
    require(name==L"Home"||name==L"End","Only Home/End may be submitted");key=name==L"Home"?VK_HOME:VK_END;
    require(encoding==L"virtual-key"||encoding==L"scan-code","Invalid key encoding");scan_mode=encoding==L"scan-code";
  }
  OwnedWindows owned{pid};require(EnumWindows(owned_window,reinterpret_cast<LPARAM>(&owned)),"Cannot enumerate owned input windows");require(!owned.ambiguous,"Ambiguous owned input window");
  if(command==L"main-client-size"){
    const int width=dimension(argv[4],700,1920),height=dimension(argv[5],450,1080);require(owned.main,"Owned main window is not open");owned_main(owned.main,pid);require(!IsZoomed(owned.main),"Owned main window must not be maximized");
    require(SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)!=FALSE,"Cannot establish physical client dimensions");
    RECT client{},outer{};require(GetClientRect(owned.main,&client)&&GetWindowRect(owned.main,&outer),"Cannot inspect owned main size");
    const int border_width=outer.right-outer.left-client.right,border_height=outer.bottom-outer.top-client.bottom;require(border_width>=0&&border_width<=128&&border_height>=0&&border_height<=256,"Unexpected owned window borders");
    Handle current(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,FALSE,pid));require(current.value&&created(current.value)==process_created,"Owned main process lifetime changed");
    // Resize only this exact sibling main window. No activation, moving,
    // arbitrary HWND, style changes, message loop or repeat submission.
    require(SetWindowPos(owned.main,nullptr,0,0,width+border_width,height+border_height,SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE|SWP_ASYNCWINDOWPOS),"Cannot size owned main client");
    const auto started=GetTickCount64();bool applied=false;
    do{owned_main(owned.main,pid);require(GetClientRect(owned.main,&client),"Cannot verify owned client size");applied=client.right==width&&client.bottom==height;if(applied)break;Sleep(5);}while(GetTickCount64()-started<1000);
    require(applied,"Owned client did not reach its requested size");verify_process(pid,argv[2]);
    std::printf("{\"protocol\":1,\"scope\":\"owned-sibling-windows\",\"pid\":%lu,\"target\":\"main-client\",\"transport\":\"win32-client-size\",\"width\":%d,\"height\":%d,\"applied\":true,\"observedAtMs\":%llu}\n",static_cast<unsigned long>(pid),width,height,static_cast<unsigned long long>(unix_millis()));return;
  }
  if(command==L"library-ping"){
    require(owned.library,"Owned library is not open");
    const auto observed=unix_millis(),started=GetTickCount64();DWORD_PTR result{};SetLastError(0);
    const bool responded=SendMessageTimeoutW(owned.library,WM_NULL,0,0,SMTO_ABORTIFHUNG|SMTO_BLOCK,100,&result)!=0;
    const DWORD error=responded?0:GetLastError();const auto elapsed=GetTickCount64()-started;
    std::printf("{\"protocol\":1,\"scope\":\"owned-sibling-windows\",\"pid\":%lu,\"observedAtMs\":%llu,\"responded\":%s,\"elapsedMs\":%llu,\"win32Error\":%lu}\n",static_cast<unsigned long>(pid),static_cast<unsigned long long>(observed),responded?"true":"false",static_cast<unsigned long long>(elapsed),static_cast<unsigned long>(error));return;
  }
  if(command==L"windows"){
    std::printf("{\"protocol\":1,\"scope\":\"owned-sibling-windows\",\"pid\":%lu,\"windows\":[",static_cast<unsigned long>(pid));
    bool first=true;for(const auto& row:std::vector<std::pair<const char*,HWND>>{{"main",owned.main},{"window-rhvideo",owned.library}}){if(!row.second)continue;const auto info=thread_info(row.second);const bool focus=input_focus(row.second,info);std::printf("%s{\"label\":\"%s\",\"foreground\":%s,\"active\":%s,\"inputFocus\":%s,\"focusKind\":\"%s\",\"focusEnabled\":%s,\"focusVisible\":%s}",first?"":",",row.first,GetForegroundWindow()==row.second?"true":"false",info.hwndActive==row.second?"true":"false",focus?"true":"false",focus_kind(row.second,info),focus&&IsWindowEnabled(info.hwndFocus)?"true":"false",focus&&IsWindowVisible(info.hwndFocus)?"true":"false");first=false;}
    std::puts("]}");return;
  }
  if(command==L"activate-main"){
    DWORD foreground_pid=0;GetWindowThreadProcessId(GetForegroundWindow(),&foreground_pid);
    require(foreground_pid==pid,"Owned application is not foreground; no window was activated");require(owned.main,"Owned main window is not open");
    require(SetForegroundWindow(owned.main),"Cannot activate owned main window");
    std::printf("{\"protocol\":1,\"scope\":\"owned-sibling-windows\",\"pid\":%lu,\"focused\":\"main\"}\n",static_cast<unsigned long>(pid));return;
  }
  require(owned.library,"Owned library is not open");
  const auto info=thread_info(owned.library);
  // No activation or AttachThreadInput: keys go only to an ALREADY focused
  // sibling library, never whichever application happens to be foreground.
  require(GetForegroundWindow()==owned.library&&input_focus(owned.library,info),"Library does not own real input focus");
  for(const int modifier:{VK_CONTROL,VK_SHIFT,VK_MENU,VK_LWIN,VK_RWIN})require(GetAsyncKeyState(modifier)>=0,"A modifier key is held; no key submitted");
  WORD scan=0;DWORD flags=KEYEVENTF_EXTENDEDKEY;
  if(scan_mode){scan=WORD(MapVirtualKeyW(key,MAPVK_VK_TO_VSC_EX)&0xff);require(scan!=0,"No navigation scan code");flags|=KEYEVENTF_SCANCODE;}
  INPUT events[2]{};for(auto& event:events){event.type=INPUT_KEYBOARD;event.ki.wVk=scan_mode?0:key;event.ki.wScan=scan;event.ki.dwFlags=flags;}events[1].ki.dwFlags|=KEYEVENTF_KEYUP;
  const UINT sent=SendInput(2,events,sizeof(INPUT));if(sent==1)SendInput(1,events+1,sizeof(INPUT));require(sent==2,"Windows did not accept both events; not repeated");
  std::printf("{\"protocol\":1,\"scope\":\"owned-sibling-windows\",\"pid\":%lu,\"sent\":2,\"key\":\"%s\",\"transport\":\"windows-send-input\",\"encoding\":\"%s\"}\n",static_cast<unsigned long>(pid),key==VK_HOME?"Home":"End",scan_mode?"scan-code":"virtual-key");
}
struct Canvas {
  HWND window{};HDC source{},target{};HBITMAP bitmap{};HGDIOBJ old{};
  ~Canvas(){if(old&&target)SelectObject(target,old);if(bitmap)DeleteObject(bitmap);if(target)DeleteDC(target);if(source)ReleaseDC(window,source);}
};
static void write_all(HANDLE file,const void* data,DWORD length){DWORD written=0;require(WriteFile(file,data,length,&written,nullptr)&&written==length,"Cannot write owned frame");}
int wmain(int argc,wchar_t** argv){
  std::wstring output;bool made_file=false;
  try{
    require(argc>=4&&argc<=6,"Use an owned PID, exact executable and a bounded observation command");
    const std::wstring digits(argv[1]);require(!digits.empty()&&digits.size()<=10&&std::all_of(digits.begin(),digits.end(),[](wchar_t c){return c>=L'0'&&c<=L'9';}),"Invalid owned PID");
    const auto value=std::stoull(digits);require(value>0&&value<=MAXDWORD,"Invalid owned PID");const DWORD pid=DWORD(value);
    const auto process_created=verify_process(pid,argv[2]);
    if(std::wstring(argv[3])==L"windows"||std::wstring(argv[3])==L"library-ping"||std::wstring(argv[3])==L"activate-main"||std::wstring(argv[3])==L"library-key"||std::wstring(argv[3])==L"player-close"||std::wstring(argv[3])==L"main-client-size"){window_command(argc,argv,pid,process_created);return 0;}
    require(argc==5||(argc==6&&(std::wstring(argv[5])==L"library-presentation"||std::wstring(argv[5])==L"main-client")),"Use PID, exact executable, owned basename, renderer and a fixed canvas scope");
    const bool presentation=argc==6&&std::wstring(argv[5])==L"library-presentation",main_client=argc==6&&std::wstring(argv[5])==L"main-client";
    output=argv[3];const std::wstring prefix=L"rhvideo-native-",suffix=L".bmp";
    require(output.size()==prefix.size()+32+suffix.size()&&output.compare(0,prefix.size(),prefix)==0&&output.compare(output.size()-suffix.size(),suffix.size(),suffix)==0,"Invalid owned frame basename");
    require(std::all_of(output.begin()+prefix.size(),output.end()-suffix.size(),[](wchar_t c){return(c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f');}),"Invalid owned frame identity");
    const std::wstring mode(argv[4]);require(mode==L"native-hardware-auto"||mode==L"gdi-compatibility","Unknown actual renderer");
    require(!main_client||mode==L"native-hardware-auto","Main client requires the full-content readback");
    verify_process(pid,argv[2]);SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    HWND window{};
    if(main_client){OwnedWindows owned{pid};require(EnumWindows(owned_window,reinterpret_cast<LPARAM>(&owned)),"Cannot enumerate owned main window");require(owned.main&&!owned.ambiguous,"Exactly one visible owned main client is required");window=owned.main;owned_main(window,pid);}
    else{Windows windows{pid,{},presentation};require(EnumWindows(top_window,reinterpret_cast<LPARAM>(&windows)),"Cannot enumerate owned windows");require(!windows.surfaces.empty(),"No visible owned player surface is present");require(windows.surfaces.size()==1,"Exactly one visible owned player surface is required");window=windows.surfaces.front();owned_surface(window,pid);}
    const BYTE alpha=presentation?presentation_alpha(window):255;
    RECT rectangle{};require(GetClientRect(window,&rectangle),"Cannot read owned client geometry");const int width=rectangle.right,height=rectangle.bottom;
    require(width>0&&height>0&&width<=4096&&height<=4096,"Owned frame exceeds geometry limits");
    Canvas canvas;canvas.window=window;canvas.source=GetDCEx(window,nullptr,DCX_CACHE);require(canvas.source!=nullptr,"Cannot open owned client DC");canvas.target=CreateCompatibleDC(canvas.source);require(canvas.target!=nullptr,"Cannot create owned frame DC");
    BITMAPINFO info{};info.bmiHeader.biSize=40;info.bmiHeader.biWidth=width;info.bmiHeader.biHeight=-height;info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
    void* bits=nullptr;canvas.bitmap=CreateDIBSection(canvas.target,&info,DIB_RGB_COLORS,&bits,nullptr,0);require(canvas.bitmap&&bits,"Cannot create owned pixels");canvas.old=SelectObject(canvas.target,canvas.bitmap);
    const BOOL drawn=mode==L"gdi-compatibility"?BitBlt(canvas.target,0,0,width,height,canvas.source,0,0,SRCCOPY):PrintWindow(window,canvas.target,PW_CLIENTONLY|2);
    require(drawn,"Owned client readback failed");GdiFlush();if(main_client)owned_main(window,pid);else owned_surface(window,pid);verify_process(pid,argv[2]);
    if(presentation)require(presentation_alpha(window)==alpha,"Owned presentation opacity changed during capture");
    BITMAPFILEHEADER header{};header.bfType=0x4d42;header.bfOffBits=54;header.bfSize=54+DWORD(width*height*4);
    {Handle file(CreateFileW(output.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr));require(file.value!=INVALID_HANDLE_VALUE,"Owned output must be new");made_file=true;write_all(file.value,&header,14);write_all(file.value,&info.bmiHeader,40);write_all(file.value,bits,DWORD(width*height*4));}
    std::printf("{\"protocol\":1,\"scope\":\"%s\",\"canvas\":\"client\",\"pid\":%lu,\"width\":%d,\"height\":%d,\"alpha\":%u}\n",main_client?"owned-sibling-main":presentation?"owned-sibling-presentation":"owned-sibling-client",static_cast<unsigned long>(pid),width,height,unsigned(alpha));
    return 0;
  }catch(const std::exception& error){if(made_file)DeleteFileW(output.c_str());std::fprintf(stderr,"Owned frame: %s\n",error.what());return 1;}
}
