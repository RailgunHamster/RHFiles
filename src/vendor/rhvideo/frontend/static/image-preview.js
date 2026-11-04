/* Shared image preview. Existing galleries can keep their own interactions. */
(() => {
    'use strict';
    let dialog, image, returnFocus, escapeHeld = false;
    function ensureDialog() {
        if (dialog) return;
        dialog = document.createElement('dialog');
        dialog.id = 'image-preview';
        dialog.setAttribute('aria-label', '全屏图片预览');
        dialog.innerHTML = `<img alt="" decoding="async" draggable="false">
            <div class="image-preview-status" role="status">正在加载预览…</div>
            <button type="button" class="image-preview-close" aria-label="关闭图片预览" autofocus>×</button>
            <div class="image-preview-caption"><span class="image-preview-title"></span><span>点击任意位置或按 <kbd>ESC</kbd> 关闭</span></div>`;
        document.body.appendChild(dialog);
        image = dialog.querySelector('img');
        image.onload = () => { if (dialog.open) dialog.classList.remove('is-loading', 'is-error'); };
        image.onerror = () => {
            if (!dialog.open) return;
            dialog.classList.remove('is-loading'); dialog.classList.add('is-error');
            dialog.querySelector('.image-preview-status').textContent = '预览图暂时无法加载';
        };
        dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    }
    function close() {
        if (!dialog?.open) return;
        dialog.close();
        image.removeAttribute('src');
        image.alt = '';
        dialog.querySelector('.image-preview-title').textContent = '';
        document.documentElement.classList.remove('image-preview-open');
        document.body.classList.remove('image-preview-open');
        if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({preventScroll:true});
        returnFocus = null;
    }
    function open(source) {
        const url = source.currentSrc || source.getAttribute('src');
        if (!url || source.complete && !source.naturalWidth) return;
        ensureDialog();
        returnFocus = source.closest('button, a, [tabindex]') || document.activeElement;
        const title = source.alt || source.closest('[data-image-preview]')?.dataset.previewTitle
            || source.closest('.tc-item, .video-card, .screenshot-item')?.querySelector('strong, h3, .fname')?.textContent || '图片预览';
        dialog.querySelector('.image-preview-title').textContent = title;
        dialog.querySelector('.image-preview-status').textContent = '正在加载预览…';
        dialog.classList.remove('is-error'); dialog.classList.add('is-loading');
        image.alt = title; image.src = url;
        document.documentElement.classList.add('image-preview-open');
        document.body.classList.add('image-preview-open');
        dialog.showModal();
    }
    function sourceAt(target) {
        // A transparent slideshow layer can receive the click over the visible one.
        const slideshow = target.closest('#kenburns-stage, #favshow-stage');
        if (slideshow) {
            const opacity = node => Number(getComputedStyle(node.closest('.favshow-layer') || node).opacity);
            const visible = [...slideshow.querySelectorAll('img, video')].sort((a,b) => opacity(b)-opacity(a))[0];
            return visible?.tagName === 'IMG' && opacity(visible) > 0 ? visible : null;
        }
        const direct = target.closest('img');
        if (direct) return direct;
        const owner = target.closest('[data-image-preview]');
        const control = target.closest('button,a,input,select,textarea,label,[role="button"]');
        // Empty markers designate a thumbnail hit area. Viewer on/off markers
        // only configure image clicks, and must not swallow its action buttons.
        return owner?.getAttribute('data-image-preview') === '' && (!control || control === owner) ? owner.querySelector('img') : null;
    }
    document.addEventListener('click', event => {
        if (dialog?.open) {
            if (dialog.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
            return;
        }
        if (event.button !== 0 || !(event.target instanceof Element)) return;
        if (event.target.closest('[data-image-preview="off"]')) return;
        // In selection mode the entire video row remains a checkbox.
        if (event.target.closest('#videos-grid .video-card.is-selecting')) return;
        const source = sourceAt(event.target);
        if (!source || !(source.currentSrc || source.getAttribute('src')) || source.complete && !source.naturalWidth) return;
        event.preventDefault(); event.stopImmediatePropagation(); open(source);
    }, true);
    // Capture before task dialogs, players and their shortcuts; closing this layer
    // must never close a parent viewer or submit its actions as well.
    window.addEventListener('keydown', event => {
        if (dialog?.open && document.activeElement?.closest('dialog[open]') !== dialog) return;
        if (event.key === 'Escape' && (dialog?.open || escapeHeld)) {
            event.preventDefault(); event.stopImmediatePropagation(); escapeHeld = true; close(); return;
        }
        if (dialog?.open) event.stopImmediatePropagation();
    }, true);
    window.addEventListener('keyup', event => {
        if (event.key === 'Escape' && escapeHeld) { escapeHeld = false; event.stopImmediatePropagation(); }
        else if (dialog?.open) event.stopImmediatePropagation();
    }, true);
    window.addEventListener('blur', () => { escapeHeld = false; });
    window.RHImagePreview = {open,close};
})();
