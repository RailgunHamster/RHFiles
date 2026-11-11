//! Producer timestamps from the bundled VLC 3 player. Only fixed log templates
//! are inspected. VLC arguments (including paths and HTTP data) are never read.
use libloading::Library;
use serde_json::{json, Value};
use std::{
    ffi::{c_char, c_void, CStr},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Instant,
};

type Pointer = *mut c_void;
type Callback = unsafe extern "C" fn(Pointer, i32, *const c_void, *const c_char, Pointer);
type Context =
    unsafe extern "C" fn(*const c_void, *mut *const c_char, *mut *const c_char, *mut u32);
type Object =
    unsafe extern "C" fn(*const c_void, *mut *const c_char, *mut *const c_char, *mut usize);
type Unset = unsafe extern "C" fn(Pointer);

#[derive(Default)]
struct Timeline {
    input: Option<Instant>,
    play: Option<Instant>,
    read_started: Option<Instant>,
    first_read: Option<Instant>,
    buffer_started: Option<Instant>,
    buffer_done: Option<Instant>,
    decoder_wait_done: Option<Instant>,
    decoders: [Option<(usize, Instant)>; 8],
    decoder_ready: Option<Instant>,
    first_picture: Option<Instant>,
}

impl Timeline {
    fn record(&mut self, module: &[u8], template: &[u8], decoder: Option<usize>, now: Instant) {
        let stage = match (module, template) {
            (
                b"cache_read" | b"cache_block",
                b"starting pre-buffering" | b"starting pre-buffering...",
            ) => &mut self.read_started,
            (b"cache_read" | b"cache_block", text)
                if text.starts_with(b"received first data after ") =>
            {
                &mut self.first_read
            }
            (b"main", b"Buffering %d%%") if self.buffer_done.is_none() => &mut self.buffer_started,
            (b"main", text) if text.starts_with(b"Stream buffering done (") => {
                &mut self.buffer_done
            }
            (b"main", text) if text.starts_with(b"Decoder wait done in ") => {
                &mut self.decoder_wait_done
            }
            (b"main", b"using %s module \"%s\"") => {
                if let Some(id) = decoder {
                    if let Some(slot) = self
                        .decoders
                        .iter_mut()
                        .find(|slot| slot.is_none_or(|(previous, _)| previous == id))
                    {
                        *slot = Some((id, now));
                    }
                }
                return;
            }
            (b"main", b"Received first picture") => {
                if self.first_picture.is_none() {
                    self.decoder_ready = self
                        .decoders
                        .iter()
                        .flatten()
                        .find_map(|(id, ready)| (Some(*id) == decoder).then_some(*ready));
                }
                &mut self.first_picture
            }
            _ => return,
        };
        stage.get_or_insert(now);
    }

    fn snapshot(&self, output: Option<Instant>, remote_read: Option<Instant>) -> Value {
        let span = |start: Option<Instant>, end: Option<Instant>| {
            Some(end?.checked_duration_since(start?)?.as_millis() as u64)
        };
        json!({
            "inputSwitchMs":span(self.input,self.play),
            "firstReadMs":span(self.play,self.first_read.or(remote_read)),
            "readWaitMs":span(self.read_started,self.first_read),
            "bufferingMs":span(self.buffer_started,self.buffer_done),
            "decoderWaitMs":span(self.buffer_done,self.decoder_wait_done),
            "decodeMs":span(self.decoder_ready,self.first_picture),
            "decodedAtMs":span(self.play,self.first_picture),
            "outputMs":span(self.first_picture,output),
        })
    }
}

struct Probe {
    context: Context,
    object: Object,
    active: AtomicBool,
    timeline: Mutex<Timeline>,
}

pub(super) struct Binding {
    instance: usize,
    unset: Unset,
    probe: Box<Probe>,
}

unsafe extern "C" fn log(
    data: Pointer,
    _level: i32,
    context: *const c_void,
    template: *const c_char,
    _args: Pointer,
) {
    if data.is_null() || context.is_null() || template.is_null() {
        return;
    }
    let probe = unsafe { &*data.cast::<Probe>() };
    if !probe.active.load(Ordering::Acquire) {
        return;
    }
    let mut module = std::ptr::null();
    unsafe {
        (probe.context)(
            context,
            &mut module,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
    }
    if module.is_null() {
        return;
    }
    let module = unsafe { CStr::from_ptr(module) }.to_bytes();
    if !matches!(module, b"main" | b"cache_read" | b"cache_block") {
        return;
    }
    let template = unsafe { CStr::from_ptr(template) }.to_bytes();
    let decoder = if module == b"main"
        && matches!(
            template,
            b"using %s module \"%s\"" | b"Received first picture"
        ) {
        let mut name = std::ptr::null();
        let mut id = 0;
        unsafe {
            (probe.object)(context, &mut name, std::ptr::null_mut(), &mut id);
        }
        (!name.is_null() && unsafe { CStr::from_ptr(name) }.to_bytes() == b"decoder").then_some(id)
    } else {
        None
    };
    if let Ok(mut timeline) = probe.timeline.lock() {
        timeline.record(module, template, decoder, Instant::now());
    }
}

impl Binding {
    pub(super) fn install(library: &Library, instance: usize) -> Option<Self> {
        unsafe {
            let set = *library
                .get::<unsafe extern "C" fn(Pointer, Callback, Pointer)>(b"libvlc_log_set\0")
                .ok()?;
            let unset = *library.get::<Unset>(b"libvlc_log_unset\0").ok()?;
            let context = *library.get::<Context>(b"libvlc_log_get_context\0").ok()?;
            let object = *library.get::<Object>(b"libvlc_log_get_object\0").ok()?;
            let mut binding = Self {
                instance,
                unset,
                probe: Box::new(Probe {
                    context,
                    object,
                    active: AtomicBool::new(false),
                    timeline: Mutex::default(),
                }),
            };
            set(
                instance as Pointer,
                log,
                (&mut *binding.probe as *mut Probe).cast(),
            );
            Some(binding)
        }
    }

    pub(super) fn start(&self, input: Instant) {
        if let Ok(mut timeline) = self.probe.timeline.lock() {
            *timeline = Timeline {
                input: Some(input),
                play: Some(Instant::now()),
                ..Timeline::default()
            };
            self.probe.active.store(true, Ordering::Release);
        }
    }

    pub(super) fn stop(&self) {
        self.probe.active.store(false, Ordering::Release);
    }

    pub(super) fn snapshot(&self, output: Option<Instant>, remote_read: Option<Instant>) -> Value {
        self.probe
            .timeline
            .lock()
            .map(|timing| timing.snapshot(output, remote_read))
            .unwrap_or(Value::Null)
    }
}

impl Drop for Binding {
    fn drop(&mut self) {
        // libVLC waits for in-flight log callbacks before returning.
        unsafe {
            (self.unset)(self.instance as Pointer);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn timings_keep_overlapping_buffer_and_decode_intervals() {
        let start = Instant::now();
        let at = |ms| start + Duration::from_millis(ms);
        let mut timing = Timeline {
            input: Some(start),
            play: Some(at(5)),
            ..Timeline::default()
        };
        timing.record(b"cache_read", b"starting pre-buffering", None, at(10));
        timing.record(
            b"cache_read",
            b"received first data after %lld ms",
            None,
            at(30),
        );
        timing.record(
            b"cache_read",
            b"received first data after %lld ms",
            None,
            at(50),
        );
        timing.record(b"main", b"using %s module \"%s\"", Some(1), at(34));
        timing.record(b"main", b"using %s module \"%s\"", Some(2), at(38));
        timing.record(b"main", b"Buffering %d%%", None, at(40));
        timing.record(
            b"main",
            b"Stream buffering done (%d ms in %d ms)",
            None,
            at(75),
        );
        timing.record(b"main", b"Received first picture", Some(2), at(64));
        timing.record(b"main", b"Decoder wait done in %d ms", None, at(80));
        let result = timing.snapshot(Some(at(90)), None);
        assert_eq!(result["firstReadMs"], 25);
        assert_eq!(result["readWaitMs"], 20);
        assert_eq!(result["bufferingMs"], 35);
        assert_eq!(result["decoderWaitMs"], 5);
        assert_eq!(result["decodeMs"], 26);
        assert_eq!(result["outputMs"], 26);
        assert!(timing.snapshot(None, None)["outputMs"].is_null());
        timing.first_read = None;
        assert_eq!(timing.snapshot(None, Some(at(14)))["firstReadMs"], 9);
    }
}
