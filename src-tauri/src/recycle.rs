//! The current user's real Windows Recycle Bin. Clients submit opaque item IDs,
//! never filesystem paths. Destructive plans are bounded, expiring snapshots.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const MAX_ITEMS: usize = 50_000;
const MAX_BATCH: usize = MAX_ITEMS;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleItem {
    id: String,
    name: String,
    original_path: String,
    original_folder: String,
    is_directory: bool,
    size: Option<u64>,
    deleted_at: Option<i64>,
    item_type: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { items: Vec<RecycleItem>, total: usize, truncated: bool }
#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RestorePolicy { Skip, KeepBoth }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Completed { id: String, name: String, destination: Option<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure { id: String, name: String, code: String, message: String }
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome { completed: Vec<Completed>, skipped: Vec<Failure>, failed: Vec<Failure>, cancelled: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePlan { plan_id: String, count: usize, names: Vec<String> }
struct Pending { ids: Vec<String>, created: Instant }
static PLANS: LazyLock<Mutex<HashMap<String, Pending>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static MUTATION: Mutex<()> = Mutex::new(());

fn validate_ids(ids: &[String]) -> Result<(), String> {
    if ids.is_empty() || ids.len() > MAX_BATCH || ids.iter().any(|id| id.len()!=16 || !id.bytes().all(|c|c.is_ascii_hexdigit())) {
        return Err("Select between 1 and 50000 valid Recycle Bin items".into());
    }
    if ids.iter().collect::<HashSet<_>>().len()!=ids.len() { return Err("Duplicate Recycle Bin item IDs".into()); }
    Ok(())
}
fn take_plan(id: &str, confirmed: bool) -> Result<Vec<String>, String> {
    if !confirmed { return Err("Permanent deletion requires explicit confirmation".into()); }
    let mut plans=PLANS.lock().map_err(|_|"Recycle Bin plan lock failed")?;
    let plan=plans.remove(id).ok_or("Deletion plan is missing or has already been used")?;
    if plan.created.elapsed()>Duration::from_secs(300) { return Err("Deletion plan expired; review the items again".into()); }
    Ok(plan.ids)
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::hash::{BuildHasher, Hash, Hasher};
    use std::path::Path;
    use std::sync::Arc;
    use tauri::{Emitter, Manager};
    use windows::core::{implement, BSTR, HSTRING, Interface, PCWSTR, Ref, HRESULT};
    use windows::Win32::Foundation::E_ABORT;
    use windows::Win32::System::Com::{CoCreateGuid, CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Shell::*;

    static HASHER: LazyLock<std::collections::hash_map::RandomState> = LazyLock::new(Default::default);
    pub(super) struct Entry { pub item: RecycleItem, source: String, shell_item: IShellItem }
    pub(super) fn sta<T: Send+'static>(work: impl FnOnce()->Result<T,String>+Send+'static)->Result<T,String> {
        std::thread::Builder::new().name("RHFiles-Recycle".into()).spawn(move||{
            unsafe { CoInitializeEx(None,COINIT_APARTMENTTHREADED).ok().map_err(|e|format!("Recycle Bin COM: {e}"))?; }
            struct Guard; impl Drop for Guard {fn drop(&mut self){unsafe{CoUninitialize()}}}
            let _guard=Guard;work()
        }).map_err(|e|e.to_string())?.join().map_err(|_|"Recycle Bin worker stopped unexpectedly".to_string())?
    }
    fn string_property(item:&FolderItem2,name:&str)->String {
        unsafe{item.ExtendedProperty(&BSTR::from(name))}.ok().and_then(|v|BSTR::try_from(&v).ok()).map(|v|v.to_string()).unwrap_or_default()
    }
    pub(super) fn entries()->Result<(Vec<Entry>,usize),String> {
        let shell:IShellDispatch=unsafe{CoCreateInstance(&Shell,None,CLSCTX_INPROC_SERVER)}.map_err(|e|e.to_string())?;
        let bin=unsafe{shell.NameSpace(&VARIANT::from(10_i32))}.map_err(|e|format!("Cannot open Recycle Bin: {e}"))?;
        let collection=unsafe{bin.Items()}.map_err(|e|e.to_string())?;
        let count=unsafe{collection.Count()}.map_err(|e|e.to_string())?.max(0) as usize;
        let mut out=Vec::new();let mut ids=HashSet::new();
        for index in 0..count.min(MAX_ITEMS) {
            let item=unsafe{collection.Item(&VARIANT::from(index as i32))}.map_err(|e|format!("Cannot read Recycle Bin item: {e}"))?;
            let item2:FolderItem2=item.cast().map_err(|e|e.to_string())?;
            let source=unsafe{item.Path()}.map_err(|e|e.to_string())?.to_string();
            let folder=string_property(&item2,"System.Recycle.DeletedFrom");
            let name=string_property(&item2,"System.FileName");
            let name=if name.is_empty(){unsafe{item.Name()}.map_err(|e|e.to_string())?.to_string()}else{name};
            // Never manufacture a destination from incomplete Shell metadata.
            let mut components=Path::new(&name).components();
            if folder.is_empty() || !Path::new(&folder).is_absolute() || !matches!(components.next(),Some(std::path::Component::Normal(_))) || components.next().is_some() { continue; }
            let original=Path::new(&folder).join(&name).to_string_lossy().into_owned();
            let size=unsafe{item2.ExtendedProperty(&BSTR::from("System.Size"))}.ok().and_then(|v|u64::try_from(&v).ok());
            // Keep the namespace PIDL, not a physical $R path: the Recycle Bin
            // Shell item owns the original name, metadata and restore cleanup.
            let pidl=unsafe{SHGetIDListFromObject(&item)}.map_err(|e|e.to_string())?;
            let shell_result:windows::core::Result<IShellItem2>=unsafe{SHCreateItemFromIDList(pidl)};
            unsafe{CoTaskMemFree(Some(pidl.cast()))};
            let shell_item=shell_result.map_err(|e|e.to_string())?;
            let mut key=windows::Win32::Foundation::PROPERTYKEY::default();
            let deleted_at=unsafe{PropertiesSystem::PSGetPropertyKeyFromName(windows::core::w!("System.Recycle.DateDeleted"),&mut key)}.ok()
                .and_then(|_|unsafe{shell_item.GetFileTime(&key)}.ok())
                .map(|time|(((time.dwHighDateTime as u64)<<32)|time.dwLowDateTime as u64)/10000)
                .filter(|time|*time>0).map(|time|time as i64-11_644_473_600_000);
            let mut hash=HASHER.build_hasher();(&source,&original,deleted_at,size).hash(&mut hash);
            let id=format!("{:016x}",hash.finish());
            if !ids.insert(id.clone()) {return Err("Ambiguous Recycle Bin identity; refresh or use Windows Explorer".into());}
            out.push(Entry{source,shell_item:shell_item.cast().map_err(|e|e.to_string())?,item:RecycleItem{id,name,original_path:original,original_folder:folder,is_directory:unsafe{item.IsFolder()}.map_err(|e|e.to_string())?.as_bool(),size,deleted_at,item_type:string_property(&item2,"System.ItemTypeText")}});
        }
        Ok((out,count))
    }
    pub(super) fn token()->Result<String,String>{unsafe{CoCreateGuid()}.map(|g|format!("{g:?}")).map_err(|e|e.to_string())}
    fn shell_name(item:&IShellItem)->Option<String>{unsafe{
        let value=item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;let result=value.to_string().ok();CoTaskMemFree(Some(value.0.cast()));result
    }}
    type Receipt=Arc<Mutex<Option<Result<Option<String>,String>>>>;
    #[implement(IFileOperationProgressSink)]
    struct Observer { receipt:Receipt, progress:Box<dyn Fn(u32,u32)->bool+Send+Sync> }
    impl Observer_Impl {
        fn record(&self,result:HRESULT,item:Ref<'_,IShellItem>){
            if let Ok(mut receipt)=self.receipt.lock(){*receipt=Some(result.ok().map(|_|item.as_ref().and_then(shell_name)).map_err(|e|e.to_string()));}
        }
        fn tick(&self,total:u32,current:u32)->windows::core::Result<()>{if (self.progress)(total,current){Ok(())}else{Err(E_ABORT.into())}}
    }
    impl IFileOperationProgressSink_Impl for Observer_Impl {
        fn StartOperations(&self)->windows::core::Result<()>{self.tick(1,0)}
        fn FinishOperations(&self,_:HRESULT)->windows::core::Result<()>{Ok(())}
        fn PreRenameItem(&self,_:u32,_:Ref<'_,IShellItem>,_:&PCWSTR)->windows::core::Result<()>{Ok(())}
        fn PostRenameItem(&self,_:u32,_:Ref<'_,IShellItem>,_:&PCWSTR,_:HRESULT,_:Ref<'_,IShellItem>)->windows::core::Result<()>{Ok(())}
        fn PreMoveItem(&self,_:u32,_:Ref<'_,IShellItem>,_:Ref<'_,IShellItem>,_:&PCWSTR)->windows::core::Result<()>{self.tick(1,0)}
        fn PostMoveItem(&self,_:u32,_:Ref<'_,IShellItem>,_:Ref<'_,IShellItem>,_:&PCWSTR,result:HRESULT,item:Ref<'_,IShellItem>)->windows::core::Result<()>{self.record(result,item);Ok(())}
        fn PreCopyItem(&self,_:u32,_:Ref<'_,IShellItem>,_:Ref<'_,IShellItem>,_:&PCWSTR)->windows::core::Result<()>{Ok(())}
        fn PostCopyItem(&self,_:u32,_:Ref<'_,IShellItem>,_:Ref<'_,IShellItem>,_:&PCWSTR,_:HRESULT,_:Ref<'_,IShellItem>)->windows::core::Result<()>{Ok(())}
        fn PreDeleteItem(&self,_:u32,_:Ref<'_,IShellItem>)->windows::core::Result<()>{self.tick(1,0)}
        fn PostDeleteItem(&self,_:u32,_:Ref<'_,IShellItem>,result:HRESULT,item:Ref<'_,IShellItem>)->windows::core::Result<()>{self.record(result,item);Ok(())}
        fn PreNewItem(&self,_:u32,_:Ref<'_,IShellItem>,_:&PCWSTR)->windows::core::Result<()>{Ok(())}
        fn PostNewItem(&self,_:u32,_:Ref<'_,IShellItem>,_:&PCWSTR,_:&PCWSTR,_:u32,_:HRESULT,_:Ref<'_,IShellItem>)->windows::core::Result<()>{Ok(())}
        fn UpdateProgress(&self,total:u32,current:u32)->windows::core::Result<()>{self.tick(total,current)}
        fn ResetTimer(&self)->windows::core::Result<()>{Ok(())}
        fn PauseTimer(&self)->windows::core::Result<()>{Ok(())}
        fn ResumeTimer(&self)->windows::core::Result<()>{Ok(())}
    }
    fn operate(entry:&Entry,restore:bool,progress:Box<dyn Fn(u32,u32)->bool+Send+Sync>)->Result<Option<String>,String>{unsafe{
        let operation:IFileOperation=CoCreateInstance(&FileOperation,None,CLSCTX_INPROC_SERVER).map_err(|e|e.to_string())?;
        // Rename-on-collision is essential even after our conflict preflight:
        // another process could create the destination before PerformOperations.
        operation.SetOperationFlags(FILEOPERATION_FLAGS(FOF_SILENT.0|FOF_NOCONFIRMATION.0|FOF_NOERRORUI.0|FOF_NOCONFIRMMKDIR.0|FOFX_EARLYFAILURE.0|if restore{FOF_RENAMEONCOLLISION.0}else{0})).map_err(|e|e.to_string())?;
        let source=&entry.shell_item;
        let receipt:Receipt=Arc::new(Mutex::new(None));let observer:IFileOperationProgressSink=Observer{receipt:receipt.clone(),progress}.into();
        if restore {
            std::fs::create_dir_all(&entry.item.original_folder).map_err(|e|e.to_string())?;
            let parent:IShellItem=SHCreateItemFromParsingName(&HSTRING::from(&entry.item.original_folder),None).map_err(|e|e.to_string())?;
            operation.MoveItem(source,&parent,&HSTRING::from(&entry.item.name),&observer).map_err(|e|e.to_string())?;
        }else{operation.DeleteItem(source,&observer).map_err(|e|e.to_string())?;}
        operation.PerformOperations().map_err(|e|e.to_string())?;
        if operation.GetAnyOperationsAborted().map_err(|e|e.to_string())?.as_bool(){return Err("Operation cancelled".into());}
        if std::fs::symlink_metadata(&entry.source).is_ok(){return Err("Windows did not complete the operation; the item is still in Recycle Bin".into());}
        let result=receipt.lock().map_err(|_|"Recycle Bin result lock failed")?.take().ok_or("Windows did not report an item result")??;
        Ok(result)
    }}
    pub(super) fn mutate(ids:Vec<String>,restore:bool,policy:RestorePolicy,app:Option<tauri::AppHandle>,operation_id:String)->Result<Outcome,String>{
        validate_ids(&ids)?;let _serial=MUTATION.lock().map_err(|_|"Recycle Bin is busy")?;
        let (current,_)=entries()?;let by_id:HashMap<_,_>=current.into_iter().map(|e|(e.item.id.clone(),e)).collect();
        let mut outcome=Outcome::default();let count=ids.len();let started=Instant::now();
        for (index,id) in ids.into_iter().enumerate(){
            if app.as_ref().is_some_and(|app|app.try_state::<crate::types::CancelFlag>().is_some_and(|c|c.is_cancelled(Some(&operation_id)).unwrap_or(false))){outcome.cancelled=true;break;}
            let Some(entry)=by_id.get(&id)else{outcome.skipped.push(Failure{id,name:String::new(),code:"missing".into(),message:"Item has changed or is no longer in Recycle Bin".into()});continue;};
            if restore && policy==RestorePolicy::Skip && std::fs::symlink_metadata(&entry.item.original_path).is_ok(){
                outcome.skipped.push(Failure{id,name:entry.item.name.clone(),code:"conflict".into(),message:entry.item.original_path.clone()});continue;
            }
            let event_app=app.clone();let event_id=operation_id.clone();let name=entry.item.name.clone();let path=entry.item.original_path.clone();let last=Mutex::new(Instant::now()-Duration::from_secs(1));
            let result=operate(entry,restore,Box::new(move|total,done|{
                let Some(app)=&event_app else{return true;};
                if app.try_state::<crate::types::CancelFlag>().is_some_and(|c|c.is_cancelled(Some(&event_id)).unwrap_or(false)){return false;}
                if let Ok(mut stamp)=last.lock(){if done<total&&stamp.elapsed()<Duration::from_millis(100){return true;}*stamp=Instant::now();}
                let fraction=if total==0{0.0}else{(done as f64/total as f64).clamp(0.0,1.0)};
                let _=app.emit("op-progress",serde_json::json!({"operationId":event_id,"operation":if restore{"recycle-restore"}else{"recycle-delete"},"status":"progress","currentName":name,"currentPath":path,"entriesCompleted":index,"totalEntries":count,"percentage":(index as f64+fraction)*100.0/count as f64,"elapsedSeconds":started.elapsed().as_secs_f64()}));true
            }));
            match result {
                Ok(destination)=>outcome.completed.push(Completed{id,name:entry.item.name.clone(),destination}),
                Err(message)=>{
                    if app.as_ref().is_some_and(|app|app.try_state::<crate::types::CancelFlag>().is_some_and(|c|c.is_cancelled(Some(&operation_id)).unwrap_or(false))){outcome.cancelled=true;break;}
                    outcome.failed.push(Failure{id,name:entry.item.name.clone(),code:"failed".into(),message});
                },
            }
        }
        Ok(outcome)
    }
}

#[tauri::command(async)]
pub fn recycle_bin_list()->Result<Snapshot,String>{
    #[cfg(windows)] {platform::sta(||{let(items,total)=platform::entries()?;Ok(Snapshot{truncated:total>items.len(),total,items:items.into_iter().map(|e|e.item).collect()})})}
    #[cfg(not(windows))] {Err("This Recycle Bin view is currently available on Windows".into())}
}
#[tauri::command(async)]
pub fn recycle_bin_prepare_delete(ids:Vec<String>)->Result<DeletePlan,String>{
    validate_ids(&ids)?;
    #[cfg(windows)] {platform::sta(move||{
        let(current,_)=platform::entries()?;let by_id:HashMap<_,_>=current.into_iter().map(|e|(e.item.id.clone(),e.item)).collect();
        if ids.iter().any(|id|!by_id.contains_key(id)){return Err("An item changed or disappeared; refresh and review the selection".into());}
        let names=ids.iter().take(20).map(|id|by_id[id].name.clone()).collect();let count=ids.len();let plan_id=platform::token()?;
        let mut plans=PLANS.lock().map_err(|_|"Recycle Bin plan lock failed")?;plans.retain(|_,p|p.created.elapsed()<Duration::from_secs(300));
        if plans.len()>=8{return Err("Too many pending confirmations; close an earlier confirmation".into());}
        plans.insert(plan_id.clone(),Pending{ids,created:Instant::now()});Ok(DeletePlan{plan_id,count,names})
    })}
    #[cfg(not(windows))] {Err("Recycle Bin is only available on Windows".into())}
}
#[tauri::command]
pub fn recycle_bin_discard_plan(plan_id:String){if let Ok(mut plans)=PLANS.lock(){plans.remove(&plan_id);}}
fn mutate(ids:Vec<String>,restore:bool,policy:RestorePolicy,operation_id:String,app:tauri::AppHandle)->Result<Outcome,String>{
    validate_ids(&ids)?;if operation_id.is_empty()||operation_id.len()>128{return Err("Invalid operation ID".into());}
    use tauri::Manager;
    let cancel=app.state::<crate::types::CancelFlag>();cancel.reset(Some(&operation_id))?;
    #[cfg(windows)] let result={let app=app.clone();let id=operation_id.clone();platform::sta(move||platform::mutate(ids,restore,policy,Some(app),id))};
    #[cfg(not(windows))] let result={let _=(ids,restore,policy);Err("Recycle Bin is only available on Windows".into())};
    cancel.clear(Some(&operation_id));result
}
#[tauri::command(async)]
pub fn recycle_bin_restore(ids:Vec<String>,policy:RestorePolicy,operation_id:String,app:tauri::AppHandle)->Result<Outcome,String>{mutate(ids,true,policy,operation_id,app)}
#[tauri::command(async)]
pub fn recycle_bin_delete(plan_id:String,confirmed:bool,operation_id:String,app:tauri::AppHandle)->Result<Outcome,String>{mutate(take_plan(&plan_id,confirmed)?,false,RestorePolicy::Skip,operation_id,app)}

#[tauri::command]
pub fn recycle_bin_open_system()->Result<(),String>{
    #[cfg(windows)] {unsafe{
        use windows::Win32::UI::{Shell::ShellExecuteW,WindowsAndMessaging::SW_SHOWNORMAL};
        let result=ShellExecuteW(None,windows::core::w!("open"),windows::core::w!("shell:RecycleBinFolder"),None,None,SW_SHOWNORMAL);
        if result.0 as isize<=32 {Err(format!("Cannot open Windows Recycle Bin: {}",result.0 as isize))}else{Ok(())}
    }}
    #[cfg(not(windows))] {Err("Windows Recycle Bin is unavailable".into())}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_paths_empty_duplicate_or_oversized_batches(){
        for ids in [vec![],vec!["C:\\Windows".into()],vec!["0123456789abcdef".into();2],vec!["0123456789abcdef".into();MAX_BATCH+1]]{assert!(validate_ids(&ids).is_err());}
        assert!(validate_ids(&["0123456789abcdef".into()]).is_ok());
    }
    #[test] fn destructive_plans_require_confirmation_expire_and_are_one_use(){
        let mut plans=PLANS.lock().unwrap();
        plans.insert("test-live".into(),Pending{ids:vec!["owned".into()],created:Instant::now()});
        plans.insert("test-expired".into(),Pending{ids:vec![],created:Instant::now()-Duration::from_secs(301)});drop(plans);
        assert!(take_plan("test-live",false).is_err());assert_eq!(take_plan("test-live",true).unwrap(),vec!["owned"]);
        assert!(take_plan("test-live",true).is_err());assert!(take_plan("test-expired",true).is_err());
    }
    // Never empty the user's bin. Every destructive test resolves IDs belonging
    // exclusively to this newly-created TempDir and passes only those IDs.
    #[cfg(windows)]
    #[test]
    fn real_shell_restore_conflicts_duplicate_names_and_scoped_delete(){
        use std::path::Path;
        fn recycle(path:&Path)->RecycleItem {
            rhfiles_core::enumerator::delete_to_recycle_bin(path).unwrap();
            let wanted=path.to_string_lossy().into_owned();
            platform::sta(move||{let(items,_)=platform::entries()?;items.into_iter().find(|e|e.item.original_path==wanted).map(|e|e.item).ok_or("Owned fixture missing from Recycle Bin".into())}).unwrap()
        }
        fn run(ids:Vec<String>,restore:bool,policy:RestorePolicy)->Outcome{
            platform::sta(move||platform::mutate(ids,restore,policy,None,"owned-recycle-qa".into())).unwrap()
        }
        let temporary=tempfile::tempdir().unwrap();
        // TEMP can contain ADMINI~1; Shell returns the long spelling. Compare
        // canonical destinations, not two different spellings of the same path.
        let canonical=std::fs::canonicalize(temporary.path()).unwrap();
        let root_path=std::path::PathBuf::from(canonical.to_string_lossy().trim_start_matches(r"\\?\"));
        struct OwnedCleanup(std::path::PathBuf);
        impl Drop for OwnedCleanup {fn drop(&mut self){let root=self.0.clone();let _=platform::sta(move||{let(entries,_)=platform::entries()?;let ids:Vec<_>=entries.into_iter().filter(|e|Path::new(&e.item.original_path).starts_with(&root)).map(|e|e.item.id).collect();if !ids.is_empty(){platform::mutate(ids,false,RestorePolicy::Skip,None,"owned-fixture-cleanup".into())?;}Ok(())});}}
        let root=OwnedCleanup(root_path);
        impl OwnedCleanup {fn path(&self)->&Path{&self.0}}
        let file=root.path().join("中文 # 文档.txt");std::fs::write(&file,"fixture-original").unwrap();let item=recycle(&file);
        assert_eq!(item.name,"中文 # 文档.txt");assert!(!item.is_directory);assert_eq!(item.size,Some(16));
        let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
        assert!(item.deleted_at.is_some_and(|value|(now-value).abs()<300_000),"Wrong deletion timestamp: {:?}, expected near {now}",item.deleted_at);
        std::fs::write(&file,"new-live-file").unwrap();
        let skipped=run(vec![item.id.clone()],true,RestorePolicy::Skip);assert_eq!(skipped.skipped.len(),1);assert_eq!(std::fs::read_to_string(&file).unwrap(),"new-live-file");
        let restored=run(vec![item.id.clone()],true,RestorePolicy::KeepBoth);assert_eq!(restored.completed.len(),1,"{}",serde_json::to_string(&restored).unwrap());
        let recovered=restored.completed[0].destination.as_ref().expect("Shell must report the actual recovered path");
        assert_ne!(Path::new(recovered),file);assert!(Path::new(recovered).starts_with(root.path()));assert_eq!(std::fs::read_to_string(recovered).unwrap(),"fixture-original");assert_eq!(std::fs::read_to_string(&file).unwrap(),"new-live-file");
        let stale=run(vec![item.id],false,RestorePolicy::Skip);assert_eq!(stale.skipped.len(),1);

        let folder=root.path().join("文件夹");std::fs::create_dir_all(folder.join("嵌套")).unwrap();std::fs::write(folder.join("嵌套/old.txt"),"old-folder").unwrap();let folder_item=recycle(&folder);assert!(folder_item.is_directory);
        std::fs::create_dir(&folder).unwrap();std::fs::write(folder.join("live.txt"),"keep-live-folder").unwrap();
        assert_eq!(run(vec![folder_item.id.clone()],true,RestorePolicy::Skip).skipped.len(),1);
        let result=run(vec![folder_item.id],true,RestorePolicy::KeepBoth);assert_eq!(result.completed.len(),1,"{}",serde_json::to_string(&result).unwrap());
        assert_eq!(std::fs::read_to_string(Path::new(result.completed[0].destination.as_ref().unwrap()).join("嵌套/old.txt")).unwrap(),"old-folder");assert_eq!(std::fs::read_to_string(folder.join("live.txt")).unwrap(),"keep-live-folder");assert!(!folder.join("嵌套").exists());

        let duplicate=root.path().join("same.txt");std::fs::write(&duplicate,"first").unwrap();let first=recycle(&duplicate);
        std::fs::write(&duplicate,"second").unwrap();rhfiles_core::enumerator::delete_to_recycle_bin(&duplicate).unwrap();
        let wanted=duplicate.to_string_lossy().into_owned();let first_id=first.id.clone();
        let second=platform::sta(move||{let(items,_)=platform::entries()?;items.into_iter().find(|e|e.item.original_path==wanted&&e.item.id!=first_id).map(|e|e.item).ok_or("Duplicate fixture missing".into())}).unwrap();
        assert_ne!(first.id,second.id);assert_eq!(run(vec![first.id],true,RestorePolicy::Skip).completed.len(),1);assert_eq!(std::fs::read_to_string(&duplicate).unwrap(),"first");
        std::fs::remove_file(&duplicate).unwrap();assert_eq!(run(vec![second.id],true,RestorePolicy::Skip).completed.len(),1);assert_eq!(std::fs::read_to_string(&duplicate).unwrap(),"second");

        let old=root.path().join("purge-owned.txt");std::fs::write(&old,"owned-delete").unwrap();let old=recycle(&old);
        let plan=recycle_bin_prepare_delete(vec![old.id.clone()]).unwrap();
        let late_path=root.path().join("arrived-after-confirmation.txt");std::fs::write(&late_path,"keep-new-arrival").unwrap();let late=recycle(&late_path);
        assert_eq!(run(take_plan(&plan.plan_id,true).unwrap(),false,RestorePolicy::Skip).completed.len(),1);
        assert_eq!(run(vec![late.id],true,RestorePolicy::Skip).completed.len(),1);assert_eq!(std::fs::read_to_string(&late_path).unwrap(),"keep-new-arrival");
        assert!(take_plan(&plan.plan_id,true).is_err());
    }
}
