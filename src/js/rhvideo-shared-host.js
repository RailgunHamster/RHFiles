/* Platform capabilities only. The complete UI comes from the RHVideo artifact. */
(() => {
    'use strict';
    const mobile = !!window.RHVideoBridge;
    const browserFetch = window.fetch.bind(window);
    let serial = 0, generation, state = {}, accountEpoch = 0, token = '', preferences = {}, stored = {}, saveTimer;
    const pending = new Map();
    if (mobile) window.RHVideoBridge.onmessage = event => {
        let reply; try { reply = JSON.parse(event.data); } catch { return; }
        const job = pending.get(reply.id); if (!job) return;
        pending.delete(reply.id); clearTimeout(job.timer); reply.error ? job.reject(Error(reply.error)) : job.resolve(reply.result);
    };
    function transport(action, args) {
        if (!mobile) return window.__TAURI__.core.invoke('rhvideo_request', {action, args});
        return new Promise((resolve, reject) => {
            const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('媒体请求超时；未自动重试')); }, 55000);
            pending.set(id, {resolve, reject, timer});
            try { window.RHVideoBridge.postMessage(JSON.stringify({id, action, args})); }
            catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
        });
    }
    function native(action, args = {}) {
        const scope = generation;
        return transport(action, scope && !['state', 'restore', 'connect', 'register'].includes(action) ? {...args, _sessionGeneration: scope} : args);
    }
    const storage = {
        get length() { return Object.keys(stored).length; }, key: i => Object.keys(stored)[i] ?? null,
        getItem: key => Object.hasOwn(stored, key) ? preferenceURLs(stored[key],false) : null,
        setItem(key, value) {
            if (!/^rhvideo[_.]/.test(key) || /token/i.test(key)) throw Error('不能在界面偏好中保存凭据');
            const next = {...stored, [key]: preferenceURLs(String(value),true)};
            if (JSON.stringify(next).length > 128 * 1024) throw Error('界面偏好超过 128 KB');
            stored = next; scheduleSave();
        },
        removeItem(key) { delete stored[key]; scheduleSave(); }, clear() { stored = {}; scheduleSave(); },
    };
    function preferenceURLs(raw,saving){
        if(!state.mediaBase)return raw;
        const visit=value=>{
            if(Array.isArray(value))return value.map(visit);
            if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,value])=>[key,visit(value)]));
            if(typeof value==='string'){
                if(saving&&value.startsWith(state.mediaBase))return '/'+logical(value);
                if(!saving&&value.startsWith('/storage/'))return asset(value);
            }return value;
        };
        try{return JSON.stringify(visit(JSON.parse(raw)));}catch{return raw;}
    }
    function scheduleSave() {
        clearTimeout(saveTimer); if (!generation) return;
        const epoch = accountEpoch;
        saveTimer = setTimeout(() => { if (epoch === accountEpoch) void native('shared.preferences', {value: stored}).catch(report); }, 200);
    }
    function report(error) {
        const node = document.getElementById('login-msg');
        if (node) { node.textContent = error.message; node.classList.remove('hidden'); }
        else console.error('RHVideo platform:', error.message);
    }
    async function activate(value) {
        state = value; generation = state.generation; token = '';
        stored = {}; preferences = {};
        if (state.connected) {
            state = await native('shared.state');
            if(state.hostProtocol!==1)throw Error('此客户端与共享前端协议不兼容，请更新 RHFiles');
            preferences = state.preferences || {}; stored = {...preferences.sharedUI};
            // A stable non-secret cache partition. Bearers stay in the native vault.
            token = 'native:' + encodeURIComponent(state.server) + ':' + encodeURIComponent(state.username);
        }
        return token;
    }
    function logical(value) {
        const url = new URL(value, location.href);
        if (state.mediaBase && url.href.startsWith(state.mediaBase)) return decodeURIComponent(url.href.slice(state.mediaBase.length));
        const server = state.server && new URL(state.server);
        if (url.origin !== location.origin && url.origin !== server?.origin) throw Error('媒体地址不属于当前服务器');
        return url.pathname.replace(/^\//, '') + url.search;
    }
    function asset(value) {
        if (!value || !state.mediaBase) return '';
        if (/^(blob:|data:)/.test(value)) return value;
        if (value.startsWith(state.mediaBase)) return value;
        try { return state.mediaBase + logical(value).split('/').map(encodeURIComponent).join('/'); }
        catch { return ''; }
    }
    function mapAssets(value, key = '') {
        if (Array.isArray(value)) return value.map(item => mapAssets(item));
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, mapAssets(value, key)]));
        if (typeof value === 'string' && /(^url$|_url$|^thumb$)/.test(key) && /^(\/storage\/|\/api\/v1\/.*(?:thumbnail|preview)\/|https?:)/.test(value)) return asset(value);
        return value;
    }
    async function fetchNative(input, options = {}) {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const request = input instanceof Request ? input : null;
        const url = new URL(request?.url || String(input), location.href);
        const method = String(options.method || request?.method || 'GET').toUpperCase();
        const path = url.pathname + url.search, epoch = accountEpoch;
        if (method === 'GET' && /^\/api\/v1\/(?:duplicates\/preview\/|videos\/[^/]+\/(?:thumbnail|play)(?:\?|$))/.test(path)) {
            return browserFetch(asset(path), {signal: options.signal, cache: 'no-store'});
        }
        const raw = options.body ?? (request && !['GET', 'HEAD'].includes(method) ? await request.text() : undefined);
        const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
        let result;
        if (path === '/api/v1/auth/register') {
            await native('register', {...body, server: document.getElementById('rhvideo-server').value}); result = {status: 200, body: {registered: true}};
        } else result = await native('shared.request', {method, path, ...(body === undefined ? {} : {body})});
        if (options.signal?.aborted || epoch !== accountEpoch) throw new DOMException('Session changed', 'AbortError');
        return new Response([204, 205, 304].includes(result.status) ? null : JSON.stringify(mapAssets(result.body)), {status: result.status, headers: {'Content-Type': 'application/json'}});
    }
    const auth = {
        token: () => token,
        async login(credentials) {
            accountEpoch++; clearTimeout(saveTimer);
            const value = await native('connect', {...credentials, server: document.getElementById('rhvideo-server').value});
            return activate(value);
        },
        async logout() { accountEpoch++; token = ''; clearTimeout(saveTimer); stored = {}; await native('logout'); generation = undefined; },
    };
    let readyState = false;
    const ready = (async () => {
        let restored; try { restored = await native('restore'); } catch (error) { report(error); restored = await native('state'); }
        await activate(restored); return state;
    })();
    const media = {request(action, args = {}) {
        if (action === 'open') args = {...args, path: logical(args.path)};
        return native('shared.media.' + action, args);
    }};
    window.RHVideoPlatform = {ready, storage, auth, asset, fetch: fetchNative, media,
        saveFile: document => native('shared.save', {document}),
        download: id => native('exports.download', {id}),
    };
    window.RHVideoBack = () => {
        if (document.fullscreenElement) { void document.exitFullscreen(); return; }
        const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
        if (dialog) { const cancel = new Event('cancel', {cancelable: true}); if (dialog.dispatchEvent(cancel)) dialog.close(); return; }
        if (window.RHVideo?.ui.state().viewers.length) window.RHVideo.ui.key('Escape'); else void native(mobile ? 'close' : 'shared.close');
    };
    window.addEventListener('DOMContentLoaded', () => {
        const password = document.getElementById('password'); if (!password) return;
        const field = document.createElement('div'); field.className = 'form-group';
        const label = document.createElement('label'); label.textContent = 'RHVideo 服务器地址'; label.htmlFor = 'rhvideo-server';
        const input = document.createElement('input'); input.id = 'rhvideo-server'; input.type = 'url'; input.placeholder = 'http://服务器:8000'; input.autocomplete = 'url';
        field.append(label, input); password.closest('.form-group').before(field);
        const back=document.createElement('button');back.type='button';back.className='btn btn-secondary';back.textContent='返回 RHFiles';
        RHFilesUI.listen(back,'click',()=>api.invoke('rhvideo.close').catch(report),undefined,'rhvideo.shared.close');document.querySelector('.header-actions')?.prepend(back);
        ready.then(() => { input.value = state.server || ''; document.getElementById('username').value = state.username || ''; if (state.loginWarning) report(Error(state.loginWarning)); }).catch(report);
    });
    const api = window.RHFilesAPI, object = {type: 'object'};
    api.provideState('application', () => ({platform: mobile ? 'android' : 'windows', window: 'window-rhvideo', ready: readyState, frontend: 'rhvideo-shared-v1'}));
    api.provideState('rhvideo', () => ({...window.RHVideo?.ui.state(), server: state.server, username: state.username, connected: !!token}));
    api.register('rhvideo.close',()=>native(mobile?'close':'shared.close'),{params:object});
    api.register('rhvideo.connect', async args => { await ready; document.getElementById('rhvideo-server').value = args.server; document.getElementById('username').value = args.username; document.getElementById('password').value = args.password; await window.login(); return {connected: !!token}; }, {params: object});
    const json=value=>value===undefined?null:JSON.parse(JSON.stringify(value));
    api.register('rhvideo.shared.operations', () => json({actions: window.RHVideo.ui.list(), controls: window.RHVideo.ui.controls()}), {params: object});
    api.register('rhvideo.shared.call', async({name, args}) => json(await window.RHVideo.ui.call(name, args || [])), {params: object});
    api.register('rhvideo.shared.api', ({id, options}) => window.RHVideo.api.call(id, options || {}), {params: object});
    api.register('rhvideo.shared.control', ({target, action, value, options}) => window.RHVideo.ui.perform(target, {action, value, ...options}), {params: object});
    api.register('rhvideo.shared.media', () => window.RHVideoNativeMedia?.snapshot() || [], {params: object});
    window.addEventListener('rhvideo-ready', () => {
        readyState = true;
        // Existing command-line callers can enumerate the canonical named UI operations.
        for (const action of window.RHVideo.ui.list()) {
            api.register('rhvideo.ui.' + action.name, async({args = []}) => json(await window.RHVideo.ui.call(action.name, args)), {description: action.description, params: object});
        }
    });
})();
