/* The preview and the queued task use the same literal/regex replacement plan. */
const mobileBatchRename = (() => {
  function parent(entry) {
    return entry.parentPath || (!entry.path.startsWith('content://') && fmt.parentOf(entry.path));
  }
  function selection(paths, listing) {
    if (!paths.length || paths.length > 1000 || new Set(paths).size !== paths.length)
      throw Error('请选择 1 至 1000 个不同的文件或文件夹');
    const byPath = new Map(listing.map(e => [e.path, e]));
    const entries = paths.map(path => {
      const e = byPath.get(path);
      if (!e || e.libraryAlbum || !parent(e)) throw Error('请在实际文件列表中选择要改名的项目');
      return e;
    });
    const key = (dir, name) => JSON.stringify([dir.replace(/\/+$/, ''), name]);
    const occupied = new Set(listing.filter(e => parent(e)).map(e => key(parent(e), e.name)));
    return rules => {
      const rows = [], changes = [], targets = new Set();
      if (!rules.find) return {rows, changes, error:''};
      let pattern;
      try {
        const find = rules.regex ? rules.find : rules.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(find, rules.caseSensitive ? 'g' : 'gi');
      } catch { return {rows, changes, error:'正则表达式无效'}; }
      let error = '';
      for (const e of entries) {
        const name = e.name.replace(pattern, rules.replace);
        const dir = parent(e), target = key(dir, name);
        let problem = '';
        if (name !== e.name) {
          if (!name.trim() || name === '.' || name === '..' || name.length > 240 || /[\\/\x00-\x1f]/.test(name))
            problem = '文件名无效';
          else if (occupied.has(target) || targets.has(target)) problem = '目标名称已被占用';
          targets.add(target);
          changes.push({path:e.path, parent:dir, oldName:e.name, name, ...(e.revision ? {revision:e.revision} : {})});
        }
        if (problem && !error) error = (name || e.name) + ' · ' + problem;
        rows.push({oldName:e.name, name, problem});
      }
      return {rows, changes, error};
    };
  }

  function open(plan, submit) {
    if (!ui.openSheet('批量重命名', [])) return;
    const panel = document.getElementById('sheet-panel');
    const form = ui.el('form', 'batch-rename-form');
    const field = (text, type) => {
      const label = ui.el('label', type === 'checkbox' ? 'batch-toggle' : 'batch-field', text);
      const input = ui.el('input');
      input.type = type;
      if (type === 'checkbox') label.prepend(input); else label.append(input);
      return [label, input];
    };
    const [findLabel, find] = field('查找', 'text');
    const [replaceLabel, replace] = field('替换为', 'text');
    const [regexLabel, regex] = field('正则表达式', 'checkbox');
    const [caseLabel, letterCase] = field('区分大小写', 'checkbox');
    const options = ui.el('div', 'batch-options');
    options.append(regexLabel, caseLabel);
    const status = ui.el('div', 'batch-summary');
    status.setAttribute('aria-live', 'polite');
    const preview = ui.el('div', 'batch-preview'), buttons = ui.el('div', 'button-row');
    const cancel = ui.el('button', '', '取消'), apply = ui.el('button', 'primary', '重命名');
    cancel.type = 'button'; apply.type = 'submit'; buttons.append(cancel, apply);
    form.append(findLabel, replaceLabel, options, status, preview, buttons);
    panel.append(form);
    const rules = () => ({find:find.value, replace:replace.value, regex:regex.checked, caseSensitive:letterCase.checked});
    let sending = false;
    function paint() {
      const {rows, changes, error} = plan(rules());
      status.textContent = error || (find.value ? '将修改 ' + changes.length + ' 项，共 ' + rows.length + ' 项' : '');
      status.classList.toggle('danger', !!error);
      apply.disabled = sending || !!error || !changes.length;
      preview.replaceChildren(...rows.map(row => {
        const line = ui.el('div', 'batch-preview-row');
        line.append(ui.el('span','muted',row.oldName),ui.el('span',row.problem ? 'danger' : '',
          row.problem ? (row.name || '（空）') + ' · ' + row.problem : row.name === row.oldName ? '保持原名' : row.name));
        return line;
      }));
    }
    RHFilesUI.listen(form,'input',paint,undefined,'android.batchRename.preview');
    RHFilesUI.listen(cancel,'click',()=>ui.closeSheet(),undefined,'android.batchRename.close');
    RHFilesUI.listen(form,'submit',async event=>{
      event.preventDefault();
      if (sending || apply.disabled) return;
      sending = true; apply.disabled = true;
      try {
        await submit(plan(rules()));
        if (form.isConnected) ui.closeSheet();
      } catch (err) {
        status.textContent = err.message || String(err);
        status.classList.add('danger');
        apply.disabled = false;
      } finally { sending = false; }
    },undefined,'android.batchRename.submit');
    paint();
    find.focus({preventScroll:true});
  }
  return {selection, open};
})();
