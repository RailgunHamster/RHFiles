/* Untrusted formatting stays off the UI thread and has a host-enforced deadline. */
importScripts('../vendor/text-preview/marked.umd.js');
const escapeHtml=text=>text.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
marked.use({renderer:{html:token=>escapeHtml(token.text),image:token=>escapeHtml(token.text||'')}});
self.onmessage=event=>{
  try{
    const {text,mode}=event.data;if(typeof text!=='string'||text.length>256*1024)throw Error('文档较长，显示源码');
    if(mode==='formatted'){
      let depth=0,quote=false,escape=false;
      for(const character of text){if(quote){if(escape)escape=false;else if(character==='\\')escape=true;else if(character==='"')quote=false;}else if(character==='"')quote=true;else if(character==='{'||character==='['){if(++depth>64)throw Error('JSON 层级过深，显示原文');}else if(character==='}'||character===']')depth--;}
      const value=JSON.stringify(JSON.parse(text),null,2);if(value.length>1024*1024)throw Error('排版结果过大，显示原文');self.postMessage({text:value});
    }else{
      if(text.length>65536||text.split('\n').length>2000)throw Error('文档较长，分页显示源码');
      const html=marked.parse(text,{gfm:true,async:false});if(html.length>1024*1024)throw Error('排版结果过大，显示源码');self.postMessage({html});
    }
  }catch(error){self.postMessage({error:error instanceof SyntaxError?'JSON 格式不完整或无效，显示原文':error.message||'无法排版，显示源码'});}
};
