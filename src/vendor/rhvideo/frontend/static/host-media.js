/* HTML media semantics backed by a native decoder. Queue/navigation remain in
 * app.js, identically on web and desktop. No video frames cross this bridge. */
(() => {
    'use strict';
    if (!window.RHVideoHost?.media) return;
    const driver = RHVideoHost.media, slots = new Map(), elements = new WeakMap();
    const proto = HTMLMediaElement.prototype, original = new Map();
    const attr = Element.prototype.getAttribute, setAttr = Element.prototype.setAttribute, removeAttr = Element.prototype.removeAttribute;
    const read = (node, key) => original.get(key)?.get?.call(node);
    const event = (node, name) => node.dispatchEvent(new Event(name));
    let polling = false, closed = false, timer;
    function failure(slot, error) {
        if (!slot.node.isConnected || slot.retired) return;
        slot.error = {code: 4, message: String(error?.message || error)};
        event(slot.node, 'error');
    }
    function send(slot, command, value) {
        const revision = slot.revision;
        slot.serial = slot.serial.catch(() => {}).then(async () => {
            if (revision !== slot.revision || slot.retired || !slot.input) return;
            const result = await driver.request('control', {key: slot.key, revision, expectedInput: slot.input, command, value});
            if (revision === slot.revision) update(slot, result);
        });
        return slot.serial;
    }
    function update(slot, state) {
        if (!state?.opened || slot.retired) return;
        slot.input = state.inputId;
        const before = slot.state; slot.state = state;
        if (!slot.metadata && (state.durationMs > 0 || state.videoWidth > 0)) {
            slot.metadata = true; event(slot.node, 'loadedmetadata'); event(slot.node, 'durationchange');
        }
        if (!slot.data && state.renderedFrames > 0) {
            slot.data = true; event(slot.node, 'loadeddata'); event(slot.node, 'canplay'); event(slot.node, 'canplaythrough');
        }
        if (slot.seeking !== null && state.pendingSeekMs == null && !state.restoringPausedFrame && Math.abs(state.positionMs / 1000 - slot.seeking) < 1) {
            slot.seeking = null; event(slot.node, 'seeked');
        }
        if (state.positionMs !== before.positionMs) event(slot.node, 'timeupdate');
        if (state.state === 7 || state.presentationError || state.seekError) {
            if (!slot.error) failure(slot, Error(state.presentationError || state.seekError || '原生解码失败'));
        } else if (state.state === 6 && !slot.ended) {
            slot.ended = true;
            if (slot.node.loop) { slot.node.currentTime = 0; void slot.node.play().catch(error => failure(slot, error)); }
            else { slot.paused = true; event(slot.node, 'ended'); }
        } else if (state.state === 3 && before.state !== 3) event(slot.node, 'playing');
    }
    function source(slot, value) {
        value = String(value || '');
        const old = slot.revision, previous = slot.src;
        slot.revision++; slot.src = value; slot.input = null; slot.error = null; slot.metadata = false; slot.data = false;
        slot.state = {}; slot.ended = false; slot.seeking = null;
        if (previous) void driver.request('close', {key: slot.key, revision: old}).catch(error => console.warn('Native media cleanup failed', error.message));
        if (!value) { slot.serial = Promise.resolve(); event(slot.node, 'emptied'); return; }
        const revision = slot.revision;
        event(slot.node, 'loadstart');
        slot.serial = Promise.resolve(driver.request('open', {key: slot.key, revision, path: value, paused: slot.paused,
            seconds: 0, volume: slot.muted ? 0 : slot.volume * 100, rate: slot.rate})).then(result => {
            if (revision !== slot.revision || slot.retired) return;
            update(slot, result); schedule();
        }).catch(error => { if (revision === slot.revision) failure(slot, error); throw error; });
        // Event handlers, not an unhandled promise, report an asynchronous src failure.
        void slot.serial.catch(() => {}); schedule();
    }
    function adopt(node) {
        if (!(node instanceof HTMLVideoElement)) return null;
        let slot = elements.get(node); if (slot) return slot;
        slot = {node, key: crypto.randomUUID(), revision: 0, input: null, src: '', serial: Promise.resolve(), state: {},
            paused: !node.autoplay, volume: read(node, 'volume') ?? 1, muted: read(node, 'muted') || node.hasAttribute('muted'),
            rate: 1, seeking: null, metadata: false, data: false, ended: false, error: null, retired: false};
        elements.set(node, slot); slots.set(slot.key, slot);
        const value = attr.call(node, 'src'); removeAttr.call(node, 'src');
        if (value) source(slot, value);
        if (node.controls) controls(slot);
        return slot;
    }
    function retire(slot) {
        slot.retired = true; slots.delete(slot.key); slot.toolbar?.remove();
        if (slot.src) void driver.request('close', {key: slot.key, revision: slot.revision, expectedInput: slot.input || undefined}).catch(error => console.warn('Native media release failed', error.message));
        elements.delete(slot.node);
    }
    function bounds(slot) {
        const node = slot.node, r = node.getBoundingClientRect();
        let visible = !document.hidden && !!node.getClientRects().length, opacity = 1;
        for (let p = node; p && p instanceof Element; p = p.parentElement) {
            const style = getComputedStyle(p);
            if (style.visibility === 'hidden' || style.display === 'none') visible = false;
            opacity *= Number(style.opacity || 1);
        }
        // Native planes must not cover another modal, toolbar or context menu.
        const top = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, r.x + r.width / 2)), Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2)));
        if (top && top !== node && !node.contains(top) && !top.contains(node) && !top.closest('.rh-native-media-controls')) visible = false;
        const x = Math.max(0, r.x), y = Math.max(0, r.y), width = Math.max(1, Math.min(innerWidth, r.right) - x), height = Math.max(1, Math.min(innerHeight, r.bottom) - y);
        if (r.bottom <= 0 || r.right <= 0 || r.y >= innerHeight || r.x >= innerWidth) visible = false;
        if (slot.toolbar) {
            Object.assign(slot.toolbar.style, {left: x + 'px', top: Math.max(y, Math.min(innerHeight - 38, r.bottom - 38)) + 'px', width: width + 'px', display: visible ? 'flex' : 'none'});
            slot.playButton.textContent = slot.paused ? '▶' : 'Ⅱ';
            if (document.activeElement !== slot.seekBar) slot.seekBar.value = String(slot.state.durationMs > 0 ? slot.state.positionMs / slot.state.durationMs * 1000 : 0);
        }
        return {key: slot.key, revision: slot.revision, expectedInput: slot.input, x, y, width,
            height: Math.max(1, height - (slot.toolbar ? 38 : 0)), visible, opacity, viewportWidth: innerWidth,
            rotation: node.classList.contains('rotated') ? 90 : 0};
    }
    async function tick() {
        if (polling || closed) return; polling = true;
        try {
            for (const slot of slots.values()) if (!slot.node.isConnected) retire(slot);
            const active = [...slots.values()].filter(slot => slot.src && !slot.retired && !slot.error);
            if (!active.length) return;
            const result = await driver.request('state', {});
            for (const row of result) {
                const slot = slots.get(row.key); if (slot && row.revision === slot.revision) update(slot, row.state);
            }
            const items = active.filter(slot => slot.input).map(bounds);
            if (items.length) await driver.request('bounds', {items});
        } catch (error) {
            for (const slot of slots.values()) if (slot.src && !slot.error) failure(slot, error);
        } finally { polling = false; if ([...slots.values()].some(slot => slot.src && !slot.error)) schedule(); }
    }
    function schedule() { if (!closed) { clearTimeout(timer); const moving=[...slots.values()].some(s=>s.src&&!s.error&&(!s.paused||!s.data||s.seeking!==null)); timer = setTimeout(tick, document.hidden ? 1000 : moving ? 100 : 1000); } }
    function controls(slot) {
        // These controls also have regular DOM events and are enumerable via RHVideo.ui.
        const bar = document.createElement('div'); bar.className = 'rh-native-media-controls'; bar.style.display='none';
        const play = document.createElement('button'); play.type = 'button'; play.setAttribute('aria-label', '播放或暂停');
        play.addEventListener('click', () => { if (slot.paused) void slot.node.play().catch(error => failure(slot, error)); else slot.node.pause(); });
        const seek = document.createElement('input'); seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0; seek.setAttribute('aria-label', '播放进度');
        seek.addEventListener('change', () => { if (slot.state.durationMs > 0) slot.node.currentTime = Number(seek.value) / 1000 * slot.state.durationMs / 1000; });
        const full = document.createElement('button'); full.type = 'button'; full.textContent = '⛶'; full.setAttribute('aria-label', '全屏');
        full.addEventListener('click', () => { void (document.fullscreenElement ? document.exitFullscreen() : slot.node.parentElement.requestFullscreen()).catch(error => failure(slot, error)); });
        bar.append(play, seek, full); document.body.append(bar); slot.toolbar = bar; slot.playButton = play; slot.seekBar = seek;
    }
    function property(name, get, set) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name); original.set(name, descriptor);
        Object.defineProperty(proto, name, {configurable: true, get() { const slot = adopt(this); return slot ? get(slot) : descriptor.get.call(this); },
            ...(set ? {set(value) { const slot = adopt(this); if (slot) set(slot, value); else descriptor.set.call(this, value); }} : {})});
    }
    property('src', s => s.src, source);
    property('currentSrc', s => s.src);
    property('paused', s => s.paused);
    property('ended', s => s.ended);
    property('error', s => s.error);
    property('readyState', s => s.data ? 4 : s.metadata ? 1 : 0);
    property('networkState', s => s.error ? 3 : s.src ? s.data ? 1 : 2 : 0);
    property('duration', s => s.state.durationMs > 0 ? s.state.durationMs / 1000 : NaN);
    property('currentTime', s => s.seeking ?? (s.state.positionMs || 0) / 1000, (s, value) => {
        if (!Number.isFinite(Number(value)) || value < 0) throw new TypeError('Invalid media time');
        s.seeking = Number(value); s.ended = false; event(s.node, 'seeking');
        void send(s, 'seek', Math.round(value * 1000)).catch(error => failure(s, error));
    });
    property('seeking', s => s.seeking !== null);
    property('volume', s => s.volume, (s, value) => { if (!(value >= 0 && value <= 1)) throw new RangeError('Volume must be 0–1'); s.volume = Number(value); void send(s, 'volume', s.muted ? 0 : Math.round(value * 100)).catch(error => failure(s, error)); event(s.node, 'volumechange'); });
    property('muted', s => s.muted, (s, value) => { s.muted = !!value; void send(s, 'volume', s.muted ? 0 : Math.round(s.volume * 100)).catch(error => failure(s, error)); event(s.node, 'volumechange'); });
    property('playbackRate', s => s.rate, (s, value) => { if (!(value >= .25 && value <= 4)) throw new RangeError('Rate must be .25–4'); s.rate = Number(value); void send(s, 'rate', value).catch(error => failure(s, error)); event(s.node, 'ratechange'); });
    for (const [name, get] of [['videoWidth', s => s.state.videoWidth || 0], ['videoHeight', s => s.state.videoHeight || 0]]) {
        Object.defineProperty(HTMLVideoElement.prototype, name, {configurable: true, get() { return get(adopt(this)); }});
    }
    const play = proto.play, pause = proto.pause, load = proto.load;
    proto.play = function() { const s = adopt(this); if (!s) return play.call(this); s.paused = false; s.ended = false; event(this, 'play'); return send(s, 'resume'); };
    proto.pause = function() { const s = adopt(this); if (!s) return pause.call(this); s.paused = true; event(this, 'pause'); void send(s, 'pause').catch(error => failure(s, error)); };
    proto.load = function() { const s = adopt(this); if (!s) return load.call(this); if (s.src) source(s, s.src); };
    Element.prototype.setAttribute = function(name, value) { if (this instanceof HTMLVideoElement && name.toLowerCase() === 'src') { source(adopt(this), value); return; } return setAttr.call(this, name, value); };
    Element.prototype.removeAttribute = function(name) { if (this instanceof HTMLVideoElement && name.toLowerCase() === 'src') { source(adopt(this), ''); return; } return removeAttr.call(this, name); };
    const observer = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) if (node instanceof Element) { if (node instanceof HTMLVideoElement) adopt(node); node.querySelectorAll('video').forEach(adopt); }
        }
        schedule();
    });
    document.querySelectorAll('video').forEach(adopt); observer.observe(document.body, {subtree: true, childList: true});
    window.addEventListener('pagehide', () => { closed = true; clearTimeout(timer); observer.disconnect(); for (const slot of slots.values()) retire(slot); });
    window.addEventListener('resize', schedule); document.addEventListener('scroll', schedule, true);
    document.addEventListener('visibilitychange', schedule);
    window.RHVideoNativeMedia = Object.freeze({snapshot: () => [...slots.values()].map(s => ({key: s.key, revision: s.revision, elementId: s.node.id, src: s.src, input: s.input, error: s.error, state: s.state}))});
})();
