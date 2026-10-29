package com.railgunhamster.rhfiles

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.MotionEvent
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
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong

@UnstableApi
internal class RhVideoGridMemory:ViewModel(){
  var lease="";var closed=false;val cells=mutableMapOf<String,JSONObject>()
  private val trackChoices=mutableMapOf<String,TrackSelectionParameters>()
  fun begin(viewerLease:String){if(lease!=viewerLease){cells.clear();trackChoices.clear();lease=viewerLease;closed=false}}
  fun rememberTracks(id:String,player:Player){trackChoices[id]=player.trackSelectionParameters}
  fun restoreTracks(id:String,player:Player){trackChoices[id]?.let{player.trackSelectionParameters=it}}
}

/** Native surfaces consume the same group/layout plan as Windows. Cell state
 * belongs to one viewer session, while only the ordered group IDs persist. */
@UnstableApi
class RhVideoGridActivity:AppCompatActivity(){
  companion object {
    private var active=WeakReference<RhVideoGridActivity>(null)
    private val inputSequence=AtomicLong(1)
    fun state():JSONObject=active.get()?.snapshot()?:error("多视频没有打开")
    fun control(args:JSONObject):JSONObject=active.get()?.control(args)?:error("多视频没有打开")
    fun close():JSONObject=active.get()?.closeViewer()?:JSONObject().put("closed",true)
    fun dismiss(generation:Long){active.get()?.let{if(it.ownsGeneration(generation))it.closeViewer(commit=false)}}
  }
  private val client by lazy{RhVideoClient.get(this)}
  private val players=mutableListOf<ExoPlayer>()
  private val views=mutableListOf<RhVideoPlayerView>()
  private val containers=mutableListOf<FrameLayout>()
  private val rendered=mutableSetOf<Int>()
  private val errors=mutableMapOf<Int,String>()
  private val inputIds=mutableListOf<Long>()
  @Volatile private var liveInputs:List<Long> = emptyList()
  private val favoriteButtons=mutableListOf<ImageButton>()
  private val markButtons=mutableListOf<ImageButton>()
  private val cellLabels=mutableListOf<TextView>()
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
  private var tracing=false
  private val createdAt=android.os.SystemClock.elapsedRealtime()
  private fun trace(stage:String){if(tracing)android.util.Log.d("RHVideoGridTrace","stage=$stage elapsedMs=${android.os.SystemClock.elapsedRealtime()-createdAt}")}
  private val entries get()=data.getJSONArray("items")
  private val ticket get()=intent.getStringExtra("playlist")?:""
  private val lease get()=data.getString("lease")
  private fun cell(i:Int):JSONObject=cells.getOrPut(entries.getJSONObject(i).getString("id")){JSONObject().put("positionMs",0).put("paused",false).put("volume",100).put("muted",false).put("lastVolume",100).put("rate",1.0).put("rotation",0)}
  private fun safe(block:()->Unit){try{block()}catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show()}}
  private fun ownsGeneration(generation:Long)=::data.isInitialized&&data.getLong("generation")==generation
  private fun guarded(args:JSONObject)=JSONObject(args.toString()).put("expectedOffset",data.getInt("offset")).put("expectedLease",lease).put("expectedInputs",JSONArray(liveInputs))
  private fun bindControl(view:View,args:()->JSONObject){
    var gesture:JSONObject?=null
    view.setOnTouchListener{_,event->when(event.actionMasked){MotionEvent.ACTION_DOWN->gesture=guarded(args());MotionEvent.ACTION_CANCEL->gesture=null};false}
    view.setOnClickListener{val request=gesture?:guarded(args());gesture=null;safe{control(request);paintControls()}}
  }
  private fun closeViewer(commit:Boolean=true):JSONObject {
    liveInputs=emptyList()
    return try{
      handler.removeCallbacks(update);if(!stopped)releasePlayers()
      if(memory.closed)JSONObject().put("closed",true)else{memory.closed=true;client.closeGrid(ticket,lease,commit)}
    }finally{finish()}
  }
  override fun onCreate(savedInstanceState:Bundle?){
    super.onCreate(savedInstanceState);NativeAutomation.install(this);active=WeakReference(this)
    tracing=BuildConfig.DEBUG||NativeAutomation.enabled(this);trace("create")
    data=JSONObject(intent.getStringExtra("grid")?:error("缺少同屏会话"))
    memory.begin(lease)
    val offset=savedInstanceState?.getInt("offset")?:data.getInt("offset")
    if(offset!=data.getInt("offset"))data=client.gridWindow(ticket,offset,intent.getIntExtra("count",4),intent.getBooleanExtra("super",false))
    expanded=savedInstanceState?.getInt("expanded",-1)?:-1
    selected=savedInstanceState?.getInt("selected",-1)?:-1
    controlsExpanded=savedInstanceState?.getBoolean("controlsExpanded",false)?:false
    onBackPressedDispatcher.addCallback(this){safe{if(expanded>=0)control(JSONObject().put("command","expand").put("target",-1))else closeViewer()}}
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
    for((label,command)in listOf("播放" to "resume","暂停" to "pause","静音" to "mute","展开" to "expand","网格" to "restore"))buttons.addView(Button(this).apply{text=label;bindControl(this){JSONObject().put("target",if(command=="restore")-1 else if(command=="expand")selected.coerceAtLeast(0)else selected).put("command",if(command=="restore")"expand"else command)}},LinearLayout.LayoutParams(0,-2,1f))
    toolbar.addView(buttons)
    val pages=LinearLayout(this);previous=Button(this).apply{text="上一组";bindControl(this){JSONObject().put("command","page").put("value",-1)}};next=Button(this).apply{text="下一组";bindControl(this){JSONObject().put("command","page").put("value",1)}};counter=TextView(this)
    pages.addView(previous,LinearLayout.LayoutParams(0,-2,1f));pages.addView(counter);pages.addView(next,LinearLayout.LayoutParams(0,-2,1f));pages.addView(Button(this).apply{text="调节";contentDescription="展开或收起播放调节";setOnClickListener{safe{control(JSONObject().put("command","controls"))}}},LinearLayout.LayoutParams(0,-2,1f));toolbar.addView(pages)
    val adjustmentRows=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
    adjustments=ScrollView(this).apply{addView(adjustmentRows);visibility=if(controlsExpanded)View.VISIBLE else View.GONE}
    toolbar.addView(adjustments,LinearLayout.LayoutParams(-1,(resources.displayMetrics.heightPixels*.25).toInt().coerceAtMost((200*resources.displayMetrics.density).toInt())))
    fun slider(label:String,max:Int,initial:Int,command:String){val row=LinearLayout(this);row.addView(TextView(this).apply{text=label});row.addView(SeekBar(this).apply{
      this.max=max;progress=initial;contentDescription="同屏${label}调节";sliders[command]=this;var gesture:JSONObject?=null
      setOnTouchListener{_,event->if(event.actionMasked==MotionEvent.ACTION_CANCEL){gesture=null;dragging.remove(command)};false}
      setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener{
        override fun onProgressChanged(s:SeekBar?,v:Int,user:Boolean){}
        override fun onStartTrackingTouch(s:SeekBar?){dragging.add(command);gesture=guarded(JSONObject().put("target",selected).put("command",command))}
        override fun onStopTrackingTouch(s:SeekBar?){dragging.remove(command);val request=gesture;gesture=null;if(request!=null)safe{val value=(s?.progress?:0).toDouble();control(request.put("value",when(command){"rate"->value.coerceAtLeast(25.0)/100;"seekGroup"->value/1000;else->value}))};paintControls()}
      })
    },LinearLayout.LayoutParams(0,-2,1f));adjustmentRows.addView(row)}
    slider("分组",1000,0,"seekGroup");slider("进度",1000,0,"seekRatio");slider("音量",100,100,"volume");slider("速度",400,100,"rate");root.addView(toolbar);setContentView(root);updatePages();trace("layout-ready")
  }
  private fun paintControls(){
    players.indices.forEach{i->
      val item=entries.getJSONObject(i);val favorite=client.favoriteState("video",item.getString("id"),data.getLong("generation"));val marked=client.previewMarked("video",item.getString("id"),data.getLong("generation"))
      favoriteButtons[i].apply{isEnabled=!favorite.getBoolean("favoriteBusy");isSelected=favorite.getBoolean("favorite");setColorFilter(if(isSelected)0xffffca66.toInt()else Color.WHITE);contentDescription="视频 ${i+1} · "+if(!isEnabled)"正在更新收藏"else if(isSelected)"取消收藏"else "加入收藏"}
      markButtons[i].apply{isSelected=marked;setColorFilter(if(marked)0xffffb566.toInt()else Color.WHITE);contentDescription="视频 ${i+1} · "+if(marked)"取消暂存标记"else "标记暂存"}
      val error=favorite.optString("favoriteError").takeIf{!favorite.isNull("favoriteError")&&it.isNotBlank()};cellLabels[i].text=item.getString("name")+(error?.let{"\n收藏失败：$it"}?:"");cellLabels[i].maxLines=if(error==null)2 else 4
    }
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
  private fun createEngine(storage:NativeStorage):ExoPlayer{
    val factory=DefaultMediaSourceFactory(DefaultDataSource.Factory(this,DataSource.Factory{MediaRoutingDataSource(this,storage.remote)})).setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(0))
    return ExoPlayer.Builder(this,DefaultRenderersFactory(this).setEnableDecoderFallback(true)).setMediaSourceFactory(factory).build()
  }
  private fun bindEngine(i:Int,engine:ExoPlayer,view:RhVideoPlayerView,message:TextView,storage:NativeStorage){
    val saved=cell(i);val item=entries.getJSONObject(i);val input=inputIds[i]
    view.setManualRotation(saved.getInt("rotation"),fixed=true);view.bindRotationEngine(engine)
    view.player=object:ForwardingPlayer(engine){
      override fun setVideoSurfaceView(surface:android.view.SurfaceView?){if(!view.bindNativeSurface(engine,surface))super.setVideoSurfaceView(surface)}
      override fun clearVideoSurfaceView(surface:android.view.SurfaceView?){if(!view.bindNativeSurface(engine,null))super.clearVideoSurfaceView(surface)}
    }
    view.onPresentationFailure={failure->if(players.getOrNull(i)===engine){errors[i]=failure;message.text="视频 ${i+1} 画面显示失败\n$failure";message.visibility=View.VISIBLE}}
    // API 29+ changes only the app-owned compositor layer. Older Android uses
    // Media3 effects, which must be set before prepare: replace only this cell's
    // renderer, keeping the logical input identity and all user control state.
    view.onRotationRendererChanged={handler.post{if(!stopped&&!isFinishing&&players.getOrNull(i)===engine&&inputIds.getOrNull(i)==input)safe{
      val next=createEngine(storage)
      saved.put("positionMs",engine.currentPosition.coerceAtLeast(0)).put("paused",!engine.playWhenReady).put("rate",engine.playbackParameters.speed.toDouble())
      next.trackSelectionParameters=engine.trackSelectionParameters
      view.player=null;view.unbindRotationEngine(engine,true);RhVideoVolume.untrack(engine);engine.release()
      players[i]=next;rendered.remove(i);errors.remove(i);message.visibility=View.GONE;frameCounts[i]=AtomicLong(0);frameTimes[i]=AtomicLong(-1)
      bindEngine(i,next,view,message,storage)
    }}}
    val frames=frameCounts[i];val frameTime=frameTimes[i]
    engine.setVideoFrameMetadataListener{timeUs,_,_,_->frameTime.set(timeUs/1000);frames.incrementAndGet()}
    var restored=false
    engine.addListener(object:Player.Listener{
      override fun onRenderedFirstFrame(){if(players.getOrNull(i)===engine&&rendered.add(i))trace("frame-$i")}
      override fun onPlaybackStateChanged(state:Int){if(players.getOrNull(i)===engine&&state==Player.STATE_READY&&!restored){restored=true;val end=engine.duration;if(end>0&&saved.getLong("positionMs")>end-50)engine.seekTo((end-50).coerceAtLeast(0))}}
      override fun onPlayerError(e:PlaybackException){if(players.getOrNull(i)!==engine)return;errors[i]=e.errorCodeName;message.text="视频 ${i+1} 播放失败\n${e.errorCodeName}\n${e.cause?.message?:e.message?:""}";message.visibility=View.VISIBLE}
    })
    RhVideoVolume.track(engine,if(saved.getBoolean("muted"))0f else saved.getInt("volume")/100f)
    engine.repeatMode=Player.REPEAT_MODE_ONE;engine.setPlaybackSpeed(saved.getDouble("rate").toFloat());engine.setMediaItem(MediaItem.fromUri(item.getString("path")),saved.getLong("positionMs"));engine.playWhenReady=!saved.getBoolean("paused");trace("prepare-$i-start");engine.prepare();trace("prepare-$i-returned");view.hideController()
  }
  private fun startPlayers(){
    if(!stopped)return;stopped=false;trace("storage-start");val storage=NativeStorage(applicationContext);trace("storage-ready")
    for(i in 0 until entries.length()){
      val item=entries.getJSONObject(i)
      trace("engine-$i-start");val engine=createEngine(storage);memory.restoreTracks(item.getString("id"),engine);trace("engine-$i-ready")
      val view=RhVideoPlayerView(this).apply{controllerShowTimeoutMs=2500;controllerAutoShow=false;contentDescription="视频 ${i+1} · ${item.getString("name")}"}
      players.add(engine);views.add(view);inputIds.add(inputSequence.getAndIncrement());val frames=AtomicLong(0);val frameTime=AtomicLong(-1);frameCounts.add(frames);frameTimes.add(frameTime)
      val container=FrameLayout(this);val message=TextView(this).apply{setTextColor(Color.WHITE);setBackgroundColor(0xcc151b27.toInt());setPadding(16,16,16,16);visibility=View.GONE}
      container.addView(view,FrameLayout.LayoutParams(-1,-1));container.addView(message,FrameLayout.LayoutParams(-1,-2,android.view.Gravity.CENTER));containers.add(container);grid.addView(container)
      val header=LinearLayout(this).apply{gravity=android.view.Gravity.CENTER_VERTICAL;setBackgroundColor(0x99151b27.toInt())}
      val label=TextView(this).apply{setTextColor(Color.WHITE);textSize=11f;maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END;setPadding(8,4,4,4);contentDescription=item.getString("name")};cellLabels.add(label);header.addView(label,LinearLayout.LayoutParams(0,-2,1f))
      val input=inputIds[i];val size=(40*resources.displayMetrics.density).toInt()
      fun icon(drawable:Int,command:String)=ImageButton(this).apply{setImageResource(drawable);setColorFilter(Color.WHITE);setBackgroundColor(Color.TRANSPARENT);bindControl(this){JSONObject().put("target",i).put("command",command).put("expectedInput",input)}}
      favoriteButtons.add(icon(R.drawable.ic_player_favorite,"favorite").also{header.addView(it,LinearLayout.LayoutParams(size,size))});markButtons.add(icon(R.drawable.ic_player_mark,"mark").also{header.addView(it,LinearLayout.LayoutParams(size,size))});container.addView(header,FrameLayout.LayoutParams(-1,-2,android.view.Gravity.TOP))
      bindEngine(i,engine,view,message,storage)
    };liveInputs=inputIds.toList();paintControls();layout();runCatching{client.rememberGrid(ticket,lease,data.getInt("offset"))}
  }
  private fun capture(){players.forEachIndexed{i,p->cell(i).put("positionMs",p.currentPosition.coerceAtLeast(0)).put("paused",!p.playWhenReady).put("rate",p.playbackParameters.speed.toDouble());memory.rememberTracks(entries.getJSONObject(i).getString("id"),p)}}
  fun snapshot():JSONObject {
    client.checkGrid(ticket,lease)
    return JSONObject().put("engine","Media3").put("nativeSurface",true).put("controlsExpanded",controlsExpanded).put("dragging",JSONArray(dragging.toList())).put("canvasWidth",grid.width).put("canvasHeight",grid.height).put("offset",data.getInt("offset")).put("total",data.getInt("total")).put("count",entries.length()).put("groupIndex",data.getInt("groupIndex")).put("groupTotal",data.getInt("groupTotal")).put("hasPrevious",previous.isEnabled).put("hasNext",next.isEnabled).put("lease",lease).put("generation",data.getLong("generation")).put("expanded",if(expanded<0)JSONObject.NULL else expanded).put("target",selected)
      .put("cells",JSONArray(players.mapIndexed{i,p->
        val saved=cell(i);val item=entries.getJSONObject(i);val id=item.getString("id");val surface=containers[i]
        val counters=p.videoDecoderCounters?.also{it.ensureUpdated()};val favorite=client.favoriteState("video",id,data.getLong("generation"))
        JSONObject().put("id",id).put("inputId",inputIds[i])
          .put("favorite",favorite.getBoolean("favorite")).put("favoriteBusy",favorite.getBoolean("favoriteBusy")).put("favoriteError",favorite.get("favoriteError")).put("favoriteOperation",favorite.get("favoriteOperation"))
          .put("marked",client.previewMarked("video",id,data.getLong("generation")))
          .put("rect",item.getJSONArray("rect")).put("surfaceBounds",JSONArray(listOf(surface.left,surface.top,surface.width,surface.height))).put("visible",surface.visibility==View.VISIBLE)
          .put("playbackState",p.playbackState).put("isLoading",p.isLoading).put("bufferedPositionMs",p.bufferedPosition).put("suppressionReason",p.playbackSuppressionReason)
          .put("playing",p.isPlaying).put("paused",!p.playWhenReady).put("rendered",i in rendered).put("renderedFrames",counters?.renderedOutputBufferCount?:0).put("submittedFrames",frameCounts[i].get()).put("frameTimeMs",frameTimes[i].get())
          .put("repeat",p.repeatMode==Player.REPEAT_MODE_ONE).put("positionMs",p.currentPosition).put("durationMs",if(p.duration==C.TIME_UNSET)0 else p.duration).put("rate",p.playbackParameters.speed)
          .put("volume",saved.getInt("volume")).put("muted",saved.getBoolean("muted")).put("lastVolume",saved.getInt("lastVolume")).put("decoderVolume",p.volume*100)
          .put("tracks",PlayerTracks.state(p.currentTracks,p.trackSelectionParameters)).put("error",errors[i]?:JSONObject.NULL).put("presentation",views[i].rotationState())
      }))
  }
  fun control(args:JSONObject):JSONObject {
    client.checkGrid(ticket,lease)
    check(!stopped&&!isFinishing&&!memory.closed){"同屏播放已停止"}
    if(args.has("expectedOffset"))require(args.getInt("expectedOffset")==data.getInt("offset")){"网格分组已改变，请重新读取状态"}
    if(args.has("expectedLease"))require(args.getString("expectedLease")==lease){"同屏会话已改变"}
    RhVideoGridInputs.check(inputIds,args.optInt("target",-1),args)
    val command=args.getString("command")
    if(command=="controls"){controlsExpanded=if(args.has("enabled"))args.getBoolean("enabled")else !controlsExpanded;adjustments.visibility=if(controlsExpanded)View.VISIBLE else View.GONE;return snapshot()}
    if(command=="page"||command=="seekGroup"){
      val offset=if(command=="page"){val direction=args.getInt("value");require(direction in listOf(-1,1));val key=if(direction>0)"nextOffset"else"previousOffset";if(data.isNull(key))return snapshot();data.getInt(key)}else{val ratio=args.getDouble("value");require(ratio.isFinite()&&ratio in 0.0..1.0);client.gridGroupOffset(ticket,lease,kotlin.math.floor(ratio*(data.getInt("groupTotal")-1)+.5).toInt())}
      if(offset==data.getInt("offset"))return snapshot()
      val candidate=client.gridWindow(ticket,offset,intent.getIntExtra("count",4),intent.getBooleanExtra("super",false));require(candidate.getString("lease")==lease)
      releasePlayers();data=candidate;expanded=-1;selected=-1;updatePages();startPlayers();return snapshot()
    }
    val t=args.optInt("target",-1);require(t in -1 until players.size){"目标视频无效"}
    if(command=="favorite"||command=="mark"){
      require(t>=0){"请指定单个视频"};val item=entries.getJSONObject(t);val id=item.getString("id");val input=inputIds[t]
      val result=if(command=="favorite")client.toggleFavorite("video",id,data.getLong("generation")){liveInputs.getOrNull(t)==input&&active.get()===this}else client.request("preview.mark",JSONObject().put("_sessionGeneration",data.getLong("generation")).put("kind","video").put("id",id).put("title",item.getString("name")).also{if(args.has("enabled"))it.put("enabled",args.getBoolean("enabled"))})
      paintControls();return snapshot().put("action",result)
    }
    if(command=="target"){selected=t;target.setSelection(t+1);return snapshot()}
    if(command=="expand"){expanded=t;if(t>=0)players[t].play();layout();return snapshot()}
    val value=args.optDouble("value",0.0);require(value.isFinite())
    for((i,p)in players.withIndex())if(t<0||t==i){val saved=cell(i);when(command){
      "track.select","track.auto","subtitles"->{require(command!="track.select"||t>=0){"请指定单个视频后选择轨道"};p.trackSelectionParameters=PlayerTracks.change(p.currentTracks,p.trackSelectionParameters,args)}
      "pause"->p.pause();"resume","play"->p.play()
      "rotate"->{require(value==value.toInt().toDouble()&&value.toInt() in listOf(0,90,180,270));saved.put("rotation",value.toInt());views[i].setManualRotation(value.toInt(),fixed=true)}
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
    liveInputs=emptyList();capture();runCatching{client.rememberGrid(ticket,lease,data.getInt("offset"))};views.forEachIndexed{i,view->view.player=null;view.unbindRotationEngine(players[i])};val retired=players.toList();players.clear();retired.forEach{RhVideoVolume.untrack(it);it.release()};views.clear();containers.clear();rendered.clear();errors.clear();inputIds.clear();favoriteButtons.clear();markButtons.clear();cellLabels.clear();frameCounts.clear();frameTimes.clear();grid.removeAllViews();stopped=true
  }
  override fun onStop(){handler.removeCallbacks(update);releasePlayers();super.onStop()}
  override fun onDestroy(){if(isFinishing&&!memory.closed){memory.closed=true;runCatching{client.closeGrid(ticket,lease,commit=false)}};if(active.get()===this)active.clear();super.onDestroy()}
}
