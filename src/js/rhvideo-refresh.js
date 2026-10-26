/* Read-only, single-flight refresh. Never replays a write or runs off-screen. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RHVideoRefresh = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  class Loop {
    constructor({
      run,
      visible,
      changed = () => {},
      delay = 3000,
      timers = globalThis,
    }) {
      Object.assign(this, { run, visible, changed, delay, timers });
      this.timer = null;
      this.revision = 0;
      this.running = false;
      this.enabled = false;
      this.failures = 0;
      this.error = "";
    }
    state() {
      return {
        enabled: this.enabled,
        running: this.running,
        scheduled: this.timer !== null,
        paused: !this.visible(),
        failures: this.failures,
        error: this.error,
      };
    }
    configure(enabled, reset = false) {
      this.enabled = !!enabled;
      if (reset) {
        this.revision++;
        this.failures = 0;
        this.error = "";
      }
      if (this.timer !== null) this.timers.clearTimeout(this.timer);
      this.timer = null;
      if (this.enabled && this.visible() && !this.running && this.failures < 3)
        this.timer = this.timers.setTimeout(
          () => {
            this.timer = null;
            void this.tick();
          },
          this.delay * 2 ** this.failures,
        );
      this.changed(this.state());
    }
    async tick() {
      if (
        this.running ||
        !this.enabled ||
        !this.visible() ||
        this.failures >= 3
      )
        return;
      const revision = this.revision;
      this.running = true;
      this.changed(this.state());
      try {
        const active = await this.run();
        if (revision === this.revision) {
          this.enabled = !!active;
          this.failures = 0;
          this.error = "";
        }
      } catch (error) {
        if (revision === this.revision) {
          this.failures++;
          this.error = String(error.message || error);
        }
      } finally {
        this.running = false;
        this.configure(this.enabled);
      }
    }
    stop() {
      this.configure(false, true);
    }
  }
  return { Loop };
});
