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
