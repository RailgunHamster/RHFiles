package com.railgunhamster.rhfiles

import org.json.JSONArray
import org.json.JSONObject

/** The shared, reference-derived JS model owns grouping. Native code validates
 * and consumes its plan; it must not regroup the same pool as a square grid. */
internal class RhVideoGridPlan(entries:List<JSONObject>,fallbackCount:Int) {
  val groups:List<IntRange>
  val rects:List<List<Double>>
  init {
    require(entries.isNotEmpty()&&fallbackCount in 1..9){"同屏队列无效"}
    require(entries.map{it.getString("id")}.toSet().size==entries.size){"同屏队列包含重复视频"}
    val planned=entries.any{it.has("gridRect")||it.has("gridEnd")}
    val ranges=mutableListOf<IntRange>();val layouts=mutableListOf<List<Double>>()
    if(planned){
      var start=0
      entries.forEachIndexed { index,row ->
        val rect=row.getJSONArray("gridRect");require(rect.length()==4){"同屏布局无效"}
        val values=(0..3).map{rect.getDouble(it)}
        require(values.all{it.isFinite()}&&values[0]>=0&&values[1]>=0&&values[2]>0&&values[3]>0&&values[0]+values[2]<=1.002&&values[1]+values[3]<=1.002){"同屏布局越界"}
        require(row.get("gridEnd") is Boolean){"同屏分组标记无效"};layouts.add(values)
        require(index-start<9){"每组最多九个视频"}
        if(row.getBoolean("gridEnd")){ranges.add(start..index);start=index+1}
      }
      require(start==entries.size){"同屏分组没有结束"}
    }else{
      for(start in entries.indices step fallbackCount){
        val end=(start+fallbackCount).coerceAtMost(entries.size);ranges.add(start until end)
        val columns=kotlin.math.ceil(kotlin.math.sqrt((end-start).toDouble())).toInt();val rows=(end-start+columns-1)/columns
        for(index in start until end)layouts.add(listOf(((index-start)%columns).toDouble()/columns,((index-start)/columns).toDouble()/rows,1.0/columns,1.0/rows))
      }
    }
    groups=ranges;rects=layouts
  }
  fun groupAt(offset:Int):Int=groups.indexOfFirst{it.first==offset}.also{require(it>=0){"同屏分组位置无效"}}
  fun restore(entries:List<JSONObject>,saved:JSONArray?):Int {
    val ids=if(saved==null)emptyList()else (0 until saved.length()).map{saved.optString(it)}
    return groups.firstOrNull{range->range.map{entries[it].getString("id")}==ids}?.first?:0
  }
}
