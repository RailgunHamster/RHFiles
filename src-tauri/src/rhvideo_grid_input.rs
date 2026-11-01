//! Decoder identities, not video IDs or cell indices, fence a held Grid action.
use serde_json::Value;

const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

fn identity(value: &Value) -> Result<u64, String> {
    value.as_u64().filter(|v| (1..=MAX_SAFE_INTEGER).contains(v))
        .ok_or_else(|| "同屏输入标识无效".into())
}

pub(crate) fn check(args: &Value, inputs: &[u64]) -> Result<(), String> {
    if let Some(expected) = args.get("expectedInputs") {
        let expected = expected.as_array().filter(|v| (1..=9).contains(&v.len()))
            .ok_or("同屏输入组无效")?;
        let expected = expected.iter().map(identity).collect::<Result<Vec<_>, _>>()?;
        if expected != inputs { return Err("同屏输入已改变，旧操作未执行".into()); }
    }
    if let Some(expected) = args.get("expectedInput") {
        let expected = identity(expected)?;
        let target = args["inputTarget"].as_u64().filter(|v| *v < 9)
            .ok_or("同屏输入目标无效")? as usize;
        if inputs.get(target) != Some(&expected) {
            return Err("同屏输入已改变，旧操作未执行".into());
        }
    } else if args.get("inputTarget").is_some() {
        return Err("同屏输入目标缺少输入标识".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn optional_single_guard_remains_compatible() {
        assert!(check(&json!({}), &[]).is_ok());
        assert!(check(&json!({"expectedInput":11,"inputTarget":1}), &[10,11]).is_ok());
        assert!(check(&json!({"expectedInput":10,"inputTarget":1}), &[10,11]).is_err());
    }

    #[test]
    fn aggregate_guard_requires_the_complete_ordered_input_set() {
        let args = json!({"expectedInputs":[10,11]});
        assert!(check(&args, &[10,11]).is_ok());
        for actual in [&[10,12][..], &[11,10], &[10], &[10,11,12], &[]] {
            assert!(check(&args, actual).is_err(), "{actual:?}");
        }
    }

    #[test]
    fn decoder_replacement_rejects_a_b_a_even_for_the_same_video() {
        assert!(check(&json!({"expectedInputs":[10,11]}), &[14,15]).is_err());
        assert!(check(&json!({"expectedInput":10,"inputTarget":0}), &[14,15]).is_err());
    }

    #[test]
    fn combined_guards_validate_both_the_origin_and_aggregate() {
        assert!(check(&json!({"expectedInputs":[10,11],"expectedInput":10,"inputTarget":0}), &[10,11]).is_ok());
        assert!(check(&json!({"expectedInputs":[10,11],"expectedInput":11,"inputTarget":0}), &[10,11]).is_err());
        assert!(check(&json!({"expectedInputs":[9,11],"expectedInput":10,"inputTarget":0}), &[10,11]).is_err());
    }

    #[test]
    fn malformed_guards_never_disable_validation() {
        for invalid in [json!(null), json!(0), json!("10"), json!([]), json!([0]), json!([-1]), json!([1.5]), json!([null]), json!(["10"]), json!([MAX_SAFE_INTEGER+1]), json!([10,11,12,13,14,15,16,17,18,19])] {
            assert!(check(&json!({"expectedInputs":invalid}), &[10,11]).is_err());
        }
        for invalid in [json!(null), json!(0), json!(-1), json!(1.5), json!("10"), json!(MAX_SAFE_INTEGER+1)] {
            assert!(check(&json!({"expectedInput":invalid,"inputTarget":0}), &[10,11]).is_err());
        }
        for invalid in [json!(null), json!(-1), json!(9), json!(0.5), json!("0")] {
            assert!(check(&json!({"expectedInput":10,"inputTarget":invalid}), &[10,11]).is_err());
        }
        assert!(check(&json!({"inputTarget":0}), &[10,11]).is_err());
    }
}
