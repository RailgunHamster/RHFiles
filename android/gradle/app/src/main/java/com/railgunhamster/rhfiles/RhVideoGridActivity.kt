package com.railgunhamster.rhfiles

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.addCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong

internal class RhVideoGridMemory:ViewModel(){var lease="";val cells=mutableMapOf<String,JSONObject>()}

/** Native surfaces consume the same group/layout plan as Windows. Cell state
 * belongs to one viewer session, while only the ordered group IDs persist. */
@UnstableApi
class RhVideoGridActivity:AppCompatActivity(){
  companion object {
    private var active=WeakReference<RhVideoGridActivity>(null)
    private val inputSequence=AtomicLong(1)
    fun state():JSONObject=active.get()?.snapshot()?:error("多视频没有打开")
    fun control(args:JSONObject):JSONObject=active.get()?.control(args)?:error("多视频没有打开")
    fun close():JSONObject{active.get()?.finish();return JSONObject().put("closed",true)}
  }
  private val client by lazy{RhVideoClient.get(this)}
  private val players=mutableListOf<ExoPlayer>()
  private val views=mutableListOf<PlayerView>()
  private val containers=mutableListOf<FrameLayout>()
  private val rendered=mutableSetOf<Int>()
  private val errors=mutableMapOf<Int,String>()
  private val inputIds=mutableListOf<Long>()
  private val frameCounts=mutableListOf<AtomicLong>()
  private val frameTimes=mutableListOf<AtomicLong>()
  // A long browsing session can visit thousands of cells. Retain that state
  // in-process across rotation, never serialize it into a size-limited Bundle.
  private val memory by lazy {ViewModelProvider(this,object:ViewModelProvider.Factory{
    @Suppress("UNCHECKED_CAST") override fun <T:ViewModel> create(modelClass:Class<T>):T {require(modelClass==RhVideoGridMemory::class.java);return RhVideoGridMemory() as T}
  })[RhVideoGridMemory::class.java]}
  private val cells get()=memory.cells
  private lateinit var data:JSONObject
  private lateinit var grid:FrameLayout
  private lateinit var target:Spinner
  private lateinit var previous:Button
  private lateinit var next:Button
  private lateinit var counter:TextView
  private lateinit var adjustments:ScrollView
  private var controlsExpanded=false
  private val sliders=mutableMapOf<String,SeekBar>()
  private val dragging=mutableSetOf<String>()
  private val handler=android.os.Handler(android.os.Looper.getMainLooper())
  private val update=object:Runnable{override fun run(){if(!stopped){paintControls();handler.postDelayed(this,500)}}}
  private var expanded=-1
  private var selected=-1
  private var stopped=true
  private val entries get()=data.getJSONArray("items")
  private val ticket get()=intent.getStringExtra("playlist")?:""
  private val lease get()=data.getString("lease")
  private fun cell(i:Int):JSONObject=cells.getOrPut(entries.getJSONObject(i).getString("id")){JSONObject().put("positionMs",0).put("paused",false).put("volume",100).put("muted",false).put("lastVolume",100).put("rate",1.0).put("rotation",0)}
  private fun safe(block:()->Unit){try{block()}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show()}}
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState);NativeAutomation.install(this);active=WeakReference(this)
    data=JSONObject(intent.getStringExtra("grid")?:error("缺少同屏会话"))
    if(memory.lease!=lease){memory.cells.clear();memory.lease=lease}
    val offset=savedInstanceState?.getInt("offset")?:data.getInt("offset")
    if(offset!=data.getInt("offset"))data=client.gridWindow(ticket,offset,intent.getIntExtra("count",4),intent.getBooleanExtra("super",false))
    expanded=savedInstanceState?.getInt("expanded",-1)?:-1
    selected=savedInstanceState?.getInt("selected",-1)?:-1
    controlsExpanded=savedInstanceState?.getBoolean("controlsExpanded",false)?:false
    onBackPressedDispatcher.addCallback(this){if(expanded>=0)safe{control(JSONObject().put("command","expand").put("target",-1))}else finish()}
    val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.BLACK)}
    WindowCompat.setDecorFitsSystemWindows(window,false)
    ViewCompat.setOnApplyWindowInsetsListener(root){view,insets->val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());view.setPadding(safe.left,safe.top,safe.right,safe.bottom);insets}
    grid=object:FrameLayout(this){
      override fun onLayout(changed:Boolean,l:Int,t:Int,r:Int,b:Int){
        val width=r-l;val height=b-t;val gap=(resources.displayMetrics.density*2).toInt()
        containers.forEachIndexed { i,view ->
          if(view.visibility==View.GONE)return@forEachIndexed
          val rect=if(expanded>=0)JSONArray(listOf(0.0,0.0,1.0,1.0))else entries.getJSONObject(i).getJSONArray("rect")
          val x=(rect.getDouble(0)*width).toInt();val y=(rect.getDouble(1)*height).toInt()
          val right=((rect.getDouble(0)+rect.getDouble(2))*width).toInt();val bottom=((rect.getDouble(1)+rect.getDouble(3))*height).toInt()
          val w=(right-x-gap*2).coerceAtLeast(1);val h=(bottom-y-gap*2).coerceAtLeast(1)
          view.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));view.layout(x+gap,y+gap,x+gap+w,y+gap+h)
        }
      }
    };root.addView(grid,LinearLayout.LayoutParams(-1,0,1f))
    val toolbar=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(12,8,12,8);setBackgroundColor(0xfff5f7fb.toInt())}
    target=Spinner(this);toolbar.addView(target)
    target.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,index:Int,id:Long){selected=index-1;paintControls()}}
    val buttons=LinearLayout(this)
    for((label,command)in listOf("播放" to "resume","暂停" to "pause","静音" to "mute","展开" to "expand","网格" to "restore"))buttons.addView(Button(this).apply{text=label;setOnClickListener{safe{control(JSONObject().put("target",if(command=="restore")-1 else if(command=="expand")selected.coerceAtLeast(0)else selected).put("command",if(command=="restore")"expand"else command))}}},LinearLayout.LayoutParams(0,-2,1f))
    toolbar.addView(buttons)
    val pages=LinearLayout(this);previous=Button(this).apply{text="上一组";setOnClickListener{safe{control(JSONObject().put("command","page").put("value",-1))}}};next=Button(this).apply{text="下一组";setOnClickListener{safe{control(JSONObject().put("command","page").put("value",1))}}};counter=TextView(this)
    pages.addView(previous,LinearLayout.LayoutParams(0,-2,1f));pages.addView(counter);pages.addView(next,LinearLayout.LayoutParams(0,-2,1f));pages.addView(Button(this).apply{text="调节";contentDescription="展开或收起播放调节";setOnClickListener{safe{control(JSONObject().put("command","controls"))}}},LinearLayout.LayoutParams(0,-2,1f));toolbar.addView(pages)
    val adjustmentRows=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
    adjustments=ScrollView(this).apply{addView(adjustmentRows);visibility=if(controlsExpanded)View.VISIBLE else View.GONE}
    toolbar.addView(adjustments,LinearLayout.LayoutParams(-1,(resources.displayMetrics.heightPixels*.25).toInt().coerceAtMost((200*resources.displayMetrics.density).toInt())))
    fun slider(label:String,max:Int,initial:Int,command:String){val row=LinearLayout(this);row.addView(TextView(this).apply{text=label});row.addView(SeekBar(this).apply{
      this.max=max;progress=initial;sliders[command]=this;var expectedOffset=data.getInt("offset");var expectedLease=lease
      setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{
        override fun onProgressChanged(s:SeekBar?,v:Int,user:Boolean){}
        override fun onStartTrackingTouch(s:SeekBar?){dragging.add(command);expectedOffset=data.getInt("offset");expectedLease=lease}
        override fun onStopTrackingTouch(s:SeekBar?){dragging.remove(command);safe{val value=(s?.progress?:0).toDouble();control(JSONObject().put("target",selected).put("command",command).put("value",when(command){"rate"->value.coerceAtLeast(25.0)/100;"seekGroup"->value/1000;else->value}).put("expectedOffset",expectedOffset).put("expectedLease",expectedLease))};paintControls()}
      })
    },LinearLayout.LayoutParams(0,-2,1f));adjustmentRows.addView(row)}
    slider("分组",1000,0,"seekGroup");slider("进度",1000,0,"seekRatio");slider("音量",100,100,"volume");slider("速度",400,100,"rate");root.addView(toolbar);setContentView(root);updatePages()
  }
  private fun paintControls(){
    fun set(command:String,value:Int){if(command !in dragging)sliders[command]?.progress=value}
    set("seekGroup",if(data.getInt("groupTotal")>1)data.getInt("groupIndex")*1000/(data.getInt("groupTotal")-1)else 0)
    val index=selected.coerceAtLeast(0);val p=players.getOrNull(index)?:return;val saved=cell(index)
    set("seekRatio",if(p.duration>0)(p.currentPosition*1000/p.duration).toInt().coerceIn(0,1000)else 0);set("volume",saved.getInt("volume"));set("rate",(p.playbackParameters.speed*100).toInt())
  }
  private fun layout(){containers.forEachIndexed{i,v->v.visibility=if(expanded<0||i==expanded)View.VISIBLE else View.GONE};grid.requestLayout()}
  private fun updatePages(){
    previous.isEnabled=!data.isNull("previousOffset");next.isEnabled=!data.isNull("nextOffset");counter.text="${data.getInt("groupIndex")+1}/${data.getInt("groupTotal")}"
    target.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,listOf("全部视频")+(0 until entries.length()).map{"${it+1} · ${entries.getJSONObject(it).getString("name")}"});target.setSelection(selected+1)
  }
  override fun onStart(){super.onStart();active=WeakReference(this);try{client.checkGrid(ticket,lease);startPlayers();handler.removeCallbacks(update);handler.post(update)}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show();finish()}}
  private fun startPlayers(){
    if(!stopped)return;stopped=false;val storage=NativeStorage(applicationContext)
    for(i in 0 until entries.length()){
      val item=entries.getJSONObject(i);val saved=cell(i)
      val factory=DefaultMediaSourceFactory(DefaultDataSource.Factory(this,DataSource.Factory{MediaRoutingDataSource(this,storage.remote)})).setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(0))
      val engine=ExoPlayer.Builder(this,DefaultRenderersFactory(this).setEnableDecoderFallback(true)).setMediaSourceFactory(factory).build()
      val view=PlayerView(this).apply{player=engine;controllerShowTimeoutMs=2500;controllerAutoShow=false;contentDescription="视频 ${i+1} · ${item.getString("name")}"}
      players.add(engine);views.add(view);inputIds.add(inputSequence.getAndIncrement());val frames=AtomicLong(0);val frameTime=AtomicLong(-1);frameCounts.add(frames);frameTimes.add(frameTime)
      engine.setVideoFrameMetadataListener{timeUs,_,_,_->frameTime.set(timeUs/1000);frames.incrementAndGet()}
      val container=FrameLayout(this);val message=TextView(this).apply{setTextColor(Color.WHITE);setBackgroundColor(0xcc151b27.toInt());setPadding(16,16,16,16);visibility=View.GONE}
      container.addView(view,FrameLayout.LayoutParams(-1,-1));container.addView(message,FrameLayout.LayoutParams(-1,-2,android.view.Gravity.CENTER));containers.add(container);grid.addView(container)
      var restored=false
      engine.addListener(object:Player.Listener{
        override fun onRenderedFirstFrame(){rendered.add(i)}
        override fun onPlaybackStateChanged(state:Int){if(state==Player.STATE_READY&&!restored){restored=true;val end=engine.duration;if(end>0&&saved.getLong("positionMs")>end-50)engine.seekTo((end-50).coerceAtLeast(0))}}
        override fun onPlayerError(e:PlaybackException){errors[i]=e.errorCodeName;message.text="视频 ${i+1} 播放失败\n${e.errorCodeName}\n${e.cause?.message?:e.message?:""}";message.visibility=View.VISIBLE}
      })
      RhVideoVolume.track(engine,if(saved.getBoolean("muted"))0f else saved.getInt("volume")/100f)
      engine.repeatMode=Player.REPEAT_MODE_ONE;engine.setPlaybackSpeed(saved.getDouble("rate").toFloat());engine.setMediaItem(MediaItem.fromUri(item.getString("path")),saved.getLong("positionMs"));engine.playWhenReady=!saved.getBoolean("paused");engine.prepare();view.videoSurfaceView?.rotation=saved.getInt("rotation").toFloat();view.hideController()
    };layout();runCatching{client.rememberGrid(ticket,lease,data.getInt("offset"))}
  }
  private fun capture(){players.forEachIndexed{i,p->cell(i).put("positionMs",p.currentPosition.coerceAtLeast(0)).put("paused",!p.playWhenReady).put("rate",p.playbackParameters.speed.toDouble())}}
  fun snapshot():JSONObject {
    client.checkGrid(ticket,lease)
    return JSONObject().put("engine","Media3").put("nativeSurface",true).put("controlsExpanded",controlsExpanded).put("canvasWidth",grid.width).put("canvasHeight",grid.height).put("offset",data.getInt("offset")).put("total",data.getInt("total")).put("count",entries.length()).put("groupIndex",data.getInt("groupIndex")).put("groupTotal",data.getInt("groupTotal")).put("hasPrevious",previous.isEnabled).put("hasNext",next.isEnabled).put("lease",lease).put("generation",data.getLong("generation")).put("expanded",if(expanded<0)JSONObject.NULL else expanded).put("target",selected)
      .put("cells",JSONArray(players.mapIndexed{i,p->val saved=cell(i);val surface=containers[i];val counters=p.videoDecoderCounters?.also{it.ensureUpdated()};JSONObject().put("id",entries.getJSONObject(i).getString("id")).put("inputId",inputIds[i]).put("rect",entries.getJSONObject(i).getJSONArray("rect")).put("surfaceBounds",JSONArray(listOf(surface.left,surface.top,surface.width,surface.height))).put("visible",surface.visibility==View.VISIBLE).put("playbackState",p.playbackState).put("isLoading",p.isLoading).put("bufferedPositionMs",p.bufferedPosition).put("suppressionReason",p.playbackSuppressionReason).put("playing",p.isPlaying).put("paused",!p.playWhenReady).put("rendered",i in rendered).put("renderedFrames",counters?.renderedOutputBufferCount?:0).put("submittedFrames",frameCounts[i].get()).put("frameTimeMs",frameTimes[i].get()).put("repeat",p.repeatMode==Player.REPEAT_MODE_ONE).put("positionMs",p.currentPosition).put("durationMs",if(p.duration==C.TIME_UNSET)0 else p.duration).put("rate",p.playbackParameters.speed).put("volume",saved.getInt("volume")).put("muted",saved.getBoolean("muted")).put("lastVolume",saved.getInt("lastVolume")).put("decoderVolume",p.volume*100).put("tracks",PlayerTracks.state(p.currentTracks,p.trackSelectionParameters)).put("error",errors[i]?:JSONObject.NULL)}))
  }
  fun control(args:JSONObject):JSONObject {
    client.checkGrid(ticket,lease)
    if(args.has("expectedOffset"))require(args.getInt("expectedOffset")==data.getInt("offset")){"网格分组已改变，请重新读取状态"}
    if(args.has("expectedLease"))require(args.getString("expectedLease")==lease){"同屏会话已改变"}
    val command=args.getString("command")
    if(command=="controls"){controlsExpanded=if(args.has("enabled"))args.getBoolean("enabled")else !controlsExpanded;adjustments.visibility=if(controlsExpanded)View.VISIBLE else View.GONE;return snapshot()}
    if(command=="page"||command=="seekGroup"){
      val offset=if(command=="page"){val direction=args.getInt("value");require(direction in listOf(-1,1));val key=if(direction>0)"nextOffset"else"previousOffset";if(data.isNull(key))return snapshot();data.getInt(key)}else{val ratio=args.getDouble("value");require(ratio.isFinite()&&ratio in 0.0..1.0);client.gridGroupOffset(ticket,lease,kotlin.math.floor(ratio*(data.getInt("groupTotal")-1)+.5).toInt())}
      if(offset==data.getInt("offset"))return snapshot()
      val candidate=client.gridWindow(ticket,offset,intent.getIntExtra("count",4),intent.getBooleanExtra("super",false));require(candidate.getString("lease")==lease)
      releasePlayers();data=candidate;expanded=-1;selected=-1;updatePages();startPlayers();return snapshot()
    }
    val t=args.optInt("target",-1);require(t in -1 until players.size){"目标视频无效"}
    if(command=="target"){selected=t;target.setSelection(t+1);return snapshot()}
    if(command=="expand"){expanded=t;if(t>=0)players[t].play();layout();return snapshot()}
    val value=args.optDouble("value",0.0);require(value.isFinite())
    for((i,p)in players.withIndex())if(t<0||t==i){val saved=cell(i);when(command){
      "track.select","track.auto","subtitles"->{require(command!="track.select"||t>=0){"请指定单个视频后选择轨道"};p.trackSelectionParameters=PlayerTracks.change(p.currentTracks,p.trackSelectionParameters,args)}
      "pause"->p.pause();"resume","play"->p.play()
      "rotate"->{require(value.toInt() in listOf(0,90,180,270));saved.put("rotation",value.toInt());views[i].videoSurfaceView?.rotation=value.toFloat()}
      "volume"->{require(value in 0.0..100.0);saved.put("volume",value.toInt());if(value>0)saved.put("lastVolume",value.toInt()).put("muted",false);RhVideoVolume.setLocal(p,if(saved.getBoolean("muted"))0f else value.toFloat()/100)}
      "mute"->{val muted=!saved.getBoolean("muted")&&saved.getInt("volume")>0;saved.put("muted",muted);if(!muted&&saved.getInt("volume")==0)saved.put("volume",saved.optInt("lastVolume",50).coerceAtLeast(1));RhVideoVolume.setLocal(p,if(muted)0f else saved.getInt("volume")/100f)}
      "rate"->{require(value in .25..4.0);p.setPlaybackSpeed(value.toFloat())}
      "seek"->{require(p.duration!=C.TIME_UNSET&&value in 0.0..p.duration.toDouble());p.seekTo(value.toLong())}
      "seekRatio"->{require(value in 0.0..1000.0&&p.duration!=C.TIME_UNSET);p.seekTo((p.duration*value/1000).toLong())}
      else->error("未知的多视频操作")
    }};return snapshot()
  }
  override fun onSaveInstanceState(out:Bundle){capture();out.putInt("offset",data.getInt("offset"));out.putInt("expanded",expanded);out.putInt("selected",selected);out.putBoolean("controlsExpanded",controlsExpanded);super.onSaveInstanceState(out)}
  private fun releasePlayers(){
    capture();runCatching{client.rememberGrid(ticket,lease,data.getInt("offset"))};views.forEach{it.player=null};players.forEach{RhVideoVolume.untrack(it);it.release()};players.clear();views.clear();containers.clear();rendered.clear();errors.clear();inputIds.clear();frameCounts.clear();frameTimes.clear();grid.removeAllViews();stopped=true
  }
  override fun onStop(){handler.removeCallbacks(update);releasePlayers();super.onStop()}
  override fun onDestroy(){if(active.get()===this)active.clear();super.onDestroy()}
}
