package com.railgunhamster.rhfiles

import org.json.JSONObject

/** A group offset and lease can be identical after A -> B -> A. Controls
 * captured before navigation/rotation must also own the decoder input(s). */
internal object RhVideoGridInputs {
  fun check(inputs:List<Long>,target:Int,args:JSONObject){
    fun id(value:Any):Long {
      require(value is Number&&value.toDouble().isFinite()&&value.toDouble()>=1&&value.toDouble()==value.toLong().toDouble()){"播放输入标识无效"}
      return value.toLong()
    }
    if(args.has("expectedInput")){
      val index=if(args.has("inputTarget"))args.getInt("inputTarget")else target
      require(index in inputs.indices&&inputs[index]==id(args.get("expectedInput"))){"播放输入已改变，请重新读取状态"}
    }
    if(args.has("expectedInputs")){
      val expected=args.getJSONArray("expectedInputs")
      require(inputs.isNotEmpty()&&expected.length()==inputs.size&&(0 until expected.length()).all{inputs[it]==id(expected.get(it))}){"同屏播放输入已改变，请重新读取状态"}
    }
  }
}
