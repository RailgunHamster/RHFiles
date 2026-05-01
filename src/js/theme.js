// theme.js — dark/light theme toggle

function applyTheme(th) {
  G.theme = th || G.theme || 'light';
  document.documentElement.setAttribute('data-theme', G.theme);
  localStorage.setItem('rhfiles-theme', G.theme);
}
function toggleTheme() {
  G.theme = G.theme === 'light' ? 'dark' : 'light';
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
