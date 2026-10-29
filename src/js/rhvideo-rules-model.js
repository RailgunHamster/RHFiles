/* Local tag-editor state. Rules retain the shared reference normalizer. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoRulesModel=value;})(globalThis,()=>{
  'use strict';
  const sorts=['count-desc','name-asc','name-desc','recent'];
  function settings(value={}){value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};return {sort:sorts.includes(value.sort)?value.sort:'count-desc',recent:Array.isArray(value.recent)?[...new Set(value.recent.filter(v=>typeof v==='string'&&v.length<=1024))].slice(0,30):[],collapsed:{all:!!value.collapsed?.all}};}
  class Editor{
    constructor(tags){this.tags=tags;this.revision=0;this.path=[];this.rule=tags.normalize();this.signature=JSON.stringify(this.rule);}
    reset(){this.revision++;this.path=[];this.rule=this.tags.normalize();this.signature=JSON.stringify(this.rule);return this.snapshot();}
    sync(rule){const next=this.tags.normalize(rule),signature=JSON.stringify(next);if(signature!==this.signature){this.rule=next;this.signature=signature;this.revision++;if(!this.node(this.path))this.path=[];}return this.snapshot();}
    node(path=this.path,root=this.rule){if(!Array.isArray(path)||path.length>this.tags.MAX_DEPTH||path.some(v=>!Number.isInteger(v)||v<0))return null;let node=root;for(const i of path)node=node?.groups?.[i];return node||null;}
    guard(revision){if(revision!==undefined&&revision!==this.revision)throw Error('筛选条件已改变，旧操作未执行');}
    select(path,revision){this.guard(revision);if(!this.node(path))throw Error('标签分组已不存在');this.path=[...path];return this.snapshot();}
    edit(action,args={}){
      this.guard(args.expectedRevision);const rule=structuredClone(this.rule),path=args.path??this.path,node=this.node(path,rule);if(!node)throw Error('标签分组已不存在');let selected=[...this.path];
      if(action==='mode'){if(!['and','or'].includes(args.value))throw Error('标签组合方式必须是 AND 或 OR');node.mode=args.value;}
      else if(action==='add'){node.groups??=[];node.groups.push({mode:'or',include:[],exclude:[]});selected=[...path,node.groups.length-1];}
      else if(action==='remove'){if(!path.length)throw Error('不能移除主条件，请使用清除筛选');const parent=this.node(path.slice(0,-1),rule);parent.groups.splice(path.at(-1),1);selected=path.slice(0,-1);}
      else if(action==='tag'){
        const kind=args.kind??'include',label=typeof args.label==='string'?args.label.trim():'';if(!['include','exclude'].includes(kind)||!label||label.includes(',')||[...label].length>255)throw Error('标签名称或类型无效');
        const other=kind==='include'?'exclude':'include',enabled=args.enabled??!node[kind].includes(label);node[kind]=node[kind].filter(v=>v!==label);if(enabled){node[kind].push(label);node[other]=node[other].filter(v=>v!==label);}
      }else if(action==='clear'){selected=[];return {rule:this.tags.normalize({mode:this.rule.mode}),path:selected};}
      else throw Error('未知标签编辑操作');
      // Validate before either the tree or selection can be published. Limits
      // and include/exclude precedence are exactly RHTagFilter's, not a copy.
      return {rule:this.tags.normalize(rule),path:selected};
    }
    accept(candidate){this.sync(candidate.rule);this.path=this.node(candidate.path)?[...candidate.path]:[];return this.snapshot();}
    snapshot(){return {revision:this.revision,rule:structuredClone(this.rule),path:[...this.path],expression:this.tags.describe(this.rule),active:this.tags.active(this.rule),terms:this.tags.terms(this.rule).length};}
  }
  return {Editor,settings,sorts};
});
