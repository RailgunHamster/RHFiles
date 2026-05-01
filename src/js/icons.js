// icons.js — file icon SVGs

function fileIcon(file) {
  if (file.is_dir) return '<svg viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5h4.5L7.5 6h7v7h-13V4.5z" stroke="#dcb67a" stroke-width="1" stroke-linejoin="round"/><path d="M1.5 6.5h13" stroke="#dcb67a" stroke-width=".7" opacity=".5"/></svg>';
  const ext = file.extension.toLowerCase();
  const colors = {
    txt:"#666", md:"#666", rs:"#dea584", py:"#3776ab", js:"#f7df1e", ts:"#3178c6",
    json:"#5b5b5b", toml:"#9c4221", yaml:"#cb171e", xml:"#e37933", yml:"#cb171e",
    png:"#28a745", jpg:"#28a745", jpeg:"#28a745", gif:"#28a745", svg:"#ff9900", webp:"#28a745", bmp:"#28a745", ico:"#28a745",
    zip:"#6c757d", rar:"#6c757d", "7z":"#6c757d", tar:"#6c757d", gz:"#6c757d",
    mp3:"#e91e63", wav:"#e91e63", flac:"#e91e63", ogg:"#e91e63",
    mp4:"#9c27b0", mkv:"#9c27b0", avi:"#9c27b0", webm:"#9c27b0",
    pdf:"#d32f2f", doc:"#2b579a", docx:"#2b579a", xls:"#217346", xlsx:"#217346", ppt:"#d24726", pptx:"#d24726",
    exe:"#0078d4", msi:"#0078d4", dll:"#0078d4",
    html:"#e34c26", css:"#264de4", scss:"#cf649a",
    sh:"#333", bat:"#333", ps1:"#0078d4",
    c:"#555", cpp:"#659ad2", h:"#555", hpp:"#659ad2",
    java:"#b07219", go:"#00add8", rb:"#cc342d", php:"#777bb4", swift:"#ffac45", kt:"#a97bff", lua:"#00007c",
    sql:"#e38c00", lock:"#666",
  };
  const c = colors[ext] || "#888";
  return `<svg viewBox="0 0 16 16" fill="none"><path d="M4.5 1.5h4.6l3.4 3.4v9.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" stroke="${c}" stroke-width=".9"/><path d="M9 1.5V5h3.5" stroke="${c}" stroke-width=".9"/></svg>`;
}

function bigFileIcon(file) {
  return fileIcon(file).replace('viewBox="0 0 16 16"','viewBox="0 0 48 48"').replace(/width="1"/g,'width="2.5"').replace(/stroke-width=".9"/g,'stroke-width="2"').replace(/stroke-width="1"/g,'stroke-width="2.5"');
}

function fileTypeLabel(file) {
  if (file.is_dir) return "File folder";
  const ext = file.extension.toUpperCase();
  if (!ext) return "File";
  const labels = {
    TXT: "Text Document", MD: "Markdown", RS: "Rust Source", PY: "Python File", JS: "JavaScript", TS: "TypeScript",
    JSON: "JSON File", TOML: "TOML", YAML: "YAML", XML: "XML",
    PNG: "PNG Image", JPG: "JPEG Image", GIF: "GIF Image", SVG: "SVG Image",
    ZIP: "ZIP Archive", RAR: "RAR Archive", "7Z": "7Z Archive",
    MP3: "MP3 Audio", MP4: "MP4 Video",
    PDF: "PDF Document", DOC: "Word Document", DOCX: "Word Document",
    EXE: "Application", DLL: "Library",
    HTML: "HTML File", CSS: "CSS File",
  };
  return labels[ext] || ext + " File";
}

function tagColor(idx) {
  const colors = ["#0078d4","#28a745","#e91e63","#ff9800","#9c27b0","#00bcd4","#795548","#607d8b"];
  return colors[idx % colors.length];
}
