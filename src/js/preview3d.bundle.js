var RHFiles3D=(()=>{var Hl=Object.defineProperty;var gm=Object.getOwnPropertyDescriptor;var vm=Object.getOwnPropertyNames;var bm=Object.prototype.hasOwnProperty;var _m=(s,e)=>{for(var t in e)Hl(s,t,{get:e[t],enumerable:!0})},ym=(s,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of vm(e))!bm.call(s,i)&&i!==t&&Hl(s,i,{get:()=>e[i],enumerable:!(n=gm(e,i))||n.enumerable});return s};var xm=s=>ym(Hl({},"__esModule",{value:!0}),s);var lb={};_m(lb,{MODEL_PREVIEW_MAX_BYTES:()=>Dl,MODEL_PREVIEW_MAX_TRIANGLES:()=>hm,SUPPORTED_3D_EXTENSIONS:()=>nb,dispose3DPreview:()=>dm,render3DPreview:()=>ob});var ji={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},Wi={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},cp=0,Fc=1,hp=2;var sa=1,up=2,Qr=3,$n=0,en=1,Sn=2,ei=0,aa=1,Nc=2,Uc=3,Oc=4,dp=5;var $r=100,pp=101,fp=102,mp=103,gp=104,vp=200,bp=201,_p=202,yp=203,xp=204,Mp=205,Sp=206,Tp=207,wp=208,Ap=209,Ep=210,Rp=211,Cp=212,Pp=213,Ip=214,Bc=0,kc=1,zc=2,qo=3,Gc=4,Vc=5,Hc=6,jc=7,Lp=0,Dp=1,Fp=2,zn=0,Wc=1,qc=2,Xc=3,oa=4,Kc=5,Yc=6,Jc=7,xc="attached",Np="detached",Zc=300,es=301,fr=302,ts=303,Xo=304,la=306,Nt=1e3,qt=1001,vi=1002,Ut=1003,Ko=1004;var mr=1005;var ct=1006,ns=1007;var hn=1008;var un=1009,Qc=1010,$c=1011,is=1012,Yo=1013,Ai=1014,dn=1015,ti=1016,Jo=1017,Zo=1018,rs=1020,eh=35902,th=35899,Up=1021,Op=1022,Tn=1023,qi=1026,gr=1027,Qo=1028,$o=1029,vr=1030,nh=1031;var ih=1033,el=33776,tl=33777,nl=33778,il=33779,rh=35840,sh=35841,ah=35842,oh=35843,lh=36196,ch=37492,hh=37496,uh=37488,dh=37489,rl=37490,ph=37491,fh=37808,mh=37809,gh=37810,vh=37811,bh=37812,_h=37813,yh=37814,xh=37815,Mh=37816,Sh=37817,Th=37818,wh=37819,Ah=37820,Eh=37821,Rh=36492,Ch=36494,Ph=36495,Ih=36283,Lh=36284,sl=36285,Dh=36286;var sr=2300,ar=2301,eo=2302,Mc=2303,nr=2400,ir=2401,ws=2402,Bp=2500,kp=2501,Fh=0,ca=1,ss=2;var Nh=0,zp=1,br="",Pe="srgb",kt="srgb-linear",As="linear",nt="srgb";var tr=7680;var Gp=512,Vp=513,Hp=514,al=515,jp=516,Wp=517,ol=518,qp=519,to=35044;var Uh="300 es",bi=2e3,zr=2001;function Mm(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}function Gr(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Xp(){let s=Gr("canvas");return s.style.display="block",s}var bd={},Vr=null;function Es(...s){let e="THREE."+s.shift();Vr?Vr("log",e,...s):console.log(e,...s)}function Kp(s){let e=s[0];if(typeof e=="string"&&e.startsWith("TSL:")){let t=s[1];t&&t.isStackTrace?s[0]+=" "+t.getLocation():s[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return s}function Ae(...s){let e="THREE."+(s=Kp(s)).shift();if(Vr)Vr("warn",e,...s);else{let t=s[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...s)}}function Ie(...s){let e="THREE."+(s=Kp(s)).shift();if(Vr)Vr("error",e,...s);else{let t=s[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...s)}}function rr(...s){let e=s.join(" ");e in bd||(bd[e]=!0,Ae(...s))}function Yp(s,e,t){return new Promise(function(n,i){setTimeout(function r(){switch(s.clientWaitSync(e,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}},t)})}var Jp={[Bc]:1,[zc]:6,[Gc]:7,[qo]:5,[kc]:0,[Hc]:2,[jc]:4,[Vc]:3},yn=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n!==void 0&&n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let i=n[e];if(i!==void 0){let r=i.indexOf(t);r!==-1&&i.splice(r,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let i=n.slice(0);for(let r=0,a=i.length;r<a;r++)i[r].call(this,e);e.target=null}}},jt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],_d=1234567,Br=Math.PI/180,or=180/Math.PI;function _n(){let s=4294967295*Math.random()|0,e=4294967295*Math.random()|0,t=4294967295*Math.random()|0,n=4294967295*Math.random()|0;return(jt[255&s]+jt[s>>8&255]+jt[s>>16&255]+jt[s>>24&255]+"-"+jt[255&e]+jt[e>>8&255]+"-"+jt[e>>16&15|64]+jt[e>>24&255]+"-"+jt[63&t|128]+jt[t>>8&255]+"-"+jt[t>>16&255]+jt[t>>24&255]+jt[255&n]+jt[n>>8&255]+jt[n>>16&255]+jt[n>>24&255]).toLowerCase()}function ke(s,e,t){return Math.max(e,Math.min(t,s))}function Sc(s,e){return(s%e+e)%e}function Ms(s,e,t){return(1-t)*s+t*e}function Fn(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function rt(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return Math.round(4294967295*s);case Uint16Array:return Math.round(65535*s);case Uint8Array:return Math.round(255*s);case Int32Array:return Math.round(2147483647*s);case Int16Array:return Math.round(32767*s);case Int8Array:return Math.round(127*s);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var mt={DEG2RAD:Br,RAD2DEG:or,generateUUID:_n,clamp:ke,euclideanModulo:Sc,mapLinear:function(s,e,t,n,i){return n+(s-e)*(i-n)/(t-e)},inverseLerp:function(s,e,t){return s!==e?(t-s)/(e-s):0},lerp:Ms,damp:function(s,e,t,n){return Ms(s,e,1-Math.exp(-t*n))},pingpong:function(s,e=1){return e-Math.abs(Sc(s,2*e)-e)},smoothstep:function(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e))*s*(3-2*s)},smootherstep:function(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e))*s*s*(s*(6*s-15)+10)},randInt:function(s,e){return s+Math.floor(Math.random()*(e-s+1))},randFloat:function(s,e){return s+Math.random()*(e-s)},randFloatSpread:function(s){return s*(.5-Math.random())},seededRandom:function(s){s!==void 0&&(_d=s);let e=_d+=1831565813;return e=Math.imul(e^e>>>15,1|e),e^=e+Math.imul(e^e>>>7,61|e),((e^e>>>14)>>>0)/4294967296},degToRad:function(s){return s*Br},radToDeg:function(s){return s*or},isPowerOfTwo:function(s){return!(s&s-1)&&s!==0},ceilPowerOfTwo:function(s){return Math.pow(2,Math.ceil(Math.log(s)/Math.LN2))},floorPowerOfTwo:function(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))},setQuaternionFromProperEuler:function(s,e,t,n,i){let r=Math.cos,a=Math.sin,o=r(t/2),l=a(t/2),c=r((e+n)/2),h=a((e+n)/2),u=r((e-n)/2),d=a((e-n)/2),p=r((n-e)/2),m=a((n-e)/2);switch(i){case"XYX":s.set(o*h,l*u,l*d,o*c);break;case"YZY":s.set(l*d,o*h,l*u,o*c);break;case"ZXZ":s.set(l*u,l*d,o*h,o*c);break;case"XZX":s.set(o*h,l*m,l*p,o*c);break;case"YXY":s.set(l*p,o*h,l*m,o*c);break;case"ZYZ":s.set(l*m,l*p,o*h,o*c);break;default:Ae("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}},normalize:rt,denormalize:Fn},ne=class s{static{s.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=ke(this.x,e.x,t.x),this.y=ke(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=ke(this.x,e,t),this.y=ke(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(ke(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),i=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*i+e.x,this.y=r*i+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},$e=class{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,r,a,o){let l=n[i+0],c=n[i+1],h=n[i+2],u=n[i+3],d=r[a+0],p=r[a+1],m=r[a+2],f=r[a+3];if(u!==f||l!==d||c!==p||h!==m){let _=l*d+c*p+h*m+u*f;_<0&&(d=-d,p=-p,m=-m,f=-f,_=-_);let g=1-o;if(_<.9995){let v=Math.acos(_),b=Math.sin(v);g=Math.sin(g*v)/b,l=l*g+d*(o=Math.sin(o*v)/b),c=c*g+p*o,h=h*g+m*o,u=u*g+f*o}else{l=l*g+d*o,c=c*g+p*o,h=h*g+m*o,u=u*g+f*o;let v=1/Math.sqrt(l*l+c*c+h*h+u*u);l*=v,c*=v,h*=v,u*=v}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,i,r,a){let o=n[i],l=n[i+1],c=n[i+2],h=n[i+3],u=r[a],d=r[a+1],p=r[a+2],m=r[a+3];return e[t]=o*m+h*u+l*p-c*d,e[t+1]=l*m+h*d+c*u-o*p,e[t+2]=c*m+h*p+o*d-l*u,e[t+3]=h*m-o*u-l*d-c*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,i=e._y,r=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(i/2),u=o(r/2),d=l(n/2),p=l(i/2),m=l(r/2);switch(a){case"XYZ":this._x=d*h*u+c*p*m,this._y=c*p*u-d*h*m,this._z=c*h*m+d*p*u,this._w=c*h*u-d*p*m;break;case"YXZ":this._x=d*h*u+c*p*m,this._y=c*p*u-d*h*m,this._z=c*h*m-d*p*u,this._w=c*h*u+d*p*m;break;case"ZXY":this._x=d*h*u-c*p*m,this._y=c*p*u+d*h*m,this._z=c*h*m+d*p*u,this._w=c*h*u-d*p*m;break;case"ZYX":this._x=d*h*u-c*p*m,this._y=c*p*u+d*h*m,this._z=c*h*m-d*p*u,this._w=c*h*u+d*p*m;break;case"YZX":this._x=d*h*u+c*p*m,this._y=c*p*u+d*h*m,this._z=c*h*m-d*p*u,this._w=c*h*u-d*p*m;break;case"XZY":this._x=d*h*u-c*p*m,this._y=c*p*u-d*h*m,this._z=c*h*m+d*p*u,this._w=c*h*u+d*p*m;break;default:Ae("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],i=t[4],r=t[8],a=t[1],o=t[5],l=t[9],c=t[2],h=t[6],u=t[10],d=n+o+u;if(d>0){let p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(h-l)*p,this._y=(r-c)*p,this._z=(a-i)*p}else if(n>o&&n>u){let p=2*Math.sqrt(1+n-o-u);this._w=(h-l)/p,this._x=.25*p,this._y=(i+a)/p,this._z=(r+c)/p}else if(o>u){let p=2*Math.sqrt(1+o-n-u);this._w=(r-c)/p,this._x=(i+a)/p,this._y=.25*p,this._z=(l+h)/p}else{let p=2*Math.sqrt(1+u-n-o);this._w=(a-i)/p,this._x=(r+c)/p,this._y=(l+h)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(ke(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,i=e._y,r=e._z,a=e._w,o=t._x,l=t._y,c=t._z,h=t._w;return this._x=n*h+a*o+i*c-r*l,this._y=i*h+a*l+r*o-n*c,this._z=r*h+a*c+n*l-i*o,this._w=a*h-n*o-i*l-r*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,i=e._y,r=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,i=-i,r=-r,a=-a,o=-o);let l=1-t;if(o<.9995){let c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,t=Math.sin(t*c)/h,this._x=this._x*l+n*t,this._y=this._y*l+i*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+n*t,this._y=this._y*l+i*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(e),i*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},C=class s{static{s.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(yd.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(yd.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*i,this.y=r[1]*t+r[4]*n+r[7]*i,this.z=r[2]*t+r[5]*n+r[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*i+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*i+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*i+r[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,i=this.z,r=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*i-o*n),h=2*(o*t-r*i),u=2*(r*n-a*t);return this.x=t+l*c+a*u-o*h,this.y=n+l*h+o*c-r*u,this.z=i+l*u+r*h-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*i,this.y=r[1]*t+r[5]*n+r[9]*i,this.z=r[2]*t+r[6]*n+r[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=ke(this.x,e.x,t.x),this.y=ke(this.y,e.y,t.y),this.z=ke(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=ke(this.x,e,t),this.y=ke(this.y,e,t),this.z=ke(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,i=e.y,r=e.z,a=t.x,o=t.y,l=t.z;return this.x=i*l-r*o,this.y=r*a-n*l,this.z=n*o-i*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return jl.copy(this).projectOnVector(e),this.sub(jl)}reflect(e){return this.sub(jl.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(ke(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,4*t)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,3*t)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=2*Math.random()-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},jl=new C,yd=new $e,Fe=class s{static{s.prototype.isMatrix3=!0}constructor(e,t,n,i,r,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,a,o,l,c)}set(e,t,n,i,r,a,o,l,c){let h=this.elements;return h[0]=e,h[1]=i,h[2]=o,h[3]=t,h[4]=r,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],u=n[7],d=n[2],p=n[5],m=n[8],f=i[0],_=i[3],g=i[6],v=i[1],b=i[4],y=i[7],S=i[2],x=i[5],A=i[8];return r[0]=a*f+o*v+l*S,r[3]=a*_+o*b+l*x,r[6]=a*g+o*y+l*A,r[1]=c*f+h*v+u*S,r[4]=c*_+h*b+u*x,r[7]=c*g+h*y+u*A,r[2]=d*f+p*v+m*S,r[5]=d*_+p*b+m*x,r[8]=d*g+p*y+m*A,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8];return t*a*h-t*o*c-n*r*h+n*o*l+i*r*c-i*a*l}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],u=h*a-o*c,d=o*l-h*r,p=c*r-a*l,m=t*u+n*d+i*p;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);let f=1/m;return e[0]=u*f,e[1]=(i*c-h*n)*f,e[2]=(o*n-i*a)*f,e[3]=d*f,e[4]=(h*t-i*l)*f,e[5]=(i*r-o*t)*f,e[6]=p*f,e[7]=(n*l-c*t)*f,e[8]=(a*t-n*r)*f,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,r,a,o){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+e,-i*c,i*l,-i*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return rr("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Wl.makeScale(e,t)),this}rotate(e){return rr("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Wl.makeRotation(-e)),this}translate(e,t){return rr("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Wl.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Wl=new Fe,xd=new Fe().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Md=new Fe().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Sm(){let s={enabled:!0,workingColorSpace:kt,spaces:{},convert:function(i,r,a){return this.enabled!==!1&&r!==a&&r&&a&&(this.spaces[r].transfer===nt&&(i.r=gi(i.r),i.g=gi(i.g),i.b=gi(i.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(i.applyMatrix3(this.spaces[r].toXYZ),i.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===nt&&(i.r=kr(i.r),i.g=kr(i.g),i.b=kr(i.b))),i},workingToColorSpace:function(i,r){return this.convert(i,this.workingColorSpace,r)},colorSpaceToWorking:function(i,r){return this.convert(i,r,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===""?As:this.spaces[i].transfer},getToneMappingMode:function(i){return this.spaces[i].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(i,r=this.workingColorSpace){return i.fromArray(this.spaces[r].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,r,a){return i.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(i,r){return rr("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),s.workingToColorSpace(i,r)},toWorkingColorSpace:function(i,r){return rr("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),s.colorSpaceToWorking(i,r)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return s.define({[kt]:{primaries:e,whitePoint:n,transfer:As,toXYZ:xd,fromXYZ:Md,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:Pe},outputColorSpaceConfig:{drawingBufferColorSpace:Pe}},[Pe]:{primaries:e,whitePoint:n,transfer:nt,toXYZ:xd,fromXYZ:Md,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:Pe}}}),s}var Ce=Sm();function gi(s){return s<.04045?.0773993808*s:Math.pow(.9478672986*s+.0521327014,2.4)}function kr(s){return s<.0031308?12.92*s:1.055*Math.pow(s,.41666)-.055}var wr,no=class{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{wr===void 0&&(wr=Gr("canvas")),wr.width=e.width,wr.height=e.height;let i=wr.getContext("2d");e instanceof ImageData?i.putImageData(e,0,0):i.drawImage(e,0,0,e.width,e.height),n=wr}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=Gr("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let i=n.getImageData(0,0,e.width,e.height),r=i.data;for(let a=0;a<r.length;a++)r[a]=255*gi(r[a]/255);return n.putImageData(i,0,0),t}if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(255*gi(t[n]/255)):t[n]=gi(t[n]);return{data:t,width:e.width,height:e.height}}return Ae("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},Tm=0,Hr=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Tm++}),this.uuid=_n(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let a=0,o=i.length;a<o;a++)i[a].isDataTexture?r.push(ql(i[a].image)):r.push(ql(i[a]))}else r=ql(i);n.url=r}return t||(e.images[this.uuid]=n),n}};function ql(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?no.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(Ae("Texture: Unable to serialize Texture."),{})}var wm=0,Xl=new C,At=class s extends yn{constructor(e=s.DEFAULT_IMAGE,t=s.DEFAULT_MAPPING,n=1001,i=1001,r=1006,a=1008,o=1023,l=1009,c=s.DEFAULT_ANISOTROPY,h=""){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:wm++}),this.uuid=_n(),this.name="",this.source=new Hr(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new ne(0,0),this.repeat=new ne(1,1),this.center=new ne(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Fe,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(Xl).x}get height(){return this.source.getSize(Xl).y}get depth(){return this.source.getSize(Xl).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){Ae(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let i=this[t];i!==void 0?i&&n&&i.isVector2&&n.isVector2||i&&n&&i.isVector3&&n.isVector3||i&&n&&i.isMatrix3&&n.isMatrix3?i.copy(n):this[t]=n:Ae(`Texture.setValues(): property '${t}' does not exist.`)}}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Zc)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Nt:e.x=e.x-Math.floor(e.x);break;case qt:e.x=e.x<0?0:1;break;case vi:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x)}if(e.y<0||e.y>1)switch(this.wrapT){case Nt:e.y=e.y-Math.floor(e.y);break;case qt:e.y=e.y<0?0:1;break;case vi:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y)}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};At.DEFAULT_IMAGE=null,At.DEFAULT_MAPPING=Zc,At.DEFAULT_ANISOTROPY=1;var We=class s{static{s.prototype.isVector4=!0}constructor(e=0,t=0,n=0,i=1){this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*i+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*i+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*i+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*i+a[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,i,r,l=e.elements,c=l[0],h=l[4],u=l[8],d=l[1],p=l[5],m=l[9],f=l[2],_=l[6],g=l[10];if(Math.abs(h-d)<.01&&Math.abs(u-f)<.01&&Math.abs(m-_)<.01){if(Math.abs(h+d)<.1&&Math.abs(u+f)<.1&&Math.abs(m+_)<.1&&Math.abs(c+p+g-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let b=(c+1)/2,y=(p+1)/2,S=(g+1)/2,x=(h+d)/4,A=(u+f)/4,F=(m+_)/4;return b>y&&b>S?b<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(b),i=x/n,r=A/n):y>S?y<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(y),n=x/i,r=F/i):S<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(S),n=A/r,i=F/r),this.set(n,i,r,t),this}let v=Math.sqrt((_-m)*(_-m)+(u-f)*(u-f)+(d-h)*(d-h));return Math.abs(v)<.001&&(v=1),this.x=(_-m)/v,this.y=(u-f)/v,this.z=(d-h)/v,this.w=Math.acos((c+p+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=ke(this.x,e.x,t.x),this.y=ke(this.y,e.y,t.y),this.z=ke(this.z,e.z,t.z),this.w=ke(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=ke(this.x,e,t),this.y=ke(this.y,e,t),this.z=ke(this.z,e,t),this.w=ke(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},io=class extends yn{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:ct,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new We(0,0,e,t),this.scissorTest=!1,this.viewport=new We(0,0,e,t),this.textures=[];let i={width:e,height:t,depth:n.depth},r=new At(i),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:ct,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=e,this.textures[i].image.height=t,this.textures[i].image.depth=n,this.textures[i].isData3DTexture!==!0&&(this.textures[i].isArrayTexture=this.textures[i].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let i=Object.assign({},e.textures[t].image);this.textures[t].source=new Hr(i)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},an=class extends io{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},Rs=class extends At{constructor(e=null,t=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Ut,this.minFilter=Ut,this.wrapR=qt,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}};var ro=class extends At{constructor(e=null,t=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Ut,this.minFilter=Ut,this.wrapR=qt,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var ge=class s{static{s.prototype.isMatrix4=!0}constructor(e,t,n,i,r,a,o,l,c,h,u,d,p,m,f,_){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,a,o,l,c,h,u,d,p,m,f,_)}set(e,t,n,i,r,a,o,l,c,h,u,d,p,m,f,_){let g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=i,g[1]=r,g[5]=a,g[9]=o,g[13]=l,g[2]=c,g[6]=h,g[10]=u,g[14]=d,g[3]=p,g[7]=m,g[11]=f,g[15]=_,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new s().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,n=e.elements,i=1/Ar.setFromMatrixColumn(e,0).length(),r=1/Ar.setFromMatrixColumn(e,1).length(),a=1/Ar.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,i=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(i),c=Math.sin(i),h=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){let d=a*h,p=a*u,m=o*h,f=o*u;t[0]=l*h,t[4]=-l*u,t[8]=c,t[1]=p+m*c,t[5]=d-f*c,t[9]=-o*l,t[2]=f-d*c,t[6]=m+p*c,t[10]=a*l}else if(e.order==="YXZ"){let d=l*h,p=l*u,m=c*h,f=c*u;t[0]=d+f*o,t[4]=m*o-p,t[8]=a*c,t[1]=a*u,t[5]=a*h,t[9]=-o,t[2]=p*o-m,t[6]=f+d*o,t[10]=a*l}else if(e.order==="ZXY"){let d=l*h,p=l*u,m=c*h,f=c*u;t[0]=d-f*o,t[4]=-a*u,t[8]=m+p*o,t[1]=p+m*o,t[5]=a*h,t[9]=f-d*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){let d=a*h,p=a*u,m=o*h,f=o*u;t[0]=l*h,t[4]=m*c-p,t[8]=d*c+f,t[1]=l*u,t[5]=f*c+d,t[9]=p*c-m,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){let d=a*l,p=a*c,m=o*l,f=o*c;t[0]=l*h,t[4]=f-d*u,t[8]=m*u+p,t[1]=u,t[5]=a*h,t[9]=-o*h,t[2]=-c*h,t[6]=p*u+m,t[10]=d-f*u}else if(e.order==="XZY"){let d=a*l,p=a*c,m=o*l,f=o*c;t[0]=l*h,t[4]=-u,t[8]=c*h,t[1]=d*u+f,t[5]=a*h,t[9]=p*u-m,t[2]=m*u-p,t[6]=o*h,t[10]=f*u+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Am,e,Em)}lookAt(e,t,n){let i=this.elements;return rn.subVectors(e,t),rn.lengthSq()===0&&(rn.z=1),rn.normalize(),Ii.crossVectors(n,rn),Ii.lengthSq()===0&&(Math.abs(n.z)===1?rn.x+=1e-4:rn.z+=1e-4,rn.normalize(),Ii.crossVectors(n,rn)),Ii.normalize(),Sa.crossVectors(rn,Ii),i[0]=Ii.x,i[4]=Sa.x,i[8]=rn.x,i[1]=Ii.y,i[5]=Sa.y,i[9]=rn.y,i[2]=Ii.z,i[6]=Sa.z,i[10]=rn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],u=n[5],d=n[9],p=n[13],m=n[2],f=n[6],_=n[10],g=n[14],v=n[3],b=n[7],y=n[11],S=n[15],x=i[0],A=i[4],F=i[8],L=i[12],P=i[1],O=i[5],B=i[9],j=i[13],H=i[2],W=i[6],Y=i[10],K=i[14],ee=i[3],ue=i[7],Se=i[11],me=i[15];return r[0]=a*x+o*P+l*H+c*ee,r[4]=a*A+o*O+l*W+c*ue,r[8]=a*F+o*B+l*Y+c*Se,r[12]=a*L+o*j+l*K+c*me,r[1]=h*x+u*P+d*H+p*ee,r[5]=h*A+u*O+d*W+p*ue,r[9]=h*F+u*B+d*Y+p*Se,r[13]=h*L+u*j+d*K+p*me,r[2]=m*x+f*P+_*H+g*ee,r[6]=m*A+f*O+_*W+g*ue,r[10]=m*F+f*B+_*Y+g*Se,r[14]=m*L+f*j+_*K+g*me,r[3]=v*x+b*P+y*H+S*ee,r[7]=v*A+b*O+y*W+S*ue,r[11]=v*F+b*B+y*Y+S*Se,r[15]=v*L+b*j+y*K+S*me,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[12],a=e[1],o=e[5],l=e[9],c=e[13],h=e[2],u=e[6],d=e[10],p=e[14],m=e[3],f=e[7],_=e[11],g=e[15],v=l*p-c*d,b=o*p-c*u,y=o*d-l*u,S=a*p-c*h,x=a*d-l*h,A=a*u-o*h;return t*(f*v-_*b+g*y)-n*(m*v-_*S+g*x)+i*(m*b-f*S+g*A)-r*(m*y-f*x+_*A)}determinantAffine(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[1],a=e[5],o=e[9],l=e[2],c=e[6],h=e[10];return t*(a*h-o*c)-n*(r*h-o*l)+i*(r*c-a*l)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let i=this.elements;return e.isVector3?(i[12]=e.x,i[13]=e.y,i[14]=e.z):(i[12]=e,i[13]=t,i[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],u=e[9],d=e[10],p=e[11],m=e[12],f=e[13],_=e[14],g=e[15],v=t*o-n*a,b=t*l-i*a,y=t*c-r*a,S=n*l-i*o,x=n*c-r*o,A=i*c-r*l,F=h*f-u*m,L=h*_-d*m,P=h*g-p*m,O=u*_-d*f,B=u*g-p*f,j=d*g-p*_,H=v*j-b*B+y*O+S*P-x*L+A*F;if(H===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let W=1/H;return e[0]=(o*j-l*B+c*O)*W,e[1]=(i*B-n*j-r*O)*W,e[2]=(f*A-_*x+g*S)*W,e[3]=(d*x-u*A-p*S)*W,e[4]=(l*P-a*j-c*L)*W,e[5]=(t*j-i*P+r*L)*W,e[6]=(_*y-m*A-g*b)*W,e[7]=(h*A-d*y+p*b)*W,e[8]=(a*B-o*P+c*F)*W,e[9]=(n*P-t*B-r*F)*W,e[10]=(m*x-f*y+g*v)*W,e[11]=(u*y-h*x-p*v)*W,e[12]=(o*L-a*O-l*F)*W,e[13]=(t*O-n*L+i*F)*W,e[14]=(f*b-m*S-_*v)*W,e[15]=(h*S-u*b+d*v)*W,this}scale(e){let t=this.elements,n=e.x,i=e.y,r=e.z;return t[0]*=n,t[4]*=i,t[8]*=r,t[1]*=n,t[5]*=i,t[9]*=r,t[2]*=n,t[6]*=i,t[10]*=r,t[3]*=n,t[7]*=i,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),i=Math.sin(t),r=1-n,a=e.x,o=e.y,l=e.z,c=r*a,h=r*o;return this.set(c*a+n,c*o-i*l,c*l+i*o,0,c*o+i*l,h*o+n,h*l-i*a,0,c*l-i*o,h*l+i*a,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,r,a){return this.set(1,n,r,0,e,1,a,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){let i=this.elements,r=t._x,a=t._y,o=t._z,l=t._w,c=r+r,h=a+a,u=o+o,d=r*c,p=r*h,m=r*u,f=a*h,_=a*u,g=o*u,v=l*c,b=l*h,y=l*u,S=n.x,x=n.y,A=n.z;return i[0]=(1-(f+g))*S,i[1]=(p+y)*S,i[2]=(m-b)*S,i[3]=0,i[4]=(p-y)*x,i[5]=(1-(d+g))*x,i[6]=(_+v)*x,i[7]=0,i[8]=(m+b)*A,i[9]=(_-v)*A,i[10]=(1-(d+f))*A,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){let i=this.elements;e.x=i[12],e.y=i[13],e.z=i[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),t.identity(),this;let a=Ar.set(i[0],i[1],i[2]).length(),o=Ar.set(i[4],i[5],i[6]).length(),l=Ar.set(i[8],i[9],i[10]).length();r<0&&(a=-a),In.copy(this);let c=1/a,h=1/o,u=1/l;return In.elements[0]*=c,In.elements[1]*=c,In.elements[2]*=c,In.elements[4]*=h,In.elements[5]*=h,In.elements[6]*=h,In.elements[8]*=u,In.elements[9]*=u,In.elements[10]*=u,t.setFromRotationMatrix(In),n.x=a,n.y=o,n.z=l,this}makePerspective(e,t,n,i,r,a,o=2e3,l=!1){let c=this.elements,h=2*r/(t-e),u=2*r/(n-i),d=(t+e)/(t-e),p=(n+i)/(n-i),m,f;if(l)m=r/(a-r),f=a*r/(a-r);else if(o===bi)m=-(a+r)/(a-r),f=-2*a*r/(a-r);else{if(o!==zr)throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);m=-a/(a-r),f=-a*r/(a-r)}return c[0]=h,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=p,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=f,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,i,r,a,o=2e3,l=!1){let c=this.elements,h=2/(t-e),u=2/(n-i),d=-(t+e)/(t-e),p=-(n+i)/(n-i),m,f;if(l)m=1/(a-r),f=a/(a-r);else if(o===bi)m=-2/(a-r),f=-(a+r)/(a-r);else{if(o!==zr)throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);m=-1/(a-r),f=-r/(a-r)}return c[0]=h,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=p,c[2]=0,c[6]=0,c[10]=m,c[14]=f,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},Ar=new C,In=new ge,Am=new C(0,0,0),Em=new C(1,1,1),Ii=new C,Sa=new C,rn=new C,Sd=new ge,Td=new $e,Ct=class s{constructor(e=0,t=0,n=0,i=s.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let i=e.elements,r=i[0],a=i[4],o=i[8],l=i[1],c=i[5],h=i[9],u=i[2],d=i[6],p=i[10];switch(t){case"XYZ":this._y=Math.asin(ke(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,p),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-ke(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(ke(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,p),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-ke(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(ke(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-ke(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,p),this._y=0);break;default:Ae("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Sd.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Sd,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Td.setFromEuler(this),this.setFromQuaternion(Td,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Ct.DEFAULT_ORDER="XYZ";var Cs=class{constructor(){this.mask=1}set(e){this.mask=1<<e>>>0}enable(e){this.mask|=1<<e}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e}disable(e){this.mask&=~(1<<e)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return!!(this.mask&1<<e)}},Rm=0,wd=new C,Er=new $e,oi=new ge,Ta=new C,ps=new C,Cm=new C,Pm=new $e,Ad=new C(1,0,0),Ed=new C(0,1,0),Rd=new C(0,0,1),Cd={type:"added"},Im={type:"removed"},Rr={type:"childadded",child:null},Kl={type:"childremoved",child:null},st=class s extends yn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Rm++}),this.uuid=_n(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=s.DEFAULT_UP.clone();let e=new C,t=new Ct,n=new $e,i=new C(1,1,1);t._onChange(function(){n.setFromEuler(t,!1)}),n._onChange(function(){t.setFromQuaternion(n,void 0,!1)}),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new ge},normalMatrix:{value:new Fe}}),this.matrix=new ge,this.matrixWorld=new ge,this.matrixAutoUpdate=s.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=s.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Cs,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Er.setFromAxisAngle(e,t),this.quaternion.multiply(Er),this}rotateOnWorldAxis(e,t){return Er.setFromAxisAngle(e,t),this.quaternion.premultiply(Er),this}rotateX(e){return this.rotateOnAxis(Ad,e)}rotateY(e){return this.rotateOnAxis(Ed,e)}rotateZ(e){return this.rotateOnAxis(Rd,e)}translateOnAxis(e,t){return wd.copy(e).applyQuaternion(this.quaternion),this.position.add(wd.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Ad,e)}translateY(e){return this.translateOnAxis(Ed,e)}translateZ(e){return this.translateOnAxis(Rd,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(oi.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Ta.copy(e):Ta.set(e,t,n);let i=this.parent;this.updateWorldMatrix(!0,!1),ps.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?oi.lookAt(ps,Ta,this.up):oi.lookAt(Ta,ps,this.up),this.quaternion.setFromRotationMatrix(oi),i&&(oi.extractRotation(i.matrixWorld),Er.setFromRotationMatrix(oi),this.quaternion.premultiply(Er.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(Ie("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Cd),Rr.child=e,this.dispatchEvent(Rr),Rr.child=null):Ie("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Im),Kl.child=e,this.dispatchEvent(Kl),Kl.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),oi.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),oi.multiply(e.parent.matrixWorld)),e.applyMatrix4(oi),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Cd),Rr.child=e,this.dispatchEvent(Rr),Rr.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){let r=this.children[n].getObjectByProperty(e,t);if(r!==void 0)return r}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ps,e,Cm),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ps,Pm,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,n=e.y,i=e.z,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*i,r[13]+=n-r[1]*t-r[5]*n-r[9]*i,r[14]+=i-r[2]*t-r[6]*n-r[10]*i}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){let i=this.parent;if(e===!0&&i!==null&&i.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){let r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let i={};function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),this.static!==!1&&(i.static=this.static),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.pivot!==null&&(i.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(i.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(i.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map(o=>({...o})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(e),i.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(i.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(i.boundingBox=this.boundingBox.toJSON())),this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let u=l[c];r(e.shapes,u)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(e.materials,this.material[l]));i.material=o}else i.material=r(e.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];i.animations.push(r(e.animations,l))}}if(t){let o=a(e.geometries),l=a(e.materials),c=a(e.textures),h=a(e.images),u=a(e.shapes),d=a(e.skeletons),p=a(e.animations),m=a(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),m.length>0&&(n.nodes=m)}return n.object=i,n;function a(o){let l=[];for(let c in o){let h=o[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let i=e.children[n];this.add(i.clone())}return this}};st.DEFAULT_UP=new C(0,1,0),st.DEFAULT_MATRIX_AUTO_UPDATE=!0,st.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var bt=class extends st{constructor(){super(),this.isGroup=!0,this.type="Group"}},Lm={type:"move"},jr=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new bt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new bt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new C,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new C),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new bt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new C,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new C,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let i=null,r=null,a=null,o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(let f of e.hand.values()){let _=t.getJointPose(f,n),g=this._getHandJoint(c,f);_!==null&&(g.matrix.fromArray(_.transform.matrix),g.matrix.decompose(g.position,g.rotation,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=_.radius),g.visible=_!==null}let h=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],d=h.position.distanceTo(u.position),p=.02,m=.005;c.inputState.pinching&&d>p+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&d<=p-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:e,target:this})));o!==null&&(i=t.getPose(e.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Lm)))}return o!==null&&(o.visible=i!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new bt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},Zp={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Li={h:0,s:0,l:0},wa={h:0,s:0,l:0};function Yl(s,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?s+6*(e-s)*t:t<.5?e:t<2/3?s+6*(e-s)*(2/3-t):s}var de=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let i=e;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Pe){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(255&e)/255,Ce.colorSpaceToWorking(this,t),this}setRGB(e,t,n,i=Ce.workingColorSpace){return this.r=e,this.g=t,this.b=n,Ce.colorSpaceToWorking(this,i),this}setHSL(e,t,n,i=Ce.workingColorSpace){if(e=Sc(e,1),t=ke(t,0,1),n=ke(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,a=2*n-r;this.r=Yl(a,r,e+1/3),this.g=Yl(a,r,e),this.b=Yl(a,r,e-1/3)}return Ce.colorSpaceToWorking(this,i),this}setStyle(e,t=Pe){function n(r){r!==void 0&&parseFloat(r)<1&&Ae("Color: Alpha component of "+e+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,a=i[1],o=i[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:Ae("Color: Unknown color model "+e)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=i[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(r,16),t);Ae("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Pe){let n=Zp[e.toLowerCase()];return n!==void 0?this.setHex(n,t):Ae("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=gi(e.r),this.g=gi(e.g),this.b=gi(e.b),this}copyLinearToSRGB(e){return this.r=kr(e.r),this.g=kr(e.g),this.b=kr(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Pe){return Ce.workingToColorSpace(Wt.copy(this),e),65536*Math.round(ke(255*Wt.r,0,255))+256*Math.round(ke(255*Wt.g,0,255))+Math.round(ke(255*Wt.b,0,255))}getHexString(e=Pe){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Ce.workingColorSpace){Ce.workingToColorSpace(Wt.copy(this),t);let n=Wt.r,i=Wt.g,r=Wt.b,a=Math.max(n,i,r),o=Math.min(n,i,r),l,c,h=(o+a)/2;if(o===a)l=0,c=0;else{let u=a-o;switch(c=h<=.5?u/(a+o):u/(2-a-o),a){case n:l=(i-r)/u+(i<r?6:0);break;case i:l=(r-n)/u+2;break;case r:l=(n-i)/u+4}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=Ce.workingColorSpace){return Ce.workingToColorSpace(Wt.copy(this),t),e.r=Wt.r,e.g=Wt.g,e.b=Wt.b,e}getStyle(e=Pe){Ce.workingToColorSpace(Wt.copy(this),e);let t=Wt.r,n=Wt.g,i=Wt.b;return e!==Pe?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(255*t)},${Math.round(255*n)},${Math.round(255*i)})`}offsetHSL(e,t,n){return this.getHSL(Li),this.setHSL(Li.h+e,Li.s+t,Li.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Li),e.getHSL(wa);let n=Ms(Li.h,wa.h,t),i=Ms(Li.s,wa.s,t),r=Ms(Li.l,wa.l,t);return this.setHSL(n,i,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,i=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*i,this.g=r[1]*t+r[4]*n+r[7]*i,this.b=r[2]*t+r[5]*n+r[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Wt=new de;de.NAMES=Zp;var Ps=class extends st{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Ct,this.environmentIntensity=1,this.environmentRotation=new Ct,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},Ln=new C,li=new C,Jl=new C,ci=new C,Cr=new C,Pr=new C,Pd=new C,Zl=new C,Ql=new C,$l=new C,ec=new We,tc=new We,nc=new We,pi=class s{constructor(e=new C,t=new C,n=new C){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),Ln.subVectors(e,t),i.cross(Ln);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(e,t,n,i,r){Ln.subVectors(i,t),li.subVectors(n,t),Jl.subVectors(e,t);let a=Ln.dot(Ln),o=Ln.dot(li),l=Ln.dot(Jl),c=li.dot(li),h=li.dot(Jl),u=a*c-o*o;if(u===0)return r.set(0,0,0),null;let d=1/u,p=(c*l-o*h)*d,m=(a*h-o*l)*d;return r.set(1-p-m,m,p)}static containsPoint(e,t,n,i){return this.getBarycoord(e,t,n,i,ci)!==null&&ci.x>=0&&ci.y>=0&&ci.x+ci.y<=1}static getInterpolation(e,t,n,i,r,a,o,l){return this.getBarycoord(e,t,n,i,ci)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,ci.x),l.addScaledVector(a,ci.y),l.addScaledVector(o,ci.z),l)}static getInterpolatedAttribute(e,t,n,i,r,a){return ec.setScalar(0),tc.setScalar(0),nc.setScalar(0),ec.fromBufferAttribute(e,t),tc.fromBufferAttribute(e,n),nc.fromBufferAttribute(e,i),a.setScalar(0),a.addScaledVector(ec,r.x),a.addScaledVector(tc,r.y),a.addScaledVector(nc,r.z),a}static isFrontFacing(e,t,n,i){return Ln.subVectors(n,t),li.subVectors(e,t),Ln.cross(li).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Ln.subVectors(this.c,this.b),li.subVectors(this.a,this.b),.5*Ln.cross(li).length()}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return s.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return s.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,i,r){return s.getInterpolation(e,this.a,this.b,this.c,t,n,i,r)}containsPoint(e){return s.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return s.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,i=this.b,r=this.c,a,o;Cr.subVectors(i,n),Pr.subVectors(r,n),Zl.subVectors(e,n);let l=Cr.dot(Zl),c=Pr.dot(Zl);if(l<=0&&c<=0)return t.copy(n);Ql.subVectors(e,i);let h=Cr.dot(Ql),u=Pr.dot(Ql);if(h>=0&&u<=h)return t.copy(i);let d=l*u-h*c;if(d<=0&&l>=0&&h<=0)return a=l/(l-h),t.copy(n).addScaledVector(Cr,a);$l.subVectors(e,r);let p=Cr.dot($l),m=Pr.dot($l);if(m>=0&&p<=m)return t.copy(r);let f=p*c-l*m;if(f<=0&&c>=0&&m<=0)return o=c/(c-m),t.copy(n).addScaledVector(Pr,o);let _=h*m-p*u;if(_<=0&&u-h>=0&&p-m>=0)return Pd.subVectors(r,i),o=(u-h)/(u-h+(p-m)),t.copy(i).addScaledVector(Pd,o);let g=1/(_+f+d);return a=f*g,o=d*g,t.copy(n).addScaledVector(Cr,a).addScaledVector(Pr,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},zt=class{constructor(e=new C(1/0,1/0,1/0),t=new C(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Dn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Dn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=Dn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,Dn):Dn.fromBufferAttribute(r,a),Dn.applyMatrix4(e.matrixWorld),this.expandByPoint(Dn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Aa.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Aa.copy(n.boundingBox)),Aa.applyMatrix4(e.matrixWorld),this.union(Aa)}let i=e.children;for(let r=0,a=i.length;r<a;r++)this.expandByObject(i[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Dn),Dn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(fs),Ea.subVectors(this.max,fs),Ir.subVectors(e.a,fs),Lr.subVectors(e.b,fs),Dr.subVectors(e.c,fs),Di.subVectors(Lr,Ir),Fi.subVectors(Dr,Lr),Zi.subVectors(Ir,Dr);let t=[0,-Di.z,Di.y,0,-Fi.z,Fi.y,0,-Zi.z,Zi.y,Di.z,0,-Di.x,Fi.z,0,-Fi.x,Zi.z,0,-Zi.x,-Di.y,Di.x,0,-Fi.y,Fi.x,0,-Zi.y,Zi.x,0];return!!ic(t,Ir,Lr,Dr,Ea)&&(t=[1,0,0,0,1,0,0,0,1],!!ic(t,Ir,Lr,Dr,Ea)&&(Ra.crossVectors(Di,Fi),t=[Ra.x,Ra.y,Ra.z],ic(t,Ir,Lr,Dr,Ea)))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Dn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=.5*this.getSize(Dn).length()),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()||(hi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),hi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),hi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),hi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),hi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),hi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),hi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),hi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(hi)),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},hi=[new C,new C,new C,new C,new C,new C,new C,new C],Dn=new C,Aa=new zt,Ir=new C,Lr=new C,Dr=new C,Di=new C,Fi=new C,Zi=new C,fs=new C,Ea=new C,Ra=new C,Qi=new C;function ic(s,e,t,n,i){for(let r=0,a=s.length-3;r<=a;r+=3){Qi.fromArray(s,r);let o=i.x*Math.abs(Qi.x)+i.y*Math.abs(Qi.y)+i.z*Math.abs(Qi.z),l=e.dot(Qi),c=t.dot(Qi),h=n.dot(Qi);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}var hb=Dm();function Dm(){let s=new ArrayBuffer(4),e=new Float32Array(s),t=new Uint32Array(s),n=new Uint32Array(512),i=new Uint32Array(512);for(let l=0;l<256;++l){let c=l-127;c<-27?(n[l]=0,n[256|l]=32768,i[l]=24,i[256|l]=24):c<-14?(n[l]=1024>>-c-14,n[256|l]=1024>>-c-14|32768,i[l]=-c-1,i[256|l]=-c-1):c<=15?(n[l]=c+15<<10,n[256|l]=c+15<<10|32768,i[l]=13,i[256|l]=13):c<128?(n[l]=31744,n[256|l]=64512,i[l]=24,i[256|l]=24):(n[l]=31744,n[256|l]=64512,i[l]=13,i[256|l]=13)}let r=new Uint32Array(2048),a=new Uint32Array(64),o=new Uint32Array(64);for(let l=1;l<1024;++l){let c=l<<13,h=0;for(;!(8388608&c);)c<<=1,h-=8388608;c&=-8388609,h+=947912704,r[l]=c|h}for(let l=1024;l<2048;++l)r[l]=939524096+(l-1024<<13);for(let l=1;l<31;++l)a[l]=l<<23;a[31]=1199570944,a[32]=2147483648;for(let l=33;l<63;++l)a[l]=2147483648+(l-32<<23);a[63]=3347054592;for(let l=1;l<64;++l)l!==32&&(o[l]=1024);return{floatView:e,uint32View:t,baseTable:n,shiftTable:i,mantissaTable:r,exponentTable:a,offsetTable:o}}var wt=new C,Ca=new ne,Fm=0,Xe=class extends yn{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Fm++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=to,this.updateRanges=[],this.gpuType=dn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Ca.fromBufferAttribute(this,t),Ca.applyMatrix3(e),this.setXY(t,Ca.x,Ca.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)wt.fromBufferAttribute(this,t),wt.applyMatrix3(e),this.setXYZ(t,wt.x,wt.y,wt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)wt.fromBufferAttribute(this,t),wt.applyMatrix4(e),this.setXYZ(t,wt.x,wt.y,wt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)wt.fromBufferAttribute(this,t),wt.applyNormalMatrix(e),this.setXYZ(t,wt.x,wt.y,wt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)wt.fromBufferAttribute(this,t),wt.transformDirection(e),this.setXYZ(t,wt.x,wt.y,wt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Fn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=rt(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Fn(t,this.array)),t}setX(e,t){return this.normalized&&(t=rt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Fn(t,this.array)),t}setY(e,t){return this.normalized&&(t=rt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Fn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=rt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Fn(t,this.array)),t}setW(e,t){return this.normalized&&(t=rt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=rt(t,this.array),n=rt(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){return e*=this.itemSize,this.normalized&&(t=rt(t,this.array),n=rt(n,this.array),i=rt(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e*=this.itemSize,this.normalized&&(t=rt(t,this.array),n=rt(n,this.array),i=rt(i,this.array),r=rt(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==to&&(e.usage=this.usage),e}dispose(){this.dispatchEvent({type:"dispose"})}},Is=class extends Xe{constructor(e,t,n){super(new Int8Array(e),t,n)}},Ls=class extends Xe{constructor(e,t,n){super(new Uint8Array(e),t,n)}};var Ds=class extends Xe{constructor(e,t,n){super(new Int16Array(e),t,n)}},_i=class extends Xe{constructor(e,t,n){super(new Uint16Array(e),t,n)}},Fs=class extends Xe{constructor(e,t,n){super(new Int32Array(e),t,n)}},lr=class extends Xe{constructor(e,t,n){super(new Uint32Array(e),t,n)}};var ve=class extends Xe{constructor(e,t,n){super(new Float32Array(e),t,n)}},Nm=new zt,ms=new C,rc=new C,Jt=class{constructor(e=new C,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):Nm.setFromPoints(e).getCenter(n);let i=0;for(let r=0,a=e.length;r<a;r++)i=Math.max(i,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;ms.subVectors(e,this.center);let t=ms.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),i=.5*(n-this.radius);this.center.addScaledVector(ms,i/n),this.radius+=i}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(rc.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(ms.copy(e.center).add(rc)),this.expandByPoint(ms.copy(e.center).sub(rc))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},Um=0,gn=new ge,sc=new st,Fr=new C,sn=new zt,gs=new zt,Ft=new C,De=class s extends yn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Um++}),this.uuid=_n(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new((function(t){for(let n=t.length-1;n>=0;--n)if(t[n]>=65535)return!0;return!1})(e)?lr:_i)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Fe().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(e),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return gn.makeRotationFromQuaternion(e),this.applyMatrix4(gn),this}rotateX(e){return gn.makeRotationX(e),this.applyMatrix4(gn),this}rotateY(e){return gn.makeRotationY(e),this.applyMatrix4(gn),this}rotateZ(e){return gn.makeRotationZ(e),this.applyMatrix4(gn),this}translate(e,t,n){return gn.makeTranslation(e,t,n),this.applyMatrix4(gn),this}scale(e,t,n){return gn.makeScale(e,t,n),this.applyMatrix4(gn),this}lookAt(e){return sc.lookAt(e),sc.updateMatrix(),this.applyMatrix4(sc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Fr).negate(),this.translate(Fr.x,Fr.y,Fr.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let n=[];for(let i=0,r=e.length;i<r;i++){let a=e[i];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new ve(n,3))}else{let n=Math.min(e.length,t.count);for(let i=0;i<n;i++){let r=e[i];t.setXYZ(i,r.x,r.y,r.z||0)}e.length>t.count&&Ae("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new zt);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)return Ie("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),void this.boundingBox.set(new C(-1/0,-1/0,-1/0),new C(1/0,1/0,1/0));if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){let r=t[n];sn.setFromBufferAttribute(r),this.morphTargetsRelative?(Ft.addVectors(this.boundingBox.min,sn.min),this.boundingBox.expandByPoint(Ft),Ft.addVectors(this.boundingBox.max,sn.max),this.boundingBox.expandByPoint(Ft)):(this.boundingBox.expandByPoint(sn.min),this.boundingBox.expandByPoint(sn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ie('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Jt);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute)return Ie("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),void this.boundingSphere.set(new C,1/0);if(e){let n=this.boundingSphere.center;if(sn.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){let o=t[r];gs.setFromBufferAttribute(o),this.morphTargetsRelative?(Ft.addVectors(sn.min,gs.min),sn.expandByPoint(Ft),Ft.addVectors(sn.max,gs.max),sn.expandByPoint(Ft)):(sn.expandByPoint(gs.min),sn.expandByPoint(gs.max))}sn.getCenter(n);let i=0;for(let r=0,a=e.count;r<a;r++)Ft.fromBufferAttribute(e,r),i=Math.max(i,n.distanceToSquared(Ft));if(t)for(let r=0,a=t.length;r<a;r++){let o=t[r],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)Ft.fromBufferAttribute(o,c),l&&(Fr.fromBufferAttribute(e,c),Ft.add(Fr)),i=Math.max(i,n.distanceToSquared(Ft))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&Ie('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0)return void Ie("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");let n=t.position,i=t.normal,r=t.uv,a=this.getAttribute("tangent");a!==void 0&&a.count===n.count||(a=new Xe(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));let o=[],l=[];for(let F=0;F<n.count;F++)o[F]=new C,l[F]=new C;let c=new C,h=new C,u=new C,d=new ne,p=new ne,m=new ne,f=new C,_=new C;function g(F,L,P){c.fromBufferAttribute(n,F),h.fromBufferAttribute(n,L),u.fromBufferAttribute(n,P),d.fromBufferAttribute(r,F),p.fromBufferAttribute(r,L),m.fromBufferAttribute(r,P),h.sub(c),u.sub(c),p.sub(d),m.sub(d);let O=1/(p.x*m.y-m.x*p.y);isFinite(O)&&(f.copy(h).multiplyScalar(m.y).addScaledVector(u,-p.y).multiplyScalar(O),_.copy(u).multiplyScalar(p.x).addScaledVector(h,-m.x).multiplyScalar(O),o[F].add(f),o[L].add(f),o[P].add(f),l[F].add(_),l[L].add(_),l[P].add(_))}let v=this.groups;v.length===0&&(v=[{start:0,count:e.count}]);for(let F=0,L=v.length;F<L;++F){let P=v[F],O=P.start;for(let B=O,j=O+P.count;B<j;B+=3)g(e.getX(B+0),e.getX(B+1),e.getX(B+2))}let b=new C,y=new C,S=new C,x=new C;function A(F){S.fromBufferAttribute(i,F),x.copy(S);let L=o[F];b.copy(L),b.sub(S.multiplyScalar(S.dot(L))).normalize(),y.crossVectors(x,L);let P=y.dot(l[F])<0?-1:1;a.setXYZW(F,b.x,b.y,b.z,P)}for(let F=0,L=v.length;F<L;++F){let P=v[F],O=P.start;for(let B=O,j=O+P.count;B<j;B+=3)A(e.getX(B+0)),A(e.getX(B+1)),A(e.getX(B+2))}this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==t.count)n=new Xe(new Float32Array(3*t.count),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);let i=new C,r=new C,a=new C,o=new C,l=new C,c=new C,h=new C,u=new C;if(e)for(let d=0,p=e.count;d<p;d+=3){let m=e.getX(d+0),f=e.getX(d+1),_=e.getX(d+2);i.fromBufferAttribute(t,m),r.fromBufferAttribute(t,f),a.fromBufferAttribute(t,_),h.subVectors(a,r),u.subVectors(i,r),h.cross(u),o.fromBufferAttribute(n,m),l.fromBufferAttribute(n,f),c.fromBufferAttribute(n,_),o.add(h),l.add(h),c.add(h),n.setXYZ(m,o.x,o.y,o.z),n.setXYZ(f,l.x,l.y,l.z),n.setXYZ(_,c.x,c.y,c.z)}else for(let d=0,p=t.count;d<p;d+=3)i.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),a.fromBufferAttribute(t,d+2),h.subVectors(a,r),u.subVectors(i,r),h.cross(u),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Ft.fromBufferAttribute(e,t),Ft.normalize(),e.setXYZ(t,Ft.x,Ft.y,Ft.z)}toNonIndexed(){function e(o,l){let c=o.array,h=o.itemSize,u=o.normalized,d=new c.constructor(l.length*h),p=0,m=0;for(let f=0,_=l.length;f<_;f++){p=o.isInterleavedBufferAttribute?l[f]*o.data.stride+o.offset:l[f]*h;for(let g=0;g<h;g++)d[m++]=c[p++]}return new Xe(d,h,u)}if(this.index===null)return Ae("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new s,n=this.index.array,i=this.attributes;for(let o in i){let l=e(i[o],n);t.setAttribute(o,l)}let r=this.morphAttributes;for(let o in r){let l=[],c=r[o];for(let h=0,u=c.length;h<u;h++){let d=e(c[h],n);l.push(d)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,l=a.length;o<l;o++){let c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let l in n){let c=n[l];e.data.attributes[l]=c.toJSON(e.data)}let i={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let u=0,d=c.length;u<d;u++){let p=c[u];h.push(p.toJSON(e.data))}h.length>0&&(i[l]=h,r=!0)}r&&(e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let i=e.attributes;for(let c in i){let h=i[c];this.setAttribute(c,h.clone(t))}let r=e.morphAttributes;for(let c in r){let h=[],u=r[c];for(let d=0,p=u.length;d<p;d++)h.push(u[d].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let c=0,h=a.length;c<h;c++){let u=a[c];this.addGroup(u.start,u.count,u.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}},Oi=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=to,this.updateRanges=[],this.version=0,this.uuid=_n()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,r=this.stride;i<r;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=_n()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=_n()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},Yt=new C,Bi=class s{constructor(e,t,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Yt.fromBufferAttribute(this,t),Yt.applyMatrix4(e),this.setXYZ(t,Yt.x,Yt.y,Yt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Yt.fromBufferAttribute(this,t),Yt.applyNormalMatrix(e),this.setXYZ(t,Yt.x,Yt.y,Yt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Yt.fromBufferAttribute(this,t),Yt.transformDirection(e),this.setXYZ(t,Yt.x,Yt.y,Yt.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=Fn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=rt(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=rt(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=rt(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=rt(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=rt(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Fn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Fn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Fn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Fn(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=rt(t,this.array),n=rt(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=rt(t,this.array),n=rt(n,this.array),i=rt(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=rt(t,this.array),n=rt(n,this.array),i=rt(i,this.array),r=rt(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=r,this}clone(e){if(e===void 0){Es("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return new Xe(new this.array.constructor(t),this.itemSize,this.normalized)}return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new s(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){Es("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}};var Om=0,Pt=class extends yn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Om++}),this.uuid=_n(),this.name="",this.type="Material",this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new de(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=tr,this.stencilZFail=tr,this.stencilZPass=tr,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){Ae(`Material: parameter '${t}' has value of undefined.`);continue}let i=this[t];i!==void 0?i&&i.isColor?i.set(n):i&&i.isVector2&&n&&n.isVector2||i&&i.isEuler&&n&&n.isEuler||i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[t]=n:Ae(`Material: '${t}' is not a property of THREE.${this.type}.`)}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};function i(r){let a=[];for(let o in r){let l=r[o];delete l.metadata,a.push(l)}return a}if(n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==1&&(n.blending=this.blending),this.side!==0&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==204&&(n.blendSrc=this.blendSrc),this.blendDst!==205&&(n.blendDst=this.blendDst),this.blendEquation!==100&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==3&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==519&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==tr&&(n.stencilFail=this.stencilFail),this.stencilZFail!==tr&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==tr&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData),t){let r=i(e.textures),a=i(e.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new de().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let n=e.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new ne().fromArray(n)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new ne().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let i=t.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}};var ub=new C,db=new C,pb=new C,fb=new ne,mb=new ne,gb=new ge,vb=new C,bb=new C,_b=new C,yb=new ne,xb=new ne,Mb=new ne;var Sb=new C,Tb=new C;var ui=new C,ac=new C,Pa=new C,Ni=new C,oc=new C,Ia=new C,lc=new C,yi=class{constructor(e=new C,t=new C(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,ui)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=ui.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(ui.copy(this.origin).addScaledVector(this.direction,t),ui.distanceToSquared(e))}distanceSqToSegment(e,t,n,i){ac.copy(e).add(t).multiplyScalar(.5),Pa.copy(t).sub(e).normalize(),Ni.copy(this.origin).sub(ac);let r=.5*e.distanceTo(t),a=-this.direction.dot(Pa),o=Ni.dot(this.direction),l=-Ni.dot(Pa),c=Ni.lengthSq(),h=Math.abs(1-a*a),u,d,p,m;if(h>0)if(u=a*l-o,d=a*o-l,m=r*h,u>=0)if(d>=-m)if(d<=m){let f=1/h;u*=f,d*=f,p=u*(u+a*d+2*o)+d*(a*u+d+2*l)+c}else d=r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;else d=-r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;else d<=-m?(u=Math.max(0,-(-a*r+o)),d=u>0?-r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c):d<=m?(u=0,d=Math.min(Math.max(-r,-l),r),p=d*(d+2*l)+c):(u=Math.max(0,-(a*r+o)),d=u>0?r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c);else d=a>0?-r:r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),i&&i.copy(ac).addScaledVector(Pa,d),p}intersectSphere(e,t){ui.subVectors(e.center,this.origin);let n=ui.dot(this.direction),i=ui.dot(ui)-n*n,r=e.radius*e.radius;if(i>r)return null;let a=Math.sqrt(r-i),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return!(e.radius<0)&&this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0?!0:e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,i,r,a,o,l,c=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,i=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,i=(e.min.x-d.x)*c),h>=0?(r=(e.min.y-d.y)*h,a=(e.max.y-d.y)*h):(r=(e.max.y-d.y)*h,a=(e.min.y-d.y)*h),n>a||r>i?null:((r>n||isNaN(n))&&(n=r),(a<i||isNaN(i))&&(i=a),u>=0?(o=(e.min.z-d.z)*u,l=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,l=(e.min.z-d.z)*u),n>l||o>i?null:((o>n||n!=n)&&(n=o),(l<i||i!=i)&&(i=l),i<0?null:this.at(n>=0?n:i,t)))}intersectsBox(e){return this.intersectBox(e,ui)!==null}intersectTriangle(e,t,n,i,r){oc.subVectors(t,e),Ia.subVectors(n,e),lc.crossVectors(oc,Ia);let a,o=this.direction.dot(lc);if(o>0){if(i)return null;a=1}else{if(!(o<0))return null;a=-1,o=-o}Ni.subVectors(this.origin,e);let l=a*this.direction.dot(Ia.crossVectors(Ni,Ia));if(l<0)return null;let c=a*this.direction.dot(oc.cross(Ni));if(c<0||l+c>o)return null;let h=-a*Ni.dot(lc);return h<0?null:this.at(h/o,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Nn=class extends Pt{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new de(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ct,this.combine=0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},Id=new ge,$i=new yi,La=new Jt,Ld=new C,Da=new C,Fa=new C,Na=new C,cc=new C,Ua=new C,Dd=new C,Oa=new C,et=class extends st{constructor(e=new De,t=new Nn){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let i=0,r=n.length;i<r;i++){let a=n[i].name||String(i);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=i}}}}getVertexPosition(e,t){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(i,e);let o=this.morphTargetInfluences;if(r&&o){Ua.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=o[l],u=r[l];h!==0&&(cc.fromBufferAttribute(u,e),a?Ua.addScaledVector(cc,h):Ua.addScaledVector(cc.sub(t),h))}t.add(Ua)}return t}raycast(e,t){let n=this.geometry,i=this.material,r=this.matrixWorld;if(i!==void 0){if(n.boundingSphere===null&&n.computeBoundingSphere(),La.copy(n.boundingSphere),La.applyMatrix4(r),$i.copy(e.ray).recast(e.near),La.containsPoint($i.origin)===!1&&($i.intersectSphere(La,Ld)===null||$i.origin.distanceToSquared(Ld)>(e.far-e.near)**2))return;Id.copy(r).invert(),$i.copy(e.ray).applyMatrix4(Id),n.boundingBox!==null&&$i.intersectsBox(n.boundingBox)===!1||this._computeIntersections(e,t,$i)}}_computeIntersections(e,t,n){let i,r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,d=r.groups,p=r.drawRange;if(o!==null)if(Array.isArray(a))for(let m=0,f=d.length;m<f;m++){let _=d[m],g=a[_.materialIndex];for(let v=Math.max(_.start,p.start),b=Math.min(o.count,Math.min(_.start+_.count,p.start+p.count));v<b;v+=3)i=Ba(this,g,e,n,c,h,u,o.getX(v),o.getX(v+1),o.getX(v+2)),i&&(i.faceIndex=Math.floor(v/3),i.face.materialIndex=_.materialIndex,t.push(i))}else for(let m=Math.max(0,p.start),f=Math.min(o.count,p.start+p.count);m<f;m+=3)i=Ba(this,a,e,n,c,h,u,o.getX(m),o.getX(m+1),o.getX(m+2)),i&&(i.faceIndex=Math.floor(m/3),t.push(i));else if(l!==void 0)if(Array.isArray(a))for(let m=0,f=d.length;m<f;m++){let _=d[m],g=a[_.materialIndex];for(let v=Math.max(_.start,p.start),b=Math.min(l.count,Math.min(_.start+_.count,p.start+p.count));v<b;v+=3)i=Ba(this,g,e,n,c,h,u,v,v+1,v+2),i&&(i.faceIndex=Math.floor(v/3),i.face.materialIndex=_.materialIndex,t.push(i))}else for(let m=Math.max(0,p.start),f=Math.min(l.count,p.start+p.count);m<f;m+=3)i=Ba(this,a,e,n,c,h,u,m,m+1,m+2),i&&(i.faceIndex=Math.floor(m/3),t.push(i))}};function Ba(s,e,t,n,i,r,a,o,l,c){s.getVertexPosition(o,Da),s.getVertexPosition(l,Fa),s.getVertexPosition(c,Na);let h=(function(u,d,p,m,f,_,g,v){let b;if(b=d.side===1?m.intersectTriangle(g,_,f,!0,v):m.intersectTriangle(f,_,g,d.side===0,v),b===null)return null;Oa.copy(v),Oa.applyMatrix4(u.matrixWorld);let y=p.ray.origin.distanceTo(Oa);return y<p.near||y>p.far?null:{distance:y,point:Oa.clone(),object:u}})(s,e,t,n,Da,Fa,Na,Dd);if(h){let u=new C;pi.getBarycoord(Dd,Da,Fa,Na,u),i&&(h.uv=pi.getInterpolatedAttribute(i,o,l,c,u,new ne)),r&&(h.uv1=pi.getInterpolatedAttribute(r,o,l,c,u,new ne)),a&&(h.normal=pi.getInterpolatedAttribute(a,o,l,c,u,new C),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let d={a:o,b:l,c,normal:new C,materialIndex:0};pi.getNormal(Da,Fa,Na,d.normal),h.face=d,h.barycoord=u}return h}var vs=new We,Fd=new We,Nd=new We,Bm=new We,Ud=new ge,ka=new C,hc=new Jt,Od=new ge,uc=new yi,cr=class extends et{constructor(e,t){super(e,t),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=xc,this.bindMatrix=new ge,this.bindMatrixInverse=new ge,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let e=this.geometry;this.boundingBox===null&&(this.boundingBox=new zt),this.boundingBox.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ka),this.boundingBox.expandByPoint(ka)}computeBoundingSphere(){let e=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new Jt),this.boundingSphere.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ka),this.boundingSphere.expandByPoint(ka)}copy(e,t){return super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}raycast(e,t){let n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),hc.copy(this.boundingSphere),hc.applyMatrix4(i),e.ray.intersectsSphere(hc)!==!1&&(Od.copy(i).invert(),uc.copy(e.ray).applyMatrix4(Od),this.boundingBox!==null&&uc.intersectsBox(this.boundingBox)===!1||this._computeIntersections(e,t,uc)))}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let e=new We,t=this.geometry.attributes.skinWeight;for(let n=0,i=t.count;n<i;n++){e.fromBufferAttribute(t,n);let r=1/e.manhattanLength();r!==1/0?e.multiplyScalar(r):e.set(1,0,0,0),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode===xc?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===Np?this.bindMatrixInverse.copy(this.bindMatrix).invert():Ae("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(e,t){let n=this.skeleton,i=this.geometry;Fd.fromBufferAttribute(i.attributes.skinIndex,e),Nd.fromBufferAttribute(i.attributes.skinWeight,e),t.isVector4?(vs.copy(t),t.set(0,0,0,0)):(vs.set(...t,1),t.set(0,0,0)),vs.applyMatrix4(this.bindMatrix);for(let r=0;r<4;r++){let a=Nd.getComponent(r);if(a!==0){let o=Fd.getComponent(r);Ud.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),t.addScaledVector(Bm.copy(vs).applyMatrix4(Ud),a)}}return t.isVector4&&(t.w=vs.w),t.applyMatrix4(this.bindMatrixInverse)}},xi=class extends st{constructor(){super(),this.isBone=!0,this.type="Bone"}},Wr=class extends At{constructor(e=null,t=1,n=1,i,r,a,o,l,c=1003,h=1003,u,d){super(null,a,o,l,c,h,i,r,u,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Bd=new ge,km=new ge,hr=class s{constructor(e=[],t=[]){this.uuid=_n(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){let e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(16*e.length),t.length===0)this.calculateInverses();else if(e.length!==t.length){Ae("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new ge)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){let n=new ge;this.bones[e]&&n.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){let e=this.bones,t=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,a=e.length;r<a;r++){let o=e[r]?e[r].matrixWorld:km;Bd.multiplyMatrices(o,t[r]),Bd.toArray(n,16*r)}i!==null&&(i.needsUpdate=!0)}clone(){return new s(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(4*this.bones.length);e=4*Math.ceil(e/4),e=Math.max(e,4);let t=new Float32Array(e*e*4);t.set(this.boneMatrices);let n=new Wr(t,e,e,Tn,dn);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){let i=this.bones[t];if(i.name===e)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,i=e.bones.length;n<i;n++){let r=e.bones[n],a=t[r];a===void 0&&(Ae("Skeleton: No bone found with UUID:",r),a=new xi),this.bones.push(a),this.boneInverses.push(new ge().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){let e={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;let t=this.bones,n=this.boneInverses;for(let i=0,r=t.length;i<r;i++){let a=t[i];e.bones.push(a.uuid);let o=n[i];e.boneInverses.push(o.toArray())}return e}},ki=class extends Xe{constructor(e,t,n,i=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}},Nr=new ge,kd=new ge,za=[],zd=new zt,zm=new ge,bs=new et,_s=new Jt,Ns=class extends et{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new ki(new Float32Array(16*n),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,zm)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new zt),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Nr),zd.copy(e.boundingBox).applyMatrix4(Nr),this.boundingBox.union(zd)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Jt),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Nr),_s.copy(e.boundingSphere).applyMatrix4(Nr),this.boundingSphere.union(_s)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,3*e)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,16*e)}getMorphAt(e,t){let n=t.morphTargetInfluences,i=this.morphTexture.source.data.data,r=e*(n.length+1)+1;for(let a=0;a<n.length;a++)n[a]=i[r+a]}raycast(e,t){let n=this.matrixWorld,i=this.count;if(bs.geometry=this.geometry,bs.material=this.material,bs.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),_s.copy(this.boundingSphere),_s.applyMatrix4(n),e.ray.intersectsSphere(_s)!==!1))for(let r=0;r<i;r++){this.getMatrixAt(r,Nr),kd.multiplyMatrices(n,Nr),bs.matrixWorld=kd,bs.raycast(e,za);for(let a=0,o=za.length;a<o;a++){let l=za[a];l.instanceId=r,l.object=this,t.push(l)}za.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new ki(new Float32Array(3*this.instanceMatrix.count).fill(1),3)),t.toArray(this.instanceColor.array,3*e),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,16*e),this}setMorphAt(e,t){let n=t.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new Wr(new Float32Array(i*this.count),i,this.count,Qo,dn));let r=this.morphTexture.source.data.data,a=0;for(let c=0;c<n.length;c++)a+=n[c];let o=this.geometry.morphTargetsRelative?1:1-a,l=i*e;return r[l]=o,r.set(n,l+1),this}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},dc=new C,Gm=new C,Vm=new Fe,vn=class{constructor(e=new C(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let i=dc.subVectors(n,t).cross(Gm.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){let i=e.delta(dc),r=this.normal.dot(i);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let a=-(e.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(i,a)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Vm.getNormalMatrix(e),i=this.coplanarPoint(dc).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},er=new Jt,Hm=new ne(.5,.5),Ga=new C,Mi=class{constructor(e=new vn,t=new vn,n=new vn,i=new vn,r=new vn,a=new vn){this.planes=[e,t,n,i,r,a]}set(e,t,n,i,r,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(i),o[4].copy(r),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=2e3,n=!1){let i=this.planes,r=e.elements,a=r[0],o=r[1],l=r[2],c=r[3],h=r[4],u=r[5],d=r[6],p=r[7],m=r[8],f=r[9],_=r[10],g=r[11],v=r[12],b=r[13],y=r[14],S=r[15];if(i[0].setComponents(c-a,p-h,g-m,S-v).normalize(),i[1].setComponents(c+a,p+h,g+m,S+v).normalize(),i[2].setComponents(c+o,p+u,g+f,S+b).normalize(),i[3].setComponents(c-o,p-u,g-f,S-b).normalize(),n)i[4].setComponents(l,d,_,y).normalize(),i[5].setComponents(c-l,p-d,g-_,S-y).normalize();else if(i[4].setComponents(c-l,p-d,g-_,S-y).normalize(),t===bi)i[5].setComponents(c+l,p+d,g+_,S+y).normalize();else{if(t!==zr)throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);i[5].setComponents(l,d,_,y).normalize()}return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),er.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),er.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(er)}intersectsSprite(e){er.center.set(0,0,0);let t=Hm.distanceTo(e.center);return er.radius=.7071067811865476+t,er.applyMatrix4(e.matrixWorld),this.intersectsSphere(er)}intersectsSphere(e){let t=this.planes,n=e.center,i=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let i=t[n];if(Ga.x=i.normal.x>0?e.max.x:e.min.x,Ga.y=i.normal.y>0?e.max.y:e.min.y,Ga.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(Ga)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},Gd=new ge,so=class s{constructor(){this.coordinateSystem=bi,this._frustums=[],this._count=0}setFromArrayCamera(e){let t=e.cameras,n=this._frustums;for(let i=0;i<t.length;i++){let r=t[i];Gd.multiplyMatrices(r.projectionMatrix,r.matrixWorldInverse),n[i]===void 0&&(n[i]=new Mi),n[i].setFromProjectionMatrix(Gd,r.coordinateSystem,r.reversedDepth)}return this._count=t.length,this}intersectsObject(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsObject(e))return!0;return!1}intersectsSprite(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsSprite(e))return!0;return!1}intersectsSphere(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsSphere(e))return!0;return!1}intersectsBox(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].intersectsBox(e))return!0;return!1}containsPoint(e){let t=this._frustums;for(let n=0;n<this._count;n++)if(t[n].containsPoint(e))return!0;return!1}copy(e){this.coordinateSystem=e.coordinateSystem;let t=this._frustums,n=e._frustums;for(let i=0;i<e._count;i++)t[i]===void 0&&(t[i]=new Mi),t[i].copy(n[i]);return this._count=e._count,this}clone(){return new s().copy(this)}};var Tc=class{constructor(){this.index=0,this.pool=[],this.list=[]}push(e,t,n,i){let r=this.pool,a=this.list;this.index>=r.length&&r.push({start:-1,count:-1,z:-1,index:-1});let o=r[this.index];a.push(o),this.index++,o.start=e,o.count=t,o.z=n,o.index=i}reset(){this.list.length=0,this.index=0}},wb=new ge,Ab=new de(1,1,1),Eb=new Mi,Rb=new so,Cb=new zt,Pb=new Jt,Ib=new C,Lb=new C,Db=new C,Fb=new Tc,Nb=new et;var on=class extends Pt{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new de(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},ao=new C,oo=new C,Vd=new ge,ys=new yi,Va=new Jt,pc=new C,Hd=new C,Si=class extends st{constructor(e=new De,t=new on){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let i=1,r=t.count;i<r;i++)ao.fromBufferAttribute(t,i-1),oo.fromBufferAttribute(t,i),n[i]=n[i-1],n[i]+=ao.distanceTo(oo);e.setAttribute("lineDistance",new ve(n,1))}else Ae("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Va.copy(n.boundingSphere),Va.applyMatrix4(i),Va.radius+=r,e.ray.intersectsSphere(Va)===!1)return;Vd.copy(i).invert(),ys.copy(e.ray).applyMatrix4(Vd);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=this.isLineSegments?2:1,h=n.index,u=n.attributes.position;if(h!==null){let d=Math.max(0,a.start),p=Math.min(h.count,a.start+a.count);for(let m=d,f=p-1;m<f;m+=c){let _=h.getX(m),g=h.getX(m+1),v=Ha(this,e,ys,l,_,g,m);v&&t.push(v)}if(this.isLineLoop){let m=h.getX(p-1),f=h.getX(d),_=Ha(this,e,ys,l,m,f,p-1);_&&t.push(_)}}else{let d=Math.max(0,a.start),p=Math.min(u.count,a.start+a.count);for(let m=d,f=p-1;m<f;m+=c){let _=Ha(this,e,ys,l,m,m+1,m);_&&t.push(_)}if(this.isLineLoop){let m=Ha(this,e,ys,l,p-1,d,p-1);m&&t.push(m)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let i=0,r=n.length;i<r;i++){let a=n[i].name||String(i);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=i}}}}};function Ha(s,e,t,n,i,r,a){let o=s.geometry.attributes.position;if(ao.fromBufferAttribute(o,i),oo.fromBufferAttribute(o,r),t.distanceSqToSegment(ao,oo,pc,Hd)>n)return;pc.applyMatrix4(s.matrixWorld);let l=e.ray.origin.distanceTo(pc);return l<e.near||l>e.far?void 0:{distance:l,point:Hd.clone().applyMatrix4(s.matrixWorld),index:a,face:null,faceIndex:null,barycoord:null,object:s}}var jd=new C,Wd=new C,Ti=class extends Si{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let i=0,r=t.count;i<r;i+=2)jd.fromBufferAttribute(t,i),Wd.fromBufferAttribute(t,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+jd.distanceTo(Wd);e.setAttribute("lineDistance",new ve(n,1))}else Ae("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}},Us=class extends Si{constructor(e,t){super(e,t),this.isLineLoop=!0,this.type="LineLoop"}},ln=class extends Pt{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new de(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},qd=new ge,wc=new yi,ja=new Jt,Wa=new C,Un=class extends st{constructor(e=new De,t=new ln){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),ja.copy(n.boundingSphere),ja.applyMatrix4(i),ja.radius+=r,e.ray.intersectsSphere(ja)===!1)return;qd.copy(i).invert(),wc.copy(e.ray).applyMatrix4(qd);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,h=n.attributes.position;if(c!==null)for(let u=Math.max(0,a.start),d=Math.min(c.count,a.start+a.count);u<d;u++){let p=c.getX(u);Wa.fromBufferAttribute(h,p),Xd(Wa,p,l,i,e,t,this)}else for(let u=Math.max(0,a.start),d=Math.min(h.count,a.start+a.count);u<d;u++)Wa.fromBufferAttribute(h,u),Xd(Wa,u,l,i,e,t,this)}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let i=0,r=n.length;i<r;i++){let a=n[i].name||String(i);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=i}}}}};function Xd(s,e,t,n,i,r,a){let o=wc.distanceSqToPoint(s);if(o<t){let l=new C;wc.closestPointToPoint(s,l),l.applyMatrix4(n);let c=i.ray.origin.distanceTo(l);if(c<i.near||c>i.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}var Os=class extends At{constructor(e=[],t=301,n,i,r,a,o,l,c,h){super(e,t,n,i,r,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}};var wi=class extends At{constructor(e,t,n=1014,i,r,a,o=1003,l=1003,c,h=1026,u=1){if(h!==qi&&h!==1027)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");super({width:e,height:t,depth:u},i,r,a,o,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Hr(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},lo=class extends wi{constructor(e,t=1014,n=301,i,r,a=1003,o=1003,l,c=1026){let h={width:e,height:e,depth:1},u=[h,h,h,h,h,h];super(e,e,t,n,i,r,a,o,l,c),this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},Bs=class extends At{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},ur=class s extends De{constructor(e=1,t=1,n=1,i=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:r,depthSegments:a};let o=this;i=Math.floor(i),r=Math.floor(r),a=Math.floor(a);let l=[],c=[],h=[],u=[],d=0,p=0;function m(f,_,g,v,b,y,S,x,A,F,L){let P=y/A,O=S/F,B=y/2,j=S/2,H=x/2,W=A+1,Y=F+1,K=0,ee=0,ue=new C;for(let Se=0;Se<Y;Se++){let me=Se*O-j;for(let xe=0;xe<W;xe++){let te=xe*P-B;ue[f]=te*v,ue[_]=me*b,ue[g]=H,c.push(ue.x,ue.y,ue.z),ue[f]=0,ue[_]=0,ue[g]=x>0?1:-1,h.push(ue.x,ue.y,ue.z),u.push(xe/A),u.push(1-Se/F),K+=1}}for(let Se=0;Se<F;Se++)for(let me=0;me<A;me++){let xe=d+me+W*Se,te=d+me+W*(Se+1),pe=d+(me+1)+W*(Se+1),oe=d+(me+1)+W*Se;l.push(xe,te,oe),l.push(te,pe,oe),ee+=6}o.addGroup(p,ee,L),p+=ee,d+=K}m("z","y","x",-1,-1,n,t,e,a,r,0),m("z","y","x",1,-1,n,t,-e,a,r,1),m("x","z","y",1,1,e,n,t,i,a,2),m("x","z","y",1,-1,e,n,-t,i,a,3),m("x","y","z",1,-1,e,t,n,i,r,4),m("x","y","z",-1,-1,e,t,-n,i,r,5),this.setIndex(l),this.setAttribute("position",new ve(c,3)),this.setAttribute("normal",new ve(h,3)),this.setAttribute("uv",new ve(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}},co=class s extends De{constructor(e=1,t=1,n=4,i=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:e,height:t,capSegments:n,radialSegments:i,heightSegments:r},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),i=Math.max(3,Math.floor(i)),r=Math.max(1,Math.floor(r));let a=[],o=[],l=[],c=[],h=t/2,u=Math.PI/2*e,d=t,p=2*u+d,m=2*n+r,f=i+1,_=new C,g=new C;for(let v=0;v<=m;v++){let b=0,y=0,S=0,x=0;if(v<=n){let L=v/n,P=L*Math.PI/2;y=-h-e*Math.cos(P),S=e*Math.sin(P),x=-e*Math.cos(P),b=L*u}else if(v<=n+r){let L=(v-n)/r;y=L*t-h,S=e,x=0,b=u+L*d}else{let L=(v-n-r)/n,P=L*Math.PI/2;y=h+e*Math.sin(P),S=e*Math.cos(P),x=e*Math.sin(P),b=u+d+L*u}let A=Math.max(0,Math.min(1,b/p)),F=0;v===0?F=.5/i:v===m&&(F=-.5/i);for(let L=0;L<=i;L++){let P=L/i,O=P*Math.PI*2,B=Math.sin(O),j=Math.cos(O);g.x=-S*j,g.y=y,g.z=S*B,o.push(g.x,g.y,g.z),_.set(-S*j,x,S*B),_.normalize(),l.push(_.x,_.y,_.z),c.push(P+F,A)}if(v>0){let L=(v-1)*f;for(let P=0;P<i;P++){let O=L+P,B=L+P+1,j=v*f+P,H=v*f+P+1;a.push(O,B,j),a.push(B,H,j)}}}this.setIndex(a),this.setAttribute("position",new ve(o,3)),this.setAttribute("normal",new ve(l,3)),this.setAttribute("uv",new ve(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.height,e.capSegments,e.radialSegments,e.heightSegments)}},ho=class s extends De{constructor(e=1,t=32,n=0,i=2*Math.PI){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:i},t=Math.max(3,t);let r=[],a=[],o=[],l=[],c=new C,h=new ne;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let u=0,d=3;u<=t;u++,d+=3){let p=n+u/t*i;c.x=e*Math.cos(p),c.y=e*Math.sin(p),a.push(c.x,c.y,c.z),o.push(0,0,1),h.x=(a[d]/e+1)/2,h.y=(a[d+1]/e+1)/2,l.push(h.x,h.y)}for(let u=1;u<=t;u++)r.push(u,u+1,0);this.setIndex(r),this.setAttribute("position",new ve(a,3)),this.setAttribute("normal",new ve(o,3)),this.setAttribute("uv",new ve(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.segments,e.thetaStart,e.thetaLength)}},ks=class s extends De{constructor(e=1,t=1,n=1,i=32,r=1,a=!1,o=0,l=2*Math.PI){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:i,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};let c=this;i=Math.floor(i),r=Math.floor(r);let h=[],u=[],d=[],p=[],m=0,f=[],_=n/2,g=0;function v(b){let y=m,S=new ne,x=new C,A=0,F=b===!0?e:t,L=b===!0?1:-1;for(let O=1;O<=i;O++)u.push(0,_*L,0),d.push(0,L,0),p.push(.5,.5),m++;let P=m;for(let O=0;O<=i;O++){let B=O/i*l+o,j=Math.cos(B),H=Math.sin(B);x.x=F*H,x.y=_*L,x.z=F*j,u.push(x.x,x.y,x.z),d.push(0,L,0),S.x=.5*j+.5,S.y=.5*H*L+.5,p.push(S.x,S.y),m++}for(let O=0;O<i;O++){let B=y+O,j=P+O;b===!0?h.push(j,j+1,B):h.push(j+1,j,B),A+=3}c.addGroup(g,A,b===!0?1:2),g+=A}(function(){let b=new C,y=new C,S=0,x=(t-e)/n;for(let A=0;A<=r;A++){let F=[],L=A/r,P=L*(t-e)+e;for(let O=0;O<=i;O++){let B=O/i,j=B*l+o,H=Math.sin(j),W=Math.cos(j);y.x=P*H,y.y=-L*n+_,y.z=P*W,u.push(y.x,y.y,y.z),b.set(H,x,W).normalize(),d.push(b.x,b.y,b.z),p.push(B,1-L),F.push(m++)}f.push(F)}for(let A=0;A<i;A++)for(let F=0;F<r;F++){let L=f[F][A],P=f[F+1][A],O=f[F+1][A+1],B=f[F][A+1];(e>0||F!==0)&&(h.push(L,P,B),S+=3),(t>0||F!==r-1)&&(h.push(P,O,B),S+=3)}c.addGroup(g,S,0),g+=S})(),a===!1&&(e>0&&v(!0),t>0&&v(!1)),this.setIndex(h),this.setAttribute("position",new ve(u,3)),this.setAttribute("normal",new ve(d,3)),this.setAttribute("uv",new ve(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}},uo=class s extends ks{constructor(e=1,t=1,n=32,i=1,r=!1,a=0,o=2*Math.PI){super(0,e,t,n,i,r,a,o),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(e){return new s(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}},zi=class s extends De{constructor(e=[],t=[],n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:n,detail:i};let r=[],a=[];function o(p,m,f,_){let g=_+1,v=[];for(let b=0;b<=g;b++){v[b]=[];let y=p.clone().lerp(f,b/g),S=m.clone().lerp(f,b/g),x=g-b;for(let A=0;A<=x;A++)v[b][A]=A===0&&b===g?y:y.clone().lerp(S,A/x)}for(let b=0;b<g;b++)for(let y=0;y<2*(g-b)-1;y++){let S=Math.floor(y/2);y%2==0?(l(v[b][S+1]),l(v[b+1][S]),l(v[b][S])):(l(v[b][S+1]),l(v[b+1][S+1]),l(v[b+1][S]))}}function l(p){r.push(p.x,p.y,p.z)}function c(p,m){let f=3*p;m.x=e[f+0],m.y=e[f+1],m.z=e[f+2]}function h(p,m,f,_){_<0&&p.x===1&&(a[m]=p.x-1),f.x===0&&f.z===0&&(a[m]=_/2/Math.PI+.5)}function u(p){return Math.atan2(p.z,-p.x)}function d(p){return Math.atan2(-p.y,Math.sqrt(p.x*p.x+p.z*p.z))}(function(p){let m=new C,f=new C,_=new C;for(let g=0;g<t.length;g+=3)c(t[g+0],m),c(t[g+1],f),c(t[g+2],_),o(m,f,_,p)})(i),(function(p){let m=new C;for(let f=0;f<r.length;f+=3)m.x=r[f+0],m.y=r[f+1],m.z=r[f+2],m.normalize().multiplyScalar(p),r[f+0]=m.x,r[f+1]=m.y,r[f+2]=m.z})(n),(function(){let p=new C;for(let m=0;m<r.length;m+=3){p.x=r[m+0],p.y=r[m+1],p.z=r[m+2];let f=u(p)/2/Math.PI+.5,_=d(p)/Math.PI+.5;a.push(f,1-_)}(function(){let m=new C,f=new C,_=new C,g=new C,v=new ne,b=new ne,y=new ne;for(let S=0,x=0;S<r.length;S+=9,x+=6){m.set(r[S+0],r[S+1],r[S+2]),f.set(r[S+3],r[S+4],r[S+5]),_.set(r[S+6],r[S+7],r[S+8]),v.set(a[x+0],a[x+1]),b.set(a[x+2],a[x+3]),y.set(a[x+4],a[x+5]),g.copy(m).add(f).add(_).divideScalar(3);let A=u(g);h(v,x+0,m,A),h(b,x+2,f,A),h(y,x+4,_,A)}})(),(function(){for(let m=0;m<a.length;m+=6){let f=a[m+0],_=a[m+2],g=a[m+4],v=Math.max(f,_,g),b=Math.min(f,_,g);v>.9&&b<.1&&(f<.2&&(a[m+0]+=1),_<.2&&(a[m+2]+=1),g<.2&&(a[m+4]+=1))}})()})(),this.setAttribute("position",new ve(r,3)),this.setAttribute("normal",new ve(r.slice(),3)),this.setAttribute("uv",new ve(a,2)),i===0?this.computeVertexNormals():this.normalizeNormals()}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.vertices,e.indices,e.radius,e.detail)}},po=class s extends zi{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,i=1/n;super([-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-i,-n,0,-i,n,0,i,-n,0,i,n,-i,-n,0,-i,n,0,i,-n,0,i,n,0,-n,0,-i,n,0,-i,-n,0,i,n,0,i],[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9],e,t),this.type="DodecahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new s(e.radius,e.detail)}},qa=new C,Xa=new C,fc=new C,Ka=new pi,fo=class extends De{constructor(e=null,t=1){if(super(),this.type="EdgesGeometry",this.parameters={geometry:e,thresholdAngle:t},e!==null){let i=Math.pow(10,4),r=Math.cos(Br*t),a=e.getIndex(),o=e.getAttribute("position"),l=a?a.count:o.count,c=[0,0,0],h=["a","b","c"],u=new Array(3),d={},p=[];for(let m=0;m<l;m+=3){a?(c[0]=a.getX(m),c[1]=a.getX(m+1),c[2]=a.getX(m+2)):(c[0]=m,c[1]=m+1,c[2]=m+2);let{a:f,b:_,c:g}=Ka;if(f.fromBufferAttribute(o,c[0]),_.fromBufferAttribute(o,c[1]),g.fromBufferAttribute(o,c[2]),Ka.getNormal(fc),u[0]=`${Math.round(f.x*i)},${Math.round(f.y*i)},${Math.round(f.z*i)}`,u[1]=`${Math.round(_.x*i)},${Math.round(_.y*i)},${Math.round(_.z*i)}`,u[2]=`${Math.round(g.x*i)},${Math.round(g.y*i)},${Math.round(g.z*i)}`,u[0]!==u[1]&&u[1]!==u[2]&&u[2]!==u[0])for(let v=0;v<3;v++){let b=(v+1)%3,y=u[v],S=u[b],x=Ka[h[v]],A=Ka[h[b]],F=`${y}_${S}`,L=`${S}_${y}`;L in d&&d[L]?(fc.dot(d[L].normal)<=r&&(p.push(x.x,x.y,x.z),p.push(A.x,A.y,A.z)),d[L]=null):F in d||(d[F]={index0:c[v],index1:c[b],normal:fc.clone()})}}for(let m in d)if(d[m]){let{index0:f,index1:_}=d[m];qa.fromBufferAttribute(o,f),Xa.fromBufferAttribute(o,_),p.push(qa.x,qa.y,qa.z),p.push(Xa.x,Xa.y,Xa.z)}this.setAttribute("position",new ve(p,3))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}},Zt=class{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){Ae("Curve: .getPoint() not implemented.")}getPointAt(e,t){let n=this.getUtoTmapping(e);return this.getPoint(n,t)}getPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return t}getSpacedPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPointAt(n/e));return t}getLength(){let e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let t=[],n,i=this.getPoint(0),r=0;t.push(0);for(let a=1;a<=e;a++)n=this.getPoint(a/e),r+=n.distanceTo(i),t.push(r),i=n;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t=null){let n=this.getLengths(),i=0,r=n.length,a;a=t||e*n[r-1];let o,l=0,c=r-1;for(;l<=c;)if(i=Math.floor(l+(c-l)/2),o=n[i]-a,o<0)l=i+1;else{if(!(o>0)){c=i;break}c=i-1}if(i=c,n[i]===a)return i/(r-1);let h=n[i];return(i+(a-h)/(n[i+1]-h))/(r-1)}getTangent(e,t){let i=e-1e-4,r=e+1e-4;i<0&&(i=0),r>1&&(r=1);let a=this.getPoint(i),o=this.getPoint(r),l=t||(a.isVector2?new ne:new C);return l.copy(o).sub(a).normalize(),l}getTangentAt(e,t){let n=this.getUtoTmapping(e);return this.getTangent(n,t)}computeFrenetFrames(e,t=!1){let n=new C,i=[],r=[],a=[],o=new C,l=new ge;for(let p=0;p<=e;p++){let m=p/e;i[p]=this.getTangentAt(m,new C)}r[0]=new C,a[0]=new C;let c=Number.MAX_VALUE,h=Math.abs(i[0].x),u=Math.abs(i[0].y),d=Math.abs(i[0].z);h<=c&&(c=h,n.set(1,0,0)),u<=c&&(c=u,n.set(0,1,0)),d<=c&&n.set(0,0,1),o.crossVectors(i[0],n).normalize(),r[0].crossVectors(i[0],o),a[0].crossVectors(i[0],r[0]);for(let p=1;p<=e;p++){if(r[p]=r[p-1].clone(),a[p]=a[p-1].clone(),o.crossVectors(i[p-1],i[p]),o.length()>Number.EPSILON){o.normalize();let m=Math.acos(ke(i[p-1].dot(i[p]),-1,1));r[p].applyMatrix4(l.makeRotationAxis(o,m))}a[p].crossVectors(i[p],r[p])}if(t===!0){let p=Math.acos(ke(r[0].dot(r[e]),-1,1));p/=e,i[0].dot(o.crossVectors(r[0],r[e]))>0&&(p=-p);for(let m=1;m<=e;m++)r[m].applyMatrix4(l.makeRotationAxis(i[m],p*m)),a[m].crossVectors(i[m],r[m])}return{tangents:i,normals:r,binormals:a}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){let e={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}},qr=class extends Zt{constructor(e=0,t=0,n=1,i=1,r=0,a=2*Math.PI,o=!1,l=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=e,this.aY=t,this.xRadius=n,this.yRadius=i,this.aStartAngle=r,this.aEndAngle=a,this.aClockwise=o,this.aRotation=l}getPoint(e,t=new ne){let n=t,i=2*Math.PI,r=this.aEndAngle-this.aStartAngle,a=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=i;for(;r>i;)r-=i;r<Number.EPSILON&&(r=a?0:i),this.aClockwise!==!0||a||(r===i?r=-i:r-=i);let o=this.aStartAngle+e*r,l=this.aX+this.xRadius*Math.cos(o),c=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){let h=Math.cos(this.aRotation),u=Math.sin(this.aRotation),d=l-this.aX,p=c-this.aY;l=d*h-p*u+this.aX,c=d*u+p*h+this.aY}return n.set(l,c)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){let e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}},mo=class extends qr{constructor(e,t,n,i,r,a){super(e,t,n,n,i,r,a),this.isArcCurve=!0,this.type="ArcCurve"}};function Oh(){let s=0,e=0,t=0,n=0;function i(r,a,o,l){s=r,e=o,t=-3*r+3*a-2*o-l,n=2*r-2*a+o+l}return{initCatmullRom:function(r,a,o,l,c){i(a,o,c*(o-r),c*(l-a))},initNonuniformCatmullRom:function(r,a,o,l,c,h,u){let d=(a-r)/c-(o-r)/(c+h)+(o-a)/h,p=(o-a)/h-(l-a)/(h+u)+(l-o)/u;d*=h,p*=h,i(a,o,d,p)},calc:function(r){let a=r*r;return s+e*r+t*a+n*(a*r)}}}var Kd=new C,Yd=new C,mc=new Oh,gc=new Oh,vc=new Oh,go=class extends Zt{constructor(e=[],t=!1,n="centripetal",i=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=e,this.closed=t,this.curveType=n,this.tension=i}getPoint(e,t=new C){let n=t,i=this.points,r=i.length,a=(r-(this.closed?0:1))*e,o,l,c=Math.floor(a),h=a-c;this.closed?c+=c>0?0:(Math.floor(Math.abs(c)/r)+1)*r:h===0&&c===r-1&&(c=r-2,h=1),this.closed||c>0?o=i[(c-1)%r]:(Yd.subVectors(i[0],i[1]).add(i[0]),o=Yd);let u=i[c%r],d=i[(c+1)%r];if(this.closed||c+2<r?l=i[(c+2)%r]:(Kd.subVectors(i[r-1],i[r-2]).add(i[r-1]),l=Kd),this.curveType==="centripetal"||this.curveType==="chordal"){let p=this.curveType==="chordal"?.5:.25,m=Math.pow(o.distanceToSquared(u),p),f=Math.pow(u.distanceToSquared(d),p),_=Math.pow(d.distanceToSquared(l),p);f<1e-4&&(f=1),m<1e-4&&(m=f),_<1e-4&&(_=f),mc.initNonuniformCatmullRom(o.x,u.x,d.x,l.x,m,f,_),gc.initNonuniformCatmullRom(o.y,u.y,d.y,l.y,m,f,_),vc.initNonuniformCatmullRom(o.z,u.z,d.z,l.z,m,f,_)}else this.curveType==="catmullrom"&&(mc.initCatmullRom(o.x,u.x,d.x,l.x,this.tension),gc.initCatmullRom(o.y,u.y,d.y,l.y,this.tension),vc.initCatmullRom(o.z,u.z,d.z,l.z,this.tension));return n.set(mc.calc(h),gc.calc(h),vc.calc(h)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(i.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let i=this.points[t];e.points.push(i.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(new C().fromArray(i))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}};function Jd(s,e,t,n,i){let r=.5*(n-e),a=.5*(i-t),o=s*s;return(2*t-2*n+r+a)*(s*o)+(-3*t+3*n-2*r-a)*o+r*s+t}function Ss(s,e,t,n){return(function(i,r){let a=1-i;return a*a*r})(s,e)+(function(i,r){return 2*(1-i)*i*r})(s,t)+(function(i,r){return i*i*r})(s,n)}function Ts(s,e,t,n,i){return(function(r,a){let o=1-r;return o*o*o*a})(s,e)+(function(r,a){let o=1-r;return 3*o*o*r*a})(s,t)+(function(r,a){return 3*(1-r)*r*r*a})(s,n)+(function(r,a){return r*r*r*a})(s,i)}var zs=class extends Zt{constructor(e=new ne,t=new ne,n=new ne,i=new ne){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=e,this.v1=t,this.v2=n,this.v3=i}getPoint(e,t=new ne){let n=t,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(Ts(e,i.x,r.x,a.x,o.x),Ts(e,i.y,r.y,a.y,o.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},vo=class extends Zt{constructor(e=new C,t=new C,n=new C,i=new C){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=e,this.v1=t,this.v2=n,this.v3=i}getPoint(e,t=new C){let n=t,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(Ts(e,i.x,r.x,a.x,o.x),Ts(e,i.y,r.y,a.y,o.y),Ts(e,i.z,r.z,a.z,o.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},Gs=class extends Zt{constructor(e=new ne,t=new ne){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=e,this.v2=t}getPoint(e,t=new ne){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new ne){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},bo=class extends Zt{constructor(e=new C,t=new C){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=e,this.v2=t}getPoint(e,t=new C){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new C){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Vs=class extends Zt{constructor(e=new ne,t=new ne,n=new ne){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new ne){let n=t,i=this.v0,r=this.v1,a=this.v2;return n.set(Ss(e,i.x,r.x,a.x),Ss(e,i.y,r.y,a.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Hs=class extends Zt{constructor(e=new C,t=new C,n=new C){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new C){let n=t,i=this.v0,r=this.v1,a=this.v2;return n.set(Ss(e,i.x,r.x,a.x),Ss(e,i.y,r.y,a.y),Ss(e,i.z,r.z,a.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},js=class extends Zt{constructor(e=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=e}getPoint(e,t=new ne){let n=t,i=this.points,r=(i.length-1)*e,a=Math.floor(r),o=r-a,l=i[a===0?a:a-1],c=i[a],h=i[a>i.length-2?i.length-1:a+1],u=i[a>i.length-3?i.length-1:a+2];return n.set(Jd(o,l.x,c.x,h.x,u.x),Jd(o,l.y,c.y,h.y,u.y)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(i.clone())}return this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let i=this.points[t];e.points.push(i.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(new ne().fromArray(i))}return this}},_o=Object.freeze({__proto__:null,ArcCurve:mo,CatmullRomCurve3:go,CubicBezierCurve:zs,CubicBezierCurve3:vo,EllipseCurve:qr,LineCurve:Gs,LineCurve3:bo,QuadraticBezierCurve:Vs,QuadraticBezierCurve3:Hs,SplineCurve:js}),yo=class extends Zt{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){let e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);if(!e.equals(t)){let n=e.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new _o[n](t,e))}return this}getPoint(e,t){let n=e*this.getLength(),i=this.getCurveLengths(),r=0;for(;r<i.length;){if(i[r]>=n){let a=i[r]-n,o=this.curves[r],l=o.getLength(),c=l===0?0:1-a/l;return o.getPointAt(c,t)}r++}return null}getLength(){let e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let e=[],t=0;for(let n=0,i=this.curves.length;n<i;n++)t+=this.curves[n].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){let t=[],n;for(let i=0,r=this.curves;i<r.length;i++){let a=r[i],o=a.isEllipseCurve?2*e:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?e*a.points.length:e,l=a.getPoints(o);for(let c=0;c<l.length;c++){let h=l[c];n&&n.equals(h)||(t.push(h),n=h)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let i=e.curves[t];this.curves.push(i.clone())}return this.autoClose=e.autoClose,this}toJSON(){let e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,n=this.curves.length;t<n;t++){let i=this.curves[t];e.curves.push(i.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let i=e.curves[t];this.curves.push(new _o[i.type]().fromJSON(i))}return this}},Ws=class extends yo{constructor(e){super(),this.type="Path",this.currentPoint=new ne,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,n=e.length;t<n;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){let n=new Gs(this.currentPoint.clone(),new ne(e,t));return this.curves.push(n),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,n,i){let r=new Vs(this.currentPoint.clone(),new ne(e,t),new ne(n,i));return this.curves.push(r),this.currentPoint.set(n,i),this}bezierCurveTo(e,t,n,i,r,a){let o=new zs(this.currentPoint.clone(),new ne(e,t),new ne(n,i),new ne(r,a));return this.curves.push(o),this.currentPoint.set(r,a),this}splineThru(e){let t=[this.currentPoint.clone()].concat(e),n=new js(t);return this.curves.push(n),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,n,i,r,a){let o=this.currentPoint.x,l=this.currentPoint.y;return this.absarc(e+o,t+l,n,i,r,a),this}absarc(e,t,n,i,r,a){return this.absellipse(e,t,n,n,i,r,a),this}ellipse(e,t,n,i,r,a,o,l){let c=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(e+c,t+h,n,i,r,a,o,l),this}absellipse(e,t,n,i,r,a,o,l){let c=new qr(e,t,n,i,r,a,o,l);if(this.curves.length>0){let u=c.getPoint(0);u.equals(this.currentPoint)||this.lineTo(u.x,u.y)}this.curves.push(c);let h=c.getPoint(1);return this.currentPoint.copy(h),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){let e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}},qs=class extends Ws{constructor(e){super(e),this.uuid=_n(),this.type="Shape",this.holes=[]}getPointsHoles(e){let t=[];for(let n=0,i=this.holes.length;n<i;n++)t[n]=this.holes[n].getPoints(e);return t}extractPoints(e){return{shape:this.getPoints(e),holes:this.getPointsHoles(e)}}copy(e){super.copy(e),this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let i=e.holes[t];this.holes.push(i.clone())}return this}toJSON(){let e=super.toJSON();e.uuid=this.uuid,e.holes=[];for(let t=0,n=this.holes.length;t<n;t++){let i=this.holes[t];e.holes.push(i.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.uuid=e.uuid,this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let i=e.holes[t];this.holes.push(new Ws().fromJSON(i))}return this}};function jm(s,e,t=2){let n=e&&e.length,i=n?e[0]*t:s.length,r=Zd(s,0,i,t,!0),a=[];if(!r||r.next===r.prev)return a;let o,l,c;if(n&&(r=(function(h,u,d,p){let m=[];for(let f=0,_=u.length;f<_;f++){let g=Zd(h,u[f]*p,f<_-1?u[f+1]*p:h.length,p,!1);g===g.next&&(g.steiner=!0),m.push(Qm(g))}m.sort(Ym);for(let f=0;f<m.length;f++)d=Jm(m[f],d);return d})(s,e,r,t)),s.length>80*t){o=s[0],l=s[1];let h=o,u=l;for(let d=t;d<i;d+=t){let p=s[d],m=s[d+1];p<o&&(o=p),m<l&&(l=m),p>h&&(h=p),m>u&&(u=m)}c=Math.max(h-o,u-l),c=c!==0?32767/c:0}return Xs(r,a,t,o,l,c,0),a}function Zd(s,e,t,n,i){let r;if(i===(function(a,o,l,c){let h=0;for(let u=o,d=l-c;u<l;u+=c)h+=(a[d]-a[u])*(a[u+1]+a[d+1]),d=u;return h})(s,e,t,n)>0)for(let a=e;a<t;a+=n)r=Qd(a/n|0,s[a],s[a+1],r);else for(let a=t-n;a>=e;a-=n)r=Qd(a/n|0,s[a],s[a+1],r);return r&&Xr(r,r.next)&&(Ys(r),r=r.next),r}function dr(s,e){if(!s)return s;e||(e=s);let t,n=s;do if(t=!1,n.steiner||!Xr(n,n.next)&&ft(n.prev,n,n.next)!==0)n=n.next;else{if(Ys(n),n=e=n.prev,n===n.next)break;t=!0}while(t||n!==e);return e}function Xs(s,e,t,n,i,r,a){if(!s)return;!a&&r&&(function(l,c,h,u){let d=l;do d.z===0&&(d.z=Ac(d.x,d.y,c,h,u)),d.prevZ=d.prev,d.nextZ=d.next,d=d.next;while(d!==l);d.prevZ.nextZ=null,d.prevZ=null,(function(p){let m,f=1;do{let _,g=p;p=null;let v=null;for(m=0;g;){m++;let b=g,y=0;for(let x=0;x<f&&(y++,b=b.nextZ,b);x++);let S=f;for(;y>0||S>0&&b;)y!==0&&(S===0||!b||g.z<=b.z)?(_=g,g=g.nextZ,y--):(_=b,b=b.nextZ,S--),v?v.nextZ=_:p=_,_.prevZ=v,v=_;g=b}v.nextZ=null,f*=2}while(m>1)})(d)})(s,n,i,r);let o=s;for(;s.prev!==s.next;){let l=s.prev,c=s.next;if(r?qm(s,n,i,r):Wm(s))e.push(l.i,s.i,c.i),Ys(s),s=c.next,o=c.next;else if((s=c)===o){a?a===1?Xs(s=Xm(dr(s),e),e,t,n,i,r,2):a===2&&Km(s,e,t,n,i,r):Xs(dr(s),e,t,n,i,r,1);break}}}function Wm(s){let e=s.prev,t=s,n=s.next;if(ft(e,t,n)>=0)return!1;let i=e.x,r=t.x,a=n.x,o=e.y,l=t.y,c=n.y,h=Math.min(i,r,a),u=Math.min(o,l,c),d=Math.max(i,r,a),p=Math.max(o,l,c),m=n.next;for(;m!==e;){if(m.x>=h&&m.x<=d&&m.y>=u&&m.y<=p&&xs(i,o,r,l,a,c,m.x,m.y)&&ft(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function qm(s,e,t,n){let i=s.prev,r=s,a=s.next;if(ft(i,r,a)>=0)return!1;let o=i.x,l=r.x,c=a.x,h=i.y,u=r.y,d=a.y,p=Math.min(o,l,c),m=Math.min(h,u,d),f=Math.max(o,l,c),_=Math.max(h,u,d),g=Ac(p,m,e,t,n),v=Ac(f,_,e,t,n),b=s.prevZ,y=s.nextZ;for(;b&&b.z>=g&&y&&y.z<=v;){if(b.x>=p&&b.x<=f&&b.y>=m&&b.y<=_&&b!==i&&b!==a&&xs(o,h,l,u,c,d,b.x,b.y)&&ft(b.prev,b,b.next)>=0||(b=b.prevZ,y.x>=p&&y.x<=f&&y.y>=m&&y.y<=_&&y!==i&&y!==a&&xs(o,h,l,u,c,d,y.x,y.y)&&ft(y.prev,y,y.next)>=0))return!1;y=y.nextZ}for(;b&&b.z>=g;){if(b.x>=p&&b.x<=f&&b.y>=m&&b.y<=_&&b!==i&&b!==a&&xs(o,h,l,u,c,d,b.x,b.y)&&ft(b.prev,b,b.next)>=0)return!1;b=b.prevZ}for(;y&&y.z<=v;){if(y.x>=p&&y.x<=f&&y.y>=m&&y.y<=_&&y!==i&&y!==a&&xs(o,h,l,u,c,d,y.x,y.y)&&ft(y.prev,y,y.next)>=0)return!1;y=y.nextZ}return!0}function Xm(s,e){let t=s;do{let n=t.prev,i=t.next.next;!Xr(n,i)&&$p(n,t,t.next,i)&&Ks(n,i)&&Ks(i,n)&&(e.push(n.i,t.i,i.i),Ys(t),Ys(t.next),t=s=i),t=t.next}while(t!==s);return dr(t)}function Km(s,e,t,n,i,r){let a=s;do{let o=a.next.next;for(;o!==a.prev;){if(a.i!==o.i&&$m(a,o)){let l=ef(a,o);return a=dr(a,a.next),l=dr(l,l.next),Xs(a,e,t,n,i,r,0),void Xs(l,e,t,n,i,r,0)}o=o.next}a=a.next}while(a!==s)}function Ym(s,e){let t=s.x-e.x;return t===0&&(t=s.y-e.y,t===0)&&(t=(s.next.y-s.y)/(s.next.x-s.x)-(e.next.y-e.y)/(e.next.x-e.x)),t}function Jm(s,e){let t=(function(i,r){let a=r,o=i.x,l=i.y,c,h=-1/0;if(Xr(i,a))return a;do{if(Xr(i,a.next))return a.next;if(l<=a.y&&l>=a.next.y&&a.next.y!==a.y){let f=a.x+(l-a.y)*(a.next.x-a.x)/(a.next.y-a.y);if(f<=o&&f>h&&(h=f,c=a.x<a.next.x?a:a.next,f===o))return c}a=a.next}while(a!==r);if(!c)return null;let u=c,d=c.x,p=c.y,m=1/0;a=c;do{if(o>=a.x&&a.x>=d&&o!==a.x&&Qp(l<p?o:h,l,d,p,l<p?h:o,l,a.x,a.y)){let f=Math.abs(l-a.y)/(o-a.x);Ks(a,i)&&(f<m||f===m&&(a.x>c.x||a.x===c.x&&Zm(c,a)))&&(c=a,m=f)}a=a.next}while(a!==u);return c})(s,e);if(!t)return e;let n=ef(t,s);return dr(n,n.next),dr(t,t.next)}function Zm(s,e){return ft(s.prev,s,e.prev)<0&&ft(e.next,s,s.next)<0}function Ac(s,e,t,n,i){return(s=1431655765&((s=858993459&((s=252645135&((s=16711935&((s=(s-t)*i|0)|s<<8))|s<<4))|s<<2))|s<<1))|(e=1431655765&((e=858993459&((e=252645135&((e=16711935&((e=(e-n)*i|0)|e<<8))|e<<4))|e<<2))|e<<1))<<1}function Qm(s){let e=s,t=s;do(e.x<t.x||e.x===t.x&&e.y<t.y)&&(t=e),e=e.next;while(e!==s);return t}function Qp(s,e,t,n,i,r,a,o){return(i-a)*(e-o)>=(s-a)*(r-o)&&(s-a)*(n-o)>=(t-a)*(e-o)&&(t-a)*(r-o)>=(i-a)*(n-o)}function xs(s,e,t,n,i,r,a,o){return!(s===a&&e===o)&&Qp(s,e,t,n,i,r,a,o)}function $m(s,e){return s.next.i!==e.i&&s.prev.i!==e.i&&!(function(t,n){let i=t;do{if(i.i!==t.i&&i.next.i!==t.i&&i.i!==n.i&&i.next.i!==n.i&&$p(i,i.next,t,n))return!0;i=i.next}while(i!==t);return!1})(s,e)&&(Ks(s,e)&&Ks(e,s)&&(function(t,n){let i=t,r=!1,a=(t.x+n.x)/2,o=(t.y+n.y)/2;do i.y>o!=i.next.y>o&&i.next.y!==i.y&&a<(i.next.x-i.x)*(o-i.y)/(i.next.y-i.y)+i.x&&(r=!r),i=i.next;while(i!==t);return r})(s,e)&&(ft(s.prev,s,e.prev)||ft(s,e.prev,e))||Xr(s,e)&&ft(s.prev,s,s.next)>0&&ft(e.prev,e,e.next)>0)}function ft(s,e,t){return(e.y-s.y)*(t.x-e.x)-(e.x-s.x)*(t.y-e.y)}function Xr(s,e){return s.x===e.x&&s.y===e.y}function $p(s,e,t,n){let i=Ja(ft(s,e,t)),r=Ja(ft(s,e,n)),a=Ja(ft(t,n,s)),o=Ja(ft(t,n,e));return i!==r&&a!==o||!(i!==0||!Ya(s,t,e))||!(r!==0||!Ya(s,n,e))||!(a!==0||!Ya(t,s,n))||!(o!==0||!Ya(t,e,n))}function Ya(s,e,t){return e.x<=Math.max(s.x,t.x)&&e.x>=Math.min(s.x,t.x)&&e.y<=Math.max(s.y,t.y)&&e.y>=Math.min(s.y,t.y)}function Ja(s){return s>0?1:s<0?-1:0}function Ks(s,e){return ft(s.prev,s,s.next)<0?ft(s,e,s.next)>=0&&ft(s,s.prev,e)>=0:ft(s,e,s.prev)<0||ft(s,s.next,e)<0}function ef(s,e){let t=Ec(s.i,s.x,s.y),n=Ec(e.i,e.x,e.y),i=s.next,r=e.prev;return s.next=e,e.prev=s,t.next=i,i.prev=t,n.next=t,t.prev=n,r.next=n,n.prev=r,n}function Qd(s,e,t,n){let i=Ec(s,e,t);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function Ys(s){s.next.prev=s.prev,s.prev.next=s.next,s.prevZ&&(s.prevZ.nextZ=s.nextZ),s.nextZ&&(s.nextZ.prevZ=s.prevZ)}function Ec(s,e,t){return{i:s,x:e,y:t,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}var Rc=class{static triangulate(e,t,n=2){return jm(e,t,n)}},bn=class s{static area(e){let t=e.length,n=0;for(let i=t-1,r=0;r<t;i=r++)n+=e[i].x*e[r].y-e[r].x*e[i].y;return .5*n}static isClockWise(e){return s.area(e)<0}static triangulateShape(e,t){let n=[],i=[],r=[];$d(e),ep(n,e);let a=e.length;t.forEach($d);for(let l=0;l<t.length;l++)i.push(a),a+=t[l].length,ep(n,t[l]);let o=Rc.triangulate(n,i);for(let l=0;l<o.length;l+=3)r.push(o.slice(l,l+3));return r}};function $d(s){let e=s.length;e>2&&s[e-1].equals(s[0])&&s.pop()}function ep(s,e){for(let t=0;t<e.length;t++)s.push(e[t].x),s.push(e[t].y)}var xo=class s extends De{constructor(e=new qs([new ne(.5,.5),new ne(-.5,.5),new ne(-.5,-.5),new ne(.5,-.5)]),t={}){super(),this.type="ExtrudeGeometry",this.parameters={shapes:e,options:t},e=Array.isArray(e)?e:[e];let n=this,i=[],r=[];for(let o=0,l=e.length;o<l;o++)a(e[o]);function a(o){let l=[],c=t.curveSegments!==void 0?t.curveSegments:12,h=t.steps!==void 0?t.steps:1,u=t.depth!==void 0?t.depth:1,d=t.bevelEnabled===void 0||t.bevelEnabled,p=t.bevelThickness!==void 0?t.bevelThickness:.2,m=t.bevelSize!==void 0?t.bevelSize:p-.1,f=t.bevelOffset!==void 0?t.bevelOffset:0,_=t.bevelSegments!==void 0?t.bevelSegments:3,g=t.extrudePath,v=t.UVGenerator!==void 0?t.UVGenerator:eg,b,y,S,x,A,F=!1;if(g){b=g.getSpacedPoints(h),F=!0,d=!1;let w=!!g.isCatmullRomCurve3&&g.closed;y=g.computeFrenetFrames(h,w),S=new C,x=new C,A=new C}d||(_=0,p=0,m=0,f=0);let L=o.extractPoints(c),P=L.shape,O=L.holes;if(!bn.isClockWise(P)){P=P.reverse();for(let w=0,N=O.length;w<N;w++){let M=O[w];bn.isClockWise(M)&&(O[w]=M.reverse())}}function B(w){let N=10000000000000001e-36,M=w[0];for(let D=1;D<=w.length;D++){let U=D%w.length,R=w[U],z=R.x-M.x,J=R.y-M.y,Z=z*z+J*J,ae=Math.max(Math.abs(R.x),Math.abs(R.y),Math.abs(M.x),Math.abs(M.y));Z<=N*ae*ae?(w.splice(U,1),D--):M=R}}B(P),O.forEach(B);let j=O.length,H=P;for(let w=0;w<j;w++){let N=O[w];P=P.concat(N)}function W(w,N,M){return N||Ie("ExtrudeGeometry: vec does not exist"),w.clone().addScaledVector(N,M)}let Y=P.length;function K(w,N,M){let D,U,R,z=w.x-N.x,J=w.y-N.y,Z=M.x-w.x,ae=M.y-w.y,be=z*z+J*J,ce=z*ae-J*Z;if(Math.abs(ce)>Number.EPSILON){let se=Math.sqrt(be),Te=Math.sqrt(Z*Z+ae*ae),ie=N.x-J/se,he=N.y+z/se,le=((M.x-ae/Te-ie)*ae-(M.y+Z/Te-he)*Z)/(z*ae-J*Z);D=ie+z*le-w.x,U=he+J*le-w.y;let ye=D*D+U*U;if(ye<=2)return new ne(D,U);R=Math.sqrt(ye/2)}else{let se=!1;z>Number.EPSILON?Z>Number.EPSILON&&(se=!0):z<-Number.EPSILON?Z<-Number.EPSILON&&(se=!0):Math.sign(J)===Math.sign(ae)&&(se=!0),se?(D=-J,U=z,R=Math.sqrt(be)):(D=z,U=J,R=Math.sqrt(be/2))}return new ne(D/R,U/R)}let ee=[];for(let w=0,N=H.length,M=N-1,D=w+1;w<N;w++,M++,D++)M===N&&(M=0),D===N&&(D=0),ee[w]=K(H[w],H[M],H[D]);let ue=[],Se,me,xe=ee.concat();for(let w=0,N=j;w<N;w++){let M=O[w];Se=[];for(let D=0,U=M.length,R=U-1,z=D+1;D<U;D++,R++,z++)R===U&&(R=0),z===U&&(z=0),Se[D]=K(M[D],M[R],M[z]);ue.push(Se),xe=xe.concat(Se)}if(_===0)me=bn.triangulateShape(H,O);else{let w=[],N=[];for(let M=0;M<_;M++){let D=M/_,U=p*Math.cos(D*Math.PI/2),R=m*Math.sin(D*Math.PI/2)+f;for(let z=0,J=H.length;z<J;z++){let Z=W(H[z],ee[z],R);V(Z.x,Z.y,-U),D===0&&w.push(Z)}for(let z=0,J=j;z<J;z++){let Z=O[z];Se=ue[z];let ae=[];for(let be=0,ce=Z.length;be<ce;be++){let se=W(Z[be],Se[be],R);V(se.x,se.y,-U),D===0&&ae.push(se)}D===0&&N.push(ae)}}me=bn.triangulateShape(w,N)}let te=me.length,pe=m+f;for(let w=0;w<Y;w++){let N=d?W(P[w],xe[w],pe):P[w];F?(x.copy(y.normals[0]).multiplyScalar(N.x),S.copy(y.binormals[0]).multiplyScalar(N.y),A.copy(b[0]).add(x).add(S),V(A.x,A.y,A.z)):V(N.x,N.y,0)}for(let w=1;w<=h;w++)for(let N=0;N<Y;N++){let M=d?W(P[N],xe[N],pe):P[N];F?(x.copy(y.normals[w]).multiplyScalar(M.x),S.copy(y.binormals[w]).multiplyScalar(M.y),A.copy(b[w]).add(x).add(S),V(A.x,A.y,A.z)):V(M.x,M.y,u/h*w)}for(let w=_-1;w>=0;w--){let N=w/_,M=p*Math.cos(N*Math.PI/2),D=m*Math.sin(N*Math.PI/2)+f;for(let U=0,R=H.length;U<R;U++){let z=W(H[U],ee[U],D);V(z.x,z.y,u+M)}for(let U=0,R=O.length;U<R;U++){let z=O[U];Se=ue[U];for(let J=0,Z=z.length;J<Z;J++){let ae=W(z[J],Se[J],D);F?V(ae.x,ae.y+b[h-1].y,b[h-1].x+M):V(ae.x,ae.y,u+M)}}}function oe(w,N){let M=w.length;for(;--M>=0;){let D=M,U=M-1;U<0&&(U=w.length-1);for(let R=0,z=h+2*_;R<z;R++){let J=Y*R,Z=Y*(R+1);k(N+D+J,N+U+J,N+U+Z,N+D+Z)}}}function V(w,N,M){l.push(w),l.push(N),l.push(M)}function G(w,N,M){E(w),E(N),E(M);let D=i.length/3,U=v.generateTopUV(n,i,D-3,D-2,D-1);T(U[0]),T(U[1]),T(U[2])}function k(w,N,M,D){E(w),E(N),E(D),E(N),E(M),E(D);let U=i.length/3,R=v.generateSideWallUV(n,i,U-6,U-3,U-2,U-1);T(R[0]),T(R[1]),T(R[3]),T(R[1]),T(R[2]),T(R[3])}function E(w){i.push(l[3*w+0]),i.push(l[3*w+1]),i.push(l[3*w+2])}function T(w){r.push(w.x),r.push(w.y)}(function(){let w=i.length/3;if(d){let N=0,M=Y*N;for(let D=0;D<te;D++){let U=me[D];G(U[2]+M,U[1]+M,U[0]+M)}N=h+2*_,M=Y*N;for(let D=0;D<te;D++){let U=me[D];G(U[0]+M,U[1]+M,U[2]+M)}}else{for(let N=0;N<te;N++){let M=me[N];G(M[2],M[1],M[0])}for(let N=0;N<te;N++){let M=me[N];G(M[0]+Y*h,M[1]+Y*h,M[2]+Y*h)}}n.addGroup(w,i.length/3-w,0)})(),(function(){let w=i.length/3,N=0;oe(H,N),N+=H.length;for(let M=0,D=O.length;M<D;M++){let U=O[M];oe(U,N),N+=U.length}n.addGroup(w,i.length/3-w,1)})()}this.setAttribute("position",new ve(i,3)),this.setAttribute("uv",new ve(r,2)),this.computeVertexNormals()}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){let e=super.toJSON();return(function(t,n,i){if(i.shapes=[],Array.isArray(t))for(let r=0,a=t.length;r<a;r++){let o=t[r];i.shapes.push(o.uuid)}else i.shapes.push(t.uuid);return i.options=Object.assign({},n),n.extrudePath!==void 0&&(i.options.extrudePath=n.extrudePath.toJSON()),i})(this.parameters.shapes,this.parameters.options,e)}static fromJSON(e,t){let n=[];for(let r=0,a=e.shapes.length;r<a;r++){let o=t[e.shapes[r]];n.push(o)}let i=e.options.extrudePath;return i!==void 0&&(e.options.extrudePath=new _o[i.type]().fromJSON(i)),new s(n,e.options)}},eg={generateTopUV:function(s,e,t,n,i){let r=e[3*t],a=e[3*t+1],o=e[3*n],l=e[3*n+1],c=e[3*i],h=e[3*i+1];return[new ne(r,a),new ne(o,l),new ne(c,h)]},generateSideWallUV:function(s,e,t,n,i,r){let a=e[3*t],o=e[3*t+1],l=e[3*t+2],c=e[3*n],h=e[3*n+1],u=e[3*n+2],d=e[3*i],p=e[3*i+1],m=e[3*i+2],f=e[3*r],_=e[3*r+1],g=e[3*r+2];return Math.abs(o-h)<Math.abs(a-c)?[new ne(a,1-l),new ne(c,1-u),new ne(d,1-m),new ne(f,1-g)]:[new ne(o,1-l),new ne(h,1-u),new ne(p,1-m),new ne(_,1-g)]}},Mo=class s extends zi{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2;super([-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1],e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new s(e.radius,e.detail)}},So=class s extends De{constructor(e=[new ne(0,-.5),new ne(.5,0),new ne(0,.5)],t=12,n=0,i=2*Math.PI){super(),this.type="LatheGeometry",this.parameters={points:e,segments:t,phiStart:n,phiLength:i},t=Math.floor(t),i=ke(i,0,2*Math.PI);let r=[],a=[],o=[],l=[],c=[],h=1/t,u=new C,d=new ne,p=new C,m=new C,f=new C,_=0,g=0;for(let v=0;v<=e.length-1;v++)switch(v){case 0:_=e[v+1].x-e[v].x,g=e[v+1].y-e[v].y,p.x=1*g,p.y=-_,p.z=0*g,f.copy(p),p.normalize(),l.push(p.x,p.y,p.z);break;case e.length-1:l.push(f.x,f.y,f.z);break;default:_=e[v+1].x-e[v].x,g=e[v+1].y-e[v].y,p.x=1*g,p.y=-_,p.z=0*g,m.copy(p),p.x+=f.x,p.y+=f.y,p.z+=f.z,p.normalize(),l.push(p.x,p.y,p.z),f.copy(m)}for(let v=0;v<=t;v++){let b=n+v*h*i,y=Math.sin(b),S=Math.cos(b);for(let x=0;x<=e.length-1;x++){u.x=e[x].x*y,u.y=e[x].y,u.z=e[x].x*S,a.push(u.x,u.y,u.z),d.x=v/t,d.y=x/(e.length-1),o.push(d.x,d.y);let A=l[3*x+0]*y,F=l[3*x+1],L=l[3*x+0]*S;c.push(A,F,L)}}for(let v=0;v<t;v++)for(let b=0;b<e.length-1;b++){let y=b+v*e.length,S=y,x=y+e.length,A=y+e.length+1,F=y+1;r.push(S,x,F),r.push(A,F,x)}this.setIndex(r),this.setAttribute("position",new ve(a,3)),this.setAttribute("uv",new ve(o,2)),this.setAttribute("normal",new ve(c,3))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.points,e.segments,e.phiStart,e.phiLength)}},To=class s extends zi{constructor(e=1,t=0){super([1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2],e,t),this.type="OctahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new s(e.radius,e.detail)}},Kr=class s extends De{constructor(e=1,t=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};let r=e/2,a=t/2,o=Math.floor(n),l=Math.floor(i),c=o+1,h=l+1,u=e/o,d=t/l,p=[],m=[],f=[],_=[];for(let g=0;g<h;g++){let v=g*d-a;for(let b=0;b<c;b++){let y=b*u-r;m.push(y,-v,0),f.push(0,0,1),_.push(b/o),_.push(1-g/l)}}for(let g=0;g<l;g++)for(let v=0;v<o;v++){let b=v+c*g,y=v+c*(g+1),S=v+1+c*(g+1),x=v+1+c*g;p.push(b,y,x),p.push(y,S,x)}this.setIndex(p),this.setAttribute("position",new ve(m,3)),this.setAttribute("normal",new ve(f,3)),this.setAttribute("uv",new ve(_,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.width,e.height,e.widthSegments,e.heightSegments)}},wo=class s extends De{constructor(e=.5,t=1,n=32,i=1,r=0,a=2*Math.PI){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:a},n=Math.max(3,n);let o=[],l=[],c=[],h=[],u=e,d=(t-e)/(i=Math.max(1,i)),p=new C,m=new ne;for(let f=0;f<=i;f++){for(let _=0;_<=n;_++){let g=r+_/n*a;p.x=u*Math.cos(g),p.y=u*Math.sin(g),l.push(p.x,p.y,p.z),c.push(0,0,1),m.x=(p.x/t+1)/2,m.y=(p.y/t+1)/2,h.push(m.x,m.y)}u+=d}for(let f=0;f<i;f++){let _=f*(n+1);for(let g=0;g<n;g++){let v=g+_,b=v,y=v+n+1,S=v+n+2,x=v+1;o.push(b,y,x),o.push(y,S,x)}}this.setIndex(o),this.setAttribute("position",new ve(l,3)),this.setAttribute("normal",new ve(c,3)),this.setAttribute("uv",new ve(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.innerRadius,e.outerRadius,e.thetaSegments,e.phiSegments,e.thetaStart,e.thetaLength)}},Ao=class s extends De{constructor(e=new qs([new ne(0,.5),new ne(-.5,-.5),new ne(.5,-.5)]),t=12){super(),this.type="ShapeGeometry",this.parameters={shapes:e,curveSegments:t};let n=[],i=[],r=[],a=[],o=0,l=0;if(Array.isArray(e)===!1)c(e);else for(let h=0;h<e.length;h++)c(e[h]),this.addGroup(o,l,h),o+=l,l=0;function c(h){let u=i.length/3,d=h.extractPoints(t),p=d.shape,m=d.holes;bn.isClockWise(p)===!1&&(p=p.reverse());for(let _=0,g=m.length;_<g;_++){let v=m[_];bn.isClockWise(v)===!0&&(m[_]=v.reverse())}let f=bn.triangulateShape(p,m);for(let _=0,g=m.length;_<g;_++){let v=m[_];p=p.concat(v)}for(let _=0,g=p.length;_<g;_++){let v=p[_];i.push(v.x,v.y,0),r.push(0,0,1),a.push(v.x,v.y)}for(let _=0,g=f.length;_<g;_++){let v=f[_],b=v[0]+u,y=v[1]+u,S=v[2]+u;n.push(b,y,S),l+=3}}this.setIndex(n),this.setAttribute("position",new ve(i,3)),this.setAttribute("normal",new ve(r,3)),this.setAttribute("uv",new ve(a,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){let e=super.toJSON();return(function(t,n){if(n.shapes=[],Array.isArray(t))for(let i=0,r=t.length;i<r;i++){let a=t[i];n.shapes.push(a.uuid)}else n.shapes.push(t.uuid);return n})(this.parameters.shapes,e)}static fromJSON(e,t){let n=[];for(let i=0,r=e.shapes.length;i<r;i++){let a=t[e.shapes[i]];n.push(a)}return new s(n,e.curveSegments)}},Eo=class s extends De{constructor(e=1,t=32,n=16,i=0,r=2*Math.PI,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:i,phiLength:r,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let l=Math.min(a+o,Math.PI),c=0,h=[],u=new C,d=new C,p=[],m=[],f=[],_=[];for(let g=0;g<=n;g++){let v=[],b=g/n,y=a+b*o,S=e*Math.cos(y),x=Math.sqrt(e*e-S*S),A=0;g===0&&a===0?A=.5/t:g===n&&l===Math.PI&&(A=-.5/t);for(let F=0;F<=t;F++){let L=F/t,P=i+L*r;u.x=-x*Math.cos(P),u.y=S,u.z=x*Math.sin(P),m.push(u.x,u.y,u.z),d.copy(u).normalize(),f.push(d.x,d.y,d.z),_.push(L+A,1-b),v.push(c++)}h.push(v)}for(let g=0;g<n;g++)for(let v=0;v<t;v++){let b=h[g][v+1],y=h[g][v],S=h[g+1][v],x=h[g+1][v+1];(g!==0||a>0)&&p.push(b,y,x),(g!==n-1||l<Math.PI)&&p.push(y,S,x)}this.setIndex(p),this.setAttribute("position",new ve(m,3)),this.setAttribute("normal",new ve(f,3)),this.setAttribute("uv",new ve(_,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}},Ro=class s extends zi{constructor(e=1,t=0){super([1,1,1,-1,-1,1,-1,1,-1,1,-1,-1],[2,1,0,0,3,2,1,3,0,2,3,1],e,t),this.type="TetrahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new s(e.radius,e.detail)}},Co=class s extends De{constructor(e=1,t=.4,n=12,i=48,r=2*Math.PI,a=0,o=2*Math.PI){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:i,arc:r,thetaStart:a,thetaLength:o},n=Math.floor(n),i=Math.floor(i);let l=[],c=[],h=[],u=[],d=new C,p=new C,m=new C;for(let f=0;f<=n;f++){let _=a+f/n*o;for(let g=0;g<=i;g++){let v=g/i*r;p.x=(e+t*Math.cos(_))*Math.cos(v),p.y=(e+t*Math.cos(_))*Math.sin(v),p.z=t*Math.sin(_),c.push(p.x,p.y,p.z),d.x=e*Math.cos(v),d.y=e*Math.sin(v),m.subVectors(p,d).normalize(),h.push(m.x,m.y,m.z),u.push(g/i),u.push(f/n)}}for(let f=1;f<=n;f++)for(let _=1;_<=i;_++){let g=(i+1)*f+_-1,v=(i+1)*(f-1)+_-1,b=(i+1)*(f-1)+_,y=(i+1)*f+_;l.push(g,v,y),l.push(v,b,y)}this.setIndex(l),this.setAttribute("position",new ve(c,3)),this.setAttribute("normal",new ve(h,3)),this.setAttribute("uv",new ve(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.tube,e.radialSegments,e.tubularSegments,e.arc)}},Po=class s extends De{constructor(e=1,t=.4,n=64,i=8,r=2,a=3){super(),this.type="TorusKnotGeometry",this.parameters={radius:e,tube:t,tubularSegments:n,radialSegments:i,p:r,q:a},n=Math.floor(n),i=Math.floor(i);let o=[],l=[],c=[],h=[],u=new C,d=new C,p=new C,m=new C,f=new C,_=new C,g=new C;for(let b=0;b<=n;++b){let y=b/n*r*Math.PI*2;v(y,r,a,e,p),v(y+.01,r,a,e,m),_.subVectors(m,p),g.addVectors(m,p),f.crossVectors(_,g),g.crossVectors(f,_),f.normalize(),g.normalize();for(let S=0;S<=i;++S){let x=S/i*Math.PI*2,A=-t*Math.cos(x),F=t*Math.sin(x);u.x=p.x+(A*g.x+F*f.x),u.y=p.y+(A*g.y+F*f.y),u.z=p.z+(A*g.z+F*f.z),l.push(u.x,u.y,u.z),d.subVectors(u,p).normalize(),c.push(d.x,d.y,d.z),h.push(b/n),h.push(S/i)}}for(let b=1;b<=n;b++)for(let y=1;y<=i;y++){let S=(i+1)*(b-1)+(y-1),x=(i+1)*b+(y-1),A=(i+1)*b+y,F=(i+1)*(b-1)+y;o.push(S,x,F),o.push(x,A,F)}function v(b,y,S,x,A){let F=Math.cos(b),L=Math.sin(b),P=S/y*b,O=Math.cos(P);A.x=x*(2+O)*.5*F,A.y=x*(2+O)*L*.5,A.z=x*Math.sin(P)*.5}this.setIndex(o),this.setAttribute("position",new ve(l,3)),this.setAttribute("normal",new ve(c,3)),this.setAttribute("uv",new ve(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.tube,e.tubularSegments,e.radialSegments,e.p,e.q)}},Io=class s extends De{constructor(e=new Hs(new C(-1,-1,0),new C(-1,1,0),new C(1,1,0)),t=64,n=1,i=8,r=!1){super(),this.type="TubeGeometry",this.parameters={path:e,tubularSegments:t,radius:n,radialSegments:i,closed:r};let a=e.computeFrenetFrames(t,r);this.tangents=a.tangents,this.normals=a.normals,this.binormals=a.binormals;let o=new C,l=new C,c=new ne,h=new C,u=[],d=[],p=[],m=[];function f(_){h=e.getPointAt(_/t,h);let g=a.normals[_],v=a.binormals[_];for(let b=0;b<=i;b++){let y=b/i*Math.PI*2,S=Math.sin(y),x=-Math.cos(y);l.x=x*g.x+S*v.x,l.y=x*g.y+S*v.y,l.z=x*g.z+S*v.z,l.normalize(),d.push(l.x,l.y,l.z),o.x=h.x+n*l.x,o.y=h.y+n*l.y,o.z=h.z+n*l.z,u.push(o.x,o.y,o.z)}}(function(){for(let _=0;_<t;_++)f(_);f(r===!1?t:0),(function(){for(let _=0;_<=t;_++)for(let g=0;g<=i;g++)c.x=_/t,c.y=g/i,p.push(c.x,c.y)})(),(function(){for(let _=1;_<=t;_++)for(let g=1;g<=i;g++){let v=(i+1)*(_-1)+(g-1),b=(i+1)*_+(g-1),y=(i+1)*_+g,S=(i+1)*(_-1)+g;m.push(v,b,S),m.push(b,y,S)}})()})(),this.setIndex(m),this.setAttribute("position",new ve(u,3)),this.setAttribute("normal",new ve(d,3)),this.setAttribute("uv",new ve(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}toJSON(){let e=super.toJSON();return e.path=this.parameters.path.toJSON(),e}static fromJSON(e){return new s(new _o[e.path.type]().fromJSON(e.path),e.tubularSegments,e.radius,e.radialSegments,e.closed)}},Lo=class extends De{constructor(e=null){if(super(),this.type="WireframeGeometry",this.parameters={geometry:e},e!==null){let t=[],n=new Set,i=new C,r=new C;if(e.index!==null){let a=e.attributes.position,o=e.index,l=e.groups;l.length===0&&(l=[{start:0,count:o.count,materialIndex:0}]);for(let c=0,h=l.length;c<h;++c){let u=l[c],d=u.start;for(let p=d,m=d+u.count;p<m;p+=3)for(let f=0;f<3;f++){let _=o.getX(p+f),g=o.getX(p+(f+1)%3);i.fromBufferAttribute(a,_),r.fromBufferAttribute(a,g),tp(i,r,n)===!0&&(t.push(i.x,i.y,i.z),t.push(r.x,r.y,r.z))}}}else{let a=e.attributes.position;for(let o=0,l=a.count/3;o<l;o++)for(let c=0;c<3;c++){let h=3*o+c,u=3*o+(c+1)%3;i.fromBufferAttribute(a,h),r.fromBufferAttribute(a,u),tp(i,r,n)===!0&&(t.push(i.x,i.y,i.z),t.push(r.x,r.y,r.z))}}this.setAttribute("position",new ve(t,3))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}};function tp(s,e,t){let n=`${s.x},${s.y},${s.z}-${e.x},${e.y},${e.z}`,i=`${e.x},${e.y},${e.z}-${s.x},${s.y},${s.z}`;return t.has(n)!==!0&&t.has(i)!==!0&&(t.add(n),t.add(i),!0)}var Ub=Object.freeze({__proto__:null,BoxGeometry:ur,CapsuleGeometry:co,CircleGeometry:ho,ConeGeometry:uo,CylinderGeometry:ks,DodecahedronGeometry:po,EdgesGeometry:fo,ExtrudeGeometry:xo,IcosahedronGeometry:Mo,LatheGeometry:So,OctahedronGeometry:To,PlaneGeometry:Kr,PolyhedronGeometry:zi,RingGeometry:wo,ShapeGeometry:Ao,SphereGeometry:Eo,TetrahedronGeometry:Ro,TorusGeometry:Co,TorusKnotGeometry:Po,TubeGeometry:Io,WireframeGeometry:Lo});function _r(s){let e={};for(let t in s){e[t]={};for(let n in s[t]){let i=s[t][n];if(np(i))i.isRenderTargetTexture?(Ae("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=i.clone();else if(Array.isArray(i))if(np(i[0])){let r=[];for(let a=0,o=i.length;a<o;a++)r[a]=i[a].clone();e[t][n]=r}else e[t][n]=i.slice();else e[t][n]=i}}return e}function Xt(s){let e={};for(let t=0;t<s.length;t++){let n=_r(s[t]);for(let i in n)e[i]=n[i]}return e}function np(s){return s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)}function Bh(s){let e=s.getRenderTarget();return e===null?s.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:Ce.workingColorSpace}var tf={clone:_r,merge:Xt},cn=class extends Pt{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,this.fragmentShader=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=_r(e.uniforms),this.uniformsGroups=(function(t){let n=[];for(let i=0;i<t.length;i++)n.push(t[i].clone());return n})(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let i in this.uniforms){let r=this.uniforms[i].value;r&&r.isTexture?t.uniforms[i]={type:"t",value:r.toJSON(e).uuid}:r&&r.isColor?t.uniforms[i]={type:"c",value:r.getHex()}:r&&r.isVector2?t.uniforms[i]={type:"v2",value:r.toArray()}:r&&r.isVector3?t.uniforms[i]={type:"v3",value:r.toArray()}:r&&r.isVector4?t.uniforms[i]={type:"v4",value:r.toArray()}:r&&r.isMatrix3?t.uniforms[i]={type:"m3",value:r.toArray()}:r&&r.isMatrix4?t.uniforms[i]={type:"m4",value:r.toArray()}:t.uniforms[i]={value:r}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let n in e.uniforms){let i=e.uniforms[n];switch(this.uniforms[n]={},i.type){case"t":this.uniforms[n].value=t[i.value]||null;break;case"c":this.uniforms[n].value=new de().setHex(i.value);break;case"v2":this.uniforms[n].value=new ne().fromArray(i.value);break;case"v3":this.uniforms[n].value=new C().fromArray(i.value);break;case"v4":this.uniforms[n].value=new We().fromArray(i.value);break;case"m3":this.uniforms[n].value=new Fe().fromArray(i.value);break;case"m4":this.uniforms[n].value=new ge().fromArray(i.value);break;default:this.uniforms[n].value=i.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(let n in e.extensions)this.extensions[n]=e.extensions[n];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}},Do=class extends cn{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}},xn=class extends Pt{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new de(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new de(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new ne(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ct,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},$t=class extends xn{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new ne(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return ke(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+.4*t)/(1-.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new de(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new de(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new de(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}},Gt=class extends Pt{constructor(e){super(),this.isMeshPhongMaterial=!0,this.type="MeshPhongMaterial",this.color=new de(16777215),this.specular=new de(1118481),this.shininess=30,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new de(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new ne(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ct,this.combine=0,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.specular.copy(e.specular),this.shininess=e.shininess,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.envMapIntensity=e.envMapIntensity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}};var Js=class extends Pt{constructor(e){super(),this.isMeshLambertMaterial=!0,this.type="MeshLambertMaterial",this.color=new de(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new de(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new ne(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ct,this.combine=0,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.envMapIntensity=e.envMapIntensity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},Fo=class extends Pt{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=3200,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},No=class extends Pt{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function Za(s,e){return s&&s.constructor!==e?typeof e.BYTES_PER_ELEMENT=="number"?new e(s):Array.prototype.slice.call(s):s}function tg(s){let e=s.length,t=new Array(e);for(let n=0;n!==e;++n)t[n]=n;return t.sort(function(n,i){return s[n]-s[i]}),t}function ip(s,e,t){let n=s.length,i=new s.constructor(n);for(let r=0,a=0;a!==n;++r){let o=t[r]*e;for(let l=0;l!==e;++l)i[a++]=s[o+l]}return i}function ng(s,e,t,n){let i=1,r=s[0];for(;r!==void 0&&r[n]===void 0;)r=s[i++];if(r===void 0)return;let a=r[n];if(a!==void 0)if(Array.isArray(a))do a=r[n],a!==void 0&&(e.push(r.time),t.push(...a)),r=s[i++];while(r!==void 0);else if(a.toArray!==void 0)do a=r[n],a!==void 0&&(e.push(r.time),a.toArray(t,t.length)),r=s[i++];while(r!==void 0);else do a=r[n],a!==void 0&&(e.push(r.time),t.push(a)),r=s[i++];while(r!==void 0)}var Jn=class{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,i=t[n],r=t[n-1];e:{t:{let a;n:{i:if(!(e<i)){for(let o=n+2;;){if(i===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=i,i=t[++n],e<i)break t}a=t.length;break n}if(!(e>=r)){let o=t[1];e<o&&(n=2,r=o);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(i=r,r=t[--n-1],e>=r)break t}a=n,n=0;break n}break e}for(;n<a;){let o=n+a>>>1;e<t[o]?a=o:n=o+1}if(i=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i;for(let a=0;a!==i;++a)t[a]=n[r+a];return t}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},Uo=class extends Jn{constructor(e,t,n,i){super(e,t,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:nr,endingEnd:nr}}intervalChanged_(e,t,n){let i=this.parameterPositions,r=e-2,a=e+1,o=i[r],l=i[a];if(o===void 0)switch(this.getSettings_().endingStart){case ir:r=e,o=2*t-n;break;case ws:r=i.length-2,o=t+i[r]-i[r+1];break;default:r=e,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case ir:a=e,l=2*n-t;break;case ws:a=1,l=n+i[1]-i[0];break;default:a=e-1,l=t}let c=.5*(n-t),h=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=a*h}interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,p=this._weightNext,m=(n-t)/(i-t),f=m*m,_=f*m,g=-d*_+2*d*f-d*m,v=(1+d)*_+(-1.5-2*d)*f+(-.5+d)*m+1,b=(-1-p)*_+(1.5+p)*f+.5*m,y=p*_-p*f;for(let S=0;S!==o;++S)r[S]=g*a[h+S]+v*a[c+S]+b*a[l+S]+y*a[u+S];return r}},Zs=class extends Jn{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=(n-t)/(i-t),u=1-h;for(let d=0;d!==o;++d)r[d]=a[c+d]*u+a[l+d]*h;return r}},Oo=class extends Jn{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}},Bo=class extends Jn{interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=e*o,c=l-o,h=this.inTangents,u=this.outTangents;if(!h||!u){let m=(n-t)/(i-t),f=1-m;for(let _=0;_!==o;++_)r[_]=a[c+_]*f+a[l+_]*m;return r}let d=2*o,p=e-1;for(let m=0;m!==o;++m){let f=a[c+m],_=a[l+m],g=p*d+2*m,v=u[g],b=u[g+1],y=e*d+2*m,S=h[y],x=h[y+1],A,F,L,P,O,B=(n-t)/(i-t);for(let j=0;j<8;j++){A=B*B,F=A*B,L=1-B,P=L*L,O=P*L;let H=O*t+3*P*B*v+3*L*A*S+F*i-n;if(Math.abs(H)<1e-10)break;let W=3*P*(v-t)+6*L*B*(S-v)+3*A*(i-S);if(Math.abs(W)<1e-10)break;B-=H/W,B=Math.max(0,Math.min(1,B))}r[m]=O*f+3*P*B*b+3*L*A*x+F*_}return r}},Qt=class{constructor(e,t,n,i){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Za(t,this.TimeBufferType),this.values=Za(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Za(e.times,Array),values:Za(e.values,Array)};let i=e.getInterpolation();i!==e.DefaultInterpolation&&(n.interpolation=i)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Oo(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new Zs(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new Uo(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new Bo(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents),t}setInterpolation(e){let t;switch(e){case sr:t=this.InterpolantFactoryMethodDiscrete;break;case ar:t=this.InterpolantFactoryMethodLinear;break;case eo:t=this.InterpolantFactoryMethodSmooth;break;case Mc:t=this.InterpolantFactoryMethodBezier}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0){if(e===this.DefaultInterpolation)throw new Error(n);this.setInterpolation(this.DefaultInterpolation)}return Ae("KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return sr;case this.InterpolantFactoryMethodLinear:return ar;case this.InterpolantFactoryMethodSmooth:return eo;case this.InterpolantFactoryMethodBezier:return Mc}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e}return this}trim(e,t){let n=this.times,i=n.length,r=0,a=i-1;for(;r!==i&&n[r]<e;)++r;for(;a!==-1&&n[a]>t;)--a;if(++a,r!==0||a!==i){r>=a&&(a=Math.max(a,1),r=a-1);let o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(Ie("KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,i=this.values,r=n.length;r===0&&(Ie("KeyframeTrack: Track is empty.",this),e=!1);let a=null;for(let o=0;o!==r;o++){let l=n[o];if(typeof l=="number"&&isNaN(l)){Ie("KeyframeTrack: Time is not a valid number.",this,o,l),e=!1;break}if(a!==null&&a>l){Ie("KeyframeTrack: Out of order keys.",this,o,l,a),e=!1;break}a=l}if(i!==void 0&&Mm(i))for(let o=0,l=i.length;o!==l;++o){let c=i[o];if(isNaN(c)){Ie("KeyframeTrack: Value is not a valid number.",this,o,c),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===eo,r=e.length-1,a=1;for(let o=1;o<r;++o){let l=!1,c=e[o];if(c!==e[o+1]&&(o!==1||c!==e[0]))if(i)l=!0;else{let h=o*n,u=h-n,d=h+n;for(let p=0;p!==n;++p){let m=t[h+p];if(m!==t[u+p]||m!==t[d+p]){l=!0;break}}}if(l){if(o!==a){e[a]=e[o];let h=o*n,u=a*n;for(let d=0;d!==n;++d)t[u+d]=t[h+d]}++a}}if(r>0){e[a]=e[r];for(let o=r*n,l=a*n,c=0;c!==n;++c)t[l+c]=t[o+c];++a}return a!==e.length?(this.times=e.slice(0,a),this.values=t.slice(0,a*n)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=new this.constructor(this.name,e,t);return n.createInterpolant=this.createInterpolant,n}};Qt.prototype.ValueTypeName="",Qt.prototype.TimeBufferType=Float32Array,Qt.prototype.ValueBufferType=Float32Array,Qt.prototype.DefaultInterpolation=ar;var fi=class extends Qt{constructor(e,t,n){super(e,t,n)}};fi.prototype.ValueTypeName="bool",fi.prototype.ValueBufferType=Array,fi.prototype.DefaultInterpolation=sr,fi.prototype.InterpolantFactoryMethodLinear=void 0,fi.prototype.InterpolantFactoryMethodSmooth=void 0;var Qs=class extends Qt{constructor(e,t,n,i){super(e,t,n,i)}};Qs.prototype.ValueTypeName="color";var On=class extends Qt{constructor(e,t,n,i){super(e,t,n,i)}};On.prototype.ValueTypeName="number";var ko=class extends Jn{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(n-t)/(i-t),c=e*o;for(let h=c+o;c!==h;c+=4)$e.slerpFlat(r,0,a,c-o,a,c,l);return r}},Mn=class extends Qt{constructor(e,t,n,i){super(e,t,n,i)}InterpolantFactoryMethodLinear(e){return new ko(this.times,this.values,this.getValueSize(),e)}};Mn.prototype.ValueTypeName="quaternion",Mn.prototype.InterpolantFactoryMethodSmooth=void 0;var mi=class extends Qt{constructor(e,t,n){super(e,t,n)}};mi.prototype.ValueTypeName="string",mi.prototype.ValueBufferType=Array,mi.prototype.DefaultInterpolation=sr,mi.prototype.InterpolantFactoryMethodLinear=void 0,mi.prototype.InterpolantFactoryMethodSmooth=void 0;var Bn=class extends Qt{constructor(e,t,n,i){super(e,t,n,i)}};Bn.prototype.ValueTypeName="vector";var Zn=class{constructor(e="",t=-1,n=[],i=2500){this.name=e,this.tracks=n,this.duration=t,this.blendMode=i,this.uuid=_n(),this.userData={},this.duration<0&&this.resetDuration()}static parse(e){let t=[],n=e.tracks,i=1/(e.fps||1);for(let a=0,o=n.length;a!==o;++a)t.push(ig(n[a]).scale(i));let r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r.userData=JSON.parse(e.userData||"{}"),r}static toJSON(e){let t=[],n=e.tracks,i={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode,userData:JSON.stringify(e.userData)};for(let r=0,a=n.length;r!==a;++r)t.push(Qt.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(e,t,n,i){let r=t.length,a=[];for(let o=0;o<r;o++){let l=[],c=[];l.push((o+r-1)%r,o,(o+1)%r),c.push(0,1,0);let h=tg(l);l=ip(l,1,h),c=ip(c,1,h),i||l[0]!==0||(l.push(r),c.push(c[0])),a.push(new On(".morphTargetInfluences["+t[o].name+"]",l,c).scale(1/n))}return new this(e,-1,a)}static findByName(e,t){let n=e;if(!Array.isArray(e)){let i=e;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===t)return n[i];return null}static CreateClipsFromMorphTargetSequences(e,t,n){let i={},r=/^([\w-]*?)([\d]+)$/;for(let o=0,l=e.length;o<l;o++){let c=e[o],h=c.name.match(r);if(h&&h.length>1){let u=h[1],d=i[u];d||(i[u]=d=[]),d.push(c)}}let a=[];for(let o in i)a.push(this.CreateFromMorphTargetSequence(o,i[o],t,n));return a}resetDuration(){let e=0;for(let t=0,n=this.tracks.length;t!==n;++t){let i=this.tracks[t];e=Math.max(e,i.times[i.times.length-1])}return this.duration=e,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){let e=[];for(let n=0;n<this.tracks.length;n++)e.push(this.tracks[n].clone());let t=new this.constructor(this.name,this.duration,e,this.blendMode);return t.userData=JSON.parse(JSON.stringify(this.userData)),t}toJSON(){return this.constructor.toJSON(this)}};function ig(s){if(s.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");let e=(function(t){switch(t.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return On;case"vector":case"vector2":case"vector3":case"vector4":return Bn;case"color":return Qs;case"quaternion":return Mn;case"bool":case"boolean":return fi;case"string":return mi}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+t)})(s.type);if(s.times===void 0){let t=[],n=[];ng(s.keys,t,n,"value"),s.times=t,s.values=n}return e.parse!==void 0?e.parse(s):new e(s.name,s.times,s.values,s.interpolation)}var Yn={enabled:!1,files:{},add:function(s,e){this.enabled!==!1&&(rp(s)||(this.files[s]=e))},get:function(s){if(this.enabled!==!1&&!rp(s))return this.files[s]},remove:function(s){delete this.files[s]},clear:function(){this.files={}}};function rp(s){try{let e=s.slice(s.indexOf(":")+1);return new URL(e).protocol==="blob:"}catch{return!1}}var zo=class{constructor(e,t,n){let i=this,r,a=!1,o=0,l=0,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(h){l++,a===!1&&i.onStart!==void 0&&i.onStart(h,o,l),a=!0},this.itemEnd=function(h){o++,i.onProgress!==void 0&&i.onProgress(h,o,l),o===l&&(a=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),r?r(h):h},this.setURLModifier=function(h){return r=h,this},this.addHandler=function(h,u){return c.push(h,u),this},this.removeHandler=function(h){let u=c.indexOf(h);return u!==-1&&c.splice(u,2),this},this.getHandler=function(h){for(let u=0,d=c.length;u<d;u+=2){let p=c[u],m=c[u+1];if(p.global&&(p.lastIndex=0),p.test(h))return m}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},ll=new zo,ot=class{constructor(e){this.manager=e!==void 0?e:ll,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(e,t){let n=this;return new Promise(function(i,r){n.load(e,i,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}};ot.DEFAULT_MATERIAL_NAME="__DEFAULT";var di={},Cc=class extends Error{constructor(e,t){super(e),this.response=t}},_t=class extends ot{constructor(e){super(e),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=Yn.get(`file:${e}`);if(r!==void 0)return this.manager.itemStart(e),void setTimeout(()=>{t&&t(r),this.manager.itemEnd(e)},0);if(di[e]!==void 0)return void di[e].push({onLoad:t,onProgress:n,onError:i});di[e]=[],di[e].push({onLoad:t,onProgress:n,onError:i});let a=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,l=this.responseType;fetch(a).then(c=>{if(c.status===200||c.status===0){if(c.status===0&&Ae("FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;let h=di[e],u=c.body.getReader(),d=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),p=d?parseInt(d):0,m=p!==0,f=0,_=new ReadableStream({start(g){(function v(){u.read().then(({done:b,value:y})=>{if(b)g.close();else{f+=y.byteLength;let S=new ProgressEvent("progress",{lengthComputable:m,loaded:f,total:p});for(let x=0,A=h.length;x<A;x++){let F=h[x];F.onProgress&&F.onProgress(S)}g.enqueue(y),v()}},b=>{g.error(b)})})()}});return new Response(_)}throw new Cc(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then(c=>{switch(l){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then(h=>new DOMParser().parseFromString(h,o));case"json":return c.json();default:if(o==="")return c.text();{let h=/charset="?([^;"\s]*)"?/i.exec(o),u=h&&h[1]?h[1].toLowerCase():void 0,d=new TextDecoder(u);return c.arrayBuffer().then(p=>d.decode(p))}}}).then(c=>{Yn.add(`file:${e}`,c);let h=di[e];delete di[e];for(let u=0,d=h.length;u<d;u++){let p=h[u];p.onLoad&&p.onLoad(c)}}).catch(c=>{let h=di[e];if(h===void 0)throw this.manager.itemError(e),c;delete di[e];for(let u=0,d=h.length;u<d;u++){let p=h[u];p.onError&&p.onError(c)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}};var Ur=new WeakMap,Go=class extends ot{constructor(e){super(e)}load(e,t,n,i){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,a=Yn.get(`image:${e}`);if(a!==void 0){if(a.complete===!0)r.manager.itemStart(e),setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0);else{let u=Ur.get(a);u===void 0&&(u=[],Ur.set(a,u)),u.push({onLoad:t,onError:i})}return a}let o=Gr("img");function l(){h(),t&&t(this);let u=Ur.get(this)||[];for(let d=0;d<u.length;d++){let p=u[d];p.onLoad&&p.onLoad(this)}Ur.delete(this),r.manager.itemEnd(e)}function c(u){h(),i&&i(u),Yn.remove(`image:${e}`);let d=Ur.get(this)||[];for(let p=0;p<d.length;p++){let m=d[p];m.onError&&m.onError(u)}Ur.delete(this),r.manager.itemError(e),r.manager.itemEnd(e)}function h(){o.removeEventListener("load",l,!1),o.removeEventListener("error",c,!1)}return o.addEventListener("load",l,!1),o.addEventListener("error",c,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),Yn.add(`image:${e}`,o),r.manager.itemStart(e),o.src=e,o}};var kn=class extends ot{constructor(e){super(e)}load(e,t,n,i){let r=new At,a=new Go(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(e,function(o){r.image=o,r.needsUpdate=!0,t!==void 0&&t(r)},n,i),r}},Gi=class extends st{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new de(e),this.intensity=t}dispose(){this.dispatchEvent({type:"dispose"})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}},$s=class extends Gi{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(st.DEFAULT_UP),this.updateMatrix(),this.groundColor=new de(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}},bc=new ge,sp=new C,ap=new C,ea=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new ne(512,512),this.mapType=un,this.map=null,this.mapPass=null,this.matrix=new ge,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Mi,this._frameExtents=new ne(1,1),this._viewportCount=1,this._viewports=[new We(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;sp.setFromMatrixPosition(e.matrixWorld),t.position.copy(sp),ap.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(ap),t.updateMatrixWorld(),bc.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(bc,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===zr||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(bc)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),this.mapSize.x===512&&this.mapSize.y===512||(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},Qa=new C,$a=new $e,Kn=new C,Yr=class extends st{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new ge,this.projectionMatrix=new ge,this.projectionMatrixInverse=new ge,this.coordinateSystem=bi,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Qa,$a,Kn),Kn.x===1&&Kn.y===1&&Kn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Qa,$a,Kn.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Qa,$a,Kn),Kn.x===1&&Kn.y===1&&Kn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Qa,$a,Kn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Ui=new C,op=new ne,lp=new ne,vt=class extends Yr{constructor(e=50,t=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=2*or*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(.5*Br*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return 2*or*Math.atan(Math.tan(.5*Br*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Ui.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Ui.x,Ui.y).multiplyScalar(-e/Ui.z),Ui.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Ui.x,Ui.y).multiplyScalar(-e/Ui.z)}getViewSize(e,t){return this.getViewBounds(e,op,lp),t.subVectors(lp,op)}setViewOffset(e,t,n,i,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(.5*Br*this.fov)/this.zoom,n=2*t,i=this.aspect*n,r=-.5*i,a=this.view;if(this.view!==null&&this.view.enabled){let l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*i/l,t-=a.offsetY*n/c,i*=a.width/l,n*=a.height/c}let o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Pc=class extends ea{constructor(){super(new vt(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){let t=this.camera,n=2*or*e.angle*this.focus,i=this.mapSize.width/this.mapSize.height*this.aspect,r=e.distance||t.far;n===t.fov&&i===t.aspect&&r===t.far||(t.fov=n,t.aspect=i,t.far=r,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this}},pr=class extends Gi{constructor(e,t,n=0,i=Math.PI/3,r=0,a=2){super(e,t),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(st.DEFAULT_UP),this.updateMatrix(),this.target=new st,this.distance=n,this.angle=i,this.penumbra=r,this.decay=a,this.map=null,this.shadow=new Pc}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture&&(t.object.map=this.map.toJSON(e).uuid),t.object.shadow=this.shadow.toJSON(),t}},Ic=class extends ea{constructor(){super(new vt(90,1,.5,500)),this.isPointLightShadow=!0}},Vi=class extends Gi{constructor(e,t,n=0,i=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new Ic}get power(){return 4*this.intensity*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}},Hi=class extends Yr{constructor(e=-1,t=1,n=1,i=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-e,a=n+e,o=i+t,l=i-t;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},Lc=class extends ea{constructor(){super(new Hi(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Qn=class extends Gi{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(st.DEFAULT_UP),this.updateMatrix(),this.target=new st,this.shadow=new Lc}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}},ta=class extends Gi{constructor(e,t){super(e,t),this.isAmbientLight=!0,this.type="AmbientLight"}};var Vt=class{static extractUrlBase(e){let t=e.lastIndexOf("/");return t===-1?"./":e.slice(0,t+1)}static resolveURL(e,t){return typeof e!="string"||e===""?"":(/^https?:\/\//i.test(t)&&/^\//.test(e)&&(t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(e)||/^data:.*,.*$/i.test(e)||/^blob:.*$/i.test(e)?e:t+e)}};var _c=new WeakMap,na=class extends ot{constructor(e){super(e),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&Ae("ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&Ae("ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"},this._abortController=new AbortController}setOptions(e){return this.options=e,this}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,a=Yn.get(`image-bitmap:${e}`);if(a!==void 0)return r.manager.itemStart(e),a.then?void a.then(c=>{_c.has(a)===!0?(i&&i(_c.get(a)),r.manager.itemError(e),r.manager.itemEnd(e)):(t&&t(c),r.manager.itemEnd(e))}):void setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0);let o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader,o.signal=typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;let l=fetch(e,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign(r.options,{colorSpaceConversion:"none"}))}).then(function(c){Yn.add(`image-bitmap:${e}`,c),t&&t(c),r.manager.itemEnd(e)}).catch(function(c){i&&i(c),_c.set(l,c),Yn.remove(`image-bitmap:${e}`),r.manager.itemError(e),r.manager.itemEnd(e)});Yn.add(`image-bitmap:${e}`,l),r.manager.itemStart(e)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}};var Ob=new ge,Bb=new ge,kb=new ge;var Or=-90,Vo=class extends st{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new vt(Or,1,e,t);i.layers=this.layers,this.add(i);let r=new vt(Or,1,e,t);r.layers=this.layers,this.add(r);let a=new vt(Or,1,e,t);a.layers=this.layers,this.add(a);let o=new vt(Or,1,e,t);o.layers=this.layers,this.add(o);let l=new vt(Or,1,e,t);l.layers=this.layers,this.add(l);let c=new vt(Or,1,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,i,r,a,o,l]=t;for(let c of t)this.remove(c);if(e===bi)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else{if(e!==zr)throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1)}for(let c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[r,a,o,l,c,h]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),m=e.xr.enabled;e.xr.enabled=!1;let f=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let _=!1;_=e.isWebGLRenderer===!0?e.state.buffers.depth.getReversed():e.reversedDepthBuffer,e.setRenderTarget(n,0,i),_&&e.autoClear===!1&&e.clearDepth(),e.render(t,r),e.setRenderTarget(n,1,i),_&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,i),_&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,i),_&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(n,4,i),_&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=f,e.setRenderTarget(n,5,i),_&&e.autoClear===!1&&e.clearDepth(),e.render(t,h),e.setRenderTarget(u,d,p),e.xr.enabled=m,n.texture.needsPMREMUpdate=!0}},Ho=class extends vt{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}};var zb=new C,Gb=new $e,Vb=new C,Hb=new C,jb=new C;var Wb=new C,qb=new $e,Xb=new C,Kb=new C;var jo=class{constructor(e,t,n){let i,r,a;switch(this.binding=e,this.valueSize=n,t){case"quaternion":i=this._slerp,r=this._slerpAdditive,a=this._setAdditiveIdentityQuaternion,this.buffer=new Float64Array(6*n),this._workIndex=5;break;case"string":case"bool":i=this._select,r=this._select,a=this._setAdditiveIdentityOther,this.buffer=new Array(5*n);break;default:i=this._lerp,r=this._lerpAdditive,a=this._setAdditiveIdentityNumeric,this.buffer=new Float64Array(5*n)}this._mixBufferRegion=i,this._mixBufferRegionAdditive=r,this._setIdentity=a,this._origIndex=3,this._addIndex=4,this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,this.useCount=0,this.referenceCount=0}accumulate(e,t){let n=this.buffer,i=this.valueSize,r=e*i+i,a=this.cumulativeWeight;if(a===0){for(let o=0;o!==i;++o)n[r+o]=n[o];a=t}else{a+=t;let o=t/a;this._mixBufferRegion(n,r,0,o,i)}this.cumulativeWeight=a}accumulateAdditive(e){let t=this.buffer,n=this.valueSize,i=n*this._addIndex;this.cumulativeWeightAdditive===0&&this._setIdentity(),this._mixBufferRegionAdditive(t,i,0,e,n),this.cumulativeWeightAdditive+=e}apply(e){let t=this.valueSize,n=this.buffer,i=e*t+t,r=this.cumulativeWeight,a=this.cumulativeWeightAdditive,o=this.binding;if(this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,r<1){let l=t*this._origIndex;this._mixBufferRegion(n,i,l,1-r,t)}a>0&&this._mixBufferRegionAdditive(n,i,this._addIndex*t,1,t);for(let l=t,c=t+t;l!==c;++l)if(n[l]!==n[l+t]){o.setValue(n,i);break}}saveOriginalState(){let e=this.binding,t=this.buffer,n=this.valueSize,i=n*this._origIndex;e.getValue(t,i);for(let r=n,a=i;r!==a;++r)t[r]=t[i+r%n];this._setIdentity(),this.cumulativeWeight=0,this.cumulativeWeightAdditive=0}restoreOriginalState(){let e=3*this.valueSize;this.binding.setValue(this.buffer,e)}_setAdditiveIdentityNumeric(){let e=this._addIndex*this.valueSize,t=e+this.valueSize;for(let n=e;n<t;n++)this.buffer[n]=0}_setAdditiveIdentityQuaternion(){this._setAdditiveIdentityNumeric(),this.buffer[this._addIndex*this.valueSize+3]=1}_setAdditiveIdentityOther(){let e=this._origIndex*this.valueSize,t=this._addIndex*this.valueSize;for(let n=0;n<this.valueSize;n++)this.buffer[t+n]=this.buffer[e+n]}_select(e,t,n,i,r){if(i>=.5)for(let a=0;a!==r;++a)e[t+a]=e[n+a]}_slerp(e,t,n,i){$e.slerpFlat(e,t,e,t,e,n,i)}_slerpAdditive(e,t,n,i,r){let a=this._workIndex*r;$e.multiplyQuaternionsFlat(e,a,e,t,e,n),$e.slerpFlat(e,t,e,t,e,a,i)}_lerp(e,t,n,i,r){let a=1-i;for(let o=0;o!==r;++o){let l=t+o;e[l]=e[l]*a+e[n+o]*i}}_lerpAdditive(e,t,n,i,r){for(let a=0;a!==r;++a){let o=t+a;e[o]=e[o]+e[n+a]*i}}},kh="\\[\\]\\.:\\/",rg=new RegExp("["+kh+"]","g"),yc="[^"+kh+"]",sg="[^"+kh.replace("\\.","")+"]",ag=new RegExp("^"+/((?:WC+[\/:])*)/.source.replace("WC",yc)+/(WCOD+)?/.source.replace("WCOD",sg)+/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",yc)+/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",yc)+"$"),og=["material","materials","bones","map"],Ze=class s{constructor(e,t,n){this.path=t,this.parsedPath=n||s.parseTrackName(t),this.node=s.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new s.Composite(e,t,n):new s(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(rg,"")}static parseTrackName(e){let t=ag.exec(e);if(t===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);og.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let a=0;a<r.length;a++){let o=r[a];if(o.name===t||o.uuid===t)return o;let l=n(o.children);if(l)return l}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,i=t.propertyName,r=t.propertyIndex;if(e||(e=s.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e)return void Ae("PropertyBinding: No target node found for track: "+this.path+".");if(n){let c=t.objectIndex;switch(n){case"materials":if(!e.material)return void Ie("PropertyBinding: Can not bind to material as node does not have a material.",this);if(!e.material.materials)return void Ie("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);e=e.material.materials;break;case"bones":if(!e.skeleton)return void Ie("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===c){c=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material)return void Ie("PropertyBinding: Can not bind to material as node does not have a material.",this);if(!e.material.map)return void Ie("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);e=e.material.map;break;default:if(e[n]===void 0)return void Ie("PropertyBinding: Can not bind to objectName of node undefined.",this);e=e[n]}if(c!==void 0){if(e[c]===void 0)return void Ie("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);e=e[c]}}let a=e[i];if(a===void 0)return void Ie("PropertyBinding: Trying to update property for track: "+t.nodeName+"."+i+" but it wasn't found.",e);let o=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?o=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry)return void Ie("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);if(!e.geometry.morphAttributes)return void Ie("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};Ze.Composite=class{constructor(s,e,t){let n=t||Ze.parseTrackName(e);this._targetGroup=s,this._bindings=s.subscribe_(e,n)}getValue(s,e){this.bind();let t=this._targetGroup.nCachedObjects_,n=this._bindings[t];n!==void 0&&n.getValue(s,e)}setValue(s,e){let t=this._bindings;for(let n=this._targetGroup.nCachedObjects_,i=t.length;n!==i;++n)t[n].setValue(s,e)}bind(){let s=this._bindings;for(let e=this._targetGroup.nCachedObjects_,t=s.length;e!==t;++e)s[e].bind()}unbind(){let s=this._bindings;for(let e=this._targetGroup.nCachedObjects_,t=s.length;e!==t;++e)s[e].unbind()}},Ze.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},Ze.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},Ze.prototype.GetterByBindingType=[Ze.prototype._getValue_direct,Ze.prototype._getValue_array,Ze.prototype._getValue_arrayElement,Ze.prototype._getValue_toArray],Ze.prototype.SetterByBindingTypeAndVersioning=[[Ze.prototype._setValue_direct,Ze.prototype._setValue_direct_setNeedsUpdate,Ze.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Ze.prototype._setValue_array,Ze.prototype._setValue_array_setNeedsUpdate,Ze.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Ze.prototype._setValue_arrayElement,Ze.prototype._setValue_arrayElement_setNeedsUpdate,Ze.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Ze.prototype._setValue_fromArray,Ze.prototype._setValue_fromArray_setNeedsUpdate,Ze.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Wo=class{constructor(e,t,n=null,i=t.blendMode){this._mixer=e,this._clip=t,this._localRoot=n,this.blendMode=i;let r=t.tracks,a=r.length,o=new Array(a),l={endingStart:nr,endingEnd:nr};for(let c=0;c!==a;++c){let h=r[c].createInterpolant(null);o[c]=h,h.settings=l}this._interpolantSettings=l,this._interpolants=o,this._propertyBindings=new Array(a),this._cacheIndex=null,this._byClipCacheIndex=null,this._timeScaleInterpolant=null,this._restoreTimeScale=null,this._weightInterpolant=null,this.loop=2201,this._loopCount=-1,this._startTime=null,this.time=0,this.timeScale=1,this._effectiveTimeScale=1,this.weight=1,this._effectiveWeight=1,this.repetitions=1/0,this.paused=!1,this.enabled=!0,this.clampWhenFinished=!1,this.zeroSlopeAtStart=!0,this.zeroSlopeAtEnd=!0}play(){return this._mixer._activateAction(this),this}stop(){return this._mixer._deactivateAction(this),this.reset()}reset(){return this.paused=!1,this.enabled=!0,this.time=0,this._loopCount=-1,this._startTime=null,this.stopFading().stopWarping()}isRunning(){return this.enabled&&!this.paused&&this.timeScale!==0&&this._startTime===null&&this._mixer._isActiveAction(this)}isScheduled(){return this._mixer._isActiveAction(this)}startAt(e){return this._startTime=e,this}setLoop(e,t){return this.loop=e,this.repetitions=t,this}setEffectiveWeight(e){return this.weight=e,this._effectiveWeight=this.enabled?e:0,this.stopFading()}getEffectiveWeight(){return this._effectiveWeight}fadeIn(e){return this._scheduleFading(e,0,1)}fadeOut(e){return this._scheduleFading(e,1,0)}crossFadeFrom(e,t,n=!1){if(e.fadeOut(t),this.fadeIn(t),n===!0){let i=this._clip.duration,r=e._clip.duration,a=r/i,o=i/r;e._restoreTimeScale=e.timeScale,this._restoreTimeScale=this.timeScale,e.warp(1,a,t),this.warp(o,1,t)}return this}crossFadeTo(e,t,n=!1){return e.crossFadeFrom(this,t,n)}stopFading(){let e=this._weightInterpolant;return e!==null&&(this._weightInterpolant=null,this._mixer._takeBackControlInterpolant(e)),this}setEffectiveTimeScale(e){return this.timeScale=e,this._effectiveTimeScale=this.paused?0:e,this.stopWarping()}getEffectiveTimeScale(){return this._effectiveTimeScale}setDuration(e){return this.timeScale=this._clip.duration/e,this.stopWarping()}syncWith(e){return this.time=e.time,this.timeScale=e.timeScale,this.stopWarping()}halt(e){return this.warp(this._effectiveTimeScale,0,e)}warp(e,t,n){let i=this._mixer,r=i.time,a=this.timeScale,o=this._timeScaleInterpolant;o===null&&(o=i._lendControlInterpolant(),this._timeScaleInterpolant=o);let l=o.parameterPositions,c=o.sampleValues;return l[0]=r,l[1]=r+n,c[0]=e/a,c[1]=t/a,this}stopWarping(){let e=this._timeScaleInterpolant;return e!==null&&(this._timeScaleInterpolant=null,this._mixer._takeBackControlInterpolant(e)),this._restoreTimeScale=null,this}getMixer(){return this._mixer}getClip(){return this._clip}getRoot(){return this._localRoot||this._mixer._root}_update(e,t,n,i){if(!this.enabled)return void this._updateWeight(e);let r=this._startTime;if(r!==null){let l=(e-r)*n;l<0||n===0?t=0:(this._startTime=null,t=n*l)}t*=this._updateTimeScale(e);let a=this._updateTime(t),o=this._updateWeight(e);if(o>0){let l=this._interpolants,c=this._propertyBindings;if(this.blendMode===kp)for(let h=0,u=l.length;h!==u;++h)l[h].evaluate(a),c[h].accumulateAdditive(o);else for(let h=0,u=l.length;h!==u;++h)l[h].evaluate(a),c[h].accumulate(i,o)}}_updateWeight(e){let t=0;if(this.enabled){t=this.weight;let n=this._weightInterpolant;if(n!==null){let i=n.evaluate(e)[0];t*=i,e>n.parameterPositions[1]&&(this.stopFading(),i===0&&(this.enabled=!1))}}return this._effectiveWeight=t,t}_updateTimeScale(e){let t=0;if(!this.paused){t=this.timeScale;let n=this._timeScaleInterpolant;n!==null&&(t*=n.evaluate(e)[0],e>n.parameterPositions[1]&&(t===0?this.paused=!0:(this._restoreTimeScale!==null&&(t=this._restoreTimeScale),this.timeScale=t),this.stopWarping()))}return this._effectiveTimeScale=t,t}_updateTime(e){let t=this._clip.duration,n=this.loop,i=this.time+e,r=this._loopCount,a=n===2202;if(e===0)return r===-1||!a||1&~r?i:t-i;if(n===2200){r===-1&&(this._loopCount=0,this._setEndings(!0,!0,!1));e:{if(i>=t)i=t;else{if(!(i<0)){this.time=i;break e}i=0}this.clampWhenFinished?this.paused=!0:this.enabled=!1,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e<0?-1:1})}}else{if(r===-1&&(e>=0?(r=0,this._setEndings(!0,this.repetitions===0,a)):this._setEndings(this.repetitions===0,!0,a)),i>=t||i<0){let o=Math.floor(i/t);i-=t*o,r+=Math.abs(o);let l=this.repetitions-r;if(l<=0)this.clampWhenFinished?this.paused=!0:this.enabled=!1,i=e>0?t:0,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e>0?1:-1});else{if(l===1){let c=e<0;this._setEndings(c,!c,a)}else this._setEndings(!1,!1,a);this._loopCount=r,this.time=i,this._mixer.dispatchEvent({type:"loop",action:this,loopDelta:o})}}else this._loopCount=r,this.time=i;if(a&&!(1&~r))return t-i}return i}_setEndings(e,t,n){let i=this._interpolantSettings;n?(i.endingStart=ir,i.endingEnd=ir):(i.endingStart=e?this.zeroSlopeAtStart?ir:nr:ws,i.endingEnd=t?this.zeroSlopeAtEnd?ir:nr:ws)}_scheduleFading(e,t,n){let i=this._mixer,r=i.time,a=this._weightInterpolant;a===null&&(a=i._lendControlInterpolant(),this._weightInterpolant=a);let o=a.parameterPositions,l=a.sampleValues;return o[0]=r,l[0]=t,o[1]=r+e,l[1]=n,this}},lg=new Float32Array(1),Jr=class extends yn{constructor(e){super(),this._root=e,this._initMemoryManager(),this._accuIndex=0,this.time=0,this.timeScale=1,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}_bindAction(e,t){let n=e._localRoot||this._root,i=e._clip.tracks,r=i.length,a=e._propertyBindings,o=e._interpolants,l=n.uuid,c=this._bindingsByRootAndName,h=c[l];h===void 0&&(h={},c[l]=h);for(let u=0;u!==r;++u){let d=i[u],p=d.name,m=h[p];if(m!==void 0)++m.referenceCount,a[u]=m;else{if(m=a[u],m!==void 0){m._cacheIndex===null&&(++m.referenceCount,this._addInactiveBinding(m,l,p));continue}let f=t&&t._propertyBindings[u].binding.parsedPath;m=new jo(Ze.create(n,p,f),d.ValueTypeName,d.getValueSize()),++m.referenceCount,this._addInactiveBinding(m,l,p),a[u]=m}o[u].resultBuffer=m.buffer}}_activateAction(e){if(!this._isActiveAction(e)){if(e._cacheIndex===null){let n=(e._localRoot||this._root).uuid,i=e._clip.uuid,r=this._actionsByClip[i];this._bindAction(e,r&&r.knownActions[0]),this._addInactiveAction(e,i,n)}let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];r.useCount++===0&&(this._lendBinding(r),r.saveOriginalState())}this._lendAction(e)}}_deactivateAction(e){if(this._isActiveAction(e)){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];--r.useCount===0&&(r.restoreOriginalState(),this._takeBackBinding(r))}this._takeBackAction(e)}}_initMemoryManager(){this._actions=[],this._nActiveActions=0,this._actionsByClip={},this._bindings=[],this._nActiveBindings=0,this._bindingsByRootAndName={},this._controlInterpolants=[],this._nActiveControlInterpolants=0;let e=this;this.stats={actions:{get total(){return e._actions.length},get inUse(){return e._nActiveActions}},bindings:{get total(){return e._bindings.length},get inUse(){return e._nActiveBindings}},controlInterpolants:{get total(){return e._controlInterpolants.length},get inUse(){return e._nActiveControlInterpolants}}}}_isActiveAction(e){let t=e._cacheIndex;return t!==null&&t<this._nActiveActions}_addInactiveAction(e,t,n){let i=this._actions,r=this._actionsByClip,a=r[t];if(a===void 0)a={knownActions:[e],actionByRoot:{}},e._byClipCacheIndex=0,r[t]=a;else{let o=a.knownActions;e._byClipCacheIndex=o.length,o.push(e)}e._cacheIndex=i.length,i.push(e),a.actionByRoot[n]=e}_removeInactiveAction(e){let t=this._actions,n=t[t.length-1],i=e._cacheIndex;n._cacheIndex=i,t[i]=n,t.pop(),e._cacheIndex=null;let r=e._clip.uuid,a=this._actionsByClip,o=a[r],l=o.knownActions,c=l[l.length-1],h=e._byClipCacheIndex;c._byClipCacheIndex=h,l[h]=c,l.pop(),e._byClipCacheIndex=null,delete o.actionByRoot[(e._localRoot||this._root).uuid],l.length===0&&delete a[r],this._removeInactiveBindingsForAction(e)}_removeInactiveBindingsForAction(e){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];--r.referenceCount===0&&this._removeInactiveBinding(r)}}_lendAction(e){let t=this._actions,n=e._cacheIndex,i=this._nActiveActions++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackAction(e){let t=this._actions,n=e._cacheIndex,i=--this._nActiveActions,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_addInactiveBinding(e,t,n){let i=this._bindingsByRootAndName,r=this._bindings,a=i[t];a===void 0&&(a={},i[t]=a),a[n]=e,e._cacheIndex=r.length,r.push(e)}_removeInactiveBinding(e){let t=this._bindings,n=e.binding,i=n.rootNode.uuid,r=n.path,a=this._bindingsByRootAndName,o=a[i],l=t[t.length-1],c=e._cacheIndex;l._cacheIndex=c,t[c]=l,t.pop(),delete o[r],Object.keys(o).length===0&&delete a[i]}_lendBinding(e){let t=this._bindings,n=e._cacheIndex,i=this._nActiveBindings++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackBinding(e){let t=this._bindings,n=e._cacheIndex,i=--this._nActiveBindings,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_lendControlInterpolant(){let e=this._controlInterpolants,t=this._nActiveControlInterpolants++,n=e[t];return n===void 0&&(n=new Zs(new Float32Array(2),new Float32Array(2),1,lg),n.__cacheIndex=t,e[t]=n),n}_takeBackControlInterpolant(e){let t=this._controlInterpolants,n=e.__cacheIndex,i=--this._nActiveControlInterpolants,r=t[i];e.__cacheIndex=i,t[i]=e,r.__cacheIndex=n,t[n]=r}clipAction(e,t,n){let i=t||this._root,r=i.uuid,a=typeof e=="string"?Zn.findByName(i,e):e,o=a!==null?a.uuid:e,l=this._actionsByClip[o],c=null;if(n===void 0&&(n=a!==null?a.blendMode:Bp),l!==void 0){let u=l.actionByRoot[r];if(u!==void 0&&u.blendMode===n)return u;c=l.knownActions[0],a===null&&(a=c._clip)}if(a===null)return null;let h=new Wo(this,a,t,n);return this._bindAction(h,c),this._addInactiveAction(h,o,r),h}existingAction(e,t){let n=t||this._root,i=n.uuid,r=typeof e=="string"?Zn.findByName(n,e):e,a=r?r.uuid:e,o=this._actionsByClip[a];return o!==void 0&&o.actionByRoot[i]||null}stopAllAction(){let e=this._actions;for(let t=this._nActiveActions-1;t>=0;--t)e[t].stop();return this}update(e){e*=this.timeScale;let t=this._actions,n=this._nActiveActions,i=this.time+=e,r=Math.sign(e),a=this._accuIndex^=1;for(let c=0;c!==n;++c)t[c]._update(i,e,r,a);let o=this._bindings,l=this._nActiveBindings;for(let c=0;c!==l;++c)o[c].apply(a);return this}setTime(e){this.time=0;for(let t=0;t<this._actions.length;t++)this._actions[t].time=0;return this.update(e)}getRoot(){return this._root}uncacheClip(e){let t=this._actions,n=e.uuid,i=this._actionsByClip,r=i[n];if(r!==void 0){let a=r.knownActions;for(let o=0,l=a.length;o!==l;++o){let c=a[o];this._deactivateAction(c);let h=c._cacheIndex,u=t[t.length-1];c._cacheIndex=null,c._byClipCacheIndex=null,u._cacheIndex=h,t[h]=u,t.pop(),this._removeInactiveBindingsForAction(c)}delete i[n]}}uncacheRoot(e){let t=e.uuid,n=this._actionsByClip;for(let r in n){let a=n[r].actionByRoot[t];a!==void 0&&(this._deactivateAction(a),this._removeInactiveAction(a))}let i=this._bindingsByRootAndName[t];if(i!==void 0)for(let r in i){let a=i[r];a.restoreOriginalState(),this._removeInactiveBinding(a)}}uncacheAction(e,t){let n=this.existingAction(e,t);n!==null&&(this._deactivateAction(n),this._removeInactiveAction(n))}};var Yb=new ge;var Zr=class{constructor(e=1,t=0,n=0){this.radius=e,this.phi=t,this.theta=n}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=ke(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(ke(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}};var Dc=class s{static{s.prototype.isMatrix2=!0}constructor(e,t,n,i){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,i)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,i){let r=this.elements;return r[0]=e,r[2]=t,r[1]=n,r[3]=i,this}},Jb=new ne;var Zb=new C,Qb=new C,$b=new C,e_=new C,t_=new C,n_=new C,i_=new C;var r_=new C;var s_=new C,a_=new ge,o_=new ge;var l_=new C,c_=new de,h_=new de;var ia=class extends Ti{constructor(e=10,t=10,n=4473924,i=8947848){n=new de(n),i=new de(i);let r=t/2,a=e/t,o=e/2,l=[],c=[];for(let u=0,d=0,p=-o;u<=t;u++,p+=a){l.push(-o,0,p,o,0,p),l.push(p,0,-o,p,0,o);let m=u===r?n:i;m.toArray(c,d),d+=3,m.toArray(c,d),d+=3,m.toArray(c,d),d+=3,m.toArray(c,d),d+=3}let h=new De;h.setAttribute("position",new ve(l,3)),h.setAttribute("color",new ve(c,3)),super(h,new on({vertexColors:!0,toneMapped:!1})),this.type="GridHelper"}dispose(){this.geometry.dispose(),this.material.dispose()}};var u_=new C,d_=new C,p_=new C;var f_=new C,m_=new Yr;var g_=new zt;var v_=new C;var ra=class extends yn{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(e){e!==void 0?(this.domElement!==null&&this.disconnect(),this.domElement=e):Ae("Controls: connect() now requires an element.")}disconnect(){}dispose(){}update(){}};function zh(s,e,t,n){let i=(function(r){switch(r){case un:case Qc:return{byteLength:1,components:1};case is:case $c:case ti:return{byteLength:2,components:1};case Jo:case Zo:return{byteLength:2,components:4};case Ai:case Yo:case dn:return{byteLength:4,components:1};case eh:case th:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${r}.`)})(n);switch(t){case 1021:return s*e;case Qo:case $o:return s*e/i.components*i.byteLength;case 1030:case 1031:return s*e*2/i.components*i.byteLength;case 1022:return s*e*3/i.components*i.byteLength;case Tn:case 1033:return s*e*4/i.components*i.byteLength;case 33776:case 33777:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case 33778:case 33779:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case 35841:case 35843:return Math.max(s,16)*Math.max(e,8)/4;case 35840:case 35842:return Math.max(s,8)*Math.max(e,8)/2;case 36196:case 37492:case 37488:case 37489:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case 37496:case 37490:case 37491:case 37808:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case 37809:return Math.floor((s+4)/5)*Math.floor((e+3)/4)*16;case 37810:return Math.floor((s+4)/5)*Math.floor((e+4)/5)*16;case 37811:return Math.floor((s+5)/6)*Math.floor((e+4)/5)*16;case 37812:return Math.floor((s+5)/6)*Math.floor((e+5)/6)*16;case 37813:return Math.floor((s+7)/8)*Math.floor((e+4)/5)*16;case 37814:return Math.floor((s+7)/8)*Math.floor((e+5)/6)*16;case 37815:return Math.floor((s+7)/8)*Math.floor((e+7)/8)*16;case 37816:return Math.floor((s+9)/10)*Math.floor((e+4)/5)*16;case 37817:return Math.floor((s+9)/10)*Math.floor((e+5)/6)*16;case 37818:return Math.floor((s+9)/10)*Math.floor((e+7)/8)*16;case 37819:return Math.floor((s+9)/10)*Math.floor((e+9)/10)*16;case 37820:return Math.floor((s+11)/12)*Math.floor((e+9)/10)*16;case 37821:return Math.floor((s+11)/12)*Math.floor((e+11)/12)*16;case 36492:case 36494:case 36495:return Math.ceil(s/4)*Math.ceil(e/4)*16;case 36283:case 36284:return Math.ceil(s/4)*Math.ceil(e/4)*8;case 36285:case 36286:return Math.ceil(s/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"185"}})),typeof window<"u"&&(window.__THREE__?Ae("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="185");function wf(){let s=null,e=!1,t=null,n=null;function i(r,a){t(r,a),n=s.requestAnimationFrame(i)}return{start:function(){e!==!0&&t!==null&&s!==null&&(n=s.requestAnimationFrame(i),e=!0)},stop:function(){s!==null&&s.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){s=r}}}function ug(s){let e=new WeakMap;return{get:function(t){return t.isInterleavedBufferAttribute&&(t=t.data),e.get(t)},remove:function(t){t.isInterleavedBufferAttribute&&(t=t.data);let n=e.get(t);n&&(s.deleteBuffer(n.buffer),e.delete(t))},update:function(t,n){if(t.isInterleavedBufferAttribute&&(t=t.data),t.isGLBufferAttribute){let r=e.get(t);return void((!r||r.version<t.version)&&e.set(t,{buffer:t.buffer,type:t.type,bytesPerElement:t.elementSize,version:t.version}))}let i=e.get(t);if(i===void 0)e.set(t,(function(r,a){let o=r.array,l=r.usage,c=o.byteLength,h=s.createBuffer(),u;if(s.bindBuffer(a,h),s.bufferData(a,o,l),r.onUploadCallback(),o instanceof Float32Array)u=s.FLOAT;else if(typeof Float16Array<"u"&&o instanceof Float16Array)u=s.HALF_FLOAT;else if(o instanceof Uint16Array)u=r.isFloat16BufferAttribute?s.HALF_FLOAT:s.UNSIGNED_SHORT;else if(o instanceof Int16Array)u=s.SHORT;else if(o instanceof Uint32Array)u=s.UNSIGNED_INT;else if(o instanceof Int32Array)u=s.INT;else if(o instanceof Int8Array)u=s.BYTE;else if(o instanceof Uint8Array)u=s.UNSIGNED_BYTE;else{if(!(o instanceof Uint8ClampedArray))throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+o);u=s.UNSIGNED_BYTE}return{buffer:h,type:u,bytesPerElement:o.BYTES_PER_ELEMENT,version:r.version,size:c}})(t,n));else if(i.version<t.version){if(i.size!==t.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");(function(r,a,o){let l=a.array,c=a.updateRanges;if(s.bindBuffer(o,r),c.length===0)s.bufferSubData(o,0,l);else{c.sort((u,d)=>u.start-d.start);let h=0;for(let u=1;u<c.length;u++){let d=c[h],p=c[u];p.start<=d.start+d.count+1?d.count=Math.max(d.count,p.start+p.count-d.start):(++h,c[h]=p)}c.length=h+1;for(let u=0,d=c.length;u<d;u++){let p=c[u];s.bufferSubData(o,p.start*l.BYTES_PER_ELEMENT,l,p.start,p.count)}a.clearUpdateRanges()}a.onUploadCallback()})(i.buffer,t,n),i.version=t.version}}}}var Ve={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:"gl_FragColor = linearToOutputTexel( gl_FragColor );",colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,lightprobes_pars_fragment:`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distance_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},_e={common:{diffuse:{value:new de(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Fe},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Fe}},envmap:{envMap:{value:null},envMapRotation:{value:new Fe},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Fe}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Fe}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Fe},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Fe},normalScale:{value:new ne(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Fe},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Fe}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Fe}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Fe}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new de(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new C},probesMax:{value:new C},probesResolution:{value:new C}},points:{diffuse:{value:new de(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0},uvTransform:{value:new Fe}},sprite:{diffuse:{value:new de(16777215)},opacity:{value:1},center:{value:new ne(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Fe},alphaMap:{value:null},alphaMapTransform:{value:new Fe},alphaTest:{value:0}}},ii={basic:{uniforms:Xt([_e.common,_e.specularmap,_e.envmap,_e.aomap,_e.lightmap,_e.fog]),vertexShader:Ve.meshbasic_vert,fragmentShader:Ve.meshbasic_frag},lambert:{uniforms:Xt([_e.common,_e.specularmap,_e.envmap,_e.aomap,_e.lightmap,_e.emissivemap,_e.bumpmap,_e.normalmap,_e.displacementmap,_e.fog,_e.lights,{emissive:{value:new de(0)},envMapIntensity:{value:1}}]),vertexShader:Ve.meshlambert_vert,fragmentShader:Ve.meshlambert_frag},phong:{uniforms:Xt([_e.common,_e.specularmap,_e.envmap,_e.aomap,_e.lightmap,_e.emissivemap,_e.bumpmap,_e.normalmap,_e.displacementmap,_e.fog,_e.lights,{emissive:{value:new de(0)},specular:{value:new de(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ve.meshphong_vert,fragmentShader:Ve.meshphong_frag},standard:{uniforms:Xt([_e.common,_e.envmap,_e.aomap,_e.lightmap,_e.emissivemap,_e.bumpmap,_e.normalmap,_e.displacementmap,_e.roughnessmap,_e.metalnessmap,_e.fog,_e.lights,{emissive:{value:new de(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ve.meshphysical_vert,fragmentShader:Ve.meshphysical_frag},toon:{uniforms:Xt([_e.common,_e.aomap,_e.lightmap,_e.emissivemap,_e.bumpmap,_e.normalmap,_e.displacementmap,_e.gradientmap,_e.fog,_e.lights,{emissive:{value:new de(0)}}]),vertexShader:Ve.meshtoon_vert,fragmentShader:Ve.meshtoon_frag},matcap:{uniforms:Xt([_e.common,_e.bumpmap,_e.normalmap,_e.displacementmap,_e.fog,{matcap:{value:null}}]),vertexShader:Ve.meshmatcap_vert,fragmentShader:Ve.meshmatcap_frag},points:{uniforms:Xt([_e.points,_e.fog]),vertexShader:Ve.points_vert,fragmentShader:Ve.points_frag},dashed:{uniforms:Xt([_e.common,_e.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ve.linedashed_vert,fragmentShader:Ve.linedashed_frag},depth:{uniforms:Xt([_e.common,_e.displacementmap]),vertexShader:Ve.depth_vert,fragmentShader:Ve.depth_frag},normal:{uniforms:Xt([_e.common,_e.bumpmap,_e.normalmap,_e.displacementmap,{opacity:{value:1}}]),vertexShader:Ve.meshnormal_vert,fragmentShader:Ve.meshnormal_frag},sprite:{uniforms:Xt([_e.sprite,_e.fog]),vertexShader:Ve.sprite_vert,fragmentShader:Ve.sprite_frag},background:{uniforms:{uvTransform:{value:new Fe},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ve.background_vert,fragmentShader:Ve.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Fe}},vertexShader:Ve.backgroundCube_vert,fragmentShader:Ve.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ve.cube_vert,fragmentShader:Ve.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ve.equirect_vert,fragmentShader:Ve.equirect_frag},distance:{uniforms:Xt([_e.common,_e.displacementmap,{referencePosition:{value:new C},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ve.distance_vert,fragmentShader:Ve.distance_frag},shadow:{uniforms:Xt([_e.lights,_e.fog,{color:{value:new de(0)},opacity:{value:1}}]),vertexShader:Ve.shadow_vert,fragmentShader:Ve.shadow_frag}};ii.physical={uniforms:Xt([ii.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Fe},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Fe},clearcoatNormalScale:{value:new ne(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Fe},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Fe},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Fe},sheen:{value:0},sheenColor:{value:new de(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Fe},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Fe},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Fe},transmissionSamplerSize:{value:new ne},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Fe},attenuationDistance:{value:0},attenuationColor:{value:new de(0)},specularColor:{value:new de(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Fe},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Fe},anisotropyVector:{value:new ne},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Fe}}]),vertexShader:Ve.meshphysical_vert,fragmentShader:Ve.meshphysical_frag};var cl={r:0,b:0,g:0},dg=new ge,Af=new Fe;function pg(s,e,t,n,i,r){let a=new de(0),o,l,c=i===!0?0:1,h=null,u=0,d=null;function p(f){let _=f.isScene===!0?f.background:null;if(_&&_.isTexture){let g=f.backgroundBlurriness>0;_=e.get(_,g)}return _}function m(f,_){f.getRGB(cl,Bh(s)),t.buffers.color.setClear(cl.r,cl.g,cl.b,_,r)}return{getClearColor:function(){return a},setClearColor:function(f,_=1){a.set(f),c=_,m(a,c)},getClearAlpha:function(){return c},setClearAlpha:function(f){c=f,m(a,c)},render:function(f){let _=!1,g=p(f);g===null?m(a,c):g&&g.isColor&&(m(g,1),_=!0);let v=s.xr.getEnvironmentBlendMode();v==="additive"?t.buffers.color.setClear(0,0,0,1,r):v==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(s.autoClear||_)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))},addToRenderList:function(f,_){let g=p(_);g&&(g.isCubeTexture||g.mapping===la)?(l===void 0&&(l=new et(new ur(1,1,1),new cn({name:"BackgroundCubeMaterial",uniforms:_r(ii.backgroundCube.uniforms),vertexShader:ii.backgroundCube.vertexShader,fragmentShader:ii.backgroundCube.fragmentShader,side:en,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),l.geometry.deleteAttribute("uv"),l.onBeforeRender=function(v,b,y){this.matrixWorld.copyPosition(y.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(l)),l.material.uniforms.envMap.value=g,l.material.uniforms.backgroundBlurriness.value=_.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(dg.makeRotationFromEuler(_.backgroundRotation)).transpose(),g.isCubeTexture&&g.isRenderTargetTexture===!1&&l.material.uniforms.backgroundRotation.value.premultiply(Af),l.material.toneMapped=Ce.getTransfer(g.colorSpace)!==nt,h===g&&u===g.version&&d===s.toneMapping||(l.material.needsUpdate=!0,h=g,u=g.version,d=s.toneMapping),l.layers.enableAll(),f.unshift(l,l.geometry,l.material,0,0,null)):g&&g.isTexture&&(o===void 0&&(o=new et(new Kr(2,2),new cn({name:"BackgroundMaterial",uniforms:_r(ii.background.uniforms),vertexShader:ii.background.vertexShader,fragmentShader:ii.background.fragmentShader,side:$n,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),o.geometry.deleteAttribute("normal"),Object.defineProperty(o.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(o)),o.material.uniforms.t2D.value=g,o.material.uniforms.backgroundIntensity.value=_.backgroundIntensity,o.material.toneMapped=Ce.getTransfer(g.colorSpace)!==nt,g.matrixAutoUpdate===!0&&g.updateMatrix(),o.material.uniforms.uvTransform.value.copy(g.matrix),h===g&&u===g.version&&d===s.toneMapping||(o.material.needsUpdate=!0,h=g,u=g.version,d=s.toneMapping),o.layers.enableAll(),f.unshift(o,o.geometry,o.material,0,0,null))},dispose:function(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),o!==void 0&&(o.geometry.dispose(),o.material.dispose(),o=void 0)}}}function fg(s,e){let t=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=c(null),r=i,a=!1;function o(g){return s.bindVertexArray(g)}function l(g){return s.deleteVertexArray(g)}function c(g){let v=[],b=[],y=[];for(let S=0;S<t;S++)v[S]=0,b[S]=0,y[S]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:v,enabledAttributes:b,attributeDivisors:y,object:g,attributes:{},index:null}}function h(){let g=r.newAttributes;for(let v=0,b=g.length;v<b;v++)g[v]=0}function u(g){d(g,0)}function d(g,v){let b=r.newAttributes,y=r.enabledAttributes,S=r.attributeDivisors;b[g]=1,y[g]===0&&(s.enableVertexAttribArray(g),y[g]=1),S[g]!==v&&(s.vertexAttribDivisor(g,v),S[g]=v)}function p(){let g=r.newAttributes,v=r.enabledAttributes;for(let b=0,y=v.length;b<y;b++)v[b]!==g[b]&&(s.disableVertexAttribArray(b),v[b]=0)}function m(g,v,b,y,S,x,A){A===!0?s.vertexAttribIPointer(g,v,b,S,x):s.vertexAttribPointer(g,v,b,y,S,x)}function f(){_(),a=!0,r!==i&&(r=i,o(r.object))}function _(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:function(g,v,b,y,S){let x=!1,A=(function(F,L,P,O){let B=O.wireframe===!0,j=n[L.id];j===void 0&&(j={},n[L.id]=j);let H=F.isInstancedMesh===!0?F.id:0,W=j[H];W===void 0&&(W={},j[H]=W);let Y=W[P.id];Y===void 0&&(Y={},W[P.id]=Y);let K=Y[B];return K===void 0&&(K=c(s.createVertexArray()),Y[B]=K),K})(g,y,b,v);r!==A&&(r=A,o(r.object)),x=(function(F,L,P,O){let B=r.attributes,j=L.attributes,H=0,W=P.getAttributes();for(let Y in W)if(W[Y].location>=0){let K=B[Y],ee=j[Y];if(ee===void 0&&(Y==="instanceMatrix"&&F.instanceMatrix&&(ee=F.instanceMatrix),Y==="instanceColor"&&F.instanceColor&&(ee=F.instanceColor)),K===void 0||K.attribute!==ee||ee&&K.data!==ee.data)return!0;H++}return r.attributesNum!==H||r.index!==O})(g,y,b,S),x&&(function(F,L,P,O){let B={},j=L.attributes,H=0,W=P.getAttributes();for(let Y in W)if(W[Y].location>=0){let K=j[Y];K===void 0&&(Y==="instanceMatrix"&&F.instanceMatrix&&(K=F.instanceMatrix),Y==="instanceColor"&&F.instanceColor&&(K=F.instanceColor));let ee={};ee.attribute=K,K&&K.data&&(ee.data=K.data),B[Y]=ee,H++}r.attributes=B,r.attributesNum=H,r.index=O})(g,y,b,S),S!==null&&e.update(S,s.ELEMENT_ARRAY_BUFFER),(x||a)&&(a=!1,(function(F,L,P,O){h();let B=O.attributes,j=P.getAttributes(),H=L.defaultAttributeValues;for(let W in j){let Y=j[W];if(Y.location>=0){let K=B[W];if(K===void 0&&(W==="instanceMatrix"&&F.instanceMatrix&&(K=F.instanceMatrix),W==="instanceColor"&&F.instanceColor&&(K=F.instanceColor)),K!==void 0){let ee=K.normalized,ue=K.itemSize,Se=e.get(K);if(Se===void 0)continue;let me=Se.buffer,xe=Se.type,te=Se.bytesPerElement,pe=xe===s.INT||xe===s.UNSIGNED_INT||K.gpuType===Yo;if(K.isInterleavedBufferAttribute){let oe=K.data,V=oe.stride,G=K.offset;if(oe.isInstancedInterleavedBuffer){for(let k=0;k<Y.locationSize;k++)d(Y.location+k,oe.meshPerAttribute);F.isInstancedMesh!==!0&&O._maxInstanceCount===void 0&&(O._maxInstanceCount=oe.meshPerAttribute*oe.count)}else for(let k=0;k<Y.locationSize;k++)u(Y.location+k);s.bindBuffer(s.ARRAY_BUFFER,me);for(let k=0;k<Y.locationSize;k++)m(Y.location+k,ue/Y.locationSize,xe,ee,V*te,(G+ue/Y.locationSize*k)*te,pe)}else{if(K.isInstancedBufferAttribute){for(let oe=0;oe<Y.locationSize;oe++)d(Y.location+oe,K.meshPerAttribute);F.isInstancedMesh!==!0&&O._maxInstanceCount===void 0&&(O._maxInstanceCount=K.meshPerAttribute*K.count)}else for(let oe=0;oe<Y.locationSize;oe++)u(Y.location+oe);s.bindBuffer(s.ARRAY_BUFFER,me);for(let oe=0;oe<Y.locationSize;oe++)m(Y.location+oe,ue/Y.locationSize,xe,ee,ue*te,ue/Y.locationSize*oe*te,pe)}}else if(H!==void 0){let ee=H[W];if(ee!==void 0)switch(ee.length){case 2:s.vertexAttrib2fv(Y.location,ee);break;case 3:s.vertexAttrib3fv(Y.location,ee);break;case 4:s.vertexAttrib4fv(Y.location,ee);break;default:s.vertexAttrib1fv(Y.location,ee)}}}}p()})(g,v,b,y),S!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,e.get(S).buffer))},reset:f,resetDefaultState:_,dispose:function(){f();for(let g in n){let v=n[g];for(let b in v){let y=v[b];for(let S in y){let x=y[S];for(let A in x)l(x[A].object),delete x[A];delete y[S]}}delete n[g]}},releaseStatesOfGeometry:function(g){if(n[g.id]===void 0)return;let v=n[g.id];for(let b in v){let y=v[b];for(let S in y){let x=y[S];for(let A in x)l(x[A].object),delete x[A];delete y[S]}}delete n[g.id]},releaseStatesOfObject:function(g){for(let v in n){let b=n[v],y=g.isInstancedMesh===!0?g.id:0,S=b[y];if(S!==void 0){for(let x in S){let A=S[x];for(let F in A)l(A[F].object),delete A[F];delete S[x]}delete b[y],Object.keys(b).length===0&&delete n[v]}}},releaseStatesOfProgram:function(g){for(let v in n){let b=n[v];for(let y in b){let S=b[y];if(S[g.id]===void 0)continue;let x=S[g.id];for(let A in x)l(x[A].object),delete x[A];delete S[g.id]}}},initAttributes:h,enableAttribute:u,disableUnusedAttributes:p}}function mg(s,e,t){let n;this.setMode=function(i){n=i},this.render=function(i,r){s.drawArrays(n,i,r),t.update(r,n,1)},this.renderInstances=function(i,r,a){a!==0&&(s.drawArraysInstanced(n,i,r,a),t.update(r,n,a))},this.renderMultiDraw=function(i,r,a){if(a===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,i,0,r,0,a);let o=0;for(let l=0;l<a;l++)o+=r[l];t.update(o,n,1)}}function gg(s,e,t,n){let i;function r(h){if(h==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";h="mediump"}return h==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let a=t.precision!==void 0?t.precision:"highp",o=r(a);o!==a&&(Ae("WebGLRenderer:",a,"not supported, using",o,"instead."),a=o);let l=t.logarithmicDepthBuffer===!0,c=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control");return t.reversedDepthBuffer===!0&&c===!1&&Ae("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer."),{isWebGL2:!0,getMaxAnisotropy:function(){if(i!==void 0)return i;if(e.has("EXT_texture_filter_anisotropic")===!0){let h=e.get("EXT_texture_filter_anisotropic");i=s.getParameter(h.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i},getMaxPrecision:r,textureFormatReadable:function(h){return h===Tn||n.convert(h)===s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT)},textureTypeReadable:function(h){let u=h===ti&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(h!==un&&n.convert(h)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE)&&h!==dn&&!u)},precision:a,logarithmicDepthBuffer:l,reversedDepthBuffer:c,maxTextures:s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),maxVertexTextures:s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),maxTextureSize:s.getParameter(s.MAX_TEXTURE_SIZE),maxCubemapSize:s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),maxAttributes:s.getParameter(s.MAX_VERTEX_ATTRIBS),maxVertexUniforms:s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),maxVaryings:s.getParameter(s.MAX_VARYING_VECTORS),maxFragmentUniforms:s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),maxSamples:s.getParameter(s.MAX_SAMPLES),samples:s.getParameter(s.SAMPLES)}}function vg(s){let e=this,t=null,n=0,i=!1,r=!1,a=new vn,o=new Fe,l={value:null,needsUpdate:!1};function c(h,u,d,p){let m=h!==null?h.length:0,f=null;if(m!==0){if(f=l.value,p!==!0||f===null){let _=d+4*m,g=u.matrixWorldInverse;o.getNormalMatrix(g),(f===null||f.length<_)&&(f=new Float32Array(_));for(let v=0,b=d;v!==m;++v,b+=4)a.copy(h[v]).applyMatrix4(g,o),a.normal.toArray(f,b),f[b+3]=a.constant}l.value=f,l.needsUpdate=!0}return e.numPlanes=m,e.numIntersection=0,f}this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(h,u){let d=h.length!==0||u||n!==0||i;return i=u,n=h.length,d},this.beginShadows=function(){r=!0,c(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(h,u){t=c(h,u,0)},this.setState=function(h,u,d){let p=h.clippingPlanes,m=h.clipIntersection,f=h.clipShadows,_=s.get(h);if(!i||p===null||p.length===0||r&&!f)r?c(null):(function(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0})();else{let g=r?0:n,v=4*g,b=_.clippingState||null;l.value=b,b=c(p,u,v,d);for(let y=0;y!==v;++y)b[y]=t[y];_.clippingState=b,this.numIntersection=m?this.numPlanes:0,this.numPlanes+=g}}}Af.set(-1,0,0,0,1,0,0,0,1);var nf=[.125,.215,.35,.446,.526,.582],ha=20,ua=new Hi,rf=new de,Gh=null,Vh=0,Hh=0,jh=!1,bg=new C,ul=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,i=100,r={}){let{size:a=256,position:o=bg}=r;Gh=this._renderer.getRenderTarget(),Vh=this._renderer.getActiveCubeFace(),Hh=this._renderer.getActiveMipmapLevel(),jh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,n,i,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=of(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=af(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Gh,Vh,Hh),this._renderer.xr.enabled=jh,e.scissorTest=!1,as(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===es||e.mapping===fr?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Gh=this._renderer.getRenderTarget(),Vh=this._renderer.getActiveCubeFace(),Hh=this._renderer.getActiveMipmapLevel(),jh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:ct,minFilter:ct,generateMipmaps:!1,type:ti,format:Tn,colorSpace:kt,depthBuffer:!1},i=sf(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=sf(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=(function(a){let o=[],l=[],c=[],h=a,u=a-4+1+nf.length;for(let d=0;d<u;d++){let p=Math.pow(2,h);o.push(p);let m=1/p;d>a-4?m=nf[d-a+4-1]:d===0&&(m=0),l.push(m);let f=1/(p-2),_=-f,g=1+f,v=[_,_,g,_,g,g,_,_,g,g,_,g],b=6,y=6,S=3,x=2,A=1,F=new Float32Array(S*y*b),L=new Float32Array(x*y*b),P=new Float32Array(A*y*b);for(let B=0;B<b;B++){let j=B%3*2/3-1,H=B>2?0:-1,W=[j,H,0,j+2/3,H,0,j+2/3,H+1,0,j,H,0,j+2/3,H+1,0,j,H+1,0];F.set(W,S*y*B),L.set(v,x*y*B);let Y=[B,B,B,B,B,B];P.set(Y,A*y*B)}let O=new De;O.setAttribute("position",new Xe(F,S)),O.setAttribute("uv",new Xe(L,x)),O.setAttribute("faceIndex",new Xe(P,A)),c.push(new et(O,null)),h>4&&h--}return{lodMeshes:c,sizeLods:o,sigmas:l}})(r)),this._blurMaterial=(function(a,o,l){let c=new Float32Array(ha),h=new C(0,1,0);return new cn({name:"SphericalGaussianBlur",defines:{n:ha,CUBEUV_TEXEL_WIDTH:1/o,CUBEUV_TEXEL_HEIGHT:1/l,CUBEUV_MAX_MIP:`${a}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:c},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:h}},vertexShader:dl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:ei,depthTest:!1,depthWrite:!1})})(r,e,t),this._ggxMaterial=(function(a,o,l){return new cn({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:256,CUBEUV_TEXEL_WIDTH:1/o,CUBEUV_TEXEL_HEIGHT:1/l,CUBEUV_MAX_MIP:`${a}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:dl(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:ei,depthTest:!1,depthWrite:!1})})(r,e,t)}return i}_compileMaterial(e){let t=new et(new De,e);this._renderer.compile(t,ua)}_sceneToCubeUV(e,t,n,i,r){let a=new vt(90,1,t,n),o=[1,-1,1,1,1,1],l=[1,1,1,-1,-1,-1],c=this._renderer,h=c.autoClear,u=c.toneMapping;c.getClearColor(rf),c.toneMapping=zn,c.autoClear=!1,c.state.buffers.depth.getReversed()&&(c.setRenderTarget(i),c.clearDepth(),c.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new et(new ur,new Nn({name:"PMREM.Background",side:en,depthWrite:!1,depthTest:!1})));let d=this._backgroundBox,p=d.material,m=!1,f=e.background;f?f.isColor&&(p.color.copy(f),e.background=null,m=!0):(p.color.copy(rf),m=!0);for(let _=0;_<6;_++){let g=_%3;g===0?(a.up.set(0,o[_],0),a.position.set(r.x,r.y,r.z),a.lookAt(r.x+l[_],r.y,r.z)):g===1?(a.up.set(0,0,o[_]),a.position.set(r.x,r.y,r.z),a.lookAt(r.x,r.y+l[_],r.z)):(a.up.set(0,o[_],0),a.position.set(r.x,r.y,r.z),a.lookAt(r.x,r.y,r.z+l[_]));let v=this._cubeSize;as(i,g*v,_>2?v:0,v,v),c.setRenderTarget(i),m&&c.render(d,a),c.render(e,a)}c.toneMapping=u,c.autoClear=h,e.background=f}_textureToCubeUV(e,t){let n=this._renderer,i=e.mapping===es||e.mapping===fr;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=of()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=af());let r=i?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r,r.uniforms.envMap.value=e;let o=this._cubeSize;as(t,0,0,3*o,2*o),n.setRenderTarget(t),n.render(a,ua)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let i=this._lodMeshes.length;for(let r=1;r<i;r++)this._applyGGXFilter(e,r-1,r);t.autoClear=n}_applyGGXFilter(e,t,n){let i=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let l=a.uniforms,c=n/(this._lodMeshes.length-1),h=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-h*h)*(0+1.25*c),{_lodMax:d}=this,p=this._sizeLods[n],m=3*p*(n>d-4?n-d+4:0),f=4*(this._cubeSize-p);l.envMap.value=e.texture,l.roughness.value=u,l.mipInt.value=d-t,as(r,m,f,3*p,2*p),i.setRenderTarget(r),i.render(o,ua),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=d-n,as(e,m,f,3*p,2*p),i.setRenderTarget(e),i.render(o,ua)}_blur(e,t,n,i,r){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,i,"latitudinal",r),this._halfBlur(a,e,n,n,i,"longitudinal",r)}_halfBlur(e,t,n,i,r,a,o){let l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&Ie("blur direction must be either latitudinal or longitudinal!");let h=this._lodMeshes[i];h.material=c;let u=c.uniforms,d=this._sizeLods[n]-1,p=isFinite(r)?Math.PI/(2*d):2*Math.PI/39,m=r/p,f=isFinite(r)?1+Math.floor(3*m):ha;f>ha&&Ae(`sigmaRadians, ${r}, is too large and will clip, as it requested ${f} samples when the maximum is set to 20`);let _=[],g=0;for(let y=0;y<ha;++y){let S=y/m,x=Math.exp(-S*S/2);_.push(x),y===0?g+=x:y<f&&(g+=2*x)}for(let y=0;y<_.length;y++)_[y]=_[y]/g;u.envMap.value=e.texture,u.samples.value=f,u.weights.value=_,u.latitudinal.value=a==="latitudinal",o&&(u.poleAxis.value=o);let{_lodMax:v}=this;u.dTheta.value=p,u.mipInt.value=v-n;let b=this._sizeLods[i];as(t,3*b*(i>v-4?i-v+4:0),4*(this._cubeSize-b),3*b,2*b),l.setRenderTarget(t),l.render(h,ua)}};function sf(s,e,t){let n=new an(s,e,t);return n.texture.mapping=la,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function as(s,e,t,n,i){s.viewport.set(e,t,n,i),s.scissor.set(e,t,n,i)}function af(){return new cn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:dl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:ei,depthTest:!1,depthWrite:!1})}function of(){return new cn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:dl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:ei,depthTest:!1,depthWrite:!1})}function dl(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}var pl=class extends an{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];this.texture=new Os(i),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new ur(5,5,5),r=new cn({name:"CubemapFromEquirect",uniforms:_r(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:en,blending:ei});r.uniforms.tEquirect.value=t;let a=new et(i,r),o=t.minFilter;return t.minFilter===hn&&(t.minFilter=ct),new Vo(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,i=!0){let r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,i);e.setRenderTarget(r)}};function _g(s){let e=new WeakMap,t=new WeakMap,n=null;function i(o,l){return l===ts?o.mapping=es:l===Xo&&(o.mapping=fr),o}function r(o){let l=o.target;l.removeEventListener("dispose",r);let c=e.get(l);c!==void 0&&(e.delete(l),c.dispose())}function a(o){let l=o.target;l.removeEventListener("dispose",a);let c=t.get(l);c!==void 0&&(t.delete(l),c.dispose())}return{get:function(o,l=!1){return o==null?null:l?(function(c){if(c&&c.isTexture){let h=c.mapping,u=h===ts||h===Xo,d=h===es||h===fr;if(u||d){let p=t.get(c),m=p!==void 0?p.texture.pmremVersion:0;if(c.isRenderTargetTexture&&c.pmremVersion!==m)return n===null&&(n=new ul(s)),p=u?n.fromEquirectangular(c,p):n.fromCubemap(c,p),p.texture.pmremVersion=c.pmremVersion,t.set(c,p),p.texture;if(p!==void 0)return p.texture;{let f=c.image;return u&&f&&f.height>0||d&&f&&(function(_){let g=0,v=6;for(let b=0;b<v;b++)_[b]!==void 0&&g++;return g===v})(f)?(n===null&&(n=new ul(s)),p=u?n.fromEquirectangular(c):n.fromCubemap(c),p.texture.pmremVersion=c.pmremVersion,t.set(c,p),c.addEventListener("dispose",a),p.texture):null}}}return c})(o):(function(c){if(c&&c.isTexture){let h=c.mapping;if(h===ts||h===Xo){if(e.has(c))return i(e.get(c).texture,c.mapping);{let u=c.image;if(u&&u.height>0){let d=new pl(u.height);return d.fromEquirectangularTexture(s,c),e.set(c,d),c.addEventListener("dispose",r),i(d.texture,c.mapping)}return null}}}return c})(o)},dispose:function(){e=new WeakMap,t=new WeakMap,n!==null&&(n.dispose(),n=null)}}}function yg(s){let e={};function t(n){if(e[n]!==void 0)return e[n];let i=s.getExtension(n);return e[n]=i,i}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){let i=t(n);return i===null&&rr("WebGLRenderer: "+n+" extension not supported."),i}}}function xg(s,e,t,n){let i={},r=new WeakMap;function a(l){let c=l.target;c.index!==null&&e.remove(c.index);for(let u in c.attributes)e.remove(c.attributes[u]);c.removeEventListener("dispose",a),delete i[c.id];let h=r.get(c);h&&(e.remove(h),r.delete(c)),n.releaseStatesOfGeometry(c),c.isInstancedBufferGeometry===!0&&delete c._maxInstanceCount,t.memory.geometries--}function o(l){let c=[],h=l.index,u=l.attributes.position,d=0;if(u===void 0)return;if(h!==null){let f=h.array;d=h.version;for(let _=0,g=f.length;_<g;_+=3){let v=f[_+0],b=f[_+1],y=f[_+2];c.push(v,b,b,y,y,v)}}else{let f=u.array;d=u.version;for(let _=0,g=f.length/3-1;_<g;_+=3){let v=_+0,b=_+1,y=_+2;c.push(v,b,b,y,y,v)}}let p=new(u.count>=65535?lr:_i)(c,1);p.version=d;let m=r.get(l);m&&e.remove(m),r.set(l,p)}return{get:function(l,c){return i[c.id]===!0||(c.addEventListener("dispose",a),i[c.id]=!0,t.memory.geometries++),c},update:function(l){let c=l.attributes;for(let h in c)e.update(c[h],s.ARRAY_BUFFER)},getWireframeAttribute:function(l){let c=r.get(l);if(c){let h=l.index;h!==null&&c.version<h.version&&o(l)}else o(l);return r.get(l)}}}function Mg(s,e,t){let n,i,r;this.setMode=function(a){n=a},this.setIndex=function(a){i=a.type,r=a.bytesPerElement},this.render=function(a,o){s.drawElements(n,o,i,a*r),t.update(o,n,1)},this.renderInstances=function(a,o,l){l!==0&&(s.drawElementsInstanced(n,o,i,a*r,l),t.update(o,n,l))},this.renderMultiDraw=function(a,o,l){if(l===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,o,0,i,a,0,l);let c=0;for(let h=0;h<l;h++)c+=o[h];t.update(c,n,1)}}function Sg(s){let e={frame:0,calls:0,triangles:0,points:0,lines:0};return{memory:{geometries:0,textures:0},render:e,programs:null,autoReset:!0,reset:function(){e.calls=0,e.triangles=0,e.points=0,e.lines=0},update:function(t,n,i){switch(e.calls++,n){case s.TRIANGLES:e.triangles+=i*(t/3);break;case s.LINES:e.lines+=i*(t/2);break;case s.LINE_STRIP:e.lines+=i*(t-1);break;case s.LINE_LOOP:e.lines+=i*t;break;case s.POINTS:e.points+=i*t;break;default:Ie("WebGLInfo: Unknown draw mode:",n)}}}}function Tg(s,e,t){let n=new WeakMap,i=new We;return{update:function(r,a,o){let l=r.morphTargetInfluences,c=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,h=c!==void 0?c.length:0,u=n.get(a);if(u===void 0||u.count!==h){let F=function(){x.dispose(),n.delete(a),a.removeEventListener("dispose",F)};u!==void 0&&u.texture.dispose();let d=a.morphAttributes.position!==void 0,p=a.morphAttributes.normal!==void 0,m=a.morphAttributes.color!==void 0,f=a.morphAttributes.position||[],_=a.morphAttributes.normal||[],g=a.morphAttributes.color||[],v=0;d===!0&&(v=1),p===!0&&(v=2),m===!0&&(v=3);let b=a.attributes.position.count*v,y=1;b>e.maxTextureSize&&(y=Math.ceil(b/e.maxTextureSize),b=e.maxTextureSize);let S=new Float32Array(b*y*4*h),x=new Rs(S,b,y,h);x.type=dn,x.needsUpdate=!0;let A=4*v;for(let L=0;L<h;L++){let P=f[L],O=_[L],B=g[L],j=b*y*4*L;for(let H=0;H<P.count;H++){let W=H*A;d===!0&&(i.fromBufferAttribute(P,H),S[j+W+0]=i.x,S[j+W+1]=i.y,S[j+W+2]=i.z,S[j+W+3]=0),p===!0&&(i.fromBufferAttribute(O,H),S[j+W+4]=i.x,S[j+W+5]=i.y,S[j+W+6]=i.z,S[j+W+7]=0),m===!0&&(i.fromBufferAttribute(B,H),S[j+W+8]=i.x,S[j+W+9]=i.y,S[j+W+10]=i.z,S[j+W+11]=B.itemSize===4?i.w:1)}}u={count:h,texture:x,size:new ne(b,y)},n.set(a,u),a.addEventListener("dispose",F)}if(r.isInstancedMesh===!0&&r.morphTexture!==null)o.getUniforms().setValue(s,"morphTexture",r.morphTexture,t);else{let d=0;for(let m=0;m<l.length;m++)d+=l[m];let p=a.morphTargetsRelative?1:1-d;o.getUniforms().setValue(s,"morphTargetBaseInfluence",p),o.getUniforms().setValue(s,"morphTargetInfluences",l)}o.getUniforms().setValue(s,"morphTargetsTexture",u.texture,t),o.getUniforms().setValue(s,"morphTargetsTextureSize",u.size)}}}function wg(s,e,t,n,i){let r=new WeakMap;function a(o){let l=o.target;l.removeEventListener("dispose",a),n.releaseStatesOfObject(l),t.remove(l.instanceMatrix),l.instanceColor!==null&&t.remove(l.instanceColor)}return{update:function(o){let l=i.render.frame,c=o.geometry,h=e.get(o,c);if(r.get(h)!==l&&(e.update(h),r.set(h,l)),o.isInstancedMesh&&(o.hasEventListener("dispose",a)===!1&&o.addEventListener("dispose",a),r.get(o)!==l&&(t.update(o.instanceMatrix,s.ARRAY_BUFFER),o.instanceColor!==null&&t.update(o.instanceColor,s.ARRAY_BUFFER),r.set(o,l))),o.isSkinnedMesh){let u=o.skeleton;r.get(u)!==l&&(u.update(),r.set(u,l))}return h},dispose:function(){r=new WeakMap}}}var Ag={[Wc]:"LINEAR_TONE_MAPPING",[qc]:"REINHARD_TONE_MAPPING",[Xc]:"CINEON_TONE_MAPPING",[oa]:"ACES_FILMIC_TONE_MAPPING",[Yc]:"AGX_TONE_MAPPING",[Jc]:"NEUTRAL_TONE_MAPPING",[Kc]:"CUSTOM_TONE_MAPPING"};function Eg(s,e,t,n,i,r){let a=new an(e,t,{type:s,depthBuffer:i,stencilBuffer:r,samples:n?4:0,depthTexture:i?new wi(e,t):void 0}),o=new an(e,t,{type:ti,depthBuffer:!1,stencilBuffer:!1}),l=new De;l.setAttribute("position",new ve([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new ve([0,2,0,0,2,0],2));let c=new Do({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),h=new et(l,c),u=new Hi(-1,1,1,-1,0,1),d,p=null,m=null,f=!1,_=null,g=[],v=!1;this.setSize=function(b,y){a.setSize(b,y),o.setSize(b,y);for(let S=0;S<g.length;S++){let x=g[S];x.setSize&&x.setSize(b,y)}},this.setEffects=function(b){g=b,v=g.length>0&&g[0].isRenderPass===!0;let y=a.width,S=a.height;for(let x=0;x<g.length;x++){let A=g[x];A.setSize&&A.setSize(y,S)}},this.begin=function(b,y){if(f||b.toneMapping===zn&&g.length===0)return!1;if(_=y,y!==null){let S=y.width,x=y.height;a.width===S&&a.height===x||this.setSize(S,x)}return v===!1&&b.setRenderTarget(a),d=b.toneMapping,b.toneMapping=zn,!0},this.hasRenderPass=function(){return v},this.end=function(b,y){b.toneMapping=d,f=!0;let S=a,x=o;for(let A=0;A<g.length;A++){let F=g[A];if(F.enabled!==!1&&(F.render(b,x,S,y),F.needsSwap!==!1)){let L=S;S=x,x=L}}if(p!==b.outputColorSpace||m!==b.toneMapping){p=b.outputColorSpace,m=b.toneMapping,c.defines={},Ce.getTransfer(p)===nt&&(c.defines.SRGB_TRANSFER="");let A=Ag[m];A&&(c.defines[A]=""),c.needsUpdate=!0}c.uniforms.tDiffuse.value=S.texture,b.setRenderTarget(_),b.render(h,u),_=null,f=!1},this.isCompositing=function(){return f},this.dispose=function(){a.depthTexture&&a.depthTexture.dispose(),a.dispose(),o.dispose(),l.dispose(),c.dispose()}}var Ef=new At,Xh=new wi(1,1),Rf=new Rs,Cf=new ro,Pf=new Os,lf=[],cf=[],hf=new Float32Array(16),uf=new Float32Array(9),df=new Float32Array(4);function ls(s,e,t){let n=s[0];if(n<=0||n>0)return s;let i=e*t,r=lf[i];if(r===void 0&&(r=new Float32Array(i),lf[i]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,s[a].toArray(r,o)}return r}function It(s,e){if(s.length!==e.length)return!1;for(let t=0,n=s.length;t<n;t++)if(s[t]!==e[t])return!1;return!0}function Lt(s,e){for(let t=0,n=e.length;t<n;t++)s[t]=e[t]}function ml(s,e){let t=cf[e];t===void 0&&(t=new Int32Array(e),cf[e]=t);for(let n=0;n!==e;++n)t[n]=s.allocateTextureUnit();return t}function Rg(s,e){let t=this.cache;t[0]!==e&&(s.uniform1f(this.addr,e),t[0]=e)}function Cg(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y||(s.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(It(t,e))return;s.uniform2fv(this.addr,e),Lt(t,e)}}function Pg(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z||(s.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)t[0]===e.r&&t[1]===e.g&&t[2]===e.b||(s.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(It(t,e))return;s.uniform3fv(this.addr,e),Lt(t,e)}}function Ig(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z&&t[3]===e.w||(s.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(It(t,e))return;s.uniform4fv(this.addr,e),Lt(t,e)}}function Lg(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(It(t,e))return;s.uniformMatrix2fv(this.addr,!1,e),Lt(t,e)}else{if(It(t,n))return;df.set(n),s.uniformMatrix2fv(this.addr,!1,df),Lt(t,n)}}function Dg(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(It(t,e))return;s.uniformMatrix3fv(this.addr,!1,e),Lt(t,e)}else{if(It(t,n))return;uf.set(n),s.uniformMatrix3fv(this.addr,!1,uf),Lt(t,n)}}function Fg(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(It(t,e))return;s.uniformMatrix4fv(this.addr,!1,e),Lt(t,e)}else{if(It(t,n))return;hf.set(n),s.uniformMatrix4fv(this.addr,!1,hf),Lt(t,n)}}function Ng(s,e){let t=this.cache;t[0]!==e&&(s.uniform1i(this.addr,e),t[0]=e)}function Ug(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y||(s.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(It(t,e))return;s.uniform2iv(this.addr,e),Lt(t,e)}}function Og(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z||(s.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(It(t,e))return;s.uniform3iv(this.addr,e),Lt(t,e)}}function Bg(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z&&t[3]===e.w||(s.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(It(t,e))return;s.uniform4iv(this.addr,e),Lt(t,e)}}function kg(s,e){let t=this.cache;t[0]!==e&&(s.uniform1ui(this.addr,e),t[0]=e)}function zg(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y||(s.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(It(t,e))return;s.uniform2uiv(this.addr,e),Lt(t,e)}}function Gg(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z||(s.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(It(t,e))return;s.uniform3uiv(this.addr,e),Lt(t,e)}}function Vg(s,e){let t=this.cache;if(e.x!==void 0)t[0]===e.x&&t[1]===e.y&&t[2]===e.z&&t[3]===e.w||(s.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(It(t,e))return;s.uniform4uiv(this.addr,e),Lt(t,e)}}function Hg(s,e,t){let n=this.cache,i=t.allocateTextureUnit(),r;n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),this.type===s.SAMPLER_2D_SHADOW?(Xh.compareFunction=t.isReversedDepthBuffer()?ol:al,r=Xh):r=Ef,t.setTexture2D(e||r,i)}function jg(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture3D(e||Cf,i)}function Wg(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTextureCube(e||Pf,i)}function qg(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture2DArray(e||Rf,i)}function Xg(s,e){s.uniform1fv(this.addr,e)}function Kg(s,e){let t=ls(e,this.size,2);s.uniform2fv(this.addr,t)}function Yg(s,e){let t=ls(e,this.size,3);s.uniform3fv(this.addr,t)}function Jg(s,e){let t=ls(e,this.size,4);s.uniform4fv(this.addr,t)}function Zg(s,e){let t=ls(e,this.size,4);s.uniformMatrix2fv(this.addr,!1,t)}function Qg(s,e){let t=ls(e,this.size,9);s.uniformMatrix3fv(this.addr,!1,t)}function $g(s,e){let t=ls(e,this.size,16);s.uniformMatrix4fv(this.addr,!1,t)}function e0(s,e){s.uniform1iv(this.addr,e)}function t0(s,e){s.uniform2iv(this.addr,e)}function n0(s,e){s.uniform3iv(this.addr,e)}function i0(s,e){s.uniform4iv(this.addr,e)}function r0(s,e){s.uniform1uiv(this.addr,e)}function s0(s,e){s.uniform2uiv(this.addr,e)}function a0(s,e){s.uniform3uiv(this.addr,e)}function o0(s,e){s.uniform4uiv(this.addr,e)}function l0(s,e,t){let n=this.cache,i=e.length,r=ml(t,i),a;It(n,r)||(s.uniform1iv(this.addr,r),Lt(n,r)),a=this.type===s.SAMPLER_2D_SHADOW?Xh:Ef;for(let o=0;o!==i;++o)t.setTexture2D(e[o]||a,r[o])}function c0(s,e,t){let n=this.cache,i=e.length,r=ml(t,i);It(n,r)||(s.uniform1iv(this.addr,r),Lt(n,r));for(let a=0;a!==i;++a)t.setTexture3D(e[a]||Cf,r[a])}function h0(s,e,t){let n=this.cache,i=e.length,r=ml(t,i);It(n,r)||(s.uniform1iv(this.addr,r),Lt(n,r));for(let a=0;a!==i;++a)t.setTextureCube(e[a]||Pf,r[a])}function u0(s,e,t){let n=this.cache,i=e.length,r=ml(t,i);It(n,r)||(s.uniform1iv(this.addr,r),Lt(n,r));for(let a=0;a!==i;++a)t.setTexture2DArray(e[a]||Rf,r[a])}var Kh=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=(function(i){switch(i){case 5126:return Rg;case 35664:return Cg;case 35665:return Pg;case 35666:return Ig;case 35674:return Lg;case 35675:return Dg;case 35676:return Fg;case 5124:case 35670:return Ng;case 35667:case 35671:return Ug;case 35668:case 35672:return Og;case 35669:case 35673:return Bg;case 5125:return kg;case 36294:return zg;case 36295:return Gg;case 36296:return Vg;case 35678:case 36198:case 36298:case 36306:case 35682:return Hg;case 35679:case 36299:case 36307:return jg;case 35680:case 36300:case 36308:case 36293:return Wg;case 36289:case 36303:case 36311:case 36292:return qg}})(t.type)}},Yh=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=(function(i){switch(i){case 5126:return Xg;case 35664:return Kg;case 35665:return Yg;case 35666:return Jg;case 35674:return Zg;case 35675:return Qg;case 35676:return $g;case 5124:case 35670:return e0;case 35667:case 35671:return t0;case 35668:case 35672:return n0;case 35669:case 35673:return i0;case 5125:return r0;case 36294:return s0;case 36295:return a0;case 36296:return o0;case 35678:case 36198:case 36298:case 36306:case 35682:return l0;case 35679:case 36299:case 36307:return c0;case 35680:case 36300:case 36308:case 36293:return h0;case 36289:case 36303:case 36311:case 36292:return u0}})(t.type)}},Jh=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let i=this.seq;for(let r=0,a=i.length;r!==a;++r){let o=i[r];o.setValue(e,t[o.id],n)}}},Wh=/(\w+)(\])?(\[|\.)?/g;function pf(s,e){s.seq.push(e),s.map[e.id]=e}function d0(s,e,t){let n=s.name,i=n.length;for(Wh.lastIndex=0;;){let r=Wh.exec(n),a=Wh.lastIndex,o=r[1],l=r[2]==="]",c=r[3];if(l&&(o|=0),c===void 0||c==="["&&a+2===i){pf(t,c===void 0?new Kh(o,s,e):new Yh(o,s,e));break}{let h=t.map[o];h===void 0&&(h=new Jh(o),pf(t,h)),t=h}}}var os=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){let o=e.getActiveUniform(t,a);d0(o,e.getUniformLocation(t,o.name),this)}let i=[],r=[];for(let a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?i.push(a):r.push(a);i.length>0&&(this.seq=i.concat(r))}setValue(e,t,n,i){let r=this.map[t];r!==void 0&&r.setValue(e,n,i)}setOptional(e,t,n){let i=t[n];i!==void 0&&this.setValue(e,n,i)}static upload(e,t,n,i){for(let r=0,a=t.length;r!==a;++r){let o=t[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,i)}}static seqWithValue(e,t){let n=[];for(let i=0,r=e.length;i!==r;++i){let a=e[i];a.id in t&&n.push(a)}return n}};function ff(s,e,t){let n=s.createShader(e);return s.shaderSource(n,t),s.compileShader(n),n}var p0=0,mf=new Fe;function gf(s,e,t){let n=s.getShaderParameter(e,s.COMPILE_STATUS),i=(s.getShaderInfoLog(e)||"").trim();if(n&&i==="")return"";let r=/ERROR: 0:(\d+)/.exec(i);if(r){let a=parseInt(r[1]);return t.toUpperCase()+`

`+i+`

`+(function(o,l){let c=o.split(`
`),h=[],u=Math.max(l-6,0),d=Math.min(l+6,c.length);for(let p=u;p<d;p++){let m=p+1;h.push(`${m===l?">":" "} ${m}: ${c[p]}`)}return h.join(`
`)})(s.getShaderSource(e),a)}return i}function f0(s,e){let t=(function(n){Ce._getMatrix(mf,Ce.workingColorSpace,n);let i=`mat3( ${mf.elements.map(r=>r.toFixed(4))} )`;switch(Ce.getTransfer(n)){case As:return[i,"LinearTransferOETF"];case nt:return[i,"sRGBTransferOETF"];default:return Ae("WebGLProgram: Unsupported color space: ",n),[i,"LinearTransferOETF"]}})(e);return[`vec4 ${s}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}var m0={[Wc]:"Linear",[qc]:"Reinhard",[Xc]:"Cineon",[oa]:"ACESFilmic",[Yc]:"AgX",[Jc]:"Neutral",[Kc]:"Custom"};function g0(s,e){let t=m0[e];return t===void 0?(Ae("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+s+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+s+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}var hl=new C;function v0(){return Ce.getLuminanceCoefficients(hl),["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${hl.x.toFixed(4)}, ${hl.y.toFixed(4)}, ${hl.z.toFixed(4)} );`,"	return dot( weights, rgb );","}"].join(`
`)}function da(s){return s!==""}function vf(s,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function bf(s,e){return s.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var b0=/^[ \t]*#include +<([\w\d./]+)>/gm;function Zh(s){return s.replace(b0,y0)}var _0=new Map;function y0(s,e){let t=Ve[e];if(t===void 0){let n=_0.get(e);if(n===void 0)throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">");t=Ve[n],Ae('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n)}return Zh(t)}var x0=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function _f(s){return s.replace(x0,M0)}function M0(s,e,t,n){let i="";for(let r=parseInt(e);r<parseInt(t);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function yf(s){let e=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?e+=`
#define HIGH_PRECISION`:s.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}var S0={[sa]:"SHADOWMAP_TYPE_PCF",[Qr]:"SHADOWMAP_TYPE_VSM"},T0={[es]:"ENVMAP_TYPE_CUBE",[fr]:"ENVMAP_TYPE_CUBE",[la]:"ENVMAP_TYPE_CUBE_UV"},w0={[fr]:"ENVMAP_MODE_REFRACTION"},A0={[Lp]:"ENVMAP_BLENDING_MULTIPLY",[Dp]:"ENVMAP_BLENDING_MIX",[Fp]:"ENVMAP_BLENDING_ADD"};function E0(s,e,t,n){let i=s.getContext(),r=t.defines,a=t.vertexShader,o=t.fragmentShader,l=(function(O){return S0[O.shadowMapType]||"SHADOWMAP_TYPE_BASIC"})(t),c=(function(O){return O.envMap===!1?"ENVMAP_TYPE_CUBE":T0[O.envMapMode]||"ENVMAP_TYPE_CUBE"})(t),h=(function(O){return O.envMap===!1?"ENVMAP_MODE_REFLECTION":w0[O.envMapMode]||"ENVMAP_MODE_REFLECTION"})(t),u=(function(O){return O.envMap===!1?"ENVMAP_BLENDING_NONE":A0[O.combine]||"ENVMAP_BLENDING_NONE"})(t),d=(function(O){let B=O.envMapCubeUVHeight;if(B===null)return null;let j=Math.log2(B)-2,H=1/B;return{texelWidth:1/(3*Math.max(Math.pow(2,j),112)),texelHeight:H,maxMip:j}})(t),p=(function(O){return[O.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",O.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(da).join(`
`)})(t),m=(function(O){let B=[];for(let j in O){let H=O[j];H!==!1&&B.push("#define "+j+" "+H)}return B.join(`
`)})(r),f=i.createProgram(),_,g,v=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(_=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(da).join(`
`),_.length>0&&(_+=`
`),g=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(da).join(`
`),g.length>0&&(g+=`
`)):(_=[yf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(da).join(`
`),g=[yf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==zn?"#define TONE_MAPPING":"",t.toneMapping!==zn?Ve.tonemapping_pars_fragment:"",t.toneMapping!==zn?g0("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ve.colorspace_pars_fragment,f0("linearToOutputTexel",t.outputColorSpace),v0(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(da).join(`
`)),a=Zh(a),a=vf(a,t),a=bf(a,t),o=Zh(o),o=vf(o,t),o=bf(o,t),a=_f(a),o=_f(o),t.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,_=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+_,g=["#define varying in",t.glslVersion===Uh?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Uh?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+g);let b=v+_+a,y=v+g+o,S=ff(i,i.VERTEX_SHADER,b),x=ff(i,i.FRAGMENT_SHADER,y);function A(O){if(s.debug.checkShaderErrors){let B=i.getProgramInfoLog(f)||"",j=i.getShaderInfoLog(S)||"",H=i.getShaderInfoLog(x)||"",W=B.trim(),Y=j.trim(),K=H.trim(),ee=!0,ue=!0;if(i.getProgramParameter(f,i.LINK_STATUS)===!1)if(ee=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,f,S,x);else{let Se=gf(i,S,"vertex"),me=gf(i,x,"fragment");Ie("WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(f,i.VALIDATE_STATUS)+`

Material Name: `+O.name+`
Material Type: `+O.type+`

Program Info Log: `+W+`
`+Se+`
`+me)}else W!==""?Ae("WebGLProgram: Program Info Log:",W):Y!==""&&K!==""||(ue=!1);ue&&(O.diagnostics={runnable:ee,programLog:W,vertexShader:{log:Y,prefix:_},fragmentShader:{log:K,prefix:g}})}i.deleteShader(S),i.deleteShader(x),F=new os(i,f),L=(function(B,j){let H={},W=B.getProgramParameter(j,B.ACTIVE_ATTRIBUTES);for(let Y=0;Y<W;Y++){let K=B.getActiveAttrib(j,Y),ee=K.name,ue=1;K.type===B.FLOAT_MAT2&&(ue=2),K.type===B.FLOAT_MAT3&&(ue=3),K.type===B.FLOAT_MAT4&&(ue=4),H[ee]={type:K.type,location:B.getAttribLocation(j,ee),locationSize:ue}}return H})(i,f)}let F,L;i.attachShader(f,S),i.attachShader(f,x),t.index0AttributeName!==void 0?i.bindAttribLocation(f,0,t.index0AttributeName):t.hasPositionAttribute===!0&&i.bindAttribLocation(f,0,"position"),i.linkProgram(f),this.getUniforms=function(){return F===void 0&&A(this),F},this.getAttributes=function(){return L===void 0&&A(this),L};let P=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return P===!1&&(P=i.getProgramParameter(f,37297)),P},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(f),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=p0++,this.cacheKey=e,this.usedTimes=1,this.program=f,this.vertexShader=S,this.fragmentShader=x,this}var R0=0,Qh=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let i=this._getShaderCacheForMaterial(e);return i.has(t)===!1&&(i.add(t),t.usedTimes++),i.has(n)===!1&&(i.add(n),n.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new $h(e),t.set(e,n)),n}},$h=class{constructor(e){this.id=R0++,this.code=e,this.usedTimes=0}};function C0(s,e,t,n,i,r){let a=new Cs,o=new Qh,l=new Set,c=[],h=new Map,u=n.logarithmicDepthBuffer,d=n.precision,p={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(f){return l.add(f),f===0?"uv":`uv${f}`}return{getParameters:function(f,_,g,v,b,y){let S=v.fog,x=b.geometry,A=f.isMeshStandardMaterial||f.isMeshLambertMaterial||f.isMeshPhongMaterial?v.environment:null,F=f.isMeshStandardMaterial||f.isMeshLambertMaterial&&!f.envMap||f.isMeshPhongMaterial&&!f.envMap,L=e.get(f.envMap||A,F),P=L&&L.mapping===la?L.image.height:null,O=p[f.type];f.precision!==null&&(d=n.getMaxPrecision(f.precision),d!==f.precision&&Ae("WebGLProgram.getParameters:",f.precision,"not supported, using",d,"instead."));let B=x.morphAttributes.position||x.morphAttributes.normal||x.morphAttributes.color,j=B!==void 0?B.length:0,H,W,Y,K,ee=0;if(x.morphAttributes.position!==void 0&&(ee=1),x.morphAttributes.normal!==void 0&&(ee=2),x.morphAttributes.color!==void 0&&(ee=3),O){let En=ii[O];H=En.vertexShader,W=En.fragmentShader}else{H=f.vertexShader,W=f.fragmentShader;let En=o.getVertexShaderStage(f),Ki=o.getFragmentShaderStage(f);o.update(f,En,Ki),Y=En.id,K=Ki.id}let ue=s.getRenderTarget(),Se=s.state.buffers.depth.getReversed(),me=b.isInstancedMesh===!0,xe=b.isBatchedMesh===!0,te=!!f.map,pe=!!f.matcap,oe=!!L,V=!!f.aoMap,G=!!f.lightMap,k=!!f.bumpMap&&f.wireframe===!1,E=!!f.normalMap,T=!!f.displacementMap,w=!!f.emissiveMap,N=!!f.metalnessMap,M=!!f.roughnessMap,D=f.anisotropy>0,U=f.clearcoat>0,R=f.dispersion>0,z=f.iridescence>0,J=f.sheen>0,Z=f.transmission>0,ae=D&&!!f.anisotropyMap,be=U&&!!f.clearcoatMap,ce=U&&!!f.clearcoatNormalMap,se=U&&!!f.clearcoatRoughnessMap,Te=z&&!!f.iridescenceMap,ie=z&&!!f.iridescenceThicknessMap,he=J&&!!f.sheenColorMap,le=J&&!!f.sheenRoughnessMap,ye=!!f.specularMap,Ge=!!f.specularColorMap,Ye=!!f.specularIntensityMap,ht=Z&&!!f.transmissionMap,Kt=Z&&!!f.thicknessMap,Re=!!f.gradientMap,it=!!f.alphaMap,He=f.alphaTest>0,Ot=!!f.alphaHash,lt=!!f.extensions,Et=zn;f.toneMapped&&(ue!==null&&ue.isXRRenderTarget!==!0||(Et=s.toneMapping));let gt={shaderID:O,shaderType:f.type,shaderName:f.name,vertexShader:H,fragmentShader:W,defines:f.defines,customVertexShaderID:Y,customFragmentShaderID:K,isRawShaderMaterial:f.isRawShaderMaterial===!0,glslVersion:f.glslVersion,precision:d,batching:xe,batchingColor:xe&&b._colorsTexture!==null,instancing:me,instancingColor:me&&b.instanceColor!==null,instancingMorph:me&&b.morphTexture!==null,outputColorSpace:ue===null?s.outputColorSpace:ue.isXRRenderTarget===!0?ue.texture.colorSpace:Ce.workingColorSpace,alphaToCoverage:!!f.alphaToCoverage,map:te,matcap:pe,envMap:oe,envMapMode:oe&&L.mapping,envMapCubeUVHeight:P,aoMap:V,lightMap:G,bumpMap:k,normalMap:E,displacementMap:T,emissiveMap:w,normalMapObjectSpace:E&&f.normalMapType===zp,normalMapTangentSpace:E&&f.normalMapType===Nh,packedNormalMap:E&&f.normalMapType===Nh&&(fn=f.normalMap.format,fn===vr||fn===rl||fn===sl),metalnessMap:N,roughnessMap:M,anisotropy:D,anisotropyMap:ae,clearcoat:U,clearcoatMap:be,clearcoatNormalMap:ce,clearcoatRoughnessMap:se,dispersion:R,iridescence:z,iridescenceMap:Te,iridescenceThicknessMap:ie,sheen:J,sheenColorMap:he,sheenRoughnessMap:le,specularMap:ye,specularColorMap:Ge,specularIntensityMap:Ye,transmission:Z,transmissionMap:ht,thicknessMap:Kt,gradientMap:Re,opaque:f.transparent===!1&&f.blending===aa&&f.alphaToCoverage===!1,alphaMap:it,alphaTest:He,alphaHash:Ot,combine:f.combine,mapUv:te&&m(f.map.channel),aoMapUv:V&&m(f.aoMap.channel),lightMapUv:G&&m(f.lightMap.channel),bumpMapUv:k&&m(f.bumpMap.channel),normalMapUv:E&&m(f.normalMap.channel),displacementMapUv:T&&m(f.displacementMap.channel),emissiveMapUv:w&&m(f.emissiveMap.channel),metalnessMapUv:N&&m(f.metalnessMap.channel),roughnessMapUv:M&&m(f.roughnessMap.channel),anisotropyMapUv:ae&&m(f.anisotropyMap.channel),clearcoatMapUv:be&&m(f.clearcoatMap.channel),clearcoatNormalMapUv:ce&&m(f.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:se&&m(f.clearcoatRoughnessMap.channel),iridescenceMapUv:Te&&m(f.iridescenceMap.channel),iridescenceThicknessMapUv:ie&&m(f.iridescenceThicknessMap.channel),sheenColorMapUv:he&&m(f.sheenColorMap.channel),sheenRoughnessMapUv:le&&m(f.sheenRoughnessMap.channel),specularMapUv:ye&&m(f.specularMap.channel),specularColorMapUv:Ge&&m(f.specularColorMap.channel),specularIntensityMapUv:Ye&&m(f.specularIntensityMap.channel),transmissionMapUv:ht&&m(f.transmissionMap.channel),thicknessMapUv:Kt&&m(f.thicknessMap.channel),alphaMapUv:it&&m(f.alphaMap.channel),vertexTangents:!!x.attributes.tangent&&(E||D),vertexNormals:!!x.attributes.normal,vertexColors:f.vertexColors,vertexAlphas:f.vertexColors===!0&&!!x.attributes.color&&x.attributes.color.itemSize===4,pointsUvs:b.isPoints===!0&&!!x.attributes.uv&&(te||it),fog:!!S,useFog:f.fog===!0,fogExp2:!!S&&S.isFogExp2,flatShading:f.wireframe===!1&&(f.flatShading===!0||x.attributes.normal===void 0&&E===!1&&(f.isMeshLambertMaterial||f.isMeshPhongMaterial||f.isMeshStandardMaterial||f.isMeshPhysicalMaterial)),sizeAttenuation:f.sizeAttenuation===!0,logarithmicDepthBuffer:u,reversedDepthBuffer:Se,skinning:b.isSkinnedMesh===!0,hasPositionAttribute:x.attributes.position!==void 0,morphTargets:x.morphAttributes.position!==void 0,morphNormals:x.morphAttributes.normal!==void 0,morphColors:x.morphAttributes.color!==void 0,morphTargetsCount:j,morphTextureStride:ee,numDirLights:_.directional.length,numPointLights:_.point.length,numSpotLights:_.spot.length,numSpotLightMaps:_.spotLightMap.length,numRectAreaLights:_.rectArea.length,numHemiLights:_.hemi.length,numDirLightShadows:_.directionalShadowMap.length,numPointLightShadows:_.pointShadowMap.length,numSpotLightShadows:_.spotShadowMap.length,numSpotLightShadowsWithMaps:_.numSpotLightShadowsWithMaps,numLightProbes:_.numLightProbes,numLightProbeGrids:y.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:f.dithering,shadowMapEnabled:s.shadowMap.enabled&&g.length>0,shadowMapType:s.shadowMap.type,toneMapping:Et,decodeVideoTexture:te&&f.map.isVideoTexture===!0&&Ce.getTransfer(f.map.colorSpace)===nt,decodeVideoTextureEmissive:w&&f.emissiveMap.isVideoTexture===!0&&Ce.getTransfer(f.emissiveMap.colorSpace)===nt,premultipliedAlpha:f.premultipliedAlpha,doubleSided:f.side===Sn,flipSided:f.side===en,useDepthPacking:f.depthPacking>=0,depthPacking:f.depthPacking||0,index0AttributeName:f.index0AttributeName,extensionClipCullDistance:lt&&f.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(lt&&f.extensions.multiDraw===!0||xe)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:f.customProgramCacheKey()};var fn;return gt.vertexUv1s=l.has(1),gt.vertexUv2s=l.has(2),gt.vertexUv3s=l.has(3),l.clear(),gt},getProgramCacheKey:function(f){let _=[];if(f.shaderID?_.push(f.shaderID):(_.push(f.customVertexShaderID),_.push(f.customFragmentShaderID)),f.defines!==void 0)for(let g in f.defines)_.push(g),_.push(f.defines[g]);return f.isRawShaderMaterial===!1&&((function(g,v){g.push(v.precision),g.push(v.outputColorSpace),g.push(v.envMapMode),g.push(v.envMapCubeUVHeight),g.push(v.mapUv),g.push(v.alphaMapUv),g.push(v.lightMapUv),g.push(v.aoMapUv),g.push(v.bumpMapUv),g.push(v.normalMapUv),g.push(v.displacementMapUv),g.push(v.emissiveMapUv),g.push(v.metalnessMapUv),g.push(v.roughnessMapUv),g.push(v.anisotropyMapUv),g.push(v.clearcoatMapUv),g.push(v.clearcoatNormalMapUv),g.push(v.clearcoatRoughnessMapUv),g.push(v.iridescenceMapUv),g.push(v.iridescenceThicknessMapUv),g.push(v.sheenColorMapUv),g.push(v.sheenRoughnessMapUv),g.push(v.specularMapUv),g.push(v.specularColorMapUv),g.push(v.specularIntensityMapUv),g.push(v.transmissionMapUv),g.push(v.thicknessMapUv),g.push(v.combine),g.push(v.fogExp2),g.push(v.sizeAttenuation),g.push(v.morphTargetsCount),g.push(v.morphAttributeCount),g.push(v.numDirLights),g.push(v.numPointLights),g.push(v.numSpotLights),g.push(v.numSpotLightMaps),g.push(v.numHemiLights),g.push(v.numRectAreaLights),g.push(v.numDirLightShadows),g.push(v.numPointLightShadows),g.push(v.numSpotLightShadows),g.push(v.numSpotLightShadowsWithMaps),g.push(v.numLightProbes),g.push(v.shadowMapType),g.push(v.toneMapping),g.push(v.numClippingPlanes),g.push(v.numClipIntersection),g.push(v.depthPacking)})(_,f),(function(g,v){a.disableAll(),v.instancing&&a.enable(0),v.instancingColor&&a.enable(1),v.instancingMorph&&a.enable(2),v.matcap&&a.enable(3),v.envMap&&a.enable(4),v.normalMapObjectSpace&&a.enable(5),v.normalMapTangentSpace&&a.enable(6),v.clearcoat&&a.enable(7),v.iridescence&&a.enable(8),v.alphaTest&&a.enable(9),v.vertexColors&&a.enable(10),v.vertexAlphas&&a.enable(11),v.vertexUv1s&&a.enable(12),v.vertexUv2s&&a.enable(13),v.vertexUv3s&&a.enable(14),v.vertexTangents&&a.enable(15),v.anisotropy&&a.enable(16),v.alphaHash&&a.enable(17),v.batching&&a.enable(18),v.dispersion&&a.enable(19),v.batchingColor&&a.enable(20),v.gradientMap&&a.enable(21),v.packedNormalMap&&a.enable(22),v.vertexNormals&&a.enable(23),g.push(a.mask),a.disableAll(),v.fog&&a.enable(0),v.useFog&&a.enable(1),v.flatShading&&a.enable(2),v.logarithmicDepthBuffer&&a.enable(3),v.reversedDepthBuffer&&a.enable(4),v.skinning&&a.enable(5),v.morphTargets&&a.enable(6),v.morphNormals&&a.enable(7),v.morphColors&&a.enable(8),v.premultipliedAlpha&&a.enable(9),v.shadowMapEnabled&&a.enable(10),v.doubleSided&&a.enable(11),v.flipSided&&a.enable(12),v.useDepthPacking&&a.enable(13),v.dithering&&a.enable(14),v.transmission&&a.enable(15),v.sheen&&a.enable(16),v.opaque&&a.enable(17),v.pointsUvs&&a.enable(18),v.decodeVideoTexture&&a.enable(19),v.decodeVideoTextureEmissive&&a.enable(20),v.alphaToCoverage&&a.enable(21),v.numLightProbeGrids>0&&a.enable(22),v.hasPositionAttribute&&a.enable(23),g.push(a.mask)})(_,f),_.push(s.outputColorSpace)),_.push(f.customProgramCacheKey),_.join()},getUniforms:function(f){let _=p[f.type],g;if(_){let v=ii[_];g=tf.clone(v.uniforms)}else g=f.uniforms;return g},acquireProgram:function(f,_){let g=h.get(_);return g!==void 0?++g.usedTimes:(g=new E0(s,_,f,i),c.push(g),h.set(_,g)),g},releaseProgram:function(f){if(--f.usedTimes===0){let _=c.indexOf(f);c[_]=c[c.length-1],c.pop(),h.delete(f.cacheKey),f.destroy()}},releaseShaderCache:function(f){o.remove(f)},programs:c,dispose:function(){o.dispose()}}}function P0(){let s=new WeakMap;return{has:function(e){return s.has(e)},get:function(e){let t=s.get(e);return t===void 0&&(t={},s.set(e,t)),t},remove:function(e){s.delete(e)},update:function(e,t,n){s.get(e)[t]=n},dispose:function(){s=new WeakMap}}}function I0(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.material.id!==e.material.id?s.material.id-e.material.id:s.materialVariant!==e.materialVariant?s.materialVariant-e.materialVariant:s.z!==e.z?s.z-e.z:s.id-e.id}function xf(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.z!==e.z?e.z-s.z:s.id-e.id}function Mf(){let s=[],e=0,t=[],n=[],i=[];function r(o){let l=0;return o.isInstancedMesh&&(l+=2),o.isSkinnedMesh&&(l+=1),l}function a(o,l,c,h,u,d){let p=s[e];return p===void 0?(p={id:o.id,object:o,geometry:l,material:c,materialVariant:r(o),groupOrder:h,renderOrder:o.renderOrder,z:u,group:d},s[e]=p):(p.id=o.id,p.object=o,p.geometry=l,p.material=c,p.materialVariant=r(o),p.groupOrder=h,p.renderOrder=o.renderOrder,p.z=u,p.group=d),e++,p}return{opaque:t,transmissive:n,transparent:i,init:function(){e=0,t.length=0,n.length=0,i.length=0},push:function(o,l,c,h,u,d){let p=a(o,l,c,h,u,d);c.transmission>0?n.push(p):c.transparent===!0?i.push(p):t.push(p)},unshift:function(o,l,c,h,u,d){let p=a(o,l,c,h,u,d);c.transmission>0?n.unshift(p):c.transparent===!0?i.unshift(p):t.unshift(p)},finish:function(){for(let o=e,l=s.length;o<l;o++){let c=s[o];if(c.id===null)break;c.id=null,c.object=null,c.geometry=null,c.material=null,c.group=null}},sort:function(o,l,c){t.length>1&&t.sort(o||I0),n.length>1&&n.sort(l||xf),i.length>1&&i.sort(l||xf),c&&(t.reverse(),n.reverse(),i.reverse())}}}function L0(){let s=new WeakMap;return{get:function(e,t){let n=s.get(e),i;return n===void 0?(i=new Mf,s.set(e,[i])):t>=n.length?(i=new Mf,n.push(i)):i=n[t],i},dispose:function(){s=new WeakMap}}}function D0(){let s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new C,color:new de};break;case"SpotLight":t={position:new C,direction:new C,color:new de,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new C,color:new de,distance:0,decay:0};break;case"HemisphereLight":t={direction:new C,skyColor:new de,groundColor:new de};break;case"RectAreaLight":t={color:new de,position:new C,halfWidth:new C,halfHeight:new C}}return s[e.id]=t,t}}}var F0=0;function N0(s,e){return(e.castShadow?2:0)-(s.castShadow?2:0)+(e.map?1:0)-(s.map?1:0)}function U0(s){let e=new D0,t=(function(){let o={};return{get:function(l){if(o[l.id]!==void 0)return o[l.id];let c;switch(l.type){case"DirectionalLight":case"SpotLight":c={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ne};break;case"PointLight":c={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ne,shadowCameraNear:1,shadowCameraFar:1e3}}return o[l.id]=c,c}}})(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let o=0;o<9;o++)n.probe.push(new C);let i=new C,r=new ge,a=new ge;return{setup:function(o){let l=0,c=0,h=0;for(let A=0;A<9;A++)n.probe[A].set(0,0,0);let u=0,d=0,p=0,m=0,f=0,_=0,g=0,v=0,b=0,y=0,S=0;o.sort(N0);for(let A=0,F=o.length;A<F;A++){let L=o[A],P=L.color,O=L.intensity,B=L.distance,j=null;if(L.shadow&&L.shadow.map&&(j=L.shadow.map.texture.format===vr?L.shadow.map.texture:L.shadow.map.depthTexture||L.shadow.map.texture),L.isAmbientLight)l+=P.r*O,c+=P.g*O,h+=P.b*O;else if(L.isLightProbe){for(let H=0;H<9;H++)n.probe[H].addScaledVector(L.sh.coefficients[H],O);S++}else if(L.isDirectionalLight){let H=e.get(L);if(H.color.copy(L.color).multiplyScalar(L.intensity),L.castShadow){let W=L.shadow,Y=t.get(L);Y.shadowIntensity=W.intensity,Y.shadowBias=W.bias,Y.shadowNormalBias=W.normalBias,Y.shadowRadius=W.radius,Y.shadowMapSize=W.mapSize,n.directionalShadow[u]=Y,n.directionalShadowMap[u]=j,n.directionalShadowMatrix[u]=L.shadow.matrix,_++}n.directional[u]=H,u++}else if(L.isSpotLight){let H=e.get(L);H.position.setFromMatrixPosition(L.matrixWorld),H.color.copy(P).multiplyScalar(O),H.distance=B,H.coneCos=Math.cos(L.angle),H.penumbraCos=Math.cos(L.angle*(1-L.penumbra)),H.decay=L.decay,n.spot[p]=H;let W=L.shadow;if(L.map&&(n.spotLightMap[b]=L.map,b++,W.updateMatrices(L),L.castShadow&&y++),n.spotLightMatrix[p]=W.matrix,L.castShadow){let Y=t.get(L);Y.shadowIntensity=W.intensity,Y.shadowBias=W.bias,Y.shadowNormalBias=W.normalBias,Y.shadowRadius=W.radius,Y.shadowMapSize=W.mapSize,n.spotShadow[p]=Y,n.spotShadowMap[p]=j,v++}p++}else if(L.isRectAreaLight){let H=e.get(L);H.color.copy(P).multiplyScalar(O),H.halfWidth.set(.5*L.width,0,0),H.halfHeight.set(0,.5*L.height,0),n.rectArea[m]=H,m++}else if(L.isPointLight){let H=e.get(L);if(H.color.copy(L.color).multiplyScalar(L.intensity),H.distance=L.distance,H.decay=L.decay,L.castShadow){let W=L.shadow,Y=t.get(L);Y.shadowIntensity=W.intensity,Y.shadowBias=W.bias,Y.shadowNormalBias=W.normalBias,Y.shadowRadius=W.radius,Y.shadowMapSize=W.mapSize,Y.shadowCameraNear=W.camera.near,Y.shadowCameraFar=W.camera.far,n.pointShadow[d]=Y,n.pointShadowMap[d]=j,n.pointShadowMatrix[d]=L.shadow.matrix,g++}n.point[d]=H,d++}else if(L.isHemisphereLight){let H=e.get(L);H.skyColor.copy(L.color).multiplyScalar(O),H.groundColor.copy(L.groundColor).multiplyScalar(O),n.hemi[f]=H,f++}}m>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=_e.LTC_FLOAT_1,n.rectAreaLTC2=_e.LTC_FLOAT_2):(n.rectAreaLTC1=_e.LTC_HALF_1,n.rectAreaLTC2=_e.LTC_HALF_2)),n.ambient[0]=l,n.ambient[1]=c,n.ambient[2]=h;let x=n.hash;x.directionalLength===u&&x.pointLength===d&&x.spotLength===p&&x.rectAreaLength===m&&x.hemiLength===f&&x.numDirectionalShadows===_&&x.numPointShadows===g&&x.numSpotShadows===v&&x.numSpotMaps===b&&x.numLightProbes===S||(n.directional.length=u,n.spot.length=p,n.rectArea.length=m,n.point.length=d,n.hemi.length=f,n.directionalShadow.length=_,n.directionalShadowMap.length=_,n.pointShadow.length=g,n.pointShadowMap.length=g,n.spotShadow.length=v,n.spotShadowMap.length=v,n.directionalShadowMatrix.length=_,n.pointShadowMatrix.length=g,n.spotLightMatrix.length=v+b-y,n.spotLightMap.length=b,n.numSpotLightShadowsWithMaps=y,n.numLightProbes=S,x.directionalLength=u,x.pointLength=d,x.spotLength=p,x.rectAreaLength=m,x.hemiLength=f,x.numDirectionalShadows=_,x.numPointShadows=g,x.numSpotShadows=v,x.numSpotMaps=b,x.numLightProbes=S,n.version=F0++)},setupView:function(o,l){let c=0,h=0,u=0,d=0,p=0,m=l.matrixWorldInverse;for(let f=0,_=o.length;f<_;f++){let g=o[f];if(g.isDirectionalLight){let v=n.directional[c];v.direction.setFromMatrixPosition(g.matrixWorld),i.setFromMatrixPosition(g.target.matrixWorld),v.direction.sub(i),v.direction.transformDirection(m),c++}else if(g.isSpotLight){let v=n.spot[u];v.position.setFromMatrixPosition(g.matrixWorld),v.position.applyMatrix4(m),v.direction.setFromMatrixPosition(g.matrixWorld),i.setFromMatrixPosition(g.target.matrixWorld),v.direction.sub(i),v.direction.transformDirection(m),u++}else if(g.isRectAreaLight){let v=n.rectArea[d];v.position.setFromMatrixPosition(g.matrixWorld),v.position.applyMatrix4(m),a.identity(),r.copy(g.matrixWorld),r.premultiply(m),a.extractRotation(r),v.halfWidth.set(.5*g.width,0,0),v.halfHeight.set(0,.5*g.height,0),v.halfWidth.applyMatrix4(a),v.halfHeight.applyMatrix4(a),d++}else if(g.isPointLight){let v=n.point[h];v.position.setFromMatrixPosition(g.matrixWorld),v.position.applyMatrix4(m),h++}else if(g.isHemisphereLight){let v=n.hemi[p];v.direction.setFromMatrixPosition(g.matrixWorld),v.direction.transformDirection(m),p++}}},state:n}}function Sf(s){let e=new U0(s),t=[],n=[],i=[],r={lightsArray:t,shadowsArray:n,lightProbeGridArray:i,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:function(a){r.camera=a,t.length=0,n.length=0,i.length=0},state:r,setupLights:function(){e.setup(t)},setupLightsView:function(a){e.setupView(t,a)},pushLight:function(a){t.push(a)},pushShadow:function(a){n.push(a)},pushLightProbeGrid:function(a){i.push(a)}}}function O0(s){let e=new WeakMap;return{get:function(t,n=0){let i=e.get(t),r;return i===void 0?(r=new Sf(s),e.set(t,[r])):n>=i.length?(r=new Sf(s),i.push(r)):r=i[n],r},dispose:function(){e=new WeakMap}}}var B0=[new C(1,0,0),new C(-1,0,0),new C(0,1,0),new C(0,-1,0),new C(0,0,1),new C(0,0,-1)],k0=[new C(0,-1,0),new C(0,-1,0),new C(0,0,1),new C(0,0,-1),new C(0,-1,0),new C(0,-1,0)],Tf=new ge,pa=new C,qh=new C;function z0(s,e,t){let n=new Mi,i=new ne,r=new ne,a=new We,o=new Fo,l=new No,c={},h=t.maxTextureSize,u={[$n]:en,[en]:$n,[Sn]:Sn},d=new cn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new ne},radius:{value:4}},vertexShader:`void main() {
	gl_Position = vec4( position, 1.0 );
}`,fragmentShader:`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`}),p=d.clone();p.defines.HORIZONTAL_PASS=1;let m=new De;m.setAttribute("position",new Xe(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let f=new et(m,d),_=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=sa;let g=this.type;function v(x,A){let F=e.update(f);d.defines.VSM_SAMPLES!==x.blurSamples&&(d.defines.VSM_SAMPLES=x.blurSamples,p.defines.VSM_SAMPLES=x.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),x.mapPass===null&&(x.mapPass=new an(i.x,i.y,{format:vr,type:ti})),d.uniforms.shadow_pass.value=x.map.depthTexture,d.uniforms.resolution.value=x.mapSize,d.uniforms.radius.value=x.radius,s.setRenderTarget(x.mapPass),s.clear(),s.renderBufferDirect(A,null,F,d,f,null),p.uniforms.shadow_pass.value=x.mapPass.texture,p.uniforms.resolution.value=x.mapSize,p.uniforms.radius.value=x.radius,s.setRenderTarget(x.map),s.clear(),s.renderBufferDirect(A,null,F,p,f,null)}function b(x,A,F,L){let P=null,O=F.isPointLight===!0?x.customDistanceMaterial:x.customDepthMaterial;if(O!==void 0)P=O;else if(P=F.isPointLight===!0?l:o,s.localClippingEnabled&&A.clipShadows===!0&&Array.isArray(A.clippingPlanes)&&A.clippingPlanes.length!==0||A.displacementMap&&A.displacementScale!==0||A.alphaMap&&A.alphaTest>0||A.map&&A.alphaTest>0||A.alphaToCoverage===!0){let B=P.uuid,j=A.uuid,H=c[B];H===void 0&&(H={},c[B]=H);let W=H[j];W===void 0&&(W=P.clone(),H[j]=W,A.addEventListener("dispose",S)),P=W}return P.visible=A.visible,P.wireframe=A.wireframe,P.side=L===Qr?A.shadowSide!==null?A.shadowSide:A.side:A.shadowSide!==null?A.shadowSide:u[A.side],P.alphaMap=A.alphaMap,P.alphaTest=A.alphaToCoverage===!0?.5:A.alphaTest,P.map=A.map,P.clipShadows=A.clipShadows,P.clippingPlanes=A.clippingPlanes,P.clipIntersection=A.clipIntersection,P.displacementMap=A.displacementMap,P.displacementScale=A.displacementScale,P.displacementBias=A.displacementBias,P.wireframeLinewidth=A.wireframeLinewidth,P.linewidth=A.linewidth,F.isPointLight===!0&&P.isMeshDistanceMaterial===!0&&(s.properties.get(P).light=F),P}function y(x,A,F,L,P){if(x.visible===!1)return;if(x.layers.test(A.layers)&&(x.isMesh||x.isLine||x.isPoints)&&(x.castShadow||x.receiveShadow&&P===Qr)&&(!x.frustumCulled||n.intersectsObject(x))){x.modelViewMatrix.multiplyMatrices(F.matrixWorldInverse,x.matrixWorld);let B=e.update(x),j=x.material;if(Array.isArray(j)){let H=B.groups;for(let W=0,Y=H.length;W<Y;W++){let K=H[W],ee=j[K.materialIndex];if(ee&&ee.visible){let ue=b(x,ee,L,P);x.onBeforeShadow(s,x,A,F,B,ue,K),s.renderBufferDirect(F,null,B,ue,x,K),x.onAfterShadow(s,x,A,F,B,ue,K)}}}else if(j.visible){let H=b(x,j,L,P);x.onBeforeShadow(s,x,A,F,B,H,null),s.renderBufferDirect(F,null,B,H,x,null),x.onAfterShadow(s,x,A,F,B,H,null)}}let O=x.children;for(let B=0,j=O.length;B<j;B++)y(O[B],A,F,L,P)}function S(x){x.target.removeEventListener("dispose",S);for(let A in c){let F=c[A],L=x.target.uuid;L in F&&(F[L].dispose(),delete F[L])}}this.render=function(x,A,F){if(_.enabled===!1||_.autoUpdate===!1&&_.needsUpdate===!1||x.length===0)return;this.type===up&&(Ae("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=sa);let L=s.getRenderTarget(),P=s.getActiveCubeFace(),O=s.getActiveMipmapLevel(),B=s.state;B.setBlending(ei),B.buffers.depth.getReversed()===!0?B.buffers.color.setClear(0,0,0,0):B.buffers.color.setClear(1,1,1,1),B.buffers.depth.setTest(!0),B.setScissorTest(!1);let j=g!==this.type;j&&A.traverse(function(H){H.material&&(Array.isArray(H.material)?H.material.forEach(W=>W.needsUpdate=!0):H.material.needsUpdate=!0)});for(let H=0,W=x.length;H<W;H++){let Y=x[H],K=Y.shadow;if(K===void 0){Ae("WebGLShadowMap:",Y,"has no shadow.");continue}if(K.autoUpdate===!1&&K.needsUpdate===!1)continue;i.copy(K.mapSize);let ee=K.getFrameExtents();i.multiply(ee),r.copy(K.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/ee.x),i.x=r.x*ee.x,K.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/ee.y),i.y=r.y*ee.y,K.mapSize.y=r.y));let ue=s.state.buffers.depth.getReversed();if(K.camera._reversedDepth=ue,K.map===null||j===!0){if(K.map!==null&&(K.map.depthTexture!==null&&(K.map.depthTexture.dispose(),K.map.depthTexture=null),K.map.dispose()),this.type===Qr){if(Y.isPointLight){Ae("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}K.map=new an(i.x,i.y,{format:vr,type:ti,minFilter:ct,magFilter:ct,generateMipmaps:!1}),K.map.texture.name=Y.name+".shadowMap",K.map.depthTexture=new wi(i.x,i.y,dn),K.map.depthTexture.name=Y.name+".shadowMapDepth",K.map.depthTexture.format=qi,K.map.depthTexture.compareFunction=null,K.map.depthTexture.minFilter=Ut,K.map.depthTexture.magFilter=Ut}else Y.isPointLight?(K.map=new pl(i.x),K.map.depthTexture=new lo(i.x,Ai)):(K.map=new an(i.x,i.y),K.map.depthTexture=new wi(i.x,i.y,Ai)),K.map.depthTexture.name=Y.name+".shadowMap",K.map.depthTexture.format=qi,this.type===sa?(K.map.depthTexture.compareFunction=ue?ol:al,K.map.depthTexture.minFilter=ct,K.map.depthTexture.magFilter=ct):(K.map.depthTexture.compareFunction=null,K.map.depthTexture.minFilter=Ut,K.map.depthTexture.magFilter=Ut);K.camera.updateProjectionMatrix()}let Se=K.map.isWebGLCubeRenderTarget?6:1;for(let me=0;me<Se;me++){if(K.map.isWebGLCubeRenderTarget)s.setRenderTarget(K.map,me),s.clear();else{me===0&&(s.setRenderTarget(K.map),s.clear());let xe=K.getViewport(me);a.set(r.x*xe.x,r.y*xe.y,r.x*xe.z,r.y*xe.w),B.viewport(a)}if(Y.isPointLight){let xe=K.camera,te=K.matrix,pe=Y.distance||xe.far;pe!==xe.far&&(xe.far=pe,xe.updateProjectionMatrix()),pa.setFromMatrixPosition(Y.matrixWorld),xe.position.copy(pa),qh.copy(xe.position),qh.add(B0[me]),xe.up.copy(k0[me]),xe.lookAt(qh),xe.updateMatrixWorld(),te.makeTranslation(-pa.x,-pa.y,-pa.z),Tf.multiplyMatrices(xe.projectionMatrix,xe.matrixWorldInverse),K._frustum.setFromProjectionMatrix(Tf,xe.coordinateSystem,xe.reversedDepth)}else K.updateMatrices(Y);n=K.getFrustum(),y(A,F,K.camera,Y,this.type)}K.isPointLightShadow!==!0&&this.type===Qr&&v(K,F),K.needsUpdate=!1}g=this.type,_.needsUpdate=!1,s.setRenderTarget(L,P,O)}}function G0(s,e){let t=new function(){let M=!1,D=new We,U=null,R=new We(0,0,0,0);return{setMask:function(z){U===z||M||(s.colorMask(z,z,z,z),U=z)},setLocked:function(z){M=z},setClear:function(z,J,Z,ae,be){be===!0&&(z*=ae,J*=ae,Z*=ae),D.set(z,J,Z,ae),R.equals(D)===!1&&(s.clearColor(z,J,Z,ae),R.copy(D))},reset:function(){M=!1,U=null,R.set(-1,0,0,0)}}},n=new function(){let M=!1,D=!1,U=null,R=null,z=null;return{setReversed:function(J){if(D!==J){let Z=e.get("EXT_clip_control");J?Z.clipControlEXT(Z.LOWER_LEFT_EXT,Z.ZERO_TO_ONE_EXT):Z.clipControlEXT(Z.LOWER_LEFT_EXT,Z.NEGATIVE_ONE_TO_ONE_EXT),D=J;let ae=z;z=null,this.setClear(ae)}},getReversed:function(){return D},setTest:function(J){J?oe(s.DEPTH_TEST):V(s.DEPTH_TEST)},setMask:function(J){U===J||M||(s.depthMask(J),U=J)},setFunc:function(J){if(D&&(J=Jp[J]),R!==J){switch(J){case Bc:s.depthFunc(s.NEVER);break;case kc:s.depthFunc(s.ALWAYS);break;case zc:s.depthFunc(s.LESS);break;case qo:s.depthFunc(s.LEQUAL);break;case Gc:s.depthFunc(s.EQUAL);break;case Vc:s.depthFunc(s.GEQUAL);break;case Hc:s.depthFunc(s.GREATER);break;case jc:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}R=J}},setLocked:function(J){M=J},setClear:function(J){z!==J&&(z=J,D&&(J=1-J),s.clearDepth(J))},reset:function(){M=!1,U=null,R=null,z=null,D=!1}}},i=new function(){let M=!1,D=null,U=null,R=null,z=null,J=null,Z=null,ae=null,be=null;return{setTest:function(ce){M||(ce?oe(s.STENCIL_TEST):V(s.STENCIL_TEST))},setMask:function(ce){D===ce||M||(s.stencilMask(ce),D=ce)},setFunc:function(ce,se,Te){U===ce&&R===se&&z===Te||(s.stencilFunc(ce,se,Te),U=ce,R=se,z=Te)},setOp:function(ce,se,Te){J===ce&&Z===se&&ae===Te||(s.stencilOp(ce,se,Te),J=ce,Z=se,ae=Te)},setLocked:function(ce){M=ce},setClear:function(ce){be!==ce&&(s.clearStencil(ce),be=ce)},reset:function(){M=!1,D=null,U=null,R=null,z=null,J=null,Z=null,ae=null,be=null}}},r=new WeakMap,a=new WeakMap,o={},l={},c={},h=new WeakMap,u=[],d=null,p=!1,m=null,f=null,_=null,g=null,v=null,b=null,y=null,S=new de(0,0,0),x=0,A=!1,F=null,L=null,P=null,O=null,B=null,j=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS),H=!1,W=0,Y=s.getParameter(s.VERSION);Y.indexOf("WebGL")!==-1?(W=parseFloat(/^WebGL (\d)/.exec(Y)[1]),H=W>=1):Y.indexOf("OpenGL ES")!==-1&&(W=parseFloat(/^OpenGL ES (\d)/.exec(Y)[1]),H=W>=2);let K=null,ee={},ue=s.getParameter(s.SCISSOR_BOX),Se=s.getParameter(s.VIEWPORT),me=new We().fromArray(ue),xe=new We().fromArray(Se);function te(M,D,U,R){let z=new Uint8Array(4),J=s.createTexture();s.bindTexture(M,J),s.texParameteri(M,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(M,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let Z=0;Z<U;Z++)M===s.TEXTURE_3D||M===s.TEXTURE_2D_ARRAY?s.texImage3D(D,0,s.RGBA,1,1,R,0,s.RGBA,s.UNSIGNED_BYTE,z):s.texImage2D(D+Z,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,z);return J}let pe={};function oe(M){o[M]!==!0&&(s.enable(M),o[M]=!0)}function V(M){o[M]!==!1&&(s.disable(M),o[M]=!1)}pe[s.TEXTURE_2D]=te(s.TEXTURE_2D,s.TEXTURE_2D,1),pe[s.TEXTURE_CUBE_MAP]=te(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),pe[s.TEXTURE_2D_ARRAY]=te(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),pe[s.TEXTURE_3D]=te(s.TEXTURE_3D,s.TEXTURE_3D,1,1),t.setClear(0,0,0,1),n.setClear(1),i.setClear(0),oe(s.DEPTH_TEST),n.setFunc(qo),T(!1),w(Fc),oe(s.CULL_FACE),E(ei);let G={[$r]:s.FUNC_ADD,[pp]:s.FUNC_SUBTRACT,[fp]:s.FUNC_REVERSE_SUBTRACT};G[mp]=s.MIN,G[gp]=s.MAX;let k={[vp]:s.ZERO,[bp]:s.ONE,[_p]:s.SRC_COLOR,[xp]:s.SRC_ALPHA,[Ep]:s.SRC_ALPHA_SATURATE,[wp]:s.DST_COLOR,[Sp]:s.DST_ALPHA,[yp]:s.ONE_MINUS_SRC_COLOR,[Mp]:s.ONE_MINUS_SRC_ALPHA,[Ap]:s.ONE_MINUS_DST_COLOR,[Tp]:s.ONE_MINUS_DST_ALPHA,[Rp]:s.CONSTANT_COLOR,[Cp]:s.ONE_MINUS_CONSTANT_COLOR,[Pp]:s.CONSTANT_ALPHA,[Ip]:s.ONE_MINUS_CONSTANT_ALPHA};function E(M,D,U,R,z,J,Z,ae,be,ce){if(M!==ei){if(p===!1&&(oe(s.BLEND),p=!0),M===dp)z=z||D,J=J||U,Z=Z||R,D===f&&z===v||(s.blendEquationSeparate(G[D],G[z]),f=D,v=z),U===_&&R===g&&J===b&&Z===y||(s.blendFuncSeparate(k[U],k[R],k[J],k[Z]),_=U,g=R,b=J,y=Z),ae.equals(S)!==!1&&be===x||(s.blendColor(ae.r,ae.g,ae.b,be),S.copy(ae),x=be),m=M,A=!1;else if(M!==m||ce!==A){if(f===$r&&v===$r||(s.blendEquation(s.FUNC_ADD),f=$r,v=$r),ce)switch(M){case aa:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Nc:s.blendFunc(s.ONE,s.ONE);break;case Uc:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Oc:s.blendFuncSeparate(s.DST_COLOR,s.ONE_MINUS_SRC_ALPHA,s.ZERO,s.ONE);break;default:Ie("WebGLState: Invalid blending: ",M)}else switch(M){case aa:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Nc:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE,s.ONE,s.ONE);break;case Uc:Ie("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Oc:Ie("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ie("WebGLState: Invalid blending: ",M)}_=null,g=null,b=null,y=null,S.set(0,0,0),x=0,m=M,A=ce}}else p===!0&&(V(s.BLEND),p=!1)}function T(M){F!==M&&(M?s.frontFace(s.CW):s.frontFace(s.CCW),F=M)}function w(M){M!==cp?(oe(s.CULL_FACE),M!==L&&(M===Fc?s.cullFace(s.BACK):M===hp?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):V(s.CULL_FACE),L=M}function N(M,D,U){M?(oe(s.POLYGON_OFFSET_FILL),O===D&&B===U||(O=D,B=U,n.getReversed()&&(D=-D),s.polygonOffset(D,U))):V(s.POLYGON_OFFSET_FILL)}return{buffers:{color:t,depth:n,stencil:i},enable:oe,disable:V,bindFramebuffer:function(M,D){return c[M]!==D&&(s.bindFramebuffer(M,D),c[M]=D,M===s.DRAW_FRAMEBUFFER&&(c[s.FRAMEBUFFER]=D),M===s.FRAMEBUFFER&&(c[s.DRAW_FRAMEBUFFER]=D),!0)},drawBuffers:function(M,D){let U=u,R=!1;if(M){U=h.get(D),U===void 0&&(U=[],h.set(D,U));let z=M.textures;if(U.length!==z.length||U[0]!==s.COLOR_ATTACHMENT0){for(let J=0,Z=z.length;J<Z;J++)U[J]=s.COLOR_ATTACHMENT0+J;U.length=z.length,R=!0}}else U[0]!==s.BACK&&(U[0]=s.BACK,R=!0);R&&s.drawBuffers(U)},useProgram:function(M){return d!==M&&(s.useProgram(M),d=M,!0)},setBlending:E,setMaterial:function(M,D){M.side===Sn?V(s.CULL_FACE):oe(s.CULL_FACE);let U=M.side===en;D&&(U=!U),T(U),M.blending===aa&&M.transparent===!1?E(ei):E(M.blending,M.blendEquation,M.blendSrc,M.blendDst,M.blendEquationAlpha,M.blendSrcAlpha,M.blendDstAlpha,M.blendColor,M.blendAlpha,M.premultipliedAlpha),n.setFunc(M.depthFunc),n.setTest(M.depthTest),n.setMask(M.depthWrite),t.setMask(M.colorWrite);let R=M.stencilWrite;i.setTest(R),R&&(i.setMask(M.stencilWriteMask),i.setFunc(M.stencilFunc,M.stencilRef,M.stencilFuncMask),i.setOp(M.stencilFail,M.stencilZFail,M.stencilZPass)),N(M.polygonOffset,M.polygonOffsetFactor,M.polygonOffsetUnits),M.alphaToCoverage===!0?oe(s.SAMPLE_ALPHA_TO_COVERAGE):V(s.SAMPLE_ALPHA_TO_COVERAGE)},setFlipSided:T,setCullFace:w,setLineWidth:function(M){M!==P&&(H&&s.lineWidth(M),P=M)},setPolygonOffset:N,setScissorTest:function(M){M?oe(s.SCISSOR_TEST):V(s.SCISSOR_TEST)},activeTexture:function(M){M===void 0&&(M=s.TEXTURE0+j-1),K!==M&&(s.activeTexture(M),K=M)},bindTexture:function(M,D,U){U===void 0&&(U=K===null?s.TEXTURE0+j-1:K);let R=ee[U];R===void 0&&(R={type:void 0,texture:void 0},ee[U]=R),R.type===M&&R.texture===D||(K!==U&&(s.activeTexture(U),K=U),s.bindTexture(M,D||pe[M]),R.type=M,R.texture=D)},unbindTexture:function(){let M=ee[K];M!==void 0&&M.type!==void 0&&(s.bindTexture(M.type,null),M.type=void 0,M.texture=void 0)},compressedTexImage2D:function(){try{s.compressedTexImage2D(...arguments)}catch(M){Ie("WebGLState:",M)}},compressedTexImage3D:function(){try{s.compressedTexImage3D(...arguments)}catch(M){Ie("WebGLState:",M)}},texImage2D:function(){try{s.texImage2D(...arguments)}catch(M){Ie("WebGLState:",M)}},texImage3D:function(){try{s.texImage3D(...arguments)}catch(M){Ie("WebGLState:",M)}},pixelStorei:function(M,D){l[M]!==D&&(s.pixelStorei(M,D),l[M]=D)},getParameter:function(M){return l[M]!==void 0?l[M]:s.getParameter(M)},updateUBOMapping:function(M,D){let U=a.get(D);U===void 0&&(U=new WeakMap,a.set(D,U));let R=U.get(M);R===void 0&&(R=s.getUniformBlockIndex(D,M.name),U.set(M,R))},uniformBlockBinding:function(M,D){let U=a.get(D).get(M);r.get(D)!==U&&(s.uniformBlockBinding(D,U,M.__bindingPointIndex),r.set(D,U))},texStorage2D:function(){try{s.texStorage2D(...arguments)}catch(M){Ie("WebGLState:",M)}},texStorage3D:function(){try{s.texStorage3D(...arguments)}catch(M){Ie("WebGLState:",M)}},texSubImage2D:function(){try{s.texSubImage2D(...arguments)}catch(M){Ie("WebGLState:",M)}},texSubImage3D:function(){try{s.texSubImage3D(...arguments)}catch(M){Ie("WebGLState:",M)}},compressedTexSubImage2D:function(){try{s.compressedTexSubImage2D(...arguments)}catch(M){Ie("WebGLState:",M)}},compressedTexSubImage3D:function(){try{s.compressedTexSubImage3D(...arguments)}catch(M){Ie("WebGLState:",M)}},scissor:function(M){me.equals(M)===!1&&(s.scissor(M.x,M.y,M.z,M.w),me.copy(M))},viewport:function(M){xe.equals(M)===!1&&(s.viewport(M.x,M.y,M.z,M.w),xe.copy(M))},reset:function(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),n.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),s.pixelStorei(s.PACK_ALIGNMENT,4),s.pixelStorei(s.UNPACK_ALIGNMENT,4),s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,!1),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,s.BROWSER_DEFAULT_WEBGL),s.pixelStorei(s.PACK_ROW_LENGTH,0),s.pixelStorei(s.PACK_SKIP_PIXELS,0),s.pixelStorei(s.PACK_SKIP_ROWS,0),s.pixelStorei(s.UNPACK_ROW_LENGTH,0),s.pixelStorei(s.UNPACK_IMAGE_HEIGHT,0),s.pixelStorei(s.UNPACK_SKIP_PIXELS,0),s.pixelStorei(s.UNPACK_SKIP_ROWS,0),s.pixelStorei(s.UNPACK_SKIP_IMAGES,0),o={},l={},K=null,ee={},c={},h=new WeakMap,u=[],d=null,p=!1,m=null,f=null,_=null,g=null,v=null,b=null,y=null,S=new de(0,0,0),x=0,A=!1,F=null,L=null,P=null,O=null,B=null,me.set(0,0,s.canvas.width,s.canvas.height),xe.set(0,0,s.canvas.width,s.canvas.height),t.reset(),n.reset(),i.reset()}}}function V0(s,e,t,n,i,r,a){let o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator<"u"&&/OculusBrowser/g.test(navigator.userAgent),c=new ne,h=new WeakMap,u=new Set,d,p=new WeakMap,m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function f(E,T){return m?new OffscreenCanvas(E,T):Gr("canvas")}function _(E,T,w){let N=1,M=k(E);if((M.width>w||M.height>w)&&(N=w/Math.max(M.width,M.height)),N<1){if(typeof HTMLImageElement<"u"&&E instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&E instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&E instanceof ImageBitmap||typeof VideoFrame<"u"&&E instanceof VideoFrame){let D=Math.floor(N*M.width),U=Math.floor(N*M.height);d===void 0&&(d=f(D,U));let R=T?f(D,U):d;return R.width=D,R.height=U,R.getContext("2d").drawImage(E,0,0,D,U),Ae("WebGLRenderer: Texture has been resized from ("+M.width+"x"+M.height+") to ("+D+"x"+U+")."),R}return"data"in E&&Ae("WebGLRenderer: Image in DataTexture is too big ("+M.width+"x"+M.height+")."),E}return E}function g(E){return E.generateMipmaps}function v(E){s.generateMipmap(E)}function b(E){return E.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:E.isWebGL3DRenderTarget?s.TEXTURE_3D:E.isWebGLArrayRenderTarget||E.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function y(E,T,w,N,M,D=!1){if(E!==null){if(s[E]!==void 0)return s[E];Ae("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+E+"'")}let U;N&&(U=e.get("EXT_texture_norm16"),U||Ae("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let R=T;if(T===s.RED&&(w===s.FLOAT&&(R=s.R32F),w===s.HALF_FLOAT&&(R=s.R16F),w===s.UNSIGNED_BYTE&&(R=s.R8),w===s.UNSIGNED_SHORT&&U&&(R=U.R16_EXT),w===s.SHORT&&U&&(R=U.R16_SNORM_EXT)),T===s.RED_INTEGER&&(w===s.UNSIGNED_BYTE&&(R=s.R8UI),w===s.UNSIGNED_SHORT&&(R=s.R16UI),w===s.UNSIGNED_INT&&(R=s.R32UI),w===s.BYTE&&(R=s.R8I),w===s.SHORT&&(R=s.R16I),w===s.INT&&(R=s.R32I)),T===s.RG&&(w===s.FLOAT&&(R=s.RG32F),w===s.HALF_FLOAT&&(R=s.RG16F),w===s.UNSIGNED_BYTE&&(R=s.RG8),w===s.UNSIGNED_SHORT&&U&&(R=U.RG16_EXT),w===s.SHORT&&U&&(R=U.RG16_SNORM_EXT)),T===s.RG_INTEGER&&(w===s.UNSIGNED_BYTE&&(R=s.RG8UI),w===s.UNSIGNED_SHORT&&(R=s.RG16UI),w===s.UNSIGNED_INT&&(R=s.RG32UI),w===s.BYTE&&(R=s.RG8I),w===s.SHORT&&(R=s.RG16I),w===s.INT&&(R=s.RG32I)),T===s.RGB_INTEGER&&(w===s.UNSIGNED_BYTE&&(R=s.RGB8UI),w===s.UNSIGNED_SHORT&&(R=s.RGB16UI),w===s.UNSIGNED_INT&&(R=s.RGB32UI),w===s.BYTE&&(R=s.RGB8I),w===s.SHORT&&(R=s.RGB16I),w===s.INT&&(R=s.RGB32I)),T===s.RGBA_INTEGER&&(w===s.UNSIGNED_BYTE&&(R=s.RGBA8UI),w===s.UNSIGNED_SHORT&&(R=s.RGBA16UI),w===s.UNSIGNED_INT&&(R=s.RGBA32UI),w===s.BYTE&&(R=s.RGBA8I),w===s.SHORT&&(R=s.RGBA16I),w===s.INT&&(R=s.RGBA32I)),T===s.RGB&&(w===s.UNSIGNED_SHORT&&U&&(R=U.RGB16_EXT),w===s.SHORT&&U&&(R=U.RGB16_SNORM_EXT),w===s.UNSIGNED_INT_5_9_9_9_REV&&(R=s.RGB9_E5),w===s.UNSIGNED_INT_10F_11F_11F_REV&&(R=s.R11F_G11F_B10F)),T===s.RGBA){let z=D?As:Ce.getTransfer(M);w===s.FLOAT&&(R=s.RGBA32F),w===s.HALF_FLOAT&&(R=s.RGBA16F),w===s.UNSIGNED_BYTE&&(R=z===nt?s.SRGB8_ALPHA8:s.RGBA8),w===s.UNSIGNED_SHORT&&U&&(R=U.RGBA16_EXT),w===s.SHORT&&U&&(R=U.RGBA16_SNORM_EXT),w===s.UNSIGNED_SHORT_4_4_4_4&&(R=s.RGBA4),w===s.UNSIGNED_SHORT_5_5_5_1&&(R=s.RGB5_A1)}return R!==s.R16F&&R!==s.R32F&&R!==s.RG16F&&R!==s.RG32F&&R!==s.RGBA16F&&R!==s.RGBA32F||e.get("EXT_color_buffer_float"),R}function S(E,T){let w;return E?T===null||T===Ai||T===rs?w=s.DEPTH24_STENCIL8:T===dn?w=s.DEPTH32F_STENCIL8:T===is&&(w=s.DEPTH24_STENCIL8,Ae("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):T===null||T===Ai||T===rs?w=s.DEPTH_COMPONENT24:T===dn?w=s.DEPTH_COMPONENT32F:T===is&&(w=s.DEPTH_COMPONENT16),w}function x(E,T){return g(E)===!0||E.isFramebufferTexture&&E.minFilter!==Ut&&E.minFilter!==ct?Math.log2(Math.max(T.width,T.height))+1:E.mipmaps!==void 0&&E.mipmaps.length>0?E.mipmaps.length:E.isCompressedTexture&&Array.isArray(E.image)?T.mipmaps.length:1}function A(E){let T=E.target;T.removeEventListener("dispose",A),(function(w){let N=n.get(w);if(N.__webglInit===void 0)return;let M=w.source,D=p.get(M);if(D){let U=D[N.__cacheKey];U.usedTimes--,U.usedTimes===0&&L(w),Object.keys(D).length===0&&p.delete(M)}n.remove(w)})(T),T.isVideoTexture&&h.delete(T),T.isHTMLTexture&&u.delete(T)}function F(E){let T=E.target;T.removeEventListener("dispose",F),(function(w){let N=n.get(w);if(w.depthTexture&&(w.depthTexture.dispose(),n.remove(w.depthTexture)),w.isWebGLCubeRenderTarget)for(let D=0;D<6;D++){if(Array.isArray(N.__webglFramebuffer[D]))for(let U=0;U<N.__webglFramebuffer[D].length;U++)s.deleteFramebuffer(N.__webglFramebuffer[D][U]);else s.deleteFramebuffer(N.__webglFramebuffer[D]);N.__webglDepthbuffer&&s.deleteRenderbuffer(N.__webglDepthbuffer[D])}else{if(Array.isArray(N.__webglFramebuffer))for(let D=0;D<N.__webglFramebuffer.length;D++)s.deleteFramebuffer(N.__webglFramebuffer[D]);else s.deleteFramebuffer(N.__webglFramebuffer);if(N.__webglDepthbuffer&&s.deleteRenderbuffer(N.__webglDepthbuffer),N.__webglMultisampledFramebuffer&&s.deleteFramebuffer(N.__webglMultisampledFramebuffer),N.__webglColorRenderbuffer)for(let D=0;D<N.__webglColorRenderbuffer.length;D++)N.__webglColorRenderbuffer[D]&&s.deleteRenderbuffer(N.__webglColorRenderbuffer[D]);N.__webglDepthRenderbuffer&&s.deleteRenderbuffer(N.__webglDepthRenderbuffer)}let M=w.textures;for(let D=0,U=M.length;D<U;D++){let R=n.get(M[D]);R.__webglTexture&&(s.deleteTexture(R.__webglTexture),a.memory.textures--),n.remove(M[D])}n.remove(w)})(T)}function L(E){let T=n.get(E);s.deleteTexture(T.__webglTexture);let w=E.source;delete p.get(w)[T.__cacheKey],a.memory.textures--}let P=0;function O(E,T){let w=n.get(E);if(E.isVideoTexture&&(function(N){let M=a.render.frame;h.get(N)!==M&&(h.set(N,M),N.update())})(E),E.isRenderTargetTexture===!1&&E.isExternalTexture!==!0&&E.version>0&&w.__version!==E.version){let N=E.image;if(N===null)Ae("WebGLRenderer: Texture marked for update but no image data found.");else{if(N.complete!==!1)return void ee(w,E,T);Ae("WebGLRenderer: Texture marked for update but image is incomplete")}}else E.isExternalTexture&&(w.__webglTexture=E.sourceTexture?E.sourceTexture:null);t.bindTexture(s.TEXTURE_2D,w.__webglTexture,s.TEXTURE0+T)}let B={[Nt]:s.REPEAT,[qt]:s.CLAMP_TO_EDGE,[vi]:s.MIRRORED_REPEAT},j={[Ut]:s.NEAREST,[Ko]:s.NEAREST_MIPMAP_NEAREST,[mr]:s.NEAREST_MIPMAP_LINEAR,[ct]:s.LINEAR,[ns]:s.LINEAR_MIPMAP_NEAREST,[hn]:s.LINEAR_MIPMAP_LINEAR},H={[Gp]:s.NEVER,[qp]:s.ALWAYS,[Vp]:s.LESS,[al]:s.LEQUAL,[Hp]:s.EQUAL,[ol]:s.GEQUAL,[jp]:s.GREATER,[Wp]:s.NOTEQUAL};function W(E,T){if(T.type!==dn||e.has("OES_texture_float_linear")!==!1||T.magFilter!==ct&&T.magFilter!==ns&&T.magFilter!==mr&&T.magFilter!==hn&&T.minFilter!==ct&&T.minFilter!==ns&&T.minFilter!==mr&&T.minFilter!==hn||Ae("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(E,s.TEXTURE_WRAP_S,B[T.wrapS]),s.texParameteri(E,s.TEXTURE_WRAP_T,B[T.wrapT]),E!==s.TEXTURE_3D&&E!==s.TEXTURE_2D_ARRAY||s.texParameteri(E,s.TEXTURE_WRAP_R,B[T.wrapR]),s.texParameteri(E,s.TEXTURE_MAG_FILTER,j[T.magFilter]),s.texParameteri(E,s.TEXTURE_MIN_FILTER,j[T.minFilter]),T.compareFunction&&(s.texParameteri(E,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(E,s.TEXTURE_COMPARE_FUNC,H[T.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(T.magFilter===Ut||T.minFilter!==mr&&T.minFilter!==hn||T.type===dn&&e.has("OES_texture_float_linear")===!1)return;if(T.anisotropy>1||n.get(T).__currentAnisotropy){let w=e.get("EXT_texture_filter_anisotropic");s.texParameterf(E,w.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(T.anisotropy,i.getMaxAnisotropy())),n.get(T).__currentAnisotropy=T.anisotropy}}}function Y(E,T){let w=!1;E.__webglInit===void 0&&(E.__webglInit=!0,T.addEventListener("dispose",A));let N=T.source,M=p.get(N);M===void 0&&(M={},p.set(N,M));let D=(function(U){let R=[];return R.push(U.wrapS),R.push(U.wrapT),R.push(U.wrapR||0),R.push(U.magFilter),R.push(U.minFilter),R.push(U.anisotropy),R.push(U.internalFormat),R.push(U.format),R.push(U.type),R.push(U.generateMipmaps),R.push(U.premultiplyAlpha),R.push(U.flipY),R.push(U.unpackAlignment),R.push(U.colorSpace),R.join()})(T);if(D!==E.__cacheKey){M[D]===void 0&&(M[D]={texture:s.createTexture(),usedTimes:0},a.memory.textures++,w=!0),M[D].usedTimes++;let U=M[E.__cacheKey];U!==void 0&&(M[E.__cacheKey].usedTimes--,U.usedTimes===0&&L(T)),E.__cacheKey=D,E.__webglTexture=M[D].texture}return w}function K(E,T,w){return Math.floor(Math.floor(E/w)/T)}function ee(E,T,w){let N=s.TEXTURE_2D;(T.isDataArrayTexture||T.isCompressedArrayTexture)&&(N=s.TEXTURE_2D_ARRAY),T.isData3DTexture&&(N=s.TEXTURE_3D);let M=Y(E,T),D=T.source;t.bindTexture(N,E.__webglTexture,s.TEXTURE0+w);let U=n.get(D);if(D.version!==U.__version||M===!0){if(t.activeTexture(s.TEXTURE0+w),!(typeof ImageBitmap<"u"&&T.image instanceof ImageBitmap)){let he=Ce.getPrimaries(Ce.workingColorSpace),le=T.colorSpace===br?null:Ce.getPrimaries(T.colorSpace),ye=T.colorSpace===br||he===le?s.NONE:s.BROWSER_DEFAULT_WEBGL;t.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,T.flipY),t.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,T.premultiplyAlpha),t.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,ye)}t.pixelStorei(s.UNPACK_ALIGNMENT,T.unpackAlignment);let R=_(T.image,!1,i.maxTextureSize);R=G(T,R);let z=r.convert(T.format,T.colorSpace),J=r.convert(T.type),Z,ae=y(T.internalFormat,z,J,T.normalized,T.colorSpace,T.isVideoTexture);W(N,T);let be=T.mipmaps,ce=T.isVideoTexture!==!0,se=U.__version===void 0||M===!0,Te=D.dataReady,ie=x(T,R);if(T.isDepthTexture)ae=S(T.format===gr,T.type),se&&(ce?t.texStorage2D(s.TEXTURE_2D,1,ae,R.width,R.height):t.texImage2D(s.TEXTURE_2D,0,ae,R.width,R.height,0,z,J,null));else if(T.isDataTexture)if(be.length>0){ce&&se&&t.texStorage2D(s.TEXTURE_2D,ie,ae,be[0].width,be[0].height);for(let he=0,le=be.length;he<le;he++)Z=be[he],ce?Te&&t.texSubImage2D(s.TEXTURE_2D,he,0,0,Z.width,Z.height,z,J,Z.data):t.texImage2D(s.TEXTURE_2D,he,ae,Z.width,Z.height,0,z,J,Z.data);T.generateMipmaps=!1}else ce?(se&&t.texStorage2D(s.TEXTURE_2D,ie,ae,R.width,R.height),Te&&(function(he,le,ye,Ge){let Ye=he.updateRanges;if(Ye.length===0)t.texSubImage2D(s.TEXTURE_2D,0,0,0,le.width,le.height,ye,Ge,le.data);else{Ye.sort((He,Ot)=>He.start-Ot.start);let ht=0;for(let He=1;He<Ye.length;He++){let Ot=Ye[ht],lt=Ye[He],Et=Ot.start+Ot.count,gt=K(lt.start,le.width,4),fn=K(Ot.start,le.width,4);lt.start<=Et+1&&gt===fn&&K(lt.start+lt.count-1,le.width,4)===gt?Ot.count=Math.max(Ot.count,lt.start+lt.count-Ot.start):(++ht,Ye[ht]=lt)}Ye.length=ht+1;let Kt=t.getParameter(s.UNPACK_ROW_LENGTH),Re=t.getParameter(s.UNPACK_SKIP_PIXELS),it=t.getParameter(s.UNPACK_SKIP_ROWS);t.pixelStorei(s.UNPACK_ROW_LENGTH,le.width);for(let He=0,Ot=Ye.length;He<Ot;He++){let lt=Ye[He],Et=Math.floor(lt.start/4),gt=Math.ceil(lt.count/4),fn=Et%le.width,En=Math.floor(Et/le.width),Ki=gt;t.pixelStorei(s.UNPACK_SKIP_PIXELS,fn),t.pixelStorei(s.UNPACK_SKIP_ROWS,En),t.texSubImage2D(s.TEXTURE_2D,0,fn,En,Ki,1,ye,Ge,le.data)}he.clearUpdateRanges(),t.pixelStorei(s.UNPACK_ROW_LENGTH,Kt),t.pixelStorei(s.UNPACK_SKIP_PIXELS,Re),t.pixelStorei(s.UNPACK_SKIP_ROWS,it)}})(T,R,z,J)):t.texImage2D(s.TEXTURE_2D,0,ae,R.width,R.height,0,z,J,R.data);else if(T.isCompressedTexture)if(T.isCompressedArrayTexture){ce&&se&&t.texStorage3D(s.TEXTURE_2D_ARRAY,ie,ae,be[0].width,be[0].height,R.depth);for(let he=0,le=be.length;he<le;he++)if(Z=be[he],T.format!==Tn)if(z!==null)if(ce){if(Te)if(T.layerUpdates.size>0){let ye=zh(Z.width,Z.height,T.format,T.type);for(let Ge of T.layerUpdates){let Ye=Z.data.subarray(Ge*ye/Z.data.BYTES_PER_ELEMENT,(Ge+1)*ye/Z.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,he,0,0,Ge,Z.width,Z.height,1,z,Ye)}T.clearLayerUpdates()}else t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,he,0,0,0,Z.width,Z.height,R.depth,z,Z.data)}else t.compressedTexImage3D(s.TEXTURE_2D_ARRAY,he,ae,Z.width,Z.height,R.depth,0,Z.data,0,0);else Ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else ce?Te&&t.texSubImage3D(s.TEXTURE_2D_ARRAY,he,0,0,0,Z.width,Z.height,R.depth,z,J,Z.data):t.texImage3D(s.TEXTURE_2D_ARRAY,he,ae,Z.width,Z.height,R.depth,0,z,J,Z.data)}else{ce&&se&&t.texStorage2D(s.TEXTURE_2D,ie,ae,be[0].width,be[0].height);for(let he=0,le=be.length;he<le;he++)Z=be[he],T.format!==Tn?z!==null?ce?Te&&t.compressedTexSubImage2D(s.TEXTURE_2D,he,0,0,Z.width,Z.height,z,Z.data):t.compressedTexImage2D(s.TEXTURE_2D,he,ae,Z.width,Z.height,0,Z.data):Ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):ce?Te&&t.texSubImage2D(s.TEXTURE_2D,he,0,0,Z.width,Z.height,z,J,Z.data):t.texImage2D(s.TEXTURE_2D,he,ae,Z.width,Z.height,0,z,J,Z.data)}else if(T.isDataArrayTexture)if(ce){if(se&&t.texStorage3D(s.TEXTURE_2D_ARRAY,ie,ae,R.width,R.height,R.depth),Te)if(T.layerUpdates.size>0){let he=zh(R.width,R.height,T.format,T.type);for(let le of T.layerUpdates){let ye=R.data.subarray(le*he/R.data.BYTES_PER_ELEMENT,(le+1)*he/R.data.BYTES_PER_ELEMENT);t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,le,R.width,R.height,1,z,J,ye)}T.clearLayerUpdates()}else t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,R.width,R.height,R.depth,z,J,R.data)}else t.texImage3D(s.TEXTURE_2D_ARRAY,0,ae,R.width,R.height,R.depth,0,z,J,R.data);else if(T.isData3DTexture)ce?(se&&t.texStorage3D(s.TEXTURE_3D,ie,ae,R.width,R.height,R.depth),Te&&t.texSubImage3D(s.TEXTURE_3D,0,0,0,0,R.width,R.height,R.depth,z,J,R.data)):t.texImage3D(s.TEXTURE_3D,0,ae,R.width,R.height,R.depth,0,z,J,R.data);else if(T.isFramebufferTexture){if(se)if(ce)t.texStorage2D(s.TEXTURE_2D,ie,ae,R.width,R.height);else{let he=R.width,le=R.height;for(let ye=0;ye<ie;ye++)t.texImage2D(s.TEXTURE_2D,ye,ae,he,le,0,z,J,null),he>>=1,le>>=1}}else if(T.isHTMLTexture){if("texElementImage2D"in s){let he=s.canvas;if(he.hasAttribute("layoutsubtree")||he.setAttribute("layoutsubtree","true"),R.parentNode!==he)return he.appendChild(R),u.add(T),he.onpaint=le=>{let ye=le.changedElements;for(let Ge of u)ye.includes(Ge.image)&&(Ge.needsUpdate=!0)},void he.requestPaint();if(s.texElementImage2D.length===3)s.texElementImage2D(s.TEXTURE_2D,s.RGBA8,R);else{let ye=s.RGBA,Ge=s.RGBA,Ye=s.UNSIGNED_BYTE;s.texElementImage2D(s.TEXTURE_2D,0,ye,Ge,Ye,R)}s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.LINEAR),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE)}}else if(be.length>0){if(ce&&se){let he=k(be[0]);t.texStorage2D(s.TEXTURE_2D,ie,ae,he.width,he.height)}for(let he=0,le=be.length;he<le;he++)Z=be[he],ce?Te&&t.texSubImage2D(s.TEXTURE_2D,he,0,0,z,J,Z):t.texImage2D(s.TEXTURE_2D,he,ae,z,J,Z);T.generateMipmaps=!1}else if(ce){if(se){let he=k(R);t.texStorage2D(s.TEXTURE_2D,ie,ae,he.width,he.height)}Te&&t.texSubImage2D(s.TEXTURE_2D,0,0,0,z,J,R)}else t.texImage2D(s.TEXTURE_2D,0,ae,z,J,R);g(T)&&v(N),U.__version=D.version,T.onUpdate&&T.onUpdate(T)}E.__version=T.version}function ue(E,T,w,N,M,D){let U=r.convert(w.format,w.colorSpace),R=r.convert(w.type),z=y(w.internalFormat,U,R,w.normalized,w.colorSpace),J=n.get(T),Z=n.get(w);if(Z.__renderTarget=T,!J.__hasExternalTextures){let ae=Math.max(1,T.width>>D),be=Math.max(1,T.height>>D);M===s.TEXTURE_3D||M===s.TEXTURE_2D_ARRAY?t.texImage3D(M,D,z,ae,be,T.depth,0,U,R,null):t.texImage2D(M,D,z,ae,be,0,U,R,null)}t.bindFramebuffer(s.FRAMEBUFFER,E),V(T)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,N,M,Z.__webglTexture,0,oe(T)):(M===s.TEXTURE_2D||M>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&M<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,N,M,Z.__webglTexture,D),t.bindFramebuffer(s.FRAMEBUFFER,null)}function Se(E,T,w){if(s.bindRenderbuffer(s.RENDERBUFFER,E),T.depthBuffer){let N=T.depthTexture,M=N&&N.isDepthTexture?N.type:null,D=S(T.stencilBuffer,M),U=T.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;V(T)?o.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,oe(T),D,T.width,T.height):w?s.renderbufferStorageMultisample(s.RENDERBUFFER,oe(T),D,T.width,T.height):s.renderbufferStorage(s.RENDERBUFFER,D,T.width,T.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,U,s.RENDERBUFFER,E)}else{let N=T.textures;for(let M=0;M<N.length;M++){let D=N[M],U=r.convert(D.format,D.colorSpace),R=r.convert(D.type),z=y(D.internalFormat,U,R,D.normalized,D.colorSpace);V(T)?o.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,oe(T),z,T.width,T.height):w?s.renderbufferStorageMultisample(s.RENDERBUFFER,oe(T),z,T.width,T.height):s.renderbufferStorage(s.RENDERBUFFER,z,T.width,T.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function me(E,T,w){let N=T.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(s.FRAMEBUFFER,E),!T.depthTexture||!T.depthTexture.isDepthTexture)throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let M=n.get(T.depthTexture);if(M.__renderTarget=T,M.__webglTexture&&T.depthTexture.image.width===T.width&&T.depthTexture.image.height===T.height||(T.depthTexture.image.width=T.width,T.depthTexture.image.height=T.height,T.depthTexture.needsUpdate=!0),N){if(M.__webglInit===void 0&&(M.__webglInit=!0,T.depthTexture.addEventListener("dispose",A)),M.__webglTexture===void 0){M.__webglTexture=s.createTexture(),t.bindTexture(s.TEXTURE_CUBE_MAP,M.__webglTexture),W(s.TEXTURE_CUBE_MAP,T.depthTexture);let J=r.convert(T.depthTexture.format),Z=r.convert(T.depthTexture.type),ae;T.depthTexture.format===qi?ae=s.DEPTH_COMPONENT24:T.depthTexture.format===gr&&(ae=s.DEPTH24_STENCIL8);for(let be=0;be<6;be++)s.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+be,0,ae,T.width,T.height,0,J,Z,null)}}else O(T.depthTexture,0);let D=M.__webglTexture,U=oe(T),R=N?s.TEXTURE_CUBE_MAP_POSITIVE_X+w:s.TEXTURE_2D,z=T.depthTexture.format===gr?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;if(T.depthTexture.format===qi)V(T)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,z,R,D,0,U):s.framebufferTexture2D(s.FRAMEBUFFER,z,R,D,0);else{if(T.depthTexture.format!==gr)throw new Error("THREE.WebGLTextures: Unknown depthTexture format.");V(T)?o.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,z,R,D,0,U):s.framebufferTexture2D(s.FRAMEBUFFER,z,R,D,0)}}function xe(E){let T=n.get(E),w=E.isWebGLCubeRenderTarget===!0;if(T.__boundDepthTexture!==E.depthTexture){let N=E.depthTexture;if(T.__depthDisposeCallback&&T.__depthDisposeCallback(),N){let M=()=>{delete T.__boundDepthTexture,delete T.__depthDisposeCallback,N.removeEventListener("dispose",M)};N.addEventListener("dispose",M),T.__depthDisposeCallback=M}T.__boundDepthTexture=N}if(E.depthTexture&&!T.__autoAllocateDepthBuffer)if(w)for(let N=0;N<6;N++)me(T.__webglFramebuffer[N],E,N);else{let N=E.texture.mipmaps;N&&N.length>0?me(T.__webglFramebuffer[0],E,0):me(T.__webglFramebuffer,E,0)}else if(w){T.__webglDepthbuffer=[];for(let N=0;N<6;N++)if(t.bindFramebuffer(s.FRAMEBUFFER,T.__webglFramebuffer[N]),T.__webglDepthbuffer[N]===void 0)T.__webglDepthbuffer[N]=s.createRenderbuffer(),Se(T.__webglDepthbuffer[N],E,!1);else{let M=E.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,D=T.__webglDepthbuffer[N];s.bindRenderbuffer(s.RENDERBUFFER,D),s.framebufferRenderbuffer(s.FRAMEBUFFER,M,s.RENDERBUFFER,D)}}else{let N=E.texture.mipmaps;if(N&&N.length>0?t.bindFramebuffer(s.FRAMEBUFFER,T.__webglFramebuffer[0]):t.bindFramebuffer(s.FRAMEBUFFER,T.__webglFramebuffer),T.__webglDepthbuffer===void 0)T.__webglDepthbuffer=s.createRenderbuffer(),Se(T.__webglDepthbuffer,E,!1);else{let M=E.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,D=T.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,D),s.framebufferRenderbuffer(s.FRAMEBUFFER,M,s.RENDERBUFFER,D)}}t.bindFramebuffer(s.FRAMEBUFFER,null)}let te=[],pe=[];function oe(E){return Math.min(i.maxSamples,E.samples)}function V(E){let T=n.get(E);return E.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&T.__useRenderToTexture!==!1}function G(E,T){let w=E.colorSpace,N=E.format,M=E.type;return E.isCompressedTexture===!0||E.isVideoTexture===!0||w!==kt&&w!==br&&(Ce.getTransfer(w)===nt?N===Tn&&M===un||Ae("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ie("WebGLTextures: Unsupported texture color space:",w)),T}function k(E){return typeof HTMLImageElement<"u"&&E instanceof HTMLImageElement?(c.width=E.naturalWidth||E.width,c.height=E.naturalHeight||E.height):typeof VideoFrame<"u"&&E instanceof VideoFrame?(c.width=E.displayWidth,c.height=E.displayHeight):(c.width=E.width,c.height=E.height),c}this.allocateTextureUnit=function(){let E=P;return E>=i.maxTextures&&Ae("WebGLTextures: Trying to use "+E+" texture units while this GPU supports only "+i.maxTextures),P+=1,E},this.resetTextureUnits=function(){P=0},this.getTextureUnits=function(){return P},this.setTextureUnits=function(E){P=E},this.setTexture2D=O,this.setTexture2DArray=function(E,T){let w=n.get(E);E.isRenderTargetTexture===!1&&E.version>0&&w.__version!==E.version?ee(w,E,T):(E.isExternalTexture&&(w.__webglTexture=E.sourceTexture?E.sourceTexture:null),t.bindTexture(s.TEXTURE_2D_ARRAY,w.__webglTexture,s.TEXTURE0+T))},this.setTexture3D=function(E,T){let w=n.get(E);E.isRenderTargetTexture===!1&&E.version>0&&w.__version!==E.version?ee(w,E,T):t.bindTexture(s.TEXTURE_3D,w.__webglTexture,s.TEXTURE0+T)},this.setTextureCube=function(E,T){let w=n.get(E);E.isCubeDepthTexture!==!0&&E.version>0&&w.__version!==E.version?(function(N,M,D){if(M.image.length!==6)return;let U=Y(N,M),R=M.source;t.bindTexture(s.TEXTURE_CUBE_MAP,N.__webglTexture,s.TEXTURE0+D);let z=n.get(R);if(R.version!==z.__version||U===!0){t.activeTexture(s.TEXTURE0+D);let J=Ce.getPrimaries(Ce.workingColorSpace),Z=M.colorSpace===br?null:Ce.getPrimaries(M.colorSpace),ae=M.colorSpace===br||J===Z?s.NONE:s.BROWSER_DEFAULT_WEBGL;t.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,M.flipY),t.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),t.pixelStorei(s.UNPACK_ALIGNMENT,M.unpackAlignment),t.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,ae);let be=M.isCompressedTexture||M.image[0].isCompressedTexture,ce=M.image[0]&&M.image[0].isDataTexture,se=[];for(let Re=0;Re<6;Re++)se[Re]=be||ce?ce?M.image[Re].image:M.image[Re]:_(M.image[Re],!0,i.maxCubemapSize),se[Re]=G(M,se[Re]);let Te=se[0],ie=r.convert(M.format,M.colorSpace),he=r.convert(M.type),le=y(M.internalFormat,ie,he,M.normalized,M.colorSpace),ye=M.isVideoTexture!==!0,Ge=z.__version===void 0||U===!0,Ye=R.dataReady,ht,Kt=x(M,Te);if(W(s.TEXTURE_CUBE_MAP,M),be){ye&&Ge&&t.texStorage2D(s.TEXTURE_CUBE_MAP,Kt,le,Te.width,Te.height);for(let Re=0;Re<6;Re++){ht=se[Re].mipmaps;for(let it=0;it<ht.length;it++){let He=ht[it];M.format!==Tn?ie!==null?ye?Ye&&t.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it,0,0,He.width,He.height,ie,He.data):t.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it,le,He.width,He.height,0,He.data):Ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):ye?Ye&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it,0,0,He.width,He.height,ie,he,He.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it,le,He.width,He.height,0,ie,he,He.data)}}}else{if(ht=M.mipmaps,ye&&Ge){ht.length>0&&Kt++;let Re=k(se[0]);t.texStorage2D(s.TEXTURE_CUBE_MAP,Kt,le,Re.width,Re.height)}for(let Re=0;Re<6;Re++)if(ce){ye?Ye&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,0,0,0,se[Re].width,se[Re].height,ie,he,se[Re].data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,0,le,se[Re].width,se[Re].height,0,ie,he,se[Re].data);for(let it=0;it<ht.length;it++){let He=ht[it].image[Re].image;ye?Ye&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it+1,0,0,He.width,He.height,ie,he,He.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it+1,le,He.width,He.height,0,ie,he,He.data)}}else{ye?Ye&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,0,0,0,ie,he,se[Re]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,0,le,ie,he,se[Re]);for(let it=0;it<ht.length;it++){let He=ht[it];ye?Ye&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it+1,0,0,ie,he,He.image[Re]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,it+1,le,ie,he,He.image[Re])}}}g(M)&&v(s.TEXTURE_CUBE_MAP),z.__version=R.version,M.onUpdate&&M.onUpdate(M)}N.__version=M.version})(w,E,T):t.bindTexture(s.TEXTURE_CUBE_MAP,w.__webglTexture,s.TEXTURE0+T)},this.rebindTextures=function(E,T,w){let N=n.get(E);T!==void 0&&ue(N.__webglFramebuffer,E,E.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),w!==void 0&&xe(E)},this.setupRenderTarget=function(E){let T=E.texture,w=n.get(E),N=n.get(T);E.addEventListener("dispose",F);let M=E.textures,D=E.isWebGLCubeRenderTarget===!0,U=M.length>1;if(U||(N.__webglTexture===void 0&&(N.__webglTexture=s.createTexture()),N.__version=T.version,a.memory.textures++),D){w.__webglFramebuffer=[];for(let R=0;R<6;R++)if(T.mipmaps&&T.mipmaps.length>0){w.__webglFramebuffer[R]=[];for(let z=0;z<T.mipmaps.length;z++)w.__webglFramebuffer[R][z]=s.createFramebuffer()}else w.__webglFramebuffer[R]=s.createFramebuffer()}else{if(T.mipmaps&&T.mipmaps.length>0){w.__webglFramebuffer=[];for(let R=0;R<T.mipmaps.length;R++)w.__webglFramebuffer[R]=s.createFramebuffer()}else w.__webglFramebuffer=s.createFramebuffer();if(U)for(let R=0,z=M.length;R<z;R++){let J=n.get(M[R]);J.__webglTexture===void 0&&(J.__webglTexture=s.createTexture(),a.memory.textures++)}if(E.samples>0&&V(E)===!1){w.__webglMultisampledFramebuffer=s.createFramebuffer(),w.__webglColorRenderbuffer=[],t.bindFramebuffer(s.FRAMEBUFFER,w.__webglMultisampledFramebuffer);for(let R=0;R<M.length;R++){let z=M[R];w.__webglColorRenderbuffer[R]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,w.__webglColorRenderbuffer[R]);let J=r.convert(z.format,z.colorSpace),Z=r.convert(z.type),ae=y(z.internalFormat,J,Z,z.normalized,z.colorSpace,E.isXRRenderTarget===!0),be=oe(E);s.renderbufferStorageMultisample(s.RENDERBUFFER,be,ae,E.width,E.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+R,s.RENDERBUFFER,w.__webglColorRenderbuffer[R])}s.bindRenderbuffer(s.RENDERBUFFER,null),E.depthBuffer&&(w.__webglDepthRenderbuffer=s.createRenderbuffer(),Se(w.__webglDepthRenderbuffer,E,!0)),t.bindFramebuffer(s.FRAMEBUFFER,null)}}if(D){t.bindTexture(s.TEXTURE_CUBE_MAP,N.__webglTexture),W(s.TEXTURE_CUBE_MAP,T);for(let R=0;R<6;R++)if(T.mipmaps&&T.mipmaps.length>0)for(let z=0;z<T.mipmaps.length;z++)ue(w.__webglFramebuffer[R][z],E,T,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+R,z);else ue(w.__webglFramebuffer[R],E,T,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+R,0);g(T)&&v(s.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(U){for(let R=0,z=M.length;R<z;R++){let J=M[R],Z=n.get(J),ae=s.TEXTURE_2D;(E.isWebGL3DRenderTarget||E.isWebGLArrayRenderTarget)&&(ae=E.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),t.bindTexture(ae,Z.__webglTexture),W(ae,J),ue(w.__webglFramebuffer,E,J,s.COLOR_ATTACHMENT0+R,ae,0),g(J)&&v(ae)}t.unbindTexture()}else{let R=s.TEXTURE_2D;if((E.isWebGL3DRenderTarget||E.isWebGLArrayRenderTarget)&&(R=E.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),t.bindTexture(R,N.__webglTexture),W(R,T),T.mipmaps&&T.mipmaps.length>0)for(let z=0;z<T.mipmaps.length;z++)ue(w.__webglFramebuffer[z],E,T,s.COLOR_ATTACHMENT0,R,z);else ue(w.__webglFramebuffer,E,T,s.COLOR_ATTACHMENT0,R,0);g(T)&&v(R),t.unbindTexture()}E.depthBuffer&&xe(E)},this.updateRenderTargetMipmap=function(E){let T=E.textures;for(let w=0,N=T.length;w<N;w++){let M=T[w];if(g(M)){let D=b(E),U=n.get(M).__webglTexture;t.bindTexture(D,U),v(D),t.unbindTexture()}}},this.updateMultisampleRenderTarget=function(E){if(E.samples>0){if(V(E)===!1){let T=E.textures,w=E.width,N=E.height,M=s.COLOR_BUFFER_BIT,D=E.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,U=n.get(E),R=T.length>1;if(R)for(let J=0;J<T.length;J++)t.bindFramebuffer(s.FRAMEBUFFER,U.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+J,s.RENDERBUFFER,null),t.bindFramebuffer(s.FRAMEBUFFER,U.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+J,s.TEXTURE_2D,null,0);t.bindFramebuffer(s.READ_FRAMEBUFFER,U.__webglMultisampledFramebuffer);let z=E.texture.mipmaps;z&&z.length>0?t.bindFramebuffer(s.DRAW_FRAMEBUFFER,U.__webglFramebuffer[0]):t.bindFramebuffer(s.DRAW_FRAMEBUFFER,U.__webglFramebuffer);for(let J=0;J<T.length;J++){if(E.resolveDepthBuffer&&(E.depthBuffer&&(M|=s.DEPTH_BUFFER_BIT),E.stencilBuffer&&E.resolveStencilBuffer&&(M|=s.STENCIL_BUFFER_BIT)),R){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,U.__webglColorRenderbuffer[J]);let Z=n.get(T[J]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,Z,0)}s.blitFramebuffer(0,0,w,N,0,0,w,N,M,s.NEAREST),l===!0&&(te.length=0,pe.length=0,te.push(s.COLOR_ATTACHMENT0+J),E.depthBuffer&&E.resolveDepthBuffer===!1&&(te.push(D),pe.push(D),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,pe)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,te))}if(t.bindFramebuffer(s.READ_FRAMEBUFFER,null),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),R)for(let J=0;J<T.length;J++){t.bindFramebuffer(s.FRAMEBUFFER,U.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+J,s.RENDERBUFFER,U.__webglColorRenderbuffer[J]);let Z=n.get(T[J]).__webglTexture;t.bindFramebuffer(s.FRAMEBUFFER,U.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+J,s.TEXTURE_2D,Z,0)}t.bindFramebuffer(s.DRAW_FRAMEBUFFER,U.__webglMultisampledFramebuffer)}else if(E.depthBuffer&&E.resolveDepthBuffer===!1&&l){let T=E.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[T])}}},this.setupDepthRenderbuffer=xe,this.setupFrameBufferTexture=ue,this.useMultisampledRTT=V,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function H0(s,e){return{convert:function(t,n=br){let i,r=Ce.getTransfer(n);if(t===un)return s.UNSIGNED_BYTE;if(t===Jo)return s.UNSIGNED_SHORT_4_4_4_4;if(t===Zo)return s.UNSIGNED_SHORT_5_5_5_1;if(t===eh)return s.UNSIGNED_INT_5_9_9_9_REV;if(t===th)return s.UNSIGNED_INT_10F_11F_11F_REV;if(t===Qc)return s.BYTE;if(t===$c)return s.SHORT;if(t===is)return s.UNSIGNED_SHORT;if(t===Yo)return s.INT;if(t===Ai)return s.UNSIGNED_INT;if(t===dn)return s.FLOAT;if(t===ti)return s.HALF_FLOAT;if(t===Up)return s.ALPHA;if(t===Op)return s.RGB;if(t===Tn)return s.RGBA;if(t===qi)return s.DEPTH_COMPONENT;if(t===gr)return s.DEPTH_STENCIL;if(t===Qo)return s.RED;if(t===$o)return s.RED_INTEGER;if(t===vr)return s.RG;if(t===nh)return s.RG_INTEGER;if(t===ih)return s.RGBA_INTEGER;if(t===el||t===tl||t===nl||t===il)if(r===nt){if(i=e.get("WEBGL_compressed_texture_s3tc_srgb"),i===null)return null;if(t===el)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(t===tl)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(t===nl)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(t===il)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else{if(i=e.get("WEBGL_compressed_texture_s3tc"),i===null)return null;if(t===el)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(t===tl)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(t===nl)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(t===il)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}if(t===rh||t===sh||t===ah||t===oh){if(i=e.get("WEBGL_compressed_texture_pvrtc"),i===null)return null;if(t===rh)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(t===sh)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(t===ah)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(t===oh)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}if(t===lh||t===ch||t===hh||t===uh||t===dh||t===rl||t===ph){if(i=e.get("WEBGL_compressed_texture_etc"),i===null)return null;if(t===lh||t===ch)return r===nt?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(t===hh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(t===uh)return i.COMPRESSED_R11_EAC;if(t===dh)return i.COMPRESSED_SIGNED_R11_EAC;if(t===rl)return i.COMPRESSED_RG11_EAC;if(t===ph)return i.COMPRESSED_SIGNED_RG11_EAC}if(t===fh||t===mh||t===gh||t===vh||t===bh||t===_h||t===yh||t===xh||t===Mh||t===Sh||t===Th||t===wh||t===Ah||t===Eh){if(i=e.get("WEBGL_compressed_texture_astc"),i===null)return null;if(t===fh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(t===mh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(t===gh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(t===vh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(t===bh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(t===_h)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(t===yh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(t===xh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(t===Mh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(t===Sh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(t===Th)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(t===wh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(t===Ah)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(t===Eh)return r===nt?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}if(t===Rh||t===Ch||t===Ph){if(i=e.get("EXT_texture_compression_bptc"),i===null)return null;if(t===Rh)return r===nt?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(t===Ch)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(t===Ph)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}if(t===Ih||t===Lh||t===sl||t===Dh){if(i=e.get("EXT_texture_compression_rgtc"),i===null)return null;if(t===Ih)return i.COMPRESSED_RED_RGTC1_EXT;if(t===Lh)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(t===sl)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(t===Dh)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}return t===rs?s.UNSIGNED_INT_24_8:s[t]!==void 0?s[t]:null}}}var eu=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new Bs(e.texture);e.depthNear===t.depthNear&&e.depthFar===t.depthFar||(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new cn({vertexShader:`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,fragmentShader:`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new et(new Kr(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},tu=class extends yn{constructor(e,t){super();let n=this,i=null,r=1,a=null,o="local-floor",l=1,c=null,h=null,u=null,d=null,p=null,m=null,f=typeof XRWebGLBinding<"u",_=new eu,g={},v=t.getContextAttributes(),b=null,y=null,S=[],x=[],A=new ne,F=null,L=new vt;L.viewport=new We;let P=new vt;P.viewport=new We;let O=[L,P],B=new Ho,j=null,H=null;function W(te){let pe=x.indexOf(te.inputSource);if(pe===-1)return;let oe=S[pe];oe!==void 0&&(oe.update(te.inputSource,te.frame,c||a),oe.dispatchEvent({type:te.type,data:te.inputSource}))}function Y(){i.removeEventListener("select",W),i.removeEventListener("selectstart",W),i.removeEventListener("selectend",W),i.removeEventListener("squeeze",W),i.removeEventListener("squeezestart",W),i.removeEventListener("squeezeend",W),i.removeEventListener("end",Y),i.removeEventListener("inputsourceschange",K);for(let te=0;te<S.length;te++){let pe=x[te];pe!==null&&(x[te]=null,S[te].disconnect(pe))}j=null,H=null,_.reset();for(let te in g)delete g[te];e.setRenderTarget(b),p=null,d=null,u=null,i=null,y=null,xe.stop(),n.isPresenting=!1,e.setPixelRatio(F),e.setSize(A.width,A.height,!1),n.dispatchEvent({type:"sessionend"})}function K(te){for(let pe=0;pe<te.removed.length;pe++){let oe=te.removed[pe],V=x.indexOf(oe);V>=0&&(x[V]=null,S[V].disconnect(oe))}for(let pe=0;pe<te.added.length;pe++){let oe=te.added[pe],V=x.indexOf(oe);if(V===-1){for(let k=0;k<S.length;k++){if(k>=x.length){x.push(oe),V=k;break}if(x[k]===null){x[k]=oe,V=k;break}}if(V===-1)break}let G=S[V];G&&G.connect(oe)}}this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(te){let pe=S[te];return pe===void 0&&(pe=new jr,S[te]=pe),pe.getTargetRaySpace()},this.getControllerGrip=function(te){let pe=S[te];return pe===void 0&&(pe=new jr,S[te]=pe),pe.getGripSpace()},this.getHand=function(te){let pe=S[te];return pe===void 0&&(pe=new jr,S[te]=pe),pe.getHandSpace()},this.setFramebufferScaleFactor=function(te){r=te,n.isPresenting===!0&&Ae("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(te){o=te,n.isPresenting===!0&&Ae("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(te){c=te},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return u===null&&f&&(u=new XRWebGLBinding(i,t)),u},this.getFrame=function(){return m},this.getSession=function(){return i},this.setSession=async function(te){if(i=te,i!==null){if(b=e.getRenderTarget(),i.addEventListener("select",W),i.addEventListener("selectstart",W),i.addEventListener("selectend",W),i.addEventListener("squeeze",W),i.addEventListener("squeezestart",W),i.addEventListener("squeezeend",W),i.addEventListener("end",Y),i.addEventListener("inputsourceschange",K),v.xrCompatible!==!0&&await t.makeXRCompatible(),F=e.getPixelRatio(),e.getSize(A),f&&"createProjectionLayer"in XRWebGLBinding.prototype){let pe=null,oe=null,V=null;v.depth&&(V=v.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,pe=v.stencil?gr:qi,oe=v.stencil?rs:Ai);let G={colorFormat:t.RGBA8,depthFormat:V,scaleFactor:r};u=this.getBinding(),d=u.createProjectionLayer(G),i.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),y=new an(d.textureWidth,d.textureHeight,{format:Tn,type:un,depthTexture:new wi(d.textureWidth,d.textureHeight,oe,void 0,void 0,void 0,void 0,void 0,void 0,pe),stencilBuffer:v.stencil,colorSpace:e.outputColorSpace,samples:v.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let pe={antialias:v.antialias,alpha:!0,depth:v.depth,stencil:v.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(i,t,pe),i.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),y=new an(p.framebufferWidth,p.framebufferHeight,{format:Tn,type:un,colorSpace:e.outputColorSpace,stencilBuffer:v.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await i.requestReferenceSpace(o),xe.setContext(i),xe.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};let ee=new C,ue=new C;function Se(te,pe){pe===null?te.matrixWorld.copy(te.matrix):te.matrixWorld.multiplyMatrices(pe.matrixWorld,te.matrix),te.matrixWorldInverse.copy(te.matrixWorld).invert()}this.updateCamera=function(te){if(i===null)return;let pe=te.near,oe=te.far;_.texture!==null&&(_.depthNear>0&&(pe=_.depthNear),_.depthFar>0&&(oe=_.depthFar)),B.near=P.near=L.near=pe,B.far=P.far=L.far=oe,j===B.near&&H===B.far||(i.updateRenderState({depthNear:B.near,depthFar:B.far}),j=B.near,H=B.far),B.layers.mask=6|te.layers.mask,L.layers.mask=-5&B.layers.mask,P.layers.mask=-3&B.layers.mask;let V=te.parent,G=B.cameras;Se(B,V);for(let k=0;k<G.length;k++)Se(G[k],V);G.length===2?(function(k,E,T){ee.setFromMatrixPosition(E.matrixWorld),ue.setFromMatrixPosition(T.matrixWorld);let w=ee.distanceTo(ue),N=E.projectionMatrix.elements,M=T.projectionMatrix.elements,D=N[14]/(N[10]-1),U=N[14]/(N[10]+1),R=(N[9]+1)/N[5],z=(N[9]-1)/N[5],J=(N[8]-1)/N[0],Z=(M[8]+1)/M[0],ae=D*J,be=D*Z,ce=w/(-J+Z),se=ce*-J;if(E.matrixWorld.decompose(k.position,k.quaternion,k.scale),k.translateX(se),k.translateZ(ce),k.matrixWorld.compose(k.position,k.quaternion,k.scale),k.matrixWorldInverse.copy(k.matrixWorld).invert(),N[10]===-1)k.projectionMatrix.copy(E.projectionMatrix),k.projectionMatrixInverse.copy(E.projectionMatrixInverse);else{let Te=D+ce,ie=U+ce,he=ae-se,le=be+(w-se),ye=R*U/ie*Te,Ge=z*U/ie*Te;k.projectionMatrix.makePerspective(he,le,ye,Ge,Te,ie),k.projectionMatrixInverse.copy(k.projectionMatrix).invert()}})(B,L,P):B.projectionMatrix.copy(L.projectionMatrix),(function(k,E,T){T===null?k.matrix.copy(E.matrixWorld):(k.matrix.copy(T.matrixWorld),k.matrix.invert(),k.matrix.multiply(E.matrixWorld)),k.matrix.decompose(k.position,k.quaternion,k.scale),k.updateMatrixWorld(!0),k.projectionMatrix.copy(E.projectionMatrix),k.projectionMatrixInverse.copy(E.projectionMatrixInverse),k.isPerspectiveCamera&&(k.fov=2*or*Math.atan(1/k.projectionMatrix.elements[5]),k.zoom=1)})(te,B,V)},this.getCamera=function(){return B},this.getFoveation=function(){if(d!==null||p!==null)return l},this.setFoveation=function(te){l=te,d!==null&&(d.fixedFoveation=te),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=te)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(B)},this.getCameraTexture=function(te){return g[te]};let me=null,xe=new wf;xe.setAnimationLoop(function(te,pe){if(h=pe.getViewerPose(c||a),m=pe,h!==null){let oe=h.views;p!==null&&(e.setRenderTargetFramebuffer(y,p.framebuffer),e.setRenderTarget(y));let V=!1;oe.length!==B.cameras.length&&(B.cameras.length=0,V=!0);for(let k=0;k<oe.length;k++){let E=oe[k],T=null;if(p!==null)T=p.getViewport(E);else{let N=u.getViewSubImage(d,E);T=N.viewport,k===0&&(e.setRenderTargetTextures(y,N.colorTexture,N.depthStencilTexture),e.setRenderTarget(y))}let w=O[k];w===void 0&&(w=new vt,w.layers.enable(k),w.viewport=new We,O[k]=w),w.matrix.fromArray(E.transform.matrix),w.matrix.decompose(w.position,w.quaternion,w.scale),w.projectionMatrix.fromArray(E.projectionMatrix),w.projectionMatrixInverse.copy(w.projectionMatrix).invert(),w.viewport.set(T.x,T.y,T.width,T.height),k===0&&(B.matrix.copy(w.matrix),B.matrix.decompose(B.position,B.quaternion,B.scale)),V===!0&&B.cameras.push(w)}let G=i.enabledFeatures;if(G&&G.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&f){u=n.getBinding();let k=u.getDepthInformation(oe[0]);k&&k.isValid&&k.texture&&_.init(k,i.renderState)}if(G&&G.includes("camera-access")&&f){e.state.unbindTexture(),u=n.getBinding();for(let k=0;k<oe.length;k++){let E=oe[k].camera;if(E){let T=g[E];T||(T=new Bs,g[E]=T);let w=u.getCameraImage(E);T.sourceTexture=w}}}}for(let oe=0;oe<S.length;oe++){let V=x[oe],G=S[oe];V!==null&&G!==void 0&&G.update(V,pe,c||a)}me&&me(te,pe),pe.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:pe}),m=null}),this.setAnimationLoop=function(te){me=te},this.dispose=function(){}}},j0=new ge,If=new Fe;function W0(s,e){function t(i,r){i.matrixAutoUpdate===!0&&i.updateMatrix(),r.value.copy(i.matrix)}function n(i,r){i.opacity.value=r.opacity,r.color&&i.diffuse.value.copy(r.color),r.emissive&&i.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(i.map.value=r.map,t(r.map,i.mapTransform)),r.alphaMap&&(i.alphaMap.value=r.alphaMap,t(r.alphaMap,i.alphaMapTransform)),r.bumpMap&&(i.bumpMap.value=r.bumpMap,t(r.bumpMap,i.bumpMapTransform),i.bumpScale.value=r.bumpScale,r.side===en&&(i.bumpScale.value*=-1)),r.normalMap&&(i.normalMap.value=r.normalMap,t(r.normalMap,i.normalMapTransform),i.normalScale.value.copy(r.normalScale),r.side===en&&i.normalScale.value.negate()),r.displacementMap&&(i.displacementMap.value=r.displacementMap,t(r.displacementMap,i.displacementMapTransform),i.displacementScale.value=r.displacementScale,i.displacementBias.value=r.displacementBias),r.emissiveMap&&(i.emissiveMap.value=r.emissiveMap,t(r.emissiveMap,i.emissiveMapTransform)),r.specularMap&&(i.specularMap.value=r.specularMap,t(r.specularMap,i.specularMapTransform)),r.alphaTest>0&&(i.alphaTest.value=r.alphaTest);let a=e.get(r),o=a.envMap,l=a.envMapRotation;o&&(i.envMap.value=o,i.envMapRotation.value.setFromMatrix4(j0.makeRotationFromEuler(l)).transpose(),o.isCubeTexture&&o.isRenderTargetTexture===!1&&i.envMapRotation.value.premultiply(If),i.reflectivity.value=r.reflectivity,i.ior.value=r.ior,i.refractionRatio.value=r.refractionRatio),r.lightMap&&(i.lightMap.value=r.lightMap,i.lightMapIntensity.value=r.lightMapIntensity,t(r.lightMap,i.lightMapTransform)),r.aoMap&&(i.aoMap.value=r.aoMap,i.aoMapIntensity.value=r.aoMapIntensity,t(r.aoMap,i.aoMapTransform))}return{refreshFogUniforms:function(i,r){r.color.getRGB(i.fogColor.value,Bh(s)),r.isFog?(i.fogNear.value=r.near,i.fogFar.value=r.far):r.isFogExp2&&(i.fogDensity.value=r.density)},refreshMaterialUniforms:function(i,r,a,o,l){r.isNodeMaterial?r.uniformsNeedUpdate=!1:r.isMeshBasicMaterial?n(i,r):r.isMeshLambertMaterial?(n(i,r),r.envMap&&(i.envMapIntensity.value=r.envMapIntensity)):r.isMeshToonMaterial?(n(i,r),(function(c,h){h.gradientMap&&(c.gradientMap.value=h.gradientMap)})(i,r)):r.isMeshPhongMaterial?(n(i,r),(function(c,h){c.specular.value.copy(h.specular),c.shininess.value=Math.max(h.shininess,1e-4)})(i,r),r.envMap&&(i.envMapIntensity.value=r.envMapIntensity)):r.isMeshStandardMaterial?(n(i,r),(function(c,h){c.metalness.value=h.metalness,h.metalnessMap&&(c.metalnessMap.value=h.metalnessMap,t(h.metalnessMap,c.metalnessMapTransform)),c.roughness.value=h.roughness,h.roughnessMap&&(c.roughnessMap.value=h.roughnessMap,t(h.roughnessMap,c.roughnessMapTransform)),h.envMap&&(c.envMapIntensity.value=h.envMapIntensity)})(i,r),r.isMeshPhysicalMaterial&&(function(c,h,u){c.ior.value=h.ior,h.sheen>0&&(c.sheenColor.value.copy(h.sheenColor).multiplyScalar(h.sheen),c.sheenRoughness.value=h.sheenRoughness,h.sheenColorMap&&(c.sheenColorMap.value=h.sheenColorMap,t(h.sheenColorMap,c.sheenColorMapTransform)),h.sheenRoughnessMap&&(c.sheenRoughnessMap.value=h.sheenRoughnessMap,t(h.sheenRoughnessMap,c.sheenRoughnessMapTransform))),h.clearcoat>0&&(c.clearcoat.value=h.clearcoat,c.clearcoatRoughness.value=h.clearcoatRoughness,h.clearcoatMap&&(c.clearcoatMap.value=h.clearcoatMap,t(h.clearcoatMap,c.clearcoatMapTransform)),h.clearcoatRoughnessMap&&(c.clearcoatRoughnessMap.value=h.clearcoatRoughnessMap,t(h.clearcoatRoughnessMap,c.clearcoatRoughnessMapTransform)),h.clearcoatNormalMap&&(c.clearcoatNormalMap.value=h.clearcoatNormalMap,t(h.clearcoatNormalMap,c.clearcoatNormalMapTransform),c.clearcoatNormalScale.value.copy(h.clearcoatNormalScale),h.side===en&&c.clearcoatNormalScale.value.negate())),h.dispersion>0&&(c.dispersion.value=h.dispersion),h.iridescence>0&&(c.iridescence.value=h.iridescence,c.iridescenceIOR.value=h.iridescenceIOR,c.iridescenceThicknessMinimum.value=h.iridescenceThicknessRange[0],c.iridescenceThicknessMaximum.value=h.iridescenceThicknessRange[1],h.iridescenceMap&&(c.iridescenceMap.value=h.iridescenceMap,t(h.iridescenceMap,c.iridescenceMapTransform)),h.iridescenceThicknessMap&&(c.iridescenceThicknessMap.value=h.iridescenceThicknessMap,t(h.iridescenceThicknessMap,c.iridescenceThicknessMapTransform))),h.transmission>0&&(c.transmission.value=h.transmission,c.transmissionSamplerMap.value=u.texture,c.transmissionSamplerSize.value.set(u.width,u.height),h.transmissionMap&&(c.transmissionMap.value=h.transmissionMap,t(h.transmissionMap,c.transmissionMapTransform)),c.thickness.value=h.thickness,h.thicknessMap&&(c.thicknessMap.value=h.thicknessMap,t(h.thicknessMap,c.thicknessMapTransform)),c.attenuationDistance.value=h.attenuationDistance,c.attenuationColor.value.copy(h.attenuationColor)),h.anisotropy>0&&(c.anisotropyVector.value.set(h.anisotropy*Math.cos(h.anisotropyRotation),h.anisotropy*Math.sin(h.anisotropyRotation)),h.anisotropyMap&&(c.anisotropyMap.value=h.anisotropyMap,t(h.anisotropyMap,c.anisotropyMapTransform))),c.specularIntensity.value=h.specularIntensity,c.specularColor.value.copy(h.specularColor),h.specularColorMap&&(c.specularColorMap.value=h.specularColorMap,t(h.specularColorMap,c.specularColorMapTransform)),h.specularIntensityMap&&(c.specularIntensityMap.value=h.specularIntensityMap,t(h.specularIntensityMap,c.specularIntensityMapTransform))})(i,r,l)):r.isMeshMatcapMaterial?(n(i,r),(function(c,h){h.matcap&&(c.matcap.value=h.matcap)})(i,r)):r.isMeshDepthMaterial?n(i,r):r.isMeshDistanceMaterial?(n(i,r),(function(c,h){let u=e.get(h).light;c.referencePosition.value.setFromMatrixPosition(u.matrixWorld),c.nearDistance.value=u.shadow.camera.near,c.farDistance.value=u.shadow.camera.far})(i,r)):r.isMeshNormalMaterial?n(i,r):r.isLineBasicMaterial?((function(c,h){c.diffuse.value.copy(h.color),c.opacity.value=h.opacity,h.map&&(c.map.value=h.map,t(h.map,c.mapTransform))})(i,r),r.isLineDashedMaterial&&(function(c,h){c.dashSize.value=h.dashSize,c.totalSize.value=h.dashSize+h.gapSize,c.scale.value=h.scale})(i,r)):r.isPointsMaterial?(function(c,h,u,d){c.diffuse.value.copy(h.color),c.opacity.value=h.opacity,c.size.value=h.size*u,c.scale.value=.5*d,h.map&&(c.map.value=h.map,t(h.map,c.uvTransform)),h.alphaMap&&(c.alphaMap.value=h.alphaMap,t(h.alphaMap,c.alphaMapTransform)),h.alphaTest>0&&(c.alphaTest.value=h.alphaTest)})(i,r,a,o):r.isSpriteMaterial?(function(c,h){c.diffuse.value.copy(h.color),c.opacity.value=h.opacity,c.rotation.value=h.rotation,h.map&&(c.map.value=h.map,t(h.map,c.mapTransform)),h.alphaMap&&(c.alphaMap.value=h.alphaMap,t(h.alphaMap,c.alphaMapTransform)),h.alphaTest>0&&(c.alphaTest.value=h.alphaTest)})(i,r):r.isShadowMaterial?(i.color.value.copy(r.color),i.opacity.value=r.opacity):r.isShaderMaterial&&(r.uniformsNeedUpdate=!1)}}}function q0(s,e,t,n){let i={},r={},a=[],o=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function l(d,p,m,f){if((function(_,g,v,b){let y=_.value,S=g+"_"+v;if(b[S]===void 0)return typeof y=="number"||typeof y=="boolean"?b[S]=y:ArrayBuffer.isView(y)?b[S]=y.slice():b[S]=y.clone(),!0;{let x=b[S];if(typeof y=="number"||typeof y=="boolean"){if(x!==y)return b[S]=y,!0}else{if(ArrayBuffer.isView(y))return!0;if(x.equals(y)===!1)return x.copy(y),!0}}return!1})(d,p,m,f)===!0){let _=d.__offset,g=d.value;if(Array.isArray(g)){let v=0;for(let b=0;b<g.length;b++){let y=g[b],S=h(y);c(y,d.__data,v),typeof y=="number"||typeof y=="boolean"||y.isMatrix3||ArrayBuffer.isView(y)||(v+=S.storage/Float32Array.BYTES_PER_ELEMENT)}}else c(g,d.__data,0);s.bufferSubData(s.UNIFORM_BUFFER,_,d.__data)}}function c(d,p,m){typeof d=="number"||typeof d=="boolean"?p[0]=d:d.isMatrix3?(p[0]=d.elements[0],p[1]=d.elements[1],p[2]=d.elements[2],p[3]=0,p[4]=d.elements[3],p[5]=d.elements[4],p[6]=d.elements[5],p[7]=0,p[8]=d.elements[6],p[9]=d.elements[7],p[10]=d.elements[8],p[11]=0):ArrayBuffer.isView(d)?p.set(new d.constructor(d.buffer,d.byteOffset,p.length)):d.toArray(p,m)}function h(d){let p={boundary:0,storage:0};return typeof d=="number"||typeof d=="boolean"?(p.boundary=4,p.storage=4):d.isVector2?(p.boundary=8,p.storage=8):d.isVector3||d.isColor?(p.boundary=16,p.storage=12):d.isVector4?(p.boundary=16,p.storage=16):d.isMatrix3?(p.boundary=48,p.storage=48):d.isMatrix4?(p.boundary=64,p.storage=64):d.isTexture?Ae("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(d)?(p.boundary=16,p.storage=d.byteLength):Ae("WebGLRenderer: Unsupported uniform value type.",d),p}function u(d){let p=d.target;p.removeEventListener("dispose",u);let m=a.indexOf(p.__bindingPointIndex);a.splice(m,1),s.deleteBuffer(i[p.id]),delete i[p.id],delete r[p.id]}return{bind:function(d,p){let m=p.program;n.uniformBlockBinding(d,m)},update:function(d,p){let m=i[d.id];m===void 0&&((function(g){let v=g.uniforms,b=0,y=16;for(let x=0,A=v.length;x<A;x++){let F=Array.isArray(v[x])?v[x]:[v[x]];for(let L=0,P=F.length;L<P;L++){let O=F[L],B=Array.isArray(O.value)?O.value:[O.value];for(let j=0,H=B.length;j<H;j++){let W=h(B[j]),Y=b%y,K=Y%W.boundary,ee=Y+K;b+=K,ee!==0&&y-ee<W.storage&&(b+=y-ee),O.__data=new Float32Array(W.storage/Float32Array.BYTES_PER_ELEMENT),O.__offset=b,b+=W.storage}}}let S=b%y;S>0&&(b+=y-S),g.__size=b,g.__cache={}})(d),m=(function(g){let v=(function(){for(let x=0;x<o;x++)if(a.indexOf(x)===-1)return a.push(x),x;return Ie("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0})();g.__bindingPointIndex=v;let b=s.createBuffer(),y=g.__size,S=g.usage;return s.bindBuffer(s.UNIFORM_BUFFER,b),s.bufferData(s.UNIFORM_BUFFER,y,S),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,v,b),b})(d),i[d.id]=m,d.addEventListener("dispose",u));let f=p.program;n.updateUBOMapping(d,f);let _=e.render.frame;r[d.id]!==_&&((function(g){let v=i[g.id],b=g.uniforms,y=g.__cache;s.bindBuffer(s.UNIFORM_BUFFER,v);for(let S=0,x=b.length;S<x;S++){let A=b[S];if(Array.isArray(A))for(let F=0,L=A.length;F<L;F++)l(A[F],S,F,y);else l(A,S,0,y)}s.bindBuffer(s.UNIFORM_BUFFER,null)})(d),r[d.id]=_)},dispose:function(){for(let d in i)s.deleteBuffer(i[d]);a=[],i={},r={}}}}If.set(-1,0,0,0,1,0,0,0,1);var X0=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),ni=null,fl=class{constructor(e={}){let{canvas:t=Xp(),context:n=null,depth:i=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1,outputBufferType:p=un}=e,m;if(this.isWebGLRenderer=!0,n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=n.getContextAttributes().alpha}else m=a;let f=p,_=new Set([ih,nh,$o]),g=new Set([un,Ai,is,rs,Jo,Zo]),v=new Uint32Array(4),b=new Int32Array(4),y=new C,S=null,x=null,A=[],F=[],L=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=zn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let P=this,O=!1,B=null,j=null,H=null,W=null;this._outputColorSpace=Pe;let Y=0,K=0,ee=null,ue=-1,Se=null,me=new We,xe=new We,te=null,pe=new de(0),oe=0,V=t.width,G=t.height,k=1,E=null,T=null,w=new We(0,0,V,G),N=new We(0,0,V,G),M=!1,D=new Mi,U=!1,R=!1,z=new ge,J=new C,Z=new We,ae={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},be=!1;function ce(){return ee===null?k:1}let se,Te,ie,he,le,ye,Ge,Ye,ht,Kt,Re,it,He,Ot,lt,Et,gt,fn,En,Ki,jn,Ci,_a,q=n;function td(I,X){return t.getContext(I,X)}try{let I={alpha:!0,depth:i,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${"185"}`),t.addEventListener("webglcontextlost",id,!1),t.addEventListener("webglcontextrestored",rd,!1),t.addEventListener("webglcontextcreationerror",sd,!1),q===null){let X="webgl2";if(q=td(X,I),q===null)throw td(X)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(I){throw Ie("WebGLRenderer: "+I.message),I}function nd(){se=new yg(q),se.init(),jn=new H0(q,se),Te=new gg(q,se,e,jn),ie=new G0(q,se),Te.reversedDepthBuffer&&d&&ie.buffers.depth.setReversed(!0),j=q.createFramebuffer(),H=q.createFramebuffer(),W=q.createFramebuffer(),he=new Sg(q),le=new P0,ye=new V0(q,se,ie,le,Te,jn,he),Ge=new _g(P),Ye=new ug(q),Ci=new fg(q,Ye),ht=new xg(q,Ye,he,Ci),Kt=new wg(q,ht,Ye,Ci,he),fn=new Tg(q,Te,ye),lt=new vg(le),Re=new C0(P,Ge,se,Te,Ci,lt),it=new W0(P,le),He=new L0,Ot=new O0(se),gt=new pg(P,Ge,ie,Kt,m,l),Et=new z0(P,Kt,Te),_a=new q0(q,he,Te,ie),En=new mg(q,se,he),Ki=new Mg(q,se,he),he.programs=Re.programs,P.capabilities=Te,P.extensions=se,P.properties=le,P.renderLists=He,P.shadowMap=Et,P.state=ie,P.info=he}nd(),f!==un&&(L=new Eg(f,t.width,t.height,o,i,r));let Mt=new tu(P,q);function id(I){I.preventDefault(),Es("WebGLRenderer: Context Lost."),O=!0}function rd(){Es("WebGLRenderer: Context Restored."),O=!1;let I=he.autoReset,X=Et.enabled,Q=Et.autoUpdate,re=Et.needsUpdate,$=Et.type;nd(),he.autoReset=I,Et.enabled=X,Et.autoUpdate=Q,Et.needsUpdate=re,Et.type=$}function sd(I){Ie("WebGLRenderer: A WebGL context could not be created. Reason: ",I.statusMessage)}function ad(I){let X=I.target;X.removeEventListener("dispose",ad),(function(Q){(function(re){let $=le.get(re).programs;$!==void 0&&($.forEach(function(fe){Re.releaseProgram(fe)}),re.isShaderMaterial&&Re.releaseShaderCache(re))})(Q),le.remove(Q)})(X)}function od(I,X,Q){I.transparent===!0&&I.side===Sn&&I.forceSinglePass===!1?(I.side=en,I.needsUpdate=!0,xa(I,X,Q),I.side=$n,I.needsUpdate=!0,xa(I,X,Q),I.side=Sn):xa(I,X,Q)}this.xr=Mt,this.getContext=function(){return q},this.getContextAttributes=function(){return q.getContextAttributes()},this.forceContextLoss=function(){let I=se.get("WEBGL_lose_context");I&&I.loseContext()},this.forceContextRestore=function(){let I=se.get("WEBGL_lose_context");I&&I.restoreContext()},this.getPixelRatio=function(){return k},this.setPixelRatio=function(I){I!==void 0&&(k=I,this.setSize(V,G,!1))},this.getSize=function(I){return I.set(V,G)},this.setSize=function(I,X,Q=!0){Mt.isPresenting?Ae("WebGLRenderer: Can't change size while VR device is presenting."):(V=I,G=X,t.width=Math.floor(I*k),t.height=Math.floor(X*k),Q===!0&&(t.style.width=I+"px",t.style.height=X+"px"),L!==null&&L.setSize(t.width,t.height),this.setViewport(0,0,I,X))},this.getDrawingBufferSize=function(I){return I.set(V*k,G*k).floor()},this.setDrawingBufferSize=function(I,X,Q){V=I,G=X,k=Q,t.width=Math.floor(I*Q),t.height=Math.floor(X*Q),this.setViewport(0,0,I,X)},this.setEffects=function(I){if(f!==un){if(I){for(let X=0;X<I.length;X++)if(I[X].isOutputPass===!0){Ae("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}L.setEffects(I||[])}else Ie("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.")},this.getCurrentViewport=function(I){return I.copy(me)},this.getViewport=function(I){return I.copy(w)},this.setViewport=function(I,X,Q,re){I.isVector4?w.set(I.x,I.y,I.z,I.w):w.set(I,X,Q,re),ie.viewport(me.copy(w).multiplyScalar(k).round())},this.getScissor=function(I){return I.copy(N)},this.setScissor=function(I,X,Q,re){I.isVector4?N.set(I.x,I.y,I.z,I.w):N.set(I,X,Q,re),ie.scissor(xe.copy(N).multiplyScalar(k).round())},this.getScissorTest=function(){return M},this.setScissorTest=function(I){ie.setScissorTest(M=I)},this.setOpaqueSort=function(I){E=I},this.setTransparentSort=function(I){T=I},this.getClearColor=function(I){return I.copy(gt.getClearColor())},this.setClearColor=function(){gt.setClearColor(...arguments)},this.getClearAlpha=function(){return gt.getClearAlpha()},this.setClearAlpha=function(){gt.setClearAlpha(...arguments)},this.clear=function(I=!0,X=!0,Q=!0){let re=0;if(I){let $=!1;if(ee!==null){let fe=ee.texture.format;$=_.has(fe)}if($){let fe=ee.texture.type,Me=g.has(fe),we=gt.getClearColor(),Ee=gt.getClearAlpha(),Ne=we.r,Ke=we.g,Je=we.b;Me?(v[0]=Ne,v[1]=Ke,v[2]=Je,v[3]=Ee,q.clearBufferuiv(q.COLOR,0,v)):(b[0]=Ne,b[1]=Ke,b[2]=Je,b[3]=Ee,q.clearBufferiv(q.COLOR,0,b))}else re|=q.COLOR_BUFFER_BIT}X&&(re|=q.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),Q&&(re|=q.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),re!==0&&q.clear(re)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(I){I.setRenderer(this),B=I},this.dispose=function(){t.removeEventListener("webglcontextlost",id,!1),t.removeEventListener("webglcontextrestored",rd,!1),t.removeEventListener("webglcontextcreationerror",sd,!1),gt.dispose(),He.dispose(),Ot.dispose(),le.dispose(),Ge.dispose(),Kt.dispose(),Ci.dispose(),_a.dispose(),Re.dispose(),Mt.dispose(),Mt.removeEventListener("sessionstart",ld),Mt.removeEventListener("sessionend",cd),Yi.stop()},this.renderBufferDirect=function(I,X,Q,re,$,fe){X===null&&(X=ae);let Me=$.isMesh&&$.matrixWorld.determinantAffine()<0,we=(function(qe,dt,Bt,Ue,Be){dt.isScene!==!0&&(dt=ae),ye.resetTextureUnits();let Rn=dt.fog,Ol=Ue.isMeshStandardMaterial||Ue.isMeshLambertMaterial||Ue.isMeshPhongMaterial?dt.environment:null,Ma=ee===null?P.outputColorSpace:ee.isXRRenderTarget===!0?ee.texture.colorSpace:Ce.workingColorSpace,ds=Ue.isMeshStandardMaterial||Ue.isMeshLambertMaterial&&!Ue.envMap||Ue.isMeshPhongMaterial&&!Ue.envMap,Wn=Ge.get(Ue.envMap||Ol,ds),xr=Ue.vertexColors===!0&&!!Bt.attributes.color&&Bt.attributes.color.itemSize===4,ai=!!Bt.attributes.tangent&&(!!Ue.normalMap||Ue.anisotropy>0),Bl=!!Bt.morphAttributes.position,Mr=!!Bt.morphAttributes.normal,pm=!!Bt.morphAttributes.color,md=zn;Ue.toneMapped&&(ee!==null&&ee.isXRRenderTarget!==!0||(md=P.toneMapping));let gd=Bt.morphAttributes.position||Bt.morphAttributes.normal||Bt.morphAttributes.color,fm=gd!==void 0?gd.length:0,Oe=le.get(Ue),Ji=x.state.lights;if(U===!0&&(R===!0||qe!==Se)){let Tt=qe===Se&&Ue.id===ue;lt.setState(Ue,qe,Tt)}let Cn=!1;Ue.version===Oe.__version?Oe.needsLights&&Oe.lightsStateVersion!==Ji.state.version||Oe.outputColorSpace!==Ma||Be.isBatchedMesh&&Oe.batching===!1?Cn=!0:Be.isBatchedMesh||Oe.batching!==!0?Be.isBatchedMesh&&Oe.batchingColor===!0&&Be.colorTexture===null||Be.isBatchedMesh&&Oe.batchingColor===!1&&Be.colorTexture!==null||Be.isInstancedMesh&&Oe.instancing===!1?Cn=!0:Be.isInstancedMesh||Oe.instancing!==!0?Be.isSkinnedMesh&&Oe.skinning===!1?Cn=!0:Be.isSkinnedMesh||Oe.skinning!==!0?Be.isInstancedMesh&&Oe.instancingColor===!0&&Be.instanceColor===null||Be.isInstancedMesh&&Oe.instancingColor===!1&&Be.instanceColor!==null||Be.isInstancedMesh&&Oe.instancingMorph===!0&&Be.morphTexture===null||Be.isInstancedMesh&&Oe.instancingMorph===!1&&Be.morphTexture!==null||Oe.envMap!==Wn||Ue.fog===!0&&Oe.fog!==Rn?Cn=!0:Oe.numClippingPlanes===void 0||Oe.numClippingPlanes===lt.numPlanes&&Oe.numIntersection===lt.numIntersection?(Oe.vertexAlphas!==xr||Oe.vertexTangents!==ai||Oe.morphTargets!==Bl||Oe.morphNormals!==Mr||Oe.morphColors!==pm||Oe.toneMapping!==md||Oe.morphTargetsCount!==fm||!!Oe.lightProbeGrid!=x.state.lightProbeGridArray.length>0)&&(Cn=!0):Cn=!0:Cn=!0:Cn=!0:Cn=!0:(Cn=!0,Oe.__version=Ue.version);let Pi=Oe.currentProgram;Cn===!0&&(Pi=xa(Ue,dt,Be),B&&Ue.isNodeMaterial&&B.onUpdateProgram(Ue,Pi,Oe));let vd=!1,Sr=!1,kl=!1,pt=Pi.getUniforms(),mn=Oe.uniforms;if(ie.useProgram(Pi.program)&&(vd=!0,Sr=!0,kl=!0),Ue.id!==ue&&(ue=Ue.id,Sr=!0),Oe.needsLights){let Tt=(function(Xn,Gl){if(Xn.length===0)return null;if(Xn.length===1)return Xn[0].texture!==null?Xn[0]:null;y.setFromMatrixPosition(Gl.matrixWorld);for(let Tr=0,mm=Xn.length;Tr<mm;Tr++){let Vl=Xn[Tr];if(Vl.texture!==null&&Vl.boundingBox.containsPoint(y))return Vl}return null})(x.state.lightProbeGridArray,Be);Oe.lightProbeGrid!==Tt&&(Oe.lightProbeGrid=Tt,Sr=!0)}if(vd||Se!==qe){ie.buffers.depth.getReversed()&&qe.reversedDepth!==!0&&(qe._reversedDepth=!0,qe.updateProjectionMatrix()),pt.setValue(q,"projectionMatrix",qe.projectionMatrix),pt.setValue(q,"viewMatrix",qe.matrixWorldInverse);let Tt=pt.map.cameraPosition;Tt!==void 0&&Tt.setValue(q,J.setFromMatrixPosition(qe.matrixWorld)),Te.logarithmicDepthBuffer&&pt.setValue(q,"logDepthBufFC",2/(Math.log(qe.far+1)/Math.LN2)),(Ue.isMeshPhongMaterial||Ue.isMeshToonMaterial||Ue.isMeshLambertMaterial||Ue.isMeshBasicMaterial||Ue.isMeshStandardMaterial||Ue.isShaderMaterial)&&pt.setValue(q,"isOrthographic",qe.isOrthographicCamera===!0),Se!==qe&&(Se=qe,Sr=!0,kl=!0)}if(Oe.needsLights&&(Ji.state.directionalShadowMap.length>0&&pt.setValue(q,"directionalShadowMap",Ji.state.directionalShadowMap,ye),Ji.state.spotShadowMap.length>0&&pt.setValue(q,"spotShadowMap",Ji.state.spotShadowMap,ye),Ji.state.pointShadowMap.length>0&&pt.setValue(q,"pointShadowMap",Ji.state.pointShadowMap,ye)),Be.isSkinnedMesh){pt.setOptional(q,Be,"bindMatrix"),pt.setOptional(q,Be,"bindMatrixInverse");let Tt=Be.skeleton;Tt&&(Tt.boneTexture===null&&Tt.computeBoneTexture(),pt.setValue(q,"boneTexture",Tt.boneTexture,ye))}Be.isBatchedMesh&&(pt.setOptional(q,Be,"batchingTexture"),pt.setValue(q,"batchingTexture",Be._matricesTexture,ye),pt.setOptional(q,Be,"batchingIdTexture"),pt.setValue(q,"batchingIdTexture",Be._indirectTexture,ye),pt.setOptional(q,Be,"batchingColorTexture"),Be._colorsTexture!==null&&pt.setValue(q,"batchingColorTexture",Be._colorsTexture,ye));let zl=Bt.morphAttributes;if(zl.position===void 0&&zl.normal===void 0&&zl.color===void 0||fn.update(Be,Bt,Pi),(Sr||Oe.receiveShadow!==Be.receiveShadow)&&(Oe.receiveShadow=Be.receiveShadow,pt.setValue(q,"receiveShadow",Be.receiveShadow)),(Ue.isMeshStandardMaterial||Ue.isMeshLambertMaterial||Ue.isMeshPhongMaterial)&&Ue.envMap===null&&dt.environment!==null&&(mn.envMapIntensity.value=dt.environmentIntensity),mn.dfgLUT!==void 0&&(mn.dfgLUT.value=(ni===null&&(ni=new Wr(X0,16,16,vr,ti),ni.name="DFG_LUT",ni.minFilter=ct,ni.magFilter=ct,ni.wrapS=qt,ni.wrapT=qt,ni.generateMipmaps=!1,ni.needsUpdate=!0),ni)),Sr){if(pt.setValue(q,"toneMappingExposure",P.toneMappingExposure),Oe.needsLights&&(Pn=kl,(qn=mn).ambientLightColor.needsUpdate=Pn,qn.lightProbe.needsUpdate=Pn,qn.directionalLights.needsUpdate=Pn,qn.directionalLightShadows.needsUpdate=Pn,qn.pointLights.needsUpdate=Pn,qn.pointLightShadows.needsUpdate=Pn,qn.spotLights.needsUpdate=Pn,qn.spotLightShadows.needsUpdate=Pn,qn.rectAreaLights.needsUpdate=Pn,qn.hemisphereLights.needsUpdate=Pn),Rn&&Ue.fog===!0&&it.refreshFogUniforms(mn,Rn),it.refreshMaterialUniforms(mn,Ue,k,G,x.state.transmissionRenderTarget[qe.id]),Oe.needsLights&&Oe.lightProbeGrid){let Tt=Oe.lightProbeGrid;mn.probesSH.value=Tt.texture,mn.probesMin.value.copy(Tt.boundingBox.min),mn.probesMax.value.copy(Tt.boundingBox.max),mn.probesResolution.value.copy(Tt.resolution)}os.upload(q,pd(Oe),mn,ye)}var qn,Pn;if(Ue.isShaderMaterial&&Ue.uniformsNeedUpdate===!0&&(os.upload(q,pd(Oe),mn,ye),Ue.uniformsNeedUpdate=!1),Ue.isSpriteMaterial&&pt.setValue(q,"center",Be.center),pt.setValue(q,"modelViewMatrix",Be.modelViewMatrix),pt.setValue(q,"normalMatrix",Be.normalMatrix),pt.setValue(q,"modelMatrix",Be.matrixWorld),Ue.uniformsGroups!==void 0){let Tt=Ue.uniformsGroups;for(let Xn=0,Gl=Tt.length;Xn<Gl;Xn++){let Tr=Tt[Xn];_a.update(Tr,Pi),_a.bind(Tr,Pi)}}return Pi})(I,X,Q,re,$);ie.setMaterial(re,Me);let Ee=Q.index,Ne=1;if(re.wireframe===!0){if(Ee=ht.getWireframeAttribute(Q),Ee===void 0)return;Ne=2}let Ke=Q.drawRange,Je=Q.attributes.position,Le=Ke.start*Ne,Qe=(Ke.start+Ke.count)*Ne;fe!==null&&(Le=Math.max(Le,fe.start*Ne),Qe=Math.min(Qe,(fe.start+fe.count)*Ne)),Ee!==null?(Le=Math.max(Le,0),Qe=Math.min(Qe,Ee.count)):Je!=null&&(Le=Math.max(Le,0),Qe=Math.min(Qe,Je.count));let Rt=Qe-Le;if(Rt<0||Rt===1/0)return;let St;Ci.setup($,re,we,Q,Ee);let ut=En;if(Ee!==null&&(St=Ye.get(Ee),ut=Ki,ut.setIndex(St)),$.isMesh)re.wireframe===!0?(ie.setLineWidth(re.wireframeLinewidth*ce()),ut.setMode(q.LINES)):ut.setMode(q.TRIANGLES);else if($.isLine){let qe=re.linewidth;qe===void 0&&(qe=1),ie.setLineWidth(qe*ce()),$.isLineSegments?ut.setMode(q.LINES):$.isLineLoop?ut.setMode(q.LINE_LOOP):ut.setMode(q.LINE_STRIP)}else $.isPoints?ut.setMode(q.POINTS):$.isSprite&&ut.setMode(q.TRIANGLES);if($.isBatchedMesh)if(se.get("WEBGL_multi_draw"))ut.renderMultiDraw($._multiDrawStarts,$._multiDrawCounts,$._multiDrawCount);else{let qe=$._multiDrawStarts,dt=$._multiDrawCounts,Bt=$._multiDrawCount,Ue=Ee?Ye.get(Ee).bytesPerElement:1,Be=le.get(re).currentProgram.getUniforms();for(let Rn=0;Rn<Bt;Rn++)Be.setValue(q,"_gl_DrawID",Rn),ut.render(qe[Rn]/Ue,dt[Rn])}else if($.isInstancedMesh)ut.renderInstances(Le,Rt,$.count);else if(Q.isInstancedBufferGeometry){let qe=Q._maxInstanceCount!==void 0?Q._maxInstanceCount:1/0,dt=Math.min(Q.instanceCount,qe);ut.renderInstances(Le,Rt,dt)}else ut.render(Le,Rt)},this.compile=function(I,X,Q=null){Q===null&&(Q=I),x=Ot.get(Q),x.init(X),F.push(x),Q.traverseVisible(function($){$.isLight&&$.layers.test(X.layers)&&(x.pushLight($),$.castShadow&&x.pushShadow($))}),I!==Q&&I.traverseVisible(function($){$.isLight&&$.layers.test(X.layers)&&(x.pushLight($),$.castShadow&&x.pushShadow($))}),x.setupLights();let re=new Set;return I.traverse(function($){if(!($.isMesh||$.isPoints||$.isLine||$.isSprite))return;let fe=$.material;if(fe)if(Array.isArray(fe))for(let Me=0;Me<fe.length;Me++){let we=fe[Me];od(we,Q,$),re.add(we)}else od(fe,Q,$),re.add(fe)}),x=F.pop(),re},this.compileAsync=function(I,X,Q=null){let re=this.compile(I,X,Q);return new Promise($=>{function fe(){re.forEach(function(Me){le.get(Me).currentProgram.isReady()&&re.delete(Me)}),re.size!==0?setTimeout(fe,10):$(I)}se.get("KHR_parallel_shader_compile")!==null?fe():setTimeout(fe,10)})};let Nl=null;function ld(){Yi.stop()}function cd(){Yi.start()}let Yi=new wf;function Ul(I,X,Q,re){if(I.visible===!1)return;if(I.layers.test(X.layers)){if(I.isGroup)Q=I.renderOrder;else if(I.isLOD)I.autoUpdate===!0&&I.update(X);else if(I.isLightProbeGrid)x.pushLightProbeGrid(I);else if(I.isLight)x.pushLight(I),I.castShadow&&x.pushShadow(I);else if(I.isSprite){if(!I.frustumCulled||D.intersectsSprite(I)){re&&Z.setFromMatrixPosition(I.matrixWorld).applyMatrix4(z);let fe=Kt.update(I),Me=I.material;Me.visible&&S.push(I,fe,Me,Q,Z.z,null)}}else if((I.isMesh||I.isLine||I.isPoints)&&(!I.frustumCulled||D.intersectsObject(I))){let fe=Kt.update(I),Me=I.material;if(re&&(I.boundingSphere!==void 0?(I.boundingSphere===null&&I.computeBoundingSphere(),Z.copy(I.boundingSphere.center)):(fe.boundingSphere===null&&fe.computeBoundingSphere(),Z.copy(fe.boundingSphere.center)),Z.applyMatrix4(I.matrixWorld).applyMatrix4(z)),Array.isArray(Me)){let we=fe.groups;for(let Ee=0,Ne=we.length;Ee<Ne;Ee++){let Ke=we[Ee],Je=Me[Ke.materialIndex];Je&&Je.visible&&S.push(I,fe,Je,Q,Z.z,Ke)}}else Me.visible&&S.push(I,fe,Me,Q,Z.z,null)}}let $=I.children;for(let fe=0,Me=$.length;fe<Me;fe++)Ul($[fe],X,Q,re)}function hd(I,X,Q,re){let{opaque:$,transmissive:fe,transparent:Me}=I;x.setupLightsView(Q),U===!0&&lt.setGlobalState(P.clippingPlanes,Q),re&&ie.viewport(me.copy(re)),$.length>0&&ya($,X,Q),fe.length>0&&ya(fe,X,Q),Me.length>0&&ya(Me,X,Q),ie.buffers.depth.setTest(!0),ie.buffers.depth.setMask(!0),ie.buffers.color.setMask(!0),ie.setPolygonOffset(!1)}function ud(I,X,Q,re){if((Q.isScene===!0?Q.overrideMaterial:null)!==null)return;if(x.state.transmissionRenderTarget[re.id]===void 0){let Je=se.has("EXT_color_buffer_half_float")||se.has("EXT_color_buffer_float");x.state.transmissionRenderTarget[re.id]=new an(1,1,{generateMipmaps:!0,type:Je?ti:un,minFilter:hn,samples:Math.max(4,Te.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Ce.workingColorSpace})}let $=x.state.transmissionRenderTarget[re.id],fe=re.viewport||me;$.setSize(fe.z*P.transmissionResolutionScale,fe.w*P.transmissionResolutionScale);let Me=P.getRenderTarget(),we=P.getActiveCubeFace(),Ee=P.getActiveMipmapLevel();P.setRenderTarget($),P.getClearColor(pe),oe=P.getClearAlpha(),oe<1&&P.setClearColor(16777215,.5),P.clear(),be&&gt.render(Q);let Ne=P.toneMapping;P.toneMapping=zn;let Ke=re.viewport;if(re.viewport!==void 0&&(re.viewport=void 0),x.setupLightsView(re),U===!0&&lt.setGlobalState(P.clippingPlanes,re),ya(I,Q,re),ye.updateMultisampleRenderTarget($),ye.updateRenderTargetMipmap($),se.has("WEBGL_multisampled_render_to_texture")===!1){let Je=!1;for(let Le=0,Qe=X.length;Le<Qe;Le++){let Rt=X[Le],{object:St,geometry:ut,material:qe,group:dt}=Rt;if(qe.side===Sn&&St.layers.test(re.layers)){let Bt=qe.side;qe.side=en,qe.needsUpdate=!0,dd(St,Q,re,ut,qe,dt),qe.side=Bt,qe.needsUpdate=!0,Je=!0}}Je===!0&&(ye.updateMultisampleRenderTarget($),ye.updateRenderTargetMipmap($))}P.setRenderTarget(Me,we,Ee),P.setClearColor(pe,oe),Ke!==void 0&&(re.viewport=Ke),P.toneMapping=Ne}function ya(I,X,Q){let re=X.isScene===!0?X.overrideMaterial:null;for(let $=0,fe=I.length;$<fe;$++){let Me=I[$],{object:we,geometry:Ee,group:Ne}=Me,Ke=Me.material;Ke.allowOverride===!0&&re!==null&&(Ke=re),we.layers.test(Q.layers)&&dd(we,X,Q,Ee,Ke,Ne)}}function dd(I,X,Q,re,$,fe){I.onBeforeRender(P,X,Q,re,$,fe),I.modelViewMatrix.multiplyMatrices(Q.matrixWorldInverse,I.matrixWorld),I.normalMatrix.getNormalMatrix(I.modelViewMatrix),$.onBeforeRender(P,X,Q,re,I,fe),$.transparent===!0&&$.side===Sn&&$.forceSinglePass===!1?($.side=en,$.needsUpdate=!0,P.renderBufferDirect(Q,X,re,$,I,fe),$.side=$n,$.needsUpdate=!0,P.renderBufferDirect(Q,X,re,$,I,fe),$.side=Sn):P.renderBufferDirect(Q,X,re,$,I,fe),I.onAfterRender(P,X,Q,re,$,fe)}function xa(I,X,Q){X.isScene!==!0&&(X=ae);let re=le.get(I),$=x.state.lights,fe=x.state.shadowsArray,Me=$.state.version,we=Re.getParameters(I,$.state,fe,X,Q,x.state.lightProbeGridArray),Ee=Re.getProgramCacheKey(we),Ne=re.programs;re.environment=I.isMeshStandardMaterial||I.isMeshLambertMaterial||I.isMeshPhongMaterial?X.environment:null,re.fog=X.fog;let Ke=I.isMeshStandardMaterial||I.isMeshLambertMaterial&&!I.envMap||I.isMeshPhongMaterial&&!I.envMap;re.envMap=Ge.get(I.envMap||re.environment,Ke),re.envMapRotation=re.environment!==null&&I.envMap===null?X.environmentRotation:I.envMapRotation,Ne===void 0&&(I.addEventListener("dispose",ad),Ne=new Map,re.programs=Ne);let Je=Ne.get(Ee);if(Je!==void 0){if(re.currentProgram===Je&&re.lightsStateVersion===Me)return fd(I,we),Je}else we.uniforms=Re.getUniforms(I),B!==null&&I.isNodeMaterial&&B.build(I,Q,we),I.onBeforeCompile(we,P),Je=Re.acquireProgram(we,Ee),Ne.set(Ee,Je),re.uniforms=we.uniforms;let Le=re.uniforms;return(I.isShaderMaterial||I.isRawShaderMaterial)&&I.clipping!==!0||(Le.clippingPlanes=lt.uniform),fd(I,we),re.needsLights=(function(Qe){return Qe.isMeshLambertMaterial||Qe.isMeshToonMaterial||Qe.isMeshPhongMaterial||Qe.isMeshStandardMaterial||Qe.isShadowMaterial||Qe.isShaderMaterial&&Qe.lights===!0})(I),re.lightsStateVersion=Me,re.needsLights&&(Le.ambientLightColor.value=$.state.ambient,Le.lightProbe.value=$.state.probe,Le.directionalLights.value=$.state.directional,Le.directionalLightShadows.value=$.state.directionalShadow,Le.spotLights.value=$.state.spot,Le.spotLightShadows.value=$.state.spotShadow,Le.rectAreaLights.value=$.state.rectArea,Le.ltc_1.value=$.state.rectAreaLTC1,Le.ltc_2.value=$.state.rectAreaLTC2,Le.pointLights.value=$.state.point,Le.pointLightShadows.value=$.state.pointShadow,Le.hemisphereLights.value=$.state.hemi,Le.directionalShadowMatrix.value=$.state.directionalShadowMatrix,Le.spotLightMatrix.value=$.state.spotLightMatrix,Le.spotLightMap.value=$.state.spotLightMap,Le.pointShadowMatrix.value=$.state.pointShadowMatrix),re.lightProbeGrid=x.state.lightProbeGridArray.length>0,re.currentProgram=Je,re.uniformsList=null,Je}function pd(I){if(I.uniformsList===null){let X=I.currentProgram.getUniforms();I.uniformsList=os.seqWithValue(X.seq,I.uniforms)}return I.uniformsList}function fd(I,X){let Q=le.get(I);Q.outputColorSpace=X.outputColorSpace,Q.batching=X.batching,Q.batchingColor=X.batchingColor,Q.instancing=X.instancing,Q.instancingColor=X.instancingColor,Q.instancingMorph=X.instancingMorph,Q.skinning=X.skinning,Q.morphTargets=X.morphTargets,Q.morphNormals=X.morphNormals,Q.morphColors=X.morphColors,Q.morphTargetsCount=X.morphTargetsCount,Q.numClippingPlanes=X.numClippingPlanes,Q.numIntersection=X.numClipIntersection,Q.vertexAlphas=X.vertexAlphas,Q.vertexTangents=X.vertexTangents,Q.toneMapping=X.toneMapping}Yi.setAnimationLoop(function(I){Nl&&Nl(I)}),typeof self<"u"&&Yi.setContext(self),this.setAnimationLoop=function(I){Nl=I,Mt.setAnimationLoop(I),I===null?Yi.stop():Yi.start()},Mt.addEventListener("sessionstart",ld),Mt.addEventListener("sessionend",cd),this.render=function(I,X){if(X!==void 0&&X.isCamera!==!0)return void Ie("WebGLRenderer.render: camera is not an instance of THREE.Camera.");if(O===!0)return;B!==null&&B.renderStart(I,X);let Q=Mt.enabled===!0&&Mt.isPresenting===!0,re=L!==null&&(ee===null||Q)&&L.begin(P,ee);if(I.matrixWorldAutoUpdate===!0&&I.updateMatrixWorld(),X.parent===null&&X.matrixWorldAutoUpdate===!0&&X.updateMatrixWorld(),Mt.enabled!==!0||Mt.isPresenting!==!0||L!==null&&L.isCompositing()!==!1||(Mt.cameraAutoUpdate===!0&&Mt.updateCamera(X),X=Mt.getCamera()),I.isScene===!0&&I.onBeforeRender(P,I,X,ee),x=Ot.get(I,F.length),x.init(X),x.state.textureUnits=ye.getTextureUnits(),F.push(x),z.multiplyMatrices(X.projectionMatrix,X.matrixWorldInverse),D.setFromProjectionMatrix(z,bi,X.reversedDepth),R=this.localClippingEnabled,U=lt.init(this.clippingPlanes,R),S=He.get(I,A.length),S.init(),A.push(S),Mt.enabled===!0&&Mt.isPresenting===!0){let fe=P.xr.getDepthSensingMesh();fe!==null&&Ul(fe,X,-1/0,P.sortObjects)}Ul(I,X,0,P.sortObjects),S.finish(),P.sortObjects===!0&&S.sort(E,T,X.reversedDepth),be=Mt.enabled===!1||Mt.isPresenting===!1||Mt.hasDepthSensing()===!1,be&&gt.addToRenderList(S,I),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),U===!0&&lt.beginShadows();let $=x.state.shadowsArray;if(Et.render($,I,X),U===!0&&lt.endShadows(),(re&&L.hasRenderPass())===!1){let fe=S.opaque,Me=S.transmissive;if(x.setupLights(),X.isArrayCamera){let we=X.cameras;if(Me.length>0)for(let Ee=0,Ne=we.length;Ee<Ne;Ee++)ud(fe,Me,I,we[Ee]);be&&gt.render(I);for(let Ee=0,Ne=we.length;Ee<Ne;Ee++){let Ke=we[Ee];hd(S,I,Ke,Ke.viewport)}}else Me.length>0&&ud(fe,Me,I,X),be&&gt.render(I),hd(S,I,X)}ee!==null&&K===0&&(ye.updateMultisampleRenderTarget(ee),ye.updateRenderTargetMipmap(ee)),re&&L.end(P),I.isScene===!0&&I.onAfterRender(P,I,X),Ci.resetDefaultState(),ue=-1,Se=null,F.pop(),F.length>0?(x=F[F.length-1],ye.setTextureUnits(x.state.textureUnits),U===!0&&lt.setGlobalState(P.clippingPlanes,x.state.camera)):x=null,A.pop(),S=A.length>0?A[A.length-1]:null,B!==null&&B.renderEnd()},this.getActiveCubeFace=function(){return Y},this.getActiveMipmapLevel=function(){return K},this.getRenderTarget=function(){return ee},this.setRenderTargetTextures=function(I,X,Q){let re=le.get(I);re.__autoAllocateDepthBuffer=I.resolveDepthBuffer===!1,re.__autoAllocateDepthBuffer===!1&&(re.__useRenderToTexture=!1),le.get(I.texture).__webglTexture=X,le.get(I.depthTexture).__webglTexture=re.__autoAllocateDepthBuffer?void 0:Q,re.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(I,X){let Q=le.get(I);Q.__webglFramebuffer=X,Q.__useDefaultFramebuffer=X===void 0},this.setRenderTarget=function(I,X=0,Q=0){ee=I,Y=X,K=Q;let re=null,$=!1,fe=!1;if(I){let Me=le.get(I);if(Me.__useDefaultFramebuffer!==void 0)return ie.bindFramebuffer(q.FRAMEBUFFER,Me.__webglFramebuffer),me.copy(I.viewport),xe.copy(I.scissor),te=I.scissorTest,ie.viewport(me),ie.scissor(xe),ie.setScissorTest(te),void(ue=-1);if(Me.__webglFramebuffer===void 0)ye.setupRenderTarget(I);else if(Me.__hasExternalTextures)ye.rebindTextures(I,le.get(I.texture).__webglTexture,le.get(I.depthTexture).__webglTexture);else if(I.depthBuffer){let Ne=I.depthTexture;if(Me.__boundDepthTexture!==Ne){if(Ne!==null&&le.has(Ne)&&(I.width!==Ne.image.width||I.height!==Ne.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");ye.setupDepthRenderbuffer(I)}}let we=I.texture;(we.isData3DTexture||we.isDataArrayTexture||we.isCompressedArrayTexture)&&(fe=!0);let Ee=le.get(I).__webglFramebuffer;I.isWebGLCubeRenderTarget?(re=Array.isArray(Ee[X])?Ee[X][Q]:Ee[X],$=!0):re=I.samples>0&&ye.useMultisampledRTT(I)===!1?le.get(I).__webglMultisampledFramebuffer:Array.isArray(Ee)?Ee[Q]:Ee,me.copy(I.viewport),xe.copy(I.scissor),te=I.scissorTest}else me.copy(w).multiplyScalar(k).floor(),xe.copy(N).multiplyScalar(k).floor(),te=M;if(Q!==0&&(re=j),ie.bindFramebuffer(q.FRAMEBUFFER,re)&&ie.drawBuffers(I,re),ie.viewport(me),ie.scissor(xe),ie.setScissorTest(te),$){let Me=le.get(I.texture);q.framebufferTexture2D(q.FRAMEBUFFER,q.COLOR_ATTACHMENT0,q.TEXTURE_CUBE_MAP_POSITIVE_X+X,Me.__webglTexture,Q)}else if(fe){let Me=X;for(let we=0;we<I.textures.length;we++){let Ee=le.get(I.textures[we]);q.framebufferTextureLayer(q.FRAMEBUFFER,q.COLOR_ATTACHMENT0+we,Ee.__webglTexture,Q,Me)}}else if(I!==null&&Q!==0){let Me=le.get(I.texture);q.framebufferTexture2D(q.FRAMEBUFFER,q.COLOR_ATTACHMENT0,q.TEXTURE_2D,Me.__webglTexture,Q)}ue=-1},this.readRenderTargetPixels=function(I,X,Q,re,$,fe,Me,we=0){if(!I||!I.isWebGLRenderTarget)return void Ie("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Ee=le.get(I).__webglFramebuffer;if(I.isWebGLCubeRenderTarget&&Me!==void 0&&(Ee=Ee[Me]),Ee){ie.bindFramebuffer(q.FRAMEBUFFER,Ee);try{let Ne=I.textures[we],Ke=Ne.format,Je=Ne.type;if(I.textures.length>1&&q.readBuffer(q.COLOR_ATTACHMENT0+we),!Te.textureFormatReadable(Ke))return void Ie("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");if(!Te.textureTypeReadable(Je))return void Ie("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");X>=0&&X<=I.width-re&&Q>=0&&Q<=I.height-$&&q.readPixels(X,Q,re,$,jn.convert(Ke),jn.convert(Je),fe)}finally{let Ne=ee!==null?le.get(ee).__webglFramebuffer:null;ie.bindFramebuffer(q.FRAMEBUFFER,Ne)}}},this.readRenderTargetPixelsAsync=async function(I,X,Q,re,$,fe,Me,we=0){if(!I||!I.isWebGLRenderTarget)throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Ee=le.get(I).__webglFramebuffer;if(I.isWebGLCubeRenderTarget&&Me!==void 0&&(Ee=Ee[Me]),Ee){if(X>=0&&X<=I.width-re&&Q>=0&&Q<=I.height-$){ie.bindFramebuffer(q.FRAMEBUFFER,Ee);let Ne=I.textures[we],Ke=Ne.format,Je=Ne.type;if(I.textures.length>1&&q.readBuffer(q.COLOR_ATTACHMENT0+we),!Te.textureFormatReadable(Ke))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!Te.textureTypeReadable(Je))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Le=q.createBuffer();q.bindBuffer(q.PIXEL_PACK_BUFFER,Le),q.bufferData(q.PIXEL_PACK_BUFFER,fe.byteLength,q.STREAM_READ),q.readPixels(X,Q,re,$,jn.convert(Ke),jn.convert(Je),0);let Qe=ee!==null?le.get(ee).__webglFramebuffer:null;ie.bindFramebuffer(q.FRAMEBUFFER,Qe);let Rt=q.fenceSync(q.SYNC_GPU_COMMANDS_COMPLETE,0);return q.flush(),await Yp(q,Rt,4),q.bindBuffer(q.PIXEL_PACK_BUFFER,Le),q.getBufferSubData(q.PIXEL_PACK_BUFFER,0,fe),q.deleteBuffer(Le),q.deleteSync(Rt),fe}throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(I,X=null,Q=0){let re=Math.pow(2,-Q),$=Math.floor(I.image.width*re),fe=Math.floor(I.image.height*re),Me=X!==null?X.x:0,we=X!==null?X.y:0;ye.setTexture2D(I,0),q.copyTexSubImage2D(q.TEXTURE_2D,Q,0,0,Me,we,$,fe),ie.unbindTexture()},this.copyTextureToTexture=function(I,X,Q=null,re=null,$=0,fe=0){let Me,we,Ee,Ne,Ke,Je,Le,Qe,Rt,St=I.isCompressedTexture?I.mipmaps[fe]:I.image;if(Q!==null)Me=Q.max.x-Q.min.x,we=Q.max.y-Q.min.y,Ee=Q.isBox3?Q.max.z-Q.min.z:1,Ne=Q.min.x,Ke=Q.min.y,Je=Q.isBox3?Q.min.z:0;else{let Wn=Math.pow(2,-$);Me=Math.floor(St.width*Wn),we=Math.floor(St.height*Wn),Ee=I.isDataArrayTexture?St.depth:I.isData3DTexture?Math.floor(St.depth*Wn):1,Ne=0,Ke=0,Je=0}re!==null?(Le=re.x,Qe=re.y,Rt=re.z):(Le=0,Qe=0,Rt=0);let ut=jn.convert(X.format),qe=jn.convert(X.type),dt;X.isData3DTexture?(ye.setTexture3D(X,0),dt=q.TEXTURE_3D):X.isDataArrayTexture||X.isCompressedArrayTexture?(ye.setTexture2DArray(X,0),dt=q.TEXTURE_2D_ARRAY):(ye.setTexture2D(X,0),dt=q.TEXTURE_2D),ie.activeTexture(q.TEXTURE0),ie.pixelStorei(q.UNPACK_FLIP_Y_WEBGL,X.flipY),ie.pixelStorei(q.UNPACK_PREMULTIPLY_ALPHA_WEBGL,X.premultiplyAlpha),ie.pixelStorei(q.UNPACK_ALIGNMENT,X.unpackAlignment);let Bt=ie.getParameter(q.UNPACK_ROW_LENGTH),Ue=ie.getParameter(q.UNPACK_IMAGE_HEIGHT),Be=ie.getParameter(q.UNPACK_SKIP_PIXELS),Rn=ie.getParameter(q.UNPACK_SKIP_ROWS),Ol=ie.getParameter(q.UNPACK_SKIP_IMAGES);ie.pixelStorei(q.UNPACK_ROW_LENGTH,St.width),ie.pixelStorei(q.UNPACK_IMAGE_HEIGHT,St.height),ie.pixelStorei(q.UNPACK_SKIP_PIXELS,Ne),ie.pixelStorei(q.UNPACK_SKIP_ROWS,Ke),ie.pixelStorei(q.UNPACK_SKIP_IMAGES,Je);let Ma=I.isDataArrayTexture||I.isData3DTexture,ds=X.isDataArrayTexture||X.isData3DTexture;if(I.isDepthTexture){let Wn=le.get(I),xr=le.get(X),ai=le.get(Wn.__renderTarget),Bl=le.get(xr.__renderTarget);ie.bindFramebuffer(q.READ_FRAMEBUFFER,ai.__webglFramebuffer),ie.bindFramebuffer(q.DRAW_FRAMEBUFFER,Bl.__webglFramebuffer);for(let Mr=0;Mr<Ee;Mr++)Ma&&(q.framebufferTextureLayer(q.READ_FRAMEBUFFER,q.COLOR_ATTACHMENT0,le.get(I).__webglTexture,$,Je+Mr),q.framebufferTextureLayer(q.DRAW_FRAMEBUFFER,q.COLOR_ATTACHMENT0,le.get(X).__webglTexture,fe,Rt+Mr)),q.blitFramebuffer(Ne,Ke,Me,we,Le,Qe,Me,we,q.DEPTH_BUFFER_BIT,q.NEAREST);ie.bindFramebuffer(q.READ_FRAMEBUFFER,null),ie.bindFramebuffer(q.DRAW_FRAMEBUFFER,null)}else if($!==0||I.isRenderTargetTexture||le.has(I)){let Wn=le.get(I),xr=le.get(X);ie.bindFramebuffer(q.READ_FRAMEBUFFER,H),ie.bindFramebuffer(q.DRAW_FRAMEBUFFER,W);for(let ai=0;ai<Ee;ai++)Ma?q.framebufferTextureLayer(q.READ_FRAMEBUFFER,q.COLOR_ATTACHMENT0,Wn.__webglTexture,$,Je+ai):q.framebufferTexture2D(q.READ_FRAMEBUFFER,q.COLOR_ATTACHMENT0,q.TEXTURE_2D,Wn.__webglTexture,$),ds?q.framebufferTextureLayer(q.DRAW_FRAMEBUFFER,q.COLOR_ATTACHMENT0,xr.__webglTexture,fe,Rt+ai):q.framebufferTexture2D(q.DRAW_FRAMEBUFFER,q.COLOR_ATTACHMENT0,q.TEXTURE_2D,xr.__webglTexture,fe),$!==0?q.blitFramebuffer(Ne,Ke,Me,we,Le,Qe,Me,we,q.COLOR_BUFFER_BIT,q.NEAREST):ds?q.copyTexSubImage3D(dt,fe,Le,Qe,Rt+ai,Ne,Ke,Me,we):q.copyTexSubImage2D(dt,fe,Le,Qe,Ne,Ke,Me,we);ie.bindFramebuffer(q.READ_FRAMEBUFFER,null),ie.bindFramebuffer(q.DRAW_FRAMEBUFFER,null)}else ds?I.isDataTexture||I.isData3DTexture?q.texSubImage3D(dt,fe,Le,Qe,Rt,Me,we,Ee,ut,qe,St.data):X.isCompressedArrayTexture?q.compressedTexSubImage3D(dt,fe,Le,Qe,Rt,Me,we,Ee,ut,St.data):q.texSubImage3D(dt,fe,Le,Qe,Rt,Me,we,Ee,ut,qe,St):I.isDataTexture?q.texSubImage2D(q.TEXTURE_2D,fe,Le,Qe,Me,we,ut,qe,St.data):I.isCompressedTexture?q.compressedTexSubImage2D(q.TEXTURE_2D,fe,Le,Qe,St.width,St.height,ut,St.data):q.texSubImage2D(q.TEXTURE_2D,fe,Le,Qe,Me,we,ut,qe,St);ie.pixelStorei(q.UNPACK_ROW_LENGTH,Bt),ie.pixelStorei(q.UNPACK_IMAGE_HEIGHT,Ue),ie.pixelStorei(q.UNPACK_SKIP_PIXELS,Be),ie.pixelStorei(q.UNPACK_SKIP_ROWS,Rn),ie.pixelStorei(q.UNPACK_SKIP_IMAGES,Ol),fe===0&&X.generateMipmaps&&q.generateMipmap(dt),ie.unbindTexture()},this.initRenderTarget=function(I){le.get(I).__webglFramebuffer===void 0&&ye.setupRenderTarget(I)},this.initTexture=function(I){I.isCubeTexture?ye.setTextureCube(I,0):I.isData3DTexture?ye.setTexture3D(I,0):I.isDataArrayTexture||I.isCompressedArrayTexture?ye.setTexture2DArray(I,0):ye.setTexture2D(I,0),ie.unbindTexture()},this.resetState=function(){Y=0,K=0,ee=null,ie.reset(),Ci.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return bi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Ce._getDrawingBufferColorSpace(e),t.unpackColorSpace=Ce._getUnpackColorSpace()}};var Lf={type:"change"},iu={type:"start"},Ff={type:"end"},gl=new yi,Df=new vn,Y0=Math.cos(70*mt.DEG2RAD),Dt=new C,tn=2*Math.PI,at={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},nu=1e-6,vl=class extends ra{constructor(e,t=null){super(e,t),this.state=at.NONE,this.target=new C,this.cursor=new C,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:ji.ROTATE,MIDDLE:ji.DOLLY,RIGHT:ji.PAN},this.touches={ONE:Wi.ROTATE,TWO:Wi.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle="auto",this._domElementKeyEvents=null,this._lastPosition=new C,this._lastQuaternion=new $e,this._lastTargetPosition=new C,this._quat=new $e().setFromUnitVectors(e.up,new C(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new Zr,this._sphericalDelta=new Zr,this._scale=1,this._panOffset=new C,this._rotateStart=new ne,this._rotateEnd=new ne,this._rotateDelta=new ne,this._panStart=new ne,this._panEnd=new ne,this._panDelta=new ne,this._dollyStart=new ne,this._dollyEnd=new ne,this._dollyDelta=new ne,this._dollyDirection=new C,this._mouse=new ne,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=Z0.bind(this),this._onPointerDown=J0.bind(this),this._onPointerUp=Q0.bind(this),this._onContextMenu=sv.bind(this),this._onMouseWheel=tv.bind(this),this._onKeyDown=nv.bind(this),this._onTouchStart=iv.bind(this),this._onTouchMove=rv.bind(this),this._onMouseDown=$0.bind(this),this._onMouseMove=ev.bind(this),this._interceptControlDown=av.bind(this),this._interceptControlUp=ov.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(e){this._cursorStyle=e,e==="grab"?this.domElement.style.cursor="grab":this.domElement.style.cursor="auto"}get cursorStyle(){return this._cursorStyle}connect(e){super.connect(e),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction=""}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(Lf),this.update(),this.state=at.NONE}pan(e,t){this._pan(e,t),this.update()}dollyIn(e){this._dollyIn(e),this.update()}dollyOut(e){this._dollyOut(e),this.update()}rotateLeft(e){this._rotateLeft(e),this.update()}rotateUp(e){this._rotateUp(e),this.update()}update(e=null){let t=this.object.position;Dt.copy(t).sub(this.target),Dt.applyQuaternion(this._quat),this._spherical.setFromVector3(Dt),this.autoRotate&&this.state===at.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,i=this.maxAzimuthAngle;isFinite(n)&&isFinite(i)&&(n<-Math.PI?n+=tn:n>Math.PI&&(n-=tn),i<-Math.PI?i+=tn:i>Math.PI&&(i-=tn),n<=i?this._spherical.theta=Math.max(n,Math.min(i,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+i)/2?Math.max(n,this._spherical.theta):Math.min(i,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let r=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let a=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),r=a!=this._spherical.radius}if(Dt.setFromSpherical(this._spherical),Dt.applyQuaternion(this._quatInverse),t.copy(this.target).add(Dt),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let a=null;if(this.object.isPerspectiveCamera){let o=Dt.length();a=this._clampDistance(o*this._scale);let l=o-a;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),r=!!l}else if(this.object.isOrthographicCamera){let o=new C(this._mouse.x,this._mouse.y,0);o.unproject(this.object);let l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),r=l!==this.object.zoom;let c=new C(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(o),this.object.updateMatrixWorld(),a=Dt.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;a!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(a).add(this.object.position):(gl.origin.copy(this.object.position),gl.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(gl.direction))<Y0?this.object.lookAt(this.target):(Df.setFromNormalAndCoplanarPoint(this.object.up,this.target),gl.intersectPlane(Df,this.target))))}else if(this.object.isOrthographicCamera){let a=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),a!==this.object.zoom&&(this.object.updateProjectionMatrix(),r=!0)}return this._scale=1,this._performCursorZoom=!1,r||this._lastPosition.distanceToSquared(this.object.position)>nu||8*(1-this._lastQuaternion.dot(this.object.quaternion))>nu||this._lastTargetPosition.distanceToSquared(this.target)>nu?(this.dispatchEvent(Lf),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e!==null?tn/60*this.autoRotateSpeed*e:tn/60/60*this.autoRotateSpeed}_getZoomScale(e){let t=Math.abs(e*.01);return Math.pow(.95,this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){Dt.setFromMatrixColumn(t,0),Dt.multiplyScalar(-e),this._panOffset.add(Dt)}_panUp(e,t){this.screenSpacePanning===!0?Dt.setFromMatrixColumn(t,1):(Dt.setFromMatrixColumn(t,0),Dt.crossVectors(this.object.up,Dt)),Dt.multiplyScalar(e),this._panOffset.add(Dt)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let i=this.object.position;Dt.copy(i).sub(this.target);let r=Dt.length();r*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*r/n.clientHeight,this.object.matrix),this._panUp(2*t*r/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),i=e-n.left,r=t-n.top,a=n.width,o=n.height;this._mouse.x=i/a*2-1,this._mouse.y=-(r/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(tn*this._rotateDelta.x/t.clientHeight),this._rotateUp(tn*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-tn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0;break}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),i=.5*(e.pageY+t.y);this._rotateStart.set(n,i)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),i=.5*(e.pageY+t.y);this._panStart.set(n,i)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,i=e.pageY-t.y,r=Math.sqrt(n*n+i*i);this._dollyStart.set(0,r)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let n=this._getSecondPointerPosition(e),i=.5*(e.pageX+n.x),r=.5*(e.pageY+n.y);this._rotateEnd.set(i,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(tn*this._rotateDelta.x/t.clientHeight),this._rotateUp(tn*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),i=.5*(e.pageY+t.y);this._panEnd.set(n,i)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,i=e.pageY-t.y,r=Math.sqrt(n*n+i*i);this._dollyEnd.set(0,r),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new ne,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function J0(s){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(s.pointerId),this.domElement.ownerDocument.addEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(s)&&(this._addPointer(s),s.pointerType==="touch"?this._onTouchStart(s):this._onMouseDown(s),this._cursorStyle==="grab"&&(this.domElement.style.cursor="grabbing")))}function Z0(s){this.enabled!==!1&&(s.pointerType==="touch"?this._onTouchMove(s):this._onMouseMove(s))}function Q0(s){switch(this._removePointer(s),this._pointers.length){case 0:this.domElement.releasePointerCapture(s.pointerId),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(Ff),this.state=at.NONE,this._cursorStyle==="grab"&&(this.domElement.style.cursor="grab");break;case 1:let e=this._pointers[0],t=this._pointerPositions[e];this._onTouchStart({pointerId:e,pageX:t.x,pageY:t.y});break}}function $0(s){let e;switch(s.button){case 0:e=this.mouseButtons.LEFT;break;case 1:e=this.mouseButtons.MIDDLE;break;case 2:e=this.mouseButtons.RIGHT;break;default:e=-1}switch(e){case ji.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(s),this.state=at.DOLLY;break;case ji.ROTATE:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=at.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=at.ROTATE}break;case ji.PAN:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=at.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=at.PAN}break;default:this.state=at.NONE}this.state!==at.NONE&&this.dispatchEvent(iu)}function ev(s){switch(this.state){case at.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(s);break;case at.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(s);break;case at.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(s);break}}function tv(s){this.enabled===!1||this.enableZoom===!1||this.state!==at.NONE||(s.preventDefault(),this.dispatchEvent(iu),this._handleMouseWheel(this._customWheelEvent(s)),this.dispatchEvent(Ff))}function nv(s){this.enabled!==!1&&this._handleKeyDown(s)}function iv(s){switch(this._trackPointer(s),this._pointers.length){case 1:switch(this.touches.ONE){case Wi.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(s),this.state=at.TOUCH_ROTATE;break;case Wi.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(s),this.state=at.TOUCH_PAN;break;default:this.state=at.NONE}break;case 2:switch(this.touches.TWO){case Wi.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(s),this.state=at.TOUCH_DOLLY_PAN;break;case Wi.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(s),this.state=at.TOUCH_DOLLY_ROTATE;break;default:this.state=at.NONE}break;default:this.state=at.NONE}this.state!==at.NONE&&this.dispatchEvent(iu)}function rv(s){switch(this._trackPointer(s),this.state){case at.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(s),this.update();break;case at.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(s),this.update();break;case at.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(s),this.update();break;case at.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(s),this.update();break;default:this.state=at.NONE}}function sv(s){this.enabled!==!1&&s.preventDefault()}function av(s){s.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function ov(s){s.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function ru(s,e){if(e===Fh)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),s;if(e===ss||e===ca){let t=s.getIndex();if(t===null){let a=[],o=s.getAttribute("position");if(o!==void 0){for(let l=0;l<o.count;l++)a.push(l);s.setIndex(a),t=s.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),s}let n=t.count-2,i=[];if(e===ss)for(let a=1;a<=n;a++)i.push(t.getX(0)),i.push(t.getX(a)),i.push(t.getX(a+1));else for(let a=0;a<n;a++)a%2===0?(i.push(t.getX(a)),i.push(t.getX(a+1)),i.push(t.getX(a+2))):(i.push(t.getX(a+2)),i.push(t.getX(a+1)),i.push(t.getX(a)));i.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");let r=s.clone();return r.setIndex(i),r.clearGroups(),r}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",e),s}function Nf(s){let e=new Map,t=new Map,n=s.clone();return Uf(s,n,function(i,r){e.set(r,i),t.set(i,r)}),n.traverse(function(i){if(!i.isSkinnedMesh)return;let r=i,a=e.get(i),o=a.skeleton.bones;r.skeleton=a.skeleton.clone(),r.bindMatrix.copy(a.bindMatrix),r.skeleton.bones=o.map(function(l){return t.get(l)}),r.bind(r.skeleton,r.bindMatrix)}),n}function Uf(s,e,t){t(s,e);for(let n=0;n<s.children.length;n++)Uf(s.children[n],e.children[n],t)}var bl=class extends ot{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new uu(t)}),this.register(function(t){return new du(t)}),this.register(function(t){return new xu(t)}),this.register(function(t){return new Mu(t)}),this.register(function(t){return new Su(t)}),this.register(function(t){return new fu(t)}),this.register(function(t){return new mu(t)}),this.register(function(t){return new gu(t)}),this.register(function(t){return new vu(t)}),this.register(function(t){return new hu(t)}),this.register(function(t){return new bu(t)}),this.register(function(t){return new pu(t)}),this.register(function(t){return new yu(t)}),this.register(function(t){return new _u(t)}),this.register(function(t){return new lu(t)}),this.register(function(t){return new _l(t,je.EXT_MESHOPT_COMPRESSION)}),this.register(function(t){return new _l(t,je.KHR_MESHOPT_COMPRESSION)}),this.register(function(t){return new Tu(t)})}load(e,t,n,i){let r=this,a;if(this.resourcePath!=="")a=this.resourcePath;else if(this.path!==""){let c=Vt.extractUrlBase(e);a=Vt.resolveURL(c,this.path)}else a=Vt.extractUrlBase(e);this.manager.itemStart(e);let o=function(c){i?i(c):console.error(c),r.manager.itemError(e),r.manager.itemEnd(e)},l=new _t(this.manager);l.setPath(this.path),l.setResponseType("arraybuffer"),l.setRequestHeader(this.requestHeader),l.setWithCredentials(this.withCredentials),l.load(e,function(c){try{r.parse(c,a,function(h){t(h),r.manager.itemEnd(e)},o)}catch(h){o(h)}},n,o)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,n,i){let r,a={},o={},l=new TextDecoder;if(typeof e=="string")r=JSON.parse(e);else if(e instanceof ArrayBuffer)if(l.decode(new Uint8Array(e,0,4))===Gf){try{a[je.KHR_BINARY_GLTF]=new wu(e)}catch(u){i&&i(u);return}r=JSON.parse(a[je.KHR_BINARY_GLTF].content)}else r=JSON.parse(l.decode(e));else r=e;if(r.asset===void 0||r.asset.version[0]<2){i&&i(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}let c=new Lu(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let h=0;h<this.pluginCallbacks.length;h++){let u=this.pluginCallbacks[h](c);u.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),o[u.name]=u,a[u.name]=!0}if(r.extensionsUsed)for(let h=0;h<r.extensionsUsed.length;++h){let u=r.extensionsUsed[h],d=r.extensionsRequired||[];switch(u){case je.KHR_MATERIALS_UNLIT:a[u]=new cu;break;case je.KHR_DRACO_MESH_COMPRESSION:a[u]=new Au(r,this.dracoLoader);break;case je.KHR_TEXTURE_TRANSFORM:a[u]=new Eu;break;case je.KHR_MESH_QUANTIZATION:a[u]=new Ru;break;default:d.indexOf(u)>=0&&o[u]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+u+'".')}}c.setExtensions(a),c.setPlugins(o),c.parse(n,i)}parseAsync(e,t){let n=this;return new Promise(function(i,r){n.parse(e,t,i,r)})}};function lv(){let s={};return{get:function(e){return s[e]},add:function(e,t){s[e]=t},remove:function(e){delete s[e]},removeAll:function(){s={}}}}function yt(s,e,t){let n=s.json.materials[e];return n.extensions&&n.extensions[t]?n.extensions[t]:null}var je={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"},lu=class{constructor(e){this.parser=e,this.name=je.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let e=this.parser,t=this.parser.json.nodes||[];for(let n=0,i=t.length;n<i;n++){let r=t[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){let t=this.parser,n="light:"+e,i=t.cache.get(n);if(i)return i;let r=t.json,l=((r.extensions&&r.extensions[this.name]||{}).lights||[])[e],c,h=new de(16777215);l.color!==void 0&&h.setRGB(l.color[0],l.color[1],l.color[2],kt);let u=l.range!==void 0?l.range:0;switch(l.type){case"directional":c=new Qn(h),c.target.position.set(0,0,-1),c.add(c.target);break;case"point":c=new Vi(h),c.distance=u;break;case"spot":c=new pr(h),c.distance=u,l.spot=l.spot||{},l.spot.innerConeAngle=l.spot.innerConeAngle!==void 0?l.spot.innerConeAngle:0,l.spot.outerConeAngle=l.spot.outerConeAngle!==void 0?l.spot.outerConeAngle:Math.PI/4,c.angle=l.spot.outerConeAngle,c.penumbra=1-l.spot.innerConeAngle/l.spot.outerConeAngle,c.target.position.set(0,0,-1),c.add(c.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+l.type)}return c.position.set(0,0,0),ri(c,l),l.intensity!==void 0&&(c.intensity=l.intensity),c.name=t.createUniqueName(l.name||"light_"+e),i=Promise.resolve(c),t.cache.add(n,i),i}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){let t=this,n=this.parser,r=n.json.nodes[e],o=(r.extensions&&r.extensions[this.name]||{}).light;return o===void 0?null:this._loadLight(o).then(function(l){return n._getNodeRef(t.cache,o,l)})}},cu=class{constructor(){this.name=je.KHR_MATERIALS_UNLIT}getMaterialType(){return Nn}extendParams(e,t,n){let i=[];e.color=new de(1,1,1),e.opacity=1;let r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){let a=r.baseColorFactor;e.color.setRGB(a[0],a[1],a[2],kt),e.opacity=a[3]}r.baseColorTexture!==void 0&&i.push(n.assignTexture(e,"map",r.baseColorTexture,Pe))}return Promise.all(i)}},hu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);return n===null||n.emissiveStrength!==void 0&&(t.emissiveIntensity=n.emissiveStrength),Promise.resolve()}},uu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(n.clearcoatFactor!==void 0&&(t.clearcoat=n.clearcoatFactor),n.clearcoatTexture!==void 0&&i.push(this.parser.assignTexture(t,"clearcoatMap",n.clearcoatTexture)),n.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=n.clearcoatRoughnessFactor),n.clearcoatRoughnessTexture!==void 0&&i.push(this.parser.assignTexture(t,"clearcoatRoughnessMap",n.clearcoatRoughnessTexture)),n.clearcoatNormalTexture!==void 0&&(i.push(this.parser.assignTexture(t,"clearcoatNormalMap",n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0)){let r=n.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new ne(r,r)}return Promise.all(i)}},du=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_DISPERSION}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);return n===null||(t.dispersion=n.dispersion!==void 0?n.dispersion:0),Promise.resolve()}},pu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];return n.iridescenceFactor!==void 0&&(t.iridescence=n.iridescenceFactor),n.iridescenceTexture!==void 0&&i.push(this.parser.assignTexture(t,"iridescenceMap",n.iridescenceTexture)),n.iridescenceIor!==void 0&&(t.iridescenceIOR=n.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),n.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=n.iridescenceThicknessMinimum),n.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=n.iridescenceThicknessMaximum),n.iridescenceThicknessTexture!==void 0&&i.push(this.parser.assignTexture(t,"iridescenceThicknessMap",n.iridescenceThicknessTexture)),Promise.all(i)}},fu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_SHEEN}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];if(t.sheenColor=new de(0,0,0),t.sheenRoughness=0,t.sheen=1,n.sheenColorFactor!==void 0){let r=n.sheenColorFactor;t.sheenColor.setRGB(r[0],r[1],r[2],kt)}return n.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=n.sheenRoughnessFactor),n.sheenColorTexture!==void 0&&i.push(this.parser.assignTexture(t,"sheenColorMap",n.sheenColorTexture,Pe)),n.sheenRoughnessTexture!==void 0&&i.push(this.parser.assignTexture(t,"sheenRoughnessMap",n.sheenRoughnessTexture)),Promise.all(i)}},mu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];return n.transmissionFactor!==void 0&&(t.transmission=n.transmissionFactor),n.transmissionTexture!==void 0&&i.push(this.parser.assignTexture(t,"transmissionMap",n.transmissionTexture)),Promise.all(i)}},gu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_VOLUME}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];t.thickness=n.thicknessFactor!==void 0?n.thicknessFactor:0,n.thicknessTexture!==void 0&&i.push(this.parser.assignTexture(t,"thicknessMap",n.thicknessTexture)),t.attenuationDistance=n.attenuationDistance||1/0;let r=n.attenuationColor||[1,1,1];return t.attenuationColor=new de().setRGB(r[0],r[1],r[2],kt),Promise.all(i)}},vu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_IOR}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);return n===null||(t.ior=n.ior!==void 0?n.ior:1.5,t.ior===0&&(t.ior=1e3)),Promise.resolve()}},bu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_SPECULAR}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];t.specularIntensity=n.specularFactor!==void 0?n.specularFactor:1,n.specularTexture!==void 0&&i.push(this.parser.assignTexture(t,"specularIntensityMap",n.specularTexture));let r=n.specularColorFactor||[1,1,1];return t.specularColor=new de().setRGB(r[0],r[1],r[2],kt),n.specularColorTexture!==void 0&&i.push(this.parser.assignTexture(t,"specularColorMap",n.specularColorTexture,Pe)),Promise.all(i)}},_u=class{constructor(e){this.parser=e,this.name=je.EXT_MATERIALS_BUMP}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];return t.bumpScale=n.bumpFactor!==void 0?n.bumpFactor:1,n.bumpTexture!==void 0&&i.push(this.parser.assignTexture(t,"bumpMap",n.bumpTexture)),Promise.all(i)}},yu=class{constructor(e){this.parser=e,this.name=je.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return yt(this.parser,e,this.name)!==null?$t:null}extendMaterialParams(e,t){let n=yt(this.parser,e,this.name);if(n===null)return Promise.resolve();let i=[];return n.anisotropyStrength!==void 0&&(t.anisotropy=n.anisotropyStrength),n.anisotropyRotation!==void 0&&(t.anisotropyRotation=n.anisotropyRotation),n.anisotropyTexture!==void 0&&i.push(this.parser.assignTexture(t,"anisotropyMap",n.anisotropyTexture)),Promise.all(i)}},xu=class{constructor(e){this.parser=e,this.name=je.KHR_TEXTURE_BASISU}loadTexture(e){let t=this.parser,n=t.json,i=n.textures[e];if(!i.extensions||!i.extensions[this.name])return null;let r=i.extensions[this.name],a=t.options.ktx2Loader;if(!a){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,r.source,a)}},Mu=class{constructor(e){this.parser=e,this.name=je.EXT_TEXTURE_WEBP}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let a=r.extensions[t],o=i.images[a.source],l=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(e,a.source,l)}},Su=class{constructor(e){this.parser=e,this.name=je.EXT_TEXTURE_AVIF}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let a=r.extensions[t],o=i.images[a.source],l=n.textureLoader;if(o.uri){let c=n.options.manager.getHandler(o.uri);c!==null&&(l=c)}return n.loadTextureImage(e,a.source,l)}},_l=class{constructor(e,t){this.name=t,this.parser=e}loadBufferView(e){let t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){let i=n.extensions[this.name],r=this.parser.getDependency("buffer",i.buffer),a=this.parser.options.meshoptDecoder;if(!a||!a.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(o){let l=i.byteOffset||0,c=i.byteLength||0,h=i.count,u=i.byteStride,d=new Uint8Array(o,l,c);return a.decodeGltfBufferAsync?a.decodeGltfBufferAsync(h,u,d,i.mode,i.filter).then(function(p){return p.buffer}):a.ready.then(function(){let p=new ArrayBuffer(h*u);return a.decodeGltfBuffer(new Uint8Array(p),h,u,d,i.mode,i.filter),p})})}else return null}},Tu=class{constructor(e){this.name=je.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){let t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let i=t.meshes[n.mesh];for(let c of i.primitives)if(c.mode!==wn.TRIANGLES&&c.mode!==wn.TRIANGLE_STRIP&&c.mode!==wn.TRIANGLE_FAN&&c.mode!==void 0)return null;let a=n.extensions[this.name].attributes,o=[],l={};for(let c in a)o.push(this.parser.getDependency("accessor",a[c]).then(h=>(l[c]=h,l[c])));return o.length<1?null:(o.push(this.parser.createNodeMesh(e)),Promise.all(o).then(c=>{let h=c.pop(),u=h.isGroup?h.children:[h],d=c[0].count,p=[];for(let m of u){let f=new ge,_=new C,g=new $e,v=new C(1,1,1),b=new Ns(m.geometry,m.material,d);for(let y=0;y<d;y++)l.TRANSLATION&&_.fromBufferAttribute(l.TRANSLATION,y),l.ROTATION&&g.fromBufferAttribute(l.ROTATION,y),l.SCALE&&v.fromBufferAttribute(l.SCALE,y),b.setMatrixAt(y,f.compose(_,g,v));for(let y in l)if(y==="_COLOR_0"){let S=l[y];b.instanceColor=new ki(S.array,S.itemSize,S.normalized)}else y!=="TRANSLATION"&&y!=="ROTATION"&&y!=="SCALE"&&m.geometry.setAttribute(y,l[y]);st.prototype.copy.call(b,m),this.parser.assignFinalMaterial(b),p.push(b)}return h.isGroup?(h.clear(),h.add(...p),h):p[0]}))}},Gf="glTF",fa=12,Of={JSON:1313821514,BIN:5130562},wu=class{constructor(e){this.name=je.KHR_BINARY_GLTF,this.content=null,this.body=null;let t=new DataView(e,0,fa),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==Gf)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");let i=this.header.length-fa,r=new DataView(e,fa),a=0;for(;a<i;){let o=r.getUint32(a,!0);a+=4;let l=r.getUint32(a,!0);if(a+=4,l===Of.JSON){let c=new Uint8Array(e,fa+a,o);this.content=n.decode(c)}else if(l===Of.BIN){let c=fa+a;this.body=e.slice(c,c+o)}a+=o}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}},Au=class{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=je.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){let n=this.json,i=this.dracoLoader,r=e.extensions[this.name].bufferView,a=e.extensions[this.name].attributes,o={},l={},c={};for(let h in a){let u=Pu[h]||h.toLowerCase();o[u]=a[h]}for(let h in e.attributes){let u=Pu[h]||h.toLowerCase();if(a[h]!==void 0){let d=n.accessors[e.attributes[h]],p=cs[d.componentType];c[u]=p.name,l[u]=d.normalized===!0}}return t.getDependency("bufferView",r).then(function(h){return new Promise(function(u,d){i.decodeDracoFile(h,function(p){for(let m in p.attributes){let f=p.attributes[m],_=l[m];_!==void 0&&(f.normalized=_)}u(p)},o,c,kt,d)})})}},Eu=class{constructor(){this.name=je.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){return(t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0||(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),e.needsUpdate=!0),e}},Ru=class{constructor(){this.name=je.KHR_MESH_QUANTIZATION}},yl=class extends Jn{constructor(e,t,n,i){super(e,t,n,i)}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i*3+i;for(let a=0;a!==i;a++)t[a]=n[r+a];return t}interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=o*2,c=o*3,h=i-t,u=(n-t)/h,d=u*u,p=d*u,m=e*c,f=m-c,_=-2*p+3*d,g=p-d,v=1-_,b=g-d+u;for(let y=0;y!==o;y++){let S=a[f+y+o],x=a[f+y+l]*h,A=a[m+y+o],F=a[m+y]*h;r[y]=v*S+b*x+_*A+g*F}return r}},cv=new $e,Cu=class extends yl{interpolate_(e,t,n,i){let r=super.interpolate_(e,t,n,i);return cv.fromArray(r).normalize().toArray(r),r}},wn={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},cs={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Bf={9728:Ut,9729:ct,9984:Ko,9985:ns,9986:mr,9987:hn},kf={33071:qt,33648:vi,10497:Nt},su={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Pu={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Xi={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},hv={CUBICSPLINE:void 0,LINEAR:ar,STEP:sr},au={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function uv(s){return s.DefaultMaterial===void 0&&(s.DefaultMaterial=new xn({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:$n})),s.DefaultMaterial}function yr(s,e,t){for(let n in t.extensions)s[n]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[n]=t.extensions[n])}function ri(s,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(s.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function dv(s,e,t){let n=!1,i=!1,r=!1;for(let c=0,h=e.length;c<h;c++){let u=e[c];if(u.POSITION!==void 0&&(n=!0),u.NORMAL!==void 0&&(i=!0),u.COLOR_0!==void 0&&(r=!0),n&&i&&r)break}if(!n&&!i&&!r)return Promise.resolve(s);let a=[],o=[],l=[];for(let c=0,h=e.length;c<h;c++){let u=e[c];if(n){let d=u.POSITION!==void 0?t.getDependency("accessor",u.POSITION):s.attributes.position;a.push(d)}if(i){let d=u.NORMAL!==void 0?t.getDependency("accessor",u.NORMAL):s.attributes.normal;o.push(d)}if(r){let d=u.COLOR_0!==void 0?t.getDependency("accessor",u.COLOR_0):s.attributes.color;l.push(d)}}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l)]).then(function(c){let h=c[0],u=c[1],d=c[2];return n&&(s.morphAttributes.position=h),i&&(s.morphAttributes.normal=u),r&&(s.morphAttributes.color=d),s.morphTargetsRelative=!0,s})}function pv(s,e){if(s.updateMorphTargets(),e.weights!==void 0)for(let t=0,n=e.weights.length;t<n;t++)s.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){let t=e.extras.targetNames;if(s.morphTargetInfluences.length===t.length){s.morphTargetDictionary={};for(let n=0,i=t.length;n<i;n++)s.morphTargetDictionary[t[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function fv(s){let e,t=s.extensions&&s.extensions[je.KHR_DRACO_MESH_COMPRESSION];if(t?e="draco:"+t.bufferView+":"+t.indices+":"+ou(t.attributes):e=s.indices+":"+ou(s.attributes)+":"+s.mode,s.targets!==void 0)for(let n=0,i=s.targets.length;n<i;n++)e+=":"+ou(s.targets[n]);return e}function ou(s){let e="",t=Object.keys(s).sort();for(let n=0,i=t.length;n<i;n++)e+=t[n]+":"+s[t[n]]+";";return e}function Iu(s){switch(s){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function mv(s){return s.search(/\.jpe?g($|\?)/i)>0||s.search(/^data\:image\/jpeg/)===0?"image/jpeg":s.search(/\.webp($|\?)/i)>0||s.search(/^data\:image\/webp/)===0?"image/webp":s.search(/\.ktx2($|\?)/i)>0||s.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}var gv=new ge,Lu=class{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new lv,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,r=!1,a=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){let o=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(o)===!0;let l=o.match(/Version\/(\d+)/);i=n&&l?parseInt(l[1],10):-1,r=o.indexOf("Firefox")>-1,a=r?o.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&i<17||r&&a<98?this.textureLoader=new kn(this.options.manager):this.textureLoader=new na(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new _t(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){let n=this,i=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(a){return a._markDefs&&a._markDefs()}),Promise.all(this._invokeAll(function(a){return a.beforeRoot&&a.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(a){let o={scene:a[0][i.scene||0],scenes:a[0],animations:a[1],cameras:a[2],asset:i.asset,parser:n,userData:{}};return yr(r,o,i),ri(o,i),Promise.all(n._invokeAll(function(l){return l.afterRoot&&l.afterRoot(o)})).then(function(){for(let l of o.scenes)l.updateMatrixWorld();e(o)})}).catch(t)}_markDefs(){let e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let i=0,r=t.length;i<r;i++){let a=t[i].joints;for(let o=0,l=a.length;o<l;o++)e[a[o]].isBone=!0}for(let i=0,r=e.length;i<r;i++){let a=e[i];a.mesh!==void 0&&(this._addNodeRef(this.meshCache,a.mesh),a.skin!==void 0&&(n[a.mesh].isSkinnedMesh=!0)),a.camera!==void 0&&this._addNodeRef(this.cameraCache,a.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;let i=n.clone(),r=(a,o)=>{let l=this.associations.get(a);l!=null&&this.associations.set(o,l);for(let[c,h]of a.children.entries())r(h,o.children[c])};return r(n,i),i.name+="_instance_"+e.uses[t]++,i}_invokeOne(e){let t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){let i=e(t[n]);if(i)return i}return null}_invokeAll(e){let t=Object.values(this.plugins);t.unshift(this);let n=[];for(let i=0;i<t.length;i++){let r=e(t[i]);r&&n.push(r)}return n}getDependency(e,t){let n=e+":"+t,i=this.cache.get(n);if(!i){switch(e){case"scene":i=this.loadScene(t);break;case"node":i=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":i=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":i=this.loadAccessor(t);break;case"bufferView":i=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":i=this.loadBuffer(t);break;case"material":i=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":i=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":i=this.loadSkin(t);break;case"animation":i=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":i=this.loadCamera(t);break;default:if(i=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(e,t)}),!i)throw new Error("Unknown type: "+e);break}this.cache.add(n,i)}return i}getDependencies(e){let t=this.cache.get(e);if(!t){let n=this,i=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(i.map(function(r,a){return n.getDependency(e,a)})),this.cache.add(e,t)}return t}loadBuffer(e){let t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[je.KHR_BINARY_GLTF].body);let i=this.options;return new Promise(function(r,a){n.load(Vt.resolveURL(t.uri,i.path),r,void 0,function(){a(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){let t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){let i=t.byteLength||0,r=t.byteOffset||0;return n.slice(r,r+i)})}loadAccessor(e){let t=this,n=this.json,i=this.json.accessors[e];if(i.bufferView===void 0&&i.sparse===void 0){let a=su[i.type],o=cs[i.componentType],l=i.normalized===!0,c=new o(i.count*a);return Promise.resolve(new Xe(c,a,l))}let r=[];return i.bufferView!==void 0?r.push(this.getDependency("bufferView",i.bufferView)):r.push(null),i.sparse!==void 0&&(r.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",i.sparse.values.bufferView))),Promise.all(r).then(function(a){let o=a[0],l=su[i.type],c=cs[i.componentType],h=c.BYTES_PER_ELEMENT,u=h*l,d=i.byteOffset||0,p=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,m=i.normalized===!0,f,_;if(p&&p!==u){let g=Math.floor(d/p),v="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+g+":"+i.count,b=t.cache.get(v);b||(f=new c(o,g*p,i.count*p/h),b=new Oi(f,p/h),t.cache.add(v,b)),_=new Bi(b,l,d%p/h,m)}else o===null?f=new c(i.count*l):f=new c(o,d,i.count*l),_=new Xe(f,l,m);if(i.sparse!==void 0){let g=su.SCALAR,v=cs[i.sparse.indices.componentType],b=i.sparse.indices.byteOffset||0,y=i.sparse.values.byteOffset||0,S=new v(a[1],b,i.sparse.count*g),x=new c(a[2],y,i.sparse.count*l);o!==null&&(_=new Xe(_.array.slice(),_.itemSize,_.normalized)),_.normalized=!1;for(let A=0,F=S.length;A<F;A++){let L=S[A];if(_.setX(L,x[A*l]),l>=2&&_.setY(L,x[A*l+1]),l>=3&&_.setZ(L,x[A*l+2]),l>=4&&_.setW(L,x[A*l+3]),l>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}_.normalized=m}return _})}loadTexture(e){let t=this.json,n=this.options,r=t.textures[e].source,a=t.images[r],o=this.textureLoader;if(a.uri){let l=n.manager.getHandler(a.uri);l!==null&&(o=l)}return this.loadTextureImage(e,r,o)}loadTextureImage(e,t,n){let i=this,r=this.json,a=r.textures[e],o=r.images[t],l=(o.uri||o.bufferView)+":"+a.sampler;if(this.textureCache[l])return this.textureCache[l];let c=this.loadImageSource(t,n).then(function(h){h.flipY=!1,h.name=a.name||o.name||"",h.name===""&&typeof o.uri=="string"&&o.uri.startsWith("data:image/")===!1&&(h.name=o.uri);let d=(r.samplers||{})[a.sampler]||{};return h.magFilter=Bf[d.magFilter]||ct,h.minFilter=Bf[d.minFilter]||hn,h.wrapS=kf[d.wrapS]||Nt,h.wrapT=kf[d.wrapT]||Nt,h.generateMipmaps=!h.isCompressedTexture&&h.minFilter!==Ut&&h.minFilter!==ct,i.associations.set(h,{textures:e}),h}).catch(function(){return null});return this.textureCache[l]=c,c}loadImageSource(e,t){let n=this,i=this.json,r=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(u=>u.clone());let a=i.images[e],o=self.URL||self.webkitURL,l=a.uri||"",c=!1;if(a.bufferView!==void 0)l=n.getDependency("bufferView",a.bufferView).then(function(u){c=!0;let d=new Blob([u],{type:a.mimeType});return l=o.createObjectURL(d),l});else if(a.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");let h=Promise.resolve(l).then(function(u){return new Promise(function(d,p){let m=d;t.isImageBitmapLoader===!0&&(m=function(f){let _=new At(f);_.needsUpdate=!0,d(_)}),t.load(Vt.resolveURL(u,r.path),m,void 0,p)})}).then(function(u){return c===!0&&o.revokeObjectURL(l),ri(u,a),u.userData.mimeType=a.mimeType||mv(a.uri),u}).catch(function(u){throw console.error("THREE.GLTFLoader: Couldn't load texture",l),u});return this.sourceCache[e]=h,h}assignTexture(e,t,n,i){let r=this;return this.getDependency("texture",n.index).then(function(a){if(!a)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(a=a.clone(),a.channel=n.texCoord),r.extensions[je.KHR_TEXTURE_TRANSFORM]){let o=n.extensions!==void 0?n.extensions[je.KHR_TEXTURE_TRANSFORM]:void 0;if(o){let l=r.associations.get(a);a=r.extensions[je.KHR_TEXTURE_TRANSFORM].extendTexture(a,o),r.associations.set(a,l)}}return i!==void 0&&(a.colorSpace=i),e[t]=a,a})}assignFinalMaterial(e){let t=e.geometry,n=e.material,i=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,a=t.attributes.normal===void 0;if(e.isPoints){let o="PointsMaterial:"+n.uuid,l=this.cache.get(o);l||(l=new ln,Pt.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,l.sizeAttenuation=!1,this.cache.add(o,l)),n=l}else if(e.isLine){let o="LineBasicMaterial:"+n.uuid,l=this.cache.get(o);l||(l=new on,Pt.prototype.copy.call(l,n),l.color.copy(n.color),l.map=n.map,this.cache.add(o,l)),n=l}if(i||r||a){let o="ClonedMaterial:"+n.uuid+":";i&&(o+="derivative-tangents:"),r&&(o+="vertex-colors:"),a&&(o+="flat-shading:");let l=this.cache.get(o);l||(l=n.clone(),r&&(l.vertexColors=!0),a&&(l.flatShading=!0),i&&(l.normalScale&&(l.normalScale.y*=-1),l.clearcoatNormalScale&&(l.clearcoatNormalScale.y*=-1)),this.cache.add(o,l),this.associations.set(l,this.associations.get(n))),n=l}e.material=n}getMaterialType(){return xn}loadMaterial(e){let t=this,n=this.json,i=this.extensions,r=n.materials[e],a,o={},l=r.extensions||{},c=[];if(l[je.KHR_MATERIALS_UNLIT]){let u=i[je.KHR_MATERIALS_UNLIT];a=u.getMaterialType(),c.push(u.extendParams(o,r,t))}else{let u=r.pbrMetallicRoughness||{};if(o.color=new de(1,1,1),o.opacity=1,Array.isArray(u.baseColorFactor)){let d=u.baseColorFactor;o.color.setRGB(d[0],d[1],d[2],kt),o.opacity=d[3]}u.baseColorTexture!==void 0&&c.push(t.assignTexture(o,"map",u.baseColorTexture,Pe)),o.metalness=u.metallicFactor!==void 0?u.metallicFactor:1,o.roughness=u.roughnessFactor!==void 0?u.roughnessFactor:1,u.metallicRoughnessTexture!==void 0&&(c.push(t.assignTexture(o,"metalnessMap",u.metallicRoughnessTexture)),c.push(t.assignTexture(o,"roughnessMap",u.metallicRoughnessTexture))),a=this._invokeOne(function(d){return d.getMaterialType&&d.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(d){return d.extendMaterialParams&&d.extendMaterialParams(e,o)})))}r.doubleSided===!0&&(o.side=Sn);let h=r.alphaMode||au.OPAQUE;if(h===au.BLEND?(o.transparent=!0,o.depthWrite=!1):(o.transparent=!1,h===au.MASK&&(o.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&a!==Nn&&(c.push(t.assignTexture(o,"normalMap",r.normalTexture)),o.normalScale=new ne(1,1),r.normalTexture.scale!==void 0)){let u=r.normalTexture.scale;o.normalScale.set(u,u)}if(r.occlusionTexture!==void 0&&a!==Nn&&(c.push(t.assignTexture(o,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(o.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&a!==Nn){let u=r.emissiveFactor;o.emissive=new de().setRGB(u[0],u[1],u[2],kt)}return r.emissiveTexture!==void 0&&a!==Nn&&c.push(t.assignTexture(o,"emissiveMap",r.emissiveTexture,Pe)),Promise.all(c).then(function(){let u=new a(o);return r.name&&(u.name=r.name),ri(u,r),t.associations.set(u,{materials:e}),r.extensions&&yr(i,u,r),u})}createUniqueName(e){let t=Ze.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){let t=this,n=this.extensions,i=this.primitiveCache;function r(o){return n[je.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(o,t).then(function(l){return zf(l,o,t)})}let a=[];for(let o=0,l=e.length;o<l;o++){let c=e[o],h=fv(c),u=i[h];if(u)a.push(u.promise);else{let d;c.extensions&&c.extensions[je.KHR_DRACO_MESH_COMPRESSION]?d=r(c):d=zf(new De,c,t),i[h]={primitive:c,promise:d},a.push(d)}}return Promise.all(a)}loadMesh(e){let t=this,n=this.json,i=this.extensions,r=n.meshes[e],a=r.primitives,o=[];for(let l=0,c=a.length;l<c;l++){let h=a[l].material===void 0?uv(this.cache):this.getDependency("material",a[l].material);o.push(h)}return o.push(t.loadGeometries(a)),Promise.all(o).then(function(l){let c=l.slice(0,l.length-1),h=l[l.length-1],u=[];for(let p=0,m=h.length;p<m;p++){let f=h[p],_=a[p],g,v=c[p];if(_.mode===wn.TRIANGLES||_.mode===wn.TRIANGLE_STRIP||_.mode===wn.TRIANGLE_FAN||_.mode===void 0)g=r.isSkinnedMesh===!0?new cr(f,v):new et(f,v),g.isSkinnedMesh===!0&&g.normalizeSkinWeights(),_.mode===wn.TRIANGLE_STRIP?g.geometry=ru(g.geometry,ca):_.mode===wn.TRIANGLE_FAN&&(g.geometry=ru(g.geometry,ss));else if(_.mode===wn.LINES)g=new Ti(f,v);else if(_.mode===wn.LINE_STRIP)g=new Si(f,v);else if(_.mode===wn.LINE_LOOP)g=new Us(f,v);else if(_.mode===wn.POINTS)g=new Un(f,v);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+_.mode);Object.keys(g.geometry.morphAttributes).length>0&&pv(g,r),g.name=t.createUniqueName(r.name||"mesh_"+e),ri(g,r),_.extensions&&yr(i,g,_),t.assignFinalMaterial(g),u.push(g)}for(let p=0,m=u.length;p<m;p++)t.associations.set(u[p],{meshes:e,primitives:p});if(u.length===1)return r.extensions&&yr(i,u[0],r),u[0];let d=new bt;r.extensions&&yr(i,d,r),t.associations.set(d,{meshes:e});for(let p=0,m=u.length;p<m;p++)d.add(u[p]);return d})}loadCamera(e){let t,n=this.json.cameras[e],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?t=new vt(mt.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2e6):n.type==="orthographic"&&(t=new Hi(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),ri(t,n),Promise.resolve(t)}loadSkin(e){let t=this.json.skins[e],n=[];for(let i=0,r=t.joints.length;i<r;i++)n.push(this._loadNodeShallow(t.joints[i]));return t.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",t.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(i){let r=i.pop(),a=i,o=[],l=[];for(let c=0,h=a.length;c<h;c++){let u=a[c];if(u){o.push(u);let d=new ge;r!==null&&d.fromArray(r.array,c*16),l.push(d)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[c])}return new hr(o,l)})}loadAnimation(e){let t=this.json,n=this,i=t.animations[e],r=i.name?i.name:"animation_"+e,a=[],o=[],l=[],c=[],h=[];for(let u=0,d=i.channels.length;u<d;u++){let p=i.channels[u],m=i.samplers[p.sampler],f=p.target,_=f.node,g=i.parameters!==void 0?i.parameters[m.input]:m.input,v=i.parameters!==void 0?i.parameters[m.output]:m.output;f.node!==void 0&&(a.push(this.getDependency("node",_)),o.push(this.getDependency("accessor",g)),l.push(this.getDependency("accessor",v)),c.push(m),h.push(f))}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(l),Promise.all(c),Promise.all(h)]).then(function(u){let d=u[0],p=u[1],m=u[2],f=u[3],_=u[4],g=[];for(let b=0,y=d.length;b<y;b++){let S=d[b],x=p[b],A=m[b],F=f[b],L=_[b];if(S===void 0)continue;S.updateMatrix&&S.updateMatrix();let P=n._createAnimationTracks(S,x,A,F,L);if(P)for(let O=0;O<P.length;O++)g.push(P[O])}let v=new Zn(r,void 0,g);return ri(v,i),v})}createNodeMesh(e){let t=this.json,n=this,i=t.nodes[e];return i.mesh===void 0?null:n.getDependency("mesh",i.mesh).then(function(r){let a=n._getNodeRef(n.meshCache,i.mesh,r);return i.weights!==void 0&&a.traverse(function(o){if(o.isMesh)for(let l=0,c=i.weights.length;l<c;l++)o.morphTargetInfluences[l]=i.weights[l]}),a})}loadNode(e){let t=this.json,n=this,i=t.nodes[e],r=n._loadNodeShallow(e),a=[],o=i.children||[];for(let c=0,h=o.length;c<h;c++)a.push(n.getDependency("node",o[c]));let l=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([r,Promise.all(a),l]).then(function(c){let h=c[0],u=c[1],d=c[2];d!==null&&h.traverse(function(p){p.isSkinnedMesh&&p.bind(d,gv)});for(let p=0,m=u.length;p<m;p++)h.add(u[p]);if(h.userData.pivot!==void 0&&u.length>0){let p=h.userData.pivot,m=u[0];h.pivot=new C().fromArray(p),h.position.x-=p[0],h.position.y-=p[1],h.position.z-=p[2],m.position.set(0,0,0),delete h.userData.pivot}return h})}_loadNodeShallow(e){let t=this.json,n=this.extensions,i=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];let r=t.nodes[e],a=r.name?i.createUniqueName(r.name):"",o=[],l=i._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(e)});return l&&o.push(l),r.camera!==void 0&&o.push(i.getDependency("camera",r.camera).then(function(c){return i._getNodeRef(i.cameraCache,r.camera,c)})),i._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(e)}).forEach(function(c){o.push(c)}),this.nodeCache[e]=Promise.all(o).then(function(c){let h;if(r.isBone===!0?h=new xi:c.length>1?h=new bt:c.length===1?h=c[0]:h=new st,h!==c[0])for(let u=0,d=c.length;u<d;u++)h.add(c[u]);if(r.name&&(h.userData.name=r.name,h.name=a),ri(h,r),r.extensions&&yr(n,h,r),r.matrix!==void 0){let u=new ge;u.fromArray(r.matrix),h.applyMatrix4(u)}else r.translation!==void 0&&h.position.fromArray(r.translation),r.rotation!==void 0&&h.quaternion.fromArray(r.rotation),r.scale!==void 0&&h.scale.fromArray(r.scale);if(!i.associations.has(h))i.associations.set(h,{});else if(r.mesh!==void 0&&i.meshCache.refs[r.mesh]>1){let u=i.associations.get(h);i.associations.set(h,{...u})}return i.associations.get(h).nodes=e,h}),this.nodeCache[e]}loadScene(e){let t=this.extensions,n=this.json.scenes[e],i=this,r=new bt;n.name&&(r.name=i.createUniqueName(n.name)),ri(r,n),n.extensions&&yr(t,r,n);let a=n.nodes||[],o=[];for(let l=0,c=a.length;l<c;l++)o.push(i.getDependency("node",a[l]));return Promise.all(o).then(function(l){for(let h=0,u=l.length;h<u;h++){let d=l[h];d.parent!==null?r.add(Nf(d)):r.add(d)}let c=h=>{let u=new Map;for(let[d,p]of i.associations)(d instanceof Pt||d instanceof At)&&u.set(d,p);return h.traverse(d=>{let p=i.associations.get(d);p!=null&&u.set(d,p)}),u};return i.associations=c(r),r})}_createAnimationTracks(e,t,n,i,r){let a=[],o=e.name?e.name:e.uuid,l=[];function c(p){p.morphTargetInfluences&&l.push(p.name?p.name:p.uuid)}Xi[r.path]===Xi.weights?(c(e),e.isGroup&&e.children.forEach(c)):l.push(o);let h;switch(Xi[r.path]){case Xi.weights:h=On;break;case Xi.rotation:h=Mn;break;case Xi.translation:case Xi.scale:h=Bn;break;default:n.itemSize===1?h=On:h=Bn;break}let u=i.interpolation!==void 0?hv[i.interpolation]:ar,d=this._getArrayFromAccessor(n);for(let p=0,m=l.length;p<m;p++){let f=new h(l[p]+"."+Xi[r.path],t.array,d,u);i.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(f),a.push(f)}return a}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){let n=Iu(t.constructor),i=new Float32Array(t.length);for(let r=0,a=t.length;r<a;r++)i[r]=t[r]*n;t=i}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(n){let i=this instanceof Mn?Cu:yl;return new i(this.times,this.values,this.getValueSize()/3,n)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}};function vv(s,e,t){let n=e.attributes,i=new zt;if(n.POSITION!==void 0){let o=t.json.accessors[n.POSITION],l=o.min,c=o.max;if(l!==void 0&&c!==void 0){if(i.set(new C(l[0],l[1],l[2]),new C(c[0],c[1],c[2])),o.normalized){let h=Iu(cs[o.componentType]);i.min.multiplyScalar(h),i.max.multiplyScalar(h)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;let r=e.targets;if(r!==void 0){let o=new C,l=new C;for(let c=0,h=r.length;c<h;c++){let u=r[c];if(u.POSITION!==void 0){let d=t.json.accessors[u.POSITION],p=d.min,m=d.max;if(p!==void 0&&m!==void 0){if(l.setX(Math.max(Math.abs(p[0]),Math.abs(m[0]))),l.setY(Math.max(Math.abs(p[1]),Math.abs(m[1]))),l.setZ(Math.max(Math.abs(p[2]),Math.abs(m[2]))),d.normalized){let f=Iu(cs[d.componentType]);l.multiplyScalar(f)}o.max(l)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}i.expandByVector(o)}s.boundingBox=i;let a=new Jt;i.getCenter(a.center),a.radius=i.min.distanceTo(i.max)/2,s.boundingSphere=a}function zf(s,e,t){let n=e.attributes,i=[];function r(a,o){return t.getDependency("accessor",a).then(function(l){s.setAttribute(o,l)})}for(let a in n){let o=Pu[a]||a.toLowerCase();o in s.attributes||i.push(r(n[a],o))}if(e.indices!==void 0&&!s.index){let a=t.getDependency("accessor",e.indices).then(function(o){s.setIndex(o)});i.push(a)}return Ce.workingColorSpace!==kt&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Ce.workingColorSpace}" not supported.`),ri(s,e),vv(s,e,t),Promise.all(i).then(function(){return e.targets!==void 0?dv(s,e.targets,t):s})}var Du=new WeakMap,bv=new URL("vendor/three/addons/libs/draco/draco_decoder.wasm",document.baseURI).toString(),_v=new URL("vendor/three/addons/libs/draco/draco_wasm_wrapper.js",document.baseURI).toString(),yv=new URL("vendor/three/addons/libs/draco/draco_decoder.js",document.baseURI).toString(),Gx={js:new URL("vendor/three/addons/libs/draco/gltf/draco_wasm_wrapper.js",document.baseURI).toString(),wasm:new URL("vendor/three/addons/libs/draco/gltf/draco_decoder.wasm",document.baseURI).toString()},xl=class extends ot{constructor(e){super(e),this.decoderPaths={js:_v,wasm:bv,dep_js:yv},this.decoderConfig={},this.decoderBinary=null,this.decoderPending=null,this.workerLimit=4,this.workerPool=[],this.workerNextTaskID=1,this.workerSourceURL="",this.defaultAttributeIDs={position:"POSITION",normal:"NORMAL",color:"COLOR",uv:"TEX_COORD"},this.defaultAttributeTypes={position:"Float32Array",normal:"Float32Array",color:"Float32Array",uv:"Float32Array"}}setDecoderPath(e){let{decoderPaths:t}=this;return typeof e=="object"?(t.js=e.js,t.wasm=e.wasm,t.dep_js=null):(t.js=Vt.resolveURL("draco_wasm_wrapper.js",e),t.wasm=Vt.resolveURL("draco_decoder.wasm",e),t.dep_js=Vt.resolveURL("draco_decoder.js",e)),this}setDecoderConfig(e){return console.warn("THREE.DRACOLoader: setDecoderConfig to has been deprecated and will be removed in r194."),this.decoderConfig=e,this}setWorkerLimit(e){return this.workerLimit=e,this}load(e,t,n,i){let r=new _t(this.manager);r.setPath(this.path),r.setResponseType("arraybuffer"),r.setRequestHeader(this.requestHeader),r.setWithCredentials(this.withCredentials),r.load(e,a=>{this.parse(a,t,i)},n,i)}parse(e,t,n=()=>{}){this.decodeDracoFile(e,t,null,null,Pe,n).catch(n)}decodeDracoFile(e,t,n,i,r=kt,a=()=>{}){let o={attributeIDs:n||this.defaultAttributeIDs,attributeTypes:i||this.defaultAttributeTypes,useUniqueIDs:!!n,vertexColorSpace:r};return this.decodeGeometry(e,o).then(t).catch(a)}decodeGeometry(e,t){let n=JSON.stringify(t);if(Du.has(e)){let l=Du.get(e);if(l.key===n)return l.promise;if(e.byteLength===0)throw new Error("THREE.DRACOLoader: Unable to re-decode a buffer with different settings. Buffer has already been transferred.")}let i,r=this.workerNextTaskID++,a=e.byteLength,o=this._getWorker(r,a).then(l=>(i=l,new Promise((c,h)=>{i._callbacks[r]={resolve:c,reject:h},i.postMessage({type:"decode",id:r,taskConfig:t,buffer:e},[e])}))).then(l=>this._createGeometry(l.geometry));return o.catch(()=>!0).then(()=>{i&&r&&this._releaseTask(i,r)}),Du.set(e,{key:n,promise:o}),o}_createGeometry(e){let t=new De;e.index&&t.setIndex(new Xe(e.index.array,1));for(let n=0;n<e.attributes.length;n++){let{name:i,array:r,itemSize:a,stride:o,vertexColorSpace:l}=e.attributes[n],c;if(a===o)c=new Xe(r,a);else{let h=new Oi(r,o);c=new Bi(h,a,0)}i==="color"&&(this._assignVertexColorSpace(c,l),c.normalized=!(r instanceof Float32Array)),t.setAttribute(i,c)}return t}_assignVertexColorSpace(e,t){if(t!==Pe)return;let n=new de;for(let i=0,r=e.count;i<r;i++)n.fromBufferAttribute(e,i),Ce.colorSpaceToWorking(n,Pe),e.setXYZ(i,n.r,n.g,n.b)}_loadLibrary(e,t){let n=new _t(this.manager);return n.setResponseType(t),n.setWithCredentials(this.withCredentials),new Promise((i,r)=>{n.load(e,i,void 0,r)})}preload(){return this._initDecoder(),this}_initDecoder(){if(this.decoderPending)return this.decoderPending;let e=typeof WebAssembly!="object"||this.decoderConfig.type==="js",t=[],{decoderPaths:n}=this;if(e){if(n.dep_js===null)throw new Error("THREE.DRACOLoader: WebAssembly is required when using a custom decoder paths.");t.push(this._loadLibrary(n.dep_js,"text"))}else t.push(this._loadLibrary(n.js,"text")),t.push(this._loadLibrary(n.wasm,"arraybuffer"));return this.decoderPending=Promise.all(t).then(i=>{let r=i[0];e||(this.decoderConfig.wasmBinary=i[1]);let a=xv.toString(),o=["/* draco decoder */",r,"","/* worker */",a.substring(a.indexOf("{")+1,a.lastIndexOf("}"))].join(`
`);this.workerSourceURL=URL.createObjectURL(new Blob([o]))}),this.decoderPending}_getWorker(e,t){return this._initDecoder().then(()=>{if(this.workerPool.length<this.workerLimit){let i=new Worker(this.workerSourceURL);i._callbacks={},i._taskCosts={},i._taskLoad=0,i.postMessage({type:"init",decoderConfig:this.decoderConfig}),i.onmessage=function(r){let a=r.data;switch(a.type){case"decode":i._callbacks[a.id].resolve(a);break;case"error":i._callbacks[a.id].reject(a);break;default:console.error('THREE.DRACOLoader: Unexpected message, "'+a.type+'"')}},this.workerPool.push(i)}else this.workerPool.sort(function(i,r){return i._taskLoad>r._taskLoad?-1:1});let n=this.workerPool[this.workerPool.length-1];return n._taskCosts[e]=t,n._taskLoad+=t,n})}_releaseTask(e,t){e._taskLoad-=e._taskCosts[t],delete e._callbacks[t],delete e._taskCosts[t]}debug(){console.log("Task load: ",this.workerPool.map(e=>e._taskLoad))}dispose(){for(let e=0;e<this.workerPool.length;++e)this.workerPool[e].terminate();return this.workerPool.length=0,this.workerSourceURL!==""&&URL.revokeObjectURL(this.workerSourceURL),this}};function xv(){let s,e;onmessage=function(a){let o=a.data;switch(o.type){case"init":s=o.decoderConfig,e=new Promise(function(h){s.onModuleLoaded=function(u){h({draco:u})},DracoDecoderModule(s)});break;case"decode":let l=o.buffer,c=o.taskConfig;e.then(h=>{let u=h.draco,d=new u.Decoder;try{let p=t(u,d,new Int8Array(l),c),m=p.attributes.map(f=>f.array.buffer);p.index&&m.push(p.index.array.buffer),self.postMessage({type:"decode",id:o.id,geometry:p},m)}catch(p){console.error(p),self.postMessage({type:"error",id:o.id,error:p.message})}finally{u.destroy(d)}});break}};function t(a,o,l,c){let h=c.attributeIDs,u=c.attributeTypes,d,p,m=o.GetEncodedGeometryType(l);if(m===a.TRIANGULAR_MESH)d=new a.Mesh,p=o.DecodeArrayToMesh(l,l.byteLength,d);else if(m===a.POINT_CLOUD)d=new a.PointCloud,p=o.DecodeArrayToPointCloud(l,l.byteLength,d);else throw new Error("THREE.DRACOLoader: Unexpected geometry type.");if(!p.ok()||d.ptr===0)throw new Error("THREE.DRACOLoader: Decoding failed: "+p.error_msg());let f={index:null,attributes:[]};for(let _ in h){let g=self[u[_]],v,b;if(c.useUniqueIDs)b=h[_],v=o.GetAttributeByUniqueId(d,b);else{if(b=o.GetAttributeId(d,a[h[_]]),b===-1)continue;v=o.GetAttribute(d,b)}let y=i(a,o,d,_,g,v);_==="color"&&(y.vertexColorSpace=c.vertexColorSpace),f.attributes.push(y)}return m===a.TRIANGULAR_MESH&&(f.index=n(a,o,d)),a.destroy(d),f}function n(a,o,l){let h=l.num_faces()*3,u=h*4,d=a._malloc(u);o.GetTrianglesUInt32Array(l,u,d);let p=new Uint32Array(a.HEAPF32.buffer,d,h).slice();return a._free(d),{array:p,itemSize:1}}function i(a,o,l,c,h,u){let d=l.num_points(),p=u.num_components(),m=r(a,h),f=p*h.BYTES_PER_ELEMENT,_=Math.ceil(f/4)*4,g=_/h.BYTES_PER_ELEMENT,v=d*f,b=d*_,y=a._malloc(v);o.GetAttributeDataArrayForAllPoints(l,u,m,v,y);let S=new h(a.HEAPF32.buffer,y,v/h.BYTES_PER_ELEMENT),x;if(f===_)x=S.slice();else{x=new h(b/h.BYTES_PER_ELEMENT);let A=0;for(let F=0,L=S.length;F<L;F++){for(let P=0;P<p;P++)x[A+P]=S[F*p+P];A+=g}}return a._free(y),{name:c,count:d,itemSize:p,array:x,stride:g}}function r(a,o){switch(o){case Float32Array:return a.DT_FLOAT32;case Int8Array:return a.DT_INT8;case Int16Array:return a.DT_INT16;case Int32Array:return a.DT_INT32;case Uint8Array:return a.DT_UINT8;case Uint16Array:return a.DT_UINT16;case Uint32Array:return a.DT_UINT32}}}var Vf=(function(){var s="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuixkbeeeddddillviebeoweuecj:Gdkr;Neqo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949WboY9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVJ9V29VVbrl79IV9Rbwq:VZkdbk:XYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz:jjjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbh5dnawTmbaxa8Acd4fRbbh5kcbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz:jjjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:kjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q:G:cjbfcj:G:cjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bwar9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfcbaicdfa8J9c8N1:NfghRbbag9cjjjjjw:dg8J9qE86bbarcVfcbaha8J9c8M1:NfghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fcbaha8J9c8N1:NfgiRbbag9cjjjjjw:dg8J9qE86bbarc96fcbaia8J9c8M1:NfgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbw83bwarai8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbaocl4h8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E94aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z:jjjjb8AazazcjdfaAcufad2fadz:jjjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:ysezu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnalaeci9UgrcHf6mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:kjjjb8Aav9cu83iUav9cu83i8Wav9cu83iyav9cu83iaav9cu83iKav9cu83izav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbavaiaqaDcsGfRbbgscl4gP9RcsGcdtfydbaxcefgOaPEhDavaias9RcsGcdtfydbaOaPTgzfgOascsGgPEhsaPThPdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiazfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaPfhiaOaPfhxxekaxcbalRbbgsEgHaDc;:eSgDfhOascsGhAdndnascl4gCmbaOcefhzxekaOhzavaiaC9RcsGcdtfydbhOkdndnaAmbazcefhxxekazhxavaias9RcsGcdtfydbhzkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhHascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaHhDxekaDcefhDkasce4cbasceG9R7amfgmhHkdndnaCcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhOaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkaOhsxekascefhskaPce4cbaPceG9R7amfgmhOkdndnaAcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhzaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkazhlxekalcefhlkaPce4cbaPceG9R7amfgmhzkdndnadcd9hmbabarcetfgDaH87ebaDclfaz87ebaDcdfaO87ebxekabarcdtfgDaHBdbaDcwfazBdbaDclfaOBdbkavc;abfaocitfgDaOBdbaDaHBdlavaicdtfaHBdbavc;abfaocefcsGcitfgDazBdbaDaOBdlavaicefgicsGcdtfaOBdbavc;abfaocdfcsGcitfgDaHBdbaDazBdlavaiaCTaCcsSVfgicsGcdtfazBdbaiaATaAcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnalaecvf9pmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk:4ioiue99dud99dud99dnaeTmbcbhiabhlindndnal8Uebgv:YgoJ:ji:1Salcof8UebgrciVgw:Y:vgDNJbbbZJbbb:;avcu9kEMgq:lJbbb9p9DTmbaq:Ohkxekcjjjj94hkkalclf8Uebhvalcdf8UebhxalarcefciGcetfak87ebdndnax:YgqaDNJbbbZJbbb:;axcu9kEMgm:lJbbb9p9DTmbam:Ohxxekcjjjj94hxkabaiarciGgkfcd7cetfax87ebdndnav:YgmaDNJbbbZJbbb:;avcu9kEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkalarcufciGcetfav87ebdndnawaw2:ZgPaPMaoaoN:taqaqN:tamamN:tgoJbbbbaoJbbbb9GE:raDNJbbbZMgD:lJbbb9p9DTmbaD:Ohrxekcjjjj94hrkalakcetfar87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk:Tvirud99eudndnadcl9hmbaeTmeindndnabRbbgiabcefgl8Sbbgvabcdfgo8Sbbgrf9R:YJbbuJabcifgwRbbgdce4adVgDcd4aDVgDcl4aDVgD:Z:vgqNJbbbZMgk:lJbbb9p9DTmbak:Ohxxekcjjjj94hxkaoax86bbdndnaraif:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohoxekcjjjj94hokalao86bbdndnavaifar9R:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabai86bbdndnaDadcetGadceGV:ZaqNJbbbZMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkawad86bbabclfhbaecufgembxdkkaeTmbindndnab8Vebgiabcdfgl8Uebgvabclfgo8Uebgrf9R:YJbFu9habcofgw8Vebgdce4adVgDcd4aDVgDcl4aDVgDcw4aDVgD:Z:vgqNJbbbZMgk:lJbbb9p9DTmbak:Ohxxekcjjjj94hxkaoax87ebdndnaraif:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohoxekcjjjj94hokalao87ebdndnavaifar9R:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabai87ebdndnaDadcetGadceGV:ZaqNJbbbZMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkawad87ebabcwfhbaecufgembkkk9teiucbcbyd:K:G:cjbgeabcifc98GfgbBd:K:G:cjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;LeeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiclfaeclfydbBdbaicwfaecwfydbBdbaicxfaecxfydbBdbaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk;aeedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdbaicxfalBdbaicwfalBdbaiclfalBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk83dbcj:Gdk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:K:Gdkl8W:qbb",e="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuixkbbebeeddddilve9Weeeviebeoweuecj:Gdkr;Neqo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949WbwY9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVJ9V29VVbDl79IV9Rbqq:W9Dklbzik94evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaeai86b:q:W:cjbaecitab8Piw83i:q:G:cjbaecefgecjd9hmbkk:JBl8Aud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaialfgxar9RhodnadTgmmbavaoad;8qbbkaicefhPcj;abad9Uc;WFbGcjdadca0EhsdndndnadTmbaoadfhzcbhHinaeaH9nmdaxaP9RaD6miabaHad2fhOaPaDfhAasaeaH9RaHasfae6EgCcsfgocl4cifcd4hXavcj;cbfaoc9WGgQcetfhLavcj;cbfaQci2fhKavcj;cbfaQfhYcbh8Aaoc;ab6hEincbh3dnawTmbaPa8Acd4fRbbh3kcbh5avcj;cbfh8Eindndndndna3a5cet4ciGgoc9:fPdebdkaxaA9RaQ6mwdnaQTmbavcj;cbfa5aQ2faAaQ;8qbbkaAaCfhAxdkaQTmeavcj;cbfa5aQ2fcbaQ;8kbxekaxaA9RaX6moaoclVcbawEhraAaXfhocbhidnaEmbaxao9Rc;Gb6mbcbhlina8EalfhidndndndndndnaAalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaoclffagRb:q:W:cjbfhoxikaiaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaocwffagRb:q:W:cjbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbahaocdffagRb:q:W:cjbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaoclffagRb:q:W:cjbfhoxikaiczfaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaocwffagRb:q:W:cjbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbahaocdffagRb:q:W:cjbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaoclffagRb:q:W:cjbfhoxikaicafaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaocwffagRb:q:W:cjbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbahaocdffagRb:q:W:cjbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Ngicitpbi:q:G:cjbaiRb:q:W:cjbgipsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbaiaoclffaqRb:q:W:cjbfhoxikaic8Wfaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Ngicitpbi:q:G:cjbaiRb:q:W:cjbgipsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbaiaocwffaqRb:q:W:cjbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitpbi:q:G:cjbaiRb:q:W:cjbgipsaoRbegqcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqRb:q:W:cjbfhokalc;abfhialcjefaQ0meaihlaxao9Rc;Fb0mbkkdnaiaQ9pmbaici4hlinaxao9RcK6mwa8EaifhqdndndndndndnaAaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spkbbahaoclffagRb:q:W:cjbfhoxikaqaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spkbbahaocwffagRb:q:W:cjbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpkbbahaocdffagRb:q:W:cjbfhokalcdfhlaiczfgiaQ6mbkkaohAaoTmoka8EaQfh8Ea5cefg5cl9hmbkdndndndnawTmbaza8Acd4fRbbglciGPlbedwbkaQTmdavcjdfa8Afhlava8Afpbdbh8Jcbhoinalavcj;cbfaofpblbg8KaYaofpblbg8LpmbzeHdOiAlCvXoQrLg8MaLaofpblbg8NaKaofpblbgypmbzeHdOiAlCvXoQrLg8PpmbezHdiOAlvCXorQLg8Fcep9Ta8Fpxeeeeeeeeeeeeeeeegap9op9Hp9rg8Fa8Jp9Ug8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9Abbbaladfgla8Ja8Ma8PpmwDKYqk8AExm35Ps8E8Fg8Fcep9Ta8Faap9op9Hp9rg8Fp9Ug8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9Abbbaladfgla8Ja8Ka8LpmwKDYq8AkEx3m5P8Es8Fg8Ka8NaypmwKDYq8AkEx3m5P8Es8Fg8LpmbezHdiOAlvCXorQLg8Fcep9Ta8Faap9op9Hp9rg8Fp9Ug8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9Abbbaladfgla8Ja8Ka8LpmwDKYqk8AExm35Ps8E8Fg8Fcep9Ta8Faap9op9Hp9rg8Fp9Ugap9Abbbaladfglaaa8Fa8Fpmlvorlvorlvorlvorp9Ugap9Abbbaladfglaaa8Fa8FpmwDqkwDqkwDqkwDqkp9Ugap9Abbbaladfglaaa8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9AbbbaladfhlaoczfgoaQ6mbxikkaQTmeavcjdfa8Afhlava8Afpbdbh8Jcbhoinalavcj;cbfaofpblbg8KaYaofpblbg8LpmbzeHdOiAlCvXoQrLg8MaLaofpblbg8NaKaofpblbgypmbzeHdOiAlCvXoQrLg8PpmbezHdiOAlvCXorQLg8Fcep:nea8Fpxebebebebebebebebgap9op:bep9rg8Fa8Jp:oeg8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9Abbbaladfgla8Ja8Ma8PpmwDKYqk8AExm35Ps8E8Fg8Fcep:nea8Faap9op:bep9rg8Fp:oeg8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9Abbbaladfgla8Ja8Ka8LpmwKDYq8AkEx3m5P8Es8Fg8Ka8NaypmwKDYq8AkEx3m5P8Es8Fg8LpmbezHdiOAlvCXorQLg8Fcep:nea8Faap9op:bep9rg8Fp:oeg8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9Abbbaladfgla8Ja8Ka8LpmwDKYqk8AExm35Ps8E8Fg8Fcep:nea8Faap9op:bep9rg8Fp:oegap9Abbbaladfglaaa8Fa8Fpmlvorlvorlvorlvorp:oegap9Abbbaladfglaaa8Fa8FpmwDqkwDqkwDqkwDqkp:oegap9Abbbaladfglaaa8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9AbbbaladfhlaoczfgoaQ6mbxdkkaQTmbcbhocbalcl4gl9Rc8FGhiavcjdfa8Afhrava8Afpbdbhainaravcj;cbfaofpblbg8JaYaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaLaofpblbg8MaKaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Faip:Rea8Falp:Tep9qg8Faap9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9Abbbaradfgraaa8LaypmwDKYqk8AExm35Ps8E8Fg8Faip:Rea8Falp:Tep9qg8Fp9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9Abbbaradfgraaa8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Faip:Rea8Falp:Tep9qg8Fp9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9Abbbaradfgraaa8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Faip:Rea8Falp:Tep9qg8Fp9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9AbbbaradfhraoczfgoaQ6mbkka8Aclfg8Aad6mbkdnaCad2goTmbaOavcjdfao;8qbbkdnammbavavcjdfaCcufad2fad;8qbbkaCaHfhHc9:hoaAhPaAmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdasaeao9Raoasfae6Eaofgoae6mbkaial9RhPkcbc99axaP9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbkNsezu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnalaeci9UgrcHf6mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbav9cu83iUav9cu83i8Wav9cu83iyav9cu83iaav9cu83iKav9cu83izav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbavaiaqaDcsGfRbbgscl4gP9RcsGcdtfydbaxcefgOaPEhDavaias9RcsGcdtfydbaOaPTgzfgOascsGgPEhsaPThPdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiazfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaPfhiaOaPfhxxekaxcbalRbbgsEgHaDc;:eSgDfhOascsGhAdndnascl4gCmbaOcefhzxekaOhzavaiaC9RcsGcdtfydbhOkdndnaAmbazcefhxxekazhxavaias9RcsGcdtfydbhzkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhHascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaHhDxekaDcefhDkasce4cbasceG9R7amfgmhHkdndnaCcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhOaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkaOhsxekascefhskaPce4cbaPceG9R7amfgmhOkdndnaAcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhzaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkazhlxekalcefhlkaPce4cbaPceG9R7amfgmhzkdndnadcd9hmbabarcetfgDaH87ebaDclfaz87ebaDcdfaO87ebxekabarcdtfgDaHBdbaDcwfazBdbaDclfaOBdbkavc;abfaocitfgDaOBdbaDaHBdlavaicdtfaHBdbavc;abfaocefcsGcitfgDazBdbaDaOBdlavaicefgicsGcdtfaOBdbavc;abfaocdfcsGcitfgDaHBdbaDazBdlavaiaCTaCcsSVfgicsGcdtfazBdbaiaATaAcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnalaecvf9pmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk;Toio97eue97aec98Ghedndnadcl9hmbaeTmecbhdinababpbbbgicKp:RecKp:Sep;6eglaicwp:RecKp:Sep;6ealp;Geaiczp:RecKp:Sep;6egvp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egralpxbbbjbbbjbbbjbbbjgwp9op9rp;Keglpxbb;:9cbb;:9cbb;:9cbb;:9calalp;Meaoaop;Meavaravawp9op9rp;Keglalp;Mep;Kep;Kep;Jep;Negvp;Mepxbbn0bbn0bbn0bbn0grp;KepxFbbbFbbbFbbbFbbbp9oaipxbbbFbbbFbbbFbbbFp9op9qalavp;Mearp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaoavp;Mearp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbabczfhbadclfgdae6mbxdkkaeTmbcbhdinabczfgDaDpbbbgipxbbbbbbFFbbbbbbFFgwp9oabpbbbgoaipmbediwDqkzHOAKY8AEgvczp:Reczp:Sep;6eglaoaipmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;6eavczp:Sep;6egvp;Gealp;Gep;Kep;Legipxbbbbbbbbbbbbbbbbp:2egralpxbbbjbbbjbbbjbbbjgqp9op9rp;Keglpxb;:FSb;:FSb;:FSb;:FSalalp;Meaiaip;Meavaravaqp9op9rp;Keglalp;Mep;Kep;Kep;Jep;Negvp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbp9oaiavp;Mearp;Keczp:Rep9qgialavp;Mearp;KepxFFbbFFbbFFbbFFbbp9oglpmwDKYqk8AExm35Ps8E8Fp9qpkbbabaoawp9oaialpmbezHdiOAlvCXorQLp9qpkbbabcafhbadclfgdae6mbkkk;2ileue97euo97dnaec98GgiTmbcbheinabcKfpx:ji:1S:ji:1S:ji:1S:ji:1SabpbbbglabczfgvpbbbgopmlvorxmPsCXQL358E8Fgrczp:Segwpxibbbibbbibbbibbbp9qp;6egDp;NegqaDaDp;MegDaDp;KealaopmbediwDqkzHOAKY8AEgDczp:Reczp:Sep;6eglalp;MeaDczp:Sep;6egoaop;Mearczp:Reczp:Sep;6egrarp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jep;Mepxbbn0bbn0bbn0bbn0gDp;KepxFFbbFFbbFFbbFFbbgkp9oaqaop;MeaDp;Keczp:Rep9qgoaqalp;MeaDp;Keakp9oaqarp;MeaDp;Keczp:Rep9qgDpmwDKYqk8AExm35Ps8E8Fglp5eawclp:RegqpEi:T:j83ibavalp5baqpEd:T:j83ibabcwfaoaDpmbezHdiOAlvCXorQLgDp5eaqpEe:T:j83ibabaDp5baqpEb:T:j83ibabcafhbaeclfgeai6mbkkkuee97dnadcd4ae2c98GgeTmbcbhdinababpbbbgicwp:Recwp:Sep;6eaicep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbabczfhbadclfgdae6mbkkk:Sodw97euaec98Ghedndnadcl9hmbaeTmecbhdinabpxbbuJbbuJbbuJbbuJabpbbbgicKp:TeglaicYp:Tep9qgvcdp:Teavp9qgvclp:Teavp9qgop;6ep;Negvaicwp:RecKp:SegraipxFbbbFbbbFbbbFbbbgwp9ogDp:Uep;6ep;Mepxbbn0bbn0bbn0bbn0gqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9oavaDarp:Xeaiczp:RecKp:Segip:Uep;6ep;Meaqp;Keawp9op9qavaDaraip:Uep:Xep;6ep;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qavaoalcep:Rep9oalpxebbbebbbebbbebbbp9op9qp;6ep;Meaqp;KecKp:Rep9qpkbbabczfhbadclfgdae6mbxdkkaeTmbcbhdinabczfgkpxbFu9hbFu9hbFu9hbFu9habpbbbglakpbbbgrpmlvorxmPsCXQL358E8Fgvczp:TegqavcHp:Tep9qgicdp:Teaip9qgiclp:Teaip9qgicwp:Teaip9qgop;6ep;NegialarpmbediwDqkzHOAKY8AEgDpxFFbbFFbbFFbbFFbbglp9ograDczp:Segwp:Ueavczp:Reczp:SegDp:Xep;6ep;Mepxbbn0bbn0bbn0bbn0gvp;Kealp9oaiarawaDp:Uep:Xep;6ep;Meavp;Keczp:Rep9qgwaiaoaqcep:Rep9oaqpxebbbebbbebbbebbbp9op9qp;6ep;Meavp;Keczp:ReaiaDarp:Uep;6ep;Meavp;Kealp9op9qgipmwDKYqk8AExm35Ps8E8FpkbbabawaipmbezHdiOAlvCXorQLpkbbabcafhbadclfgdae6mbkkk9teiucbcbydj:G:cjbgeabcifc98GfgbBdj:G:cjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkxebcj:Gdklz:zbb",t=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),n=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var i=WebAssembly.validate(t)?o(e):o(s),r,a=WebAssembly.instantiate(i,{}).then(function(g){r=g.instance,r.exports.__wasm_call_ctors()});function o(g){for(var v=new Uint8Array(g.length),b=0;b<g.length;++b){var y=g.charCodeAt(b);v[b]=y>96?y-97:y>64?y-39:y+4}for(var S=0,b=0;b<g.length;++b)v[S++]=v[b]<60?n[v[b]]:(v[b]-60)*64+v[++b];return v.buffer.slice(0,S)}function l(g,v,b,y,S,x,A){var F=g.exports.sbrk,L=y+3&-4,P=F(L*S),O=F(x.length),B=new Uint8Array(g.exports.memory.buffer);B.set(x,O);var j=v(P,y,S,O,x.length);if(j==0&&A&&A(P,L,S),b.set(B.subarray(P,P+y*S)),F(P-F(0)),j!=0)throw new Error("Malformed buffer data: "+j)}var c={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp",COLOR:"meshopt_decodeFilterColor"},h={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},u=[],d=0;function p(g){var v={object:new Worker(g),pending:0,requests:{}};return v.object.onmessage=function(b){var y=b.data;v.pending-=y.count,v.requests[y.id][y.action](y.value),delete v.requests[y.id]},v}function m(g){for(var v="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(i)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+_.name+";"+l.toString()+_.toString(),b=new Blob([v],{type:"text/javascript"}),y=URL.createObjectURL(b),S=u.length;S<g;++S)u[S]=p(y);for(var S=g;S<u.length;++S)u[S].object.postMessage({});u.length=g,URL.revokeObjectURL(y)}function f(g,v,b,y,S){for(var x=u[0],A=1;A<u.length;++A)u[A].pending<x.pending&&(x=u[A]);return new Promise(function(F,L){var P=new Uint8Array(b),O=++d;x.pending+=g,x.requests[O]={resolve:F,reject:L},x.object.postMessage({id:O,count:g,size:v,source:P,mode:y,filter:S},[P.buffer])})}function _(g){var v=g.data;self.ready.then(function(b){if(!v.id)return self.close();try{var y=new Uint8Array(v.count*v.size);l(b,b.exports[v.mode],y,v.count,v.size,v.source,b.exports[v.filter]),self.postMessage({id:v.id,count:v.count,action:"resolve",value:y},[y.buffer])}catch(S){self.postMessage({id:v.id,count:v.count,action:"reject",value:S})}})}return{ready:a,supported:!0,useWorkers:function(g){m(g)},decodeVertexBuffer:function(g,v,b,y,S){l(r,r.exports.meshopt_decodeVertexBuffer,g,v,b,y,r.exports[c[S]])},decodeIndexBuffer:function(g,v,b,y){l(r,r.exports.meshopt_decodeIndexBuffer,g,v,b,y)},decodeIndexSequence:function(g,v,b,y){l(r,r.exports.meshopt_decodeIndexSequence,g,v,b,y)},decodeGltfBuffer:function(g,v,b,y,S,x){l(r,r.exports[h[S]],g,v,b,y,r.exports[c[x]])},decodeGltfBufferAsync:function(g,v,b,y,S){return u.length>0?f(g,v,b,h[y],c[S]):a.then(function(){var x=new Uint8Array(g*v);return l(r,r.exports[h[y]],x,g,v,b,r.exports[c[S]]),x})}}})();var pn=Uint8Array,hs=Uint16Array,Mv=Int32Array,Hf=new pn([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),jf=new pn([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),Sv=new pn([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),Wf=function(s,e){for(var t=new hs(31),n=0;n<31;++n)t[n]=e+=1<<s[n-1];for(var i=new Mv(t[30]),n=1;n<30;++n)for(var r=t[n];r<t[n+1];++r)i[r]=r-t[n]<<5|n;return{b:t,r:i}},qf=Wf(Hf,2),Xf=qf.b,Tv=qf.r;Xf[28]=258,Tv[258]=28;var Kf=Wf(jf,0),wv=Kf.b,jx=Kf.r,Ou=new hs(32768);for(tt=0;tt<32768;++tt)Ei=(tt&43690)>>1|(tt&21845)<<1,Ei=(Ei&52428)>>2|(Ei&13107)<<2,Ei=(Ei&61680)>>4|(Ei&3855)<<4,Ou[tt]=((Ei&65280)>>8|(Ei&255)<<8)>>1;var Ei,tt,ma=(function(s,e,t){for(var n=s.length,i=0,r=new hs(e);i<n;++i)s[i]&&++r[s[i]-1];var a=new hs(e);for(i=1;i<e;++i)a[i]=a[i-1]+r[i-1]<<1;var o;if(t){o=new hs(1<<e);var l=15-e;for(i=0;i<n;++i)if(s[i])for(var c=i<<4|s[i],h=e-s[i],u=a[s[i]-1]++<<h,d=u|(1<<h)-1;u<=d;++u)o[Ou[u]>>l]=c}else for(o=new hs(n),i=0;i<n;++i)s[i]&&(o[i]=Ou[a[s[i]-1]++]>>15-s[i]);return o}),ga=new pn(288);for(tt=0;tt<144;++tt)ga[tt]=8;var tt;for(tt=144;tt<256;++tt)ga[tt]=9;var tt;for(tt=256;tt<280;++tt)ga[tt]=7;var tt;for(tt=280;tt<288;++tt)ga[tt]=8;var tt,Yf=new pn(32);for(tt=0;tt<32;++tt)Yf[tt]=5;var tt;var Av=ma(ga,9,1);var Ev=ma(Yf,5,1),Fu=function(s){for(var e=s[0],t=1;t<s.length;++t)s[t]>e&&(e=s[t]);return e},Gn=function(s,e,t){var n=e/8|0;return(s[n]|s[n+1]<<8)>>(e&7)&t},Nu=function(s,e){var t=e/8|0;return(s[t]|s[t+1]<<8|s[t+2]<<16)>>(e&7)},Rv=function(s){return(s+7)/8|0},ku=function(s,e,t){return(e==null||e<0)&&(e=0),(t==null||t>s.length)&&(t=s.length),new pn(s.subarray(e,t))};var Cv=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],nn=function(s,e,t){var n=new Error(e||Cv[s]);if(n.code=s,Error.captureStackTrace&&Error.captureStackTrace(n,nn),!t)throw n;return n},Jf=function(s,e,t,n){var i=s.length,r=n?n.length:0;if(!i||e.f&&!e.l)return t||new pn(0);var a=!t,o=a||e.i!=2,l=e.i;a&&(t=new pn(i*3));var c=function(w){var N=t.length;if(w>N){var M=new pn(Math.max(N*2,w));M.set(t),t=M}},h=e.f||0,u=e.p||0,d=e.b||0,p=e.l,m=e.d,f=e.m,_=e.n,g=i*8;do{if(!p){h=Gn(s,u,1);var v=Gn(s,u+1,3);if(u+=3,v)if(v==1)p=Av,m=Ev,f=9,_=5;else if(v==2){var x=Gn(s,u,31)+257,A=Gn(s,u+10,15)+4,F=x+Gn(s,u+5,31)+1;u+=14;for(var L=new pn(F),P=new pn(19),O=0;O<A;++O)P[Sv[O]]=Gn(s,u+O*3,7);u+=A*3;for(var B=Fu(P),j=(1<<B)-1,H=ma(P,B,1),O=0;O<F;){var W=H[Gn(s,u,j)];u+=W&15;var b=W>>4;if(b<16)L[O++]=b;else{var Y=0,K=0;for(b==16?(K=3+Gn(s,u,3),u+=2,Y=L[O-1]):b==17?(K=3+Gn(s,u,7),u+=3):b==18&&(K=11+Gn(s,u,127),u+=7);K--;)L[O++]=Y}}var ee=L.subarray(0,x),ue=L.subarray(x);f=Fu(ee),_=Fu(ue),p=ma(ee,f,1),m=ma(ue,_,1)}else nn(1);else{var b=Rv(u)+4,y=s[b-4]|s[b-3]<<8,S=b+y;if(S>i){l&&nn(0);break}o&&c(d+y),t.set(s.subarray(b,S),d),e.b=d+=y,e.p=u=S*8,e.f=h;continue}if(u>g){l&&nn(0);break}}o&&c(d+131072);for(var Se=(1<<f)-1,me=(1<<_)-1,xe=u;;xe=u){var Y=p[Nu(s,u)&Se],te=Y>>4;if(u+=Y&15,u>g){l&&nn(0);break}if(Y||nn(2),te<256)t[d++]=te;else if(te==256){xe=u,p=null;break}else{var pe=te-254;if(te>264){var O=te-257,oe=Hf[O];pe=Gn(s,u,(1<<oe)-1)+Xf[O],u+=oe}var V=m[Nu(s,u)&me],G=V>>4;V||nn(3),u+=V&15;var ue=wv[G];if(G>3){var oe=jf[G];ue+=Nu(s,u)&(1<<oe)-1,u+=oe}if(u>g){l&&nn(0);break}o&&c(d+131072);var k=d+pe;if(d<ue){var E=r-ue,T=Math.min(ue,k);for(E+d<0&&nn(3);d<T;++d)t[d]=n[E+d]}for(;d<k;++d)t[d]=t[d-ue]}}e.l=p,e.p=xe,e.b=d,e.f=h,p&&(h=1,e.m=f,e.d=m,e.n=_)}while(!h);return d!=t.length&&a?ku(t,0,d):t.subarray(0,d)};var Pv=new pn(0);var si=function(s,e){return s[e]|s[e+1]<<8},Vn=function(s,e){return(s[e]|s[e+1]<<8|s[e+2]<<16|s[e+3]<<24)>>>0},Uu=function(s,e){return Vn(s,e)+Vn(s,e+4)*4294967296};var Iv=function(s,e){return((s[0]&15)!=8||s[0]>>4>7||(s[0]<<8|s[1])%31)&&nn(6,"invalid zlib data"),(s[1]>>5&1)==+!e&&nn(6,"invalid zlib data: "+(s[1]&32?"need":"unexpected")+" dictionary"),(s[1]>>3&4)+2};function Lv(s,e){return Jf(s,{i:2},e&&e.out,e&&e.dictionary)}function Zf(s,e){return Jf(s.subarray(Iv(s,e&&e.dictionary),-4),{i:2},e&&e.out,e&&e.dictionary)}var Bu=typeof TextDecoder<"u"&&new TextDecoder,Dv=0;try{Bu.decode(Pv,{stream:!0}),Dv=1}catch{}var Fv=function(s){for(var e="",t=0;;){var n=s[t++],i=(n>127)+(n>223)+(n>239);if(t+i>s.length)return{s:e,r:ku(s,t-1)};i?i==3?(n=((n&15)<<18|(s[t++]&63)<<12|(s[t++]&63)<<6|s[t++]&63)-65536,e+=String.fromCharCode(55296|n>>10,56320|n&1023)):i&1?e+=String.fromCharCode((n&31)<<6|s[t++]&63):e+=String.fromCharCode((n&15)<<12|(s[t++]&63)<<6|s[t++]&63):e+=String.fromCharCode(n)}};function Nv(s,e){if(e){for(var t="",n=0;n<s.length;n+=16384)t+=String.fromCharCode.apply(null,s.subarray(n,n+16384));return t}else{if(Bu)return Bu.decode(s);var i=Fv(s),r=i.s,t=i.r;return t.length&&nn(8),r}}var Uv=function(s,e){return e+30+si(s,e+26)+si(s,e+28)},Ov=function(s,e,t){var n=si(s,e+28),i=Nv(s.subarray(e+46,e+46+n),!(si(s,e+8)&2048)),r=e+46+n,a=Vn(s,e+20),o=t&&a==4294967295?Bv(s,r):[a,Vn(s,e+24),Vn(s,e+42)],l=o[0],c=o[1],h=o[2];return[si(s,e+10),l,c,i,r+si(s,e+30)+si(s,e+32),h]},Bv=function(s,e){for(;si(s,e)!=1;e+=4+si(s,e+2));return[Uu(s,e+12),Uu(s,e+4),Uu(s,e+20)]};function Qf(s,e){for(var t={},n=s.length-22;Vn(s,n)!=101010256;--n)(!n||s.length-n>65558)&&nn(13);var i=si(s,n+8);if(!i)return{};var r=Vn(s,n+16),a=r==4294967295||i==65535;if(a){var o=Vn(s,n-12);a=Vn(s,o)==101075792,a&&(i=Vn(s,o+32),r=Vn(s,o+48))}for(var l=e&&e.filter,c=0;c<i;++c){var h=Ov(s,r,a),u=h[0],d=h[1],p=h[2],m=h[3],f=h[4],_=h[5],g=Uv(s,_);r=f,(!l||l({name:m,size:d,originalSize:p,compression:u}))&&(u?u==8?t[m]=Lv(s.subarray(g,g+d),{out:new pn(p)}):nn(14,"unknown compression type "+u):t[m]=ku(s,g,g+d))}return t}function $f(s,e,t){let n=t.length-s-1;if(e>=t[n])return n-1;if(e<=t[s])return s;let i=s,r=n,a=Math.floor((i+r)/2);for(;e<t[a]||e>=t[a+1];)e<t[a]?r=a:i=a,a=Math.floor((i+r)/2);return a}function kv(s,e,t,n){let i=[],r=[],a=[];i[0]=1;for(let o=1;o<=t;++o){r[o]=e-n[s+1-o],a[o]=n[s+o]-e;let l=0;for(let c=0;c<o;++c){let h=a[c+1],u=r[o-c],d=i[c]/(h+u);i[c]=l+h*d,l=u*d}i[o]=l}return i}function em(s,e,t,n){let i=$f(s,n,e),r=kv(i,n,s,e),a=new We(0,0,0,0);for(let o=0;o<=s;++o){let l=t[i-s+o],c=r[o],h=l.w*c;a.x+=l.x*h,a.y+=l.y*h,a.z+=l.z*h,a.w+=l.w*c}return a}function zv(s,e,t,n,i){let r=[];for(let u=0;u<=t;++u)r[u]=0;let a=[];for(let u=0;u<=n;++u)a[u]=r.slice(0);let o=[];for(let u=0;u<=t;++u)o[u]=r.slice(0);o[0][0]=1;let l=r.slice(0),c=r.slice(0);for(let u=1;u<=t;++u){l[u]=e-i[s+1-u],c[u]=i[s+u]-e;let d=0;for(let p=0;p<u;++p){let m=c[p+1],f=l[u-p];o[u][p]=m+f;let _=o[p][u-1]/o[u][p];o[p][u]=d+m*_,d=f*_}o[u][u]=d}for(let u=0;u<=t;++u)a[0][u]=o[u][t];for(let u=0;u<=t;++u){let d=0,p=1,m=[];for(let f=0;f<=t;++f)m[f]=r.slice(0);m[0][0]=1;for(let f=1;f<=n;++f){let _=0,g=u-f,v=t-f;u>=f&&(m[p][0]=m[d][0]/o[v+1][g],_=m[p][0]*o[g][v]);let b=g>=-1?1:-g,y=u-1<=v?f-1:t-u;for(let x=b;x<=y;++x)m[p][x]=(m[d][x]-m[d][x-1])/o[v+1][g+x],_+=m[p][x]*o[g+x][v];u<=v&&(m[p][f]=-m[d][f-1]/o[v+1][u],_+=m[p][f]*o[u][v]),a[f][u]=_;let S=d;d=p,p=S}}let h=t;for(let u=1;u<=n;++u){for(let d=0;d<=t;++d)a[u][d]*=h;h*=t-u}return a}function Gv(s,e,t,n,i){let r=i<s?i:s,a=[],o=$f(s,n,e),l=zv(o,n,s,r,e),c=[];for(let h=0;h<t.length;++h){let u=t[h].clone(),d=u.w;u.x*=d,u.y*=d,u.z*=d,c[h]=u}for(let h=0;h<=r;++h){let u=c[o-s].clone().multiplyScalar(l[h][0]);for(let d=1;d<=s;++d)u.add(c[o-s+d].clone().multiplyScalar(l[h][d]));a[h]=u}for(let h=r+1;h<=i+1;++h)a[h]=new We(0,0,0);return a}function Vv(s,e){let t=1;for(let i=2;i<=s;++i)t*=i;let n=1;for(let i=2;i<=e;++i)n*=i;for(let i=2;i<=s-e;++i)n*=i;return t/n}function Hv(s){let e=s.length,t=[],n=[];for(let r=0;r<e;++r){let a=s[r];t[r]=new C(a.x,a.y,a.z),n[r]=a.w}let i=[];for(let r=0;r<e;++r){let a=t[r].clone();for(let o=1;o<=r;++o)a.sub(i[r-o].clone().multiplyScalar(Vv(r,o)*n[o]));i[r]=a.divideScalar(n[0])}return i}function tm(s,e,t,n,i){let r=Gv(s,e,t,n,i);return Hv(r)}var Ml=class extends Zt{constructor(e,t,n,i,r){super();let a=t?t.length-1:0,o=n?n.length:0;this.degree=e,this.knots=t,this.controlPoints=[],this.startKnot=i||0,this.endKnot=r||a;for(let l=0;l<o;++l){let c=n[l];this.controlPoints[l]=new We(c.x,c.y,c.z,c.w)}}getPoint(e,t=new C){let n=t,i=this.knots[this.startKnot]+e*(this.knots[this.endKnot]-this.knots[this.startKnot]),r=em(this.degree,this.knots,this.controlPoints,i);return r.w!==1&&r.divideScalar(r.w),n.set(r.x,r.y,r.z)}getTangent(e,t=new C){let n=t,i=this.knots[0]+e*(this.knots[this.knots.length-1]-this.knots[0]),r=tm(this.degree,this.knots,this.controlPoints,i,1);return n.copy(r[1]).normalize(),n}toJSON(){let e=super.toJSON();return e.degree=this.degree,e.knots=[...this.knots],e.controlPoints=this.controlPoints.map(t=>t.toArray()),e.startKnot=this.startKnot,e.endKnot=this.endKnot,e}fromJSON(e){return super.fromJSON(e),this.degree=e.degree,this.knots=[...e.knots],this.controlPoints=e.controlPoints.map(t=>new We(t[0],t[1],t[2],t[3])),this.startKnot=e.startKnot,this.endKnot=e.endKnot,this}};var ze,xt,Ht,Tl=class extends ot{constructor(e){super(e)}load(e,t,n,i){let r=this,a=r.path===""?Vt.extractUrlBase(e):r.path,o=new _t(this.manager);o.setPath(r.path),o.setResponseType("arraybuffer"),o.setRequestHeader(r.requestHeader),o.setWithCredentials(r.withCredentials),o.load(e,function(l){try{t(r.parse(l,a))}catch(c){i?i(c):console.error(c),r.manager.itemError(e)}},n,i)}parse(e,t){if(Wv(e))ze=new qu().parse(e);else{let i=rm(e);if(!qv(i))throw new Error("THREE.FBXLoader: Unknown format.");if(nm(i)<7e3)throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: "+nm(i));ze=new Wu().parse(i)}let n=new kn(this.manager).setPath(this.resourcePath||t).setCrossOrigin(this.crossOrigin);return new Vu(n,this.manager).parse(ze)}},Vu=class{constructor(e,t){this.textureLoader=e,this.manager=t}parse(){xt=this.parseConnections();let e=this.parseImages(),t=this.parseTextures(e),n=this.parseMaterials(t),i=this.parseDeformers(),r=new Hu().parse(i);return this.parseScene(i,r,n),Ht}parseConnections(){let e=new Map;return"Connections"in ze&&ze.Connections.connections.forEach(function(n){let i=n[0],r=n[1],a=n[2];e.has(i)||e.set(i,{parents:[],children:[]});let o={ID:r,relationship:a};e.get(i).parents.push(o),e.has(r)||e.set(r,{parents:[],children:[]});let l={ID:i,relationship:a};e.get(r).children.push(l)}),e}parseImages(){let e={},t={};if("Video"in ze.Objects){let n=ze.Objects.Video;for(let i in n){let r=n[i],a=parseInt(i);if(e[a]=r.RelativeFilename||r.Filename,"Content"in r){let o=r.Content instanceof ArrayBuffer&&r.Content.byteLength>0,l=typeof r.Content=="string"&&r.Content!=="";if(o||l){let c=this.parseImage(n[i]);t[r.RelativeFilename||r.Filename]=c}}}}for(let n in e){let i=e[n];t[i]!==void 0?e[n]=t[i]:e[n]=e[n].split("\\").pop()}return e}parseImage(e){let t=e.Content,n=e.RelativeFilename||e.Filename,i=n.slice(n.lastIndexOf(".")+1).toLowerCase(),r;switch(i){case"bmp":r="image/bmp";break;case"jpg":case"jpeg":r="image/jpeg";break;case"png":r="image/png";break;case"tif":r="image/tiff";break;case"tga":this.manager.getHandler(".tga")===null&&console.warn("FBXLoader: TGA loader not found, skipping ",n),r="image/tga";break;case"webp":r="image/webp";break;default:console.warn('FBXLoader: Image type "'+i+'" is not supported.');return}if(typeof t=="string")return"data:"+r+";base64,"+t;{let a=new Uint8Array(t);return window.URL.createObjectURL(new Blob([a],{type:r}))}}parseTextures(e){let t=new Map;if("Texture"in ze.Objects){let n=ze.Objects.Texture;for(let i in n){let r=this.parseTexture(n[i],e);t.set(parseInt(i),r)}}return t}parseTexture(e,t){let n=this.loadTexture(e,t);n.ID=e.id,n.name=e.attrName;let i=e.WrapModeU,r=e.WrapModeV,a=i!==void 0?i.value:0,o=r!==void 0?r.value:0;if(n.wrapS=a===0?Nt:qt,n.wrapT=o===0?Nt:qt,"Scaling"in e){let l=e.Scaling.value;n.repeat.x=l[0],n.repeat.y=l[1]}if("Translation"in e){let l=e.Translation.value;n.offset.x=l[0],n.offset.y=l[1]}return n}loadTexture(e,t){let n=e.FileName.split(".").pop().toLowerCase(),i=this.manager.getHandler(`.${n}`);i===null&&(i=this.textureLoader);let r=i.path;r||i.setPath(this.textureLoader.path);let a=xt.get(e.id).children,o;if(a!==void 0&&a.length>0&&t[a[0].ID]!==void 0&&(o=t[a[0].ID],(o.indexOf("blob:")===0||o.indexOf("data:")===0)&&i.setPath(void 0)),o===void 0)return console.warn("FBXLoader: Undefined filename, creating placeholder texture."),new At;let l=i.load(o);return i.setPath(r),l}parseMaterials(e){let t=new Map;if("Material"in ze.Objects){let n=ze.Objects.Material;for(let i in n){let r=this.parseMaterial(n[i],e);r!==null&&t.set(parseInt(i),r)}}return t}parseMaterial(e,t){let n=e.id,i=e.attrName,r=e.ShadingModel;if(typeof r=="object"&&(r=r.value),!xt.has(n))return null;let a=this.parseParameters(e,t,n),o;switch(r.toLowerCase()){case"phong":o=new Gt;break;case"lambert":o=new Js;break;default:console.warn('THREE.FBXLoader: unknown material type "%s". Defaulting to MeshPhongMaterial.',r),o=new Gt;break}return o.setValues(a),o.name=i,o}parseParameters(e,t,n){let i={};e.BumpFactor&&(i.bumpScale=e.BumpFactor.value),e.Diffuse?i.color=Ce.colorSpaceToWorking(new de().fromArray(e.Diffuse.value),Pe):e.DiffuseColor&&(e.DiffuseColor.type==="Color"||e.DiffuseColor.type==="ColorRGB")&&(i.color=Ce.colorSpaceToWorking(new de().fromArray(e.DiffuseColor.value),Pe)),e.DisplacementFactor&&(i.displacementScale=e.DisplacementFactor.value),e.Emissive?i.emissive=Ce.colorSpaceToWorking(new de().fromArray(e.Emissive.value),Pe):e.EmissiveColor&&(e.EmissiveColor.type==="Color"||e.EmissiveColor.type==="ColorRGB")&&(i.emissive=Ce.colorSpaceToWorking(new de().fromArray(e.EmissiveColor.value),Pe)),e.EmissiveFactor&&(i.emissiveIntensity=parseFloat(e.EmissiveFactor.value)),i.opacity=1-(e.TransparencyFactor?parseFloat(e.TransparencyFactor.value):0),(i.opacity===1||i.opacity===0)&&(i.opacity=e.Opacity?parseFloat(e.Opacity.value):null,i.opacity===null&&(i.opacity=1)),i.opacity<1&&(i.transparent=!0),e.ReflectionFactor&&(i.reflectivity=e.ReflectionFactor.value),e.Shininess&&(i.shininess=e.Shininess.value),e.Specular?i.specular=Ce.colorSpaceToWorking(new de().fromArray(e.Specular.value),Pe):e.SpecularColor&&e.SpecularColor.type==="Color"&&(i.specular=Ce.colorSpaceToWorking(new de().fromArray(e.SpecularColor.value),Pe));let r=this;return xt.get(n).children.forEach(function(a){let o=a.relationship;switch(o){case"Bump":i.bumpMap=r.getTexture(t,a.ID);break;case"Maya|TEX_ao_map":i.aoMap=r.getTexture(t,a.ID);break;case"DiffuseColor":case"Maya|TEX_color_map":i.map=r.getTexture(t,a.ID),i.map!==void 0&&(i.map.colorSpace=Pe);break;case"DisplacementColor":i.displacementMap=r.getTexture(t,a.ID);break;case"EmissiveColor":i.emissiveMap=r.getTexture(t,a.ID),i.emissiveMap!==void 0&&(i.emissiveMap.colorSpace=Pe);break;case"NormalMap":case"Maya|TEX_normal_map":i.normalMap=r.getTexture(t,a.ID);break;case"ReflectionColor":i.envMap=r.getTexture(t,a.ID),i.envMap!==void 0&&(i.envMap.mapping=ts,i.envMap.colorSpace=Pe);break;case"SpecularColor":i.specularMap=r.getTexture(t,a.ID),i.specularMap!==void 0&&(i.specularMap.colorSpace=Pe);break;case"TransparentColor":case"TransparencyFactor":i.alphaMap=r.getTexture(t,a.ID),i.transparent=!0;break;default:console.warn("THREE.FBXLoader: %s map is not supported in three.js, skipping texture.",o);break}}),i}getTexture(e,t){return"LayeredTexture"in ze.Objects&&t in ze.Objects.LayeredTexture&&(console.warn("THREE.FBXLoader: layered textures are not supported in three.js. Discarding all but first layer."),t=xt.get(t).children[0].ID),e.get(t)}parseDeformers(){let e={},t={};if("Deformer"in ze.Objects){let n=ze.Objects.Deformer;for(let i in n){let r=n[i],a=xt.get(parseInt(i));if(r.attrType==="Skin"){let o=this.parseSkeleton(a,n);o.ID=i,a.parents.length>1&&console.warn("THREE.FBXLoader: skeleton attached to more than one geometry is not supported."),o.geometryID=a.parents[0].ID,e[i]=o}else if(r.attrType==="BlendShape"){let o={id:i};o.rawTargets=this.parseMorphTargets(a,n),o.id=i,a.parents.length>1&&console.warn("THREE.FBXLoader: morph target attached to more than one geometry is not supported."),t[i]=o}}}return{skeletons:e,morphTargets:t}}parseSkeleton(e,t){let n=[];return e.children.forEach(function(i){let r=t[i.ID];if(r.attrType!=="Cluster")return;let a={ID:i.ID,indices:[],weights:[],transformLink:new ge().fromArray(r.TransformLink.a)};"Indexes"in r&&(a.indices=r.Indexes.a,a.weights=r.Weights.a),n.push(a)}),{rawBones:n,bones:[]}}parseMorphTargets(e,t){let n=[];for(let i=0;i<e.children.length;i++){let r=e.children[i],a=t[r.ID],o={name:a.attrName,initialWeight:a.DeformPercent,id:a.id,fullWeights:a.FullWeights.a};if(a.attrType!=="BlendShapeChannel")return;o.geoID=xt.get(parseInt(r.ID)).children.filter(function(l){return l.relationship===void 0})[0].ID,n.push(o)}return n}parseScene(e,t,n){Ht=new bt;let i=this.parseModels(e.skeletons,t,n),r=ze.Objects.Model,a=this;i.forEach(function(u){let d=r[u.ID];a.setLookAtProperties(u,d),xt.get(u.ID).parents.forEach(function(m){let f=i.get(m.ID);f!==void 0&&f.add(u)}),u.parent===null&&Ht.add(u)}),this.addGlobalSceneSettings(),Ht.traverse(function(u){if(u.userData.transformData){u.parent&&(u.userData.transformData.parentMatrix=u.parent.matrix,u.userData.transformData.parentMatrixWorld=u.parent.matrixWorld);let d=im(u.userData.transformData);u.applyMatrix4(d),u.updateWorldMatrix()}});let o=this.parsePoseNodes(),l=new Set;for(let u in e.skeletons)e.skeletons[u].rawBones.forEach(function(d,p){let m=e.skeletons[u].bones[p];m&&l.add(m.ID)});let c=new ge;Ht.traverse(function(u){if(u.isBone&&u.ID!==void 0&&!l.has(u.ID)){let d=o[u.ID];d!==void 0&&(u.parent?(c.copy(u.parent.matrixWorld).invert(),c.multiply(d)):c.copy(d),c.decompose(u.position,u.quaternion,u.scale),u.updateMatrix(),u.matrixWorld.copy(d))}}),this.bindSkeleton(e.skeletons,t,i);let h=new ju().parse();Ht.children.length===1&&Ht.children[0].isGroup&&(Ht.children[0].animations=h,Ht=Ht.children[0]),Ht.animations=h,"GlobalSettings"in ze&&"UpAxis"in ze.GlobalSettings&&ze.GlobalSettings.UpAxis.value===2&&(console.warn("THREE.FBXLoader: You are loading an asset with a Z-UP coordinate system. The loader just rotates the asset to transform it into Y-UP. The vertex data are not converted."),Ht.rotation.set(-Math.PI/2,0,0))}parseModels(e,t,n){let i=new Map,r=ze.Objects.Model;for(let a in r){let o=parseInt(a),l=r[a],c=xt.get(o),h=this.buildSkeleton(c,e,o,l.attrName);if(!h){switch(l.attrType){case"Camera":h=this.createCamera(c);break;case"Light":h=this.createLight(c);break;case"Mesh":h=this.createMesh(c,t,n);break;case"NurbsCurve":h=this.createCurve(c,t);break;case"LimbNode":case"Root":h=new xi;break;default:h=new bt;break}h.name=l.attrName?Ze.sanitizeNodeName(l.attrName):"",h.userData.originalName=l.attrName,h.ID=o}this.getTransformData(h,l),i.set(o,h)}return i}buildSkeleton(e,t,n,i){let r=null;return e.parents.forEach(function(a){for(let o in t){let l=t[o];l.rawBones.forEach(function(c,h){if(c.ID===a.ID){let u=r;r=new xi,r.matrixWorld.copy(c.transformLink),r.name=i?Ze.sanitizeNodeName(i):"",r.userData.originalName=i,r.ID=n,l.bones[h]=r,u!==null&&r.add(u)}})}}),r}createCamera(e){let t,n;if(e.children.forEach(function(i){let r=ze.Objects.NodeAttribute[i.ID];r!==void 0&&(n=r)}),n===void 0)t=new st;else{let i=0;n.CameraProjectionType!==void 0&&n.CameraProjectionType.value===1&&(i=1);let r=1;n.NearPlane!==void 0&&(r=n.NearPlane.value/1e3);let a=1e3;n.FarPlane!==void 0&&(a=n.FarPlane.value/1e3);let o=window.innerWidth,l=window.innerHeight;n.AspectWidth!==void 0&&n.AspectHeight!==void 0&&(o=n.AspectWidth.value,l=n.AspectHeight.value);let c=o/l,h=45;n.FieldOfView!==void 0&&(h=n.FieldOfView.value);let u=n.FocalLength?n.FocalLength.value:null;switch(i){case 0:t=new vt(h,c,r,a),u!==null&&t.setFocalLength(u);break;case 1:console.warn("THREE.FBXLoader: Orthographic cameras not supported yet."),t=new st;break;default:console.warn("THREE.FBXLoader: Unknown camera type "+i+"."),t=new st;break}}return t}createLight(e){let t,n;if(e.children.forEach(function(i){let r=ze.Objects.NodeAttribute[i.ID];r!==void 0&&(n=r)}),n===void 0)t=new st;else{let i;n.LightType===void 0?i=0:i=n.LightType.value;let r=16777215;n.Color!==void 0&&(r=Ce.colorSpaceToWorking(new de().fromArray(n.Color.value),Pe));let a=n.Intensity===void 0?1:n.Intensity.value/100;n.CastLightOnObject!==void 0&&n.CastLightOnObject.value===0&&(a=0);let o=0;n.FarAttenuationEnd!==void 0&&(n.EnableFarAttenuation!==void 0&&n.EnableFarAttenuation.value===0?o=0:o=n.FarAttenuationEnd.value);let l=1;switch(i){case 0:t=new Vi(r,a,o,l);break;case 1:t=new Qn(r,a);break;case 2:let c=Math.PI/3,h=0;n.OuterAngle!==void 0?(c=mt.degToRad(n.OuterAngle.value),n.InnerAngle!==void 0&&(h=1-n.InnerAngle.value/n.OuterAngle.value,h=Math.max(0,h))):n.InnerAngle!==void 0&&(c=mt.degToRad(n.InnerAngle.value)),t=new pr(r,a,o,c,h,l);break;default:console.warn("THREE.FBXLoader: Unknown light type "+n.LightType.value+", defaulting to a PointLight."),t=new Vi(r,a);break}n.CastShadows!==void 0&&n.CastShadows.value===1&&(t.castShadow=!0)}return t}createMesh(e,t,n){let i,r=null,a=null,o=[];if(e.children.forEach(function(l){t.has(l.ID)&&(r=t.get(l.ID)),n.has(l.ID)&&o.push(n.get(l.ID))}),o.length>1?a=o:o.length>0?a=o[0]:(a=new Gt({name:ot.DEFAULT_MATERIAL_NAME,color:13421772}),o.push(a)),"color"in r.attributes&&o.forEach(function(l){l.vertexColors=!0}),r.groups.length>0){let l=!1;for(let c=0,h=r.groups.length;c<h;c++){let u=r.groups[c];(u.materialIndex<0||u.materialIndex>=o.length)&&(u.materialIndex=o.length,l=!0)}if(l){let c=new Gt;o.push(c)}}return r.FBX_Deformer?(i=new cr(r,a),i.normalizeSkinWeights()):i=new et(r,a),i}createCurve(e,t){let n=e.children.reduce(function(r,a){return t.has(a.ID)&&(r=t.get(a.ID)),r},null),i=new on({name:ot.DEFAULT_MATERIAL_NAME,color:3342591,linewidth:1});return new Si(n,i)}getTransformData(e,t){let n={};"InheritType"in t&&(n.inheritType=parseInt(t.InheritType.value)),"RotationOrder"in t?n.eulerOrder=va(t.RotationOrder.value):n.eulerOrder=va(0),"Lcl_Translation"in t&&(n.translation=t.Lcl_Translation.value),"PreRotation"in t&&(n.preRotation=t.PreRotation.value),"Lcl_Rotation"in t&&(n.rotation=t.Lcl_Rotation.value),"PostRotation"in t&&(n.postRotation=t.PostRotation.value),"Lcl_Scaling"in t&&(n.scale=t.Lcl_Scaling.value),"ScalingOffset"in t&&(n.scalingOffset=t.ScalingOffset.value),"ScalingPivot"in t&&(n.scalingPivot=t.ScalingPivot.value),"RotationOffset"in t&&(n.rotationOffset=t.RotationOffset.value),"RotationPivot"in t&&(n.rotationPivot=t.RotationPivot.value),e.userData.transformData=n}setLookAtProperties(e,t){"LookAtProperty"in t&&xt.get(e.ID).children.forEach(function(i){if(i.relationship==="LookAtProperty"){let r=ze.Objects.Model[i.ID];if("Lcl_Translation"in r){let a=r.Lcl_Translation.value;e.target!==void 0?(e.target.position.fromArray(a),Ht.add(e.target)):e.lookAt(new C().fromArray(a))}}})}bindSkeleton(e,t,n){for(let i in e){let r=e[i],a=[];for(let l=0,c=r.bones.length;l<c;l++){let h=new ge;r.bones[l]&&r.rawBones[l]&&h.copy(r.rawBones[l].transformLink).invert(),a.push(h)}xt.get(parseInt(r.ID)).parents.forEach(function(l){if(t.has(l.ID)){let c=l.ID;xt.get(c).parents.forEach(function(u){if(n.has(u.ID)){let d=n.get(u.ID);d.updateMatrixWorld(!0),d.bind(new hr(r.bones,a),d.matrixWorld)}})}})}}parsePoseNodes(){let e={};if("Pose"in ze.Objects){let t=ze.Objects.Pose;for(let n in t)if(t[n].attrType==="BindPose"&&t[n].NbPoseNodes>0){let i=t[n].PoseNode;Array.isArray(i)?i.forEach(function(r){e[r.Node]=new ge().fromArray(r.Matrix.a)}):e[i.Node]=new ge().fromArray(i.Matrix.a)}}return e}addGlobalSceneSettings(){if("GlobalSettings"in ze){if("AmbientColor"in ze.GlobalSettings){let e=ze.GlobalSettings.AmbientColor.value,t=e[0],n=e[1],i=e[2];if(t!==0||n!==0||i!==0){let r=new de().setRGB(t,n,i,Pe);Ht.add(new ta(r,1))}}"UnitScaleFactor"in ze.GlobalSettings&&(Ht.userData.unitScaleFactor=ze.GlobalSettings.UnitScaleFactor.value)}}},Hu=class{constructor(){this.negativeMaterialIndices=!1}parse(e){let t=new Map;if("Geometry"in ze.Objects){let n=ze.Objects.Geometry;for(let i in n){let r=xt.get(parseInt(i)),a=this.parseGeometry(r,n[i],e);t.set(parseInt(i),a)}}return this.negativeMaterialIndices===!0&&console.warn("THREE.FBXLoader: The FBX file contains invalid (negative) material indices. The asset might not render as expected."),t}parseGeometry(e,t,n){switch(t.attrType){case"Mesh":return this.parseMeshGeometry(e,t,n);case"NurbsCurve":return this.parseNurbsGeometry(t)}}parseMeshGeometry(e,t,n){let i=n.skeletons,r=[],a=e.parents.map(function(u){return ze.Objects.Model[u.ID]});if(a.length===0)return;let o=e.children.reduce(function(u,d){return i[d.ID]!==void 0&&(u=i[d.ID]),u},null);e.children.forEach(function(u){n.morphTargets[u.ID]!==void 0&&r.push(n.morphTargets[u.ID])});let l=a[0],c={};"RotationOrder"in l&&(c.eulerOrder=va(l.RotationOrder.value)),"InheritType"in l&&(c.inheritType=parseInt(l.InheritType.value)),"GeometricTranslation"in l&&(c.translation=l.GeometricTranslation.value),"GeometricRotation"in l&&(c.rotation=l.GeometricRotation.value),"GeometricScaling"in l&&(c.scale=l.GeometricScaling.value);let h=im(c);return this.genGeometry(t,o,r,h)}genGeometry(e,t,n,i){let r=new De;e.attrName&&(r.name=e.attrName);let a=this.parseGeoNode(e,t),o=this.genBuffers(a),l=new ve(o.vertex,3);if(l.applyMatrix4(i),r.setAttribute("position",l),o.colors.length>0&&r.setAttribute("color",new ve(o.colors,3)),t&&(r.setAttribute("skinIndex",new _i(o.weightsIndices,4)),r.setAttribute("skinWeight",new ve(o.vertexWeights,4)),r.FBX_Deformer=t),o.normal.length>0){let c=new Fe().getNormalMatrix(i),h=new ve(o.normal,3);h.applyNormalMatrix(c),r.setAttribute("normal",h)}if(o.uvs.forEach(function(c,h){let u=h===0?"uv":`uv${h}`;r.setAttribute(u,new ve(o.uvs[h],2))}),a.material&&a.material.mappingType!=="AllSame"){let c=o.materialIndex[0],h=0;if(o.materialIndex.forEach(function(u,d){u!==c&&(r.addGroup(h,d-h,c),c=u,h=d)}),r.groups.length>0){let u=r.groups[r.groups.length-1],d=u.start+u.count;d!==o.materialIndex.length&&r.addGroup(d,o.materialIndex.length-d,c)}r.groups.length===0&&r.addGroup(0,o.materialIndex.length,o.materialIndex[0])}return this.addMorphTargets(r,e,n,i),r}parseGeoNode(e,t){let n={};if(n.vertexPositions=e.Vertices!==void 0?e.Vertices.a:[],n.vertexIndices=e.PolygonVertexIndex!==void 0?e.PolygonVertexIndex.a:[],e.LayerElementColor&&e.LayerElementColor[0].Colors&&(n.color=this.parseVertexColors(e.LayerElementColor[0])),e.LayerElementMaterial&&(n.material=this.parseMaterialIndices(e.LayerElementMaterial[0])),e.LayerElementNormal&&(n.normal=this.parseNormals(e.LayerElementNormal[0])),e.LayerElementUV){n.uv=[];let i=0;for(;e.LayerElementUV[i];)e.LayerElementUV[i].UV&&n.uv.push(this.parseUVs(e.LayerElementUV[i])),i++}return n.weightTable={},t!==null&&(n.skeleton=t,t.rawBones.forEach(function(i,r){i.indices.forEach(function(a,o){n.weightTable[a]===void 0&&(n.weightTable[a]=[]),n.weightTable[a].push({id:r,weight:i.weights[o]})})})),n}genBuffers(e){let t={vertex:[],normal:[],colors:[],uvs:[],materialIndex:[],vertexWeights:[],weightsIndices:[]},n=0,i=0,r=!1,a=[],o=[],l=[],c=[],h=[],u=[],d=this;return e.vertexIndices.forEach(function(p,m){let f,_=!1;p<0&&(p=p^-1,_=!0);let g=[],v=[];if(a.push(p*3,p*3+1,p*3+2),e.color){let b=Sl(m,n,p,e.color);l.push(b[0],b[1],b[2])}if(e.skeleton){if(e.weightTable[p]!==void 0&&e.weightTable[p].forEach(function(b){v.push(b.weight),g.push(b.id)}),v.length>4){r||(console.warn("THREE.FBXLoader: Vertex has more than 4 skinning weights assigned to vertex. Deleting additional weights."),r=!0);let b=[0,0,0,0],y=[0,0,0,0];v.forEach(function(S,x){let A=S,F=g[x];y.forEach(function(L,P,O){if(A>L){O[P]=A,A=L;let B=b[P];b[P]=F,F=B}})}),g=b,v=y}for(;v.length<4;)v.push(0),g.push(0);for(let b=0;b<4;++b)h.push(v[b]),u.push(g[b])}if(e.normal){let b=Sl(m,n,p,e.normal);o.push(b[0],b[1],b[2])}e.material&&e.material.mappingType!=="AllSame"&&(f=Sl(m,n,p,e.material)[0],f<0&&(d.negativeMaterialIndices=!0,f=0)),e.uv&&e.uv.forEach(function(b,y){let S=Sl(m,n,p,b);c[y]===void 0&&(c[y]=[]),c[y].push(S[0]),c[y].push(S[1])}),i++,_&&(d.genFace(t,e,a,f,o,l,c,h,u,i),n++,i=0,a=[],o=[],l=[],c=[],h=[],u=[])}),t}getNormalNewell(e){let t=new C(0,0,0);for(let n=0;n<e.length;n++){let i=e[n],r=e[(n+1)%e.length];t.x+=(i.y-r.y)*(i.z+r.z),t.y+=(i.z-r.z)*(i.x+r.x),t.z+=(i.x-r.x)*(i.y+r.y)}return t.normalize(),t}getNormalTangentAndBitangent(e){let t=this.getNormalNewell(e),i=(Math.abs(t.z)>.5?new C(0,1,0):new C(0,0,1)).cross(t).normalize(),r=t.clone().cross(i).normalize();return{normal:t,tangent:i,bitangent:r}}flattenVertex(e,t,n){return new ne(e.dot(t),e.dot(n))}genFace(e,t,n,i,r,a,o,l,c,h){let u;if(h>3){let d=[],p=t.baseVertexPositions||t.vertexPositions;for(let g=0;g<n.length;g+=3)d.push(new C(p[n[g]],p[n[g+1]],p[n[g+2]]));let{tangent:m,bitangent:f}=this.getNormalTangentAndBitangent(d),_=[];for(let g of d)_.push(this.flattenVertex(g,m,f));u=bn.triangulateShape(_,[])}else u=[[0,1,2]];for(let[d,p,m]of u)e.vertex.push(t.vertexPositions[n[d*3]]),e.vertex.push(t.vertexPositions[n[d*3+1]]),e.vertex.push(t.vertexPositions[n[d*3+2]]),e.vertex.push(t.vertexPositions[n[p*3]]),e.vertex.push(t.vertexPositions[n[p*3+1]]),e.vertex.push(t.vertexPositions[n[p*3+2]]),e.vertex.push(t.vertexPositions[n[m*3]]),e.vertex.push(t.vertexPositions[n[m*3+1]]),e.vertex.push(t.vertexPositions[n[m*3+2]]),t.skeleton&&(e.vertexWeights.push(l[d*4]),e.vertexWeights.push(l[d*4+1]),e.vertexWeights.push(l[d*4+2]),e.vertexWeights.push(l[d*4+3]),e.vertexWeights.push(l[p*4]),e.vertexWeights.push(l[p*4+1]),e.vertexWeights.push(l[p*4+2]),e.vertexWeights.push(l[p*4+3]),e.vertexWeights.push(l[m*4]),e.vertexWeights.push(l[m*4+1]),e.vertexWeights.push(l[m*4+2]),e.vertexWeights.push(l[m*4+3]),e.weightsIndices.push(c[d*4]),e.weightsIndices.push(c[d*4+1]),e.weightsIndices.push(c[d*4+2]),e.weightsIndices.push(c[d*4+3]),e.weightsIndices.push(c[p*4]),e.weightsIndices.push(c[p*4+1]),e.weightsIndices.push(c[p*4+2]),e.weightsIndices.push(c[p*4+3]),e.weightsIndices.push(c[m*4]),e.weightsIndices.push(c[m*4+1]),e.weightsIndices.push(c[m*4+2]),e.weightsIndices.push(c[m*4+3])),t.color&&(e.colors.push(a[d*3]),e.colors.push(a[d*3+1]),e.colors.push(a[d*3+2]),e.colors.push(a[p*3]),e.colors.push(a[p*3+1]),e.colors.push(a[p*3+2]),e.colors.push(a[m*3]),e.colors.push(a[m*3+1]),e.colors.push(a[m*3+2])),t.material&&t.material.mappingType!=="AllSame"&&(e.materialIndex.push(i),e.materialIndex.push(i),e.materialIndex.push(i)),t.normal&&(e.normal.push(r[d*3]),e.normal.push(r[d*3+1]),e.normal.push(r[d*3+2]),e.normal.push(r[p*3]),e.normal.push(r[p*3+1]),e.normal.push(r[p*3+2]),e.normal.push(r[m*3]),e.normal.push(r[m*3+1]),e.normal.push(r[m*3+2])),t.uv&&t.uv.forEach(function(f,_){e.uvs[_]===void 0&&(e.uvs[_]=[]),e.uvs[_].push(o[_][d*2]),e.uvs[_].push(o[_][d*2+1]),e.uvs[_].push(o[_][p*2]),e.uvs[_].push(o[_][p*2+1]),e.uvs[_].push(o[_][m*2]),e.uvs[_].push(o[_][m*2+1])})}addMorphTargets(e,t,n,i){if(n.length===0)return;e.morphTargetsRelative=!0,e.morphAttributes.position=[];let r=i.clone().setPosition(0,0,0),a=this;n.forEach(function(o){o.rawTargets.forEach(function(l){let c=ze.Objects.Geometry[l.geoID];c!==void 0&&a.genMorphGeometry(e,t,c,r,l.name)})})}genMorphGeometry(e,t,n,i,r){let a=t.Vertices!==void 0?t.Vertices.a:[],o=t.PolygonVertexIndex!==void 0?t.PolygonVertexIndex.a:[],l=n.Vertices!==void 0?n.Vertices.a:[],c=n.Indexes!==void 0?n.Indexes.a:[],h=e.attributes.position.count*3,u=new Float32Array(h);for(let f=0;f<c.length;f++){let _=c[f]*3;u[_]=l[f*3],u[_+1]=l[f*3+1],u[_+2]=l[f*3+2]}let d={vertexIndices:o,vertexPositions:u,baseVertexPositions:a},p=this.genBuffers(d),m=new ve(p.vertex,3);m.name=r||n.attrName,m.applyMatrix4(i),e.morphAttributes.position.push(m)}parseNormals(e){let t=e.MappingInformationType,n=e.ReferenceInformationType,i=e.Normals.a,r=[];return n==="IndexToDirect"&&("NormalIndex"in e?r=e.NormalIndex.a:"NormalsIndex"in e&&(r=e.NormalsIndex.a)),{dataSize:3,buffer:i,indices:r,mappingType:t,referenceType:n}}parseUVs(e){let t=e.MappingInformationType,n=e.ReferenceInformationType,i=e.UV.a,r=[];return n==="IndexToDirect"&&(r=e.UVIndex.a),{dataSize:2,buffer:i,indices:r,mappingType:t,referenceType:n}}parseVertexColors(e){let t=e.MappingInformationType,n=e.ReferenceInformationType,i=e.Colors.a,r=[];n==="IndexToDirect"&&(r=e.ColorIndex.a);for(let a=0,o=new de;a<i.length;a+=4)o.fromArray(i,a),Ce.colorSpaceToWorking(o,Pe),o.toArray(i,a);return{dataSize:4,buffer:i,indices:r,mappingType:t,referenceType:n}}parseMaterialIndices(e){let t=e.MappingInformationType,n=e.ReferenceInformationType;if(t==="NoMappingInformation")return{dataSize:1,buffer:[0],indices:[0],mappingType:"AllSame",referenceType:n};let i=e.Materials.a,r=[];for(let a=0;a<i.length;++a)r.push(a);return{dataSize:1,buffer:i,indices:r,mappingType:t,referenceType:n}}parseNurbsGeometry(e){let t=parseInt(e.Order);if(isNaN(t))return console.error("THREE.FBXLoader: Invalid Order %s given for geometry ID: %s",e.Order,e.id),new De;let n=t-1,i=e.KnotVector.a,r=[],a=e.Points.a;for(let u=0,d=a.length;u<d;u+=4)r.push(new We().fromArray(a,u));let o,l;if(e.Form==="Closed")r.push(r[0]);else if(e.Form==="Periodic"){o=n,l=i.length-1-o;for(let u=0;u<n;++u)r.push(r[u])}let h=new Ml(n,i,r,o,l).getPoints(r.length*12);return new De().setFromPoints(h)}},ju=class{parse(){let e=[],t=this.parseClips();if(t!==void 0)for(let n in t){let i=t[n],r=this.addClip(i);e.push(r)}return e}parseClips(){if(ze.Objects.AnimationCurve===void 0)return;let e=this.parseAnimationCurveNodes();this.parseAnimationCurves(e);let t=this.parseAnimationLayers(e);return this.parseAnimStacks(t)}parseAnimationCurveNodes(){let e=ze.Objects.AnimationCurveNode,t=new Map;for(let n in e){let i=e[n];if(i.attrName.match(/S|R|T|DeformPercent/)!==null){let r={id:i.id,attr:i.attrName,curves:{}};t.set(r.id,r)}}return t}parseAnimationCurves(e){let t=ze.Objects.AnimationCurve;for(let n in t){let i={id:t[n].id,times:t[n].KeyTime.a.map(Xv),values:t[n].KeyValueFloat.a},r=xt.get(i.id);if(r!==void 0){let a=r.parents[0].ID,o=r.parents[0].relationship;o.match(/X/)?e.get(a).curves.x=i:o.match(/Y/)?e.get(a).curves.y=i:o.match(/Z/)?e.get(a).curves.z=i:o.match(/DeformPercent/)&&e.has(a)&&(e.get(a).curves.morph=i)}}}parseAnimationLayers(e){let t=ze.Objects.AnimationLayer,n=new Map;for(let i in t){let r=[],a=xt.get(parseInt(i));a!==void 0&&(a.children.forEach(function(l,c){if(e.has(l.ID)){let h=e.get(l.ID);if(h.curves.x!==void 0||h.curves.y!==void 0||h.curves.z!==void 0){if(r[c]===void 0){let u=xt.get(l.ID).parents.filter(function(p){return p.relationship!==void 0});if(u.length===0)return;let d=u[0].ID;if(d!==void 0){let p=ze.Objects.Model[d.toString()];if(p===void 0){console.warn("THREE.FBXLoader: Encountered a unused curve.",l);return}let m={modelName:p.attrName?Ze.sanitizeNodeName(p.attrName):"",ID:p.id,initialPosition:[0,0,0],initialRotation:[0,0,0],initialScale:[1,1,1]};Ht.traverse(function(f){f.ID===p.id&&(m.transform=f.matrix,f.userData.transformData&&(m.eulerOrder=f.userData.transformData.eulerOrder,f.userData.transformData.rotation&&(m.initialRotation=f.userData.transformData.rotation)))}),m.transform||(m.transform=new ge),"PreRotation"in p&&(m.preRotation=p.PreRotation.value),"PostRotation"in p&&(m.postRotation=p.PostRotation.value),r[c]=m}}r[c]&&(r[c][h.attr]=h)}else if(h.curves.morph!==void 0){if(r[c]===void 0){let u=xt.get(l.ID).parents.filter(function(v){return v.relationship!==void 0});if(u.length===0)return;let d=u[0].ID,p=xt.get(d).parents[0].ID,m=xt.get(p).parents[0].ID,f=xt.get(m).parents[0].ID,_=ze.Objects.Model[f],g={modelName:_.attrName?Ze.sanitizeNodeName(_.attrName):"",morphName:ze.Objects.Deformer[d].attrName};r[c]=g}r[c][h.attr]=h}}}),n.set(parseInt(i),r))}return n}parseAnimStacks(e){let t=ze.Objects.AnimationStack,n={};for(let i in t){let r=xt.get(parseInt(i)).children;r.length>1&&console.warn("THREE.FBXLoader: Encountered an animation stack with multiple layers, this is currently not supported. Ignoring subsequent layers.");let a=e.get(r[0].ID);n[i]={name:t[i].attrName,layer:a}}return n}addClip(e){let t=[],n=this;return e.layer.forEach(function(i){t=t.concat(n.generateTracks(i))}),new Zn(e.name,-1,t)}generateTracks(e){let t=[],n=new C,i=new C;if(e.transform&&e.transform.decompose(n,new $e,i),n=n.toArray(),i=i.toArray(),e.T!==void 0&&Object.keys(e.T.curves).length>0){let r=this.generateVectorTrack(e.modelName,e.T.curves,n,"position");r!==void 0&&t.push(r)}if(e.R!==void 0&&Object.keys(e.R.curves).length>0){let r=this.generateRotationTrack(e.modelName,e.R.curves,e.preRotation,e.postRotation,e.eulerOrder,e.initialRotation);r!==void 0&&t.push(r)}if(e.S!==void 0&&Object.keys(e.S.curves).length>0){let r=this.generateVectorTrack(e.modelName,e.S.curves,i,"scale");r!==void 0&&t.push(r)}if(e.DeformPercent!==void 0){let r=this.generateMorphTrack(e);r!==void 0&&t.push(r)}return t}generateVectorTrack(e,t,n,i){let r=this.getTimesForAllAxes(t),a=this.getKeyframeTrackValues(r,t,n);return new Bn(e+"."+i,r,a)}generateRotationTrack(e,t,n,i,r,a){let o,l;if(t.x!==void 0||t.y!==void 0||t.z!==void 0){let p=this.getTimesForAllAxes(t);if(p.length>0){let m=a||[0,0,0],f=this.synchronizeCurve(t.x,p,m[0]),_=this.synchronizeCurve(t.y,p,m[1]),g=this.synchronizeCurve(t.z,p,m[2]),v=this.interpolateRotations(f,_,g,r);o=v[0],l=v[1]}}let c=va(0);n!==void 0&&(n=n.map(mt.degToRad),n.push(c),n=new Ct().fromArray(n),n=new $e().setFromEuler(n)),i!==void 0&&(i=i.map(mt.degToRad),i.push(c),i=new Ct().fromArray(i),i=new $e().setFromEuler(i).invert());let h=new $e,u=new Ct,d=[];if(!(!l||!o)){for(let p=0;p<l.length;p+=3)u.set(l[p],l[p+1],l[p+2],r),h.setFromEuler(u),n!==void 0&&h.premultiply(n),i!==void 0&&h.multiply(i),p>2&&new $e().fromArray(d,(p-3)/3*4).dot(h)<0&&h.set(-h.x,-h.y,-h.z,-h.w),h.toArray(d,p/3*4);return new Mn(e+".quaternion",o,d)}}generateMorphTrack(e){let t=e.DeformPercent.curves.morph,n=t.values.map(function(r){return r/100}),i=Ht.getObjectByName(e.modelName).morphTargetDictionary[e.morphName];return new On(e.modelName+".morphTargetInfluences["+i+"]",t.times,n)}getTimesForAllAxes(e){let t=[];if(e.x!==void 0&&(t=t.concat(e.x.times)),e.y!==void 0&&(t=t.concat(e.y.times)),e.z!==void 0&&(t=t.concat(e.z.times)),t=t.sort(function(n,i){return n-i}),t.length>1){let n=1,i=t[0];for(let r=1;r<t.length;r++){let a=t[r];a!==i&&(t[n]=a,i=a,n++)}t=t.slice(0,n)}return t}getKeyframeTrackValues(e,t,n){let i=n,r=[],a=-1,o=-1,l=-1;return e.forEach(function(c){if(t.x&&(a=t.x.times.indexOf(c)),t.y&&(o=t.y.times.indexOf(c)),t.z&&(l=t.z.times.indexOf(c)),a!==-1){let h=t.x.values[a];r.push(h),i[0]=h}else r.push(i[0]);if(o!==-1){let h=t.y.values[o];r.push(h),i[1]=h}else r.push(i[1]);if(l!==-1){let h=t.z.values[l];r.push(h),i[2]=h}else r.push(i[2])}),r}synchronizeCurve(e,t,n){if(e===void 0)return{times:t,values:t.map(()=>n)};if(e.times.length===t.length)return e;let i=[];for(let r=0;r<t.length;r++)i.push(this.sampleCurveValue(e,t[r],n));return{times:t,values:i}}sampleCurveValue(e,t,n){let i=e.times,r=e.values;if(t<=i[0])return r[0];if(t>=i[i.length-1])return r[r.length-1];for(let a=0;a<i.length-1;a++)if(t>=i[a]&&t<=i[a+1]){if(i[a]===t)return r[a];let o=(t-i[a])/(i[a+1]-i[a]);return r[a]*(1-o)+r[a+1]*o}return n}interpolateRotations(e,t,n,i){let r=[],a=[];r.push(e.times[0]),a.push(mt.degToRad(e.values[0])),a.push(mt.degToRad(t.values[0])),a.push(mt.degToRad(n.values[0]));for(let o=1;o<e.values.length;o++){let l=[e.values[o-1],t.values[o-1],n.values[o-1]];if(isNaN(l[0])||isNaN(l[1])||isNaN(l[2]))continue;let c=l.map(mt.degToRad),h=[e.values[o],t.values[o],n.values[o]];if(isNaN(h[0])||isNaN(h[1])||isNaN(h[2]))continue;let u=h.map(mt.degToRad),d=[h[0]-l[0],h[1]-l[1],h[2]-l[2]],p=[Math.abs(d[0]),Math.abs(d[1]),Math.abs(d[2])];if(p[0]>=180||p[1]>=180||p[2]>=180){let f=Math.max(...p)/180,_=new Ct(...c,i),g=new Ct(...u,i),v=new $e().setFromEuler(_),b=new $e().setFromEuler(g);v.dot(b)<0&&b.set(-b.x,-b.y,-b.z,-b.w);let y=e.times[o-1],S=e.times[o]-y,x=new $e,A=new Ct;for(let F=0;F<1;F+=1/f)x.copy(v.clone().slerp(b.clone(),F)),r.push(y+F*S),A.setFromQuaternion(x,i),a.push(A.x),a.push(A.y),a.push(A.z)}else r.push(e.times[o]),a.push(mt.degToRad(e.values[o])),a.push(mt.degToRad(t.values[o])),a.push(mt.degToRad(n.values[o]))}return[r,a]}},Wu=class{getPrevNode(){return this.nodeStack[this.currentIndent-2]}getCurrentNode(){return this.nodeStack[this.currentIndent-1]}getCurrentProp(){return this.currentProp}pushStack(e){this.nodeStack.push(e),this.currentIndent+=1}popStack(){this.nodeStack.pop(),this.currentIndent-=1}setCurrentProp(e,t){this.currentProp=e,this.currentPropName=t}parse(e){this.currentIndent=0,this.allNodes=new Al,this.nodeStack=[],this.currentProp=[],this.currentPropName="";let t=this,n=e.split(/[\r\n]+/);return n.forEach(function(i,r){let a=i.match(/^[\s\t]*;/),o=i.match(/^[\s\t]*$/);if(a||o)return;let l=i.match("^\\t{"+t.currentIndent+"}(\\w+):(.*){",""),c=i.match("^\\t{"+t.currentIndent+"}(\\w+):[\\s\\t\\r\\n](.*)"),h=i.match("^\\t{"+(t.currentIndent-1)+"}}");l?t.parseNodeBegin(i,l):c?t.parseNodeProperty(i,c,n[++r]):h?t.popStack():i.match(/^[^\s\t}]/)&&t.parseNodePropertyContinued(i)}),this.allNodes}parseNodeBegin(e,t){let n=t[1].trim().replace(/^"/,"").replace(/"$/,""),i=t[2].split(",").map(function(l){return l.trim().replace(/^"/,"").replace(/"$/,"")}),r={name:n},a=this.parseNodeAttr(i),o=this.getCurrentNode();this.currentIndent===0?this.allNodes.add(n,r):n in o?(n==="PoseNode"?o.PoseNode.push(r):o[n].id!==void 0&&(o[n]={},o[n][o[n].id]=o[n]),a.id!==""&&(o[n][a.id]=r)):typeof a.id=="number"?(o[n]={},o[n][a.id]=r):n!=="Properties70"&&(n==="PoseNode"?o[n]=[r]:o[n]=r),typeof a.id=="number"&&(r.id=a.id),a.name!==""&&(r.attrName=a.name),a.type!==""&&(r.attrType=a.type),this.pushStack(r)}parseNodeAttr(e){let t=e[0];e[0]!==""&&(t=parseInt(e[0]),isNaN(t)&&(t=e[0]));let n="",i="";return e.length>1&&(n=e[1].replace(/^(\w+)::/,""),i=e[2]),{id:t,name:n,type:i}}parseNodeProperty(e,t,n){let i=t[1].replace(/^"/,"").replace(/"$/,"").trim(),r=t[2].replace(/^"/,"").replace(/"$/,"").trim();i==="Content"&&r===","&&(r=n.replace(/"/g,"").replace(/,$/,"").trim());let a=this.getCurrentNode();if(a.name==="Properties70"){this.parseNodeSpecialProperty(e,i,r);return}if(i==="C"){let l=r.split(",").slice(1),c=parseInt(l[0]),h=parseInt(l[1]),u=r.split(",").slice(3);u=u.map(function(d){return d.trim().replace(/^"/,"")}),i="connections",r=[c,h],Yv(r,u),a[i]===void 0&&(a[i]=[])}i==="Node"&&(a.id=r),i in a&&Array.isArray(a[i])?a[i].push(r):i!=="a"?a[i]=r:a.a=r,this.setCurrentProp(a,i),i==="a"&&r.slice(-1)!==","&&(a.a=Gu(r))}parseNodePropertyContinued(e){let t=this.getCurrentNode();t.a+=e,e.slice(-1)!==","&&(t.a=Gu(t.a))}parseNodeSpecialProperty(e,t,n){let i=n.split('",').map(function(h){return h.trim().replace(/^\"/,"").replace(/\s/,"_")}),r=i[0],a=i[1],o=i[2],l=i[3],c=i[4];switch(a){case"int":case"enum":case"bool":case"ULongLong":case"double":case"Number":case"FieldOfView":c=parseFloat(c);break;case"Color":case"ColorRGB":case"Vector3D":case"Lcl_Translation":case"Lcl_Rotation":case"Lcl_Scaling":c=Gu(c);break}this.getPrevNode()[r]={type:a,type2:o,flag:l,value:c},this.setCurrentProp(this.getPrevNode(),r)}},qu=class{parse(e){let t=new wl(e);t.skip(23);let n=t.getUint32();if(n<6400)throw new Error("THREE.FBXLoader: FBX version not supported, FileVersion: "+n);let i=new Al;for(;!this.endOfContent(t);){let r=this.parseNode(t,n);r!==null&&i.add(r.name,r)}return i}endOfContent(e){return e.size()%16===0?(e.getOffset()+160+16&-16)>=e.size():e.getOffset()+160+16>=e.size()}parseNode(e,t){let n={},i=t>=7500?e.getUint64():e.getUint32(),r=t>=7500?e.getUint64():e.getUint32();t>=7500?e.getUint64():e.getUint32();let a=e.getUint8(),o=e.getString(a);if(i===0)return null;let l=[];for(let d=0;d<r;d++)l.push(this.parseProperty(e));let c=l.length>0?l[0]:"",h=l.length>1?l[1]:"",u=l.length>2?l[2]:"";for(n.singleProperty=r===1&&e.getOffset()===i;i>e.getOffset();){let d=this.parseNode(e,t);d!==null&&this.parseSubNode(o,n,d)}return n.propertyList=l,typeof c=="number"&&(n.id=c),h!==""&&(n.attrName=h),u!==""&&(n.attrType=u),o!==""&&(n.name=o),n}parseSubNode(e,t,n){if(n.singleProperty===!0){let i=n.propertyList[0];Array.isArray(i)?(t[n.name]=n,n.a=i):t[n.name]=i}else if(e==="Connections"&&n.name==="C"){let i=[];n.propertyList.forEach(function(r,a){a!==0&&i.push(r)}),t.connections===void 0&&(t.connections=[]),t.connections.push(i)}else if(n.name==="Properties70")Object.keys(n).forEach(function(r){t[r]=n[r]});else if(e==="Properties70"&&n.name==="P"){let i=n.propertyList[0],r=n.propertyList[1],a=n.propertyList[2],o=n.propertyList[3],l;i.indexOf("Lcl ")===0&&(i=i.replace("Lcl ","Lcl_")),r.indexOf("Lcl ")===0&&(r=r.replace("Lcl ","Lcl_")),r==="Color"||r==="ColorRGB"||r==="Vector"||r==="Vector3D"||r.indexOf("Lcl_")===0?l=[n.propertyList[4],n.propertyList[5],n.propertyList[6]]:l=n.propertyList[4],t[i]={type:r,type2:a,flag:o,value:l}}else t[n.name]===void 0?typeof n.id=="number"?(t[n.name]={},t[n.name][n.id]=n):t[n.name]=n:n.name==="PoseNode"?(Array.isArray(t[n.name])||(t[n.name]=[t[n.name]]),t[n.name].push(n)):t[n.name][n.id]===void 0&&(t[n.name][n.id]=n)}parseProperty(e){let t=e.getString(1),n;switch(t){case"C":return e.getBoolean();case"D":return e.getFloat64();case"F":return e.getFloat32();case"I":return e.getInt32();case"L":return e.getInt64();case"R":return n=e.getUint32(),e.getArrayBuffer(n);case"S":return n=e.getUint32(),e.getString(n);case"Y":return e.getInt16();case"b":case"c":case"d":case"f":case"i":case"l":let i=e.getUint32(),r=e.getUint32(),a=e.getUint32();if(r===0)switch(t){case"b":case"c":return e.getBooleanArray(i);case"d":return e.getFloat64Array(i);case"f":return e.getFloat32Array(i);case"i":return e.getInt32Array(i);case"l":return e.getInt64Array(i)}let o=Zf(new Uint8Array(e.getArrayBuffer(a))),l=new wl(o.buffer);switch(t){case"b":case"c":return l.getBooleanArray(i);case"d":return l.getFloat64Array(i);case"f":return l.getFloat32Array(i);case"i":return l.getInt32Array(i);case"l":return l.getInt64Array(i)}break;default:throw new Error("THREE.FBXLoader: Unknown property type "+t)}}},wl=class{constructor(e,t){this.dv=new DataView(e),this.offset=0,this.littleEndian=t!==void 0?t:!0,this._textDecoder=new TextDecoder}getOffset(){return this.offset}size(){return this.dv.buffer.byteLength}skip(e){this.offset+=e}getBoolean(){return(this.getUint8()&1)===1}getBooleanArray(e){let t=[];for(let n=0;n<e;n++)t.push(this.getBoolean());return t}getUint8(){let e=this.dv.getUint8(this.offset);return this.offset+=1,e}getInt16(){let e=this.dv.getInt16(this.offset,this.littleEndian);return this.offset+=2,e}getInt32(){let e=this.dv.getInt32(this.offset,this.littleEndian);return this.offset+=4,e}getInt32Array(e){let t=[];for(let n=0;n<e;n++)t.push(this.getInt32());return t}getUint32(){let e=this.dv.getUint32(this.offset,this.littleEndian);return this.offset+=4,e}getInt64(){let e,t;return this.littleEndian?(e=this.getUint32(),t=this.getUint32()):(t=this.getUint32(),e=this.getUint32()),t&2147483648?(t=~t&4294967295,e=~e&4294967295,e===4294967295&&(t=t+1&4294967295),e=e+1&4294967295,-(t*4294967296+e)):t*4294967296+e}getInt64Array(e){let t=[];for(let n=0;n<e;n++)t.push(this.getInt64());return t}getUint64(){let e,t;return this.littleEndian?(e=this.getUint32(),t=this.getUint32()):(t=this.getUint32(),e=this.getUint32()),t*4294967296+e}getFloat32(){let e=this.dv.getFloat32(this.offset,this.littleEndian);return this.offset+=4,e}getFloat32Array(e){let t=[];for(let n=0;n<e;n++)t.push(this.getFloat32());return t}getFloat64(){let e=this.dv.getFloat64(this.offset,this.littleEndian);return this.offset+=8,e}getFloat64Array(e){let t=[];for(let n=0;n<e;n++)t.push(this.getFloat64());return t}getArrayBuffer(e){let t=this.dv.buffer.slice(this.offset,this.offset+e);return this.offset+=e,t}getString(e){let t=this.offset,n=new Uint8Array(this.dv.buffer,t,e);this.skip(e);let i=n.indexOf(0);return i>=0&&(n=new Uint8Array(this.dv.buffer,t,i)),this._textDecoder.decode(n)}},Al=class{add(e,t){this[e]=t}};function Wv(s){let e="Kaydara FBX Binary  \0";return s.byteLength>=e.length&&e===rm(s,0,e.length)}function qv(s){let e=["K","a","y","d","a","r","a","\\","F","B","X","\\","B","i","n","a","r","y","\\","\\"],t=0;function n(i){let r=s[i-1];return s=s.slice(t+i),t++,r}for(let i=0;i<e.length;++i)if(n(1)===e[i])return!1;return!0}function nm(s){let e=/FBXVersion: (\d+)/,t=s.match(e);if(t)return parseInt(t[1]);throw new Error("THREE.FBXLoader: Cannot find the version number for the file given.")}function Xv(s){return s/46186158e3}var Kv=[];function Sl(s,e,t,n){let i;switch(n.mappingType){case"ByPolygonVertex":i=s;break;case"ByPolygon":i=e;break;case"ByVertice":i=t;break;case"AllSame":i=n.indices[0];break;default:console.warn("THREE.FBXLoader: unknown attribute mapping type "+n.mappingType)}n.referenceType==="IndexToDirect"&&(i=n.indices[i]);let r=i*n.dataSize,a=r+n.dataSize;return Jv(Kv,n.buffer,r,a)}var zu=new Ct,us=new C;function im(s){let e=new ge,t=new ge,n=new ge,i=new ge,r=new ge,a=new ge,o=new ge,l=new ge,c=new ge,h=new ge,u=new ge,d=new ge,p=s.inheritType?s.inheritType:0;s.translation&&e.setPosition(us.fromArray(s.translation));let m=va(0);if(s.preRotation){let O=s.preRotation.map(mt.degToRad);O.push(m),t.makeRotationFromEuler(zu.fromArray(O))}if(s.rotation){let O=s.rotation.map(mt.degToRad);O.push(s.eulerOrder||m),n.makeRotationFromEuler(zu.fromArray(O))}if(s.postRotation){let O=s.postRotation.map(mt.degToRad);O.push(m),i.makeRotationFromEuler(zu.fromArray(O)),i.invert()}s.scale&&r.scale(us.fromArray(s.scale)),s.scalingOffset&&o.setPosition(us.fromArray(s.scalingOffset)),s.scalingPivot&&a.setPosition(us.fromArray(s.scalingPivot)),s.rotationOffset&&l.setPosition(us.fromArray(s.rotationOffset)),s.rotationPivot&&c.setPosition(us.fromArray(s.rotationPivot)),s.parentMatrixWorld&&(u.copy(s.parentMatrix),h.copy(s.parentMatrixWorld));let f=t.clone().multiply(n).multiply(i),_=new ge;_.extractRotation(h);let g=new ge;g.copyPosition(h);let v=g.clone().invert().multiply(h),b=_.clone().invert().multiply(v),y=r,S=new ge;if(p===0)S.copy(_).multiply(f).multiply(b).multiply(y);else if(p===1)S.copy(_).multiply(b).multiply(f).multiply(y);else{let B=new ge().scale(new C().setFromMatrixScale(u)).clone().invert(),j=b.clone().multiply(B);S.copy(_).multiply(f).multiply(j).multiply(y)}let x=c.clone().invert(),A=a.clone().invert(),F=e.clone().multiply(l).multiply(c).multiply(t).multiply(n).multiply(i).multiply(x).multiply(o).multiply(a).multiply(r).multiply(A),L=new ge().copyPosition(F),P=h.clone().multiply(L);return d.copyPosition(P),F=d.clone().multiply(S),F.premultiply(h.invert()),F}function va(s){s=s||0;let e=["ZYX","YZX","XZY","ZXY","YXZ","XYZ"];return s===6?(console.warn("THREE.FBXLoader: unsupported Euler Order: Spherical XYZ. Animations and rotations may be incorrect."),e[0]):e[s]}function Gu(s){return s.split(",").map(function(t){return parseFloat(t)})}function rm(s,e,t){return e===void 0&&(e=0),t===void 0&&(t=s.byteLength),new TextDecoder().decode(new Uint8Array(s,e,t))}function Yv(s,e){for(let t=0,n=s.length,i=e.length;t<i;t++,n++)s[n]=e[t]}function Jv(s,e,t,n){for(let i=t,r=0;i<n;i++,r++)s[r]=e[i];return s}var Zv=/^[og]\s*(.+)?/,Qv=/^mtllib /,$v=/^usemtl /,eb=/^usemap /,sm=/\s+/,am=new C,Xu=new C,om=new C,lm=new C,An=new C,El=new de;function tb(){let s={objects:[],object:{},vertices:[],normals:[],colors:[],uvs:[],materials:{},materialLibraries:[],startObject:function(e,t){if(this.object&&this.object.fromDeclaration===!1){this.object.name=e,this.object.fromDeclaration=t!==!1;return}let n=this.object&&typeof this.object.currentMaterial=="function"?this.object.currentMaterial():void 0;if(this.object&&typeof this.object._finalize=="function"&&this.object._finalize(!0),this.object={name:e||"",fromDeclaration:t!==!1,geometry:{vertices:[],normals:[],colors:[],uvs:[],hasUVIndices:!1},materials:[],smooth:!0,startMaterial:function(i,r){let a=this._finalize(!1);a&&(a.inherited||a.groupCount<=0)&&this.materials.splice(a.index,1);let o={index:this.materials.length,name:i||"",mtllib:Array.isArray(r)&&r.length>0?r[r.length-1]:"",smooth:a!==void 0?a.smooth:this.smooth,groupStart:a!==void 0?a.groupEnd:0,groupEnd:-1,groupCount:-1,inherited:!1,clone:function(l){let c={index:typeof l=="number"?l:this.index,name:this.name,mtllib:this.mtllib,smooth:this.smooth,groupStart:0,groupEnd:-1,groupCount:-1,inherited:!1};return c.clone=this.clone.bind(c),c}};return this.materials.push(o),o},currentMaterial:function(){if(this.materials.length>0)return this.materials[this.materials.length-1]},_finalize:function(i){let r=this.currentMaterial();if(r&&r.groupEnd===-1&&(r.groupEnd=this.geometry.vertices.length/3,r.groupCount=r.groupEnd-r.groupStart,r.inherited=!1),i&&this.materials.length>1)for(let a=this.materials.length-1;a>=0;a--)this.materials[a].groupCount<=0&&this.materials.splice(a,1);return i&&this.materials.length===0&&this.materials.push({name:"",smooth:this.smooth}),r}},n&&n.name&&typeof n.clone=="function"){let i=n.clone(0);i.inherited=!0,this.object.materials.push(i)}this.objects.push(this.object)},finalize:function(){this.object&&typeof this.object._finalize=="function"&&this.object._finalize(!0)},parseVertexIndex:function(e,t){let n=parseInt(e,10);return(n>=0?n-1:n+t/3)*3},parseNormalIndex:function(e,t){let n=parseInt(e,10);return(n>=0?n-1:n+t/3)*3},parseUVIndex:function(e,t){let n=parseInt(e,10);return(n>=0?n-1:n+t/2)*2},addVertex:function(e,t,n){let i=this.vertices,r=this.object.geometry.vertices;r.push(i[e+0],i[e+1],i[e+2]),r.push(i[t+0],i[t+1],i[t+2]),r.push(i[n+0],i[n+1],i[n+2])},addVertexPoint:function(e){let t=this.vertices;this.object.geometry.vertices.push(t[e+0],t[e+1],t[e+2])},addVertexLine:function(e){let t=this.vertices;this.object.geometry.vertices.push(t[e+0],t[e+1],t[e+2])},addNormal:function(e,t,n){let i=this.normals,r=this.object.geometry.normals;r.push(i[e+0],i[e+1],i[e+2]),r.push(i[t+0],i[t+1],i[t+2]),r.push(i[n+0],i[n+1],i[n+2])},addFaceNormal:function(e,t,n){let i=this.vertices,r=this.object.geometry.normals;am.fromArray(i,e),Xu.fromArray(i,t),om.fromArray(i,n),An.subVectors(om,Xu),lm.subVectors(am,Xu),An.cross(lm),An.normalize(),r.push(An.x,An.y,An.z),r.push(An.x,An.y,An.z),r.push(An.x,An.y,An.z)},addColor:function(e,t,n){let i=this.colors,r=this.object.geometry.colors;i[e]!==void 0&&r.push(i[e+0],i[e+1],i[e+2]),i[t]!==void 0&&r.push(i[t+0],i[t+1],i[t+2]),i[n]!==void 0&&r.push(i[n+0],i[n+1],i[n+2])},addUV:function(e,t,n){let i=this.uvs,r=this.object.geometry.uvs;r.push(i[e+0],i[e+1]),r.push(i[t+0],i[t+1]),r.push(i[n+0],i[n+1])},addDefaultUV:function(){let e=this.object.geometry.uvs;e.push(0,0),e.push(0,0),e.push(0,0)},addUVLine:function(e){let t=this.uvs;this.object.geometry.uvs.push(t[e+0],t[e+1])},addFace:function(e,t,n,i,r,a,o,l,c){let h=this.vertices.length,u=this.parseVertexIndex(e,h),d=this.parseVertexIndex(t,h),p=this.parseVertexIndex(n,h);if(this.addVertex(u,d,p),this.addColor(u,d,p),o!==void 0&&o!==""){let m=this.normals.length;u=this.parseNormalIndex(o,m),d=this.parseNormalIndex(l,m),p=this.parseNormalIndex(c,m),this.addNormal(u,d,p)}else this.addFaceNormal(u,d,p);if(i!==void 0&&i!==""){let m=this.uvs.length;u=this.parseUVIndex(i,m),d=this.parseUVIndex(r,m),p=this.parseUVIndex(a,m),this.addUV(u,d,p),this.object.geometry.hasUVIndices=!0}else this.addDefaultUV()},addPointGeometry:function(e){this.object.geometry.type="Points";let t=this.vertices.length;for(let n=0,i=e.length;n<i;n++){let r=this.parseVertexIndex(e[n],t);this.addVertexPoint(r),this.addColor(r)}},addLineGeometry:function(e,t){this.object.geometry.type="Line";let n=this.vertices.length,i=this.uvs.length;for(let r=0,a=e.length;r<a;r++)this.addVertexLine(this.parseVertexIndex(e[r],n));for(let r=0,a=t.length;r<a;r++)this.addUVLine(this.parseUVIndex(t[r],i))}};return s.startObject("",!1),s}var Rl=class extends ot{constructor(e){super(e),this.materials=null}load(e,t,n,i){let r=this,a=new _t(this.manager);a.setPath(this.path),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(e,function(o){try{t(r.parse(o))}catch(l){i?i(l):console.error(l),r.manager.itemError(e)}},n,i)}setMaterials(e){return this.materials=e,this}parse(e){let t=new tb;e.indexOf(`\r
`)!==-1&&(e=e.replace(/\r\n/g,`
`)),e.indexOf(`\\
`)!==-1&&(e=e.replace(/\\\n/g,""));let n=e.split(`
`),i=[];for(let o=0,l=n.length;o<l;o++){let c=n[o].trimStart();if(c.length===0)continue;let h=c.charAt(0);if(h!=="#")if(h==="v"){let u=c.split(sm);switch(u[0]){case"v":t.vertices.push(parseFloat(u[1]),parseFloat(u[2]),parseFloat(u[3])),u.length>=7?(El.setRGB(parseFloat(u[4]),parseFloat(u[5]),parseFloat(u[6]),Pe),t.colors.push(El.r,El.g,El.b)):t.colors.push(void 0,void 0,void 0);break;case"vn":t.normals.push(parseFloat(u[1]),parseFloat(u[2]),parseFloat(u[3]));break;case"vt":t.uvs.push(parseFloat(u[1]),parseFloat(u[2]));break}}else if(h==="f"){let d=c.slice(1).trim().split(sm),p=[];for(let f=0,_=d.length;f<_;f++){let g=d[f];if(g.length>0){let v=g.split("/");p.push(v)}}let m=p[0];for(let f=1,_=p.length-1;f<_;f++){let g=p[f],v=p[f+1];t.addFace(m[0],g[0],v[0],m[1],g[1],v[1],m[2],g[2],v[2])}}else if(h==="l"){let u=c.substring(1).trim().split(" "),d=[],p=[];if(c.indexOf("/")===-1)d=u;else for(let m=0,f=u.length;m<f;m++){let _=u[m].split("/");_[0]!==""&&d.push(_[0]),_[1]!==""&&p.push(_[1])}t.addLineGeometry(d,p)}else if(h==="p"){let d=c.slice(1).trim().split(" ");t.addPointGeometry(d)}else if((i=Zv.exec(c))!==null){let u=(" "+i[0].slice(1).trim()).slice(1);t.startObject(u)}else if($v.test(c))t.object.startMaterial(c.substring(7).trim(),t.materialLibraries);else if(Qv.test(c))t.materialLibraries.push(c.substring(7).trim());else if(eb.test(c))console.warn('THREE.OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.');else if(h==="s"){if(i=c.split(" "),i.length>1){let d=i[1].trim().toLowerCase();t.object.smooth=d!=="0"&&d!=="off"}else t.object.smooth=!0;let u=t.object.currentMaterial();u&&(u.smooth=t.object.smooth)}else{if(c==="\0")continue;console.warn('THREE.OBJLoader: Unexpected line: "'+c+'"')}}t.finalize();let r=new bt;if(r.materialLibraries=[].concat(t.materialLibraries),!(t.objects.length===1&&t.objects[0].geometry.vertices.length===0)===!0)for(let o=0,l=t.objects.length;o<l;o++){let c=t.objects[o],h=c.geometry,u=c.materials,d=h.type==="Line",p=h.type==="Points",m=!1;if(h.vertices.length===0)continue;let f=new De;f.setAttribute("position",new ve(h.vertices,3)),h.normals.length>0&&f.setAttribute("normal",new ve(h.normals,3)),h.colors.length>0&&(m=!0,f.setAttribute("color",new ve(h.colors,3))),h.hasUVIndices===!0&&f.setAttribute("uv",new ve(h.uvs,2));let _=[];for(let v=0,b=u.length;v<b;v++){let y=u[v],S=y.name+"_"+y.smooth+"_"+m,x=t.materials[S];if(this.materials!==null){if(x=this.materials.create(y.name),d&&x&&!(x instanceof on)){let A=new on;Pt.prototype.copy.call(A,x),A.color.copy(x.color),x=A}else if(p&&x&&!(x instanceof ln)){let A=new ln({size:10,sizeAttenuation:!1});Pt.prototype.copy.call(A,x),A.color.copy(x.color),A.map=x.map,x=A}}x===void 0&&(d?x=new on:p?x=new ln({size:1,sizeAttenuation:!1}):x=new Gt,x.name=y.name,x.flatShading=!y.smooth,x.vertexColors=m,t.materials[S]=x),_.push(x)}let g;if(_.length>1){for(let v=0,b=u.length;v<b;v++){let y=u[v];f.addGroup(y.groupStart,y.groupCount,v)}d?g=new Ti(f,_):p?g=new Un(f,_):g=new et(f,_)}else d?g=new Ti(f,_[0]):p?g=new Un(f,_[0]):g=new et(f,_[0]);g.name=c.name,r.add(g)}else if(t.vertices.length>0){let o=new ln({size:1,sizeAttenuation:!1}),l=new De;l.setAttribute("position",new ve(t.vertices,3)),t.colors.length>0&&t.colors[0]!==void 0&&(l.setAttribute("color",new ve(t.colors,3)),o.vertexColors=!0);let c=new Un(l,o);r.add(c)}return r}};var Cl=class extends ot{constructor(e){super(e)}load(e,t,n,i){let r=this,a=this.path===""?Vt.extractUrlBase(e):this.path,o=new _t(this.manager);o.setPath(this.path),o.setRequestHeader(this.requestHeader),o.setWithCredentials(this.withCredentials),o.load(e,function(l){try{t(r.parse(l,a))}catch(c){i?i(c):console.error(c),r.manager.itemError(e)}},n,i)}setMaterialOptions(e){return this.materialOptions=e,this}parse(e,t){let n=e.split(`
`),i={},r=/\s+/,a={};for(let l=0;l<n.length;l++){let c=n[l];if(c=c.trim(),c.length===0||c.charAt(0)==="#")continue;let h=c.indexOf(" "),u=h>=0?c.substring(0,h):c;u=u.toLowerCase();let d=h>=0?c.substring(h+1):"";if(d=d.trim(),u==="newmtl")i={name:d},a[d]=i;else if(u==="ka"||u==="kd"||u==="ks"||u==="ke"){let p=d.split(r,3);i[u]=[parseFloat(p[0]),parseFloat(p[1]),parseFloat(p[2])]}else i[u]=d}let o=new Ku(this.resourcePath||t,this.materialOptions);return o.setCrossOrigin(this.crossOrigin),o.setManager(this.manager),o.setMaterials(a),o}},Ku=class{constructor(e="",t={}){this.baseUrl=e,this.options=t,this.materialsInfo={},this.materials={},this.materialsArray=[],this.nameLookup={},this.crossOrigin="anonymous",this.side=this.options.side!==void 0?this.options.side:$n,this.wrap=this.options.wrap!==void 0?this.options.wrap:Nt}setCrossOrigin(e){return this.crossOrigin=e,this}setManager(e){this.manager=e}setMaterials(e){this.materialsInfo=this.convert(e),this.materials={},this.materialsArray=[],this.nameLookup={}}convert(e){if(!this.options)return e;let t={};for(let n in e){let i=e[n],r={};t[n]=r;for(let a in i){let o=!0,l=i[a],c=a.toLowerCase();switch(c){case"kd":case"ka":case"ks":this.options&&this.options.normalizeRGB&&(l=[l[0]/255,l[1]/255,l[2]/255]),this.options&&this.options.ignoreZeroRGBs&&l[0]===0&&l[1]===0&&l[2]===0&&(o=!1);break;default:break}o&&(r[c]=l)}}return t}preload(){for(let e in this.materialsInfo)this.create(e)}getIndex(e){return this.nameLookup[e]}getAsArray(){let e=0;for(let t in this.materialsInfo)this.materialsArray[e]=this.create(t),this.nameLookup[t]=e,e++;return this.materialsArray}create(e){return this.materials[e]===void 0&&this.createMaterial_(e),this.materials[e]}createMaterial_(e){let t=this,n=this.materialsInfo[e],i={name:e,side:this.side};function r(o,l){return typeof l!="string"||l===""?"":/^https?:\/\//i.test(l)?l:o+l}function a(o,l){if(i[o])return;let c=t.getTextureParams(l,i),h=t.loadTexture(r(t.baseUrl,c.url));h.repeat.copy(c.scale),h.offset.copy(c.offset),h.wrapS=t.wrap,h.wrapT=t.wrap,(o==="map"||o==="emissiveMap")&&(h.colorSpace=Pe),i[o]=h}for(let o in n){let l=n[o],c;if(l!=="")switch(o.toLowerCase()){case"kd":i.color=Ce.colorSpaceToWorking(new de().fromArray(l),Pe);break;case"ks":i.specular=Ce.colorSpaceToWorking(new de().fromArray(l),Pe);break;case"ke":i.emissive=Ce.colorSpaceToWorking(new de().fromArray(l),Pe);break;case"map_kd":a("map",l);break;case"map_ks":a("specularMap",l);break;case"map_ke":a("emissiveMap",l);break;case"norm":a("normalMap",l);break;case"map_bump":case"bump":a("bumpMap",l);break;case"disp":a("displacementMap",l);break;case"map_d":a("alphaMap",l),i.transparent=!0;break;case"ns":i.shininess=parseFloat(l);break;case"d":c=parseFloat(l),c<1&&(i.opacity=c,i.transparent=!0);break;case"tr":c=parseFloat(l),this.options&&this.options.invertTrProperty&&(c=1-c),c>0&&(i.opacity=1-c,i.transparent=!0);break;default:break}}return this.materials[e]=new Gt(i),this.materials[e]}getTextureParams(e,t){let n={scale:new ne(1,1),offset:new ne(0,0)},i=e.split(/\s+/),r;return r=i.indexOf("-bm"),r>=0&&(t.bumpScale=parseFloat(i[r+1]),i.splice(r,2)),r=i.indexOf("-mm"),r>=0&&(t.displacementBias=parseFloat(i[r+1]),t.displacementScale=parseFloat(i[r+2]),i.splice(r,3)),r=i.indexOf("-s"),r>=0&&(n.scale.set(parseFloat(i[r+1]),parseFloat(i[r+2])),i.splice(r,4)),r=i.indexOf("-o"),r>=0&&(n.offset.set(parseFloat(i[r+1]),parseFloat(i[r+2])),i.splice(r,4)),n.url=i.join(" ").trim(),n}loadTexture(e,t,n,i,r){let a=this.manager!==void 0?this.manager:ll,o=a.getHandler(e);o===null&&(o=new kn(a)),o.setCrossOrigin&&o.setCrossOrigin(this.crossOrigin);let l=o.load(e,n,i,r);return t!==void 0&&(l.mapping=t),l}};var Pl=class extends ot{constructor(e){super(e)}load(e,t,n,i){let r=this,a=new _t(this.manager);a.setPath(this.path),a.setResponseType("arraybuffer"),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(e,function(o){try{t(r.parse(o))}catch(l){i?i(l):console.error(l),r.manager.itemError(e)}},n,i)}parse(e){function t(c){let h=new DataView(c),u=32/8*3+32/8*3*3+16/8,d=h.getUint32(80,!0);if(80+32/8+d*u===h.byteLength)return!0;let m=[115,111,108,105,100];for(let f=0;f<5;f++)if(n(m,h,f))return!1;return!0}function n(c,h,u){for(let d=0,p=c.length;d<p;d++)if(c[d]!==h.getUint8(u+d))return!1;return!0}function i(c){let h=new DataView(c),u=h.getUint32(80,!0),d,p,m,f=!1,_,g,v,b,y;for(let O=0;O<70;O++)h.getUint32(O,!1)==1129270351&&h.getUint8(O+4)==82&&h.getUint8(O+5)==61&&(f=!0,_=new Float32Array(u*3*3),g=h.getUint8(O+6)/255,v=h.getUint8(O+7)/255,b=h.getUint8(O+8)/255,y=h.getUint8(O+9)/255);let S=84,x=50,A=new De,F=new Float32Array(u*3*3),L=new Float32Array(u*3*3),P=new de;for(let O=0;O<u;O++){let B=S+O*x,j=h.getFloat32(B,!0),H=h.getFloat32(B+4,!0),W=h.getFloat32(B+8,!0);if(f){let Y=h.getUint16(B+48,!0);(Y&32768)===0?(d=(Y&31)/31,p=(Y>>5&31)/31,m=(Y>>10&31)/31):(d=g,p=v,m=b)}for(let Y=1;Y<=3;Y++){let K=B+Y*12,ee=O*3*3+(Y-1)*3;F[ee]=h.getFloat32(K,!0),F[ee+1]=h.getFloat32(K+4,!0),F[ee+2]=h.getFloat32(K+8,!0),L[ee]=j,L[ee+1]=H,L[ee+2]=W,f&&(P.setRGB(d,p,m,Pe),_[ee]=P.r,_[ee+1]=P.g,_[ee+2]=P.b)}}return A.setAttribute("position",new Xe(F,3)),A.setAttribute("normal",new Xe(L,3)),f&&(A.setAttribute("color",new Xe(_,3)),A.hasColors=!0,A.alpha=y),A}function r(c){let h=new De,u=/solid([\s\S]*?)endsolid/g,d=/facet([\s\S]*?)endfacet/g,p=/solid\s(.+)/,m=0,f=/[\s]+([+-]?(?:\d*)(?:\.\d*)?(?:[eE][+-]?\d+)?)/.source,_=new RegExp("vertex"+f+f+f,"g"),g=new RegExp("normal"+f+f+f,"g"),v=[],b=[],y=[],S=new C,x,A=0,F=0,L=0;for(;(x=u.exec(c))!==null;){F=L;let P=x[0],O=(x=p.exec(P))!==null?x[1]:"";for(y.push(O);(x=d.exec(P))!==null;){let H=0,W=0,Y=x[0];for(;(x=g.exec(Y))!==null;)S.x=parseFloat(x[1]),S.y=parseFloat(x[2]),S.z=parseFloat(x[3]),W++;for(;(x=_.exec(Y))!==null;)v.push(parseFloat(x[1]),parseFloat(x[2]),parseFloat(x[3])),b.push(S.x,S.y,S.z),H++,L++;W!==1&&console.error("THREE.STLLoader: Something isn't right with the normal of face number "+m),H!==3&&console.error("THREE.STLLoader: Something isn't right with the vertices of face number "+m),m++}let B=F,j=L-F;h.userData.groupNames=y,h.addGroup(B,j,A),A++}return h.setAttribute("position",new ve(v,3)),h.setAttribute("normal",new ve(b,3)),h}function a(c){return typeof c!="string"?new TextDecoder().decode(c):c}function o(c){if(typeof c=="string"){let h=new Uint8Array(c.length);for(let u=0;u<c.length;u++)h[u]=c.charCodeAt(u)&255;return h.buffer||h}else return c}let l=o(e);return t(l)?i(l):r(a(e))}};var Hn=new de,Il=class extends ot{constructor(e){super(e),this.propertyNameMapping={},this.customPropertyMapping={}}load(e,t,n,i){let r=this,a=new _t(this.manager);a.setPath(this.path),a.setResponseType("arraybuffer"),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(e,function(o){try{t(r.parse(o))}catch(l){i?i(l):console.error(l),r.manager.itemError(e)}},n,i)}setPropertyNameMapping(e){this.propertyNameMapping=e}setCustomPropertyNameMapping(e){this.customPropertyMapping=e}parse(e){function t(b,y=0){let S=/^ply([\s\S]*)end_header(\r\n|\r|\n)/,x="",A=S.exec(b);A!==null&&(x=A[1]);let F={comments:[],elements:[],headerLength:y,objInfo:""},L=x.split(/\r\n|\r|\n/),P;function O(B,j){let H={type:B[0]};return H.type==="list"?(H.name=B[3],H.countType=B[1],H.itemType=B[2]):H.name=B[1],H.name in j&&(H.name=j[H.name]),H}for(let B=0;B<L.length;B++){let j=L[B];if(j=j.trim(),j==="")continue;let H=j.split(/\s+/),W=H.shift();switch(j=H.join(" "),W){case"format":F.format=H[0],F.version=H[1];break;case"comment":F.comments.push(j);break;case"element":P!==void 0&&F.elements.push(P),P={},P.name=H[0],P.count=parseInt(H[1]),P.properties=[];break;case"property":P.properties.push(O(H,v.propertyNameMapping));break;case"obj_info":F.objInfo=j;break;default:console.log("unhandled",W,H)}}return P!==void 0&&F.elements.push(P),F}function n(b,y){switch(y){case"char":case"uchar":case"short":case"ushort":case"int":case"uint":case"int8":case"uint8":case"int16":case"uint16":case"int32":case"uint32":return parseInt(b);case"float":case"double":case"float32":case"float64":return parseFloat(b)}}function i(b,y){let S={};for(let x=0;x<b.length;x++){if(y.empty())return null;if(b[x].type==="list"){let A=[],F=n(y.next(),b[x].countType);for(let L=0;L<F;L++){if(y.empty())return null;A.push(n(y.next(),b[x].itemType))}S[b[x].name]=A}else S[b[x].name]=n(y.next(),b[x].type)}return S}function r(){let b={indices:[],vertices:[],normals:[],uvs:[],faceVertexUvs:[],colors:[],faceVertexColors:[],descriptors:{}};for(let y of Object.keys(v.customPropertyMapping))b[y]=[];return b}function a(b){switch(b){case"int8":case"char":return Is;case"uint8":case"uchar":return Ls;case"int16":case"short":return Ds;case"uint16":case"ushort":return _i;case"int32":case"int":return Fs;case"uint32":case"uint":return lr;case"float32":case"float":return ve;case"float64":case"double":return Yu}}function o(b){switch(b){case"uchar":case"uint8":return 1/255;case"ushort":case"uint16":return 1/65535;case"float":case"float32":case"double":case"float64":return 1;default:return 1/255}}function l(b){return b==="float"||b==="float32"||b==="double"||b==="float64"}function c(b){function y(ee){for(let ue of ee){let Se=b.find(me=>me.name===ue);if(Se)return Se}return null}let S=y(["x","px","posx"]),x=y(["y","py","posy"]),A=y(["z","pz","posz"]),F=y(["nx","normalx"]),L=y(["ny","normaly"]),P=y(["nz","normalz"]),O=y(["s","u","texture_u","tx"]),B=y(["t","v","texture_v","ty"]),j=y(["red","diffuse_red","r","diffuse_r"]),H=y(["green","diffuse_green","g","diffuse_g"]),W=y(["blue","diffuse_blue","b","diffuse_b"]),Y=y(["texcoord"]),K={};for(let ee of Object.keys(v.customPropertyMapping)){let Se=v.customPropertyMapping[ee].map(te=>b.find(pe=>pe.name===te)),me=Se.filter(te=>te).map(te=>te.type),xe=me.length>0&&me.every(te=>te===me[0]);K[ee]={type:xe?me[0]:"float32",usage:Se.every(te=>te!==void 0)}}return{position:{names:[S?S.name:"x",x?x.name:"y",A?A.name:"z"],type:S?S.type:"float32",usage:!!(S&&x&&A)},normal:{names:[F?F.name:"nx",L?L.name:"ny",P?P.name:"nz"],type:F?F.type:"float32",usage:!!(F&&L&&P)},uv:{names:[O?O.name:"s",B?B.name:"t"],type:O?O.type:"float32",usage:!!(O&&B)},texcoord:{type:Y?Y.itemType:"float32",usage:!!Y},color:{names:[j?j.name:"red",H?H.name:"green",W?W.name:"blue"],type:j?j.type:"uchar",usage:!!(j&&H&&W)},custom:K}}function h(b,y){let S=r(),x=/end_header\s+(\S[\s\S]*\S|\S)\s*$/,A,F;(F=x.exec(b))!==null?A=F[1].split(/\s+/):A=[];let L=new Ju(A);e:for(let P=0;P<y.elements.length;P++){let O=y.elements[P],B=c(O.properties);S.descriptors[O.name]=B;for(let j=0;j<O.count;j++){let H=i(O.properties,L);if(!H)break e;d(S,O.name,H,B)}}return u(S)}function u(b){let y=new De,S=b.descriptors.vertex;b.indices.length>0&&y.setIndex(b.indices);let x=a(S?S.position.type:"float32");if(y.setAttribute("position",new x(b.vertices,3)),b.normals.length>0){let A=a(S.normal.type);y.setAttribute("normal",new A(b.normals,3))}if(b.uvs.length>0){let A=a(S.uv.type);y.setAttribute("uv",new A(b.uvs,2))}if(b.colors.length>0){let A=S.color.type,F=!l(A),L=a(A);y.setAttribute("color",new L(b.colors,3,F))}if(b.faceVertexUvs.length>0||b.faceVertexColors.length>0){if(y=y.toNonIndexed(),b.faceVertexUvs.length>0){let A=a(b.descriptors.face.texcoord.type);y.setAttribute("uv",new A(b.faceVertexUvs,2))}if(b.faceVertexColors.length>0){let A=b.descriptors.face.color.type,F=!l(A),L=a(A);y.setAttribute("color",new L(b.faceVertexColors,3,F))}}for(let A of Object.keys(v.customPropertyMapping))if(b[A].length>0){let F=a(S.custom[A].type);y.setAttribute(A,new F(b[A],v.customPropertyMapping[A].length))}return y.computeBoundingSphere(),y}function d(b,y,S,x){if(y==="vertex"){let{position:A,normal:F,uv:L,color:P}=x;if(A.usage&&b.vertices.push(S[A.names[0]],S[A.names[1]],S[A.names[2]]),F.usage&&b.normals.push(S[F.names[0]],S[F.names[1]],S[F.names[2]]),L.usage&&b.uvs.push(S[L.names[0]],S[L.names[1]]),P.usage){let O=o(P.type),B=l(P.type);Hn.setRGB(S[P.names[0]]*O,S[P.names[1]]*O,S[P.names[2]]*O,Pe);let j=1/O;b.colors.push(B?Hn.r:Math.round(Hn.r*j),B?Hn.g:Math.round(Hn.g*j),B?Hn.b:Math.round(Hn.b*j))}for(let O of Object.keys(v.customPropertyMapping))for(let B of v.customPropertyMapping[O])b[O].push(S[B])}else if(y==="face"){let A=S.vertex_indices||S.vertex_index,F=S.texcoord;A.length===3?(b.indices.push(A[0],A[1],A[2]),F&&F.length===6&&(b.faceVertexUvs.push(F[0],F[1]),b.faceVertexUvs.push(F[2],F[3]),b.faceVertexUvs.push(F[4],F[5]))):A.length===4&&(b.indices.push(A[0],A[1],A[3]),b.indices.push(A[1],A[2],A[3]));let{color:L}=x;if(L.usage){let P=o(L.type);Hn.setRGB(S[L.names[0]]*P,S[L.names[1]]*P,S[L.names[2]]*P,Pe);let O=1/P,B=Hn.r*O,j=Hn.g*O,H=Hn.b*O;b.faceVertexColors.push(B,j,H),b.faceVertexColors.push(B,j,H),b.faceVertexColors.push(B,j,H)}}}function p(b,y){let S={},x=0;for(let A=0;A<y.length;A++){let F=y[A],L=F.valueReader;if(F.type==="list"){let P=[],O=F.countReader.read(b+x);x+=F.countReader.size;for(let B=0;B<O;B++)P.push(L.read(b+x)),x+=L.size;S[F.name]=P}else S[F.name]=L.read(b+x),x+=L.size}return[S,x]}function m(b,y,S){function x(A,F,L){switch(F){case"int8":case"char":return{read:P=>A.getInt8(P),size:1};case"uint8":case"uchar":return{read:P=>A.getUint8(P),size:1};case"int16":case"short":return{read:P=>A.getInt16(P,L),size:2};case"uint16":case"ushort":return{read:P=>A.getUint16(P,L),size:2};case"int32":case"int":return{read:P=>A.getInt32(P,L),size:4};case"uint32":case"uint":return{read:P=>A.getUint32(P,L),size:4};case"float32":case"float":return{read:P=>A.getFloat32(P,L),size:4};case"float64":case"double":return{read:P=>A.getFloat64(P,L),size:8}}}for(let A=0,F=b.length;A<F;A++){let L=b[A];L.type==="list"?(L.countReader=x(y,L.countType,S),L.valueReader=x(y,L.itemType,S)):L.valueReader=x(y,L.type,S)}}function f(b,y){let S=r(),x=y.format==="binary_little_endian",A=new DataView(b,y.headerLength),F,L=0;for(let P=0;P<y.elements.length;P++){let O=y.elements[P],B=O.properties,j=c(B);S.descriptors[O.name]=j,m(B,A,x);for(let H=0;H<O.count;H++){F=p(L,B),L+=F[1];let W=F[0];d(S,O.name,W,j)}}return u(S)}function _(b){let y=0,S=!0,x="",A=[],F=new TextDecoder().decode(b.subarray(0,5)),L=/^ply\r\n/.test(F);do{let P=String.fromCharCode(b[y++]);P!==`
`&&P!=="\r"?x+=P:(x==="end_header"&&(S=!1),x!==""&&(A.push(x),x=""))}while(S&&y<b.length);return L===!0&&y++,{headerText:A.join("\r")+"\r",headerLength:y}}let g,v=this;if(e instanceof ArrayBuffer){let b=new Uint8Array(e),{headerText:y,headerLength:S}=_(b),x=t(y,S);if(x.format==="ascii"){let A=new TextDecoder().decode(b);g=h(A,x)}else g=f(e,x)}else g=h(e,t(e));return g}},Yu=class extends Xe{constructor(e,t,n){super(new Float64Array(e),t,n)}},Ju=class{constructor(e){this.arr=e,this.i=0}empty(){return this.i>=this.arr.length}next(){return this.arr[this.i++]}};var Zu=Pe,Ll=class extends ot{constructor(e){super(e),this.availableExtensions=[]}load(e,t,n,i){let r=this,a=new _t(r.manager);a.setPath(r.path),a.setResponseType("arraybuffer"),a.setRequestHeader(r.requestHeader),a.setWithCredentials(r.withCredentials),a.load(e,function(o){try{t(r.parse(o))}catch(l){i?i(l):console.error(l),r.manager.itemError(e)}},n,i)}parse(e){let t=this,n=new kn(this.manager);function i(V){let G=null,k=null,E,T,w=[],N=[],M,D={},U={},R={},z=new TextDecoder;try{G=Qf(new Uint8Array(V))}catch(ce){if(ce instanceof ReferenceError)return console.error("THREE.3MFLoader: fflate missing and file is compressed."),null}let J=null;for(k in G)k.match(/\_rels\/.rels$/)?E=k:k.match(/3D\/_rels\/.*\.model\.rels$/)?T=k:k.match(/^3D\/[^\/]*\.model$/)?J=k:k.match(/^3D\/.*\/.*\.model$/)?w.push(k):k.match(/^3D\/Textures?\/.*/)&&N.push(k);if(w.push(J),E===void 0)throw new Error("THREE.ThreeMFLoader: Cannot find relationship file `rels` in 3MF archive.");let Z=G[E],ae=z.decode(Z),be=r(ae);if(T){let ce=G[T],se=z.decode(ce);M=r(se)}for(let ce=0;ce<w.length;ce++){let se=w[ce],Te=G[se],ie=z.decode(Te),he=new DOMParser().parseFromString(ie,"application/xml");he.documentElement.nodeName.toLowerCase()!=="model"&&console.error("THREE.3MFLoader: Error loading 3MF - no 3MF document found: ",se);let le=he.querySelector("model"),ye={};for(let Ye=0;Ye<le.attributes.length;Ye++){let ht=le.attributes[Ye];ht.name.match(/^xmlns:(.+)$/)&&(ye[ht.value]=RegExp.$1)}let Ge=x(le);Ge.xml=le,0<Object.keys(ye).length&&(Ge.extensions=ye),D[se]=Ge}for(let ce=0;ce<N.length;ce++){let se=N[ce];R[se]=G[se].buffer}return{rels:be,modelRels:M,model:D,printTicket:U,texture:R}}function r(V){let G=[],E=new DOMParser().parseFromString(V,"application/xml").querySelectorAll("Relationship");for(let T=0;T<E.length;T++){let w=E[T],N={target:w.getAttribute("Target"),id:w.getAttribute("Id"),type:w.getAttribute("Type")};G.push(N)}return G}function a(V){let G={};for(let k=0;k<V.length;k++){let E=V[k],T=E.getAttribute("name");0<=["Title","Designer","Description","Copyright","LicenseTerms","Rating","CreationDate","ModificationDate"].indexOf(T)&&(G[T]=E.textContent)}return G}function o(V){let G={id:V.getAttribute("id"),basematerials:[]},k=V.querySelectorAll("base");for(let E=0;E<k.length;E++){let T=k[E],w=m(T);w.index=E,G.basematerials.push(w)}return G}function l(V){return{id:V.getAttribute("id"),path:V.getAttribute("path"),contenttype:V.getAttribute("contenttype"),tilestyleu:V.getAttribute("tilestyleu"),tilestylev:V.getAttribute("tilestylev"),filter:V.getAttribute("filter")}}function c(V){let G={id:V.getAttribute("id"),texid:V.getAttribute("texid"),displaypropertiesid:V.getAttribute("displaypropertiesid")},k=V.querySelectorAll("tex2coord"),E=[];for(let T=0;T<k.length;T++){let w=k[T],N=w.getAttribute("u"),M=w.getAttribute("v");E.push(parseFloat(N),parseFloat(M))}return G.uvs=new Float32Array(E),G}function h(V){let G={id:V.getAttribute("id"),displaypropertiesid:V.getAttribute("displaypropertiesid")},k=V.querySelectorAll("color"),E=[],T=new de;for(let w=0;w<k.length;w++){let M=k[w].getAttribute("color");T.setStyle(M.substring(0,7),Zu),E.push(T.r,T.g,T.b)}return G.colors=new Float32Array(E),G}function u(V){let G=V.children,k={};for(let E=0;E<G.length;E++){let T={type:G[E].nodeName.substring(2)};for(let w=0;w<G[E].attributes.length;w++){let N=G[E].attributes[w];N.specified&&(T[N.name]=N.value)}k[G[E].getAttribute("identifier")]=T}return k}function d(V){let G={id:V.getAttribute("id"),displayname:V.getAttribute("displayname")},k=V.children,E={};for(let T=0;T<k.length;T++){let w=k[T];if(w.nodeName==="i:in"||w.nodeName==="i:out")E[w.nodeName==="i:in"?"inputs":"outputs"]=u(w);else{let N=w.children,M={op:w.nodeName.substring(2),identifier:w.getAttribute("identifier")};for(let D=0;D<N.length;D++)M[N[D].nodeName.substring(2)]=u(N[D]);E[M.identifier]=M}}return G.operations=E,G}function p(V){let G={id:V.getAttribute("id")},k=V.querySelectorAll("pbmetallic"),E=[];for(let T=0;T<k.length;T++){let w=k[T];E.push({name:w.getAttribute("name"),metallicness:parseFloat(w.getAttribute("metallicness")),roughness:parseFloat(w.getAttribute("roughness"))})}return G.data=E,G}function m(V){let G={};return G.name=V.getAttribute("name"),G.displaycolor=V.getAttribute("displaycolor"),G.displaypropertiesid=V.getAttribute("displaypropertiesid"),G}function f(V){let G={},k=[],E=V.querySelectorAll("vertices vertex");for(let M=0;M<E.length;M++){let D=E[M],U=D.getAttribute("x"),R=D.getAttribute("y"),z=D.getAttribute("z");k.push(parseFloat(U),parseFloat(R),parseFloat(z))}G.vertices=new Float32Array(k);let T=[],w=[],N=V.querySelectorAll("triangles triangle");for(let M=0;M<N.length;M++){let D=N[M],U=D.getAttribute("v1"),R=D.getAttribute("v2"),z=D.getAttribute("v3"),J=D.getAttribute("p1"),Z=D.getAttribute("p2"),ae=D.getAttribute("p3"),be=D.getAttribute("pid"),ce={};ce.v1=parseInt(U,10),ce.v2=parseInt(R,10),ce.v3=parseInt(z,10),w.push(ce.v1,ce.v2,ce.v3),J&&(ce.p1=parseInt(J,10)),Z&&(ce.p2=parseInt(Z,10)),ae&&(ce.p3=parseInt(ae,10)),be&&(ce.pid=be),0<Object.keys(ce).length&&T.push(ce)}return G.triangleProperties=T,G.triangles=new Uint32Array(w),G}function _(V){let G=[],k=V.querySelectorAll("component");for(let E=0;E<k.length;E++){let T=k[E],w=g(T);G.push(w)}return G}function g(V){let G={};G.objectId=V.getAttribute("objectid");let k=V.getAttribute("transform");return k&&(G.transform=v(k)),G}function v(V){let G=[];V.split(" ").forEach(function(E){G.push(parseFloat(E))});let k=new ge;return k.set(G[0],G[3],G[6],G[9],G[1],G[4],G[7],G[10],G[2],G[5],G[8],G[11],0,0,0,1),k}function b(V){let G={type:V.getAttribute("type")},k=V.getAttribute("id");k&&(G.id=k);let E=V.getAttribute("pid");E&&(G.pid=E);let T=V.getAttribute("pindex");T&&(G.pindex=T);let w=V.getAttribute("thumbnail");w&&(G.thumbnail=w);let N=V.getAttribute("partnumber");N&&(G.partnumber=N);let M=V.getAttribute("name");M&&(G.name=M);let D=V.querySelector("mesh");D&&(G.mesh=f(D));let U=V.querySelector("components");return U&&(G.components=_(U)),G}function y(V){let G={};G.basematerials={};let k=V.querySelectorAll("basematerials");for(let U=0;U<k.length;U++){let R=k[U],z=o(R);G.basematerials[z.id]=z}G.texture2d={};let E=V.querySelectorAll("texture2d");for(let U=0;U<E.length;U++){let R=E[U],z=l(R);G.texture2d[z.id]=z}G.colorgroup={};let T=V.querySelectorAll("colorgroup");for(let U=0;U<T.length;U++){let R=T[U],z=h(R);G.colorgroup[z.id]=z}let w=V.querySelectorAll("implicitfunction");w.length>0&&(G.implicitfunction={});for(let U=0;U<w.length;U++){let R=w[U],z=d(R);G.implicitfunction[z.id]=z}G.pbmetallicdisplayproperties={};let N=V.querySelectorAll("pbmetallicdisplayproperties");for(let U=0;U<N.length;U++){let R=N[U],z=p(R);G.pbmetallicdisplayproperties[z.id]=z}G.texture2dgroup={};let M=V.querySelectorAll("texture2dgroup");for(let U=0;U<M.length;U++){let R=M[U],z=c(R);G.texture2dgroup[z.id]=z}G.object={};let D=V.querySelectorAll("object");for(let U=0;U<D.length;U++){let R=D[U],z=b(R);G.object[z.id]=z}return G}function S(V){let G=[],k=V.querySelectorAll("item");for(let E=0;E<k.length;E++){let T=k[E],w={objectId:T.getAttribute("objectid")},N=T.getAttribute("transform");N&&(w.transform=v(N)),G.push(w)}return G}function x(V){let G={unit:V.getAttribute("unit")||"millimeter"},k=V.querySelectorAll("metadata");k&&(G.metadata=a(k));let E=V.querySelector("resources");E&&(G.resources=y(E));let T=V.querySelector("build");return T&&(G.build=S(T)),G}function A(V,G,k,E){let T=V.texid,N=k.resources.texture2d[T];if(N){let M=E[N.path],D=N.contenttype,U=new Blob([M],{type:D}),R=URL.createObjectURL(U),z=n.load(R,function(){URL.revokeObjectURL(R)});switch(z.colorSpace=Zu,N.tilestyleu){case"wrap":z.wrapS=Nt;break;case"mirror":z.wrapS=vi;break;case"none":case"clamp":z.wrapS=qt;break;default:z.wrapS=Nt}switch(N.tilestylev){case"wrap":z.wrapT=Nt;break;case"mirror":z.wrapT=vi;break;case"none":case"clamp":z.wrapT=qt;break;default:z.wrapT=Nt}switch(N.filter){case"auto":z.magFilter=ct,z.minFilter=hn;break;case"linear":z.magFilter=ct,z.minFilter=ct,z.generateMipmaps=!1;break;case"nearest":z.magFilter=Ut,z.minFilter=Ut,z.generateMipmaps=!1;break;default:z.magFilter=ct,z.minFilter=hn}return z}else return null}function F(V,G,k,E,T,w,N){let M=N.pindex,D={};for(let z=0,J=G.length;z<J;z++){let Z=G[z],ae=Z.p1!==void 0?Z.p1:M;D[ae]===void 0&&(D[ae]=[]),D[ae].push(Z)}let U=Object.keys(D),R=[];for(let z=0,J=U.length;z<J;z++){let Z=U[z],ae=D[Z],be=V.basematerials[Z],ce=K(be,E,T,w,N,ee),se=new De,Te=[],ie=k.vertices;for(let le=0,ye=ae.length;le<ye;le++){let Ge=ae[le];Te.push(ie[Ge.v1*3+0]),Te.push(ie[Ge.v1*3+1]),Te.push(ie[Ge.v1*3+2]),Te.push(ie[Ge.v2*3+0]),Te.push(ie[Ge.v2*3+1]),Te.push(ie[Ge.v2*3+2]),Te.push(ie[Ge.v3*3+0]),Te.push(ie[Ge.v3*3+1]),Te.push(ie[Ge.v3*3+2])}se.setAttribute("position",new ve(Te,3));let he=new et(se,ce);R.push(he)}return R}function L(V,G,k,E,T,w,N){let M=new De,D=[],U=[],R=k.vertices,z=V.uvs;for(let be=0,ce=G.length;be<ce;be++){let se=G[be];D.push(R[se.v1*3+0]),D.push(R[se.v1*3+1]),D.push(R[se.v1*3+2]),D.push(R[se.v2*3+0]),D.push(R[se.v2*3+1]),D.push(R[se.v2*3+2]),D.push(R[se.v3*3+0]),D.push(R[se.v3*3+1]),D.push(R[se.v3*3+2]),U.push(z[se.p1*2+0]),U.push(z[se.p1*2+1]),U.push(z[se.p2*2+0]),U.push(z[se.p2*2+1]),U.push(z[se.p3*2+0]),U.push(z[se.p3*2+1])}M.setAttribute("position",new ve(D,3)),M.setAttribute("uv",new ve(U,2));let J=K(V,E,T,w,N,A),Z=new Gt({map:J,flatShading:!0});return new et(M,Z)}function P(V,G,k,E){let T=new De,w=[],N=[],M=k.vertices,D=V.colors;for(let z=0,J=G.length;z<J;z++){let Z=G[z],ae=Z.v1,be=Z.v2,ce=Z.v3;w.push(M[ae*3+0]),w.push(M[ae*3+1]),w.push(M[ae*3+2]),w.push(M[be*3+0]),w.push(M[be*3+1]),w.push(M[be*3+2]),w.push(M[ce*3+0]),w.push(M[ce*3+1]),w.push(M[ce*3+2]);let se=Z.p1!==void 0?Z.p1:E.pindex,Te=Z.p2!==void 0?Z.p2:se,ie=Z.p3!==void 0?Z.p3:se;N.push(D[se*3+0]),N.push(D[se*3+1]),N.push(D[se*3+2]),N.push(D[Te*3+0]),N.push(D[Te*3+1]),N.push(D[Te*3+2]),N.push(D[ie*3+0]),N.push(D[ie*3+1]),N.push(D[ie*3+2])}T.setAttribute("position",new ve(w,3)),T.setAttribute("color",new ve(N,3));let U=new Gt({vertexColors:!0,flatShading:!0});return new et(T,U)}function O(V){let G=new De;G.setIndex(new Xe(V.triangles,1)),G.setAttribute("position",new Xe(V.vertices,3));let k=new Gt({name:ot.DEFAULT_MATERIAL_NAME,color:16777215,flatShading:!0});return new et(G,k)}function B(V,G,k,E,T,w){let N=Object.keys(V),M=[];for(let D=0,U=N.length;D<U;D++){let R=N[D],z=V[R];switch(j(R,E)){case"material":let Z=E.resources.basematerials[R],ae=F(Z,z,G,k,E,T,w);for(let se=0,Te=ae.length;se<Te;se++)M.push(ae[se]);break;case"texture":let be=E.resources.texture2dgroup[R];M.push(L(be,z,G,k,E,T,w));break;case"vertexColors":let ce=E.resources.colorgroup[R];M.push(P(ce,z,G,w));break;case"default":M.push(O(G));break;default:console.error("THREE.3MFLoader: Unsupported resource type.")}}if(w.name)for(let D=0;D<M.length;D++)M[D].name=w.name;return M}function j(V,G){return G.resources.texture2dgroup[V]!==void 0?"texture":G.resources.basematerials[V]!==void 0?"material":G.resources.colorgroup[V]!==void 0?"vertexColors":V==="default"?"default":void 0}function H(V,G){let k={},E=V.triangleProperties,T=G.pid;for(let w=0,N=E.length;w<N;w++){let M=E[w],D=M.pid!==void 0?M.pid:T;D===void 0&&(D="default"),k[D]===void 0&&(k[D]=[]),k[D].push(M)}return k}function W(V,G,k,E,T){let w=new bt,N=H(V,T),M=B(N,V,G,k,E,T);for(let D=0,U=M.length;D<U;D++)w.add(M[D]);return w}function Y(V,G,k){if(!V)return;let E=[],T=Object.keys(V);for(let w=0;w<T.length;w++){let N=T[w];for(let M=0;M<t.availableExtensions.length;M++){let D=t.availableExtensions[M];D.ns===N&&E.push(D)}}for(let w=0;w<E.length;w++){let N=E[w];N.apply(k,V[N.ns],G)}}function K(V,G,k,E,T,w){return V.build!==void 0||(V.build=w(V,G,k,E,T)),V.build}function ee(V,G,k){let E,T=V.displaypropertiesid,w=k.resources.pbmetallicdisplayproperties;if(T!==null&&w[T]!==void 0){let U=w[T].data[V.index];E=new xn({flatShading:!0,roughness:U.roughness,metalness:U.metallicness})}else E=new Gt({flatShading:!0});E.name=V.name;let N=V.displaycolor,M=N.substring(0,7);return E.color.setStyle(M,Zu),N.length===9&&(E.opacity=parseInt(N.charAt(7)+N.charAt(8),16)/255),E}function ue(V,G,k,E){let T=new bt;for(let w=0;w<V.length;w++){let N=V[w],M=G[N.objectId];M===void 0&&(Se(N.objectId,G,k,E),M=G[N.objectId]);let D=M.clone(),U=N.transform;U&&D.applyMatrix4(U),T.add(D)}return T}function Se(V,G,k,E){let T=k.resources.object[V];if(T.mesh){let w=T.mesh,N=k.extensions,M=k.xml;Y(N,w,M),G[T.id]=K(w,G,k,E,T,W)}else{let w=T.components;G[T.id]=K(w,G,k,E,T,ue)}T.name&&(G[T.id].name=T.name),k.resources.implicitfunction&&console.warn("THREE.ThreeMFLoader: Implicit Functions are implemented in data-only.",k.resources.implicitfunction)}function me(V){let G=V.model,k=V.modelRels,E={},T=Object.keys(G),w={};if(k)for(let N=0,M=k.length;N<M;N++){let D=k[N],U=D.target.substring(1);V.texture[U]&&(w[D.target]=V.texture[U])}for(let N=0;N<T.length;N++){let M=T[N],D=G[M],U=Object.keys(D.resources.object);for(let R=0;R<U.length;R++){let z=U[R];Se(z,E,D,w)}}return E}function xe(V){for(let G=0;G<V.length;G++){let k=V[G];if(k.target.split(".").pop().toLowerCase()==="model")return k}}function te(V,G){let k=new bt,E=xe(G.rels),T=G.model[E.target.substring(1)].build;for(let w=0;w<T.length;w++){let N=T[w],M=V[N.objectId].clone(),D=N.transform;D&&M.applyMatrix4(D),k.add(M)}return k}let pe=i(e),oe=me(pe);return te(oe,pe)}addExtension(e){this.availableExtensions.push(e)}};var nb=Object.freeze(["glb","gltf","obj","fbx","stl","ply","3mf"]),Dl=128*1024*1024,hm=3e6,$u=null;function Ri(s,e){let t=new Error(e||s);return t.code=s,t}function ed(s){try{return new URL(".",s).href}catch{let t=String(s).lastIndexOf("/");return t>=0?String(s).slice(0,t+1):""}}async function um(s,e,t){let n=await fetch(s,{signal:e});if(!n.ok)throw Ri("MODEL_READ_FAILED",`HTTP ${n.status}`);let i=Number(n.headers.get("content-length"))||0;if(i>Dl)throw Ri("MODEL_TOO_LARGE");if(!n.body||typeof n.body.getReader!="function"){let h=new Uint8Array(await n.arrayBuffer());if(h.byteLength>Dl)throw Ri("MODEL_TOO_LARGE");return t?.(h.byteLength,i||h.byteLength),h}let r=n.body.getReader(),a=0,o=i?new Uint8Array(i):null,l=o?null:[];for(;;){let{done:h,value:u}=await r.read();if(h)break;if(a+=u.byteLength,a>Dl)throw await r.cancel(),Ri("MODEL_TOO_LARGE");if(o){if(a>o.byteLength){let d=new Uint8Array(a);d.set(o),o=d}o.set(u,a-u.byteLength)}else l.push(u);t?.(a,i)}if(o)return o.subarray(0,a);o=new Uint8Array(a);let c=0;for(let h of l)o.set(h,c),c+=h.byteLength;return o}function ib(s){return s.byteOffset===0&&s.byteLength===s.buffer.byteLength?s.buffer:s.buffer.slice(s.byteOffset,s.byteOffset+s.byteLength)}async function rb(s,e,t){let n=s.match(/^\s*mtllib\s+(.+?)\s*$/im);if(!n)return null;try{let i=ed(e),r=new URL(n[1].trim().replace(/\\/g,"/"),i).href,a=await um(r,t),o=new Cl().parse(new TextDecoder().decode(a),ed(r));return o.preload(),o}catch(i){if(i?.name==="AbortError")throw i;return null}}async function sb(s,e,t,n){let i=ib(e),r=ed(t);switch(s){case"glb":case"gltf":{let a=new xl;a.setDecoderPath(new URL("vendor/three/addons/libs/draco/gltf/",document.baseURI).href);let o=new bl;o.setDRACOLoader(a),o.setMeshoptDecoder(Vf);try{let l=await o.parseAsync(i,r);return{object:l.scene||l.scenes?.[0],animations:l.animations||[]}}finally{a.dispose()}}case"fbx":{let a=new Tl().parse(i,r);return{object:a,animations:a.animations||[]}}case"obj":{let a=new TextDecoder().decode(e),o=new Rl,l=await rb(a,t,n);return l&&o.setMaterials(l),{object:o.parse(a),animations:[]}}case"stl":{let a=new Pl().parse(i);a.getAttribute("normal")||a.computeVertexNormals();let o=new xn({color:7121151,roughness:.62,metalness:.08});return{object:new et(a,o),animations:[]}}case"ply":{let a=new Il().parse(i),o=new TextDecoder().decode(e.subarray(0,Math.min(e.length,65536))),l=Number(o.match(/element\s+face\s+(\d+)/i)?.[1]||0),c=!!a.getAttribute("color");if(l>0||a.index){a.getAttribute("normal")||a.computeVertexNormals();let u=new xn({color:c?16777215:7121151,vertexColors:c,roughness:.68});return{object:new et(a,u),animations:[]}}let h=new ln({color:c?16777215:7121151,vertexColors:c,size:.012,sizeAttenuation:!0});return{object:new Un(a,h),animations:[]}}case"3mf":return{object:new Ll().parse(i),animations:[]};default:throw Ri("MODEL_UNSUPPORTED")}}function ab(s){let e=0,t=0,n=0;return s.traverse(i=>{let r=i.geometry;if(!r)return;let a=r.getAttribute?.("position");a&&(e+=a.count),i.isMesh&&(n++,t+=Math.floor((r.index?.count||a?.count||0)/3))}),{vertices:e,triangles:t,meshes:n}}function cm(s){if(s){for(let e of Object.values(s))e?.isTexture&&e.dispose();s.dispose?.()}}function Fl(s){s?.traverse?.(e=>{e.geometry?.dispose?.(),Array.isArray(e.material)?e.material.forEach(cm):cm(e.material)})}function ba(s,e,t){s.textContent=e,s.title=t||e,s.setAttribute("aria-label",t||e)}function Qu(s){try{return new Intl.NumberFormat().format(s)}catch{return String(s)}}function dm(){let s=$u;s&&($u=null,s.disposed=!0,s.abort?.abort(),s.raf&&cancelAnimationFrame(s.raf),s.resizeObserver?.disconnect(),s.controls?.dispose(),s.mixer?.stopAllAction(),Fl(s.object),s.scene?.clear(),s.renderer?.dispose(),s.renderer?.forceContextLoss?.())}async function ob(s){dm();let{container:e,extension:t,sourceUrl:n,fileName:i,labels:r={},isCurrent:a=()=>!0}=s,o=new AbortController,l={abort:o,disposed:!1,raf:0,object:null,renderer:null,scene:null,controls:null,mixer:null,resizeObserver:null};$u=l;let c=document.createElement("div");c.className="preview-model-shell",c.innerHTML='<div class="preview-model-toolbar"><button type="button" data-model-action="reset"></button><button type="button" data-model-action="wireframe"></button><button type="button" data-model-action="rotate"></button><button type="button" data-model-action="animation" hidden></button></div><div class="preview-model-stage"><div class="preview-model-progress"></div></div><div class="preview-model-meta"><span class="preview-model-name"></span><span class="preview-model-stats"></span></div>',e.replaceChildren(c);let h=c.querySelector(".preview-model-stage"),u=c.querySelector(".preview-model-progress");c.querySelector(".preview-model-name").textContent=i;let d=c.querySelector('[data-model-action="reset"]'),p=c.querySelector('[data-model-action="wireframe"]'),m=c.querySelector('[data-model-action="rotate"]'),f=c.querySelector('[data-model-action="animation"]');ba(d,r.reset||"Reset",r.resetTitle),ba(p,r.wireframe||"Wireframe",r.wireframeTitle),ba(m,r.rotate||"Auto rotate",r.rotateTitle),u.textContent=r.loading||"Loading 3D model\u2026";let _=0,g=await um(n,o.signal,(k,E)=>{let T=performance.now();if(T-_<80&&k!==E)return;_=T;let w=E?`${Math.round(k*100/E)}%`:`${Math.round(k/1048576)} MB`;u.textContent=`${r.loading||"Loading 3D model\u2026"} ${w}`});if(l.disposed||!a()||(u.textContent=r.parsing||"Building scene\u2026",await new Promise(k=>setTimeout(k,0)),l.disposed||!a()))return;let v=await sb(String(t).toLowerCase(),g,n,o.signal);if(!v.object)throw Ri("MODEL_EMPTY");if(l.disposed||!a()){Fl(v.object);return}let b=ab(v.object);if(b.triangles>hm)throw Fl(v.object),Ri("MODEL_TOO_COMPLEX");l.object=v.object;let y;try{y=new fl({antialias:!0,alpha:!0,powerPreference:"high-performance"})}catch(k){throw Ri("WEBGL_UNAVAILABLE",k?.message)}l.renderer=y,y.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75)),y.outputColorSpace=Pe,y.toneMapping=oa,y.toneMappingExposure=1.05,y.domElement.className="preview-model-canvas",h.replaceChildren(y.domElement);let S=new Ps;l.scene=S;let x=new vt(42,1,.01,1e4),A=new vl(x,y.domElement);l.controls=A,A.enableDamping=!1,A.screenSpacePanning=!0,A.zoomToCursor=!0;let F=new bt;F.add(v.object),S.add(F),v.object.updateWorldMatrix(!0,!0);let L=new zt().setFromObject(v.object);if(L.isEmpty())throw Fl(v.object),Ri("MODEL_EMPTY");let P=L.getCenter(new C),O=L.getSize(new C);F.position.copy(P).multiplyScalar(-1);let B=Math.max(O.x,O.y,O.z,.001),j=Math.max(B/(2*Math.tan(mt.degToRad(x.fov/2)))*1.28,.1);x.near=Math.max(j/2e3,1e-4),x.far=Math.max(j*100,B*100,100),x.updateProjectionMatrix(),x.position.set(j*.72,j*.52,j),A.target.set(0,0,0),A.minDistance=Math.max(B*.01,1e-4),A.maxDistance=j*30,A.update();let H=x.position.clone(),W=A.target.clone();S.add(new $s(16777215,6252664,2.2));let Y=new Qn(16777215,2.8);Y.position.set(j,j*1.4,j*1.2),S.add(Y);let K=new Qn(9091327,1.1);K.position.set(-j,j*.3,-j*.5),S.add(K);let ee=new ia(B*2.4,12,7438486,10530496);ee.position.y=L.min.y-P.y,ee.material.transparent=!0,ee.material.opacity=.28,S.add(ee);let ue=!0,Se=performance.now(),me=!1,xe=!1,te=new WeakMap;function pe(k=performance.now()){if(l.raf=0,l.disposed||!a()||document.hidden)return;let E=Math.min((k-Se)/1e3,.1);Se=k,l.mixer&&me&&(l.mixer.update(E),ue=!0),A.autoRotate&&(A.update(E),ue=!0),ue&&(y.render(S,x),ue=!1),(l.mixer&&me||A.autoRotate)&&(l.raf=requestAnimationFrame(pe))}function oe(){ue=!0,l.raf||(l.raf=requestAnimationFrame(pe))}function V(){if(l.disposed)return;let k=h.getBoundingClientRect(),E=Math.max(1,Math.floor(k.width)),T=Math.max(1,Math.floor(k.height));y.setSize(E,T,!1),x.aspect=E/T,x.updateProjectionMatrix(),oe()}A.addEventListener("change",oe),l.resizeObserver=new ResizeObserver(V),l.resizeObserver.observe(h),d.addEventListener("click",()=>{x.position.copy(H),A.target.copy(W),A.update(),oe()}),p.addEventListener("click",()=>{xe=!xe,v.object.traverse(k=>{if(!k.isMesh)return;let E=Array.isArray(k.material)?k.material:[k.material];for(let T of E)!T||!("wireframe"in T)||(te.has(T)||te.set(T,!!T.wireframe),T.wireframe=xe?!0:te.get(T),T.needsUpdate=!0)}),p.classList.toggle("active",xe),oe()}),m.addEventListener("click",()=>{A.autoRotate=!A.autoRotate,A.autoRotateSpeed=2,m.classList.toggle("active",A.autoRotate),Se=performance.now(),oe()}),v.animations?.length&&(l.mixer=new Jr(v.object),l.mixer.clipAction(v.animations[0]).play(),me=!0,f.hidden=!1,ba(f,r.pause||"Pause",r.animationTitle),f.classList.add("active"),f.addEventListener("click",()=>{me=!me,l.mixer.timeScale=me?1:0,ba(f,me?r.pause||"Pause":r.play||"Play",r.animationTitle),f.classList.toggle("active",me),Se=performance.now(),oe()}));let G=[`${Qu(b.meshes)} ${r.meshes||"meshes"}`,`${Qu(b.triangles)} ${r.triangles||"triangles"}`,`${Qu(b.vertices)} ${r.vertices||"vertices"}`];c.querySelector(".preview-model-stats").textContent=G.join(" \xB7 "),c.title=r.controls||"Drag to orbit \xB7 Wheel to zoom \xB7 Right-drag to pan",V(),oe()}return xm(lb);})();
