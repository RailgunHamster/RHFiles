// Independent, bounded libmpv experiment. No product/IPC changes, system codec
// installation, global hooks, user configuration or foreign-window captures.
// ABI constants/layout follow the pinned include/mpv/client.h (ISC):
// Copyright (C) 2017 the mpv developers
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <set>
#include <string>
#include <thread>
#include <vector>

using Clock=std::chrono::steady_clock;
struct MpvEvent { int id,error;uint64_t reply;void* data; };
static_assert(sizeof(MpvEvent)==24&&offsetof(MpvEvent,data)==16);
constexpr int Flag=3,Int64=4,Double=5;
constexpr int EventNone=0,EventEndFile=7,EventPlaybackRestart=21,EventCommandReply=5;
struct EndFile {int reason,error;};
struct LogMessage {const char* prefix;const char* level;const char* text;};
struct Failure {const char* stage;int code;};
struct API {
  HMODULE module=nullptr;
  void*(__cdecl* create)()=nullptr;
  unsigned long(__cdecl* version)()=nullptr;
  int(__cdecl* initialize)(void*)=nullptr;
  int(__cdecl* option)(void*,const char*,const char*)=nullptr;
  int(__cdecl* optionData)(void*,const char*,int,void*)=nullptr;
  int(__cdecl* command)(void*,uint64_t,const char*const*)=nullptr;
  int(__cdecl* property)(void*,const char*,int,void*)=nullptr;
  char*(__cdecl* stringProperty)(void*,const char*)=nullptr;
  MpvEvent*(__cdecl* event)(void*,double)=nullptr;
  void(__cdecl* destroy)(void*)=nullptr;
  void(__cdecl* freeData)(void*)=nullptr;
  int(__cdecl* requestLogs)(void*,const char*)=nullptr;
  template<class T> void bind(T& target,const char* name){target=reinterpret_cast<T>(GetProcAddress(module,name));if(!target)throw Failure{"missing-api",ERROR_PROC_NOT_FOUND};}
  void load(){
    wchar_t executable[32768];if(!GetModuleFileNameW(nullptr,executable,32768))throw Failure{"executable-path",static_cast<int>(GetLastError())};
    const auto file=std::filesystem::path(executable).parent_path()/L"runtime"/L"libmpv-2.dll";
    SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32|LOAD_LIBRARY_SEARCH_USER_DIRS);
    module=LoadLibraryExW(file.c_str(),nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_SYSTEM32);
    if(!module)throw Failure{"dll-load",static_cast<int>(GetLastError())};
    bind(create,"mpv_create");bind(version,"mpv_client_api_version");bind(initialize,"mpv_initialize");bind(option,"mpv_set_option_string");bind(optionData,"mpv_set_option");bind(command,"mpv_command_async");bind(property,"mpv_get_property");bind(stringProperty,"mpv_get_property_string");bind(event,"mpv_wait_event");bind(destroy,"mpv_terminate_destroy");bind(freeData,"mpv_free");bind(requestLogs,"mpv_request_log_messages");
    if(version()>>16!=2)throw Failure{"unsupported-api-major",ERROR_REVISION_MISMATCH};
  }
};
std::string json(const std::string& value){std::string out;for(const unsigned char c:value){if(c=='"'||c=='\\')out+='\\';if(c>=32)out+=static_cast<char>(c);}return out;}
std::string utf8(const std::wstring& value){const int size=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0,nullptr,nullptr);if(!size)throw Failure{"source-encoding",ERROR_NO_UNICODE_TRANSLATION};std::string out(size,'\0');WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),out.data(),size,nullptr,nullptr);return out;}
struct Probe {
  API api;void* player=nullptr;HWND window=nullptr;
  Clock::time_point start=Clock::now();std::set<uint64_t> replies;
  int phase=0,restarts=0,seekRestart=0,captures=0,result=1,messages=0;
  double sourceAt=-1,firstEvent=-1,firstPixels=-1,phaseAt=0,pausedPosition=0,lastCapture=-1000;
  bool finished=false,hasAudio=false;
  double elapsed()const{return std::chrono::duration<double,std::milli>(Clock::now()-start).count();}
  void log(const char* stage,int code=0){std::printf("MPV_PROBE {\"stage\":\"%s\",\"atMs\":%.3f,\"code\":%d}\n",stage,elapsed(),code);std::fflush(stdout);}
  void checked(int code,const char* stage){if(code<0)throw Failure{stage,code};}
  void option(const char* name,const char* value){checked(api.option(player,name,value),name);}
  std::string string(const char* name){char* value=api.stringProperty(player,name);if(!value)return {};std::string found=value;api.freeData(value);return found;}
  double number(const char* name){double value=0;if(api.property(player,name,Double,&value)<0)return -1;return value;}
  int flag(const char* name){int value=0;return api.property(player,name,Flag,&value)<0?-1:value;}
  void send(uint64_t ticket,const std::vector<const char*>& values){auto args=values;args.push_back(nullptr);checked(api.command(player,ticket,args.data()),"command-enqueue");}
  void initialize(const std::string& source,bool d3d){
    api.load();log("dll-loaded");player=api.create();if(!player)throw Failure{"player-create",ERROR_OUTOFMEMORY};
    checked(api.requestLogs(player,"warn"),"bounded-log-messages");
    option("config","no");option("load-scripts","no");option("resume-playback","no");option("save-position-on-quit","no");option("osc","no");option("osd-level","0");option("input-default-bindings","no");option("input-vo-keyboard","no");option("stop-screensaver","no");option("gpu-shader-cache-dir","mpv-probe-cache");option("network-timeout","5");option("volume","20");option("hwdec","auto");option("vo","gpu-next");
    if(d3d)option("gpu-api","d3d11");
    int64_t parent=static_cast<uint32_t>(reinterpret_cast<uintptr_t>(window));checked(api.optionData(player,"wid",Int64,&parent),"owned-window");
    checked(api.initialize(player),"player-initialize");
    std::printf("MPV_PROBE {\"stage\":\"engine-ready\",\"atMs\":%.3f,\"apiVersion\":%lu,\"version\":\"%s\",\"api\":\"%s\"}\n",elapsed(),api.version(),json(string("mpv-version")).c_str(),d3d?"d3d11":"auto");std::fflush(stdout);
    capture(false);sourceAt=elapsed();log("source-requested");send(1,{"loadfile",source.c_str(),"replace"});
  }
  struct Target {HWND root,window;int area;};
  static BOOL CALLBACK chooseChild(HWND child,LPARAM data){auto target=reinterpret_cast<Target*>(data);DWORD pid=0;GetWindowThreadProcessId(child,&pid);RECT r{};GetClientRect(child,&r);const int area=r.right*r.bottom;if(pid==GetCurrentProcessId()&&IsChild(target->root,child)&&IsWindowVisible(child)&&r.right<=4096&&r.bottom<=4096&&area>target->area){target->area=area;target->window=child;}return TRUE;}
  bool capture(bool save){
    Target target{window,window,0};EnumChildWindows(window,chooseChild,reinterpret_cast<LPARAM>(&target));
    DWORD pid=0;GetWindowThreadProcessId(target.window,&pid);if(pid!=GetCurrentProcessId())throw Failure{"foreign-window-rejected",ERROR_ACCESS_DENIED};
    RECT rectangle{};GetClientRect(target.window,&rectangle);const int width=rectangle.right,height=rectangle.bottom;
    if(width<10||height<10||width>4096||height>4096)throw Failure{"invalid-owned-canvas",ERROR_INVALID_DATA};
    HDC source=GetDC(target.window),memory=CreateCompatibleDC(source);if(!source||!memory){if(memory)DeleteDC(memory);if(source)ReleaseDC(target.window,source);return false;}
    BITMAPINFO info{};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);info.bmiHeader.biWidth=width;info.bmiHeader.biHeight=-height;info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
    void* pixels=nullptr;HBITMAP bitmap=CreateDIBSection(memory,&info,DIB_RGB_COLORS,&pixels,nullptr,0);if(!bitmap){DeleteDC(memory);ReleaseDC(target.window,source);return false;}
    std::memset(pixels,0,static_cast<size_t>(width)*height*4);const auto previous=SelectObject(memory,bitmap);const BOOL painted=PrintWindow(target.window,memory,PW_CLIENTONLY|2);bool visible=painted!=FALSE;
    const auto bytes=static_cast<unsigned char*>(pixels);
    for(int i=0;i<4&&visible;i++){const int x=static_cast<int>(width*(i%2?.9:.1)),y=static_cast<int>(height*(i<2?.1:.9));const int offset=(y*width+x)*4,b=bytes[offset],g=bytes[offset+1],r=bytes[offset+2];visible=i==0?r>160&&g<90&&b<90:i==1?g>160&&r<90&&b<90:i==2?b>160&&r<90&&g<90:r>160&&g>160&&b<90;}
    bool written=false;
    if(painted&&((visible&&save)||!save)){BITMAPFILEHEADER header{};header.bfType=0x4d42;header.bfOffBits=sizeof(header)+sizeof(info.bmiHeader);header.bfSize=header.bfOffBits+width*height*4;
      HANDLE file=CreateFileW(save?L"mpv-probe-frame.bmp":L"mpv-probe-before.bmp",GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(file!=INVALID_HANDLE_VALUE){DWORD amount=0;written=WriteFile(file,&header,sizeof(header),&amount,nullptr)&&amount==sizeof(header)&&WriteFile(file,&info.bmiHeader,sizeof(info.bmiHeader),&amount,nullptr)&&amount==sizeof(info.bmiHeader)&&WriteFile(file,pixels,width*height*4,&amount,nullptr)&&amount==static_cast<DWORD>(width*height*4);CloseHandle(file);}}
    SelectObject(memory,previous);DeleteObject(bitmap);DeleteDC(memory);ReleaseDC(target.window,source);
    std::printf("MPV_PROBE {\"stage\":\"owned-window-sample\",\"atMs\":%.3f,\"visible\":%s,\"written\":%s,\"width\":%d,\"height\":%d}\n",elapsed(),visible?"true":"false",written?"true":"false",width,height);std::fflush(stdout);return visible&&(!save||written);
  }
  void tick(){
    if(elapsed()>15000)throw Failure{"bounded-probe-timeout",ERROR_TIMEOUT};
    for(int i=0;i<128;i++){const auto event=api.event(player,0);if(!event||event->id==EventNone)break;
      if(event->id==EventCommandReply){if(event->error<0)throw Failure{"command-reply",event->error};replies.insert(event->reply);}
      if(event->id==2&&event->data&&messages++<32){const auto message=static_cast<LogMessage*>(event->data);std::printf("MPV_PROBE {\"stage\":\"engine-log\",\"atMs\":%.3f,\"prefix\":\"%s\",\"text\":\"%s\"}\n",elapsed(),json(std::string(message->prefix).substr(0,100)).c_str(),json(std::string(message->text).substr(0,2048)).c_str());std::fflush(stdout);}
      if(event->id==EventPlaybackRestart){restarts++;if(firstEvent<0){firstEvent=elapsed();log("first-playback-restart");}}
      if(event->id==EventEndFile&&firstPixels<0){const auto ended=static_cast<EndFile*>(event->data);if(ended&&ended->reason==4)throw Failure{"media-error",ended->error};log("early-end-file",event->error);}
    }
    if(firstEvent>=0&&firstPixels<0&&elapsed()-lastCapture>150&&captures<4){lastCapture=elapsed();captures++;if(capture(true)){
      firstPixels=elapsed();const auto width=number("video-params/w"),height=number("video-params/h");hasAudio=!string("audio-codec-name").empty();
      std::printf("MPV_PROBE {\"stage\":\"first-owned-pixels\",\"atMs\":%.3f,\"sourceAtMs\":%.3f,\"eventAtMs\":%.3f,\"width\":%.0f,\"height\":%.0f,\"hasAudio\":%s,\"audioCodec\":\"%s\",\"hardwareDecoder\":\"%s\"}\n",firstPixels,sourceAt,firstEvent,width,height,hasAudio?"true":"false",json(string("audio-codec-name")).c_str(),json(string("hwdec-current")).c_str());std::fflush(stdout);}}
    if(firstPixels<0)return;
    if(phase==0&&elapsed()-firstPixels>500){send(2,{"set","pause","yes"});phase=1;}
    else if(phase==1&&replies.count(2)&&flag("pause")==1){pausedPosition=number("time-pos");phaseAt=elapsed();phase=2;}
    else if(phase==2&&elapsed()-phaseAt>250){if(std::abs(number("time-pos")-pausedPosition)>.1)throw Failure{"pause-did-not-hold",ERROR_INVALID_DATA};log("pause-verified");seekRestart=restarts;send(3,{"seek","4","absolute+exact"});phase=3;}
    else if(phase==3&&replies.count(3)&&restarts>seekRestart&&std::abs(number("time-pos")-4)<.4){log("seek-verified");send(4,{"set","speed","1.25"});phase=4;}
    else if(phase==4&&replies.count(4)&&std::abs(number("speed")-1.25)<.001){send(5,{"set","pause","no"});phase=5;}
    else if(phase==5&&replies.count(5)&&flag("pause")==0&&number("time-pos")>4.2){log("rate-resume-verified");log("completed");finished=true;result=0;}
  }
  static void pump(){MSG message;while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessageW(&message);}}
  void shutdown(){
    if(player){std::atomic<bool> done=false;void* owned=player;std::thread worker([&]{api.destroy(owned);done=true;});const auto until=Clock::now()+std::chrono::seconds(3);while(!done&&Clock::now()<until){pump();Sleep(10);}if(!done){log("shutdown-timeout",ERROR_TIMEOUT);TerminateProcess(GetCurrentProcess(),1);}worker.join();player=nullptr;}
    if(window){DestroyWindow(window);window=nullptr;}if(api.module){FreeLibrary(api.module);api.module=nullptr;}log("shutdown-complete");
  }
};
LRESULT CALLBACK procedure(HWND window,UINT message,WPARAM wparam,LPARAM lparam){if(message==WM_CLOSE){ShowWindow(window,SW_HIDE);return 0;}if(message==WM_PAINT){PAINTSTRUCT paint;const auto dc=BeginPaint(window,&paint);FillRect(dc,&paint.rcPaint,static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));EndPaint(window,&paint);return 0;}return DefWindowProcW(window,message,wparam,lparam);}
bool validSource(const std::wstring& source){
  if(source==L"mpv-probe-source.mp4"){const auto attributes=GetFileAttributesW(source.c_str());return attributes!=INVALID_FILE_ATTRIBUTES&&!(attributes&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT));}
  const std::wstring prefix=L"http://127.0.0.1:";if(source.rfind(prefix,0)!=0)return false;const auto slash=source.find(L'/',prefix.size());if(slash==std::wstring::npos)return false;const auto port=source.substr(prefix.size(),slash-prefix.size());if(port.empty()||port.size()>5||port.find_first_not_of(L"0123456789")!=std::wstring::npos||std::stoi(port)<1||std::stoi(port)>65535)return false;const auto file=source.substr(slash+1);return file.size()==36&&file.substr(32)==L".mp4"&&file.substr(0,32).find_first_not_of(L"0123456789abcdef")==std::wstring::npos;
}
int wmain(int argc,wchar_t** argv){
  if(argc!=3||!validSource(argv[1])||(std::wstring(argv[2])!=L"auto"&&std::wstring(argv[2])!=L"d3d11")){std::fprintf(stderr,"Only the owned source and explicit GPU experiment are accepted.\n");return 2;}
  Probe probe;
  try{WNDCLASSW type{};type.lpfnWndProc=procedure;type.hInstance=GetModuleHandleW(nullptr);type.lpszClassName=L"RHFilesOwnedMpvProbe";if(!RegisterClassW(&type))throw Failure{"window-class",static_cast<int>(GetLastError())};RECT bounds{0,0,1280,720};const auto style=WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN;AdjustWindowRect(&bounds,style,FALSE);
    probe.window=CreateWindowExW(0,type.lpszClassName,L"RHFiles · isolated libmpv comparison",style,CW_USEDEFAULT,CW_USEDEFAULT,bounds.right-bounds.left,bounds.bottom-bounds.top,nullptr,nullptr,type.hInstance,nullptr);if(!probe.window)throw Failure{"window-create",static_cast<int>(GetLastError())};ShowWindow(probe.window,SW_SHOWNOACTIVATE);UpdateWindow(probe.window);probe.initialize(utf8(argv[1]),std::wstring(argv[2])==L"d3d11");while(!probe.finished){Probe::pump();probe.tick();Sleep(10);}
  }catch(Failure failure){probe.log(failure.stage,failure.code);}catch(const std::exception&){probe.log("native-exception",ERROR_UNHANDLED_EXCEPTION);}
  probe.shutdown();return probe.result;
}
