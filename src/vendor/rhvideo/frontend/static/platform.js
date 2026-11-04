/* The only platform boundary. Application code never imports a desktop SDK. */
(() => {
    'use strict';
    const assets = new URL('.', document.currentScript.src);
    const browserFetch = window.fetch.bind(window);
    const platform = window.RHVideoPlatform;
    const browserAuth = {
        token: () => localStorage.getItem('rhvideo_token') || '',
        async login(credentials) {
            const response = await browserFetch('/api/v1/auth/login', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(credentials),
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.detail || '登录失败');
            localStorage.setItem('rhvideo_token', data.access_token);
            return data.access_token;
        },
        logout() { localStorage.removeItem('rhvideo_token'); },
    };
    const host = window.RHVideoHost = Object.freeze({
        protocol: 1,
        native: !!platform,
        ready: platform?.ready || Promise.resolve(),
        apiBase: () => location.origin + '/api/v1',
        asset: value => platform ? platform.asset(value) : value,
        staticURL: value => new URL(value, assets).href,
        get storage() { return platform?.storage || localStorage; },
        auth: platform?.auth || browserAuth,
        saveFile: (...args) => platform?.saveFile(...args),
        download: (...args) => platform?.download(...args),
        get media() { return platform?.media; },
        // Deliberately not a general command/eval/native-shell interface.
    });
    if (platform) {
        window.fetch = (input, options) => {
            const url = new URL(input instanceof Request ? input.url : String(input), location.href);
            if (url.origin === location.origin && (url.pathname.startsWith('/api/v1/') || url.pathname === '/openapi.json')) {
                return platform.fetch(input, options);
            }
            if (url.origin === location.origin && url.pathname.startsWith('/static/')) return browserFetch(new URL(url.pathname.slice(8) + url.search, assets), options);
            return browserFetch(input, options);
        };
    }
})();
