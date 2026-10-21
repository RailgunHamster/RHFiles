// Load declarations from the actual shipped scripts, without booting the UI.
// AST ranges survive comment/format changes and preserve original line numbers.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
export const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const sourceRoot = process.env.RHFILES_TEST_SOURCE_ROOT || root;
export const readSource = file => fs.readFileSync(path.join(sourceRoot, 'src/js', file), 'utf8');
export function context(extra = {}) {
  const RHFilesUI={listen:(node,...args)=>node?.addEventListener?.(...args.slice(0,3)),remove:(node,...args)=>node?.removeEventListener?.(...args.slice(0,3)),assign:(node,type,handler)=>node['on'+type]=handler};
  return vm.createContext({console, URL, Set, Map, setTimeout, clearTimeout, queueMicrotask, RHFilesUI, IS_MAC:false, FS_ROOT:'C:\\', ...extra});
}
export function load(ctx, file, names) {
  const source = readSource(file);
  if (!names) return vm.runInContext(source, ctx, {filename:file});
  const wanted = new Set(names), selected = [];
  for (const node of parse(source, {ecmaVersion:'latest',sourceType:'script'}).body) {
    const ids = node.type === 'FunctionDeclaration' ? [node.id.name]
      : node.type === 'VariableDeclaration' ? node.declarations.map(d=>d.id.name) : [];
    if (ids.some(id=>wanted.has(id))) {
      selected.push(node);
      ids.forEach(id=>wanted.delete(id));
    }
  }
  if (wanted.size) throw Error(`Missing production declarations in ${file}: ${[...wanted]}`);
  let selectedSource='', cursor=0;
  for (const node of selected) {
    selectedSource+=source.slice(cursor,node.start).replace(/[^\r\n]/g,' ')+source.slice(node.start,node.end);
    cursor=node.end;
  }
  return vm.runInContext(selectedSource,ctx,{filename:file});
}
export const plain = value => JSON.parse(JSON.stringify(value));
export function deferred() {
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
export function propertyOptions() {
  return {numRuns:Number(process.env.FC_RUNS || 250),
    ...(process.env.FC_SEED ? {seed:Number(process.env.FC_SEED)} : {}),
    ...(process.env.FC_PATH ? {path:process.env.FC_PATH} : {})};
}
