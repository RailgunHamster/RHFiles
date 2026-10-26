//! Native compatibility presenter for libVLC. Pixels never cross the JS bridge.
use std::{
    cell::UnsafeCell,
    ffi::c_void,
    sync::{
        Condvar, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};
use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Gdi::*,
    UI::WindowsAndMessaging::GetClientRect,
};
struct Pixels {
    bytes: Vec<u8>,
    offset: usize,
    width: u32,
    height: u32,
    pitch: u32,
}
pub struct Frame {
    hwnd: usize,
    gate: Mutex<bool>,
    released: Condvar,
    pixels: UnsafeCell<Pixels>,
    pub count: AtomicU64,
    epoch: Instant,
    pub last_display: AtomicU64,
}
// Every pixel access is protected by gate. The Box address remains stable until
// libvlc_media_player_stop/release has joined all video callbacks.
unsafe impl Send for Frame {}
unsafe impl Sync for Frame {}
impl Frame {
    pub fn new(hwnd: usize) -> Self {
        Self {
            hwnd,
            gate: Mutex::new(false),
            released: Condvar::new(),
            pixels: UnsafeCell::new(Pixels {
                bytes: vec![],
                offset: 0,
                width: 0,
                height: 0,
                pitch: 0,
            }),
            count: AtomicU64::new(0),
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
    pub fn render(&self) {
        let Some(_guard) = self.lease() else {
            return;
        };
        unsafe {
            let pixels = &*self.pixels.get();
            if pixels.bytes.is_empty() {
                return;
            }
            let hwnd = HWND(self.hwnd as *mut c_void);
            let mut rect = RECT::default();
            if GetClientRect(hwnd, &mut rect).is_err() {
                return;
            }
            let width = rect.right.max(1);
            let height = rect.bottom.max(1);
            let scale =
                (width as f64 / pixels.width as f64).min(height as f64 / pixels.height as f64);
            let w = (pixels.width as f64 * scale).round() as i32;
            let h = (pixels.height as f64 * scale).round() as i32;
            let dc = GetDC(Some(hwnd));
            if dc.0.is_null() {
                return;
            }
            let _ = PatBlt(dc, 0, 0, width, height, BLACKNESS);
            let mut info = BITMAPINFO::default();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: (pixels.pitch / 4) as i32,
                biHeight: -(pixels.height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };
            let _ = SetStretchBltMode(dc, COLORONCOLOR);
            StretchDIBits(
                dc,
                (width - w) / 2,
                (height - h) / 2,
                w,
                h,
                0,
                0,
                pixels.width as i32,
                pixels.height as i32,
                Some(pixels.bytes.as_ptr().add(pixels.offset).cast()),
                &info,
                DIB_RGB_COLORS,
                SRCCOPY,
            );
            ReleaseDC(Some(hwnd), dc);
        }
    }
}
struct Lease<'a>(&'a Frame);
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
        let pitch = (*width * 4 + 31) & !31;
        let mut bytes = vec![0u8; (pitch as usize) * (*height as usize) + 31];
        let offset = (32 - (bytes.as_mut_ptr() as usize % 32)) % 32;
        *frame.pixels.get() = Pixels {
            bytes,
            offset,
            width: *width,
            height: *height,
            pitch,
        };
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
        *planes = pixels.bytes.as_mut_ptr().add(pixels.offset).cast();
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
    frame.count.fetch_add(1, Ordering::Relaxed);
    frame
        .last_display
        .store(frame.epoch.elapsed().as_millis() as u64, Ordering::Relaxed);
    frame.render();
}
