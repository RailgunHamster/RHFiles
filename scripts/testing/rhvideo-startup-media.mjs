import {execFileSync} from 'node:child_process';
export const startupScenarios={'h264-1080':{width:1920,height:1080,codec:'libx264'},'hevc-4k':{width:3840,height:2160,codec:'libx265'}};
// Identical source, four visible markers, AAC track and encoder options for
// both players. Generating it is outside the click-to-frame measurement.
export function generateStartupMedia(file,scenario){
  const format=startupScenarios[scenario];if(!format)throw Error('Unknown fixed startup scenario');
  const {width,height,codec}=format;
  const markers='drawbox=x=iw*.05:y=ih*.05:w=iw*.1:h=ih*.1:color=0xff0000:t=fill,drawbox=x=iw*.85:y=ih*.05:w=iw*.1:h=ih*.1:color=0x00ff00:t=fill,drawbox=x=iw*.05:y=ih*.85:w=iw*.1:h=ih*.1:color=0x0000ff:t=fill,drawbox=x=iw*.85:y=ih*.85:w=iw*.1:h=ih*.1:color=0xffff00:t=fill';
  execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i',`testsrc2=size=${width}x${height}:rate=24`,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-vf',markers,'-t','12','-c:v',codec,'-threads','2','-preset','ultrafast',...(codec==='libx265'?['-x265-params','pools=2:frame-threads=1:log-level=error','-tag:v','hvc1']:[]),'-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:120000});
  return format;
}
