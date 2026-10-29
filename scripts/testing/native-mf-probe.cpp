// Independent, finite Windows MediaEngine/DirectComposition comparison.
// Test only: no product backend/IPC changes, external HWNDs, global hooks or
// codec installs. The caller owns the loopback HTTP source and working folder.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mfapi.h>
#include <mfmediaengine.h>
#include <mferror.h>
#include <d3d11.h>
#include <d3d10.h>
#include <dcomp.h>
#include <shlwapi.h>
#include <wrl/client.h>
#include <wrl/implements.h>
#include <chrono>
#include <cstdio>
#include <mutex>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;
using Clock = std::chrono::steady_clock;
constexpr UINT kEvent = WM_APP + 43;
struct Failure { HRESULT hr; const char* stage; };
void checked(HRESULT hr, const char* stage) { if (FAILED(hr)) throw Failure{hr,stage}; }

class Notify final : public Microsoft::WRL::RuntimeClass<
  Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>, IMFMediaEngineNotify> {
  std::mutex mutex_;
  HWND window_ = nullptr;
public:
  explicit Notify(HWND window) : window_(window) {}
  void detach() { std::lock_guard lock(mutex_);window_=nullptr; }
  HRESULT STDMETHODCALLTYPE EventNotify(DWORD event, DWORD_PTR parameter, DWORD status) override {
    if (event == MF_MEDIA_ENGINE_EVENT_NOTIFYSTABLESTATE) {
      SetEvent(reinterpret_cast<HANDLE>(parameter));
    } else {
      std::lock_guard lock(mutex_);
      if(window_)PostMessageW(window_,kEvent,event,status);
    }
    return S_OK;
  }
};

struct Probe {
  HWND window = nullptr;
  Clock::time_point start = Clock::now();
  ComPtr<Notify> notify;
  ComPtr<IMFMediaEngine> engine;
  ComPtr<IMFMediaEngineEx> extended;
  ComPtr<ID3D11Device> videoDevice;
  ComPtr<IMFDXGIDeviceManager> manager;
  ComPtr<IDCompositionDesktopDevice> composition;
  ComPtr<IDCompositionTarget> target;
  ComPtr<IDCompositionVisual2> visual;
  ComPtr<IUnknown> surface;
  HANDLE swapchain = nullptr;
  double firstFrames = -1, metadata = -1;
  bool connected = false, seeked = false, paused = false, completed = false;
  int phase = 0, result = 1, events = 0;
  double phaseAt = 0;
  bool captureOk = false;
  bool comReady = false, mfReady = false;
  double elapsed() const { return std::chrono::duration<double,std::milli>(Clock::now()-start).count(); }
  void log(const char* stage, HRESULT hr = S_OK) {
    std::printf("MF_PROBE {\"stage\":\"%s\",\"atMs\":%.3f,\"hr\":%lu}\n",stage,elapsed(),static_cast<unsigned long>(hr));
    std::fflush(stdout);
  }
  void fail(Failure failure) {
    log(failure.stage,failure.hr); result=1; completed=true;
    if(notify)notify->detach();
    if (window) DestroyWindow(window);
  }
  void initialize(const wchar_t* url) {
    checked(CoInitializeEx(nullptr,COINIT_MULTITHREADED),"com-initialize");comReady=true;
    checked(MFStartup(MF_VERSION,MFSTARTUP_FULL),"mf-startup");mfReady=true;log("mf-ready");
    UINT flags=D3D11_CREATE_DEVICE_VIDEO_SUPPORT|D3D11_CREATE_DEVICE_BGRA_SUPPORT;
    D3D_FEATURE_LEVEL level;
    checked(D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,flags,nullptr,0,D3D11_SDK_VERSION,
      &videoDevice,&level,nullptr),"hardware-device");
    ComPtr<ID3D10Multithread> multithread;
    checked(videoDevice.As(&multithread),"video-multithread");multithread->SetMultithreadProtected(TRUE);
    UINT reset=0;
    checked(MFCreateDXGIDeviceManager(&reset,&manager),"video-manager");
    checked(manager->ResetDevice(videoDevice.Get(),reset),"video-manager-device");log("hardware-ready");
    checked(DCompositionCreateDevice2(nullptr,IID_PPV_ARGS(&composition)),"composition-device");
    checked(composition->CreateTargetForHwnd(window,TRUE,&target),"composition-target");
    checked(composition->CreateVisual(&visual),"composition-visual");
    notify=Microsoft::WRL::Make<Notify>(window);
    ComPtr<IMFAttributes> attributes;
    checked(MFCreateAttributes(&attributes,4),"engine-attributes");
    checked(attributes->SetUnknown(MF_MEDIA_ENGINE_CALLBACK,notify.Get()),"engine-callback");
    checked(attributes->SetUnknown(MF_MEDIA_ENGINE_DXGI_MANAGER,manager.Get()),"engine-device-manager");
    checked(attributes->SetGUID(MF_MEDIA_ENGINE_BROWSER_COMPATIBILITY_MODE,MF_MEDIA_ENGINE_BROWSER_COMPATIBILITY_MODE_IE_EDGE),"engine-compatibility");
    ComPtr<IMFMediaEngineClassFactory> factory;
    checked(CoCreateInstance(CLSID_MFMediaEngineClassFactory,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&factory)),"engine-factory");
    checked(factory->CreateInstance(0,attributes.Get(),&engine),"engine-create");
    checked(engine.As(&extended),"engine-extended");
    checked(engine->SetVolume(.2),"engine-volume");log("engine-ready");
    BSTR source=SysAllocString(url);
    if (!source) throw Failure{E_OUTOFMEMORY,"source-allocation"};
    const HRESULT sourceResult=engine->SetSource(source);SysFreeString(source);
    checked(sourceResult,"engine-source");log("source-requested");
    SetTimer(window,1,50,nullptr);
  }
  void connectSurface() {
    if (connected) return;
    checked(extended->EnableWindowlessSwapchainMode(TRUE),"swapchain-mode");
    RECT rectangle;GetClientRect(window,&rectangle);
    checked(extended->UpdateVideoStream(nullptr,&rectangle,nullptr),"video-layout");
    checked(extended->GetVideoSwapchainHandle(&swapchain),"swapchain-handle");
    checked(composition->CreateSurfaceFromHandle(swapchain,&surface),"composition-surface");
    checked(visual->SetContent(surface.Get()),"composition-content");
    checked(target->SetRoot(visual.Get()),"composition-root");
    checked(composition->Commit(),"composition-commit");
    connected=true;log("surface-connected");
    checked(engine->Play(),"engine-play");log("play-requested");
  }
  bool capture() {
    RECT rectangle;GetClientRect(window,&rectangle);
    const int width=rectangle.right,height=rectangle.bottom;
    HDC source=GetDC(window),memory=CreateCompatibleDC(source);
    if (!source||!memory) {if(memory)DeleteDC(memory);if(source)ReleaseDC(window,source);return false;}
    BITMAPINFO info{};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth=width;info.bmiHeader.biHeight=-height;info.bmiHeader.biPlanes=1;
    info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
    void* pixels=nullptr;HBITMAP bitmap=CreateDIBSection(memory,&info,DIB_RGB_COLORS,&pixels,nullptr,0);
    if (!bitmap) {DeleteDC(memory);ReleaseDC(window,source);return false;}
    HGDIOBJ old=SelectObject(memory,bitmap);
    const BOOL painted=PrintWindow(window,memory,PW_CLIENTONLY|2);
    bool written=false;
    if(painted){
      BITMAPFILEHEADER header{};header.bfType=0x4d42;header.bfOffBits=sizeof(header)+sizeof(info.bmiHeader);
      header.bfSize=header.bfOffBits+width*height*4;
      HANDLE file=CreateFileW(L"mf-probe-frame.bmp",GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
      if(file!=INVALID_HANDLE_VALUE){
        DWORD amount=0;
        written=WriteFile(file,&header,sizeof(header),&amount,nullptr)&&amount==sizeof(header)
          &&WriteFile(file,&info.bmiHeader,sizeof(info.bmiHeader),&amount,nullptr)&&amount==sizeof(info.bmiHeader)
          &&WriteFile(file,pixels,width*height*4,&amount,nullptr)&&amount==static_cast<DWORD>(width*height*4);
        CloseHandle(file);
      }
    }
    SelectObject(memory,old);DeleteObject(bitmap);DeleteDC(memory);ReleaseDC(window,source);return written;
  }
  void tick() {
    if (elapsed()>15000) throw Failure{HRESULT_FROM_WIN32(ERROR_TIMEOUT),"bounded-probe-timeout"};
    if (!connected) return;
    PROPVARIANT frames{};
    checked(extended->GetStatistics(MF_MEDIA_ENGINE_STATISTIC_FRAMES_RENDERED,&frames),"render-statistics");
    const auto count=frames.vt==VT_UI4?frames.ulVal:frames.vt==VT_UI8?frames.uhVal.QuadPart:0;
    PropVariantClear(&frames);
    if (count&&firstFrames<0) {
      firstFrames=elapsed();DWORD width=0,height=0;checked(engine->GetNativeVideoSize(&width,&height),"video-size");
      std::printf("MF_PROBE {\"stage\":\"first-render-statistic\",\"atMs\":%.3f,\"width\":%lu,\"height\":%lu,\"hasAudio\":%s,\"frames\":%llu}\n",firstFrames,width,height,engine->HasAudio()?"true":"false",static_cast<unsigned long long>(count));
      std::fflush(stdout);captureOk=capture();log("own-window-captured",captureOk?S_OK:E_FAIL);
    }
    if (firstFrames<0) return;
    if (phase==0&&elapsed()-firstFrames>750) {
      checked(engine->Pause(),"pause");paused=engine->IsPaused()!=FALSE;
      if (!paused) throw Failure{E_FAIL,"pause-state"};
      log("pause-verified");seeked=false;checked(engine->SetCurrentTime(4.),"seek");phase=1;phaseAt=elapsed();
    } else if (phase==1&&seeked&&std::abs(engine->GetCurrentTime()-4.)<.4) {
      log("seek-verified");checked(engine->SetPlaybackRate(1.25),"rate");
      if(std::abs(engine->GetPlaybackRate()-1.25)>.001) throw Failure{E_FAIL,"rate-state"};
      checked(engine->Play(),"resume");log("rate-resume-verified");phase=2;phaseAt=elapsed();
    } else if (phase==2&&elapsed()-phaseAt>750&&engine->GetCurrentTime()>4.2) {
      std::printf("MF_PROBE {\"stage\":\"completed\",\"atMs\":%.3f,\"firstStatsMs\":%.3f,\"metadataMs\":%.3f,\"position\":%.3f,\"duration\":%.3f,\"captureWritten\":%s}\n",elapsed(),firstFrames,metadata,engine->GetCurrentTime(),engine->GetDuration(),captureOk?"true":"false");std::fflush(stdout);
      result=0;completed=true;if(notify)notify->detach();DestroyWindow(window);
    }
  }
  void event(DWORD code, DWORD status) {
    if(events++<64){std::printf("MF_PROBE {\"stage\":\"event\",\"code\":%lu,\"atMs\":%.3f,\"status\":%lu}\n",code,elapsed(),status);std::fflush(stdout);}
    if(code==MF_MEDIA_ENGINE_EVENT_ERROR)throw Failure{static_cast<HRESULT>(status),"media-error"};
    if(code==MF_MEDIA_ENGINE_EVENT_LOADEDMETADATA){metadata=elapsed();connectSurface();}
    if(code==MF_MEDIA_ENGINE_EVENT_SEEKED)seeked=true;
  }
  void shutdown() {
    if(notify)notify->detach();
    if(engine)engine->Shutdown();
    if(target)target->SetRoot(nullptr);
    if(composition)composition->Commit();
    surface.Reset();visual.Reset();target.Reset();composition.Reset();
    extended.Reset();engine.Reset();notify.Reset();
    if(swapchain){CloseHandle(swapchain);swapchain=nullptr;}
    manager.Reset();videoDevice.Reset();
    if(mfReady){MFShutdown();mfReady=false;}
    if(comReady){CoUninitialize();comReady=false;}
  }
};

LRESULT CALLBACK windowProcedure(HWND window,UINT message,WPARAM wparam,LPARAM lparam) {
  if(message==WM_NCCREATE){auto create=reinterpret_cast<CREATESTRUCTW*>(lparam);SetWindowLongPtrW(window,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(create->lpCreateParams));}
  auto probe=reinterpret_cast<Probe*>(GetWindowLongPtrW(window,GWLP_USERDATA));
  try {
    if(probe&&message==kEvent){probe->event(static_cast<DWORD>(wparam),static_cast<DWORD>(lparam));return 0;}
    if(probe&&message==WM_TIMER){probe->tick();return 0;}
    if(message==WM_PAINT){PAINTSTRUCT paint;HDC dc=BeginPaint(window,&paint);FillRect(dc,&paint.rcPaint,static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));EndPaint(window,&paint);return 0;}
    if(message==WM_DESTROY){if(probe&&probe->notify)probe->notify->detach();KillTimer(window,1);PostQuitMessage(0);return 0;}
  } catch(Failure failure){if(probe)probe->fail(failure);return 0;}
  return DefWindowProcW(window,message,wparam,lparam);
}

int wmain(int argc,wchar_t** argv) {
  if(argc!=2){std::fprintf(stderr,"Use the owned loopback or fixed local media fixture only.\n");return 2;}
  std::wstring source=argv[1];
  if(source==L"mf-probe-source.mp4"){
    wchar_t fullPath[32768],uri[32768];
    if(!GetFullPathNameW(source.c_str(),32768,fullPath,nullptr)||GetFileAttributesW(fullPath)==INVALID_FILE_ATTRIBUTES)return 2;
    DWORD length=32768;if(FAILED(UrlCreateFromPathW(fullPath,uri,&length,0)))return 2;
    source=uri;
  }else if(source.rfind(L"http://127.0.0.1:",0)!=0){std::fprintf(stderr,"Use the owned loopback media fixture only.\n");return 2;}
  Probe probe;
  try {
    WNDCLASSW type{};type.lpfnWndProc=windowProcedure;type.hInstance=GetModuleHandleW(nullptr);type.lpszClassName=L"RHFilesOwnedMFProbe";
    checked(RegisterClassW(&type)?S_OK:HRESULT_FROM_WIN32(GetLastError()),"window-class");
    RECT rectangle{0,0,1280,720};AdjustWindowRect(&rectangle,WS_OVERLAPPEDWINDOW,FALSE);
    probe.window=CreateWindowExW(WS_EX_NOREDIRECTIONBITMAP,type.lpszClassName,L"RHFiles · isolated native playback comparison",WS_OVERLAPPEDWINDOW,
      CW_USEDEFAULT,CW_USEDEFAULT,rectangle.right-rectangle.left,rectangle.bottom-rectangle.top,nullptr,nullptr,type.hInstance,&probe);
    if(!probe.window)throw Failure{HRESULT_FROM_WIN32(GetLastError()),"window-create"};
    ShowWindow(probe.window,SW_SHOWNOACTIVATE);UpdateWindow(probe.window);
    probe.initialize(source.c_str());
    MSG message;while(GetMessageW(&message,nullptr,0,0)>0){TranslateMessage(&message);DispatchMessageW(&message);}
  } catch(Failure failure){probe.fail(failure);}
  probe.shutdown();probe.log("shutdown-complete");return probe.result;
}
