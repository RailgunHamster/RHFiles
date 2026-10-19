/* Text-only release notes: bundled history is independent of update availability. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.releaseNotes=factory();})(globalThis,()=>{
  const heading=/^(?:RHFiles Android\s+\d|此前版本改进\s*\/\s*Previous improvements)/i;
  function format(value){
    const lines=String(value||'').replace(/\\r\\n|\\n/g,'\n').replace(/\r\n?/g,'\n').split('\n');
    const result=[];let count=0;
    for(const raw of lines){const line=raw.trim();if(!line){if(result.at(-1)!=='')result.push('');continue;}
      if(heading.test(line)){count=0;result.push(line);continue;}
      // Respect authored list items; split old paragraph-style Chinese notes too.
      const numbered=/^\d+[.)、．]\s*/.test(line);
      const text=line.replace(/^(?:[-*•]\s+|\d+[.)、．]\s*)/,'');
      const items=numbered?[text]:text.split(/(?<=[。！？])\s*|(?<=[.!?])\s+(?=[A-Z])/u).filter(Boolean);
      for(const item of items)result.push(`${++count}. ${item}`);
    }
    return result.join('\n').trim();
  }
  function sections(value){
    const result=[];let current;
    for(const line of String(value||'').replace(/\r\n?/g,'\n').split('\n')){
      if(heading.test(line.trim())){current={title:line.trim(),lines:[]};result.push(current);}
      else {if(!current){current={title:'更新记录',lines:[]};result.push(current);}current.lines.push(line);}
    }
    return result.filter(item=>item.lines.some(line=>line.trim())).map(item=>({title:item.title,text:format(item.lines.join('\n'))}));
  }
  return {format,sections};
});
