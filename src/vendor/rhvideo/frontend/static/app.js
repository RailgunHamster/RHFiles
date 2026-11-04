        const API_BASE = RHVideoHost.apiBase();
        const RHVIDEO_DEBUG = true;
         function rhDebug(event, details) {
             if (RHVIDEO_DEBUG && window.console) console.log(`[RHVideo][picture-delete] ${event}`, details || {});
         }
         let token = RHVideoHost.auth.token();
         const PAGE_VOLUME_DEFAULT = 0.2;
         let pageVolume = PAGE_VOLUME_DEFAULT;
         function clampPageVolume(value, fallback) {
             value = parseFloat(value);
             if (!isFinite(value)) value = fallback;
             return Math.min(1, Math.max(0, value));
         }
         function pageVolumeKey() {
             return 'rhvideo_page_volume_' + (token || 'guest');
         }
         function updatePageVolumeControl() {
             const slider = document.getElementById('page-volume-slider');
             const label = document.getElementById('page-volume-value');
             if (slider) slider.value = String(pageVolume);
             if (label) label.textContent = Math.round(pageVolume * 100) + '%';
         }
         function loadPageVolumePreference() {
             let saved = null;
             try { saved = RHVideoHost.storage.getItem(pageVolumeKey()); } catch (e) {}
             pageVolume = clampPageVolume(saved, PAGE_VOLUME_DEFAULT);
             updatePageVolumeControl();
             applyPageVolumeToVideos();
         }
         function savePageVolumePreference() {
             try { RHVideoHost.storage.setItem(pageVolumeKey(), String(pageVolume)); } catch (e) {}
         }
         function pageVolumeApply(video, baseVolume) {
             if (!video) return;
             let base = parseFloat(baseVolume);
             if (!isFinite(base)) base = parseFloat(video.dataset.rhvideoBaseVolume);
             if (!isFinite(base)) base = Number.isFinite(video.volume) ? video.volume : 1;
             base = clampPageVolume(base, 1);
             video.dataset.rhvideoBaseVolume = String(base);
             video.dataset.rhvideoApplyingPageVolume = 'true';
             try { video.volume = base * pageVolume; } finally { delete video.dataset.rhvideoApplyingPageVolume; }
         }
         function pageVolumeBind(video, baseVolume) {
             if (!video) return;
             if (isFinite(parseFloat(baseVolume))) video.dataset.rhvideoBaseVolume = String(clampPageVolume(baseVolume, 1));
             if (video.dataset.rhvideoPageVolumeBound !== 'true') {
                 if (!video.dataset.rhvideoBaseVolume) {
                     video.dataset.rhvideoBaseVolume = String(clampPageVolume(video.volume, 1));
                 }
                 video.dataset.rhvideoPageVolumeBound = 'true';
                 video.addEventListener('volumechange', function() {
                     if (video.dataset.rhvideoApplyingPageVolume === 'true' || pageVolume <= 0) return;
                     video.dataset.rhvideoBaseVolume = String(clampPageVolume(video.volume / pageVolume, 1));
                 });
             }
             pageVolumeApply(video);
         }
         function applyPageVolumeToVideos() {
             document.querySelectorAll('video').forEach(function(video) {
                 const cell = video.closest && video.closest('.grid-video-cell');
                 if (cell && typeof gridApplyVideoVolume === 'function') gridApplyVideoVolume(video);
                 else pageVolumeBind(video);
             });
         }
         function setPageVolume(value) {
             pageVolume = clampPageVolume(value, PAGE_VOLUME_DEFAULT);
             updatePageVolumeControl();
             savePageVolumePreference();
             applyPageVolumeToVideos();
         }
        let allVideos = [];
        let videosLoadPromise = null;
        let replacementJobs = [];
        let replacementJobsPromise = null;
        let processingProgress = { default: [], replacement: [] };
        let processingProgressReceivedAt = 0;
        let processingProgressError = '';
        let queueStatusSnapshot = { queue: null, current: null };
        let replacementSelectedId = null;
        let replaceSubmissionKey = null;
        let replaceSubmitting = false;
        let replaceReceiptMismatch = false;
        let replaceEstimateRequest = 0;
        let videosLoadedData = null;
        const libraryIndexCache = new Map();
        const searchRenderTickets = new Map();
        const searchInputTimers = new Map();
        const searchInputIds = { videos: 'search-input', pictures: 'pic-search', novels: 'novel-search', favorites: 'fav-search',
            'grid-tags': 'grid-tag-search', 'novel-toc': 'nv-toc-search', 'novel-excerpts': 'nvp-search' };
        function nextSearchRender(key) {
            document.getElementById(searchInputIds[key])?.setAttribute('aria-busy', 'false');
            const ticket = (searchRenderTickets.get(key) || 0) + 1;
            searchRenderTickets.set(key, ticket);
            return ticket;
        }
        function scheduleSearch(event, key, callback) {
            nextSearchRender(key);
            event.target.setAttribute('aria-busy', 'false');
            clearTimeout(searchInputTimers.get(key));
            if (event.isComposing) return;
            searchInputTimers.set(key, setTimeout(callback, 85));
        }
        async function searchCatalog(collection, records, fields, query, literal = []) {
            const input = document.getElementById(searchInputIds[collection]), ticket = searchRenderTickets.get(collection);
            if (input) input.setAttribute('aria-busy', 'true');
            try { return await RHSearch.filter(collection, records, fields, query, token, literal); }
            catch (error) {
                if (error.name === 'AbortError') return [];
                if (token) notify('拼音索引加载失败，请刷新后重试', 'error');
                return records.filter(record => [...fields, ...literal].some(field => String(record[field] || '').toLowerCase().includes(query.toLowerCase())));
            }
            finally { if (input && ticket === searchRenderTickets.get(collection)) input.setAttribute('aria-busy', 'false'); }
        }
        let gridLoadController = null;
        let gridLoadRequest = 0;
        let gridLoadedData = null;
        let gridLoadedPictures = null;
        let gridLoadedScope = '';
        let gridRefreshPending = false;
        let allFolders = [];
        let mediaTagFilter = RHTagFilter.normalize();
        let mediaTagDrawerSource = 'grid', mediaTagDrawerOpener = null, gridFilterResetPending = false;
        let mediaTagGridTimer = null;
        let mediaTagGroupPath = [];
        let gridTagCountCache = null;
         let retryFailedBusy = false;
         let gridTagRecent = [];
         let gridTagCollapsed = {};
                        let pendingStageDelete = null;
        let pendingStageDeleteStep = 0;
                 let pendingPreviewDeletes = new Map();
                 let previewDeleteExecution = null;
                 let trashItems = [];
                 let currentPage = 1;
        let pageSize = 30;
        let filteredVideos = [];
        let gridPage = 1;
         let selectedGridOrderId = '';
         let gridBaseMedia = [];
         let gridBaseItems = [];
         let gridBaseOrderHash = '';
         const gridOrderHashCache = new WeakMap();
         let currentGridShuffleSeed = null;
         let savedGridOrdersCache = [];
         let savedGridOrdersCacheKey = '';
         let savedGridOrdersLoadPromise = null;
         let savedGridOrdersReady = false;
        let gridPageSize = 30;
        let gridItems = [];
        let allPictures = [];
        let picturesLoaded = false;
        let picturesLoadPromise = null;
        let allPicturesTotal = 0;
        let picMedia = [];
        let picPage = 1;
        let pictureLoadRequest = 0;
        let pictureGridRefreshPending = false;
        let pictureListReloadPending = false;
        let picPageSize = 30;
        // Novels (小说) state
        let allNovels = [];
        let novelsLoaded = false;
        let novelsLoadedData = null;
        let novelsLoadPromise = null;
        let novelPage = 1;
        const novelPageSize = 48;
        let novelRenderFilter = '';
        let storageLoadBusy = false;
        let storagePollTimer = null;
        let watchUsagePollTimer = null;
        let watchUsageBusy = false, watchUsageRequest = 0, watchUsageController = null;
        let watchUsageData = null;
        const watchUsageExpanded = new Set(), watchUsageViews = new Map();
         let nvBook = null;          // 当前打开的小说（详情 + 目录）
        let nvChapterIdx = 0;
        let nvSaveTimer = null;
        let nvScrollRestorePending = 0;
        let nvSettings = { fs: 19, lh: 1.9, theme: 'sepia' };
         let nvPreviewBook = null;
         let nvPreviewItems = [];
         let nvPreviewTotal = 0;
         let nvPreviewFlowIndex = 0;
         let nvPreviewMode = 'list';
         let nvPreviewLoading = false;
         let nvPreviewRequest = 0;
         let nvPreviewBooks = [];
         let nvPreviewBookIndex = -1;
        let noAutoShuffle = false;
        let gridMedia = [];
        let mediaRotated = false;
        // Favorites (喜爱) state — must be declared before showApp() runs below (TDZ)
        let favVideoIds = new Set();
        let favPictureIds = new Set();
        let favNovelIds = new Set();
        let favItems = [];        // raw server items
        let favPage = 1, favCatalogRequest = 0;
        let favRenderFilter = '';
        let favNormItems = [];    // normalized: {mediaType,id,url,thumb,title,info}
        let favMedia = [];        // viewer items for continuous browse
        let favFilter = 'all';    // all | video | picture
        let favSearchTimer = null;
        let favPending = new Map();
        let favListRefreshPending = false;
        let favshowItems = [];
        let favshowIdx = 0;
        let favshowOn = false;
        let favshowCurLayer = 0;
        let favshowEndTimer = null;
        let favshowFadeTimer = null;
        let favshowFrameToken = 0;
        let favshowPlayStartAt = 0;      // performance.now() when the current item started
        let favshowCurrentDwell = 0;     // ms dwelt for the current item
        let favshowPausedElapsed = 0;    // ms elapsed within current item when paused
        let favshowRaf = null;           // progress rAF id
        let globalQueueHidden = true;
        const favshowLayers = [
            document.getElementById('favshow-layer-a'),
            document.getElementById('favshow-layer-b')
        ];

        const _origFetch = window.fetch;
        window.fetch = async function(...args) {
            const res = await _origFetch.apply(this, args);
            if (res.status === 401 && token) { logout(); location.reload(); }
            return res;
        };

        if (token) { showApp(); } else { showLogin(); }

        function showLogin() {
            document.getElementById("login-section").classList.remove("hidden");
            document.getElementById("app").classList.add("hidden");
        }
        function showApp() {
            document.getElementById("login-section").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
            loadPageVolumePreference();
             loadRotationPref();
            const savedPicPage = parseInt(RHVideoHost.storage.getItem('rhvideo_picpage_' + token) || '', 10);
            if (savedPicPage >= 1) picPage = savedPicPage;
            if (RHVideoHost.storage.getItem('rhvideo_mixpics_' + token) === 'true') {
                document.getElementById('mix-pictures').checked = true;
            }
            loadMediaTagFilter();
             loadGridTagPrefs();
             renderGridTagTabs();
             renderNovelTagTabs();
             loadGrid(false);
            loadVideos();
            loadFolders();
            loadFavoriteIds();
            syncGlobalQueueVisibility();
            startQueuePolling();
            startProgressPolling();
            loadReplacementJobs();
        }
        function logout() {
            RHDuplicates.reset();
            RHConfigBackups.reset();
            RHFavoriteExports.reset();
            RHSettings.reset();
            RHStorageSavings.reset();
            RHImagePreview.close();
            RHTaskCenter.close();
            clearTimeout(storagePollTimer);
            clearTimeout(watchUsagePollTimer);
            watchUsageController?.abort(); watchUsageRequest++; watchUsageBusy = false;
            watchUsageData = null; watchUsageExpanded.clear(); watchUsageViews.clear();
            mediaTagFilter = RHTagFilter.normalize(); gridTagCountCache = null;
            RHTagFilter.reset();
            clearTimeout(mediaTagGridTimer);
            gridLoadController?.abort(); gridLoadRequest++; gridRefreshPending = true;
            closeGridTagDrawer(); renderGridTagTabs();
            for (const id of ['watch-usage-list', 'watch-usage-summary', 'watch-usage-status', 'watch-usage-distribution']) document.getElementById(id).textContent = '';
            RHSearch.reset();
            favCatalogRequest++; favItems = []; favNormItems = []; favMedia = [];
            for (const timer of searchInputTimers.values()) clearTimeout(timer);
            for (const key of searchRenderTickets.keys()) nextSearchRender(key);
            token = "";
            Promise.resolve(RHVideoHost.auth.logout()).catch(error => notify(error.message, 'error'));
            if (window._queueTimer) { clearInterval(window._queueTimer); window._queueTimer = null; }
            if (window._progressTimer) { clearInterval(window._progressTimer); window._progressTimer = null; }
            processingProgress = { default: [], replacement: [] };
            processingProgressReceivedAt = 0;
            processingProgressError = '';
            queueStatusSnapshot = { queue: null, current: null };
            replacementJobs = [];
            globalQueueHidden = true;
            syncGlobalQueueVisibility();
            showLogin();
        }
        function showMessage(id, type, text) {
            const el = document.getElementById(id);
            el.className = `alert alert-${type}`;
            el.textContent = text;
            el.classList.remove("hidden");
            setTimeout(() => el.classList.add("hidden"), 4000);
        }
        function notify(msg, type) {
            type = type || 'info';
            const container = document.getElementById('toast-container');
            const el = document.createElement('div');
            el.className = 'toast ' + type;
            el.textContent = msg;
            el.onclick = () => el.remove();
            container.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.remove(); }, 4000);
        }

        async function login() {
            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;
            if (username.length < 3 || password.length < 6) return showMessage("login-msg", "error", "用户名至少3字符，密码至少6字符");
            try {
                token = await RHVideoHost.auth.login({ username, password });
                showApp();
            } catch (e) { showMessage("login-msg", "error", "网络错误: " + e.message); }
        }
        async function register() {
            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;
            if (username.length < 3 || password.length < 6) return showMessage("login-msg", "error", "用户名至少3字符，密码至少6字符");
            try {
                const res = await fetch(`${API_BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email: username + "@temp.com", password }) });
                const data = await res.json();
                if (res.ok) showMessage("login-msg", "success", "注册成功，请登录");
                else showMessage("login-msg", "error", data.detail || "注册失败");
            } catch (e) { showMessage("login-msg", "error", "网络错误: " + e.message); }
        }

        // ============ Custom context menu ============
        const appContextMenu = document.getElementById('app-context-menu');
        let contextMenuReturnFocus = null;

        function closeAppContextMenu(restoreFocus = false) {
            if (appContextMenu.classList.contains('hidden')) return;
            appContextMenu.close();
            appContextMenu.classList.add('hidden');
            appContextMenu.replaceChildren();
            if (restoreFocus && contextMenuReturnFocus?.isConnected) contextMenuReturnFocus.focus({ preventScroll: true });
            contextMenuReturnFocus = null;
        }

        async function copyContextText(text) {
            try {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await navigator.clipboard.writeText(text);
            } catch (error) {
                // Local HTTP deployments may not expose the Clipboard API.
                const previousFocus = document.activeElement;
                const field = document.createElement('textarea');
                field.value = text;
                field.style.cssText = 'position:fixed;left:-9999px;top:0';
                (document.fullscreenElement || document.body).appendChild(field);
                field.select();
                try {
                    if (!document.execCommand('copy')) throw new Error('复制失败，请使用 Ctrl+C');
                } finally {
                    field.remove();
                    previousFocus?.focus({ preventScroll: true });
                }
            }
        }

        function contextMenuItems(target) {
            const items = [];
            const field = target.closest('input, textarea');
            if (field && typeof field.selectionStart === 'number') {
                const start = field.selectionStart;
                const end = field.selectionEnd;
                const selectedText = field.value.slice(start, end);
                const writable = !field.readOnly && !field.disabled;
                const replaceSelection = text => {
                    field.focus({ preventScroll: true });
                    field.setSelectionRange(start, end);
                    field.setRangeText(text, start, end, 'end');
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                };
                items.push({ label: '复制', disabled: !selectedText || field.type === 'password', action: () => copyContextText(selectedText) });
                items.push({ label: '剪切', disabled: !writable || !selectedText || field.type === 'password', action: async () => { await copyContextText(selectedText); replaceSelection(''); } });
                items.push({ label: '粘贴', disabled: !writable, action: async () => {
                    try { replaceSelection(await navigator.clipboard.readText()); }
                    catch (error) { notify('无法读取剪贴板，请使用 Ctrl+V 粘贴', 'info'); }
                } });
                items.push({ label: '全选', disabled: field.disabled, action: () => { field.focus(); field.select(); } });
            } else {
                const selectedText = window.getSelection()?.toString();
                if (selectedText) items.push({ label: '复制所选文字', action: () => copyContextText(selectedText) });
            }

            const row = target.closest('#videos-grid .video-card');
            if (row && !videoMultiSelect) {
                if (items.length) items.push(null);
                row.querySelectorAll('.video-actions button').forEach(button => {
                    const label = button.classList.contains('fav-star')
                        ? (button.classList.contains('active') ? '取消收藏' : '收藏')
                        : (button.classList.contains('btn-danger') ? '删除视频…' : button.textContent.trim());
                    items.push({ label, disabled: button.disabled, danger: button.classList.contains('btn-danger'), action: () => button.click() });
                });
                items.push(null, { label: '多选视频', action: () => { toggleVideoMultiSelect(true); toggleVideoSelect(row.dataset.videoId, true); } });
            } else if (videoMultiSelect && target.closest('#tab-list')) {
                if (items.length) items.push(null);
                if (row) items.push({ label: videoBatchIds.has(row.dataset.videoId) ? '取消选中此视频' : '选中此视频', action: () => toggleVideoSelect(row.dataset.videoId, !videoBatchIds.has(row.dataset.videoId)) });
                items.push(
                    { label: '全选本页', disabled: !currentPageVideos.length, action: selectAllPageVideos },
                    { label: '清空选择', disabled: !videoBatchIds.size, action: clearVideoSelection },
                    { label: '批量替换原片…', disabled: !videoBatchIds.size, action: showBatchReplaceModal },
                    { label: '退出多选', action: () => toggleVideoMultiSelect(false) }
                );
            } else {
                const video = target.closest('video');
                if (video) {
                    if (items.length) items.push(null);
                    items.push(
                        { label: video.paused ? '播放' : '暂停', action: () => video.paused ? video.play() : video.pause() },
                        { label: video.muted ? '取消静音' : '静音', action: () => { video.muted = !video.muted; } }
                    );
                }
                const image = target.closest('img');
                if (image?.currentSrc || image?.src) items.push({ label: '复制图片地址', action: () => copyContextText(image.currentSrc || image.src) });
                const link = target.closest('a[href]');
                if (link) items.push({ label: '复制链接地址', action: () => copyContextText(link.href) });
            }
            if (items.length) items.push(null);
            items.push({ label: '刷新页面', action: () => location.reload() });
            return items;
        }

        document.addEventListener('contextmenu', event => {
            // Capture globally so native video/image/input menus and inline handlers cannot take over.
            event.preventDefault();
            event.stopImmediatePropagation();
            if (appContextMenu.contains(event.target)) return;
            closeAppContextMenu();
            const items = contextMenuItems(event.target);
            contextMenuReturnFocus = document.activeElement;
            items.forEach(item => {
                const element = document.createElement(item ? 'button' : 'div');
                if (!item) {
                    element.className = 'context-menu-divider';
                    element.setAttribute('role', 'separator');
                } else {
                    element.type = 'button';
                    element.setAttribute('role', 'menuitem');
                    element.tabIndex = -1;
                    element.textContent = item.label;
                    element.disabled = !!item.disabled;
                    if (item.danger) element.classList.add('context-menu-danger');
                    element.addEventListener('click', async () => {
                        closeAppContextMenu(true);
                        try { await item.action(); }
                        catch (error) { notify(error.message || '操作失败，请重试', 'error'); }
                    });
                }
                appContextMenu.appendChild(element);
            });
            appContextMenu.style.left = '0px';
            appContextMenu.style.top = '0px';
            appContextMenu.classList.remove('hidden');
            // A modal dialog remains visible and interactive above native video fullscreen.
            if (document.fullscreenElement || document.querySelector('dialog:modal')) appContextMenu.showModal();
            else appContextMenu.show();
            const rect = appContextMenu.getBoundingClientRect();
            const anchor = event.target.getBoundingClientRect();
            const keyboardTriggered = event.button !== 2 && event.clientX === 0 && event.clientY === 0;
            const x = keyboardTriggered ? anchor.left : event.clientX;
            const y = keyboardTriggered ? anchor.bottom : event.clientY;
            appContextMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
            appContextMenu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';
            appContextMenu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
        }, true);

        document.addEventListener('pointerdown', event => {
            if (appContextMenu.classList.contains('hidden')) return;
            const rect = appContextMenu.getBoundingClientRect();
            const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
            if (!appContextMenu.contains(event.target) || outside) closeAppContextMenu();
        }, true);
        document.addEventListener('scroll', event => {
            if (!appContextMenu.contains(event.target)) closeAppContextMenu();
        }, true);
        window.addEventListener('resize', () => closeAppContextMenu());
        window.addEventListener('blur', () => closeAppContextMenu());
        document.addEventListener('fullscreenchange', () => closeAppContextMenu());
        document.addEventListener('keydown', event => {
            if (appContextMenu.classList.contains('hidden')) return;
            // Keep player shortcuts from firing while navigating the menu.
            event.stopImmediatePropagation();
            if (event.key === 'Escape' || event.key === 'Tab') {
                if (event.key === 'Escape') event.preventDefault();
                closeAppContextMenu(true);
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const buttons = Array.from(appContextMenu.querySelectorAll('button:not(:disabled)'));
                const current = buttons.indexOf(document.activeElement);
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                    : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
                buttons[index]?.focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!event.repeat) appContextMenu.querySelector('button:focus')?.click();
            }
        }, true);

        // ============ Tabs ============
        function switchTab(tab) {
            ['list','grid','pictures','novels','favorites','duplicates','storage'].forEach(id => {
                const el = document.getElementById('tab-'+id);
                const btn = document.getElementById('tab-btn-'+id);
                if (el) el.classList.toggle('hidden', tab !== id);
                if (btn) btn.classList.toggle('active', tab === id);
            });
            if (tab === 'favorites' && !favItems.length) loadFavorites();
            if (tab === 'duplicates') RHDuplicates.show(); else RHDuplicates.hide();
            if (tab === 'novels' && !novelsLoaded) loadNovels();
            if (tab === 'storage') { loadStorageUsage(); loadWatchFolderUsage(); RHStorageSavings.load(); }
            else { clearTimeout(storagePollTimer); clearTimeout(watchUsagePollTimer); RHStorageSavings.stop(); }
            if (tab === 'list') {
                if (!allVideos.length) loadVideos();
                else filterVideos(false);
                if (!watchFoldersLoaded) loadWatchFolders();
            }
            if (tab === 'pictures' && !picturesLoaded) loadPictures();
            else if (tab === 'pictures') renderPictures();
            if (tab === 'novels' && novelsLoaded) renderNovels();
            if (tab === 'favorites' && favItems.length) renderFavorites();
            if (tab === 'grid' && gridRefreshPending) loadGrid(false);
            clearHighlight();
        }

        function clearHighlight() {
            document.querySelectorAll('.video-card').forEach(c => {
                c.style.outline = ''; c.style.boxShadow = ''; c.style.background = '';
            });
        }

        // ============ Folders ============
        async function loadFolders() {
            try {
                const res = await fetch(`${API_BASE}/videos/folders`);
                allFolders = await res.json();
                renderFolderTabs();
            } catch (e) { console.error(e); }
        }
        function renderFolderTabs() {
            const container = document.getElementById('folder-tabs');
            if (container) {
                container.innerHTML = '';
                container.classList.add('hidden');
            }
            renderGridTagTabs();
        }
        function gridTagPrefsKey() {
            return 'rhvideo_grid_tag_prefs_' + (token || '');
        }
        function mediaTagStorageKey() {
            let subject = token || '';
            try { subject = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || subject; } catch (_) {}
            return 'rhvideo_media_tag_filter_' + subject;
        }
        function loadMediaTagFilter() {
            try {
                const stored = RHVideoHost.storage.getItem(mediaTagStorageKey());
                const legacy = RHVideoHost.storage.getItem('rhvideo_folder_' + (token || '')) || RHVideoHost.storage.getItem('rhvideo_novel_folder_' + (token || ''));
                mediaTagFilter = RHTagFilter.normalize(stored ? JSON.parse(stored) : { include: legacy ? [legacy] : [] });
            } catch (_) { mediaTagFilter = RHTagFilter.normalize(); }
            mediaTagGroupPath = [];
        }
        function mediaTagPath(value) { return value === '' ? [] : String(value).split('.').map(Number); }
        function mediaTagNode(root = mediaTagFilter, path = mediaTagGroupPath) {
            let node = root;
            for (const index of path) {
                if (!Number.isInteger(index) || index < 0) return null;
                node = node?.groups?.[index];
            }
            return node || null;
        }
        function selectMediaTagGroup(path) {
            const next = mediaTagPath(path);
            if (mediaTagNode(mediaTagFilter, next)) mediaTagGroupPath = next;
            renderGridTagDrawer();
        }
        function addMediaTagGroup(path) {
            const value = structuredClone(mediaTagFilter), parent = mediaTagPath(path);
            const node = mediaTagNode(value, parent);
            if (!node) return;
            node.groups ||= []; node.groups.push({ mode: 'or', include: [], exclude: [] });
            const previous = mediaTagGroupPath;
            mediaTagGroupPath = [...parent, node.groups.length - 1];
            if (!updateMediaTagFilter(value)) mediaTagGroupPath = previous;
        }
        function removeMediaTagGroup(path) {
            const indexes = mediaTagPath(path), parent = indexes.slice(0, -1);
            const value = structuredClone(mediaTagFilter), node = mediaTagNode(value, parent);
            if (!indexes.length || !node?.groups?.[indexes.at(-1)]) return;
            node.groups.splice(indexes.at(-1), 1); mediaTagGroupPath = parent;
            updateMediaTagFilter(value);
        }
        function setMediaTagGroupMode(path, mode) {
            const value = structuredClone(mediaTagFilter), node = mediaTagNode(value, mediaTagPath(path));
            if (!node) return;
            node.mode = mode; updateMediaTagFilter(value);
        }
        function handleMediaRuleAction(event) {
            const control = event.target.closest('[data-rule-action]');
            if (!control) return;
            const { ruleAction: action, rulePath: path } = control.dataset;
            if (action === 'mode') { if (event.type === 'change') setMediaTagGroupMode(path, control.value); }
            else if (event.type === 'click') {
                if (action === 'select') selectMediaTagGroup(path);
                else if (action === 'add') addMediaTagGroup(path);
                else if (action === 'remove') removeMediaTagGroup(path);
            }
        }
        function updateMediaTagFilter(value) {
            const previous = RHTagFilter.key(mediaTagFilter);
            try { mediaTagFilter = RHTagFilter.normalize(value); }
            catch (error) { notify(error.message, 'error'); return false; }
            if (!mediaTagNode()) mediaTagGroupPath = [];
            try { RHVideoHost.storage.setItem(mediaTagStorageKey(), JSON.stringify(mediaTagFilter)); } catch (_) {}
            renderGridTagTabs();
            if (previous !== RHTagFilter.key(mediaTagFilter)) {
                currentPage = picPage = novelPage = favPage = 1;
                for (const tab of ['list', 'pictures', 'novels', 'favorites']) {
                    if (!document.getElementById('tab-' + tab).classList.contains('hidden')) {
                        ({ list: filterVideos, pictures: renderPictures, novels: renderNovels, favorites: renderFavorites })[tab]();
                    }
                }
                gridRefreshPending = true; gridFilterResetPending = true;
                gridLoadController?.abort(); gridLoadRequest++;
                clearTimeout(mediaTagGridTimer);
                if (!document.getElementById('tab-grid').classList.contains('hidden')) mediaTagGridTimer = setTimeout(() => {
                    if (token && !document.getElementById('tab-grid').classList.contains('hidden')) loadGrid();
                }, 150);
            }
            if (document.getElementById('grid-tag-drawer').classList.contains('open')) renderGridTagDrawer();
            return true;
        }
        function setMediaTagMode(mode) { updateMediaTagFilter({ ...mediaTagFilter, mode }); }
        function clearMediaTagFilter() { mediaTagGroupPath = []; updateMediaTagFilter({ mode: mediaTagFilter.mode, include: [], exclude: [] }); }
        function toggleMediaTag(label, kind = 'include', path = mediaTagGroupPath) {
            const value = structuredClone(mediaTagFilter), node = mediaTagNode(value, path);
            if (!node || !['include', 'exclude'].includes(kind)) return;
            const other = kind === 'include' ? 'exclude' : 'include';
            if (node[kind].includes(label)) node[kind] = node[kind].filter(item => item !== label);
            else { node[kind].push(label); node[other] = node[other].filter(item => item !== label); }
            gridTagRecent = [label, ...gridTagRecent.filter(item => item !== label)].slice(0, 30);
            saveGridTagPrefs(); updateMediaTagFilter(value);
        }
        function handleMediaTagChip(event) {
            const button = event.target.closest('button[data-tag-label], button[data-tag-group]');
            if (!button) return;
            const container = button.closest('.media-tag-chips');
            const groupPath = button.dataset.tagPath || '';
            if (button.dataset.tagGroup !== undefined) removeMediaTagGroup(button.dataset.tagGroup);
            else toggleMediaTag(button.dataset.tagLabel, button.dataset.tagKind, mediaTagPath(button.dataset.tagPath || ''));
            const groupControl = [...document.querySelectorAll('#media-tag-rule-tree [data-rule-action=select]')].find(control => control.dataset.rulePath === groupPath);
            const fallback = !container.id ? groupControl || document.getElementById('media-rule-root-select') : container.id === 'media-tag-selected' ? document.querySelector('[data-tag-mode][aria-pressed=true]') : document.getElementById(container.id.replace('-chips', '-current'));
            (container.isConnected && container.querySelector('button') || fallback)?.focus({ preventScroll: true });
        }
        function mediaTagChips(node = mediaTagFilter, path = [], includeGroups = true) {
            const tags = ['include', 'exclude'].flatMap(kind => node[kind].map(label => `<button type="button" class="media-tag-chip ${kind}" data-tag-label="${favEsc(label)}" data-tag-kind="${kind}" data-tag-path="${path.join('.')}" aria-label="移除${kind === 'exclude' ? '排除' : '包含'}标签：${favEsc(label)}" title="${favEsc(label)}"><small>${kind === 'exclude' ? 'NOT' : node.mode.toUpperCase()}</small><span>${favEsc(label)}</span><i aria-hidden="true">×</i></button>`)).join('');
            const groups = includeGroups ? (node.groups || []).map((group, i) => RHTagFilter.active(group) ? `<button type="button" class="media-tag-chip group" data-tag-group="${[...path, i].join('.')}" aria-label="移除分组${i + 1}" title="${favEsc(RHTagFilter.describe(group))}"><small>${node.mode.toUpperCase()}</small><span>(${favEsc(RHTagFilter.describe(group))})</span><i aria-hidden="true">×</i></button>` : '').join('') : '';
            return tags + groups;
        }
        function renderMediaRuleTree(node = mediaTagFilter, path = []) {
            return (node.groups || []).map((group, i) => {
                const indexes = [...path, i], key = indexes.join('.'), name = '分组 ' + indexes.map(value => value + 1).join('.');
                return `<section class="media-rule-group ${key === mediaTagGroupPath.join('.') ? 'editing' : ''}"><div class="media-rule-group-head">
                    <button type="button" data-rule-action="select" data-rule-path="${key}" aria-pressed="${key === mediaTagGroupPath.join('.')}" aria-label="向${name}添加标签">${name}</button>
                    <select data-rule-action="mode" data-rule-path="${key}" aria-label="${name}组合方式"><option value="and" ${group.mode === 'and' ? 'selected' : ''}>全部满足 AND</option><option value="or" ${group.mode === 'or' ? 'selected' : ''}>任一满足 OR</option></select>
                    <button type="button" data-rule-action="add" data-rule-path="${key}" aria-label="在${name}添加子分组">＋ 子组</button><button type="button" data-rule-action="remove" data-rule-path="${key}" aria-label="移除${name}">×</button></div>
                    <div class="media-tag-chips" data-rh-click="h306" data-rh-a-h306="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null])}">${mediaTagChips(group, indexes, false)}</div>${!RHTagFilter.active(group) ? '<p class="media-rule-empty">在下方选择标签加入本组，空分组不影响结果。</p>' : ''}${renderMediaRuleTree(group, indexes)}</section>`;
            }).join('');
        }

        function loadGridTagPrefs() {
            try {
                const prefs = JSON.parse(RHVideoHost.storage.getItem(gridTagPrefsKey()) || '{}');
                gridTagRecent = Array.isArray(prefs.recent) ? prefs.recent.map(String) : [];
                gridTagCollapsed = prefs.collapsed && typeof prefs.collapsed === 'object' ? prefs.collapsed : {};
                const sort = document.getElementById('grid-tag-sort');
                if (sort && ['count-desc', 'name-asc', 'name-desc', 'recent'].includes(prefs.sort)) sort.value = prefs.sort;
            } catch (e) {
                gridTagRecent = [];
                gridTagCollapsed = {};
            }
        }

        function saveGridTagPrefs() {
            try {
                RHVideoHost.storage.setItem(gridTagPrefsKey(), JSON.stringify({
                    recent: gridTagRecent.slice(0, 30),
                    collapsed: gridTagCollapsed,
                    sort: document.getElementById('grid-tag-sort')?.value || 'count-desc',
                }));
            } catch (e) {}
        }

        function mediaTagCatalogs() {
            if (mediaTagDrawerSource === 'pictures') return [{ records: allPictures, kind: 'pictures', unit: '张图' }];
            if (mediaTagDrawerSource === 'novels') return [{ records: allNovels, kind: 'novels', unit: '本小说' }];
            if (mediaTagDrawerSource === 'favorites') return [{ records: favItems, kind: 'favorites', unit: '项喜爱' }];
            const result = [{ records: allVideos, kind: 'videos', unit: '个视频' }];
            if (mediaTagDrawerSource === 'grid' && document.getElementById('mix-pictures')?.checked) result.push({ records: allPictures, kind: 'pictures', unit: '张图' });
            return result;
        }
        function mediaTagCatalogRecord(item) {
            return mediaTagDrawerSource !== 'favorites' || favFilter === 'all' || (item.type || item.media_type) === favFilter;
        }
        function gridTagCounts() {
            const catalogs = mediaTagCatalogs(), records = catalogs.map(catalog => catalog.records);
            const source = mediaTagDrawerSource + ':' + favFilter;
            if (gridTagCountCache && gridTagCountCache.source === source && gridTagCountCache.folders === allFolders && gridTagCountCache.records.length === records.length && records.every((value, i) => value === gridTagCountCache.records[i])) return gridTagCountCache.counts;
            const counts = new Map();
            const addLabels = (item, kind) => {
                const labels = RHTagFilter.labels(item.folder_label);
                for (const label of labels) {
                    const row = counts.get(label) || {};
                    row[kind] = (row[kind] || 0) + 1;
                    counts.set(label, row);
                }
            };
            for (const catalog of catalogs) for (const item of catalog.records) if (mediaTagCatalogRecord(item)) addLabels(item, catalog.kind);
            for (const label of (['grid', 'list'].includes(mediaTagDrawerSource) ? allFolders : [])) {
                if (!counts.has(label)) counts.set(label, { videos: 0, pictures: 0 });
            }
            gridTagCountCache = { source, records, folders: allFolders, counts };
            return counts;
        }

        function gridTagRows() {
            const counts = gridTagCounts();
            const available = new Map(counts);
            for (const label of RHTagFilter.terms(mediaTagFilter)) if (!available.has(label)) available.set(label, {});
            const rows = Array.from(available, ([name, count]) => ({
                name,
                ...count,
                count: Object.values(count).reduce((sum, value) => sum + value, 0),
            }));
            const sort = document.getElementById('grid-tag-sort')?.value || 'count-desc';
            if (sort === 'name-asc') rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            else if (sort === 'name-desc') rows.sort((a, b) => b.name.localeCompare(a.name, 'zh-CN'));
            else if (sort === 'recent') rows.sort((a, b) => {
                const ai = gridTagRecent.indexOf(a.name);
                const bi = gridTagRecent.indexOf(b.name);
                return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) || b.count - a.count || a.name.localeCompare(b.name, 'zh-CN');
            });
            else rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
            return rows;
        }

        function gridTagCountText(row) {
            const parts = mediaTagCatalogs().filter(catalog => row[catalog.kind]).map(catalog => row[catalog.kind] + ' ' + catalog.unit);
            return parts.join(' · ') || '0 项';
        }

        function gridTagAllCountText() {
            const parts = mediaTagCatalogs().map(catalog => catalog.records.filter(mediaTagCatalogRecord).length + ' ' + catalog.unit);
            return parts.join(' · ') || '0 项';
        }

        function gridTagJsArg(value) {
            return favEsc(JSON.stringify(String(value)));
        }

        function openGridTagDrawer(source = 'grid') {
            const drawer = document.getElementById('grid-tag-drawer');
            if (!drawer) return;
            mediaTagDrawerSource = source;
            mediaTagDrawerOpener = document.activeElement;
            document.getElementById('grid-tag-panel-title').textContent = ({ list: '视频', grid: '截图', pictures: '图片', novels: '小说', favorites: '喜爱' }[source] || '媒体') + '标签组合筛选';
            drawer.classList.add('open');
            document.body.classList.add('grid-tag-open');
            drawer.setAttribute('aria-hidden', 'false');
            const search = document.getElementById('grid-tag-search');
            if (search) {
                search.value = '';
                setTimeout(() => search.focus(), 80);
            }
            renderGridTagDrawer();
        }

        function closeGridTagDrawer() {
            const drawer = document.getElementById('grid-tag-drawer');
            if (!drawer) return;
            drawer.classList.remove('open');
            document.body.classList.remove('grid-tag-open');
            drawer.setAttribute('aria-hidden', 'true');
            if (drawer.contains(document.activeElement)) mediaTagDrawerOpener?.focus({ preventScroll: true });
        }

        function toggleGridTagGroup(group) {
            gridTagCollapsed[group] = !gridTagCollapsed[group];
            saveGridTagPrefs();
            renderGridTagDrawer();
        }

        function selectGridTag(label) {
            if (label == null) clearMediaTagFilter(); else toggleMediaTag(label);
        }

        function renderGridTagTabs() {
            const active = RHTagFilter.active(mediaTagFilter), nested = !!mediaTagFilter.groups?.some(RHTagFilter.active);
            for (const [prefix, label] of [['grid', '截图'], ['video', '视频'], ['picture', '图片'], ['novel', '小说'], ['favorite', '喜爱']]) {
                const current = document.getElementById(prefix + '-tag-current');
                if (!current) continue;
                current.textContent = active ? (nested ? `组合规则 · ${RHTagFilter.terms(mediaTagFilter).length} 个条件` : `${mediaTagFilter.mode.toUpperCase()} · ${mediaTagFilter.include.length} 包含 / ${mediaTagFilter.exclude.length} 排除`) : `全部${label}`;
                current.classList.toggle('active', active);
                current.title = active ? RHTagFilter.describe(mediaTagFilter) : '所有媒体共用组合规则，支持嵌套 AND / OR 和排除标签';
                document.getElementById(prefix + '-tags-clear').classList.toggle('hidden', !active);
                document.getElementById(prefix + '-tag-chips').innerHTML = mediaTagChips();
            }
        }

        async function renderGridTagDrawer() {
            const ticket = nextSearchRender('grid-tags');
            const list = document.getElementById('grid-tag-list');
            const count = document.getElementById('grid-tag-panel-count');
            if (!list) return;
            const rows = gridTagRows();
            const match = RHTagFilter.compile(mediaTagFilter);
            const parts = mediaTagCatalogs().map(catalog => catalog.records.filter(item => mediaTagCatalogRecord(item) && match(item.folder_label)).length + ' ' + catalog.unit);
            document.getElementById('media-tag-result').textContent = '标签匹配：' + parts.join(' · ') + (mediaTagDrawerSource === 'grid' ? '（截图仅显示已有截图的视频）' : '');
            document.getElementById('media-tag-help').textContent = '主条件可与子分组混合 AND / OR；排除标签作用于所在分组。';
            document.getElementById('media-tag-selected').innerHTML = mediaTagChips(mediaTagFilter, [], false);
            document.getElementById('media-tag-expression').textContent = RHTagFilter.describe(mediaTagFilter);
            if (!mediaTagNode()) mediaTagGroupPath = [];
            const editing = mediaTagNode();
            document.getElementById('media-tag-target').textContent = '正在添加到：' + (mediaTagGroupPath.length ? '分组 ' + mediaTagGroupPath.map(value => value + 1).join('.') : '主条件') + ' · ' + editing.mode.toUpperCase();
            document.getElementById('media-rule-root-select').setAttribute('aria-pressed', String(!mediaTagGroupPath.length));
            const tree = document.getElementById('media-tag-rule-tree'), treeScroll = tree.scrollTop;
            const treeFocus = tree.contains(document.activeElement) ? { action: document.activeElement.dataset.ruleAction, path: document.activeElement.dataset.rulePath } : null;
            tree.innerHTML = renderMediaRuleTree(); tree.scrollTop = treeScroll;
            if (treeFocus) ([...tree.querySelectorAll('[data-rule-action]')].find(control => control.dataset.ruleAction === treeFocus.action && control.dataset.rulePath === treeFocus.path) || document.getElementById('media-rule-root-select')).focus({ preventScroll: true });
            document.querySelectorAll('[data-tag-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tagMode === mediaTagFilter.mode)));
            const query = (document.getElementById('grid-tag-search')?.value || '').trim().toLowerCase();
            const filtered = query ? await searchCatalog('grid-tags', rows, ['name'], query) : rows;
            if (ticket !== searchRenderTickets.get('grid-tags')) return;
            if (count) count.textContent = rows.length ? rows.length + ' 个标签' : '暂无标签';
            const allActive = !RHTagFilter.active(mediaTagFilter);
            let html = `<button class="grid-tag-item ${allActive ? 'active' : ''}" data-rh-click="h305" data-rh-a-h305="${RHVideoBindings.encode([null,null])}">
                <span class="grid-tag-item-name">不限标签</span><span class="grid-tag-item-count">${gridTagAllCountText()}</span>
            </button>`;
            if (!filtered.length) {
                html += '<div class="empty" style="padding:26px 10px">没有匹配的标签</div>';
            } else {
                const collapsed = !!gridTagCollapsed.all;
                html += `<div class="grid-tag-group">
                    <button class="grid-tag-group-head" data-rh-click="h304" data-rh-a-h304="${RHVideoBindings.encode([null,null])}"><span class="grid-tag-group-chevron">${collapsed ? '▸' : '▾'}</span><span>目录标签</span><span style="margin-left:auto;color:#94a3b8;font-weight:400">${filtered.length}</span></button>`;
                if (!collapsed) html += filtered.map(row => `<div class="media-tag-row"><button type="button" role="checkbox" aria-checked="${editing.include.includes(row.name)}" aria-label="包含标签：${favEsc(row.name)}" data-tag-choice="include" data-tag-label="${favEsc(row.name)}" class="grid-tag-item ${editing.include.includes(row.name) ? 'active' : ''}" data-rh-click="h302" data-rh-a-h302="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null])}" title="${favEsc(row.name)}">
                    <span class="media-tag-check" aria-hidden="true"></span><span class="grid-tag-item-name">${favEsc(row.name)}</span><span class="grid-tag-item-count">${gridTagCountText(row)}</span>
                </button><button type="button" class="media-tag-exclude" aria-pressed="${editing.exclude.includes(row.name)}" aria-label="排除标签：${favEsc(row.name)}" data-tag-choice="exclude" data-tag-label="${favEsc(row.name)}" data-rh-click="h303" data-rh-a-h303="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null])}">排除</button></div>`).join('');
                html += '</div>';
            }
            const focus = list.contains(document.activeElement) ? { label: document.activeElement.dataset.tagLabel, choice: document.activeElement.dataset.tagChoice } : null;
            const scroll = list.scrollTop;
            list.innerHTML = html; list.scrollTop = scroll;
            if (focus?.label) [...list.querySelectorAll('[data-tag-choice]')].find(button => button.dataset.tagLabel === focus.label && button.dataset.tagChoice === focus.choice)?.focus({ preventScroll: true });
        }

        function filterFolder(folder) {
            selectGridTag(folder);
        }

        // ============ Screenshot Grid ============
        async function fetchLibraryIndex(url, signal) {
            const key = token + '|' + url;
            const cached = libraryIndexCache.get(key);
            const headers = { 'Authorization': `Bearer ${token}` };
            if (cached?.etag) headers['If-None-Match'] = cached.etag;
            const res = await fetch(url, { headers, signal, cache: 'no-store' });
            if (res.status === 304 && cached) return cached.data;
            if (!res.ok) throw new Error('加载失败（' + res.status + '）');
            const data = await res.json();
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            libraryIndexCache.delete(key);
            libraryIndexCache.set(key, { data, etag: res.headers.get('ETag') });
            // Keep only the active scopes, not a copy of every slider/filter combination.
            while (libraryIndexCache.size > 4) libraryIndexCache.delete(libraryIndexCache.keys().next().value);
            return data;
        }

        function renderGridCard(media, index) {
            const title = favEsc(media.title || '');
            const info = favEsc(media.info || '');
            const star = media.videoId ? starBtnHtml('video', media.videoId) : starBtnHtml('picture', media.pictureId);
            return `<div class="screenshot-item" data-rh-click="h300" data-rh-a-h300="${RHVideoBindings.encode([index,null,null,null,null,null,null,null])}">
                <img src="${favEsc(media.url)}" loading="lazy" decoding="async" alt="${title}" data-rh-error="h301" data-rh-a-h301="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}">
                ${media.canFavorite === false ? '' : star}
                ${media.videoId ? '<div class="play-icon"></div>' : ''}
                <div class="overlay"><div class="fname" title="${title}">${title}</div><div class="time">${info}</div></div>
            </div>`;
        }

        function updatePerVideoLabel() {
            document.getElementById('per-video-value').textContent = document.getElementById('per-video-slider').value;
        }
        function saveMixPics() {
            RHVideoHost.storage.setItem('rhvideo_mixpics_' + (token || ''), document.getElementById('mix-pictures').checked);
        }
        async function loadGrid(resetPage = true, refreshPictures = false) {
            clearTimeout(mediaTagGridTimer);
            resetPage = resetPage || gridFilterResetPending;
            const requestId = ++gridLoadRequest;
            gridLoadController?.abort();
            const controller = new AbortController();
            gridLoadController = controller;
            const perVideo = document.getElementById('per-video-slider').value;
            const mixPics = document.getElementById('mix-pictures')?.checked || false;
            const filter = RHTagFilter.normalize(mediaTagFilter);
            const matchTags = RHTagFilter.compile(filter);
            const scope = JSON.stringify([perVideo, mixPics, RHTagFilter.key(filter)]);
            const gridEl = document.getElementById('screenshot-grid');
            const loadingEl = document.getElementById('grid-loading');
            loadingEl.classList.remove('hidden');
            try {
                let url = `${API_BASE}/screenshots/grid?compact=true&per_video=${perVideo}`;
                if (RHTagFilter.active(filter)) {
                    const candidate = RHTagFilter.candidate(filter);
                    url += `&tags=${encodeURIComponent(JSON.stringify(candidate))}`;
                    if (filter.groups?.length) url += `&rules=${encodeURIComponent(JSON.stringify(filter))}`;
                    // Older backends still narrow AND candidates by the first
                    // label. Exact shared matching below keeps all modes correct.
                    if (candidate.include.length && (candidate.mode === 'and' || candidate.include.length === 1)) url += `&folder=${encodeURIComponent(candidate.include[0])}`;
                }
                const [data] = await Promise.all([
                    fetchLibraryIndex(url, controller.signal),
                    mixPics && (!picturesLoaded || refreshPictures) ? loadPictures() : (mixPics ? picturesLoadPromise : Promise.resolve()),
                ]);
                if (requestId !== gridLoadRequest) return;
                if (mixPics && !picturesLoaded) throw new Error('图片加载失败，请重试');
                const pictures = mixPics ? allPictures : null;
                if (data === gridLoadedData && pictures === gridLoadedPictures && scope === gridLoadedScope && !noAutoShuffle) {
                    if (resetPage) { gridPage = 1; renderGridPage(); }
                    gridRefreshPending = false; gridFilterResetPending = false;
                    return;
                }
                let totalShots = 0;
                let matchingVideos = 0;
                const nextMedia = [];
                for (const video of data) {
                    if (!matchTags(video.folder)) continue;
                    matchingVideos++;
                    const title = (video.folder ? '['+video.folder+'] ' : '') + video.filename;
                    const shots = video.frames
                        ? video.frames.map(([path, time]) => ({ url: video.base_url + path, time_seconds: time }))
                        : video.screenshots;
                    for (const shot of shots) {
                        totalShots++;
                        const info = formatTime(shot.time_seconds) + ' / ' + formatTime(video.duration);
                        nextMedia.push({ url: shot.url, title, info, videoId: video.video_id });
                    }
                }
                if (mixPics) {
                    const picMedia = [];
                    for (const p of allPictures) {
                        if (!matchTags(p.folder_label)) continue;
                        const title = (p.folder_label ? '['+p.folder_label+'] ' : '') + p.original_filename;
                        const info = (p.original_resolution||'?') + ' | ' + (p.original_filesize/1024/1024).toFixed(1) + 'MB';
                        picMedia.push({ url: RHVideoHost.asset('/storage/' + p.webp_path), title, info, pictureId: p.id, canFavorite: p.can_favorite });
                    }
                    gridMedia = picMedia.concat(nextMedia);
                } else {
                    gridMedia = nextMedia;
                }
                gridItems = gridMedia;
                 gridBaseMedia = gridMedia.slice();
                 gridBaseItems = gridItems.slice();
                 gridBaseOrderHash = gridOrderHash(gridBaseMedia);
                 currentGridShuffleSeed = null;
                restoreShuffleOrder();
                if (!noAutoShuffle && mixPics && gridMedia.some(m => !m.videoId) && !RHVideoHost.storage.getItem('rhvideo_shuffle_' + (token || ''))) {
                    doShuffle();
                }
                noAutoShuffle = false;
                gridPage = resetPage ? 1 : (parseInt(RHVideoHost.storage.getItem('rhvideo_gridpage_' + (token || ''))) || 1);
                renderGridPage();
                gridLoadedData = data;
                gridLoadedPictures = pictures;
                gridLoadedScope = scope;
                gridRefreshPending = false; gridFilterResetPending = false;
                restoreMediaState();
                    document.getElementById('grid-stats').textContent = `${matchingVideos} 个视频 · ${totalShots} 张截图${mixPics ? ` · ${gridMedia.length - totalShots} 张图片` : ''}`;
                if (RHVideoHost.storage.getItem('rhvideo_browse_' + (token || ''))) {
                    document.getElementById('resume-btn').style.display = 'inline-block';
                }
            } catch (e) {
                if (requestId === gridLoadRequest && e.name !== 'AbortError') gridEl.innerHTML = `<p class="empty">加载失败: ${favEsc(e.message)}</p>`;
            } finally {
                if (requestId === gridLoadRequest) loadingEl.classList.add('hidden');
            }
        }

        function renderGridPage() {
            const gridEl = document.getElementById('screenshot-grid');
            const total = gridItems.length;
            const totalPages = Math.ceil(total / gridPageSize) || 1;
            if (gridPage > totalPages) gridPage = totalPages;
            const start = (gridPage - 1) * gridPageSize;
            const pageItems = gridItems.slice(start, start + gridPageSize);
            const emptyText = RHTagFilter.active(mediaTagFilter) ? '没有符合当前标签条件的截图或图片，可调整或清除筛选。' : '暂无截图，请在“视频列表 → 自动监控设置”中添加监控目录';
            gridEl.innerHTML = pageItems.length ? pageItems.map((media, i) => renderGridCard(media, start + i)).join('') : `<p class="empty">${emptyText}</p>`;
            document.getElementById('grid-page-info').textContent = total ? `第 ${gridPage}/${totalPages} 页 (${total}张)` : '';
            document.getElementById('grid-prev').disabled = gridPage <= 1;
            document.getElementById('grid-next').disabled = gridPage >= totalPages;
             updateGridOrderControls();
        }

        function changeGridPage(delta) {
            gridPage += delta;
            RHVideoHost.storage.setItem('rhvideo_gridpage_' + (token || ''), gridPage);
            renderGridPage();
            document.getElementById('screenshot-grid').scrollIntoView({ behavior: 'smooth' });
        }
        function jumpGridPage() {
            const p = parseInt(document.getElementById('grid-page-jump').value);
            if (p >= 1) {
                gridPage = p;
                RHVideoHost.storage.setItem('rhvideo_gridpage_' + (token || ''), gridPage);
                renderGridPage();
                document.getElementById('screenshot-grid').scrollIntoView({ behavior: 'smooth' });
            }
        }

                function gridOrderScopeKey() {
            const mixPictures = document.getElementById('mix-pictures')?.checked || false;
            // Preserve saved orders for the old unfiltered/single-label scopes.
            const filter = mediaTagFilter;
            const scope = !filter.groups?.some(RHTagFilter.active) && !filter.exclude.length && filter.include.length <= 1 ? filter.include[0] || '' : 'tags:' + RHTagFilter.key(filter);
            return scope + '|' + (mixPictures ? 'pictures' : 'videos');
        }

        function gridSavedOrderStorageKey() {
            return 'rhvideo_grid_saved_order_' + (token || '') + '_' + encodeURIComponent(gridOrderScopeKey());
        }

        function gridMediaOrderKey(item) {
            if (!item) return '';
            if (item.pictureId != null) return 'picture:' + String(item.pictureId);
            if (item.videoId != null) return 'video:' + String(item.videoId) + '|url:' + String(item.url || '');
            return 'url:' + String(item.url || '');
        }

        function readSavedGridOrder() {
            try {
                const raw = RHVideoHost.storage.getItem(gridSavedOrderStorageKey());
                if (!raw) return null;
                const saved = JSON.parse(raw);
                if (!saved || !Array.isArray(saved.order) || !saved.order.length) return null;
                return saved;
            } catch (e) {
                return null;
            }
        }

        function updateGridOrderControls() {
             return updateGridOrderControlsV2();
            const saveBtn = document.getElementById('grid-save-order-btn');
            const restoreBtn = document.getElementById('grid-restore-saved-order-btn');
            const status = document.getElementById('grid-order-status');
            const saved = readSavedGridOrder();
            const current = gridMedia.map(gridMediaOrderKey);
            const same = !!saved && saved.order.length === current.length && saved.order.every((key, i) => key === current[i]);
            if (saveBtn) saveBtn.disabled = !gridMedia.length;
            if (restoreBtn) restoreBtn.disabled = !saved || !gridMedia.length;
            if (status) {
                status.classList.toggle('saved', same);
                status.textContent = saved ? (same ? '当前顺序已保存' : '已有保存顺序') : '';
                status.title = saved && saved.savedAt
                    ? '保存时间：' + new Date(saved.savedAt).toLocaleString()
                    : '';
            }
        }

        function saveGridOrder(name) {
             if (typeof name !== 'string') {
                 openGridOrderSaveModal();
                 return false;
             }
             return saveNamedGridOrder(name);
            if (!gridMedia.length) {
                notify('当前没有可保存的截图顺序', 'error');
                return;
            }
            const payload = {
                version: 1,
                savedAt: new Date().toISOString(),
                scope: gridOrderScopeKey(),
                order: gridMedia.map(gridMediaOrderKey),
            };
            try {
                RHVideoHost.storage.setItem(gridSavedOrderStorageKey(), JSON.stringify(payload));
                updateGridOrderControls();
                   notify('已保存当前截图顺序（' + gridMedia.length + ' 项）', 'success');
            } catch (e) {
                notify('保存顺序失败：' + e.message, 'error');
            }
        }

        function applyGridOrder(order) {
            const entries = new Map();
            gridMedia.forEach((media, index) => {
                const key = gridMediaOrderKey(media);
                entries.set(key, { key, media, item: gridItems[index] });
            });
            const nextMedia = [];
            const nextItems = [];
            let matched = 0;
            for (const key of order) {
                const entry = entries.get(key);
                if (!entry) continue;
                nextMedia.push(entry.media);
                nextItems.push(entry.item);
                entries.delete(key);
                matched++;
            }
            for (const entry of entries.values()) {
                nextMedia.push(entry.media);
                nextItems.push(entry.item);
            }
            gridMedia = nextMedia;
            gridItems = nextItems;
            reindexGridItems();
            return matched;
        }

        function restoreSavedGridOrder() {
             return restoreSelectedGridOrder();
            const saved = readSavedGridOrder();
            if (!saved) {
                notify('当前视图还没有保存的顺序', 'error');
                   return;
            }
            const matched = applyGridOrder(saved.order);
            if (!matched) {
                notify('保存的顺序与当前截图没有可匹配的项目', 'error');
                   return;
            }
            RHVideoHost.storage.setItem('rhvideo_shuffle_' + (token || ''), JSON.stringify(gridMedia.map(gridMediaOrderKey)));
            gridPage = 1;
            renderGridPage();
            notify('已恢复保存的截图顺序（匹配 ' + matched + ' 项）', 'success');
        }

                function gridSavedOrdersStorageKey() {
            return 'rhvideo_grid_saved_orders_' + (token || '') + '_' + encodeURIComponent(gridOrderScopeKey());
        }

        function readSavedGridOrders() {
            try {
                const raw = RHVideoHost.storage.getItem(gridSavedOrdersStorageKey());
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        return parsed.filter(order => order && Array.isArray(order.order) && order.order.length).map((order, index) => ({
                            id: String(order.id || ('order-' + index)),
                            name: String(order.name || '未命名顺序'),
                            savedAt: order.savedAt || '',
                            scope: order.scope || gridOrderScopeKey(),
                            order: order.order,
                        }));
                    }
                }
                const legacyRaw = RHVideoHost.storage.getItem(gridSavedOrderStorageKey());
                if (!legacyRaw) return [];
                const legacy = JSON.parse(legacyRaw);
                if (!legacy || !Array.isArray(legacy.order) || !legacy.order.length) return [];
                return [{
                    id: 'legacy',
                    name: '旧保存顺序',
                    savedAt: legacy.savedAt || '',
                    scope: legacy.scope || gridOrderScopeKey(),
                    order: legacy.order,
                }];
            } catch (e) {
                return [];
            }
        }

        function persistSavedGridOrders(orders) {
            RHVideoHost.storage.setItem(gridSavedOrdersStorageKey(), JSON.stringify(orders));
            RHVideoHost.storage.removeItem(gridSavedOrderStorageKey());
        }

        function selectedSavedGridOrder() {
            const orders = readSavedGridOrders();
            return orders.find(order => order.id === selectedGridOrderId) || null;
        }

                const GRID_ORDER_DB_NAME = 'rhvideo-grid-orders';
        const GRID_ORDER_STORE_NAME = 'snapshots';
        let gridOrderDbPromise = null;

        function gridOrderPartitionKey() {
            return (token || '') + '|' + gridOrderScopeKey();
        }

        function openGridOrderDatabase() {
            if (gridOrderDbPromise) return gridOrderDbPromise;
            if (!window.indexedDB) return Promise.reject(new Error('浏览器不支持 IndexedDB'));
            gridOrderDbPromise = new Promise((resolve, reject) => {
                const request = window.indexedDB.open(GRID_ORDER_DB_NAME, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(GRID_ORDER_STORE_NAME)) {
                        const store = db.createObjectStore(GRID_ORDER_STORE_NAME, { keyPath: 'key' });
                        store.createIndex('partition', 'partition', { unique: false });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('无法打开顺序存储'));
            });
            return gridOrderDbPromise;
        }

        function readGridOrdersFromDatabase(partition) {
            return openGridOrderDatabase().then(db => new Promise((resolve, reject) => {
                const transaction = db.transaction(GRID_ORDER_STORE_NAME, 'readonly');
                const request = transaction.objectStore(GRID_ORDER_STORE_NAME).index('partition').getAll(partition);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error || new Error('无法读取保存顺序'));
            }));
        }

        function writeGridOrdersToDatabase(partition, orders) {
            return openGridOrderDatabase().then(db => readGridOrdersFromDatabase(partition).then(existing => new Promise((resolve, reject) => {
                const transaction = db.transaction(GRID_ORDER_STORE_NAME, 'readwrite');
                const store = transaction.objectStore(GRID_ORDER_STORE_NAME);
                const ids = new Set(orders.map(order => order.id));
                existing.forEach(record => {
                    if (!ids.has(record.id)) store.delete(record.key);
                });
                orders.forEach((order, position) => store.put({
                    key: partition + '|' + order.id,
                    partition,
                    id: order.id,
                    name: order.name,
                    savedAt: order.savedAt || '',
                    scope: order.scope || gridOrderScopeKey(),
                    order: order.order,
                    position,
                }));
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error || new Error('无法写入保存顺序'));
                transaction.onabort = () => reject(transaction.error || new Error('保存顺序事务已中止'));
            })));
        }

        function normalizeGridOrderSnapshots(orders) {
            const seen = new Set();
            return (Array.isArray(orders) ? orders : []).filter(order => order && Array.isArray(order.order) && order.order.length).map((order, index) => {
                let id = String(order.id || ('order-' + index));
                while (seen.has(id)) id += '-copy';
                seen.add(id);
                return {
                    id,
                    name: String(order.name || '未命名顺序'),
                    savedAt: order.savedAt || '',
                    scope: order.scope || gridOrderScopeKey(),
                    order: order.order,
                    position: Number.isFinite(order.position) ? order.position : index,
                };
            });
        }

        function readLegacyGridOrdersFromLocalStorage() {
            try {
                const raw = RHVideoHost.storage.getItem(gridSavedOrdersStorageKey());
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) return normalizeGridOrderSnapshots(parsed);
                }
                const legacyRaw = RHVideoHost.storage.getItem(gridSavedOrderStorageKey());
                if (!legacyRaw) return [];
                const legacy = JSON.parse(legacyRaw);
                if (!legacy || !Array.isArray(legacy.order) || !legacy.order.length) return [];
                return normalizeGridOrderSnapshots([{
                    id: 'legacy',
                    name: '旧保存顺序',
                    savedAt: legacy.savedAt || '',
                    scope: legacy.scope || gridOrderScopeKey(),
                    order: legacy.order,
                }]);
            } catch (e) {
                return [];
            }
        }

        function loadSavedGridOrdersForPartition(partition) {
            return readGridOrdersFromDatabase(partition).then(records => {
                const stored = records.sort((a, b) => (a.position || 0) - (b.position || 0));
                if (stored.length) return normalizeGridOrderSnapshots(stored);
                const legacy = readLegacyGridOrdersFromLocalStorage();
                if (!legacy.length) return [];
                return writeGridOrdersToDatabase(partition, legacy).then(() => {
                    try {
                        RHVideoHost.storage.removeItem(gridSavedOrdersStorageKey());
                        RHVideoHost.storage.removeItem(gridSavedOrderStorageKey());
                    } catch (e) {}
                    return legacy;
                });
            });
        }

        function ensureSavedGridOrdersLoaded() {
            const partition = gridOrderPartitionKey();
            if (savedGridOrdersCacheKey === partition && savedGridOrdersReady) return Promise.resolve(savedGridOrdersCache);
            if (savedGridOrdersCacheKey === partition && savedGridOrdersLoadPromise) return savedGridOrdersLoadPromise;
            savedGridOrdersCacheKey = partition;
            savedGridOrdersCache = [];
            savedGridOrdersReady = false;
            const promise = loadSavedGridOrdersForPartition(partition).catch(() => []);
            savedGridOrdersLoadPromise = promise;
            promise.then(orders => {
                if (savedGridOrdersCacheKey !== partition) return;
                savedGridOrdersCache = orders;
                savedGridOrdersReady = true;
                savedGridOrdersLoadPromise = null;
                updateGridOrderControlsV2();
            });
            return promise;
        }

        function readSavedGridOrders() {
            return savedGridOrdersCacheKey === gridOrderPartitionKey() ? savedGridOrdersCache : [];
        }

        async function persistSavedGridOrders(orders) {
            const partition = gridOrderPartitionKey();
            await writeGridOrdersToDatabase(partition, orders);
            if (savedGridOrdersCacheKey === partition) {
                savedGridOrdersCache = normalizeGridOrderSnapshots(orders);
                savedGridOrdersReady = true;
            }
            try {
                RHVideoHost.storage.removeItem(gridSavedOrdersStorageKey());
                RHVideoHost.storage.removeItem(gridSavedOrderStorageKey());
            } catch (e) {}
        }

        function updateGridOrderControlsV2() {
             ensureSavedGridOrdersLoaded();
            const saveBtn = document.getElementById('grid-save-order-btn');
            const restoreBtn = document.getElementById('grid-restore-saved-order-btn');
            const deleteBtn = document.getElementById('grid-delete-saved-order-btn');
            const orderSelect = document.getElementById('grid-saved-order-select');
            const status = document.getElementById('grid-order-status');
            const orders = readSavedGridOrders();
            if (orderSelect) {
                const previous = selectedGridOrderId || orderSelect.value;
                orderSelect.innerHTML = '<option value="">选择已保存顺序' + (orders.length ? '（' + orders.length + '）' : '') + '</option>' +
                    orders.map(order => `<option value="${favEsc(order.id)}">${favEsc(order.name)} · ${order.order.length}项</option>`).join('');
                selectedGridOrderId = orders.some(order => order.id === previous)
                    ? previous
                    : (orders[0] ? orders[0].id : '');
                orderSelect.value = selectedGridOrderId;
            }
            const selected = selectedSavedGridOrder();
            const current = Array.isArray(gridMedia) ? gridMedia.map(gridMediaOrderKey) : [];
            const same = !!selected && selected.order.length === current.length && selected.order.every((key, i) => key === current[i]);
            if (saveBtn) saveBtn.disabled = !current.length;
            if (restoreBtn) restoreBtn.disabled = !selected || !current.length;
            if (deleteBtn) deleteBtn.disabled = !selected;
            if (status) {
                status.classList.toggle('saved', same);
                status.textContent = selected
                    ? (same ? '当前：' + selected.name : '已选：' + selected.name)
                    : (orders.length ? '已保存 ' + orders.length + ' 个顺序' : '');
                status.title = selected && selected.savedAt
                    ? '保存时间：' + new Date(selected.savedAt).toLocaleString()
                    : '';
            }
        }

        function selectGridOrder(id) {
            selectedGridOrderId = id || '';
            updateGridOrderControls();
        }

        function openGridOrderSaveModal() {
            if (!gridMedia.length) {
                notify('当前没有可保存的截图顺序', 'error');
                return;
            }
            const input = document.getElementById('grid-order-name');
            if (input) {
                input.value = '';
                setTimeout(() => { input.focus(); }, 0);
            }
            document.getElementById('grid-order-save-modal').classList.add('show');
        }

        function closeGridOrderSaveModal() {
            document.getElementById('grid-order-save-modal').classList.remove('show');
        }

        function confirmGridOrderSave() {
            const input = document.getElementById('grid-order-name');
            const name = input ? input.value.trim() : '';
            if (!name) {
                notify('请输入顺序名称', 'error');
                if (input) input.focus();
                return;
            }
            if (saveGridOrder(name)) closeGridOrderSaveModal();
        }

        function saveNamedGridOrder(name) {
            const cleanName = String(name || '').trim().slice(0, 80);
            if (!cleanName) {
                notify('请输入顺序名称', 'error');
                return false;
            }
            if (!Array.isArray(gridMedia) || !gridMedia.length) {
                notify('当前没有可保存的截图顺序', 'error');
                return false;
            }
            try {
                const orders = readSavedGridOrders();
                const existingIndex = orders.findIndex(order => order.name === cleanName);
                const existing = existingIndex >= 0 ? orders[existingIndex] : null;
                const snapshot = {
                    id: existing ? existing.id : 'order-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
                    name: cleanName,
                    savedAt: new Date().toISOString(),
                    scope: gridOrderScopeKey(),
                    order: gridMedia.map(gridMediaOrderKey),
                };
                if (existingIndex >= 0) orders[existingIndex] = snapshot;
                else orders.unshift(snapshot);
                persistSavedGridOrders(orders);
                selectedGridOrderId = snapshot.id;
                updateGridOrderControls();
                notify((existing ? '已更新' : '已保存') + '顺序“' + snapshot.name + '”', 'success');
                return true;
            } catch (e) {
                notify('保存顺序失败：' + (e && e.message ? e.message : '无法写入本地存储'), 'error');
                return false;
            }
        }

        function restoreSelectedGridOrder() {
            const saved = selectedSavedGridOrder();
            if (!saved) {
                notify('请先选择要恢复的顺序', 'error');
                updateGridOrderControls();
                return;
            }
            const matched = applyGridOrder(saved.order);
            if (!matched) {
                notify('保存的顺序与当前截图没有可匹配的项目', 'error');
                return;
            }
            try {
                RHVideoHost.storage.setItem('rhvideo_shuffle_' + (token || ''), JSON.stringify(gridMedia.map(gridMediaOrderKey)));
            } catch (e) {}
            gridPage = 1;
            renderGridPage();
            notify('已恢复顺序“' + saved.name + '”（匹配 ' + matched + ' 项）', 'success');
        }

        function deleteSavedGridOrder() {
            const selected = selectedSavedGridOrder();
            if (!selected) {
                notify('请先选择要删除的顺序', 'error');
                return;
            }
            if (!confirm('删除保存的顺序“' + selected.name + '”？')) return;
            const orders = readSavedGridOrders().filter(order => order.id !== selected.id);
            try {
                persistSavedGridOrders(orders);
                selectedGridOrderId = orders[0] ? orders[0].id : '';
                updateGridOrderControls();
                notify('已删除保存顺序“' + selected.name + '”', 'success');
            } catch (e) {
                notify('删除保存顺序失败：' + (e && e.message ? e.message : '无法写入本地存储'), 'error');
            }
        }

        function doShuffle() {
            for (let i = gridItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [gridItems[i], gridItems[j]] = [gridItems[j], gridItems[i]];
                [gridMedia[i], gridMedia[j]] = [gridMedia[j], gridMedia[i]];
            }
            reindexGridItems();
            RHVideoHost.storage.setItem('rhvideo_shuffle_' + (token || ''), JSON.stringify(gridMedia.map(gridMediaOrderKey)));
        }
        function shuffleGrid() {
            doShuffle();
            gridPage = 1;
            renderGridPage();
        }
        function restoreGridOrder() {
            noAutoShuffle = true;
            RHVideoHost.storage.removeItem('rhvideo_shuffle_' + (token || ''));
            loadGrid();
        }

        async function cleanupFrames() {
            const btn = document.getElementById('cleanup-btn');
            btn.disabled = true;
            btn.textContent = '清理中...';
            try {
                const resp = await fetch(`${API_BASE}/screenshots/cleanup`, { method: 'POST' });
                const data = await resp.json();
                notify(`清理完成：${data.cleaned} 个视频，删除了 ${data.removed_frames} 个多余帧`, 'success');
                loadGrid();
            } catch (e) {
                notify('清理失败：' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '清理多余帧';
            }
        }
        function screenshotClicked(videoId) {
            switchTab('list');
            const videos = filteredVideos.length ? filteredVideos : allVideos;
            const idx = videos.findIndex(v => v.id === videoId);
            if (idx >= 0) {
                currentPage = Math.floor(idx / pageSize) + 1;
                renderVideos(videos);
            }
            setTimeout(() => {
                const card = document.querySelector('.video-card[data-video-id="' + videoId + '"]');
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.style.background = '#e8ecff';
                    card.style.outline = '3px solid #5274e8';
                    card.style.boxShadow = '0 0 20px rgba(102,126,234,0.4)';
                    setTimeout(() => { card.style.outline = ''; card.style.boxShadow = ''; card.style.background = ''; }, 3000);
                }
            }, 300);
        }

        // ============ Media Viewer ============
        let mediaItems = [], mediaIndex = 0, mediaStack = [], mediaIsGridSession = false;
        function openMediaViewer(items, idx) {
            mediaItems = items; mediaIndex = idx;
            mediaIsGridSession = items === gridMedia;
            renderMediaItem();
            const viewer = document.getElementById('media-viewer');
            viewer.dataset.imagePreview = items === gridMedia || items === picMedia || items === favMedia ? 'off' : 'on';
            viewer.classList.remove('hidden');
            viewer.addEventListener('touchstart', mediaTouchStart);
            viewer.addEventListener('touchend', mediaTouchEnd);
            viewer.addEventListener('keydown', mediaKeyHandler);
            viewer.addEventListener('wheel', mediaWheelHandler, { passive: false });
            document.addEventListener('keydown', mediaKeyHandler);
        }
        function pushMediaViewer(items, idx) {
            mediaStack.push({ items: mediaItems, index: mediaIndex });
            mediaItems = items; mediaIndex = idx;
            mediaIsGridSession = items === gridMedia;
            renderMediaItem();
        }
        function popMediaViewer() {
            if (!mediaStack.length) return;
            const prev = mediaStack.pop();
            mediaItems = prev.items; mediaIndex = prev.index;
            mediaIsGridSession = mediaItems === gridMedia;
            renderMediaItem();
        }
        function closeMediaViewer(e) {
            if (e && e.target !== e.currentTarget && !e.target.classList.contains('media-close')) return;
            // Save browse position if in grid mode
            if (!mediaStack.length && mediaItems.length) {
                saveBrowsePosition();
            }
            const viewer = document.getElementById('media-viewer');
            viewer.classList.add('hidden');
            document.getElementById('media-content').innerHTML = '';
             document.getElementById('media-content').classList.remove('media-video-active', 'media-sequence-active');
            flushFavoritesRefresh();
            viewer.removeEventListener('touchstart', mediaTouchStart);
            viewer.removeEventListener('touchend', mediaTouchEnd);
            viewer.removeEventListener('keydown', mediaKeyHandler);
            viewer.removeEventListener('wheel', mediaWheelHandler);
            document.removeEventListener('keydown', mediaKeyHandler);
            mediaItems = []; mediaIndex = 0; mediaStack = []; mediaIsGridSession = false;
            document.getElementById('media-controls').style.display = 'none';
             startPreviewDeleteExecution();

            document.getElementById('mv-rot-btn').style.display = 'none';
            if (_rotResizeBound) { window.removeEventListener('resize', _rotResizeBound); _rotResizeBound = null; }
            saveMediaState();
        }
        function saveMediaState() {
            if (mediaItems.length) {
                // Only save video mode (stack-based) state
                const state = { mediaStack: mediaStack.map(s => ({ index: s.index })), mediaIndex };
                RHVideoHost.storage.setItem('rhvideo_media_' + (token || ''), JSON.stringify(state));
            } else {
                RHVideoHost.storage.removeItem('rhvideo_media_' + (token || ''));
            }
        }
        function restoreMediaState() {
            if (!gridMedia.length || !token) return;
            try {
                const raw = RHVideoHost.storage.getItem('rhvideo_media_' + token);
                if (!raw) return;
                const state = JSON.parse(raw);
                if (state.mediaStack && state.mediaStack.length) {
                    mediaItems = []; mediaIndex = 0; mediaStack = []; mediaIsGridSession = false;
                    // Find first matching screenshot for the saved index
                    const savedIdx = state.mediaStack[0].index;
                    if (savedIdx < gridMedia.length) {
                        const item = gridMedia[savedIdx];
                        if (item.videoId) {
                            playVideoLocal(item.videoId);
                            return;
                        }
                    }
                }
            } catch(e) {}
        }
        function restoreShuffleOrder() {
            if (!token) return;
            try {
                const raw = RHVideoHost.storage.getItem('rhvideo_shuffle_' + token);
                if (!raw) return;
                const order = JSON.parse(raw);
                 if (!Array.isArray(order)) return;
                const exact = new Map();
                 const legacy = new Map();
                for (let i = 0; i < gridMedia.length; i++) {
                    const media = gridMedia[i];
                     const entry = { key: gridMediaOrderKey(media), media, item: gridItems[i] };
                     exact.set(entry.key, entry);
                     const legacyKey = media.videoId || media.url;
                     if (!legacy.has(legacyKey)) legacy.set(legacyKey, []);
                     legacy.get(legacyKey).push(entry);
                                    }
                const newMedia = [], newItems = [];
                for (const id of order) {
                     let entry = exact.get(id);
                     if (entry) {
                         newMedia.push(entry.media);
                         newItems.push(entry.item);
                         exact.delete(entry.key);
                         continue;
                     }
                     const candidates = legacy.get(id);
                     while (candidates && candidates.length) {
                         entry = candidates.shift();
                         if (!exact.has(entry.key)) continue;
                         newMedia.push(entry.media);
                         newItems.push(entry.item);
                         exact.delete(entry.key);
                         break;
                     }
                              }
                for (const entry of exact.values()) { newMedia.push(entry.media); newItems.push(entry.item); }
                gridMedia = newMedia; gridItems = newItems;
                reindexGridItems();
            } catch(e) {}
        }
                function gridOrderHash(media) {
            if (Array.isArray(media) && gridOrderHashCache.has(media)) return gridOrderHashCache.get(media);
            let hash = 2166136261;
            (Array.isArray(media) ? media : []).forEach(item => {
                const key = gridMediaOrderKey(item);
                for (let i = 0; i < key.length; i++) {
                    hash ^= key.charCodeAt(i);
                    hash = Math.imul(hash, 16777619);
                }
                hash ^= 124;
                hash = Math.imul(hash, 16777619);
            });
            const result = (hash >>> 0).toString(16);
            if (Array.isArray(media)) gridOrderHashCache.set(media, result);
            return result;
        }

        function generateGridShuffleSeed() {
            try {
                const values = new Uint32Array(1);
                if (window.crypto && window.crypto.getRandomValues) {
                    window.crypto.getRandomValues(values);
                    return values[0].toString(16).padStart(8, '0');
                }
            } catch (e) {}
            return (Math.floor(Math.random() * 0xffffffff) >>> 0).toString(16).padStart(8, '0');
        }

        function seededGridRandom(seed) {
            let state = parseInt(String(seed), 16) >>> 0;
            if (!state) state = 0x6d2b79f5;
            return function() {
                state = (Math.imul(1664525, state) + 1013904223) >>> 0;
                return state / 4294967296;
            };
        }

        function reindexGridItems() {
            // Keep order helpers compatible; markup and click indexes are generated only for the visible page.
            gridItems = gridMedia;
        }

        function applySeedGridOrderLegacy(seed) {
            const baseMedia = gridBaseMedia.length ? gridBaseMedia : gridMedia.slice();
            const baseItems = gridBaseItems.length ? gridBaseItems : gridItems.slice();
            const entries = baseMedia.map((media, index) => ({ media, item: baseItems[index] }));
            const random = seededGridRandom(seed);
            for (let i = entries.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [entries[i], entries[j]] = [entries[j], entries[i]];
            }
            gridMedia = entries.map(entry => entry.media);
            gridItems = entries.map(entry => entry.item);
            reindexGridItems();
            currentGridShuffleSeed = String(seed);
        }

                function gridSeededItemRank(seed, item) {
            let hash = 2166136261;
            const key = String(seed) + '|' + gridMediaOrderKey(item);
            for (let i = 0; i < key.length; i++) {
                hash ^= key.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            return hash >>> 0;
        }

        function applySeedGridOrder(seed) {
            const baseMedia = gridBaseMedia.length ? gridBaseMedia : gridMedia.slice();
            const baseItems = gridBaseItems.length ? gridBaseItems : gridItems.slice();
            const entries = baseMedia.map((media, index) => ({
                media,
                item: baseItems[index],
                index,
                rank: gridSeededItemRank(seed, media),
            }));
            entries.sort((a, b) => a.rank - b.rank || a.index - b.index);
            gridMedia = entries.map(entry => entry.media);
            gridItems = entries.map(entry => entry.item);
            reindexGridItems();
            currentGridShuffleSeed = String(seed);
        }

        function clearLegacyGridOrderStorage() {
            try {
                RHVideoHost.storage.removeItem(gridSavedOrdersStorageKey());
                RHVideoHost.storage.removeItem(gridSavedOrderStorageKey());
            } catch (e) {}
        }

        function gridSeedOrdersStorageKey() {
            return 'rhvideo_grid_seed_orders_' + (token || '') + '_' + encodeURIComponent(gridOrderScopeKey());
        }

        function readSeedGridOrders() {
            try {
                const raw = RHVideoHost.storage.getItem(gridSeedOrdersStorageKey());
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return [];
                return parsed.filter(order => order && (order.mode === 'default' || (order.mode === 'seed' && order.seed))).map((order, index) => ({
                    id: String(order.id || ('order-' + index)),
                    name: String(order.name || '未命名顺序'),
                    savedAt: order.savedAt || '',
                    scope: order.scope || gridOrderScopeKey(),
                    mode: order.mode,
                    seed: order.seed || null,
                    baseHash: order.baseHash || '',
                }));
            } catch (e) {
                return [];
            }
        }

        function persistSeedGridOrders(orders) {
            clearLegacyGridOrderStorage();
            RHVideoHost.storage.setItem(gridSeedOrdersStorageKey(), JSON.stringify(orders));
        }

        function selectedSavedGridOrder() {
            return readSeedGridOrders().find(order => order.id === selectedGridOrderId) || null;
        }

        function updateGridOrderControlsV2() {
            const saveBtn = document.getElementById('grid-save-order-btn');
            const restoreBtn = document.getElementById('grid-restore-saved-order-btn');
            const deleteBtn = document.getElementById('grid-delete-saved-order-btn');
            const orderSelect = document.getElementById('grid-saved-order-select');
            const status = document.getElementById('grid-order-status');
            const orders = readSeedGridOrders();
            if (orderSelect) {
                const previous = selectedGridOrderId || orderSelect.value;
                orderSelect.innerHTML = '<option value="">选择已保存顺序' + (orders.length ? '（' + orders.length + '）' : '') + '</option>' +
                    orders.map(order => `<option value="${favEsc(order.id)}">${favEsc(order.name)}${order.mode === 'seed' ? ' · 种子' : ' · 默认'}</option>`).join('');
                selectedGridOrderId = orders.some(order => order.id === previous)
                    ? previous
                    : (orders[0] ? orders[0].id : '');
                orderSelect.value = selectedGridOrderId;
            }
            const selected = selectedSavedGridOrder();
            const current = Array.isArray(gridMedia) ? gridMedia : [];
            const same = !!selected && (selected.mode === 'default'
                ? gridOrderHash(current) === gridBaseOrderHash
                : currentGridShuffleSeed === selected.seed);
            if (saveBtn) saveBtn.disabled = !current.length;
            if (restoreBtn) restoreBtn.disabled = !selected || !current.length;
            if (deleteBtn) deleteBtn.disabled = !selected;
            if (status) {
                status.classList.toggle('saved', same);
                status.textContent = selected
                    ? (same ? '当前：' + selected.name : '已选：' + selected.name)
                    : (orders.length ? '已保存 ' + orders.length + ' 个顺序' : '');
                status.title = selected && selected.savedAt
                    ? '保存时间：' + new Date(selected.savedAt).toLocaleString() + '；顺序使用随机种子，可随时重新生成'
                    : '';
            }
        }

        function saveNamedGridOrder(name) {
            const cleanName = String(name || '').trim().slice(0, 80);
            if (!cleanName) {
                notify('请输入顺序名称', 'error');
                return false;
            }
            if (!Array.isArray(gridMedia) || !gridMedia.length) {
                notify('当前没有可保存的截图顺序', 'error');
                return false;
            }
            const isDefault = !currentGridShuffleSeed && gridOrderHash(gridMedia) === gridBaseOrderHash;
            if (!currentGridShuffleSeed && !isDefault) {
                notify('当前顺序来自旧版本，无法仅用种子复现；请先点击“随机打乱”后再保存', 'error');
                return false;
            }
            try {
                const orders = readSeedGridOrders();
                const existingIndex = orders.findIndex(order => order.name === cleanName);
                const existing = existingIndex >= 0 ? orders[existingIndex] : null;
                const snapshot = {
                    id: existing ? existing.id : 'order-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
                    name: cleanName,
                    savedAt: new Date().toISOString(),
                    scope: gridOrderScopeKey(),
                    mode: isDefault ? 'default' : 'seed',
                    seed: isDefault ? null : currentGridShuffleSeed,
                    baseHash: gridBaseOrderHash,
                };
                if (existingIndex >= 0) orders[existingIndex] = snapshot;
                else orders.unshift(snapshot);
                persistSeedGridOrders(orders);
                selectedGridOrderId = snapshot.id;
                updateGridOrderControls();
                notify((existing ? '已更新' : '已保存') + '顺序“' + snapshot.name + '”（仅保存种子）', 'success');
                return true;
            } catch (e) {
                notify('保存顺序失败：' + (e && e.message ? e.message : '无法写入浏览器存储'), 'error');
                return false;
            }
        }

        function restoreSelectedGridOrder() {
            const saved = selectedSavedGridOrder();
            if (!saved) {
                notify('请先选择要恢复的顺序', 'error');
                updateGridOrderControls();
                return;
            }
            if (saved.mode === 'default') {
                gridMedia = gridBaseMedia.slice();
                gridItems = gridBaseItems.slice();
                reindexGridItems();
                currentGridShuffleSeed = null;
            } else {
                applySeedGridOrder(saved.seed);
            }
            try {
                clearLegacyGridOrderStorage();
                RHVideoHost.storage.setItem('rhvideo_shuffle_' + (token || ''), JSON.stringify({
                    version: 2,
                    seed: currentGridShuffleSeed,
                    scope: gridOrderScopeKey(),
                    baseHash: gridBaseOrderHash,
                }));
            } catch (e) {}
            gridPage = 1;
            renderGridPage();
            const changed = saved.baseHash && saved.baseHash !== gridBaseOrderHash;
            notify('已恢复顺序“' + saved.name + '”（' + (changed ? '内容有变化，现有项目相对顺序保持不变' : '顺序一致') + '）', 'success');
        }

        function deleteSavedGridOrder() {
            const selected = selectedSavedGridOrder();
            if (!selected) {
                notify('请先选择要删除的顺序', 'error');
                return;
            }
            if (!confirm('删除保存的顺序“' + selected.name + '”？')) return;
            try {
                const orders = readSeedGridOrders().filter(order => order.id !== selected.id);
                persistSeedGridOrders(orders);
                selectedGridOrderId = orders[0] ? orders[0].id : '';
                updateGridOrderControls();
                notify('已删除保存顺序“' + selected.name + '”', 'success');
            } catch (e) {
                notify('删除保存顺序失败：' + (e && e.message ? e.message : '无法写入浏览器存储'), 'error');
            }
        }

        function doShuffle(seed) {
            const actualSeed = seed || generateGridShuffleSeed();
            applySeedGridOrder(actualSeed);
            try {
                clearLegacyGridOrderStorage();
                RHVideoHost.storage.setItem('rhvideo_shuffle_' + (token || ''), JSON.stringify({
                    version: 2,
                    seed: actualSeed,
                    scope: gridOrderScopeKey(),
                    baseHash: gridBaseOrderHash,
                }));
            } catch (e) {}
            return actualSeed;
        }

        function restoreShuffleOrder() {
            if (!token) return;
            currentGridShuffleSeed = null;
            try {
                const raw = RHVideoHost.storage.getItem('rhvideo_shuffle_' + token);
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (saved && saved.version === 2 && saved.mode !== 'default' && saved.seed) {
                    applySeedGridOrder(saved.seed);
                    return;
                }
                if (!Array.isArray(saved)) return;
                const exact = new Map();
                const legacy = new Map();
                for (let i = 0; i < gridMedia.length; i++) {
                    const media = gridMedia[i];
                    const entry = { key: gridMediaOrderKey(media), media, item: gridItems[i] };
                    exact.set(entry.key, entry);
                    const legacyKey = media.videoId || media.url;
                    if (!legacy.has(legacyKey)) legacy.set(legacyKey, []);
                    legacy.get(legacyKey).push(entry);
                }
                const nextMedia = [], nextItems = [];
                for (const key of saved) {
                    let entry = exact.get(key);
                    if (entry) {
                        nextMedia.push(entry.media); nextItems.push(entry.item); exact.delete(entry.key); continue;
                    }
                    const candidates = legacy.get(key);
                    while (candidates && candidates.length) {
                        entry = candidates.shift();
                        if (!exact.has(entry.key)) continue;
                        nextMedia.push(entry.media); nextItems.push(entry.item); exact.delete(entry.key); break;
                    }
                }
                for (const entry of exact.values()) { nextMedia.push(entry.media); nextItems.push(entry.item); }
                gridMedia = nextMedia;
                gridItems = nextItems;
                reindexGridItems();
            } catch (e) {}
        }

        function navMedia(delta) {
            if (mediaItems.length <= 1 && mediaStack.length) {
                popMediaViewer();
                mediaIndex = (mediaIndex + delta + mediaItems.length) % mediaItems.length;
                renderMediaItem();
                saveMediaState();
            } else {
                mediaIndex = (mediaIndex + delta + mediaItems.length) % mediaItems.length;
                renderMediaItem();
                saveMediaState();
                saveBrowsePosition();
            }
        }
        function saveBrowsePosition() {
            if (mediaStack.length || !mediaItems.length || !mediaIsGridSession) return;
            const item = mediaItems[mediaIndex] || {};
            const page = Math.floor(mediaIndex / gridPageSize) + 1;
            RHVideoHost.storage.setItem('rhvideo_browse_' + (token || ''), JSON.stringify({
                index: mediaIndex,
                page,
                videoId: item.videoId || null,
                url: item.url || null,
            }));
            document.getElementById('resume-btn').style.display = 'inline-block';
        }
        function findBrowseIndex(pos) {
            // 优先按“截图URL+视频ID”精确定位，防止处理过程中新视频插入导致索引漂移
            if (pos && gridMedia.length) {
                for (let i = 0; i < gridMedia.length; i++) {
                    if (pos.url && pos.videoId && gridMedia[i].url === pos.url && gridMedia[i].videoId === pos.videoId) return i;
                }
                if (pos.videoId) {
                    const first = gridMedia.findIndex(m => m.videoId === pos.videoId);
                    if (first >= 0) return first;
                }
            }
            if (pos && pos.index >= 0 && pos.index < gridMedia.length) return pos.index;
            return 0;
        }
        function resumeBrowse() {
            try {
                const raw = RHVideoHost.storage.getItem('rhvideo_browse_' + token);
                if (!raw) return;
                const pos = JSON.parse(raw);
                const idx = findBrowseIndex(pos);
                mediaItems = gridMedia; mediaIndex = idx; mediaStack = []; mediaIsGridSession = true;
                renderMediaItem();
                gridPage = pos.page || 1;
                renderGridPage();
                const viewer = document.getElementById('media-viewer');
                viewer.classList.remove('hidden');
                viewer.addEventListener('touchstart', mediaTouchStart);
                viewer.addEventListener('touchend', mediaTouchEnd);
                viewer.addEventListener('keydown', mediaKeyHandler);
                viewer.addEventListener('wheel', mediaWheelHandler, { passive: false });
                document.addEventListener('keydown', mediaKeyHandler);
                document.getElementById('resume-btn').style.display = 'none';
            } catch(e) {}
        }
        function renderMediaItem() {
            const item = mediaItems[mediaIndex];
            const container = document.getElementById('media-content');
            document.getElementById('media-counter').textContent = `${mediaIndex + 1} / ${mediaItems.length}`;
            document.getElementById('media-title').textContent = item.title || '';
            const actions = document.getElementById('media-actions');
            const controls = document.getElementById('media-controls');
             updateMediaProgressVisibility();
            if (item.type === 'video') {
                container.innerHTML = `<video src="${item.url}" controls playsinline style="width:100%;height:100%;object-fit:contain"></video>`;
                actions.innerHTML = mediaStarBtn(item) + mediaDeleteBtn(item) + (mediaStack.length ? `<button class="btn-sm" data-rh-click="h299" data-rh-a-h299="[]">← 返回截图</button>` : '');
                controls.style.display = 'flex';
                document.getElementById('mv-rot-btn').style.display = 'none';
                setTimeout(() => {
                    const video = container.querySelector('video');
                    if (video) {
                        pageVolumeBind(video);
             video.loop = mediaLoopOn;
                        video.playbackRate = mediaSpeed;
                        video.addEventListener('loadedmetadata', () => {
                            if (mediaRotated && shouldRotate(video)) {
                                applyVideoRotate(video, true);
                            }
                            updateMediaRotBtn();
                        });
                        if (video.videoWidth) {
                            if (mediaRotated && shouldRotate(video)) {
                                applyVideoRotate(video, true);
                            }
                            updateMediaRotBtn();
                        } else {
                            document.getElementById('mv-rot-btn').style.display = 'inline-block';
                            document.getElementById('mv-rot-btn').style.background = mediaRotated ? 'rgba(102,126,234,0.5)' : '';
                            document.getElementById('mv-rot-btn').innerHTML = mediaRotated ? '↺' : '↻';
                             if (video.paused) video.play().catch(() => {});
                        }
                    }
                }, 50);
            setTimeout(() => {
                 const currentVideo = container.querySelector('video');
                 if (currentVideo && currentVideo.paused) currentVideo.play().catch(() => {});
             }, 60);
             } else if (item.videoId) {
                container.innerHTML = `<span data-rh-click="h298" data-rh-a-h298="${RHVideoBindings.encode([item.videoId,null])}" style="cursor:pointer;display:flex;align-items:center;justify-content:center;width:100%;height:100%">
                    <img src="${item.url}" alt="">
                </span>`;
                actions.innerHTML = `${mediaStarBtn(item)}${mediaDeleteBtn(item)}<button class="btn-sm" data-rh-click="h295" data-rh-a-h295="${RHVideoBindings.encode([null,null,item.videoId,null,null])}">▶ 播放</button>
                    <button class="btn-sm" data-rh-click="h296" data-rh-a-h296="${RHVideoBindings.encode([null,null,null,item.videoId,null])}">🕒 时间轴</button>
                    <button class="btn-sm" data-rh-click="h297" data-rh-a-h297="${RHVideoBindings.encode([null,null,null,null,item.videoId])}">📄 列表定位</button>`;
                controls.style.display = 'none';
            } else {
                container.innerHTML = `<img src="${item.url}" alt="${item.title||''}">`;
                actions.innerHTML = mediaStarBtn(item) + mediaDeleteBtn(item);
                controls.style.display = 'none';
            }
            updateMediaProgressVisibility();
             updateMediaProgress();
        }

        // ---- Media viewer (截图浏览) progress bar ----
        function updateMediaProgress() {
            const bar = document.getElementById('media-progress');
            const lbl = document.getElementById('media-progress-label');
            if (!bar || !mediaItems.length) return;
            if (document.activeElement === bar) return;
            const n = mediaItems.length;
                         if (n <= 1) { bar.value = '0'; lbl.textContent = ''; return; }
             bar.value = String(Math.round(mediaIndex / (n - 1) * 1000) || 0);
            const t = mediaItems[mediaIndex] ? (mediaItems[mediaIndex].title || '') : '';
            lbl.textContent = (mediaIndex + 1) + '/' + n + (t ? ' · ' + (t.length > 18 ? t.slice(0, 18) + '…' : t) : '');
        }
        function mediaProgressInput(el) {
            const n = mediaItems.length;
            if (!n) return;
            const frac = parseFloat(el.value) / 1000;
            const target = Math.round(frac * (n - 1));
            const lbl = document.getElementById('media-progress-label');
            if (lbl) lbl.textContent = (target + 1) + '/' + n;
        }
        function mediaProgressCommit(el) {
            const n = mediaItems.length;
            if (!n) return;
            const frac = parseFloat(el.value) / 1000;
            const target = Math.round(frac * (n - 1));
            if (target !== mediaIndex) {
                mediaIndex = target;
                renderMediaItem();
                saveMediaState();
                saveBrowsePosition();
            }
        }
        function mediaKeyHandler(e) {
            if (e.key === 'ArrowLeft') navMedia(-1);
            else if (e.key === 'ArrowRight') navMedia(1);
            else if (e.key === 'Escape') { closeMediaViewer(null); }
            else if (e.key === 'Home') { mediaProgressCommit({ value: '0' }); }
            else if (e.key === 'End') { mediaProgressCommit({ value: '1000' }); }
        }
        function mediaWheelHandler(e) {
            e.preventDefault();
            if (e.deltaY > 0) navMedia(1);
            else navMedia(-1);
        }
        function jumpToVideo(videoId) {
            closeMediaViewer(null);
            switchTab('list');
            const videos = filteredVideos.length ? filteredVideos : allVideos;
            const idx = videos.findIndex(v => v.id === videoId);
            if (idx >= 0) {
                currentPage = Math.floor(idx / pageSize) + 1;
                renderVideos(videos);
            }
            setTimeout(() => {
                const card = document.querySelector('.video-card[data-video-id="' + videoId + '"]');
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.style.background = '#e8ecff';
                    card.style.outline = '3px solid #5274e8';
                    card.style.boxShadow = '0 0 20px rgba(102,126,234,0.4)';
                    setTimeout(() => { card.style.outline = ''; card.style.boxShadow = ''; card.style.background = ''; }, 3000);
                }
            }, 300);
        }
        // Touch swipe support
        let touchStartX = 0;
        function mediaTouchStart(e) { touchStartX = e.touches[0].clientX; }
        function mediaTouchEnd(e) {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 50) navMedia(dx < 0 ? 1 : -1);
        }
        function formatTime(s) { if (!s||s<0) return '0:00'; return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
        function fmtClock(s) { if (!s || s < 0) return '0:00'; s = Math.floor(s); if (s >= 3600) return Math.floor(s/3600) + ':' + String(Math.floor((s%3600)/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); }

        // ============ Watch Folders (自动监控) ============
        function showWatchModal() {
            document.getElementById('watch-modal').classList.add('show');
            loadWatchFolders();
        }
        function closeWatchModal() { document.getElementById('watch-modal').classList.remove('show'); }
        let watchFoldersLoaded = false;
        async function loadWatchFolders() {
            try {
                const res = await fetch(`${API_BASE}/watch-folders`, { headers: { "Authorization": `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || '加载失败');
                watchFoldersLoaded = true;
                renderWatchFolders(data.folders || []);
                renderQueueStatus(data.queue || null, data.current || null);
                if (!document.getElementById('tab-storage').classList.contains('hidden')) loadWatchFolderUsage();
            } catch (e) { console.error(e); }
        }
        function renderWatchFolders(folders) {
            const container = document.getElementById('watch-list');
            if (!folders.length) {
                container.innerHTML = '<p class="empty">还没有监控目录。添加后，目录内已有的视频、图片和小说（TXT）会全部处理，之后每 60 秒自动增量。</p>';
                return;
            }
            container.innerHTML = folders.map(f => {
                const r = f.last_scan_result || {};
                const typeBadge = '<span class="folder-badge">视频+图片+小说</span> ';
                const summary = [r.new ? `新增${r.new}` : null, r.updated ? `更新${r.updated}` : null, r.moved ? `移动${r.moved}` : null, r.failed ? `失败${r.failed}` : null, r.waiting_stable ? `待稳定${r.waiting_stable}` : null, r.busy ? `被占用${r.busy}` : null].filter(Boolean).join(' / ') || '暂无';
                const last = f.last_scan_at ? new Date(f.last_scan_at).toLocaleString() : '尚未扫描';
                return `<div class="watch-item">
                    <label class="switch"><input type="checkbox" ${f.enabled?'checked':''} data-rh-change="h292" data-rh-a-h292="${RHVideoBindings.encode([null,f.id,null,null,null,null,null,null,null])}"><span class="slider"></span></label>
                    <div style="min-width:0;flex:1">
                        <div class="path" title="${f.path}">${typeBadge}${f.path}</div>
                        <div class="meta">上次扫描: ${last} &bull; ${summary}</div>
                    </div>
                    <button class="btn btn-secondary" data-rh-click="h293" data-rh-a-h293="${RHVideoBindings.encode([null,null,null,null,null,null,null,f.id,null])}">立即扫描</button>
                    <button class="btn btn-danger" data-rh-click="h294" data-rh-a-h294="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,f.id])}">移除</button>
                </div>`;
            }).join('');
        }
        function syncGlobalQueueVisibility() {
            const expanded = !!token && !globalQueueHidden;
            document.getElementById('global-queue-status')?.classList.toggle('hidden', !expanded);
            const toggle = document.getElementById('global-queue-reopen');
            toggle?.classList.toggle('hidden', !token);
            for (const button of [toggle, document.getElementById('list-queue-toggle')]) {
                if (!button) continue;
                button.setAttribute('aria-expanded', String(expanded));
                button.title = expanded ? '收起队列' : '展开队列';
            }
        }
        function setGlobalQueueExpanded(expanded) {
            globalQueueHidden = !expanded;
            syncGlobalQueueVisibility();
        }
        function toggleGlobalQueue() { setGlobalQueueExpanded(globalQueueHidden); }
        function hideGlobalQueue() { setGlobalQueueExpanded(false); }
        function showGlobalQueue() { setGlobalQueueExpanded(true); }
        function renderQueueContext(id, filename, summary) {
            const context = document.getElementById(id);
            if (!context) return;
            context.querySelector('.queue-context-filename').textContent = filename || '暂无正在处理的视频';
            context.querySelector('.queue-context-filename').title = filename || '';
            context.querySelector('.queue-context-summary').textContent = summary || '';
        }

        function renderQueueStatus(queue, current) {
            if (!queue) return;
            queueStatusSnapshot = { queue, current };
            const pending = Number(queue.pending || 0);
            const processing = Number(queue.processing || 0);
            const failed = Number(queue.failed || 0);
            const retryBtn = document.getElementById('retry-failed-btn');
             if (retryBtn && !retryFailedBusy) {
                 retryBtn.disabled = failed === 0;
                 retryBtn.textContent = failed ? `失败重试 (${failed})` : '失败重试';
                 retryBtn.title = failed ? `查看 ${failed} 个失败任务，逐项重试` : '当前没有失败的视频';
             }
             const ready = Number(queue.ready || 0);
            const active = pending + processing > 0;
            const failedInfo = Array.isArray(queue.failed_items) && queue.failed_items.length ? queue.failed_items[0] : null;
            const parts = [];
            const liveCurrent = processingProgress.default.find(item => item.video_id === current?.video_id) || processingProgress.default[0];
            if (processing > 0 || liveCurrent) parts.push(`${formatProcessingProgress(liveCurrent?.progress)} · ${liveCurrent?.filename || current?.filename || ''}`);
            if (pending > 0) parts.push(`等待 ${pending} 个`);
            if (failed > 0) parts.push(`失败 ${failed} 个`);
            const text = parts.length ? `默认压缩：${parts.join('，')}` : `默认压缩：空闲（已就绪 ${ready}）`;
            const failureTitle = failedInfo
                ? `最近失败：${failedInfo.filename || '未知文件'}\n${failedInfo.error_message || '未记录错误原因'}`
                : '';

            const bar = document.getElementById('queue-bar');
            if (bar) bar.classList.remove('hidden');
            const dot = document.getElementById('queue-dot');
            if (dot) dot.classList.toggle('active', active);
            const label = document.getElementById('queue-text');
            const taskOptions = { kind: 'default', progress: liveCurrent?.progress, filename: liveCurrent?.filename || current?.filename,
                active: processing > 0 || !!liveCurrent, summary: [pending ? `等待 ${pending} 个` : '', failed ? `失败 ${failed} 个` : '', `已就绪 ${ready}`].filter(Boolean).join(' · ') };
            if (label) { renderTaskProgress(label, taskOptions); label.title = text + (failureTitle ? '\n' + failureTitle : ''); }
            renderQueueContext('queue-context', taskOptions.filename, taskOptions.summary);

            const global = document.getElementById('global-queue-status');
            if (global) {
                global.title = failureTitle;
            }
            syncGlobalQueueVisibility();
            const globalDot = document.getElementById('global-queue-dot');
            if (globalDot) globalDot.classList.toggle('active', active);
            const globalLabel = document.getElementById('global-queue-text');
            if (globalLabel) { renderTaskProgress(globalLabel, taskOptions); globalLabel.title = text + (failureTitle ? '\n' + failureTitle : ''); }
        }
        function startQueuePolling() {
            if (window._queueTimer) return;
            let lastSignature = '';
            let lastPicCount = -1;
            let polling = false;
            window._queueTimer = setInterval(async () => {
                if (polling || document.hidden) return;
                polling = true;
                loadReplacementJobs();
                try {
                    const res = await fetch(`${API_BASE}/watch-folders`, { headers: { "Authorization": `Bearer ${token}` } });
                    if (!res.ok) return;
                    const data = await res.json();
                    const queue = data.queue ? { ...data.queue, failed_items: data.failed_items || [] } : null;
                    renderQueueStatus(queue, data.current || null);
                    const picCount = data.pictures || 0;
                    const sig = JSON.stringify(queue || {}) + '|' + (data.current && data.current.video_id || '');
                    if (sig !== lastSignature) {
                        lastSignature = sig;
                        loadVideos();
                        gridRefreshPending = true;
                    }
                    if (lastPicCount < 0) lastPicCount = picCount;
                    if (picCount !== lastPicCount) {
                        const previousPicCount = lastPicCount;
                        lastPicCount = picCount;
                        picturesLoaded = false;
                        if (document.getElementById('mix-pictures').checked) gridRefreshPending = true;
                        const stripViewer = document.getElementById('pic-strip-viewer');
                        if (stripViewer && !stripViewer.classList.contains('hidden')) {
                            rhDebug('queue:picture-count-change', { from: previousPicCount, to: picCount, stripOpen: true });
                            pictureGridRefreshPending = true;
                            pictureListReloadPending = true;
                        } else {
                            rhDebug('queue:picture-count-change', { from: previousPicCount, to: picCount, stripOpen: false });
                            if (!document.getElementById('tab-pictures').classList.contains('hidden') || document.getElementById('mix-pictures').checked) loadPictures();
                        }
                    }
                    // Defer hidden grids and never rebuild a preview's navigation array underneath it.
                    const previewOpen = ['media-viewer', 'playlist-viewer', 'grid-viewer', 'pic-strip-viewer', 'timeline-viewer', 'kenburns-viewer', 'favshow-viewer']
                        .some(id => !document.getElementById(id).classList.contains('hidden'));
                    if (gridRefreshPending && !previewOpen && !document.getElementById('tab-grid').classList.contains('hidden')) loadGrid(false);
                } catch (e) {} finally { polling = false; }
            }, 5000);
        }
        function processingStageLabel(progress) {
            const stages = { probe: '读取视频信息', compress: '普通压缩', super_compress: '超压压缩', keyframes: '提取截图',
                transcode: '原片转码', validate: '校验输出', backup: '备份原片', replace: '写入原片', save: '保存文件', commit: '更新记录', cleanup_variants: '清理旧压缩版', cleanup: '清理过期备份', done: '完成', failed: '失败' };
            return (stages[progress?.stage] || progress?.stage || '处理中') + (progress?.resolution ? ' ' + progress.resolution : '');
        }
        function renderTaskProgress(container, {kind, progress, filename, summary = '', active = true}) {
            let task = container.querySelector('.task-progress');
            if (!task) {
                container.innerHTML = `<div class="task-progress"><div class="task-head"><span class="task-kind"><svg viewBox="0 0 16 16" aria-hidden="true"><path></path></svg><span></span></span><span class="task-phase"></span><strong class="task-percent"></strong><span class="task-filename"></span></div><progress max="100"></progress><div class="task-metrics"><span class="task-time"></span><span class="task-speed"></span><span class="task-eta"></span><span class="task-summary"></span><span class="task-heartbeat"></span></div></div>`;
                task = container.firstElementChild;
            }
            const delta = processingProgressReceivedAt ? Math.max(0, (performance.now() - processingProgressReceivedAt) / 1000) : 0;
            const age = Math.floor((progress?.heartbeat_age_seconds || 0) + delta);
            const unchanged = Math.floor((progress?.unchanged_seconds || 0) + delta);
            const stalled = !!progress?.process_running && unchanged >= 30;
            const offline = !!processingProgressError || !!progress?.process_running && age >= 5;
            task.className = 'task-progress kind-' + kind;
            task.dataset.state = offline ? 'offline' : stalled ? 'stalled' : active ? 'active' : 'idle';
            task.querySelector('.task-kind span').textContent = kind === 'default' ? '默认压缩' : '原片替换';
            task.querySelector('path').setAttribute('d', kind === 'default' ? 'M3 2v4h4M13 14v-4H9M3 6l4-4M13 10l-4 4' : 'M3 5a5 5 0 0 1 9-1l1 2M13 2v4H9M13 11a5 5 0 0 1-9 1l-1-2M3 14v-4h4');
            task.querySelector('.task-phase').textContent = progress ? processingStageLabel(progress) : active ? '等待实时数据' : '空闲';
            task.querySelector('.task-percent').textContent = typeof progress?.percent === 'number' ? progress.percent.toFixed(1) + '%' : '—';
            const name = task.querySelector('.task-filename');
            name.textContent = filename || (active ? '等待开始处理' : '暂无正在处理的视频');
            name.title = filename || '';
            const bar = task.querySelector('progress');
            bar.setAttribute('aria-label', kind === 'default' ? '默认压缩进度' : '原片替换进度');
            if (typeof progress?.percent === 'number') bar.value = progress.percent;
            else if (!active) bar.value = 0;
            else bar.removeAttribute('value');
            const metric = (selector, text) => {
                const element = task.querySelector(selector);
                element.textContent = text;
                element.classList.toggle('hidden', !text);
            };
            metric('.task-time', progress?.duration_seconds > 0 && progress.processed_seconds != null ? fmtClock(progress.processed_seconds) + ' / ' + fmtClock(progress.duration_seconds)
                : progress && progress.percent == null ? '阶段已用 ' + fmtClock((progress.stage_elapsed_seconds || 0) + delta) : '');
            metric('.task-speed', progress?.speed > 0 ? (stalled || offline ? '上次速度 ' : '') + progress.speed.toFixed(2) + 'x' : '');
            metric('.task-eta', !stalled && !offline && progress?.eta_seconds != null ? '预计剩余 ' + fmtClock(progress.eta_seconds) : '');
            metric('.task-summary', summary);
            metric('.task-heartbeat', !active ? '' : offline ? [processingProgressError, progress?.process_running ? (age >= 5 ? `${age} 秒未收到心跳` : `上次心跳 ${age} 秒前`) : ''].filter(Boolean).join(' · ')
                : stalled ? `已 ${unchanged} 秒未推进（进程仍有心跳）` : progress?.process_running ? `心跳 ${age} 秒前` : progress ? '处理中' : '等待进度数据');
            container.title = formatProcessingProgress(progress) + (filename ? '\n' + filename : '') + (summary ? '\n' + summary : '');
        }
        function formatProcessingProgress(progress) {
            if (!progress) return processingProgressError || '当前任务尚未提供实时进度';
            const delta = processingProgressReceivedAt ? Math.max(0, (performance.now() - processingProgressReceivedAt) / 1000) : 0;
            const age = Math.floor((progress.heartbeat_age_seconds || 0) + delta);
            const unchanged = Math.floor((progress.unchanged_seconds || 0) + delta);
            const fresh = age < 5 && unchanged < 30;
            const parts = [processingStageLabel(progress)];
            if (typeof progress.percent === 'number') parts.push(progress.percent.toFixed(1) + '%');
            if (progress.duration_seconds > 0 && progress.processed_seconds != null) parts.push(fmtClock(progress.processed_seconds) + ' / ' + fmtClock(progress.duration_seconds));
            if (progress.speed > 0) parts.push((fresh ? '' : '上次速度 ') + progress.speed.toFixed(2) + 'x');
            if (fresh && progress.eta_seconds != null) parts.push('预计剩余 ' + fmtClock(progress.eta_seconds));
            if (progress.process_running && unchanged >= 30) parts.push(`已 ${unchanged} 秒未推进` + (age < 5 ? '（进程仍有心跳）' : ''));
            if (processingProgressError) parts.push(processingProgressError);
            if (progress.process_running) parts.push(age < 5 ? `心跳 ${age} 秒前` : `${age} 秒未收到心跳`);
            else if (progress.percent == null) parts.push('阶段已用 ' + fmtClock((progress.stage_elapsed_seconds || 0) + delta));
            return parts.join(' · ');
        }
        function renderVideoProcessingProgress() {
            const byVideo = new Map();
            for (const [kind, items] of Object.entries(processingProgress)) {
                for (const item of items) {
                    if (!byVideo.has(item.video_id)) byVideo.set(item.video_id, []);
                    byVideo.get(item.video_id).push({ ...item, kind });
                }
            }
            document.querySelectorAll('[data-live-progress-video]').forEach(container => {
                const items = byVideo.get(container.dataset.liveProgressVideo) || [];
                container.classList.toggle('hidden', !items.length);
                for (const child of Array.from(container.children)) if (!items.some(item => item.kind === child.dataset.progressKind)) child.remove();
                for (const item of items) {
                    let line = container.querySelector(`[data-progress-kind="${item.kind}"]`);
                    if (!line) {
                        line = document.createElement('div');
                        line.className = 'video-live-progress';
                        line.dataset.progressKind = item.kind;
                        container.append(line);
                    }
                    renderTaskProgress(line, { kind: item.kind, progress: item.progress, filename: item.filename });
                    const delta = processingProgressReceivedAt ? Math.max(0, (performance.now() - processingProgressReceivedAt) / 1000) : 0;
                    line.classList.toggle('is-stalled', !!item.progress?.process_running && (item.progress.unchanged_seconds || 0) + delta >= 30);
                }
            });
        }
        function renderLiveProcessingProgress() {
            if (queueStatusSnapshot.queue) renderQueueStatus(queueStatusSnapshot.queue, queueStatusSnapshot.current);
            else if (processingProgress.default.length) renderQueueStatus({ processing: processingProgress.default.length }, processingProgress.default[0]);
            renderReplacementProgress();
            renderVideoProcessingProgress();
            RHTaskCenter.updateProgress(processingProgress);
        }
        function startProgressPolling() {
            if (window._progressTimer) return;
            let busy = false;
            const poll = async () => {
                if (!token || document.hidden) return;
                renderLiveProcessingProgress();
                if (busy) return;
                busy = true;
                const userToken = token;
                try {
                    const response = await fetch(`${API_BASE}/processing-progress`, { headers: { Authorization: `Bearer ${userToken}` }, cache: 'no-store' });
                    if (!response.ok) throw new Error(response.status === 404 ? '服务更新后可显示实时进度' : '进度连接失败');
                    const data = await response.json();
                    if (token !== userToken) return;
                    processingProgress = { default: data.default || [], replacement: data.replacement || [] };
                    processingProgressReceivedAt = performance.now();
                    processingProgressError = '';
                } catch (error) {
                    if (token !== userToken) return;
                    processingProgressError = error.message;
                } finally {
                    busy = false;
                    if (token === userToken) renderLiveProcessingProgress();
                }
            };
            window._progressTimer = setInterval(poll, 1000);
            poll();
        }
        async function addWatchFolder() {
            const input = document.getElementById('watch-path');
            const path = input.value.trim();
            if (!path) return notify('请输入文件夹路径', 'error');
            const btn = document.getElementById('watch-add-btn');
            btn.disabled = true; btn.textContent = '正在添加...';
            try {
                const res = await fetch(`${API_BASE}/watch-folders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ path })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || '添加失败');
                notify('监控目录已添加，正在后台同时扫描视频、图片和小说...', 'success');
                input.value = '';
                loadWatchFolders();
                setTimeout(() => {
                    loadWatchFolders();
                    loadVideos(); loadGrid();
                    loadPictures();
                }, 3000);
            } catch (e) { notify('添加失败: ' + e.message, 'error'); }
            finally { btn.disabled = false; btn.textContent = '添加并立即扫描'; }
        }
        async function toggleWatchFolder(id, enabled) {
            try {
                const res = await fetch(`${API_BASE}/watch-folders/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ enabled })
                });
                if (!res.ok) throw new Error('操作失败');
                notify(enabled ? '监控已启用' : '监控已暂停', 'success');
                if (!document.getElementById('tab-storage').classList.contains('hidden')) loadWatchFolderUsage();
            } catch (e) { notify(e.message, 'error'); loadWatchFolders(); }
        }
        async function scanWatchFolder(id) {
            try {
                const res = await fetch(`${API_BASE}/watch-folders/${id}/scan`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || '扫描失败');
                notify(`扫描完成：新增 ${data.new||0}，更新 ${data.updated||0}${data.failed ? '，失败 '+data.failed : ''}`, 'success');
                loadWatchFolders();
                loadVideos(); loadGrid(); loadPictures();
            } catch (e) { notify('扫描失败: ' + e.message, 'error'); }
        }
        async function removeWatchFolder(id) {
            if (!confirm('移除监控目录后，已导入的视频会保留，但不再自动更新。确定？')) return;
            try {
                const res = await fetch(`${API_BASE}/watch-folders/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) { notify('已移除监控目录', 'success'); loadWatchFolders(); }
                else notify('移除失败', 'error');
            } catch (e) { notify('网络错误: ' + e.message, 'error'); }
        }

        function updateFailedRetryButton() {
            const btn = document.getElementById('retry-failed-btn');
            if (!btn) return;
            if (retryFailedBusy) {
                btn.disabled = true;
                btn.textContent = '加入队列...';
                return;
            }
            const count = allVideos.filter(video => video && video.status === 'failed').length;
            btn.disabled = count === 0;
            btn.textContent = count ? `失败重试 (${count})` : '失败重试';
            btn.title = count ? `查看 ${count} 个失败任务，逐项重试` : '当前没有失败的视频';
        }

        async function reprocessFailedVideos() {
            const count = allVideos.filter(video => video && video.status === 'failed').length;
            if (!count) {
                updateFailedRetryButton();
                notify('当前没有失败的视频', 'info');
                return;
            }
            if (!confirm(`将 ${count} 个失败视频重新加入处理队列？源文件不存在的项目会跳过。`)) return;
            const btn = document.getElementById('retry-failed-btn');
            retryFailedBusy = true;
            if (btn) {
                btn.disabled = true;
                btn.textContent = '加入队列...';
            }
            try {
                const res = await fetch(`${API_BASE}/videos/reprocess-failed`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || '批量重试失败');
                const queued = Number(data.queued || 0);
                const skipped = Number(data.skipped || 0);
                notify(`已重新加入 ${queued} 个视频${skipped ? `，跳过 ${skipped} 个源文件不存在的视频` : ''}`, queued ? 'success' : 'error');
                await loadVideos();
            } catch (e) {
                notify('批量重试失败: ' + e.message, 'error');
            } finally {
                retryFailedBusy = false;
                updateFailedRetryButton();
            }
        }

        // ============ Video List ============
        let videoMultiSelect = false;
        let videoBatchIds = new Set();
        let currentPageVideos = [];
        function toggleVideoMultiSelect(force) {
            closeAppContextMenu();
            videoMultiSelect = typeof force === 'boolean' ? force : !videoMultiSelect;
            if (!videoMultiSelect) videoBatchIds.clear();
            document.getElementById('video-batch-bar').classList.toggle('hidden', !videoMultiSelect);
            const btn = document.getElementById('multiselect-btn');
            btn.textContent = videoMultiSelect ? '☑ 多选中' : '☐ 多选';
            btn.classList.toggle('btn-success', videoMultiSelect);
            btn.setAttribute('aria-pressed', String(videoMultiSelect));
            document.getElementById('seqplay-btn').disabled = videoMultiSelect;
            document.getElementById('seqplay-super-btn').disabled = videoMultiSelect;
            updateVideoBatchBar();
            renderVideos(filteredVideos || allVideos);
        }
        function toggleVideoSelect(id, checked) {
            if (!videoMultiSelect) return;
            if (checked) videoBatchIds.add(id); else videoBatchIds.delete(id);
            updateVideoBatchBar();
            syncVideoSelection();
        }
        function selectAllPageVideos() {
            if (!videoMultiSelect) return;
            currentPageVideos.forEach(v => videoBatchIds.add(v.id));
            updateVideoBatchBar();
            syncVideoSelection();
        }
        function clearVideoSelection() {
            videoBatchIds.clear();
            updateVideoBatchBar();
            syncVideoSelection();
        }
        function syncVideoSelection() {
            document.querySelectorAll('#videos-grid .video-card').forEach(row => {
                const selected = videoMultiSelect && videoBatchIds.has(row.dataset.videoId);
                row.classList.toggle('is-selecting', videoMultiSelect);
                row.classList.toggle('is-selected', selected);
                if (videoMultiSelect) {
                    row.tabIndex = 0;
                    row.setAttribute('role', 'checkbox');
                    row.setAttribute('aria-checked', String(selected));
                    row.setAttribute('aria-label', row.querySelector('h3').textContent);
                } else {
                    ['tabindex', 'role', 'aria-checked', 'aria-label'].forEach(attr => row.removeAttribute(attr));
                }
                row.querySelectorAll('.video-actions button').forEach(button => { button.disabled = videoMultiSelect; });
                const checkbox = row.querySelector('.video-select-checkbox');
                if (checkbox) checkbox.checked = selected;
            });
        }
        function updateVideoBatchBar() {
            const onPage = currentPageVideos.filter(v => videoBatchIds.has(v.id)).length;
            document.getElementById('video-batch-count').textContent = `已选 ${videoBatchIds.size} 个 · 本页 ${onPage} 个`;
            document.getElementById('batch-replace-btn').disabled = videoBatchIds.size === 0;
        }
        // Capture before inline button handlers (including handlers that stop propagation).
        document.getElementById('videos-grid').addEventListener('click', event => {
            const row = event.target.closest('.video-card');
            if (!videoMultiSelect || !row) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            row.focus({ preventScroll: true });
            toggleVideoSelect(row.dataset.videoId, !videoBatchIds.has(row.dataset.videoId));
            // A cancelled checkbox click restores its native state after dispatch.
            if (event.target.matches('input[type="checkbox"]')) queueMicrotask(syncVideoSelection);
        }, true);
        document.getElementById('videos-grid').addEventListener('keydown', event => {
            const row = event.target.closest('.video-card');
            if (!videoMultiSelect || !row || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!event.repeat) toggleVideoSelect(row.dataset.videoId, !videoBatchIds.has(row.dataset.videoId));
        }, true);
        function loadVideos() {
            if (videosLoadPromise) return videosLoadPromise;
            videosLoadPromise = loadVideoIndex().finally(() => { videosLoadPromise = null; });
            return videosLoadPromise;
        }
        async function loadVideoIndex() {
            document.getElementById("videos-loading").classList.remove("hidden");
            try {
                const data = await fetchLibraryIndex(`${API_BASE}/videos?summary=true`);
                if (data === videosLoadedData) return;
                if (data && data.value && Array.isArray(data.value)) allVideos = data.value;
                else if (Array.isArray(data)) allVideos = data;
                else allVideos = [];
                // 重新应用用户当前选择的排序与搜索，避免队列轮询刷新后顺序/过滤被重置
                allVideos = applyVideoSort(allVideos, document.getElementById('sort-select').value);
                filterVideos(false);
                 renderGridTagTabs();
                 if (document.getElementById('grid-tag-drawer')?.classList.contains('open')) renderGridTagDrawer();
                videosLoadedData = data;
            } catch (e) {
                if (!document.getElementById("videos-grid").innerHTML.trim()) {
                    document.getElementById("videos-grid").innerHTML = `<p class="empty">加载失败: ${e.message}</p>`;
                }
            } finally {
                document.getElementById("videos-loading").classList.add("hidden");
            }
        }
        function renderPaginator(total, totalPages) {
            document.getElementById('page-info').textContent = `第 ${currentPage}/${totalPages} 页 (共${total}个)`;
            document.querySelector('#paginator button:first-child').disabled = currentPage <= 1;
            document.querySelector('#paginator button:last-child').disabled = currentPage >= totalPages;
        }
        function changePage(delta) {
            currentPage += delta;
            renderVideos(filteredVideos || allVideos);
            document.getElementById('videos-grid').scrollIntoView({ behavior: 'smooth' });
        }
        function jumpPage() {
            const p = parseInt(document.getElementById('page-jump').value);
            if (p >= 1) { currentPage = p; renderVideos(filteredVideos || allVideos); }
        }
        function applyVideoSort(list, by) {
            const vids = [...list];
            if (by === 'name') vids.sort((a,b) => (a.original_filename||'').localeCompare((b.original_filename||''),'zh'));
             else if (by === 'size-desc') vids.sort((a,b) => Number(b.original_filesize || 0) - Number(a.original_filesize || 0));
             else if (by === 'size-asc') vids.sort((a,b) => Number(a.original_filesize || 0) - Number(b.original_filesize || 0));
            else {
                const times = new Map(vids.map(v => [v, Date.parse(v.created_at) || 0]));
                const direction = by === 'date-asc' ? 1 : -1;
                vids.sort((a,b) => direction * (times.get(a) - times.get(b)));
            }
            return vids;
        }
        function sortVideos() {
            allVideos = applyVideoSort(allVideos, document.getElementById('sort-select').value);
            filterVideos();
        }
        function renderVideos(videos) {
            filteredVideos = videos;
            updateFailedRetryButton();
            const total = videos.length;
            const totalPages = Math.ceil(total / pageSize) || 1;
            if (currentPage > totalPages) currentPage = totalPages;
            const start = (currentPage - 1) * pageSize;
            const pageVideos = videos.slice(start, start + pageSize);
            currentPageVideos = pageVideos;
            updateVideoBatchBar();
            const grid = document.getElementById("videos-grid");
            document.getElementById("video-count").textContent = `(${total})`;
            if (pageVideos.length === 0) {
                const filtered = RHTagFilter.active(mediaTagFilter) || document.getElementById('search-input').value.trim();
                grid.innerHTML = `<p class="empty">${filtered ? '没有符合当前搜索或标签条件的视频，可调整或清除筛选。' : '暂无视频'}</p>`;
                renderPaginator(0, 1); return;
            }
            grid.innerHTML = pageVideos.map(v => {
                const sizeMB = ((v.original_filesize || 0) / 1024 / 1024).toFixed(1);
                const folderHtml = v.folder_label ? `<span class="folder-badge">${favEsc(v.folder_label)}</span> ` : '';
                const hasUploadOriginal = v.has_upload_original ?? !!v.upload_original_path;
                const isReference = v.source_kind === 'watch' || (!hasUploadOriginal && (v.has_source ?? !!v.source_path));
                const needsReprocess = v.status === 'failed';
                const refBadge = isReference ? '<span class="ref-badge">引用源文件</span> ' : '';
                return `<div class="video-card" data-video-id="${v.id}">
                    <div class="video-thumbnail" data-image-preview aria-label="视频缩略图">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="m10 9 5 3-5 3V9Z"></path></svg>
                        <img src="${RHVideoHost.asset(API_BASE+'/videos/'+encodeURIComponent(v.id)+'/thumbnail')}" width="192" height="108" loading="lazy" decoding="async" fetchpriority="low" alt="" data-rh-load="h283" data-rh-a-h283="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null])}" data-rh-error="h284" data-rh-a-h284="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null])}">
                    </div>
                    <div class="video-info">
                        <h3 title="${v.original_filename}">${v.original_filename}</h3>
                        <div class="meta">
                            ${folderHtml}${refBadge}<span class="status-badge status-${v.status}">${v.status}</span>
                            ${v.source_replaced_at ? `<span style="color:#00897b;font-size:0.85em" title="原片已被替换为更小的压缩版本（原 ${((v.source_replaced_from_size||0)/1024/1024).toFixed(0)}MB → 现 ${sizeMB}MB）">&bull; 已替换原片</span>` : ''}
                            ${sizeMB} MB &bull; ${v.original_duration || 0}s &bull; ${v.original_resolution || 'N/A'}
                            ${hasUploadOriginal ? '<span style="color:#e65100;font-size:0.85em">&bull; 含上传原片</span>' : ''}
                            &bull; ${new Date(v.created_at).toLocaleDateString()}
                        </div>
                        <div class="hidden" data-live-progress-video="${v.id}"></div>
                    </div>
                    <div class="video-actions">
                        ${videoMultiSelect ? `<input class="video-select-checkbox" type="checkbox" tabindex="-1" aria-hidden="true" ${videoBatchIds.has(v.id) ? 'checked' : ''} style="width:16px;height:16px;flex:0 0 auto">` : ''}
                        ${starBtnHtml('video', v.id)}
                        <button class="btn btn-success" data-rh-click="h285" data-rh-a-h285="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,v.id,null,null,null,null,null,null,null])}" style="padding:4px 12px;font-size:0.8em">播放</button>
                        <button class="btn btn-secondary" data-rh-click="h286" data-rh-a-h286="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,v.id,null,null,null,null,null,null])}" style="padding:4px 12px;font-size:0.8em">超压播放</button>
                        <button class="btn" data-rh-click="h287" data-rh-a-h287="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,v.id,null,null,null,null,null])}" style="padding:4px 12px;font-size:0.8em">信息</button>
                        <button class="btn" data-rh-click="h288" data-rh-a-h288="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,v.id,null,null,null,null])}" style="padding:4px 12px;font-size:0.8em">本地打开</button>
                        <button class="btn" data-rh-click="h289" data-rh-a-h289="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,v.id,null,null,null])}" style="padding:4px 12px;font-size:0.8em">打开文件夹</button>
                                                 <button class="btn btn-secondary" data-rh-click="h290" data-rh-a-h290="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,v.id,null,null])}" style="padding:4px 10px;font-size:0.8em" title="把原文件替换成更小的压缩版本（旧原片备份30天）">⇄ 替换原片</button>
                        ${needsReprocess?`<button class="btn btn-secondary" data-rh-click="h282" data-rh-a-h282="${RHVideoBindings.encode([v.id])}" style="padding:4px 12px;font-size:0.8em">重试</button>`:''}
                                                 <button class="btn btn-danger" data-rh-click="h291" data-rh-a-h291="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,v.id])}" style="padding:2px 8px;font-size:1.1em;line-height:1" title="删除源文件并暂存30天">&times;</button>
                    </div>
                </div>`;
            }).join('');
            syncVideoSelection();
            renderPaginator(total, totalPages);
            renderVideoProcessingProgress();
        }
        // ============ 替换原片 ============
        let replaceModalVideoId = null;
        let replaceBatchIds = null; // 非空时为批量模式（video id 数组）
        function replaceParams() {
            return {
                max_resolution: document.getElementById('replace-res').value || null,
                crf: parseInt(document.getElementById('replace-crf').value) || 30,
            };
        }
        function showBatchReplaceModal() {
            if (!videoBatchIds.size) return;
            replaceEstimateRequest++;
            replaceSubmissionKey = null;
            replaceReceiptMismatch = false;
            document.getElementById('replace-receipt-warning').classList.add('hidden');
            // Selection is authoritative across pages and index refreshes. Keep even
            // IDs absent from the latest index; the backend validates the whole batch.
            const order = new Map(allVideos.map((v, index) => [v.id, index]));
            replaceBatchIds = [...videoBatchIds].sort((a, b) =>
                (order.get(a) ?? allVideos.length) - (order.get(b) ?? allVideos.length));
            replaceModalVideoId = null;
            const totalMB = replaceBatchIds.reduce((s, id) => {
                const v = allVideos.find(x => x.id === id);
                return s + ((v && v.original_filesize) || 0);
            }, 0) / 1024 / 1024;
            document.getElementById('replace-title').textContent = `批量替换原片（${replaceBatchIds.length} 个）`;
            document.getElementById('replace-body').innerHTML = `
                <p>已选 <b>${replaceBatchIds.length}</b> 个视频，合计约 <b>${totalMB.toFixed(1)} MB</b>。确认后整批提交后端，按列表顺序排队，刷新或关闭页面不影响执行：</p>
                <div style="display:flex;gap:14px;align-items:center;margin:12px 0;flex-wrap:wrap">
                    <label>分辨率上限
                        <select id="replace-res" data-rh-change="h280" data-rh-a-h280="${RHVideoBindings.encode([null,null])}" style="padding:3px 6px">
                            <option value="">原分辨率</option>
                            <option value="1920x1080">1080p</option>
                            <option value="1280x720" selected>720p</option>
                            <option value="854x480">480p</option>
                        </select>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px">质量 CRF
                        <input type="range" id="replace-crf" min="23" max="36" value="30" style="width:110px"
                            data-rh-input="h281" data-rh-a-h281="${RHVideoBindings.encode([null,null])}">
                        <span id="replace-crf-label" style="min-width:20px">30</span>
                    </label>
                </div>
                <div id="replace-estimate-result" style="margin-top:6px;padding:8px 10px;background:#f0f2ff;border-radius:6px"></div>
                <p style="margin-top:10px;color:#b71c1c">⚠ 每个视频的原画质进入暂存备份保留 30 天；压不小的视频会自动跳过（该文件不动）。</p>`;
            document.getElementById('replace-confirm-btn').disabled = true;
            const cf = document.getElementById('replace-confirm-btn');
            cf.textContent = `确认替换 ${replaceBatchIds.length} 个`; cf.onclick = doReplaceConfirm;
            document.getElementById('replace-estimate-btn').disabled = false;
            document.getElementById('replace-modal').classList.add('show');
        }
        function showReplaceModal(id) {
            replaceEstimateRequest++;
            replaceSubmissionKey = null;
            replaceReceiptMismatch = false;
            document.getElementById('replace-receipt-warning').classList.add('hidden');
            replaceBatchIds = null;
            document.getElementById('replace-title').textContent = '替换原片';
            document.getElementById('replace-batch-progress')?.style.setProperty('display', 'none');
            const v = allVideos.find(x => x.id === id);
            if (!v) return;
            replaceModalVideoId = id;
            const sizeMB = ((v.original_filesize || 0) / 1024 / 1024).toFixed(1);
            document.getElementById('replace-body').innerHTML = `
                <p style="word-break:break-all"><b>${favEsc(v.original_filename || '')}</b></p>
                <p>当前原片：<b>${sizeMB} MB</b> · ${favEsc(String(v.original_resolution || 'N/A'))} · ${favEsc(String(v.codec || '?'))}</p>
                <div style="display:flex;gap:14px;align-items:center;margin:12px 0;flex-wrap:wrap">
                    <label>分辨率上限
                        <select id="replace-res" data-rh-change="h278" data-rh-a-h278="${RHVideoBindings.encode([null,null,null,null])}" style="padding:3px 6px">
                            <option value="">原分辨率</option>
                            <option value="1920x1080">1080p</option>
                            <option value="1280x720" selected>720p</option>
                            <option value="854x480">480p</option>
                        </select>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px">质量 CRF
                        <input type="range" id="replace-crf" min="23" max="36" value="30" style="width:110px"
                            data-rh-input="h279" data-rh-a-h279="${RHVideoBindings.encode([null,null,null,null])}">
                        <span id="replace-crf-label" style="min-width:20px">30</span>
                    </label>
                </div>
                <div id="replace-estimate-result" style="margin-top:6px;padding:8px 10px;background:#f0f2ff;border-radius:6px"></div>
                <p style="margin-top:10px;color:#b71c1c">⚠ 原画质将进入暂存备份保留 30 天，之后永久删除；监控目录中的源文件会被覆盖为压缩版。</p>`;
            document.getElementById('replace-confirm-btn').disabled = true;
            const cf = document.getElementById('replace-confirm-btn');
            cf.textContent = '确认替换'; cf.onclick = doReplaceConfirm;
            document.getElementById('replace-estimate-btn').disabled = false;
            document.getElementById('replace-modal').classList.add('show');
        }
        function onReplaceParamsChanged() {
            replaceEstimateRequest++;
            replaceSubmissionKey = null;
            document.getElementById('replace-confirm-btn').disabled = true;
            document.getElementById('replace-estimate-btn').disabled = false;
            const el = document.getElementById('replace-estimate-result');
            if (el) el.innerHTML = '<span style="color:#888">参数已变化，请重新预估</span>';
        }
        function closeReplaceModal() {
            replaceEstimateRequest++;
            document.getElementById('replace-modal').classList.remove('show');
            replaceModalVideoId = null;
        }
        async function doReplaceEstimate() {
            const estimateId = replaceBatchIds ? replaceBatchIds[0] : replaceModalVideoId;
            if (!estimateId) return;
            const requestId = ++replaceEstimateRequest;
            const params = replaceParams();
            const btn = document.getElementById('replace-estimate-btn');
            const out = document.getElementById('replace-estimate-result');
            btn.disabled = true;
            document.getElementById('replace-confirm-btn').disabled = true;
            out.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:-2px"></span> 采样转码预估中（约需几秒到几十秒）…';
            try {
                const res = await fetch(`${API_BASE}/videos/${estimateId}/replace-source/estimate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(params),
                });
                const data = await res.json();
                if (requestId !== replaceEstimateRequest) return;
                if (!res.ok) throw new Error(data.detail || data.message || '预估失败');
                const origMB = (data.original_size / 1024 / 1024).toFixed(1);
                const estMB = (data.estimated_size / 1024 / 1024).toFixed(1);
                if (replaceBatchIds) {
                    const totalMB = replaceBatchIds.reduce((s, id) => {
                        const v = allVideos.find(x => x.id === id);
                        return s + ((v && v.original_filesize) || 0);
                    }, 0) / 1024 / 1024;
                    const estTotal = totalMB * (1 - data.savings_pct / 100);
                    out.innerHTML = data.savings_pct > 0
                        ? `采样第 1 个视频：节省 <b style="color:#2e7d32">${data.savings_pct}%</b>（${origMB} → 约 ${estMB} MB）。按此推算 ${replaceBatchIds.length} 个合计约 <b>${totalMB.toFixed(1)} MB → ${estTotal.toFixed(1)} MB</b><br><span style="color:#888">每个视频替换前仍会单独转码校验，压不小的自动跳过</span>`
                        : `采样显示压不小（${origMB} → 约 ${estMB} MB），不建议批量替换`;
                } else {
                    out.innerHTML = data.savings_pct > 0
                        ? `预计：<b>${origMB} MB → 约 ${estMB} MB</b>（节省 <b style="color:#2e7d32">${data.savings_pct}%</b>，采样 ${data.sample_seconds}s 外推，误差约 ±15%）`
                        : `预计压不小（${origMB} MB → 约 ${estMB} MB），不建议替换`;
                }
                document.getElementById('replace-confirm-btn').disabled = data.savings_pct <= 0 || replaceReceiptMismatch;
            } catch (e) {
                if (requestId === replaceEstimateRequest) out.innerHTML = `<span style="color:#b71c1c">预估失败：${favEsc(e.message)}</span>`;
            } finally {
                if (requestId === replaceEstimateRequest) btn.disabled = false;
            }
        }
        async function doReplaceConfirm() {
            if (replaceSubmitting || replaceReceiptMismatch) return;
            const ids = replaceBatchIds ? replaceBatchIds.slice() : (replaceModalVideoId ? [replaceModalVideoId] : []);
            if (!ids.length) return;
            const params = replaceParams();
            const signature = JSON.stringify([ids, params]);
            if (!replaceSubmissionKey || replaceSubmissionKey.signature !== signature) {
                replaceSubmissionKey = { signature, id: window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) };
            }
            const requestId = replaceSubmissionKey.id;
            const btn = document.getElementById('replace-confirm-btn');
            replaceSubmitting = true;
            btn.disabled = true;
            btn.textContent = '提交中…';
            try {
                const res = await fetch(`${API_BASE}/replace-batches`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ video_ids: ids, ...params, request_id: requestId }),
                });
                const batch = await res.json();
                if (!res.ok) throw new Error(batch.detail || '批次提交失败');
                if (!batch?.id || batch.total !== ids.length || !Array.isArray(batch.items)
                    || batch.items.length !== ids.length || batch.items.some((item, i) => item.video_id !== ids[i])) {
                    replaceReceiptMismatch = true;
                    document.getElementById('replace-receipt-message').textContent =
                        `本次选择 ${ids.length} 个，后端回执数量为 ${batch?.total ?? '未知'} 个，任务明细未能完整核对。已保留选择，请先查看任务详情，避免重复提交。`;
                    document.getElementById('replace-receipt-warning').classList.remove('hidden');
                    if (batch?.id) {
                        replacementSelectedId = batch.id;
                        await loadReplacementJobs();
                    }
                    return;
                }
                if (replaceSubmissionKey?.id === requestId) {
                    closeReplaceModal();
                    if (videoMultiSelect) toggleVideoMultiSelect(false);
                }
                replacementSelectedId = batch.id;
                syncGlobalQueueVisibility();
                notify(`后端已接收并核对 ${batch.total} / ${ids.length} 个替换任务，将按顺序处理`, 'success');
                await loadReplacementJobs();
            } catch (e) {
                notify('提交失败：' + e.message + '；可重试，重复提交不会新建同一批次', 'error');
                if (replaceSubmissionKey?.id === requestId) btn.disabled = false;
            } finally {
                replaceSubmitting = false;
                btn.textContent = replaceBatchIds ? `确认替换 ${replaceBatchIds.length} 个` : '确认替换';
            }
        }

        function replacementActive(job) { return ['queued', 'running', 'stopping', 'paused'].includes(job.status); }
        function replacementSummary(job) {
            const c = job.counts;
            const done = job.total - c.pending - c.running;
            const label = { queued: '等待', running: '处理中', stopping: '停止中', paused: job.current ? '当前项完成后重启' : '等待重启', completed: '已结束', cancelled: '已停止' }[job.status] || job.status;
            return `${label} ${done}/${job.total} · 成功 ${c.succeeded} · 跳过 ${c.skipped} · 失败 ${c.failed + c.interrupted}` + (c.cancelled ? ` · 已取消 ${c.cancelled}` : '');
        }
        function renderReplacementProgress() {
            const active = replacementJobs.filter(replacementActive);
            const job = active[0] || replacementJobs[0];
            const current = processingProgress.replacement.find(item => item.batch_id === job?.id)
                || (!processingProgressReceivedAt || processingProgressError ? job?.current : null);
            const text = job ? '原片替换：' + (current ? formatProcessingProgress(current.progress) + ' · ' : '') + replacementSummary(job) + (current ? ' · ' + current.filename : '') + (active.length > 1 ? `（另 ${active.length - 1} 批等待）` : '') : '原片替换：空闲';
            document.getElementById('queue-bar').classList.remove('hidden');
            for (const prefix of ['', 'list-']) {
                const label = document.getElementById(prefix + 'replacement-queue-text');
                renderTaskProgress(label, { kind: 'replacement', progress: current?.progress, filename: current?.filename,
                    active: active.length > 0, summary: job ? replacementSummary(job) + (active.length > 1 ? ` · 另 ${active.length - 1} 批等待` : '') : '暂无替换任务' });
                label.title = text + (job?.current?.message ? '\n' + job.current.message : '');
                document.getElementById(prefix + 'replacement-queue-dot').classList.toggle('active', active.length > 0);
                const stop = document.getElementById(prefix + 'replacement-stop-btn');
                stop.classList.toggle('hidden', !active.length);
                stop.disabled = job?.status === 'stopping';
            }
            renderQueueContext('replacement-queue-context', current?.filename,
                job ? replacementSummary(job) + (active.length > 1 ? ` · 另 ${active.length - 1} 批等待` : '') : '暂无替换任务');
            syncGlobalQueueVisibility();
        }
        function loadReplacementJobs() {
            if (!token) return Promise.resolve();
            if (replacementJobsPromise) return replacementJobsPromise;
            const userToken = token;
            replacementJobsPromise = (async () => {
                try {
                    const res = await fetch(`${API_BASE}/replace-batches`, { headers: { 'Authorization': `Bearer ${userToken}` } });
                    if (!res.ok) throw new Error('替换任务加载失败（' + res.status + '）');
                    const data = await res.json();
                    if (token !== userToken) return;
                    const previous = replacementJobs.reduce((sum, job) => sum + job.counts.succeeded, 0);
                    replacementJobs = data.items || [];
                    renderReplacementProgress();
                    if (replacementJobs.reduce((sum, job) => sum + job.counts.succeeded, 0) > previous) loadVideos();
                } catch (e) {
                    if (token === userToken) document.getElementById('replacement-queue-text').title = e.message;
                }
            })().finally(() => { replacementJobsPromise = null; });
            return replacementJobsPromise;
        }
        function showDefaultTasks(view = 'running') { RHTaskCenter.open('default', view); }
        function showReplacementTasks() { RHTaskCenter.open('replacement'); }
        async function stopReplacementBatch(id) {
            const target = id || replacementJobs.find(replacementActive)?.id;
            if (!target) return;
            try {
                const res = await fetch(`${API_BASE}/replace-batches/${encodeURIComponent(target)}/cancel`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) throw new Error('停止失败');
                notify('已停止剩余任务；当前正在替换的文件会安全完成', 'info');
                await loadReplacementJobs();
            } catch (e) { notify(e.message, 'error'); }
        }
        async function playVideo(id) { if(RHVideoHost.native)return playVideoLocal(id);window.open(`${API_BASE}/videos/${id}/play`, '_blank'); }
        async function playSuper(id) { if(RHVideoHost.native)return playSuperLocal(id);window.open(`${API_BASE}/videos/${id}/play?super=true`, '_blank'); }
        function playVideoLocal(id) {
            const v = allVideos.find(v => v.id === id);
            if (!v) return;
            const url = `${API_BASE}/videos/${id}/play`;
            const title = (v.folder_label ? '['+v.folder_label+'] ' : '') + v.original_filename;
            const item = { type: 'video', url, title, info: (v.original_duration||0)+'s | '+v.original_resolution, videoId: id };
            if (!mediaStack.length) {
                const gridIdx = gridMedia.findIndex(m => m.videoId === id);
                if (gridIdx >= 0) {
                    mediaStack.push({ items: gridMedia, index: gridIdx });
                }
                openMediaViewer([item], 0);
            } else {
                pushMediaViewer([item], 0);
            }
            saveMediaState();
        }
        function playDuplicateVideo(item) {
            if (!item || item.media_type !== 'video' || !item.id) return;
            const entry = {type:'video',url:`${API_BASE}/videos/${encodeURIComponent(item.id)}/play?quality=lowest`,
                title:item.filename,videoId:item.id,info:[item.duration_seconds == null ? '' : Math.round(item.duration_seconds)+'s',item.resolution||''].filter(Boolean).join(' | ')};
            if (mediaStack.length) pushMediaViewer([entry],0);
            else openMediaViewer([entry],0);
            saveMediaState();
        }
        function playSuperLocal(id) {
            const v = allVideos.find(v => v.id === id);
            if (!v) return;
            const url = `${API_BASE}/videos/${id}/play?super=true`;
            const title = (v.folder_label ? '['+v.folder_label+'] ' : '') + v.original_filename + ' (超压)';
            const item = { type: 'video', url, title, info: (v.original_duration||0)+'s | '+v.original_resolution, videoId: id };
            if (!mediaStack.length) {
                const gridIdx = gridMedia.findIndex(m => m.videoId === id);
                if (gridIdx >= 0) {
                    mediaStack.push({ items: gridMedia, index: gridIdx });
                }
                openMediaViewer([item], 0);
            } else {
                pushMediaViewer([item], 0);
            }
            saveMediaState();
        }
        async function openVideo(id) { try { await fetch(`${API_BASE}/videos/${id}/open`, {method:"POST"}); } catch(e){ notify("打开失败: "+e.message, 'error'); } }
        async function openFolder(id) { try { await fetch(`${API_BASE}/videos/${id}/open-folder`, {method:"POST"}); } catch(e){ notify("打开失败: "+e.message, 'error'); } }
        async function reprocessVideo(id) {
            try {
                const res = await fetch(`${API_BASE}/videos/${id}/reprocess`, { method: "POST", headers: { "Authorization": `Bearer ${token}` } });
                if (res.ok) { notify('已重新加入处理队列', 'success'); setTimeout(loadVideos, 2000); } else notify('重试失败', 'error');
            } catch (e) { notify("网络错误: " + e.message, 'error'); }
        }
        let videoInfoRequest = 0;
        async function showVideoInfo(id) {
            const requestId = ++videoInfoRequest;
            document.getElementById('info-content').innerHTML = '<span class="spinner"></span>加载详情中…';
            document.getElementById('info-modal').classList.add('show');
            let v;
            try {
                const res = await fetch(`${API_BASE}/videos/${encodeURIComponent(id)}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) throw new Error('详情加载失败（' + res.status + '）');
                v = await res.json();
            } catch (e) {
                if (requestId === videoInfoRequest) document.getElementById('info-content').textContent = e.message;
                return;
            }
            if (requestId !== videoInfoRequest) return;
            const isReference = v.source_kind === 'watch' || (!v.upload_original_path && v.source_path);
            const sizeMB = ((v.original_filesize || 0) / 1024 / 1024).toFixed(1);
            let compSize = 0;
            const variants = Array.isArray(v.variants) ? v.variants : (Array.isArray(v.compressed_path) ? v.compressed_path : []);
            variants.forEach(cp => { if (cp && cp.size) compSize += cp.size; });
            const compMB = compSize > 0 ? (compSize / 1024 / 1024).toFixed(1) : '0';
            const ratio = compSize > 0 ? ((v.original_filesize||0) / compSize).toFixed(1) + 'x' : '无';
            const created = new Date(v.created_at).toLocaleString();
            const sourceInfo = isReference
                ? `<p><b>源文件路径:</b> ${v.source_path || v.original_path || '未知'}</p>`
                : `<p><b>上传原片:</b> ${v.upload_original_path || '未知'}</p>`;
            document.getElementById('info-content').innerHTML = `
                <p><b>文件名:</b> ${v.original_filename}</p>
                ${sourceInfo}
                <p><b>来源:</b> ${isReference ? '监控引用（源文件不复制、不修改）' : '网页上传'}</p>
                <p><b>原始大小:</b> ${sizeMB} MB</p>
                <p><b>压缩后:</b> ${compMB} MB &bull; 压缩率: ${ratio}</p>
                <p><b>时长:</b> ${v.original_duration || 0}s</p>
                <p><b>分辨率:</b> ${v.original_resolution || 'N/A'}</p>
                <p><b>状态:</b> ${v.status}</p>
                ${v.error_message ? `<p><b>错误:</b> ${v.error_message}</p>` : ''}
                <p><b>标签:</b> ${v.folder_label || '无'}</p>
                <p><b>入库时间:</b> ${created}</p>
            `;
            document.getElementById('info-modal').classList.add('show');
        }
        function closeInfoModal() { videoInfoRequest++; document.getElementById('info-modal').classList.remove('show'); }
                        // ============ Preview delete queue ==========
        function previewDeleteKey(type, id) {
            return String(type) + ':' + String(id);
        }

        function previewDeleteLookup(type, id, fallbackName) {
            const key = String(id);
            let source = null;
            if (type === 'video') source = allVideos.find(item => String(item.id) === key);
            else if (type === 'picture') source = allPictures.find(item => String(item.id) === key);
            else if (type === 'novel') source = allNovels.find(item => String(item.id) === key);
            let name = fallbackName || '';
            if (!name && source) {
                name = type === 'novel'
                    ? (source.title || '小说') + '.txt'
                    : (source.original_filename || source.filename || source.title || type);
            }
            return { type, id: key, name: name || (type === 'video' ? '视频' : type === 'picture' ? '图片' : '小说') };
        }

        function isPreviewDeleteMarked(type, id) {
            return pendingPreviewDeletes.has(previewDeleteKey(type, id));
        }

        function togglePreviewDelete(type, id, fallbackName) {
            if (id == null || id === '') return;
            const target = previewDeleteLookup(type, id, fallbackName);
            const key = previewDeleteKey(target.type, target.id);
            if (pendingPreviewDeletes.has(key)) {
                pendingPreviewDeletes.delete(key);
                notify('已取消“' + target.name + '”的删除标记', 'info');
            } else {
                pendingPreviewDeletes.set(key, target);
                notify('已标记“' + target.name + '”删除，关闭预览后执行', 'info');
            }
            updatePreviewDeleteUi();
        }

        function previewDeleteButton(type, id, fallbackName, compact) {
            if (id == null || id === '') return '';
            const target = previewDeleteLookup(type, id, fallbackName);
            const marked = isPreviewDeleteMarked(target.type, target.id);
            const label = compact ? (marked ? '↶' : '×') : (marked ? '取消标记' : '标记删除');
            const title = (marked ? '取消标记删除：' : '标记删除：') + target.name + '（Delete）';
            return `<button type="button" class="btn-sm preview-delete-button${marked ? ' marked' : ''}" data-preview-delete-type="${favEsc(target.type)}" data-preview-delete-id="${favEsc(target.id)}" data-preview-delete-name="${favEsc(target.name)}" data-preview-delete-compact="${compact ? 'true' : 'false'}" data-rh-click="h277" data-rh-a-h277="${RHVideoBindings.encode([null,null,null,null,null,null,null])}" title="${favEsc(title)}" aria-keyshortcuts="Delete">${label}</button>`;
        }

        function previewDeleteShortcutButton(event) {
            const selector = '.media-viewer, .grid-viewer, .pic-strip-viewer, .timeline-viewer, .kenburns-viewer, #novel-reader, #novel-preview';
            const viewers = Array.from(document.querySelectorAll(selector)).filter(el => el.getClientRects().length);
            // Only the top viewer owns the shortcut; a viewer without a delete
            // action must not pass the key through to a preview underneath it.
            const viewer = document.fullscreenElement?.closest(selector) || viewers.reduce((top, el) =>
                !top || Number(getComputedStyle(el).zIndex) >= Number(getComputedStyle(top).zIndex) ? el : top, null);
            if (!viewer) return null;
            if (viewer.id === 'pic-strip-viewer') return document.getElementById('pic-strip-delete-btn');
            if (viewer.id === 'grid-viewer') {
                const cell = document.fullscreenElement?.closest('.grid-video-cell')
                    || viewer.querySelector('.grid-cell-expanded')
                    || viewer.querySelector('.grid-video-cell:hover')
                    || (viewer.contains(event.target) ? event.target.closest?.('.grid-video-cell') : null);
                return cell?.querySelector('.preview-delete-button');
            }
            if (viewer.id === 'media-viewer') return viewer.querySelector('#media-actions .preview-delete-button');
            if (viewer.id === 'playlist-viewer') return viewer.querySelector('#playlist-delete-action .preview-delete-button');
            return null;
        }

        document.addEventListener('keydown', event => {
            if (event.key !== 'Delete' || event.defaultPrevented || event.isComposing
                || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
            const target = event.target;
            if (target?.isContentEditable || target?.closest?.('input, textarea, select, [role="textbox"]')) return;
            if (document.querySelector('.modal-overlay.show, dialog[open]')) return;
            const button = previewDeleteShortcutButton(event);
            if (!button || button.disabled || !button.getClientRects().length) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            // Reuse the button's toggle and deferred execution. Holding Delete
            // must not repeatedly add and remove the same mark.
            if (!event.repeat) button.click();
        }, true);

        function togglePreviewDeleteFromButton(button) {
            if (!button) return;
            togglePreviewDelete(button.dataset.previewDeleteType, button.dataset.previewDeleteId, button.dataset.previewDeleteName);
        }

        function updatePreviewDeleteUi() {
            document.querySelectorAll('.preview-delete-button').forEach(button => {
                const type = button.dataset.previewDeleteType;
                const id = button.dataset.previewDeleteId;
                const marked = isPreviewDeleteMarked(type, id);
                const compact = button.dataset.previewDeleteCompact === 'true';
                const name = button.dataset.previewDeleteName || '媒体';
                button.classList.toggle('marked', marked);
                button.textContent = compact ? (marked ? '↶' : '×') : (marked ? '取消标记' : '标记删除');
                button.title = (marked ? '取消标记删除：' : '标记删除：') + name + '（Delete）';
            });
            document.querySelectorAll('.grid-video-cell[data-video-id]').forEach(cell => {
                cell.classList.toggle('preview-delete-marked', isPreviewDeleteMarked('video', cell.dataset.videoId));
            });
            updatePicStripDeleteButton();
        }

        function mediaDeleteTarget(item) {
            if (!item) return null;
            if (item.videoId) return { type: 'video', id: item.videoId, name: item.title || '视频' };
            if (item.pictureId) return { type: 'picture', id: item.pictureId, name: item.title || '图片' };
            return null;
        }

        function mediaDeleteBtn(item) {
            const target = mediaDeleteTarget(item);
            return target ? previewDeleteButton(target.type, target.id, target.name, false) : '';
        }

        function updateMediaProgressVisibility() {
            const bar = document.getElementById('media-progress');
            const row = bar && bar.closest('.seq-progress-row');
            const item = mediaItems[mediaIndex];
            if (row) row.classList.toggle('hidden', mediaItems.length <= 1);
            const content = document.getElementById('media-content');
            if (content) {
                content.classList.toggle('media-video-active', !!(item && item.type === 'video'));
                content.classList.toggle('media-sequence-active', mediaItems.length > 1);
            }
        }

        function renderPreviewDeleteExecution(run) {
            const body = document.getElementById('preview-delete-body');
            if (!body || !run) return;
            const completed = run.completed.size;
            const current = run.targets[run.currentIndex];
            const intro = run.cancelRequested
                ? '正在取消剩余删除，请等待当前请求结束。'
                : `正在执行标记删除（${completed}/${run.targets.length}）${current ? '：' + favEsc(current.name) : ''}`;
            const items = run.targets.map((target, index) => {
                const key = previewDeleteKey(target.type, target.id);
                let status = '等待中';
                let className = '';
                if (run.completed.has(key)) { status = '已完成'; className = 'preview-delete-done'; }
                else if (run.failed.has(key)) { status = '失败：' + (run.errors.get(key) || '未知错误'); className = 'preview-delete-failed'; }
                else if (run.cancelRequested && index >= run.currentIndex) status = '已取消';
                else if (index === run.currentIndex) status = '处理中';
                return `<li class="${className}">${favEsc(target.name)}：${favEsc(status)}</li>`;
            }).join('');
            body.innerHTML = `<p>${intro}</p><ul class="preview-delete-items">${items}</ul>`;
        }

        function startPreviewDeleteExecution() {
            if (previewDeleteExecution || !pendingPreviewDeletes.size) return;
            const run = {
                targets: Array.from(pendingPreviewDeletes.values()),
                currentIndex: -1,
                completed: new Set(),
                failed: new Set(),
                errors: new Map(),
                controller: new AbortController(),
                cancelRequested: false,
            };
            previewDeleteExecution = run;
            document.getElementById('preview-delete-title').textContent = '执行标记删除';
            document.getElementById('preview-delete-cancel-btn').textContent = '取消剩余删除';
            document.getElementById('preview-delete-cancel-btn').disabled = false;
            document.getElementById('preview-delete-modal').classList.add('show');
            renderPreviewDeleteExecution(run);
            executePreviewDeleteQueue(run);
        }

        async function executePreviewDeleteQueue(run) {
            for (let index = 0; index < run.targets.length; index++) {
                if (run.cancelRequested) break;
                const target = run.targets[index];
                const key = previewDeleteKey(target.type, target.id);
                if (!pendingPreviewDeletes.has(key)) continue;
                run.currentIndex = index;
                renderPreviewDeleteExecution(run);
                try {
                    const res = await fetch(`${API_BASE}/trash/${target.type}/${encodeURIComponent(target.id)}`, {
                        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, signal: run.controller.signal
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.detail || '暂存删除失败');
                    pendingPreviewDeletes.delete(key);
                    run.completed.add(key);
                } catch (e) {
                    if (run.cancelRequested) break;
                    run.failed.add(key);
                    run.errors.set(key, e.message);
                }
                renderPreviewDeleteExecution(run);
            }

            const cancelled = run.cancelRequested;
            const completed = run.completed.size;
            const failed = run.failed.size;
            const remaining = Array.from(pendingPreviewDeletes.values()).filter(target =>
                run.targets.some(item => previewDeleteKey(item.type, item.id) === previewDeleteKey(target.type, target.id))
            );
            previewDeleteExecution = null;
            const body = document.getElementById('preview-delete-body');
            const cancelBtn = document.getElementById('preview-delete-cancel-btn');
            if (cancelled) {
                body.innerHTML = `<p>已取消剩余删除。已完成 <b>${completed}</b> 项，仍保留 <b>${remaining.length}</b> 项待删标记。</p>`;
                notify('已取消剩余删除，未完成项目仍保留标记', 'info');
            } else {
                body.innerHTML = `<p>标记删除处理完成：成功 <b>${completed}</b> 项${failed ? '，失败 <b>' + failed + '</b> 项' : ''}。</p>` +
                    (remaining.length ? `<p class="text-sm">失败项目仍保留标记，可在下次关闭预览时重试。</p>` : '');
                if (completed) {
                    loadVideos(); loadGrid(); loadFolders(); loadPictures(); loadNovels(); loadFavoriteIds();
                    requestFavoritesRefresh();
                }
                if (completed) notify('已将 ' + completed + ' 项源文件移入暂存区', 'success');
                if (failed) notify('有 ' + failed + ' 项标记删除失败，可稍后重试', 'error');
            }
            cancelBtn.textContent = '关闭';
            cancelBtn.disabled = false;
        }

        function cancelPreviewDeleteExecution() {
            if (!previewDeleteExecution) {
                document.getElementById('preview-delete-modal').classList.remove('show');
                return;
            }
            previewDeleteExecution.cancelRequested = true;
            if (previewDeleteExecution.controller) previewDeleteExecution.controller.abort();
            const button = document.getElementById('preview-delete-cancel-btn');
            button.disabled = true;
            button.textContent = '正在取消...';
            renderPreviewDeleteExecution(previewDeleteExecution);
        }

        // ============ Stage source deletion (list and shelf) ==========
        function beginStageDelete(type, id, name) {
            pendingStageDelete = { type, id, name: name || '未命名媒体' };
            pendingStageDeleteStep = 1;
            updateStageDeleteModal();
            document.getElementById('stage-delete-modal').classList.add('show');
        }
        function requestStageDeleteVideo(id) {
            const video = allVideos.find(v => v.id === id);
            beginStageDelete('video', id, video ? video.original_filename : '视频');
        }
        function requestStageDeletePicture(id) {
            const picture = allPictures.find(p => p.id === id);
            beginStageDelete('picture', id, picture ? picture.original_filename : '图片');
        }
        function updateStageDeleteModal() {
            const first = pendingStageDeleteStep === 1;
            document.getElementById('stage-delete-msg').textContent = first
                ? `第一次确认：确定要删除“${pendingStageDelete?.name || ''}”，并将源文件移入暂存区吗？源文件会从原路径移走，暂存保留 30 天。`
                : `第二次确认：源文件将在原路径消失，30 天内只能通过暂存区恢复，不能提前永久删除。确定继续吗？`;
            document.getElementById('stage-delete-confirm-btn').textContent = first ? '继续确认' : '确认删源并暂存';
        }
        function closeStageDeleteModal() {
            document.getElementById('stage-delete-modal').classList.remove('show');
            pendingStageDelete = null;
            pendingStageDeleteStep = 0;
        }
        async function confirmStageDeleteStep() {
            if (!pendingStageDelete) return;
            if (pendingStageDeleteStep === 1) {
                pendingStageDeleteStep = 2;
                updateStageDeleteModal();
                return;
            }
            const target = pendingStageDelete;
            const deleteStartedAt = performance.now();
            rhDebug('api:start', { type: target.type, id: target.id });
            closeStageDeleteModal();
            try {
                const res = await fetch(`${API_BASE}/trash/${target.type}/${encodeURIComponent(target.id)}`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json().catch(() => ({}));
                rhDebug('api:done', { type: target.type, id: target.id, status: res.status, ms: Math.round(performance.now() - deleteStartedAt) });
                if (!res.ok) throw new Error(data.detail || '暂存删除失败');
                notify('源文件已移入暂存区，30 天内可恢复', 'success');
                if (target.type === 'picture') {
                    removePictureFromLocalState(target.id);
                } else if (target.type === 'novel') {
                    loadNovels();
                } else {
                    loadVideos(); loadGrid(); loadFolders();
                }
            } catch (e) {
                rhDebug('api:error', { type: target.type, id: target.id, message: e.message, ms: Math.round(performance.now() - deleteStartedAt) });
                notify('暂存删除失败: ' + e.message, 'error');
            }
        }

        function formatStorageBytes(value) {
            let bytes = Number(value) || 0;
            const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
            let index = 0;
            while (bytes >= 1024 && index < units.length - 1) { bytes /= 1024; index++; }
            return `${bytes.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
        }
        function scheduleStoragePoll() {
            clearTimeout(storagePollTimer);
            if (token && !document.getElementById('tab-storage').classList.contains('hidden')) storagePollTimer = setTimeout(() => loadStorageUsage(), 1000);
        }
        function refreshStorageUsage() { loadStorageUsage(true); loadWatchFolderUsage(true); RHStorageSavings.load(); }
        function watchUsageTone(key) {
            return ['video', 'image', 'document', 'audio', 'archive', 'temporary'].includes(key) ? key : 'other';
        }
        function watchUsagePercent(bytes, total) {
            return total > 0 ? Math.min(100, Math.max(0, Number(bytes) / total * 100)) : 0;
        }
        function watchUsageDate(value) {
            const date = value && new Date(value);
            return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
        }
        function renderWatchUsageDistribution(categories, total) {
            if (!categories?.length) return '';
            return `<div class="watch-type-bar" aria-hidden="true">${categories.map(item => `<span class="watch-tone-${watchUsageTone(item.key)}" style="flex-grow:${Math.max(0, Number(item.bytes) || 0)}"></span>`).join('')}</div>
                <div class="watch-type-legend">${categories.map(item => `<span><i class="watch-tone-${watchUsageTone(item.key)}"></i>${favEsc(item.name)}<strong>${formatStorageBytes(item.bytes)}</strong><small>${watchUsagePercent(item.bytes, total).toFixed(1)}%</small></span>`).join('')}</div>`;
        }
        function renderWatchUsageRows(rows, total, kind) {
            if (!rows.length) return '<p class="watch-detail-empty">暂无可显示的文件或子目录。</p>';
            return `<div class="watch-detail-list">${rows.map((row, index) => {
                const label = kind === 'extensions' ? (row.extension || '无扩展名') : row.path;
                const metadata = kind === 'files' ? watchUsageDate(row.modified) : `${Number(row.files || 0).toLocaleString()} 个文件${kind === 'folders' && row.directories ? ` · ${Number(row.directories).toLocaleString()} 个子目录` : ''}`;
                const share = watchUsagePercent(row.bytes, total);
                return `<div class="watch-detail-row"><div class="watch-detail-name"><span class="watch-detail-rank">${String(index + 1).padStart(2, '0')}</span><span title="${favEsc(label)}">${favEsc(label)}${row.unreadable_entries ? '<small class="watch-detail-warning">部分可读</small>' : ''}</span></div>
                    <span class="watch-detail-meta">${favEsc(metadata)}</span><div class="watch-detail-size"><strong>${formatStorageBytes(row.bytes)}</strong><small>${share.toFixed(1)}%</small><progress max="100" value="${share}" aria-label="占该监控目录的比例"></progress></div></div>`;
            }).join('')}</div>`;
        }
        function renderWatchUsageDetail(item, view) {
            const total = Number(item.total_bytes) || 0;
            if (view === 'folders') {
                const rows = [...(item.subfolders || [])];
                if (item.root_files?.files) rows.push({ ...item.root_files, path: '根目录内的文件', directories: 0 });
                rows.sort((a, b) => b.bytes - a.bytes);
                return `<p class="watch-detail-caption">各子目录包含其全部后代；根目录文件单独统计。${item.subfolder_count > rows.length - (item.root_files?.files ? 1 : 0) ? `显示占用最大的 ${Number(item.detail_limit || 20)} / ${Number(item.subfolder_count)} 个子目录。` : ''}</p>${renderWatchUsageRows(rows, total, 'folders')}`;
            }
            if (view === 'files') {
                const rows = item.largest_files || [];
                return `<p class="watch-detail-caption">按文件大小排序，显示前 ${rows.length} / ${Number(item.total_files || 0).toLocaleString()} 个文件；路径相对于此监控目录。</p>${renderWatchUsageRows(rows, total, 'files')}`;
            }
            const categories = item.categories || [];
            return `<div class="watch-type-cards">${categories.length ? categories.map(category => `<div class="watch-type-card"><div><i class="watch-tone-${watchUsageTone(category.key)}"></i><span>${favEsc(category.name)}</span><small>${watchUsagePercent(category.bytes, total).toFixed(1)}%</small></div><strong>${formatStorageBytes(category.bytes)}</strong><span>${Number(category.files).toLocaleString()} 个文件</span></div>`).join('') : '<p class="watch-detail-empty">目录中没有可统计的文件。</p>'}</div>
                <div class="watch-detail-heading"><strong>按扩展名</strong><span>${item.extension_count > (item.extensions || []).length ? `显示前 ${Number(item.extension_limit || 12)} / ${Number(item.extension_count)} 种` : '按文件大小排序'}</span></div>${renderWatchUsageRows(item.extensions || [], total, 'extensions')}
                <p class="watch-detail-caption">类型按扩展名识别，未读取文件内容；占用为文件大小合计。</p>`;
        }
        function renderWatchUsageDetails(item, index) {
            const view = watchUsageViews.get(item.id) || 'types';
            const metrics = [
                ['平均文件大小', formatStorageBytes(item.average_file_bytes)],
                ['最大文件', formatStorageBytes(item.largest_files?.[0]?.bytes)],
                ['空文件', `${Number(item.empty_files || 0).toLocaleString()} 个`],
                ['最近文件修改', watchUsageDate(item.latest_modified)],
            ];
            return `<section class="watch-usage-details" id="watch-details-${index}" data-watch-rendered-view="${view}" aria-label="监控目录占用明细"><div class="watch-detail-metrics">${metrics.map(([label, value]) => `<div><span>${label}</span><strong>${favEsc(value)}</strong></div>`).join('')}</div>
                <div class="watch-detail-tabs" role="group" aria-label="明细维度">${[['types', '类型分布'], ['folders', '子目录占用'], ['files', '大文件']].map(([key, label]) => `<button type="button" data-watch-action="view" data-watch-view="${key}" aria-pressed="${view === key}">${label}</button>`).join('')}</div>
                <div class="watch-detail-content">${renderWatchUsageDetail(item, view)}</div></section>`;
        }
        function handleWatchUsageClick(event) {
            const button = event.target.closest('button[data-watch-action]');
            const article = button?.closest('[data-watch-id]');
            if (!article || button.disabled || !watchUsageData) return;
            const id = article.dataset.watchId;
            if (button.dataset.watchAction === 'toggle') {
                if (watchUsageExpanded.has(id)) watchUsageExpanded.delete(id); else watchUsageExpanded.add(id);
            } else if (button.dataset.watchAction === 'view') watchUsageViews.set(id, button.dataset.watchView);
            renderWatchFolderUsage(watchUsageData);
        }
        function renderWatchFolderUsage(data) {
            watchUsageData = data;
            const items = data.items || [];
            const list = document.getElementById('watch-usage-list');
            const active = document.activeElement?.closest('button[data-watch-action]');
            const focus = active && list.contains(active) ? { id: active.closest('[data-watch-id]').dataset.watchId, action: active.dataset.watchAction, view: active.dataset.watchView } : null;
            const scrollPositions = new Map([...list.querySelectorAll('.watch-detail-list')].map(element => [element.closest('[data-watch-id]').dataset.watchId, { view: element.closest('.watch-usage-details').dataset.watchRenderedView, top: element.scrollTop }]));
            const ids = new Set(items.map(item => item.id));
            for (const id of watchUsageExpanded) if (!ids.has(id)) watchUsageExpanded.delete(id);
            for (const id of watchUsageViews.keys()) if (!ids.has(id)) watchUsageViews.delete(id);
            const known = items.filter(item => item.total_bytes != null);
            const maximum = Math.max(1, ...known.map(item => Number(item.total_bytes) || 0));
            document.getElementById('watch-usage-summary').innerHTML = [
                ['已统计合计', data.total_bytes == null ? '—' : formatStorageBytes(data.total_bytes)],
                ['文件数', data.total_files == null ? '—' : Number(data.total_files).toLocaleString()],
                ['监控目录', `${Number(data.counted_folders || 0)} / ${Number(data.total_folders || items.length)}`],
            ].map(([label, value]) => `<span>${label}<strong>${favEsc(value)}</strong></span>`).join('');
            document.getElementById('watch-usage-distribution').innerHTML = data.details_ready ? renderWatchUsageDistribution(data.categories, data.total_bytes) : '';
            const notes = [];
            if (data.scanning) notes.push('后台统计中，可离开此页');
            if (data.unavailable_folders) notes.push(`${Number(data.unavailable_folders)} 个目录不可访问，未计入合计`);
            if (data.partial_folders) notes.push(`${Number(data.partial_folders)} 个目录仅统计了可读取的部分`);
            if (data.overlapping_folders) notes.push('重叠目录仅按最外层已统计路径计入合计');
            if (!data.scanning && known.some(item => !item.details_ready)) notes.push('详细统计尚未加载，后端更新后重新统计即可');
            if (!notes.length && items.length) notes.push('结果缓存 5 分钟，可点击重新统计立即更新');
            document.getElementById('watch-usage-status').textContent = notes.join(' · ');
            list.innerHTML = items.length ? items.map((item, index) => {
                const path = String(item.path || '');
                const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path || '未设置目录';
                const status = item.scanning ? (item.total_bytes == null ? '统计中' : '更新中') : ({ ready: '已统计', partial: '部分可读', unavailable: '不可访问' }[item.status] || '等待统计');
                const state = item.scanning ? 'scanning' : item.status;
                const metadata = item.total_files == null ? '暂未取得统计结果' : `${Number(item.total_files).toLocaleString()} 个文件 · ${Number(item.total_directories || 0).toLocaleString()} 个子目录`;
                const updated = item.generated_at ? ` · ${new Date(item.generated_at).toLocaleString()}` : '';
                const progress = item.scanning && item.progress ? `已检查 ${Number(item.progress.total_files || 0).toLocaleString()} 个文件 · ${formatStorageBytes(item.progress.total_bytes)}` : '';
                const info = [item.error, progress, item.skipped_links ? `跳过 ${Number(item.skipped_links)} 个链接，不重复遍历` : ''].filter(Boolean).join(' · ');
                const expanded = item.details_ready && watchUsageExpanded.has(item.id);
                return `<article class="watch-usage-item" data-watch-id="${favEsc(item.id)}">
                    <span class="watch-usage-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"></path><path d="M3 9h18"></path></svg></span>
                    <div class="watch-usage-info"><div class="watch-usage-name"><strong>${favEsc(name)}</strong><span class="watch-usage-badge ${favEsc(state)}">${item.scanning ? '<i class="spinner"></i>' : ''}${status}</span>${item.enabled ? '' : '<span class="watch-usage-badge disabled">监控已停用</span>'}</div>
                    <div class="watch-usage-path" title="${favEsc(path)}">${favEsc(path)}</div><div class="watch-usage-meta">${metadata}${favEsc(updated)}</div>${info ? `<div class="watch-usage-note ${item.error ? 'has-error' : ''}">${favEsc(info)}</div>` : ''}</div>
                    <div class="watch-usage-amount"><strong>${item.total_bytes == null ? '—' : formatStorageBytes(item.total_bytes)}</strong>${item.total_bytes == null ? '' : `<progress max="${maximum}" value="${Math.max(0, Number(item.total_bytes) || 0)}" aria-label="目录占用相对大小"></progress>`}
                    ${item.status === 'unavailable' ? '' : `<button type="button" class="watch-detail-toggle" data-watch-action="toggle" aria-expanded="${!!expanded}" ${expanded ? `aria-controls="watch-details-${index}"` : ''} ${item.details_ready ? '' : 'disabled'}>${item.details_ready ? (expanded ? '收起明细' : '查看明细') : (item.scanning ? '生成明细中' : '明细待更新')}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>`}</div>
                    ${expanded ? renderWatchUsageDetails(item, index) : ''}
                </article>`;
            }).join('') : '<div class="empty">暂无监控文件夹，可点击“管理监控”添加。</div>';
            for (const element of list.querySelectorAll('.watch-detail-list')) {
                const id = element.closest('[data-watch-id]').dataset.watchId;
                const scroll = scrollPositions.get(id);
                if (scroll?.view === (watchUsageViews.get(id) || 'types')) element.scrollTop = scroll.top;
            }
            if (focus) {
                const article = [...list.children].find(element => element.dataset.watchId === focus.id);
                [...(article?.querySelectorAll('button[data-watch-action]') || [])].find(button => button.dataset.watchAction === focus.action && button.dataset.watchView === focus.view)?.focus({ preventScroll: true });
            }
        }
        async function loadWatchFolderUsage(force = false) {
            if (watchUsageBusy || !token) return;
            watchUsageBusy = true;
            clearTimeout(watchUsagePollTimer);
            const request = ++watchUsageRequest, userToken = token;
            const controller = watchUsageController = new AbortController();
            const status = document.getElementById('watch-usage-status');
            const button = document.getElementById('watch-usage-refresh');
            button.disabled = true;
            if (!document.getElementById('watch-usage-list').innerHTML) status.textContent = '正在读取监控目录统计…';
            try {
                const response = await fetch(`${API_BASE}/system/watch-folder-usage${force ? '?force=true' : ''}`, { headers: { Authorization: `Bearer ${userToken}` }, signal: controller.signal });
                if (request !== watchUsageRequest || token !== userToken) return;
                if (response.status === 404) { status.textContent = '统计接口尚未加载，需下次重启后端后生效。'; return; }
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || '读取失败');
                if (request !== watchUsageRequest || token !== userToken) return;
                renderWatchFolderUsage(data);
                if (!document.getElementById('tab-storage').classList.contains('hidden')) watchUsagePollTimer = setTimeout(() => loadWatchFolderUsage(), data.scanning ? 1000 : 300000);
            } catch (error) {
                if (error.name !== 'AbortError' && request === watchUsageRequest) status.textContent = `监控目录统计读取失败：${error.message}`;
            } finally {
                if (request === watchUsageRequest) { watchUsageBusy = false; button.disabled = false; watchUsageController = null; }
            }
        }
        async function loadStorageUsage(force = false) {
            if (storageLoadBusy || !token) return;
            storageLoadBusy = true;
            clearTimeout(storagePollTimer);
            const summary = document.getElementById('storage-summary');
            const categories = document.getElementById('storage-categories');
            const largest = document.getElementById('storage-largest-files');
            if (!summary.innerHTML.trim()) summary.innerHTML = '<p class="empty">正在加载存储统计…</p>';
            try {
                const res = await fetch(`${API_BASE}/system/storage-usage${force ? '?force=true' : ''}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || '读取失败');
                document.getElementById('storage-root').textContent = (data.root ? `路径：${data.root}` : '') + (data.scanning ? ' · 后台统计中' : '');
                if (data.status === 'error') throw new Error(data.error || '扫描失败');
                if (data.status === 'scanning') {
                    summary.innerHTML = '<p class="empty">后台正在首次统计，可离开页面；完成后显示结果。</p>';
                    scheduleStoragePoll();
                    return;
                }
                summary.innerHTML = [
                    ['总占用', formatStorageBytes(data.total_bytes)],
                    ['文件数', Number(data.total_files || 0).toLocaleString()],
                    ['目录数', Number(data.total_directories || 0).toLocaleString()],
                    ['统计时间', data.generated_at ? new Date(data.generated_at).toLocaleString() : '-']
                ].map(item => `<div class="storage-metric"><span class="label">${item[0]}</span><span class="value">${item[1]}</span></div>`).join('');
                const total = Number(data.total_bytes || 0);
                const categoryNames = { videos: '视频产物', pictures: '图片', trash: '暂存区', uploads: '上传原片', '.watch-folder-usage': '目录统计缓存' };
                categories.innerHTML = (data.categories || []).map(item => {
                    const displayName = categoryNames[item.name] || item.name;
                    const percentage = total > 0 ? (Number(item.bytes || 0) / total * 100).toFixed(1) : '0.0';
                    return `<div class="storage-category">
                        <div class="category-head"><span>${favEsc(displayName)}</span><span>${formatStorageBytes(item.bytes)}</span></div>
                        <div class="category-meta"><span>${Number(item.files || 0).toLocaleString()} 个文件 · ${percentage}%</span><span>${Number(item.directories || 0).toLocaleString()} 个目录</span></div>
                    </div>`;
                }).join('') || '<p class="empty">storage 文件夹为空</p>';
                largest.innerHTML = (data.largest_files || []).map(item => `<div class="storage-file-row">
                    <span class="path" title="${favEsc(item.path)}">${favEsc(item.path)}</span>
                    <span class="size">${formatStorageBytes(item.bytes)}</span>
                    <span class="modified">${item.modified ? new Date(item.modified).toLocaleString() : '-'}</span>
                </div>`).join('') || '<p class="empty">暂无文件</p>';
                if (data.scanning) scheduleStoragePoll();
            } catch (e) {
                summary.innerHTML = `<p class="empty">读取存储占用失败: ${favEsc(e.message)}</p>`;
            } finally {
                storageLoadBusy = false;
            }
        }

        async function loadTrash() {
            const modal = document.getElementById('trash-modal');
            const list = document.getElementById('trash-list');
            modal.classList.add('show');
            list.innerHTML = '<p class="empty">加载中...</p>';
            trashItems = [];
            try {
                const res = await fetch(`${API_BASE}/trash`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || '加载失败');
                trashItems = data.items || [];
                if (!trashItems.length) { list.innerHTML = '<p class="empty">暂存区为空</p>'; return; }
                list.innerHTML = trashItems.map(item => {
                    const expires = item.expires_at ? new Date(item.expires_at).toLocaleString() : '未知';
                    const type = item.media_type === 'video' ? '视频' : item.media_type === 'novel' ? '小说' : '图片';
                    const preview = item.preview_url
                        ? `<button class="trash-preview-button" data-image-preview data-rh-click="h276" data-rh-a-h276="${RHVideoBindings.encode([item.media_type,item.id,null,null,null,null])}" title="预览${type}">
                             <img src="${favEsc(item.preview_url)}" loading="lazy" alt="${favEsc(item.filename)}">
                             <span class="trash-preview-type">${type}</span>
                           </button>`
                        : '<span class="trash-preview-placeholder">无预览</span>';
                    return `<div class="trash-row">
                        ${preview}
                        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${favEsc(item.filename)}">${type}：${favEsc(item.filename)}</span>
                        <span class="text-sm" style="white-space:nowrap;color:#888">到期：${expires}</span>
                        <button class="btn btn-secondary" style="padding:4px 10px;font-size:0.8em" data-rh-click="h275" data-rh-a-h275="${RHVideoBindings.encode([null,null,null,null,null,item.media_type,item.id])}">恢复</button>
                    </div>`;
                }).join('');
            } catch (e) { list.innerHTML = `<p class="empty">加载失败: ${favEsc(e.message)}</p>`; }
        }
        function openTrashPreview(type, id) {
            const item = trashItems.find(entry => entry.media_type === type && String(entry.id) === String(id));
            if (!item || !item.preview_url) { notify('该暂存项没有可用预览', 'error'); return; }
            const typeLabel = type === 'video' ? '视频封面' : '图片预览';
            document.getElementById('trash-preview-title').textContent = `${typeLabel}：${item.filename || ''}`;
            document.getElementById('trash-preview-content').innerHTML = `<img src="${favEsc(item.preview_url)}" alt="${favEsc(item.filename || '')}">`;
            document.getElementById('trash-preview-modal').classList.add('show');
        }
        function closeTrashPreview() {
            document.getElementById('trash-preview-modal').classList.remove('show');
            document.getElementById('trash-preview-content').innerHTML = '';
        }
        function closeTrashModal() { document.getElementById('trash-modal').classList.remove('show'); }
        async function restoreTrash(type, id) {
            try {
                const res = await fetch(`${API_BASE}/trash/${type}/${encodeURIComponent(id)}/restore`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || '恢复失败');
                notify('媒体已恢复', 'success');
                await loadTrash();
                loadVideos(); loadPictures(); loadGrid(); loadFolders(); loadNovels();
            } catch (e) { notify('恢复失败: ' + e.message, 'error'); }
        }

        // ============ 清理本地已删除文件（两步确认） ============
        let cleanupStep = 0;   // 1=首次确认 2=二次确认 3=完成
        let cleanupData = null;

        function cleanupEsc(s) {
            return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function closeCleanupModal() {
            document.getElementById('cleanup-modal').classList.remove('show');
            cleanupStep = 0;
            cleanupData = null;
        }

        async function showCleanupModal() {
            cleanupStep = 0;
            cleanupData = null;
            const body = document.getElementById('cleanup-body');
            const confirmBtn = document.getElementById('cleanup-confirm-btn');
            confirmBtn.disabled = true;
            confirmBtn.textContent = '继续';
            body.innerHTML = '<p><span class="spinner"></span> 正在扫描本地已删除的文件...</p>';
            document.getElementById('cleanup-modal').classList.add('show');
            try {
                const res = await fetch(API_BASE + '/system/cleanup-missing/preview', { headers: { 'Authorization': 'Bearer ' + token } });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                cleanupData = await res.json();
                renderCleanupStep1();
            } catch (e) {
                body.innerHTML = '<p style="color:#c0392b">扫描失败: ' + cleanupEsc(e.message) + '</p>';
            }
        }

        function cleanupSampleList() {
            const pics = (cleanupData.pictures && cleanupData.pictures.items) || [];
            const vids = (cleanupData.videos && cleanupData.videos.items) || [];
            const novs = (cleanupData.novels && cleanupData.novels.items) || [];
            let html = '';
            const rowStyle = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#666;padding:1px 0';
            if (pics.length) {
                html += '<p style="margin:10px 0 4px"><b>图片（示例）：</b></p>';
                pics.slice(0, 10).forEach(p => {
                    html += '<div style="' + rowStyle + '" title="' + cleanupEsc(p.original_path) + '">&#128444; ' + cleanupEsc(p.filename) + '</div>';
                });
                if (cleanupData.pictures.count > 10)
                    html += '<div style="color:#999;padding:2px 0">... 共 ' + cleanupData.pictures.count + ' 张</div>';
            }
            if (vids.length) {
                html += '<p style="margin:10px 0 4px"><b>视频（示例）：</b></p>';
                vids.slice(0, 10).forEach(v => {
                    html += '<div style="' + rowStyle + '" title="' + cleanupEsc(v.source_path) + '">&#127916; ' + cleanupEsc(v.filename) + '</div>';
                });
                if (cleanupData.videos.count > 10)
                    html += '<div style="color:#999;padding:2px 0">... 共 ' + cleanupData.videos.count + ' 个</div>';
            }
            if (novs.length) {
                html += '<p style="margin:10px 0 4px"><b>小说（示例）：</b></p>';
                novs.slice(0, 10).forEach(n => {
                    html += '<div style="' + rowStyle + '" title="' + cleanupEsc(n.source_path) + '">&#128214; ' + cleanupEsc(n.title) + '</div>';
                });
                if (cleanupData.novels.count > 10)
                    html += '<div style="color:#999;padding:2px 0">... 共 ' + cleanupData.novels.count + ' 本</div>';
            }
            return html;
        }

        function renderCleanupStep1() {
            const body = document.getElementById('cleanup-body');
            const confirmBtn = document.getElementById('cleanup-confirm-btn');
            const pc = cleanupData.pictures.count, vc = cleanupData.videos.count, nc = (cleanupData.novels && cleanupData.novels.count) || 0;
            const skipped = cleanupData.skipped_processing || 0;
            if (pc === 0 && vc === 0 && nc === 0) {
                body.innerHTML = '<p>未发现本地源文件已删除的图片、视频或小说，无需清理。</p>' +
                    (skipped ? '<p class="text-sm" style="color:#888">另有 ' + skipped + ' 个正在处理中的视频已跳过。</p>' : '');
                confirmBtn.disabled = true;
                confirmBtn.textContent = '继续';
                return;
            }
            let html = '<p>发现 <b>' + pc + '</b> 张图片、<b>' + vc + '</b> 个视频、<b>' + nc + '</b> 本小说的本地源文件已被删除。</p>' +
                '<p style="color:#c0392b"><b>清理将删除：</b>对应的图库记录、图片 WebP、视频关键帧 / 缩略图 / 转码文件（含 storage 中的原片副本）、小说记录与章节目录。<b>此操作不可恢复。</b></p>';
            if (skipped) html += '<p class="text-sm" style="color:#888">' + skipped + ' 个正在处理中的视频将被跳过。</p>';
            html += cleanupSampleList();
            body.innerHTML = html;
            confirmBtn.disabled = false;
            confirmBtn.textContent = '继续';
            cleanupStep = 1;
        }

        async function cleanupConfirmStep() {
            const body = document.getElementById('cleanup-body');
            const confirmBtn = document.getElementById('cleanup-confirm-btn');
            const cancelBtn = document.getElementById('cleanup-cancel-btn');
            if (cleanupStep === 1) {
                cleanupStep = 2;
                const pc = cleanupData.pictures.count, vc = cleanupData.videos.count, nc = (cleanupData.novels && cleanupData.novels.count) || 0;
                body.innerHTML = '<p style="color:#c0392b;font-size:1.05em"><b>二次确认：</b>即将永久删除 <b>' + pc + '</b> 张图片、<b>' + vc + '</b> 个视频和 <b>' + nc + '</b> 本小说（含记录与所有生成文件）。</p>' +
                    '<p class="text-sm">点击「确认清理」后立即执行，<b>无法撤销</b>。如不确定，请点取消。</p>';
                confirmBtn.textContent = '确认清理';
                return;
            }
            if (cleanupStep === 2) {
                cleanupStep = -1;
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;
                confirmBtn.textContent = '清理中...';
                body.innerHTML = '<p><span class="spinner"></span> 正在清理，请稍候...</p>';
                try {
                    const res = await fetch(API_BASE + '/system/cleanup-missing', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const d = await res.json();
                    body.innerHTML = '<p>清理完成：已删除 <b>' + d.deleted_pictures + '</b> 张图片、<b>' + d.deleted_videos + '</b> 个视频、<b>' + (d.deleted_novels || 0) + '</b> 本小说。' +
                        (d.skipped_processing ? '跳过 ' + d.skipped_processing + ' 个处理中的视频。' : '') + '</p>';
                    confirmBtn.textContent = '关闭';
                    cleanupStep = 3;
                    notify('清理完成：' + d.deleted_pictures + ' 张图片、' + d.deleted_videos + ' 个视频、' + (d.deleted_novels || 0) + ' 本小说', 'success');
                    loadVideos(); loadGrid(); loadFolders(); loadPictures(); loadNovels();
                } catch (e) {
                    body.innerHTML = '<p style="color:#c0392b">清理失败: ' + cleanupEsc(e.message) + '</p>';
                    confirmBtn.textContent = '重试';
                    cleanupStep = 2;
                }
                confirmBtn.disabled = false;
                cancelBtn.disabled = false;
                return;
            }
            if (cleanupStep === 3) closeCleanupModal();
        }

        document.addEventListener('keydown', (e) => {
            const gridDrawer = document.getElementById('grid-tag-drawer');
            if (e.key === 'Tab' && gridDrawer?.classList.contains('open')) {
                const controls = [...gridDrawer.querySelectorAll('button:not(:disabled), input, select')].filter(element => element.offsetParent !== null);
                const first = controls[0], last = controls[controls.length - 1];
                if (e.shiftKey && (document.activeElement === first || !gridDrawer.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
                else if (!e.shiftKey && (document.activeElement === last || !gridDrawer.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
            }
            if (e.key !== 'Escape') return;
            if (gridDrawer?.classList.contains('open')) closeGridTagDrawer();
        });

        async function filterVideos(resetPage = true) {
            const ticket = nextSearchRender('videos');
            const q = document.getElementById('search-input').value.toLowerCase();
            const matches = q ? await searchCatalog('videos', allVideos, ['original_filename', 'folder_label'], q,
                ['original_resolution', 'original_duration', 'original_filesize', 'status']) : allVideos;
            if (ticket !== searchRenderTickets.get('videos')) return;
            const matchTags = RHTagFilter.compile(mediaTagFilter);
            filteredVideos = matches.filter(video => matchTags(video.folder_label));
            if (resetPage) currentPage = 1;
            renderVideos(filteredVideos);
        }

        async function exportVideos() {
            let videos;
            try {
                const res = await fetch(`${API_BASE}/videos`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) throw new Error('导出失败（' + res.status + '）');
                videos = await res.json();
            } catch (e) { notify(e.message, 'error'); return; }
            const data = JSON.stringify(videos, null, 2);
            const blob = new Blob([data], {type:'application/json'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'rhvideo_export.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            notify('已导出','success');
        }

        // ============ Pictures ============
        async function fetchAllPictureRecords(folder) {
            const suffix = folder ? '?folder=' + encodeURIComponent(folder) : '';
            return fetchLibraryIndex(`${API_BASE}/pictures/catalog${suffix}`);
        }

        function loadPictures() {
            if (picturesLoadPromise) return picturesLoadPromise;
            picturesLoadPromise = loadPictureIndex().finally(() => { picturesLoadPromise = null; });
            return picturesLoadPromise;
        }
        async function loadPictureIndex() {
            const requestId = ++pictureLoadRequest;
            const loadStartedAt = performance.now();
            document.getElementById('pic-loader').classList.remove('hidden');
            try {
                const data = await fetchAllPictureRecords();
                if (requestId !== pictureLoadRequest) return;
                if (picturesLoaded && allPictures === data.items) return;
                allPictures = data.items;
                picturesLoaded = true;
                if (document.getElementById('mix-pictures').checked) gridRefreshPending = true;
                allPicturesTotal = data.total;
                 renderGridTagTabs();
                 if (document.getElementById('grid-tag-drawer')?.classList.contains('open')) renderGridTagDrawer();
                const stripViewer = document.getElementById('pic-strip-viewer');
                if (stripViewer && !stripViewer.classList.contains('hidden')) {
                    pictureGridRefreshPending = true;
                } else {
                    renderPictures();
                }
                rhDebug('list-load:done', {
                    requestId,
                    total: allPicturesTotal,
                    received: allPictures.length,
                    stripOpen: !!(stripViewer && !stripViewer.classList.contains('hidden')),
                    ms: Math.round(performance.now() - loadStartedAt)
                });
            } catch(e) {
                rhDebug('list-load:error', { requestId, message: e.message, ms: Math.round(performance.now() - loadStartedAt) });
                if (requestId === pictureLoadRequest) {
                    document.getElementById('pic-grid').innerHTML = `<p class="empty">加载失败: ${e.message}</p>`;
                }
            } finally {
                if (requestId === pictureLoadRequest) document.getElementById('pic-loader').classList.add('hidden');
            }
        }
        async function renderPictures() {
            const ticket = nextSearchRender('pictures');
            const q = (document.getElementById('pic-search')?.value || '').toLowerCase();
            let pics = allPictures;
            if (q) pics = await searchCatalog('pictures', pics, ['original_filename', 'folder_label'], q, ['original_resolution']);
            if (ticket !== searchRenderTickets.get('pictures')) return;
            const matchTags = RHTagFilter.compile(mediaTagFilter);
            pics = pics.filter(item => matchTags(item.folder_label));
            const total = pics.length;
            const totalPages = Math.ceil(total / picPageSize) || 1;
            if (picPage > totalPages) picPage = totalPages;
            if (token) RHVideoHost.storage.setItem('rhvideo_picpage_' + token, String(picPage));
            const start = (picPage - 1) * picPageSize;
            const pageItems = pics.slice(start, start + picPageSize);
            const grid = document.getElementById('pic-grid');
            picMedia = [];
            if (!pageItems.length) { grid.innerHTML = `<p class="empty">${q || RHTagFilter.active(mediaTagFilter) ? '没有符合当前搜索或标签条件的图片，可调整或清除筛选。' : '暂无图片，请点击上方“自动监控设置”添加图片文件夹'}</p>`; }
            else {
                picMedia = pics.map(p => ({
                    url: RHVideoHost.asset('/storage/' + p.webp_path),
                    title: (p.folder_label ? '['+p.folder_label+'] ' : '') + p.original_filename,
                    info: (p.original_resolution||'?') + ' | ' + (p.original_filesize/1024/1024).toFixed(1) + 'MB',
                    pictureId: p.id
                }));
                grid.innerHTML = pageItems.map((p, i) => {
                    const mediaIndex = start + i;
                    const escapedName = (p.original_filename||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
                    const folderHtml = p.folder_label ? `<span class="folder-badge">${favEsc(p.folder_label)}</span>` : '';
                    return `<div class="screenshot-item" style="cursor:pointer" data-rh-click="h272" data-rh-a-h272="${RHVideoBindings.encode([mediaIndex,null,null,null,null,null,null,null,null,null])}">
                        <img src="${RHVideoHost.asset('/storage/'+p.webp_path)}" loading="lazy" alt="${escapedName}" data-rh-error="h273" data-rh-a-h273="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,null,null])}">
                        ${pictureStarBtnHtml(p)}
                                                 <button class="pic-stage-delete" data-rh-click="h274" data-rh-a-h274="${RHVideoBindings.encode([null,null,null,null,p.id,null,null,null,null,null])}" title="删除源文件并暂存30天">&times;</button>
                        <div class="overlay">
                            <div class="fname" title="${escapedName}">${folderHtml}${p.original_filename}</div>
                            <div class="time">${p.original_resolution||'?'} &bull; ${(p.original_filesize/1024/1024).toFixed(1)}MB</div>
                        </div>
                    </div>`;
                }).join('');
            }
            document.getElementById('pic-count').textContent = `(${total} / ${allPictures.length})`;
            document.getElementById('pic-page-info').textContent = total ? `第 ${picPage}/${totalPages} 页 (${total}张)` : '';
            document.getElementById('pic-prev').disabled = picPage <= 1;
            document.getElementById('pic-next').disabled = picPage >= totalPages;
        }
        function picChangePage(delta) {
            picPage += delta;
            RHVideoHost.storage.setItem('rhvideo_picpage_' + (token || ''), String(picPage));
            renderPictures();
        }
        function jumpPicPage() {
            const p = parseInt(document.getElementById('pic-page-jump').value);
            if (p >= 1) {
                picPage = p;
                RHVideoHost.storage.setItem('rhvideo_picpage_' + (token || ''), String(picPage));
                renderPictures();
            }
        }
        function filterPictures() { picPage = 1; renderPictures(); }
        function removePictureFromLocalState(id) {
            const stripViewer = document.getElementById('pic-strip-viewer');
            if (stripViewer && !stripViewer.classList.contains('hidden')) {
                removePictureFromStripState(id);
                return;
            }
            const key = String(id);
            allPictures = allPictures.filter(p => String(p.id) !== key);
            allPicturesTotal = Math.max(0, (allPicturesTotal || allPictures.length + 1) - 1);
            favPictureIds.delete(key);
            setFavoriteButtons('picture', key, false);
            renderPictures();
        }

        // ============ Picture Continuous Strip ============
        let picStripItems = [];
        let picStripActiveId = null;
        let picStripOrderSigValue = '';
        let picStripScrollTimer = null;
        let picStripLayout = 'single';   // single | double（横向）
        let picStripVMode = false;       // 竖向长卷模式
        let picStripSpeed = 2;           // 速度倍率
        let picStripAutoOn = false;
        let picStripAutoRaf = null;
        let picStripAutoLastTs = 0;
        let picStripSyncing = false;
        let picStripProgrammaticUntil = 0;
        let picStripLoopOffsets = {};    // rowId -> 原始内容宽度（循环点）
        let picStripRowAItems = [];
        let picStripRowAH = 0;
        let picStripResizeTimer = null;

        // ---- 懒渲染（虚拟化）----
        // 图片库可能上万张，旧实现一次性把每张都插进 DOM（16000+ 个 <img>）：
        // 打开/切布局要卡 1 秒，两列模式每个屏宽还要加载约 4 倍的图片。
        // 现在只把视口附近的图片放进 DOM，其余用坐标占位，滚动时回收复用。
        const PS_TAIL_CELL_MAX = 4000;   // 循环尾巴最多复制多少个片段（超宽图兜底）
        const psRowStates = new Map();   // rowId -> 行/竖卷的懒渲染状态

        function psEsc(value) {
            return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        }
        function psItemLabel(p) {
            return (p.folder_label ? '[' + p.folder_label + '] ' : '') + (p.original_filename || '');
        }
        function psParseSize(p) {
            const res = String(p.original_resolution || '').split('x');
            const w = parseInt(res[0], 10), h = parseInt(res[1], 10);
            return (w > 0 && h > 0) ? { w: w, h: h } : null;
        }
        const psColorCache = new Map();
        function psFolderColor(p) {
            const value = p.folder_label || p.id || '';
            let color = psColorCache.get(value);
            if (color !== undefined) return color;
            let h = 0;
            for (let k = 0; k < value.length; k++) h = (h * 31 + value.charCodeAt(k)) % 360;
            color = 'hsl(' + h + ',45%,38%)';
            if (psColorCache.size < 4096) psColorCache.set(value, color);
            return color;
        }
        // 横向条带把图片拆成"片段"：超长图按接近 3:4 竖切 n 段，每段一个 DOM 单元
        function psBuildCells(items, H) {
            const cells = [];
            let total = 0;
            for (const p of items) {
                const size = psParseSize(p);
                if (size && size.h / size.w > 5) {
                    const count = Math.ceil((size.h / size.w) * 0.75);
                    const segW = count * H * size.w / size.h;
                    for (let i = 0; i < count; i++) {
                        cells.push({ p: p, x: total, w: segW, seg: i, segCount: count, segW: segW });
                        total += segW;
                    }
                } else {
                    const w = size ? H * size.w / size.h : H * 0.75;
                    cells.push({ p: p, x: total, w: w, seg: 0, segCount: 1, segW: w });
                    total += w;
                }
            }
            return cells;
        }
        // 自动滚动到结尾要无缝回到开头：尾部复制开头的若干个"整张图"
        function psTailCellCount(cells, viewW) {
            let acc = 0, end = 0;
            for (let i = 0; i < cells.length && acc < viewW && end < PS_TAIL_CELL_MAX; ) {
                const p = cells[i].p;
                let j = i;
                while (j < cells.length && cells[j].p === p) j++;
                acc += (cells[j - 1].x + cells[j - 1].w) - cells[i].x;
                end = j;
                i = j;
            }
            return Math.min(end, PS_TAIL_CELL_MAX);
        }
        function psLowerBound(arr, value) {
            let lo = 0, hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (arr[mid] < value) lo = mid + 1; else hi = mid;
            }
            return lo;
        }
        function psCellNode(st, index) {
            const cell = st.vcells[index];
            if (!cell) return null;
            const p = cell.p;
            const node = document.createElement('div');
            node.className = 'pic-strip-item';
            node.dataset.pictureId = p.id;
            if (cell.tail) node.dataset.picLoopTail = '1';
            node.style.left = cell.x + 'px';
            node.style.width = cell.w + 'px';
            const label = psItemLabel(p);
            node.title = label + ' · 双击放大';
            const url = RHVideoHost.asset('/storage/' + p.webp_path);
            // 窗口内只有几十张，直接 eager 预取，滚到时已经解码好，不会出现空白格
            if (cell.segCount > 1) {
                node.innerHTML = `<img src="${url}" alt="${label.replace(/"/g, '&quot;')}" loading="eager" decoding="async" draggable="false" style="position:absolute;left:0;top:${-cell.seg * st.H}px;width:${cell.segW}px;height:auto">${pictureStarBtnHtml(p)}`;
            } else {
                node.innerHTML = `<img src="${url}" alt="${label.replace(/"/g, '&quot;')}" loading="eager" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block">${pictureStarBtnHtml(p)}`;
            }
            node.onclick = function () { showPicStripFavorite(node); };
            if (String(p.id) === String(picStripActiveId)) node.classList.add('pic-strip-active');
            return node;
        }
        function psVCellNode(st, index) {
            const cell = st.vcells[index];
            if (!cell) return null;
            const p = cell.p;
            const node = document.createElement('div');
            node.className = 'pic-strip-vitem';
            node.dataset.pictureId = p.id;
            node.style.top = cell.x + 'px';
            node.style.height = cell.h + 'px';
            const label = psItemLabel(p);
            node.title = label + ' · 双击放大';
            node.innerHTML = `<img src="${RHVideoHost.asset('/storage/'+p.webp_path)}" alt="${label.replace(/"/g, '&quot;')}" loading="eager" decoding="async" draggable="false">${pictureStarBtnHtml(p)}`;
            node.onclick = function () { showPicStripFavorite(node); };
            if (String(p.id) === String(picStripActiveId)) node.classList.add('pic-strip-active');
            return node;
        }
        // 把窗口内应有的节点补齐、窗口外的回收掉
        function psSwapWindow(st, from, to, createNode) {
            if (!st.layer) return;
            for (const entry of st.rendered) {
                if (entry[0] < from || entry[0] >= to) {
                    entry[1].remove();
                    st.rendered.delete(entry[0]);
                }
            }
            for (let i = from; i < to; i++) {
                if (st.rendered.has(i)) continue;
                const node = createNode(st, i);
                if (!node) continue;
                st.layer.appendChild(node);
                st.rendered.set(i, node);
            }
            st.from = from;
            st.to = to;
        }
        function psWindowRange(st, offset, viewSize) {
            const pad = Math.max(1200, viewSize * 1.5);   // 视口两侧各留一屏多的缓冲
            let from = psLowerBound(st.vx, offset - pad);
            if (from > 0) from -= 1;                      // 起点在窗口左侧、但仍可见的那一张
            const to = psLowerBound(st.vx, offset + viewSize + pad);
            return [from, to];
        }
        function psUpdateRowWindow(st, force) {
            const row = st.row;
            const range = psWindowRange(st, row.scrollLeft, row.clientWidth || window.innerWidth);
            if (!force && range[0] === st.from && range[1] === st.to) return;
            psSwapWindow(st, range[0], range[1], psCellNode);
        }
        function psUpdateVWindow(st, force) {
            const el = st.row;
            const range = psWindowRange(st, el.scrollTop, el.clientHeight || window.innerHeight);
            if (!force && range[0] === st.from && range[1] === st.to) return;
            psSwapWindow(st, range[0], range[1], psVCellNode);
        }
        function psUpdateWindows() {
            for (const st of psRowStates.values()) {
                if (st.vertical) psUpdateVWindow(st, false);
                else psUpdateRowWindow(st, false);
            }
        }
        function psBuildRowLayout(row, items, H) {
            const viewW = row.clientWidth || window.innerWidth;
            const cells = psBuildCells(items, H);
            const mainW = cells.length ? (cells[cells.length - 1].x + cells[cells.length - 1].w) : 0;
            const tailEnd = cells.length ? psTailCellCount(cells, viewW) : 0;
            const vcells = cells.slice();
            for (let i = 0; i < tailEnd; i++) {
                const c = cells[i];
                vcells.push({ p: c.p, x: mainW + c.x, w: c.w, seg: c.seg, segCount: c.segCount, segW: c.segW, tail: true });
            }
            const vx = new Float64Array(vcells.length);
            for (let i = 0; i < vcells.length; i++) vx[i] = vcells[i].x;
            const trackW = vcells.length ? (vcells[vcells.length - 1].x + vcells[vcells.length - 1].w) : 0;

            const layer = document.createElement('div');
            layer.className = 'pic-strip-track';
            layer.style.width = Math.max(trackW, 1) + 'px';
            row.replaceChildren(layer);

            const st = { row: row, vertical: false, H: H, cells: cells, vcells: vcells, vx: vx,
                         layer: layer, mainW: mainW, rendered: new Map(), from: -1, to: -1 };
            psRowStates.set(row.id, st);
            picStripLoopOffsets[row.id] = mainW;   // 循环点 = 主体内容宽度（不含尾巴）
            psUpdateRowWindow(st, true);
        }
        function psBuildVerticalLayout() {
            const vcontent = picStripVContent();
            const W = vcontent.clientWidth || window.innerWidth;
            const cells = [];
            let total = 0;
            for (const p of picStripItems) {
                const size = psParseSize(p);
                const h = size ? W * size.h / size.w : W * 0.75;
                cells.push({ p: p, x: total, w: W, h: h, seg: 0, segCount: 1, segW: W });
                total += h;
            }
            const vx = new Float64Array(cells.length);
            for (let i = 0; i < cells.length; i++) vx[i] = cells[i].x;
            const layer = document.createElement('div');
            layer.className = 'pic-strip-vtrack';
            layer.style.height = Math.max(total, 1) + 'px';
            vcontent.replaceChildren(layer);

            const st = { row: vcontent, vertical: true, H: W, cells: cells, vcells: cells, vx: vx,
                         layer: layer, mainW: total, rendered: new Map(), from: -1, to: -1 };
            psRowStates.set(vcontent.id, st);
            psUpdateVWindow(st, true);
        }

        function picStripShuffleKey() { return 'rhvideo_picstrip_shuffle_' + (token || ''); }
        function picStripScrollKey() { return 'rhvideo_picstrip_scroll_' + (token || ''); }
        function picStripLayoutKey() { return 'rhvideo_picstrip_layout_' + (token || ''); }
        function picStripSpeedKey() { return 'rhvideo_picstrip_speed_' + (token || ''); }
        function picStripRowA() { return document.getElementById('pic-strip-row-a'); }
        function picStripRowB() { return document.getElementById('pic-strip-row-b'); }
        function picStripVContent() { return document.getElementById('pic-strip-vcontent'); }
        function picStripRows() { return picStripVMode ? [] : (picStripLayout === 'double' ? [picStripRowA(), picStripRowB()] : [picStripRowA()]); }
        function updatePicStripDeleteButton() {
            const button = document.getElementById('pic-strip-delete-btn');
            if (!button) return;
            const picture = picStripActiveId && allPictures.find(p => String(p.id) === String(picStripActiveId));
            button.disabled = !picture;
             const marked = picture && isPreviewDeleteMarked('picture', picture.id);
             button.classList.toggle('marked', !!marked);
             button.textContent = marked ? '取消标记' : '标记删除';
            button.title = picture
                 ? (marked ? `取消“${picture.original_filename || '图片'}”的删除标记（Delete）` : `标记“${picture.original_filename || '图片'}”删除，关闭预览后执行（Delete）`)
                 : '先点击要标记删除的图片（Delete）';
            const label = document.getElementById('pic-strip-selected');
            if (label) label.textContent = picture ? `已选：${picture.original_filename || '图片'}${marked ? ' · 已标记删除' : ''}` : '未选择图片';
        }
        function showPicStripFavorite(item) {
            const content = document.getElementById('pic-strip-content');
            content.querySelectorAll('.pic-strip-active').forEach(el => el.classList.remove('pic-strip-active'));
            item.classList.add('pic-strip-active');
            picStripActiveId = item.dataset.pictureId || null;
            updatePicStripDeleteButton();
        }
        function requestPicStripDelete() {
            if (!picStripActiveId) return;
            const picture = allPictures.find(p => String(p.id) === String(picStripActiveId));
            if (picture) togglePreviewDelete('picture', picture.id, picture.original_filename);
        }
        function previewPicStripPicture(item) {
            const source = item?.querySelector('img');
            if (!source) return;
            showPicStripFavorite(item);
            if (picStripAutoOn) togglePicStripAuto(false);
            RHImagePreview.open(source);
        }
        document.getElementById('pic-strip-content').addEventListener('dblclick', event => {
            if (event.target.closest('button,a,input,select')) return;
            const item = event.target.closest('.pic-strip-item,.pic-strip-vitem');
            if (!item) return;
            event.preventDefault(); event.stopPropagation();
            previewPicStripPicture(item);
        });
        function restorePicStripActive() {
            const content = document.getElementById('pic-strip-content');
            content.querySelectorAll('.pic-strip-active').forEach(el => el.classList.remove('pic-strip-active'));
            if (picStripActiveId) {
                // 懒渲染下 DOM 里只有视口附近几十张，查询依然很便宜
                const active = content.querySelector(`[data-picture-id="${psEsc(picStripActiveId)}"]`);
                if (active) active.classList.add('pic-strip-active');
            }
            updatePicStripDeleteButton();
        }


        function removePictureFromStripState(id) {
            const stateStartedAt = performance.now();
            const key = String(id);
            const picture = allPictures.find(p => String(p.id) === key);
            if (!picture) return;
            rhDebug('state:start', {
                id: key,
                name: picture.original_filename,
                allPictures: allPictures.length,
                stripItems: picStripItems.length,
                auto: picStripAutoOn,
                vertical: picStripVMode
            });

            allPictures = allPictures.filter(p => String(p.id) !== key);
            allPicturesTotal = Math.max(0, (allPicturesTotal || allPictures.length + 1) - 1);
            favPictureIds.delete(key);
            picStripItems = picStripItems.filter(p => String(p.id) !== key);
            picStripRowAItems = picStripRowAItems.filter(p => String(p.id) !== key);
            picStripActiveId = null;
            rhDebug('state:arrays', { allPictures: allPictures.length, stripItems: picStripItems.length, ms: Math.round(performance.now() - stateStartedAt) });
            document.getElementById('pic-count').textContent = `共 ${allPicturesTotal} 张`;
            updatePicStripDeleteButton();

            if (!picStripItems.length) {
                closePicStrip();
                return;
            }
            pictureGridRefreshPending = true;
            // 懒渲染下重建整个布局只要几毫秒，不需要再对 DOM 做外科手术
            // 两列模式两行宽度不同（按比例联动），必须各存各的滚动位置
            const savedPositions = picStripVMode ? [] : picStripRows().map(row => row.scrollLeft);
            const savedTop = picStripVMode ? picStripVContent().scrollTop : 0;
            renderPicStrip();
            if (picStripVMode) {
                const vcontent = picStripVContent();
                vcontent.scrollTop = Math.min(savedTop, Math.max(0, vcontent.scrollHeight - vcontent.clientHeight));
            } else {
                picStripRows().forEach((row, i) => {
                    row.scrollLeft = Math.min(savedPositions[i] || 0, Math.max(0, row.scrollWidth - row.clientWidth));
                });
            }
            psUpdateWindows();
            savePicStripScroll();
            rhDebug('layout:done', { ms: Math.round(performance.now() - stateStartedAt) });
        }
        function picStripScrollSig() { return RHTagFilter.key(mediaTagFilter) + '|' + (document.getElementById('pic-search')?.value || '') + '|' + (picStripVMode ? 'v' : 'h') + '|' + picStripLayout + '|' + picStripOrderSigValue; }

        function picStripHashIds(ids) {
            let h = 0;
            for (const id of ids) {
                for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
            }
            return ids.length + ':' + h;
        }
        function buildPicStripOrder() {
            const matchTags = RHTagFilter.compile(mediaTagFilter);
            const allowed = new Set(picMedia.map(item => item.pictureId));
            const map = new Map(allPictures.filter(item => allowed.has(item.id) && matchTags(item.folder_label)).map(item => [item.id, item]));
            const ordered = [];
            try {
                const saved = JSON.parse(RHVideoHost.storage.getItem(picStripShuffleKey()) || 'null');
                if (Array.isArray(saved)) {
                    for (const id of saved) {
                        const p = map.get(id);
                        if (p) { ordered.push(p); map.delete(id); }
                    }
                }
            } catch (e) {}
            // 新图追加到末尾（和截图页随机打乱的行为一致）
            for (const p of allPictures) {
                if (map.has(p.id)) ordered.push(p);
            }
            return ordered;
        }
        // 缩略导航条：上万张缩略格子换成一张 canvas，一次绘制、零 DOM 节点
        function psDrawMinimap(canvas, st, cssW, cssH) {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = Math.max(1, Math.round(cssW * dpr));
            const h = Math.max(1, Math.round(cssH * dpr));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            const g = canvas.getContext('2d');
            if (!g) return;
            g.clearRect(0, 0, w, h);
            const cells = st.cells;
            const total = st.mainW;
            let runColor = null, runX0 = 0, runX1 = 0;
            const flush = () => {
                if (runColor === null) return;
                g.fillStyle = runColor;
                g.fillRect(runX0, 0, Math.max(1, Math.min(w, runX1) - runX0), h);
                runColor = null;
            };
            for (let i = 0; i < cells.length; i++) {
                const c = cells[i];
                const color = psFolderColor(c.p);
                const x0 = Math.floor(c.x / total * w);
                const x1 = Math.max(x0 + 1, Math.ceil((c.x + c.w) / total * w));
                if (runColor === color && x0 <= runX1) { runX1 = Math.max(runX1, x1); continue; }
                flush();
                runColor = color;
                runX0 = x0;
                runX1 = x1;
            }
            flush();
        }

        function reorderPicStripDom(items, operation) {
            operation = operation || 'reorder';
            const startedAt = performance.now();
            // 懒渲染：重排只是重建一遍坐标表，DOM 里始终只有视口附近那几十张
            picStripItems = items;
            const rowH = picStripRowAH;
            if (picStripVMode) {
                if (!psRowStates.has(picStripVContent().id)) return false;
                psBuildVerticalLayout();
            } else if (rowH > 0) {
                const rowA = picStripRowA();
                const rowB = picStripRowB();
                if (picStripLayout === 'double') {
                    const mid = Math.ceil(items.length / 2);
                    picStripRowAItems = items.slice(0, mid);
                    psBuildRowLayout(rowA, picStripRowAItems, rowH);
                    psBuildRowLayout(rowB, items.slice(mid), rowH);
                } else {
                    picStripRowAItems = items;
                    psBuildRowLayout(rowA, items, rowH);
                }
                renderPicStripMinimap();
            } else {
                return false;   // 还没有布局信息，交给 renderPicStrip 兜底
            }
            rhDebug(operation + ':fast-done', {
                mode: picStripVMode ? 'vertical' : picStripLayout,
                items: items.length,
                ms: Math.round(performance.now() - startedAt)
            });
            return true;
        }

        function renderPicStrip() {
            const content = document.getElementById('pic-strip-content');
            const H = content.clientHeight || window.innerHeight;
            const rowA = picStripRowA();
            const rowB = picStripRowB();
            const vcontent = picStripVContent();
            const minimap = document.getElementById('pic-strip-minimap');
            psRowStates.clear();
            picStripLoopOffsets = {};
            picStripRowAItems = [];
            picStripRowAH = 0;

            if (picStripVMode) {
                rowA.classList.add('hidden');
                rowB.classList.add('hidden');
                rowA.replaceChildren();
                rowB.replaceChildren();
                vcontent.classList.remove('hidden');
                minimap.classList.add('hidden');
                document.getElementById('pic-strip-layout-btn').style.display = 'none';
                psBuildVerticalLayout();
            } else {
                vcontent.classList.add('hidden');
                vcontent.replaceChildren();
                rowA.classList.remove('hidden');
                minimap.classList.remove('hidden');
                document.getElementById('pic-strip-layout-btn').style.display = '';
                const rowH = picStripLayout === 'double' ? H / 2 : H;
                picStripRowAH = rowH;
                if (picStripLayout === 'double') {
                    const mid = Math.ceil(picStripItems.length / 2);
                    picStripRowAItems = picStripItems.slice(0, mid);
                    rowB.classList.remove('hidden');
                    psBuildRowLayout(rowA, picStripRowAItems, rowH);
                    psBuildRowLayout(rowB, picStripItems.slice(mid), rowH);
                } else {
                    picStripRowAItems = picStripItems;
                    rowB.classList.add('hidden');
                    rowB.replaceChildren();
                    psBuildRowLayout(rowA, picStripItems, rowH);
                }
                renderPicStripMinimap();
            }

            document.getElementById('pic-strip-count').textContent = picStripItems.length + ' 张';
            document.getElementById('pic-strip-layout-btn').textContent = picStripLayout === 'double' ? '单列' : '两列';
            document.getElementById('pic-strip-vmode-btn').textContent = picStripVMode ? '横向' : '竖卷';
            restorePicStripActive();
        }
        function renderPicStripMinimap() {
            const minimap = document.getElementById('pic-strip-minimap');
            let canvas = minimap.querySelector('canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                minimap.replaceChildren(canvas);
            }
            const st = psRowStates.get(picStripRowA().id);
            const viewW = minimap.clientWidth, viewH = minimap.clientHeight;
            if (!st || st.vertical || !st.mainW || !st.cells.length || viewW <= 0) {
                if (canvas.width) { canvas.width = 0; canvas.height = 0; }
                minimap.onclick = null;
                return;
            }
            psDrawMinimap(canvas, st, viewW, viewH);
            minimap.onclick = (e) => {
                const rect = minimap.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                const row = picStripRowA();
                const offset = picStripLoopOffsets[row.id] || (row.scrollWidth - row.clientWidth);
                const target = ratio * Math.max(0, offset);
                picStripProgrammaticUntil = performance.now() + 120;
                row.scrollLeft = target;
                psUpdateWindows();
            };
        }
        function setPicStripScroll(row, value, programmatic) {
            if (programmatic) picStripProgrammaticUntil = performance.now() + 80;
            row.scrollLeft = value;
        }
        function savePicStripScroll() {
            try {
                const pos = picStripVMode ? picStripVContent().scrollTop : picStripRowA().scrollLeft;
                RHVideoHost.storage.setItem(picStripScrollKey(), JSON.stringify({ scrollLeft: pos, sig: picStripScrollSig() }));
            } catch (e) {}
        }
        function restorePicStripScroll() {
            try {
                const saved = JSON.parse(RHVideoHost.storage.getItem(picStripScrollKey()) || 'null');
                if (saved && saved.sig === picStripScrollSig() && saved.scrollLeft > 0) {
                    if (picStripVMode) {
                        picStripVContent().scrollTop = saved.scrollLeft;
                    } else {
                        const rowA = picStripRowA();
                        const maxA = Math.max(0, rowA.scrollWidth - rowA.clientWidth);
                        const ratio = maxA > 0 ? Math.min(1, saved.scrollLeft / maxA) : 0;
                        // 两列的两行宽度不同，按比例还原才不会一行快一行慢
                        for (const row of picStripRows()) {
                            const max = Math.max(0, row.scrollWidth - row.clientWidth);
                            row.scrollLeft = row === rowA ? Math.min(saved.scrollLeft, max) : max * ratio;
                        }
                    }
                }
            } catch (e) {}
            psUpdateWindows();
        }
        function onPicStripScroll(e) {
            // 懒渲染：滚动到哪就把哪一段的图片补进 DOM
            if (performance.now() < picStripProgrammaticUntil) { psUpdateWindows(); return; }
            if (picStripAutoOn) togglePicStripAuto(false);
            if (picStripSyncing) return;
            const source = e.currentTarget;
            const sourceMax = Math.max(0, source.scrollWidth - source.clientWidth);
            const ratio = sourceMax > 0 ? source.scrollLeft / sourceMax : 0;
            picStripSyncing = true;
            for (const row of picStripRows()) {
                if (row === source) continue;
                const targetMax = Math.max(0, row.scrollWidth - row.clientWidth);
                const target = ratio * targetMax;
                if (Math.abs(row.scrollLeft - target) > 1) row.scrollLeft = target;
            }
            requestAnimationFrame(() => { picStripSyncing = false; });
            psUpdateWindows();
            clearTimeout(picStripScrollTimer);
            picStripScrollTimer = setTimeout(savePicStripScroll, 150);
        }
        function onPicStripWheel(e) {
            e.preventDefault();
            if (picStripAutoOn) togglePicStripAuto(false);
            const source = e.currentTarget;
            const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            source.scrollLeft += delta * picStripSpeed;
            psUpdateWindows();
        }
        function onPicStripVScroll() {
            if (picStripAutoOn) togglePicStripAuto(false);
            psUpdateWindows();
            clearTimeout(picStripScrollTimer);
            picStripScrollTimer = setTimeout(savePicStripScroll, 150);
        }
        function onPicStripVWheel(e) {
            e.preventDefault();
            if (picStripAutoOn) togglePicStripAuto(false);
            const vcontent = picStripVContent();
            const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            vcontent.scrollTop += delta * picStripSpeed;
            psUpdateWindows();
        }
        function picStripAutoTick(ts) {
            if (!picStripAutoOn) return;
            const dt = Math.min(0.1, (ts - picStripAutoLastTs) / 1000);
            picStripAutoLastTs = ts;
            const speed = 200 * picStripSpeed; // 基准 200px/s × 倍率
            if (picStripVMode) {
                const vcontent = picStripVContent();
                const max = vcontent.scrollHeight - vcontent.clientHeight;
                if (max <= 0) { togglePicStripAuto(false); return; }
                let y = vcontent.scrollTop + speed * dt;
                if (y >= max) { y = max; togglePicStripAuto(false); }
                vcontent.scrollTop = y;
                psUpdateWindows();
                picStripAutoRaf = picStripAutoOn ? requestAnimationFrame(picStripAutoTick) : null;
                return;
            }
            let allAtEnd = true;
            for (const row of picStripRows()) {
                const max = row.scrollWidth - row.clientWidth;
                if (max <= 0) continue;
                allAtEnd = false;
                const offset = picStripLoopOffsets[row.id];
                let x = row.scrollLeft + speed * dt;
                if (offset && offset > 0 && row.scrollWidth > offset) {
                    if (x >= offset) x -= offset; // 尾部补了开头副本，跳回时视觉无缝
                } else if (x >= max) {
                    x = max;
                }
                setPicStripScroll(row, x, true);
            }
            psUpdateWindows();
            if (allAtEnd) togglePicStripAuto(false);
            else picStripAutoRaf = requestAnimationFrame(picStripAutoTick);
        }
        function togglePicStripAuto(force) {
            picStripAutoOn = typeof force === 'boolean' ? force : !picStripAutoOn;
            const btn = document.getElementById('pic-strip-auto-btn');
            if (picStripAutoOn) {
                picStripAutoLastTs = performance.now();
                btn.textContent = '⏸ 暂停滚动';
                picStripAutoRaf = requestAnimationFrame(picStripAutoTick);
            } else {
                if (picStripAutoRaf) cancelAnimationFrame(picStripAutoRaf);
                picStripAutoRaf = null;
                btn.textContent = '▶ 自动滚动';
            }
        }
        function togglePicStripLayout() {
            if (picStripAutoOn) togglePicStripAuto(false);
            picStripLayout = picStripLayout === 'double' ? 'single' : 'double';
            try { RHVideoHost.storage.setItem(picStripLayoutKey(), picStripLayout); } catch (e) {}
            renderPicStrip();
            for (const row of picStripRows()) row.scrollLeft = 0;
            restorePicStripScroll();
        }
        function togglePicStripVMode() {
            if (picStripAutoOn) togglePicStripAuto(false);
            picStripVMode = !picStripVMode;
            renderPicStrip();
            if (picStripVMode) picStripVContent().scrollTop = 0;
            else for (const row of picStripRows()) row.scrollLeft = 0;
            restorePicStripScroll();
        }
        function updatePicStripSpeedUI() {
            const slider = document.getElementById('pic-strip-speed');
            picStripSpeed = parseFloat(slider.value) || 2;
            document.getElementById('pic-strip-speed-label').textContent = 'x' + picStripSpeed.toFixed(1);
            try { RHVideoHost.storage.setItem(picStripSpeedKey(), String(picStripSpeed)); } catch (e) {}
        }
        function picStripKeyHandler(e) {
            const viewer = document.getElementById('pic-strip-viewer');
            if (viewer.classList.contains('hidden')) return;
            if (e.key === 'Escape') { e.preventDefault(); closePicStrip(); }
            else if (e.key === ' ') {
                e.preventDefault();
                togglePicStripAuto();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (picStripAutoOn) togglePicStripAuto(false);
                const step = window.innerWidth * 0.8 * picStripSpeed;
                if (picStripVMode) picStripVContent().scrollBy({ top: -step, behavior: 'smooth' });
                else picStripRowA().scrollBy({ left: -step, behavior: 'smooth' });
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (picStripAutoOn) togglePicStripAuto(false);
                const step = window.innerWidth * 0.8 * picStripSpeed;
                if (picStripVMode) picStripVContent().scrollBy({ top: step, behavior: 'smooth' });
                else picStripRowA().scrollBy({ left: step, behavior: 'smooth' });
            }
        }
        // 窗口尺寸变化时按新的行高重建一次（懒渲染下几乎不花时间）
        function onPicStripResize() {
            const viewer = document.getElementById('pic-strip-viewer');
            if (!viewer || viewer.classList.contains('hidden')) return;
            clearTimeout(picStripResizeTimer);
            picStripResizeTimer = setTimeout(() => {
                if (viewer.classList.contains('hidden')) return;
                // 两行宽度不同，按各自比例保留位置
                const vertical = picStripVMode;
                const keep = vertical ? [] : picStripRows().map(row => row.clientWidth ? row.scrollLeft / Math.max(1, row.scrollWidth - row.clientWidth) : 0);
                const keepTop = vertical ? picStripVContent().scrollTop : 0;
                renderPicStrip();
                if (vertical) {
                    const vcontent = picStripVContent();
                    vcontent.scrollTop = Math.min(keepTop, Math.max(0, vcontent.scrollHeight - vcontent.clientHeight));
                } else {
                    picStripRows().forEach((row, i) => {
                        const max = Math.max(0, row.scrollWidth - row.clientWidth);
                        row.scrollLeft = max * (keep[i] || 0);
                    });
                }
                psUpdateWindows();
            }, 150);
        }
        async function openPicStrip() {
            if (!allPictures.length) await loadPictures();
            if (!allPictures.length) { notify('还没有图片，请先在图片页添加监控目录', 'error'); return; }
            await renderPictures();
            picStripItems = buildPicStripOrder();
            if (!picStripItems.length) { notify('当前筛选下没有可浏览的图片', 'info'); return; }
            let savedIds = null;
            try { savedIds = JSON.parse(RHVideoHost.storage.getItem(picStripShuffleKey()) || 'null'); } catch (e) {}
            picStripOrderSigValue = Array.isArray(savedIds)
                ? 'rnd:' + picStripHashIds(savedIds)
                : 'seq:' + allPictures.length;
            try {
                const savedLayout = RHVideoHost.storage.getItem(picStripLayoutKey());
                if (savedLayout === 'double' || savedLayout === 'single') picStripLayout = savedLayout;
                const savedSpeed = parseFloat(RHVideoHost.storage.getItem(picStripSpeedKey()) || '');
                if (savedSpeed >= 0.5 && savedSpeed <= 10) picStripSpeed = savedSpeed;
            } catch (e) {}
            const slider = document.getElementById('pic-strip-speed');
            slider.value = String(picStripSpeed);
            updatePicStripSpeedUI();
            const viewer = document.getElementById('pic-strip-viewer');
            viewer.classList.remove('hidden');
            document.addEventListener('keydown', picStripKeyHandler);
            window.removeEventListener('resize', onPicStripResize);
            window.addEventListener('resize', onPicStripResize);
            const rows = [picStripRowA(), picStripRowB()];
            for (const row of rows) {
                row.removeEventListener('scroll', onPicStripScroll);
                row.removeEventListener('wheel', onPicStripWheel);
                row.addEventListener('scroll', onPicStripScroll, { passive: true });
                row.addEventListener('wheel', onPicStripWheel, { passive: false });
            }
            const vcontent = picStripVContent();
            vcontent.removeEventListener('scroll', onPicStripVScroll);
            vcontent.removeEventListener('wheel', onPicStripVWheel);
            vcontent.addEventListener('scroll', onPicStripVScroll, { passive: true });
            vcontent.addEventListener('wheel', onPicStripVWheel, { passive: false });
            renderPicStrip();
            restorePicStripScroll();
        }
        function closePicStrip() {
            if (picStripAutoOn) togglePicStripAuto(false);
            savePicStripScroll();
            const viewer = document.getElementById('pic-strip-viewer');
            viewer.classList.add('hidden');
            flushFavoritesRefresh();
            document.removeEventListener('keydown', picStripKeyHandler);
            for (const row of [picStripRowA(), picStripRowB()]) {
                row.removeEventListener('scroll', onPicStripScroll);
                row.removeEventListener('wheel', onPicStripWheel);
            }
            const vcontent = picStripVContent();
            vcontent.removeEventListener('scroll', onPicStripVScroll);
            vcontent.removeEventListener('wheel', onPicStripVWheel);
            window.removeEventListener('resize', onPicStripResize);
            clearTimeout(picStripResizeTimer);
            psRowStates.clear();
            picStripRowA().replaceChildren();
            picStripRowB().replaceChildren();
            vcontent.replaceChildren();
            picStripVMode = false;
            picStripActiveId = null;
            updatePicStripDeleteButton();
                         startPreviewDeleteExecution();
             if (pictureListReloadPending) {
                pictureListReloadPending = false;
                pictureGridRefreshPending = false;
                loadPictures();
            } else if (pictureGridRefreshPending) {
                pictureGridRefreshPending = false;
                renderPictures();
            }
        }
        function shufflePicStrip() {
            if (picStripAutoOn) togglePicStripAuto(false);
            const arr = [...picStripItems];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            const startedAt = performance.now();
            picStripItems = arr;
            const ids = arr.map(p => p.id);
            picStripOrderSigValue = 'rnd:' + picStripHashIds(ids);
            RHVideoHost.storage.setItem(picStripShuffleKey(), JSON.stringify(ids));
            if (!reorderPicStripDom(picStripItems, 'shuffle')) {
                rhDebug('shuffle:fallback-render', { items: picStripItems.length });
                renderPicStrip();
            }
            if (picStripVMode) {
                picStripVContent().scrollTop = 0;
            } else {
                for (const row of picStripRows()) row.scrollLeft = 0;
            }
            psUpdateWindows();
            restorePicStripActive();
            rhDebug('shuffle:done', { items: picStripItems.length, ms: Math.round(performance.now() - startedAt) });
            notify('已随机打乱，顺序已保存', 'success');
        }
        function restorePicStripOrder() {
            if (picStripAutoOn) togglePicStripAuto(false);
            const startedAt = performance.now();
            const nextItems = [...allPictures];
            const alreadyDefault = picStripItems.length === nextItems.length
                && picStripItems.every((picture, index) => String(picture.id) === String(nextItems[index].id));
            RHVideoHost.storage.removeItem(picStripShuffleKey());
            picStripItems = nextItems;
            picStripOrderSigValue = 'seq:' + allPictures.length;
            if (!alreadyDefault && !reorderPicStripDom(picStripItems, 'restore-order')) {
                rhDebug('restore-order:fallback-render', { items: picStripItems.length });
                renderPicStrip();
            }
            if (picStripVMode) {
                picStripVContent().scrollTop = 0;
            } else {
                for (const row of picStripRows()) row.scrollLeft = 0;
            }
            psUpdateWindows();
            restorePicStripActive();
            rhDebug('restore-order:done', {
                items: picStripItems.length,
                alreadyDefault,
                ms: Math.round(performance.now() - startedAt)
            });
            notify('已恢复默认顺序', 'success');
        }

        // ============ Video Keyframe Timeline ============
        let timelineVideoId = null;
        let timelineFrames = [];
        let timelinePendingSeek = null;
        function timelineKeyHandler(e) {
            const viewer = document.getElementById('timeline-viewer');
            if (viewer.classList.contains('hidden')) return;
            if (e.key === 'Escape') { e.preventDefault(); closeTimeline(); }
            else if (e.key === ' ') { e.preventDefault(); const v = document.getElementById('timeline-video'); if (v.paused) v.play().catch(() => {}); else v.pause(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); timelineStep(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); timelineStep(1); }
        }
        function timelineStep(delta) {
            const video = document.getElementById('timeline-video');
            const cur = video.currentTime || 0;
            let idx = 0;
            for (let i = 0; i < timelineFrames.length; i++) if (timelineFrames[i].time_seconds <= cur + 0.1) idx = i;
            idx = Math.max(0, Math.min(timelineFrames.length - 1, idx + delta));
            timelineSeek(timelineFrames[idx].time_seconds, timelineFrames[idx].url);
        }
        async function openTimeline(videoId) {
            try {
                const res = await fetch(`${API_BASE}/screenshots/video/${videoId}?per_video=100`, { headers: { "Authorization": `Bearer ${token}` } });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || '加载失败');
                if (!data.screenshots || !data.screenshots.length) { notify('这个视频还没有关键帧', 'error'); return; }
                timelineVideoId = videoId;
                timelineFrames = data.screenshots;
                timelinePendingSeek = null;
                const viewer = document.getElementById('timeline-viewer');
                viewer.classList.remove('hidden');
                document.addEventListener('keydown', timelineKeyHandler);
                document.getElementById('timeline-title').textContent = data.filename || '时间轴';
                document.getElementById('timeline-favorite-action').innerHTML = starBtnHtml('video', videoId);
                document.getElementById('timeline-strip').innerHTML = timelineFrames.map((f, i) =>
                    `<div class="timeline-frame" id="timeline-frame-${i}" data-rh-click="h271" data-rh-a-h271="${RHVideoBindings.encode([null,f.time_seconds,f.url,null,null,null])}">
                        <img src="${f.url}" loading="lazy" alt="${formatTime(f.time_seconds)}">
                        <span class="t">${formatTime(f.time_seconds)}</span>
                    </div>`
                ).join('');
                const video = document.getElementById('timeline-video');
                 pageVolumeBind(video, 0.15);
                 video.src = `${API_BASE}/videos/${videoId}/play`;
                 video.play().catch(() => {});
                video.onloadedmetadata = () => {
                    if (timelinePendingSeek !== null) {
                        video.currentTime = timelinePendingSeek;
                        timelinePendingSeek = null;
                        video.play().catch(() => {});
                    }
                    updateTimelineLabel();
                };
                video.ontimeupdate = () => updateTimelineLabel();
                updateTimelineLabel();
            } catch (e) { notify('时间轴加载失败: ' + e.message, 'error'); }
        }
        function timelineSeek(seconds, frameUrl) {
            const video = document.getElementById('timeline-video');
            if (video.readyState >= 1) {
                video.currentTime = seconds;
                video.play().catch(() => {});
            } else {
                timelinePendingSeek = seconds;
            }
            updateTimelineLabel(seconds);
            highlightTimelineFrame(seconds);
        }
        function highlightTimelineFrame(seconds) {
            let active = 0;
            for (let i = 0; i < timelineFrames.length; i++) {
                if (timelineFrames[i].time_seconds <= (seconds || 0) + 0.1) active = i;
            }
            document.querySelectorAll('.timeline-frame').forEach((el, i) => el.classList.toggle('active', i === active));
            const el = document.getElementById('timeline-frame-' + active);
            if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        function updateTimelineLabel(seconds) {
            const video = document.getElementById('timeline-video');
            const sec = seconds !== undefined ? seconds : (video.currentTime || 0);
            document.getElementById('timeline-time-label').textContent = formatTime(sec);
            if (seconds === undefined) highlightTimelineFrame(sec);
        }
        function closeTimeline() {
            const viewer = document.getElementById('timeline-viewer');
            viewer.classList.add('hidden');
            flushFavoritesRefresh();
            document.removeEventListener('keydown', timelineKeyHandler);
            const video = document.getElementById('timeline-video');
            video.pause();
            video.onloadedmetadata = null;
            video.ontimeupdate = null;
            video.removeAttribute('src');
            video.load();
            document.getElementById('timeline-strip').innerHTML = '';
            document.getElementById('timeline-favorite-action').innerHTML = '';
            timelineFrames = [];
            timelineVideoId = null;
            timelinePendingSeek = null;
        }

        // ============ Portrait Short Video Stream ============
        // ============ Ken Burns Auto Slideshow (pictures & screenshots) ============
        let kenItems = [];
        let kenIdx = -1;
        let kenOn = false;
        let kenRaf = null;
        let kenDur = 6000;
        let kenOverlap = true;
        let kenSource = 'pics';
        let kenFadeMin = 1;      // seconds, lower bound of the overlap fade
        let kenFadeMax = 2.5;    // seconds, upper bound of the overlap fade
        let kenFadeRatio = 30;   // percent of the stay
        let kenCur = 0;          // index into kenLayerState holding the newest (fully opaque) image
        let kenEntrance = false; // current layer is still doing its hard entrance fade-in
        let kenPauseAt = null;   // wall-clock time of the last pause, to shift timelines on resume
        const kenLayerState = [
            { el: null, idx: -1, start: 0, zoomSpan: 1, fadeIn: [0, 0], fadeOut: [Infinity, Infinity] },
            { el: null, idx: -1, start: 0, zoomSpan: 1, fadeIn: [0, 0], fadeOut: [Infinity, Infinity] },
            { el: null, idx: -1, start: 0, zoomSpan: 1, fadeIn: [0, 0], fadeOut: [Infinity, Infinity] }
        ];
        kenLayerState[0].el = document.getElementById('kenburns-img-a');
        kenLayerState[1].el = document.getElementById('kenburns-img-b');
        kenLayerState[2].el = document.getElementById('kenburns-img-c');
        function kenburnsIdxKey() { return 'rhvideo_kenburns_idx_' + kenSource + '_' + (token || ''); }
        function kenburnsDurKey() { return 'rhvideo_kenburns_dur_' + (token || ''); }
        function kenburnsOvKey() { return 'rhvideo_kenburns_ov_' + (token || ''); }
        function kenburnsFminKey() { return 'rhvideo_kenburns_fmin_' + (token || ''); }
        function kenburnsFmaxKey() { return 'rhvideo_kenburns_fmax_' + (token || ''); }
        function kenburnsFratioKey() { return 'rhvideo_kenburns_fratio_' + (token || ''); }
        // overlap ON: fade = stay * ratio, clamped to [min, max] seconds, never longer than the stay itself
        // (a stay shorter than the lower bound is one continuous crossfade); OFF: legacy 8% fade-through-black
        function kenFadeSpan() {
            if (!kenOverlap) return Math.min(kenDur * 0.08, kenDur);
            const lo = Math.min(kenFadeMin * 1000, kenDur);
            const hi = Math.max(lo, Math.min(kenFadeMax * 1000, kenDur));
            return Math.max(lo, Math.min(kenDur * kenFadeRatio / 100, hi));
        }
        function kenClampNum(v, lo, hi, dflt) {
            v = parseFloat(v);
            if (!isFinite(v)) v = dflt;
            return Math.min(hi, Math.max(lo, v));
        }
        function kenSmooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
        function kenPhase(now, a, b) { return (b - a < 1) ? 1 : kenSmooth((now - a) / (b - a)); }
        function kenLayerOpacity(L, now) {
            let o = kenPhase(now, L.fadeIn[0], L.fadeIn[1]);
            if (now > L.fadeOut[0]) o *= 1 - kenPhase(now, L.fadeOut[0], L.fadeOut[1]);
            return Math.max(0, Math.min(1, o));
        }
        function planKenburnsFade(L) {
            const F = kenFadeSpan();
            if (kenOverlap) {
                // revealed from underneath the fading previous image: fully opaque from load
                L.fadeIn = [L.start, L.start];
                L.fadeOut = [L.start + kenDur, L.start + kenDur + F];
                L.zoomSpan = kenDur + F;
            } else {
                L.fadeIn = [L.start, L.start + F];
                L.fadeOut = [L.start + kenDur - F, L.start + kenDur];
                L.zoomSpan = kenDur;
            }
        }

        // ---- Ken Burns progress bar ----
        function kenburnsUpdateProgress() {
            const bar = document.getElementById('kenburns-progress');
            const lbl = document.getElementById('kenburns-progress-label');
            if (!bar || !kenItems.length) return;
            if (document.activeElement === bar) return;
            const now = kenOn ? performance.now() : (kenPauseAt != null ? kenPauseAt : performance.now());
            const L = kenLayerState[kenCur];
            const elapsed = (L && L.idx >= 0) ? Math.max(0, Math.min(kenDur, now - L.start)) : 0;
            const total = kenItems.length * kenDur;
            const pos = kenIdx * kenDur + elapsed;
            bar.value = String(Math.round(pos / total * 1000));
            lbl.textContent = (kenIdx + 1) + '/' + kenItems.length + ' 张 · ' + fmtClock(pos / 1000) + ' / ' + fmtClock(total / 1000);
        }
        function kenburnsProgressInput(el) {
            const n = kenItems.length;
            if (!n) return;
            const frac = parseFloat(el.value) / 1000;
            const total = n * kenDur;
            const t = frac * total;
            const idx = Math.min(n - 1, Math.floor(t / kenDur));
            document.getElementById('kenburns-progress-label').textContent = (idx + 1) + '/' + n + ' 张 · ' + fmtClock(t / 1000) + ' / ' + fmtClock(total / 1000);
        }
        function kenburnsProgressCommit(el) {
            kenburnsSeekTo(parseFloat(el.value) / 1000);
        }
        function kenburnsSeekTo(frac) {
            const n = kenItems.length;
            if (!n) return;
            frac = Math.max(0, Math.min(1, frac));
            const total = n * kenDur;
            const t = frac * total;
            const idx = Math.min(n - 1, Math.floor(t / kenDur));
            const offset = Math.max(0, t - idx * kenDur);
            const now = performance.now();
            if (kenOn) {
                if (idx === kenIdx) {
                    const L = kenLayerState[kenCur];
                    if (L && L.idx >= 0) {
                        L.start = now - offset;
                        planKenburnsFade(L);
                        L.fadeIn = [L.start, L.start];
                        applyKenburnsFrame(L, now);
                        kenburnsUpdateProgress();
                        return;
                    }
                }
                showKenburnsImage(idx, true);
                const inL = kenLayerState[kenCur];
                inL.start = now - offset;
                planKenburnsFade(inL);
                inL.fadeIn = [inL.start, inL.start];
                applyKenburnsFrame(inL, now);
            } else {
                showKenburnsImage(idx, true);
                const inL = kenLayerState[kenCur];
                inL.start = now - offset;
                planKenburnsFade(inL);
                inL.fadeIn = [inL.start, inL.start];
                applyKenburnsFrame(inL, now);
                kenPauseAt = now;
                kenburnsUpdateProgress();
            }
        }
        async function openKenburns(source) {
            kenSource = (source === 'grid') ? 'grid' : 'pics';
            if (kenSource === 'grid') {
                if (gridRefreshPending || !gridMedia.length) await loadGrid();
                if (!gridMedia.length) { notify('还没有截图，请先在“视频列表 → 自动监控设置”中添加监控目录', 'error'); return; }
                kenItems = gridMedia.map(m => ({
                    url: m.url,
                    title: m.title || '',
                    videoId: m.videoId || null,
                    pictureId: m.pictureId || null
                }));
            } else {
                if (!allPictures.length) await loadPictures();
                if (!allPictures.length) { notify('还没有图片，请先在图片页添加监控目录', 'error'); return; }
                await renderPictures();
                kenItems = buildPicStripOrder().map(p => ({
                    url: RHVideoHost.asset('/storage/' + p.webp_path),
                    title: (p.folder_label ? '[' + p.folder_label + '] ' : '') + p.original_filename,
                    pictureId: p.id
                }));
                if (!kenItems.length) { notify('当前筛选下没有可放映的图片', 'info'); return; }
            }
            kenOn = false;
            if (kenRaf) cancelAnimationFrame(kenRaf);
            kenRaf = null;
            const savedDur = parseFloat(RHVideoHost.storage.getItem(kenburnsDurKey()) || '');
            if (savedDur >= 0.1 && savedDur <= 30) kenDur = savedDur * 1000;
            document.getElementById('kenburns-duration').value = String(kenDur / 1000);
            const savedOv = RHVideoHost.storage.getItem(kenburnsOvKey());
            kenOverlap = (savedOv === null) ? true : (savedOv === 'true');
            document.getElementById('kenburns-overlap').checked = kenOverlap;
            kenFadeMin = kenClampNum(RHVideoHost.storage.getItem(kenburnsFminKey()), 0.1, 30, 1);
            kenFadeMax = kenClampNum(RHVideoHost.storage.getItem(kenburnsFmaxKey()), kenFadeMin, 60, 2.5);
            kenFadeRatio = Math.round(kenClampNum(RHVideoHost.storage.getItem(kenburnsFratioKey()), 5, 90, 30));
            document.getElementById('kenburns-fade-min').value = String(kenFadeMin);
            document.getElementById('kenburns-fade-max').value = String(kenFadeMax);
            document.getElementById('kenburns-fade-ratio').value = String(kenFadeRatio);
            document.getElementById('kenburns-fade-cfg').style.display = kenOverlap ? 'flex' : 'none';
            updateKenburnsDuration();
            const saved = parseInt(RHVideoHost.storage.getItem(kenburnsIdxKey()) || '');
            kenIdx = (saved >= 0 && saved < kenItems.length) ? saved : 0;
            for (const L of kenLayerState) {
                L.idx = -1;
                L.fadeOut = [Infinity, Infinity];
                L.el.style.opacity = '0';
                L.el.style.zIndex = '1';
            }
            kenCur = 0;
            const viewer = document.getElementById('kenburns-viewer');
            viewer.classList.remove('hidden');
            document.addEventListener('keydown', kenburnsKeyHandler);
            showKenburnsImage(kenIdx, true);
            startKenburns();
        }
        function showKenburnsImage(idx, hard) {
            if (!kenItems.length) return;
            kenIdx = ((idx % kenItems.length) + kenItems.length) % kenItems.length;
            RHVideoHost.storage.setItem(kenburnsIdxKey(), String(kenIdx));
            document.getElementById('kenburns-title').textContent = kenItems[kenIdx].title || '';
            document.getElementById('kenburns-favorite-action').innerHTML = mediaStarBtn(kenItems[kenIdx]);
            const now = performance.now();
            const F = kenFadeSpan();
            const curL = kenLayerState[kenCur];
            // schedule the current image's exit: hard-clear it, or let it fade out on top of the incoming one
            if (curL.idx >= 0) {
                if (hard || kenLayerOpacity(curL, now) <= 0.004) {
                    curL.idx = -1;
                    curL.el.style.opacity = '0';
                } else {
                    // continue any in-progress fade from its current phase, finish within F
                    const [a, b] = curL.fadeOut;
                    const p = (isFinite(b) && b - a >= 1) ? Math.max(0, Math.min(1, (now - a) / (b - a))) : 0;
                    curL.fadeOut = [now - p * F, now - p * F + F];
                }
            }
            // pick the layer for the new image: an idle one if possible, else the least visible fading one
            let inL = null;
            for (const L of kenLayerState) { if (L.idx < 0) { inL = L; break; } }
            if (!inL) {
                let worst = Infinity;
                for (const L of kenLayerState) {
                    const o = kenLayerOpacity(L, now);
                    if (o < worst) { worst = o; inL = L; }
                }
            }
            kenCur = kenLayerState.indexOf(inL);
            kenEntrance = !!hard;
            inL.idx = kenIdx;
            inL.start = now;
            planKenburnsFade(inL);
            if (hard) inL.fadeIn = [now, now + F];
            inL.el.src = kenItems[kenIdx].url;
            restackKenburns();
            applyKenburnsFrame(inL, now);
            kenburnsUpdateProgress();
        }
        // newest image at the bottom; older still-fading images stack above it, oldest on top
        function restackKenburns() {
            const act = kenLayerState.filter(L => L.idx >= 0);
            for (const L of act) {
                let above = 0;
                for (const M of act) { if (M.start > L.start) above++; }
                L.el.style.zIndex = String(1 + above);
            }
        }
        function startKenburns() {
            if (!kenItems.length) return;
            kenOn = true;
            document.getElementById('kenburns-toggle-btn').textContent = '⏸ 暂停';
            const now = performance.now();
            const F = kenFadeSpan();
            const resume = kenPauseAt !== null;
            const shift = resume ? (now - kenPauseAt) : 0;
            kenPauseAt = null;
            // on resume, pretend the paused interval never happened: shift every timeline forward
            for (const L of kenLayerState) {
                if (L.idx < 0) continue;
                L.start += shift;
                L.fadeIn[0] += shift; L.fadeIn[1] += shift;
                L.fadeOut[0] += shift; L.fadeOut[1] += shift;
            }
            const cur = kenLayerState[kenCur];
            if (cur.idx >= 0 && !kenEntrance) {
                if (!resume) cur.start = now; // fresh start / setting change: restart the stay
                planKenburnsFade(cur);        // re-plan the exit against current settings
                if (!resume) cur.fadeIn = [now, now];
                applyKenburnsFrame(cur, now);
            }
            // remnants still fading: continue from their current phase over the (possibly new) fade length
            for (const L of kenLayerState) {
                if (L === cur || L.idx < 0) continue;
                const [a, b] = L.fadeOut;
                const p = (isFinite(b) && b - a >= 1) ? Math.max(0, Math.min(1, (now - a) / (b - a))) : 1;
                L.fadeOut = [now - p * F, now - p * F + F];
                if (kenLayerOpacity(L, now) <= 0.004) { L.idx = -1; L.el.style.opacity = '0'; }
                else applyKenburnsFrame(L, now);
            }
            if (kenRaf) cancelAnimationFrame(kenRaf);
            kenRaf = requestAnimationFrame(kenburnsTick);
        }
        function kenburnsTick() {
            if (!kenOn) return;
            const now = performance.now();
            const cur = kenLayerState[kenCur];
            if (kenItems.length > 1 && now >= cur.start + kenDur) showKenburnsImage(kenIdx + 1);
            for (const L of kenLayerState) {
                if (L.idx < 0) continue;
                applyKenburnsFrame(L, now);
                if (now >= L.fadeOut[1] && kenLayerOpacity(L, now) <= 0.004) {
                    L.idx = -1;
                    L.el.style.opacity = '0';
                }
            }
            kenburnsUpdateProgress();
            kenRaf = requestAnimationFrame(kenburnsTick);
        }
        function applyKenburnsFrame(L, now) {
            const t = Math.max(0, Math.min(1, (now - L.start) / Math.max(1, L.zoomSpan)));
            const dir = (L.idx % 2 === 0) ? 1 : -1;
            const scale = 1 + 0.16 * t;
            const tx = dir * 3 * t;
            const ty = (L.idx % 2 === 0 ? -1 : 1) * 2 * t;
            L.el.style.transform = `translate(${tx}%, ${ty}%) scale(${scale})`;
            L.el.style.opacity = String(kenLayerOpacity(L, now));
        }
        function kenburnsNext(delta) {
            if (!kenItems.length) return;
            if (kenOn) showKenburnsImage(kenIdx + delta);
            else { showKenburnsImage(kenIdx + delta, true); startKenburns(); }
        }
        function toggleKenburns() {
            if (kenOn) {
                kenOn = false;
                kenPauseAt = performance.now();
                if (kenRaf) cancelAnimationFrame(kenRaf);
                kenRaf = null;
                document.getElementById('kenburns-toggle-btn').textContent = '▶ 播放';
            } else {
                startKenburns();
            }
            kenburnsUpdateProgress();
        }
        function updateKenburnsFadeCfg() {
            kenFadeMin = kenClampNum(document.getElementById('kenburns-fade-min').value, 0.1, 30, 1);
            kenFadeMax = kenClampNum(document.getElementById('kenburns-fade-max').value, kenFadeMin, 60, Math.max(2.5, kenFadeMin));
            kenFadeRatio = Math.round(kenClampNum(document.getElementById('kenburns-fade-ratio').value, 5, 90, 30));
            document.getElementById('kenburns-fade-min').value = String(kenFadeMin);
            document.getElementById('kenburns-fade-max').value = String(kenFadeMax);
            document.getElementById('kenburns-fade-ratio').value = String(kenFadeRatio);
            RHVideoHost.storage.setItem(kenburnsFminKey(), String(kenFadeMin));
            RHVideoHost.storage.setItem(kenburnsFmaxKey(), String(kenFadeMax));
            RHVideoHost.storage.setItem(kenburnsFratioKey(), String(kenFadeRatio));
            if (kenOn) startKenburns();
        }
        function updateKenburnsDuration() {
            let val = parseFloat(document.getElementById('kenburns-duration').value);
            if (!isFinite(val)) val = 6;
            val = Math.min(30, Math.max(0.1, Math.round(val * 10) / 10));
            kenDur = val * 1000;
            document.getElementById('kenburns-duration-label').textContent = val + 's';
            RHVideoHost.storage.setItem(kenburnsDurKey(), String(val));
            if (kenOn) startKenburns();
        }
        // mobile-friendly ±0.1s nudge buttons; press-and-hold repeats with acceleration
        let kenNudgeTimer = null;
        let kenNudgeDelta = 0.1;
        function kenburnsNudgeDuration(delta) {
            const slider = document.getElementById('kenburns-duration');
            let val = parseFloat(slider.value);
            if (!isFinite(val)) val = 6;
            val = Math.round((val + delta) * 10) / 10;
            slider.value = String(Math.min(30, Math.max(0.1, val)));
            updateKenburnsDuration();
        }
        function kenburnsNudgeStart(delta) {
            kenburnsNudgeStop();
            kenNudgeDelta = delta;
            kenburnsNudgeDuration(delta);
            let taps = 0;
            const step = () => {
                kenburnsNudgeDuration(kenNudgeDelta);
                taps++;
                kenNudgeTimer = setTimeout(step, taps >= 8 ? 50 : (taps >= 3 ? 120 : 350));
            };
            kenNudgeTimer = setTimeout(step, 350);
        }
        function kenburnsNudgeStop() {
            if (kenNudgeTimer) { clearTimeout(kenNudgeTimer); kenNudgeTimer = null; }
        }
        function updateKenburnsOverlap() {
            kenOverlap = document.getElementById('kenburns-overlap').checked;
            document.getElementById('kenburns-fade-cfg').style.display = kenOverlap ? 'flex' : 'none';
            RHVideoHost.storage.setItem(kenburnsOvKey(), String(kenOverlap));
            if (kenOn) startKenburns();
        }
        function kenburnsRandomize() {
            for (let i = kenItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [kenItems[i], kenItems[j]] = [kenItems[j], kenItems[i]];
            }
            if (kenOn) showKenburnsImage(0);
            else { showKenburnsImage(0, true); startKenburns(); }
            notify('放映顺序已随机', 'success');
        }
        function kenburnsKeyHandler(e) {
            const viewer = document.getElementById('kenburns-viewer');
            if (viewer.classList.contains('hidden')) return;
            if (e.key === 'Escape') { e.preventDefault(); closeKenburns(); }
            else if (e.key === ' ') { e.preventDefault(); toggleKenburns(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); kenburnsNext(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); kenburnsNext(1); }
            else if (e.key === 'Home') { e.preventDefault(); kenburnsSeekTo(0); }
            else if (e.key === 'End') { e.preventDefault(); kenburnsSeekTo(1); }
        }
        function closeKenburns() {
            kenOn = false;
            if (kenRaf) cancelAnimationFrame(kenRaf);
            kenRaf = null;
            const viewer = document.getElementById('kenburns-viewer');
            viewer.classList.add('hidden');
            flushFavoritesRefresh();
            document.getElementById('kenburns-favorite-action').innerHTML = '';
            document.removeEventListener('keydown', kenburnsKeyHandler);
            kenEntrance = false;
            kenPauseAt = null;
            kenburnsNudgeStop();
            for (const L of kenLayerState) {
                L.idx = -1;
                L.fadeOut = [Infinity, Infinity];
                L.el.style.opacity = '0';
                L.el.removeAttribute('src');
            }
        }

        // ============ Playlist ============
        let playlistAbortController = null;
        let playlistCheckEnd = null;
        let playlistVideoIds = null;
        let playlistCurrentIdx = -1;
        let playlistEntries = null;
        let playlistSeekTimer = null;
        let playlistDoPlayEntry = null;
        let playlistDesiredOffset = null; // seconds into the target entry for a scrubber seek
        let playlistSequential = false;   // sequential mode: current list order from the top, full-length, delete-mark friendly
        let playlistSuper = false;       // sequential mode plays the super-compressed stream (?super=true)
        function playlistStateKey() {
            return 'rhvideo_playlist' + (playlistSequential ? (playlistSuper ? '_seqsuper' : '_seq') : '') + '_' + (token || '');
        }
        function startSequentialPlay() { return startPlaylist({ sequential: true }); }
        // 视频列表当前顺序（含搜索/排序结果，跨页）的可播放视频 id
        function collectListOrderVideoIds() {
            const playable = new Set(['ready', 'processing']);
            return (filteredVideos || allVideos)
                .filter(v => v && playable.has(v.status) && v.id != null)
                .map(v => v.id);
        }
        function startListSequentialPlay() {
            if (videoMultiSelect) return;
            const ids = collectListOrderVideoIds();
            if (!ids.length) { notify('当前列表没有可播放的视频', 'error'); return; }
            return startPlaylist({ sequential: true, videoIds: ids });
        }
        function startListSequentialSuperPlay() {
            if (videoMultiSelect) return;
            const ids = collectListOrderVideoIds();
            if (!ids.length) { notify('当前列表没有可播放的视频', 'error'); return; }
            return startPlaylist({ sequential: true, super: true, videoIds: ids });
        }
        function playlistKeyHandler(e) {
            if (document.getElementById('playlist-viewer').classList.contains('hidden')) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closePlaylistViewer(null);
            } else if (e.key === ' ') {
                e.preventDefault();
                const video = document.getElementById('playlist-video');
                if (video.src && !video.src.endsWith('/')) {
                    if (video.paused) video.play().catch(() => {});
                    else video.pause();
                }
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                playlistNav(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                playlistNav(1);
            } else if (e.key === 'Home') {
                e.preventDefault();
                playlistProgressCommit({ value: '0' });
            } else if (e.key === 'End') {
                e.preventDefault();
                playlistProgressCommit({ value: '1000' });
            }
        }
        function playlistWheelHandler(e) {
            if (document.getElementById('playlist-viewer').classList.contains('hidden')) return;
            e.preventDefault();
            playlistNav(e.deltaY > 0 ? 1 : -1);
        }
        let playlistTouchStartX = 0;
        function playlistTouchStart(e) { playlistTouchStartX = e.touches[0].clientX; }
        function playlistTouchEnd(e) {
            const dx = e.changedTouches[0].clientX - playlistTouchStartX;
            if (Math.abs(dx) > 50) playlistNav(dx < 0 ? 1 : -1);
        }
        function playlistNav(delta) {
            if (!playlistEntries || !playlistDoPlayEntry) return;
            const video = document.getElementById('playlist-video');
            video.pause();
            if (playlistCheckEnd) {
                video.removeEventListener('timeupdate', playlistCheckEnd);
                playlistCheckEnd = null;
            }
            clearTimeout(playlistSeekTimer);
            video.onerror = null;
            video.onloadedmetadata = null;
            video.onseeked = null;
            video.onplaying = null;
            const len = playlistEntries.length;
            let newIdx = (playlistCurrentIdx + delta + len) % len;
            playlistDoPlayEntry(newIdx);
        }
        let playlistLoopOn = false;
        let playlistSpeed = 1;
        let prevSegVal = 3;
        function togglePlaylistLoop(force) {
            playlistLoopOn = typeof force === 'boolean' ? force : !playlistLoopOn;
            const btn = document.getElementById('pl-loop-btn');
            btn.style.background = playlistLoopOn ? 'rgba(102,126,234,0.5)' : '';
            if (typeof force !== 'boolean') savePlaylistState();
        }
        function cyclePlaylistSpeed() {
            const speeds = [0.5, 1, 1.5, 2];
            let idx = speeds.indexOf(playlistSpeed);
            idx = (idx + 1) % speeds.length;
            playlistSpeed = speeds[idx];
            document.getElementById('pl-speed-btn').textContent = playlistSpeed + 'x';
            const video = document.getElementById('playlist-video');
            if (video) video.playbackRate = playlistSpeed;
            savePlaylistState();
        }
        function $playlistSegOnInput() {
            const sl = document.getElementById('playlist-seg-dur');
            const v = parseInt(sl.value) || 3;
            prevSegVal = v;
            document.getElementById('playlist-seg-label').textContent = v >= 60 ? Math.floor(v/60)+'m'+(v%60?String(v%60)+'s':'') : v+'s';
            document.getElementById('pl-fullseg').checked = false;
            savePlaylistState();
        }
        function adjSegDur(delta) {
            const sl = document.getElementById('playlist-seg-dur');
            let v = (parseInt(sl.value) || 3) + delta;
            if (v < 1) v = 1;
            if (v > 300) v = 300;
            sl.value = v;
            prevSegVal = v;
            document.getElementById('playlist-seg-label').textContent = v >= 60 ? Math.floor(v/60)+'m'+(v%60?String(v%60)+'s':'') : v+'s';
            document.getElementById('pl-fullseg').checked = false;
            savePlaylistState();
        }
        function editSegDur() {
            const lbl = document.getElementById('playlist-seg-label');
            const sl = document.getElementById('playlist-seg-dur');
            const cur = parseInt(sl.value) || 3;
            lbl.innerHTML = `<input type="number" id="seg-dur-input" value="${cur}" min="1" max="300" style="width:52px;padding:2px 4px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:4px;font-size:1em;text-align:center" data-rh-keydown="h269" data-rh-a-h269="${RHVideoBindings.encode([null])}" data-rh-blur="h270" data-rh-a-h270="${RHVideoBindings.encode([null])}">`;
            setTimeout(() => document.getElementById('seg-dur-input')?.focus(), 50);
        }
        function commitSegDur() {
            const inp = document.getElementById('seg-dur-input');
            if (!inp) return;
            let v = parseInt(inp.value) || 3;
            if (v < 1) v = 1;
            if (v > 300) v = 300;
            document.getElementById('playlist-seg-dur').value = v;
            prevSegVal = v;
            document.getElementById('playlist-seg-label').textContent = v >= 60 ? Math.floor(v/60)+'m'+(v%60?String(v%60)+'s':'') : v+'s';
            document.getElementById('pl-fullseg').checked = false;
            savePlaylistState();
        }
        function onPlaylistFullSeg() {
            const cb = document.getElementById('pl-fullseg');
            if (cb.checked) {
                prevSegVal = parseInt(document.getElementById('playlist-seg-dur').value) || 3;
                document.getElementById('playlist-seg-dur').value = 300;
                document.getElementById('playlist-seg-label').textContent = '全长';
            } else {
                const v = prevSegVal;
                document.getElementById('playlist-seg-dur').value = v;
                document.getElementById('playlist-seg-label').textContent = v >= 60 ? Math.floor(v/60)+'m'+(v%60?String(v%60)+'s':'') : v+'s';
            }
            savePlaylistState();
        }
        function getPlaylistSegDur() {
            if (document.getElementById('pl-fullseg').checked) return 86400;
            return parseInt(document.getElementById('playlist-seg-dur').value) || 3;
        }
        function isPortraitResolution(res) {
            const parts = String(res || '').split('x');
            const w = parseInt(parts[0]), h = parseInt(parts[1]);
            return w > 0 && h > 0 && h > w * 1.1;
        }
        // grid-order video id collection, starting from the last browsed position
        function collectPlaylistVideoIds(fromStart) {
            let startIdx = 0;
            if (!fromStart) {
                try {
                    const raw = RHVideoHost.storage.getItem('rhvideo_browse_' + (token || ''));
                    if (raw) startIdx = findBrowseIndex(JSON.parse(raw));
                } catch(e) {}
            }
            const seen = new Set();
            const videoIds = [];
            for (let i = startIdx; i < gridMedia.length; i++) {
                const m = gridMedia[i];
                if (m.videoId && !seen.has(m.videoId)) { seen.add(m.videoId); videoIds.push(m.videoId); }
            }
            for (let i = 0; i < startIdx; i++) {
                const m = gridMedia[i];
                if (m.videoId && !seen.has(m.videoId)) { seen.add(m.videoId); videoIds.push(m.videoId); }
            }
            return videoIds;
        }
        async function filterPortraitVideoIds(videoIds) {
            if (!allVideos.length) await loadVideos();
            // same statuses the screenshot grid (and thus the playlist pool) includes
            const playable = new Set(['ready', 'processing']);
            const portrait = new Set(
                allVideos.filter(v => playable.has(v.status) && isPortraitResolution(v.original_resolution)).map(v => v.id)
            );
            return videoIds.filter(id => portrait.has(id));
        }
        async function onPlaylistPortrait() {
            const cb = document.getElementById('pl-portrait');
            if (cb.checked) {
                const all = collectPlaylistVideoIds();
                const ids = await filterPortraitVideoIds(all);
                if (ids.length < 2) {
                    notify('竖屏视频不足 2 个，无法开启仅竖屏', 'error');
                    cb.checked = false;
                    return;
                }
                if (ids.length < all.length) notify(`仅竖屏：${ids.length} / ${all.length} 个视频`, 'success');
                document.getElementById('pl-fullseg').checked = true;
                onPlaylistFullSeg();
            } else {
                document.getElementById('pl-fullseg').checked = false;
                onPlaylistFullSeg();
            }
            savePlaylistState();
            const wasSequential = playlistSequential;
            closePlaylistViewer(null);
            await startPlaylist({ sequential: wasSequential });
        }
        let mediaLoopOn = false;
        let mediaSpeed = 1;
        function toggleMediaLoop(force) {
            mediaLoopOn = typeof force === 'boolean' ? force : !mediaLoopOn;
            const btn = document.getElementById('mv-loop-btn');
            btn.style.background = mediaLoopOn ? 'rgba(102,126,234,0.5)' : '';
            const video = document.querySelector('#media-content video');
            if (video) {
                 pageVolumeBind(video);
                 video.loop = mediaLoopOn;
             }
        }
        function cycleMediaSpeed() {
            const speeds = [0.5, 1, 1.5, 2];
            let idx = speeds.indexOf(mediaSpeed);
            idx = (idx + 1) % speeds.length;
            mediaSpeed = speeds[idx];
            document.getElementById('mv-speed-btn').textContent = mediaSpeed + 'x';
            const video = document.querySelector('#media-content video');
            if (video) video.playbackRate = mediaSpeed;
        }
        function loadRotationPref() {
            try {
                mediaRotated = RHVideoHost.storage.getItem('rhvideo_rotate_' + (token || '')) === 'true';
            } catch(e) { mediaRotated = false; }
        }
        function saveRotationPref() {
            try {
                RHVideoHost.storage.setItem('rhvideo_rotate_' + (token || ''), String(mediaRotated));
            } catch(e) {}
        }
        function toggleMediaRotate() {
            mediaRotated = !mediaRotated;
            saveRotationPref();
            const video = document.querySelector('#media-content video');
            const btn = document.getElementById('mv-rot-btn');
            if (mediaRotated) {
                btn.style.background = 'rgba(102,126,234,0.5)';
                btn.innerHTML = '↺';
            } else {
                btn.style.background = '';
                btn.innerHTML = '↻';
            }
            if (video) {
                const opt = shouldRotate(video);
                applyVideoRotate(video, mediaRotated && opt);
            }
        }
        function applyVideoRotate(video, apply) {
            if (_rotResizeBound) {
                window.removeEventListener('resize', _rotResizeBound);
                _rotResizeBound = null;
            }
            if (apply) {
                const container = document.getElementById('media-content');
                const cw = container.clientWidth;
                const ch = container.clientHeight;
                video.style.width = ch + 'px';
                video.style.height = cw + 'px';
                video.classList.add('rotated');
                _rotResizeBound = () => {
                    if (!video.parentNode) { window.removeEventListener('resize', _rotResizeBound); _rotResizeBound = null; return; }
                    const c = document.getElementById('media-content');
                    video.style.width = c.clientHeight + 'px';
                    video.style.height = c.clientWidth + 'px';
                };
                window.addEventListener('resize', _rotResizeBound);
            } else {
                video.style.width = '';
                video.style.height = '';
                video.classList.remove('rotated');
            }
        }
        let _rotResizeBound = null;
        function shouldRotate(video) {
            const vw = video.videoWidth || 0;
            const vh = video.videoHeight || 0;
            if (!vw || !vh) return false;
            const container = document.getElementById('media-content');
            const cr = container.clientWidth / Math.max(container.clientHeight, 1);
            const vr = vw / vh;
            const normalScore = Math.min(cr / vr, vr / cr);
            const rotScore = Math.min(cr / (1/vr), (1/vr) / cr);
            return rotScore > normalScore * 1.05;
        }
        function updateMediaRotBtn() {
            const video = document.querySelector('#media-content video');
            const btn = document.getElementById('mv-rot-btn');
            if (!video) { btn.style.display = 'none'; return; }
            const vw = video.videoWidth || 0;
            const vh = video.videoHeight || 0;
            if (!vw || !vh) {
                btn.style.display = 'inline-block';
                btn.style.background = mediaRotated ? 'rgba(102,126,234,0.5)' : '';
                btn.innerHTML = mediaRotated ? '↺' : '↻';
                return;
            }
            const vr = vw / vh;
            if (!mediaRotated && vr > 0.9 && vr < 1.1) { btn.style.display = 'none'; return; }
            const container = document.getElementById('media-content');
            const cr = container.clientWidth / Math.max(container.clientHeight, 1);
            const normalS = Math.min(cr / vr, vr / cr);
            const rotS = Math.min(cr / (1/vr), (1/vr) / cr);
            if (Math.abs(normalS - rotS) < 0.05 && !mediaRotated) { btn.style.display = 'none'; return; }
            btn.style.display = 'inline-block';
            btn.style.background = mediaRotated ? 'rgba(102,126,234,0.5)' : '';
            btn.innerHTML = mediaRotated ? '↺' : '↻';
        }
        function savePlaylistState() {
            if (!playlistVideoIds || playlistCurrentIdx < 0) return;
            try {
                const segDur = getPlaylistSegDur();
                const fullSeg = document.getElementById('pl-fullseg').checked;
                RHVideoHost.storage.setItem(playlistStateKey(), JSON.stringify({
                    videoIds: playlistVideoIds,
                    index: playlistCurrentIdx,
                    segDur,
                    fullSeg,
                    loopOn: playlistLoopOn,
                    speed: playlistSpeed,
                    portrait: document.getElementById('pl-portrait').checked
                }));
            } catch(e) {}
        }
        function closePlaylistViewer(event) {
            if (event && event.target !== document.getElementById('playlist-viewer')) return;
            savePlaylistState();
            const video = document.getElementById('playlist-video');
            video.pause();
            video.src = '';
            video.onerror = null;
            video.onloadedmetadata = null;
            video.onseeked = null;
            video.onplaying = null;
            if (playlistCheckEnd) {
                video.removeEventListener('timeupdate', playlistCheckEnd);
                playlistCheckEnd = null;
            }
            if (playlistAbortController) { playlistAbortController.abort(); playlistAbortController = null; }
            const preload = document.querySelector('#playlist-content video:not(#playlist-video)');
            if (preload) preload.remove();
            document.removeEventListener('keydown', playlistKeyHandler);
            document.removeEventListener('wheel', playlistWheelHandler, { passive: false });
            const viewer = document.getElementById('playlist-viewer');
            viewer.removeEventListener('touchstart', playlistTouchStart);
            viewer.removeEventListener('touchend', playlistTouchEnd);
            playlistEntries = null;
            playlistDoPlayEntry = null;
            playlistSeekTimer = null;
            togglePlaylistLoop(false);
            viewer.classList.add('hidden');
            flushFavoritesRefresh();
            document.getElementById('playlist-loading').style.display = '';
            document.getElementById('playlist-video').style.display = 'none';
            document.getElementById('playlist-bottom').style.display = 'none';
            document.getElementById('playlist-favorite-action').innerHTML = '';
            document.getElementById('playlist-delete-action').innerHTML = '';
            playlistSequential = false;
            playlistSuper = false;
            startPreviewDeleteExecution();
            const pbar = document.getElementById('playlist-progress-bar');
            if (pbar) { pbar.value = '0'; }
            const plbl = document.getElementById('playlist-progress-label');
            if (plbl) { plbl.textContent = ''; }
        }

        // ---- Playlist progress bar ----
        function playlistTotalDur() {
            let t = 0;
            for (const e of (playlistEntries || [])) t += (e.duration || 0);
            return t;
        }
        function updatePlaylistProgress() {
            const bar = document.getElementById('playlist-progress-bar');
            const lbl = document.getElementById('playlist-progress-label');
            if (!bar || !playlistEntries || !playlistEntries.length) return;
            if (document.activeElement === bar) return;
            const video = document.getElementById('playlist-video');
            const total = playlistTotalDur();
            if (!total) { bar.value = '0'; lbl.textContent = ''; return; }
            let pos = 0;
            for (let i = 0; i < playlistCurrentIdx; i++) pos += (playlistEntries[i].duration || 0);
            const entry = playlistEntries[playlistCurrentIdx];
            if (entry && video && video.src) {
                const cur = (isFinite(video.currentTime) ? video.currentTime : 0) - (entry.start || 0);
                pos += Math.max(0, Math.min(entry.duration || 0, cur));
            }
            bar.value = String(Math.round(pos / total * 1000));
            lbl.textContent = (playlistCurrentIdx + 1) + '/' + playlistEntries.length + ' · ' + fmtClock(pos) + ' / ' + fmtClock(total);
        }
        function playlistProgressInput(el) {
            if (!playlistEntries || !playlistEntries.length) return;
            const frac = parseFloat(el.value) / 1000;
            const total = playlistTotalDur();
            if (!total) return;
            const t = frac * total;
            let idx = playlistEntries.length - 1, acc = 0;
            for (let i = 0; i < playlistEntries.length; i++) {
                const d = playlistEntries[i].duration || 0;
                if (t < acc + d) { idx = i; break; }
                acc += d;
            }
            document.getElementById('playlist-progress-label').textContent = (idx + 1) + '/' + playlistEntries.length + ' · ' + fmtClock(t) + ' / ' + fmtClock(total);
        }
        function playlistProgressCommit(el) {
            if (!playlistEntries || !playlistEntries.length) return;
            const frac = Math.max(0, Math.min(1, parseFloat(el.value) / 1000));
            const total = playlistTotalDur();
            if (!total) return;
            const t = frac * total;
            let idx = playlistEntries.length - 1, acc = 0;
            for (let i = 0; i < playlistEntries.length; i++) {
                const d = playlistEntries[i].duration || 0;
                if (t < acc + d) { idx = i; break; }
                acc += d;
            }
            const offset = Math.max(0, t - acc);
            playlistDesiredOffset = offset;
            if (playlistDoPlayEntry) playlistDoPlayEntry(idx);
        }
        function buildPlaylistEntries(videoIds, segDur, full) {
            const byId = new Map(allVideos.map(video => [String(video.id), video]));
            return videoIds.map(id => {
                const video = byId.get(String(id)) || {};
                const duration = Number(video.duration_seconds || video.original_duration || 0);
                const maxStart = duration - segDur - 1;
                const start = full ? 0 : (maxStart > 1 ? 1 + Math.random() * (maxStart - 1) : 0);
                return {
                    video_id: id,
                    url: `${API_BASE}/videos/${encodeURIComponent(id)}/play` + (playlistSuper ? '?super=true' : ''),
                    super: playlistSuper,
                    start: Math.round(start * 10) / 10,
                    duration: (full && duration > 0) ? Math.round(duration * 10) / 10 : (duration > 0 ? Math.round(Math.min(segDur, duration) * 10) / 10 : segDur),
                    title: (video.folder_label ? '[' + video.folder_label + '] ' : '') + (video.original_filename || id) + (playlistSuper ? ' (超压)' : ''),
                };
            });
        }

        async function startPlaylist(opts) {
            playlistSequential = !!(opts && opts.sequential);
            playlistSuper = !!(opts && opts.sequential && opts.super);
            // restore the portrait flag first: it changes which videos are collected
            try {
                const savedP = RHVideoHost.storage.getItem(playlistStateKey());
                if (savedP) document.getElementById('pl-portrait').checked = !!(JSON.parse(savedP).portrait);
            } catch(e) {}
            if (playlistSequential) document.getElementById('pl-portrait').checked = false;
            if (!allVideos.length) await loadVideos();
            if (!playlistSequential && gridRefreshPending) await loadGrid();
            let videoIds = (opts && Array.isArray(opts.videoIds)) ? opts.videoIds.slice() : collectPlaylistVideoIds(playlistSequential);
            if (document.getElementById('pl-portrait').checked) {
                videoIds = await filterPortraitVideoIds(videoIds);
            }
            if (videoIds.length < (playlistSequential ? 1 : 2)) {
                const onlyPortrait = document.getElementById('pl-portrait').checked;
                notify(onlyPortrait ? '竖屏视频不足 2 个，无法连播' : (playlistSequential ? '没有可播放的视频' : '需要至少 2 个视频才能连播'), 'error');
                if (onlyPortrait) document.getElementById('pl-portrait').checked = false;
                return;
            }

            // check saved playlist state: resume if same video list
            let resumeIdx = 0;
            let savedSegDur = 3;
            let savedFullSeg = playlistSequential;
            let savedLoopOn = false;
            let savedSpeed = 1;
            try {
                const saved = RHVideoHost.storage.getItem(playlistStateKey());
                if (saved) {
                    const state = JSON.parse(saved);
                    if (state.videoIds && state.videoIds.length === videoIds.length &&
                        state.videoIds.every((id, i) => id === videoIds[i])) {
                        resumeIdx = state.index || 0;
                    }
                    savedSegDur = state.segDur || 3;
                    if (!playlistSequential) savedFullSeg = state.fullSeg || false;
                    savedLoopOn = state.loopOn || false;
                    savedSpeed = state.speed || 1;
                }
            } catch(e) {}
            if (playlistSequential) savedSegDur = 300;
            document.getElementById('playlist-seg-dur').value = savedFullSeg ? 300 : savedSegDur;
            document.getElementById('playlist-seg-label').textContent = savedFullSeg ? '全长' : (savedSegDur >= 60 ? Math.floor(savedSegDur/60)+'m'+(savedSegDur%60?String(savedSegDur%60)+'s':'') : savedSegDur+'s');
            document.getElementById('pl-fullseg').checked = savedFullSeg;
            playlistSpeed = savedSpeed;
            document.getElementById('pl-speed-btn').textContent = savedSpeed + 'x';
            togglePlaylistLoop(savedLoopOn);

            playlistVideoIds = videoIds;

            const segDur = getPlaylistSegDur();
            const totalDur = videoIds.length * segDur;

            const viewer = document.getElementById('playlist-viewer');
            viewer.classList.remove('hidden');
            document.addEventListener('keydown', playlistKeyHandler);
            document.addEventListener('wheel', playlistWheelHandler, { passive: false });
            viewer.addEventListener('touchstart', playlistTouchStart);
            viewer.addEventListener('touchend', playlistTouchEnd);
                document.getElementById('playlist-loading-text').textContent = (playlistSequential ? ('正在按当前顺序连播' + (playlistSuper ? '（超压）' : '')) : '准备第一个视频') + `（共 ${videoIds.length} 个）...`;
            document.getElementById('playlist-loading').style.display = '';
            document.getElementById('playlist-video').style.display = 'none';
            document.getElementById('playlist-bottom').style.display = 'none';

            playlistAbortController = new AbortController();
            const video = document.getElementById('playlist-video');
            pageVolumeBind(video, 0.2);
            const preloadVideo = document.createElement('video');
            preloadVideo.preload = 'auto';
             pageVolumeBind(preloadVideo, 1);
            preloadVideo.muted = true;
            preloadVideo.style.display = 'none';
            document.getElementById('playlist-content').appendChild(preloadVideo);

                let firstPlay = true;
                let seekRetries = 0, seekRetryTimer = null;
            function playEntry(idx) {
                if (playlistAbortController?.signal.aborted) return;
                clearTimeout(seekRetryTimer); seekRetries = 0;
                clearTimeout(playlistSeekTimer);
                video.pause();
                if (playlistCheckEnd) {
                    video.removeEventListener('timeupdate', playlistCheckEnd);
                    playlistCheckEnd = null;
                }
                video.onerror = null;
                video.onloadedmetadata = null;
                video.onseeked = null;
                video.onplaying = null;

                if (idx >= playlistEntries.length) {
                    closePlaylistViewer(null);
                    return;
                }
                playlistCurrentIdx = idx;
                const entry = playlistEntries[idx];
                const targetTime = entry.start + (playlistDesiredOffset || 0);
                playlistDesiredOffset = null;
                document.getElementById('playlist-counter').textContent = `${idx + 1} / ${playlistEntries.length}`;
                document.getElementById('playlist-title').textContent = entry.title || '';
                const playlistVideoId = entry.video_id || entry.videoId;
                document.getElementById('playlist-favorite-action').innerHTML = playlistVideoId ? starBtnHtml('video', playlistVideoId) : '';
                document.getElementById('playlist-delete-action').innerHTML = playlistVideoId ? previewDeleteButton('video', playlistVideoId, entry.title || String(playlistVideoId), false) : '';
                document.getElementById('playlist-bottom').style.display = '';
                updatePlaylistProgress();

                playlistCheckEnd = function() {
                    updatePlaylistProgress();
                    const endThreshold = entry.start + entry.duration - 0.3;
                    if (video.currentTime >= endThreshold) {
                        if (playlistLoopOn) {
                            video.currentTime = entry.start;
                        } else {
                            playEntry(idx + 1);
                        }
                    }
                    if (playlistLoopOn && (video.currentTime < entry.start - 0.5 || video.currentTime > entry.start + entry.duration + 1)) {
                        togglePlaylistLoop(false);
                    }
                };

                video.onerror = () => {
                    clearTimeout(playlistSeekTimer);
                    notify('视频加载失败，跳过: ' + (entry.title || ''), 'error');
                    playEntry(idx + 1);
                };
                video.onloadedmetadata = () => {
                    video.currentTime = targetTime;
                    video.playbackRate = playlistSpeed;
                    playlistSeekTimer = setTimeout(() => {
                        if (video.paused) video.play().catch(() => {});
                    }, 3000);
                };
                video.onseeked = () => {
                    if (Math.abs(video.currentTime - targetTime) > 1 && seekRetries < 10) {
                        seekRetries++;
                        seekRetryTimer = setTimeout(() => { video.currentTime = targetTime; }, 300);
                        return;
                    }
                    clearTimeout(seekRetryTimer);
                    clearTimeout(playlistSeekTimer);
                    video.addEventListener('timeupdate', playlistCheckEnd);
                    if (video.paused) video.play().catch(() => {});
                    updatePlaylistProgress();
                };
                video.onplaying = () => {
                    clearTimeout(playlistSeekTimer);
                    if (firstPlay) {
                        firstPlay = false;
                        document.getElementById('playlist-loading').style.display = 'none';
                    }
                    document.getElementById('playlist-video').style.display = '';
                    video.addEventListener('timeupdate', playlistCheckEnd);
                    if (idx + 1 < playlistEntries.length) {
                        preloadVideo.src = playlistEntries[idx + 1].url;
                    }
                    updatePlaylistProgress();
                };

                video.src = entry.url;
            }
            playlistDoPlayEntry = playEntry;
             playlistEntries = buildPlaylistEntries(videoIds, segDur, playlistSequential);
             if (!playlistEntries.length) {
                 notify('没有可播放的视频', 'error');
                 closePlaylistViewer(null);
                 return;
             }
             resumeIdx = Math.max(0, Math.min(resumeIdx, playlistEntries.length - 1));
             playEntry(resumeIdx);
             return;

            try {
                const resp = await fetch(`${API_BASE}/videos/stream-playlist`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ video_ids: videoIds, segment_duration: segDur, start_mode: 'random' }),
                    signal: playlistAbortController.signal,
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
                    notify('连播失败: ' + (err.message || err.detail || '服务端错误'), 'error');
                    viewer.classList.add('hidden');
                    return;
                }
                const data = await resp.json();
                playlistEntries = data.entries || [];
                if (!playlistEntries.length) {
                    notify('没有可播放的视频', 'error');
                    viewer.classList.add('hidden');
                    return;
                }
                playEntry(resumeIdx);
            } catch (e) {
                if (e.name === 'AbortError') return;
                notify('连播请求失败: ' + e.message, 'error');
                viewer.classList.add('hidden');
            }
        }
        // ============ Grid Playback ============
        var gridPlayAllVideos = [];
        var gridPlayGroups = [];
        var gridPlayGroupIdx = 0;
        var gridPlayControlStates = Object.create(null);
            gridExpandedVideoId = null;
        var gridPlayRenderToken = 0;
        var gridPlayStateKeyCounter = 0;
        function resolveVideoUrl(v) {
            return `${API_BASE}/videos/${v.id}/play`;
        }
        function getVideoAspectRatio(v) {
            var res = v.original_resolution || '1920x1080';
            var parts = res.split('x');
            if (parts.length === 2) {
                var w = parseInt(parts[0]) || 0;
                var h = parseInt(parts[1]) || 0;
                if (w > 0 && h > 0) return w / h;
            }
            return 16 / 9;
        }
        function calcGridLayout(ars) {
            var n = ars.length;
            if (n === 0) return { columns: '1fr', rows: '1fr', cells: [] };
            if (n === 1) return { columns: '1fr', rows: '1fr', cells: [{ r: 1, c: 1 }] };
            var totalAR = ars.reduce(function(a, b) { return a + b; }, 0);
            if (n === 2) {
                var cols = ars.map(function(a) { return (a / totalAR * 100).toFixed(1) + '%'; }).join(' ');
                return { columns: cols, rows: '1fr', cells: [{ r: 1, c: 1 }, { r: 1, c: 2 }] };
            }
            if (n === 3) {
                var minPct = Math.min.apply(null, ars) / totalAR;
                if (minPct < 0.30) {
                    var pairs = [
                        { diff: Math.abs(ars[0] - ars[1]), i0: 0, i1: 1, i2: 2 },
                        { diff: Math.abs(ars[0] - ars[2]), i0: 0, i1: 2, i2: 1 },
                        { diff: Math.abs(ars[1] - ars[2]), i0: 1, i1: 2, i2: 0 }
                    ];
                    pairs.sort(function(a, b) { return a.diff - b.diff; });
                    var best = pairs[0];
                    var i0 = best.i0, i1 = best.i1, i2 = best.i2;
                    var a0 = ars[i0], a1 = ars[i1];
                    var topAR = a0 + a1;
                    return {
                        columns: (a0 / topAR * 100).toFixed(1) + '% ' + (a1 / topAR * 100).toFixed(1) + '%',
                        rows: '1fr 1fr',
                        cells: (function() {
                            var cells = [];
                            cells[i0] = { r: 1, c: 1 };
                            cells[i1] = { r: 1, c: 2 };
                            cells[i2] = { r: 2, c: '1/3' };
                            return cells;
                        })()
                    };
                }
                var columnWidths = ars.map(function(a) {
                    return (a / totalAR * 100).toFixed(1) + '%';
                  }).join(' ');
                return { columns: columnWidths, rows: '1fr', cells: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }] };
            }
            return { columns: '1fr 1fr', rows: '1fr 1fr', cells: [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 2, c: 1 }, { r: 2, c: 2 }] };
        }
        function scoreGroup(videoInfos, start, count) {
            var ars = [];
            for (var j = start; j < start + count; j++) ars.push(videoInfos[j].aspectRatio);
            var screenAR = 16 / 9;
            if (count === 2) {
                var ratio = ars[0] + ars[1];
                return ratio > screenAR ? screenAR / ratio : ratio / screenAR;
            }
            if (count === 3) {
                var combined3 = ars[0] + ars[1] + ars[2];
                var minPct3 = Math.min.apply(null, ars) / combined3;
                if (minPct3 < 0.30) {
                    var pairs = [
                        { diff: Math.abs(ars[0] - ars[1]), ars: [ars[0], ars[1], ars[2]] },
                        { diff: Math.abs(ars[0] - ars[2]), ars: [ars[0], ars[2], ars[1]] },
                        { diff: Math.abs(ars[1] - ars[2]), ars: [ars[1], ars[2], ars[0]] }
                    ];
                    pairs.sort(function(a, b) { return a.diff - b.diff; });
                    var best = pairs[0];
                    var topAR = best.ars[0] + best.ars[1];
                    var topScore = topAR > screenAR ? screenAR / topAR : topAR / screenAR;
                    var botScore = best.ars[2] > screenAR ? screenAR / best.ars[2] : best.ars[2] / screenAR;
                    return (topScore + botScore * 0.6) / 1.6;
                }
                var ratio3 = combined3;
                return ratio3 > screenAR ? screenAR / ratio3 : ratio3 / screenAR;
            }
            if (count === 4) {
                var cellAR = screenAR / 2;
                var totalScore = 0;
                for (var k = 0; k < ars.length; k++) {
                    var r = ars[k] > cellAR ? cellAR / ars[k] : ars[k] / cellAR;
                    totalScore += r;
                }
                return totalScore / 4 * 0.95;
            }
            return 0;
        }
        function buildGroups(videoInfos) {
            var groups = [];
            var i = 0;
            while (i < videoInfos.length) {
                var remaining = videoInfos.length - i;
                if (remaining === 1) {
                    if (groups.length > 0) {
                        groups[groups.length - 1] = groups[groups.length - 1].concat([videoInfos[i]]);
                    } else {
                        groups.push([videoInfos[i]]);
                    }
                    i++;
                    continue;
                }
                var sizes = [];
                for (var s = 2; s <= 4 && i + s <= videoInfos.length; s++) {
                    if (i + s === videoInfos.length - 1) continue;
                    sizes.push(s);
                }
                if (sizes.length === 0) sizes = [remaining];
                var bestSize = sizes[0];
                var bestScore = scoreGroup(videoInfos, i, bestSize);
                for (var si = 1; si < sizes.length; si++) {
                    var sc = scoreGroup(videoInfos, i, sizes[si]);
                    if (sc > bestScore) { bestScore = sc; bestSize = sizes[si]; }
                }
                groups.push(videoInfos.slice(i, i + bestSize));
                i += bestSize;
            }
            return groups;
        }
        function gridVideoCell(video) {
            return video && video.closest ? video.closest('.grid-video-cell') : null;
        }
        function gridVideoState(video) {
            var cell = gridVideoCell(video);
            var id = cell ? cell.getAttribute('data-video-id') : '';
            if (!id || id === 'undefined' || id === 'null') {
                if (cell) {
                    id = cell.getAttribute('data-grid-state-key');
                    if (!id) {
                        id = 'cell-' + (++gridPlayStateKeyCounter);
                        cell.setAttribute('data-grid-state-key', id);
                    }
                } else {
                    id = '__detached__';
                }
            }
            if (!gridPlayControlStates[id]) {
                gridPlayControlStates[id] = {
                    volume: 1,
                    muted: false,
                    playbackRate: 1,
                    currentTime: 0,
                    paused: false,
                    lastVolume: 1
                };
            }
            return gridPlayControlStates[id];
        }
        function gridApplyVideoVolume(video) {
            var state = gridVideoState(video);
            pageVolumeApply(video, state.volume);
            if (typeof gridUpdateVideoControls === 'function') gridUpdateVideoControls(video);
        }
        function gridVideoFromControl(control) {
            var cell = control && control.closest ? control.closest('.grid-video-cell') : null;
            return cell ? cell.querySelector('video') : null;
        }
        function gridUpdatePlayAllButton() {
            var button = document.getElementById('gv-play-all-btn');
            var videos = document.getElementById('grid-content').querySelectorAll('video');
            var allPlaying = videos.length > 0 && Array.prototype.every.call(videos, function(v) { return !v.paused; });
            if (button) button.textContent = allPlaying ? '⏯ 全部暂停' : '⏯ 全部播放';
        }
        function gridUpdateVideoControls(video) {
            var cell = gridVideoCell(video);
            if (!cell) return;
            var state = gridVideoState(video);
            var progress = cell.querySelector('.grid-video-progress');
            var time = cell.querySelector('.grid-video-time');
            var volume = cell.querySelector('.grid-video-volume');
            var mute = cell.querySelector('.grid-video-mute');
            var speed = cell.querySelector('.grid-video-speed');
            var duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
            var current = isFinite(video.currentTime) && video.currentTime > 0 ? video.currentTime : 0;
            if (progress) {
                var seeking = progress.dataset.seeking === 'true';
                progress.max = duration ? String(duration) : '0';
                if (!seeking) progress.value = duration ? String(Math.min(current, duration)) : '0';
                progress.disabled = !duration;
            }
            if (time) time.textContent = formatTime(current) + ' / ' + formatTime(duration);
            if (volume) volume.value = String(state.volume);
            if (mute) {
                var silent = !!state.muted || state.volume <= 0 || pageVolume <= 0;
                mute.textContent = silent ? '🔇' : '🔊';
                mute.title = silent ? '打开声音' : '静音';
                mute.setAttribute('aria-label', mute.title);
                mute.setAttribute('aria-pressed', String(silent));
            }
            if (speed) speed.value = String(video.playbackRate || 1);
            var toggle = cell.querySelector('.grid-video-toggle');
            if (toggle) {
                toggle.textContent = video.paused ? '▶' : '⏸';
                toggle.title = video.paused ? '播放此视频' : '暂停此视频';
                toggle.setAttribute('aria-label', toggle.title);
                toggle.setAttribute('aria-pressed', String(!video.paused));
            }
            gridUpdatePlayAllButton();
        }
        function gridRequestVideoPlay(video, state) {
            var requestToken = gridPlayRenderToken;
            var playPromise;
            try {
                playPromise = video.play();
            } catch (e) {
                if (requestToken === gridPlayRenderToken) {
                    state.paused = true;
                    gridUpdateVideoControls(video);
                }
                return;
            }
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(function() {
                    if (requestToken !== gridPlayRenderToken) return;
                    state.paused = true;
                    gridUpdateVideoControls(video);
                });
            }
        }
        function gridCaptureVideoState(video) {
            var state = gridVideoState(video);
            state.muted = video.muted;
            state.playbackRate = video.playbackRate || 1;
            state.currentTime = isFinite(video.currentTime) ? video.currentTime : 0;
            state.paused = video.paused;
            if (state.volume > 0) state.lastVolume = state.volume;
        }
        function gridCaptureVisibleVideoStates() {
            document.getElementById('grid-content').querySelectorAll('video').forEach(gridCaptureVideoState);
        }
        function gridBindVideoControls(video, renderToken) {
            var state = gridVideoState(video);
            var isCurrentRender = function() { return renderToken === gridPlayRenderToken; };
            video.loop = true;
            video.autoplay = false;
            gridApplyVideoVolume(video);
            video.muted = !!state.muted;
            video.playbackRate = state.playbackRate || 1;
            var restorePosition = function() {
                if (!isCurrentRender()) return;
                var duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
                if (duration && state.currentTime > 0) {
                    try {
                        video.currentTime = Math.min(state.currentTime, Math.max(0, duration - 0.05));
                    } catch (e) {}
                }
                gridUpdateVideoControls(video);
            };
            video.addEventListener('loadedmetadata', restorePosition);
            video.addEventListener('timeupdate', function() {
                if (!isCurrentRender()) return;
                var cell = gridVideoCell(video);
                var progress = cell && cell.querySelector('.grid-video-progress');
                if (!progress || progress.dataset.seeking !== 'true') {
                    state.currentTime = isFinite(video.currentTime) ? video.currentTime : 0;
                }
                gridUpdateVideoControls(video);
            });
            video.addEventListener('play', function() {
                if (!isCurrentRender()) return;
                state.paused = false;
                gridUpdateVideoControls(video);
            });
            video.addEventListener('pause', function() {
                if (!isCurrentRender()) return;
                state.paused = true;
                gridUpdateVideoControls(video);
            });
            video.addEventListener('volumechange', function() {
                if (!isCurrentRender()) return;
                if (video.dataset.rhvideoApplyingPageVolume !== 'true' && pageVolume > 0) {
                    state.volume = clampPageVolume(video.volume / pageVolume, state.volume);
                }
                state.muted = video.muted;
                if (state.volume > 0) state.lastVolume = state.volume;
                gridUpdateVideoControls(video);
            });
            video.addEventListener('ratechange', function() {
                if (!isCurrentRender()) return;
                state.playbackRate = video.playbackRate || 1;
                gridUpdateVideoControls(video);
            });
            restorePosition();
            if (state.paused) {
                video.pause();
            } else {
                gridRequestVideoPlay(video, state);
            }
        }
        function gridToggleVideo(button) {
            var video = gridVideoFromControl(button);
            if (!video) return;
            var state = gridVideoState(video);
            if (video.paused) {
                gridRequestVideoPlay(video, state);
            } else {
                video.pause();
            }
        }
        function gridSeekVideo(input) {
            var video = gridVideoFromControl(input);
            if (!video) return;
            var duration = video.duration;
            if (!isFinite(duration) || duration <= 0 || video.readyState < 1) return;
            var value = parseFloat(input.value);
            if (!isFinite(value)) return;
            value = Math.min(duration, Math.max(0, value));
            input.dataset.seeking = 'true';
            try {
                video.currentTime = value;
            } catch (e) {
                delete input.dataset.seeking;
                return;
            }
            var state = gridVideoState(video);
            state.currentTime = value;
            gridUpdateVideoControls(video);
        }
        function gridFinishVideoSeek(input) {
            var video = gridVideoFromControl(input);
            if (!video) return;
            var duration = video.duration;
            var value = parseFloat(input.value);
            if (isFinite(duration) && duration > 0 && isFinite(value)) {
                gridVideoState(video).currentTime = Math.min(duration, Math.max(0, value));
            }
            delete input.dataset.seeking;
            gridUpdateVideoControls(video);
        }
        function gridSetVideoVolume(input) {
            var video = gridVideoFromControl(input);
            if (!video) return;
            var value = parseFloat(input.value);
            if (!isFinite(value)) return;
            var state = gridVideoState(video);
            state.volume = Math.min(1, Math.max(0, value));
            if (state.volume > 0 && state.muted) state.muted = false;
            if (state.volume > 0) state.lastVolume = state.volume;
            gridApplyVideoVolume(video);
            video.muted = !!state.muted;
            gridUpdateVideoControls(video);
        }
        function gridToggleVideoMute(button) {
            var video = gridVideoFromControl(button);
            if (!video) return;
            var state = gridVideoState(video);
            if (state.muted || state.volume <= 0) {
                state.volume = state.lastVolume > 0 ? state.lastVolume : 0.5;
                state.muted = false;
            } else {
                state.lastVolume = state.volume;
                state.muted = true;
            }
            gridApplyVideoVolume(video);
            video.muted = !!state.muted;
            gridUpdateVideoControls(video);
        }
        function gridChangeVideoSpeed(select) {
            var video = gridVideoFromControl(select);
            if (!video) return;
            var value = parseFloat(select.value);
            if (!isFinite(value) || value <= 0) return;
            video.playbackRate = value;
            gridVideoState(video).playbackRate = value;
            gridUpdateVideoControls(video);
        }
        async function startGridPlay() {
            if (gridRefreshPending) await loadGrid();
            var seen = {};
            var videoIds = [];
            for (var i = 0; i < gridMedia.length; i++) {
                var m = gridMedia[i];
                if (m.videoId && !seen[m.videoId]) {
                    seen[m.videoId] = true;
                    videoIds.push(m.videoId);
                }
            }
            if (videoIds.length < 2) { notify('需要至少 2 个视频才能网格播放', 'error'); return; }
            var allInfos = [];
            for (var j = 0; j < videoIds.length; j++) {
                var v = allVideos.find(function(x) { return x.id === videoIds[j]; });
                if (!v) continue;
                allInfos.push({
                    id: v.id,
                    url: resolveVideoUrl(v),
                    title: (v.folder_label ? '[' + v.folder_label + '] ' : '') + v.original_filename,
                    aspectRatio: getVideoAspectRatio(v)
                });
            }
            if (allInfos.length < 2) { notify('未能解析到足够的视频', 'error'); return; }
            gridPlayControlStates = Object.create(null);
            gridExpandedVideoId = null;
            gridPlayAllVideos = allInfos;
            gridPlayGroups = buildGroups(allInfos);
            gridPlayGroupIdx = restoreGridPlayGroup();
            var viewer = document.getElementById('grid-viewer');
            viewer.classList.remove('hidden');
            document.addEventListener('keydown', gridKeyHandler);
            viewer.addEventListener('wheel', gridWheelHandler, { passive: false });
            viewer.addEventListener('touchstart', gridTouchStart);
            viewer.addEventListener('touchend', gridTouchEnd);
            renderGridPlayGroup();
        }
        function currentGridGroupIds() {
            var group = gridPlayGroups[gridPlayGroupIdx];
            return group ? group.map(function(x) { return x.id; }) : [];
        }
        function saveGridPlayState() {
            if (!gridPlayGroups.length) return;
            var ids = currentGridGroupIds();
            if (!ids.length) return;
            try {
                RHVideoHost.storage.setItem('rhvideo_gridplay_' + (token || ''), JSON.stringify({
                    groupIds: ids,
                    allIds: gridPlayAllVideos.map(function(x) { return x.id; })
                }));
            } catch(e) {}
        }
        function restoreGridPlayGroup() {
            try {
                var raw = RHVideoHost.storage.getItem('rhvideo_gridplay_' + (token || ''));
                if (!raw) return 0;
                var saved = JSON.parse(raw);
                if (saved && saved.groupIds && saved.groupIds.length) {
                    for (var g = 0; g < gridPlayGroups.length; g++) {
                        var ids = gridPlayGroups[g].map(function(x) { return x.id; });
                        if (ids.length === saved.groupIds.length && ids.every(function(id, i) { return id === saved.groupIds[i]; })) {
                            return g;
                        }
                    }
                }
            } catch(e) {}
            return 0;
        }
        function renderGridPlayGroup() {
            var group = gridPlayGroups[gridPlayGroupIdx];
            if (!group || !group.length) return;
            var renderToken = ++gridPlayRenderToken;
            var layout = calcGridLayout(group.map(function(x) { return x.aspectRatio; }));
            var content = document.getElementById('grid-content');
            content.style.gridTemplateColumns = layout.columns;
            content.style.gridTemplateRows = layout.rows;
            var html = '';
            for (var k = 0; k < group.length; k++) {
                var cell = layout.cells[k];
                if (!cell) break;
                var item = group[k];
                var safeId = favEsc(item.id);
                var safeTitle = favEsc(item.title || '');
                html += `<div style="grid-row:${cell.r};grid-column:${cell.c}"><div class="grid-video-cell" data-video-id="${safeId}" data-rh-dblclick="h246" data-rh-a-h246="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-touchend="h247" data-rh-a-h247="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}"><div class="grid-video-cell-actions" data-rh-mousedown="h248" data-rh-a-h248="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-pointerdown="h249" data-rh-a-h249="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-pointerup="h250" data-rh-a-h250="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-touchstart="h251" data-rh-a-h251="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-touchend="h252" data-rh-a-h252="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-wheel="h253" data-rh-a-h253="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-click="h254" data-rh-a-h254="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}">${starBtnHtml('video', item.id)}${previewDeleteButton('video', item.id, item.title, true)}<button type="button" class="grid-cell-expand-btn" data-rh-click="h255" data-rh-a-h255="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" title="临时全屏" aria-label="临时全屏">⤢</button></div><div class="grid-video-label" title="${safeTitle}">${safeTitle}</div><video class="grid-play-video" src="${favEsc(group[k].url)}" playsinline loop preload="metadata"></video><div class="grid-video-controls" data-rh-mousedown="h256" data-rh-a-h256="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-pointerdown="h257" data-rh-a-h257="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-pointerup="h258" data-rh-a-h258="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-touchstart="h259" data-rh-a-h259="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-touchend="h260" data-rh-a-h260="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-wheel="h261" data-rh-a-h261="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-click="h262" data-rh-a-h262="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}"><button type="button" class="grid-video-toggle" data-rh-click="h263" data-rh-a-h263="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" title="暂停此视频" aria-label="暂停此视频" aria-pressed="false">⏸</button><input class="grid-video-progress" type="range" min="0" max="0" value="0" step="0.1" data-rh-input="h264" data-rh-a-h264="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" data-rh-change="h265" data-rh-a-h265="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" aria-label="播放进度" title="播放进度"><span class="grid-video-time">0:00 / 0:00</span><span class="grid-video-volume-wrap"><button type="button" class="grid-video-mute" data-rh-click="h266" data-rh-a-h266="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" title="静音" aria-label="静音" aria-pressed="false">🔊</button><input class="grid-video-volume" type="range" min="0" max="1" value="1" step="0.01" data-rh-input="h267" data-rh-a-h267="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" aria-label="音量" title="音量"></span><select class="grid-video-speed" data-rh-change="h268" data-rh-a-h268="${RHVideoBindings.encode([null,null,null,null,null,null,null,null])}" aria-label="播放速度" title="播放速度"><option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></div></div></div></div>`;
            }
            content.innerHTML = html;
             updatePreviewDeleteUi();
             gridRestoreExpandedCell();
            var titles = group.map(function(x) { return x.title; }).join('  |  ');
            document.getElementById('grid-title').textContent = group.length + ' 个: ' + titles;
                                     document.getElementById('grid-counter').textContent = '第 ' + (gridPlayGroupIdx + 1) + '/' + gridPlayGroups.length + ' 组 (' + gridPlayAllVideos.length + '个)';
            document.getElementById('grid-nav-prev').style.display = gridPlayGroupIdx > 0 ? '' : 'none';
            document.getElementById('grid-nav-next').style.display = gridPlayGroupIdx < gridPlayGroups.length - 1 ? '' : 'none';
            content.querySelectorAll('video').forEach(function(v) { gridBindVideoControls(v, renderToken); });
            gridUpdatePlayAllButton();
            updateGridProgress();
        }
        function gridPlayNav(delta) {
            gridCaptureVisibleVideoStates();
            gridPlayRenderToken++;
            var content = document.getElementById('grid-content');
            var videos = content.querySelectorAll('video');
            videos.forEach(function(v) { v.pause(); v.src = ''; });
            content.innerHTML = '';
            gridPlayGroupIdx += delta;
            if (gridPlayGroupIdx < 0) gridPlayGroupIdx = 0;
            if (gridPlayGroupIdx >= gridPlayGroups.length) gridPlayGroupIdx = gridPlayGroups.length - 1;
            saveGridPlayState();
            renderGridPlayGroup();
        }
        // ---- 临时全屏单个视频 ----
        var gridExpandedVideoId = null;
        var gridLastTapAt = 0;
        var gridLastTapX = 0;
        var gridLastTapY = 0;
        var gridTapToggleAt = 0;

        function gridSetCellExpandUi(cell, expanded) {
            if (!cell) return;
            cell.classList.toggle('grid-cell-expanded', !!expanded);
            var btn = cell.querySelector('.grid-cell-expand-btn');
            if (btn) {
                btn.textContent = expanded ? '⤡' : '⤢';
                btn.title = expanded ? '缩回网格' : '临时全屏';
                btn.setAttribute('aria-label', btn.title);
            }
        }

        function gridShrinkExpandedCell() {
            var had = !!gridExpandedVideoId;
            var cell = document.querySelector('#grid-content .grid-video-cell.grid-cell-expanded');
            if (cell) gridSetCellExpandUi(cell, false);
            gridExpandedVideoId = null;
            return had;
        }

        function gridToggleCellExpandCell(cell) {
            if (!cell) return;
            if (cell.classList.contains('grid-cell-expanded')) {
                gridExpandedVideoId = null;
                gridSetCellExpandUi(cell, false);
                return;
            }
            gridShrinkExpandedCell();
            gridExpandedVideoId = cell.getAttribute('data-video-id') || null;
            gridSetCellExpandUi(cell, true);
            var video = cell.querySelector('video');
            if (video && video.paused) gridRequestVideoPlay(video, gridVideoState(video));
        }

        function gridToggleCellExpand(btn) {
            gridToggleCellExpandCell(btn && btn.closest ? btn.closest('.grid-video-cell') : null);
        }

        function gridCellDblClick(cell, event) {
            if (event && event.target && event.target.closest && event.target.closest('.grid-video-controls, .grid-video-cell-actions')) return;
            if (Date.now() - gridTapToggleAt < 500) return;
            gridToggleCellExpandCell(cell);
        }

        function gridCellTouchTap(event) {
            if (!event || !event.target || !event.target.closest || event.target.closest('.grid-video-controls, .grid-video-cell-actions')) return;
            var touch = event.changedTouches && event.changedTouches[0];
            if (!touch) return;
            var x = touch.clientX, y = touch.clientY;
            var now = Date.now();
            if (now - gridLastTapAt < 320 && Math.abs(x - gridLastTapX) < 60 && Math.abs(y - gridLastTapY) < 60) {
                gridLastTapAt = 0;
                gridTapToggleAt = now;
                gridToggleCellExpandCell(event.target.closest('.grid-video-cell'));
                return;
            }
            gridLastTapAt = now;
            gridLastTapX = x;
            gridLastTapY = y;
        }

        function gridRestoreExpandedCell() {
            if (!gridExpandedVideoId) return;
            var cells = document.querySelectorAll('#grid-content .grid-video-cell');
            for (var i = 0; i < cells.length; i++) {
                if (cells[i].getAttribute('data-video-id') === gridExpandedVideoId) {
                    gridSetCellExpandUi(cells[i], true);
                    return;
                }
            }
            gridExpandedVideoId = null;
        }

        var gridTouchStartX = 0;
        var gridTouchStartY = 0;
        var gridTouchOnControls = false;
        function gridTouchStart(e) {
            var target = e.target;
            gridTouchOnControls = !!(target && target.closest && target.closest('.grid-video-controls, .grid-video-cell-actions'));
            gridTouchStartX = e.touches[0].clientX;
            gridTouchStartY = e.touches[0].clientY;
        }
        function gridTouchEnd(e) {
            if (gridTouchOnControls) {
                gridTouchOnControls = false;
                return;
            }
            var dx = e.changedTouches[0].clientX - gridTouchStartX;
            var dy = e.changedTouches[0].clientY - gridTouchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                gridPlayNav(dx < 0 ? 1 : -1);
            } else if (Math.abs(dy) > 40) {
                if (dy < 0) toggleGridPlayAll();
            }
        }
        function gridKeyHandler(e) {
            if (document.getElementById('grid-viewer').classList.contains('hidden')) return;
            var target = e.target;
            if (target && target.closest && target.closest('.grid-video-controls, .grid-video-cell-actions') && e.key !== 'Escape') return;
            if (e.key === 'Escape') { e.preventDefault(); if (!gridShrinkExpandedCell()) closeGridViewer(null); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); gridPlayNav(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); gridPlayNav(1); }
            else if (e.key === ' ') { e.preventDefault(); toggleGridPlayAll(); }
            else if (e.key === 'Home') { e.preventDefault(); gridProgressCommit({ value: '0' }); }
            else if (e.key === 'End') { e.preventDefault(); gridProgressCommit({ value: '1000' }); }
        }
        function gridWheelHandler(e) {
            if (document.getElementById('grid-viewer').classList.contains('hidden')) return;
            var target = e.target;
            if (target && target.closest && target.closest('.grid-video-controls, .grid-video-cell-actions')) return;
            e.preventDefault();
            if (e.deltaX !== 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                gridPlayNav(e.deltaX > 0 ? 1 : -1);
            } else {
                gridPlayNav(e.deltaY > 0 ? 1 : -1);
            }
        }
        function toggleGridPlayAll() {
            var content = document.getElementById('grid-content');
            var videos = content.querySelectorAll('video');
            var allPlaying = true;
            videos.forEach(function(v) { if (v.paused) allPlaying = false; });
            videos.forEach(function(v) {
                var state = gridVideoState(v);
                if (allPlaying) {
                    state.paused = true;
                    v.pause();
                } else {
                    gridRequestVideoPlay(v, state);
                }
            });
            gridUpdatePlayAllButton();
        }
        function closeGridViewer(event) {
            if (event && event.target !== document.getElementById('grid-viewer')) return;
            gridCaptureVisibleVideoStates();
            saveGridPlayState();
            gridPlayRenderToken++;
            var content = document.getElementById('grid-content');
            var videos = content.querySelectorAll('video');
            videos.forEach(function(v) { v.pause(); v.src = ''; });
            content.innerHTML = '';
            gridPlayAllVideos = [];
            gridPlayGroups = [];
            gridPlayGroupIdx = 0;
            gridPlayControlStates = Object.create(null);
            gridExpandedVideoId = null;
            document.getElementById('grid-favorite-actions').innerHTML = '';
            var viewer = document.getElementById('grid-viewer');
            viewer.classList.add('hidden');
            flushFavoritesRefresh();
            document.removeEventListener('keydown', gridKeyHandler);
            viewer.removeEventListener('wheel', gridWheelHandler, { passive: false });
            viewer.removeEventListener('touchstart', gridTouchStart);
            viewer.removeEventListener('touchend', gridTouchEnd);
             startPreviewDeleteExecution();

        }

        // ---- Grid play progress bar ----
        function updateGridProgress() {
            const bar = document.getElementById('grid-progress');
            const lbl = document.getElementById('grid-progress-label');
            if (!bar || !gridPlayGroups.length) return;
            if (document.activeElement === bar) return;
            const total = gridPlayGroups.length;
            if (total <= 1) { bar.value = '0'; lbl.textContent = '第 1/1 组 (' + gridPlayAllVideos.length + ' 个视频)'; return; }
            bar.value = String(Math.round(gridPlayGroupIdx / (total - 1) * 1000) || 0);
            lbl.textContent = '第 ' + (gridPlayGroupIdx + 1) + '/' + total + ' 组 (' + gridPlayAllVideos.length + ' 个视频)';
        }
        function gridProgressInput(el) {
            const n = gridPlayGroups.length;
            if (!n) return;
            const frac = parseFloat(el.value) / 1000;
            const target = Math.round(frac * Math.max(0, n - 1));
            const lbl = document.getElementById('grid-progress-label');
            if (lbl) lbl.textContent = '第 ' + (target + 1) + '/' + n + ' 组';
        }
        function gridProgressCommit(el) {
            const n = gridPlayGroups.length;
            if (!n) return;
            const frac = parseFloat(el.value) / 1000;
            const target = Math.round(frac * (n - 1));
            if (target !== gridPlayGroupIdx) {
                gridPlayNav(target - gridPlayGroupIdx);
            }
        }

        // ============ Novels (小说) ============
        function novelCoverHue(title) {
            let h = 0;
            for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
            return 218 + (h % 36);
        }
        function novelWan(n) {
            const w = Number(n) || 0;
            return w >= 10000 ? (w / 10000).toFixed(1) + '万字' : w + '字';
        }
        function novelRelativeTime(iso) {
            if (!iso) return '';
            const diff = Date.now() - new Date(iso).getTime();
            if (diff < 0) return '';
            const m = Math.floor(diff / 60000);
            if (m < 1) return '刚刚';
            if (m < 60) return m + ' 分钟前';
            const h = Math.floor(m / 60);
            if (h < 24) return h + ' 小时前';
            const d = Math.floor(h / 24);
            if (d < 30) return d + ' 天前';
            return new Date(iso).toLocaleDateString();
        }

        function openNovelTagDrawer() { openGridTagDrawer('novels'); }
        function closeNovelTagDrawer() { closeGridTagDrawer(); }
        function renderNovelTagDrawer() { return renderGridTagDrawer(); }
        function renderNovelTagTabs() {
            renderGridTagTabs();
            if (mediaTagDrawerSource === 'novels' && document.getElementById('grid-tag-drawer').classList.contains('open')) renderGridTagDrawer();
        }
        function selectNovelTag(label) {
            updateMediaTagFilter({ include: label ? [label] : [] });
            closeGridTagDrawer();
        }

        function loadNovels(showLoader) {
            if (novelsLoadPromise) return novelsLoadPromise;
            novelsLoadPromise = loadNovelIndex(showLoader).finally(() => { novelsLoadPromise = null; });
            return novelsLoadPromise;
        }
        async function loadNovelIndex(showLoader) {
            const loader = document.getElementById('novel-loader');
            if (showLoader !== false) loader.classList.remove('hidden');
            try {
                const data = await fetchLibraryIndex(`${API_BASE}/novels?summary=true`);
                if (data === novelsLoadedData) return;
                allNovels = data.items || [];
                document.getElementById('novel-count').textContent = allNovels.length ? `(${allNovels.length})` : '';
                renderNovels();
                renderNovelTagTabs();
                novelsLoadedData = data;
                novelsLoaded = true;
            } catch (e) {
                document.getElementById('novel-grid').innerHTML = `<p class="empty">加载失败: ${favEsc(e.message)}</p>`;
            } finally {
                loader.classList.add('hidden');
            }
        }

        async function renderNovels() {
            const ticket = nextSearchRender('novels');
            const grid = document.getElementById('novel-grid');
            const q = (document.getElementById('novel-search')?.value || '').toLowerCase();
            let books = allNovels;
            if (q) books = await searchCatalog('novels', books, ['title', 'folder_label'], q);
            if (ticket !== searchRenderTickets.get('novels')) return;
            const matchTags = RHTagFilter.compile(mediaTagFilter);
            books = books.filter(book => matchTags(book.folder_label));
            document.getElementById('novel-count').textContent = `(${books.length} / ${allNovels.length})`;
            const filter = JSON.stringify([q, RHTagFilter.key(mediaTagFilter)]);
            if (filter !== novelRenderFilter) { novelPage = 1; novelRenderFilter = filter; }
            const totalPages = Math.ceil(books.length / novelPageSize) || 1;
            novelPage = Math.max(1, Math.min(novelPage, totalPages));
            document.getElementById('novel-page-info').textContent = `第 ${novelPage}/${totalPages} 页（共 ${books.length} 本）`;
            document.getElementById('novel-prev').disabled = novelPage <= 1;
            document.getElementById('novel-next').disabled = novelPage >= totalPages;
            if (!books.length) {
                grid.innerHTML = `<p class="empty" style="grid-column:1/-1">${q || RHTagFilter.active(mediaTagFilter) ? '没有符合当前搜索或标签条件的小说，可调整或清除筛选。' : '暂无小说。把 .txt 文件放进监控文件夹即可自动入库。'}</p>`;
                return;
            }
            grid.innerHTML = books.slice((novelPage - 1) * novelPageSize, novelPage * novelPageSize).map(b => {
                const hue = novelCoverHue(b.title || '');
                const id = String(b.id);
                const failed = b.status === 'failed';
                const pct = b.progress && b.progress.percent != null ? b.progress.percent : null;
                const lastRead = b.progress && b.progress.updated_at ? novelRelativeTime(b.progress.updated_at) : null;
                const metaBits = [novelWan(b.word_count), b.chapter_count ? b.chapter_count + '章' : null, lastRead ? lastRead + '读过' : null].filter(Boolean);
                return `<div class="novel-card" data-rh-click="h244" data-rh-a-h244="${RHVideoBindings.encode([id,null,null,null,null,null,null,null,null,null,null,null])}">
                    <div class="novel-cover" style="background:linear-gradient(150deg, hsl(${hue},38%,65%), hsl(${hue+24},35%,46%))">
                        <span class="cover-spine"></span>
                        <div class="cover-char">${favEsc((b.title||'?').slice(0,4))}</div>
                        ${failed ? '' : (pct != null && pct > 0 ? `<span class="continue-badge">${pct >= 99.5 ? '已读完' : '继续 ' + pct + '%'}</span>` : '<span class="continue-badge" style="background:rgba(102,126,234,0.95)">开始阅读</span>')}
                    </div>
                    ${starBtnHtml('novel', id)}
                    <button class="pic-stage-delete" data-rh-click="h245" data-rh-a-h245="${RHVideoBindings.encode([null,null,null,null,null,null,id,null,null,null,null,null])}" title="删除源文件并暂存30天">&times;</button>
                    <div class="novel-info">
                        <div class="n-title" title="${favEsc(b.title)}">${favEsc(b.title)}</div>
                        ${failed ? `<div class="n-err" title="${favEsc(b.error_message||'')}">⚠ ${favEsc(b.error_message||'解析失败')}</div>` : `<div class="n-meta">${metaBits.join(' · ')}</div>`}
                        ${(!failed && pct != null) ? `<div class="novel-progress"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}
                        ${!failed ? `<div class="novel-card-actions"><button class="n-preview-btn" data-rh-click="h243" data-rh-a-h243="${RHVideoBindings.encode([id])}" title="快速浏览章节摘录">速览</button></div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        function requestStageDeleteNovel(id) {
            const book = allNovels.find(n => String(n.id) === String(id));
            beginStageDelete('novel', id, book ? book.title + '.txt' : '小说');
        }
        function changeNovelPage(delta) { novelPage += delta; renderNovels(); }

        // ---- 小说速览：章节列表 + 连续试读 ----
        function novelPreviewStatus(index) {
            const progress = nvPreviewBook && nvPreviewBook.progress;
            if (!progress || progress.chapter_index == null) return '';
            const current = Number(progress.chapter_index);
            if (index < current || (index === current && Number(progress.scroll_ratio || 0) >= 0.98)) return '已读';
            if (index === current) return '当前';
            return '未读';
        }

        async function novelPreviewBookList() {
            const shelfSearch = (document.getElementById('novel-search')?.value || '').trim().toLowerCase();
            const books = shelfSearch ? await searchCatalog('novels', allNovels, ['title', 'folder_label'], shelfSearch) : allNovels;
            const matchTags = RHTagFilter.compile(mediaTagFilter);
            return books.filter(book => {
                if (book.status !== 'active' || !Number(book.chapter_count)) return false;
                if (!matchTags(book.folder_label)) return false;
                return true;
            });
        }

        function novelPreviewRefreshBookNav() {
            const total = nvPreviewBooks.length;
            const position = document.getElementById('nvp-book-position');
            const previous = document.getElementById('nvp-book-prev');
            const next = document.getElementById('nvp-book-next');
            const valid = nvPreviewBookIndex >= 0 && nvPreviewBookIndex < total;
            position.textContent = valid ? `${nvPreviewBookIndex + 1} / ${total}` : '';
            previous.disabled = !valid || nvPreviewBookIndex <= 0;
            next.disabled = !valid || nvPreviewBookIndex >= total - 1;
        }

        async function novelPreviewNavigateBook(delta) {
            if (nvPreviewLoading) return;
            const books = nvPreviewBooks.length ? nvPreviewBooks : await novelPreviewBookList();
            if (!books.length) return;
            let current = nvPreviewBookIndex;
            if (current < 0 && nvPreviewBook) {
                current = books.findIndex(book => String(book.id) === String(nvPreviewBook.id));
            }
            const target = current + delta;
            if (current < 0 || target < 0 || target >= books.length) return;
            openNovelPreview(books[target].id, true);
        }

        async function openNovelPreview(id, keepMode) {
            const requestId = ++nvPreviewRequest;
            const previewMode = keepMode ? nvPreviewMode : 'list';
            const books = await novelPreviewBookList();
            if (requestId !== nvPreviewRequest) return;
            nvPreviewBooks = books;
            nvPreviewBookIndex = nvPreviewBooks.findIndex(book => String(book.id) === String(id));
            if (nvPreviewBookIndex < 0) {
                const matchTags = RHTagFilter.compile(mediaTagFilter);
                nvPreviewBooks = allNovels.filter(book => book.status === 'active' && Number(book.chapter_count) && matchTags(book.folder_label));
                nvPreviewBookIndex = nvPreviewBooks.findIndex(book => String(book.id) === String(id));
            }
            novelPreviewRefreshBookNav();
            const overlay = document.getElementById('novel-preview');
            overlay.classList.remove('hidden');
            nvPreviewBook = null;
            nvPreviewItems = [];
            nvPreviewTotal = 0;
            nvPreviewFlowIndex = 0;
            nvPreviewMode = previewMode;
            document.getElementById('nvp-search').value = '';
            document.getElementById('nvp-book-title').textContent = '正在加载...';
            document.getElementById('nvp-book-meta').textContent = '';
            document.getElementById('nvp-list').innerHTML = '<div class="nv-loading"><span class="spinner"></span> 正在读取章节摘录...</div>';
            document.getElementById('nvp-list-footer').innerHTML = '';
            setNovelPreviewMode(previewMode);
            try {
                const res = await fetch(`${API_BASE}/novels/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
                if (requestId !== nvPreviewRequest) return;
                nvPreviewBook = data;
                document.getElementById('nvp-book-title').textContent = data.title || '小说速览';
                document.getElementById('nvp-book-meta').textContent = `${novelWan(data.word_count)} · ${data.chapter_count}章`;
                await loadNovelPreviewPage(true, requestId);
                if (previewMode === 'flow' && data.progress && data.progress.chapter_index != null) {
                    nvPreviewFlowIndex = Math.max(0, Math.min(Number(data.progress.chapter_index), nvPreviewItems.length - 1));
                    renderNovelPreviewFlow();
                }
            } catch (e) {
                if (requestId !== nvPreviewRequest) return;
                document.getElementById('nvp-list').innerHTML = `<div class="nv-loading">加载失败：${favEsc(e.message)}</div>`;
            }
        }

        async function loadNovelPreviewPage(reset, requestId) {
            if (nvPreviewLoading || !nvPreviewBook) return;
            const currentRequest = requestId == null ? nvPreviewRequest : requestId;
            const skip = reset ? 0 : nvPreviewItems.length;
            nvPreviewLoading = true;
            if (reset) {
                nvPreviewItems = [];
                nvPreviewTotal = 0;
                document.getElementById('nvp-list').innerHTML = '<div class="nv-loading"><span class="spinner"></span> 正在读取章节摘录...</div>';
            } else {
                document.getElementById('nvp-list-footer').textContent = '正在加载更多章节...';
            }
            try {
                const res = await fetch(`${API_BASE}/novels/${nvPreviewBook.id}/previews?skip=${skip}&limit=300&preview_chars=720`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
                if (currentRequest !== nvPreviewRequest) return;
                if (reset) nvPreviewItems = [];
                nvPreviewItems.push(...(data.items || []));
                nvPreviewTotal = Number(data.total || nvPreviewItems.length);
                if (reset) nvPreviewFlowIndex = 0;
                renderNovelPreviewList();
                if (nvPreviewMode === 'flow') renderNovelPreviewFlow();
            } catch (e) {
                if (currentRequest === nvPreviewRequest) {
                    document.getElementById('nvp-list-footer').innerHTML = `<span style="color:#b91c1c">摘录加载失败：${favEsc(e.message)}</span>`;
                }
            } finally {
                nvPreviewLoading = false;
            }
        }

        async function renderNovelPreviewList() {
            const ticket = nextSearchRender('novel-excerpts');
            const list = document.getElementById('nvp-list');
            const footer = document.getElementById('nvp-list-footer');
            const intro = document.getElementById('nvp-list-intro');
            const q = (document.getElementById('nvp-search').value || '').trim().toLowerCase();
            const items = q ? await searchCatalog('novel-excerpts', nvPreviewItems, ['title', 'preview'], q) : nvPreviewItems;
            if (ticket !== searchRenderTickets.get('novel-excerpts')) return;
            intro.textContent = nvPreviewBook
                ? `${nvPreviewTotal || nvPreviewItems.length} 章 · 显示每章开头摘录 · 点击任意章节进入完整阅读`
                : '';
            if (!items.length) {
                list.innerHTML = nvPreviewLoading
                    ? '<div class="nv-loading"><span class="spinner"></span> 正在读取章节摘录...</div>'
                    : '<div class="nv-loading">没有匹配的章节</div>';
            } else {
                list.innerHTML = items.map(item => {
                    const status = novelPreviewStatus(item.index);
                    const meta = [item.word_count ? novelWan(item.word_count) : '', status].filter(Boolean).join(' · ');
                    return `<div class="nvp-row ${item.index === (nvPreviewBook && nvPreviewBook.progress ? nvPreviewBook.progress.chapter_index : -1) ? 'current' : ''}" data-rh-click="h242" data-rh-a-h242="${RHVideoBindings.encode([null,item.index,null,null,null,null,null])}">
                        <div class="nvp-row-index">${item.index + 1}</div>
                        <div style="min-width:0">
                            <div class="nvp-row-title">${favEsc(item.title || `第${item.index + 1}章`)}</div>
                            <div class="nvp-excerpt">${favEsc(item.preview || '暂无可预览内容')}</div>
                        </div>
                        <div class="nvp-row-meta"><span class="${status === '已读' || status === '当前' ? 'read' : ''}">${favEsc(meta || '未读')}</span><br><span>打开阅读 ›</span></div>
                    </div>`;
                }).join('');
            }
            if (nvPreviewItems.length < nvPreviewTotal) {
                footer.innerHTML = `<button data-rh-click="h241" data-rh-a-h241="${RHVideoBindings.encode([null,null])}">加载更多（已加载 ${nvPreviewItems.length} / ${nvPreviewTotal}）</button>`;
            } else if (nvPreviewTotal) {
                footer.textContent = q ? `当前显示 ${items.length} 章匹配结果` : `已加载全部 ${nvPreviewTotal} 章`;
            } else {
                footer.textContent = '';
            }
        }

        function setNovelPreviewMode(mode) {
            nvPreviewMode = mode === 'flow' ? 'flow' : 'list';
            const listView = document.getElementById('nvp-list-view');
            const flowView = document.getElementById('nvp-flow-view');
            listView.classList.toggle('hidden', nvPreviewMode !== 'list');
            flowView.classList.toggle('hidden', nvPreviewMode !== 'flow');
            document.getElementById('nvp-mode-list').classList.toggle('active', nvPreviewMode === 'list');
            document.getElementById('nvp-mode-flow').classList.toggle('active', nvPreviewMode === 'flow');
            if (nvPreviewMode === 'list') renderNovelPreviewList();
            else renderNovelPreviewFlow();
        }

        function renderNovelPreviewFlow() {
            const item = nvPreviewItems[nvPreviewFlowIndex];
            if (!item) {
                document.getElementById('nvp-flow-kicker').textContent = '';
                document.getElementById('nvp-flow-title').textContent = nvPreviewLoading ? '正在加载摘录...' : '暂无章节摘录';
                document.getElementById('nvp-flow-excerpt').textContent = '';
                document.getElementById('nvp-flow-note').textContent = '';
                return;
            }
            const status = novelPreviewStatus(item.index);
            document.getElementById('nvp-flow-kicker').textContent = `第 ${item.index + 1} / ${nvPreviewTotal} 章${status ? ' · ' + status : ''}`;
            document.getElementById('nvp-flow-title').textContent = item.title || `第${item.index + 1}章`;
            document.getElementById('nvp-flow-excerpt').textContent = item.preview || '暂无可预览内容';
            document.getElementById('nvp-flow-note').textContent = `本页为章节开头摘录（约 ${item.preview ? item.preview.length : 0} 字），打开本章查看全文`;
            document.getElementById('nvp-flow-prev').disabled = nvPreviewFlowIndex <= 0;
            document.getElementById('nvp-flow-next').disabled = nvPreviewTotal <= 0 || (nvPreviewFlowIndex >= nvPreviewItems.length - 1 && nvPreviewItems.length >= nvPreviewTotal);
        }

        async function novelPreviewNavigate(delta) {
            if (!nvPreviewBook || !nvPreviewTotal) return;
            let target = nvPreviewFlowIndex + delta;
            if (target < 0) return;
            if (target >= nvPreviewItems.length && nvPreviewItems.length < nvPreviewTotal) {
                await loadNovelPreviewPage(false);
            }
            if (target >= nvPreviewItems.length) return;
            nvPreviewFlowIndex = target;
            renderNovelPreviewFlow();
        }

        function novelPreviewOpenCurrent() {
            const item = nvPreviewItems[nvPreviewFlowIndex];
            if (item) novelPreviewOpenChapter(item.index);
        }
        function novelPreviewOpenChapter(chapterIndex) {
            if (!nvPreviewBook) return;
            const id = nvPreviewBook.id;
            closeNovelPreview();
            openNovelReaderById(id, chapterIndex, 0);
        }
        function closeNovelPreview() {
            nvPreviewRequest++;
            nvPreviewBook = null;
            nvPreviewItems = [];
            nvPreviewTotal = 0;
            nvPreviewLoading = false;
            document.getElementById('novel-preview').classList.add('hidden');
        }

        // ---- 阅读器 ----
        function novelSettingsKey() { return 'rhvideo_nv_settings_' + (token || ''); }
        function novelLoadSettings() {
            try {
                const saved = JSON.parse(RHVideoHost.storage.getItem(novelSettingsKey()) || 'null');
                if (saved && saved.fs && saved.lh && saved.theme) nvSettings = saved;
            } catch (e) {}
            novelApplySettings();
        }
        function novelSaveSettings() {
            try { RHVideoHost.storage.setItem(novelSettingsKey(), JSON.stringify(nvSettings)); } catch (e) {}
        }
        function novelApplySettings() {
            const reader = document.getElementById('novel-reader');
            reader.classList.remove('nv-theme-day', 'nv-theme-sepia', 'nv-theme-night');
            reader.classList.add('nv-theme-' + nvSettings.theme);
            reader.style.setProperty('--nv-fs', nvSettings.fs + 'px');
            reader.style.setProperty('--nv-lh', nvSettings.lh);
            document.getElementById('nv-fs-label').textContent = nvSettings.fs + 'px';
            document.getElementById('nv-lh-label').textContent = nvSettings.lh.toFixed(1);
            ['day', 'sepia', 'night'].forEach(t => {
                const el = document.getElementById('nv-theme-' + t);
                if (el) el.classList.toggle('active', t === nvSettings.theme);
            });
        }
        function novelAdjustFont(d) { nvSettings.fs = Math.min(30, Math.max(13, nvSettings.fs + d)); novelApplySettings(); novelSaveSettings(); }
        function novelAdjustLineHeight(d) { nvSettings.lh = Math.min(2.6, Math.max(1.3, Math.round((nvSettings.lh + d * 0.1) * 10) / 10)); novelApplySettings(); novelSaveSettings(); }
        function novelSetTheme(t) { nvSettings.theme = t; novelApplySettings(); novelSaveSettings(); }
        function novelToggleSettings(e) {
            if (e) e.stopPropagation();
            document.getElementById('novel-settings').classList.toggle('hidden');
        }

        async function openNovelReaderById(id, chapterIndex, scrollRatio) {
            const preview = document.getElementById('novel-preview');
            if (preview && !preview.classList.contains('hidden')) closeNovelPreview();
            const reader = document.getElementById('novel-reader');
            novelLoadSettings();
            reader.classList.remove('hidden');
            document.getElementById('nv-content').innerHTML = '<div class="nv-loading"><span class="spinner"></span> 正在加载...</div>';
            document.getElementById('nv-book-title').textContent = '';
            document.getElementById('nv-ch-title').textContent = '';
            try {
                const res = await fetch(`${API_BASE}/novels/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'HTTP ' + res.status);
                }
                nvBook = await res.json();
            } catch (e) {
                document.getElementById('nv-content').innerHTML = `<div class="nv-loading">加载失败：${favEsc(e.message)}</div>`;
                return;
            }
            document.getElementById('nv-book-title').textContent = nvBook.title;
            document.getElementById('nv-star').innerHTML = starBtnRaw('novel', nvBook.id);
            if (nvBook.status === 'failed' || !nvBook.chapter_count) {
                document.getElementById('nv-content').innerHTML = `<div class="nv-loading">该书暂不可读：${favEsc(nvBook.error_message || '没有解析出章节')}</div>`;
                return;
            }
            let target = chapterIndex;
            if (target == null) {
                target = nvBook.progress ? nvBook.progress.chapter_index : 0;
                scrollRatio = nvBook.progress ? nvBook.progress.scroll_ratio : 0;
            }
            novelJumpTo(Math.max(0, Math.min(target, nvBook.chapter_count - 1)), scrollRatio || 0);
        }

        function starBtnRaw(type, id) {
            const on = favSetFor(type).has(String(id));
            return on ? '★ 已收藏' : '☆ 收藏';
        }
        function novelToggleStar() {
            if (!nvBook) return;
            toggleFavorite('novel', nvBook.id);
            setTimeout(() => {
                if (nvBook) document.getElementById('nv-star').innerHTML = starBtnRaw('novel', nvBook.id);
            }, 400);
        }

        function novelJumpTo(index, scrollRatio) {
            nvChapterIdx = index;
            nvScrollRestorePending = scrollRatio || 0;
            novelLoadChapter();
        }
        function novelJumpChapter(delta) {
            if (!nvBook) return;
            const target = nvChapterIdx + delta;
            if (target < 0 || target >= nvBook.chapter_count) return;
            nvScrollRestorePending = 0;
            novelJumpTo(target, 0);
        }

        async function novelLoadChapter() {
            const content = document.getElementById('nv-content');
            content.innerHTML = '<div class="nv-loading"><span class="spinner"></span> 正在加载...</div>';
            document.getElementById('nv-scroll').scrollTop = 0;
            try {
                const res = await fetch(`${API_BASE}/novels/${nvBook.id}/chapters/${nvChapterIdx}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'HTTP ' + res.status);
                }
                const ch = await res.json();
                const title = ch.title || `第${ch.index + 1}章`;
                document.getElementById('nv-ch-title').textContent = title;
                const paras = (ch.text || '').split('\n').map(s => s.trim()).filter(Boolean);
                content.innerHTML = `<h2 class="nv-chapter-title">${favEsc(title)}</h2>` +
                    paras.map(p => `<p>${favEsc(p)}</p>`).join('') +
                    `<div class="nv-end">${ch.has_next ? '—— 本章完 ——' : '—— 全书完 ——'}</div>`;
                document.getElementById('nv-prev-btn').disabled = !ch.has_prev;
                document.getElementById('nv-next-btn').disabled = !ch.has_next;
                document.getElementById('nv-progress-label').textContent = `第 ${ch.index + 1} / ${ch.total_chapters} 章`;
                novelUpdateTocCurrent();
                // 恢复章内滚动位置
                if (nvScrollRestorePending > 0) {
                    const sc = document.getElementById('nv-scroll');
                    requestAnimationFrame(() => {
                        const max = sc.scrollHeight - sc.clientHeight;
                        sc.scrollTop = nvScrollRestorePending * max;
                        nvScrollRestorePending = 0;
                    });
                }
                novelSaveProgress();
            } catch (e) {
                content.innerHTML = `<div class="nv-loading">章节加载失败：${favEsc(e.message)}</div>`;
            }
        }

        function novelScrollRatio() {
            const sc = document.getElementById('nv-scroll');
            const max = sc.scrollHeight - sc.clientHeight;
            return max > 0 ? Math.min(1, sc.scrollTop / max) : 1;
        }
        function novelOnScroll() {
            if (!nvBook) return;
            clearTimeout(nvSaveTimer);
            nvSaveTimer = setTimeout(novelSaveProgress, 1200);
        }
        async function novelSaveProgress() {
            if (!nvBook) return;
            try {
                await fetch(`${API_BASE}/novels/${nvBook.id}/progress`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ chapter_index: nvChapterIdx, scroll_ratio: novelScrollRatio() }),
                });
            } catch (e) { /* 进度保存失败静默忽略 */ }
        }

        function closeNovelReader() {
            clearTimeout(nvSaveTimer);
            novelSaveProgress();
            document.getElementById('novel-reader').classList.add('hidden');
            document.getElementById('novel-toc').classList.remove('open');
            document.getElementById('novel-settings').classList.add('hidden');
            nvBook = null;
            loadNovels(false);
        }

        function novelToggleToc() {
            const toc = document.getElementById('novel-toc');
            const opening = !toc.classList.contains('open');
            toc.classList.toggle('open', opening);
            document.getElementById('novel-settings').classList.add('hidden');
            if (opening) renderNovelToc();
        }
        async function renderNovelToc() {
            const ticket = nextSearchRender('novel-toc');
            const list = document.getElementById('nv-toc-list');
            if (!nvBook || !nvBook.chapters) { list.innerHTML = ''; return; }
            const q = (document.getElementById('nv-toc-search')?.value || '').toLowerCase();
            const indexedChapters = nvBook.chapters.map((c, i) => Object.assign({}, c, { i }));
            const chapters = q ? await searchCatalog('novel-toc', indexedChapters, ['title'], q) : indexedChapters;
            if (ticket !== searchRenderTickets.get('novel-toc')) return;
            list.innerHTML = chapters.map(c =>
                `<div class="toc-item ${c.i === nvChapterIdx ? 'current' : ''}" id="toc-item-${c.i}" data-rh-click="h240" data-rh-a-h240="${RHVideoBindings.encode([null,null,c.i,null,null])}">
                    <span class="ti-idx">${c.i + 1}</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis">${favEsc(c.title)}</span>
                </div>`).join('') || '<div class="nv-loading">无匹配章节</div>';
            const cur = document.getElementById('toc-item-' + nvChapterIdx);
            if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
        }
        function novelUpdateTocCurrent() {
            document.querySelectorAll('#nv-toc-list .toc-item').forEach(el => el.classList.remove('current'));
            const cur = document.getElementById('toc-item-' + nvChapterIdx);
            if (cur) {
                cur.classList.add('current');
                if (cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
            }
        }
        function novelTocJump(i) {
            novelJumpTo(i, 0);
            novelToggleToc();
        }

        document.addEventListener('keydown', (e) => {
            const reader = document.getElementById('novel-reader');
            const preview = document.getElementById('novel-preview');
            const readerOpen = reader && !reader.classList.contains('hidden');
            const previewOpen = preview && !preview.classList.contains('hidden');
            if (!readerOpen && !previewOpen) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            if (e.key === 'Escape') {
                if (readerOpen) closeNovelReader();
                else closeNovelPreview();
                e.preventDefault();
            } else if (previewOpen && e.altKey && e.key === 'ArrowLeft') {
                novelPreviewNavigateBook(-1);
                e.preventDefault();
            } else if (previewOpen && e.altKey && e.key === 'ArrowRight') {
                novelPreviewNavigateBook(1);
                e.preventDefault();
            } else if (readerOpen && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
                novelJumpChapter(1); e.preventDefault();
            } else if (readerOpen && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
                novelJumpChapter(-1); e.preventDefault();
            } else if (previewOpen && nvPreviewMode === 'flow' && (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown')) {
                novelPreviewNavigate(1);
                e.preventDefault();
            } else if (previewOpen && nvPreviewMode === 'flow' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp')) {
                novelPreviewNavigate(-1);
                e.preventDefault();
            }
        });

        document.addEventListener('compositionend', event => {
            if (event.target.matches('input') && Object.values(searchInputIds).includes(event.target.id)) event.target.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // ============ Favorites (喜爱) ============
        function favShowKey(k) { return 'rhvideo_favshow_' + k + '_' + (token || ''); }

        async function loadFavoriteIds() {
            try {
                const res = await fetch(`${API_BASE}/favorites/ids`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!res.ok) return;
                const data = await res.json();
                const typedVideoIds = Array.isArray(data.video_ids) ? data.video_ids : (Array.isArray(data.videos) ? data.videos : []);
                const typedPictureIds = Array.isArray(data.picture_ids) ? data.picture_ids : (Array.isArray(data.pictures) ? data.pictures : []);
                const typedNovelIds = Array.isArray(data.novel_ids) ? data.novel_ids : [];
                favVideoIds = new Set(typedVideoIds.map(String));
                favPictureIds = new Set(typedPictureIds.map(String));
                favNovelIds = new Set(typedNovelIds.map(String));
                const hasTypedIds = typedVideoIds.length > 0 || typedPictureIds.length > 0;
                if (Array.isArray(data.ids)) {
                    for (const ent of data.ids) {
                        if (ent === null || ent === undefined) continue;
                        if (typeof ent === 'string' || typeof ent === 'number') {
                            if (hasTypedIds) continue;
                            const key = String(ent);
                            const isPicture = allPictures.some(p => String(p.id) === key);
                            const isVideo = allVideos.some(v => String(v.id) === key);
                            if (isPicture && !isVideo) favPictureIds.add(key);
                            else if (isVideo && !isPicture) favVideoIds.add(key);
                            continue;
                        }
                        if (ent.picture_id) favPictureIds.add(String(ent.picture_id));
                        else if (ent.video_id) favVideoIds.add(String(ent.video_id));
                        else if (ent.id) (ent.media_type === 'picture' ? favPictureIds : favVideoIds).add(String(ent.id));
                    }
                }
                refreshAllStarButtons();
            } catch (e) { console.error(e); }
        }

        function favSetFor(type) {
            return type === 'video' ? favVideoIds : (type === 'novel' ? favNovelIds : favPictureIds);
        }

        function setFavoriteButtons(type, id, active) {
            const key = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const selector = `.fav-star[data-fav-type="${type}"][data-fav-id="${key}"]`;
            document.querySelectorAll(selector).forEach(button => {
                button.classList.toggle('active', active);
                button.textContent = active ? '★' : '☆';
            });
            window.RHDuplicates?.favoriteChanged(type,String(id),active);
        }

        function playbackViewerIsOpen() {
            return ['media-viewer', 'grid-viewer', 'pic-strip-viewer', 'timeline-viewer', 'favshow-viewer', 'kenburns-viewer', 'playlist-viewer']
                .some(id => {
                    const viewer = document.getElementById(id);
                    return viewer && !viewer.classList.contains('hidden');
                });
        }

        function requestFavoritesRefresh() {
            const tab = document.getElementById('tab-favorites');
            if (!tab || tab.classList.contains('hidden')) return;
            if (playbackViewerIsOpen()) {
                favListRefreshPending = true;
                return;
            }
            loadFavorites();
        }

        function flushFavoritesRefresh() {
            if (!favListRefreshPending || playbackViewerIsOpen()) return;
            favListRefreshPending = false;
            loadFavorites();
        }

        async function toggleFavorite(type, id, desired) {
            const key = String(id);
            const requestKey = type + ':' + key;
            const sessionToken = token;
            if (favPending.get(requestKey) === sessionToken) return;
            const set = favSetFor(type);
            const was = set.has(key);
            const active = typeof desired === 'boolean' ? desired : !was;
            const method = active ? 'PUT' : 'DELETE';
            favPending.set(requestKey, sessionToken);
            if (active) set.add(key); else set.delete(key);
            setFavoriteButtons(type, key, active);
            try {
                const res = await fetch(`${API_BASE}/favorites/${type}/${encodeURIComponent(key)}`, { method, headers: { 'Authorization': `Bearer ${sessionToken}` } });
                if (token !== sessionToken) return;
                if (!res.ok) {
                    if (res.status === 403) throw new Error('该媒体属于其他用户，当前账号不能收藏');
                    if (res.status === 404) throw new Error('媒体已不存在或不可访问');
                    throw new Error('HTTP ' + res.status);
                }
                notify(active ? '已加入喜爱' : '已取消喜爱', 'success');
                requestFavoritesRefresh();
            } catch (e) {
                if (token !== sessionToken) return;
                if (was) set.add(key); else set.delete(key);
                setFavoriteButtons(type, key, was);
                notify('喜爱操作失败: ' + e.message, 'error');
            } finally {
                if (favPending.get(requestKey) === sessionToken) favPending.delete(requestKey);
            }
        }

        function starBtnHtml(type, id) {
            const key = String(id);
            const set = favSetFor(type);
            const on = set.has(key);
            return `<button class="fav-star${on ? ' active' : ''}" data-fav-type="${type}" data-fav-id="${key}" data-rh-click="h239" data-rh-a-h239="${RHVideoBindings.encode([null,null,null,type,key,null])}" title="喜爱">${on ? '★' : '☆'}</button>`;
        }

        function pictureStarBtnHtml(picture) {
            if (!picture || picture.can_favorite === false || picture.id == null) return '';
            return starBtnHtml('picture', picture.id);
        }

        function refreshAllStarButtons() {
            document.querySelectorAll('.fav-star').forEach(b => {
                const set = favSetFor(b.dataset.favType);
                const on = set.has(String(b.dataset.favId));
                b.classList.toggle('active', on);
                b.textContent = on ? '★' : '☆';
            });
        }

        // generic media viewer star: video items target their video, screenshots target their source video (video_id), pictures target their picture id
        function mediaStarBtn(item) {
            if (!item) return '';
            if (item.type === 'video' && item.videoId) return starBtnHtml('video', item.videoId);
            if (item.pictureId) return starBtnHtml('picture', item.pictureId);
            if (item.videoId) return starBtnHtml('video', item.videoId);
            return '';
        }

        function favEsc(s) {
            return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function favClampNum(v, lo, hi, dflt) {
            v = parseFloat(v);
            if (!isFinite(v)) v = dflt;
            return Math.min(hi, Math.max(lo, v));
        }

        function normalizeFavItem(raw) {
            const mt = (raw.media_type === 'picture' || raw.type === 'picture') ? 'picture'
                : (raw.media_type === 'novel' || raw.type === 'novel') ? 'novel' : 'video';
            const id = String(raw.media_id || raw.id || (mt === 'video' ? raw.video_id : (mt === 'novel' ? raw.novel_id : raw.picture_id)) || '');
            const folder = raw.folder_label || raw.folder || '';
            const name = raw.filename || raw.original_filename || raw.title || raw.name || '';
            const title = (folder ? '[' + folder + '] ' : '') + (mt === 'novel' ? (raw.title || name) : name);
            if (mt === 'novel') {
                const info = raw.word_summary || [(raw.word_count ? (raw.word_count / 10000).toFixed(1) + '万字' : ''), raw.chapter_count ? raw.chapter_count + '章' : ''].filter(Boolean).join(' · ');
                return { mediaType: 'novel', id, url: '', thumb: '', title, info };
            }
            if (mt === 'video') {
                const dur = raw.duration_seconds || raw.duration || raw.original_duration || 0;
                const res = raw.resolution || raw.original_resolution || '';
                const thumb = raw.thumbnail || raw.thumbnail_url || raw.screenshot_url || raw.cover_url || raw.cover || '';
                const url = raw.play_url || `${API_BASE}/videos/${id}/play`;
                const info = [dur ? Math.round(dur) + 's' : '', res].filter(Boolean).join(' | ');
                return { mediaType: 'video', id, url, thumb, title, info };
            }
            // picture: prefer explicit thumbnail_url / play_url from backend, fall back to url/webp_path
            const thumb = raw.thumbnail_url || raw.thumbnail || '';
            const url = raw.play_url || raw.url || raw.file_url || (raw.webp_path ? RHVideoHost.asset('/storage/' + raw.webp_path) : '') || thumb;
            const res = raw.resolution || raw.original_resolution || '';
            const size = raw.filesize || raw.original_filesize || 0;
            const info = [res, size ? (size / 1024 / 1024).toFixed(1) + 'MB' : ''].filter(Boolean).join(' | ');
            return { mediaType: 'picture', id, url, thumb: thumb || url, title, info };
        }

        function setFavFilter(f) {
            favFilter = f;
            ['all', 'video', 'picture', 'novel'].forEach(k => {
                const el = document.getElementById('fav-filter-' + k);
                if (el) el.classList.toggle('active', k === f);
            });
            renderFavorites();
            if (mediaTagDrawerSource === 'favorites' && document.getElementById('grid-tag-drawer').classList.contains('open')) renderGridTagDrawer();
        }

        function favSearchInput(event) {
            scheduleSearch(event, 'favorites', renderFavorites);
        }

        async function loadFavorites() {
            const request = ++favCatalogRequest, userToken = token;
            const loader = document.getElementById('fav-loader');
            loader.classList.remove('hidden');
            try {
                const items = [];
                // Fetch metadata in bounded pages; search must cover every favorite,
                // including entries outside the backend's default first 50 records.
                for (let skip = 0; ; skip += 200) {
                    const res = await fetch(`${API_BASE}/favorites?media_type=all&skip=${skip}&limit=200`, { headers: { 'Authorization': `Bearer ${userToken}` } });
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const data = await res.json();
                    if (request !== favCatalogRequest || token !== userToken) return;
                    const page = data.items || data.favorites || (Array.isArray(data) ? data : []);
                    items.push(...page);
                    if (!page.length || items.length >= Number(data.total ?? items.length) || page.length < 200) break;
                    if (skip === 0 && !favItems.length) { favItems = items.slice(); await renderFavorites(); }
                }
                favItems = items;
                await renderFavorites();
                if (mediaTagDrawerSource === 'favorites' && document.getElementById('grid-tag-drawer').classList.contains('open')) renderGridTagDrawer();
                return true;
            } catch (e) {
                if (request === favCatalogRequest) document.getElementById('fav-grid').innerHTML = `<p class="empty">加载失败: ${favEsc(e.message)}</p>`;
            } finally {
                if (request === favCatalogRequest) loader.classList.add('hidden');
            }
        }

        function changeFavPage(delta) { favPage = Math.max(1, favPage + delta); renderFavorites(); }
        async function renderFavorites() {
            const ticket = nextSearchRender('favorites');
            const grid = document.getElementById('fav-grid');
            const q = (document.getElementById('fav-search')?.value || '').trim();
            let items = q ? await searchCatalog('favorites', favItems, ['title', 'filename', 'folder_label'], q) : favItems;
            if (ticket !== searchRenderTickets.get('favorites')) return;
            if (favFilter !== 'all') items = items.filter(item => (item.type || item.media_type) === favFilter);
            const matchTags = RHTagFilter.compile(mediaTagFilter);
            items = items.filter(item => matchTags(item.folder_label));
            favNormItems = items.map(normalizeFavItem).filter(n => n.id);
            const filter = JSON.stringify([q, favFilter, RHTagFilter.key(mediaTagFilter)]);
            if (filter !== favRenderFilter) { favPage = 1; favRenderFilter = filter; }
            const pages = Math.max(1, Math.ceil(favNormItems.length / 48));
            favPage = Math.min(favPage, pages);
            document.getElementById('fav-paginator').classList.toggle('hidden', !favNormItems.length);
            document.getElementById('fav-page-info').textContent = `第 ${favPage}/${pages} 页（共 ${favNormItems.length} 项）`;
            document.getElementById('fav-prev').disabled = favPage <= 1;
            document.getElementById('fav-next').disabled = favPage >= pages;
            // 小说不参与连续浏览/自动放映，只从卡片进入阅读器
            favMedia = favNormItems.filter(n => n.mediaType !== 'novel').map(n => n.mediaType === 'video'
                ? { type: 'video', url: n.url, title: n.title, info: n.info, videoId: n.id }
                : { url: n.url, title: n.title, info: n.info, pictureId: n.id });
            document.getElementById('fav-count').textContent = `(${favNormItems.length})`;
            if (!favNormItems.length) {
                grid.innerHTML = `<p class="empty">${q || favFilter !== 'all' || RHTagFilter.active(mediaTagFilter) ? '没有符合当前条件的喜爱内容，可调整搜索、类型或标签筛选。' : '暂无喜爱内容，点击截图 / 图片 / 小说卡片上的星标添加'}</p>`;
                return;
            }
            grid.innerHTML = favNormItems.slice((favPage - 1) * 48, favPage * 48).map((n, i) => {
                if (n.mediaType === 'novel') {
                    const hue = novelCoverHue(n.title);
                    return `<div class="novel-card" style="width:150px" data-rh-click="h237" data-rh-a-h237="${RHVideoBindings.encode([favEsc(n.id),null,null,null,null,null,null,null,null])}">
                        <div class="novel-cover" style="background:linear-gradient(150deg, hsl(${hue},38%,65%), hsl(${hue+24},35%,46%))">
                            <span class="cover-spine"></span>
                            <div class="cover-char">${favEsc(n.title.slice(0, 4))}</div>
                        </div>
                        ${starBtnHtml('novel', n.id)}
                        <div class="novel-info">
                            <div class="n-title" title="${favEsc(n.title)}">${favEsc(n.title)}</div>
                            <div class="n-meta">小说${n.info ? ' · ' + favEsc(n.info) : ''}</div>
                            <div class="novel-card-actions"><button class="n-preview-btn" data-rh-click="h238" data-rh-a-h238="${RHVideoBindings.encode([null,null,null,null,null,null,null,null,favEsc(n.id)])}" title="快速浏览章节摘录">速览</button></div>
                        </div>
                    </div>`;
                }
                const browseIdx = favMedia.findIndex(m => (m.videoId || m.pictureId) === n.id);
                return `
                <div class="screenshot-item" data-rh-click="h236" data-rh-a-h236="${RHVideoBindings.encode([browseIdx < 0 ? 0 : browseIdx,null,null,null,null,null,null,null])}">
                    ${n.thumb ? `<img src="${n.thumb}" loading="lazy" alt="${favEsc(n.title)}" data-rh-error="h235" data-rh-a-h235="${RHVideoBindings.encode([null,null])}">` : '<div class="img-error">无预览</div>'}
                    ${starBtnHtml(n.mediaType, n.id)}
                    ${n.mediaType === 'video' ? '<div class="play-icon"></div>' : ''}
                    <div class="overlay">
                        <div class="fname" title="${favEsc(n.title)}">${favEsc(n.title)}</div>
                        <div class="time">${n.mediaType === 'video' ? '视频' : '图片'}${n.info ? ' | ' + favEsc(n.info) : ''}</div>
                    </div>
                </div>`;
            }).join('');
        }

        function openFavBrowse(idx) {
            if (!favMedia.length) { notify('暂无喜爱内容', 'error'); return; }
            const i = Math.max(0, Math.min(idx || 0, favMedia.length - 1));
            openMediaViewer(favMedia, i);
        }

        // ---- Favorites mixed slideshow (separate image/video dwell, crossfade layers) ----
        function favshowImgSecs() { return Math.round(favClampNum(document.getElementById('favshow-img-secs').value, 1, 60, 5)); }
        function favshowVidSecs() { return Math.round(favClampNum(document.getElementById('favshow-vid-secs').value, 1, 300, 15)); }
        function favshowFadeMs() { return Math.round(favClampNum(document.getElementById('favshow-fade-ms').value, 100, 5000, 800)); }

        function favshowCfgChanged() {
            const is = favshowImgSecs(), vs = favshowVidSecs(), fm = favshowFadeMs();
            document.getElementById('favshow-img-secs').value = String(is);
            document.getElementById('favshow-vid-secs').value = String(vs);
            document.getElementById('favshow-fade-ms').value = String(fm);
            try {
                RHVideoHost.storage.setItem(favShowKey('img'), String(is));
                RHVideoHost.storage.setItem(favShowKey('vid'), String(vs));
                RHVideoHost.storage.setItem(favShowKey('fade'), String(fm));
            } catch (e) {}
        }

        async function openFavSlideshow() {
            if (!favNormItems.length) await loadFavorites();
            favshowItems = favNormItems.filter(n => n.mediaType !== 'novel');
            if (!favshowItems.length) { notify('暂无可放映的图片或视频', 'error'); return; }
            document.getElementById('favshow-img-secs').value = String(favClampNum(RHVideoHost.storage.getItem(favShowKey('img')), 1, 60, 5));
            document.getElementById('favshow-vid-secs').value = String(favClampNum(RHVideoHost.storage.getItem(favShowKey('vid')), 1, 300, 15));
            document.getElementById('favshow-fade-ms').value = String(favClampNum(RHVideoHost.storage.getItem(favShowKey('fade')), 100, 5000, 800));
            for (const L of favshowLayers) { L.innerHTML = ''; L.style.opacity = '0'; }
            favshowCurLayer = 0;
            const viewer = document.getElementById('favshow-viewer');
            viewer.classList.remove('hidden');
            document.addEventListener('keydown', favshowKeyHandler);
            favshowOn = true;
            document.getElementById('favshow-toggle-btn').textContent = '⏸ 暂停';
            favshowProgressRafStart();
            favshowPlay(0);
        }

        // ---- Favorites slideshow progress bar ----
        function favshowProgressRafStart() {
            if (favshowRaf) return;
            function tick() {
                favshowUpdateProgress();
                favshowRaf = requestAnimationFrame(tick);
            }
            favshowRaf = requestAnimationFrame(tick);
        }
        function favshowProgressRafStop() {
            if (favshowRaf) { cancelAnimationFrame(favshowRaf); favshowRaf = null; }
        }
        function favshowTotalDur() {
            let t = 0;
            for (const it of favshowItems) t += (it.mediaType === 'video' ? favshowVidSecs() : favshowImgSecs()) * 1000;
            return t;
        }
        function favshowGetElapsed() {
            const elapsed = favshowOn ? (performance.now() - favshowPlayStartAt) : favshowPausedElapsed;
            return Math.max(0, Math.min(elapsed, favshowCurrentDwell || 0));
        }
        function favshowUpdateProgress() {
            const bar = document.getElementById('favshow-progress');
            const lbl = document.getElementById('favshow-progress-label');
            if (!bar || !favshowItems.length) return;
            if (document.activeElement === bar) return;
            const total = favshowTotalDur();
            if (!total) { bar.value = '0'; lbl.textContent = ''; return; }
            let pos = 0;
            for (let i = 0; i < favshowIdx; i++) pos += (favshowItems[i].mediaType === 'video' ? favshowVidSecs() : favshowImgSecs()) * 1000;
            pos += favshowGetElapsed();
            bar.value = String(Math.round(pos / total * 1000));
            lbl.textContent = (favshowIdx + 1) + '/' + favshowItems.length + ' 个 · ' + fmtClock(pos / 1000) + ' / ' + fmtClock(total / 1000);
        }
        function favshowProgressInput(el) {
            const n = favshowItems.length;
            if (!n) return;
            const frac = parseFloat(el.value) / 1000;
            const total = favshowTotalDur();
            if (!total) return;
            const t = frac * total;
            let idx = n - 1, acc = 0;
            for (let i = 0; i < n; i++) {
                const d = (favshowItems[i].mediaType === 'video' ? favshowVidSecs() : favshowImgSecs()) * 1000;
                if (t < acc + d) { idx = i; break; }
                acc += d;
            }
            document.getElementById('favshow-progress-label').textContent = (idx + 1) + '/' + n + ' 个 · ' + fmtClock(t / 1000) + ' / ' + fmtClock(total / 1000);
        }
        function favshowProgressCommit(el) {
            const n = favshowItems.length;
            if (!n) return;
            const frac = Math.max(0, Math.min(1, parseFloat(el.value) / 1000));
            const total = favshowTotalDur();
            if (!total) return;
            const t = frac * total;
            let idx = n - 1, acc = 0;
            for (let i = 0; i < n; i++) {
                const d = (favshowItems[i].mediaType === 'video' ? favshowVidSecs() : favshowImgSecs()) * 1000;
                if (t < acc + d) { idx = i; break; }
                acc += d;
            }
            const itemDur = (favshowItems[idx].mediaType === 'video' ? favshowVidSecs() : favshowImgSecs()) * 1000;
            const offset = Math.max(0, Math.min(itemDur, t - acc));
            favshowPlay(idx);
            favshowPlayStartAt = performance.now() - offset;
            if (favshowOn) {
                clearTimeout(favshowEndTimer);
                favshowEndTimer = setTimeout(() => { if (favshowOn) favshowPlay(favshowIdx + 1); }, Math.max(50, itemDur - offset));
            } else {
                favshowPausedElapsed = offset;
            }
            favshowUpdateProgress();
        }

        function favshowPlay(idx) {
            const n = favshowItems.length;
            if (!n) return;
            favshowIdx = ((idx % n) + n) % n;
            const item = favshowItems[favshowIdx];
            document.getElementById('favshow-title').textContent = item.title || '';
            document.getElementById('favshow-counter').textContent = (favshowIdx + 1) + ' / ' + n;
            document.getElementById('favshow-favorite-action').innerHTML = item.mediaType === 'video'
                ? starBtnHtml('video', item.id)
                : starBtnHtml('picture', item.id);
            const fade = favshowFadeMs();
            const cur = favshowLayers[favshowCurLayer];
            const next = favshowLayers[1 - favshowCurLayer];
            favshowCurLayer = 1 - favshowCurLayer;
            next.innerHTML = item.mediaType === 'video'
                ? `<video src="${item.url}" autoplay playsinline muted controls></video>`
                : `<img src="${item.url}" alt="${favEsc(item.title)}">`;
            // overlapping crossfade: incoming fades in while outgoing fades out
            next.style.transition = `opacity ${fade}ms ease`;
            cur.style.transition = `opacity ${fade}ms ease`;
            const frameToken = ++favshowFrameToken;
            requestAnimationFrame(() => {
                if (frameToken !== favshowFrameToken) return;
                requestAnimationFrame(() => {
                    if (frameToken !== favshowFrameToken) return;
                    next.style.opacity = '1';
                    cur.style.opacity = '0';
                });
            });
            clearTimeout(favshowFadeTimer);
            favshowFadeTimer = setTimeout(() => {
                const v = cur.querySelector('video');
                if (v) v.pause();
                cur.innerHTML = '';
            }, fade + 80);
            clearTimeout(favshowEndTimer);
            const dwell = (item.mediaType === 'video' ? favshowVidSecs() : favshowImgSecs()) * 1000;
            favshowPlayStartAt = performance.now();
            favshowCurrentDwell = dwell;
            favshowPausedElapsed = 0;
            const v = next.querySelector('video');
            if (v) {
                pageVolumeBind(v, 1);
                v.muted = true;
                v.loop = true; // dwell timer decides when to advance: video always plays its configured seconds
                v.removeAttribute('controls'); // controls invite seeking that desyncs the timer
                v.play().catch(() => {});
            }
            if (favshowOn) {
                favshowEndTimer = setTimeout(() => { if (favshowOn) favshowPlay(favshowIdx + 1); }, dwell);
            }
            favshowUpdateProgress();
        }

        function toggleFavshow() {
            if (favshowOn) {
                favshowOn = false;
                favshowPausedElapsed = performance.now() - favshowPlayStartAt;
                clearTimeout(favshowEndTimer);
                const v = favshowLayers[favshowCurLayer].querySelector('video');
                if (v) v.pause();
                document.getElementById('favshow-toggle-btn').textContent = '▶ 播放';
            } else {
                clearTimeout(favshowEndTimer);
                favshowOn = true;
                const v = favshowLayers[favshowCurLayer].querySelector('video');
                if (v) v.play().catch(() => {});
                const item = favshowItems[favshowIdx];
                const dwell = (item && item.mediaType === 'video' ? favshowVidSecs() : favshowImgSecs()) * 1000;
                const remaining = Math.max(50, dwell - favshowPausedElapsed);
                favshowPlayStartAt = performance.now() - favshowPausedElapsed;
                favshowPausedElapsed = 0;
                favshowEndTimer = setTimeout(() => { if (favshowOn) favshowPlay(favshowIdx + 1); }, remaining);
                document.getElementById('favshow-toggle-btn').textContent = '⏸ 暂停';
            }
            favshowUpdateProgress();
        }

        function favshowNext(delta) { favshowPlay(favshowIdx + delta); }

        function favshowKeyHandler(e) {
            if (document.getElementById('favshow-viewer').classList.contains('hidden')) return;
            if (e.key === 'Escape') { e.preventDefault(); closeFavshow(); }
            else if (e.key === ' ') { e.preventDefault(); toggleFavshow(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); favshowNext(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); favshowNext(1); }
            else if (e.key === 'Home') { e.preventDefault(); favshowProgressCommit({ value: '0' }); }
            else if (e.key === 'End') { e.preventDefault(); favshowProgressCommit({ value: '1000' }); }
        }

        function closeFavshow() {
            favshowOn = false;
            favshowFrameToken++;
            clearTimeout(favshowEndTimer);
            clearTimeout(favshowFadeTimer);
            favshowEndTimer = null;
            favshowFadeTimer = null;
            favshowProgressRafStop();
            favshowPausedElapsed = 0;
            for (const L of favshowLayers) {
                const v = L.querySelector('video');
                if (v) v.pause();
                L.innerHTML = '';
                L.style.opacity = '0';
            }
            document.getElementById('favshow-viewer').classList.add('hidden');
            flushFavoritesRefresh();
            document.getElementById('favshow-favorite-action').innerHTML = '';
            document.removeEventListener('keydown', favshowKeyHandler);
            const fbar = document.getElementById('favshow-progress');
            if (fbar) fbar.value = '0';
            const flbl = document.getElementById('favshow-progress-label');
            if (flbl) flbl.textContent = '';
        }
        RHVideo.init({getToken: () => token, state: () => ({
            signed_in: !!token,
            tab: document.querySelector('.tab-btn.active')?.id.replace('tab-btn-', '') || null,
            selection: {enabled: videoMultiSelect, video_ids: [...videoBatchIds]},
            pages: {videos: currentPage, screenshots: gridPage, pictures: picPage, novels: novelPage},
            volume: pageVolume,
            dialogs: [...document.querySelectorAll('.modal-overlay.show,.modal.show,dialog[open]')].map(el => el.id),
            viewers: [...document.querySelectorAll('.media-viewer,.grid-viewer,.pic-strip-viewer,.timeline-viewer,.kenburns-viewer,#novel-reader,#novel-preview')].filter(el => el.getClientRects().length).map(el => el.id),
            fullscreen: document.fullscreenElement?.id || null,
        })});
        RHVideo.ui.register({name:'navigation.tab', description:'切换列表、截图、图片、小说、喜爱或存储', parameters:['tab'], run: switchTab});
        RHVideo.ui.register({name:'selection.mode', description:'开关视频多选模式', parameters:['enabled'], run: toggleVideoMultiSelect});
        RHVideo.ui.register({name:'selection.video', description:'选择或取消选择指定视频', parameters:['video_id','selected'], run: toggleVideoSelect});
        RHVideo.ui.register({name:'selection.page', description:'选择当前页全部视频，保留跨页选择', run: selectAllPageVideos});
        RHVideo.ui.register({name:'selection.clear', description:'清空已选择视频', run: clearVideoSelection});
        RHVideo.ui.register({name:'audio.volume', description:'设置页面音量（0 至 1）', parameters:['volume'], run: setPageVolume});
        function backupPreferenceKeys() {
            const suffix = token || '';
            return {page_volume:pageVolumeKey(),rotate:'rhvideo_rotate_'+suffix,mix_pictures:'rhvideo_mixpics_'+suffix,
                grid_tag_prefs:gridTagPrefsKey(),media_tag_filter:mediaTagStorageKey(),strip_layout:picStripLayoutKey(),strip_speed:picStripSpeedKey(),
                kenburns_duration:kenburnsDurKey(),kenburns_overlap:kenburnsOvKey(),kenburns_fade_min:kenburnsFminKey(),kenburns_fade_max:kenburnsFmaxKey(),kenburns_fade_ratio:kenburnsFratioKey(),
                novel_settings:novelSettingsKey(),favshow_image:favShowKey('img'),favshow_video:favShowKey('vid'),favshow_fade:favShowKey('fade')};
        }
        RHConfigBackups.init({base:API_BASE,getToken:()=>token,getPreferences:()=>Object.fromEntries(
            Object.entries(backupPreferenceKeys()).map(([name,key])=>[name,RHVideoHost.storage.getItem(key)]).filter(([,value])=>value!==null)),
            applyPreferences:values=>{for(const [name,key] of Object.entries(backupPreferenceKeys()))if(typeof values[name]==='string')RHVideoHost.storage.setItem(key,values[name]);
                loadPageVolumePreference();loadMediaTagFilter();loadGridTagPrefs();loadRotationPref();},
            onRestored:()=>{loadFavoriteIds();if(!document.getElementById('tab-favorites').classList.contains('hidden'))loadFavorites();}});
        RHDuplicates.init({base:API_BASE,getToken:()=>token,play:item=>playDuplicateVideo(item),
            favorite:async(item,active)=>{const set=favSetFor(item.media_type),id=String(item.id);if(favPending.get(item.key)!==token){if(item.favorite)set.add(id);else set.delete(id);}await toggleFavorite(item.media_type,id,active);return set.has(id);}});
        RHDuplicateRules.init({base:API_BASE,getToken:()=>token});
        RHSettings.init({base: API_BASE, getToken: () => token});
        RHFavoriteExports.init({base: API_BASE, getToken: () => token, getSelection: async () => {
            // Rebuild the complete filtered catalog, never just the visible 48 cards.
            if (!await loadFavorites()) throw new Error('喜爱列表加载未完成，请稍后重试');
            await renderFavorites();
            return favNormItems.map(item => ({type:item.mediaType, id:item.id}));
        }});
        RHStorageSavings.init({base: API_BASE, getToken: () => token, formatBytes: formatStorageBytes});
        RHTaskCenter.init({ base: API_BASE, getToken: () => token, renderProgress: renderTaskProgress,
            stopBatch: stopReplacementBatch, onRetryQueued(id, status = 'pending') {
                const video = allVideos.find(item => item.id === id);
                if (video) video.status = status;
                updateFailedRetryButton();
            }});
    
