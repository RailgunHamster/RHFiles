/* Read-only, bounded JSON tree shared by the desktop and Android viewers. */
(function(root, factory) {
  const preview = factory();
  if (typeof module === 'object' && module.exports) module.exports = preview;
  else root.RHFilesJsonTree = preview;
})(globalThis, () => {
  const MAX_CHARS = 256 * 1024;
  const MAX_DEPTH = 64;
  const MAX_NODES = 20000;
  const PAGE_SIZE = 64;

  function parse(source, truncated = false) {
    if (truncated) return { error: 'incomplete' };
    if (source.length > MAX_CHARS) return { error: 'limit' };
    const text = source.replace(/^\uFEFF/, '');
    try { JSON.parse(text); }
    catch { return { error: 'invalid' }; }

    // JSON.parse validates the syntax. Index the original tokens so the tree
    // keeps source order, repeated keys and exact number spellings.
    const tokens = /[{}\[\],:]|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;
    let token = tokens.exec(text)?.[0];
    let count = 0;
    const take = () => {
      const value = token;
      token = tokens.exec(text)?.[0];
      return value;
    };

    function read(depth) {
      if (depth > MAX_DEPTH || ++count > MAX_NODES) throw new RangeError();
      const value = take();
      if (value !== '[' && value !== '{') return { value };
      const array = value === '[';
      const close = array ? ']' : '}';
      const children = [];
      while (token !== close) {
        const key = array ? '[' + children.length + ']' : take();
        if (!array) take(); // colon
        children.push({ key, node: read(depth + 1) });
        if (token === ',') take();
      }
      take();
      return { value, children };
    }

    try { return { node: read(0) }; }
    catch (error) {
      if (error instanceof RangeError) return { error: 'limit' };
      throw error;
    }
  }

  function mount(host, result, labels) {
    const document = host.ownerDocument;
    function element(tag, className, text) {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function row(model, key, open = false) {
      const branch = model.children?.length > 0;
      const line = element(branch ? 'summary' : 'div', 'json-tree-row');
      if (key !== undefined) line.append(element('span', 'json-tree-key', key + ': '));
      const value = model.children
        ? (model.value === '[' ? (branch ? '[…]' : '[]') : (branch ? '{…}' : '{}'))
        : model.value;
      const kind = model.children ? 'container' : value.startsWith('"') ? 'string'
        : /^[-0-9]/.test(value) ? 'number' : 'literal';
      line.append(element('span', 'json-tree-value json-tree-' + kind, value));
      if (!branch) return line;

      line.append(element('span', 'json-tree-count', labels.count(model.children.length)));
      const details = element('details', 'json-tree-branch');
      const body = element('div', 'json-tree-children');
      details.append(line, body);

      let offset = 0;
      function showPage(start) {
        offset = start;
        const end = Math.min(offset + PAGE_SIZE, model.children.length);
        const children = model.children.slice(offset, end).map(({ key, node }) => row(node, key));
        if (model.children.length > PAGE_SIZE) {
          const pager = element('div', 'json-tree-pager');
          const previous = element('button', 'json-tree-page', labels.previous);
          const next = element('button', 'json-tree-page', labels.next);
          previous.type = next.type = 'button';
          previous.disabled = offset === 0;
          next.disabled = end === model.children.length;
          const go = (start, forward) => {
            showPage(start);
            const buttons = body.querySelectorAll(':scope > .json-tree-pager > button');
            const preferred = buttons[forward ? 1 : 0];
            (preferred.disabled ? buttons[forward ? 0 : 1] : preferred).focus();
          };
          RHFilesUI.listen(previous, 'click', () => go(offset - PAGE_SIZE, false), undefined, 'json.tree.previous');
          RHFilesUI.listen(next, 'click', () => go(end, true), undefined, 'json.tree.next');
          pager.append(previous, element('span', 'json-tree-count', (offset + 1) + '–' + end + ' / ' + model.children.length), next);
          children.push(pager);
        }
        body.replaceChildren(...children);
      }
      function showBranch() {
        if (details.open) showPage(offset);
        else body.replaceChildren();
      }
      RHFilesUI.listen(line, 'click', event => {
        event.preventDefault();
        details.open = !details.open;
        showBranch();
      }, undefined, 'json.tree.branch');
      details.open = open;
      if (open) showBranch();
      return details;
    }
    host.replaceChildren(result.error
      ? element('p', 'json-tree-message', labels[result.error])
      : row(result.node, undefined, true));
  }
  return { parse, mount };
});
