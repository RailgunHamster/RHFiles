package com.railgunhamster.rhfiles

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.addCallback
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

/** Real independent Media3 players; URI capabilities contain no bearer token. */
@UnstableApi
class RhVideoGridActivity:AppCompatActivity(){
  companion object {private var active=WeakReference<RhVideoGridActivity>(null)
    fun state():JSONObject=active.get()?.snapshot()?:error("多视频没有打开")
    fun control(args:JSONObject):JSONObject=active.get()?.control(args)?:error("多视频没有打开")
    fun close():JSONObject{active.get()?.finish();return JSONObject().put("closed",true)}
  }
  private val players=mutableListOf<ExoPlayer>()
  private val views=mutableListOf<PlayerView>()
  private val containers=mutableListOf<FrameLayout>()
  private val rendered=mutableSetOf<Int>()
  private val errors=mutableMapOf<Int,String>()
  private lateinit var grid:GridLayout
  private lateinit var target:Spinner
  private var expanded=-1
  private var selected=-1
  private var position=emptyList<Long>()
  private var stopped=true
  private var offset=0
  private lateinit var previous:Button
  private lateinit var next:Button
  private val client by lazy{RhVideoClient.get(this)}
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState);NativeAutomation.install(this);active=WeakReference(this)
    onBackPressedDispatcher.addCallback(this){if(expanded>=0)control(JSONObject().put("command","expand").put("target",-1))else finish()}
    offset=savedInstanceState?.getInt("offset")?:0
    if(offset>0)intent.putExtra("items",client.gridWindow(intent.getStringExtra("playlist")?:"",offset,intent.getIntExtra("count",4),intent.getBooleanExtra("super",false)).getJSONArray("items").toString())
    val entries=JSONArray(intent.getStringExtra("items")?:"[]");require(entries.length() in 1..9)
    val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.BLACK)}
    grid=GridLayout(this);root.addView(grid,LinearLayout.LayoutParams(-1,0,1f))
    val toolbar=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(12,8,12,8);setBackgroundColor(0xfff5f7fb.toInt())}
    target=Spinner(this);target.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,listOf("全部视频")+(0 until entries.length()).map{(it+1).toString()+" · "+entries.getJSONObject(it).getString("name")});toolbar.addView(target)
    target.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,index:Int,id:Long){selected=index-1}}
    val buttons=LinearLayout(this)
    for((label,command)in listOf("播放" to "resume","暂停" to "pause","展开" to "expand","网格" to "restore"))buttons.addView(Button(this).apply{text=label;setOnClickListener{try{control(JSONObject().put("target",if(command=="restore")-1 else if(command=="expand")selected.coerceAtLeast(0)else selected).put("command",if(command=="restore")"expand"else command))}catch(e:Exception){Toast.makeText(this@RhVideoGridActivity,e.message,Toast.LENGTH_LONG).show()}}},LinearLayout.LayoutParams(0,-2,1f))
    toolbar.addView(buttons)
    val pages=LinearLayout(this)
    previous=Button(this).apply{text="上一组";setOnClickListener{page(-1)}}
    next=Button(this).apply{text="下一组";setOnClickListener{page(1)}}
    pages.addView(previous,LinearLayout.LayoutParams(0,-2,1f));pages.addView(next,LinearLayout.LayoutParams(0,-2,1f));toolbar.addView(pages);updatePages()
    fun slider(label:String,max:Int,initial:Int,command:String){val row=LinearLayout(this);row.addView(TextView(this).apply{text=label});row.addView(SeekBar(this).apply{this.max=max;progress=initial;setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{override fun onProgressChanged(s:SeekBar?,v:Int,user:Boolean){};override fun onStartTrackingTouch(s:SeekBar?){};override fun onStopTrackingTouch(s:SeekBar?){try{val value=(s?.progress?:0).toDouble();control(JSONObject().put("target",selected).put("command",command).put("value",if(command=="rate")value.coerceAtLeast(25.0)/100 else value))}catch(e:Exception){Toast.makeText(this@RhVideoGridActivity,e.message,Toast.LENGTH_SHORT).show()}}})},LinearLayout.LayoutParams(0,-2,1f));toolbar.addView(row)}
    slider("进度",1000,0,"seekRatio");slider("音量",100,100,"volume");slider("速度",400,100,"rate");root.addView(toolbar);setContentView(root)
    position=savedInstanceState?.getLongArray("positions")?.toList()?:List(entries.length()){0L};layout()
  }
  private fun layout(){val count=JSONArray(intent.getStringExtra("items")?:"[]").length();val columns=if(expanded>=0)1 else kotlin.math.ceil(kotlin.math.sqrt(count.toDouble())).toInt();grid.removeAllViews();grid.columnCount=columns;grid.rowCount=if(expanded>=0)1 else (count+columns-1)/columns;for((i,v)in containers.withIndex()){v.visibility=if(expanded<0||i==expanded)View.VISIBLE else View.GONE;val j=if(expanded>=0)0 else i;v.layoutParams=GridLayout.LayoutParams(GridLayout.spec(j/columns,1f),GridLayout.spec(j%columns,1f)).apply{width=0;height=0;setMargins(3,3,3,3)};grid.addView(v)}}
  override fun onStart(){super.onStart();active=WeakReference(this);startPlayers()}
  private fun startPlayers(){if(!stopped)return;stopped=false;val entries=JSONArray(intent.getStringExtra("items")?:"[]");val storage=NativeStorage(applicationContext);layout()
    for(i in 0 until entries.length()){val item=entries.getJSONObject(i);val engine=ExoPlayer.Builder(this,DefaultRenderersFactory(this).setEnableDecoderFallback(true)).setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(this,DataSource.Factory{MediaRoutingDataSource(this,storage.remote)}))).build();val view=PlayerView(this).apply{player=engine;controllerShowTimeoutMs=2500;controllerAutoShow=false;contentDescription="视频 ${i+1} · ${item.getString("name")}"};players.add(engine);views.add(view);val container=FrameLayout(this);val message=TextView(this).apply{setTextColor(Color.WHITE);setBackgroundColor(0xcc151b27.toInt());setPadding(16,16,16,16);visibility=View.GONE};container.addView(view,FrameLayout.LayoutParams(-1,-1));container.addView(message,FrameLayout.LayoutParams(-1,-2,android.view.Gravity.CENTER));containers.add(container);grid.addView(container);engine.addListener(object:Player.Listener{override fun onRenderedFirstFrame(){rendered.add(i)};override fun onPlayerError(e:PlaybackException){errors[i]=e.errorCodeName;message.text="视频 ${i+1} 播放失败\n${e.errorCodeName}\n${e.cause?.message?:e.message?:""}";message.visibility=View.VISIBLE}});RhVideoVolume.track(engine,if(i==0)1f else 0f);engine.setMediaItem(MediaItem.fromUri(item.getString("path")),position.getOrElse(i){0L});engine.prepare();engine.play();view.hideController()};layout()
  }
  private fun updatePages(){val total=intent.getIntExtra("total",JSONArray(intent.getStringExtra("items")?:"[]").length());val count=intent.getIntExtra("count",4);previous.isEnabled=offset>0;next.isEnabled=offset+count<total}
  private fun page(direction:Int){try{control(JSONObject().put("command","page").put("value",direction))}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show()}}
  fun snapshot()=JSONObject().put("offset",offset).put("total",intent.getIntExtra("total",players.size)).put("count",intent.getIntExtra("count",players.size)).put("hasPrevious",previous.isEnabled).put("hasNext",next.isEnabled).put("expanded",if(expanded<0)JSONObject.NULL else expanded).put("target",selected).put("cells",JSONArray(players.mapIndexed{i,p->JSONObject().put("playing",p.isPlaying).put("rendered",i in rendered).put("positionMs",p.currentPosition).put("durationMs",if(p.duration==C.TIME_UNSET)0 else p.duration).put("rate",p.playbackParameters.speed).put("volume",(RhVideoVolume.local(p)*100).toInt()).put("decoderVolume",p.volume*100).put("tracks",PlayerTracks.state(p.currentTracks,p.trackSelectionParameters)).put("error",errors[i]?:JSONObject.NULL)}))
  fun control(args:JSONObject):JSONObject {
    if(args.has("expectedOffset"))require(args.getInt("expectedOffset")==offset){"网格分组已改变，请重新读取状态"}
    return controlCurrent(args)
  }
  private fun controlCurrent(args:JSONObject):JSONObject {val command=args.getString("command");if(command=="page"){val direction=args.getInt("value");require(direction in listOf(-1,1));val count=intent.getIntExtra("count",4);val total=intent.getIntExtra("total",players.size);val newOffset=(offset+direction*count).coerceIn(0,((total-1)/count)*count);if(newOffset==offset)return snapshot();val data=client.gridWindow(intent.getStringExtra("playlist")?:"",newOffset,count,intent.getBooleanExtra("super",false));releasePlayers();intent.putExtra("items",data.getJSONArray("items").toString());offset=newOffset;expanded=-1;selected=-1;target.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,listOf("全部视频")+(0 until data.getJSONArray("items").length()).map{(it+1).toString()+" · "+data.getJSONArray("items").getJSONObject(it).getString("name")});position=emptyList();updatePages();startPlayers();return snapshot()};val t=args.optInt("target",-1);require(t in -1 until players.size){"目标视频无效"};if(command=="target"){selected=t;target.setSelection(t+1);return snapshot()};if(command=="expand"){expanded=t;layout();return snapshot()};val value=args.optDouble("value",0.0);require(value.isFinite())
    for((i,p)in players.withIndex())if(t<0||t==i)when(command){"track.select","track.auto","subtitles"->{require(command!="track.select"||t>=0){"请指定单个视频后选择轨道"};p.trackSelectionParameters=PlayerTracks.change(p.currentTracks,p.trackSelectionParameters,args)};"pause"->p.pause();"resume","play"->p.play();"rotate"->{require(value.toInt() in listOf(0,90,180,270));views[i].videoSurfaceView?.rotation=value.toFloat()};"volume"->{require(value in 0.0..100.0);RhVideoVolume.setLocal(p,(value/100).toFloat())};"rate"->{require(value in .25..4.0);p.setPlaybackSpeed(value.toFloat())};"seek"->{require(p.duration!=C.TIME_UNSET&&value in 0.0..p.duration.toDouble());p.seekTo(value.toLong())};"seekRatio"->{require(value in 0.0..1000.0&&p.duration!=C.TIME_UNSET);p.seekTo((p.duration*value/1000).toLong())};else->error("未知的多视频操作")};return snapshot()
  }
  override fun onSaveInstanceState(out:Bundle){out.putInt("offset",offset);out.putLongArray("positions",players.map{it.currentPosition}.toLongArray());super.onSaveInstanceState(out)}
  private fun releasePlayers(){position=players.map{it.currentPosition};views.forEach{it.player=null};players.forEach{RhVideoVolume.untrack(it);it.release()};players.clear();views.clear();containers.clear();rendered.clear();errors.clear();grid.removeAllViews();stopped=true}
  override fun onStop(){releasePlayers();super.onStop()}
  override fun onDestroy(){if(active.get()===this)active.clear();super.onDestroy()}
}
