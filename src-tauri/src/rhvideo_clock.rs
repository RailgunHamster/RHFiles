//! Interpolate coarse libVLC 3 input timestamps ONLY between presented frames.
//! Small, completely cached/video-only inputs can stop emitting time updates
//! while the video output is still presenting. A network stall must not advance
//! this clock just because wall time passes.
pub struct Clock {
    position: f64,
    last_frame: u64,
    waiting: bool,
    raw: i64,
    ignored_raw: Option<i64>,
    pub rate: f64,
}
impl Clock {
    pub fn new() -> Self {
        Self {
            position: 0.,
            last_frame: 0,
            waiting: true,
            raw: 0,
            ignored_raw: None,
            rate: 1.,
        }
    }
    pub fn reset(&mut self, position: i64, frame: u64) {
        self.position = position.max(0) as f64;
        self.last_frame = frame;
        self.waiting = true;
        self.ignored_raw = Some(self.raw);
    }
    pub fn discontinuity(&mut self) {
        self.waiting = true;
    }
    pub fn observe(&mut self, raw: i64, duration: i64, state: i32, frame: u64) -> i64 {
        if self.ignored_raw.is_some_and(|old| old != raw) {
            self.ignored_raw = None;
        }
        if self.ignored_raw != Some(raw) && raw != self.raw && raw as f64 > self.position + 1000. {
            self.position = raw.max(0) as f64;
        }
        self.raw = raw;
        if state == 3 && frame > self.last_frame {
            let delta = frame - self.last_frame;
            if !self.waiting && delta <= 1500 {
                self.position += delta as f64 * self.rate;
            }
            self.waiting = false;
        } else if state != 3 {
            self.waiting = true;
        }
        self.last_frame = frame;
        if state == 6 && duration > 0 {
            self.position = duration as f64;
        }
        if duration > 0 {
            self.position = self.position.clamp(0., duration as f64);
        }
        self.position.max(0.) as i64
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn presented_frames_advance_a_coarse_input_clock() {
        let mut c = Clock::new();
        assert_eq!(c.observe(0, 10000, 3, 100), 0);
        assert_eq!(c.observe(250, 10000, 3, 350), 250);
        assert_eq!(c.observe(250, 10000, 3, 1100), 1000);
    }
    #[test]
    fn wall_time_without_presentations_does_not_fake_progress() {
        let mut c = Clock::new();
        c.observe(0, 10000, 3, 100);
        assert_eq!(c.observe(0, 10000, 3, 100), 0);
        assert_eq!(c.observe(0, 10000, 3, 100), 0);
        assert_eq!(c.observe(250, 10000, 3, 10100), 0);
    }
    #[test]
    fn pause_and_buffering_do_not_count_the_gap() {
        let mut c = Clock::new();
        c.observe(0, 10000, 3, 100);
        c.observe(250, 10000, 3, 350);
        c.observe(250, 10000, 4, 350);
        assert_eq!(c.observe(250, 10000, 3, 900), 250);
        assert_eq!(c.observe(250, 10000, 3, 1000), 350);
    }
    #[test]
    fn backward_seek_does_not_reapply_a_stale_native_anchor() {
        let mut c = Clock::new();
        c.observe(5000, 10000, 3, 100);
        c.reset(0, 100);
        assert_eq!(c.observe(5000, 10000, 3, 100), 0);
        assert_eq!(c.observe(0, 10000, 3, 200), 0);
        assert_eq!(c.observe(250, 10000, 3, 450), 250);
    }
    #[test]
    fn rate_and_end_are_bounded_by_real_presentations() {
        let mut c = Clock::new();
        c.rate = 2.;
        c.observe(0, 1000, 3, 100);
        assert_eq!(c.observe(0, 1000, 3, 400), 600);
        assert_eq!(c.observe(250, 1000, 3, 900), 1000);
        assert_eq!(c.observe(250, 1000, 6, 900), 1000);
    }
}
