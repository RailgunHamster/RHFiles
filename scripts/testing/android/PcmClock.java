package com.railgunhamster.rhfiles.qa;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTimestamp;
import android.media.AudioTrack;
import android.os.Build;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Owned-emulator diagnostic, not an application player or acceptance shortcut.
 * Public AudioTrack APIs only: no Media3, media decoder, WebView or network.
 * https://developer.android.com/reference/android/media/AudioTrack
 * The PCM is silence, matching the generated AAC fixture's decoded content.
 * The requested capacity matches the measured Media3 buffer; no stream volume,
 * output device or start threshold is changed.
 */
public final class PcmClock {
  private static final int RATE=48000,FRAME_BYTES=4,CAPACITY_FRAMES=24000;
  private static final class Output {
    final AudioTrack track;
    final AtomicBoolean feeding=new AtomicBoolean(true);
    final byte[] pcm=new byte[CAPACITY_FRAMES*FRAME_BYTES];
    final Thread writer;
    volatile long accepted;
    volatile String error;
    Output() {
      track=new AudioTrack.Builder()
        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build())
        .setAudioFormat(new AudioFormat.Builder().setSampleRate(RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
        .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(pcm.length).build();
      if(track.getState()!=AudioTrack.STATE_INITIALIZED)throw new IllegalStateException("AudioTrack was not initialized");
      writer=new Thread(()->{
        final long end=SystemClock.elapsedRealtime()+10000;
        while(feeding.get()&&SystemClock.elapsedRealtime()<end){
          int size=track.write(pcm,0,pcm.length,AudioTrack.WRITE_NON_BLOCKING);
          if(size<0){error="AudioTrack.write="+size;break;}
          accepted+=size;
          if(size==0)SystemClock.sleep(2);
        }
      },"qa-pcm-feeder");
      writer.setDaemon(true);
    }
    void prime() {
      int offset=0;long end=SystemClock.elapsedRealtime()+2000;
      while(offset<pcm.length&&SystemClock.elapsedRealtime()<end){
        int size=track.write(pcm,offset,pcm.length-offset,AudioTrack.WRITE_NON_BLOCKING);
        if(size<0)throw new IllegalStateException("AudioTrack prime="+size);
        offset+=size;if(size==0)SystemClock.sleep(2);
      }
      if(offset!=pcm.length)throw new IllegalStateException("Could not prime the requested unchanged buffer");
      accepted=offset;
    }
    JSONObject snapshot()throws Exception {
      AudioTimestamp timestamp=new AudioTimestamp();boolean hasTimestamp=track.getTimestamp(timestamp);
      return new JSONObject().put("session",track.getAudioSessionId()).put("state",track.getPlayState())
        .put("headFrames",Integer.toUnsignedLong(track.getPlaybackHeadPosition())).put("acceptedFrames",accepted/FRAME_BYTES)
        .put("capacityFrames",track.getBufferCapacityInFrames()).put("bufferFrames",track.getBufferSizeInFrames())
        .put("startThresholdFrames",Build.VERSION.SDK_INT>=31?track.getStartThresholdInFrames():JSONObject.NULL)
        .put("underruns",track.getUnderrunCount()).put("timestampFrames",hasTimestamp?timestamp.framePosition:JSONObject.NULL)
        .put("timestampNanos",hasTimestamp?timestamp.nanoTime:JSONObject.NULL).put("error",error==null?JSONObject.NULL:error);
    }
    void close()throws Exception {feeding.set(false);writer.join(1500);try{track.stop();}finally{track.release();}}
  }
  public static void main(String[] args)throws Exception {
    if(args.length!=1||!(args[0].equals("1")||args[0].equals("3")))throw new IllegalArgumentException("Use exactly one or three owned PCM outputs");
    ArrayList<Output> outputs=new ArrayList<>();boolean healthy=false;
    try {
      for(int i=0;i<Integer.parseInt(args[0]);i++){Output output=new Output();outputs.add(output);output.prime();}
      long start=SystemClock.elapsedRealtime();
      for(Output output:outputs){output.track.play();output.writer.start();}
      SystemClock.sleep(5000);
      long elapsed=SystemClock.elapsedRealtime()-start;JSONArray tracks=new JSONArray();healthy=elapsed>=5000&&elapsed<10000;
      for(Output output:outputs){JSONObject value=output.snapshot();tracks.put(value);healthy&=value.getLong("headFrames")>=RATE*4L&&value.isNull("error");}
      System.out.println(new JSONObject().put("diagnostic","public-audiotrack-pcm-clock").put("pid",android.os.Process.myPid())
        .put("uid",android.os.Process.myUid()).put("sampleRate",RATE).put("requestedBufferFrames",CAPACITY_FRAMES)
        .put("elapsedMs",elapsed).put("tracks",tracks).put("clockHealthy",healthy));
    } finally {for(Output output:outputs)output.close();}
    // app_process can retain platform Binder threads after main returns.
    // Exit only this diagnostic VM, after all owned tracks have been released.
    System.exit(healthy?0:2);
  }
}
