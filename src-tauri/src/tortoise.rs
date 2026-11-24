use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Component, Path, PathBuf, Prefix};
use std::process::Command;
use tempfile::NamedTempFile;
use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Client {
    Git,
    Svn,
}

impl Client {
    fn installation(self) -> Option<PathBuf> {
        let (product, exe) = match self {
            Self::Git => ("TortoiseGit", "TortoiseGitProc.exe"),
            Self::Svn => ("TortoiseSVN", "TortoiseProc.exe"),
        };
        let key = RegKey::predef(HKEY_LOCAL_MACHINE);
        for prefix in [r"SOFTWARE", r"SOFTWARE\WOW6432Node"] {
            if let Ok(key) = key.open_subkey(format!(r"{prefix}\{product}")) {
                if let Ok(value) = key.get_value::<String, _>("ProcPath") {
                    let path = PathBuf::from(value);
                    if path.is_absolute()
                        && path
                            .file_name()
                            .is_some_and(|name| name.eq_ignore_ascii_case(exe))
                        && path.is_file()
                    {
                        return Some(path);
                    }
                }
            }
        }
        ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"]
            .iter()
            .filter_map(std::env::var_os)
            .map(|base| PathBuf::from(base).join(product).join("bin").join(exe))
            .find(|path| path.is_absolute() && path.is_file())
    }
}

// Only fixed, documented commands can be launched. Scope is checked again on invocation.
#[derive(Clone, Copy, PartialEq)]
enum Scope {
    Selection,
    Single,
    File,
    Directory,
    Worktree,
}

fn actions(client: Client) -> impl Iterator<Item = (&'static str, Scope)> {
    use Scope::*;
    let common = [
        ("commit", Selection),
        ("log", Single),
        ("diff", Single),
        ("repostatus", Directory),
        ("add", Selection),
        ("revert", Selection),
        ("blame", File),
    ];
    let specific: &[(&str, Scope)] = match client {
        Client::Git => &[
            ("pull", Worktree),
            ("push", Worktree),
            ("fetch", Worktree),
            ("switch", Worktree),
            ("branch", Worktree),
            ("merge", Worktree),
        ],
        Client::Svn => &[
            ("update", Selection),
            ("repobrowser", Single),
            ("switch", Directory),
            ("merge", Directory),
            ("cleanup", Directory),
        ],
    };
    common.into_iter().chain(specific.iter().copied())
}

fn valid_path(value: &str) -> bool {
    let path = Path::new(value);
    path.is_absolute()
        && matches!(path.components().next(), Some(Component::Prefix(p)) if matches!(p.kind(), Prefix::Disk(_) | Prefix::UNC(_, _)))
        && !value.contains(['"', '*', '\0', '\r', '\n'])
        && path.components().all(|c| {
            c != Component::ParentDir
                && ![".git", ".svn"]
                    .iter()
                    .any(|name| c.as_os_str().eq_ignore_ascii_case(name))
        })
}

// Scan once per distinct selected directory, including Git worktree/submodule pointer files.
fn roots(directory: &Path) -> [Option<PathBuf>; 2] {
    let mut roots = [None, None];
    for parent in directory.ancestors() {
        if roots[0].is_none() && is_git_worktree(parent) {
            roots[0] = Some(parent.to_owned());
        }
        if roots[1].is_none() {
            let admin = parent.join(".svn");
            if admin.join("wc.db").is_file() || admin.join("entries").is_file() {
                roots[1] = Some(parent.to_owned());
            }
        }
        if roots.iter().all(Option::is_some) {
            break;
        }
    }
    roots
}

fn is_git_worktree(directory: &Path) -> bool {
    let admin = directory.join(".git");
    let Ok(meta) = admin.metadata() else {
        return false;
    };
    if meta.is_dir() {
        return admin.join("HEAD").is_file();
    }
    let mut prefix = [0; 7];
    meta.is_file()
        && std::fs::File::open(admin)
            .and_then(|mut f| f.read_exact(&mut prefix))
            .is_ok()
        && &prefix == b"gitdir:"
}

struct Selection {
    roots: [Option<PathBuf>; 2],
    single: bool,
    file: bool,
}

impl Selection {
    fn inspect(paths: &[String]) -> Option<Self> {
        if paths.is_empty() || !paths.iter().all(|path| valid_path(path)) {
            return None;
        }
        let mut seen = HashMap::new();
        let mut common = [None, None];
        let mut file = false;
        for (i, value) in paths.iter().enumerate() {
            let path = Path::new(value);
            let meta = path.metadata().ok()?;
            file = meta.is_file();
            let dir = if meta.is_dir() { path } else { path.parent()? };
            let current = seen.entry(dir).or_insert_with(|| roots(dir));
            if i == 0 {
                common = current.clone();
            } else {
                for (root, candidate) in common.iter_mut().zip(current.iter()) {
                    if root != candidate {
                        *root = None;
                    }
                }
            }
            if common.iter().all(Option::is_none) {
                return None;
            }
        }
        Some(Self {
            roots: common,
            single: paths.len() == 1,
            file,
        })
    }

    fn root(&self, client: Client) -> Option<&Path> {
        self.roots[match client {
            Client::Git => 0,
            Client::Svn => 1,
        }]
        .as_deref()
    }

    fn accepts(&self, scope: Scope) -> bool {
        match scope {
            Scope::Selection => true,
            Scope::Single | Scope::Worktree => self.single,
            Scope::File => self.single && self.file,
            Scope::Directory => self.single && !self.file,
        }
    }
}

#[derive(Serialize)]
pub struct Menu {
    client: Client,
    actions: Vec<&'static str>,
}

fn available_actions(paths: &[String]) -> Vec<Menu> {
    let Some(selection) = Selection::inspect(paths) else {
        return Vec::new();
    };
    [Client::Git, Client::Svn]
        .into_iter()
        .filter(|&client| selection.root(client).is_some() && client.installation().is_some())
        .map(|client| Menu {
            client,
            actions: actions(client)
                .filter(|(_, scope)| selection.accepts(*scope))
                .map(|(name, _)| name)
                .collect(),
        })
        .collect()
}

#[tauri::command]
pub async fn tortoise_actions(paths: Vec<String>) -> Result<Vec<Menu>, String> {
    tauri::async_runtime::spawn_blocking(move || available_actions(&paths))
        .await
        .map_err(|e| e.to_string())
}

// Tortoise reads one UTF-16LE path per LF, without a BOM. A path file also avoids
// the Windows command-line length limit when committing a large selection.
fn write_path_list(paths: &[String]) -> std::io::Result<NamedTempFile> {
    let mut file = NamedTempFile::new()?;
    {
        let mut writer = std::io::BufWriter::new(&mut file);
        for path in paths {
            for unit in path.encode_utf16().chain([10]) {
                writer.write_all(&unit.to_le_bytes())?;
            }
        }
        writer.flush()?;
    }
    Ok(file)
}

fn path_option(option: &str, path: &OsStr) -> std::ffi::OsString {
    // Tortoise parses the raw Windows command line and expects quotes around
    // the value after the colon. A normal Command::arg quotes the whole switch.
    let mut arg = std::ffi::OsString::from(format!("/{option}:\""));
    arg.push(path);
    arg.push("\"");
    arg
}

#[tauri::command]
pub async fn tortoise_open(
    client: Client,
    action: String,
    paths: Vec<String>,
) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || launch(client, action, paths))
        .await
        .map_err(|e| e.to_string())?
}

fn launch(client: Client, action: String, paths: Vec<String>) -> Result<u32, String> {
    let selection =
        Selection::inspect(&paths).ok_or("No common working copy for this selection")?;
    let root = selection
        .root(client)
        .ok_or("Selection is outside this working copy")?;
    let (_, scope) = actions(client)
        .find(|(name, scope)| *name == action && selection.accepts(*scope))
        .ok_or("Tortoise action is unavailable for this selection")?;
    let exe = client
        .installation()
        .ok_or("Tortoise client is not installed")?;
    let mut command = Command::new(exe);
    command.arg(format!("/command:{action}"));
    let pathfile = if selection.single {
        let target = if scope == Scope::Worktree {
            root
        } else {
            Path::new(&paths[0])
        };
        command.raw_arg(path_option("path", target.as_os_str()));
        None
    } else {
        let temp = write_path_list(&paths)
            .map_err(|e| e.to_string())?
            .into_temp_path();
        command
            .raw_arg(path_option("pathfile", temp.as_os_str()))
            .arg("/deletepathfile");
        Some(temp)
    };
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let pid = child.id();
    if let Some(temp) = pathfile {
        std::thread::spawn(move || {
            let _ = child.wait();
            drop(temp); // Clean up even if Tortoise exited before reading the list.
        });
    }
    Ok(pid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detects_selected_worktree_including_git_pointers_and_nested_working_copies() {
        let temp = tempfile::tempdir().unwrap();
        let outer = temp.path();
        let nested = outer.join("子 project");
        fs::create_dir_all(outer.join(".git")).unwrap();
        fs::write(outer.join(".git/HEAD"), "ref: refs/heads/main").unwrap();
        fs::create_dir_all(nested.join(".svn")).unwrap();
        fs::write(nested.join(".svn/wc.db"), "").unwrap();
        fs::write(nested.join(".git"), "gitdir: ../.git/modules/sub").unwrap();
        let file = nested.join("a & b.txt");
        fs::write(&file, "").unwrap();
        let selected = |p: &Path| p.to_str().unwrap().to_owned();
        let single = Selection::inspect(&[selected(&file)]).unwrap();
        assert_eq!(single.root(Client::Git), Some(nested.as_path()));
        assert_eq!(single.root(Client::Svn), Some(nested.as_path()));
        assert!(single.accepts(Scope::File));
        assert!(!single.accepts(Scope::Directory));
        let multi = Selection::inspect(&[selected(&file), selected(&nested)]).unwrap();
        assert!(multi.accepts(Scope::Selection));
        assert!(!multi.accepts(Scope::Worktree));
        assert!(Selection::inspect(&[selected(outer), selected(&file)]).is_none());
        assert!(Selection::inspect(&[selected(&nested.join(".git"))]).is_none());
        assert!(!valid_path(r"rh://WINSERVER/D/repo"));
        assert!(!valid_path(r"C:\repo\a*b"));
        assert!(!valid_path(r"C:\repo\..\other"));
        assert!(launch(Client::Git, "not-a-command".into(), vec![selected(&file)]).is_err());
    }

    #[test]
    fn path_file_preserves_every_selected_name_in_tortoise_format() {
        let paths = vec![
            r"C:\中文 项目\a & b.txt".to_owned(),
            r"C:\中文 项目\🐢.txt".to_owned(),
        ];
        let file = write_path_list(&paths).unwrap();
        let bytes = fs::read(file.path()).unwrap();
        let units: Vec<_> = bytes
            .chunks_exact(2)
            .map(|p| u16::from_le_bytes([p[0], p[1]]))
            .collect();
        assert_eq!(
            String::from_utf16(&units).unwrap(),
            format!("{}\n{}\n", paths[0], paths[1])
        );
    }
}
