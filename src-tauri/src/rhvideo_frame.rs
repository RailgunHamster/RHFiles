//! Native compatibility presenter for libVLC. Pixels never cross the JS bridge.
use std::{
    cell::UnsafeCell,
    ffi::c_void,
    sync::{
        Condvar, Mutex,
        atomic::{AtomicU64,AtomicI32,AtomicBool, Ordering},
    },
    time::Instant,
};
use windows::Win32::{
    Foundation::{HWND, RECT,POINT},
    Graphics::Gdi::*,
    UI::WindowsAndMessaging::GetClientRect,
};
struct Pixels {
    dib:usize,
    bits:usize,
    offset: usize,
    width: u32,
    height: u32,
    pitch: u32,
}
impl Pixels{
    fn empty()->Self{Self{dib:0,bits:0,offset:0,width:0,height:0,pitch:0}}
    fn allocate(width:u32,height:u32)->Result<Self,String>{unsafe{
        // Decoder writes directly into this DIB. One padded row/32 bytes lets
        // us guarantee libVLC's 32-byte plane alignment without a frame copy.
        let pitch=(width.checked_mul(4).ok_or("视频尺寸过大")?+31)&!31;let pitch=pitch.checked_add(32).ok_or("视频尺寸过大")?;
        let mut info=BITMAPINFO::default();info.bmiHeader=BITMAPINFOHEADER{biSize:std::mem::size_of::<BITMAPINFOHEADER>() as u32,biWidth:(pitch/4) as i32,biHeight:-((height+1) as i32),biPlanes:1,biBitCount:32,biCompression:BI_RGB.0,..Default::default()};let mut bits=std::ptr::null_mut();
        let bitmap=CreateDIBSection(None,&info,DIB_RGB_COLORS,&mut bits,None,0).map_err(|_|"无法创建原生视频画布")?;
        if bits.is_null(){let _=DeleteObject(HGDIOBJ(bitmap.0));return Err("原生视频画布没有像素缓冲".into());}
        let offset=(32-bits as usize%32)%32;Ok(Self{dib:bitmap.0 as usize,bits:bits as usize,offset,width,height,pitch})
    }}
    fn pointer(&self)->*mut u8{(self.bits+self.offset) as *mut u8}
}
impl Drop for Pixels{fn drop(&mut self){if self.dib!=0{unsafe{let _=DeleteObject(HGDIOBJ(self.dib as *mut c_void));}}}}
pub struct Frame {
    hwnd: usize,
    gate: Mutex<bool>,
    released: Condvar,
    pixels: UnsafeCell<Pixels>,
    pub count: AtomicU64,
    // Decoder-selected compatibility output geometry, not a requested angle.
    // A single atomic keeps width/height coherent without waiting for pixels.
    pub format:AtomicU64,
    pub presented:AtomicU64,
    pub rotation:AtomicI32,
    pub render_error:AtomicBool,
    epoch: Instant,
    pub last_display: AtomicU64,
}
// Every pixel access is protected by gate. The Box address remains stable until
// libvlc_media_player_stop/release has joined all video callbacks.
unsafe impl Send for Frame {}
unsafe impl Sync for Frame {}
impl Frame {
    pub fn observe_native(&self, count: u64) {
        let previous = self.count.swap(count, Ordering::Relaxed);
        if count > previous {
            self.last_display
                .store(self.epoch.elapsed().as_millis() as u64, Ordering::Relaxed);
        }
    }
    pub fn new(hwnd: usize) -> Self {
        Self {
            hwnd,
            gate: Mutex::new(false),
            released: Condvar::new(),
            pixels: UnsafeCell::new(Pixels::empty()),
            count: AtomicU64::new(0),
            format:AtomicU64::new(0),
            presented:AtomicU64::new(0),rotation:AtomicI32::new(0),render_error:AtomicBool::new(false),
            epoch: Instant::now(),
            last_display: AtomicU64::new(0),
        }
    }
    fn acquire(&self) -> bool {
        let Ok(mut busy) = self.gate.lock() else {
            return false;
        };
        while *busy {
            let Ok(next) = self.released.wait(busy) else {
                return false;
            };
            busy = next;
        }
        *busy = true;
        true
    }
    fn release(&self) {
        if let Ok(mut busy) = self.gate.lock() {
            *busy = false;
            self.released.notify_one();
        }
    }
    fn lease(&self) -> Option<Lease<'_>> {
        self.acquire().then(|| Lease(self))
    }
    pub fn render(&self)->bool {
        let Some(_guard) = self.lease() else {
            return false;
        };
        unsafe {
            let pixels = &*self.pixels.get();
            if pixels.dib==0 {
                return false;
            }
            let hwnd = HWND(self.hwnd as *mut c_void);
            let mut rect = RECT::default();
            if GetClientRect(hwnd, &mut rect).is_err() {
                self.render_error.store(true,Ordering::Relaxed);return false;
            }
            let width = rect.right.max(1);
            let height = rect.bottom.max(1);
            let dc = GetDC(Some(hwnd));
            if dc.0.is_null() {
                self.render_error.store(true,Ordering::Relaxed);return false;
            }
            let result=render_dc(dc,pixels,width,height,self.rotation.load(Ordering::Relaxed));
            ReleaseDC(Some(hwnd), dc);
            match result{Ok((w,h))=>{self.presented.store(((w as u64)<<32)|h as u64,Ordering::Release);self.render_error.store(false,Ordering::Relaxed);true},Err(_)=>{self.render_error.store(true,Ordering::Relaxed);false}}
        }
    }
}
// The same GDI presenter is exercised against an off-screen DIB in unit tests.
// PlgBlt reads the same DIB which libVLC filled, with no frame-sized CPU copy.
unsafe fn render_dc(dc:HDC,pixels:&Pixels,width:i32,height:i32,rotation:i32)->Result<(u32,u32),String>{unsafe{
    let save=SaveDC(dc);if save==0{return Err("无法保存视频画布状态".into());}
    let result=(||{
        let _=PatBlt(dc,0,0,width,height,BLACKNESS);
        let swapped=rotation%180!=0;let(out_w,out_h)=if swapped{(pixels.height,pixels.width)}else{(pixels.width,pixels.height)};
        let scale=(width as f32/out_w as f32).min(height as f32/out_h as f32);
        let left=(width as f32-out_w as f32*scale)/2.;let top=(height as f32-out_h as f32*scale)/2.;
        let(w,h)=(pixels.width as f32*scale,pixels.height as f32*scale);let p=|x:f32,y:f32|POINT{x:x.round() as i32,y:y.round() as i32};
        let points=match rotation{0=>[p(left,top),p(left+w,top),p(left,top+h)],90=>[p(left+h,top),p(left+h,top+w),p(left,top)],180=>[p(left+w-1.,top+h-1.),p(left-1.,top+h-1.),p(left+w-1.,top-1.)],270=>[p(left,top+w),p(left,top),p(left+h,top+w)],_=>return Err("旋转角度无效".into())};
        let source=CreateCompatibleDC(Some(dc));if source.0.is_null(){return Err("无法创建视频源画布".into());}let old=SelectObject(source,HGDIOBJ(pixels.dib as *mut c_void));
        let _=SetStretchBltMode(dc,COLORONCOLOR);
        let drawn=PlgBlt(dc,&points,source,(pixels.offset/4) as i32,0,pixels.width as i32,pixels.height as i32,None,0,0);
        let _=GdiFlush();let _=SelectObject(source,old);let _=DeleteDC(source);
        if !drawn.as_bool(){return Err("无法显示兼容视频画面".into());}Ok((out_w,out_h))
    })();let _=RestoreDC(dc,save);result
}}
struct Lease<'a>(&'a Frame);
#[cfg(debug_assertions)]
fn diagnostic_print_flags()->windows::Win32::Storage::Xps::PRINT_WINDOW_FLAGS{
    // The DIB uses GetClientRect dimensions. Top-level comparisons must not
    // include the title bar/border and then crop the bottom/right to fit.
    windows::Win32::Storage::Xps::PRINT_WINDOW_FLAGS(windows::Win32::Storage::Xps::PW_CLIENTONLY.0|2)
}
#[cfg(debug_assertions)]
pub fn diagnostic_capture(hwnd:usize,path:&std::path::Path,compatibility:bool)->Result<(u32,u32),String>{unsafe{
    // Read only the caller-owned video child, never the desktop or an arbitrary
    // external HWND. This opt-in QA path is absent from release builds.
    let hwnd=HWND(hwnd as *mut c_void);let mut rect=RECT::default();GetClientRect(hwnd,&mut rect).map_err(|_|"无法读取视频画布")?;
    let(width,height)=(rect.right,rect.bottom);if width<=0||height<=0||width>4096||height>4096{return Err("诊断画布尺寸无效".into());}
    let source=GetDCEx(Some(hwnd),None,DCX_CACHE);if source.0.is_null(){return Err("无法读取原生视频画布".into());}
    let target=CreateCompatibleDC(Some(source));if target.0.is_null(){ReleaseDC(Some(hwnd),source);return Err("无法创建诊断画布".into());}
    let result=(||{
        let mut info=BITMAPINFO::default();info.bmiHeader=BITMAPINFOHEADER{biSize:40,biWidth:width,biHeight:-height,biPlanes:1,biBitCount:32,biCompression:BI_RGB.0,..Default::default()};let mut bits=std::ptr::null_mut();
        let bitmap=CreateDIBSection(Some(target),&info,DIB_RGB_COLORS,&mut bits,None,0).map_err(|_|"无法创建诊断像素缓冲")?;let old=SelectObject(target,HGDIOBJ(bitmap.0));
        // DWM includes the GPU child for PW_RENDERFULLCONTENT. GDI pixels
        // already live in the DC; WM_PRINT can instead paint its background.
        let drawn=if compatibility{BitBlt(target,0,0,width,height,Some(source),0,0,SRCCOPY).is_ok()}else{windows::Win32::Storage::Xps::PrintWindow(hwnd,target,diagnostic_print_flags()).as_bool()};let _=GdiFlush();
        let bytes=if drawn&&!bits.is_null(){Some(std::slice::from_raw_parts(bits as *const u8,(width*height*4) as usize).to_vec())}else{None};
        let _=SelectObject(target,old);let _=DeleteObject(HGDIOBJ(bitmap.0));
        let pixels=bytes.ok_or("无法读取实际视频像素")?;let mut bmp=Vec::with_capacity(54+pixels.len());bmp.extend_from_slice(b"BM");bmp.extend_from_slice(&(54+pixels.len() as u32).to_le_bytes());bmp.extend_from_slice(&[0;4]);bmp.extend_from_slice(&54u32.to_le_bytes());bmp.extend_from_slice(&40u32.to_le_bytes());bmp.extend_from_slice(&width.to_le_bytes());bmp.extend_from_slice(&(-height).to_le_bytes());bmp.extend_from_slice(&1u16.to_le_bytes());bmp.extend_from_slice(&32u16.to_le_bytes());bmp.extend_from_slice(&[0;24]);bmp.extend_from_slice(&pixels);
        std::fs::write(path,bmp).map_err(|_|"无法写入隔离诊断文件")?;Ok((width as u32,height as u32))
    })();let _=DeleteDC(target);ReleaseDC(Some(hwnd),source);result
}}
impl Drop for Lease<'_> {
    fn drop(&mut self) {
        self.0.release();
    }
}
pub unsafe extern "C" fn setup(
    opaque: *mut *mut c_void,
    chroma: *mut i8,
    width: *mut u32,
    height: *mut u32,
    pitches: *mut u32,
    lines: *mut u32,
) -> u32 {
    unsafe {
        let frame = &*((*opaque) as *const Frame);
        let Some(_guard) = frame.lease() else {
            return 0;
        };
        if *width == 0 || *height == 0 {
            return 0;
        }
        let ratio = (1920.0 / (*width as f64))
            .min(1080.0 / (*height as f64))
            .min(1.0);
        *width = ((*width as f64 * ratio).round() as u32).max(1);
        *height = ((*height as f64 * ratio).round() as u32).max(1);
        let Ok(pixels)=Pixels::allocate(*width,*height)else{return 0;};let pitch=pixels.pitch;
        *frame.pixels.get()=pixels;
        frame.format.store(((*width as u64)<<32)|*height as u64,Ordering::Release);
        std::ptr::copy_nonoverlapping(b"RV32".as_ptr(), chroma.cast(), 4);
        *pitches = pitch;
        *lines = *height;
        1
    }
}
pub unsafe extern "C" fn lock(opaque: *mut c_void, planes: *mut *mut c_void) -> *mut c_void {
    unsafe {
        // A C buffer lease can end on a different callback thread. Do not pass
        // a Rust MutexGuard across the ABI; a condvar-backed lease is thread-neutral.
        let frame = &*(opaque as *const Frame);
        if !frame.acquire() {
            return std::ptr::null_mut();
        }
        let pixels = &mut *frame.pixels.get();
        *planes = pixels.pointer().cast();
        opaque
    }
}
pub unsafe extern "C" fn unlock(
    opaque: *mut c_void,
    picture: *mut c_void,
    _planes: *const *mut c_void,
) {
    if !picture.is_null() {
        unsafe {
            (&*(opaque as *const Frame)).release();
        }
    }
}
pub unsafe extern "C" fn display(opaque: *mut c_void, _picture: *mut c_void) {
    let frame = unsafe { &*(opaque as *const Frame) };
    if frame.render(){frame.count.fetch_add(1, Ordering::Relaxed);frame.last_display.store(frame.epoch.elapsed().as_millis() as u64, Ordering::Relaxed);}
}

#[cfg(test)] mod tests{
    use super::*;
    #[cfg(debug_assertions)]
    #[test] fn diagnostic_dib_and_print_scope_both_use_the_client_area(){
        assert_eq!(diagnostic_print_flags().0,3);
        assert_ne!(diagnostic_print_flags().0 & windows::Win32::Storage::Xps::PW_CLIENTONLY.0,0);
    }
    #[test] fn native_dib_keeps_decoder_planes_and_strides_32_byte_aligned(){
        for width in [1,2,31,32,33,360,1920]{let p=Pixels::allocate(width,13).unwrap();assert_eq!(p.pointer() as usize%32,0);assert_eq!(p.pitch%32,0);assert!(p.offset+width as usize*4<=p.pitch as usize);unsafe{std::ptr::write_bytes(p.pointer(),0x2a,p.pitch as usize*13);}}
    }
    #[test] fn actual_gdi_pixels_rotate_clockwise_without_cropping(){unsafe{
        // A B / C D / E F: every pixel must survive all four orientations.
        let colors=[0x00110000u32,0x00220000,0x00330000,0x00440000,0x00550000,0x00660000];
        let pixels=Pixels::allocate(2,3).unwrap();for y in 0..3{std::ptr::copy_nonoverlapping(colors.as_ptr().add(y*2) as *const u8,pixels.pointer().add(y*pixels.pitch as usize),8);}
        let mut failures=Vec::new();
        for(angle,width,height,expected)in [(0,2,3,vec![1,2,3,4,5,6]),(90,3,2,vec![5,3,1,6,4,2]),(180,2,3,vec![6,5,4,3,2,1]),(270,3,2,vec![2,4,6,1,3,5])]{
          for scale in [1,2,3]{
            let expanded=expected.chunks(width as usize).flat_map(|row|{let row=row.iter().flat_map(|n|std::iter::repeat_n(n*17,scale as usize)).collect::<Vec<_>>();std::iter::repeat_n(row,scale as usize).flatten()}).collect::<Vec<_>>();
            let(width,height)=(width*scale,height*scale);
            let dc=CreateCompatibleDC(None);assert!(!dc.0.is_null());let mut info=BITMAPINFO::default();info.bmiHeader=BITMAPINFOHEADER{biSize:std::mem::size_of::<BITMAPINFOHEADER>() as u32,biWidth:width,biHeight:-height,biPlanes:1,biBitCount:32,biCompression:BI_RGB.0,..Default::default()};let mut bits=std::ptr::null_mut();let bitmap=CreateDIBSection(Some(dc),&info,DIB_RGB_COLORS,&mut bits,None,0).unwrap();let old=SelectObject(dc,HGDIOBJ(bitmap.0));
            let result=render_dc(dc,&pixels,width,height,angle);let _=GdiFlush();let actual=std::slice::from_raw_parts(bits as *const u32,(width*height) as usize).iter().map(|n|(n>>16)&0xff).collect::<Vec<_>>();let _=SelectObject(dc,old);let _=DeleteObject(HGDIOBJ(bitmap.0));let _=DeleteDC(dc);
            result.unwrap();if actual!=expanded{failures.push(format!("angle {angle}, scale {scale}: {actual:?} != {expanded:?}"));}
          }
        }
        assert!(failures.is_empty(),"{}",failures.join("; "));
    }}
}
