// theme.js — dark/light theme toggle + custom theme

function applyTheme(th) {
  G.theme = th || G.theme || 'light';
  if (G.theme === 'custom') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', G.theme);
  }
  localStorage.setItem('rhfiles-theme', G.theme);
  applyCustomTheme();
}

function toggleTheme() {
  if (G.theme === 'light') G.theme = 'dark';
  else if (G.theme === 'dark') G.theme = 'light';
  applyTheme(G.theme);
}

G.theme = localStorage.getItem('rhfiles-theme') || 'light';
applyTheme(G.theme);

G.windowEffect = localStorage.getItem('rhfiles-window-effect') || 'none';
if (G.windowEffect !== 'none') {
  applyWindowEffect(G.windowEffect);
}

async function applyWindowEffect(effect) {
  G.windowEffect = effect;
  localStorage.setItem('rhfiles-window-effect', effect);
  if (effect === 'none') {
    document.body.classList.remove('mica-active');
  } else {
    document.body.classList.add('mica-active');
  }
  try { await call("set_window_effect", { effect }); } catch (e) {}
}

function applyCustomTheme() {
  let styleEl = document.getElementById('custom-theme');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-theme';
    document.head.appendChild(styleEl);
  }
  const theme = localStorage.getItem('rhfiles-custom-theme');
  if (theme) {
    styleEl.textContent = theme;
  } else {
    styleEl.textContent = '';
  }
}

applyCustomTheme();
