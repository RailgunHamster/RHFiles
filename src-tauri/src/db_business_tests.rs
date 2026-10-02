use super::*;
use crate::test_support::TestDir;

#[test]
fn favorites_save_failure_is_atomic_and_preserves_order() {
    let temp = TestDir::new("favorites");
    let conn = open_db(&temp.0.join("db.sqlite")).unwrap();
    let previous = vec![
        ("C:\\文档".into(), "文档".into()),
        ("\\\\server\\share".into(), "服务器".into()),
    ];
    save_pinned(&conn, &previous).unwrap();
    let invalid = vec![
        ("D:\\new".into(), "First".into()),
        ("D:\\new".into(), "Duplicate".into()),
    ];
    assert!(save_pinned(&conn, &invalid).is_err());
    assert_eq!(load_pinned(&conn).unwrap(), previous);
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
}

#[test]
fn favorites_reorder_and_clear_persist_across_reopen() {
    let temp = TestDir::new("favorites-restart");
    let path = temp.0.join("db.sqlite");
    let entries = vec![
        ("C:\\emoji 📁".into(), "My files".into()),
        ("D:\\e\u{301}".into(), "资料".into()),
    ];
    {
        let conn = open_db(&path).unwrap();
        save_pinned(&conn, &entries).unwrap();
    }
    let conn = open_db(&path).unwrap();
    assert_eq!(load_pinned(&conn).unwrap(), entries);
    let reversed: Vec<_> = entries.into_iter().rev().collect();
    save_pinned(&conn, &reversed).unwrap();
    drop(conn);
    let conn = open_db(&path).unwrap();
    assert_eq!(load_pinned(&conn).unwrap(), reversed);
    save_pinned(&conn, &[]).unwrap();
    assert!(load_pinned(&conn).unwrap().is_empty());
}

#[test]
fn separate_profile_databases_do_not_share_favorites() {
    let temp = TestDir::new("profile-db");
    let a = open_db(&temp.0.join("desktop-a.sqlite")).unwrap();
    let b = open_db(&temp.0.join("desktop-b.sqlite")).unwrap();
    save_pinned(&a, &[("C:\\private".into(), "A".into())]).unwrap();
    assert!(load_pinned(&b).unwrap().is_empty());
    save_pinned(&b, &[("D:\\other".into(), "B".into())]).unwrap();
    assert_eq!(load_pinned(&a).unwrap()[0].1, "A");
}
