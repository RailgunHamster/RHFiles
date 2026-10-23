/* Checkbox settings share a serial write queue, not a full-page re-render.
 * A failed last write restores the most recently committed state. */
const settingsAutoSave=(()=>{
  const pending=new Set();
  function bind({root,fields,save,status=()=>{},normalize=value=>value,id}){
    const read=()=>Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,!!field.checked]));
    const render=value=>{for(const [key,field]of Object.entries(fields))field.checked=!!value[key];};
    let committed=read(),revision=0,tail=Promise.resolve();
    for(const [key,field]of Object.entries(fields)){
      field.setAttribute('data-setting',id+'.'+key);
      RHFilesUI.listen(field,'change',()=>{
        const value=normalize(read(),key),ticket=++revision;render(value);status('saving');
        const operation=tail.then(async()=>{
          try{
            await save({...value});committed={...value};
            if(ticket===revision)status('saved');
            return {saved:true};
          }catch(error){
            const message=String(error?.message||error);
            if(ticket===revision){render(committed);status('error',message);}
            return {saved:false,error:message};
          }
        });
        tail=operation;
        const entry={root,promise:operation};pending.add(entry);
        operation.then(()=>pending.delete(entry));
        return operation;
      },undefined,id+'.'+key);
    }
  }
  async function flush(root){
    for(;;){const batch=[...pending].filter(entry=>!root||entry.root===root||root.contains?.(entry.root));if(!batch.length)return;await Promise.all(batch.map(entry=>entry.promise));}
  }
  return {bind,flush};
})();
