/* Public, local automation interface. No remote commands, eval, or eager scans. */
(() => {
    'use strict';
    const baseline = new Map(Object.entries(Object.getOwnPropertyDescriptors(window)).map(([key, value]) => [key, value.value]));
    const nativeFetch = window.fetch, nativeAdd = EventTarget.prototype.addEventListener, nativeRemove = EventTarget.prototype.removeEventListener;
    const listeners = new WeakMap(), registered = new Map();
    const handlerProperties = new Set();
    for (let prototype of [HTMLElement.prototype, SVGElement.prototype]) {
        for (; prototype; prototype = Object.getPrototypeOf(prototype)) for (const name of Object.getOwnPropertyNames(prototype)) if (/^on[a-z]+$/.test(name)) handlerProperties.add(name);
    }
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const isPrivate = el => el instanceof HTMLInputElement && el.type === 'password' || /password|passwd|secret|token|api.?key|authorization|credential/i.test(el.id + ' ' + (el.name || ''));
    let config, schemaPromise, tracing = false, sequence = 0;
    const records = [];
    let readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });
    class OperationError extends Error {
        constructor(code, message, details) { super(message); this.name = 'OperationError'; this.code = code; if (details !== undefined) this.details = details; }
    }
    function fail(code, message) { throw new OperationError(code, message); }

    // Keep native callbacks/options untouched; WeakRefs do not retain removed views.
    EventTarget.prototype.addEventListener = function(type, callback, options) {
        const result = nativeAdd.call(this, type, callback, options);
        if (callback && (this instanceof Element || this === document || this === window)) {
            const list = listeners.get(this) || [];
            const capture = typeof options === 'boolean' ? options : !!options?.capture;
            if (!list.some(item => item.type === type && item.capture === capture && item.callback.deref() === callback)) {
                list.push({type, capture, callback: new WeakRef(callback), signal: options?.signal && new WeakRef(options.signal)});
                listeners.set(this, list);
            }
        }
        return result;
    };
    EventTarget.prototype.removeEventListener = function(type, callback, options) {
        const capture = typeof options === 'boolean' ? options : !!options?.capture;
        if (listeners.has(this)) listeners.set(this, listeners.get(this).filter(item => item.callback.deref() && !(item.type === type && item.capture === capture && item.callback.deref() === callback)));
        return nativeRemove.call(this, type, callback, options);
    };
    function record(value) {
        const entry = Object.freeze({sequence: ++sequence, at: Date.now(), ...value});
        records.push(entry); if (records.length > 300) records.shift();
        return entry;
    }
    window.fetch = function(input, options) {
        if (!tracing) return nativeFetch.call(this, input, options);
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return nativeFetch.call(this, input, options);
        const started = performance.now(), method = String(options?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        // Never record query strings, headers, credentials, request/response bodies.
        return nativeFetch.call(this, input, options).then(response => {
            record({kind:'http', method, path:url.pathname, status:response.status, elapsed_ms:Math.round(performance.now()-started)});
            return response;
        }, error => { record({kind:'http', method, path:url.pathname, status:null, error:error.name}); throw error; });
    };

    function dereference(spec, value) {
        return value?.$ref ? value.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node?.[key.replace(/~1/g,'/').replace(/~0/g,'~')], spec) : value;
    }
    async function schema({refresh = false} = {}) {
        await ready;
        if (refresh) schemaPromise = null;
        if (!schemaPromise) schemaPromise = fetch('/openapi.json', {cache:'no-store'}).then(async response => {
            if (!response.ok) fail('SCHEMA_UNAVAILABLE', '无法读取后端接口定义');
            const spec = await response.json();
            if (!spec.paths) fail('INVALID_SCHEMA', '后端没有返回 OpenAPI 定义');
            return spec;
        }).catch(error => { schemaPromise = null; throw error; });
        return schemaPromise;
    }
    function apiOperations(spec) {
        return Object.entries(spec.paths).flatMap(([path, item]) => Object.entries(item).filter(([method]) => /^(get|post|put|patch|delete|head|options)$/.test(method)).map(([method, operation]) => ({
            id:method.toUpperCase()+' '+path, operation_id:operation.operationId, method:method.toUpperCase(), path,
            summary:operation.summary || '', tags:operation.tags || [],
            parameters:[...(item.parameters || []), ...(operation.parameters || [])].map(value => dereference(spec, value)),
            request_body:dereference(spec, operation.requestBody) || null,
            security:operation.security || spec.security || [], responses:operation.responses,
        })));
    }
    function matchOperation(operations, method, path) {
        return operations.find(operation => operation.method === method && operation.path === path) || operations.find(operation => operation.method === method && new RegExp('^'+operation.path.split(/(\{[^}]+\})/).map(part => part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')+'$').test(path));
    }
    const api = {
        schema,
        async list() { return apiOperations(await schema()); },
        async describe(id) {
            const operations = await api.list();
            return operations.find(operation => operation.id === id || operation.operation_id === id) || fail('UNKNOWN_API', '未知业务接口：'+id);
        },
        async call(id, {path = {}, query = {}, body, headers = {}, signal, response: responseType = 'auto'} = {}) {
            const operation = await api.describe(id);
            for (const parameter of operation.parameters.filter(item => item.required)) {
                const source = parameter.in === 'path' ? path : parameter.in === 'query' ? query : parameter.in === 'header' ? headers : null;
                if (source && (source[parameter.name] === undefined || source[parameter.name] === null)) fail('MISSING_PARAMETER', '缺少参数：'+parameter.name);
            }
            if (operation.request_body?.required && body === undefined) fail('MISSING_BODY', '该接口需要请求内容');
            const pathname = operation.path.replace(/\{([^}]+)\}/g, (_, key) => own(path, key) ? encodeURIComponent(String(path[key])) : fail('MISSING_PARAMETER', '缺少路径参数：'+key));
            const url = new URL(pathname, location.origin);
            for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) {
                for (const entry of Array.isArray(value) ? value : [value]) url.searchParams.append(key, typeof entry === 'object' ? JSON.stringify(entry) : String(entry));
            }
            const requestHeaders = new Headers(headers);
            if (!requestHeaders.has('Authorization') && operation.security.length && config.getToken()) requestHeaders.set('Authorization', 'Bearer '+config.getToken());
            let payload = body;
            if (body !== undefined && body !== null && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams) && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
                requestHeaders.set('Content-Type', 'application/json'); payload = JSON.stringify(body);
            }
            const result = await fetch(url.href, {method:operation.method, headers:requestHeaders, body:payload, signal, cache:'no-store'});
            if (responseType === 'raw') return result;
            if (!result.ok) {
                const details = await result.json().catch(() => null);
                throw new OperationError('HTTP_'+result.status, typeof details?.detail === 'string' ? details.detail : '接口请求失败：'+result.status, {status:result.status, detail:details?.detail});
            }
            if (result.status === 204 || result.status === 205) return null;
            if (responseType === 'blob') return result.blob();
            if (responseType === 'text') return result.text();
            return /\bjson\b/i.test(result.headers.get('Content-Type') || '') ? result.json() : result.blob();
        },
    };

    function eventTypes(target) {
        const types = new Set((listeners.get(target) || []).filter(item => item.callback.deref() && !item.signal?.deref()?.aborted).map(item => item.type));
        if (target instanceof Element) {
            for (const attr of target.attributes) if (/^on[a-z]+$/.test(attr.name)) types.add(attr.name.slice(2));
            for (const property of handlerProperties) if (typeof target[property] === 'function') types.add(property.slice(2));
        }
        return [...types].sort();
    }
    function resolve(target) {
        if (target === 'window' || target === window) return window;
        if (target === 'document' || target === document) return document;
        if (target === '@focused') return document.activeElement || document.body;
        if (target instanceof Element && target.isConnected) return target;
        if (typeof target !== 'string') fail('INVALID_TARGET', '请提供控件选择器或 Element');
        let nodes;
        try { nodes = document.querySelectorAll(target); } catch (_) { fail('INVALID_TARGET', '无效的控件选择器'); }
        if (!nodes.length) fail('TARGET_MISSING', '控件不存在：'+target);
        if (nodes.length !== 1) fail('AMBIGUOUS_TARGET', '选择器命中了多个控件，请使用列表中的唯一 id：'+target);
        return nodes[0];
    }
    function selector(el) {
        if (el === window) return 'window';
        if (el === document) return 'document';
        const parts = [];
        while (el && el.nodeType === 1) {
            if (el.id) { parts.unshift('#'+CSS.escape(el.id)); break; }
            let part = el.localName;
            const data = [...el.attributes].filter(attr => /^(data-(ui-action|video-id|tc-entry|tc-view|tc-kind|restart-mode|settings-close|tc-close)|name)$/.test(attr.name));
            if (data.length) {
                part += data.map(attr => '['+attr.name+(attr.value ? '='+CSS.escape(attr.value) : '')+']').join('');
                if (el.parentElement && [...el.parentElement.children].filter(node => node.matches(part)).length > 1) part += ':nth-of-type('+([...el.parentElement.children].filter(node => node.localName === el.localName).indexOf(el)+1)+')';
            }
            else if (el.parentElement) part += ':nth-of-type('+([...el.parentElement.children].filter(node => node.localName === el.localName).indexOf(el)+1)+')';
            parts.unshift(part); el = el.parentElement;
        }
        return parts.join(' > ');
    }
    function visible(el) {
        return el instanceof Element && !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]');
    }
    function describeControl(el) {
        if (el === document || el === window) return {id:selector(el), events:eventTypes(el), actions:['dispatch','key','scroll']};
        const events = eventTypes(el), actions = new Set(['click','dblclick','dispatch','focus','scroll','fullscreen']);
        if (el.matches('input,textarea,select,[contenteditable=true]')) actions.add('set');
        if (el.matches('input[type=checkbox],input[type=radio]')) actions.add('check');
        if (el.matches('input[type=file]')) actions.add('files');
        if (el.matches('video,audio')) actions.add('media');
        const secret = isPrivate(el);
        return {id:selector(el), tag:el.localName, type:el.type || null, role:el.getAttribute('role'),
            label:secret ? '受保护输入框' : (el.getAttribute('aria-label') || el.title || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('alt') || '').trim().slice(0,160),
            visible:visible(el), disabled:el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
            value:secret || el.type === 'file' ? undefined : 'value' in el ? el.value : undefined,
            checked:'checked' in el ? el.checked : undefined, events, actions:[...actions].sort(), private:secret};
    }
    function callableActions() {
        const result = new Map(registered);
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(window))) {
            const value = descriptor.value;
            if (typeof value === 'function' && baseline.get(key) !== value && key !== 'fetch') result.set('app.'+key, {name:'app.'+key, description:'应用操作 '+key, run:value, parameters:value.length});
            if (/^RH[A-Z]/.test(key) && key !== 'RHVideo' && value && typeof value === 'object') {
                for (const [method, fn] of Object.entries(value)) if (typeof fn === 'function') result.set(key+'.'+method, {name:key+'.'+method, description:key+' / '+method, run:fn.bind(value), parameters:fn.length});
            }
        }
        return result;
    }
    function checkTarget(target, force) {
        const el = resolve(target);
        if (!(el instanceof Element)) fail('INVALID_TARGET', '此操作需要元素控件');
        if (!force && (!visible(el) || el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true')) fail('NOT_INTERACTABLE', '控件当前隐藏或禁用');
        return el;
    }
    function dispatch(target, {type, ...options}) {
        const el = resolve(target);
        if (!type || typeof type !== 'string') fail('INVALID_EVENT', '需要事件类型');
        const rect = el instanceof Element ? el.getBoundingClientRect() : {left:0,top:0,width:0,height:0};
        const init = {bubbles:true, cancelable:true, composed:true, clientX:rect.left+rect.width/2, clientY:rect.top+rect.height/2, ...options};
        const Constructor = /^(key)/.test(type) ? KeyboardEvent : /^(pointer)/.test(type) ? PointerEvent : /^(click|dblclick|contextmenu|mouse)/.test(type) ? MouseEvent : type === 'wheel' ? WheelEvent : /^(drag|drop)/.test(type) ? DragEvent : /^(touch)/.test(type) ? TouchEvent : /^(input|beforeinput)/.test(type) ? InputEvent : type.startsWith('focus') ? FocusEvent : own(options,'detail') ? CustomEvent : Event;
        if (Constructor === TouchEvent) for (const key of ['touches','targetTouches','changedTouches']) if (Array.isArray(init[key])) init[key] = init[key].map((point,index) => point instanceof Touch ? point : new Touch({identifier:index, ...point, target:el}));
        return el.dispatchEvent(new Constructor(type, init));
    }
    function setValue(el, value) {
        if (el.matches('input[type=file],input[type=checkbox],input[type=radio]')) fail('INVALID_ACTION', '请使用 files 或 check 接口');
        if (el.isContentEditable) el.textContent = String(value);
        else {
            if (!el.matches('input,textarea,select')) fail('INVALID_ACTION', '此控件不支持设置值');
            const prototype = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, String(value));
            if (el instanceof HTMLSelectElement && el.value !== String(value)) fail('INVALID_VALUE', '该选项不存在');
        }
        dispatch(el, {type:'input', inputType:'insertReplacementText'}); dispatch(el, {type:'change'});
    }
    async function media(target, {command, value}) {
        const el = resolve(target);
        if (!(el instanceof HTMLMediaElement)) fail('INVALID_TARGET', '目标不是音视频播放器');
        if (command === 'play') await el.play();
        else if (command === 'pause') el.pause();
        else if (command === 'toggle') { if (el.paused) await el.play(); else el.pause(); }
        else if (command === 'seek') el.currentTime = Number(value);
        else if (command === 'volume') el.volume = Number(value);
        else if (command === 'muted') el.muted = !!value;
        else if (command === 'rate') el.playbackRate = Number(value);
        else if (command === 'loop') el.loop = !!value;
        else fail('UNKNOWN_ACTION', '未知播放操作：'+command);
        return {paused:el.paused, current_time:el.currentTime, duration:Number.isFinite(el.duration) ? el.duration : null, volume:el.volume, muted:el.muted, rate:el.playbackRate, loop:el.loop};
    }
    const ui = {
        register({name, description = '', parameters = [], run}) {
            if (!/^[a-zA-Z][\w.-]+$/.test(name) || typeof run !== 'function' || callableActions().has(name)) fail('INVALID_REGISTRATION', '操作名称无效或重复');
            registered.set(name, {name, description, parameters, run});
        },
        list() { return [...callableActions().values()].map(({run, ...info}) => info).sort((a,b) => a.name.localeCompare(b.name)); },
        async call(name, args = []) {
            await ready;
            const operation = callableActions().get(name);
            if (!operation) fail('UNKNOWN_ACTION', '未知前端操作：'+name);
            if (!Array.isArray(args)) fail('INVALID_ARGUMENTS', '参数应为数组');
            if (tracing) record({kind:'ui', action:name});
            return await operation.run(...args);
        },
        controls({scope = document, visible: onlyVisible = false, all = false} = {}) {
            const root = resolve(scope);
            const nodes = [...(root.querySelectorAll?.('*') || [])].filter(el => all || el.matches('button,input,select,textarea,a[href],summary,video,audio,img,canvas,[role=button],[role=checkbox],[role=slider],[role=menuitem],[tabindex],[contenteditable=true],[data-ui-action],[data-image-preview]') || eventTypes(el).length);
            if (root instanceof Element) nodes.unshift(root);
            return nodes.filter(el => !onlyVisible || visible(el)).map(describeControl);
        },
        read(target) { return describeControl(resolve(target)); },
        async perform(target, {action = 'click', value, force = false, ...options} = {}) {
            await ready;
            if (tracing) record({kind:'ui', action});
            if (action === 'dispatch') return dispatch(target, options);
            if (action === 'scroll') return ui.scroll(target, options);
            if (action === 'key') return ui.key(value, {target, ...options});
            if (action === 'media') return media(target, {value, ...options});
            const el = checkTarget(target, force);
            if (action === 'click') { el.click(); return; }
            if (action === 'dblclick') return dispatch(el, {type:'dblclick', detail:2, ...options});
            if (action === 'focus') { el.focus(); return; }
            if (action === 'set') { setValue(el, value); return; }
            if (action === 'check') {
                if (!el.matches('input[type=checkbox],input[type=radio]')) fail('INVALID_ACTION', '目标不是复选或单选框');
                if (el.type === 'radio' && el.checked && !value) fail('INVALID_VALUE', '单选框不能单独取消，请选择同组其他选项');
                if (el.checked !== !!value) el.click(); return;
            }
            if (action === 'files') {
                if (!el.matches('input[type=file]')) fail('INVALID_ACTION', '目标不是文件输入框');
                const transfer = new DataTransfer();
                for (const file of value) transfer.items.add(file instanceof File ? file : new File([file.bytes], file.name, {type:file.type || 'application/octet-stream'}));
                el.files = transfer.files; dispatch(el, {type:'input'}); dispatch(el, {type:'change'}); return;
            }
            if (action === 'fullscreen') return el.requestFullscreen();
            fail('UNKNOWN_ACTION', '未知控件操作：'+action);
        },
        dispatch,
        key(key, {target = '@focused', ...options} = {}) {
            const el = resolve(target);
            const accepted = dispatch(el, {type:'keydown', key, ...options});
            if (accepted && key === 'Enter' && el instanceof Element && el.matches('button,a[href],summary')) el.click();
            dispatch(el, {type:'keyup', key, ...options}); return accepted;
        },
        scroll(target, {top, left, behavior = 'instant'} = {}) {
            const el = resolve(target);
            (el === document ? window : el).scrollTo({top, left, behavior});
        },
        media,
        async fullscreen(target = null) { return target ? resolve(target).requestFullscreen() : document.fullscreenElement ? document.exitFullscreen() : undefined; },
        state() { return config?.state?.() || {}; },
        async waitFor(condition, {timeout = 5000, interval = 40, signal} = {}) {
            const deadline = performance.now()+timeout;
            while (true) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                let value;
                if (typeof condition === 'function') value = await condition();
                else {
                    const nodes = document.querySelectorAll(condition.target), el = nodes[0];
                    value = (condition.count !== undefined ? nodes.length === condition.count : condition.visible === false || !!el) && (condition.visible === undefined || (!!el && visible(el)) === condition.visible) && (condition.enabled === undefined || !!el && !el.matches(':disabled') === condition.enabled) && (condition.text === undefined || !!el?.textContent.includes(condition.text)) && (condition.value === undefined || el?.value === condition.value);
                }
                if (value) return value;
                if (performance.now() >= deadline) fail('WAIT_TIMEOUT', '等待界面条件超时');
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        },
    };
    const contract = {
        async audit() {
            await ready;
            const operations = await api.list(), controls = ui.controls();
            const unmapped = records.filter(item => item.kind === 'http' && !matchOperation(operations, item.method, item.path));
            const duplicates = controls.filter((item,index) => controls.findIndex(other => other.id === item.id) !== index).map(item => item.id);
            const invalid = controls.flatMap(item => {try {resolve(item.id);return [];} catch(error) {return [{id:item.id, code:error.code}];}});
            return {ok:!unmapped.length && !duplicates.length && !invalid.length, backend_operations:operations.length, named_ui_operations:ui.list().length, controls:controls.length, unmapped_requests:unmapped, duplicate_controls:duplicates, invalid_controls:invalid,
                global_events:{document:eventTypes(document),window:eventTypes(window)}};
        },
    };
    const trace = {start(){records.length=0;tracing=true;}, stop(){tracing=false;return records.slice();}, read(){return records.slice();}, clear(){records.length=0;}};
    Object.defineProperty(window, 'RHVideo', {value:Object.freeze({version:'1.0.0', ready, api:Object.freeze(api), ui:Object.freeze(ui), contract:Object.freeze(contract), trace:Object.freeze(trace), OperationError,
        init(options) {if (config) fail('ALREADY_INITIALIZED', '接口已经初始化'); config = options; readyResolve();}}), writable:false, configurable:false});
})();
