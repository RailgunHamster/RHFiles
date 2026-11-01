//! Session-local, identity-bound undo. Never infer ownership from a pathname.
use super::*;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Mutex, OnceLock};
type CopyEntry = (Location, Location, Snapshot, Snapshot);
enum State {
    Move {
        source: Location,
        target: Location,
        revision: String,
        at_target: bool,
    },
    Copy {
        entries: Vec<CopyEntry>,
        remaining: usize,
        at_target: bool,
    },
    Unavailable,
}
struct History {
    state: State,
    leases: Vec<FileLease>,
    bytes: usize,
}
static CACHE: OnceLock<Mutex<VecDeque<(String, History)>>> = OnceLock::new();
fn cache() -> &'static Mutex<VecDeque<(String, History)>> {
    CACHE.get_or_init(Default::default)
}
fn put(id: String, item: History) {
    let Ok(mut entries) = cache().lock() else {
        return;
    };
    entries.push_back((id, item));
    while entries.len() > 50 || entries.iter().map(|v| v.1.bytes).sum::<usize>() > 32 * 1024 * 1024
    {
        entries.pop_front();
    }
}
fn take(id: &str) -> Result<History, String> {
    let mut entries = cache().lock().map_err(|_| "[busy] 撤销记录不可用")?;
    let index = entries
        .iter()
        .position(|v| v.0 == id)
        .ok_or("[history_unavailable] 撤销记录已过期或正在执行，未重放操作")?;
    Ok(entries.remove(index).unwrap().1)
}
pub(super) fn record_move(
    source: Location,
    target: Location,
    revision: String,
    p: &Progress<'_>,
) -> Option<String> {
    let id = random().ok()?;
    let bytes = source.text().len() + target.text().len() + revision.len() + 512;
    put(
        id.clone(),
        History {
            state: State::Move {
                source,
                target,
                revision,
                at_target: true,
            },
            leases: p.leases.clone(),
            bytes,
        },
    );
    Some(id)
}
pub(super) fn record_copy(entries: Vec<CopyEntry>, p: &Progress<'_>) -> Option<String> {
    let bytes = entries
        .iter()
        .map(|(s, t, a, b)| {
            s.text().len() + t.text().len() + a.revision.len() + b.revision.len() + 256
        })
        .sum::<usize>();
    if entries.is_empty() || bytes > 32 * 1024 * 1024 {
        return None;
    }
    let id = random().ok()?;
    let remaining = entries.len();
    put(
        id.clone(),
        History {
            state: State::Copy {
                entries,
                remaining,
                at_target: true,
            },
            leases: p.leases.clone(),
            bytes,
        },
    );
    Some(id)
}
pub(super) async fn execute(
    action: &str,
    args: &Value,
    p: &mut Progress<'_>,
) -> Result<Value, String> {
    let id = field(args, "id")?.to_string();
    let mut item = take(&id)?;
    let undo = action == "undo_transfer";
    let result = async {
        for lease in &item.leases {
            lease.check()?;
            p.leases.push(lease.clone());
        }
        p.history = false;
        p.exclusive_target = true;
        match &mut item.state {
            State::Move {
                source,
                target,
                revision,
                at_target,
            } => {
                if *at_target != undo {
                    return Err("[history_state] 此操作已撤销或重做，未重复执行".into());
                }
                let (from, to) = if undo {
                    (target.clone(), source.clone())
                } else {
                    (source.clone(), target.clone())
                };
                if optional(&to).await?.is_some() {
                    return Err("[conflict] 原位置已有新对象，未合并或覆盖".into());
                }
                let result = transfer(from, to, true, false, None, Some(revision), p).await?;
                *revision = field(&result, "revision")?.into();
                *at_target = !undo;
            }
            State::Copy {
                entries,
                remaining,
                at_target,
            } => {
                if *at_target != undo {
                    return Err("[history_state] 此操作已撤销或重做，未重复执行".into());
                }
                if undo {
                    let expected_paths: HashSet<_> =
                        entries[..*remaining].iter().map(|v| v.1.text()).collect();
                    // Check the WHOLE surviving copy before the first deletion.
                    // A new descendant is never adopted into an old undo plan.
                    for (_, path, _, written) in &entries[..*remaining] {
                        hold(path, p)?;
                        let now = snapshot(path).await?;
                        if written.directory {
                            if !same_identity(&now.revision, &written.revision) {
                                return Err("[conflict] 复制的文件夹已被替换，未撤销".into());
                            }
                            for child in children(path).await? {
                                if !expected_paths.contains(&child.text()) {
                                    return Err("[conflict] 复制的文件夹中有新文件，未撤销".into());
                                }
                            }
                        } else {
                            expected(&now, Some(&written.revision))?;
                        }
                    }
                    p.operation = "delete".into();
                    p.items = *remaining as u64;
                    while *remaining > 0 {
                        let (_, path, _, written) = &entries[*remaining - 1];
                        p.check()?;
                        let fresh;
                        let stamp = if written.directory {
                            fresh = snapshot(path).await?;
                            if !same_identity(&fresh.revision, &written.revision) {
                                return Err("[conflict] 文件夹已被替换，未删除".into());
                            }
                            &fresh
                        } else {
                            written
                        };
                        remove_source(path, stamp, p).await?;
                        *remaining -= 1;
                        p.done += 1;
                        p.bytes += if stamp.directory { 0 } else { stamp.size };
                        p.emit("running", path, false);
                    }
                    *at_target = false;
                } else {
                    let (source, target, _, _) = entries
                        .first()
                        .ok_or("[history_unavailable] 撤销记录为空")?;
                    if optional(target).await?.is_some() {
                        return Err("[conflict] 重做目标已存在，未覆盖".into());
                    }
                    p.history_sources = Some(
                        entries
                            .iter()
                            .map(|(s, _, v, _)| (s.text(), v.revision.clone()))
                            .collect::<HashMap<_, _>>(),
                    );
                    p.history = true;
                    let result = transfer(
                        source.clone(),
                        target.clone(),
                        false,
                        false,
                        None,
                        Some(&entries[0].2.revision),
                        p,
                    )
                    .await?;
                    let replacement = if let Some(next) = result["historyId"].as_str() {
                        Some(take(next)?)
                    } else {
                        None
                    };
                    item.state = replacement.map(|h| h.state).unwrap_or(State::Unavailable);
                }
            }
            State::Unavailable => {
                return Err(
                    "[history_unavailable] 文件操作完成，但对象已变化或缺少版本证明，不能再次撤销"
                        .into(),
                )
            }
        }
        Ok(json!({"changed":true,"historyId":id}))
    }
    .await;
    // Keep the partial cursor on failure. No button silently restarts from item 1.
    put(id, item);
    result
}
