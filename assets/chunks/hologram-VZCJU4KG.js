import{b as ui,e as nc,i as fu,j as du}from"./chunk-X2BKIO4Q.js";import"./chunk-KVMUXFPB.js";var Yu=0,Bc=1,Zu=2;var Qr=1,Ju=2,Ys=3,ii=0,gn=1,Sn=2,rs=0,Zs=1,Js=2,zc=3,kc=4,$u=5;var os=100,Ku=101,Qu=102,ju=103,tf=104,ef=200,nf=201,sf=202,rf=203,Gc=204,Vc=205,of=206,af=207,lf=208,cf=209,hf=210,uf=211,ff=212,df=213,pf=214,aa=0,la=1,ca=2,Fs=3,ha=4,ua=5,fa=6,da=7,Hc=0,mf=1,gf=2,si=0,Wc=1,Xc=2,qc=3,Yc=4,Zc=5,Jc=6,$c=7;var Kc=300,as=301,$s=302,Ja=303,$a=304,pa=1e3,Kn=1001,ma=1002,rn=1003,_f=1004;var jr=1005;var dn=1006,Ka=1007;var Mi=1008;var Pn=1009,Qc=1010,jc=1011,Ks=1012,Qa=1013,Wn=1014,Xn=1015,qn=1016,ja=1017,tl=1018,ls=1020,th=35902,eh=35899,nh=1021,ih=1022,Yn=1023,vi=1026,Si=1027,sh=1028,el=1029,ki=1030,nl=1031;var il=1033,to=33776,eo=33777,no=33778,io=33779,sl=35840,rl=35841,ol=35842,al=35843,ll=36196,cl=37492,hl=37496,ul=37488,fl=37489,so=37490,dl=37491,pl=37808,ml=37809,gl=37810,_l=37811,xl=37812,vl=37813,yl=37814,Ml=37815,Sl=37816,bl=37817,wl=37818,Al=37819,Tl=37820,El=37821,Rl=36492,Cl=36494,Il=36495,Pl=36283,Ll=36284,ro=36285,Nl=36286;var Mr=2300,ga=2301,sa=2302,Rc=2303,Cc=2400,Ic=2401,Pc=2402;var xf=3200;var rh=0,vf=1,bi="",En="srgb",Sr="srgb-linear",br="linear",Le="srgb";var ra=7680;var yf=519,Mf=512,Sf=513,bf=514,oh=515,wf=516,Af=517,ah=518,lh=519,Tf=35044;var ch="300 es",Nn=2e3,wr=2001;function zp(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function kp(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function Ar(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Ef(){let i=Ar("canvas");return i.style.display="block",i}var pu={},Us=null;function hh(...i){let t="THREE."+i.shift();Us?Us("log",t,...i):console.log(t,...i)}function Rf(i){let t=i[0];if(typeof t=="string"&&t.startsWith("TSL:")){let e=i[1];e&&e.isStackTrace?i[0]+=" "+e.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function ae(...i){i=Rf(i);let t="THREE."+i.shift();if(Us)Us("warn",t,...i);else{let e=i[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...i)}}function ce(...i){i=Rf(i);let t="THREE."+i.shift();if(Us)Us("error",t,...i);else{let e=i[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...i)}}function xr(...i){let t=i.join(" ");t in pu||(pu[t]=!0,ae(...i))}function Cf(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}var If={[aa]:aa,[ca]:fa,[ha]:ha,[Fs]:ua,[la]:la,[fa]:ca,[da]:da,[ua]:Fs},jn=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let s=n[t];if(s!==void 0){let r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let s=n.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,t);t.target=null}}},ln=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var oa=Math.PI/180,_a=180/Math.PI;function Qs(){let i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(ln[i&255]+ln[i>>8&255]+ln[i>>16&255]+ln[i>>24&255]+"-"+ln[t&255]+ln[t>>8&255]+"-"+ln[t>>16&15|64]+ln[t>>24&255]+"-"+ln[e&63|128]+ln[e>>8&255]+"-"+ln[e>>16&255]+ln[e>>24&255]+ln[n&255]+ln[n>>8&255]+ln[n>>16&255]+ln[n>>24&255]).toLowerCase()}function we(i,t,e){return Math.max(t,Math.min(e,i))}function Gp(i,t){return(i%t+t)%t}function ic(i,t,e){return(1-e)*i+e*t}function Pf(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function uh(i){switch(i.constructor){case Uint32Array:return 4294967295;case Uint16Array:return 65535;case Uint8Array:case Uint8ClampedArray:return 255;case Int32Array:return 2147483647;case Int16Array:return 32767;case Int8Array:return 127;default:return}}function Vp(i,t){if(t.constructor===Float32Array)return i;let e=uh(t);if(e===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.max(i/e,-1)}function Hp(i,t){if(t.constructor===Float32Array)return i;let e=uh(t);if(e===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.round(i*e)}var _h=class _h{constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=we(this.x,t.x,e.x),this.y=we(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=we(this.x,t,e),this.y=we(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(we(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(we(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*s+t.x,this.y=r*s+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};_h.prototype.isVector2=!0;var Nt=_h,ti=class{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,o,a){let l=n[s+0],c=n[s+1],h=n[s+2],f=n[s+3],d=r[o+0],u=r[o+1],m=r[o+2],x=r[o+3];if(f!==x||l!==d||c!==u||h!==m){let p=l*d+c*u+h*m+f*x;p<0&&(d=-d,u=-u,m=-m,x=-x,p=-p);let g=1-a;if(p<.9995){let _=Math.acos(p),S=Math.sin(_);g=Math.sin(g*_)/S,a=Math.sin(a*_)/S,l=l*g+d*a,c=c*g+u*a,h=h*g+m*a,f=f*g+x*a}else{l=l*g+d*a,c=c*g+u*a,h=h*g+m*a,f=f*g+x*a;let _=1/Math.sqrt(l*l+c*c+h*h+f*f);l*=_,c*=_,h*=_,f*=_}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=f}static multiplyQuaternionsFlat(t,e,n,s,r,o){let a=n[s],l=n[s+1],c=n[s+2],h=n[s+3],f=r[o],d=r[o+1],u=r[o+2],m=r[o+3];return t[e]=a*m+h*f+l*u-c*d,t[e+1]=l*m+h*d+c*f-a*u,t[e+2]=c*m+h*u+a*d-l*f,t[e+3]=h*m-a*f-l*d-c*u,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,s=t._y,r=t._z,o=t._order,a=Math.cos,l=Math.sin,c=a(n/2),h=a(s/2),f=a(r/2),d=l(n/2),u=l(s/2),m=l(r/2);switch(o){case"XYZ":this._x=d*h*f+c*u*m,this._y=c*u*f-d*h*m,this._z=c*h*m+d*u*f,this._w=c*h*f-d*u*m;break;case"YXZ":this._x=d*h*f+c*u*m,this._y=c*u*f-d*h*m,this._z=c*h*m-d*u*f,this._w=c*h*f+d*u*m;break;case"ZXY":this._x=d*h*f-c*u*m,this._y=c*u*f+d*h*m,this._z=c*h*m+d*u*f,this._w=c*h*f-d*u*m;break;case"ZYX":this._x=d*h*f-c*u*m,this._y=c*u*f+d*h*m,this._z=c*h*m-d*u*f,this._w=c*h*f+d*u*m;break;case"YZX":this._x=d*h*f+c*u*m,this._y=c*u*f+d*h*m,this._z=c*h*m-d*u*f,this._w=c*h*f-d*u*m;break;case"XZY":this._x=d*h*f-c*u*m,this._y=c*u*f-d*h*m,this._z=c*h*m+d*u*f,this._w=c*h*f+d*u*m;break;default:ae("Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],s=e[4],r=e[8],o=e[1],a=e[5],l=e[9],c=e[2],h=e[6],f=e[10],d=n+a+f;if(d>0){let u=.5/Math.sqrt(d+1);this._w=.25/u,this._x=(h-l)*u,this._y=(r-c)*u,this._z=(o-s)*u}else if(n>a&&n>f){let u=2*Math.sqrt(1+n-a-f);this._w=(h-l)/u,this._x=.25*u,this._y=(s+o)/u,this._z=(r+c)/u}else if(a>f){let u=2*Math.sqrt(1+a-n-f);this._w=(r-c)/u,this._x=(s+o)/u,this._y=.25*u,this._z=(l+h)/u}else{let u=2*Math.sqrt(1+f-n-a);this._w=(o-s)/u,this._x=(r+c)/u,this._y=(l+h)/u,this._z=.25*u}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(we(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+o*a+s*c-r*l,this._y=s*h+o*l+r*a-n*c,this._z=r*h+o*c+n*l-s*a,this._w=o*h-n*a-s*l-r*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=this.dot(t);a<0&&(n=-n,s=-s,r=-r,o=-o,a=-a);let l=1-e;if(a<.9995){let c=Math.acos(a),h=Math.sin(c);l=Math.sin(l*c)/h,e=Math.sin(e*c)/h,this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},xh=class xh{constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(mu.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(mu.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*o,this}applyQuaternion(t){let e=this.x,n=this.y,s=this.z,r=t.x,o=t.y,a=t.z,l=t.w,c=2*(o*s-a*n),h=2*(a*e-r*s),f=2*(r*n-o*e);return this.x=e+l*c+o*f-a*h,this.y=n+l*h+a*c-r*f,this.z=s+l*f+r*h-o*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=we(this.x,t.x,e.x),this.y=we(this.y,t.y,e.y),this.z=we(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=we(this.x,t,e),this.y=we(this.y,t,e),this.z=we(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(we(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,s=t.y,r=t.z,o=e.x,a=e.y,l=e.z;return this.x=s*l-r*a,this.y=r*o-n*l,this.z=n*a-s*o,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return sc.copy(this).projectOnVector(t),this.sub(sc)}reflect(t){return this.sub(sc.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(we(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};xh.prototype.isVector3=!0;var k=xh,sc=new k,mu=new ti,vh=class vh{constructor(t,e,n,s,r,o,a,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c)}set(t,e,n,s,r,o,a,l,c){let h=this.elements;return h[0]=t,h[1]=s,h[2]=a,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],h=n[4],f=n[7],d=n[2],u=n[5],m=n[8],x=s[0],p=s[3],g=s[6],_=s[1],S=s[4],y=s[7],T=s[2],A=s[5],v=s[8];return r[0]=o*x+a*_+l*T,r[3]=o*p+a*S+l*A,r[6]=o*g+a*y+l*v,r[1]=c*x+h*_+f*T,r[4]=c*p+h*S+f*A,r[7]=c*g+h*y+f*v,r[2]=d*x+u*_+m*T,r[5]=d*p+u*S+m*A,r[8]=d*g+u*y+m*v,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8];return e*o*h-e*a*c-n*r*h+n*a*l+s*r*c-s*o*l}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],f=h*o-a*c,d=a*l-h*r,u=c*r-o*l,m=e*f+n*d+s*u;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);let x=1/m;return t[0]=f*x,t[1]=(s*c-h*n)*x,t[2]=(a*n-s*o)*x,t[3]=d*x,t[4]=(h*e-s*l)*x,t[5]=(s*r-a*e)*x,t[6]=u*x,t[7]=(n*l-c*e)*x,t[8]=(o*e-n*r)*x,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,o,a){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+t,-s*c,s*l,-s*(-c*o+l*a)+a+e,0,0,1),this}scale(t,e){return xr("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(rc.makeScale(t,e)),this}rotate(t){return xr("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(rc.makeRotation(-t)),this}translate(t,e){return xr("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(rc.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}};vh.prototype.isMatrix3=!0;var he=vh,rc=new he,gu=new he().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),_u=new he().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Wp(){let i={enabled:!0,workingColorSpace:Sr,spaces:{},convert:function(s,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===Le&&(s.r=xi(s.r),s.g=xi(s.g),s.b=xi(s.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===Le&&(s.r=Ds(s.r),s.g=Ds(s.g),s.b=Ds(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===bi?br:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,o){return s.copy(this.spaces[o].fromXYZ).multiply(this.spaces[r].toXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[Sr]:{primaries:t,whitePoint:n,transfer:br,toXYZ:gu,fromXYZ:_u,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:En},outputColorSpaceConfig:{drawingBufferColorSpace:En}},[En]:{primaries:t,whitePoint:n,transfer:Le,toXYZ:gu,fromXYZ:_u,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:En}}}),i}var Te=Wp();function xi(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Ds(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var Ms,xa=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{Ms===void 0&&(Ms=Ar("canvas")),Ms.width=t.width,Ms.height=t.height;let s=Ms.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=Ms}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=Ar("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=xi(r[o]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(xi(e[n]/255)*255):e[n]=xi(e[n]);return{data:e,width:t.width,height:t.height}}else return ae("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},Xp=0,Os=class{constructor(t=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Xp++}),this.uuid=Qs(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width||0,e.height||0,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push(oc(s[o].image)):r.push(oc(s[o]))}else r=oc(s);n.url=r}return e||(t.images[this.uuid]=n),n}};function oc(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?xa.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(ae("Texture: Unable to serialize Texture."),{})}var qp=0,ac=new k,yn=class i extends jn{constructor(t=i.DEFAULT_IMAGE,e=i.DEFAULT_MAPPING,n=Kn,s=Kn,r=dn,o=Mi,a=Yn,l=Pn,c=i.DEFAULT_ANISOTROPY,h=bi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:qp++}),this.uuid=Qs(),this.name="",this.source=new Os(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new Nt(0,0),this.repeat=new Nt(1,1),this.center=new Nt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new he,this.generateMipmaps=!0,this.mipmapsAutoUpdate=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.isPMREMTexture=!1,this.normalized=!1}get width(){return this.source.getSize(ac).x}get height(){return this.source.getSize(ac).y}get depth(){return this.source.getSize(ac).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.mipmapsAutoUpdate=t.mipmapsAutoUpdate,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isPMREMTexture=t.isPMREMTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){ae(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){ae(`Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,mipmapsAutoUpdate:this.mipmapsAutoUpdate,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Kc)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case pa:t.x=t.x-Math.floor(t.x);break;case Kn:t.x=t.x<0?0:1;break;case ma:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case pa:t.y=t.y-Math.floor(t.y);break;case Kn:t.y=t.y<0?0:1;break;case ma:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};yn.DEFAULT_IMAGE=null;yn.DEFAULT_MAPPING=Kc;yn.DEFAULT_ANISOTROPY=1;var yh=class yh{constructor(t=0,e=0,n=0,s=1){this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*s+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*s+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*s+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*s+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r,l=t.elements,c=l[0],h=l[4],f=l[8],d=l[1],u=l[5],m=l[9],x=l[2],p=l[6],g=l[10];if(Math.abs(h-d)<.01&&Math.abs(f-x)<.01&&Math.abs(m-p)<.01){if(Math.abs(h+d)<.1&&Math.abs(f+x)<.1&&Math.abs(m+p)<.1&&Math.abs(c+u+g-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let S=(c+1)/2,y=(u+1)/2,T=(g+1)/2,A=(h+d)/4,v=(f+x)/4,b=(m+p)/4;return S>y&&S>T?S<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(S),s=A/n,r=v/n):y>T?y<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(y),n=A/s,r=b/s):T<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(T),n=v/r,s=b/r),this.set(n,s,r,e),this}let _=Math.sqrt((p-m)*(p-m)+(f-x)*(f-x)+(d-h)*(d-h));return Math.abs(_)<.001&&(_=1),this.x=(p-m)/_,this.y=(f-x)/_,this.z=(d-h)/_,this.w=Math.acos((c+u+g-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=we(this.x,t.x,e.x),this.y=we(this.y,t.y,e.y),this.z=we(this.z,t.z,e.z),this.w=we(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=we(this.x,t,e),this.y=we(this.y,t,e),this.z=we(this.z,t,e),this.w=we(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(we(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};yh.prototype.isVector4=!0;var We=yh,va=class extends jn{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:dn,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new We(0,0,t,e),this.scissorTest=!1,this.viewport=new We(0,0,t,e),this.textures=[];let s=n.count;for(let r=0;r<s;r++)this.textures[r]=new yn({width:t,height:e,depth:n.depth}),this.textures[r].isRenderTargetTexture=!0,this.textures[r].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){let e={minFilter:dn,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.mipmapsAutoUpdate!==void 0&&(e.mipmapsAutoUpdate=t.mipmapsAutoUpdate),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),t!==null&&t.renderTarget===null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;let s=Object.assign({},t.textures[e].image);this.textures[e].source=new Os(s)}if(this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveColorBuffer=t.resolveColorBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,this.storeMultisampledColorBuffer=t.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=t.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=t.storeMultisampledStencilBuffer,t.depthTexture!==null)if(t.depthTexture.renderTarget===t){let e=t.depthTexture.clone();e.renderTarget=null,this.depthTexture=e}else this.depthTexture=t.depthTexture;else this.depthTexture=null;return this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},pn=class extends va{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},Tr=class extends yn{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=rn,this.minFilter=rn,this.wrapR=Kn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var ya=class extends yn{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=rn,this.minFilter=rn,this.wrapR=Kn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}};var Za=class Za{constructor(t,e,n,s,r,o,a,l,c,h,f,d,u,m,x,p){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c,h,f,d,u,m,x,p)}set(t,e,n,s,r,o,a,l,c,h,f,d,u,m,x,p){let g=this.elements;return g[0]=t,g[4]=e,g[8]=n,g[12]=s,g[1]=r,g[5]=o,g[9]=a,g[13]=l,g[2]=c,g[6]=h,g[10]=f,g[14]=d,g[3]=u,g[7]=m,g[11]=x,g[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Za().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let e=this.elements,n=t.elements,s=1/Ss.setFromMatrixColumn(t,0).length(),r=1/Ss.setFromMatrixColumn(t,1).length(),o=1/Ss.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,s=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(s),c=Math.sin(s),h=Math.cos(r),f=Math.sin(r);if(t.order==="XYZ"){let d=o*h,u=o*f,m=a*h,x=a*f;e[0]=l*h,e[4]=-l*f,e[8]=c,e[1]=u+m*c,e[5]=d-x*c,e[9]=-a*l,e[2]=x-d*c,e[6]=m+u*c,e[10]=o*l}else if(t.order==="YXZ"){let d=l*h,u=l*f,m=c*h,x=c*f;e[0]=d+x*a,e[4]=m*a-u,e[8]=o*c,e[1]=o*f,e[5]=o*h,e[9]=-a,e[2]=u*a-m,e[6]=x+d*a,e[10]=o*l}else if(t.order==="ZXY"){let d=l*h,u=l*f,m=c*h,x=c*f;e[0]=d-x*a,e[4]=-o*f,e[8]=m+u*a,e[1]=u+m*a,e[5]=o*h,e[9]=x-d*a,e[2]=-o*c,e[6]=a,e[10]=o*l}else if(t.order==="ZYX"){let d=o*h,u=o*f,m=a*h,x=a*f;e[0]=l*h,e[4]=m*c-u,e[8]=d*c+x,e[1]=l*f,e[5]=x*c+d,e[9]=u*c-m,e[2]=-c,e[6]=a*l,e[10]=o*l}else if(t.order==="YZX"){let d=o*l,u=o*c,m=a*l,x=a*c;e[0]=l*h,e[4]=x-d*f,e[8]=m*f+u,e[1]=f,e[5]=o*h,e[9]=-a*h,e[2]=-c*h,e[6]=u*f+m,e[10]=d-x*f}else if(t.order==="XZY"){let d=o*l,u=o*c,m=a*l,x=a*c;e[0]=l*h,e[4]=-f,e[8]=c*h,e[1]=d*f+x,e[5]=o*h,e[9]=u*f-m,e[2]=m*f-u,e[6]=a*h,e[10]=x*f+d}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Yp,t,Zp)}lookAt(t,e,n){let s=this.elements;return An.subVectors(t,e),An.lengthSq()===0&&(An.z=1),An.normalize(),Ii.crossVectors(n,An),Ii.lengthSq()===0&&(Math.abs(n.z)===1?An.x+=1e-4:An.z+=1e-4,An.normalize(),Ii.crossVectors(n,An)),Ii.normalize(),Po.crossVectors(An,Ii),s[0]=Ii.x,s[4]=Po.x,s[8]=An.x,s[1]=Ii.y,s[5]=Po.y,s[9]=An.y,s[2]=Ii.z,s[6]=Po.z,s[10]=An.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],h=n[1],f=n[5],d=n[9],u=n[13],m=n[2],x=n[6],p=n[10],g=n[14],_=n[3],S=n[7],y=n[11],T=n[15],A=s[0],v=s[4],b=s[8],D=s[12],P=s[1],I=s[5],O=s[9],V=s[13],R=s[2],B=s[6],G=s[10],N=s[14],X=s[3],U=s[7],Y=s[11],tt=s[15];return r[0]=o*A+a*P+l*R+c*X,r[4]=o*v+a*I+l*B+c*U,r[8]=o*b+a*O+l*G+c*Y,r[12]=o*D+a*V+l*N+c*tt,r[1]=h*A+f*P+d*R+u*X,r[5]=h*v+f*I+d*B+u*U,r[9]=h*b+f*O+d*G+u*Y,r[13]=h*D+f*V+d*N+u*tt,r[2]=m*A+x*P+p*R+g*X,r[6]=m*v+x*I+p*B+g*U,r[10]=m*b+x*O+p*G+g*Y,r[14]=m*D+x*V+p*N+g*tt,r[3]=_*A+S*P+y*R+T*X,r[7]=_*v+S*I+y*B+T*U,r[11]=_*b+S*O+y*G+T*Y,r[15]=_*D+S*V+y*N+T*tt,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],o=t[1],a=t[5],l=t[9],c=t[13],h=t[2],f=t[6],d=t[10],u=t[14],m=t[3],x=t[7],p=t[11],g=t[15],_=l*u-c*d,S=a*u-c*f,y=a*d-l*f,T=o*u-c*h,A=o*d-l*h,v=o*f-a*h;return e*(x*_-p*S+g*y)-n*(m*_-p*T+g*A)+s*(m*S-x*T+g*v)-r*(m*y-x*A+p*v)}determinantAffine(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[1],o=t[5],a=t[9],l=t[2],c=t[6],h=t[10];return e*(o*h-a*c)-n*(r*h-a*l)+s*(r*c-o*l)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],f=t[9],d=t[10],u=t[11],m=t[12],x=t[13],p=t[14],g=t[15],_=e*a-n*o,S=e*l-s*o,y=e*c-r*o,T=n*l-s*a,A=n*c-r*a,v=s*c-r*l,b=h*x-f*m,D=h*p-d*m,P=h*g-u*m,I=f*p-d*x,O=f*g-u*x,V=d*g-u*p,R=_*V-S*O+y*I+T*P-A*D+v*b;if(R===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let B=1/R;return t[0]=(a*V-l*O+c*I)*B,t[1]=(s*O-n*V-r*I)*B,t[2]=(x*v-p*A+g*T)*B,t[3]=(d*A-f*v-u*T)*B,t[4]=(l*P-o*V-c*D)*B,t[5]=(e*V-s*P+r*D)*B,t[6]=(p*y-m*v-g*S)*B,t[7]=(h*v-d*y+u*S)*B,t[8]=(o*O-a*P+c*b)*B,t[9]=(n*P-e*O-r*b)*B,t[10]=(m*A-x*y+g*_)*B,t[11]=(f*y-h*A-u*_)*B,t[12]=(a*D-o*I-l*b)*B,t[13]=(e*I-n*D+s*b)*B,t[14]=(x*S-m*T-p*_)*B,t[15]=(h*T-f*S+d*_)*B,this}scale(t){let e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),s=Math.sin(e),r=1-n,o=t.x,a=t.y,l=t.z,c=r*o,h=r*a;return this.set(c*o+n,c*a-s*l,c*l+s*a,0,c*a+s*l,h*a+n,h*l-s*o,0,c*l-s*a,h*l+s*o,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,o){return this.set(1,n,r,0,t,1,o,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){let s=this.elements,r=e._x,o=e._y,a=e._z,l=e._w,c=r+r,h=o+o,f=a+a,d=r*c,u=r*h,m=r*f,x=o*h,p=o*f,g=a*f,_=l*c,S=l*h,y=l*f,T=n.x,A=n.y,v=n.z;return s[0]=(1-(x+g))*T,s[1]=(u+y)*T,s[2]=(m-S)*T,s[3]=0,s[4]=(u-y)*A,s[5]=(1-(d+g))*A,s[6]=(p+_)*A,s[7]=0,s[8]=(m+S)*v,s[9]=(p-_)*v,s[10]=(1-(d+x))*v,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){let s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let o=Ss.set(s[0],s[1],s[2]).length(),a=Ss.set(s[4],s[5],s[6]).length(),l=Ss.set(s[8],s[9],s[10]).length();r<0&&(o=-o),kn.copy(this);let c=1/o,h=1/a,f=1/l;return kn.elements[0]*=c,kn.elements[1]*=c,kn.elements[2]*=c,kn.elements[4]*=h,kn.elements[5]*=h,kn.elements[6]*=h,kn.elements[8]*=f,kn.elements[9]*=f,kn.elements[10]*=f,e.setFromRotationMatrix(kn),n.x=o,n.y=a,n.z=l,this}makePerspective(t,e,n,s,r,o,a=Nn,l=!1){let c=this.elements,h=2*r/(e-t),f=2*r/(n-s),d=(e+t)/(e-t),u=(n+s)/(n-s),m,x;if(l)m=r/(o-r),x=o*r/(o-r);else if(a===Nn)m=-(o+r)/(o-r),x=-2*o*r/(o-r);else if(a===wr)m=-o/(o-r),x=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=f,c[9]=u,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=x,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,s,r,o,a=Nn,l=!1){let c=this.elements,h=2/(e-t),f=2/(n-s),d=-(e+t)/(e-t),u=-(n+s)/(n-s),m,x;if(l)m=1/(o-r),x=o/(o-r);else if(a===Nn)m=-2/(o-r),x=-(o+r)/(o-r);else if(a===wr)m=-1/(o-r),x=-r/(o-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=f,c[9]=0,c[13]=u,c[2]=0,c[6]=0,c[10]=m,c[14]=x,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}};Za.prototype.isMatrix4=!0;var fe=Za,Ss=new k,kn=new fe,Yp=new k(0,0,0),Zp=new k(1,1,1),Ii=new k,Po=new k,An=new k,xu=new fe,vu=new ti,ei=class i{constructor(t=0,e=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let s=t.elements,r=s[0],o=s[4],a=s[8],l=s[1],c=s[5],h=s[9],f=s[2],d=s[6],u=s[10];switch(e){case"XYZ":this._y=Math.asin(we(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,u),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-we(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,u),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-f,r),this._z=0);break;case"ZXY":this._x=Math.asin(we(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-f,u),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-we(f,-1,1)),Math.abs(f)<.9999999?(this._x=Math.atan2(d,u),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(we(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-f,r)):(this._x=0,this._y=Math.atan2(a,u));break;case"XZY":this._z=Math.asin(-we(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,u),this._y=0);break;default:ae("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return xu.makeRotationFromQuaternion(t),this.setFromRotationMatrix(xu,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return vu.setFromEuler(this),this.setFromQuaternion(vu,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};ei.DEFAULT_ORDER="XYZ";var Bs=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},Jp=0,yu=new k,bs=new ti,fi=new fe,Lo=new k,fr=new k,$p=new k,Kp=new ti,Mu=new k(1,0,0),Su=new k(0,1,0),bu=new k(0,0,1),wu={type:"added"},Qp={type:"removed"},ws={type:"childadded",child:null},lc={type:"childremoved",child:null},Rn=class i extends jn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Jp++}),this.uuid=Qs(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let t=new k,e=new ei,n=new ti,s=new k(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new fe},normalMatrix:{value:new he}}),this.matrix=new fe,this.matrixWorld=new fe,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Bs,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale),this.pivot!==null&&this.position.copy(this.pivot).applyMatrix4(this.matrix).sub(this.pivot)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return bs.setFromAxisAngle(t,e),this.quaternion.multiply(bs),this}rotateOnWorldAxis(t,e){return bs.setFromAxisAngle(t,e),this.quaternion.premultiply(bs),this}rotateX(t){return this.rotateOnAxis(Mu,t)}rotateY(t){return this.rotateOnAxis(Su,t)}rotateZ(t){return this.rotateOnAxis(bu,t)}translateOnAxis(t,e){return yu.copy(t).applyQuaternion(this.quaternion),this.position.add(yu.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Mu,t)}translateY(t){return this.translateOnAxis(Su,t)}translateZ(t){return this.translateOnAxis(bu,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(fi.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?Lo.copy(t):Lo.set(t,e,n);let s=this.parent;this.updateWorldMatrix(!0,!1),fr.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?fi.lookAt(fr,Lo,this.up):fi.lookAt(Lo,fr,this.up),this.quaternion.setFromRotationMatrix(fi),s&&(fi.extractRotation(s.matrixWorld),bs.setFromRotationMatrix(fi),this.quaternion.premultiply(bs.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(ce("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(wu),ws.child=t,this.dispatchEvent(ws),ws.child=null):ce("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(Qp),lc.child=t,this.dispatchEvent(lc),lc.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),fi.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),fi.multiply(t.parent.matrixWorld)),t.applyMatrix4(fi),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(wu),ws.child=t,this.dispatchEvent(ws),ws.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){let o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(fr,t,$p),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(fr,Kp,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}intersectsFrustum(){return!0}traverse(t){t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let e=t.x,n=t.y,s=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*s,r[13]+=n-r[1]*e-r[5]*n-r[9]*s,r[14]+=s-r[2]*e-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){let s=this.parent;if(t===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){let r=this.children;for(let o=0,a=r.length;o<a;o++)r[o].updateWorldMatrix(!1,!0,n)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,s.name=this.name,s.castShadow=this.castShadow,s.receiveShadow=this.receiveShadow,s.visible=this.visible,s.frustumCulled=this.frustumCulled,s.renderOrder=this.renderOrder,s.static=this.static,s.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(a=>({...a})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let f=l[c];r(t.shapes,f)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(t.materials,this.material[l]));s.material=a}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];s.animations.push(r(t.animations,l))}}if(e){let a=o(t.geometries),l=o(t.materials),c=o(t.textures),h=o(t.images),f=o(t.shapes),d=o(t.skeletons),u=o(t.animations),m=o(t.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),f.length>0&&(n.shapes=f),d.length>0&&(n.skeletons=d),u.length>0&&(n.animations=u),m.length>0&&(n.nodes=m)}return n.object=s,n;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let s=t.children[n];this.add(s.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}};Rn.DEFAULT_UP=new k(0,1,0);Rn.DEFAULT_MATRIX_AUTO_UPDATE=!0;Rn.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Qn=class extends Rn{constructor(){super(),this.isGroup=!0,this.type="Group"}},jp={type:"move"},zs=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Qn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Qn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new k,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new k),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Qn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new k,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new k,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){o=!0;for(let x of t.hand.values()){let p=e.getJointPose(x,n),g=this._getHandJoint(c,x);p!==null&&(g.matrix.fromArray(p.transform.matrix),g.matrix.decompose(g.position,g.quaternion,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=p.radius),g.visible=p!==null}let h=c.joints["index-finger-tip"],f=c.joints["thumb-tip"],d=h.position.distanceTo(f.position),u=.02,m=.005;c.inputState.pinching&&d>u+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&d<=u-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.quaternion,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));a!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.quaternion,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(jp)))}return a!==null&&(a.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new Qn;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},Lf={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Pi={h:0,s:0,l:0},No={h:0,s:0,l:0};function cc(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}var Re=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=En){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,Te.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=Te.workingColorSpace){return this.r=t,this.g=e,this.b=n,Te.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=Te.workingColorSpace){if(t=Gp(t,1),e=we(e,0,1),n=we(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=cc(o,r,t+1/3),this.g=cc(o,r,t),this.b=cc(o,r,t-1/3)}return Te.colorSpaceToWorking(this,s),this}setStyle(t,e=En){function n(r){r!==void 0&&parseFloat(r)<1&&ae("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseFloat(r[1]))/100,Math.min(100,parseFloat(r[2]))/100,Math.min(100,parseFloat(r[3]))/100,e);break;case"hsl":case"hsla":if(r=/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:ae("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);ae("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=En){let n=Lf[t.toLowerCase()];return n!==void 0?this.setHex(n,e):ae("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=xi(t.r),this.g=xi(t.g),this.b=xi(t.b),this}copyLinearToSRGB(t){return this.r=Ds(t.r),this.g=Ds(t.g),this.b=Ds(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=En){return Te.workingToColorSpace(cn.copy(this),t),Math.round(we(cn.r*255,0,255))*65536+Math.round(we(cn.g*255,0,255))*256+Math.round(we(cn.b*255,0,255))}getHexString(t=En){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=Te.workingColorSpace){Te.workingToColorSpace(cn.copy(this),e);let n=cn.r,s=cn.g,r=cn.b,o=Math.max(n,s,r),a=Math.min(n,s,r),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let f=o-a;switch(c=h<=.5?f/(o+a):f/(2-o-a),o){case n:l=(s-r)/f+(s<r?6:0);break;case s:l=(r-n)/f+2;break;case r:l=(n-s)/f+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=Te.workingColorSpace){return Te.workingToColorSpace(cn.copy(this),e),t.r=cn.r,t.g=cn.g,t.b=cn.b,t}getStyle(t=En){Te.workingToColorSpace(cn.copy(this),t);let e=cn.r,n=cn.g,s=cn.b;return t!==En?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(Pi),this.setHSL(Pi.h+t,Pi.s+e,Pi.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(Pi),t.getHSL(No);let n=ic(Pi.h,No.h,e),s=ic(Pi.s,No.s,e),r=ic(Pi.l,No.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},cn=new Re;Re.NAMES=Lf;var Er=class extends Rn{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new ei,this.environmentIntensity=1,this.environmentRotation=new ei,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),this.background=t.background!==null?t.background.clone():null,this.environment=t.environment!==null?t.environment.clone():null,this.fog=t.fog!==null?t.fog.clone():null,this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),this.overrideMaterial=t.overrideMaterial!==null?t.overrideMaterial.clone():null,this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),e.object.backgroundBlurriness=this.backgroundBlurriness,e.object.backgroundIntensity=this.backgroundIntensity,e.object.backgroundRotation=this.backgroundRotation.toArray(),e.object.environmentIntensity=this.environmentIntensity,e.object.environmentRotation=this.environmentRotation.toArray(),e}},Gn=new k,di=new k,hc=new k,pi=new k,As=new k,Ts=new k,Au=new k,uc=new k,fc=new k,dc=new k,pc=new We,mc=new We,gc=new We,_i=class i{constructor(t=new k,e=new k,n=new k){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),Gn.subVectors(t,e),s.cross(Gn);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){Gn.subVectors(s,e),di.subVectors(n,e),hc.subVectors(t,e);let o=Gn.dot(Gn),a=Gn.dot(di),l=Gn.dot(hc),c=di.dot(di),h=di.dot(hc),f=o*c-a*a;if(f===0)return r.set(0,0,0),null;let d=1/f,u=(c*l-a*h)*d,m=(o*h-a*l)*d;return r.set(1-u-m,m,u)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,pi)===null?!1:pi.x>=0&&pi.y>=0&&pi.x+pi.y<=1}static getInterpolation(t,e,n,s,r,o,a,l){return this.getBarycoord(t,e,n,s,pi)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,pi.x),l.addScaledVector(o,pi.y),l.addScaledVector(a,pi.z),l)}static getInterpolatedAttribute(t,e,n,s,r,o){return pc.setScalar(0),mc.setScalar(0),gc.setScalar(0),pc.fromBufferAttribute(t,e),mc.fromBufferAttribute(t,n),gc.fromBufferAttribute(t,s),o.setScalar(0),o.addScaledVector(pc,r.x),o.addScaledVector(mc,r.y),o.addScaledVector(gc,r.z),o}static isFrontFacing(t,e,n,s){return Gn.subVectors(n,e),di.subVectors(t,e),Gn.cross(di).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Gn.subVectors(this.c,this.b),di.subVectors(this.a,this.b),Gn.cross(di).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return i.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return i.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return i.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return i.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return i.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,s=this.b,r=this.c,o,a;As.subVectors(s,n),Ts.subVectors(r,n),uc.subVectors(t,n);let l=As.dot(uc),c=Ts.dot(uc);if(l<=0&&c<=0)return e.copy(n);fc.subVectors(t,s);let h=As.dot(fc),f=Ts.dot(fc);if(h>=0&&f<=h)return e.copy(s);let d=l*f-h*c;if(d<=0&&l>=0&&h<=0&&l-h>0)return o=l/(l-h),e.copy(n).addScaledVector(As,o);dc.subVectors(t,r);let u=As.dot(dc),m=Ts.dot(dc);if(m>=0&&u<=m)return e.copy(r);let x=u*c-l*m;if(x<=0&&c>=0&&m<=0)return a=c/(c-m),e.copy(n).addScaledVector(Ts,a);let p=h*m-u*f;if(p<=0&&f-h>=0&&u-m>=0)return Au.subVectors(r,s),a=(f-h)/(f-h+(u-m)),e.copy(s).addScaledVector(Au,a);let g=1/(p+x+d);return o=x*g,a=d*g,e.copy(n).addScaledVector(As,o).addScaledVector(Ts,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Fi=class{constructor(t=new k(1/0,1/0,1/0),e=new k(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(Vn.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(Vn.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=Vn.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0&&t.isBatchedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,Vn):Vn.fromBufferAttribute(r,o),Vn.applyMatrix4(t.matrixWorld),this.expandByPoint(Vn);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Do.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Do.copy(n.boundingBox)),Do.applyMatrix4(t.matrixWorld),this.union(Do)}let s=t.children;for(let r=0,o=s.length;r<o;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,Vn),Vn.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(dr),Fo.subVectors(this.max,dr),Es.subVectors(t.a,dr),Rs.subVectors(t.b,dr),Cs.subVectors(t.c,dr),Li.subVectors(Rs,Es),Ni.subVectors(Cs,Rs),Ji.subVectors(Es,Cs);let e=[0,-Li.z,Li.y,0,-Ni.z,Ni.y,0,-Ji.z,Ji.y,Li.z,0,-Li.x,Ni.z,0,-Ni.x,Ji.z,0,-Ji.x,-Li.y,Li.x,0,-Ni.y,Ni.x,0,-Ji.y,Ji.x,0];return!_c(e,Es,Rs,Cs,Fo)||(e=[1,0,0,0,1,0,0,0,1],!_c(e,Es,Rs,Cs,Fo))?!1:(Uo.crossVectors(Li,Ni),e=[Uo.x,Uo.y,Uo.z],_c(e,Es,Rs,Cs,Fo))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,Vn).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(Vn).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(mi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),mi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),mi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),mi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),mi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),mi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),mi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),mi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(mi),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},mi=[new k,new k,new k,new k,new k,new k,new k,new k],Vn=new k,Do=new Fi,Es=new k,Rs=new k,Cs=new k,Li=new k,Ni=new k,Ji=new k,dr=new k,Fo=new k,Uo=new k,$i=new k;function _c(i,t,e,n,s){for(let r=0,o=i.length-3;r<=o;r+=3){$i.fromArray(i,r);let a=s.x*Math.abs($i.x)+s.y*Math.abs($i.y)+s.z*Math.abs($i.z),l=t.dot($i),c=e.dot($i),h=n.dot($i);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var Ke=new k,Oo=new Nt,tm=0,De=class extends jn{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:tm++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Tf,this.updateRanges=[],this.gpuType=Xn,this.version=0,this._normalizationScale=t!==void 0?uh(t):void 0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this._normalizationScale=t._normalizationScale,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Oo.fromBufferAttribute(this,e),Oo.applyMatrix3(t),this.setXY(e,Oo.x,Oo.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)Ke.fromBufferAttribute(this,e),Ke.applyMatrix3(t),this.setXYZ(e,Ke.x,Ke.y,Ke.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)Ke.fromBufferAttribute(this,e),Ke.applyMatrix4(t),this.setXYZ(e,Ke.x,Ke.y,Ke.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)Ke.fromBufferAttribute(this,e),Ke.applyNormalMatrix(t),this.setXYZ(e,Ke.x,Ke.y,Ke.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)Ke.fromBufferAttribute(this,e),Ke.transformDirection(t),this.setXYZ(e,Ke.x,Ke.y,Ke.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=this._denormalize(n)),n}setComponent(t,e,n){return this.normalized&&(n=this._normalize(n)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=this._denormalize(e)),e}setX(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=this._denormalize(e)),e}setY(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=this._denormalize(e)),e}setZ(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=this._denormalize(e)),e}setW(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=this._normalize(e),n=this._normalize(n)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=this._normalize(e),n=this._normalize(n),s=this._normalize(s)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=this._normalize(e),n=this._normalize(n),s=this._normalize(s),r=this._normalize(r)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return t.name=this.name,t.usage=this.usage,t.gpuType=this.gpuType,t}dispose(){this.dispatchEvent({type:"dispose"})}_denormalize(t){let e=this._normalizationScale;return e!==void 0?Math.max(t/e,-1):Vp(t,this.array)}_normalize(t){let e=this._normalizationScale;return e!==void 0?Math.round(t*e):Hp(t,this.array)}};var Rr=class extends De{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var Cr=class extends De{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var Ee=class extends De{constructor(t,e,n){super(new Float32Array(t),e,n)}},em=new Fi,pr=new k,xc=new k,ts=class{constructor(t=new k,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):em.setFromPoints(t).getCenter(n);let s=0;for(let r=0,o=t.length;r<o;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;pr.subVectors(t,this.center);let e=pr.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector(pr,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(xc.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(pr.copy(t.center).add(xc)),this.expandByPoint(pr.copy(t.center).sub(xc))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},nm=0,Ln=new fe,vc=new Rn,Is=new k,Tn=new Fi,mr=new Fi,sn=new k,ze=class i extends jn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:nm++}),this.uuid=Qs(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(zp(t)?Cr:Rr)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new he().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Ln.makeRotationFromQuaternion(t),this.applyMatrix4(Ln),this}rotateX(t){return Ln.makeRotationX(t),this.applyMatrix4(Ln),this}rotateY(t){return Ln.makeRotationY(t),this.applyMatrix4(Ln),this}rotateZ(t){return Ln.makeRotationZ(t),this.applyMatrix4(Ln),this}translate(t,e,n){return Ln.makeTranslation(t,e,n),this.applyMatrix4(Ln),this}scale(t,e,n){return Ln.makeScale(t,e,n),this.applyMatrix4(Ln),this}lookAt(t){return vc.lookAt(t),vc.updateMatrix(),this.applyMatrix4(vc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Is).negate(),this.translate(Is.x,Is.y,Is.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let s=0,r=t.length;s<r;s++){let o=t[s];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new Ee(n,3))}else{let n=Math.min(t.length,e.count);for(let s=0;s<n;s++){let r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&ae("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Fi);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){ce("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new k(-1/0,-1/0,-1/0),new k(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){let r=e[n];Tn.setFromBufferAttribute(r),this.morphTargetsRelative?(sn.addVectors(this.boundingBox.min,Tn.min),this.boundingBox.expandByPoint(sn),sn.addVectors(this.boundingBox.max,Tn.max),this.boundingBox.expandByPoint(sn)):(this.boundingBox.expandByPoint(Tn.min),this.boundingBox.expandByPoint(Tn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&ce('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ts);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){ce("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new k,1/0);return}if(t){let n=this.boundingSphere.center;if(Tn.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){let a=e[r];mr.setFromBufferAttribute(a),this.morphTargetsRelative?(sn.addVectors(Tn.min,mr.min),Tn.expandByPoint(sn),sn.addVectors(Tn.max,mr.max),Tn.expandByPoint(sn)):(Tn.expandByPoint(mr.min),Tn.expandByPoint(mr.max))}Tn.getCenter(n);let s=0;for(let r=0,o=t.count;r<o;r++)sn.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(sn));if(e)for(let r=0,o=e.length;r<o;r++){let a=e[r],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)sn.fromBufferAttribute(a,c),l&&(Is.fromBufferAttribute(t,c),sn.add(Is)),s=Math.max(s,n.distanceToSquared(sn))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&ce('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){ce("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,s=e.normal,r=e.uv,o=this.getAttribute("tangent");(o===void 0||o.count!==n.count)&&(o=new De(new Float32Array(4*n.count),4),this.setAttribute("tangent",o));let a=[],l=[],c=new Uint8Array(n.count);for(let D=0;D<n.count;D++)a[D]=new k,l[D]=new k;let h=new k,f=new k,d=new k,u=new Nt,m=new Nt,x=new Nt,p=new k,g=new k;function _(D,P,I){c[D]=c[P]=c[I]=1,h.fromBufferAttribute(n,D),f.fromBufferAttribute(n,P),d.fromBufferAttribute(n,I),u.fromBufferAttribute(r,D),m.fromBufferAttribute(r,P),x.fromBufferAttribute(r,I),f.sub(h),d.sub(h),m.sub(u),x.sub(u);let O=1/(m.x*x.y-x.x*m.y);isFinite(O)&&(p.copy(f).multiplyScalar(x.y).addScaledVector(d,-m.y).multiplyScalar(O),g.copy(d).multiplyScalar(m.x).addScaledVector(f,-x.x).multiplyScalar(O),a[D].add(p),a[P].add(p),a[I].add(p),l[D].add(g),l[P].add(g),l[I].add(g))}let S=this.groups;S.length===0&&(S=[{start:0,count:t.count}]);for(let D=0,P=S.length;D<P;++D){let I=S[D],O=I.start,V=I.count;for(let R=O,B=O+V;R<B;R+=3)_(t.getX(R+0),t.getX(R+1),t.getX(R+2))}let y=new k,T=new k,A=new k,v=new k;function b(D){A.fromBufferAttribute(s,D),v.copy(A);let P=a[D];y.copy(P),y.sub(A.multiplyScalar(A.dot(P))).normalize(),T.crossVectors(v,P);let O=T.dot(l[D])<0?-1:1;o.setXYZW(D,y.x,y.y,y.z,O)}for(let D=0,P=n.count;D<P;++D)c[D]&&b(D);this._transformed=!0}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new De(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let d=0,u=n.count;d<u;d++)n.setXYZ(d,0,0,0);let s=new k,r=new k,o=new k,a=new k,l=new k,c=new k,h=new k,f=new k;if(t)for(let d=0,u=t.count;d<u;d+=3){let m=t.getX(d+0),x=t.getX(d+1),p=t.getX(d+2);s.fromBufferAttribute(e,m),r.fromBufferAttribute(e,x),o.fromBufferAttribute(e,p),h.subVectors(o,r),f.subVectors(s,r),h.cross(f),a.fromBufferAttribute(n,m),l.fromBufferAttribute(n,x),c.fromBufferAttribute(n,p),a.add(h),l.add(h),c.add(h),n.setXYZ(m,a.x,a.y,a.z),n.setXYZ(x,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let d=0,u=e.count;d<u;d+=3)s.fromBufferAttribute(e,d+0),r.fromBufferAttribute(e,d+1),o.fromBufferAttribute(e,d+2),h.subVectors(o,r),f.subVectors(s,r),h.cross(f),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)sn.fromBufferAttribute(t,e),sn.normalize(),t.setXYZ(e,sn.x,sn.y,sn.z)}toNonIndexed(){function t(a,l){let c=a.array,h=a.itemSize,f=a.normalized,d=new c.constructor(l.length*h),u=0,m=0;for(let x=0,p=l.length;x<p;x++){a.isInterleavedBufferAttribute?u=l[x]*a.data.stride+a.offset:u=l[x]*h;for(let g=0;g<h;g++)d[m++]=c[u++]}return new De(d,h,f)}if(this.index===null)return ae("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new i,n=this.index.array,s=this.attributes;for(let a in s){let l=s[a],c=t(l,n);e.setAttribute(a,c)}let r=this.morphAttributes;for(let a in r){let l=[],c=r[a];for(let h=0,f=c.length;h<f;h++){let d=c[h],u=t(d,n);l.push(u)}e.morphAttributes[a]=l}e.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,t.name=this.name,Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let c=n[l];t.data.attributes[l]=c.toJSON(t.data)}let s={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let f=0,d=c.length;f<d;f++){let u=c[f];h.push(u.toJSON(t.data))}h.length>0&&(s[l]=h,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(t.data.boundingSphere=a.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let s=t.attributes;for(let c in s){let h=s[c];this.setAttribute(c,h.clone(e))}let r=t.morphAttributes;for(let c in r){let h=[],f=r[c];for(let d=0,u=f.length;d<u;d++)h.push(f[d].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;let o=t.groups;for(let c=0,h=o.length;c<h;c++){let f=o[c];this.addGroup(f.start,f.count,f.materialIndex)}let a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var yc=new k,im=new k,sm=new he,Hn=class{constructor(t=new k(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let s=yc.subVectors(n,e).cross(im.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){let s=t.delta(yc),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let o=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(o<0||o>1)?null:e.copy(t.start).addScaledVector(s,o)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||sm.getNormalMatrix(t),s=this.coplanarPoint(yc).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(t){return this.normal.fromArray(t.normal),this.constant=t.constant,this}},rm=0,Ui=class extends jn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:rm++}),this.uuid=Qs(),this.name="",this.type="Material",this.blending=Zs,this.side=ii,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Gc,this.blendDst=Vc,this.blendEquation=os,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Re(0,0,0),this.blendAlpha=0,this.depthFunc=Fs,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=yf,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ra,this.stencilZFail=ra,this.stencilZPass=ra,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){ae(`Material: parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){ae(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.diffuseRoughness!==void 0&&(n.diffuseRoughness=this.diffuseRoughness),this.diffuseRoughnessMap&&this.diffuseRoughnessMap.isTexture&&(n.diffuseRoughnessMap=this.diffuseRoughnessMap.toJSON(t).uuid),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessMinimum!==void 0&&(n.iridescenceThicknessMinimum=this.iridescenceThicknessMinimum),this.iridescenceThicknessMaximum!==void 0&&(n.iridescenceThicknessMaximum=this.iridescenceThicknessMaximum),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(r=>r.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let o=[];for(let a in r){let l=r[a];delete l.metadata,o.push(l)}return o}if(e){let r=s(t.textures),o=s(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new Re().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.diffuseRoughness!==void 0&&(this.diffuseRoughness=t.diffuseRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.retroreflectivity!==void 0&&(this.retroreflectivity=t.retroreflectivity),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessMinimum!==void 0&&(this.iridescenceThicknessMinimum=t.iridescenceThicknessMinimum),t.iridescenceThicknessMaximum!==void 0&&(this.iridescenceThicknessMaximum=t.iridescenceThicknessMaximum),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessMinimum=t.iridescenceThicknessRange[0],this.iridescenceThicknessMaximum=t.iridescenceThicknessRange[1]),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.clippingPlanes!==void 0&&(this.clippingPlanes=t.clippingPlanes.map(n=>new Hn().fromJSON(n))),t.clipIntersection!==void 0&&(this.clipIntersection=t.clipIntersection),t.clipShadows!==void 0&&(this.clipShadows=t.clipShadows),t.depthPacking!==void 0&&(this.depthPacking=t.depthPacking),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.linecap!==void 0&&(this.linecap=t.linecap),t.linejoin!==void 0&&(this.linejoin=t.linejoin),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new Nt().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Nt().fromArray(t.clearcoatNormalScale)),t.diffuseRoughnessMap!==void 0&&(this.diffuseRoughnessMap=e[t.diffuseRoughnessMap]||null),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}};var gi=new k,Mc=new k,Bo=new k,zo=new k,ks=class{constructor(t=new k,e=new k(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,gi)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=gi.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(gi.copy(this.origin).addScaledVector(this.direction,e),gi.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){Mc.copy(t).add(e).multiplyScalar(.5),Bo.copy(e).sub(t).normalize(),zo.copy(this.origin).sub(Mc);let r=t.distanceTo(e)*.5,o=-this.direction.dot(Bo),a=zo.dot(this.direction),l=-zo.dot(Bo),c=zo.lengthSq(),h=Math.abs(1-o*o),f,d,u,m;if(h>0)if(f=o*l-a,d=o*a-l,m=r*h,f>=0)if(d>=-m)if(d<=m){let x=1/h;f*=x,d*=x,u=f*(f+o*d+2*a)+d*(o*f+d+2*l)+c}else d=r,f=Math.max(0,-(o*d+a)),u=-f*f+d*(d+2*l)+c;else d=-r,f=Math.max(0,-(o*d+a)),u=-f*f+d*(d+2*l)+c;else d<=-m?(f=Math.max(0,-(-o*r+a)),d=f>0?-r:Math.min(Math.max(-r,-l),r),u=-f*f+d*(d+2*l)+c):d<=m?(f=0,d=Math.min(Math.max(-r,-l),r),u=d*(d+2*l)+c):(f=Math.max(0,-(o*r+a)),d=f>0?r:Math.min(Math.max(-r,-l),r),u=-f*f+d*(d+2*l)+c);else d=o>0?-r:r,f=Math.max(0,-(o*d+a)),u=-f*f+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,f),s&&s.copy(Mc).addScaledVector(Bo,d),u}intersectSphere(t,e){if(t.radius<0)return null;gi.subVectors(t.center,this.origin);let n=gi.dot(this.direction),s=gi.dot(gi)-n*n,r=t.radius*t.radius;if(s>r)return null;let o=Math.sqrt(r-s),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,e):this.at(a,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,o,a,l,c=1/this.direction.x,h=1/this.direction.y,f=1/this.direction.z,d=this.origin;return c>=0?(n=(t.min.x-d.x)*c,s=(t.max.x-d.x)*c):(n=(t.max.x-d.x)*c,s=(t.min.x-d.x)*c),h>=0?(r=(t.min.y-d.y)*h,o=(t.max.y-d.y)*h):(r=(t.max.y-d.y)*h,o=(t.min.y-d.y)*h),n>o||r>s||((r>n||isNaN(n))&&(n=r),(o<s||isNaN(s))&&(s=o),f>=0?(a=(t.min.z-d.z)*f,l=(t.max.z-d.z)*f):(a=(t.max.z-d.z)*f,l=(t.min.z-d.z)*f),n>l||a>s)||((a>n||n!==n)&&(n=a),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,gi)!==null}intersectTriangle(t,e,n,s,r){let o=this.origin,a=this.direction,l=a.x,c=a.y,h=a.z,f=t.x-o.x,d=t.y-o.y,u=t.z-o.z,m=e.x-o.x,x=e.y-o.y,p=e.z-o.z,g=n.x-o.x,_=n.y-o.y,S=n.z-o.z,y=Math.abs(l),T=Math.abs(c),A=Math.abs(h),v,b,D,P,I,O,V,R,B,G,N,X;if(y>=T&&y>=A?(D=l,O=f,B=m,X=g,l>=0?(v=c,b=h,P=d,I=u,V=x,R=p,G=_,N=S):(v=h,b=c,P=u,I=d,V=p,R=x,G=S,N=_)):T>=A?(D=c,O=d,B=x,X=_,c>=0?(v=h,b=l,P=u,I=f,V=p,R=m,G=S,N=g):(v=l,b=h,P=f,I=u,V=m,R=p,G=g,N=S)):(D=h,O=u,B=p,X=S,h>=0?(v=l,b=c,P=f,I=d,V=m,R=x,G=g,N=_):(v=c,b=l,P=d,I=f,V=x,R=m,G=_,N=g)),D===0)return null;let U=v/D,Y=b/D,tt=1/D,vt=P-U*O,Ft=I-Y*O,$=V-U*B,lt=R-Y*B,yt=G-U*X,kt=N-Y*X,et=yt*lt-kt*$,Zt=vt*kt-Ft*yt,Xt=$*Ft-lt*vt;if(s){if(et<0||Zt<0||Xt<0)return null}else if((et<0||Zt<0||Xt<0)&&(et>0||Zt>0||Xt>0))return null;let at=et+Zt+Xt;if(at===0)return null;let jt=tt*(et*O+Zt*B+Xt*X);return(at>0?jt<0:jt>0)?null:this.at(jt/at,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Ma=class extends Ui{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Re(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ei,this.combine=Hc,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},Tu=new fe,Ki=new ks,ko=new ts,Eu=new k,Go=new k,Vo=new k,Ho=new k,Sc=new k,Wo=new k,Ru=new k,Xo=new k,Mn=class extends Rn{constructor(t=new ze,e=new Ma){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0?this.morphTargetInfluences=t.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,t.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){let a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(s,t);let a=this.morphTargetInfluences;if(r&&a){Wo.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=a[l],f=r[l];h!==0&&(Sc.fromBufferAttribute(f,t),o?Wo.addScaledVector(Sc,h):Wo.addScaledVector(Sc.sub(e),h))}e.add(Wo)}return e}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),ko.copy(n.boundingSphere),ko.applyMatrix4(r),Ki.copy(t.ray).recast(t.near),!(ko.containsPoint(Ki.origin)===!1&&(Ki.intersectSphere(ko,Eu)===null||Ki.origin.distanceToSquared(Eu)>(t.far-t.near)**2))&&(Tu.copy(r).invert(),Ki.copy(t.ray).applyMatrix4(Tu),!(n.boundingBox!==null&&Ki.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Ki)))}_computeIntersections(t,e,n){let s,r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,f=r.attributes.normal,d=r.groups,u=r.drawRange;if(a!==null)if(Array.isArray(o))for(let m=0,x=d.length;m<x;m++){let p=d[m],g=o[p.materialIndex],_=Math.max(p.start,u.start),S=Math.min(a.count,Math.min(p.start+p.count,u.start+u.count));for(let y=_,T=S;y<T;y+=3){let A=a.getX(y),v=a.getX(y+1),b=a.getX(y+2);s=qo(this,g,t,n,c,h,f,A,v,b),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=p.materialIndex,e.push(s))}}else{let m=Math.max(0,u.start),x=Math.min(a.count,u.start+u.count);for(let p=m,g=x;p<g;p+=3){let _=a.getX(p),S=a.getX(p+1),y=a.getX(p+2);s=qo(this,o,t,n,c,h,f,_,S,y),s&&(s.faceIndex=Math.floor(p/3),e.push(s))}}else if(l!==void 0)if(Array.isArray(o))for(let m=0,x=d.length;m<x;m++){let p=d[m],g=o[p.materialIndex],_=Math.max(p.start,u.start),S=Math.min(l.count,Math.min(p.start+p.count,u.start+u.count));for(let y=_,T=S;y<T;y+=3){let A=y,v=y+1,b=y+2;s=qo(this,g,t,n,c,h,f,A,v,b),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=p.materialIndex,e.push(s))}}else{let m=Math.max(0,u.start),x=Math.min(l.count,u.start+u.count);for(let p=m,g=x;p<g;p+=3){let _=p,S=p+1,y=p+2;s=qo(this,o,t,n,c,h,f,_,S,y),s&&(s.faceIndex=Math.floor(p/3),e.push(s))}}}};function om(i,t,e,n,s,r,o,a){let l;if(t.side===gn?l=n.intersectTriangle(o,r,s,!0,a):l=n.intersectTriangle(s,r,o,t.side===ii,a),l===null)return null;Xo.copy(a),Xo.applyMatrix4(i.matrixWorld);let c=e.ray.origin.distanceTo(Xo);return c<e.near||c>e.far?null:{distance:c,point:Xo.clone(),object:i}}function qo(i,t,e,n,s,r,o,a,l,c){i.getVertexPosition(a,Go),i.getVertexPosition(l,Vo),i.getVertexPosition(c,Ho);let h=om(i,t,e,n,Go,Vo,Ho,Ru);if(h){let f=new k;_i.getBarycoord(Ru,Go,Vo,Ho,f),s&&(h.uv=_i.getInterpolatedAttribute(s,a,l,c,f,new Nt)),r&&(h.uv1=_i.getInterpolatedAttribute(r,a,l,c,f,new Nt)),o&&(h.normal=_i.getInterpolatedAttribute(o,a,l,c,f,new k),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let d={a,b:l,c,normal:new k,materialIndex:0};_i.getNormal(Go,Vo,Ho,d.normal),h.face=d,h.barycoord=f}return h}var Sa=class extends yn{constructor(t=null,e=1,n=1,s,r,o,a,l,c=rn,h=rn,f,d){super(null,o,a,l,c,h,s,r,f,d),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var Qi=new ts,am=new Nt(.5,.5),Yo=new k,es=class{constructor(t=new Hn,e=new Hn,n=new Hn,s=new Hn,r=new Hn,o=new Hn){this.planes=[t,e,n,s,r,o]}set(t,e,n,s,r,o){let a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=Nn,n=!1){let s=this.planes,r=t.elements,o=r[0],a=r[1],l=r[2],c=r[3],h=r[4],f=r[5],d=r[6],u=r[7],m=r[8],x=r[9],p=r[10],g=r[11],_=r[12],S=r[13],y=r[14],T=r[15];if(s[0].setComponents(c-o,u-h,g-m,T-_).normalize(),s[1].setComponents(c+o,u+h,g+m,T+_).normalize(),s[2].setComponents(c+a,u+f,g+x,T+S).normalize(),s[3].setComponents(c-a,u-f,g-x,T-S).normalize(),n)s[4].setComponents(l,d,p,y).normalize(),s[5].setComponents(c-l,u-d,g-p,T-y).normalize();else if(s[4].setComponents(c-l,u-d,g-p,T-y).normalize(),e===Nn)s[5].setComponents(c+l,u+d,g+p,T+y).normalize();else if(e===wr)s[5].setComponents(l,d,p,y).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),Qi.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),Qi.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(Qi)}intersectsSprite(t){Qi.center.set(0,0,0);let e=am.distanceTo(t.center);return Qi.radius=.7071067811865476+e,Qi.applyMatrix4(t.matrixWorld),this.intersectsSphere(Qi)}intersectsSphere(t){let e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let s=e[n];if(Yo.x=s.normal.x>0?t.max.x:t.min.x,Yo.y=s.normal.y>0?t.max.y:t.min.y,Yo.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(Yo)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},Cu=new fe,ba=class i{constructor(){this.coordinateSystem=Nn,this._frustums=[],this._count=0}setFromArrayCamera(t){let e=t.cameras,n=this._frustums;for(let s=0;s<e.length;s++){let r=e[s];Cu.multiplyMatrices(r.projectionMatrix,r.matrixWorldInverse),n[s]===void 0&&(n[s]=new es),n[s].setFromProjectionMatrix(Cu,r.coordinateSystem,r.reversedDepth)}return this._count=e.length,this}getFrustum(t){return this._frustums[t]}intersectsObject(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsObject(t))return!0;return!1}intersectsSprite(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsSprite(t))return!0;return!1}intersectsSphere(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsSphere(t))return!0;return!1}intersectsBox(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsBox(t))return!0;return!1}containsPoint(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].containsPoint(t))return!0;return!1}copy(t){this.coordinateSystem=t.coordinateSystem;let e=this._frustums,n=t._frustums;for(let s=0;s<t._count;s++)e[s]===void 0&&(e[s]=new es),e[s].copy(n[s]);return this._count=t._count,this}clone(){return new i().copy(this)}};var wa=class extends Ui{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Re(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}},Aa=new k,Ta=new k,Iu=new fe,gr=new ks,Zo=new ts,bc=new k,Pu=new k,Ea=class extends Rn{constructor(t=new ze,e=new wa){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0?this.morphTargetInfluences=t.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,t.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[0];for(let s=1,r=e.count;s<r;s++)Aa.fromBufferAttribute(e,s-1),Ta.fromBufferAttribute(e,s),n[s]=n[s-1],n[s]+=Aa.distanceTo(Ta);t.setAttribute("lineDistance",new Ee(n,1))}else ae("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){let n=this.geometry,s=this.matrixWorld,r=t.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Zo.copy(n.boundingSphere),Zo.applyMatrix4(s),Zo.radius+=r,t.ray.intersectsSphere(Zo)===!1)return;Iu.copy(s).invert(),gr.copy(t.ray).applyMatrix4(Iu);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=a*a,c=this.isLineSegments?2:1,h=n.index,d=n.attributes.position;if(h!==null){let u=Math.max(0,o.start),m=Math.min(h.count,o.start+o.count);for(let x=u,p=m-1;x<p;x+=c){let g=h.getX(x),_=h.getX(x+1),S=Jo(this,t,gr,l,g,_,x);S&&e.push(S)}if(this.isLineLoop){let x=h.getX(m-1),p=h.getX(u),g=Jo(this,t,gr,l,x,p,m-1);g&&e.push(g)}}else{let u=Math.max(0,o.start),m=Math.min(d.count,o.start+o.count);for(let x=u,p=m-1;x<p;x+=c){let g=Jo(this,t,gr,l,x,x+1,x);g&&e.push(g)}if(this.isLineLoop){let x=Jo(this,t,gr,l,m-1,u,m-1);x&&e.push(x)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){let a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function Jo(i,t,e,n,s,r,o){let a=i.geometry.attributes.position;if(Aa.fromBufferAttribute(a,s),Ta.fromBufferAttribute(a,r),e.distanceSqToSegment(Aa,Ta,bc,Pu)>n)return;bc.applyMatrix4(i.matrixWorld);let c=t.ray.origin.distanceTo(bc);if(!(c<t.near||c>t.far))return{distance:c,point:Pu.clone().applyMatrix4(i.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:i}}var Lu=new k,Nu=new k,Ir=class extends Ea{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[];for(let s=0,r=e.count;s<r;s+=2)Lu.fromBufferAttribute(e,s),Nu.fromBufferAttribute(e,s+1),n[s]=s===0?0:n[s-1],n[s+1]=n[s]+Lu.distanceTo(Nu);t.setAttribute("lineDistance",new Ee(n,1))}else ae("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var Pr=class extends yn{constructor(t=[],e=as,n,s,r,o,a,l,c,h){super(t,e,n,s,r,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}};var yi=class extends yn{constructor(t,e,n=Wn,s,r,o,a=rn,l=rn,c,h=vi,f=1){if(h!==vi&&h!==Si)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let d={width:t,height:e,depth:f};super(d,s,r,o,a,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Os(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return e.compareFunction=this.compareFunction,e}},Lr=class extends yi{constructor(t,e=Wn,n=as,s,r,o=rn,a=rn,l,c=vi){let h={width:t,height:t,depth:1},f=[h,h,h,h,h,h];super(t,t,e,n,s,r,o,a,l,c),this.image=f,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}},Nr=class extends yn{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}},ni=class i extends ze{constructor(t=1,e=1,n=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:o};let a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);let l=[],c=[],h=[],f=[],d=0,u=0;m("z","y","x",-1,-1,n,e,t,o,r,0),m("z","y","x",1,-1,n,e,-t,o,r,1),m("x","z","y",1,1,t,n,e,s,o,2),m("x","z","y",1,-1,t,n,-e,s,o,3),m("x","y","z",1,-1,t,e,n,s,r,4),m("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new Ee(c,3)),this.setAttribute("normal",new Ee(h,3)),this.setAttribute("uv",new Ee(f,2));function m(x,p,g,_,S,y,T,A,v,b,D){let P=y/v,I=T/b,O=y/2,V=T/2,R=A/2,B=v+1,G=b+1,N=0,X=0,U=new k;for(let Y=0;Y<G;Y++){let tt=Y*I-V;for(let vt=0;vt<B;vt++){let Ft=vt*P-O;U[x]=Ft*_,U[p]=tt*S,U[g]=R,c.push(U.x,U.y,U.z),U[x]=0,U[p]=0,U[g]=A>0?1:-1,h.push(U.x,U.y,U.z),f.push(vt/v),f.push(1-Y/b),N+=1}}for(let Y=0;Y<b;Y++)for(let tt=0;tt<v;tt++){let vt=d+tt+B*Y,Ft=d+tt+B*(Y+1),$=d+(tt+1)+B*(Y+1),lt=d+(tt+1)+B*Y;l.push(vt,Ft,lt),l.push(Ft,$,lt),X+=6}a.addGroup(u,X,D),u+=X,d+=N}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},Dr=class i extends ze{constructor(t=1,e=1,n=4,s=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:t,height:e,capSegments:n,radialSegments:s,heightSegments:r},e=Math.max(0,e),n=Math.max(1,Math.floor(n)),s=Math.max(3,Math.floor(s)),r=Math.max(1,Math.floor(r));let o=[],a=[],l=[],c=[],h=e/2,f=Math.PI/2*t,d=e,u=2*f+d,m=n*2+r,x=s+1,p=new k,g=new k;for(let _=0;_<=m;_++){let S=0,y=0,T=0,A=0;if(_<=n){let D=_/n,P=D*Math.PI/2;y=-h-t*Math.cos(P),T=t*Math.sin(P),A=-t*Math.cos(P),S=D*f}else if(_<=n+r){let D=(_-n)/r;y=-h+D*e,T=t,A=0,S=f+D*d}else{let D=(_-n-r)/n,P=D*Math.PI/2;y=h+t*Math.sin(P),T=t*Math.cos(P),A=t*Math.sin(P),S=f+d+D*f}let v=Math.max(0,Math.min(1,S/u)),b=0;_===0?b=.5/s:_===m&&(b=-.5/s);for(let D=0;D<=s;D++){let P=D/s,I=P*Math.PI*2,O=Math.sin(I),V=Math.cos(I);g.x=-T*V,g.y=y,g.z=T*O,a.push(g.x,g.y,g.z),p.set(-T*V,A,T*O),p.normalize(),l.push(p.x,p.y,p.z),c.push(P+b,v)}if(_>0){let D=(_-1)*x;for(let P=0;P<s;P++){let I=D+P,O=D+P+1,V=_*x+P,R=_*x+P+1;o.push(I,O,V),o.push(O,R,V)}}}this.setIndex(o),this.setAttribute("position",new Ee(a,3)),this.setAttribute("normal",new Ee(l,3)),this.setAttribute("uv",new Ee(c,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}};var Gs=class i extends ze{constructor(t=1,e=1,n=1,s=32,r=1,o=!1,a=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:s,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:l};let c=this;s=Math.floor(s),r=Math.floor(r);let h=[],f=[],d=[],u=[],m=0,x=[],p=n/2,g=0;_(),o===!1&&(t>0&&S(!0),e>0&&S(!1)),this.setIndex(h),this.setAttribute("position",new Ee(f,3)),this.setAttribute("normal",new Ee(d,3)),this.setAttribute("uv",new Ee(u,2));function _(){let y=new k,T=new k,A=0,v=(e-t)/n;for(let b=0;b<=r;b++){let D=[],P=b/r,I=P*(e-t)+t;for(let O=0;O<=s;O++){let V=O/s,R=V*l+a,B=Math.sin(R),G=Math.cos(R);T.x=I*B,T.y=-P*n+p,T.z=I*G,f.push(T.x,T.y,T.z),y.set(B,v,G).normalize(),d.push(y.x,y.y,y.z),u.push(V,1-P),D.push(m++)}x.push(D)}for(let b=0;b<s;b++)for(let D=0;D<r;D++){let P=x[D][b],I=x[D+1][b],O=x[D+1][b+1],V=x[D][b+1];(t>0||D!==0)&&(h.push(P,I,V),A+=3),(e>0||D!==r-1)&&(h.push(I,O,V),A+=3)}c.addGroup(g,A,0),g+=A}function S(y){let T=m,A=new Nt,v=new k,b=0,D=y===!0?t:e,P=y===!0?1:-1;for(let O=1;O<=s;O++)f.push(0,p*P,0),d.push(0,P,0),u.push(.5,.5),m++;let I=m;for(let O=0;O<=s;O++){let R=O/s*l+a,B=Math.cos(R),G=Math.sin(R);v.x=D*G,v.y=p*P,v.z=D*B,f.push(v.x,v.y,v.z),d.push(0,P,0),A.x=B*.5+.5,A.y=G*.5*P+.5,u.push(A.x,A.y),m++}for(let O=0;O<s;O++){let V=T+O,R=I+O;y===!0?h.push(R,R+1,V):h.push(R+1,R,V),b+=3}c.addGroup(g,b,y===!0?1:2),g+=b}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}};var $o=new k,Ko=new k,wc=new k,Qo=new _i,Fr=class extends ze{constructor(t=null,e=1){if(super(),this.type="EdgesGeometry",this.parameters={geometry:t,thresholdAngle:e},t!==null){let s=Math.pow(10,4),r=Math.cos(oa*e),o=t.getIndex(),a=t.getAttribute("position"),l=o?o.count:a.count,c=[0,0,0],h=["a","b","c"],f=new Array(3),d=new Map,u=[];for(let m=0;m<l;m+=3){o?(c[0]=o.getX(m),c[1]=o.getX(m+1),c[2]=o.getX(m+2)):(c[0]=m,c[1]=m+1,c[2]=m+2);let{a:x,b:p,c:g}=Qo;if(x.fromBufferAttribute(a,c[0]),p.fromBufferAttribute(a,c[1]),g.fromBufferAttribute(a,c[2]),Qo.getNormal(wc),f[0]=`${Math.round(x.x*s)},${Math.round(x.y*s)},${Math.round(x.z*s)}`,f[1]=`${Math.round(p.x*s)},${Math.round(p.y*s)},${Math.round(p.z*s)}`,f[2]=`${Math.round(g.x*s)},${Math.round(g.y*s)},${Math.round(g.z*s)}`,!(f[0]===f[1]||f[1]===f[2]||f[2]===f[0]))for(let _=0;_<3;_++){let S=(_+1)%3,y=f[_],T=f[S],A=Qo[h[_]],v=Qo[h[S]],b=`${y}_${T}`,D=`${T}_${y}`,P=d.get(D);P?(wc.dot(P.normal)<=r&&(u.push(A.x,A.y,A.z),u.push(v.x,v.y,v.z)),d.set(D,null)):d.has(b)||d.set(b,{index0:c[_],index1:c[S],normal:wc.clone()})}}for(let m of d.values())if(m){let{index0:x,index1:p}=m;$o.fromBufferAttribute(a,x),Ko.fromBufferAttribute(a,p),u.push($o.x,$o.y,$o.z),u.push(Ko.x,Ko.y,Ko.z)}this.setAttribute("position",new Ee(u,3))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}},Cn=class{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){ae("Curve: .getPoint() not implemented.")}getPointAt(t,e){let n=this.getUtoTmapping(t);return this.getPoint(n,e)}getPoints(t=5){let e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return e}getSpacedPoints(t=5){let e=[];for(let n=0;n<=t;n++)e.push(this.getPointAt(n/t));return e}getLength(){let t=this.getLengths();return t[t.length-1]}getLengths(t=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===t+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let e=[],n,s=this.getPoint(0),r=0;e.push(0);for(let o=1;o<=t;o++)n=this.getPoint(o/t),r+=n.distanceTo(s),e.push(r),s=n;return this.cacheArcLengths=e,e}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(t,e=null){let n=this.getLengths(),s=0,r=n.length,o;e?o=e:o=t*n[r-1];let a=0,l=r-1,c;for(;a<=l;)if(s=Math.floor(a+(l-a)/2),c=n[s]-o,c<0)a=s+1;else if(c>0)l=s-1;else{l=s;break}if(s=l,n[s]===o)return s/(r-1);let h=n[s],d=n[s+1]-h,u=(o-h)/d;return(s+u)/(r-1)}getTangent(t,e){let s=t-1e-4,r=t+1e-4;s<0&&(s=0),r>1&&(r=1);let o=this.getPoint(s),a=this.getPoint(r),l=e||(o.isVector2?new Nt:new k);return l.copy(a).sub(o).normalize(),l}getTangentAt(t,e){let n=this.getUtoTmapping(t);return this.getTangent(n,e)}computeFrenetFrames(t,e=!1){let n=new k,s=[],r=[],o=[],a=new k,l=new fe;for(let u=0;u<=t;u++){let m=u/t;s[u]=this.getTangentAt(m,new k)}r[0]=new k,o[0]=new k;let c=Number.MAX_VALUE,h=Math.abs(s[0].x),f=Math.abs(s[0].y),d=Math.abs(s[0].z);h<=c&&(c=h,n.set(1,0,0)),f<=c&&(c=f,n.set(0,1,0)),d<=c&&n.set(0,0,1),a.crossVectors(s[0],n).normalize(),r[0].crossVectors(s[0],a),o[0].crossVectors(s[0],r[0]);for(let u=1;u<=t;u++){if(r[u]=r[u-1].clone(),o[u]=o[u-1].clone(),a.crossVectors(s[u-1],s[u]),a.length()>Number.EPSILON){a.normalize();let m=Math.acos(we(s[u-1].dot(s[u]),-1,1));r[u].applyMatrix4(l.makeRotationAxis(a,m))}o[u].crossVectors(s[u],r[u])}if(e===!0){let u=Math.acos(we(r[0].dot(r[t]),-1,1));u/=t,s[0].dot(a.crossVectors(r[0],r[t]))>0&&(u=-u);for(let m=1;m<=t;m++)r[m].applyMatrix4(l.makeRotationAxis(s[m],u*m)),o[m].crossVectors(s[m],r[m])}return{tangents:s,normals:r,binormals:o}}clone(){return new this.constructor().copy(this)}copy(t){return this.arcLengthDivisions=t.arcLengthDivisions,this.cacheArcLengths=null,this}toJSON(){let t={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return t.arcLengthDivisions=this.arcLengthDivisions,t.type=this.type,t}fromJSON(t){return this.arcLengthDivisions=t.arcLengthDivisions,this.cacheArcLengths=null,this}},Vs=class extends Cn{constructor(t=0,e=0,n=1,s=1,r=0,o=Math.PI*2,a=!1,l=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=t,this.aY=e,this.xRadius=n,this.yRadius=s,this.aStartAngle=r,this.aEndAngle=o,this.aClockwise=a,this.aRotation=l}getPoint(t,e=new Nt){let n=e,s=Math.PI*2,r=this.aEndAngle-this.aStartAngle,o=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=s;for(;r>s;)r-=s;r<Number.EPSILON&&(o?r=0:r=s),this.aClockwise===!0&&!o&&(r===s?r=-s:r=r-s);let a=this.aStartAngle+t*r,l=this.aX+this.xRadius*Math.cos(a),c=this.aY+this.yRadius*Math.sin(a);if(this.aRotation!==0){let h=Math.cos(this.aRotation),f=Math.sin(this.aRotation),d=l-this.aX,u=c-this.aY;l=d*h-u*f+this.aX,c=d*f+u*h+this.aY}return n.set(l,c)}copy(t){return super.copy(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}toJSON(){let t=super.toJSON();return t.aX=this.aX,t.aY=this.aY,t.xRadius=this.xRadius,t.yRadius=this.yRadius,t.aStartAngle=this.aStartAngle,t.aEndAngle=this.aEndAngle,t.aClockwise=this.aClockwise,t.aRotation=this.aRotation,t}fromJSON(t){return super.fromJSON(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}},Ra=class extends Vs{constructor(t,e,n,s,r,o){super(t,e,n,n,s,r,o),this.isArcCurve=!0,this.type="ArcCurve"}};function fh(){let i=0,t=0,e=0,n=0;function s(r,o,a,l){i=r,t=a,e=-3*r+3*o-2*a-l,n=2*r-2*o+a+l}return{initCatmullRom:function(r,o,a,l,c){s(o,a,c*(a-r),c*(l-o))},initNonuniformCatmullRom:function(r,o,a,l,c,h,f){let d=(o-r)/c-(a-r)/(c+h)+(a-o)/h,u=(a-o)/h-(l-o)/(h+f)+(l-a)/f;d*=h,u*=h,s(o,a,d,u)},calc:function(r){let o=r*r,a=o*r;return i+t*r+e*o+n*a}}}var Du=new k,Fu=new k,Ac=new fh,Tc=new fh,Ec=new fh,Hs=class extends Cn{constructor(t=[],e=!1,n="centripetal",s=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=t,this.closed=e,this.curveType=n,this.tension=s}getPoint(t,e=new k){let n=e,s=this.points,r=s.length,o=(r-(this.closed?0:1))*t,a=Math.floor(o),l=o-a;this.closed?a+=a>0?0:(Math.floor(Math.abs(a)/r)+1)*r:l===0&&a===r-1&&(a=r-2,l=1);let c,h;this.closed||a>0?c=s[(a-1)%r]:(Fu.subVectors(s[0],s[1]).add(s[0]),c=Fu);let f=s[a%r],d=s[(a+1)%r];if(this.closed||a+2<r?h=s[(a+2)%r]:(Du.subVectors(s[r-1],s[r-2]).add(s[r-1]),h=Du),this.curveType==="centripetal"||this.curveType==="chordal"){let u=this.curveType==="chordal"?.5:.25,m=Math.pow(c.distanceToSquared(f),u),x=Math.pow(f.distanceToSquared(d),u),p=Math.pow(d.distanceToSquared(h),u);x<1e-4&&(x=1),m<1e-4&&(m=x),p<1e-4&&(p=x),Ac.initNonuniformCatmullRom(c.x,f.x,d.x,h.x,m,x,p),Tc.initNonuniformCatmullRom(c.y,f.y,d.y,h.y,m,x,p),Ec.initNonuniformCatmullRom(c.z,f.z,d.z,h.z,m,x,p)}else this.curveType==="catmullrom"&&(Ac.initCatmullRom(c.x,f.x,d.x,h.x,this.tension),Tc.initCatmullRom(c.y,f.y,d.y,h.y,this.tension),Ec.initCatmullRom(c.z,f.z,d.z,h.z,this.tension));return n.set(Ac.calc(l),Tc.calc(l),Ec.calc(l)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(s.clone())}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}toJSON(){let t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){let s=this.points[e];t.points.push(s.toArray())}return t.closed=this.closed,t.curveType=this.curveType,t.tension=this.tension,t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(new k().fromArray(s))}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}};function Uu(i,t,e,n,s){let r=(n-t)*.5,o=(s-e)*.5,a=i*i,l=i*a;return(2*e-2*n+r+o)*l+(-3*e+3*n-2*r-o)*a+r*i+e}function lm(i,t){let e=1-i;return e*e*t}function cm(i,t){return 2*(1-i)*i*t}function hm(i,t){return i*i*t}function vr(i,t,e,n){return lm(i,t)+cm(i,e)+hm(i,n)}function um(i,t){let e=1-i;return e*e*e*t}function fm(i,t){let e=1-i;return 3*e*e*i*t}function dm(i,t){return 3*(1-i)*i*i*t}function pm(i,t){return i*i*i*t}function yr(i,t,e,n,s){return um(i,t)+fm(i,e)+dm(i,n)+pm(i,s)}var Ur=class extends Cn{constructor(t=new Nt,e=new Nt,n=new Nt,s=new Nt){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=t,this.v1=e,this.v2=n,this.v3=s}getPoint(t,e=new Nt){let n=e,s=this.v0,r=this.v1,o=this.v2,a=this.v3;return n.set(yr(t,s.x,r.x,o.x,a.x),yr(t,s.y,r.y,o.y,a.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}},Ca=class extends Cn{constructor(t=new k,e=new k,n=new k,s=new k){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=t,this.v1=e,this.v2=n,this.v3=s}getPoint(t,e=new k){let n=e,s=this.v0,r=this.v1,o=this.v2,a=this.v3;return n.set(yr(t,s.x,r.x,o.x,a.x),yr(t,s.y,r.y,o.y,a.y),yr(t,s.z,r.z,o.z,a.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}},Or=class extends Cn{constructor(t=new Nt,e=new Nt){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=t,this.v2=e}getPoint(t,e=new Nt){let n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new Nt){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},Ia=class extends Cn{constructor(t=new k,e=new k){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=t,this.v2=e}getPoint(t,e=new k){let n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new k){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},Br=class extends Cn{constructor(t=new Nt,e=new Nt,n=new Nt){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new Nt){let n=e,s=this.v0,r=this.v1,o=this.v2;return n.set(vr(t,s.x,r.x,o.x),vr(t,s.y,r.y,o.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},zr=class extends Cn{constructor(t=new k,e=new k,n=new k){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new k){let n=e,s=this.v0,r=this.v1,o=this.v2;return n.set(vr(t,s.x,r.x,o.x),vr(t,s.y,r.y,o.y),vr(t,s.z,r.z,o.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},kr=class extends Cn{constructor(t=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=t}getPoint(t,e=new Nt){let n=e,s=this.points,r=(s.length-1)*t,o=Math.floor(r),a=r-o,l=s[o===0?o:o-1],c=s[o],h=s[o>s.length-2?s.length-1:o+1],f=s[o>s.length-3?s.length-1:o+2];return n.set(Uu(a,l.x,c.x,h.x,f.x),Uu(a,l.y,c.y,h.y,f.y)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(s.clone())}return this}toJSON(){let t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){let s=this.points[e];t.points.push(s.toArray())}return t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(new Nt().fromArray(s))}return this}},Pa=Object.freeze({__proto__:null,ArcCurve:Ra,CatmullRomCurve3:Hs,CubicBezierCurve:Ur,CubicBezierCurve3:Ca,EllipseCurve:Vs,LineCurve:Or,LineCurve3:Ia,QuadraticBezierCurve:Br,QuadraticBezierCurve3:zr,SplineCurve:kr}),La=class extends Cn{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1,this.cacheLengths=null}add(t){this.curves.push(t)}closePath(){let t=this.curves[0].getPoint(0),e=this.curves[this.curves.length-1].getPoint(1);if(!t.equals(e)){let n=t.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Pa[n](e,t))}return this}getPoint(t,e){let n=t*this.getLength(),s=this.getCurveLengths(),r=0;for(;r<s.length;){if(s[r]>=n){let o=s[r]-n,a=this.curves[r],l=a.getLength(),c=l===0?0:1-o/l;return a.getPointAt(c,e)}r++}return null}getLength(){let t=this.getCurveLengths();return t[t.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let t=[],e=0;for(let n=0,s=this.curves.length;n<s;n++)e+=this.curves[n].getLength(),t.push(e);return this.cacheLengths=t,t}getSpacedPoints(t=40){let e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return this.autoClose&&e.push(e[0]),e}getPoints(t=12){let e=[],n;for(let s=0,r=this.curves;s<r.length;s++){let o=r[s],a=o.isEllipseCurve?t*2:o.isLineCurve||o.isLineCurve3?1:o.isSplineCurve?t*o.points.length:t,l=o.getPoints(a);for(let c=0;c<l.length;c++){let h=l[c];n&&n.equals(h)||(e.push(h),n=h)}}return this.autoClose&&e.length>1&&!e[e.length-1].equals(e[0])&&e.push(e[0]),e}copy(t){super.copy(t),this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){let s=t.curves[e];this.curves.push(s.clone())}return this.autoClose=t.autoClose,this.cacheLengths=null,this}toJSON(){let t=super.toJSON();t.autoClose=this.autoClose,t.curves=[];for(let e=0,n=this.curves.length;e<n;e++){let s=this.curves[e];t.curves.push(s.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.autoClose=t.autoClose,this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){let s=t.curves[e];this.curves.push(new Pa[s.type]().fromJSON(s))}return this.cacheLengths=null,this}},Gr=class extends La{constructor(t){super(),this.type="Path",this.currentPoint=new Nt,t&&this.setFromPoints(t)}setFromPoints(t){this.moveTo(t[0].x,t[0].y);for(let e=1,n=t.length;e<n;e++)this.lineTo(t[e].x,t[e].y);return this}moveTo(t,e){return this.currentPoint.set(t,e),this}lineTo(t,e){let n=new Or(this.currentPoint.clone(),new Nt(t,e));return this.curves.push(n),this.currentPoint.set(t,e),this}quadraticCurveTo(t,e,n,s){let r=new Br(this.currentPoint.clone(),new Nt(t,e),new Nt(n,s));return this.curves.push(r),this.currentPoint.set(n,s),this}bezierCurveTo(t,e,n,s,r,o){let a=new Ur(this.currentPoint.clone(),new Nt(t,e),new Nt(n,s),new Nt(r,o));return this.curves.push(a),this.currentPoint.set(r,o),this}splineThru(t){let e=[this.currentPoint.clone()].concat(t),n=new kr(e);return this.curves.push(n),this.currentPoint.copy(t[t.length-1]),this}arc(t,e,n,s,r,o){let a=this.currentPoint.x,l=this.currentPoint.y;return this.absarc(t+a,e+l,n,s,r,o),this}absarc(t,e,n,s,r,o){return this.absellipse(t,e,n,n,s,r,o),this}ellipse(t,e,n,s,r,o,a,l){let c=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(t+c,e+h,n,s,r,o,a,l),this}absellipse(t,e,n,s,r,o,a,l){let c=new Vs(t,e,n,s,r,o,a,l);if(this.curves.length>0){let f=c.getPoint(0);f.equals(this.currentPoint)||this.lineTo(f.x,f.y)}this.curves.push(c);let h=c.getPoint(1);return this.currentPoint.copy(h),this}copy(t){return super.copy(t),this.currentPoint.copy(t.currentPoint),this}toJSON(){let t=super.toJSON();return t.currentPoint=this.currentPoint.toArray(),t}fromJSON(t){return super.fromJSON(t),this.currentPoint.fromArray(t.currentPoint),this}},Ws=class extends Gr{constructor(t){super(t),this.uuid=Qs(),this.type="Shape",this.holes=[]}getPointsHoles(t){let e=[];for(let n=0,s=this.holes.length;n<s;n++)e[n]=this.holes[n].getPoints(t);return e}extractPoints(t){return{shape:this.getPoints(t),holes:this.getPointsHoles(t)}}copy(t){super.copy(t),this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){let s=t.holes[e];this.holes.push(s.clone())}return this}toJSON(){let t=super.toJSON();t.uuid=this.uuid,t.holes=[];for(let e=0,n=this.holes.length;e<n;e++){let s=this.holes[e];t.holes.push(s.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.uuid=t.uuid,this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){let s=t.holes[e];this.holes.push(new Gr().fromJSON(s))}return this}};function mm(i,t,e=2){let n=t&&t.length,s=n?t[0]*e:i.length,r=Nf(i,0,s,e,!0),o=[];if(!r||r.next===r.prev)return o;let a,l,c;if(n&&(r=ym(i,t,r,e)),i.length>80*e){a=i[0],l=i[1];let h=a,f=l;for(let d=e;d<s;d+=e){let u=i[d],m=i[d+1];u<a&&(a=u),m<l&&(l=m),u>h&&(h=u),m>f&&(f=m)}c=Math.max(h-a,f-l),c=c!==0?32767/c:0}return Vr(r,o,e,a,l,c,0),o}function Nf(i,t,e,n,s){let r;if(s===Pm(i,t,e,n)>0)for(let o=t;o<e;o+=n)r=Ou(o/n|0,i[o],i[o+1],r);else for(let o=e-n;o>=t;o-=n)r=Ou(o/n|0,i[o],i[o+1],r);return r&&Xs(r,r.next)&&(Wr(r),r=r.next),r}function ns(i,t){if(!i)return i;t||(t=i);let e=i,n;do if(n=!1,!e.steiner&&(Xs(e,e.next)||He(e.prev,e,e.next)===0)){if(Wr(e),e=t=e.prev,e===e.next)break;n=!0}else e=e.next;while(n||e!==t);return t}function Vr(i,t,e,n,s,r,o){if(!i)return;!o&&r&&Am(i,n,s,r);let a=i;for(;i.prev!==i.next;){let l=i.prev,c=i.next;if(r?_m(i,n,s,r):gm(i)){t.push(l.i,i.i,c.i),Wr(i),i=c.next,a=c.next;continue}if(i=c,i===a){o?o===1?(i=xm(ns(i),t),Vr(i,t,e,n,s,r,2)):o===2&&vm(i,t,e,n,s,r):Vr(ns(i),t,e,n,s,r,1);break}}}function gm(i){let t=i.prev,e=i,n=i.next;if(He(t,e,n)>=0)return!1;let s=t.x,r=e.x,o=n.x,a=t.y,l=e.y,c=n.y,h=Math.min(s,r,o),f=Math.min(a,l,c),d=Math.max(s,r,o),u=Math.max(a,l,c),m=n.next;for(;m!==t;){if(m.x>=h&&m.x<=d&&m.y>=f&&m.y<=u&&_r(s,a,r,l,o,c,m.x,m.y)&&He(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function _m(i,t,e,n){let s=i.prev,r=i,o=i.next;if(He(s,r,o)>=0)return!1;let a=s.x,l=r.x,c=o.x,h=s.y,f=r.y,d=o.y,u=Math.min(a,l,c),m=Math.min(h,f,d),x=Math.max(a,l,c),p=Math.max(h,f,d),g=Lc(u,m,t,e,n),_=Lc(x,p,t,e,n),S=i.prevZ,y=i.nextZ;for(;S&&S.z>=g&&y&&y.z<=_;){if(S.x>=u&&S.x<=x&&S.y>=m&&S.y<=p&&S!==s&&S!==o&&_r(a,h,l,f,c,d,S.x,S.y)&&He(S.prev,S,S.next)>=0||(S=S.prevZ,y.x>=u&&y.x<=x&&y.y>=m&&y.y<=p&&y!==s&&y!==o&&_r(a,h,l,f,c,d,y.x,y.y)&&He(y.prev,y,y.next)>=0))return!1;y=y.nextZ}for(;S&&S.z>=g;){if(S.x>=u&&S.x<=x&&S.y>=m&&S.y<=p&&S!==s&&S!==o&&_r(a,h,l,f,c,d,S.x,S.y)&&He(S.prev,S,S.next)>=0)return!1;S=S.prevZ}for(;y&&y.z<=_;){if(y.x>=u&&y.x<=x&&y.y>=m&&y.y<=p&&y!==s&&y!==o&&_r(a,h,l,f,c,d,y.x,y.y)&&He(y.prev,y,y.next)>=0)return!1;y=y.nextZ}return!0}function xm(i,t){let e=i;do{let n=e.prev,s=e.next.next;!Xs(n,s)&&Ff(n,e,e.next,s)&&Hr(n,s)&&Hr(s,n)&&(t.push(n.i,e.i,s.i),Wr(e),Wr(e.next),e=i=s),e=e.next}while(e!==i);return ns(e)}function vm(i,t,e,n,s,r){let o=i;do{let a=o.next.next;for(;a!==o.prev;){if(o.i!==a.i&&Rm(o,a)){let l=Uf(o,a);o=ns(o,o.next),l=ns(l,l.next),Vr(o,t,e,n,s,r,0),Vr(l,t,e,n,s,r,0);return}a=a.next}o=o.next}while(o!==i)}function ym(i,t,e,n){let s=[];for(let r=0,o=t.length;r<o;r++){let a=t[r]*n,l=r<o-1?t[r+1]*n:i.length,c=Nf(i,a,l,n,!1);c===c.next&&(c.steiner=!0),s.push(Em(c))}s.sort(Mm);for(let r=0;r<s.length;r++)e=Sm(s[r],e);return e}function Mm(i,t){let e=i.x-t.x;if(e===0&&(e=i.y-t.y,e===0)){let n=(i.next.y-i.y)/(i.next.x-i.x),s=(t.next.y-t.y)/(t.next.x-t.x);e=n-s}return e}function Sm(i,t){let e=bm(i,t);if(!e)return t;let n=Uf(e,i);return ns(n,n.next),ns(e,e.next)}function bm(i,t){let e=t,n=i.x,s=i.y,r=-1/0,o;if(Xs(i,e))return e;do{if(Xs(i,e.next))return e.next;if(s<=e.y&&s>=e.next.y&&e.next.y!==e.y){let f=e.x+(s-e.y)*(e.next.x-e.x)/(e.next.y-e.y);if(f<=n&&f>r&&(r=f,o=e.x<e.next.x?e:e.next,f===n))return o}e=e.next}while(e!==t);if(!o)return null;let a=o,l=o.x,c=o.y,h=1/0;e=o;do{if(n>=e.x&&e.x>=l&&n!==e.x&&Df(s<c?n:r,s,l,c,s<c?r:n,s,e.x,e.y)){let f=Math.abs(s-e.y)/(n-e.x);Hr(e,i)&&(f<h||f===h&&(e.x>o.x||e.x===o.x&&wm(o,e)))&&(o=e,h=f)}e=e.next}while(e!==a);return o}function wm(i,t){return He(i.prev,i,t.prev)<0&&He(t.next,i,i.next)<0}function Am(i,t,e,n){let s=i;do s.z===0&&(s.z=Lc(s.x,s.y,t,e,n)),s.prevZ=s.prev,s.nextZ=s.next,s=s.next;while(s!==i);s.prevZ.nextZ=null,s.prevZ=null,Tm(s)}function Tm(i){let t,e=1;do{let n=i,s;i=null;let r=null;for(t=0;n;){t++;let o=n,a=0;for(let c=0;c<e&&(a++,o=o.nextZ,!!o);c++);let l=e;for(;a>0||l>0&&o;)a!==0&&(l===0||!o||n.z<=o.z)?(s=n,n=n.nextZ,a--):(s=o,o=o.nextZ,l--),r?r.nextZ=s:i=s,s.prevZ=r,r=s;n=o}r.nextZ=null,e*=2}while(t>1);return i}function Lc(i,t,e,n,s){return i=(i-e)*s|0,t=(t-n)*s|0,i=(i|i<<8)&16711935,i=(i|i<<4)&252645135,i=(i|i<<2)&858993459,i=(i|i<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,i|t<<1}function Em(i){let t=i,e=i;do(t.x<e.x||t.x===e.x&&t.y<e.y)&&(e=t),t=t.next;while(t!==i);return e}function Df(i,t,e,n,s,r,o,a){return(s-o)*(t-a)>=(i-o)*(r-a)&&(i-o)*(n-a)>=(e-o)*(t-a)&&(e-o)*(r-a)>=(s-o)*(n-a)}function _r(i,t,e,n,s,r,o,a){return!(i===o&&t===a)&&Df(i,t,e,n,s,r,o,a)}function Rm(i,t){return i.next.i!==t.i&&i.prev.i!==t.i&&!Cm(i,t)&&(Hr(i,t)&&Hr(t,i)&&Im(i,t)&&(He(i.prev,i,t.prev)||He(i,t.prev,t))||Xs(i,t)&&He(i.prev,i,i.next)>0&&He(t.prev,t,t.next)>0)}function He(i,t,e){return(t.y-i.y)*(e.x-t.x)-(t.x-i.x)*(e.y-t.y)}function Xs(i,t){return i.x===t.x&&i.y===t.y}function Ff(i,t,e,n){let s=ta(He(i,t,e)),r=ta(He(i,t,n)),o=ta(He(e,n,i)),a=ta(He(e,n,t));return!!(s!==r&&o!==a||s===0&&jo(i,e,t)||r===0&&jo(i,n,t)||o===0&&jo(e,i,n)||a===0&&jo(e,t,n))}function jo(i,t,e){return t.x<=Math.max(i.x,e.x)&&t.x>=Math.min(i.x,e.x)&&t.y<=Math.max(i.y,e.y)&&t.y>=Math.min(i.y,e.y)}function ta(i){return i>0?1:i<0?-1:0}function Cm(i,t){let e=i;do{if(e.i!==i.i&&e.next.i!==i.i&&e.i!==t.i&&e.next.i!==t.i&&Ff(e,e.next,i,t))return!0;e=e.next}while(e!==i);return!1}function Hr(i,t){return He(i.prev,i,i.next)<0?He(i,t,i.next)>=0&&He(i,i.prev,t)>=0:He(i,t,i.prev)<0||He(i,i.next,t)<0}function Im(i,t){let e=i,n=!1,s=(i.x+t.x)/2,r=(i.y+t.y)/2;do e.y>r!=e.next.y>r&&e.next.y!==e.y&&s<(e.next.x-e.x)*(r-e.y)/(e.next.y-e.y)+e.x&&(n=!n),e=e.next;while(e!==i);return n}function Uf(i,t){let e=Nc(i.i,i.x,i.y),n=Nc(t.i,t.x,t.y),s=i.next,r=t.prev;return i.next=t,t.prev=i,e.next=s,s.prev=e,n.next=e,e.prev=n,r.next=n,n.prev=r,n}function Ou(i,t,e,n){let s=Nc(i,t,e);return n?(s.next=n.next,s.prev=n,n.next.prev=s,n.next=s):(s.prev=s,s.next=s),s}function Wr(i){i.next.prev=i.prev,i.prev.next=i.next,i.prevZ&&(i.prevZ.nextZ=i.nextZ),i.nextZ&&(i.nextZ.prevZ=i.prevZ)}function Nc(i,t,e){return{i,x:t,y:e,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function Pm(i,t,e,n){let s=0;for(let r=t,o=e-n;r<e;r+=n)s+=(i[o]-i[r])*(i[r+1]+i[o+1]),o=r;return s}var Dc=class{static triangulate(t,e,n=2){return mm(t,e,n)}},ji=class i{static area(t){let e=t.length,n=0;for(let s=e-1,r=0;r<e;s=r++)n+=t[s].x*t[r].y-t[r].x*t[s].y;return n*.5}static isClockWise(t){return i.area(t)<0}static triangulateShape(t,e){let n=[],s=[],r=[];Bu(t),zu(n,t);let o=t.length;e.forEach(Bu);for(let l=0;l<e.length;l++)s.push(o),o+=e[l].length,zu(n,e[l]);let a=Dc.triangulate(n,s);for(let l=0;l<a.length;l+=3)r.push(a.slice(l,l+3));return r}};function Bu(i){let t=i.length;t>2&&i[t-1].equals(i[0])&&i.pop()}function zu(i,t){for(let e=0;e<t.length;e++)i.push(t[e].x),i.push(t[e].y)}var Xr=class i extends ze{constructor(t=new Ws([new Nt(.5,.5),new Nt(-.5,.5),new Nt(-.5,-.5),new Nt(.5,-.5)]),e={}){super(),this.type="ExtrudeGeometry",this.parameters={shapes:t,options:e},t=Array.isArray(t)?t:[t];let n=this,s=[],r=[];for(let a=0,l=t.length;a<l;a++){let c=t[a];o(c)}this.setAttribute("position",new Ee(s,3)),this.setAttribute("uv",new Ee(r,2)),this.computeVertexNormals();function o(a){let l=[],c=e.curveSegments!==void 0?e.curveSegments:12,h=e.steps!==void 0?e.steps:1,f=e.depth!==void 0?e.depth:1,d=e.bevelEnabled!==void 0?e.bevelEnabled:!0,u=e.bevelThickness!==void 0?e.bevelThickness:.2,m=e.bevelSize!==void 0?e.bevelSize:u-.1,x=e.bevelOffset!==void 0?e.bevelOffset:0,p=e.bevelSegments!==void 0?e.bevelSegments:3,g=e.extrudePath,_=e.UVGenerator!==void 0?e.UVGenerator:Lm,S,y=!1,T,A,v,b;if(g){S=g.getSpacedPoints(h),y=!0,d=!1;let Q=g.isCatmullRomCurve3?g.closed:!1;T=g.computeFrenetFrames(h,Q),A=new k,v=new k,b=new k}d||(p=0,u=0,m=0,x=0);let D=a.extractPoints(c),P=D.shape,I=D.holes;if(!ji.isClockWise(P)){P=P.reverse();for(let Q=0,dt=I.length;Q<dt;Q++){let ut=I[Q];ji.isClockWise(ut)&&(I[Q]=ut.reverse())}}function V(Q){let ut=10000000000000001e-36,pt=Q[0];for(let xt=1;xt<=Q.length;xt++){let At=xt%Q.length,Tt=Q[At],$t=Tt.x-pt.x,K=Tt.y-pt.y,St=$t*$t+K*K,F=Math.max(Math.abs(Tt.x),Math.abs(Tt.y),Math.abs(pt.x),Math.abs(pt.y)),Ht=ut*F*F;if(St<=Ht){Q.splice(At,1),xt--;continue}pt=Tt}}V(P),I.forEach(V);let R=I.length,B=P;for(let Q=0;Q<R;Q++){let dt=I[Q];P=P.concat(dt)}function G(Q,dt,ut){return dt||ce("ExtrudeGeometry: vec does not exist"),Q.clone().addScaledVector(dt,ut)}let N=P.length;function X(Q,dt,ut){let pt,xt,At,Tt=Q.x-dt.x,$t=Q.y-dt.y,K=ut.x-Q.x,St=ut.y-Q.y,F=Tt*Tt+$t*$t,Ht=Tt*St-$t*K;if(Math.abs(Ht)>Number.EPSILON){let Dt=Math.sqrt(F),Bt=Math.sqrt(K*K+St*St),ft=dt.x-$t/Dt,ee=dt.y+Tt/Dt,wt=ut.x-St/Bt,Rt=ut.y+K/Bt,C=((wt-ft)*St-(Rt-ee)*K)/(Tt*St-$t*K);pt=ft+Tt*C-Q.x,xt=ee+$t*C-Q.y;let w=pt*pt+xt*xt;if(w<=2)return new Nt(pt,xt);At=Math.sqrt(w/2)}else{let Dt=!1;Tt>Number.EPSILON?K>Number.EPSILON&&(Dt=!0):Tt<-Number.EPSILON?K<-Number.EPSILON&&(Dt=!0):Math.sign($t)===Math.sign(St)&&(Dt=!0),Dt?(pt=-$t,xt=Tt,At=Math.sqrt(F)):(pt=Tt,xt=$t,At=Math.sqrt(F/2))}return new Nt(pt/At,xt/At)}let U=[];for(let Q=0,dt=B.length,ut=dt-1,pt=Q+1;Q<dt;Q++,ut++,pt++)ut===dt&&(ut=0),pt===dt&&(pt=0),U[Q]=X(B[Q],B[ut],B[pt]);let Y=[],tt,vt=U.concat();for(let Q=0,dt=R;Q<dt;Q++){let ut=I[Q];tt=[];for(let pt=0,xt=ut.length,At=xt-1,Tt=pt+1;pt<xt;pt++,At++,Tt++)At===xt&&(At=0),Tt===xt&&(Tt=0),tt[pt]=X(ut[pt],ut[At],ut[Tt]);Y.push(tt),vt=vt.concat(tt)}let Ft;if(p===0)Ft=ji.triangulateShape(B,I);else{let Q=[],dt=[];for(let ut=0;ut<p;ut++){let pt=ut/p,xt=u*Math.cos(pt*Math.PI/2),At=m*Math.sin(pt*Math.PI/2)+x;for(let Tt=0,$t=B.length;Tt<$t;Tt++){let K=G(B[Tt],U[Tt],At);Zt(K.x,K.y,-xt),pt===0&&Q.push(K)}for(let Tt=0,$t=R;Tt<$t;Tt++){let K=I[Tt];tt=Y[Tt];let St=[];for(let F=0,Ht=K.length;F<Ht;F++){let Dt=G(K[F],tt[F],At);Zt(Dt.x,Dt.y,-xt),pt===0&&St.push(Dt)}pt===0&&dt.push(St)}}Ft=ji.triangulateShape(Q,dt)}let $=Ft.length,lt=m+x;for(let Q=0;Q<N;Q++){let dt=d?G(P[Q],vt[Q],lt):P[Q];y?(v.copy(T.normals[0]).multiplyScalar(dt.x),A.copy(T.binormals[0]).multiplyScalar(dt.y),b.copy(S[0]).add(v).add(A),Zt(b.x,b.y,b.z)):Zt(dt.x,dt.y,0)}for(let Q=1;Q<=h;Q++)for(let dt=0;dt<N;dt++){let ut=d?G(P[dt],vt[dt],lt):P[dt];y?(v.copy(T.normals[Q]).multiplyScalar(ut.x),A.copy(T.binormals[Q]).multiplyScalar(ut.y),b.copy(S[Q]).add(v).add(A),Zt(b.x,b.y,b.z)):Zt(ut.x,ut.y,f/h*Q)}for(let Q=p-1;Q>=0;Q--){let dt=Q/p,ut=u*Math.cos(dt*Math.PI/2),pt=m*Math.sin(dt*Math.PI/2)+x;for(let xt=0,At=B.length;xt<At;xt++){let Tt=G(B[xt],U[xt],pt);Zt(Tt.x,Tt.y,f+ut)}for(let xt=0,At=I.length;xt<At;xt++){let Tt=I[xt];tt=Y[xt];for(let $t=0,K=Tt.length;$t<K;$t++){let St=G(Tt[$t],tt[$t],pt);y?Zt(St.x,St.y+S[h-1].y,S[h-1].x+ut):Zt(St.x,St.y,f+ut)}}}yt(),kt();function yt(){let Q=s.length/3;if(d){let dt=0,ut=N*dt;for(let pt=0;pt<$;pt++){let xt=Ft[pt];Xt(xt[2]+ut,xt[1]+ut,xt[0]+ut)}dt=h+p*2,ut=N*dt;for(let pt=0;pt<$;pt++){let xt=Ft[pt];Xt(xt[0]+ut,xt[1]+ut,xt[2]+ut)}}else{for(let dt=0;dt<$;dt++){let ut=Ft[dt];Xt(ut[2],ut[1],ut[0])}for(let dt=0;dt<$;dt++){let ut=Ft[dt];Xt(ut[0]+N*h,ut[1]+N*h,ut[2]+N*h)}}n.addGroup(Q,s.length/3-Q,0)}function kt(){let Q=s.length/3,dt=0;et(B,dt),dt+=B.length;for(let ut=0,pt=I.length;ut<pt;ut++){let xt=I[ut];et(xt,dt),dt+=xt.length}n.addGroup(Q,s.length/3-Q,1)}function et(Q,dt){let ut=Q.length;for(;--ut>=0;){let pt=ut,xt=ut-1;xt<0&&(xt=Q.length-1);for(let At=0,Tt=h+p*2;At<Tt;At++){let $t=N*At,K=N*(At+1),St=dt+pt+$t,F=dt+xt+$t,Ht=dt+xt+K,Dt=dt+pt+K;at(St,F,Ht,Dt)}}}function Zt(Q,dt,ut){l.push(Q),l.push(dt),l.push(ut)}function Xt(Q,dt,ut){jt(Q),jt(dt),jt(ut);let pt=s.length/3,xt=_.generateTopUV(n,s,pt-3,pt-2,pt-1);mt(xt[0]),mt(xt[1]),mt(xt[2])}function at(Q,dt,ut,pt){jt(Q),jt(dt),jt(pt),jt(dt),jt(ut),jt(pt);let xt=s.length/3,At=_.generateSideWallUV(n,s,xt-6,xt-3,xt-2,xt-1);mt(At[0]),mt(At[1]),mt(At[3]),mt(At[1]),mt(At[2]),mt(At[3])}function jt(Q){s.push(l[Q*3+0]),s.push(l[Q*3+1]),s.push(l[Q*3+2])}function mt(Q){r.push(Q.x),r.push(Q.y)}}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){let t=super.toJSON(),e=this.parameters.shapes,n=this.parameters.options;return Nm(e,n,t)}static fromJSON(t,e){let n=[];for(let r=0,o=t.shapes.length;r<o;r++){let a=e[t.shapes[r]];n.push(a)}let s=t.options.extrudePath;return s!==void 0&&(t.options.extrudePath=new Pa[s.type]().fromJSON(s)),new i(n,t.options)}},Lm={generateTopUV:function(i,t,e,n,s){let r=t[e*3],o=t[e*3+1],a=t[n*3],l=t[n*3+1],c=t[s*3],h=t[s*3+1];return[new Nt(r,o),new Nt(a,l),new Nt(c,h)]},generateSideWallUV:function(i,t,e,n,s,r){let o=t[e*3],a=t[e*3+1],l=t[e*3+2],c=t[n*3],h=t[n*3+1],f=t[n*3+2],d=t[s*3],u=t[s*3+1],m=t[s*3+2],x=t[r*3],p=t[r*3+1],g=t[r*3+2];return Math.abs(a-h)<Math.abs(o-c)?[new Nt(o,1-l),new Nt(c,1-f),new Nt(d,1-m),new Nt(x,1-g)]:[new Nt(a,1-l),new Nt(h,1-f),new Nt(u,1-m),new Nt(p,1-g)]}};function Nm(i,t,e){if(e.shapes=[],Array.isArray(i))for(let n=0,s=i.length;n<s;n++){let r=i[n];e.shapes.push(r.uuid)}else e.shapes.push(i.uuid);return e.options=Object.assign({},t),t.extrudePath!==void 0&&(e.options.extrudePath=t.extrudePath.toJSON()),e}var is=class i extends ze{constructor(t=[new Nt(0,-.5),new Nt(.5,0),new Nt(0,.5)],e=12,n=0,s=Math.PI*2){super(),this.type="LatheGeometry",this.parameters={points:t,segments:e,phiStart:n,phiLength:s},e=Math.floor(e),s=we(s,0,Math.PI*2);let r=[],o=[],a=[],l=[],c=[],h=1/e,f=new k,d=new Nt,u=new k,m=new k,x=new k,p=0,g=0;for(let _=0;_<=t.length-1;_++)switch(_){case 0:p=t[_+1].x-t[_].x,g=t[_+1].y-t[_].y,u.x=g*1,u.y=-p,u.z=g*0,x.copy(u),u.normalize(),l.push(u.x,u.y,u.z);break;case t.length-1:x.normalize(),l.push(x.x,x.y,x.z);break;default:p=t[_+1].x-t[_].x,g=t[_+1].y-t[_].y,u.x=g*1,u.y=-p,u.z=g*0,m.copy(u),u.x+=x.x,u.y+=x.y,u.z+=x.z,u.normalize(),l.push(u.x,u.y,u.z),x.copy(m)}for(let _=0;_<=e;_++){let S=n+_*h*s,y=Math.sin(S),T=Math.cos(S);for(let A=0;A<=t.length-1;A++){f.x=t[A].x*y,f.y=t[A].y,f.z=t[A].x*T,o.push(f.x,f.y,f.z),d.x=_/e,d.y=A/(t.length-1),a.push(d.x,d.y);let v=l[3*A+0]*y,b=l[3*A+1],D=l[3*A+0]*T;c.push(v,b,D)}}for(let _=0;_<e;_++)for(let S=0;S<t.length-1;S++){let y=S+_*t.length,T=y,A=y+t.length,v=y+t.length+1,b=y+1;r.push(T,A,b),r.push(v,b,A)}this.setIndex(r),this.setAttribute("position",new Ee(o,3)),this.setAttribute("uv",new Ee(a,2)),this.setAttribute("normal",new Ee(c,3))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.points,t.segments,t.phiStart,t.phiLength)}};var ss=class i extends ze{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};let r=t/2,o=e/2,a=Math.floor(n),l=Math.floor(s),c=a+1,h=l+1,f=t/a,d=e/l,u=[],m=[],x=[],p=[];for(let g=0;g<h;g++){let _=g*d-o;for(let S=0;S<c;S++){let y=S*f-r;m.push(y,-_,0),x.push(0,0,1),p.push(S/a),p.push(1-g/l)}}for(let g=0;g<l;g++)for(let _=0;_<a;_++){let S=_+c*g,y=_+c*(g+1),T=_+1+c*(g+1),A=_+1+c*g;u.push(S,y,A),u.push(y,T,A)}this.setIndex(u),this.setAttribute("position",new Ee(m,3)),this.setAttribute("normal",new Ee(x,3)),this.setAttribute("uv",new Ee(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.widthSegments,t.heightSegments)}};var qr=class i extends ze{constructor(t=1,e=32,n=16,s=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:s,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let l=Math.min(o+a,Math.PI),c=0,h=[],f=new k,d=new k,u=[],m=[],x=[],p=[];for(let g=0;g<=n;g++){let _=[],S=g/n,y=o+S*a,T=t*Math.cos(y),A=Math.sqrt(t*t-T*T),v=0;g===0&&o===0?v=.5/e:g===n&&l===Math.PI&&(v=-.5/e);for(let b=0;b<=e;b++){let D=b/e,P=s+D*r;f.x=-A*Math.cos(P),f.y=T,f.z=A*Math.sin(P),m.push(f.x,f.y,f.z),d.copy(f).normalize(),x.push(d.x,d.y,d.z),p.push(D+v,1-S),_.push(c++)}h.push(_)}for(let g=0;g<n;g++)for(let _=0;_<e;_++){let S=h[g][_+1],y=h[g][_],T=h[g+1][_],A=h[g+1][_+1];(g!==0||o>0)&&u.push(S,y,A),(g!==n-1||l<Math.PI)&&u.push(y,T,A)}this.setIndex(u),this.setAttribute("position",new Ee(m,3)),this.setAttribute("normal",new Ee(x,3)),this.setAttribute("uv",new Ee(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};var Yr=class i extends ze{constructor(t=1,e=.4,n=12,s=48,r=Math.PI*2,o=0,a=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:e,radialSegments:n,tubularSegments:s,arc:r,thetaStart:o,thetaLength:a},n=Math.floor(n),s=Math.floor(s);let l=[],c=[],h=[],f=[],d=new k,u=new k,m=new k;for(let x=0;x<=n;x++){let p=o+x/n*a;for(let g=0;g<=s;g++){let _=g/s*r;u.x=(t+e*Math.cos(p))*Math.cos(_),u.y=(t+e*Math.cos(p))*Math.sin(_),u.z=e*Math.sin(p),c.push(u.x,u.y,u.z),d.x=t*Math.cos(_),d.y=t*Math.sin(_),m.subVectors(u,d).normalize(),h.push(m.x,m.y,m.z),f.push(g/s),f.push(x/n)}}for(let x=1;x<=n;x++)for(let p=1;p<=s;p++){let g=(s+1)*x+p-1,_=(s+1)*(x-1)+p-1,S=(s+1)*(x-1)+p,y=(s+1)*x+p;l.push(g,_,y),l.push(_,S,y)}this.setIndex(l),this.setAttribute("position",new Ee(c,3)),this.setAttribute("normal",new Ee(h,3)),this.setAttribute("uv",new Ee(f,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc,t.thetaStart,t.thetaLength)}};var Zr=class i extends ze{constructor(t=new zr(new k(-1,-1,0),new k(-1,1,0),new k(1,1,0)),e=64,n=1,s=8,r=!1){super(),this.type="TubeGeometry",this.parameters={path:t,tubularSegments:e,radius:n,radialSegments:s,closed:r};let o=t.computeFrenetFrames(e,r);this.tangents=o.tangents,this.normals=o.normals,this.binormals=o.binormals;let a=new k,l=new k,c=new Nt,h=new k,f=[],d=[],u=[],m=[];x(),this.setIndex(m),this.setAttribute("position",new Ee(f,3)),this.setAttribute("normal",new Ee(d,3)),this.setAttribute("uv",new Ee(u,2));function x(){for(let S=0;S<e;S++)p(S);p(r===!1?e:0),_(),g()}function p(S){h=t.getPointAt(S/e,h);let y=o.normals[S],T=o.binormals[S];for(let A=0;A<=s;A++){let v=A/s*Math.PI*2,b=Math.sin(v),D=-Math.cos(v);l.x=D*y.x+b*T.x,l.y=D*y.y+b*T.y,l.z=D*y.z+b*T.z,l.normalize(),d.push(l.x,l.y,l.z),a.x=h.x+n*l.x,a.y=h.y+n*l.y,a.z=h.z+n*l.z,f.push(a.x,a.y,a.z)}}function g(){for(let S=1;S<=e;S++)for(let y=1;y<=s;y++){let T=(s+1)*(S-1)+(y-1),A=(s+1)*S+(y-1),v=(s+1)*S+y,b=(s+1)*(S-1)+y;m.push(T,A,b),m.push(A,v,b)}}function _(){for(let S=0;S<=e;S++)for(let y=0;y<=s;y++)c.x=S/e,c.y=y/s,u.push(c.x,c.y)}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){let t=super.toJSON();return t.path=this.parameters.path.toJSON(),t}static fromJSON(t){return new i(new Pa[t.path.type]().fromJSON(t.path),t.tubularSegments,t.radius,t.radialSegments,t.closed)}};function cs(i){let t={};for(let e in i){t[e]={};for(let n in i[e]){let s=i[e][n];if(ku(s))s.isRenderTargetTexture?(ae("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone();else if(Array.isArray(s))if(ku(s[0])){let r=[];for(let o=0,a=s.length;o<a;o++)r[o]=s[o].clone();t[e][n]=r}else t[e][n]=s.slice();else t[e][n]=s}}return t}function un(i){let t={};for(let e=0;e<i.length;e++){let n=cs(i[e]);for(let s in n)t[s]=n[s]}return t}function ku(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function Dm(i){let t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function dh(i){let t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Te.workingColorSpace}var Of={clone:cs,merge:un},Fm=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Um=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,mn=class extends Ui{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Fm,this.fragmentShader=Um,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=cs(t.uniforms),this.uniformsGroups=Dm(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let s in this.uniforms){let o=this.uniforms[s].value;o&&o.isTexture?e.uniforms[s]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[s]={type:"m4",value:o.toArray()}:e.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(let n in t.uniforms){let s=t.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=e[s.value]||null;break;case"c":this.uniforms[n].value=new Re().setHex(s.value);break;case"v2":this.uniforms[n].value=new Nt().fromArray(s.value);break;case"v3":this.uniforms[n].value=new k().fromArray(s.value);break;case"v4":this.uniforms[n].value=new We().fromArray(s.value);break;case"m3":this.uniforms[n].value=new he().fromArray(s.value);break;case"m4":this.uniforms[n].value=new fe().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(let n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}},Na=class extends mn{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}};var Da=class extends Ui{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=xf,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},Fa=class extends Ui{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function Ps(i,t){return!i||i.constructor===t?i:typeof t.BYTES_PER_ELEMENT=="number"?new t(i):Array.prototype.slice.call(i)}function ea(i){return i!==void 0&&i.inTangents!==void 0&&i.outTangents!==void 0}var Oi=class{constructor(t,e,n,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,s=e[n],r=e[n-1];n:{t:{let o;e:{i:if(!(t<s)){for(let a=n+2;;){if(s===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=s,s=e[++n],t<s)break t}o=e.length;break e}if(!(t>=r)){let a=e[1];t<a&&(n=2,r=a);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(s=r,r=e[--n-1],t>=r)break t}o=n,n=0;break e}break n}for(;n<o;){let a=n+o>>>1;t<e[a]?o=a:n=a+1}if(s=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=t*s;for(let o=0;o!==s;++o)e[o]=n[r+o];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},Ua=class extends Oi{constructor(t,e,n,s){super(t,e,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Cc,endingEnd:Cc}}intervalChanged_(t,e,n){let s=this.parameterPositions,r=t-2,o=t+1,a=s[r],l=s[o];if(a===void 0)switch(this.getSettings_().endingStart){case Ic:r=t,a=2*e-n;break;case Pc:r=s.length-2,a=e+s[r]-s[r+1];break;default:r=t,a=n}if(l===void 0)switch(this.getSettings_().endingEnd){case Ic:o=t,l=2*n-e;break;case Pc:o=1,l=n+s[1]-s[0];break;default:o=t-1,l=e}let c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-a),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this._offsetPrev,f=this._offsetNext,d=this._weightPrev,u=this._weightNext,m=(n-e)/(s-e),x=m*m,p=x*m,g=-d*p+2*d*x-d*m,_=(1+d)*p+(-1.5-2*d)*x+(-.5+d)*m+1,S=(-1-u)*p+(1.5+u)*x+.5*m,y=u*p-u*x;for(let T=0;T!==a;++T)r[T]=g*o[h+T]+_*o[c+T]+S*o[l+T]+y*o[f+T];return r}},Oa=class extends Oi{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=(n-e)/(s-e),f=1-h;for(let d=0;d!==a;++d)r[d]=o[c+d]*f+o[l+d]*h;return r}},Ba=class extends Oi{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t){return this.copySampleValue_(t-1)}},za=class extends Oi{interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this.inTangents,f=this.outTangents;if(!h||!f){let m=(n-e)/(s-e),x=1-m;for(let p=0;p!==a;++p)r[p]=o[c+p]*x+o[l+p]*m;return r}let d=a*2,u=t-1;for(let m=0;m!==a;++m){let x=o[c+m],p=o[l+m],g=u*d+m*2,_=f[g],S=f[g+1],y=t*d+m*2,T=h[y],A=h[y+1],v=Bm(n,e,_,T,s);r[m]=Bf(v,x,S,A,p)}return r}};function Bf(i,t,e,n,s){let r=1-i;return r*r*r*t+3*r*r*i*e+3*r*i*i*n+i*i*i*s}function Om(i,t,e,n,s){let r=1-i;return 3*r*r*(e-t)+6*r*i*(n-e)+3*i*i*(s-n)}function Bm(i,t,e,n,s){let r=(i-t)/(s-t);for(let o=0;o<8;o++){let a=Bf(r,t,e,n,s)-i;if(Math.abs(a)<1e-10)break;let l=Om(r,t,e,n,s);if(Math.abs(l)<1e-10)break;r=Math.max(0,Math.min(1,r-a/l))}return r}var In=class{constructor(t,e,n,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=Ps(e,this.TimeBufferType),this.values=Ps(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:Ps(t.times,Array),values:Ps(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(n.interpolation=s),ea(t.settings)&&(n.settings={inTangents:Ps(t.settings.inTangents,Array),outTangents:Ps(t.settings.outTangents,Array)})}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new Ba(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Oa(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new Ua(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let e=new za(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case Mr:e=this.InterpolantFactoryMethodDiscrete;break;case ga:e=this.InterpolantFactoryMethodLinear;break;case sa:e=this.InterpolantFactoryMethodSmooth;break;case Rc:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return ae("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Mr;case this.InterpolantFactoryMethodLinear:return ga;case this.InterpolantFactoryMethodSmooth:return sa;case this.InterpolantFactoryMethodBezier:return Rc}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]+=t;ea(this.settings)&&(Gu(this.settings.inTangents,t),Gu(this.settings.outTangents,t))}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]*=t;ea(this.settings)&&(Vu(this.settings.inTangents,t),Vu(this.settings.outTangents,t))}return this}trim(t,e){let n=this.times,s=n.length,r=0,o=s-1;for(;r!==s&&n[r]<t;)++r;for(;o!==-1&&n[o]>e;)--o;if(++o,r!==0||o!==s){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(ce("KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,s=this.values,r=n.length;r===0&&(ce("KeyframeTrack: Track is empty.",this),t=!1);let o=null;for(let a=0;a!==r;a++){let l=n[a];if(typeof l=="number"&&isNaN(l)){ce("KeyframeTrack: Time is not a valid number.",this,a,l),t=!1;break}if(o!==null&&o>l){ce("KeyframeTrack: Out of order keys.",this,a,l,o),t=!1;break}o=l}if(s!==void 0&&kp(s))for(let a=0,l=s.length;a!==l;++a){let c=s[a];if(isNaN(c)){ce("KeyframeTrack: Value is not a valid number.",this,a,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===sa,r=t.length-1,o=1;for(let a=1;a<r;++a){let l=!1,c=t[a],h=t[a+1];if(c!==h&&(a!==1||c!==t[0]))if(s)l=!0;else{let f=a*n,d=f-n,u=f+n;for(let m=0;m!==n;++m){let x=e[f+m];if(x!==e[d+m]||x!==e[u+m]){l=!0;break}}}if(l){if(a!==o){t[o]=t[a];let f=a*n,d=o*n;for(let u=0;u!==n;++u)e[d+u]=e[f+u]}++o}}if(r>0){t[o]=t[r];for(let a=r*n,l=o*n,c=0;c!==n;++c)e[l+c]=e[a+c];++o}return o!==t.length?(this.times=t.slice(0,o),this.values=e.slice(0,o*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,s=new n(this.name,t,e);return s.createInterpolant=this.createInterpolant,ea(this.settings)&&(s.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),s}};function Gu(i,t){for(let e=0,n=i.length;e!==n;e+=2)i[e]+=t}function Vu(i,t){for(let e=0,n=i.length;e!==n;e+=2)i[e]*=t}In.prototype.ValueTypeName="";In.prototype.TimeBufferType=Float32Array;In.prototype.ValueBufferType=Float32Array;In.prototype.DefaultInterpolation=ga;var Bi=class extends In{constructor(t,e,n){super(t,e,n)}};Bi.prototype.ValueTypeName="bool";Bi.prototype.ValueBufferType=Array;Bi.prototype.DefaultInterpolation=Mr;Bi.prototype.InterpolantFactoryMethodLinear=void 0;Bi.prototype.InterpolantFactoryMethodSmooth=void 0;var ka=class extends In{constructor(t,e,n,s){super(t,e,n,s)}};ka.prototype.ValueTypeName="color";var Ga=class extends In{constructor(t,e,n,s){super(t,e,n,s)}};Ga.prototype.ValueTypeName="number";var Va=class extends Oi{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(n-e)/(s-e),c=t*a;for(let h=c+a;c!==h;c+=4)ti.slerpFlat(r,0,o,c-a,o,c,l);return r}},Jr=class extends In{constructor(t,e,n,s){super(t,e,n,s)}InterpolantFactoryMethodLinear(t){return new Va(this.times,this.values,this.getValueSize(),t)}};Jr.prototype.ValueTypeName="quaternion";Jr.prototype.InterpolantFactoryMethodSmooth=void 0;var zi=class extends In{constructor(t,e,n){super(t,e,n)}};zi.prototype.ValueTypeName="string";zi.prototype.ValueBufferType=Array;zi.prototype.DefaultInterpolation=Mr;zi.prototype.InterpolantFactoryMethodLinear=void 0;zi.prototype.InterpolantFactoryMethodSmooth=void 0;var Ha=class extends In{constructor(t,e,n,s){super(t,e,n,s)}};Ha.prototype.ValueTypeName="vector";var Wa=class{constructor(t,e,n){let s=this,r=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(h){a++,r===!1&&s.onStart!==void 0&&s.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,s.onProgress!==void 0&&s.onProgress(h,o,a),o===a&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(h){s.onError!==void 0&&s.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,f){return c.push(h,f),this},this.removeHandler=function(h){let f=c.indexOf(h);return f!==-1&&c.splice(f,2),this},this.getHandler=function(h){for(let f=0,d=c.length;f<d;f+=2){let u=c[f],m=c[f+1];if(u.global&&(u.lastIndex=0),u.test(h))return m}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},zf=new Wa,Xa=class{constructor(t){this.manager=t!==void 0?t:zf,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},this.priority="auto",this.cache="default",typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){let n=this;return new Promise(function(s,r){n.load(t,s,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}setPriority(t){return this.priority=t,this}setCache(t){return this.cache=t,this}abort(){return this}};Xa.DEFAULT_MATERIAL_NAME="__DEFAULT";var na=new k,ia=new ti,$n=new k,$r=class extends Rn{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new fe,this.projectionMatrix=new fe,this.projectionMatrixInverse=new fe,this.coordinateSystem=Nn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(na,ia,$n),$n.x===1&&$n.y===1&&$n.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(na,ia,$n.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(na,ia,$n),$n.x===1&&$n.y===1&&$n.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(na,ia,$n.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Di=new k,Hu=new Nt,Wu=new Nt,hn=class extends $r{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=_a*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(oa*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return _a*2*Math.atan(Math.tan(oa*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Di.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Di.x,Di.y).multiplyScalar(-t/Di.z),Di.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Di.x,Di.y).multiplyScalar(-t/Di.z)}getViewSize(t,e){return this.getViewBounds(t,Hu,Wu),e.subVectors(Wu,Hu)}setViewOffset(t,e,n,s,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(oa*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*s/l,e-=o.offsetY*n/c,s*=o.width/l,n*=o.height/c}let a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}};var qa=class extends $r{constructor(t=-1,e=1,n=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-t,o=n+t,a=s+e,l=s-e;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}};var Ls=-90,Ns=1,qs=class extends Rn{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new hn(Ls,Ns,t,e);s.layers=this.layers,this.add(s);let r=new hn(Ls,Ns,t,e);r.layers=this.layers,this.add(r);let o=new hn(Ls,Ns,t,e);o.layers=this.layers,this.add(o);let a=new hn(Ls,Ns,t,e);a.layers=this.layers,this.add(a);let l=new hn(Ls,Ns,t,e);l.layers=this.layers,this.add(l);let c=new hn(Ls,Ns,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,s,r,o,a,l]=e;for(let c of e)this.remove(c);if(t===Nn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===wr)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,l,c,h]=this.children,f=t.getRenderTarget(),d=t.getActiveCubeFace(),u=t.getActiveMipmapLevel(),m=t.xr.enabled;t.xr.enabled=!1;let x=n.texture.mipmapsAutoUpdate;n.texture.mipmapsAutoUpdate=!1;let p=!1;t.isWebGLRenderer===!0?p=t.state.buffers.depth.getReversed():p=t.reversedDepthBuffer,t.setRenderTarget(n,0,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,2,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,3,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.mipmapsAutoUpdate=x,t.setRenderTarget(n,5,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,h),t.setRenderTarget(f,d,u),t.xr.enabled=m,n.texture.needsPMREMUpdate=!0}},Ya=class extends hn{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t,this.perCameraFrustumCulled=!1}};var ph="\\[\\]\\.:\\/",zm=new RegExp("["+ph+"]","g"),mh="[^"+ph+"]",km="[^"+ph.replace("\\.","")+"]",Gm=/((?:WC+[\/:])*)/.source.replace("WC",mh),Vm=/(WCOD+)?/.source.replace("WCOD",km),Hm=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",mh),Wm=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",mh),Xm=new RegExp("^"+Gm+Vm+Hm+Wm+"$"),qm=["material","materials","bones","map"],Fc=class{constructor(t,e,n){let s=n||Oe.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,s)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},Oe=class i{constructor(t,e,n){this.path=e,this.parsedPath=n||i.parseTrackName(e),this.node=i.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new i.Composite(t,e,n):new i(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(zm,"")}static parseTrackName(t){let e=Xm.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);qm.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===e||a.uuid===e)return a;let l=n(a.children);if(l)return l}return null},s=n(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)t[e++]=n[s]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,s=e.propertyName,r=e.propertyIndex;if(t||(t=i.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){ae("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){ce("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){ce("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){ce("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){ce("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){ce("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){ce("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){ce("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let o=t[s];if(o===void 0){let c=e.nodeName;ce("PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",t);return}let a=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?a=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){ce("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){ce("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};Oe.Composite=Fc;Oe.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};Oe.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};Oe.prototype.GetterByBindingType=[Oe.prototype._getValue_direct,Oe.prototype._getValue_array,Oe.prototype._getValue_arrayElement,Oe.prototype._getValue_toArray];Oe.prototype.SetterByBindingTypeAndVersioning=[[Oe.prototype._setValue_direct,Oe.prototype._setValue_direct_setNeedsUpdate,Oe.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Oe.prototype._setValue_array,Oe.prototype._setValue_array_setNeedsUpdate,Oe.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Oe.prototype._setValue_arrayElement,Oe.prototype._setValue_arrayElement_setNeedsUpdate,Oe.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Oe.prototype._setValue_fromArray,Oe.prototype._setValue_fromArray_setNeedsUpdate,Oe.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var lM=new Float32Array(1);var Xu=new fe,Kr=class{constructor(t,e,n=0,s=1/0){this.ray=new ks(t,e),this.near=n,this.far=s,this.camera=null,this.layers=new Bs,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,e.projectionMatrix.elements[14]).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):ce("Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return Xu.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(Xu),this}intersectObject(t,e=!0,n=[]){return Uc(t,this,n,e),n.sort(qu),n}intersectObjects(t,e=!0,n=[]){for(let s=0,r=t.length;s<r;s++)Uc(t[s],this,n,e);return n.sort(qu),n}};function qu(i,t){return i.distance-t.distance}function Uc(i,t,e,n){let s=!0;if(i.layers.test(t.layers)&&i.raycast(t,e)===!1&&(s=!1),s===!0&&n===!0){let r=i.children;for(let o=0,a=r.length;o<a;o++)Uc(r[o],t,e,!0)}}var Mh=class Mh{constructor(t,e,n,s){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,s){let r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=s,this}};Mh.prototype.isMatrix2=!0;var Oc=Mh;function gh(i,t,e,n){let s=Ym(n);switch(e){case nh:return i*t;case sh:return i*t/s.components*s.byteLength;case el:return i*t/s.components*s.byteLength;case ki:return i*t*2/s.components*s.byteLength;case nl:return i*t*2/s.components*s.byteLength;case ih:return i*t*3/s.components*s.byteLength;case Yn:return i*t*4/s.components*s.byteLength;case il:return i*t*4/s.components*s.byteLength;case to:case eo:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case no:case io:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case rl:case al:return Math.max(i,16)*Math.max(t,8)/4;case sl:case ol:return Math.max(i,8)*Math.max(t,8)/2;case ll:case cl:case ul:case fl:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case hl:case so:case dl:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case pl:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case ml:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case gl:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case _l:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case xl:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case vl:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case yl:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case Ml:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case Sl:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case bl:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case wl:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case Al:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case Tl:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case El:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case Rl:case Cl:case Il:return Math.ceil(i/4)*Math.ceil(t/4)*16;case Pl:case Ll:return Math.ceil(i/4)*Math.ceil(t/4)*8;case ro:case Nl:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function Ym(i){switch(i){case Pn:case Qc:return{byteLength:1,components:1};case Ks:case jc:case qn:return{byteLength:2,components:1};case ja:case tl:return{byteLength:2,components:4};case Wn:case Qa:case Xn:return{byteLength:4,components:1};case th:case eh:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"187"}}));typeof window<"u"&&(window.__THREE__?ae("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="187");function ad(){let i=null,t=!1,e=null,n=null;function s(r,o){n=i.requestAnimationFrame(s),e(r,o)}return{start:function(){t!==!0&&e!==null&&i!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function Jm(i){let t=new WeakMap;function e(a,l){let c=a.array,h=a.usage,f=c.byteLength,d=i.createBuffer();i.bindBuffer(l,d),i.bufferData(l,c,h),a.onUploadCallback();let u;if(c instanceof Float32Array)u=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)u=i.HALF_FLOAT;else if(c instanceof Uint16Array)a.isFloat16BufferAttribute?u=i.HALF_FLOAT:u=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)u=i.SHORT;else if(c instanceof Uint32Array)u=i.UNSIGNED_INT;else if(c instanceof Int32Array)u=i.INT;else if(c instanceof Int8Array)u=i.BYTE;else if(c instanceof Uint8Array)u=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)u=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:d,type:u,bytesPerElement:c.BYTES_PER_ELEMENT,version:a.version,size:f}}function n(a,l,c){let h=l.array,f=l.updateRanges;if(i.bindBuffer(c,a),f.length===0)i.bufferSubData(c,0,h);else{f.sort((u,m)=>u.start-m.start);let d=0;for(let u=1;u<f.length;u++){let m=f[d],x=f[u];x.start<=m.start+m.count+1?m.count=Math.max(m.count,x.start+x.count-m.start):(++d,f[d]=x)}f.length=d+1;for(let u=0,m=f.length;u<m;u++){let x=f[u];i.bufferSubData(c,x.start*h.BYTES_PER_ELEMENT,h,x.start,x.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);let l=t.get(a);l&&(i.deleteBuffer(l.buffer),t.delete(a))}function o(a,l){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=t.get(a);(!h||h.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let c=t.get(a);if(c===void 0)t.set(a,e(a,l));else if(c.version<a.version){if(c.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,a,l),c.version=a.version}}return{get:s,remove:r,update:o}}var $m=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Km=`#ifdef USE_ALPHAHASH
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
#endif`,Qm=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,jm=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,tg=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,eg=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,ng=`#ifdef USE_AOMAP
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
#endif`,ig=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,sg=`#ifdef USE_BATCHING
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
#endif`,rg=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,og=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,ag=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,lg=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,cg=`#ifdef USE_IRIDESCENCE
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
#endif`,hg=`#ifdef USE_BUMPMAP
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
#endif`,ug=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,fg=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,dg=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,pg=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,mg=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,gg=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,_g=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,xg=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,vg=`#define PI 3.141592653589793
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
} // validated`,yg=`vec3 transformedNormal = objectNormal;
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
#endif`,Mg=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Sg=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,bg=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,wg=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Ag="gl_FragColor = linearToOutputTexel( gl_FragColor );",Tg=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Eg=`#ifdef USE_ENVMAP
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
#endif`,Rg=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	uniform samplerCube envMap;
	#ifdef ENVMAP_TYPE_PMREM
		float roughnessToMip( const in float roughness ) {
			float r = clamp( roughness, 0.0, 1.0 );
			return ENVMAP_MAX_LOD * r * ( 2.0 - r );
		}
	#endif
#endif`,Cg=`#ifdef USE_ENVMAP
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
#endif`,Ig=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Pg=`#ifdef USE_ENVMAP
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
#endif`,Lg=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Ng=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Dg=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Fg=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Ug=`#ifdef USE_GRADIENTMAP
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
}`,Og=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Bg=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,zg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,kg=`uniform bool receiveShadow;
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
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
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
#include <lightprobes_pars_fragment>`,Gg=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * worldNormal, ENVMAP_MAX_LOD );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * reflectVec, roughnessToMip( roughness ) );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureLod( envMap, envMapRotation * retroVec, roughnessToMip( roughness ) );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_PMREM
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,Vg=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Hg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Wg=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Xg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,qg=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.045 );
material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef USE_DIFFUSE_ROUGHNESS
	float diffuseRoughnessFactor = diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		diffuseRoughnessFactor *= texture2D( diffuseRoughnessMap, vDiffuseRoughnessMapUv ).r;
	#endif
	material.diffuseRoughness = saturate( diffuseRoughnessFactor );
#endif
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
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.045 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
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
#endif`,Yg=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float diffuseRoughness;
	#endif
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
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
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
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
#ifdef USE_DIFFUSE_ROUGHNESS
	const float EON_EPSILON = 1e-7;
	float FON_DirectionalAlbedo( const in float mu, const in float roughness, const in float A ) {
		float muComp = 1.0 - mu;
		float gOverPi = muComp * ( 0.0571085289 + muComp * ( 0.491881867 + muComp * ( - 0.332181442 + muComp * 0.0714429953 ) ) );
		return A * ( 1.0 + roughness * gOverPi );
	}
	vec3 BRDF_EON( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 diffuseColor, const in float roughness ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return BRDF_Lambert( rho );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float s = dot( lightDir, viewDir ) - dotNL * dotNV;
		float sOverT = ( s > 0.0 ) ? s / max( max( dotNL, dotNV ), EON_EPSILON ) : s;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		vec3 singleScatter = rho * RECIPROCAL_PI * A * ( 1.0 + roughness * sOverT );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		float albedoV = FON_DirectionalAlbedo( dotNV, roughness, A );
		float albedoL = FON_DirectionalAlbedo( dotNL, roughness, A );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		vec3 multiScatter = rhoMultiScatter * RECIPROCAL_PI
			* max( EON_EPSILON, 1.0 - albedoV )
			* max( EON_EPSILON, 1.0 - albedoL )
			/ max( EON_EPSILON, 1.0 - averageAlbedo );
		return singleScatter + multiScatter;
	}
	vec3 EON_DirectionalAlbedo( const in vec3 diffuseColor, const in float roughness, const in float dotNV ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return rho;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		float directionalAlbedo = FON_DirectionalAlbedo( dotNV, roughness, A );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		return rho * directionalAlbedo + rhoMultiScatter * ( 1.0 - directionalAlbedo );
	}
#endif
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
		float roughness = max( material.clearcoatRoughness, 0.045 );
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
	float roughness = max( material.roughness, 0.045 );
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
		float alphaT = max( material.alphaT, alpha );
		float V = V_GGX_SmithCorrelated_Anisotropic( alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( alphaT, alpha, dotNH, dotTH, dotBH );
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
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
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
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		vec3 diffuseBRDF = BRDF_EON( directLight.direction, geometryViewDir, geometryNormal, material.diffuseColor, material.diffuseRoughness ) * ( 1.0 - material.metalness );
	#else
		vec3 diffuseBRDF = BRDF_Lambert( material.diffuseContribution );
	#endif
	reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuseAlbedo = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness );
		vec3 diffuse = irradiance * RECIPROCAL_PI * diffuseAlbedo * ( 1.0 - singleScattering - multiScattering );
	#else
		vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#endif
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
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
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuse = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness ) * ( 1.0 - totalScatteringDielectric );
	#else
		vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	#endif
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
}`,Zg=`
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
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
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
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
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
	#if NUM_LIGHT_PROBE_GRIDS > 0
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		int probeGrid = - 1;
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( isInsideLightProbeGrid( probeWorldPos, probeWorldNormal, probesMin[ i ], probesMax[ i ], probesResolution[ i ] ) ) probeGrid = UNROLLED_LOOP_INDEX;
		}
		#pragma unroll_loop_end
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( probeGrid == UNROLLED_LOOP_INDEX ) irradiance += getLightProbeGridIrradiance( probesSH[ i ], probesMin[ i ], probesMax[ i ], probesResolution[ i ], probeWorldPos, probeWorldNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Jg=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_PMREM )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,$g=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Kg=`#if NUM_LIGHT_PROBE_GRIDS > 0
uniform highp sampler3D probesSH[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMin[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMax[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesResolution[ NUM_LIGHT_PROBE_GRIDS ];
bool isInsideLightProbeGrid( vec3 worldPos, vec3 worldNormal, vec3 probesMin, vec3 probesMax, vec3 probesResolution ) {
	vec3 spacing = ( probesMax - probesMin ) / probesResolution;
	vec3 samplePos = worldPos + worldNormal * spacing * 0.5;
	vec3 margin = spacing * 0.01;
	return all( greaterThanEqual( samplePos, probesMin - margin ) ) && all( lessThanEqual( samplePos, probesMax + margin ) );
}
vec3 getLightProbeGridIrradiance( highp sampler3D probesSH, vec3 probesMin, vec3 probesMax, vec3 probesResolution, vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 probeSpacing = gridRange / res;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.5 / res, 1.0 - 0.5 / res );
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
#endif`,Qg=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,jg=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,t0=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,e0=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,n0=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,i0=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,s0=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,r0=`#if defined( USE_POINTS_UV )
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
#endif`,o0=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,a0=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,l0=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,c0=`#if defined( USE_MORPHCOLORS )
	#if defined( USE_COLOR_ALPHA )
		vColor *= morphTargetBaseInfluence;
	#elif defined( USE_COLOR )
		vColor.rgb *= morphTargetBaseInfluence;
	#endif
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor.rgb += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,h0=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,u0=`#ifdef USE_MORPHTARGETS
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
#endif`,f0=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,d0=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,p0=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,m0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,g0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,_0=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,x0=`#ifdef USE_NORMALMAP
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
#endif`,v0=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,y0=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,M0=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,S0=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,b0=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,w0=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,A0=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,T0=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,E0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,R0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,C0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,I0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,P0=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
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
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				vec2 radius = shadowRadius * texelSize;
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
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
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
			float lightDistance = length( lightToPosition );
			float depthRange = shadowCameraFar - shadowCameraNear;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float depthA = - shadowCameraNear / depthRange - shadowBias;
				float depthB = shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#else
				float depthA = shadowCameraFar / depthRange + shadowBias;
				float depthB = - shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			shadow = 0.0;
			for ( int i = 0; i < 5; i ++ ) {
				vec2 offset = vogelDiskSample( i, 5, phi );
				vec3 direction = bd3D + ( tangent * offset.x + bitangent * offset.y ) * texelSize;
				vec3 absDirection = abs( direction );
				float dp = depthA + depthB / max( max( absDirection.x, absDirection.y ), absDirection.z );
				shadow += texture( shadowMap, vec4( direction, dp ) );
			}
			shadow *= 0.2;
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
#endif`,L0=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
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
#endif`,N0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
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
#endif`,D0=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
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
}`,F0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,U0=`#ifdef USE_SKINNING
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
#endif`,O0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,B0=`#ifdef USE_SKINNING
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
#endif`,z0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,k0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,G0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,V0=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,H0=`#ifdef USE_TRANSMISSION
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
#endif`,W0=`#ifdef USE_TRANSMISSION
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
#endif`,X0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	varying vec2 vDiffuseRoughnessMapUv;
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
#endif`,q0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	uniform mat3 diffuseRoughnessMapTransform;
	varying vec2 vDiffuseRoughnessMapUv;
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
#endif`,Y0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	vDiffuseRoughnessMapUv = ( diffuseRoughnessMapTransform * vec3( DIFFUSE_ROUGHNESSMAP_UV, 1 ) ).xy;
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
#endif`,Z0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,J0=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,$0=`uniform sampler2D t2D;
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
}`,K0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Q0=`uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <envmap_common_pars_fragment>
void main() {
	#ifdef ENVMAP_TYPE_PMREM
		vec4 texColor = textureLod( envMap, backgroundRotation * vWorldDirection, roughnessToMip( backgroundBlurriness ) );
	#else
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,j0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,t_=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,e_=`#include <common>
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
}`,n_=`#if DEPTH_PACKING == 3200
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
}`,i_=`#define DISTANCE
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
}`,s_=`#define DISTANCE
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
}`,r_=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,o_=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,a_=`uniform float scale;
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
}`,l_=`uniform vec3 diffuse;
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
}`,c_=`#include <common>
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
}`,h_=`uniform vec3 diffuse;
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
}`,u_=`#define LAMBERT
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
}`,f_=`#define LAMBERT
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
}`,d_=`#define MATCAP
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
}`,p_=`#define MATCAP
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
}`,m_=`#define NORMAL
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
}`,g_=`#define NORMAL
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
}`,__=`#define PHONG
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
}`,x_=`#define PHONG
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
}`,v_=`#define STANDARD
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
}`,y_=`#define STANDARD
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
#ifdef USE_DIFFUSE_ROUGHNESS
	uniform float diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		uniform sampler2D diffuseRoughnessMap;
	#endif
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
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
}`,M_=`#define TOON
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
}`,S_=`#define TOON
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
}`,b_=`uniform float size;
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
}`,w_=`uniform vec3 diffuse;
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
}`,A_=`#include <common>
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
}`,T_=`uniform vec3 color;
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
}`,E_=`uniform float rotation;
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
}`,R_=`uniform vec3 diffuse;
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
}`,ye={alphahash_fragment:$m,alphahash_pars_fragment:Km,alphamap_fragment:Qm,alphamap_pars_fragment:jm,alphatest_fragment:tg,alphatest_pars_fragment:eg,aomap_fragment:ng,aomap_pars_fragment:ig,batching_pars_vertex:sg,batching_vertex:rg,begin_vertex:og,beginnormal_vertex:ag,bsdfs:lg,iridescence_fragment:cg,bumpmap_pars_fragment:hg,clipping_planes_fragment:ug,clipping_planes_pars_fragment:fg,clipping_planes_pars_vertex:dg,clipping_planes_vertex:pg,color_fragment:mg,color_pars_fragment:gg,color_pars_vertex:_g,color_vertex:xg,common:vg,defaultnormal_vertex:yg,displacementmap_pars_vertex:Mg,displacementmap_vertex:Sg,emissivemap_fragment:bg,emissivemap_pars_fragment:wg,colorspace_fragment:Ag,colorspace_pars_fragment:Tg,envmap_fragment:Eg,envmap_common_pars_fragment:Rg,envmap_pars_fragment:Cg,envmap_pars_vertex:Ig,envmap_physical_pars_fragment:Gg,envmap_vertex:Pg,fog_vertex:Lg,fog_pars_vertex:Ng,fog_fragment:Dg,fog_pars_fragment:Fg,gradientmap_pars_fragment:Ug,lightmap_pars_fragment:Og,lights_lambert_fragment:Bg,lights_lambert_pars_fragment:zg,lights_pars_begin:kg,lights_toon_fragment:Vg,lights_toon_pars_fragment:Hg,lights_phong_fragment:Wg,lights_phong_pars_fragment:Xg,lights_physical_fragment:qg,lights_physical_pars_fragment:Yg,lights_fragment_begin:Zg,lights_fragment_maps:Jg,lights_fragment_end:$g,lightprobes_pars_fragment:Kg,logdepthbuf_fragment:Qg,logdepthbuf_pars_fragment:jg,logdepthbuf_pars_vertex:t0,logdepthbuf_vertex:e0,map_fragment:n0,map_pars_fragment:i0,map_particle_fragment:s0,map_particle_pars_fragment:r0,metalnessmap_fragment:o0,metalnessmap_pars_fragment:a0,morphinstance_vertex:l0,morphcolor_vertex:c0,morphnormal_vertex:h0,morphtarget_pars_vertex:u0,morphtarget_vertex:f0,normal_fragment_begin:d0,normal_fragment_maps:p0,normal_pars_fragment:m0,normal_pars_vertex:g0,normal_vertex:_0,normalmap_pars_fragment:x0,clearcoat_normal_fragment_begin:v0,clearcoat_normal_fragment_maps:y0,clearcoat_pars_fragment:M0,iridescence_pars_fragment:S0,opaque_fragment:b0,packing:w0,premultiplied_alpha_fragment:A0,project_vertex:T0,dithering_fragment:E0,dithering_pars_fragment:R0,roughnessmap_fragment:C0,roughnessmap_pars_fragment:I0,shadowmap_pars_fragment:P0,shadowmap_pars_vertex:L0,shadowmap_vertex:N0,shadowmask_pars_fragment:D0,skinbase_vertex:F0,skinning_pars_vertex:U0,skinning_vertex:O0,skinnormal_vertex:B0,specularmap_fragment:z0,specularmap_pars_fragment:k0,tonemapping_fragment:G0,tonemapping_pars_fragment:V0,transmission_fragment:H0,transmission_pars_fragment:W0,uv_pars_fragment:X0,uv_pars_vertex:q0,uv_vertex:Y0,worldpos_vertex:Z0,background_vert:J0,background_frag:$0,backgroundCube_vert:K0,backgroundCube_frag:Q0,cube_vert:j0,cube_frag:t_,depth_vert:e_,depth_frag:n_,distance_vert:i_,distance_frag:s_,equirect_vert:r_,equirect_frag:o_,linedashed_vert:a_,linedashed_frag:l_,meshbasic_vert:c_,meshbasic_frag:h_,meshlambert_vert:u_,meshlambert_frag:f_,meshmatcap_vert:d_,meshmatcap_frag:p_,meshnormal_vert:m_,meshnormal_frag:g_,meshphong_vert:__,meshphong_frag:x_,meshphysical_vert:v_,meshphysical_frag:y_,meshtoon_vert:M_,meshtoon_frag:S_,points_vert:b_,points_frag:w_,shadow_vert:A_,shadow_frag:T_,sprite_vert:E_,sprite_frag:R_},Yt={common:{diffuse:{value:new Re(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new he},alphaMap:{value:null},alphaMapTransform:{value:new he},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new he}},envmap:{envMap:{value:null},envMapRotation:{value:new he},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new he}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new he}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new he},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new he},normalScale:{value:new Nt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new he},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new he}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new he}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new he}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Re(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:[]},probesMin:{value:[]},probesMax:{value:[]},probesResolution:{value:[]}},points:{diffuse:{value:new Re(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new he},alphaTest:{value:0},uvTransform:{value:new he}},sprite:{diffuse:{value:new Re(16777215)},opacity:{value:1},center:{value:new Nt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new he},alphaMap:{value:null},alphaMapTransform:{value:new he},alphaTest:{value:0}}},oi={basic:{uniforms:un([Yt.common,Yt.specularmap,Yt.envmap,Yt.aomap,Yt.lightmap,Yt.fog]),vertexShader:ye.meshbasic_vert,fragmentShader:ye.meshbasic_frag},lambert:{uniforms:un([Yt.common,Yt.specularmap,Yt.envmap,Yt.aomap,Yt.lightmap,Yt.emissivemap,Yt.bumpmap,Yt.normalmap,Yt.displacementmap,Yt.fog,Yt.lights,{emissive:{value:new Re(0)},envMapIntensity:{value:1}}]),vertexShader:ye.meshlambert_vert,fragmentShader:ye.meshlambert_frag},phong:{uniforms:un([Yt.common,Yt.specularmap,Yt.envmap,Yt.aomap,Yt.lightmap,Yt.emissivemap,Yt.bumpmap,Yt.normalmap,Yt.displacementmap,Yt.fog,Yt.lights,{emissive:{value:new Re(0)},specular:{value:new Re(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:ye.meshphong_vert,fragmentShader:ye.meshphong_frag},standard:{uniforms:un([Yt.common,Yt.envmap,Yt.aomap,Yt.lightmap,Yt.emissivemap,Yt.bumpmap,Yt.normalmap,Yt.displacementmap,Yt.roughnessmap,Yt.metalnessmap,Yt.fog,Yt.lights,{emissive:{value:new Re(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:ye.meshphysical_vert,fragmentShader:ye.meshphysical_frag},toon:{uniforms:un([Yt.common,Yt.aomap,Yt.lightmap,Yt.emissivemap,Yt.bumpmap,Yt.normalmap,Yt.displacementmap,Yt.gradientmap,Yt.fog,Yt.lights,{emissive:{value:new Re(0)}}]),vertexShader:ye.meshtoon_vert,fragmentShader:ye.meshtoon_frag},matcap:{uniforms:un([Yt.common,Yt.bumpmap,Yt.normalmap,Yt.displacementmap,Yt.fog,{matcap:{value:null}}]),vertexShader:ye.meshmatcap_vert,fragmentShader:ye.meshmatcap_frag},points:{uniforms:un([Yt.points,Yt.fog]),vertexShader:ye.points_vert,fragmentShader:ye.points_frag},dashed:{uniforms:un([Yt.common,Yt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:ye.linedashed_vert,fragmentShader:ye.linedashed_frag},depth:{uniforms:un([Yt.common,Yt.displacementmap]),vertexShader:ye.depth_vert,fragmentShader:ye.depth_frag},normal:{uniforms:un([Yt.common,Yt.bumpmap,Yt.normalmap,Yt.displacementmap,{opacity:{value:1}}]),vertexShader:ye.meshnormal_vert,fragmentShader:ye.meshnormal_frag},sprite:{uniforms:un([Yt.sprite,Yt.fog]),vertexShader:ye.sprite_vert,fragmentShader:ye.sprite_frag},background:{uniforms:{uvTransform:{value:new he},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:ye.background_vert,fragmentShader:ye.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new he}},vertexShader:ye.backgroundCube_vert,fragmentShader:ye.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:ye.cube_vert,fragmentShader:ye.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:ye.equirect_vert,fragmentShader:ye.equirect_frag},distance:{uniforms:un([Yt.common,Yt.displacementmap,{referencePosition:{value:new k},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:ye.distance_vert,fragmentShader:ye.distance_frag},shadow:{uniforms:un([Yt.lights,Yt.fog,{color:{value:new Re(0)},opacity:{value:1}}]),vertexShader:ye.shadow_vert,fragmentShader:ye.shadow_frag}};oi.physical={uniforms:un([oi.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new he},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new he},clearcoatNormalScale:{value:new Nt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new he},diffuseRoughness:{value:0},diffuseRoughnessMap:{value:null},diffuseRoughnessMapTransform:{value:new he},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new he},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new he},sheen:{value:0},sheenColor:{value:new Re(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new he},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new he},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new he},transmissionSamplerSize:{value:new Nt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new he},attenuationDistance:{value:0},attenuationColor:{value:new Re(0)},specularColor:{value:new Re(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new he},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new he},anisotropyVector:{value:new Nt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new he}}]),vertexShader:ye.meshphysical_vert,fragmentShader:ye.meshphysical_frag};var Dl={r:0,b:0,g:0},C_=new fe,ld=new he;ld.set(-1,0,0,0,1,0,0,0,1);function I_(i,t,e,n,s,r){let o=new Re(0),a=s===!0?0:1,l,c,h=null,f=0,d=null;function u(_){let S=_.isScene===!0?_.background:null;if(S&&S.isTexture){let y=_.backgroundBlurriness>0;S=t.get(S,y)}return S}function m(_){let S=!1,y=u(_);y===null?p(o,a):y&&y.isColor&&(p(y,1),S=!0);let T=i.xr.getEnvironmentBlendMode();T==="additive"?e.buffers.color.setClear(0,0,0,1,r):T==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(i.autoClear||S)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function x(_,S){let y=u(S);y&&y.isCubeTexture?(c===void 0&&(c=new Mn(new ni(1,1,1),new mn({name:"BackgroundCubeMaterial",uniforms:cs(oi.backgroundCube.uniforms),vertexShader:oi.backgroundCube.vertexShader,fragmentShader:oi.backgroundCube.fragmentShader,side:gn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(T,A,v){this.matrixWorld.copyPosition(v.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=y,c.material.uniforms.backgroundBlurriness.value=S.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=S.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(C_.makeRotationFromEuler(S.backgroundRotation)).transpose(),y.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(ld),c.material.toneMapped=Te.getTransfer(y.colorSpace)!==Le,(h!==y||f!==y.version||d!==i.toneMapping)&&(c.material.needsUpdate=!0,h=y,f=y.version,d=i.toneMapping),c.layers.enableAll(),_.unshift(c,c.geometry,c.material,0,0,null)):y&&y.isTexture&&(l===void 0&&(l=new Mn(new ss(2,2),new mn({name:"BackgroundMaterial",uniforms:cs(oi.background.uniforms),vertexShader:oi.background.vertexShader,fragmentShader:oi.background.fragmentShader,side:ii,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=y,l.material.uniforms.backgroundIntensity.value=S.backgroundIntensity,l.material.toneMapped=Te.getTransfer(y.colorSpace)!==Le,y.matrixAutoUpdate===!0&&y.updateMatrix(),l.material.uniforms.uvTransform.value.copy(y.matrix),(h!==y||f!==y.version||d!==i.toneMapping)&&(l.material.needsUpdate=!0,h=y,f=y.version,d=i.toneMapping),l.layers.enableAll(),_.unshift(l,l.geometry,l.material,0,0,null))}function p(_,S){_.getRGB(Dl,dh(i)),e.buffers.color.setClear(Dl.r,Dl.g,Dl.b,S,r)}function g(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return o},setClearColor:function(_,S=1){o.set(_),a=S,p(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(_){a=_,p(o,a)},render:m,addToRenderList:x,dispose:g}}function P_(i,t){let e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=d(null),r=s,o=!1;function a(I,O,V,R,B){let G=!1,N=f(I,R,V,O);r!==N&&(r=N,c(r.object)),G=u(I,R,V,B),G&&m(I,R,V,B),B!==null&&t.update(B,i.ELEMENT_ARRAY_BUFFER),(G||o)&&(o=!1,y(I,O,V,R),B!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(B).buffer))}function l(){return i.createVertexArray()}function c(I){return i.bindVertexArray(I)}function h(I){return i.deleteVertexArray(I)}function f(I,O,V,R){let B=R.wireframe===!0,G=n[O.id];G===void 0&&(G={},n[O.id]=G);let N=I.isInstancedMesh===!0?I.id:0,X=G[N];X===void 0&&(X={},G[N]=X);let U=X[V.id];U===void 0&&(U={},X[V.id]=U);let Y=U[B];return Y===void 0&&(Y=d(l()),U[B]=Y),Y}function d(I){let O=[],V=[],R=[];for(let B=0;B<e;B++)O[B]=0,V[B]=0,R[B]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:O,enabledAttributes:V,attributeDivisors:R,object:I,attributes:{},index:null}}function u(I,O,V,R){let B=r.attributes,G=O.attributes,N=0,X=V.getAttributes();for(let U in X)if(X[U].location>=0){let tt=B[U],vt=G[U];if(vt===void 0&&(U==="instanceMatrix"&&I.instanceMatrix&&(vt=I.instanceMatrix),U==="instanceColor"&&I.instanceColor&&(vt=I.instanceColor)),tt===void 0||tt.attribute!==vt||vt&&tt.data!==vt.data)return!0;N++}return r.attributesNum!==N||r.index!==R}function m(I,O,V,R){let B={},G=O.attributes,N=0,X=V.getAttributes();for(let U in X)if(X[U].location>=0){let tt=G[U];tt===void 0&&(U==="instanceMatrix"&&I.instanceMatrix&&(tt=I.instanceMatrix),U==="instanceColor"&&I.instanceColor&&(tt=I.instanceColor));let vt={};vt.attribute=tt,tt&&tt.data&&(vt.data=tt.data),B[U]=vt,N++}r.attributes=B,r.attributesNum=N,r.index=R}function x(){let I=r.newAttributes;for(let O=0,V=I.length;O<V;O++)I[O]=0}function p(I){g(I,0)}function g(I,O){let V=r.newAttributes,R=r.enabledAttributes,B=r.attributeDivisors;V[I]=1,R[I]===0&&(i.enableVertexAttribArray(I),R[I]=1),B[I]!==O&&(i.vertexAttribDivisor(I,O),B[I]=O)}function _(){let I=r.newAttributes,O=r.enabledAttributes;for(let V=0,R=O.length;V<R;V++)O[V]!==I[V]&&(i.disableVertexAttribArray(V),O[V]=0)}function S(I,O,V,R,B,G,N){N===!0?i.vertexAttribIPointer(I,O,V,B,G):i.vertexAttribPointer(I,O,V,R,B,G)}function y(I,O,V,R){x();let B=R.attributes,G=V.getAttributes(),N=O.defaultAttributeValues;for(let X in G){let U=G[X];if(U.location>=0){let Y=B[X];if(Y===void 0&&(X==="instanceMatrix"&&I.instanceMatrix&&(Y=I.instanceMatrix),X==="instanceColor"&&I.instanceColor&&(Y=I.instanceColor)),Y!==void 0){let tt=Y.normalized,vt=Y.itemSize,Ft=t.get(Y);if(Ft===void 0)continue;let $=Ft.buffer,lt=Ft.type,yt=Ft.bytesPerElement,kt=lt===i.INT||lt===i.UNSIGNED_INT||Y.gpuType===Qa;if(Y.isInterleavedBufferAttribute){let et=Y.data,Zt=et.isInterleavedBuffer===!0?et.stride:et.itemSize,Xt=Y.offset;if(et.isInstancedInterleavedBuffer||et.isInstancedBufferAttribute){for(let at=0;at<U.locationSize;at++)g(U.location+at,et.meshPerAttribute);I.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=et.meshPerAttribute*et.count)}else for(let at=0;at<U.locationSize;at++)p(U.location+at);i.bindBuffer(i.ARRAY_BUFFER,$);for(let at=0;at<U.locationSize;at++)S(U.location+at,vt/U.locationSize,lt,tt,Zt*yt,(Xt+vt/U.locationSize*at)*yt,kt)}else{if(Y.isInstancedBufferAttribute){for(let et=0;et<U.locationSize;et++)g(U.location+et,Y.meshPerAttribute);I.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=Y.meshPerAttribute*Y.count)}else for(let et=0;et<U.locationSize;et++)p(U.location+et);i.bindBuffer(i.ARRAY_BUFFER,$);for(let et=0;et<U.locationSize;et++)S(U.location+et,vt/U.locationSize,lt,tt,vt*yt,vt/U.locationSize*et*yt,kt)}}else if(N!==void 0){let tt=N[X];if(tt!==void 0)switch(tt.length){case 2:i.vertexAttrib2fv(U.location,tt);break;case 3:i.vertexAttrib3fv(U.location,tt);break;case 4:i.vertexAttrib4fv(U.location,tt);break;default:i.vertexAttrib1fv(U.location,tt)}}}}_()}function T(){D();for(let I in n){let O=n[I];for(let V in O){let R=O[V];for(let B in R){let G=R[B];for(let N in G)h(G[N].object),delete G[N];delete R[B]}}delete n[I]}}function A(I){if(n[I.id]===void 0)return;let O=n[I.id];for(let V in O){let R=O[V];for(let B in R){let G=R[B];for(let N in G)h(G[N].object),delete G[N];delete R[B]}}delete n[I.id]}function v(I){for(let O in n){let V=n[O];for(let R in V){let B=V[R];if(B[I.id]===void 0)continue;let G=B[I.id];for(let N in G)h(G[N].object),delete G[N];delete B[I.id]}}}function b(I){for(let O in n){let V=n[O],R=I.isInstancedMesh===!0?I.id:0,B=V[R];if(B!==void 0){for(let G in B){let N=B[G];for(let X in N)h(N[X].object),delete N[X];delete B[G]}delete V[R],Object.keys(V).length===0&&delete n[O]}}}function D(){P(),o=!0,r!==s&&(r=s,c(r.object))}function P(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:a,reset:D,resetDefaultState:P,dispose:T,releaseStatesOfGeometry:A,releaseStatesOfObject:b,releaseStatesOfProgram:v,initAttributes:x,enableAttribute:p,disableUnusedAttributes:_}}function L_(i,t,e){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),e.update(c,n,1)}function o(l,c,h){h!==0&&(i.drawArraysInstanced(n,l,c,h),e.update(c,n,h))}function a(l,c,h){if(h===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,h);let d=0;for(let u=0;u<h;u++)d+=c[u];e.update(d,n,1)}this.setMode=s,this.render=r,this.renderInstances=o,this.renderMultiDraw=a}function N_(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let v=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(v.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function o(v){return!(v!==Yn&&n.convert(v)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(v){let b=v===qn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(v!==Pn&&v!==Xn&&!b&&n.convert(v)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE))}function l(v){if(v==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";v="mediump"}return v==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp",h=l(c);h!==c&&(ae("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);let f=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control"),d=e.logarithmicDepthBuffer===!0&&f===!1;e.reversedDepthBuffer===!0&&f===!1&&ae("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer."),e.logarithmicDepthBuffer===!0&&f===!0&&ae("WebGLRenderer: Logarithmic depth buffer is ignored when reversed depth buffer is enabled.");let u=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),m=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),x=i.getParameter(i.MAX_TEXTURE_SIZE),p=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),g=i.getParameter(i.MAX_VERTEX_ATTRIBS),_=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),S=i.getParameter(i.MAX_VARYING_VECTORS),y=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),T=i.getParameter(i.MAX_SAMPLES),A=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:a,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:u,maxVertexTextures:m,maxTextureSize:x,maxCubemapSize:p,maxAttributes:g,maxVertexUniforms:_,maxVaryings:S,maxFragmentUniforms:y,maxSamples:T,samples:A}}function D_(i){let t=this,e=null,n=0,s=!1,r=!1,o=new Hn,a=new he,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(f,d){let u=f.length!==0||d||n!==0||s;return s=d,n=f.length,u},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(f,d){e=h(f,d,0)},this.setState=function(f,d,u){let m=f.clippingPlanes,x=f.clipIntersection,p=f.clipShadows,g=i.get(f);if(!s||m===null||m.length===0||r&&!p)r?h(null):c();else{let _=r?0:n,S=_*4,y=g.clippingState||null;l.value=y,y=h(m,d,S,u);for(let T=0;T!==S;++T)y[T]=e[T];g.clippingState=y,this.numIntersection=x?this.numPlanes:0,this.numPlanes+=_}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(f,d,u,m){let x=f!==null?f.length:0,p=null;if(x!==0){if(p=l.value,m!==!0||p===null){let g=u+x*4,_=d.matrixWorldInverse;a.getNormalMatrix(_),(p===null||p.length<g)&&(p=new Float32Array(g));for(let S=0,y=u;S!==x;++S,y+=4)o.copy(f[S]).applyMatrix4(_,a),o.normal.toArray(p,y),p[y+3]=o.constant}l.value=p,l.needsUpdate=!0}return t.numPlanes=x,t.numIntersection=0,p}}var lo=class extends pn{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new Pr(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},s=new ni(5,5,5),r=new mn({name:"CubemapFromEquirect",uniforms:cs(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:gn,blending:rs});r.uniforms.tEquirect.value=e;let o=new Mn(s,r),a=e.minFilter;return e.minFilter===Mi&&(e.minFilter=dn),new qs(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){let r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,s);t.setRenderTarget(r)}},kf=256,F_=3,U_=20,cd=256,hd=16,O_=3,B_=new k,z_=new Re,Ul=class i{constructor(t){this._renderer=t,this._cubeSize=0,this._sourceTarget=null,this._cubeCamera=new qs(1,10,null),this._boxMesh=new Mn(new ni(5,5,5),null),this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null,this._integrationMaterial=null}fromScene(t,e=0,n=.1,s=100,r={}){let{size:o=256,position:a=B_}=r,l=this._renderer;this._setSize(o);let c=this._allocateTarget(),h=this._getSourceTarget(!0);e>0&&(h.texture.mipmapsAutoUpdate=!1);let f=l.autoClear,d=l.autoClearColor,u=l.autoClearDepth,m=l.autoClearStencil,x=t.background;l.autoClear=!0,l.autoClearColor=!0,l.autoClearDepth=!0,l.autoClearStencil=!0,x===null&&(t.background=l.getClearColor(z_));let p=new qs(n,s,h);return p.position.copy(a),p.update(l,t),l.autoClear=f,l.autoClearColor=d,l.autoClearDepth=u,l.autoClearStencil=m,t.background=x,e>0&&(h.texture.mipmapsAutoUpdate=!0,this._blur(c,e)),this._applyPMREM(c),c}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Hf(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Vf(),this._compileMaterial(this._equirectMaterial))}dispose(){this._sourceTarget!==null&&this._sourceTarget.dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._integrationMaterial!==null&&this._integrationMaterial.dispose(),this._boxMesh.geometry.dispose()}static lodToRoughness(t,e){return e>0?1-Math.sqrt(1-t/e):0}_setSize(t){this._cubeSize=Math.max(kf,Pf(t))}_fromTexture(t,e){t.mapping===as||t.mapping===$s?this._setSize(t.image.length===0?kf:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4);let n=e||this._allocateTarget();return this._textureToCubemap(t),this._applyPMREM(n),n}_allocateTarget(){let t=this._cubeSize,e=Gf(t,!1,!1),n=Math.log2(t)-F_;for(let s=0;s<=n;s++)e.texture.mipmaps.push({width:t>>s,height:t>>s});return e.texture.name="PMREM",e.texture.isPMREMTexture=!0,e}_getSourceTarget(t=!1){let e=this._cubeSize,n=this._sourceTarget;return(n===null||n.width!==e||t&&n.depthBuffer===!1)&&(n!==null&&n.dispose(),this._sourceTarget=Gf(e,!0,t)),this._sourceTarget}_compileMaterial(t){this._boxMesh.material=t,this._renderer.compile(this._boxMesh,this._cubeCamera.children[0])}_renderCube(t,e,n){let s=this._boxMesh,r=this._cubeCamera;s.material=n,r.renderTarget=t,r.activeMipmapLevel=e;let o=t.width>>e;t.viewport.set(0,0,o,o),r.update(this._renderer,s),t.viewport.set(0,0,t.width,t.height)}_textureToCubemap(t){let e;t.mapping===as||t.mapping===$s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Hf()),e=this._cubemapMaterial,e.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):(this._equirectMaterial===null&&(this._equirectMaterial=Vf()),e=this._equirectMaterial),e.uniforms.envMap.value=t,this._renderCube(this._getSourceTarget(),0,e)}_applyPMREM(t){this._ggxMaterial===null&&(this._ggxMaterial=k_(),this._integrationMaterial=G_());let e=this._cubeSize,n=t.texture.mipmaps.length-1,s=this._ggxMaterial.uniforms;s.envMap.value=this._sourceTarget.texture;let r=this._integrationMaterial.uniforms;r.envMap.value=this._sourceTarget.texture,r.sourceLod.value=Math.log2(e/hd);for(let o=0;o<=n;o++){let a=i.lodToRoughness(o,n);if(o>n-O_)r.roughness.value=a,this._renderCube(t,o,this._integrationMaterial);else{let l=a>0?Math.log2(e)+.5*Math.log2(6/(cd*Math.pow(a,4)))+.5:0;s.roughness.value=a,s.lodBias.value=l,this._renderCube(t,o,this._ggxMaterial)}}}_blur(t,e){this._blurMaterial===null&&(this._blurMaterial=V_());let n=this._blurMaterial,s=n.uniforms,r=this._sourceTarget;s.sigma.value=Math.min(e,Math.PI)/Math.SQRT2,s.envMap.value=r.texture,this._renderCube(t,0,n),s.envMap.value=t.texture,this._renderCube(r,0,n)}};function Gf(i,t,e){return new lo(i,{minFilter:Mi,generateMipmaps:t,type:qn,colorSpace:Sr,depthBuffer:e})}function co(i,t,e){return new mn({name:i,uniforms:t,vertexShader:ye.cube_vert,fragmentShader:e,side:gn,blending:rs,depthTest:!1,depthWrite:!1})}function k_(){return co("PMREMGGXConvolution",{envMap:{value:null},roughness:{value:0},lodBias:{value:0}},`

		#define GGX_SAMPLES ${cd}u

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float lodBias;

		#include <common>

		// Van der Corput radical inverse
		float radicalInverse_VdC( uint bits ) {

			bits = ( bits << 16u ) | ( bits >> 16u );
			bits = ( ( bits & 0x55555555u ) << 1u ) | ( ( bits & 0xAAAAAAAAu ) >> 1u );
			bits = ( ( bits & 0x33333333u ) << 2u ) | ( ( bits & 0xCCCCCCCCu ) >> 2u );
			bits = ( ( bits & 0x0F0F0F0Fu ) << 4u ) | ( ( bits & 0xF0F0F0F0u ) >> 4u );
			bits = ( ( bits & 0x00FF00FFu ) << 8u ) | ( ( bits & 0xFF00FF00u ) >> 8u );
			return float( bits ) * 2.3283064365386963e-10; // / 0x100000000

		}

		// Hammersley sequence
		vec2 hammersley( uint i, uint N ) {

			return vec2( float( i ) / float( N ), radicalInverse_VdC( i ) );

		}

		void main() {

			vec3 N = normalize( vWorldDirection );

			// For very low roughness, just sample the environment directly
			if ( roughness < 0.001 ) {

				gl_FragColor = vec4( textureLod( envMap, N, 0.0 ).rgb, 1.0 );
				return;

			}

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			// Tangent space basis for VNDF sampling
			vec3 up = abs( N.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, N ) );
			vec3 bitangent = cross( N, tangent );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			for ( uint i = 0u; i < GGX_SAMPLES; i ++ ) {

				vec2 Xi = hammersley( i, GGX_SAMPLES );

				// With V = N, sample the reflected direction directly.
				float invQ = 1.0 / ( 1.0 - Xi.x + alpha2 * Xi.x );
				float NdotL = ( 1.0 - Xi.x - alpha2 * Xi.x ) * invQ;

				if ( NdotL > 0.0 ) {

					float phi = 2.0 * PI * Xi.y;
					float sinTheta = 2.0 * alpha * sqrt( Xi.x * ( 1.0 - Xi.x ) ) * invQ;
					vec3 L = N * NdotL + ( tangent * cos( phi ) + bitangent * sin( phi ) ) * sinTheta;

					// Match the source mip to the sample's solid angle. The terms
					// independent of the sample are precomputed in lodBias.
					float d = alpha2 * invQ;
					float lod = max( log2( d ) + lodBias, 0.0 );

					// Weight by NdotL for the split-sum approximation
					prefilteredColor += textureLod( envMap, L, lod ).rgb * NdotL;
					totalWeight += NdotL;

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function G_(){return co("PMREMGGXIntegration",{envMap:{value:null},roughness:{value:0},sourceLod:{value:0},sourceSize:{value:hd}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float sourceLod;
		uniform int sourceSize;

		void main() {

			vec3 N = normalize( vWorldDirection );

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			float texelSize = 2.0 / float( sourceSize );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			// Pair opposite texels: only the one in N's hemisphere contributes.
			for ( int face = 0; face < 3; face ++ ) {

				for ( int y = 0; y < sourceSize; y ++ ) {

					for ( int x = 0; x < sourceSize; x ++ ) {

						vec2 uv = ( vec2( x, y ) + 0.5 ) * texelSize - 1.0;
						vec3 texelDirection = face == 0 ? vec3( 1.0, uv ) : ( face == 1 ? vec3( uv.x, 1.0, uv.y ) : vec3( uv, 1.0 ) );

						float invDistance = inversesqrt( 1.0 + dot( uv, uv ) );
						float NdotL = dot( N, texelDirection );
						texelDirection *= NdotL < 0.0 ? - 1.0 : 1.0;
						NdotL = abs( NdotL ) * invDistance;

						// With V = N, NdotH squared is ( 1 + NdotL ) / 2. Common factors
						// in the GGX distribution and texel solid angle cancel when normalized.
						float d = 1.0 + alpha2 + ( alpha2 - 1.0 ) * NdotL;
						float weight = NdotL * invDistance * invDistance * invDistance / ( d * d );

						prefilteredColor += textureLod( envMap, texelDirection, sourceLod ).rgb * weight;
						totalWeight += weight;

					}

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function V_(){return co("PMREMSphericalGaussianBlur",{envMap:{value:null},sigma:{value:0}},`

		#define SAMPLES ${U_}
		#define GOLDEN_ANGLE 2.39996322973

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float sigma;

		#include <common>

		void main() {

			vec3 outputDirection = normalize( vWorldDirection );

			vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, outputDirection ) );
			vec3 bitangent = cross( outputDirection, tangent );

			// Truncate the kernel at three standard deviations or at the antipode.
			float thetaMax = min( 3.0 * sigma, PI );
			float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

			vec3 accumColor = vec3( 0.0 );
			float accumWeight = 0.0;

			for ( int i = 0; i < SAMPLES; i ++ ) {

				// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
				float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
				float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
				float phi = float( i ) * GOLDEN_ANGLE;

				vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
				vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

				// Correct the planar sample density to solid angle.
				float weight = sin( theta ) / theta;

				accumColor += weight * textureLod( envMap, sampleDirection, 0.0 ).rgb;
				accumWeight += weight;

			}

			gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

		}
	`)}function Vf(){return co("PMREMEquirectangularToCubemap",{envMap:{value:null}},`

		varying vec3 vWorldDirection;

		uniform sampler2D envMap;

		#include <common>

		void main() {

			// Average four subpixel samples to preserve small, bright features.
			vec3 direction = normalize( vWorldDirection );
			vec3 dx = dFdx( direction ) * 0.25;
			vec3 dy = dFdy( direction ) * 0.25;

			vec3 color = textureLod( envMap, equirectUv( normalize( direction - dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction - dx + dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx + dy ) ), 0.0 ).rgb;
			gl_FragColor = vec4( color * 0.25, 1.0 );

		}
	`)}function Hf(){return co("PMREMCubemapToCubemap",{envMap:{value:null},flipEnvMap:{value:-1}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float flipEnvMap;

		void main() {

			gl_FragColor = vec4( textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) ).rgb, 1.0 );

		}
	`)}function H_(i){let t=new WeakMap,e=new WeakMap,n=null;function s(d,u=!1){return d==null?null:u?o(d):r(d)}function r(d){if(d&&d.isTexture){let u=d.mapping;if(u===Ja||u===$a)if(t.has(d)){let m=t.get(d).texture;return a(m,d.mapping)}else{let m=d.image;if(m&&m.height>0){let x=new lo(m.height);return x.fromEquirectangularTexture(i,d),t.set(d,x),d.addEventListener("dispose",c),a(x.texture,d.mapping)}else return null}}return d}function o(d){if(d&&d.isTexture&&d.isPMREMTexture!==!0){let u=d.mapping,m=u===Ja||u===$a,x=u===as||u===$s;if(m||x){let p=e.get(d),g=p!==void 0?p.texture.pmremVersion:0;if(d.isRenderTargetTexture&&d.pmremVersion!==g)return n===null&&(n=new Ul(i)),p=m?n.fromEquirectangular(d,p):n.fromCubemap(d,p),p.texture.pmremVersion=d.pmremVersion,e.set(d,p),p.texture;if(p!==void 0)return p.texture;{let _=d.image;return m&&_&&_.height>0||x&&_&&l(_)?(n===null&&(n=new Ul(i)),p=m?n.fromEquirectangular(d):n.fromCubemap(d),p.texture.pmremVersion=d.pmremVersion,e.set(d,p),d.addEventListener("dispose",h),p.texture):null}}}return d}function a(d,u){return u===Ja?d.mapping=as:u===$a&&(d.mapping=$s),d}function l(d){let u=0,m=6;for(let x=0;x<m;x++)d[x]!==void 0&&u++;return u===m}function c(d){let u=d.target;u.removeEventListener("dispose",c);let m=t.get(u);m!==void 0&&(t.delete(u),m.dispose())}function h(d){let u=d.target;u.removeEventListener("dispose",h);let m=e.get(u);m!==void 0&&(e.delete(u),m.dispose())}function f(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:f}}function W_(i){let t={};function e(n){if(t[n]!==void 0)return t[n];let s=i.getExtension(n);return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let s=e(n);return s===null&&xr("WebGLRenderer: "+n+" extension not supported."),s}}}function X_(i,t,e,n){let s={},r=new WeakMap,o=new FinalizationRegistry(m=>delete s[m]);function a(m){l(m.target)}function l(m){m.index!==null&&t.remove(m.index);for(let p in m.attributes)t.remove(m.attributes[p]);m.removeEventListener("dispose",a),delete s[m.id],o.unregister(m);let x=r.get(m);x&&(t.remove(x),r.delete(m)),n.releaseStatesOfGeometry(m),m.isInstancedBufferGeometry===!0&&delete m._maxInstanceCount,e.memory.geometries--}function c(m,x){return s[x.id]!==void 0||(x.addEventListener("dispose",a),s[x.id]=new WeakRef(x),o.register(x,x.id,x),e.memory.geometries++),x}function h(m){let x=m.attributes;for(let p in x)t.update(x[p],i.ARRAY_BUFFER)}function f(m){let x=m.index,p=m.attributes.position,g=0;if(p===void 0)return;let _=x!==null?x.array.length:p.array.length/3-1,S=p.count>=65535?Cr:Rr,y=new S(Math.ceil(_/3)*6,1),T=y.array;if(x!==null){let v=x.array;g=x.version;for(let b=0,D=0;b<_;b+=3){let P=v[b+0],I=v[b+1],O=v[b+2];T[D++]=P,T[D++]=I,T[D++]=I,T[D++]=O,T[D++]=O,T[D++]=P}}else{g=p.version;for(let v=0,b=0;v<_;v+=3){let D=v+0,P=v+1,I=v+2;T[b++]=D,T[b++]=P,T[b++]=P,T[b++]=I,T[b++]=I,T[b++]=D}}y.version=g;let A=r.get(m);A&&t.remove(A),r.set(m,y)}function d(m){let x=r.get(m);if(x){let p=m.index;p!==null&&x.version<p.version&&f(m)}else f(m);return r.get(m)}function u(){for(let m in s){let x=s[m].deref();x!==void 0&&l(x)}}return{get:c,update:h,getWireframeAttribute:d,dispose:u}}function q_(i,t,e){let n;function s(f){n=f}let r,o;function a(f){r=f.type,o=f.bytesPerElement}function l(f,d){i.drawElements(n,d,r,f*o),e.update(d,n,1)}function c(f,d,u){u!==0&&(i.drawElementsInstanced(n,d,r,f*o,u),e.update(d,n,u))}function h(f,d,u){if(u===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,d,0,r,f,0,u);let x=0;for(let p=0;p<u;p++)x+=d[p];e.update(x,n,1)}this.setMode=s,this.setIndex=a,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function Y_(i){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case i.TRIANGLES:e.triangles+=a*(r/3);break;case i.LINES:e.lines+=a*(r/2);break;case i.LINE_STRIP:e.lines+=a*(r-1);break;case i.LINE_LOOP:e.lines+=a*r;break;case i.POINTS:e.points+=a*r;break;default:ce("WebGLInfo: Unknown draw mode:",o);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function Z_(i,t,e){let n=new WeakMap,s=new We;function r(o,a,l){let c=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,f=h!==void 0?h.length:0,d=n.get(a);if(d===void 0||d.count!==f){let D=function(){v.dispose(),n.delete(a),a.removeEventListener("dispose",D)};d!==void 0&&d.texture.dispose();let u=a.morphAttributes.position!==void 0,m=a.morphAttributes.normal!==void 0,x=a.morphAttributes.color!==void 0,p=a.morphAttributes.position||[],g=a.morphAttributes.normal||[],_=a.morphAttributes.color||[],S=0;u===!0&&(S=1),m===!0&&(S=2),x===!0&&(S=3);let y=a.attributes.position.count*S,T=1;y>t.maxTextureSize&&(T=Math.ceil(y/t.maxTextureSize),y=t.maxTextureSize);let A=new Float32Array(y*T*4*f),v=new Tr(A,y,T,f);v.type=Xn,v.needsUpdate=!0;let b=S*4;for(let P=0;P<f;P++){let I=p[P],O=g[P],V=_[P],R=y*T*4*P;for(let B=0;B<I.count;B++){let G=B*b;u===!0&&(s.fromBufferAttribute(I,B),A[R+G+0]=s.x,A[R+G+1]=s.y,A[R+G+2]=s.z,A[R+G+3]=0),m===!0&&(s.fromBufferAttribute(O,B),A[R+G+4]=s.x,A[R+G+5]=s.y,A[R+G+6]=s.z,A[R+G+7]=0),x===!0&&(s.fromBufferAttribute(V,B),A[R+G+8]=s.x,A[R+G+9]=s.y,A[R+G+10]=s.z,A[R+G+11]=V.itemSize===4?s.w:1)}}d={count:f,texture:v,size:new Nt(y,T)},n.set(a,d),a.addEventListener("dispose",D)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",o.morphTexture,e);else{let u=0;for(let x=0;x<c.length;x++)u+=c[x];let m=a.morphTargetsRelative?1:1-u;l.getUniforms().setValue(i,"morphTargetBaseInfluence",m),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",d.texture,e),l.getUniforms().setValue(i,"morphTargetsTextureSize",d.size)}return{update:r}}function J_(i,t,e,n,s){let r=new WeakMap;function o(c){let h=s.render.frame,f=c.geometry,d=t.get(c,f);if(r.get(d)!==h&&(t.update(d),r.set(d,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(e.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){let u=c.skeleton;r.get(u)!==h&&(u.update(),r.set(u,h))}return d}function a(){r=new WeakMap}function l(c){let h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),e.remove(h.instanceMatrix),h.instanceColor!==null&&e.remove(h.instanceColor)}return{update:o,dispose:a}}var $_={[Wc]:"LINEAR_TONE_MAPPING",[Xc]:"REINHARD_TONE_MAPPING",[qc]:"CINEON_TONE_MAPPING",[Yc]:"ACES_FILMIC_TONE_MAPPING",[Jc]:"AGX_TONE_MAPPING",[$c]:"NEUTRAL_TONE_MAPPING",[Zc]:"CUSTOM_TONE_MAPPING"};function K_(i,t,e,n,s,r){let o=new pn(t,e,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),a=null,l=null,c=null,h=new ze;h.setAttribute("position",new Ee([-1,3,0,-1,-1,0,3,-1,0],3)),h.setAttribute("uv",new Ee([0,2,0,0,2,0],2));let f=new Na({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),d=new Mn(h,f),u=new qa(-1,1,1,-1,0,1),m=null,x=null,p=!1,g,_=null,S=[],y=!1;this.setSize=function(T,A){o.setSize(T,A),a!==null&&a.setSize(T,A),l!==null&&l.setSize(T,A);for(let v=0;v<S.length;v++){let b=S[v];b.setSize&&b.setSize(T,A)}},this.setEffects=function(T){S=T,y=S.length>0&&S[0].isRenderPass===!0;let A=o.width,v=o.height;S.length>0&&a===null&&(a=new pn(A,v,{type:qn,depthBuffer:!1,stencilBuffer:!1}),l=new pn(A,v,{type:qn,depthBuffer:!1,stencilBuffer:!1}));let b=s===!0&&S.some(D=>D.needsDepthTexture===!0);b!==(o.depthTexture!==null)&&(b===!0&&c===null&&(c=new yi(A,v),r===!0&&(c.format=Si,c.type=ls)),o.dispose(),o.depthTexture=b?c:null,o.resolveDepthBuffer=b,o.storeMultisampledDepthBuffer=b);for(let D=0;D<S.length;D++){let P=S[D];P.setSize&&P.setSize(A,v),b&&P.needsDepthTexture===!0&&P.setDepthTexture&&P.setDepthTexture(c)}},this.begin=function(T,A){if(p||T.toneMapping===si&&S.length===0)return!1;if(_=A,A!==null){let v=A.width,b=A.height;(o.width!==v||o.height!==b)&&this.setSize(v,b)}return y===!1&&T.setRenderTarget(o),g=T.toneMapping,T.toneMapping=si,!0},this.hasRenderPass=function(){return y},this.end=function(T,A){T.toneMapping=g,p=!0;let v=o,b=a;for(let D=0;D<S.length;D++){let P=S[D];P.enabled!==!1&&(P.render(T,b,v,A),P.needsSwap!==!1&&(v=b,b=b===a?l:a))}if(m!==T.outputColorSpace||x!==T.toneMapping){m=T.outputColorSpace,x=T.toneMapping,f.defines={},Te.getTransfer(m)===Le&&(f.defines.SRGB_TRANSFER="");let D=$_[x];D&&(f.defines[D]=""),f.needsUpdate=!0}f.uniforms.tDiffuse.value=v.texture,T.setRenderTarget(_),T.render(d,u),_=null,p=!1},this.isCompositing=function(){return p},this.dispose=function(){o.dispose(),a!==null&&a.dispose(),l!==null&&l.dispose(),h.dispose(),f.dispose()}}var ud=new yn,fd=new yi(1,1),dd=new Lr(1),pd=new Tr,md=new ya,gd=new Pr,Wf=[],Xf=[],qf=new Float32Array(16),Yf=new Float32Array(9),Zf=new Float32Array(4);function tr(i,t,e){let n=i[0];if(n<=0||n>0)return i;let s=t*e,r=Wf[s];if(r===void 0&&(r=new Float32Array(s),Wf[s]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,i[o].toArray(r,a)}return r}function en(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function nn(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function Bl(i,t){let e=Xf[t];e===void 0&&(e=new Int32Array(t),Xf[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function Q_(i,t){let e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function j_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(en(e,t))return;i.uniform2fv(this.addr,t),nn(e,t)}}function tx(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(en(e,t))return;i.uniform3fv(this.addr,t),nn(e,t)}}function ex(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(en(e,t))return;i.uniform4fv(this.addr,t),nn(e,t)}}function nx(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(en(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),nn(e,t)}else{if(en(e,n))return;Zf.set(n),i.uniformMatrix2fv(this.addr,!1,Zf),nn(e,n)}}function ix(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(en(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),nn(e,t)}else{if(en(e,n))return;Yf.set(n),i.uniformMatrix3fv(this.addr,!1,Yf),nn(e,n)}}function sx(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(en(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),nn(e,t)}else{if(en(e,n))return;qf.set(n),i.uniformMatrix4fv(this.addr,!1,qf),nn(e,n)}}function rx(i,t){let e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function ox(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(en(e,t))return;i.uniform2iv(this.addr,t),nn(e,t)}}function ax(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(en(e,t))return;i.uniform3iv(this.addr,t),nn(e,t)}}function lx(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(en(e,t))return;i.uniform4iv(this.addr,t),nn(e,t)}}function cx(i,t){let e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function hx(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(en(e,t))return;i.uniform2uiv(this.addr,t),nn(e,t)}}function ux(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(en(e,t))return;i.uniform3uiv(this.addr,t),nn(e,t)}}function fx(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(en(e,t))return;i.uniform4uiv(this.addr,t),nn(e,t)}}function zl(i){return i.version===0&&(i.compareFunction=lh,i.needsUpdate=!0),i}function dx(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?r=zl(fd):r=ud,e.setTexture2D(t||r,s)}function px(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||md,s)}function mx(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_CUBE_SHADOW?r=zl(dd):r=gd,e.setTextureCube(t||r,s)}function gx(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||pd,s)}function _x(i){switch(i){case 5126:return Q_;case 35664:return j_;case 35665:return tx;case 35666:return ex;case 35674:return nx;case 35675:return ix;case 35676:return sx;case 5124:case 35670:return rx;case 35667:case 35671:return ox;case 35668:case 35672:return ax;case 35669:case 35673:return lx;case 5125:return cx;case 36294:return hx;case 36295:return ux;case 36296:return fx;case 35678:case 36198:case 36298:case 36306:case 35682:return dx;case 35679:case 36299:case 36307:return px;case 35680:case 36300:case 36308:case 36293:return mx;case 36289:case 36303:case 36311:case 36292:return gx}}function xx(i,t){i.uniform1fv(this.addr,t)}function vx(i,t){let e=tr(t,this.size,2);i.uniform2fv(this.addr,e)}function yx(i,t){let e=tr(t,this.size,3);i.uniform3fv(this.addr,e)}function Mx(i,t){let e=tr(t,this.size,4);i.uniform4fv(this.addr,e)}function Sx(i,t){let e=tr(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function bx(i,t){let e=tr(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function wx(i,t){let e=tr(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function Ax(i,t){i.uniform1iv(this.addr,t)}function Tx(i,t){i.uniform2iv(this.addr,t)}function Ex(i,t){i.uniform3iv(this.addr,t)}function Rx(i,t){i.uniform4iv(this.addr,t)}function Cx(i,t){i.uniform1uiv(this.addr,t)}function Ix(i,t){i.uniform2uiv(this.addr,t)}function Px(i,t){i.uniform3uiv(this.addr,t)}function Lx(i,t){i.uniform4uiv(this.addr,t)}function Nx(i,t,e){let n=this.cache,s=t.length,r=Bl(e,s);en(n,r)||(i.uniform1iv(this.addr,r),nn(n,r));let o;this.type===i.SAMPLER_2D_SHADOW?o=zl(fd):o=ud;for(let a=0;a!==s;++a)e.setTexture2D(t[a]||o,r[a])}function Dx(i,t,e){let n=this.cache,s=t.length,r=Bl(e,s);en(n,r)||(i.uniform1iv(this.addr,r),nn(n,r));for(let o=0;o!==s;++o)e.setTexture3D(t[o]||md,r[o])}function Fx(i,t,e){let n=this.cache,s=t.length,r=Bl(e,s);en(n,r)||(i.uniform1iv(this.addr,r),nn(n,r));let o;this.type===i.SAMPLER_CUBE_SHADOW?o=zl(dd):o=gd;for(let a=0;a!==s;++a)e.setTextureCube(t[a]||o,r[a])}function Ux(i,t,e){let n=this.cache,s=t.length,r=Bl(e,s);en(n,r)||(i.uniform1iv(this.addr,r),nn(n,r));for(let o=0;o!==s;++o)e.setTexture2DArray(t[o]||pd,r[o])}function Ox(i){switch(i){case 5126:return xx;case 35664:return vx;case 35665:return yx;case 35666:return Mx;case 35674:return Sx;case 35675:return bx;case 35676:return wx;case 5124:case 35670:return Ax;case 35667:case 35671:return Tx;case 35668:case 35672:return Ex;case 35669:case 35673:return Rx;case 5125:return Cx;case 36294:return Ix;case 36295:return Px;case 36296:return Lx;case 35678:case 36198:case 36298:case 36306:case 35682:return Nx;case 35679:case 36299:case 36307:return Dx;case 35680:case 36300:case 36308:case 36293:return Fx;case 36289:case 36303:case 36311:case 36292:return Ux}}var wh=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=_x(e.type)}},Ah=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=Ox(e.type)}},Th=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let s=this.seq;for(let r=0,o=s.length;r!==o;++r){let a=s[r];a.setValue(t,e[a.id],n)}}},Sh=/(\w+)(\])?(\[|\.)?/g;function Jf(i,t){i.seq.push(t),i.map[t.id]=t}function Bx(i,t,e){let n=i.name,s=n.length;for(Sh.lastIndex=0;;){let r=Sh.exec(n),o=Sh.lastIndex,a=r[1],l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===s){Jf(e,c===void 0?new wh(a,i,t):new Ah(a,i,t));break}else{let f=e.map[a];f===void 0&&(f=new Th(a),Jf(e,f)),e=f}}}var js=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let o=0;o<n;++o){let a=t.getActiveUniform(e,o),l=t.getUniformLocation(e,a.name);Bx(a,l,this)}let s=[],r=[];for(let o of this.seq)o.type===t.SAMPLER_2D_SHADOW||o.type===t.SAMPLER_CUBE_SHADOW||o.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(o):r.push(o);s.length>0&&(this.seq=s.concat(r))}setValue(t,e,n,s){let r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){let s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,o=e.length;r!==o;++r){let a=e[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(t,l.value,s)}}static seqWithValue(t,e){let n=[];for(let s=0,r=t.length;s!==r;++s){let o=t[s];o.id in e&&n.push(o)}return n}};function $f(i,t,e){let n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}var zx=37297,kx=0;function Gx(i,t){let e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=s;o<r;o++){let a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}var Kf=new he;function Vx(i){Te._getMatrix(Kf,Te.workingColorSpace,i);let t=`mat3( ${Kf.elements.map(e=>e.toFixed(4))} )`;switch(Te.getTransfer(i)){case br:return[t,"LinearTransferOETF"];case Le:return[t,"sRGBTransferOETF"];default:return ae("WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function Qf(i,t,e){let n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";let o=/ERROR: 0:(\d+)/.exec(r);if(o){let a=parseInt(o[1]);return e.toUpperCase()+`

`+r+`

`+Gx(i.getShaderSource(t),a)}else return r}function Hx(i,t){let e=Vx(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( ${e[0]} * value.rgb, value.a ) );`,"}"].join(`
`)}var Wx={[Wc]:"Linear",[Xc]:"Reinhard",[qc]:"Cineon",[Yc]:"ACESFilmic",[Jc]:"AgX",[$c]:"Neutral",[Zc]:"Custom"};function Xx(i,t){let e=Wx[t];return e===void 0?(ae("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var Fl=new k;function qx(){Te.getLuminanceCoefficients(Fl);let i=Fl.x.toFixed(4),t=Fl.y.toFixed(4),e=Fl.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Yx(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(ao).join(`
`)}function Zx(i){let t=[];for(let e in i){let n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Jx(i,t){let e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(t,s),o=r.name,a=1;r.type===i.FLOAT_MAT2&&(a=2),r.type===i.FLOAT_MAT3&&(a=3),r.type===i.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:i.getAttribLocation(t,o),locationSize:a}}return e}function ao(i){return i!==""}function jf(i,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows).replace(/NUM_LIGHT_PROBE_GRIDS/g,t.numLightProbeGrids)}function td(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var $x=/^[ \t]*#include +<([\w\d./]+)>/gm;function Eh(i){return i.replace($x,Kx)}function Kx(i,t){let e=ye[t];if(e===void 0)throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">");return Eh(e)}var Qx=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function ed(i){return i.replace(Qx,jx)}function jx(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function nd(i){let t=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?t+=`
#define HIGH_PRECISION`:i.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}var tv={[Qr]:"SHADOWMAP_TYPE_PCF",[Ys]:"SHADOWMAP_TYPE_VSM"};function ev(i){return tv[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var nv={[$s]:"ENVMAP_MODE_REFRACTION"};function iv(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":nv[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}var sv={[Hc]:"ENVMAP_BLENDING_MULTIPLY",[mf]:"ENVMAP_BLENDING_MIX",[gf]:"ENVMAP_BLENDING_ADD"};function rv(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":sv[i.combine]||"ENVMAP_BLENDING_NONE"}function ov(i,t,e,n){let s=i.getContext(),r=e.defines,o=e.vertexShader,a=e.fragmentShader,l=ev(e),c=e.envMapPMREM===!0?"ENVMAP_TYPE_PMREM":"ENVMAP_TYPE_CUBE",h=iv(e),f=rv(e),d=Yx(e),u=Zx(r),m=s.createProgram(),x,p,g=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(x=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u].filter(ao).join(`
`),x.length>0&&(x+=`
`),p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u].filter(ao).join(`
`),p.length>0&&(p+=`
`)):(x=[nd(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.diffuseRoughnessMapUv?"#define DIFFUSE_ROUGHNESSMAP_UV "+e.diffuseRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(ao).join(`
`),p=[nd(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+f:"",e.envMapPMREM?"#define ENVMAP_MAX_LOD "+e.envMapMaxLod+".0":"",e.envMapPMREM?"#define ENVMAP_SIZE "+e.envMapSize+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.diffuseRoughness?"#define USE_DIFFUSE_ROUGHNESS":"",e.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.retroreflection?"#define USE_RETROREFLECTION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==si?"#define TONE_MAPPING":"",e.toneMapping!==si?ye.tonemapping_pars_fragment:"",e.toneMapping!==si?Xx("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",ye.colorspace_pars_fragment,Hx("linearToOutputTexel",e.outputColorSpace),qx(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(ao).join(`
`)),o=Eh(o),o=jf(o,e),o=td(o,e),a=Eh(a),a=jf(a,e),a=td(a,e),o=ed(o),a=ed(a),e.isRawShaderMaterial!==!0&&(g=`#version 300 es
`,x=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+x,p=["#define varying in",e.glslVersion===ch?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===ch?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let _=g+x+o,S=g+p+a,y=$f(s,s.VERTEX_SHADER,_),T=$f(s,s.FRAGMENT_SHADER,S);s.attachShader(m,y),s.attachShader(m,T),e.index0AttributeName!==void 0?s.bindAttribLocation(m,0,e.index0AttributeName):e.hasPositionAttribute===!0&&s.bindAttribLocation(m,0,"position"),s.linkProgram(m);function A(P){if(i.debug.checkShaderErrors){let I=s.getProgramInfoLog(m)||"",O=s.getShaderInfoLog(y)||"",V=s.getShaderInfoLog(T)||"",R=I.trim(),B=O.trim(),G=V.trim(),N=!0,X=!0;if(s.getProgramParameter(m,s.LINK_STATUS)===!1)if(N=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,m,y,T);else{let U=Qf(s,y,"vertex"),Y=Qf(s,T,"fragment");ce("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(m,s.VALIDATE_STATUS)+`

Material Name: `+P.name+`
Material Type: `+P.type+`

Program Info Log: `+R+`
`+U+`
`+Y)}else R!==""?ae("WebGLProgram: Program Info Log:",R):(B===""||G==="")&&(X=!1);X&&(P.diagnostics={runnable:N,programLog:R,vertexShader:{log:B,prefix:x},fragmentShader:{log:G,prefix:p}})}s.deleteShader(y),s.deleteShader(T),v=new js(s,m),b=Jx(s,m)}let v;this.getUniforms=function(){return v===void 0&&A(this),v};let b;this.getAttributes=function(){return b===void 0&&A(this),b};let D=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return D===!1&&(D=s.getProgramParameter(m,zx)),D},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(m),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=kx++,this.cacheKey=t,this.usedTimes=1,this.program=m,this.vertexShader=y,this.fragmentShader=T,this}var av=0,Rh=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){let s=this._getShaderCacheForMaterial(t);return s.has(e)===!1&&(s.add(e),e.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new Ch(t),e.set(t,n)),n}},Ch=class{constructor(t){this.id=av++,this.code=t,this.usedTimes=0}};function lv(i){return i===ki||i===so||i===ro}function cv(i,t,e,n,s,r){let o=new Bs,a=new Rh,l=new Set,c=[],h=new Map,f=n.logarithmicDepthBuffer,d={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function u(v){return l.add(v),v===0?"uv":`uv${v}`}function m(v,b,D,P,I,O){let V=P.fog,R=I.geometry,B=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?P.environment:null,G=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap,N=t.get(v.envMap||B,G),X=d[v.type],U=n.precision;v.precision!==null&&(U=n.getMaxPrecision(v.precision),U!==v.precision&&ae("WebGLProgram.getParameters:",v.precision,"not supported, using",U,"instead."));let Y=R.morphAttributes.position||R.morphAttributes.normal||R.morphAttributes.color,tt=Y!==void 0?Y.length:0,vt=0;R.morphAttributes.position!==void 0&&(vt=1),R.morphAttributes.normal!==void 0&&(vt=2),R.morphAttributes.color!==void 0&&(vt=3);let Ft,$,lt,yt;if(X){let Wt=oi[X];Ft=Wt.vertexShader,$=Wt.fragmentShader}else{Ft=v.vertexShader,$=v.fragmentShader;let Wt=a.getVertexShaderStage(v),Ce=a.getFragmentShaderStage(v);a.update(v,Wt,Ce),lt=Wt.id,yt=Ce.id}let kt=i.getRenderTarget(),et=i.state.buffers.depth.getReversed(),Zt=I.isInstancedMesh===!0,Xt=I.isBatchedMesh===!0,at=!!v.map,jt=!!v.matcap,mt=!!N,Q=mt&&N.isPMREMTexture===!0,dt=!!v.aoMap,ut=!!v.lightMap,pt=!!v.bumpMap&&v.wireframe===!1,xt=!!v.normalMap,At=!!v.displacementMap,Tt=!!v.emissiveMap,$t=!!v.metalnessMap,K=!!v.roughnessMap,St=v.anisotropy>0,F=v.clearcoat>0,Ht=v.diffuseRoughness>0,Dt=v.dispersion>0,Bt=v.retroreflectivity>0,ft=v.iridescence>0,ee=v.sheen>0,wt=v.transmission>0,Rt=St&&!!v.anisotropyMap,C=F&&!!v.clearcoatMap,w=F&&!!v.clearcoatNormalMap,q=F&&!!v.clearcoatRoughnessMap,gt=Ht&&!!v.diffuseRoughnessMap,ot=ft&&!!v.iridescenceMap,bt=ft&&!!v.iridescenceThicknessMap,Et=ee&&!!v.sheenColorMap,rt=ee&&!!v.sheenRoughnessMap,ct=!!v.specularMap,Ct=!!v.specularColorMap,z=!!v.specularIntensityMap,ht=wt&&!!v.transmissionMap,st=wt&&!!v.thicknessMap,Ot=!!v.gradientMap,Ut=!!v.alphaMap,zt=v.alphaTest>0,re=!!v.alphaHash,ge=!!v.extensions,Pt=si;v.toneMapped&&(kt===null||kt.isXRRenderTarget===!0)&&(Pt=i.toneMapping);let ie=Q?N.isCompressedCubeTexture?N.image[0].mipmaps:N.mipmaps:null,me={shaderID:X,shaderType:v.type,shaderName:v.name,vertexShader:Ft,fragmentShader:$,defines:v.defines,customVertexShaderID:lt,customFragmentShaderID:yt,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:U,batching:Xt,batchingColor:Xt&&I._colorsTexture!==null,instancing:Zt,instancingColor:Zt&&I.instanceColor!==null,instancingMorph:Zt&&I.morphTexture!==null,outputColorSpace:kt===null?i.outputColorSpace:kt.isXRRenderTarget===!0?kt.texture.colorSpace:Te.workingColorSpace,alphaToCoverage:!!v.alphaToCoverage,map:at,matcap:jt,envMap:mt,envMapMode:mt&&N.mapping,envMapPMREM:Q,envMapMaxLod:Q?ie.length-1:null,envMapSize:Q?ie[0].width:null,aoMap:dt,lightMap:ut,bumpMap:pt,normalMap:xt,displacementMap:At,emissiveMap:Tt,normalMapObjectSpace:xt&&v.normalMapType===vf,normalMapTangentSpace:xt&&v.normalMapType===rh,packedNormalMap:xt&&v.normalMapType===rh&&lv(v.normalMap.format),metalnessMap:$t,roughnessMap:K,anisotropy:St,anisotropyMap:Rt,clearcoat:F,clearcoatMap:C,clearcoatNormalMap:w,clearcoatRoughnessMap:q,diffuseRoughness:Ht,diffuseRoughnessMap:gt,dispersion:Dt,retroreflection:Bt,iridescence:ft,iridescenceMap:ot,iridescenceThicknessMap:bt,sheen:ee,sheenColorMap:Et,sheenRoughnessMap:rt,specularMap:ct,specularColorMap:Ct,specularIntensityMap:z,transmission:wt,transmissionMap:ht,thicknessMap:st,gradientMap:Ot,opaque:v.transparent===!1&&v.blending===Zs&&v.alphaToCoverage===!1,alphaMap:Ut,alphaTest:zt,alphaHash:re,combine:v.combine,mapUv:at&&u(v.map.channel),aoMapUv:dt&&u(v.aoMap.channel),lightMapUv:ut&&u(v.lightMap.channel),bumpMapUv:pt&&u(v.bumpMap.channel),normalMapUv:xt&&u(v.normalMap.channel),displacementMapUv:At&&u(v.displacementMap.channel),emissiveMapUv:Tt&&u(v.emissiveMap.channel),metalnessMapUv:$t&&u(v.metalnessMap.channel),roughnessMapUv:K&&u(v.roughnessMap.channel),anisotropyMapUv:Rt&&u(v.anisotropyMap.channel),clearcoatMapUv:C&&u(v.clearcoatMap.channel),clearcoatNormalMapUv:w&&u(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:q&&u(v.clearcoatRoughnessMap.channel),diffuseRoughnessMapUv:gt&&u(v.diffuseRoughnessMap.channel),iridescenceMapUv:ot&&u(v.iridescenceMap.channel),iridescenceThicknessMapUv:bt&&u(v.iridescenceThicknessMap.channel),sheenColorMapUv:Et&&u(v.sheenColorMap.channel),sheenRoughnessMapUv:rt&&u(v.sheenRoughnessMap.channel),specularMapUv:ct&&u(v.specularMap.channel),specularColorMapUv:Ct&&u(v.specularColorMap.channel),specularIntensityMapUv:z&&u(v.specularIntensityMap.channel),transmissionMapUv:ht&&u(v.transmissionMap.channel),thicknessMapUv:st&&u(v.thicknessMap.channel),alphaMapUv:Ut&&u(v.alphaMap.channel),vertexTangents:!!R.attributes.tangent&&(xt||St),vertexNormals:!!R.attributes.normal,vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!R.attributes.color&&R.attributes.color.itemSize===4,pointsUvs:I.isPoints===!0&&!!R.attributes.uv&&(at||Ut),fog:!!V,useFog:v.fog===!0,fogExp2:!!V&&V.isFogExp2,flatShading:v.wireframe===!1&&(v.flatShading===!0||R.attributes.normal===void 0&&xt===!1&&(v.isMeshLambertMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isMeshPhysicalMaterial)),sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:f,reversedDepthBuffer:et,skinning:I.isSkinnedMesh===!0,hasPositionAttribute:R.attributes.position!==void 0,morphTargets:R.morphAttributes.position!==void 0,morphNormals:R.morphAttributes.normal!==void 0,morphColors:R.morphAttributes.color!==void 0,morphTargetsCount:tt,morphTextureStride:vt,numSunLights:b.sun.length,numDirLights:b.directional.length,numPointLights:b.point.length,numSpotLights:b.spot.length,numSpotLightMaps:b.spotLightMap.length,numRectAreaLights:b.rectArea.length,numHemiLights:b.hemi.length,numSunLightShadows:b.sunShadowMap.length,numDirLightShadows:b.directionalShadowMap.length,numPointLightShadows:b.pointShadowMap.length,numSpotLightShadows:b.spotShadowMap.length,numSpotLightShadowsWithMaps:b.numSpotLightShadowsWithMaps,numLightProbes:b.numLightProbes,numLightProbeGrids:O.filter(Wt=>Wt.texture!==null).length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:v.dithering,shadowMapEnabled:i.shadowMap.enabled&&D.length>0,shadowMapType:i.shadowMap.type,toneMapping:Pt,decodeVideoTexture:at&&v.map.isVideoTexture===!0&&Te.getTransfer(v.map.colorSpace)===Le,decodeVideoTextureEmissive:Tt&&v.emissiveMap.isVideoTexture===!0&&Te.getTransfer(v.emissiveMap.colorSpace)===Le,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===Sn,flipSided:v.side===gn,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionClipCullDistance:ge&&v.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(ge&&v.extensions.multiDraw===!0||Xt)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:v.customProgramCacheKey()};return me.vertexUv1s=l.has(1),me.vertexUv2s=l.has(2),me.vertexUv3s=l.has(3),l.clear(),me}function x(v){let b=[];if(v.shaderID?b.push(v.shaderID):(b.push(v.customVertexShaderID),b.push(v.customFragmentShaderID)),v.defines!==void 0)for(let D in v.defines)b.push(D),b.push(v.defines[D]);return v.isRawShaderMaterial===!1&&(p(b,v),g(b,v),b.push(i.outputColorSpace)),b.push(v.customProgramCacheKey),b.join()}function p(v,b){v.push(b.precision),v.push(b.outputColorSpace),v.push(b.envMapMode),v.push(b.envMapPMREM),v.push(b.envMapMaxLod),v.push(b.envMapSize),v.push(b.mapUv),v.push(b.alphaMapUv),v.push(b.lightMapUv),v.push(b.aoMapUv),v.push(b.bumpMapUv),v.push(b.normalMapUv),v.push(b.displacementMapUv),v.push(b.emissiveMapUv),v.push(b.metalnessMapUv),v.push(b.roughnessMapUv),v.push(b.anisotropyMapUv),v.push(b.clearcoatMapUv),v.push(b.clearcoatNormalMapUv),v.push(b.clearcoatRoughnessMapUv),v.push(b.diffuseRoughnessMapUv),v.push(b.iridescenceMapUv),v.push(b.iridescenceThicknessMapUv),v.push(b.sheenColorMapUv),v.push(b.sheenRoughnessMapUv),v.push(b.specularMapUv),v.push(b.specularColorMapUv),v.push(b.specularIntensityMapUv),v.push(b.transmissionMapUv),v.push(b.thicknessMapUv),v.push(b.combine),v.push(b.fogExp2),v.push(b.sizeAttenuation),v.push(b.morphTargetsCount),v.push(b.numSunLights),v.push(b.numDirLights),v.push(b.numPointLights),v.push(b.numSpotLights),v.push(b.numSpotLightMaps),v.push(b.numHemiLights),v.push(b.numRectAreaLights),v.push(b.numSunLightShadows),v.push(b.numDirLightShadows),v.push(b.numPointLightShadows),v.push(b.numSpotLightShadows),v.push(b.numSpotLightShadowsWithMaps),v.push(b.numLightProbes),v.push(b.numLightProbeGrids),v.push(b.shadowMapType),v.push(b.toneMapping),v.push(b.numClippingPlanes),v.push(b.numClipIntersection),v.push(b.depthPacking)}function g(v,b){o.disableAll(),b.instancing&&o.enable(0),b.instancingColor&&o.enable(1),b.instancingMorph&&o.enable(2),b.matcap&&o.enable(3),b.envMap&&o.enable(4),b.normalMapObjectSpace&&o.enable(5),b.normalMapTangentSpace&&o.enable(6),b.clearcoat&&o.enable(7),b.iridescence&&o.enable(8),b.alphaTest&&o.enable(9),b.vertexColors&&o.enable(10),b.vertexAlphas&&o.enable(11),b.vertexUv1s&&o.enable(12),b.vertexUv2s&&o.enable(13),b.vertexUv3s&&o.enable(14),b.vertexTangents&&o.enable(15),b.anisotropy&&o.enable(16),b.alphaHash&&o.enable(17),b.batching&&o.enable(18),b.dispersion&&o.enable(19),b.retroreflection&&o.enable(24),b.diffuseRoughness&&o.enable(25),b.batchingColor&&o.enable(20),b.gradientMap&&o.enable(21),b.packedNormalMap&&o.enable(22),b.vertexNormals&&o.enable(23),v.push(o.mask),o.disableAll(),b.fog&&o.enable(0),b.useFog&&o.enable(1),b.flatShading&&o.enable(2),b.logarithmicDepthBuffer&&o.enable(3),b.reversedDepthBuffer&&o.enable(4),b.skinning&&o.enable(5),b.morphTargets&&o.enable(6),b.morphNormals&&o.enable(7),b.morphColors&&o.enable(8),b.premultipliedAlpha&&o.enable(9),b.shadowMapEnabled&&o.enable(10),b.doubleSided&&o.enable(11),b.flipSided&&o.enable(12),b.useDepthPacking&&o.enable(13),b.dithering&&o.enable(14),b.transmission&&o.enable(15),b.sheen&&o.enable(16),b.opaque&&o.enable(17),b.pointsUvs&&o.enable(18),b.decodeVideoTexture&&o.enable(19),b.decodeVideoTextureEmissive&&o.enable(20),b.alphaToCoverage&&o.enable(21),b.numLightProbeGrids>0&&o.enable(22),b.hasPositionAttribute&&o.enable(23),v.push(o.mask)}function _(v){let b=d[v.type],D;if(b){let P=oi[b];D=Of.clone(P.uniforms)}else D=v.uniforms;return D}function S(v,b){let D=h.get(b);return D!==void 0?++D.usedTimes:(D=new ov(i,b,v,s),c.push(D),h.set(b,D)),D}function y(v){if(--v.usedTimes===0){let b=c.indexOf(v);c[b]=c[c.length-1],c.pop(),h.delete(v.cacheKey),v.destroy()}}function T(v){a.remove(v)}function A(){a.dispose()}return{getParameters:m,getProgramCacheKey:x,getUniforms:_,acquireProgram:S,releaseProgram:y,releaseShaderCache:T,programs:c,dispose:A}}function hv(){let i=new WeakMap;function t(o){return i.has(o)}function e(o){let a=i.get(o);return a===void 0&&(a={},i.set(o,a)),a}function n(o){i.delete(o)}function s(o,a,l){i.get(o)[a]=l}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function uv(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.materialVariant!==t.materialVariant?i.materialVariant-t.materialVariant:i.z!==t.z?i.z-t.z:i.id-t.id}function id(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function sd(){let i=[],t=0,e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function o(d){let u=0;return d.isInstancedMesh&&(u+=2),d.isSkinnedMesh&&(u+=1),u}function a(d,u,m,x,p,g){let _=i[t];return _===void 0?(_={id:d.id,object:d,geometry:u,material:m,materialVariant:o(d),groupOrder:x,renderOrder:d.renderOrder,z:p,group:g},i[t]=_):(_.id=d.id,_.object=d,_.geometry=u,_.material=m,_.materialVariant=o(d),_.groupOrder=x,_.renderOrder=d.renderOrder,_.z=p,_.group=g),t++,_}function l(d,u,m,x,p,g,_){_.reversedDepth===!0&&(p=-p);let S=a(d,u,m,x,p,g);m.transmission>0?n.push(S):m.transparent===!0?s.push(S):e.push(S)}function c(d,u,m,x,p,g){let _=a(d,u,m,x,p,g);m.transmission>0?n.unshift(_):m.transparent===!0?s.unshift(_):e.unshift(_)}function h(d,u){e.length>1&&e.sort(d||uv),n.length>1&&n.sort(u||id),s.length>1&&s.sort(u||id)}function f(){for(let d=t,u=i.length;d<u;d++){let m=i[d];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:f,sort:h}}function fv(){let i=new WeakMap;function t(n,s){let r=i.get(n),o;return r===void 0?(o=new sd,i.set(n,[o])):s>=r.length?(o=new sd,r.push(o)):o=r[s],o}function e(){i=new WeakMap}return{get:t,dispose:e}}function dv(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={direction:new k,color:new Re};break;case"SpotLight":e={position:new k,direction:new k,color:new Re,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new k,color:new Re,distance:0,decay:0};break;case"HemisphereLight":e={direction:new k,skyColor:new Re,groundColor:new Re};break;case"RectAreaLight":e={color:new Re,position:new k,halfWidth:new k,halfHeight:new k};break}return i[t.id]=e,e}}}function pv(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Nt};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Nt};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Nt,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}var mv=0;function gv(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function _v(i){let t=new dv,e=pv(),n={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new k);let s=new k,r=new fe,o=new fe;function a(c){let h=0,f=0,d=0;for(let O=0;O<9;O++)n.probe[O].set(0,0,0);let u=0,m=0,x=0,p=0,g=0,_=0,S=0,y=0,T=0,A=0,v=0,b=0,D=0,P=0;c.sort(gv);for(let O=0,V=c.length;O<V;O++){let R=c[O],B=R.color,G=R.intensity,N=R.distance,X=null;if(R.shadow&&R.shadow.map&&(R.shadow.map.texture.format===ki?X=R.shadow.map.texture:X=R.shadow.map.depthTexture||R.shadow.map.texture),R.isAmbientLight)h+=B.r*G,f+=B.g*G,d+=B.b*G;else if(R.isLightProbe){for(let U=0;U<9;U++)n.probe[U].addScaledVector(R.sh.coefficients[U],G);P++}else if(R.isSunLight){let U=t.get(R);if(U.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){let Y=R.shadow,tt=e.get(R);tt.shadowIntensity=Y.intensity,tt.shadowBias=Y.bias,tt.shadowNormalBias=Y.normalBias,tt.shadowRadius=Y.radius,tt.shadowMapSize.copy(Y.mapSize).multiply(Y.getFrameExtents()),n.sunShadow[m]=tt,n.sunShadowMap[m]=X;let vt=Y.getViewportCount();for(let Ft=0;Ft<vt;Ft++)n.sunShadowMatrix[x+Ft]=Y.getMatrix(Ft),n.sunShadowCascade[x+Ft]=Y._cascadeData[Ft];x+=vt,m++}n.sun[u]=U,u++}else if(R.isDirectionalLight){let U=t.get(R);if(U.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){let Y=R.shadow,tt=e.get(R);tt.shadowIntensity=Y.intensity,tt.shadowBias=Y.bias,tt.shadowNormalBias=Y.normalBias,tt.shadowRadius=Y.radius,tt.shadowMapSize=Y.mapSize,n.directionalShadow[p]=tt,n.directionalShadowMap[p]=X,n.directionalShadowMatrix[p]=R.shadow.matrix,T++}n.directional[p]=U,p++}else if(R.isSpotLight){let U=t.get(R);U.position.setFromMatrixPosition(R.matrixWorld),U.color.copy(B).multiplyScalar(G),U.distance=N,U.coneCos=Math.cos(R.angle),U.penumbraCos=Math.cos(R.angle*(1-R.penumbra)),U.decay=R.decay,n.spot[_]=U;let Y=R.shadow;if(R.map&&(n.spotLightMap[b]=R.map,b++,Y.updateMatrices(R),R.castShadow&&D++),n.spotLightMatrix[_]=Y.matrix,R.castShadow){let tt=e.get(R);tt.shadowIntensity=Y.intensity,tt.shadowBias=Y.bias,tt.shadowNormalBias=Y.normalBias,tt.shadowRadius=Y.radius,tt.shadowMapSize=Y.mapSize,n.spotShadow[_]=tt,n.spotShadowMap[_]=X,v++}_++}else if(R.isRectAreaLight){let U=t.get(R);U.color.copy(B).multiplyScalar(G),U.halfWidth.set(R.width*.5,0,0),U.halfHeight.set(0,R.height*.5,0),n.rectArea[S]=U,S++}else if(R.isPointLight){let U=t.get(R);if(U.color.copy(R.color).multiplyScalar(R.intensity),U.distance=R.distance,U.decay=R.decay,R.castShadow){let Y=R.shadow,tt=e.get(R);tt.shadowIntensity=Y.intensity,tt.shadowBias=Y.bias,tt.shadowNormalBias=Y.normalBias,tt.shadowRadius=Y.radius,tt.shadowMapSize=Y.mapSize,tt.shadowCameraNear=Y.camera.near,tt.shadowCameraFar=Y.camera.far,n.pointShadow[g]=tt,n.pointShadowMap[g]=X,n.pointShadowMatrix[g]=R.shadow.matrix,A++}n.point[g]=U,g++}else if(R.isHemisphereLight){let U=t.get(R);U.skyColor.copy(R.color).multiplyScalar(G),U.groundColor.copy(R.groundColor).multiplyScalar(G),n.hemi[y]=U,y++}}S>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=Yt.LTC_FLOAT_1,n.rectAreaLTC2=Yt.LTC_FLOAT_2):(n.rectAreaLTC1=Yt.LTC_HALF_1,n.rectAreaLTC2=Yt.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=f,n.ambient[2]=d;let I=n.hash;(I.sunLength!==u||I.directionalLength!==p||I.pointLength!==g||I.spotLength!==_||I.rectAreaLength!==S||I.hemiLength!==y||I.numSunShadows!==m||I.numDirectionalShadows!==T||I.numPointShadows!==A||I.numSpotShadows!==v||I.numSpotMaps!==b||I.numLightProbes!==P)&&(n.sun.length=u,n.directional.length=p,n.spot.length=_,n.rectArea.length=S,n.point.length=g,n.hemi.length=y,n.sunShadow.length=m,n.sunShadowMap.length=m,n.sunShadowMatrix.length=x,n.sunShadowCascade.length=x,n.directionalShadow.length=T,n.directionalShadowMap.length=T,n.directionalShadowMatrix.length=T,n.pointShadow.length=A,n.pointShadowMap.length=A,n.pointShadowMatrix.length=A,n.spotShadow.length=v,n.spotShadowMap.length=v,n.spotLightMatrix.length=v+b-D,n.spotLightMap.length=b,n.numSpotLightShadowsWithMaps=D,n.numLightProbes=P,I.sunLength=u,I.directionalLength=p,I.pointLength=g,I.spotLength=_,I.rectAreaLength=S,I.hemiLength=y,I.numSunShadows=m,I.numDirectionalShadows=T,I.numPointShadows=A,I.numSpotShadows=v,I.numSpotMaps=b,I.numLightProbes=P,n.version=mv++)}function l(c,h){let f=0,d=0,u=0,m=0,x=0,p=0,g=h.matrixWorldInverse;for(let _=0,S=c.length;_<S;_++){let y=c[_];if(y.isSunLight){let T=n.sun[f];T.direction.setFromMatrixPosition(y.matrixWorld),T.direction.transformDirection(g),f++}else if(y.isDirectionalLight){let T=n.directional[d];T.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),T.direction.sub(s),T.direction.transformDirection(g),d++}else if(y.isSpotLight){let T=n.spot[m];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),T.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),T.direction.sub(s),T.direction.transformDirection(g),m++}else if(y.isRectAreaLight){let T=n.rectArea[x];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),o.identity(),r.copy(y.matrixWorld),r.premultiply(g),o.extractRotation(r),T.halfWidth.set(y.width*.5,0,0),T.halfHeight.set(0,y.height*.5,0),T.halfWidth.applyMatrix4(o),T.halfHeight.applyMatrix4(o),x++}else if(y.isPointLight){let T=n.point[u];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),u++}else if(y.isHemisphereLight){let T=n.hemi[p];T.direction.setFromMatrixPosition(y.matrixWorld),T.direction.transformDirection(g),p++}}}return{setup:a,setupView:l,state:n}}function rd(i){let t=new _v(i),e=[],n=[],s=[];function r(f){h.camera=f,e.length=0,n.length=0,s.length=0}function o(f){f.isLightProbeGrid?s.push(f):e.push(f)}function a(f){n.push(f)}function l(){t.setup(e),s.sort((f,d)=>f.priority-d.priority||f.id-d.id)}function c(f){t.setupView(e,f)}let h={lightsArray:e,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:h,setupLights:l,setupLightsView:c,pushLight:o,pushShadow:a}}function xv(i){let t=new WeakMap;function e(s,r=0){let o=t.get(s),a;return o===void 0?(a=new rd(i),t.set(s,[a])):r>=o.length?(a=new rd(i),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}var vv=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,yv=`uniform sampler2D shadow_pass;
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
}`,Mv=[new k(1,0,0),new k(-1,0,0),new k(0,1,0),new k(0,-1,0),new k(0,0,1),new k(0,0,-1)],Sv=[new k(0,-1,0),new k(0,-1,0),new k(0,0,1),new k(0,0,-1),new k(0,-1,0),new k(0,-1,0)],od=new fe,oo=new k,bh=new k;function bv(i,t,e){let n=new es,s=new Nt,r=new Nt,o=new We,a=new Da,l=new Fa,c={},h=e.maxTextureSize,f={[ii]:gn,[gn]:ii,[Sn]:Sn},d=new mn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Nt},radius:{value:4}},vertexShader:vv,fragmentShader:yv}),u=d.clone();u.defines.HORIZONTAL_PASS=1;let m=new ze;m.setAttribute("position",new De(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let x=new Mn(m,d),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Qr;let g=this.type;this.render=function(A,v,b){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||A.length===0)return;this.type===Ju&&(ae("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Qr);let D=i.getRenderTarget(),P=i.getActiveCubeFace(),I=i.getActiveMipmapLevel(),O=i.state;O.setBlending(rs),O.buffers.depth.getReversed()===!0?O.buffers.color.setClear(0,0,0,0):O.buffers.color.setClear(1,1,1,1),O.buffers.depth.setTest(!0),O.setScissorTest(!1);let V=g!==this.type;V&&v.traverse(function(R){R.material&&(Array.isArray(R.material)?R.material.forEach(B=>B.needsUpdate=!0):R.material.needsUpdate=!0)});for(let R=0,B=A.length;R<B;R++){let G=A[R],N=G.shadow;if(N===void 0){ae("WebGLShadowMap:",G,"has no shadow.");continue}if(N.autoUpdate===!1&&N.needsUpdate===!1)continue;s.copy(N.mapSize);let X=N.getFrameExtents();s.multiply(X),r.copy(N.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/X.x),s.x=r.x*X.x,N.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/X.y),s.y=r.y*X.y,N.mapSize.y=r.y));let U=i.state.buffers.depth.getReversed();if(N.camera._reversedDepth=U,N.map===null||V===!0){if(N.map!==null&&(N.map.depthTexture!==null&&(N.map.depthTexture.dispose(),N.map.depthTexture=null),N.map.dispose()),this.type===Ys){if(G.isPointLight){ae("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}N.map=new pn(s.x,s.y,{format:ki,type:qn,minFilter:dn,magFilter:dn,generateMipmaps:!1}),N.map.texture.name=G.name+".shadowMap",N.map.depthTexture=new yi(s.x,s.y,Xn),N.map.depthTexture.name=G.name+".shadowMapDepth",N.map.depthTexture.format=vi,N.map.depthTexture.compareFunction=null,N.map.depthTexture.minFilter=rn,N.map.depthTexture.magFilter=rn}else G.isPointLight?(N.map=new lo(s.x),N.map.depthTexture=new Lr(s.x,Wn)):(N.map=new pn(s.x,s.y),N.map.depthTexture=new yi(s.x,s.y,Wn)),N.map.depthTexture.name=G.name+".shadowMap",N.map.depthTexture.format=vi,this.type===Qr?(N.map.depthTexture.compareFunction=U?ah:oh,N.map.depthTexture.minFilter=dn,N.map.depthTexture.magFilter=dn):(N.map.depthTexture.compareFunction=null,N.map.depthTexture.minFilter=rn,N.map.depthTexture.magFilter=rn);N.camera.updateProjectionMatrix()}N.map.isWebGLCubeRenderTarget!==!0&&(N.map.width!==s.x||N.map.height!==s.y)&&N.map.setSize(s.x,s.y);let Y=N.map.isWebGLCubeRenderTarget?6:N.getViewportCount();G.isPointLight!==!0&&N.updateMatrices(G,b);let tt=(N.camera.layers.mask&4294967294)!==0?N.camera.layers:b.layers;for(let vt=0;vt<Y;vt++){let Ft=N.getCamera(vt);if(G.isPointLight){let $=N.camera,lt=N.matrix,yt=G.distance||$.far;yt!==$.far&&($.far=yt,$.updateProjectionMatrix()),oo.setFromMatrixPosition(G.matrixWorld),$.position.copy(oo),bh.copy($.position),bh.add(Mv[vt]),$.up.copy(Sv[vt]),$.lookAt(bh),$.updateMatrixWorld(),lt.makeTranslation(-oo.x,-oo.y,-oo.z),od.multiplyMatrices($.projectionMatrix,$.matrixWorldInverse),N._frustum.setFromProjectionMatrix(od,$.coordinateSystem,$.reversedDepth)}if(N.map.isWebGLCubeRenderTarget)i.setRenderTarget(N.map,vt),i.clear();else{vt===0&&(i.setRenderTarget(N.map),i.clear());let $=N.getViewport(vt);o.set(r.x*$.x,r.y*$.y,r.x*$.z,r.y*$.w),O.viewport(o)}n=N.getFrustum(vt),y(v,b,Ft,G,tt,this.type)}N.isPointLightShadow!==!0&&this.type===Ys&&_(N,b),N.needsUpdate=!1}g=this.type,p.needsUpdate=!1,i.setRenderTarget(D,P,I)};function _(A,v){let b=t.update(x);d.defines.VSM_SAMPLES!==A.blurSamples&&(d.defines.VSM_SAMPLES=A.blurSamples,u.defines.VSM_SAMPLES=A.blurSamples,d.needsUpdate=!0,u.needsUpdate=!0),A.mapPass===null?A.mapPass=new pn(s.x,s.y,{format:ki,type:qn}):(A.mapPass.width!==A.map.width||A.mapPass.height!==A.map.height)&&A.mapPass.setSize(A.map.width,A.map.height),d.uniforms.shadow_pass.value=A.map.depthTexture,d.uniforms.resolution.value.set(A.map.width,A.map.height),d.uniforms.radius.value=A.radius,i.setRenderTarget(A.mapPass),i.clear(),i.renderBufferDirect(v,null,b,d,x,null),u.uniforms.shadow_pass.value=A.mapPass.texture,u.uniforms.resolution.value.set(A.map.width,A.map.height),u.uniforms.radius.value=A.radius,i.setRenderTarget(A.map),i.clear(),i.renderBufferDirect(v,null,b,u,x,null)}function S(A,v,b,D){let P=null,I=b.isPointLight===!0?A.customDistanceMaterial:A.customDepthMaterial;if(I!==void 0)P=I;else if(P=b.isPointLight===!0?l:a,i.localClippingEnabled&&v.clipShadows===!0&&Array.isArray(v.clippingPlanes)&&v.clippingPlanes.length!==0||v.displacementMap&&v.displacementScale!==0||v.alphaMap&&v.alphaTest>0||v.map&&v.alphaTest>0||v.alphaToCoverage===!0){let O=P.uuid,V=v.uuid,R=c[O];R===void 0&&(R={},c[O]=R);let B=R[V];B===void 0&&(B=P.clone(),R[V]=B,v.addEventListener("dispose",T)),P=B}if(P.visible=v.visible,P.wireframe=v.wireframe,D===Ys?P.side=v.shadowSide!==null?v.shadowSide:v.side:P.side=v.shadowSide!==null?v.shadowSide:f[v.side],P.alphaMap=v.alphaMap,P.alphaTest=v.alphaToCoverage===!0?.5:v.alphaTest,P.map=v.map,P.clipShadows=v.clipShadows,P.clippingPlanes=v.clippingPlanes,P.clipIntersection=v.clipIntersection,P.displacementMap=v.displacementMap,P.displacementScale=v.displacementScale,P.displacementBias=v.displacementBias,P.wireframeLinewidth=v.wireframeLinewidth,P.linewidth=v.linewidth,b.isPointLight===!0&&P.isMeshDistanceMaterial===!0){let O=i.properties.get(P);O.light=b}return P}function y(A,v,b,D,P,I){if(A.visible===!1)return;if(A.layers.test(P)&&(A.isMesh||A.isLine||A.isPoints)&&(A.castShadow||A.receiveShadow&&I===Ys)&&(!A.frustumCulled||A.intersectsFrustum(n))){A.modelViewMatrix.multiplyMatrices(b.matrixWorldInverse,A.matrixWorld);let R=t.update(A),B=A.material;if(Array.isArray(B)){let G=R.groups;for(let N=0,X=G.length;N<X;N++){let U=G[N],Y=B[U.materialIndex];if(Y&&Y.visible){let tt=S(A,Y,D,I);A.onBeforeShadow(i,A,v,b,R,tt,U),i.renderBufferDirect(b,null,R,tt,A,U),A.onAfterShadow(i,A,v,b,R,tt,U)}}}else if(B.visible){let G=S(A,B,D,I);A.onBeforeShadow(i,A,v,b,R,G,null),i.renderBufferDirect(b,null,R,G,A,null),A.onAfterShadow(i,A,v,b,R,G,null)}}let V=A.children;for(let R=0,B=V.length;R<B;R++)y(V[R],v,b,D,P,I)}function T(A){A.target.removeEventListener("dispose",T);for(let b in c){let D=c[b],P=A.target.uuid;P in D&&(D[P].dispose(),delete D[P])}}}function wv(i,t){function e(){let z=!1,ht=new We,st=null,Ot=new We(0,0,0,0);return{setMask:function(Ut){st!==Ut&&!z&&(i.colorMask(Ut,Ut,Ut,Ut),st=Ut)},setLocked:function(Ut){z=Ut},setClear:function(Ut,zt,re,ge,Pt){Pt===!0&&(Ut*=ge,zt*=ge,re*=ge),ht.set(Ut,zt,re,ge),Ot.equals(ht)===!1&&(i.clearColor(Ut,zt,re,ge),Ot.copy(ht))},reset:function(){z=!1,st=null,Ot.set(-1,0,0,0)}}}function n(){let z=!1,ht=!1,st=null,Ot=null,Ut=null;return{setReversed:function(zt){if(ht!==zt){let re=t.get("EXT_clip_control");zt?re.clipControlEXT(re.LOWER_LEFT_EXT,re.ZERO_TO_ONE_EXT):re.clipControlEXT(re.LOWER_LEFT_EXT,re.NEGATIVE_ONE_TO_ONE_EXT),ht=zt;let ge=Ut;Ut=null,this.setClear(ge)}},getReversed:function(){return ht},setTest:function(zt){zt?et(i.DEPTH_TEST):Zt(i.DEPTH_TEST)},setMask:function(zt){st!==zt&&!z&&(i.depthMask(zt),st=zt)},setFunc:function(zt){if(ht&&(zt=If[zt]),Ot!==zt){switch(zt){case aa:i.depthFunc(i.NEVER);break;case la:i.depthFunc(i.ALWAYS);break;case ca:i.depthFunc(i.LESS);break;case Fs:i.depthFunc(i.LEQUAL);break;case ha:i.depthFunc(i.EQUAL);break;case ua:i.depthFunc(i.GEQUAL);break;case fa:i.depthFunc(i.GREATER);break;case da:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}Ot=zt}},setLocked:function(zt){z=zt},setClear:function(zt){Ut!==zt&&(Ut=zt,ht&&(zt=1-zt),i.clearDepth(zt))},reset:function(){z=!1,st=null,Ot=null,Ut=null,ht=!1}}}function s(){let z=!1,ht=null,st=null,Ot=null,Ut=null,zt=null,re=null,ge=null,Pt=null;return{setTest:function(ie){z||(ie?et(i.STENCIL_TEST):Zt(i.STENCIL_TEST))},setMask:function(ie){ht!==ie&&!z&&(i.stencilMask(ie),ht=ie)},setFunc:function(ie,me,Wt){(st!==ie||Ot!==me||Ut!==Wt)&&(i.stencilFunc(ie,me,Wt),st=ie,Ot=me,Ut=Wt)},setOp:function(ie,me,Wt){(zt!==ie||re!==me||ge!==Wt)&&(i.stencilOp(ie,me,Wt),zt=ie,re=me,ge=Wt)},setLocked:function(ie){z=ie},setClear:function(ie){Pt!==ie&&(i.clearStencil(ie),Pt=ie)},reset:function(){z=!1,ht=null,st=null,Ot=null,Ut=null,zt=null,re=null,ge=null,Pt=null}}}let r=new e,o=new n,a=new s,l={},c=new WeakMap,h={},f={},d={},u=new WeakMap,m=[],x=null,p=!1,g=null,_=null,S=null,y=null,T=null,A=null,v=null,b=new Re(0,0,0),D=0,P=!1,I=null,O=null,V=null,R=null,B=null,G=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),N=!1,X=0,U=i.getParameter(i.VERSION);U.indexOf("WebGL")!==-1?(X=parseFloat(/^WebGL (\d)/.exec(U)[1]),N=X>=1):U.indexOf("OpenGL ES")!==-1&&(X=parseFloat(/^OpenGL ES (\d)/.exec(U)[1]),N=X>=2);let Y=null,tt={},vt=i.getParameter(i.SCISSOR_BOX),Ft=i.getParameter(i.VIEWPORT),$=new We().fromArray(vt),lt=new We().fromArray(Ft);function yt(z,ht,st,Ot){let Ut=new Uint8Array(4),zt=i.createTexture();i.bindTexture(z,zt),i.texParameteri(z,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(z,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let re=0;re<st;re++)z===i.TEXTURE_3D||z===i.TEXTURE_2D_ARRAY?i.texImage3D(ht,0,i.RGBA,1,1,Ot,0,i.RGBA,i.UNSIGNED_BYTE,Ut):i.texImage2D(ht+re,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,Ut);return zt}let kt={};kt[i.TEXTURE_2D]=yt(i.TEXTURE_2D,i.TEXTURE_2D,1),kt[i.TEXTURE_CUBE_MAP]=yt(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),kt[i.TEXTURE_2D_ARRAY]=yt(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),kt[i.TEXTURE_3D]=yt(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),et(i.DEPTH_TEST),o.setFunc(Fs),pt(!1),xt(Bc),et(i.CULL_FACE),dt(rs);function et(z){h[z]!==!0&&(i.enable(z),h[z]=!0)}function Zt(z){h[z]!==!1&&(i.disable(z),h[z]=!1)}function Xt(z,ht){return d[z]!==ht?(i.bindFramebuffer(z,ht),d[z]=ht,z===i.DRAW_FRAMEBUFFER&&(d[i.FRAMEBUFFER]=ht),z===i.FRAMEBUFFER&&(d[i.DRAW_FRAMEBUFFER]=ht),!0):!1}function at(z,ht){let st=m,Ot=!1;if(z){st=u.get(ht),st===void 0&&(st=[],u.set(ht,st));let Ut=z.textures;if(st.length!==Ut.length||st[0]!==i.COLOR_ATTACHMENT0){for(let zt=0,re=Ut.length;zt<re;zt++)st[zt]=i.COLOR_ATTACHMENT0+zt;st.length=Ut.length,Ot=!0}}else st[0]!==i.BACK&&(st[0]=i.BACK,Ot=!0);Ot&&i.drawBuffers(st)}function jt(z){return x!==z?(i.useProgram(z),x=z,!0):!1}let mt={[os]:i.FUNC_ADD,[Ku]:i.FUNC_SUBTRACT,[Qu]:i.FUNC_REVERSE_SUBTRACT};mt[ju]=i.MIN,mt[tf]=i.MAX;let Q={[ef]:i.ZERO,[nf]:i.ONE,[sf]:i.SRC_COLOR,[Gc]:i.SRC_ALPHA,[hf]:i.SRC_ALPHA_SATURATE,[lf]:i.DST_COLOR,[of]:i.DST_ALPHA,[rf]:i.ONE_MINUS_SRC_COLOR,[Vc]:i.ONE_MINUS_SRC_ALPHA,[cf]:i.ONE_MINUS_DST_COLOR,[af]:i.ONE_MINUS_DST_ALPHA,[uf]:i.CONSTANT_COLOR,[ff]:i.ONE_MINUS_CONSTANT_COLOR,[df]:i.CONSTANT_ALPHA,[pf]:i.ONE_MINUS_CONSTANT_ALPHA};function dt(z,ht,st,Ot,Ut,zt,re,ge,Pt,ie){if(z===rs){p===!0&&(Zt(i.BLEND),p=!1);return}if(p===!1&&(et(i.BLEND),p=!0),z!==$u){if(z!==g||ie!==P){if((_!==os||T!==os)&&(i.blendEquation(i.FUNC_ADD),_=os,T=os),ie)switch(z){case Zs:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Js:i.blendFunc(i.ONE,i.ONE);break;case zc:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case kc:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:ce("WebGLState: Invalid blending: ",z);break}else switch(z){case Zs:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Js:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case zc:ce("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case kc:ce("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:ce("WebGLState: Invalid blending: ",z);break}S=null,y=null,A=null,v=null,b.set(0,0,0),D=0,g=z,P=ie}return}Ut=Ut||ht,zt=zt||st,re=re||Ot,(ht!==_||Ut!==T)&&(i.blendEquationSeparate(mt[ht],mt[Ut]),_=ht,T=Ut),(st!==S||Ot!==y||zt!==A||re!==v)&&(i.blendFuncSeparate(Q[st],Q[Ot],Q[zt],Q[re]),S=st,y=Ot,A=zt,v=re),(ge.equals(b)===!1||Pt!==D)&&(i.blendColor(ge.r,ge.g,ge.b,Pt),b.copy(ge),D=Pt),g=z,P=!1}function ut(z,ht){z.side===Sn?Zt(i.CULL_FACE):et(i.CULL_FACE);let st=z.side===gn;ht&&(st=!st),pt(st),z.blending===Zs&&z.transparent===!1?dt(rs):dt(z.blending,z.blendEquation,z.blendSrc,z.blendDst,z.blendEquationAlpha,z.blendSrcAlpha,z.blendDstAlpha,z.blendColor,z.blendAlpha,z.premultipliedAlpha),o.setFunc(z.depthFunc),o.setTest(z.depthTest),o.setMask(z.depthWrite),r.setMask(z.colorWrite);let Ot=z.stencilWrite;a.setTest(Ot),Ot&&(a.setMask(z.stencilWriteMask),a.setFunc(z.stencilFunc,z.stencilRef,z.stencilFuncMask),a.setOp(z.stencilFail,z.stencilZFail,z.stencilZPass)),Tt(z.polygonOffset,z.polygonOffsetFactor,z.polygonOffsetUnits),z.alphaToCoverage===!0?et(i.SAMPLE_ALPHA_TO_COVERAGE):Zt(i.SAMPLE_ALPHA_TO_COVERAGE)}function pt(z){I!==z&&(z?i.frontFace(i.CW):i.frontFace(i.CCW),I=z)}function xt(z){z!==Yu?(et(i.CULL_FACE),z!==O&&(z===Bc?i.cullFace(i.BACK):z===Zu?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):Zt(i.CULL_FACE),O=z}function At(z){z!==V&&(N&&i.lineWidth(z),V=z)}function Tt(z,ht,st){z?(et(i.POLYGON_OFFSET_FILL),(R!==ht||B!==st)&&(R=ht,B=st,o.getReversed()&&(ht=-ht,st=-st),i.polygonOffset(ht,st))):Zt(i.POLYGON_OFFSET_FILL)}function $t(z){z?et(i.SCISSOR_TEST):Zt(i.SCISSOR_TEST)}function K(z){z===void 0&&(z=i.TEXTURE0+G-1),Y!==z&&(i.activeTexture(z),Y=z)}function St(z,ht,st){st===void 0&&(Y===null?st=i.TEXTURE0+G-1:st=Y);let Ot=tt[st];Ot===void 0&&(Ot={type:void 0,texture:void 0},tt[st]=Ot),(Ot.type!==z||Ot.texture!==ht)&&(Y!==st&&(i.activeTexture(st),Y=st),i.bindTexture(z,ht||kt[z]),Ot.type=z,Ot.texture=ht)}function F(){let z=tt[Y];z!==void 0&&z.type!==void 0&&(i.bindTexture(z.type,null),z.type=void 0,z.texture=void 0)}function Ht(){try{i.compressedTexImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function Dt(){try{i.compressedTexImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function Bt(){try{i.texSubImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function ft(){try{i.texSubImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function ee(){try{i.compressedTexSubImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function wt(){try{i.compressedTexSubImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function Rt(){try{i.texStorage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function C(){try{i.texStorage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function w(){try{i.texImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function q(){try{i.texImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function gt(z){return f[z]!==void 0?f[z]:i.getParameter(z)}function ot(z,ht){f[z]!==ht&&(i.pixelStorei(z,ht),f[z]=ht)}function bt(z){$.equals(z)===!1&&(i.scissor(z.x,z.y,z.z,z.w),$.copy(z))}function Et(z){lt.equals(z)===!1&&(i.viewport(z.x,z.y,z.z,z.w),lt.copy(z))}function rt(z,ht){let st=c.get(ht);st===void 0&&(st=new WeakMap,c.set(ht,st));let Ot=st.get(z);Ot===void 0&&(Ot=i.getUniformBlockIndex(ht,z.name),i.uniformBlockBinding(ht,Ot,Ot),st.set(z,Ot))}function ct(z,ht,st){let Ut=c.get(ht).get(z);l[Ut]!==st&&(i.bindBufferBase(i.UNIFORM_BUFFER,Ut,st),l[Ut]=st)}function Ct(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),o.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),h={},f={},Y=null,tt={},d={},l={},u=new WeakMap,m=[],x=null,p=!1,g=null,_=null,S=null,y=null,T=null,A=null,v=null,b=new Re(0,0,0),D=0,P=!1,I=null,O=null,V=null,R=null,B=null,$.set(0,0,i.canvas.width,i.canvas.height),lt.set(0,0,i.canvas.width,i.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:et,disable:Zt,bindFramebuffer:Xt,drawBuffers:at,useProgram:jt,setBlending:dt,setMaterial:ut,setFlipSided:pt,setCullFace:xt,setLineWidth:At,setPolygonOffset:Tt,setScissorTest:$t,activeTexture:K,bindTexture:St,unbindTexture:F,compressedTexImage2D:Ht,compressedTexImage3D:Dt,texImage2D:w,texImage3D:q,pixelStorei:ot,getParameter:gt,updateUBOMapping:rt,uniformBlockBinding:ct,texStorage2D:Rt,texStorage3D:C,texSubImage2D:Bt,texSubImage3D:ft,compressedTexSubImage2D:ee,compressedTexSubImage3D:wt,scissor:bt,viewport:Et,reset:Ct}}function Av(i,t,e,n,s,r,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Nt,h=new WeakMap,f=new Set,d,u=new WeakMap,m=new Set,x=new FinalizationRegistry(C=>m.delete(C)),p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(C,w){return p?new OffscreenCanvas(C,w):Ar("canvas")}function _(C,w,q){let gt=1,ot=Rt(C);if((ot.width>q||ot.height>q)&&(gt=q/Math.max(ot.width,ot.height)),gt<1)if(typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&C instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&C instanceof ImageBitmap||typeof VideoFrame<"u"&&C instanceof VideoFrame){let bt=Math.floor(gt*ot.width),Et=Math.floor(gt*ot.height);d===void 0&&(d=g(bt,Et));let rt=w?g(bt,Et):d;return rt.width=bt,rt.height=Et,rt.getContext("2d").drawImage(C,0,0,bt,Et),ae("WebGLRenderer: Texture has been resized from ("+ot.width+"x"+ot.height+") to ("+bt+"x"+Et+")."),rt}else return"data"in C&&ae("WebGLRenderer: Image in DataTexture is too big ("+ot.width+"x"+ot.height+")."),C;return C}function S(C){return C.generateMipmaps}function y(C){i.generateMipmap(C)}function T(C){return C.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:C.isWebGL3DRenderTarget?i.TEXTURE_3D:C.isWebGLArrayRenderTarget||C.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function A(C,w,q,gt,ot,bt=!1){if(C!==null){if(i[C]!==void 0)return i[C];ae("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+C+"'")}let Et;gt&&(Et=t.get("EXT_texture_norm16"),Et||ae("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let rt=w;if(w===i.RED&&(q===i.FLOAT&&(rt=i.R32F),q===i.HALF_FLOAT&&(rt=i.R16F),q===i.UNSIGNED_BYTE&&(rt=i.R8),q===i.UNSIGNED_SHORT&&Et&&(rt=Et.R16_EXT),q===i.SHORT&&Et&&(rt=Et.R16_SNORM_EXT)),w===i.RED_INTEGER&&(q===i.UNSIGNED_BYTE&&(rt=i.R8UI),q===i.UNSIGNED_SHORT&&(rt=i.R16UI),q===i.UNSIGNED_INT&&(rt=i.R32UI),q===i.BYTE&&(rt=i.R8I),q===i.SHORT&&(rt=i.R16I),q===i.INT&&(rt=i.R32I)),w===i.RG&&(q===i.FLOAT&&(rt=i.RG32F),q===i.HALF_FLOAT&&(rt=i.RG16F),q===i.UNSIGNED_BYTE&&(rt=i.RG8),q===i.UNSIGNED_SHORT&&Et&&(rt=Et.RG16_EXT),q===i.SHORT&&Et&&(rt=Et.RG16_SNORM_EXT)),w===i.RG_INTEGER&&(q===i.UNSIGNED_BYTE&&(rt=i.RG8UI),q===i.UNSIGNED_SHORT&&(rt=i.RG16UI),q===i.UNSIGNED_INT&&(rt=i.RG32UI),q===i.BYTE&&(rt=i.RG8I),q===i.SHORT&&(rt=i.RG16I),q===i.INT&&(rt=i.RG32I)),w===i.RGB_INTEGER&&(q===i.UNSIGNED_BYTE&&(rt=i.RGB8UI),q===i.UNSIGNED_SHORT&&(rt=i.RGB16UI),q===i.UNSIGNED_INT&&(rt=i.RGB32UI),q===i.BYTE&&(rt=i.RGB8I),q===i.SHORT&&(rt=i.RGB16I),q===i.INT&&(rt=i.RGB32I)),w===i.RGBA_INTEGER&&(q===i.UNSIGNED_BYTE&&(rt=i.RGBA8UI),q===i.UNSIGNED_SHORT&&(rt=i.RGBA16UI),q===i.UNSIGNED_INT&&(rt=i.RGBA32UI),q===i.BYTE&&(rt=i.RGBA8I),q===i.SHORT&&(rt=i.RGBA16I),q===i.INT&&(rt=i.RGBA32I)),w===i.RGB&&(q===i.UNSIGNED_SHORT&&Et&&(rt=Et.RGB16_EXT),q===i.SHORT&&Et&&(rt=Et.RGB16_SNORM_EXT),q===i.UNSIGNED_INT_5_9_9_9_REV&&(rt=i.RGB9_E5),q===i.UNSIGNED_INT_10F_11F_11F_REV&&(rt=i.R11F_G11F_B10F)),w===i.RGBA){let ct=bt?br:Te.getTransfer(ot);q===i.FLOAT&&(rt=i.RGBA32F),q===i.HALF_FLOAT&&(rt=i.RGBA16F),q===i.UNSIGNED_BYTE&&(rt=ct===Le?i.SRGB8_ALPHA8:i.RGBA8),q===i.UNSIGNED_SHORT&&Et&&(rt=Et.RGBA16_EXT),q===i.SHORT&&Et&&(rt=Et.RGBA16_SNORM_EXT),q===i.UNSIGNED_SHORT_4_4_4_4&&(rt=i.RGBA4),q===i.UNSIGNED_SHORT_5_5_5_1&&(rt=i.RGB5_A1)}return(rt===i.R16F||rt===i.R32F||rt===i.RG16F||rt===i.RG32F||rt===i.RGBA16F||rt===i.RGBA32F)&&t.get("EXT_color_buffer_float"),rt}function v(C,w){let q;return C?w===null||w===Wn||w===ls?q=i.DEPTH24_STENCIL8:w===Xn?q=i.DEPTH32F_STENCIL8:w===Ks&&(q=i.DEPTH24_STENCIL8,ae("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):w===null||w===Wn||w===ls?q=i.DEPTH_COMPONENT24:w===Xn?q=i.DEPTH_COMPONENT32F:w===Ks&&(q=i.DEPTH_COMPONENT16),q}function b(C,w){return S(C)===!0||C.isFramebufferTexture&&C.minFilter!==rn&&C.minFilter!==dn?Math.log2(Math.max(w.width,w.height))+1:C.mipmaps.length>0?C.mipmaps.length:C.isCompressedTexture&&Array.isArray(C.image)?w.mipmaps.length:1}function D(C){let w=new WeakRef(C);n.get(C).__ref=w,m.add(w),x.register(C,w,w)}function P(C){let w=n.get(C).__ref;w!==void 0&&(m.delete(w),x.unregister(w))}function I(C){V(C.target)}function O(C){R(C.target)}function V(C){C.removeEventListener("dispose",I),P(C),G(C),C.isVideoTexture&&h.delete(C),C.isHTMLTexture&&f.delete(C)}function R(C){C.removeEventListener("dispose",O),P(C),X(C)}function B(){for(let C of m){let w=C.deref();w!==void 0&&(w.isRenderTarget===!0?R(w):V(w))}m.clear(),f.clear()}function G(C){let w=n.get(C);if(w.__webglInit===void 0)return;let q=C.source,gt=u.get(q);if(gt){let ot=gt[w.__cacheKey];ot.usedTimes--,ot.usedTimes===0&&N(C),Object.keys(gt).length===0&&u.delete(q)}n.remove(C)}function N(C){let w=n.get(C);i.deleteTexture(w.__webglTexture);let q=C.source,gt=u.get(q);delete gt[w.__cacheKey],o.memory.textures--}function X(C){let w=n.get(C);w.__depthDisposeCallback&&w.__depthDisposeCallback();let q=C.depthTexture;if(q&&q.renderTarget===C&&V(q),C.isWebGLCubeRenderTarget)for(let ot=0;ot<6;ot++){if(Array.isArray(w.__webglFramebuffer[ot]))for(let bt=0;bt<w.__webglFramebuffer[ot].length;bt++)i.deleteFramebuffer(w.__webglFramebuffer[ot][bt]);else i.deleteFramebuffer(w.__webglFramebuffer[ot]);w.__webglDepthbuffer&&i.deleteRenderbuffer(w.__webglDepthbuffer[ot])}else{if(Array.isArray(w.__webglFramebuffer))for(let ot=0;ot<w.__webglFramebuffer.length;ot++)i.deleteFramebuffer(w.__webglFramebuffer[ot]);else i.deleteFramebuffer(w.__webglFramebuffer);if(w.__webglDepthbuffer&&i.deleteRenderbuffer(w.__webglDepthbuffer),w.__webglMultisampledFramebuffer&&i.deleteFramebuffer(w.__webglMultisampledFramebuffer),w.__webglColorRenderbuffer)for(let ot=0;ot<w.__webglColorRenderbuffer.length;ot++)w.__webglColorRenderbuffer[ot]&&i.deleteRenderbuffer(w.__webglColorRenderbuffer[ot]);w.__webglDepthRenderbuffer&&i.deleteRenderbuffer(w.__webglDepthRenderbuffer)}let gt=C.textures;for(let ot=0,bt=gt.length;ot<bt;ot++){let Et=n.get(gt[ot]);Et.__webglTexture&&(i.deleteTexture(Et.__webglTexture),o.memory.textures--),n.remove(gt[ot])}n.remove(C)}let U=0;function Y(){U=0}function tt(){return U}function vt(C){U=C}function Ft(){let C=U;return C>=s.maxTextures&&ae("WebGLTextures: Trying to use "+(C+1)+" texture units while this GPU supports only "+s.maxTextures),U+=1,C}function $(C){let w=[];return w.push(C.wrapS),w.push(C.wrapT),w.push(C.wrapR||0),w.push(C.magFilter),w.push(C.minFilter),w.push(C.anisotropy),w.push(C.internalFormat),w.push(C.format),w.push(C.type),w.push(C.generateMipmaps),w.push(C.mipmapsAutoUpdate),w.push(C.premultiplyAlpha),w.push(C.flipY),w.push(C.unpackAlignment),w.push(C.colorSpace),w.join()}function lt(C,w){let q=n.get(C);if(C.isVideoTexture&&ee(C),C.isRenderTargetTexture===!1&&C.isExternalTexture!==!0&&C.version>0&&q.__version!==C.version){let gt=C.image;if(gt===null)ae("WebGLRenderer: Texture marked for update but no image data found.");else if(gt.complete===!1)ae("WebGLRenderer: Texture marked for update but image is incomplete");else{ut(q,C,w);return}}else C.isExternalTexture&&(q.__webglTexture=C.sourceTexture?C.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,q.__webglTexture,i.TEXTURE0+w)}function yt(C,w){let q=n.get(C);if(C.isRenderTargetTexture===!1&&C.version>0&&q.__version!==C.version){ut(q,C,w);return}else C.isExternalTexture&&(q.__webglTexture=C.sourceTexture?C.sourceTexture:null);e.bindTexture(i.TEXTURE_2D_ARRAY,q.__webglTexture,i.TEXTURE0+w)}function kt(C,w){let q=n.get(C);if(C.isRenderTargetTexture===!1&&C.version>0&&q.__version!==C.version){ut(q,C,w);return}e.bindTexture(i.TEXTURE_3D,q.__webglTexture,i.TEXTURE0+w)}function et(C,w){let q=n.get(C);if(C.version>0&&q.__version!==C.version){pt(q,C,w);return}e.bindTexture(i.TEXTURE_CUBE_MAP,q.__webglTexture,i.TEXTURE0+w)}let Zt={[pa]:i.REPEAT,[Kn]:i.CLAMP_TO_EDGE,[ma]:i.MIRRORED_REPEAT},Xt={[rn]:i.NEAREST,[_f]:i.NEAREST_MIPMAP_NEAREST,[jr]:i.NEAREST_MIPMAP_LINEAR,[dn]:i.LINEAR,[Ka]:i.LINEAR_MIPMAP_NEAREST,[Mi]:i.LINEAR_MIPMAP_LINEAR},at={[Mf]:i.NEVER,[lh]:i.ALWAYS,[Sf]:i.LESS,[oh]:i.LEQUAL,[bf]:i.EQUAL,[ah]:i.GEQUAL,[wf]:i.GREATER,[Af]:i.NOTEQUAL};function jt(C,w){if(w.type===Xn&&t.has("OES_texture_float_linear")===!1&&(w.magFilter===dn||w.magFilter===Ka||w.magFilter===jr||w.magFilter===Mi||w.minFilter===dn||w.minFilter===Ka||w.minFilter===jr||w.minFilter===Mi)&&ae("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(C,i.TEXTURE_WRAP_S,Zt[w.wrapS]),i.texParameteri(C,i.TEXTURE_WRAP_T,Zt[w.wrapT]),(C===i.TEXTURE_3D||C===i.TEXTURE_2D_ARRAY)&&i.texParameteri(C,i.TEXTURE_WRAP_R,Zt[w.wrapR]),i.texParameteri(C,i.TEXTURE_MAG_FILTER,Xt[w.magFilter]),i.texParameteri(C,i.TEXTURE_MIN_FILTER,Xt[w.minFilter]),w.compareFunction&&(i.texParameteri(C,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(C,i.TEXTURE_COMPARE_FUNC,at[w.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(w.magFilter===rn||w.minFilter!==jr&&w.minFilter!==Mi||w.type===Xn&&t.has("OES_texture_float_linear")===!1)return;if(w.anisotropy>1||n.get(w).__currentAnisotropy){let q=t.get("EXT_texture_filter_anisotropic");i.texParameterf(C,q.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(w.anisotropy,s.getMaxAnisotropy())),n.get(w).__currentAnisotropy=w.anisotropy}}}function mt(C,w){let q=!1;C.__webglInit===void 0&&(C.__webglInit=!0,w.addEventListener("dispose",I),D(w));let gt=w.source,ot=u.get(gt);ot===void 0&&(ot={},u.set(gt,ot));let bt=$(w);if(bt!==C.__cacheKey){ot[bt]===void 0&&(ot[bt]={texture:i.createTexture(),usedTimes:0},o.memory.textures++,q=!0),ot[bt].usedTimes++;let Et=ot[C.__cacheKey];Et!==void 0&&(ot[C.__cacheKey].usedTimes--,Et.usedTimes===0&&N(w)),C.__cacheKey=bt,C.__webglTexture=ot[bt].texture}return q}function Q(C,w,q){return Math.floor(Math.floor(C/q)/w)}function dt(C,w,q,gt){let bt=C.updateRanges;if(bt.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,w.width,w.height,q,gt,w.data);else{bt.sort((z,ht)=>z.start-ht.start);let Et=0;for(let z=1;z<bt.length;z++){let ht=bt[Et],st=bt[z],Ot=ht.start+ht.count,Ut=Q(st.start,w.width,4),zt=Q(ht.start,w.width,4);st.start<=Ot+1&&Ut===zt&&Q(st.start+st.count-1,w.width,4)===Ut?ht.count=Math.max(ht.count,st.start+st.count-ht.start):(++Et,bt[Et]=st)}bt.length=Et+1;let rt=e.getParameter(i.UNPACK_ROW_LENGTH),ct=e.getParameter(i.UNPACK_SKIP_PIXELS),Ct=e.getParameter(i.UNPACK_SKIP_ROWS);e.pixelStorei(i.UNPACK_ROW_LENGTH,w.width);for(let z=0,ht=bt.length;z<ht;z++){let st=bt[z],Ot=Math.floor(st.start/4),Ut=Math.ceil(st.count/4),zt=Ot%w.width,re=Math.floor(Ot/w.width),ge=Ut,Pt=1;e.pixelStorei(i.UNPACK_SKIP_PIXELS,zt),e.pixelStorei(i.UNPACK_SKIP_ROWS,re),e.texSubImage2D(i.TEXTURE_2D,0,zt,re,ge,Pt,q,gt,w.data)}C.clearUpdateRanges(),e.pixelStorei(i.UNPACK_ROW_LENGTH,rt),e.pixelStorei(i.UNPACK_SKIP_PIXELS,ct),e.pixelStorei(i.UNPACK_SKIP_ROWS,Ct)}}function ut(C,w,q){let gt=i.TEXTURE_2D;(w.isDataArrayTexture||w.isCompressedArrayTexture)&&(gt=i.TEXTURE_2D_ARRAY),w.isData3DTexture&&(gt=i.TEXTURE_3D);let ot=mt(C,w),bt=w.source;e.bindTexture(gt,C.__webglTexture,i.TEXTURE0+q);let Et=n.get(bt);if(bt.version!==Et.__version||ot===!0){if(e.activeTexture(i.TEXTURE0+q),(typeof ImageBitmap<"u"&&w.image instanceof ImageBitmap)===!1){let Pt=Te.getPrimaries(Te.workingColorSpace),ie=w.colorSpace===bi?null:Te.getPrimaries(w.colorSpace),me=w.colorSpace===bi||Pt===ie?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,w.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,w.premultiplyAlpha),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,me)}e.pixelStorei(i.UNPACK_ALIGNMENT,w.unpackAlignment);let ct=_(w.image,!1,s.maxTextureSize);ct=wt(w,ct);let Ct=r.convert(w.format,w.colorSpace),z=r.convert(w.type),ht=A(w.internalFormat,Ct,z,w.normalized,w.colorSpace,w.isVideoTexture);jt(gt,w);let st,Ot=w.mipmaps,Ut=w.isVideoTexture!==!0,zt=Et.__version===void 0||ot===!0,re=bt.dataReady,ge=b(w,ct);if(w.isDepthTexture)ht=v(w.format===Si,w.type),zt&&(Ut?e.texStorage2D(i.TEXTURE_2D,1,ht,ct.width,ct.height):e.texImage2D(i.TEXTURE_2D,0,ht,ct.width,ct.height,0,Ct,z,null));else if(w.isDataTexture)if(Ot.length>0){Ut&&zt&&e.texStorage2D(i.TEXTURE_2D,ge,ht,Ot[0].width,Ot[0].height);for(let Pt=0,ie=Ot.length;Pt<ie;Pt++)st=Ot[Pt],Ut?re&&e.texSubImage2D(i.TEXTURE_2D,Pt,0,0,st.width,st.height,Ct,z,st.data):e.texImage2D(i.TEXTURE_2D,Pt,ht,st.width,st.height,0,Ct,z,st.data);w.generateMipmaps=!1}else Ut?(zt&&e.texStorage2D(i.TEXTURE_2D,ge,ht,ct.width,ct.height),re&&dt(w,ct,Ct,z)):e.texImage2D(i.TEXTURE_2D,0,ht,ct.width,ct.height,0,Ct,z,ct.data);else if(w.isCompressedTexture)if(w.isCompressedArrayTexture){Ut&&zt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,ge,ht,Ot[0].width,Ot[0].height,ct.depth);for(let Pt=0,ie=Ot.length;Pt<ie;Pt++)if(st=Ot[Pt],w.format!==Yn)if(Ct!==null)if(Ut){if(re)if(w.layerUpdates.size>0){let me=gh(st.width,st.height,w.format,w.type);for(let Wt of w.layerUpdates){let Ce=st.data.subarray(Wt*me/st.data.BYTES_PER_ELEMENT,(Wt+1)*me/st.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,Pt,0,0,Wt,st.width,st.height,1,Ct,Ce)}}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,Pt,0,0,0,st.width,st.height,ct.depth,Ct,st.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,Pt,ht,st.width,st.height,ct.depth,0,st.data,0,0);else ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Ut?re&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,Pt,0,0,0,st.width,st.height,ct.depth,Ct,z,st.data):e.texImage3D(i.TEXTURE_2D_ARRAY,Pt,ht,st.width,st.height,ct.depth,0,Ct,z,st.data);w.layerUpdates.size>0&&w.clearLayerUpdates()}else{Ut&&zt&&e.texStorage2D(i.TEXTURE_2D,ge,ht,Ot[0].width,Ot[0].height);for(let Pt=0,ie=Ot.length;Pt<ie;Pt++)st=Ot[Pt],w.format!==Yn?Ct!==null?Ut?re&&e.compressedTexSubImage2D(i.TEXTURE_2D,Pt,0,0,st.width,st.height,Ct,st.data):e.compressedTexImage2D(i.TEXTURE_2D,Pt,ht,st.width,st.height,0,st.data):ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Ut?re&&e.texSubImage2D(i.TEXTURE_2D,Pt,0,0,st.width,st.height,Ct,z,st.data):e.texImage2D(i.TEXTURE_2D,Pt,ht,st.width,st.height,0,Ct,z,st.data)}else if(w.isDataArrayTexture)if(Ut){if(zt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,ge,ht,ct.width,ct.height,ct.depth),re)if(w.layerUpdates.size>0){let Pt=gh(ct.width,ct.height,w.format,w.type);for(let ie of w.layerUpdates){let me=ct.data.subarray(ie*Pt/ct.data.BYTES_PER_ELEMENT,(ie+1)*Pt/ct.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,ie,ct.width,ct.height,1,Ct,z,me)}w.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,ct.width,ct.height,ct.depth,Ct,z,ct.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,ht,ct.width,ct.height,ct.depth,0,Ct,z,ct.data);else if(w.isData3DTexture)Ut?(zt&&e.texStorage3D(i.TEXTURE_3D,ge,ht,ct.width,ct.height,ct.depth),re&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,ct.width,ct.height,ct.depth,Ct,z,ct.data)):e.texImage3D(i.TEXTURE_3D,0,ht,ct.width,ct.height,ct.depth,0,Ct,z,ct.data);else if(w.isFramebufferTexture){if(zt)if(Ut)e.texStorage2D(i.TEXTURE_2D,ge,ht,ct.width,ct.height);else{let Pt=ct.width,ie=ct.height;for(let me=0;me<ge;me++)e.texImage2D(i.TEXTURE_2D,me,ht,Pt,ie,0,Ct,z,null),Pt>>=1,ie>>=1}}else if(w.isHTMLTexture){if("texElementImage2D"in i){let Pt=i.canvas;if(Pt.hasAttribute("layoutsubtree")||Pt.setAttribute("layoutsubtree","true"),ct.parentNode!==Pt){Pt.appendChild(ct),f.add(w),Pt.onpaint=ie=>{let me=ie.changedElements;for(let Wt of f)me.includes(Wt.image)&&(Wt.needsUpdate=!0)},Pt.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,ct);else{let me=i.RGBA,Wt=i.RGBA,Ce=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,me,Wt,Ce,ct)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(Ot.length>0){if(Ut&&zt){let Pt=Rt(Ot[0]);e.texStorage2D(i.TEXTURE_2D,ge,ht,Pt.width,Pt.height)}for(let Pt=0,ie=Ot.length;Pt<ie;Pt++)st=Ot[Pt],Ut?re&&e.texSubImage2D(i.TEXTURE_2D,Pt,0,0,Ct,z,st):e.texImage2D(i.TEXTURE_2D,Pt,ht,Ct,z,st);w.generateMipmaps=!1}else if(Ut){if(zt){let Pt=Rt(ct);e.texStorage2D(i.TEXTURE_2D,ge,ht,Pt.width,Pt.height)}re&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,Ct,z,ct)}else e.texImage2D(i.TEXTURE_2D,0,ht,Ct,z,ct);S(w)&&w.mipmapsAutoUpdate===!0&&y(gt),Et.__version=bt.version,w.onUpdate&&w.onUpdate(w)}C.__version=w.version}function pt(C,w,q){if(w.image.length!==6)return;let gt=mt(C,w),ot=w.source;e.bindTexture(i.TEXTURE_CUBE_MAP,C.__webglTexture,i.TEXTURE0+q);let bt=n.get(ot);if(ot.version!==bt.__version||gt===!0){e.activeTexture(i.TEXTURE0+q);let Et=Te.getPrimaries(Te.workingColorSpace),rt=w.colorSpace===bi?null:Te.getPrimaries(w.colorSpace),ct=w.colorSpace===bi||Et===rt?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,w.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,w.premultiplyAlpha),e.pixelStorei(i.UNPACK_ALIGNMENT,w.unpackAlignment),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,ct);let Ct=w.isCompressedTexture||w.image[0].isCompressedTexture,z=w.image[0]&&w.image[0].isDataTexture,ht=[];for(let Wt=0;Wt<6;Wt++)!Ct&&!z?ht[Wt]=_(w.image[Wt],!0,s.maxCubemapSize):ht[Wt]=z?w.image[Wt].image:w.image[Wt],ht[Wt]=wt(w,ht[Wt]);let st=ht[0],Ot=r.convert(w.format,w.colorSpace),Ut=r.convert(w.type),zt=A(w.internalFormat,Ot,Ut,w.normalized,w.colorSpace),re=w.isVideoTexture!==!0,ge=bt.__version===void 0||gt===!0,Pt=ot.dataReady,ie=b(w,st);jt(i.TEXTURE_CUBE_MAP,w);let me;if(w.isDepthTexture){if(zt=v(w.format===Si,w.type),ge)if(re)e.texStorage2D(i.TEXTURE_CUBE_MAP,1,zt,st.width,st.height);else for(let Wt=0;Wt<6;Wt++)e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,0,zt,st.width,st.height,0,Ot,Ut,null)}else if(Ct){re&&ge&&e.texStorage2D(i.TEXTURE_CUBE_MAP,ie,zt,st.width,st.height);for(let Wt=0;Wt<6;Wt++){me=ht[Wt].mipmaps;for(let Ce=0;Ce<me.length;Ce++){let Xe=me[Ce];w.format!==Yn?Ot!==null?re?Pt&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce,0,0,Xe.width,Xe.height,Ot,Xe.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce,zt,Xe.width,Xe.height,0,Xe.data):ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):re?Pt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce,0,0,Xe.width,Xe.height,Ot,Ut,Xe.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce,zt,Xe.width,Xe.height,0,Ot,Ut,Xe.data)}}}else{if(me=w.mipmaps,re&&ge){me.length>0&&ie++;let Wt=Rt(ht[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,ie,zt,Wt.width,Wt.height)}for(let Wt=0;Wt<6;Wt++)if(z){re?Pt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,0,0,0,ht[Wt].width,ht[Wt].height,Ot,Ut,ht[Wt].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,0,zt,ht[Wt].width,ht[Wt].height,0,Ot,Ut,ht[Wt].data);for(let Ce=0;Ce<me.length;Ce++){let On=me[Ce].image[Wt].image;re?Pt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce+1,0,0,On.width,On.height,Ot,Ut,On.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce+1,zt,On.width,On.height,0,Ot,Ut,On.data)}}else{re?Pt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,0,0,0,Ot,Ut,ht[Wt]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,0,zt,Ot,Ut,ht[Wt]);for(let Ce=0;Ce<me.length;Ce++){let Xe=me[Ce];re?Pt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce+1,0,0,Ot,Ut,Xe.image[Wt]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Wt,Ce+1,zt,Ot,Ut,Xe.image[Wt])}}}S(w)&&w.mipmapsAutoUpdate===!0&&y(i.TEXTURE_CUBE_MAP),bt.__version=ot.version,w.onUpdate&&w.onUpdate(w)}C.__version=w.version}function xt(C,w,q,gt,ot,bt){let Et=r.convert(q.format,q.colorSpace),rt=r.convert(q.type),ct=A(q.internalFormat,Et,rt,q.normalized,q.colorSpace),Ct=n.get(w),z=n.get(q);if(z.__renderTarget=w,!Ct.__hasExternalTextures){let ht=Math.max(1,w.width>>bt),st=Math.max(1,w.height>>bt);ot===i.TEXTURE_3D||ot===i.TEXTURE_2D_ARRAY?e.texImage3D(ot,bt,ct,ht,st,w.depth,0,Et,rt,null):e.texImage2D(ot,bt,ct,ht,st,0,Et,rt,null)}e.bindFramebuffer(i.FRAMEBUFFER,C),ft(w)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,gt,ot,z.__webglTexture,0,Bt(w)):(ot===i.TEXTURE_2D||ot>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&ot<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,gt,ot,z.__webglTexture,bt),e.bindFramebuffer(i.FRAMEBUFFER,null)}function At(C,w,q){if(i.bindRenderbuffer(i.RENDERBUFFER,C),w.depthBuffer){let gt=w.depthTexture,ot=gt&&gt.isDepthTexture?gt.type:null,bt=v(w.stencilBuffer,ot),Et=w.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;ft(w)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Bt(w),bt,w.width,w.height):q?i.renderbufferStorageMultisample(i.RENDERBUFFER,Bt(w),bt,w.width,w.height):i.renderbufferStorage(i.RENDERBUFFER,bt,w.width,w.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,Et,i.RENDERBUFFER,C)}else{let gt=w.textures;for(let ot=0;ot<gt.length;ot++){let bt=gt[ot],Et=r.convert(bt.format,bt.colorSpace),rt=r.convert(bt.type),ct=A(bt.internalFormat,Et,rt,bt.normalized,bt.colorSpace);ft(w)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Bt(w),ct,w.width,w.height):q?i.renderbufferStorageMultisample(i.RENDERBUFFER,Bt(w),ct,w.width,w.height):i.renderbufferStorage(i.RENDERBUFFER,ct,w.width,w.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Tt(C,w,q){let gt=w.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(i.FRAMEBUFFER,C),!(w.depthTexture&&w.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let ot=n.get(w.depthTexture);ot.__renderTarget=w;let bt=gt?w.depthTexture.image[0]:w.depthTexture.image;(!ot.__webglTexture||bt.width!==w.width||bt.height!==w.height)&&(bt.width=w.width,bt.height=w.height,w.depthTexture.needsUpdate=!0),gt?et(w.depthTexture,0):lt(w.depthTexture,0);let Et=ot.__webglTexture,rt=Bt(w),ct=gt?i.TEXTURE_CUBE_MAP_POSITIVE_X+q:i.TEXTURE_2D,Ct=w.depthTexture.format===Si?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(w.depthTexture.format===vi)ft(w)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Ct,ct,Et,0,rt):i.framebufferTexture2D(i.FRAMEBUFFER,Ct,ct,Et,0);else if(w.depthTexture.format===Si)ft(w)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Ct,ct,Et,0,rt):i.framebufferTexture2D(i.FRAMEBUFFER,Ct,ct,Et,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function $t(C){let w=n.get(C),q=C.isWebGLCubeRenderTarget===!0;if(w.__boundDepthTexture!==C.depthTexture){let gt=C.depthTexture;if(w.__depthDisposeCallback&&w.__depthDisposeCallback(),gt){let ot=()=>{delete w.__boundDepthTexture,delete w.__depthDisposeCallback,gt.removeEventListener("dispose",ot)};gt.addEventListener("dispose",ot),w.__depthDisposeCallback=ot}w.__boundDepthTexture=gt}if(C.depthTexture&&!w.__autoAllocateDepthBuffer)if(q)for(let gt=0;gt<6;gt++)Tt(w.__webglFramebuffer[gt],C,gt);else C.texture.mipmaps.length>0?Tt(w.__webglFramebuffer[0],C,0):Tt(w.__webglFramebuffer,C,0);else if(q){w.__webglDepthbuffer=[];for(let gt=0;gt<6;gt++)if(e.bindFramebuffer(i.FRAMEBUFFER,w.__webglFramebuffer[gt]),w.__webglDepthbuffer[gt]===void 0)w.__webglDepthbuffer[gt]=i.createRenderbuffer(),At(w.__webglDepthbuffer[gt],C,!1);else{let ot=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,bt=w.__webglDepthbuffer[gt];i.bindRenderbuffer(i.RENDERBUFFER,bt),i.framebufferRenderbuffer(i.FRAMEBUFFER,ot,i.RENDERBUFFER,bt)}}else if(C.texture.mipmaps.length>0?e.bindFramebuffer(i.FRAMEBUFFER,w.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,w.__webglFramebuffer),w.__webglDepthbuffer===void 0)w.__webglDepthbuffer=i.createRenderbuffer(),At(w.__webglDepthbuffer,C,!1);else{let ot=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,bt=w.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,bt),i.framebufferRenderbuffer(i.FRAMEBUFFER,ot,i.RENDERBUFFER,bt)}e.bindFramebuffer(i.FRAMEBUFFER,null)}function K(C,w,q){let gt=n.get(C);w!==void 0&&xt(gt.__webglFramebuffer,C,C.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),q!==void 0&&$t(C)}function St(C){let w=C.texture,q=n.get(C),gt=n.get(w);C.addEventListener("dispose",O),D(C);let ot=C.textures,bt=C.isWebGLCubeRenderTarget===!0,Et=ot.length>1;if(Et||(gt.__webglTexture===void 0&&(gt.__webglTexture=i.createTexture()),gt.__version=w.version,o.memory.textures++),bt){q.__webglFramebuffer=[];for(let rt=0;rt<6;rt++)if(w.mipmaps.length>0){q.__webglFramebuffer[rt]=[];for(let ct=0;ct<w.mipmaps.length;ct++)q.__webglFramebuffer[rt][ct]=i.createFramebuffer()}else q.__webglFramebuffer[rt]=i.createFramebuffer()}else{if(w.mipmaps.length>0){q.__webglFramebuffer=[];for(let rt=0;rt<w.mipmaps.length;rt++)q.__webglFramebuffer[rt]=i.createFramebuffer()}else q.__webglFramebuffer=i.createFramebuffer();if(Et)for(let rt=0,ct=ot.length;rt<ct;rt++){let Ct=n.get(ot[rt]);Ct.__webglTexture===void 0&&(Ct.__webglTexture=i.createTexture(),o.memory.textures++)}if(C.samples>0&&ft(C)===!1){q.__webglMultisampledFramebuffer=i.createFramebuffer(),q.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,q.__webglMultisampledFramebuffer);for(let rt=0;rt<ot.length;rt++){let ct=ot[rt];q.__webglColorRenderbuffer[rt]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,q.__webglColorRenderbuffer[rt]);let Ct=r.convert(ct.format,ct.colorSpace),z=r.convert(ct.type),ht=A(ct.internalFormat,Ct,z,ct.normalized,ct.colorSpace,C.isXRRenderTarget===!0),st=Bt(C);i.renderbufferStorageMultisample(i.RENDERBUFFER,st,ht,C.width,C.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+rt,i.RENDERBUFFER,q.__webglColorRenderbuffer[rt])}i.bindRenderbuffer(i.RENDERBUFFER,null),C.depthBuffer&&(q.__webglDepthRenderbuffer=i.createRenderbuffer(),At(q.__webglDepthRenderbuffer,C,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(bt){e.bindTexture(i.TEXTURE_CUBE_MAP,gt.__webglTexture),jt(i.TEXTURE_CUBE_MAP,w);for(let rt=0;rt<6;rt++)if(w.mipmaps.length>0)for(let ct=0;ct<w.mipmaps.length;ct++)xt(q.__webglFramebuffer[rt][ct],C,w,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+rt,ct);else xt(q.__webglFramebuffer[rt],C,w,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+rt,0);S(w)?y(i.TEXTURE_CUBE_MAP):w.mipmaps.length>0&&i.texParameteri(i.TEXTURE_CUBE_MAP,i.TEXTURE_MAX_LEVEL,w.mipmaps.length-1),e.unbindTexture()}else if(Et){for(let rt=0,ct=ot.length;rt<ct;rt++){let Ct=ot[rt],z=n.get(Ct),ht=i.TEXTURE_2D;(C.isWebGL3DRenderTarget||C.isWebGLArrayRenderTarget)&&(ht=C.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(ht,z.__webglTexture),jt(ht,Ct),xt(q.__webglFramebuffer,C,Ct,i.COLOR_ATTACHMENT0+rt,ht,0),S(Ct)&&y(ht)}e.unbindTexture()}else{let rt=i.TEXTURE_2D;if((C.isWebGL3DRenderTarget||C.isWebGLArrayRenderTarget)&&(rt=C.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(rt,gt.__webglTexture),jt(rt,w),w.mipmaps.length>0)for(let ct=0;ct<w.mipmaps.length;ct++)xt(q.__webglFramebuffer[ct],C,w,i.COLOR_ATTACHMENT0,rt,ct);else xt(q.__webglFramebuffer,C,w,i.COLOR_ATTACHMENT0,rt,0);S(w)?y(rt):w.mipmaps.length>0&&i.texParameteri(rt,i.TEXTURE_MAX_LEVEL,w.mipmaps.length-1),e.unbindTexture()}C.depthBuffer&&$t(C)}function F(C){let w=C.textures;for(let q=0,gt=w.length;q<gt;q++){let ot=w[q];if(S(ot)&&ot.mipmapsAutoUpdate===!0){let bt=T(C),Et=n.get(ot).__webglTexture;e.bindTexture(bt,Et),y(bt),e.unbindTexture()}}}let Ht=[];function Dt(C){if(C.samples>0){if(ft(C)===!1){let w=C.textures,q=C.width,gt=C.height,ot=i.COLOR_BUFFER_BIT,bt=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,Et=n.get(C),rt=w.length>1;if(rt)for(let Ct=0;Ct<w.length;Ct++)e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ct,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ct,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,Et.__webglMultisampledFramebuffer),C.texture.mipmaps.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Et.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Et.__webglFramebuffer);for(let Ct=0;Ct<w.length;Ct++){if(C.resolveDepthBuffer&&(C.depthBuffer&&(ot|=i.DEPTH_BUFFER_BIT),C.stencilBuffer&&C.resolveStencilBuffer&&(ot|=i.STENCIL_BUFFER_BIT)),rt){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,Et.__webglColorRenderbuffer[Ct]);let z=n.get(w[Ct]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,z,0)}i.blitFramebuffer(0,0,q,gt,0,0,q,gt,ot,i.NEAREST),l===!0&&(Ht.length=0,Ht.push(i.COLOR_ATTACHMENT0+Ct),C.depthBuffer&&C.storeMultisampledDepthBuffer===!1&&Ht.push(bt),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,Ht))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),rt)for(let Ct=0;Ct<w.length;Ct++){e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ct,i.RENDERBUFFER,Et.__webglColorRenderbuffer[Ct]);let z=n.get(w[Ct]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ct,i.TEXTURE_2D,z,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Et.__webglMultisampledFramebuffer)}else if(C.depthBuffer&&C.storeMultisampledDepthBuffer===!1&&l){let w=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[w])}}}function Bt(C){return Math.min(s.maxSamples,C.samples)}function ft(C){let w=n.get(C);return C.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&w.__useRenderToTexture!==!1}function ee(C){let w=o.render.frame;h.get(C)!==w&&(h.set(C,w),C.update())}function wt(C,w){let q=C.colorSpace,gt=C.format,ot=C.type;return C.isCompressedTexture===!0||C.isVideoTexture===!0||q!==Sr&&q!==bi&&(Te.getTransfer(q)===Le?(gt!==Yn||ot!==Pn)&&ae("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):ce("WebGLTextures: Unsupported texture color space:",q)),w}function Rt(C){return typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement?(c.width=C.naturalWidth||C.width,c.height=C.naturalHeight||C.height):typeof VideoFrame<"u"&&C instanceof VideoFrame?(c.width=C.displayWidth,c.height=C.displayHeight):(c.width=C.width,c.height=C.height),c}this.allocateTextureUnit=Ft,this.resetTextureUnits=Y,this.getTextureUnits=tt,this.setTextureUnits=vt,this.setTexture2D=lt,this.setTexture2DArray=yt,this.setTexture3D=kt,this.setTextureCube=et,this.rebindTextures=K,this.setupRenderTarget=St,this.updateRenderTargetMipmap=F,this.updateMultisampleRenderTarget=Dt,this.setupDepthRenderbuffer=$t,this.setupFrameBufferTexture=xt,this.useMultisampledRTT=ft,this.dispose=B}function Tv(i,t){function e(n,s=bi){let r,o=Te.getTransfer(s);if(n===Pn)return i.UNSIGNED_BYTE;if(n===ja)return i.UNSIGNED_SHORT_4_4_4_4;if(n===tl)return i.UNSIGNED_SHORT_5_5_5_1;if(n===th)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===eh)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Qc)return i.BYTE;if(n===jc)return i.SHORT;if(n===Ks)return i.UNSIGNED_SHORT;if(n===Qa)return i.INT;if(n===Wn)return i.UNSIGNED_INT;if(n===Xn)return i.FLOAT;if(n===qn)return i.HALF_FLOAT;if(n===nh)return i.ALPHA;if(n===ih)return i.RGB;if(n===Yn)return i.RGBA;if(n===vi)return i.DEPTH_COMPONENT;if(n===Si)return i.DEPTH_STENCIL;if(n===sh)return i.RED;if(n===el)return i.RED_INTEGER;if(n===ki)return i.RG;if(n===nl)return i.RG_INTEGER;if(n===il)return i.RGBA_INTEGER;if(n===to||n===eo||n===no||n===io)if(o===Le)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===to)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===eo)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===no)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===io)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===to)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===eo)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===no)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===io)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===sl||n===rl||n===ol||n===al)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===sl)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===rl)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===ol)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===al)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===ll||n===cl||n===hl||n===ul||n===fl||n===so||n===dl)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===ll||n===cl)return o===Le?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===hl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===ul)return r.COMPRESSED_R11_EAC;if(n===fl)return r.COMPRESSED_SIGNED_R11_EAC;if(n===so)return r.COMPRESSED_RG11_EAC;if(n===dl)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===pl||n===ml||n===gl||n===_l||n===xl||n===vl||n===yl||n===Ml||n===Sl||n===bl||n===wl||n===Al||n===Tl||n===El)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===pl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===ml)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===gl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===_l)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===xl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===vl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===yl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Ml)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Sl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===bl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===wl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Al)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Tl)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===El)return o===Le?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Rl||n===Cl||n===Il)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===Rl)return o===Le?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Cl)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Il)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Pl||n===Ll||n===ro||n===Nl)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Pl)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Ll)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===ro)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Nl)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===ls?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}var Ev=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Rv=`
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

}`,Ih=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){let n=new Nr(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new mn({vertexShader:Ev,fragmentShader:Rv,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new Mn(new ss(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Ph=class extends jn{constructor(t,e){super();let n=this,s=null,r=1,o=null,a="local-floor",l=1,c=null,h=null,f=null,d=null,u=null,m=null,x=typeof XRWebGLBinding<"u",p=new Ih,g={},_=e.getContextAttributes(),S=null,y=null,T=[],A=[],v=new Nt,b=null,D=null,P=new hn;P.viewport=new We;let I=new hn;I.viewport=new We;let O=[P,I],V=new Ya,R=null,B=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function($){let lt=T[$];return lt===void 0&&(lt=new zs,T[$]=lt),lt.getTargetRaySpace()},this.getControllerGrip=function($){let lt=T[$];return lt===void 0&&(lt=new zs,T[$]=lt),lt.getGripSpace()},this.getHand=function($){let lt=T[$];return lt===void 0&&(lt=new zs,T[$]=lt),lt.getHandSpace()};function G($){let lt=A.indexOf($.inputSource);if(lt===-1)return;let yt=T[lt];yt!==void 0&&(yt.update($.inputSource,$.frame,c||o),yt.dispatchEvent({type:$.type,data:$.inputSource}))}function N(){s.removeEventListener("select",G),s.removeEventListener("selectstart",G),s.removeEventListener("selectend",G),s.removeEventListener("squeeze",G),s.removeEventListener("squeezestart",G),s.removeEventListener("squeezeend",G),s.removeEventListener("end",N),s.removeEventListener("inputsourceschange",X);for(let $=0;$<T.length;$++){let lt=A[$];lt!==null&&(A[$]=null,T[$].disconnect(lt))}R=null,B=null,p.reset();for(let $ in g)delete g[$];if(t.setRenderTarget(S),u=null,d=null,f=null,s=null,y=null,Ft.stop(),n.isPresenting=!1,t.setPixelRatio(b),t.setSize(v.width,v.height,!1),D!==null){let $=D.camera;$.fov=D.fov,$.zoom=D.zoom,$.updateProjectionMatrix(),D=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function($){r=$,n.isPresenting===!0&&ae("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function($){a=$,n.isPresenting===!0&&ae("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function($){c=$},this.getBaseLayer=function(){return d!==null?d:u},this.getBinding=function(){return f===null&&x&&(f=new XRWebGLBinding(s,e)),f},this.getFrame=function(){return m},this.getSession=function(){return s},this.setSession=async function($){if(s=$,s!==null){if(S=t.getRenderTarget(),s.addEventListener("select",G),s.addEventListener("selectstart",G),s.addEventListener("selectend",G),s.addEventListener("squeeze",G),s.addEventListener("squeezestart",G),s.addEventListener("squeezeend",G),s.addEventListener("end",N),s.addEventListener("inputsourceschange",X),_.xrCompatible!==!0&&await e.makeXRCompatible(),b=t.getPixelRatio(),t.getSize(v),x&&"createProjectionLayer"in XRWebGLBinding.prototype){let yt=null,kt=null,et=null;_.depth&&(et=_.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,yt=_.stencil?Si:vi,kt=_.stencil?ls:Wn);let Zt={colorFormat:e.RGBA8,depthFormat:et,scaleFactor:r};f=this.getBinding(),d=f.createProjectionLayer(Zt),s.updateRenderState({layers:[d]}),t.setPixelRatio(1),t.setSize(d.textureWidth,d.textureHeight,!1),y=new pn(d.textureWidth,d.textureHeight,{format:Yn,type:Pn,depthTexture:new yi(d.textureWidth,d.textureHeight,kt,void 0,void 0,void 0,void 0,void 0,void 0,yt),stencilBuffer:_.stencil,colorSpace:t.outputColorSpace,samples:_.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}else{let yt={antialias:_.antialias,alpha:!0,depth:_.depth,stencil:_.stencil,framebufferScaleFactor:r};u=new XRWebGLLayer(s,e,yt),s.updateRenderState({baseLayer:u}),t.setPixelRatio(1),t.setSize(u.framebufferWidth,u.framebufferHeight,!1),y=new pn(u.framebufferWidth,u.framebufferHeight,{format:Yn,type:Pn,colorSpace:t.outputColorSpace,stencilBuffer:_.stencil,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1,storeMultisampledDepthBuffer:u.ignoreDepthValues===!1,storeMultisampledStencilBuffer:u.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await s.requestReferenceSpace(a),Ft.setContext(s),Ft.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function X($){for(let lt=0;lt<$.removed.length;lt++){let yt=$.removed[lt],kt=A.indexOf(yt);kt>=0&&(A[kt]=null,T[kt].disconnect(yt))}for(let lt=0;lt<$.added.length;lt++){let yt=$.added[lt],kt=A.indexOf(yt);if(kt===-1){for(let Zt=0;Zt<T.length;Zt++)if(Zt>=A.length){A.push(yt),kt=Zt;break}else if(A[Zt]===null){A[Zt]=yt,kt=Zt;break}if(kt===-1)break}let et=T[kt];et&&et.connect(yt)}}function U($,lt){lt===null?$.matrixWorld.copy($.matrix):$.matrixWorld.multiplyMatrices(lt.matrixWorld,$.matrix),$.matrixWorldInverse.copy($.matrixWorld).invert()}this.updateCamera=function($){if(s===null)return;let lt=$.near,yt=$.far;p.texture!==null&&(p.depthNear>0&&(lt=p.depthNear),p.depthFar>0&&(yt=p.depthFar)),V.near=I.near=P.near=lt,V.far=I.far=P.far=yt,(R!==V.near||B!==V.far)&&(s.updateRenderState({depthNear:V.near,depthFar:V.far}),R=V.near,B=V.far),V.layers.mask=$.layers.mask|6,P.layers.mask=V.layers.mask&-5,I.layers.mask=V.layers.mask&-3;let kt=$.parent,et=V.cameras;U(V,kt);for(let Zt=0;Zt<et.length;Zt++)U(et[Zt],kt);V.projectionMatrix.copy(P.projectionMatrix),V.projectionMatrixInverse.copy(P.projectionMatrixInverse),D===null&&$.isPerspectiveCamera&&(D={camera:$,fov:$.fov,zoom:$.zoom}),Y($,V,kt)};function Y($,lt,yt){yt===null?$.matrix.copy(lt.matrixWorld):($.matrix.copy(yt.matrixWorld),$.matrix.invert(),$.matrix.multiply(lt.matrixWorld)),$.matrix.decompose($.position,$.quaternion,$.scale),$.updateMatrixWorld(!0),$.projectionMatrix.copy(lt.projectionMatrix),$.projectionMatrixInverse.copy(lt.projectionMatrixInverse),$.isPerspectiveCamera&&($.fov=_a*2*Math.atan(1/$.projectionMatrix.elements[5]),$.zoom=1)}this.getCamera=function(){return V},this.getFoveation=function(){if(!(d===null&&u===null))return l},this.setFoveation=function($){l=$,d!==null&&(d.fixedFoveation=$),u!==null&&u.fixedFoveation!==void 0&&(u.fixedFoveation=$)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(V)},this.getCameraTexture=function($){return g[$]};let tt=null;function vt($,lt){if(h=lt.getViewerPose(c||o),m=lt,h!==null){let yt=h.views;u!==null&&(t.setRenderTargetFramebuffer(y,u.framebuffer),t.setRenderTarget(y));let kt=!1;yt.length!==V.cameras.length&&(V.cameras.length=0,kt=!0);for(let at=0;at<yt.length;at++){let jt=yt[at],mt=null;if(u!==null)mt=u.getViewport(jt);else{let dt=f.getViewSubImage(d,jt);mt=dt.viewport,at===0&&(t.setRenderTargetTextures(y,dt.colorTexture,dt.depthStencilTexture),t.setRenderTarget(y))}let Q=O[at];Q===void 0&&(Q=new hn,Q.layers.enable(at),Q.viewport=new We,O[at]=Q),Q.matrix.fromArray(jt.transform.matrix),Q.matrix.decompose(Q.position,Q.quaternion,Q.scale),Q.projectionMatrix.fromArray(jt.projectionMatrix),Q.projectionMatrixInverse.copy(Q.projectionMatrix).invert(),Q.viewport.set(mt.x,mt.y,mt.width,mt.height),at===0&&(V.matrix.copy(Q.matrix),V.matrix.decompose(V.position,V.quaternion,V.scale)),kt===!0&&V.cameras.push(Q)}let et=s.enabledFeatures;if(et&&et.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&x){f=n.getBinding();let at=f.getDepthInformation(yt[0]);at&&at.isValid&&at.texture&&p.init(at,s.renderState)}if(et&&et.includes("camera-access")&&x){t.state.unbindTexture(),f=n.getBinding();for(let at=0;at<yt.length;at++){let jt=yt[at].camera;if(jt){let mt=g[jt];mt||(mt=new Nr,g[jt]=mt);let Q=f.getCameraImage(jt);mt.sourceTexture=Q}}}}for(let yt=0;yt<T.length;yt++){let kt=A[yt],et=T[yt];kt!==null&&et!==void 0&&et.update(kt,lt,c||o)}tt&&tt($,lt),lt.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:lt}),m=null}let Ft=new ad;Ft.setAnimationLoop(vt),this.setAnimationLoop=function($){tt=$},this.dispose=function(){}}},Cv=new fe,_d=new he;_d.set(-1,0,0,0,1,0,0,0,1);function Iv(i,t){function e(p,g){p.matrixAutoUpdate===!0&&p.updateMatrix(),g.value.copy(p.matrix)}function n(p,g){g.color.getRGB(p.fogColor.value,dh(i)),g.isFog?(p.fogNear.value=g.near,p.fogFar.value=g.far):g.isFogExp2&&(p.fogDensity.value=g.density)}function s(p,g,_,S,y){g.isNodeMaterial?g.uniformsNeedUpdate=!1:g.isMeshBasicMaterial?r(p,g):g.isMeshLambertMaterial?(r(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshToonMaterial?(r(p,g),f(p,g)):g.isMeshPhongMaterial?(r(p,g),h(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshStandardMaterial?(r(p,g),d(p,g),g.isMeshPhysicalMaterial&&u(p,g,y)):g.isMeshMatcapMaterial?(r(p,g),m(p,g)):g.isMeshDepthMaterial?r(p,g):g.isMeshDistanceMaterial?(r(p,g),x(p,g)):g.isMeshNormalMaterial?r(p,g):g.isLineBasicMaterial?(o(p,g),g.isLineDashedMaterial&&a(p,g)):g.isPointsMaterial?l(p,g,_,S):g.isSpriteMaterial?c(p,g):g.isShadowMaterial?(p.color.value.copy(g.color),p.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function r(p,g){p.opacity.value=g.opacity,g.color&&p.diffuse.value.copy(g.color),g.emissive&&p.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(p.map.value=g.map,e(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.bumpMap&&(p.bumpMap.value=g.bumpMap,e(g.bumpMap,p.bumpMapTransform),p.bumpScale.value=g.bumpScale,g.side===gn&&(p.bumpScale.value*=-1)),g.normalMap&&(p.normalMap.value=g.normalMap,e(g.normalMap,p.normalMapTransform),p.normalScale.value.copy(g.normalScale),g.side===gn&&p.normalScale.value.negate()),g.displacementMap&&(p.displacementMap.value=g.displacementMap,e(g.displacementMap,p.displacementMapTransform),p.displacementScale.value=g.displacementScale,p.displacementBias.value=g.displacementBias),g.emissiveMap&&(p.emissiveMap.value=g.emissiveMap,e(g.emissiveMap,p.emissiveMapTransform)),g.specularMap&&(p.specularMap.value=g.specularMap,e(g.specularMap,p.specularMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest);let _=t.get(g),S=_.envMap,y=_.envMapRotation;S&&(p.envMap.value=S,p.envMapRotation.value.setFromMatrix4(Cv.makeRotationFromEuler(y)).transpose(),S.isCubeTexture&&S.isRenderTargetTexture===!1&&p.envMapRotation.value.premultiply(_d),p.reflectivity.value=g.reflectivity,p.ior.value=g.ior,p.refractionRatio.value=g.refractionRatio),g.lightMap&&(p.lightMap.value=g.lightMap,p.lightMapIntensity.value=g.lightMapIntensity,e(g.lightMap,p.lightMapTransform)),g.aoMap&&(p.aoMap.value=g.aoMap,p.aoMapIntensity.value=g.aoMapIntensity,e(g.aoMap,p.aoMapTransform))}function o(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,g.map&&(p.map.value=g.map,e(g.map,p.mapTransform))}function a(p,g){p.dashSize.value=g.dashSize,p.totalSize.value=g.dashSize+g.gapSize,p.scale.value=g.scale}function l(p,g,_,S){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.size.value=g.size*_,p.scale.value=S*.5,g.map&&(p.map.value=g.map,e(g.map,p.uvTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function c(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.rotation.value=g.rotation,g.map&&(p.map.value=g.map,e(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function h(p,g){p.specular.value.copy(g.specular),p.shininess.value=Math.max(g.shininess,1e-4)}function f(p,g){g.gradientMap&&(p.gradientMap.value=g.gradientMap)}function d(p,g){p.metalness.value=g.metalness,g.metalnessMap&&(p.metalnessMap.value=g.metalnessMap,e(g.metalnessMap,p.metalnessMapTransform)),p.roughness.value=g.roughness,g.roughnessMap&&(p.roughnessMap.value=g.roughnessMap,e(g.roughnessMap,p.roughnessMapTransform)),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)}function u(p,g,_){p.ior.value=g.ior,g.diffuseRoughness>0&&(p.diffuseRoughness.value=g.diffuseRoughness,g.diffuseRoughnessMap&&(p.diffuseRoughnessMap.value=g.diffuseRoughnessMap,e(g.diffuseRoughnessMap,p.diffuseRoughnessMapTransform))),g.sheen>0&&(p.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),p.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(p.sheenColorMap.value=g.sheenColorMap,e(g.sheenColorMap,p.sheenColorMapTransform)),g.sheenRoughnessMap&&(p.sheenRoughnessMap.value=g.sheenRoughnessMap,e(g.sheenRoughnessMap,p.sheenRoughnessMapTransform))),g.clearcoat>0&&(p.clearcoat.value=g.clearcoat,p.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(p.clearcoatMap.value=g.clearcoatMap,e(g.clearcoatMap,p.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,e(g.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(p.clearcoatNormalMap.value=g.clearcoatNormalMap,e(g.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===gn&&p.clearcoatNormalScale.value.negate())),g.dispersion>0&&(p.dispersion.value=g.dispersion),g.retroreflectivity>0&&(p.retroreflectivity.value=g.retroreflectivity),g.iridescence>0&&(p.iridescence.value=g.iridescence,p.iridescenceIOR.value=g.iridescenceIOR,p.iridescenceThicknessMinimum.value=g.iridescenceThicknessMinimum,p.iridescenceThicknessMaximum.value=g.iridescenceThicknessMaximum,g.iridescenceMap&&(p.iridescenceMap.value=g.iridescenceMap,e(g.iridescenceMap,p.iridescenceMapTransform)),g.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=g.iridescenceThicknessMap,e(g.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),g.transmission>0&&(p.transmission.value=g.transmission,p.transmissionSamplerMap.value=_.texture,p.transmissionSamplerSize.value.set(_.width,_.height),g.transmissionMap&&(p.transmissionMap.value=g.transmissionMap,e(g.transmissionMap,p.transmissionMapTransform)),p.thickness.value=g.thickness,g.thicknessMap&&(p.thicknessMap.value=g.thicknessMap,e(g.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=g.attenuationDistance,p.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(p.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(p.anisotropyMap.value=g.anisotropyMap,e(g.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=g.specularIntensity,p.specularColor.value.copy(g.specularColor),g.specularColorMap&&(p.specularColorMap.value=g.specularColorMap,e(g.specularColorMap,p.specularColorMapTransform)),g.specularIntensityMap&&(p.specularIntensityMap.value=g.specularIntensityMap,e(g.specularIntensityMap,p.specularIntensityMapTransform))}function m(p,g){g.matcap&&(p.matcap.value=g.matcap)}function x(p,g){let _=t.get(g).light;p.referencePosition.value.setFromMatrixPosition(_.matrixWorld),p.nearDistance.value=_.shadow.camera.near,p.farDistance.value=_.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function Pv(i,t,e,n){let s={},r={};function o(_,S){let y=S.program;n.uniformBlockBinding(_,y,s[_.id])}function a(_,S){let y=s[_.id];y===void 0&&(m(_),y=l(_),s[_.id]=y,_.addEventListener("dispose",p));let T=S.program;n.updateUBOMapping(_,T);let A=t.render.frame;r[_.id]!==A&&(c(_),r[_.id]=A)}function l(_){let S=i.createBuffer(),y=_.__size,T=_.usage;return i.bindBuffer(i.UNIFORM_BUFFER,S),i.bufferData(i.UNIFORM_BUFFER,y,T),i.bindBuffer(i.UNIFORM_BUFFER,null),S}function c(_){let S=s[_.id],y=_.uniforms,T=_.__cache;i.bindBuffer(i.UNIFORM_BUFFER,S);for(let A=0,v=y.length;A<v;A++){let b=y[A];if(Array.isArray(b))for(let D=0,P=b.length;D<P;D++)h(b[D],A,D,T);else h(b,A,0,T)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function h(_,S,y,T){if(d(_,S,y,T)===!0){let A=_.__offset,v=_.value;if(Array.isArray(v)){let b=0;for(let D=0;D<v.length;D++){let P=v[D],I=x(P,!0);f(P,_.__data,b),b+=I.storage/Float32Array.BYTES_PER_ELEMENT}}else f(v,_.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,A,_.__data)}}function f(_,S,y){typeof _=="number"||typeof _=="boolean"?S[y]=_:_.isMatrix3?(S[y]=_.elements[0],S[y+1]=_.elements[1],S[y+2]=_.elements[2],S[y+3]=0,S[y+4]=_.elements[3],S[y+5]=_.elements[4],S[y+6]=_.elements[5],S[y+7]=0,S[y+8]=_.elements[6],S[y+9]=_.elements[7],S[y+10]=_.elements[8],S[y+11]=0):ArrayBuffer.isView(_)?S.set(_.subarray(0,S.length-y),y):_.toArray(S,y)}function d(_,S,y,T){let A=_.value,v=S+"_"+y;if(Array.isArray(A)){T[v]===void 0&&(T[v]=[]);let b=T[v],D=!1;for(let P=0;P<A.length;P++)u(A[P],b,P)===!0&&(D=!0);return D}return u(A,T,v)}function u(_,S,y){if(S[y]===void 0)return typeof _=="number"||typeof _=="boolean"?S[y]=_:ArrayBuffer.isView(_)?S[y]=_.slice():S[y]=_.clone(),!0;{let T=S[y];if(typeof _=="number"||typeof _=="boolean"){if(T!==_)return S[y]=_,!0}else{if(ArrayBuffer.isView(_))return!0;if(T.equals(_)===!1)return T.copy(_),!0}}return!1}function m(_){let S=_.uniforms,y=0,T=16;for(let v=0,b=S.length;v<b;v++){let D=Array.isArray(S[v])?S[v]:[S[v]];for(let P=0,I=D.length;P<I;P++){let O=D[P],V=Array.isArray(O.value)?O.value:[O.value],R=Array.isArray(S[v])||Array.isArray(O.value),B=y;for(let N=0,X=V.length;N<X;N++){let U=V[N],Y=x(U,R),tt=y%T,vt=tt%Y.boundary,Ft=tt+vt;y+=vt,Ft!==0&&T-Ft<Y.storage&&(y+=T-Ft),N===0&&(B=y),y+=Y.storage}let G=O.type==="int"?Int32Array:O.type==="uint"?Uint32Array:Float32Array;O.__data=new G((y-B)/Float32Array.BYTES_PER_ELEMENT),O.__offset=B}}let A=y%T;return A>0&&(y+=T-A),_.__size=y,_.__cache={},this}function x(_,S){let y={boundary:0,storage:0};return typeof _=="number"||typeof _=="boolean"?(y.boundary=4,y.storage=4):_.isVector2?(y.boundary=8,y.storage=8):_.isVector3||_.isColor?(y.boundary=16,y.storage=12):_.isVector4?(y.boundary=16,y.storage=16):_.isMatrix3?(y.boundary=16,y.storage=48):_.isMatrix4?(y.boundary=16,y.storage=64):_.isTexture?ae("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(_)?(y.boundary=16,y.storage=_.byteLength):ae("WebGLRenderer: Unsupported uniform value type.",_),S===!0&&(y.boundary=16,y.storage=Math.ceil(y.storage/16)*16),y}function p(_){let S=_.target;S.removeEventListener("dispose",p),i.deleteBuffer(s[S.id]),delete s[S.id],delete r[S.id]}function g(){for(let _ in s)i.deleteBuffer(s[_]);s={},r={}}return{bind:o,update:a,dispose:g}}var Lv=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),ri=null;function Nv(){return ri===null&&(ri=new Sa(Lv,16,16,ki,qn),ri.name="DFG_LUT",ri.minFilter=dn,ri.magFilter=dn,ri.wrapS=Kn,ri.wrapT=Kn,ri.generateMipmaps=!1,ri.needsUpdate=!0),ri}var Ol=class{constructor(t={}){let{canvas:e=Ef(),context:n=null,depth:s=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:f=!1,reversedDepthBuffer:d=!1,outputBufferType:u=Pn}=t;this.isWebGLRenderer=!0;let m;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=n.getContextAttributes().alpha}else m=o;let x=u,p=new Set([il,nl,el]),g=new Set([Pn,Wn,Ks,ls,ja,tl]),_=new Uint32Array(4),S=new Int32Array(4),y={textures:[],min:[],max:[],resolution:[]},T=null,A=null,v=[],b=[],D=null;this.domElement=e,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=si,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let P=this,I=!1,O=null,V=null,R=null,B=null;this._outputColorSpace=En;let G=0,N=0,X=null,U=-1,Y=null,tt=new We,vt=new We,Ft=null,$=new Re(0),lt=0,yt=e.width,kt=e.height,et=1,Zt=null,Xt=null,at=new We(0,0,yt,kt),jt=new We(0,0,yt,kt),mt=!1,Q=new es,dt=new ba,ut=!1,pt=!1,xt=new fe,At=new k,Tt=new We,$t={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},K=!1;function St(){return X===null?et:1}let F=n;function Ht(E,H){return e.getContext(E,H)}let Dt,Bt,ft,ee,wt,Rt,C,w,q,gt,ot,bt,Et,rt,ct,Ct,z,ht,st,Ot,Ut,zt,re;try{let E={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:f};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${"187"}`),e.addEventListener("webglcontextlost",ie,!1),e.addEventListener("webglcontextrestored",me,!1),e.addEventListener("webglcontextcreationerror",Wt,!1),F===null){let H="webgl2";if(F=Ht(H,E),F===null)throw Ht(H)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}ge()}catch(E){throw e.removeEventListener("webglcontextlost",ie,!1),e.removeEventListener("webglcontextrestored",me,!1),e.removeEventListener("webglcontextcreationerror",Wt,!1),ce("WebGLRenderer: "+E.message),E}function ge(){Dt=new W_(F),Dt.init(),Ut=new Tv(F,Dt),Bt=new N_(F,Dt,t,Ut),ft=new wv(F,Dt),Bt.reversedDepthBuffer&&d&&ft.buffers.depth.setReversed(!0),V=F.createFramebuffer(),R=F.createFramebuffer(),B=F.createFramebuffer(),ee=new Y_(F),wt=new hv,Rt=new Av(F,Dt,ft,wt,Bt,Ut,ee),C=new H_(P),w=new Jm(F),zt=new P_(F,w),q=new X_(F,w,ee,zt),gt=new J_(F,q,w,zt,ee),ht=new Z_(F,Bt,Rt),ct=new D_(wt),ot=new cv(P,C,Dt,Bt,zt,ct),bt=new Iv(P,wt),Et=new fv,rt=new xv(Dt),z=new I_(P,C,ft,gt,m,l),Ct=new bv(P,gt,Bt),re=new Pv(F,ee,Bt,ft),st=new L_(F,Dt,ee),Ot=new q_(F,Dt,ee),ee.programs=ot.programs,P.capabilities=Bt,P.extensions=Dt,P.properties=wt,P.renderLists=Et,P.shadowMap=Ct,P.state=ft,P.info=ee}x!==Pn&&(D=new K_(x,e.width,e.height,a,s,r));let Pt=new Ph(P,F);this.xr=Pt,this.getContext=function(){return F},this.getContextAttributes=function(){return F.getContextAttributes()},this.forceContextLoss=function(){let E=Dt.get("WEBGL_lose_context");E&&E.loseContext()},this.forceContextRestore=function(){let E=Dt.get("WEBGL_lose_context");E&&E.restoreContext()},this.getPixelRatio=function(){return et},this.setPixelRatio=function(E){E!==void 0&&(et=E,this.setSize(yt,kt,!1))},this.getSize=function(E){return E.set(yt,kt)},this.setSize=function(E,H,nt=!0){if(Pt.isPresenting){ae("WebGLRenderer: Can't change size while VR device is presenting.");return}yt=E,kt=H,e.width=Math.floor(E*et),e.height=Math.floor(H*et),nt===!0&&(e.style.width=E+"px",e.style.height=H+"px"),D!==null&&D.setSize(e.width,e.height),this.setViewport(0,0,E,H)},this.getDrawingBufferSize=function(E){return E.set(yt*et,kt*et).floor()},this.setDrawingBufferSize=function(E,H,nt){yt=E,kt=H,et=nt,e.width=Math.floor(E*nt),e.height=Math.floor(H*nt),this.setViewport(0,0,E,H)},this.setEffects=function(E){if(x===Pn){ce("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(E){for(let H=0;H<E.length;H++)if(E[H].isOutputPass===!0){ae("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}D.setEffects(E||[])},this.getCurrentViewport=function(E){return E.copy(tt)},this.getViewport=function(E){return E.copy(at)},this.setViewport=function(E,H,nt,J){E.isVector4?at.set(E.x,E.y,E.z,E.w):at.set(E,H,nt,J),ft.viewport(tt.copy(at).multiplyScalar(St()).round())},this.getScissor=function(E){return E.copy(jt)},this.setScissor=function(E,H,nt,J){E.isVector4?jt.set(E.x,E.y,E.z,E.w):jt.set(E,H,nt,J),ft.scissor(vt.copy(jt).multiplyScalar(St()).round())},this.getScissorTest=function(){return mt},this.setScissorTest=function(E){ft.setScissorTest(mt=E)},this.setOpaqueSort=function(E){Zt=E},this.setTransparentSort=function(E){Xt=E},this.getClearColor=function(E){return E.copy(z.getClearColor())},this.setClearColor=function(){z.setClearColor(...arguments)},this.getClearAlpha=function(){return z.getClearAlpha()},this.setClearAlpha=function(){z.setClearAlpha(...arguments)},this.clear=function(E=!0,H=!0,nt=!0){let J=0;if(E){let j=!1;if(X!==null){let Vt=X.texture.format;j=p.has(Vt)}if(j){let Vt=X.texture.type,te=g.has(Vt),Gt=z.getClearColor(),qt=z.getClearAlpha(),Kt=Gt.r,le=Gt.g,Me=Gt.b;te?(_[0]=Kt,_[1]=le,_[2]=Me,_[3]=qt,F.clearBufferuiv(F.COLOR,0,_)):(S[0]=Kt,S[1]=le,S[2]=Me,S[3]=qt,F.clearBufferiv(F.COLOR,0,S))}else J|=F.COLOR_BUFFER_BIT}H&&(J|=F.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),nt&&(J|=F.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),J!==0&&F.clear(J)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(E){E.setRenderer(this),O=E},this.dispose=function(){e.removeEventListener("webglcontextlost",ie,!1),e.removeEventListener("webglcontextrestored",me,!1),e.removeEventListener("webglcontextcreationerror",Wt,!1),z.dispose(),Et.dispose(),rt.dispose(),Rt.dispose(),wt.dispose(),C.dispose(),gt.dispose(),q.dispose(),zt.dispose(),re.dispose(),ot.dispose(),Pt.dispose(),Pt.removeEventListener("sessionstart",sr),Pt.removeEventListener("sessionend",Ai),Bn.stop()};function ie(E){E.preventDefault(),hh("WebGLRenderer: Context Lost."),I=!0}function me(){hh("WebGLRenderer: Context Restored."),I=!1;let E=ee.autoReset,H=Ct.enabled,nt=Ct.autoUpdate,J=Ct.needsUpdate,j=Ct.type;ge(),ee.autoReset=E,Ct.enabled=H,Ct.autoUpdate=nt,Ct.needsUpdate=J,Ct.type=j}function Wt(E){ce("WebGLRenderer: A WebGL context could not be created. Reason: ",E.statusMessage)}function Ce(E){let H=E.target;H.removeEventListener("dispose",Ce),Xe(H)}function Xe(E){On(E),wt.remove(E)}function On(E){let H=wt.get(E).programs;H!==void 0&&(H.forEach(function(nt){ot.releaseProgram(nt)}),E.isShaderMaterial&&ot.releaseShaderCache(E))}this.renderBufferDirect=function(E,H,nt,J,j,Vt){H===null&&(H=$t);let te=j.isMesh&&j.matrixWorld.determinantAffine()<0,Gt=vs(E,H,nt,J,j);ft.setMaterial(J,te);let qt=nt.index,Kt=1;if(J.wireframe===!0){if(qt=q.getWireframeAttribute(nt),qt===void 0)return;Kt=2}let le=nt.drawRange,Me=nt.attributes.position,ne=le.start*Kt,_e=(le.start+le.count)*Kt;Vt!==null&&(ne=Math.max(ne,Vt.start*Kt),_e=Math.min(_e,(Vt.start+Vt.count)*Kt)),qt!==null?(ne=Math.max(ne,0),_e=Math.min(_e,qt.count)):Me!=null&&(ne=Math.max(ne,0),_e=Math.min(_e,Me.count));let ke=_e-ne;if(ke<0||ke===1/0)return;zt.setup(j,J,Gt,nt,qt);let Ie,Pe=st;if(qt!==null&&(Ie=w.get(qt),Pe=Ot,Pe.setIndex(Ie)),j.isMesh)J.wireframe===!0?(ft.setLineWidth(J.wireframeLinewidth*St()),Pe.setMode(F.LINES)):Pe.setMode(F.TRIANGLES);else if(j.isLine){let qe=J.linewidth;qe===void 0&&(qe=1),ft.setLineWidth(qe*St()),j.isLineSegments?Pe.setMode(F.LINES):j.isLineLoop?Pe.setMode(F.LINE_LOOP):Pe.setMode(F.LINE_STRIP)}else j.isPoints?Pe.setMode(F.POINTS):j.isSprite&&Pe.setMode(F.TRIANGLES);if(j.isBatchedMesh)if(Dt.get("WEBGL_multi_draw"))Pe.renderMultiDraw(j._multiDrawStarts,j._multiDrawCounts,j._multiDrawCount);else{let qe=j._multiDrawStarts,Qt=j._multiDrawCounts,Je=j._multiDrawCount,Ae=qt?w.get(qt).bytesPerElement:1,Zn=wt.get(J).currentProgram.getUniforms();for(let Qe=0;Qe<Je;Qe++)Zn.setValue(F,"_gl_DrawID",Qe),Pe.render(qe[Qe]/Ae,Qt[Qe])}else if(j.isInstancedMesh)Pe.renderInstances(ne,ke,j.count);else if(nt.isInstancedBufferGeometry){let qe=nt._maxInstanceCount!==void 0?nt._maxInstanceCount:1/0,Qt=Math.min(nt.instanceCount,qe);Pe.renderInstances(ne,ke,Qt)}else Pe.render(ne,ke)};function yo(E,H,nt,J){O!==null&&E.isNodeMaterial&&O.setObject(J,E),ut===!0&&ct.setState(E,nt,!1),E.transparent===!0&&E.side===Sn&&E.forceSinglePass===!1?(E.side=gn,E.needsUpdate=!0,Xi(E,H,J),E.side=ii,E.needsUpdate=!0,Xi(E,H,J),E.side=Sn):Xi(E,H,J)}this.compile=function(E,H,nt=null){nt===null&&(nt=E),O!==null&&O.renderStart(E,H,nt),A=rt.get(nt),A.init(H),b.push(A),nt.traverseVisible(function(j){j.isLight&&j.layers.test(H.layers)&&(A.pushLight(j),j.castShadow&&A.pushShadow(j))}),E!==nt&&E.traverseVisible(function(j){j.isLight&&j.layers.test(H.layers)&&(A.pushLight(j),j.castShadow&&A.pushShadow(j))}),A.setupLights(),O!==null&&O.updateLights(A.state.lightsArray),pt=this.localClippingEnabled,ut=ct.init(this.clippingPlanes,pt),ut===!0&&ct.setGlobalState(this.clippingPlanes,H),O!==null&&Ct.render(A.state.shadowsArray,nt,H);let J=new Set;return E.traverse(function(j){if(!(j.isMesh||j.isPoints||j.isLine||j.isSprite))return;let Vt=j.material;if(Vt)if(Array.isArray(Vt))for(let te=0;te<Vt.length;te++){let Gt=Vt[te];yo(Gt,nt,H,j),J.add(Gt)}else yo(Vt,nt,H,j),J.add(Vt)}),A=b.pop(),O!==null&&O.renderEnd(),J},this.compileAsync=function(E,H,nt=null){let J=this.compile(E,H,nt);return new Promise(j=>{function Vt(){if(J.forEach(function(te){let qt=wt.get(te).currentProgram;(qt===void 0||qt.isReady())&&J.delete(te)}),J.size===0){j(E);return}setTimeout(Vt,10)}Dt.get("KHR_parallel_shader_compile")!==null?Vt():setTimeout(Vt,10)})};let ms=null;function Mo(E){ms&&ms(E)}function sr(){Bn.stop()}function Ai(){Bn.start()}let Bn=new ad;Bn.setAnimationLoop(Mo),typeof self<"u"&&Bn.setContext(self),this.setAnimationLoop=function(E){ms=E,Pt.setAnimationLoop(E),E===null?Bn.stop():Bn.start()},Pt.addEventListener("sessionstart",sr),Pt.addEventListener("sessionend",Ai),this.render=function(E,H){if(H!==void 0&&H.isCamera!==!0){ce("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(I===!0)return;O!==null&&O.renderStart(E,H);let nt=Pt.enabled===!0&&Pt.isPresenting===!0,J=D!==null&&(X===null||nt)&&D.begin(P,X);if(E.matrixWorldAutoUpdate===!0&&E.updateMatrixWorld(),H.parent===null&&H.matrixWorldAutoUpdate===!0&&H.updateMatrixWorld(),Pt.enabled===!0&&Pt.isPresenting===!0&&(D===null||D.isCompositing()===!1)&&(Pt.cameraAutoUpdate===!0&&Pt.updateCamera(H),H=Pt.getCamera()),E.isScene===!0&&E.onBeforeRender(P,E,H,X),A=rt.get(E,b.length),A.init(H),A.state.textureUnits=Rt.getTextureUnits(),b.push(A),xt.multiplyMatrices(H.projectionMatrix,H.matrixWorldInverse),H.isArrayCamera?dt.setFromArrayCamera(H):Q.setFromProjectionMatrix(xt,Nn,H.reversedDepth),pt=this.localClippingEnabled,ut=ct.init(this.clippingPlanes,pt),T=Et.get(E,v.length),T.init(),v.push(T),this.info.render.frame++,Pt.enabled===!0&&Pt.isPresenting===!0){let te=P.xr.getDepthSensingMesh();te!==null&&gs(te,H,-1/0,P.sortObjects)}gs(E,H,0,P.sortObjects),T.finish(),O!==null&&O.updateLights(A.state.lightsArray),P.sortObjects===!0&&T.sort(Zt,Xt),K=Pt.enabled===!1||Pt.isPresenting===!1||Pt.hasDepthSensing()===!1,K&&z.addToRenderList(T,E),this.info.autoReset===!0&&this.info.reset(),ut===!0&&ct.beginShadows();let j=A.state.shadowsArray;if(Ct.render(j,E,H),ut===!0&&ct.endShadows(),(J&&D.hasRenderPass())===!1){let te=T.opaque,Gt=T.transmissive;if(A.setupLights(),H.isArrayCamera){let qt=H.cameras;if(Gt.length>0)for(let Kt=0,le=qt.length;Kt<le;Kt++){let Me=qt[Kt];Wi(te,Gt,E,Me)}K&&z.render(E);for(let Kt=0,le=qt.length;Kt<le;Kt++){let Me=qt[Kt];Hi(T,E,Me,Me.viewport)}}else Gt.length>0&&Wi(te,Gt,E,H),K&&z.render(E),Hi(T,E,H)}X!==null&&N===0&&(Rt.updateMultisampleRenderTarget(X),Rt.updateRenderTargetMipmap(X)),J&&D.end(P),E.isScene===!0&&E.onAfterRender(P,E,H),zt.resetDefaultState(),U=-1,Y=null,b.pop(),b.length>0?(A=b[b.length-1],Rt.setTextureUnits(A.state.textureUnits),ut===!0&&ct.setGlobalState(P.clippingPlanes,A.state.camera)):A=null,v.pop(),v.length>0?T=v[v.length-1]:T=null,O!==null&&O.renderEnd()};function gs(E,H,nt,J){if(E.visible===!1)return;if(E.layers.test(H.layers)){if(E.isGroup)nt=E.renderOrder;else if(E.isLOD)E.autoUpdate===!0&&E.update(H);else if(E.isLight)A.pushLight(E),E.castShadow&&A.pushShadow(E);else if(E.isSprite){let te=H.isArrayCamera?dt:Q;if(!E.frustumCulled||E.intersectsFrustum(te)){J&&Tt.setFromMatrixPosition(E.matrixWorld).applyMatrix4(xt);let Gt=gt.update(E),qt=E.material;qt.visible&&T.push(E,Gt,qt,nt,Tt.z,null,H)}}else if(E.isMesh||E.isLine||E.isPoints){let te=H.isArrayCamera?dt:Q;if(!E.frustumCulled||E.intersectsFrustum(te)){let Gt=gt.update(E),qt=E.material;if(J&&(E.boundingSphere!==void 0?(E.boundingSphere===null&&E.computeBoundingSphere(),Tt.copy(E.boundingSphere.center)):(Gt.boundingSphere===null&&Gt.computeBoundingSphere(),Tt.copy(Gt.boundingSphere.center)),Tt.applyMatrix4(E.matrixWorld).applyMatrix4(xt)),Array.isArray(qt)){let Kt=Gt.groups;for(let le=0,Me=Kt.length;le<Me;le++){let ne=Kt[le],_e=qt[ne.materialIndex];_e&&_e.visible&&T.push(E,Gt,_e,nt,Tt.z,ne,H)}}else qt.visible&&T.push(E,Gt,qt,nt,Tt.z,null,H)}}}let Vt=E.children;for(let te=0,Gt=Vt.length;te<Gt;te++)gs(Vt[te],H,nt,J)}function Hi(E,H,nt,J){let{opaque:j,transmissive:Vt,transparent:te}=E;A.setupLightsView(nt),ut===!0&&ct.setGlobalState(P.clippingPlanes,nt),J&&ft.viewport(tt.copy(J)),j.length>0&&_s(j,H,nt),Vt.length>0&&_s(Vt,H,nt),te.length>0&&_s(te,H,nt),ft.buffers.depth.setTest(!0),ft.buffers.depth.setMask(!0),ft.buffers.color.setMask(!0),ft.setPolygonOffset(!1)}function Wi(E,H,nt,J){if((nt.isScene===!0?nt.overrideMaterial:null)!==null)return;if(A.state.transmissionRenderTarget[J.id]===void 0){let ne=Dt.has("EXT_color_buffer_half_float")||Dt.has("EXT_color_buffer_float");A.state.transmissionRenderTarget[J.id]=new pn(1,1,{generateMipmaps:!0,type:ne?qn:Pn,minFilter:Mi,samples:Math.max(4,Bt.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Te.workingColorSpace})}let Vt=A.state.transmissionRenderTarget[J.id],te=J.viewport||tt;Vt.setSize(te.z*P.transmissionResolutionScale,te.w*P.transmissionResolutionScale);let Gt=P.getRenderTarget(),qt=P.getActiveCubeFace(),Kt=P.getActiveMipmapLevel();P.setRenderTarget(Vt),P.getClearColor($),lt=P.getClearAlpha(),lt<1&&P.setClearColor(16777215,.5),P.clear(),K&&z.render(nt);let le=P.toneMapping;P.toneMapping=si;let Me=J.viewport;if(J.viewport!==void 0&&(J.viewport=void 0),A.setupLightsView(J),ut===!0&&ct.setGlobalState(P.clippingPlanes,J),_s(E,nt,J),Rt.updateMultisampleRenderTarget(Vt),Rt.updateRenderTargetMipmap(Vt),Dt.has("WEBGL_multisampled_render_to_texture")===!1){let ne=!1;for(let _e=0,ke=H.length;_e<ke;_e++){let Ie=H[_e],{object:Pe,geometry:qe,material:Qt,group:Je}=Ie;if(Qt.side===Sn&&Pe.layers.test(J.layers)){let Ae=Qt.side;Qt.side=gn,Qt.needsUpdate=!0,rr(Pe,nt,J,qe,Qt,Je),Qt.side=Ae,Qt.needsUpdate=!0,ne=!0}}ne===!0&&(Rt.updateMultisampleRenderTarget(Vt),Rt.updateRenderTargetMipmap(Vt))}P.setRenderTarget(Gt,qt,Kt),P.setClearColor($,lt),Me!==void 0&&(J.viewport=Me),P.toneMapping=le}function _s(E,H,nt){let J=H.isScene===!0?H.overrideMaterial:null;for(let j=0,Vt=E.length;j<Vt;j++){let te=E[j],{object:Gt,geometry:qt,group:Kt}=te,le=te.material;le.allowOverride===!0&&J!==null&&(le=J),Gt.layers.test(nt.layers)&&rr(Gt,H,nt,qt,le,Kt)}}function rr(E,H,nt,J,j,Vt){O!==null&&j.isNodeMaterial&&O.setObject(E,j),E.onBeforeRender(P,H,nt,J,j,Vt),E.modelViewMatrix.multiplyMatrices(nt.matrixWorldInverse,E.matrixWorld),E.normalMatrix.getNormalMatrix(E.modelViewMatrix),j.onBeforeRender(P,H,nt,J,E,Vt),j.transparent===!0&&j.side===Sn&&j.forceSinglePass===!1?(j.side=gn,j.needsUpdate=!0,P.renderBufferDirect(nt,H,J,j,E,Vt),j.side=ii,j.needsUpdate=!0,P.renderBufferDirect(nt,H,J,j,E,Vt),j.side=Sn):P.renderBufferDirect(nt,H,J,j,E,Vt),E.onAfterRender(P,H,nt,J,j,Vt)}function So(E){let H=0;for(let nt of E)nt.texture!==null&&H++;return H}function Xi(E,H,nt){H.isScene!==!0&&(H=$t);let J=wt.get(E),j=A.state.lights,Vt=A.state.shadowsArray,te=j.state.version,Gt=ot.getParameters(E,j.state,Vt,H,nt,A.state.lightProbeGridArray),qt=ot.getProgramCacheKey(Gt),Kt=J.programs;J.environment=E.isMeshStandardMaterial||E.isMeshLambertMaterial||E.isMeshPhongMaterial?H.environment:null,J.fog=H.fog;let le=E.isMeshStandardMaterial||E.isMeshLambertMaterial&&!E.envMap||E.isMeshPhongMaterial&&!E.envMap;J.envMap=C.get(E.envMap||J.environment,le),J.envMapRotation=J.environment!==null&&E.envMap===null?H.environmentRotation:E.envMapRotation,Kt===void 0&&(E.addEventListener("dispose",Ce),Kt=new Map,J.programs=Kt,J.programVariants=new Map);let Me=Kt.get(qt);if(Me!==void 0){if(J.currentProgram===Me&&J.lightsStateVersion===te)return Ti(E,Gt),Me}else Gt.uniforms=ot.getUniforms(E),O!==null&&E.isNodeMaterial&&O.build(E,nt,Gt),E.onBeforeCompile(Gt,P),Me=ot.acquireProgram(Gt,qt),Kt.set(qt,Me),J.uniforms=Gt.uniforms;let ne=J.uniforms;return(!E.isShaderMaterial&&!E.isRawShaderMaterial||E.clipping===!0)&&(ne.clippingPlanes=ct.uniform),Ti(E,Gt),J.needsLights=ai(E),J.lightsStateVersion=te,J.needsLights&&(ne.ambientLightColor.value=j.state.ambient,ne.lightProbe.value=j.state.probe,ne.sunLights.value=j.state.sun,ne.sunLightShadows.value=j.state.sunShadow,ne.directionalLights.value=j.state.directional,ne.directionalLightShadows.value=j.state.directionalShadow,ne.spotLights.value=j.state.spot,ne.spotLightShadows.value=j.state.spotShadow,ne.rectAreaLights.value=j.state.rectArea,ne.ltc_1.value=j.state.rectAreaLTC1,ne.ltc_2.value=j.state.rectAreaLTC2,ne.pointLights.value=j.state.point,ne.pointLightShadows.value=j.state.pointShadow,ne.hemisphereLights.value=j.state.hemi,ne.sunShadowMatrix.value=j.state.sunShadowMatrix,ne.sunShadowCascade.value=j.state.sunShadowCascade,ne.directionalShadowMatrix.value=j.state.directionalShadowMatrix,ne.spotLightMatrix.value=j.state.spotLightMatrix,ne.spotLightMap.value=j.state.spotLightMap,ne.pointShadowMatrix.value=j.state.pointShadowMatrix),J.numLightProbeGrids=So(A.state.lightProbeGridArray),J.currentProgram=Me,J.uniformsList=null,Me}function wn(E,H,nt,J,j){let Vt=wt.get(E),te=Vt.currentProgram.id+","+J+","+j,Gt=Vt.programVariants.get(te);return Gt===void 0?(Gt=Xi(E,H,nt),Vt.programVariants.set(te,Gt)):(Vt.currentProgram=Gt,Vt.uniformsList=null,Vt.outputColorSpace=J,Vt.toneMapping=j),Gt}function xs(E){if(E.uniformsList===null){let H=E.currentProgram.getUniforms();E.uniformsList=js.seqWithValue(H.seq,E.uniforms)}return E.uniformsList}function Ti(E,H){let nt=wt.get(E);nt.outputColorSpace=H.outputColorSpace,nt.batching=H.batching,nt.batchingColor=H.batchingColor,nt.instancing=H.instancing,nt.instancingColor=H.instancingColor,nt.instancingMorph=H.instancingMorph,nt.skinning=H.skinning,nt.morphTargets=H.morphTargets,nt.morphNormals=H.morphNormals,nt.morphColors=H.morphColors,nt.morphTargetsCount=H.morphTargetsCount,nt.numClippingPlanes=H.numClippingPlanes,nt.numIntersection=H.numClipIntersection,nt.vertexAlphas=H.vertexAlphas,nt.vertexTangents=H.vertexTangents,nt.toneMapping=H.toneMapping}function vs(E,H,nt,J,j){H.isScene!==!0&&(H=$t),Rt.resetTextureUnits();let Vt=H.fog,te=J.isMeshStandardMaterial||J.isMeshLambertMaterial||J.isMeshPhongMaterial?H.environment:null,Gt=X===null?P.outputColorSpace:X.isXRRenderTarget===!0?X.texture.colorSpace:Te.workingColorSpace,qt=J.isMeshStandardMaterial||J.isMeshLambertMaterial&&!J.envMap||J.isMeshPhongMaterial&&!J.envMap,Kt=C.get(J.envMap||te,qt),le=J.vertexColors===!0&&!!nt.attributes.color&&nt.attributes.color.itemSize===4,Me=!!nt.attributes.tangent&&(!!J.normalMap||J.anisotropy>0),ne=!!nt.morphAttributes.position,_e=!!nt.morphAttributes.normal,ke=!!nt.morphAttributes.color,Ie=si;J.toneMapped&&(X===null||X.isXRRenderTarget===!0)&&(Ie=P.toneMapping);let Pe=nt.morphAttributes.position||nt.morphAttributes.normal||nt.morphAttributes.color,qe=Pe!==void 0?Pe.length:0,Qt=wt.get(J),Je=A.state.lights;if(ut===!0&&(pt===!0||E!==Y)){let Fe=E===Y&&J.id===U;ct.setState(J,E,Fe)}let Ae=!1,Zn=!1;J.version===Qt.__version?Qt.needsLights&&Qt.lightsStateVersion!==Je.state.version||j.isBatchedMesh&&Qt.batching===!1||!j.isBatchedMesh&&Qt.batching===!0||j.isBatchedMesh&&Qt.batchingColor===!0&&j._colorsTexture===null||j.isBatchedMesh&&Qt.batchingColor===!1&&j._colorsTexture!==null||j.isInstancedMesh&&Qt.instancing===!1||!j.isInstancedMesh&&Qt.instancing===!0||j.isSkinnedMesh&&Qt.skinning===!1||!j.isSkinnedMesh&&Qt.skinning===!0||j.isInstancedMesh&&Qt.instancingColor===!0&&j.instanceColor===null||j.isInstancedMesh&&Qt.instancingColor===!1&&j.instanceColor!==null||j.isInstancedMesh&&Qt.instancingMorph===!0&&j.morphTexture===null||j.isInstancedMesh&&Qt.instancingMorph===!1&&j.morphTexture!==null||Qt.envMap!==Kt||J.fog===!0&&Qt.fog!==Vt||Qt.numClippingPlanes!==void 0&&(Qt.numClippingPlanes!==ct.numPlanes||Qt.numIntersection!==ct.numIntersection)||Qt.vertexAlphas!==le||Qt.vertexTangents!==Me||Qt.morphTargets!==ne||Qt.morphNormals!==_e||Qt.morphColors!==ke||Qt.morphTargetsCount!==qe||Qt.numLightProbeGrids!==So(A.state.lightProbeGridArray)?Ae=!0:(Qt.outputColorSpace!==Gt||Qt.toneMapping!==Ie)&&(Zn=!0):(Ae=!0,Qt.__version=J.version);let Qe=Qt.currentProgram;(Ae===!0||Zn===!0)&&(Qe=Zn===!0?wn(J,H,j,Gt,Ie):Xi(J,H,j),O&&J.isNodeMaterial&&O.onUpdateProgram(J,Qe,Qt));let qi=!1,$e=!1,xe=!1,be=Qe.getUniforms(),Ge=Qt.uniforms;if(ft.useProgram(Qe.program)&&(qi=!0,$e=!0,xe=!0),J.id!==U&&(U=J.id,$e=!0),qi||Y!==E){ft.buffers.depth.getReversed()&&E.reversedDepth!==!0&&(E._reversedDepth=!0,E.updateProjectionMatrix()),be.setValue(F,"projectionMatrix",E.projectionMatrix),be.setValue(F,"viewMatrix",E.matrixWorldInverse);let Ye=be.map.cameraPosition;Ye!==void 0&&Ye.setValue(F,At.setFromMatrixPosition(E.matrixWorld)),Bt.logarithmicDepthBuffer&&be.setValue(F,"logDepthBufFC",2/(Math.log(E.far+1)/Math.LN2)),(J.isMeshPhongMaterial||J.isMeshToonMaterial||J.isMeshLambertMaterial||J.isMeshBasicMaterial||J.isMeshStandardMaterial||J.isShaderMaterial)&&be.setValue(F,"isOrthographic",E.isOrthographicCamera===!0),Y!==E&&(Y=E,$e=!0,xe=!0)}if(Qt.needsLights&&(Je.state.sunShadowMap.length>0&&be.setValue(F,"sunShadowMap",Je.state.sunShadowMap,Rt),Je.state.directionalShadowMap.length>0&&be.setValue(F,"directionalShadowMap",Je.state.directionalShadowMap,Rt),Je.state.spotShadowMap.length>0&&be.setValue(F,"spotShadowMap",Je.state.spotShadowMap,Rt),Je.state.pointShadowMap.length>0&&be.setValue(F,"pointShadowMap",Je.state.pointShadowMap,Rt)),j.isSkinnedMesh){be.setOptional(F,j,"bindMatrix"),be.setOptional(F,j,"bindMatrixInverse");let Fe=j.skeleton;Fe&&(Fe.boneTexture===null&&Fe.computeBoneTexture(),be.setValue(F,"boneTexture",Fe.boneTexture,Rt))}j.isBatchedMesh&&(be.setOptional(F,j,"batchingTexture"),be.setValue(F,"batchingTexture",j._matricesTexture,Rt),be.setOptional(F,j,"batchingIdTexture"),be.setValue(F,"batchingIdTexture",j._indirectTexture,Rt),be.setOptional(F,j,"batchingColorTexture"),j._colorsTexture!==null&&be.setValue(F,"batchingColorTexture",j._colorsTexture,Rt));let fn=nt.morphAttributes;if((fn.position!==void 0||fn.normal!==void 0||fn.color!==void 0)&&ht.update(j,nt,Qe),($e||Qt.receiveShadow!==j.receiveShadow)&&(Qt.receiveShadow=j.receiveShadow,be.setValue(F,"receiveShadow",j.receiveShadow)),(J.isMeshStandardMaterial||J.isMeshLambertMaterial||J.isMeshPhongMaterial)&&J.envMap===null&&H.environment!==null&&(Ge.envMapIntensity.value=H.environmentIntensity),Ge.dfgLUT!==void 0&&(Ge.dfgLUT.value=Nv()),$e){if(be.setValue(F,"toneMappingExposure",P.toneMappingExposure),Qt.needsLights&&or(Ge,xe),Vt&&J.fog===!0&&bt.refreshFogUniforms(Ge,Vt),bt.refreshMaterialUniforms(Ge,J,et,kt,A.state.transmissionRenderTarget[E.id]),Qt.needsLights&&Qt.numLightProbeGrids>0){let Fe=y,Ye=0;for(let xn of A.state.lightProbeGridArray)xn.texture!==null&&(Fe.textures[Ye]=xn.texture,Fe.min[Ye]=xn.boundingBox.min,Fe.max[Ye]=xn.boundingBox.max,Fe.resolution[Ye]=xn.resolution,Ye++);for(let xn in Fe)Fe[xn].length=Ye;Ge.probesSH.value=Fe.textures,Ge.probesMin.value=Fe.min,Ge.probesMax.value=Fe.max,Ge.probesResolution.value=Fe.resolution}js.upload(F,xs(Qt),Ge,Rt)}if(J.isShaderMaterial&&J.uniformsNeedUpdate===!0&&(js.upload(F,xs(Qt),Ge,Rt),J.uniformsNeedUpdate=!1),J.isSpriteMaterial&&be.setValue(F,"center",j.center),be.setValue(F,"modelViewMatrix",j.modelViewMatrix),be.setValue(F,"normalMatrix",j.normalMatrix),be.setValue(F,"modelMatrix",j.matrixWorld),J.uniformsGroups!==void 0){let Fe=J.uniformsGroups;for(let Ye=0,xn=Fe.length;Ye<xn;Ye++){let lr=Fe[Ye];re.update(lr,Qe),re.bind(lr,Qe)}}return Qe}function or(E,H){E.ambientLightColor.needsUpdate=H,E.lightProbe.needsUpdate=H,E.sunLights.needsUpdate=H,E.sunLightShadows.needsUpdate=H,E.directionalLights.needsUpdate=H,E.directionalLightShadows.needsUpdate=H,E.pointLights.needsUpdate=H,E.pointLightShadows.needsUpdate=H,E.spotLights.needsUpdate=H,E.spotLightShadows.needsUpdate=H,E.rectAreaLights.needsUpdate=H,E.hemisphereLights.needsUpdate=H}function ai(E){return E.isMeshLambertMaterial||E.isMeshToonMaterial||E.isMeshPhongMaterial||E.isMeshStandardMaterial||E.isShadowMaterial||E.isShaderMaterial&&E.lights===!0}this.getActiveCubeFace=function(){return G},this.getActiveMipmapLevel=function(){return N},this.getRenderTarget=function(){return X},this.setRenderTargetTextures=function(E,H,nt){let J=wt.get(E);J.__autoAllocateDepthBuffer=E.resolveDepthBuffer===!1,J.__autoAllocateDepthBuffer===!1&&(J.__useRenderToTexture=!1),wt.get(E.texture).__webglTexture=H,wt.get(E.depthTexture).__webglTexture=J.__autoAllocateDepthBuffer?void 0:nt,J.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(E,H){let nt=wt.get(E);nt.__webglFramebuffer=H,nt.__useDefaultFramebuffer=H===void 0},this.setRenderTarget=function(E,H=0,nt=0){X=E,G=H,N=nt;let J=null,j=!1,Vt=!1;if(E){let Gt=wt.get(E);if(Gt.__useDefaultFramebuffer!==void 0){ft.bindFramebuffer(F.FRAMEBUFFER,Gt.__webglFramebuffer),tt.copy(E.viewport),vt.copy(E.scissor),Ft=E.scissorTest,ft.viewport(tt),ft.scissor(vt),ft.setScissorTest(Ft),U=-1;return}else if(Gt.__webglFramebuffer===void 0)Rt.setupRenderTarget(E);else if(Gt.__hasExternalTextures)Rt.rebindTextures(E,wt.get(E.texture).__webglTexture,wt.get(E.depthTexture).__webglTexture);else if(E.depthBuffer){let le=E.depthTexture;if(Gt.__boundDepthTexture!==le){if(le!==null&&wt.has(le)&&(E.width!==le.image.width||E.height!==le.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");Rt.setupDepthRenderbuffer(E)}}let qt=E.texture;(qt.isData3DTexture||qt.isDataArrayTexture||qt.isCompressedArrayTexture)&&(Vt=!0);let Kt=wt.get(E).__webglFramebuffer;E.isWebGLCubeRenderTarget?(Array.isArray(Kt[H])?J=Kt[H][nt]:J=Kt[H],j=!0):E.samples>0&&Rt.useMultisampledRTT(E)===!1?J=wt.get(E).__webglMultisampledFramebuffer:Array.isArray(Kt)?J=Kt[nt]:J=Kt,tt.copy(E.viewport),vt.copy(E.scissor),Ft=E.scissorTest}else tt.copy(at).multiplyScalar(et).floor(),vt.copy(jt).multiplyScalar(et).floor(),Ft=mt;if(nt!==0&&(J=V),ft.bindFramebuffer(F.FRAMEBUFFER,J)&&ft.drawBuffers(E,J),ft.viewport(tt),ft.scissor(vt),ft.setScissorTest(Ft),j){let Gt=wt.get(E.texture);F.framebufferTexture2D(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_CUBE_MAP_POSITIVE_X+H,Gt.__webglTexture,nt)}else if(Vt){let Gt=H;for(let qt=0;qt<E.textures.length;qt++){let Kt=wt.get(E.textures[qt]);F.framebufferTextureLayer(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0+qt,Kt.__webglTexture,nt,Gt)}}else if(E!==null&&nt!==0){let Gt=wt.get(E.texture);F.framebufferTexture2D(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_2D,Gt.__webglTexture,nt)}U=-1};function ar(E){let H=wt.get(E);return(H.__readFormat!==E.format||H.__readType!==E.type)&&(H.__readFormat=E.format,H.__readType=E.type,H.__formatReadable=Bt.textureFormatReadable(E.format),H.__typeReadable=Bt.textureTypeReadable(E.type)),H}this.readRenderTargetPixels=function(E,H,nt,J,j,Vt,te,Gt=0){if(!(E&&E.isWebGLRenderTarget)){ce("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let qt=wt.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&te!==void 0&&(qt=qt[te],Array.isArray(qt)&&(qt=qt[0])),qt){ft.bindFramebuffer(F.FRAMEBUFFER,qt);try{let Kt=E.textures[Gt],le=Kt.format,Me=Kt.type;E.textures.length>1&&F.readBuffer(F.COLOR_ATTACHMENT0+Gt);let ne=ar(Kt);if(ne.__formatReadable===!1){ce("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(ne.__typeReadable===!1){ce("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}H>=0&&H<=E.width-J&&nt>=0&&nt<=E.height-j&&F.readPixels(H,nt,J,j,Ut.convert(le),Ut.convert(Me),Vt)}finally{let Kt=X!==null?wt.get(X).__webglFramebuffer:null;ft.bindFramebuffer(F.FRAMEBUFFER,Kt)}}},this.readRenderTargetPixelsAsync=async function(E,H,nt,J,j,Vt,te,Gt=0){if(!(E&&E.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let qt=wt.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&te!==void 0&&(qt=qt[te],Array.isArray(qt)&&(qt=qt[0])),qt)if(H>=0&&H<=E.width-J&&nt>=0&&nt<=E.height-j){ft.bindFramebuffer(F.FRAMEBUFFER,qt);let Kt=E.textures[Gt],le=Kt.format,Me=Kt.type;E.textures.length>1&&F.readBuffer(F.COLOR_ATTACHMENT0+Gt);let ne=ar(Kt);if(ne.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(ne.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let _e=F.createBuffer();F.bindBuffer(F.PIXEL_PACK_BUFFER,_e),F.bufferData(F.PIXEL_PACK_BUFFER,Vt.byteLength,F.STREAM_READ),F.readPixels(H,nt,J,j,Ut.convert(le),Ut.convert(Me),0),F.bindBuffer(F.PIXEL_PACK_BUFFER,null);let ke=X!==null?wt.get(X).__webglFramebuffer:null;ft.bindFramebuffer(F.FRAMEBUFFER,ke);let Ie=F.fenceSync(F.SYNC_GPU_COMMANDS_COMPLETE,0);return F.flush(),await Cf(F,Ie,4),F.bindBuffer(F.PIXEL_PACK_BUFFER,_e),F.getBufferSubData(F.PIXEL_PACK_BUFFER,0,Vt),F.bindBuffer(F.PIXEL_PACK_BUFFER,null),F.deleteBuffer(_e),F.deleteSync(Ie),Vt}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(E,H=null,nt=0){let J=Math.pow(2,-nt),j=Math.floor(E.image.width*J),Vt=Math.floor(E.image.height*J),te=H!==null?H.x:0,Gt=H!==null?H.y:0;Rt.setTexture2D(E,0),F.copyTexSubImage2D(F.TEXTURE_2D,nt,0,0,te,Gt,j,Vt),ft.unbindTexture()},this.copyTextureToTexture=function(E,H,nt=null,J=null,j=0,Vt=0){let te,Gt,qt,Kt,le,Me,ne,_e,ke,Ie=E.isCompressedTexture?E.mipmaps[Vt]:E.image;if(nt!==null)te=nt.max.x-nt.min.x,Gt=nt.max.y-nt.min.y,qt=nt.isBox3?nt.max.z-nt.min.z:1,Kt=nt.min.x,le=nt.min.y,Me=nt.isBox3?nt.min.z:0;else{let be=Math.pow(2,-j);te=Math.floor(Ie.width*be),Gt=Math.floor(Ie.height*be),E.isDataArrayTexture?qt=Ie.depth:E.isData3DTexture?qt=Math.floor(Ie.depth*be):qt=1,Kt=0,le=0,Me=0}J!==null?(ne=J.x,_e=J.y,ke=J.z):(ne=0,_e=0,ke=0);let Pe=Ut.convert(H.format),qe=Ut.convert(H.type),Qt;H.isData3DTexture?(Rt.setTexture3D(H,0),Qt=F.TEXTURE_3D):H.isDataArrayTexture||H.isCompressedArrayTexture?(Rt.setTexture2DArray(H,0),Qt=F.TEXTURE_2D_ARRAY):(Rt.setTexture2D(H,0),Qt=F.TEXTURE_2D),ft.activeTexture(F.TEXTURE0),ft.pixelStorei(F.UNPACK_FLIP_Y_WEBGL,H.flipY),ft.pixelStorei(F.UNPACK_PREMULTIPLY_ALPHA_WEBGL,H.premultiplyAlpha),ft.pixelStorei(F.UNPACK_ALIGNMENT,H.unpackAlignment);let Je=ft.getParameter(F.UNPACK_ROW_LENGTH),Ae=ft.getParameter(F.UNPACK_IMAGE_HEIGHT),Zn=ft.getParameter(F.UNPACK_SKIP_PIXELS),Qe=ft.getParameter(F.UNPACK_SKIP_ROWS),qi=ft.getParameter(F.UNPACK_SKIP_IMAGES);ft.pixelStorei(F.UNPACK_ROW_LENGTH,Ie.width),ft.pixelStorei(F.UNPACK_IMAGE_HEIGHT,Ie.height),ft.pixelStorei(F.UNPACK_SKIP_PIXELS,Kt),ft.pixelStorei(F.UNPACK_SKIP_ROWS,le),ft.pixelStorei(F.UNPACK_SKIP_IMAGES,Me);let $e=E.isDataArrayTexture||E.isData3DTexture,xe=H.isDataArrayTexture||H.isData3DTexture;if(E.isDepthTexture){let be=wt.get(E),Ge=wt.get(H),fn=wt.get(be.__renderTarget),Fe=wt.get(Ge.__renderTarget);ft.bindFramebuffer(F.READ_FRAMEBUFFER,fn.__webglFramebuffer),ft.bindFramebuffer(F.DRAW_FRAMEBUFFER,Fe.__webglFramebuffer);for(let Ye=0;Ye<qt;Ye++)$e&&(F.framebufferTextureLayer(F.READ_FRAMEBUFFER,F.COLOR_ATTACHMENT0,wt.get(E).__webglTexture,j,Me+Ye),F.framebufferTextureLayer(F.DRAW_FRAMEBUFFER,F.COLOR_ATTACHMENT0,wt.get(H).__webglTexture,Vt,ke+Ye)),F.blitFramebuffer(Kt,le,Kt+te,le+Gt,ne,_e,ne+te,_e+Gt,F.DEPTH_BUFFER_BIT,F.NEAREST);ft.bindFramebuffer(F.READ_FRAMEBUFFER,null),ft.bindFramebuffer(F.DRAW_FRAMEBUFFER,null)}else if(j!==0||E.isRenderTargetTexture||wt.has(E)){let be=wt.get(E),Ge=wt.get(H);ft.bindFramebuffer(F.READ_FRAMEBUFFER,R),ft.bindFramebuffer(F.DRAW_FRAMEBUFFER,B);for(let fn=0;fn<qt;fn++)$e?F.framebufferTextureLayer(F.READ_FRAMEBUFFER,F.COLOR_ATTACHMENT0,be.__webglTexture,j,Me+fn):F.framebufferTexture2D(F.READ_FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_2D,be.__webglTexture,j),xe?F.framebufferTextureLayer(F.DRAW_FRAMEBUFFER,F.COLOR_ATTACHMENT0,Ge.__webglTexture,Vt,ke+fn):F.framebufferTexture2D(F.DRAW_FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_2D,Ge.__webglTexture,Vt),j!==0?F.blitFramebuffer(Kt,le,Kt+te,le+Gt,ne,_e,ne+te,_e+Gt,F.COLOR_BUFFER_BIT,F.NEAREST):xe?F.copyTexSubImage3D(Qt,Vt,ne,_e,ke+fn,Kt,le,te,Gt):F.copyTexSubImage2D(Qt,Vt,ne,_e,Kt,le,te,Gt);ft.bindFramebuffer(F.READ_FRAMEBUFFER,null),ft.bindFramebuffer(F.DRAW_FRAMEBUFFER,null)}else xe?E.isDataTexture||E.isData3DTexture?F.texSubImage3D(Qt,Vt,ne,_e,ke,te,Gt,qt,Pe,qe,Ie.data):H.isCompressedArrayTexture?F.compressedTexSubImage3D(Qt,Vt,ne,_e,ke,te,Gt,qt,Pe,Ie.data):F.texSubImage3D(Qt,Vt,ne,_e,ke,te,Gt,qt,Pe,qe,Ie):E.isDataTexture?F.texSubImage2D(F.TEXTURE_2D,Vt,ne,_e,te,Gt,Pe,qe,Ie.data):E.isCompressedTexture?F.compressedTexSubImage2D(F.TEXTURE_2D,Vt,ne,_e,Ie.width,Ie.height,Pe,Ie.data):F.texSubImage2D(F.TEXTURE_2D,Vt,ne,_e,te,Gt,Pe,qe,Ie);ft.pixelStorei(F.UNPACK_ROW_LENGTH,Je),ft.pixelStorei(F.UNPACK_IMAGE_HEIGHT,Ae),ft.pixelStorei(F.UNPACK_SKIP_PIXELS,Zn),ft.pixelStorei(F.UNPACK_SKIP_ROWS,Qe),ft.pixelStorei(F.UNPACK_SKIP_IMAGES,qi),Vt===0&&H.generateMipmaps===!0&&H.mipmapsAutoUpdate===!0&&F.generateMipmap(Qt),ft.unbindTexture()},this.initRenderTarget=function(E){wt.get(E).__webglFramebuffer===void 0&&Rt.setupRenderTarget(E)},this.initTexture=function(E){E.isCubeTexture?Rt.setTextureCube(E,0):E.isData3DTexture?Rt.setTexture3D(E,0):E.isDataArrayTexture||E.isCompressedArrayTexture?Rt.setTexture2DArray(E,0):Rt.setTexture2D(E,0),ft.unbindTexture()},this.resetState=function(){G=0,N=0,X=null,ft.reset(),zt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Nn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=Te._getDrawingBufferColorSpace(t),e.unpackColorSpace=Te._getUnpackColorSpace()}};var ho=new k;function Dn(i,t,e,n,s,r){let o=2*Math.PI*s/4,a=Math.max(r-2*s,0),l=Math.PI/4;ho.copy(t),ho[n]=0,ho.normalize();let c=.5*o/(o+a),h=1-ho.angleTo(i)/l;return Math.sign(ho[e])===1?h*c:a/(o+a)+c+c*(1-h)}var kl=class i extends ni{constructor(t=1,e=1,n=1,s=2,r=.1){let o=s*2+1;if(r=Math.min(t/2,e/2,n/2,r),super(1,1,1,o,o,o),this.type="RoundedBoxGeometry",this.parameters={width:t,height:e,depth:n,segments:s,radius:r},o===1)return;let a=this.toNonIndexed();this.index=null,this.attributes.position=a.attributes.position,this.attributes.normal=a.attributes.normal,this.attributes.uv=a.attributes.uv;let l=new k,c=new k,h=new k(t,e,n).divideScalar(2).subScalar(r),f=this.attributes.position.array,d=this.attributes.normal.array,u=this.attributes.uv.array,m=f.length/6,x=new k,p=.5/o;for(let g=0,_=0;g<f.length;g+=3,_+=2)switch(l.fromArray(f,g),c.copy(l),c.x-=Math.sign(c.x)*p,c.y-=Math.sign(c.y)*p,c.z-=Math.sign(c.z)*p,c.normalize(),f[g+0]=h.x*Math.sign(l.x)+c.x*r,f[g+1]=h.y*Math.sign(l.y)+c.y*r,f[g+2]=h.z*Math.sign(l.z)+c.z*r,d[g+0]=c.x,d[g+1]=c.y,d[g+2]=c.z,Math.floor(g/m)){case 0:x.set(1,0,0),u[_+0]=Dn(x,c,"z","y",r,n),u[_+1]=1-Dn(x,c,"y","z",r,e);break;case 1:x.set(-1,0,0),u[_+0]=1-Dn(x,c,"z","y",r,n),u[_+1]=1-Dn(x,c,"y","z",r,e);break;case 2:x.set(0,1,0),u[_+0]=1-Dn(x,c,"x","z",r,t),u[_+1]=Dn(x,c,"z","x",r,n);break;case 3:x.set(0,-1,0),u[_+0]=1-Dn(x,c,"x","z",r,t),u[_+1]=1-Dn(x,c,"z","x",r,n);break;case 4:x.set(0,0,1),u[_+0]=1-Dn(x,c,"x","y",r,t),u[_+1]=1-Dn(x,c,"y","x",r,e);break;case 5:x.set(0,0,-1),u[_+0]=Dn(x,c,"x","y",r,t),u[_+1]=1-Dn(x,c,"y","x",r,e);break}}static fromJSON(t){return new i(t.width,t.height,t.depth,t.segments,t.radius)}};var xd=Object.freeze({x:[0,2,1],y:[1,0,2],z:[2,0,1]}),bd=Math.PI*2,vd=40,Dv=.55;function wd(i){let t=Number.isFinite(i)?Math.min(1,Math.max(0,i)):1;return Math.min(vd,2/Math.max(t,2/vd))}var er=(i,t)=>i<0?-Math.pow(-i,t):Math.pow(i,t);function yd(i,t){let e=i.length,n=new Float64Array(e);if(e<2)return n;let s=new Float64Array(e-1),r=new Float64Array(e-1);for(let a=0;a<e-1;a++)s[a]=i[a+1]-i[a],r[a]=(t[a+1]-t[a])/s[a];if(e===2)return n[0]=n[1]=r[0],n;for(let a=1;a<e-1;a++)if(r[a-1]*r[a]<=0)n[a]=0;else{let l=2*s[a]+s[a-1],c=s[a]+2*s[a-1];n[a]=(l+c)/(l/r[a-1]+c/r[a])}let o=(a,l,c,h)=>{let f=((2*a+l)*c-a*h)/(a+l);return Math.sign(f)!==Math.sign(c)?f=0:Math.sign(c)!==Math.sign(h)&&Math.abs(f)>Math.abs(3*c)&&(f=3*c),f};return n[0]=o(s[0],s[1],r[0],r[1]),n[e-1]=o(s[e-2],s[e-3],r[e-2],r[e-3]),n}function Md(i,t,e,n,s){let r=i[n+1]-i[n],o=(s-i[n])/r,a=o*o,l=a*o;return(2*l-3*a+1)*t[n]+(l-2*a+o)*r*e[n]+(-2*l+3*a)*t[n+1]+(l-a)*r*e[n+1]}function Ad(i){let t=0;for(let e=0;e<i.length;e++){let n=i[e],s=i[(e+1)%i.length];t+=n[0]*s[1]-s[0]*n[1]}return t/2}function Fv(i,t,e=[0,0]){let n=i.map(_=>[_[0]-e[0],_[1]-e[1]]);Ad(n)<0&&(n=n.reverse());let s=1/0,r=-1/0;for(let _ of n)s=Math.min(s,_[0]),r=Math.max(r,_[0]);let o=(s+r)/2,a=0,l=0,c=1/0;for(let _=0;_<n.length;_++){let S=n[_],y=n[(_+1)%n.length];if((S[0]-o)*(y[0]-o)>0||S[0]===y[0])continue;let T=(o-S[0])/(y[0]-S[0]),A=S[1]+T*(y[1]-S[1]);A<c&&(c=A,a=_,l=T)}let h=n[a],f=n[(a+1)%n.length],d=[h[0]+l*(f[0]-h[0]),h[1]+l*(f[1]-h[1])],u=[d];for(let _=1;_<=n.length;_++)u.push(n[(a+_)%n.length]);u.push(d);let m=[0];for(let _=1;_<u.length;_++)m.push(m[_-1]+Math.hypot(u[_][0]-u[_-1][0],u[_][1]-u[_-1][1]));let x=m[m.length-1]||1,p=new Float64Array(2*t),g=0;for(let _=0;_<t;_++){let S=_/t*x;for(;g<m.length-2&&m[g+1]<S;)g++;let y=m[g+1]-m[g]||1,T=Math.min(1,Math.max(0,(S-m[g])/y));p[2*_]=u[g][0]+T*(u[g+1][0]-u[g][0]),p[2*_+1]=u[g][1]+T*(u[g+1][1]-u[g][1])}return p}function Uv(i,t){let e=new Float64Array(2*t),n=i.w/2,s=i.h/2,r=i.pts?Fv(i.pts,t,[0,0]):null,o=2/wd(i.round),a=i.top!==void 0&&i.w>0?i.top/i.w:1,l=(i.twist||0)*Math.PI/180,c=Math.cos(l),h=Math.sin(l);for(let f=0;f<t;f++){let d,u;if(r)d=r[2*f],u=r[2*f+1];else{let m=-Math.PI/2+bd*f/t;d=n*er(Math.cos(m),o),u=s*er(Math.sin(m),o)}if(a!==1&&u>0&&(d*=1+(a-1)*Math.min(1,u/Math.max(s,1e-9))),l){let m=d*c-u*h;u=d*h+u*c,d=m}e[2*f]=(i.c?i.c[0]:0)+d,e[2*f+1]=(i.c?i.c[1]:0)+u}return e}function Ov(i,t,e,n=12){let s=i[0],r=i[i.length-1],o=r-s,a=2*(i.length-1)<=t?2:1,l=[];for(let d=0;d<i.length-1;d++){let u=i[d],m=i[d+1],x=Math.max(a,Math.min(24,Math.round((m-u)/o*t)));for(let p=0;p<x;p++)l.push(u+(m-u)*p/x)}l.push(r);for(let[d,,u]of e){let m=n;for(let p=0;p<=m;p++)l.push(d+u*Math.cos(Math.PI*p/m));let x=Math.max(u*.004,o*1e-5);l.push(d-u-x,d+u+x)}let c=l.filter(d=>d>=s&&d<=r).sort((d,u)=>d-u),h=[],f=o*1e-6;for(let d of c)(!h.length||d-h[h.length-1]>f)&&h.push(d);return h}function Td(i,t={}){let e=t.N||40,n=t.M||40,s=xd[i.axis||"x"]||xd.x,r=i.sections,o=r.length,a=r.map(G=>G.s),l=r.map(G=>Uv(G,e)),c=new Float64Array(o),h=new Float64Array(o),f=[];for(let G=0;G<e;G++){for(let N=0;N<o;N++)c[N]=l[N][2*G],h[N]=l[N][2*G+1];f.push([yd(a,c),yd(a,h),Float64Array.from(c),Float64Array.from(h)])}let d=i.arches||[],u=Ov(a,n,d,t.archSteps||12),m=u.length,x=new Float32Array(m*e*3),p=new Float64Array(m*e*2),g=0;for(let G=0;G<m;G++){let N=u[G],X=0;for(;X<o-2&&N>a[X+1];)X++;let U=-1/0;for(let[Y,tt,vt]of d){let Ft=N-Y;Math.abs(Ft)<=vt&&(U=Math.max(U,tt+Math.sqrt(Math.max(0,vt*vt-Ft*Ft))))}for(let Y=0;Y<e;Y++){let[tt,vt,Ft,$]=f[Y],lt=Md(a,Ft,tt,X,N),yt=Md(a,$,vt,X,N);yt<U&&(yt=U);let kt=[0,0,0];kt[s[0]]=N,kt[s[1]]=lt,kt[s[2]]=yt,x[g*3]=kt[0],x[g*3+1]=kt[1],x[g*3+2]=kt[2],p[g*2]=lt,p[g*2+1]=yt,g++}}let _=[];for(let G=0;G<m-1;G++)for(let N=0;N<e;N++){let X=G*e+N,U=G*e+(N+1)%e,Y=(G+1)*e+N,tt=(G+1)*e+(N+1)%e;_.push(X,U,tt,X,tt,Y)}let S=[],y=G=>[x[G*3],x[G*3+1],x[G*3+2]],T=G=>{for(let N=0;N<e;N++)S.push(...y(G*e+N),...y(G*e+(N+1)%e))};if(t.ribs!==!1&&!t.edges){let N=(a[o-1]-a[0])*(t.ribGap||.03),X=-1/0;a.forEach((U,Y)=>{if(!(Y===0||Y===o-1)&&(U-X<N||a[o-1]-U<N))return;let vt=0;for(let Ft=1;Ft<m;Ft++)Math.abs(u[Ft]-U)<Math.abs(u[vt]-U)&&(vt=Ft);T(vt),X=U})}else T(0),T(m-1);let A=S.length/3;for(let G of t.edges?[.25,.75]:[.125,.375,.625,.875]){let N=Math.round(G*e)%e;for(let X=0;X<m-1;X++)S.push(...y(X*e+N),...y((X+1)*e+N))}Bv(x,m,e,S,Math.cos(35*Math.PI/180));let v=i.cap===void 0?"both":i.cap,b=v==="both"||v==="start",D=v==="both"||v==="end",P=[],I=[],O=m*e;for(let[G,N]of[[b,0],[D,m-1]]){if(!G)continue;let X=[];for(let tt=0;tt<e;tt++)X.push([p[(N*e+tt)*2],p[(N*e+tt)*2+1]]);let U=zv(X),Y=O;for(let tt=0;tt<e;tt++)P.push(...y(N*e+tt)),O++;for(let tt of U)I.push(Y+tt[0],Y+tt[1],Y+tt[2])}let V=new Float32Array(x.length+P.length);V.set(x,0),V.set(P,x.length);let R=new Uint32Array(_.length+I.length);R.set(_,0),R.set(I,_.length);let B=new Float32Array(S.length/3).fill(1);return B.fill(Dv,0,A),{positions:V,indices:R,lines:S,lineWeights:B,skinVertices:m*e,rings:m,ringSize:e}}function Bv(i,t,e,n,s){let r=new Float64Array((t-1)*e*3),o=new Uint8Array((t-1)*e);for(let c=0;c<t-1;c++)for(let h=0;h<e;h++){let f=(c*e+h)*3,d=(c*e+(h+1)%e)*3,u=((c+1)*e+h)*3,m=((c+1)*e+(h+1)%e)*3,x=[i[m]-i[f],i[m+1]-i[f+1],i[m+2]-i[f+2]],p=[i[u]-i[d],i[u+1]-i[d+1],i[u+2]-i[d+2]],g=[x[1]*p[2]-x[2]*p[1],x[2]*p[0]-x[0]*p[2],x[0]*p[1]-x[1]*p[0]],_=Math.hypot(g[0],g[1],g[2]),S=c*e+h,y=Math.hypot(...x)*Math.hypot(...p);_>1e-9*Math.max(y,1e-12)&&_>0&&(r[S*3]=g[0]/_,r[S*3+1]=g[1]/_,r[S*3+2]=g[2]/_,o[S]=1)}let a=(c,h)=>r[c*3]*r[h*3]+r[c*3+1]*r[h*3+1]+r[c*3+2]*r[h*3+2],l=(c,h)=>n.push(i[c*3],i[c*3+1],i[c*3+2],i[h*3],i[h*3+1],i[h*3+2]);for(let c=0;c<t-1;c++)for(let h=0;h<e;h++){let f=c*e+h;if(!o[f])continue;let d=c*e+(h+1)%e;if(o[d]&&a(f,d)<s&&l(c*e+(h+1)%e,(c+1)*e+(h+1)%e),c<t-2){let u=(c+1)*e+h;o[u]&&a(f,u)<s&&l((c+1)*e+h,(c+1)*e+(h+1)%e)}}}function zv(i){let t=i.length;if(t<3)return[];let e=[];for(let c=0;c<t;c++)e.push(c);let s=Ad(i)>=0?1:-1,r=(c,h,f)=>(i[h][0]-i[c][0])*(i[f][1]-i[c][1])-(i[h][1]-i[c][1])*(i[f][0]-i[c][0]),o=(c,h,f,d)=>{let u=r(h,f,c)*s,m=r(f,d,c)*s,x=r(d,h,c)*s;return u>0&&m>0&&x>0},a=[],l=0;for(;e.length>3&&l++<t*t;){let c=!1;for(let h=0;h<e.length;h++){let f=e[(h+e.length-1)%e.length],d=e[h],u=e[(h+1)%e.length],m=r(f,d,u)*s;if(m<0)continue;if(m===0){e.splice(h,1),c=!0;break}let x=!0;for(let p of e)if(!(p===f||p===d||p===u)&&o(p,f,d,u)){x=!1;break}if(x){a.push([f,d,u]),e.splice(h,1),c=!0;break}}if(!c)break}if(e.length===3)a.push([e[0],e[1],e[2]]);else if(e.length>3)for(let c=1;c<e.length-1;c++)a.push([e[0],e[c],e[c+1]]);return a}function Ed(i,t,e={}){let n=e.around||32,s=e.rows||16,r=2/wd(t),[o,a,l]=i.map(x=>x/2),c=new Float32Array((s+1)*n*3),h=0;for(let x=0;x<=s;x++){let p=-Math.PI/2+Math.PI*x/s,g=er(Math.cos(p),r),_=er(Math.sin(p),r);for(let S=0;S<n;S++){let y=bd*S/n;c[h++]=o*g*er(Math.cos(y),r),c[h++]=a*_,c[h++]=l*g*er(Math.sin(y),r)}}let f=[];for(let x=0;x<s;x++)for(let p=0;p<n;p++){let g=x*n+p,_=x*n+(p+1)%n,S=(x+1)*n+p,y=(x+1)*n+(p+1)%n;x>0&&f.push(g,_,y),x<s-1&&f.push(g,y,S)}let d=[],u=x=>[c[x*3],c[x*3+1],c[x*3+2]],m=s/2;for(let x=0;x<n;x++)d.push(...u(m*n+x),...u(m*n+(x+1)%n));for(let x of[0,n/4,n/2,3*n/4])for(let p=0;p<s;p++)d.push(...u(p*n+x),...u((p+1)*n+x));return{positions:c,indices:Uint32Array.from(f),lines:d}}function Rd(i,t=8,e=70){let n=i.length;if(n<3)return{points:i.map(h=>h.slice()),corners:[0,n-1]};let s=Math.cos(e*Math.PI/180),r=h=>{if(h===0||h===n-1)return!0;let f=i[h-1],d=i[h],u=i[h+1],m=[d[0]-f[0],d[1]-f[1]],x=[u[0]-d[0],u[1]-d[1]],p=Math.hypot(m[0],m[1]),g=Math.hypot(x[0],x[1]);return p<1e-12||g<1e-12?!0:(m[0]*x[0]+m[1]*x[1])/(p*g)<s},o=[i[0].slice()],a=[0],l=[0],c=0;for(let h=1;h<n;h++){if(!r(h))continue;let f=i.slice(c,h+1),d=kv(f,t,l,o.length-1);for(let u=1;u<d.length;u++)o.push(d[u]);a.push(o.length-1),c=h}return{points:o,corners:a,given:l}}function Sd(i,t,e){let n=[t[0]-i[0],t[1]-i[1]],s=[e[0]-t[0],e[1]-t[1]],r=Math.hypot(n[0],n[1])*Math.hypot(s[0],s[1]);return r<1e-18?0:Math.acos(Math.max(-1,Math.min(1,(n[0]*s[0]+n[1]*s[1])/r)))*180/Math.PI}function kv(i,t,e=null,n=0){if(i.length===2)return e&&e.push(n+1),[i[0].slice(),i[1].slice()];let s=[[2*i[0][0]-i[1][0],2*i[0][1]-i[1][1]],...i,[2*i[i.length-1][0]-i[i.length-2][0],2*i[i.length-1][1]-i[i.length-2][1]]],r=[i[0].slice()];for(let o=1;o<s.length-2;o++){let a=s[o-1],l=s[o],c=s[o+1],h=s[o+2],f=(Sd(a,l,c)+Sd(l,c,h))/2,d=Math.max(1,Math.min(t,Math.ceil(f/9))),u=(_,S)=>Math.max(1e-9,Math.sqrt(Math.hypot(S[0]-_[0],S[1]-_[1]))),m=0,x=m+u(a,l),p=x+u(l,c),g=p+u(c,h);for(let _=1;_<=d;_++){let S=x+(p-x)*_/d,y=(P,I,O,V)=>[((V-S)*P[0]+(S-O)*I[0])/(V-O),((V-S)*P[1]+(S-O)*I[1])/(V-O)],T=y(a,l,m,x),A=y(l,c,x,p),v=y(c,h,p,g),b=y(T,A,m,p),D=y(A,v,x,g);r.push(y(b,D,x,p))}e&&e.push(n+r.length-1)}return r}var Cd={coarse:{div:70,voxels:3e4,rounds:1,across:4,tris:7e3},fine:{div:150,voxels:24e4,rounds:3,across:9,tris:3e4}},Gl=Math.PI/180,uo=i=>[1,0,0,0,Math.cos(i),-Math.sin(i),0,Math.sin(i),Math.cos(i)],Id=i=>[Math.cos(i),0,Math.sin(i),0,1,0,-Math.sin(i),0,Math.cos(i)],ql=i=>[Math.cos(i),-Math.sin(i),0,Math.sin(i),Math.cos(i),0,0,0,1],Wl=[1,0,0,0,1,0,0,0,1],Gv={y:Wl,"-y":uo(Math.PI),x:ql(-Math.PI/2),"-x":ql(Math.PI/2),z:uo(Math.PI/2),"-z":uo(-Math.PI/2)};function Vl(i,t){let e=new Array(9);for(let n=0;n<3;n++)for(let s=0;s<3;s++)e[n*3+s]=i[n*3]*t[s]+i[n*3+1]*t[3+s]+i[n*3+2]*t[6+s];return e}var Ud=i=>[i[0],i[3],i[6],i[1],i[4],i[7],i[2],i[5],i[8]];function Pd(i,t){if(!Array.isArray(i)||i.length<2)return!1;let e=1/0,n=-1/0;for(let r of i){let o=r[t];o<e&&(e=o),o>n&&(n=o)}let s=Math.max(1e-6,(n-e)*.002);return e>=-s&&Math.abs(e)<=s&&n>s}function Xl(i,t,e){let n=[];for(let s of i)n.push(s[0],s[1]);if(e){let s=0;for(let o of i)s=Math.max(s,Math.abs(o[t]));let r=s*.002+1e-9;for(let o=i.length-1;o>=0;o--){let a=i[o];Math.abs(a[t])<=r||n.push(t===0?-a[0]:a[0],t===1?-a[1]:a[1])}}return Float64Array.from(n)}function Vv(i){let t=i.map(([s,r])=>[r,Math.max(0,s)]),e=Math.max(...t.map(s=>s[1])),n=s=>s[1]<=e*.002;return Xl(t,1,n(t[0])||n(t[t.length-1]))}var Hv={x:0,y:1,z:2};function hs(i){let t=1/0,e=-1/0,n=1/0,s=-1/0;for(let r=0;r<i.length;r+=2)i[r]<t&&(t=i[r]),i[r]>e&&(e=i[r]),i[r+1]<n&&(n=i[r+1]),i[r+1]>s&&(s=i[r+1]);return{u0:t,u1:e,v0:n,v1:s}}var Wv=Math.cos(30*Math.PI/180);function Yl(i,t,e=!0){let n=i.length/2;if(n<3||!(t>0))return i;let s=_=>i[(_%n+n)%n*2],r=_=>i[(_%n+n)%n*2+1],o=_=>Math.hypot(s(_+1)-s(_),r(_+1)-r(_)),a=new Uint8Array(n),l=new Float64Array(n),c=new Float64Array(n);e||(a[0]=1,a[n-1]=1);let h=new Float64Array(n);for(let _=0;_<n;_++){let S=o(_-1),y=o(_);if(S<1e-9||y<1e-9)continue;let T=(s(_)-s(_-1))/S,A=(r(_)-r(_-1))/S,v=(s(_+1)-s(_))/y,b=(r(_+1)-r(_))/y;h[_]=Math.atan2(T*b-A*v,T*v+A*b)}let f=Math.acos(Wv),d=75*Math.PI/180,u=12*Math.PI/180,m=0;{let _=hs(i);m=Math.max(_.u1-_.u0,_.v1-_.v0)}let x=(_,S)=>(e||S>0&&S<n-1)&&Math.sign(h[(S%n+n)%n])===Math.sign(h[_])&&Math.abs(h[(S%n+n)%n])>u&&Math.abs(h[(S%n+n)%n])<d,p=_=>o(_-1)<m*.2&&o(_)<m*.2;for(let _=0;_<n;_++){if(a[_])continue;let S=o(_-1),y=o(_);if(S<1e-9||y<1e-9){a[_]=1;continue}let T=Math.abs(h[_]);if(T>d||T>f&&!(p(_)&&(x(_,_-1)||x(_,_+1)))){a[_]=1;continue}let A=(s(_)-s(_-1))/S,v=(r(_)-r(_-1))/S,b=(s(_+1)-s(_))/y,D=(r(_+1)-r(_))/y,P=A*y+b*S,I=v*y+D*S,O=Math.hypot(P,I)||1;l[_]=P/O,c[_]=I/O}let g=[];for(let _=0;_<(e?n:n-1);_++){let S=s(_),y=r(_),T=s(_+1),A=r(_+1),v=o(_);if(v<1e-9)continue;let b=(_+1)%n,D=(T-S)/v,P=(A-y)/v,I=Math.min(v,o(_-1)||v),O=Math.min(v,o(_+1)||v),V=a[_]?D*v:l[_]*I,R=a[_]?P*v:c[_]*I,B=a[b]?D*v:l[b]*O,G=a[b]?P*v:c[b]*O,N=Math.acos(Math.max(-1,Math.min(1,(V*D+R*P)/(Math.hypot(V,R)||1))))+Math.acos(Math.max(-1,Math.min(1,(B*D+G*P)/(Math.hypot(B,G)||1)))),X=a[_]&&a[b]?1:Math.max(1,Math.min(24,Math.ceil(v/t),Math.ceil(N/(6*Math.PI/180))));for(let U=0;U<X;U++){let Y=U/X,tt=Y*Y,vt=tt*Y,Ft=2*vt-3*tt+1,$=vt-2*tt+Y,lt=-2*vt+3*tt,yt=vt-tt;g.push(Ft*S+$*V+lt*T+yt*B,Ft*y+$*R+lt*A+yt*G)}}return e||g.push(s(n-1),r(n-1)),Float64Array.from(g)}function Hl(i,t,e,n,s,r,o,a=0,l=0){let c=i.length/2,h=new Float32Array(e*s),f=new Float64Array(c+1);for(let d=0;d<s;d++){let u=n+(l+d)*r,m=0;for(let g=0;g<c;g++){let _=i[g*2],S=i[g*2+1],y=(g+1)%c,T=i[y*2],A=i[y*2+1];S>u!=A>u&&(f[m++]=_+(u-S)*(T-_)/(A-S))}let x=Array.from(f.subarray(0,m)).sort((g,_)=>g-_),p=0;for(let g=0;g<e;g++){let _=t+(a+g)*r;for(;p<x.length&&x[p]<_;)p++;let S=(p&1)===1,y=o*o;for(let A=0;A<c;A++){let v=i[A*2],b=i[A*2+1],D=(A+1)%c,P=i[D*2],I=i[D*2+1],O=_<Math.min(v,P)?Math.min(v,P)-_:_>Math.max(v,P)?_-Math.max(v,P):0;if(O*O>=y)continue;let V=u<Math.min(b,I)?Math.min(b,I)-u:u>Math.max(b,I)?u-Math.max(b,I):0;if(O*O+V*V>=y)continue;let R=P-v,B=I-b,G=R*R+B*B,N=G>0?((_-v)*R+(u-b)*B)/G:0;N=N<0?0:N>1?1:N;let X=v+N*R-_,U=b+N*B-u,Y=X*X+U*U;Y<y&&(y=Y)}let T=Math.sqrt(y);h[g+e*d]=S?T:-T}}return h}var nr=class{constructor(t,e,n,s,r,o,a=0,l=0){this.data=t,this.u0=e,this.v0=s,this.i0=a,this.j0=l,this.nu=n,this.nv=r,this.inv=1/o,this.du=0,this.dv=0}at(t,e){let n=this.inv,s=(t-this.u0)*n-this.i0,r=(e-this.v0)*n-this.j0,o=this.nu;s<0?s=0:s>o-1.0001&&(s=o-1.0001),r<0?r=0:r>this.nv-1.0001&&(r=this.nv-1.0001);let a=s|0,l=r|0,c=s-a,h=r-l,f=a+o*l,d=this.data,u=d[f],m=d[f+1],x=d[f+o],p=d[f+o+1];return this.du=((m-u)*(1-h)+(p-x)*h)*n,this.dv=((x-u)*(1-c)+(p-m)*c)*n,(u+(m-u)*c)*(1-h)+(x+(p-x)*c)*h}};function Gi(i,t,e){if(e<=0)return i<t?i:t;let n=e-Math.abs(i-t);return n<=0?i<t?i:t:(i<t?i:t)-n*n/(4*e)}function Od(i){let t=Gv[i.axis||"y"]||Wl;(i.type==="box"||i.type==="sphere"||i.type==="hull")&&(t=Wl),Array.isArray(i.rot)&&(t=Vl(Vl(Vl(uo(i.rot[0]*Gl),Id(i.rot[1]*Gl)),ql(i.rot[2]*Gl)),t));let e=i.at||[0,0,0],n=[],s=i.repeat,r=s?s.count:1;for(let o=0;o<r;o++){let a=Wl,l=[0,0,0];if(s&&s.along)l=[s.along[0]*o,s.along[1]*o,s.along[2]*o];else if(s){let f=((s.start||0)+s.step*o)*Gl;a=s.around==="x"?uo(f):s.around==="z"?ql(f):Id(f);let d=s.center||[0,0,0],u=[e[0]-d[0],e[1]-d[1],e[2]-d[2]];l=[a[0]*u[0]+a[1]*u[1]+a[2]*u[2]+d[0]-e[0],a[3]*u[0]+a[4]*u[1]+a[5]*u[2]+d[1]-e[1],a[6]*u[0]+a[7]*u[1]+a[8]*u[2]+d[2]-e[2]]}let c=Vl(a,t),h=[e[0]+l[0],e[1]+l[1],e[2]+l[2]];n.push({inv:Ud(c),origin:h,full:c})}return n}function Xv(i){switch(i.type){case"box":{let t=i.size[0]/2,e=i.size[1]/2,n=i.size[2]/2,s=Math.min(i.r||0,t,e,n);return{half:[t,e,n],field(r,o,a){let l=Math.abs(r)-t+s,c=Math.abs(o)-e+s,h=Math.abs(a)-n+s,f=l>0?l:0,d=c>0?c:0,u=h>0?h:0,m=Math.sqrt(f*f+d*d+u*u),x=Math.min(Math.max(l,c,h),0);return-(m+x-s)}}}case"cylinder":{let t=Math.max(i.r,i.r2??i.r),e=i.h/2;return{half:[t,e,t],field(n,s,r){let o=Math.sqrt(n*n+r*r)-t,a=Math.abs(s)-e,l=o>0?o:0,c=a>0?a:0;return-(Math.min(Math.max(o,a),0)+Math.sqrt(l*l+c*c))}}}case"sphere":{let t=i.size?i.size.map(e=>e/2):[i.r,i.r,i.r];return{half:t,field(e,n,s){let r=Math.sqrt((e/t[0])**2+(n/t[1])**2+(s/t[2])**2),o=Math.sqrt((e/(t[0]*t[0]))**2+(n/(t[1]*t[1]))**2+(s/(t[2]*t[2]))**2);return o>0?-(r*(r-1))/o:Math.min(...t)}}}default:return null}}function qv(i,t,e){let n=[];for(let s of Array.isArray(i)?i:[]){let r=Xv(s);if(r)for(let o of Od(s)){if(e&&o.origin[2]<0){let f=o.full;o.full=[f[0],f[1],f[2],f[3],f[4],f[5],-f[6],-f[7],-f[8]],o.origin=[o.origin[0],o.origin[1],-o.origin[2]],o.inv=Ud(o.full)}let a=[1/0,1/0,1/0],l=[-1/0,-1/0,-1/0];for(let f of[-1,1])for(let d of[-1,1])for(let u of[-1,1]){let m=[f*r.half[0],d*r.half[1],u*r.half[2]],x=o.full,p=[x[0]*m[0]+x[1]*m[1]+x[2]*m[2]+o.origin[0],x[3]*m[0]+x[4]*m[1]+x[5]*m[2]+o.origin[1],x[6]*m[0]+x[7]*m[1]+x[8]*m[2]+o.origin[2]];for(let g=0;g<3;g++)a[g]=Math.min(a[g],p[g]-t),l[g]=Math.max(l[g],p[g]+t)}let c=o.inv,h=o.origin;n.push({lo:a,hi:l,field(f,d,u){let m=f-h[0],x=d-h[1],p=u-h[2];return r.field(c[0]*m+c[1]*x+c[2]*p,c[3]*m+c[4]*x+c[5]*p,c[6]*m+c[7]*x+c[8]*p)}})}}return n}function fo(i){return JSON.stringify([i.side||null,i.top||null,i.front||null,i.revolve||null,i.revolve?i.axis||"y":null,i.r??null,i.mirror?1:0,i.cut||null])}var Nh=class{constructor(t,e,n){let s=Cd[e]||Cd.fine,r=!!(t.top&&Pd(t.top,1)),o=!!(t.front&&Pd(t.front,0)),a=!!t.mirror||r||o,l=t.side?Xl(t.side,-1,!1):null,c=t.top?Xl(t.top,1,r):null,h=t.front?Xl(t.front,0,o):null,f=Array.isArray(t.revolve)&&t.revolve.length>=2?Vv(t.revolve):null,d=String(t.axis||"y"),u=d.startsWith("-")?-1:1,m=Hv[d.replace("-","")]??1,x=-1e9,p=1e9,g=-1e9,_=1e9,S=-1e9,y=1e9;if(f){let at=hs(f),jt=u>0?at.u0:-at.u1,mt=u>0?at.u1:-at.u0,Q=[-at.v1,-at.v1,-at.v1],dt=[at.v1,at.v1,at.v1];Q[m]=jt,dt[m]=mt,x=Q[0],p=dt[0],g=Q[1],_=dt[1],S=Q[2],y=dt[2]}if(l){let at=hs(l);x=Math.max(x,at.u0),p=Math.min(p,at.u1),g=Math.max(g,at.v0),_=Math.min(_,at.v1)}if(c){let at=hs(c);x=Math.max(x,at.u0),p=Math.min(p,at.u1),S=Math.max(S,at.v0),y=Math.min(y,at.v1)}if(h){let at=hs(h);S=Math.max(S,at.u0),y=Math.min(y,at.u1),g=Math.max(g,at.v0),_=Math.min(_,at.v1)}if(this.ok=p>x&&_>g&&y>S&&![x,p,g,_,S,y].some(at=>Math.abs(at)>=1e9),!this.ok)return;let T=!1,A=!1;if(a)if(S>(y-S)*.02||y<-(y-S)*.02)A=!0;else{T=!0;let at=Math.max(Math.abs(S),Math.abs(y));S=-at,y=at}let v=p-x,b=_-g,D=y-S,P=Math.min(v,b,D),I=Math.max(0,Math.min(t.r??P*.04,P*.45)),O=2,V=n>0?n:Math.hypot(v,b,D),R=Math.min(V/s.div,P/s.across),B=Math.min(1,Math.hypot(v,b,D)/V),G=s.tris*Math.max(.08,Math.pow(B,1.5)),N=2*(v*b+b*D+v*D)*.75;R=Math.max(R,Math.sqrt(2*N/G));let X=at=>(Math.ceil(v/at)+2*O+1)*(Math.ceil(b/at)+2*O+1)*(Math.ceil(D/at)+2*O+1);for(let at=0;at<60&&X(R)>s.voxels;at++)R*=1.06;let U=Math.ceil(v/R)+2*O+1,Y=Math.ceil(b/R)+2*O+1,tt=Math.ceil(D/R)+2*O+1,vt=(x+p)/2-(U-1)*R/2,Ft=(g+_)/2-(Y-1)*R/2,$=(S+y)/2-(tt-1)*R/2,lt=R/2,yt=Math.max(4*I,8*R),kt=2*U-1,et=2*Y-1,Zt=2*tt-1,Xt=at=>Yl(at,R*.75);if(this.S=l?new nr(Hl(Xt(l),vt,kt,Ft,et,lt,yt),vt,kt,Ft,et,lt):null,this.T=c?new nr(Hl(Xt(c),vt,kt,$,Zt,lt,yt),vt,kt,$,Zt,lt):null,this.F=h?new nr(Hl(Xt(h),$,Zt,Ft,et,lt,yt),$,Zt,Ft,et,lt):null,this.R=null,f){let at=hs(f),jt=at.u0-2*R,mt=Math.ceil((at.u1-at.u0+4*R)/lt)+1,Q=-2*R,dt=Math.ceil((at.v1+4*R)/lt)+1,ut=[vt,Ft,$],pt=[vt+(U-1)*R,Ft+(Y-1)*R,$+(tt-1)*R],xt=(m+1)%3,At=(m+2)%3,Tt=u>0?ut[m]:-pt[m],$t=u>0?pt[m]:-ut[m],K=(C,w)=>C>0?C:w<0?-w:0,St=Math.hypot(K(ut[xt],pt[xt]),K(ut[At],pt[At])),F=Math.hypot(Math.max(-ut[xt],pt[xt]),Math.max(-ut[At],pt[At])),Ht=(C,w,q,gt)=>{let ot=Math.max(0,Math.min(gt-2,Math.floor((C-2*R-q)/lt)));return[ot,Math.max(ot+1,Math.min(gt-1,Math.ceil((w+2*R-q)/lt)))]},[Dt,Bt]=Ht(Tt,$t,jt,mt),[ft,ee]=Ht(St,F,Q,dt),wt=Bt-Dt+1,Rt=ee-ft+1;this.R=new nr(Hl(Xt(f),jt,wt,Q,Rt,lt,yt,Dt,ft),jt,wt,Q,Rt,lt,Dt,ft),this.ri=m,this.rsign=u}this.kc=I*.6,this.cuts=qv(t.cut,Math.max(this.kc,R),T),Object.assign(this,{L:s,k:I,h:R,fold:T,dup:A,mirror:a,nx:U,ny:Y,nz:tt,gx:vt,gy:Ft,gz:$,mx:kt,my:et,mz:Zt,pad:O}),this.termCount=4+this.cuts.length,this.box={min:[x,g,S],max:[p,_,y]},this.gx_=0,this.gy_=0,this.gz_=0}rev(t,e,n){let s=[t,e,n],r=this.rsign*s[this.ri],o=(this.ri+1)%3,a=(this.ri+2)%3,l=Math.hypot(s[o],s[a]),c=this.R.at(r,l),h=[0,0,0];return h[this.ri]=this.rsign*this.R.du,l>1e-9&&(h[o]=this.R.dv*s[o]/l,h[a]=this.R.dv*s[a]/l),this.rgx=h[0],this.rgy=h[1],this.rgz=h[2],c}f(t,e,n){let s=this.fold&&n<0?-n:n,r=this.k,o=this.S?this.S.at(t,e):1e9;this.T&&(o=Gi(o,this.T.at(t,s),r)),this.F&&(o=Gi(o,this.F.at(s,e),r)),this.R&&(o=o>=1e9?this.rev(t,e,n):Gi(o,this.rev(t,e,n),r));for(let a=0;a<this.cuts.length;a++){let l=this.cuts[a];t<l.lo[0]||t>l.hi[0]||e<l.lo[1]||e>l.hi[1]||s<l.lo[2]||s>l.hi[2]||(o=Gi(o,-l.field(t,e,s),this.kc))}return o}fg(t,e,n){let s=this.fold&&n<0,r=s?-n:n,o=this.k,a=1e9,l=0,c=0,h=0,f=(u,m,x,p,g)=>{let _=g-Math.abs(a-u);if(g<=0||_<=0){u<a&&(a=u,l=m,c=x,h=p);return}let S=_/(2*g),y=_*_/(4*g);a<=u?(a-=y,l=(1-S)*l+S*m,c=(1-S)*c+S*x,h=(1-S)*h+S*p):(a=u-y,l=(1-S)*m+S*l,c=(1-S)*x+S*c,h=(1-S)*p+S*h)};if(this.S&&(a=this.S.at(t,e),l=this.S.du,c=this.S.dv),this.T){let u=this.T.at(t,r);a>=1e9?(a=u,l=this.T.du,c=0,h=s?-this.T.dv:this.T.dv):f(u,this.T.du,0,s?-this.T.dv:this.T.dv,o)}if(this.F){let u=this.F.at(r,e);a>=1e9?(a=u,l=0,c=this.F.dv,h=s?-this.F.du:this.F.du):f(u,0,this.F.dv,s?-this.F.du:this.F.du,o)}if(this.R){let u=this.rev(t,e,n);a>=1e9?(a=u,l=this.rgx,c=this.rgy,h=this.rgz):f(u,this.rgx,this.rgy,this.rgz,o)}let d=this.h*.25;for(let u=0;u<this.cuts.length;u++){let m=this.cuts[u];if(t<m.lo[0]||t>m.hi[0]||e<m.lo[1]||e>m.hi[1]||r<m.lo[2]||r>m.hi[2])continue;let x=-m.field(t,e,r),p=-(m.field(t+d,e,r)-m.field(t-d,e,r))/(2*d),g=-(m.field(t,e+d,r)-m.field(t,e-d,r))/(2*d),_=-(m.field(t,e,r+d)-m.field(t,e,r-d))/(2*d);s&&(_=-_),f(x,p,g,_,this.kc)}return this.gx_=l,this.gy_=c,this.gz_=h,a}terms(t,e,n,s,r){let o=this.fold&&n<0,a=o?-n:n,l=(h,f,d,u,m)=>{s[h]=f;let x=Math.hypot(d,u,m)||1;r[h*3]=d/x,r[h*3+1]=u/x,r[h*3+2]=m/x};if(this.S?l(0,this.S.at(t,e),this.S.du,this.S.dv,0):l(0,1e9,0,0,0),this.T){let h=this.T.at(t,a);l(1,h,this.T.du,0,o?-this.T.dv:this.T.dv)}else l(1,1e9,0,0,0);if(this.F){let h=this.F.at(a,e);l(2,h,0,this.F.dv,o?-this.F.du:this.F.du)}else l(2,1e9,0,0,0);if(this.R){let h=this.rev(t,e,n);l(3,h,this.rgx,this.rgy,this.rgz)}else l(3,1e9,0,0,0);let c=this.h*.25;for(let h=0;h<this.cuts.length;h++){let f=this.cuts[h],d=-(f.field(t+c,e,a)-f.field(t-c,e,a)),u=-(f.field(t,e+c,a)-f.field(t,e-c,a)),m=-(f.field(t,e,a+c)-f.field(t,e,a-c));o&&(m=-m),l(4+h,-f.field(t,e,a),d,u,m)}}};function Yv(i,{level:t="fine",scale:e=0}={}){let n=new Nh(i,t,e);return n.ok?n:null}var Zv=[0,2,4,6,0,1,4,5,0,1,2,3],Jv=[1,3,5,7,2,3,6,7,4,5,6,7],wi=class{constructor(t,e=4096){this.Type=t,this.a=new t(e),this.n=0}push3(t,e,n){this.n+3>this.a.length&&this.grow(),this.a[this.n++]=t,this.a[this.n++]=e,this.a[this.n++]=n}push4(t,e,n,s){this.n+4>this.a.length&&this.grow(),this.a[this.n++]=t,this.a[this.n++]=e,this.a[this.n++]=n,this.a[this.n++]=s}grow(){let t=new this.Type(this.a.length*2);t.set(this.a),this.a=t}done(){return this.a.slice(0,this.n)}},$v=Math.cos(24*Math.PI/180),Kv=.32;function Dh(i,{level:t="fine",scale:e=0}={}){let n=Dd(),s=Yv(i,{level:t,scale:e});if(!s)return null;let{nx:r,ny:o,nz:a,gx:l,gy:c,gz:h,h:f,mx:d,mz:u,k:m,kc:x,cuts:p,fold:g,dup:_}=s,S=s.S&&s.S.data,y=s.T&&s.T.data,T=s.F&&s.F.data,A=r*o,v=new Float32Array(A*a);for(let K=0;K<a;K++){let St=h+K*f,F=2*K;g&&St<0&&(F=Math.round((-St-h)/(f/2))),F>u-1&&(F=u-1);for(let Ht=0;Ht<o;Ht++){let Dt=r*Ht+A*K,Bt=2*Ht*d,ft=T?T[F+u*2*Ht]:1e9,ee=d*F;for(let wt=0;wt<r;wt++){let Rt=S?S[2*wt+Bt]:1e9;if(y&&(Rt=Gi(Rt,y[2*wt+ee],m)),T&&(Rt=Gi(Rt,ft,m)),s.R){let C=s.rev(l+wt*f,c+Ht*f,St);Rt=Rt>=1e9?C:Gi(Rt,C,m)}v[Dt+wt]=Rt}}}for(let K of p){let St=g?[[K.lo[2],K.hi[2]],[-K.hi[2],-K.lo[2]]]:[[K.lo[2],K.hi[2]]],F=Math.max(0,Math.floor((K.lo[0]-l)/f)),Ht=Math.min(r-1,Math.ceil((K.hi[0]-l)/f)),Dt=Math.max(0,Math.floor((K.lo[1]-c)/f)),Bt=Math.min(o-1,Math.ceil((K.hi[1]-c)/f)),ft=new Set;for(let[ee,wt]of St){let Rt=Math.max(0,Math.floor((ee-h)/f)),C=Math.min(a-1,Math.ceil((wt-h)/f));for(let w=Rt;w<=C;w++){if(ft.has(w))continue;ft.add(w);let q=h+w*f,gt=g&&q<0?-q:q;for(let ot=Dt;ot<=Bt;ot++){let bt=c+ot*f,Et=r*ot+A*w;for(let rt=F;rt<=Ht;rt++)v[Et+rt]=Gi(v[Et+rt],-K.field(l+rt*f,bt,gt),x)}}}}let b=r-1,D=o-1,P=a-1,I=new Int32Array(b*D*P).fill(-1),O=new wi(Float64Array,32768),V=[0,1,r,r+1,A,A+1,A+r,A+r+1],R=new Float64Array(8),B=0;for(let K=0;K<P;K++)for(let St=0;St<D;St++){let F=r*St+A*K;for(let Ht=0;Ht<b;Ht++){let Dt=F+Ht,Bt=0;for(let C=0;C<8;C++){let w=v[Dt+V[C]];R[C]=w,w>0&&(Bt|=1<<C)}if(Bt===0||Bt===255)continue;let ft=0,ee=0,wt=0,Rt=0;for(let C=0;C<12;C++){let w=Zv[C],q=Jv[C];if((Bt>>w&1)===(Bt>>q&1))continue;let gt=R[w]/(R[w]-R[q]),ot=w&1,bt=w>>1&1,Et=w>>2;ft+=ot+((q&1)-ot)*gt,ee+=bt+((q>>1&1)-bt)*gt,wt+=Et+((q>>2)-Et)*gt,Rt++}I[Ht+b*(St+D*K)]=B++,O.push3(l+(Ht+ft/Rt)*f,c+(St+ee/Rt)*f,h+(K+wt/Rt)*f)}}let G=new wi(Int32Array,32768),N=b*D;for(let K=1;K<a-1;K++)for(let St=1;St<o-1;St++)for(let F=1;F<r-1;F++){let Ht=F+r*St+A*K,Dt=v[Ht]>0,Bt=F+b*St+N*K;if(Dt!==v[Ht+1]>0){let ft=I[Bt-b-N],ee=I[Bt-N],wt=I[Bt],Rt=I[Bt-b];ft>=0&&ee>=0&&wt>=0&&Rt>=0&&(Dt?G.push4(ft,ee,wt,Rt):G.push4(ft,Rt,wt,ee))}if(Dt!==v[Ht+r]>0){let ft=I[Bt-1-N],ee=I[Bt-1],wt=I[Bt],Rt=I[Bt-N];ft>=0&&ee>=0&&wt>=0&&Rt>=0&&(Dt?G.push4(ft,ee,wt,Rt):G.push4(ft,Rt,wt,ee))}if(Dt!==v[Ht+A]>0){let ft=I[Bt-1-b],ee=I[Bt-b],wt=I[Bt],Rt=I[Bt-1];ft>=0&&ee>=0&&wt>=0&&Rt>=0&&(Dt?G.push4(ft,ee,wt,Rt):G.push4(ft,Rt,wt,ee))}}let X=G.done(),U=O.done(),Y=B,tt=K=>{let St=U[K*3],F=U[K*3+1],Ht=U[K*3+2],Dt=s.fg(St,F,Ht),Bt=s.gx_,ft=s.gy_,ee=s.gz_,wt=Bt*Bt+ft*ft+ee*ee;if(wt<1e-12)return;let Rt=Dt/wt,C=Math.abs(Rt)*Math.sqrt(wt);C>f&&(Rt*=f/C),U[K*3]=St-Rt*Bt,U[K*3+1]=F-Rt*ft,U[K*3+2]=Ht-Rt*ee},vt=new Float64Array(Y*3),Ft=new Uint16Array(Y);for(let K=0;K<s.L.rounds;K++){vt.fill(0),Ft.fill(0);for(let St=0;St<X.length;St+=4)for(let F=0;F<4;F++){let Ht=X[St+F]*3,Dt=X[St+(F+1&3)]*3;vt[Ht]+=U[Dt],vt[Ht+1]+=U[Dt+1],vt[Ht+2]+=U[Dt+2],vt[Dt]+=U[Ht],vt[Dt+1]+=U[Ht+1],vt[Dt+2]+=U[Ht+2],Ft[Ht/3]++,Ft[Dt/3]++}for(let St=0;St<Y;St++){let F=Ft[St];if(F)for(let Ht=0;Ht<3;Ht++)U[St*3+Ht]+=.5*(vt[St*3+Ht]/F-U[St*3+Ht])}for(let St=0;St<Y;St++)tt(St)}if(!s.L.rounds)for(let K=0;K<Y;K++)tt(K);let $=new Float32Array(Y*3);for(let K=0;K<Y;K++){s.fg(U[K*3],U[K*3+1],U[K*3+2]);let St=-s.gx_,F=-s.gy_,Ht=-s.gz_,Dt=Math.hypot(St,F,Ht)||1;$[K*3]=St/Dt,$[K*3+1]=F/Dt,$[K*3+2]=Ht/Dt}let lt=new Uint32Array(X.length/4*6),yt=0;for(let K=0;K<X.length;K+=4){let St=X[K],F=X[K+1],Ht=X[K+2],Dt=X[K+3],Bt=(U[St*3]-U[Ht*3])**2+(U[St*3+1]-U[Ht*3+1])**2+(U[St*3+2]-U[Ht*3+2])**2,ft=(U[F*3]-U[Dt*3])**2+(U[F*3+1]-U[Dt*3+1])**2+(U[F*3+2]-U[Dt*3+2])**2;Bt<=ft?(lt[yt++]=St,lt[yt++]=F,lt[yt++]=Ht,lt[yt++]=St,lt[yt++]=Ht,lt[yt++]=Dt):(lt[yt++]=St,lt[yt++]=F,lt[yt++]=Dt,lt[yt++]=F,lt[yt++]=Ht,lt[yt++]=Dt)}let kt=s.termCount,et=new Float32Array(Y*kt),Zt=new Float32Array(Y*kt*3),Xt=new Float64Array(kt),at=new Float64Array(kt*3),jt=new Uint8Array(Y);for(let K=0;K<Y;K++){s.terms(U[K*3],U[K*3+1],U[K*3+2],Xt,at);let St=0;for(let F=0;F<kt;F++)et[K*kt+F]=Xt[F],Xt[F]<Xt[St]&&(St=F);Zt.set(at,K*kt*3),jt[K]=Math.min(St,255)}let mt=ey(U,lt,et,Zt,kt,Math.max(m,1.5*f),Math.max(x,1.5*f)),Q=s.R?s.ri:0,dt=Math.max(s.box.max[Q]-s.box.min[Q],1e-9),ut=e>0?e:dt*1.2,pt=new Float32Array(0);dt>ut*(s.R?.15:.3)&&(pt=Nd(U,lt,Q,Qv(s.box.min[Q],s.box.max[Q],ut/13)));let xt=new Float32Array(0);s.R&&Array.isArray(i.revolve)&&(xt=Nd(U,lt,Q,jv(i.revolve,s.rsign,f)));let At=new Float32Array((mt.length+xt.length+pt.length)/3);At.fill(1,0,(mt.length+xt.length)/3),At.fill(Kv,(mt.length+xt.length)/3),mt=Ld(Ld(mt,xt),pt);let Tt={positions:Float32Array.from(U),normals:$,indices:lt,lines:mt,lineWeights:At,terms:jt},$t={min:s.box.min.slice(),max:s.box.max.slice()};if(_){Tt=ty(Tt);let K=Math.max(Math.abs($t.min[2]),Math.abs($t.max[2]));$t.min[2]=-K,$t.max[2]=K}return{...Tt,level:t,cell:f,grid:[r,o,a],triangles:Tt.indices.length/3,ms:Dd()-n,box:$t}}function Ld(i,t){let e=new Float32Array(i.length+t.length);return e.set(i),e.set(t,i.length),e}function Qv(i,t,e){let n=[],s=Math.max(1,Math.floor((t-i)/e)),r=i+(t-i-(s-1)*e)/2;for(let o=0;o<s;o++){let a=r+o*e;a>i+e*.35&&a<t-e*.35&&n.push(a)}return n}function jv(i,t,e){let n=[],s=i.length,r=0;for(let l=0;l<s;l++){if(i[l][0]>i[r][0]&&(r=l),l===0||l===s-1)continue;let[c,h]=i[l-1],[f,d]=i[l],[u,m]=i[l+1],x=d-h,p=f-c,g=m-d,_=u-f,S=Math.hypot(x,p),y=Math.hypot(g,_);S<1e-9||y<1e-9||(x*g+p*_)/(S*y)<Math.cos(35*Math.PI/180)&&n.push(d)}n.push(i[r][1]);let o=Math.min(...i.map(l=>l[1])),a=Math.max(...i.map(l=>l[1]));return[...new Set(n.map(l=>Math.min(a-e*.6,Math.max(o+e*.6,l))*t))]}function Nd(i,t,e,n){let s=new wi(Float32Array,4096),r=new Float64Array(3),o=new Float64Array(6);for(let a of n)for(let l=0;l<t.length;l+=3){let c=t[l],h=t[l+1],f=t[l+2];if(r[0]=i[c*3+e]-a,r[1]=i[h*3+e]-a,r[2]=i[f*3+e]-a,r[0]>0&&r[1]>0&&r[2]>0||r[0]<=0&&r[1]<=0&&r[2]<=0)continue;let d=0,u=[c,h,f];for(let m=0;m<3&&d<2;m++){let x=u[m],p=u[(m+1)%3],g=r[m],_=r[(m+1)%3];if(g>0==_>0)continue;let S=g/(g-_);o[d*3]=i[x*3]+(i[p*3]-i[x*3])*S,o[d*3+1]=i[x*3+1]+(i[p*3+1]-i[x*3+1])*S,o[d*3+2]=i[x*3+2]+(i[p*3+2]-i[x*3+2])*S,d++}d===2&&(s.push3(o[0],o[1],o[2]),s.push3(o[3],o[4],o[5]))}return s.done()}function ty({positions:i,normals:t,indices:e,lines:n,lineWeights:s,terms:r}){let o=i.length/3,a=new Float32Array(i.length*2),l=new Float32Array(i.length*2);a.set(i),l.set(t);for(let u=0;u<o;u++)a[(o+u)*3]=i[u*3],a[(o+u)*3+1]=i[u*3+1],a[(o+u)*3+2]=-i[u*3+2],l[(o+u)*3]=t[u*3],l[(o+u)*3+1]=t[u*3+1],l[(o+u)*3+2]=-t[u*3+2];let c=new Uint32Array(e.length*2);c.set(e);for(let u=0;u<e.length;u+=3)c[e.length+u]=e[u]+o,c[e.length+u+1]=e[u+2]+o,c[e.length+u+2]=e[u+1]+o;let h=new Float32Array(n.length*2);h.set(n);for(let u=0;u<n.length;u+=3)h[n.length+u]=n[u],h[n.length+u+1]=n[u+1],h[n.length+u+2]=-n[u+2];let f=new Uint8Array(r.length*2);f.set(r),f.set(r,r.length);let d=new Float32Array(s.length*2);return d.set(s),d.set(s,s.length),{positions:a,normals:l,indices:c,lines:h,lineWeights:d,terms:f}}function ey(i,t,e,n,s,r,o){let a=new wi(Float32Array,4096),l=[],c=[];for(let p=0;p<Math.min(4,s);p++)for(let g=p+1;g<Math.min(4,s);g++)l.push(p),c.push(g);for(let p=4;p<s;p++)l.push(-1),c.push(p);let h=p=>{let g=p*s,_=0;for(let S=1;S<4;S++)e[g+S]<e[g+_]&&(_=S);return _},f=e.length/s,d=new Uint8Array(f),u=Math.max(r,o)*2;for(let p=0;p<f;p++){let g=0;for(let _=0;_<s;_++)Math.abs(e[p*s+_])<u&&g++;d[p]=g>=2?1:0}let m=[];for(let p=0;p<t.length;p+=3)(d[t[p]]||d[t[p+1]]||d[t[p+2]])&&m.push(p);let x=new Float64Array(6);for(let p=0;p<l.length;p++){let g=c[p],_=g>=4?o:r;for(let S=0;S<m.length;S++){let y=m[S],T=0;for(let A=0;A<3;A++){let v=t[y+A],b=t[y+(A===2?0:A+1)],D=l[p]<0?h(v):l[p],P=l[p]<0?h(b):l[p],I=e[v*s+D]-e[v*s+g],O=e[b*s+P]-e[b*s+g];if(I>0==O>0||I===O)continue;let V=I/(I-O),R=e[v*s+D]+(e[b*s+P]-e[v*s+D])*V;if(Math.abs(R)>_)continue;let B=v*s*3,G=b*s*3,N=0;for(let U=0;U<3;U++){let Y=n[B+D*3+U]+(n[G+P*3+U]-n[B+D*3+U])*V,tt=n[B+g*3+U]+(n[G+g*3+U]-n[B+g*3+U])*V;N+=Y*tt}if(N>$v)continue;let X=!1;for(let U=0;U<s&&!X;U++){if(U===D||U===P||U===g||l[p]<0&&U<4)continue;e[v*s+U]+(e[b*s+U]-e[v*s+U])*V<R-_*.25&&(X=!0)}X||(T<2&&(x[T*3]=i[v*3]+(i[b*3]-i[v*3])*V,x[T*3+1]=i[v*3+1]+(i[b*3+1]-i[v*3+1])*V,x[T*3+2]=i[v*3+2]+(i[b*3+2]-i[v*3+2])*V),T++)}T===2&&(a.push3(x[0],x[1],x[2]),a.push3(x[3],x[4],x[5]))}}return a.done()}function Dd(){return typeof performance<"u"&&performance.now?performance.now():Date.now()}var ny={right:{u:0,v:1,dirs:[[0,0,1]]},left:{u:0,v:1,dirs:[[0,0,-1]]},sides:{u:0,v:1,dirs:[[0,0,1],[0,0,-1]]},front:{u:2,v:1,dirs:[[1,0,0]]},back:{u:2,v:1,dirs:[[-1,0,0]]},top:{u:0,v:2,dirs:[[0,1,0]]},bottom:{u:0,v:2,dirs:[[0,-1,0]]}};function iy(i){return Od(i).map(t=>({m:t.full,t:t.origin}))}function sy(i,t,e){let n=!1,s=i.length/2;for(let r=0,o=s-1;r<s;o=r++){let a=i[r*2],l=i[r*2+1],c=i[o*2],h=i[o*2+1];l>e!=h>e&&t<(c-a)*(e-l)/(h-l)+a&&(n=!n)}return n}function Lh(i,t,e,n,s,r,o,a){let l=(u,m,x,p,g,_)=>(x-u)*(_-m)-(p-m)*(g-u),c=l(i,t,e,n,s,r),h=l(i,t,e,n,o,a),f=l(s,r,o,a,i,t),d=l(s,r,o,a,e,n);return c>0!=h>0&&f>0!=d>0}function ry(i,t){let e=Array.from(i),s=(t[2]-t[0])*(t[5]-t[1])-(t[4]-t[0])*(t[3]-t[1])>0?1:-1;for(let r=0;r<3&&e.length;r++){let o=t[r*2],a=t[r*2+1],l=t[(r+1)%3*2],c=t[(r+1)%3*2+1],h=(u,m)=>s*((l-o)*(m-a)-(c-a)*(u-o)),f=[],d=e.length/2;for(let u=0;u<d;u++){let m=e[u*2],x=e[u*2+1],p=e[(u+1)%d*2],g=e[(u+1)%d*2+1],_=h(m,x),S=h(p,g);if(_>=0&&f.push(m,x),_>=0!=S>=0){let y=_/(_-S);f.push(m+(p-m)*y,x+(g-x)*y)}}e=f}return e}function oy(i){let t=i.length/2;if(t<3)return[];let e=0;for(let l=0;l<t;l++){let c=(l+1)%t;e+=i[l*2]*i[c*2+1]-i[c*2]*i[l*2+1]}let n=e>0,s=[];for(let l=0;l<t;l++)s.push(l);let r=[],o=(l,c,h)=>(i[c*2]-i[l*2])*(i[h*2+1]-i[l*2+1])-(i[c*2+1]-i[l*2+1])*(i[h*2]-i[l*2]),a=0;for(;s.length>3&&a++<500;){let l=!1;for(let c=0;c<s.length;c++){let h=s[(c+s.length-1)%s.length],f=s[c],d=s[(c+1)%s.length],u=o(h,f,d);if(n?u<=1e-12:u>=-1e-12)continue;let m=!1;for(let x of s){if(x===h||x===f||x===d)continue;let p=o(h,f,x),g=o(f,d,x),_=o(d,h,x);if(n?p>0&&g>0&&_>0:p<0&&g<0&&_<0){m=!0;break}}if(!m){r.push(h,f,d),s.splice(c,1),l=!0;break}}if(!l){for(let c=1;c<s.length-1;c++)r.push(s[0],s[c],s[c+1]);return r}}return s.length===3&&r.push(s[0],s[1],s[2]),r}var Fd=new WeakMap;function ay(i){let t=[];for(let{mesh:a,shape:l}of i){if(!a||!a.positions||!a.positions.length)continue;let c=JSON.stringify([l.at||null,l.rot||null,l.repeat||null]),h=Fd.get(a);h||Fd.set(a,h=new Map);let f=h.get(c);if(!f){let d=iy(l),u=a.positions.length/3,m=new Float32Array(u*3*d.length),x=new Float32Array(u*3*d.length),p=new Uint8Array(u*d.length),g=new Uint32Array(a.indices.length*d.length),_=[1/0,1/0,1/0],S=[-1/0,-1/0,-1/0];d.forEach((y,T)=>{let A=y.m,v=y.t,b=a.positions,D=a.normals;for(let P=0;P<u;P++){let I=b[P*3],O=b[P*3+1],V=b[P*3+2],R=(T*u+P)*3;m[R]=A[0]*I+A[1]*O+A[2]*V+v[0],m[R+1]=A[3]*I+A[4]*O+A[5]*V+v[1],m[R+2]=A[6]*I+A[7]*O+A[8]*V+v[2];for(let X=0;X<3;X++)m[R+X]<_[X]&&(_[X]=m[R+X]),m[R+X]>S[X]&&(S[X]=m[R+X]);let B=D[P*3],G=D[P*3+1],N=D[P*3+2];x[R]=A[0]*B+A[1]*G+A[2]*N,x[R+1]=A[3]*B+A[4]*G+A[5]*N,x[R+2]=A[6]*B+A[7]*G+A[8]*N}p.set(a.terms,T*u);for(let P=0;P<a.indices.length;P++)g[T*a.indices.length+P]=a.indices[P]+T*u}),f={P:m,N:x,TM:p,I:g,lo:_,hi:S,cell:a.cell||1/0},h.set(c,f)}t.push(f)}if(t.length===1)return t[0];if(!t.length)return null;let e=t.reduce((a,l)=>a+l.P.length/3,0),n=t.reduce((a,l)=>a+l.I.length,0),s={P:new Float32Array(e*3),N:new Float32Array(e*3),TM:new Uint8Array(e),I:new Uint32Array(n),lo:[1/0,1/0,1/0],hi:[-1/0,-1/0,-1/0],cell:1/0},r=0,o=0;for(let a of t){s.P.set(a.P,r*3),s.N.set(a.N,r*3),s.TM.set(a.TM,r);for(let l=0;l<a.I.length;l++)s.I[o+l]=a.I[l]+r;for(let l=0;l<3;l++)s.lo[l]=Math.min(s.lo[l],a.lo[l]),s.hi[l]=Math.max(s.hi[l],a.hi[l]);s.cell=Math.min(s.cell,a.cell),r+=a.P.length/3,o+=a.I.length}return s}function Bd(i,t){let e=ny[t.face];if(!e||!Array.isArray(t.outline)||t.outline.length<3)return null;let n=ay(i);if(!n)return null;let{P:s,N:r,TM:o,I:a,lo:l,hi:c,cell:h}=n,f=Math.hypot(c[0]-l[0],c[1]-l[1],c[2]-l[2]),d=t.lift??Math.max(f*.0035,(Number.isFinite(h)?h:0)*.15),u=Number.isFinite(h)?h*.5:f/300,m=new wi(Float32Array,4096),x=new wi(Float32Array,4096),p=new wi(Float32Array,1024),{u:g,v:_}=e,S=[],y=t.wrap?e.dirs.slice(0,1):e.dirs;for(let V of y)S.push({dir:V,flip:!1});if(t.mirror&&(t.face==="front"||t.face==="back"||t.face==="top"||t.face==="bottom"))for(let V of y)S.push({dir:V,flip:!0});let T=new Float64Array(t.outline.length*2);t.outline.forEach((V,R)=>{T[R*2]=V[0],T[R*2+1]=V[1]});let A=Yl(T,Math.max(u,f/400)),v=s.length/3,b=new Int8Array(v),D=(V,R,B,G,N,X,U,Y)=>{let tt=(X-Y)*(B-U)+(U-N)*(G-Y);if(Math.abs(tt)<1e-12)return null;let vt=((X-Y)*(V-U)+(U-N)*(R-Y))/tt,Ft=((Y-G)*(V-U)+(B-U)*(R-Y))/tt;return[vt,Ft,1-vt-Ft]},P=(V,R,B,G)=>{let N=0,X=0,U=0,Y=0,tt=0,vt=0,Ft=[V,R,B];for(let lt=0;lt<3;lt++){let yt=Ft[lt]*3;Y+=s[yt]*G[lt],tt+=s[yt+1]*G[lt],vt+=s[yt+2]*G[lt],N+=r[yt]*G[lt],X+=r[yt+1]*G[lt],U+=r[yt+2]*G[lt]}let $=Math.hypot(N,X,U)||1;N/=$,X/=$,U/=$,m.push3(Y+N*d,tt+X*d,vt+U*d),x.push3(N,X,U)};for(let V of S){let R=Float64Array.from(A);if(V.flip)for(let mt=0;mt<R.length;mt+=2)g===2&&(R[mt]=-R[mt]),_===2&&(R[mt+1]=-R[mt+1]);let B=hs(R),G=V.dir;b.fill(-1);let N=32,X=(B.u1-B.u0)/N||1,U=(B.v1-B.v0)/N||1,Y=R.length/2,tt=new Array(N*N);for(let mt=0;mt<Y;mt++){let Q=R[mt*2],dt=R[mt*2+1],ut=R[(mt+1)%Y*2],pt=R[(mt+1)%Y*2+1],xt=Math.max(0,Math.floor((Math.min(Q,ut)-B.u0)/X)),At=Math.min(N-1,Math.floor((Math.max(Q,ut)-B.u0)/X)),Tt=Math.max(0,Math.floor((Math.min(dt,pt)-B.v0)/U)),$t=Math.min(N-1,Math.floor((Math.max(dt,pt)-B.v0)/U));for(let K=xt;K<=At;K++)for(let St=Tt;St<=$t;St++)(tt[K+St*N]||(tt[K+St*N]=[])).push(mt)}let vt=new Int32Array(Y).fill(-1),Ft=mt=>(b[mt]<0&&(b[mt]=sy(R,s[mt*3+g],s[mt*3+_])?1:0),b[mt]===1),$=[];for(let mt=0;mt<a.length;mt+=3){let Q=a[mt],dt=a[mt+1],ut=a[mt+2],pt=s[Q*3+g],xt=s[dt*3+g],At=s[ut*3+g],Tt=s[Q*3+_],$t=s[dt*3+_],K=s[ut*3+_];if(Math.max(pt,xt,At)<B.u0||Math.min(pt,xt,At)>B.u1||Math.max(Tt,$t,K)<B.v0||Math.min(Tt,$t,K)>B.v1||!t.wrap&&((r[Q*3]+r[dt*3]+r[ut*3])*G[0]+(r[Q*3+1]+r[dt*3+1]+r[ut*3+1])*G[1]+(r[Q*3+2]+r[dt*3+2]+r[ut*3+2])*G[2]<=.45||o[Q]>=4||o[dt]>=4||o[ut]>=4))continue;$.push(mt);let St=(Ft(Q)?1:0)+(Ft(dt)?1:0)+(Ft(ut)?1:0),F=!1,Ht=Y,Dt=Math.min(pt,xt,At),Bt=Math.max(pt,xt,At),ft=Math.min(Tt,$t,K),ee=Math.max(Tt,$t,K),wt=Math.max(0,Math.floor((Dt-B.u0)/X)),Rt=Math.min(N-1,Math.floor((Bt-B.u0)/X)),C=Math.max(0,Math.floor((ft-B.v0)/U)),w=Math.min(N-1,Math.floor((ee-B.v0)/U));for(let ot=wt;ot<=Rt&&!F;ot++)for(let bt=C;bt<=w&&!F;bt++){let Et=tt[ot+bt*N];if(Et)for(let rt=0;rt<Et.length&&!F;rt++){let ct=Et[rt];if(vt[ct]===mt)continue;vt[ct]=mt;let Ct=R[ct*2],z=R[ct*2+1],ht=R[(ct+1)%Ht*2],st=R[(ct+1)%Ht*2+1];Math.max(Ct,ht)<Dt||Math.min(Ct,ht)>Bt||Math.max(z,st)<ft||Math.min(z,st)>ee||(F=Lh(Ct,z,ht,st,pt,Tt,xt,$t)||Lh(Ct,z,ht,st,xt,$t,At,K)||Lh(Ct,z,ht,st,At,K,pt,Tt))}}if(!F&&St===3){P(Q,dt,ut,[1,0,0]),P(Q,dt,ut,[0,1,0]),P(Q,dt,ut,[0,0,1]);continue}if(!F&&St===0&&!ly(R[0],R[1],pt,Tt,xt,$t,At,K))continue;let q=ry(R,[pt,Tt,xt,$t,At,K]);if(q.length<6)continue;let gt=oy(q);for(let ot=0;ot<gt.length;ot+=3)for(let bt=0;bt<3;bt++){let Et=gt[ot+bt],rt=D(q[Et*2],q[Et*2+1],pt,Tt,xt,$t,At,K);P(Q,dt,ut,rt||[1/3,1/3,1/3])}}let lt=48,yt=(B.u1-B.u0)/lt||1,kt=(B.v1-B.v0)/lt||1,et=new Map;for(let mt of $){let Q=a[mt],dt=a[mt+1],ut=a[mt+2],pt=[s[Q*3+g],s[dt*3+g],s[ut*3+g]],xt=[s[Q*3+_],s[dt*3+_],s[ut*3+_]],At=Math.max(0,Math.floor((Math.min(...pt)-B.u0)/yt)),Tt=Math.min(lt-1,Math.floor((Math.max(...pt)-B.u0)/yt)),$t=Math.max(0,Math.floor((Math.min(...xt)-B.v0)/kt)),K=Math.min(lt-1,Math.floor((Math.max(...xt)-B.v0)/kt));for(let St=At;St<=Tt;St++)for(let F=$t;F<=K;F++){let Ht=St+F*lt,Dt=et.get(Ht);Dt||et.set(Ht,Dt=[]),Dt.push(mt)}}let Zt=(mt,Q)=>{let dt=Math.min(lt-1,Math.max(0,Math.floor((mt-B.u0)/yt))),ut=Math.min(lt-1,Math.max(0,Math.floor((Q-B.v0)/kt))),pt=et.get(dt+ut*lt);if(!pt)return null;for(let xt of pt){let At=a[xt],Tt=a[xt+1],$t=a[xt+2],K=D(mt,Q,s[At*3+g],s[At*3+_],s[Tt*3+g],s[Tt*3+_],s[$t*3+g],s[$t*3+_]);if(K&&K[0]>=-1e-6&&K[1]>=-1e-6&&K[2]>=-1e-6){let St=0,F=0,Ht=0,Dt=0,Bt=0,ft=0,ee=[At,Tt,$t];for(let C=0;C<3;C++)St+=s[ee[C]*3]*K[C],F+=s[ee[C]*3+1]*K[C],Ht+=s[ee[C]*3+2]*K[C],Dt+=r[ee[C]*3]*K[C],Bt+=r[ee[C]*3+1]*K[C],ft+=r[ee[C]*3+2]*K[C];let wt=Math.hypot(Dt,Bt,ft)||1,Rt=d*1.15;return[St+Dt/wt*Rt,F+Bt/wt*Rt,Ht+ft/wt*Rt]}}return null},Xt=R.length/2,at=null,jt=null;for(let mt=0;mt<Xt;mt++){let Q=R[mt*2],dt=R[mt*2+1],ut=R[(mt+1)%Xt*2],pt=R[(mt+1)%Xt*2+1],xt=Math.hypot(ut-Q,pt-dt),At=Math.max(1,Math.ceil(xt/u));for(let Tt=0;Tt<At;Tt++){let $t=Tt/At,K=Zt(Q+(ut-Q)*$t,dt+(pt-dt)*$t);K&&at&&(p.push3(at[0],at[1],at[2]),p.push3(K[0],K[1],K[2])),mt===0&&Tt===0&&(jt=K),at=K}}at&&jt&&(p.push3(at[0],at[1],at[2]),p.push3(jt[0],jt[1],jt[2]))}let I=m.done();if(!I.length&&!p.n)return null;let O=new Uint32Array(I.length/3);for(let V=0;V<O.length;V++)O[V]=V;return{positions:I,normals:x.done(),indices:O,lines:p.done(),triangles:O.length/3}}function ly(i,t,e,n,s,r,o,a){let l=(i-s)*(n-r)-(e-s)*(t-r),c=(i-o)*(r-a)-(s-o)*(t-a),h=(i-e)*(a-n)-(o-e)*(t-n),f=l<0||c<0||h<0,d=l>0||c>0||h>0;return!(f&&d)}var cy=64,hy=24*1024*1024,uy=["coarse","fine"],bn=new Map,go=new Set,Oh=new Set,Vi=[],Fh=null,Fn=null,Bh,us=!1,fy=0,zd=0,dy=()=>typeof Worker=="function"&&Bh!==null&&!us,py=()=>typeof window>"u"&&typeof process<"u"&&!!(process.versions&&process.versions.node),my=null;function Hd(i){Bh=i===null?null:String(i),Fn&&(Fn.terminate(),Fn=null)}function Wd(i){return Oh.add(i),()=>Oh.delete(i)}function Xd(){return go.size}function qd(){return!!Fn&&!us}var po={jobs:0,ms:0,byKind:{}};function Yd(i,t){if(!(t>=0))return;po.jobs++,po.ms+=t;let e=`${i.kind}-${i.level}`,n=po.byKind[e]||(po.byKind[e]={jobs:0,ms:0,max:0});n.jobs++,n.ms+=t,n.max=Math.max(n.max,t)}function Zd(){return JSON.parse(JSON.stringify({...po,cached:bn.size,worker:!!Fn&&!us}))}function Jl(i){return i>0?Math.round(Math.pow(2,Math.round(Math.log2(i)*2)/2)):0}var gy=i=>JSON.stringify([i.at||[0,0,0],i.rot||null,i.repeat||null]);function Jd(i,t,e=null){let n=Jl(t),s=`h:${fo(i)}@${n}`;return Kd(s,{kind:"hull",shape:i,scale:n},e)}function $d(i,t,e,n=null){let s=Jl(e),r=Array.isArray(t)?t:[],o=`p:${JSON.stringify([i.face,i.outline,i.mirror?1:0,i.wrap?1:0,i.lift??null])}|${r.map(a=>fo(a)+gy(a)).join("|")}@${s}`;return r.length?Kd(o,{kind:"panel",panel:i,hosts:r,scale:s},n):{key:o,mesh:null,level:null,done:!0}}function Kd(i,t,e){let n=bn.get(i);n&&(bn.delete(i),bn.set(i,n));let s=e==="coarse"||my==="coarse",r=e==="fine"&&!s;if(py()){let a=e==="coarse"?"coarse":"fine";return n&&n.done?{key:i,mesh:n.fine,level:"fine",done:!0}:((!n||n[a]===void 0)&&(n=zh(i,a,Qd({...t,level:a}))),{key:i,mesh:n[a],level:a,done:!0})}if(n&&n.done)return{key:i,mesh:n.fine,level:"fine",done:!0};let o=t.kind==="panel"&&t.hosts.every(a=>{let l=bn.get(`h:${fo(a)}@${t.scale}`);return l&&l.done});for(let a of uy)a==="coarse"&&(o||r)||a==="fine"&&s&&!o||n&&n[a]!==void 0||go.has(`${i}|${a}`)||(go.add(`${i}|${a}`),Vi.push({...t,key:i,level:a}));return _y(),n&&n.coarse?{key:i,mesh:n.coarse,level:"coarse",done:s&&!o}:{key:i,mesh:null,level:null,done:!1}}var kd=i=>(i.level==="coarse"?0:2)+(i.kind==="panel"?1:0);function zh(i,t,e){let n=bn.get(i);n||(n={coarse:void 0,fine:void 0,done:!1,bytes:0},bn.set(i,n)),n[t]=e||null,t==="fine"&&(n.done=!0,n.coarse=void 0),n.bytes=Gd(n.coarse)+Gd(n.fine);let s=0;for(let r of bn.values())s+=r.bytes;for(let[r,o]of bn){if(bn.size<=cy&&s<=hy)break;r!==i&&(s-=o.bytes,bn.delete(r))}return n}function Gd(i){if(!i)return 0;let t=0;for(let e of["positions","normals","indices","lines","lineWeights","terms"])i[e]&&(t+=i[e].byteLength);return t}function Qd(i){if(i.kind==="hull")return Dh(i.shape,{level:i.level,scale:i.scale});let t=i.hosts.map(e=>{let n=`h:${fo(e)}@${i.scale}`,s=bn.get(n),r=s&&(i.level==="fine"?s.fine:s.coarse??s.fine);return(r===void 0||i.level==="fine"&&!(s&&s.done))&&(r=Dh(e,{level:i.level,scale:i.scale}),s=zh(n,i.level,r)),{mesh:r,shape:e}});return Bd(t,i.panel)}function jd(i,t){go.delete(`${i.key}|${i.level}`);let e=bn.get(i.key);i.level==="coarse"&&e&&e.done||zh(i.key,i.level,t);for(let n of Array.from(Oh))try{n(i.key,i.level)}catch(s){console.warn("[jarvis] hull listener failed:",s&&s.message)}}var mo=new Map,Uh=!1;function _y(){Uh||(Uh=!0,queueMicrotask(()=>{Uh=!1,Vi.sort((i,t)=>kd(i)-kd(t)),Zl()}))}function Zl(){if(dy()&&xy()){for(;Vi.length;){let t=Vi.shift();if(Vd(t))continue;t.id=++fy;let e=t.kind==="hull"?{id:t.id,kind:"hull",shape:t.shape,level:t.level,scale:t.scale}:{id:t.id,kind:"panel",panel:t.panel,hosts:t.hosts,level:t.level,scale:t.scale};try{Fn.postMessage(e),mo.set(t.id,t)}catch{us=!0,Vi.unshift(t);break}}if(!us)return}if(Fh||!Vi.length)return;let i=Vi.shift();if(Vd(i)){Zl();return}Fh=i,clearTimeout(zd),zd=setTimeout(()=>{let t=null,e=performance.now();try{t=Qd(i)}catch(n){console.warn("[jarvis] hull mesh failed:",n&&n.message)}Yd(i,performance.now()-e),Fh=null,jd(i,t),Zl()},0)}function Vd(i){let t=bn.get(i.key);return t&&(t.done||t[i.level]!==void 0)?(go.delete(`${i.key}|${i.level}`),!0):!1}function xy(){if(Fn)return!0;let i=Bh;if(i===void 0)try{let t=document.querySelector('meta[name="jarvis-build"]'),e=t&&/^[0-9a-f]{8}$/.test(t.content||"")?t.content:"";i=new URL(`assets/hull-worker.js${e?`?v=${e}`:""}`,document.baseURI).href}catch{return!1}try{Fn=new Worker(i,{name:"jarvis-hull"})}catch{return us=!0,!1}return Fn.onmessage=t=>{let e=t.data||{},n=mo.get(e.id);n&&(mo.delete(e.id),Yd(n,e.ms),jd(n,e.mesh||null))},Fn.onerror=t=>{t&&t.preventDefault&&t.preventDefault(),us=!0;try{Fn.terminate()}catch{}Fn=null;let e=Array.from(mo.values());mo.clear(),Vi.unshift(...e),Zl()},!0}var vy=32,xo=Math.PI/180,kh=32,yy=40,My=48,Sy={x:["z","y"],y:["x","z"],z:["x","y"]},Wh=Object.freeze([3e5,6e5]),tp=Object.freeze([.12,.04]);function Xh(i){return i>=Wh[1]?2:i>=Wh[0]?1:0}function qh(i,t){if(!(t>0)||!i||i.type==="hull"||i.type==="panel")return 0;let e=fu({shapes:[i]}),n=e?Math.hypot(e.size[0],e.size[1],e.size[2]):0;return n<t*tp[1]?2:n<t*tp[0]?1:0}function op(i){return!!i&&(i.type==="loft"||i.type==="box"&&i.round>0||i.type==="lathe"&&!!i.smooth)}function ap(i,t,e){return{level:Math.max(Xh(t),qh(i,e)),hullMode:t>=Wh[1]?"coarse":null}}var ep={y:null,"-y":new fe().makeRotationX(Math.PI),x:new fe().makeRotationZ(-Math.PI/2),"-x":new fe().makeRotationZ(Math.PI/2),z:new fe().makeRotationX(Math.PI/2),"-z":new fe().makeRotationX(-Math.PI/2)},by={z:null,y:new fe().makeRotationX(Math.PI/2),x:new fe().makeRotationY(-Math.PI/2)};function wy(i){let t=new fe;if(!(i.type==="loft"||i.type==="hull"))if(i.type==="extrude"){let n=by[(i.axis||"z").replace("-","")];n&&t.copy(n)}else i.axis&&ep[i.axis]&&t.copy(ep[i.axis]);if(i.rot){let n=new fe().makeRotationFromEuler(new ei(i.rot[0]*xo,i.rot[1]*xo,i.rot[2]*xo,"XYZ"));t.premultiply(n)}let e=i.at||[0,0,0];return t.premultiply(new fe().makeTranslation(e[0],e[1],e[2])),t}function Ay(i){if(!i)return[new fe];let t=[];for(let e=0;e<i.count;e++){if(i.along){t.push(new fe().makeTranslation(i.along[0]*e,i.along[1]*e,i.along[2]*e));continue}let n=(i.start+i.step*e)*xo,s=i.around==="x"?new fe().makeRotationX(n):i.around==="z"?new fe().makeRotationZ(n):new fe().makeRotationY(n),r=i.center||[0,0,0],o=new fe().makeTranslation(r[0],r[1],r[2]).multiply(s).multiply(new fe().makeTranslation(-r[0],-r[1],-r[2]));t.push(o)}return t}function Gh(i,t,e,n=64,s="xz",r=Math.PI*2){let a=r>=Math.PI*2-1e-6?n:Math.max(2,Math.round(n*r/(Math.PI*2)));for(let l=0;l<a;l++){let c=l/a*r,h=(l+1)/a*r;s==="xz"?i.push(Math.cos(c)*t,e,Math.sin(c)*t,Math.cos(h)*t,e,Math.sin(h)*t):i.push(Math.cos(c)*t,Math.sin(c)*t,e,Math.cos(h)*t,Math.sin(h)*t,e)}return i}function Vh(i,t){for(let e=0;e<t.length-1;e++)i.push(t[e].x,t[e].y,t[e].z,t[e+1].x,t[e+1].y,t[e+1].z);return i}function fs(i){let t=new Fr(i,vy),e=Array.from(t.getAttribute("position").array);return t.dispose(),e}function np(i){return!!i.repeat&&i.repeat.count>12}function ip(i){let t=[0,1,2].sort((r,o)=>i[o]-i[r]),[e,n]=t,s=[];for(let r of[-1,1]){let o=[0,0,0],a=[0,0,0];o[e]=-i[e]/2,a[e]=i[e]/2,o[n]=a[n]=r*i[n]/2,s.push(...o,...a)}return s}function Ty(i,t){let e=1/0,n=-1/0,s=new Float64Array(i.length*2);i.forEach(([a,l],c)=>{s[c*2]=a,s[c*2+1]=l,e=Math.min(e,a,l),n=Math.max(n,a,l)});let r=Yl(s,(n-e)/60||1,t),o=[];for(let a=0;a<r.length;a+=2)o.push([r[a],r[a+1]]);return o}function Ey(i,t){let[e,n,s]=i.map(h=>h/2),r=t*(1-Math.SQRT1_2),o=[],a=[-(e-r),e-r],l=[-(n-r),n-r],c=[-(s-r),s-r];for(let h of l)for(let f of c)o.push(-(e-t),h,f,e-t,h,f);for(let h of a)for(let f of c)o.push(h,-(n-t),f,h,n-t,f);for(let h of a)for(let f of l)o.push(h,f,-(s-t),h,f,s-t);return o}function sp(i,t){let e=new ze;return e.setAttribute("position",new De(i instanceof Float32Array?i:new Float32Array(i),3)),e.setIndex(new De(t instanceof Uint32Array?t:Uint32Array.from(t),1)),e.computeVertexNormals(),e}function rp(i){let t=i&&i.lines?Array.from(i.lines):[],e=i&&i.lineWeights&&i.lineWeights.length===t.length/3?i.lineWeights:null;if(!i||!i.positions||!i.positions.length)return{geometry:null,lines:t,lineWeights:e};let n=new ze;return n.setAttribute("position",new De(i.positions,3)),n.setAttribute("normal",new De(i.normals,3)),n.setIndex(new De(i.indices,1)),{geometry:n,lines:t,lineWeights:e}}function Hh(i,t=0){let e=i.repeat?i.repeat.count:1,n=i.type==="loft"?Math.min(40,8+6*i.sections.length):40,s;if(e>16?s={N:16,M:Math.min(n,12),around:16,rows:8,lathe:24}:e>4?s={N:24,M:Math.min(n,20),around:20,rows:10,lathe:32}:s={N:40,M:n,around:32,rows:16,lathe:My},s.archSteps=12,s.ribGap=.03,t>0){let r=t>=2?.34:.6,o=(a,l)=>Math.max(l,4*Math.round(a*r/4));s={N:o(s.N,12),M:Math.max(6,Math.round(s.M*r)),around:o(s.around,12),rows:Math.max(6,2*Math.round(s.rows*r/2)),lathe:o(s.lathe,16),archSteps:t>=2?6:8,ribGap:t>=2?.2:.1}}return s}function Ry(i){let t=i.axis||"x",[e,n]=Sy[t];return{axis:t,cap:i.cap,arches:i.arches,sections:i.sections.map(s=>({s:s[t],c:[s[e]||0,s[n]||0],w:s.w,h:s.h,round:s.round??1,top:s.top,twist:s.twist,pts:s.pts}))}}function Cy(i,t){let e=t.level||0;switch(i.type){case"hull":{let n=Jd(i,t.scale||0,t.hullMode||null);return{...rp(n.mesh),asyncKey:n.key,level:n.mesh?n.level:null,done:n.done}}case"panel":{let n=t.hosts?t.hosts(i.on):[],s=$d(i,n,t.scale||0,t.hullMode||null);return{...rp(s.mesh),asyncKey:s.key,level:s.mesh?s.level:null,done:s.done}}case"loft":{let n=Hh(i,e),s=!!i.repeat&&i.repeat.count>6,r=Td(Ry(i),{N:n.N,M:n.M,archSteps:n.archSteps,ribGap:n.ribGap,ribs:!s,edges:s});return{geometry:sp(r.positions,r.indices),lines:r.lines,lineWeights:r.lineWeights}}case"box":{let[n,s,r]=i.size;if(i.round>0){let a=Hh(i,e),l=Ed(i.size,i.round,{around:a.around,rows:a.rows});return{geometry:sp(l.positions,l.indices),lines:np(i)?ip(i.size):l.lines}}if(i.r>0)return{geometry:new kl(n,s,r,3,i.r),lines:Ey(i.size,i.r)};let o=new ni(n,s,r);return{geometry:o,lines:np(i)?ip(i.size):fs(o)}}case"cylinder":{let n=i.sides||kh,s=i.r,r=i.r2??i.r,o=i.h;if(i.hole>0){let l=[new Nt(i.hole,-o/2),new Nt(s,-o/2),new Nt(r,o/2),new Nt(i.hole,o/2),new Nt(i.hole,-o/2)],c=new is(l,n);return{geometry:c,lines:fs(c)}}let a=new Gs(r,s,o,n,1,!1);return{geometry:a,lines:fs(a)}}case"cone":{let n=new Gs(0,i.r,i.h,i.sides||kh,1,!1);return{geometry:n,lines:fs(n)}}case"sphere":{let n=new qr(1,kh,16),s=i.size?i.size.map(o=>o/2):[i.r,i.r,i.r];n.scale(s[0],s[1],s[2]);let r=[];for(let o=0;o<64;o++){let a=o/64*Math.PI*2,l=(o+1)/64*Math.PI*2;r.push(Math.cos(a)*s[0],0,Math.sin(a)*s[2],Math.cos(l)*s[0],0,Math.sin(l)*s[2]),r.push(Math.cos(a)*s[0],Math.sin(a)*s[1],0,Math.cos(l)*s[0],Math.sin(l)*s[1],0)}return{geometry:n,lines:r}}case"torus":{let n=(i.arc||360)*xo,s=new Yr(i.r,i.tube,12,48,n);s.rotateX(-Math.PI/2);let r=[],o=a=>{let l=Math.max(8,Math.round(64*(n/(Math.PI*2))));for(let c=0;c<l;c++){let h=c/l*n,f=(c+1)/l*n;r.push(Math.cos(h)*a,0,-Math.sin(h)*a,Math.cos(f)*a,0,-Math.sin(f)*a)}};return o(i.r+i.tube),o(Math.max(0,i.r-i.tube)),{geometry:s,lines:r}}case"capsule":{let n=Math.max(0,i.h-2*i.r),s=new Dr(i.r,n,6,20,1),r=[];return Gh(r,i.r,n/2,40),Gh(r,i.r,-n/2,40),{geometry:s,lines:r}}case"lathe":{if(i.smooth){let r=Hh(i,e),{points:o,corners:a,given:l}=Rd(i.profile,8),c=new is(o.map(([m,x])=>new Nt(Math.max(0,m),x)),r.lathe),h=[],f=0,d=[0];for(let m=1;m<o.length;m++)d.push(f+=Math.hypot(o[m][0]-o[m-1][0],o[m][1]-o[m-1][1]));let u=-1/0;for(let m of Array.from(new Set([...a,...l])).sort((x,p)=>x-p)){let[x,p]=o[m];x<=1e-9||d[m]-u<f*.04&&!a.includes(m)||(Gh(h,x,p,64),u=d[m])}return{geometry:c,lines:h}}let n=i.profile.map(([r,o])=>new Nt(r,o)),s=new is(n,yy);return{geometry:s,lines:fs(s)}}case"extrude":{let n=i.smooth?Ty(i.outline,!0):i.outline,s=new Ws(n.map(([c,h])=>new Nt(c,h))),r=i.bevel||0,o=Math.max(i.depth-2*r,i.depth*.1),a=new Xr(s,{depth:o,bevelEnabled:r>0,bevelThickness:r,bevelSize:r,bevelOffset:-r,bevelSegments:3,curveSegments:4});a.translate(0,0,-o/2);let l;if(r>0){l=fs(a);for(let c of[-o/2,o/2]){let h=n.map(([f,d])=>new k(f,d,c));h.push(h[0].clone()),Vh(l,h)}}else l=fs(a);return{geometry:a,lines:l}}case"tube":{let n=i.path.map(([l,c,h])=>new k(l,c,h)),s=new Hs(n,!1,"centripetal"),r=Math.min(160,Math.max(12,n.length*10)),o=i.r2!==void 0?12:10,a=new Zr(s,r,i.r,o,!1);if(i.r2!==void 0&&i.r2!==i.r){let l=a.getAttribute("position"),c=new k,h=new k;for(let f=0;f<=r;f++){s.getPointAt(f/r,c);let d=(i.r+(i.r2-i.r)*f/r)/i.r;for(let u=0;u<=o;u++){let m=f*(o+1)+u;h.fromBufferAttribute(l,m).sub(c).multiplyScalar(d).add(c),l.setXYZ(m,h.x,h.y,h.z)}}a.computeVertexNormals()}return{geometry:a,lines:Vh([],s.getPoints(r))}}case"line":{let n=i.path.map(([s,r,o])=>new k(s,r,o));return{geometry:null,lines:Vh([],n)}}default:return{geometry:null,lines:[]}}}function ir(i,t={}){let{geometry:e,lines:n,lineWeights:s,asyncKey:r,level:o,done:a}=Cy(i,t||{}),l=i.type==="panel"?new fe:wy(i),c=i.type==="panel"?[new fe]:Ay(i.repeat),h=e,f=null,d=null,u=null;h&&(h.getAttribute("normal")||h.computeVertexNormals(),f=h.getAttribute("position"),d=h.getAttribute("normal"),u=h.getIndex());let m=f?f.count:0,x=u?u.count:m,p=n.length/3,g=new Float32Array(m*3*c.length),_=new Float32Array(m*3*c.length),S=new Uint32Array(x*c.length),y=new Float32Array(p*3*c.length),T=new k,A=new k,v=new he,b=new fe,D=1/0,P=-1/0;c.forEach((O,V)=>{b.multiplyMatrices(O,l),v.getNormalMatrix(b);let R=V*m;for(let N=0;N<m;N++)T.fromBufferAttribute(f,N).applyMatrix4(b),g[(R+N)*3]=T.x,g[(R+N)*3+1]=T.y,g[(R+N)*3+2]=T.z,T.y<D&&(D=T.y),T.y>P&&(P=T.y),A.fromBufferAttribute(d,N).applyMatrix3(v).normalize(),_[(R+N)*3]=A.x,_[(R+N)*3+1]=A.y,_[(R+N)*3+2]=A.z;let B=V*x;for(let N=0;N<x;N++)S[B+N]=R+(u?u.getX(N):N);let G=V*p;for(let N=0;N<p;N++)T.set(n[N*3],n[N*3+1],n[N*3+2]).applyMatrix4(b),y[(G+N)*3]=T.x,y[(G+N)*3+1]=T.y,y[(G+N)*3+2]=T.z,T.y<D&&(D=T.y),T.y>P&&(P=T.y)}),h&&h.dispose(),Number.isFinite(D)||(D=0,P=0);let I={positions:g,normals:_,indices:S,lines:y,vertexCount:m*c.length,lineVertexCount:p*c.length,minY:D,maxY:P};if(s&&s.length===p){let O=new Float32Array(p*c.length);for(let V=0;V<c.length;V++)O.set(s,V*p);I.lineWeights=O}return r&&(I.asyncKey=r,I.level=o,I.done=!!a,t&&t.hullMode&&(I.hullMode=t.hullMode)),I}function lp(i,t){let e=0,n=0,s=0;for(let f of i)e+=f.vertexCount,n+=f.indices.length,s+=f.lineVertexCount;let r=[1/0,1/0,1/0],o=[-1/0,-1/0,-1/0],a=f=>{for(let d=0;d<f.length;d+=3)for(let u=0;u<3;u++){let m=f[d+u];m<r[u]&&(r[u]=m),m>o[u]&&(o[u]=m)}},l=null;if(e>0){let f=new Float32Array(e*3),d=new Float32Array(e*3),u=new Float32Array(e),m=new Float32Array(e),x=e>65535?new Uint32Array(n):new Uint16Array(n),p=0,g=0;i.forEach((_,S)=>{f.set(_.positions,p*3),d.set(_.normals,p*3);let y=_.maxY-_.minY||1;for(let T=0;T<_.vertexCount;T++)u[p+T]=t[S],m[p+T]=(_.positions[T*3+1]-_.minY)/y;for(let T=0;T<_.indices.length;T++)x[g+T]=_.indices[T]+p;a(_.positions),p+=_.vertexCount,g+=_.indices.length}),l=new ze,l.setAttribute("position",new De(f,3)),l.setAttribute("normal",new De(d,3)),l.setAttribute("aBorn",new De(u,1)),l.setAttribute("aH",new De(m,1)),l.setIndex(new De(x,1)),l.computeBoundingSphere(),l.computeBoundingBox()}let c=null;if(s>0){let f=new Float32Array(s*3),d=new Float32Array(s),u=new Float32Array(s),m=new Float32Array(s).fill(1),x=0;i.forEach((p,g)=>{f.set(p.lines,x*3);let _=p.maxY-p.minY||1;for(let S=0;S<p.lineVertexCount;S++)d[x+S]=t[g],u[x+S]=(p.lines[S*3+1]-p.minY)/_;p.lineWeights&&m.set(p.lineWeights,x),a(p.lines),x+=p.lineVertexCount}),c=new ze,c.setAttribute("position",new De(f,3)),c.setAttribute("aBorn",new De(d,1)),c.setAttribute("aH",new De(u,1)),c.setAttribute("aW",new De(m,1)),c.computeBoundingSphere()}let h=Number.isFinite(r[0])?{min:r,max:o}:null;return{fill:l,lines:c,box:h,support:Iy(i)}}var _o=[];for(let i=-1;i<=1;i++)for(let t=-1;t<=1;t++)for(let e=-1;e<=1;e++)(i||t||e)&&_o.push([i,t,e]);function Iy(i){let t=new Float64Array(_o.length).fill(-1/0),e=new Float32Array(_o.length*3),n=s=>{for(let r=0;r<s.length;r+=3){let o=s[r],a=s[r+1],l=s[r+2];for(let c=0;c<_o.length;c++){let h=_o[c],f=o*h[0]+a*h[1]+l*h[2];f>t[c]&&(t[c]=f,e[c*3]=o,e[c*3+1]=a,e[c*3+2]=l)}}};for(let s of i)n(s.positions),n(s.lines);return Number.isFinite(t[0])?e:null}var Py=[16,30,48,72,104,144,196],Ly=[0,20,-20,42,-42,66,-66,95,-95,130,-130,180],up=Math.PI/180,Ny=.55,Dy=80,Fy=45,Uy=110,cp=26,Yh=(()=>{let i=[];for(let t of Py)for(let e of Ly)i.push({r:t,da:e*up,cost:t+Math.abs(e)*Ny});return i.sort((t,e)=>t.cost-e.cost),i})();function Oy(i){let t=2166136261,e=String(i);for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return(t>>>0)%360*up}function hp(i,t,e){let n=e+t.da,s=Math.cos(n),r=Math.sin(n),o=i.x+t.r*s,a=i.y+t.r*r,l=s>.38?o:s<-.38?o-i.w:o-i.w/2,c=r>.38?a:r<-.38?a-i.h:a-i.h/2;return{x:l,y:c}}function fp(i,t,e={}){let n=e.gap??3,s=e.center||{x:(t.left+t.right)/2,y:(t.top+t.bottom)/2},r=e.previous||null,o=e.avoid||[],a=e.maxCost??1/0,l=e.coverCost??Dy,c=i.filter(y=>Number.isFinite(y.x)&&Number.isFinite(y.y)&&y.w>0&&y.h>0).sort((y,T)=>(T.pinned?1:0)-(y.pinned?1:0)||T.priority-y.priority),h=[],f=[],d=[],u=new Map,m=(y,T,A,v,b)=>{if(y<t.left||T<t.top||y+A>t.right||T+v>t.bottom)return!1;let D=y-n,P=T-n,I=y+A+n,O=T+v+n;for(let V=0;V<h.length;V++){let R=h[V];if(D<R[2]&&I>R[0]&&P<R[3]&&O>R[1])return!1}for(let V=0;V<f.length;V++){let R=f[V];if(R[0]>y-2&&R[0]<y+A+2&&R[1]>T-2&&R[1]<T+v+2)return!1}return!(b.x>y-2&&b.x<y+A+2&&b.y>T-2&&b.y<T+v+2)},x=(y,T,A,v)=>{for(let b=0;b<o.length;b++){let D=o[b];if(y<D[2]&&y+A>D[0]&&T<D[3]&&T+v>D[1])return!1}return!0},p=c.map(y=>[y.x,y.y,y]),g=(y,T,A)=>{for(let v=0;v<p.length;v++){let[b,D,P]=p[v];if(P!==A&&b>y-2&&b<y+A.w+2&&D>T-2&&D<T+A.h+2)return!0}return!1},_=(y,T,A)=>[Math.min(Math.max(y.x,T),T+y.w),Math.min(Math.max(y.y,A),A+y.h)],S=(y,T,A)=>{let[v,b]=_(y,T,A);for(let D=0;D<d.length;D++)if(vo(y.x,y.y,v,b,d[D]))return!1;for(let D=0;D<d.length;D++)if(By(d[D],T-1,A-1,T+y.w+1,A+y.h+1))return!1;return!0};for(let y of c){if(!(y.x>=t.left-1&&y.x<=t.right+1&&y.y>=t.top-1&&y.y<=t.bottom+1)&&!y.pinned)continue;let A=y.x-s.x,v=y.y-s.y,b=Math.hypot(A,v)<6?Oy(y.id):Math.atan2(v,A),D=null,P=-1,I=r?r.get(y.id):void 0,O=y.pinned?1/0:a;for(let G=0;G<Yh.length;G++){let N=Yh[G],X=G===I?cp:0;if(N.cost-cp>=O)break;let U=hp(y,N,b);if(!m(U.x,U.y,y.w,y.h,y))continue;let Y=N.cost-X;Y>=O||(o.length&&!x(U.x,U.y,y.w,y.h)&&(Y+=l),!(Y>=O)&&(g(U.x,U.y,y)&&(Y+=Fy),!(Y>=O)&&(S(y,U.x,U.y)||(Y+=Uy),Y<O&&(O=Y,D=U,P=G))))}let V=!1;if(!D){if(!y.pinned)continue;let G=hp(y,Yh[2],b);G.x=Math.min(Math.max(G.x,t.left),Math.max(t.left,t.right-y.w)),G.y=Math.min(Math.max(G.y,t.top),Math.max(t.top,t.bottom-y.h)),D=G,P=2,V=!0}h.push([D.x,D.y,D.x+y.w,D.y+y.h]),f.push([y.x,y.y]);let[R,B]=_(y,D.x,D.y);d.push([y.x,y.y,R,B]),u.set(y.id,{x:D.x,y:D.y,w:y.w,h:y.h,slot:P,lx:R,ly:B,forced:V})}return u}function $l(i,t,e,n,s,r){return(e-i)*(r-t)-(n-t)*(s-i)}function vo(i,t,e,n,s){let[r,o,a,l]=s,c=$l(r,o,a,l,i,t),h=$l(r,o,a,l,e,n),f=$l(i,t,e,n,r,o),d=$l(i,t,e,n,a,l);return(c>0&&h<0||c<0&&h>0)&&(f>0&&d<0||f<0&&d>0)}function By(i,t,e,n,s){let[r,o,a,l]=i,c=(h,f)=>h>t&&h<n&&f>e&&f<s;return c(r,o)||c(a,l)?!0:vo(r,o,a,l,[t,e,n,e])||vo(r,o,a,l,[n,e,n,s])||vo(r,o,a,l,[t,s,n,s])||vo(r,o,a,l,[t,e,t,s])}var dp=`(1.0 + ${.35.toFixed(2)} * uPulse * sin(${4 .toFixed(1)} * uTime))`,pp=`
  float prog = clamp((uTime - vBorn) / uReveal, 0.0, 1.0);
  float sweep = prog * 1.15 - 0.075;
  if (vH > sweep) discard;
  float front = (1.0 - smoothstep(0.0, 0.09, sweep - vH)) * step(prog, 0.999);
`,mp=`
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uVis;
  uniform float uSel;
  uniform float uHover;
  uniform float uPulse;
  uniform float uTime;
  uniform float uReveal;
  uniform vec2 uFade;
  uniform float uScanY;
  uniform float uScanW;
  uniform float uFlicker;
  uniform float uRows;
`,gp=`
  attribute float aBorn;
  attribute float aH;
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    vH = aH;
    vBorn = aBorn;
    vDepth = -mv.z;
    vWY = wp.y;
    gl_Position = projectionMatrix * mv;
  }
`,_p=`
  ${mp}
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  void main() {
    ${pp}
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float facing = abs(dot(n, v));
    float rim = pow(1.0 - facing, 2.2);
    float fade = 1.0 - 0.58 * smoothstep(uFade.x, uFade.y, vDepth);
    float scan = exp(-pow((vWY - uScanY) / uScanW, 2.0));
    float rows = mix(0.87, 0.8 + 0.2 * step(1.5, mod(gl_FragCoord.y, 3.0)), uRows);
    float a = uAlpha * (0.14 + 1.35 * rim) * rows;
    a *= 1.0 + 1.1 * uSel + 0.5 * uHover;
    a += scan * 0.16 * uAlpha;
    a *= fade * uVis * uFlicker * ${dp};
    vec3 col = mix(uColor, vec3(0.86, 1.0, 1.0), clamp(0.1 + 0.45 * uSel + 0.3 * rim * rim, 0.0, 1.0));
    gl_FragColor = vec4(col * a + vec3(0.65, 1.0, 1.0) * front * 0.5 * uVis, 1.0);
  }
`,xp=`
  attribute float aBorn;
  attribute float aH;
  attribute float aW;
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  varying float vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vH = aH;
    vBorn = aBorn;
    vW = aW;
    vDepth = -mv.z;
    vWY = wp.y;
    gl_Position = projectionMatrix * mv;
  }
`,vp=`
  ${mp}
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  varying float vW;
  void main() {
    ${pp}
    float fade = 1.0 - 0.62 * smoothstep(uFade.x, uFade.y, vDepth);
    float scan = exp(-pow((vWY - uScanY) / uScanW, 2.0));
    float a = uAlpha * vW * fade * uVis * uFlicker * (1.0 + 0.8 * uSel + 0.45 * uHover) * ${dp};
    a += (scan * 0.22 + front) * uVis;
    vec3 col = mix(uColor, vec3(0.9, 1.0, 1.0), clamp(0.28 + 0.55 * uSel + 0.25 * uHover, 0.0, 1.0));
    gl_FragColor = vec4(col * a, 1.0);
  }
`,yp=`
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`,Mp=`
  uniform vec2 uRes;
  uniform vec2 uCenter;
  void main() {
    vec2 p = (gl_FragCoord.xy - uCenter) / uRes.y;
    float d = length(p * vec2(0.85, 1.0));
    vec3 inner = vec3(0.028, 0.078, 0.118);
    vec3 outer = vec3(0.008, 0.016, 0.027);
    vec3 col = mix(inner, outer, smoothstep(0.0, 0.9, d));
    col += vec3(0.0, 0.03, 0.045) * (1.0 - smoothstep(0.0, 0.32, d));
    gl_FragColor = vec4(col, 1.0);
  }
`,Sp=`
  uniform vec3 uCenterW;
  varying vec2 vP;
  varying float vDepth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xz - uCenterW.xz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`,bp=`
  uniform float uCell;
  uniform float uR;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uVis;
  uniform float uGrid;
  uniform vec2 uFade;
  varying vec2 vP;
  varying float vDepth;
  float grid(vec2 p, float cell) {
    vec2 q = p / cell;
    vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    float r = length(vP);
    float fw = max(fwidth(r), 1e-5);
    float fadeR = 1.0 - smoothstep(uR * 0.35, uR * 1.4, r);
    float g = grid(vP, uCell) * 0.09 + grid(vP, uCell * 5.0) * 0.15;
    float ring = 1.0 - smoothstep(0.0, fw * 1.6, abs(r - uR));
    float ring2 = 1.0 - smoothstep(0.0, fw * 1.3, abs(r - uR * 1.075));
    float ang = atan(vP.y, vP.x) / 6.2831853;
    float dash = step(0.42, fract(ang * 96.0 + uTime * 0.6));
    float arc = abs(fract(ang * 36.0 + 0.5) - 0.5) * 6.2831853 / 36.0 * r;
    float tick = (1.0 - smoothstep(0.0, fw * 1.4, arc)) * step(uR * 1.012, r) * step(r, uR * 1.05);
    float glow = (1.0 - smoothstep(0.0, uR, r)) * 0.07;
    float fade = 1.0 - 0.45 * smoothstep(uFade.x, uFade.y, vDepth);
    float a = (g * fadeR * uGrid + ring * 0.5 + ring2 * dash * 0.3 * uGrid + tick * 0.38 + glow) * fade * uVis;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;var Zh="http://www.w3.org/2000/svg",Be=Math.PI/180,ds=32,wp=2,Jh=.75,zy=950,Ap=750,ky=7,$h=7e3,Gy=12e4,Vy=30,Hy=5,Wy=10,Tp=34e3,Xy=15e3,qy=8,Yy=300,Ep=.5,Zy=.1,Jy=.15,$y=12e4,Ky=65,Rp=.6,Qy=/\b(?:cover|case|casing|housing|shell|lid|cowl|cowling|can|sleeve)s?\b(?!\s+[a-z])/i,Cp={primary:{color:[.243,.878,1],fill:.2,line:.6},secondary:{color:[.22,.58,1],fill:.1,line:.4},accent:{color:[.62,.96,1],fill:.26,line:.85},warning:{color:[1,.69,.27],fill:.26,line:.8}},Un={front:[90,80],back:[-90,80],right:[0,80],left:[180,80],top:[0,.6],bottom:[0,179.4],"front-left":[135,66],"front-right":[45,66],"back-left":[-135,66],"back-right":[-45,66]},_n=()=>{},jy=[["vis","visGoal"],["fillK","fillKGoal"],["sel","selGoal"],["hov","hovGoal"],["pulse","pulseGoal"]];function Ip(i){return i<.5?4*i*i*i:1-Math.pow(-2*i+2,3)/2}function Pp(i){let t=Math.PI*2;return i%=t,i>Math.PI&&(i-=t),i<-Math.PI&&(i+=t),i}function tM(i){if(!(i>0))return 1;let t=Math.pow(10,Math.floor(Math.log10(i))),e=i/t;return(e<1.5?1:e<3.5?2:e<7.5?5:10)*t}function eM(i,t){let e=Math.sin(t);return[e*Math.sin(i),Math.cos(t),e*Math.cos(i)]}function Kh(i,t=0){if(!Array.isArray(i)||i.length!==3||!i.every(s=>Number.isFinite(s)))return null;let e=Math.hypot(i[0],i[1],i[2]);if(!(e>1e-9))return null;let n=Math.min(180-Rp,Math.max(Rp,Math.acos(Math.max(-1,Math.min(1,i[1]/e)))/Be))*Be;return[Math.hypot(i[0],i[2])>e*1e-9?Math.atan2(i[0],i[2]):t,n]}function nM(i,t=ui){let e=Un[t]||Un[ui],n=eM(e[0]*Be,e[1]*Be),s=Array.isArray(i)?Math.hypot(i[0],i[1],i[2]):0;if(!(s>1e-9))return null;let r=[i[0]/s,i[1]/s,i[2]/s],o=r[0]*n[0]+r[1]*n[1]+r[2]*n[2];if(o<-.999999){n=[n[0],n[1]+.25,n[2]];let f=Math.hypot(n[0],n[1],n[2]);n=n.map(d=>d/f),o=r[0]*n[0]+r[1]*n[1]+r[2]*n[2]}let a=Math.acos(Math.max(-1,Math.min(1,o)));if(a<1e-6)return Kh(r,e[0]*Be);let l=Math.min(a,Ky*Be),c=Math.sin(a-l)/Math.sin(a),h=Math.sin(l)/Math.sin(a);return Kh([0,1,2].map(f=>r[f]*c+n[f]*h),e[0]*Be)}function iM(i){let t=Array.isArray(i)?i.filter(Boolean):[],e=t.some(s=>s.tone==="secondary"),n=new Set;for(let s of t){let r=[s.name,...Array.isArray(s.aka)?s.aka:[]];(e?s.tone==="secondary":r.some(o=>Qy.test(String(o||""))))&&n.add(s.id)}return n}function sM(i,t,e=window){let n=null;try{n=e.matchMedia?e.matchMedia(i):null}catch{n=null}if(!n)return{matches:!1,off:_n};let s=()=>t(n.matches);return n.addEventListener?n.addEventListener("change",s):n.addListener&&n.addListener(s),{get matches(){return n.matches},off(){n.removeEventListener?n.removeEventListener("change",s):n.removeListener&&n.removeListener(s)}}}var Kl=new Set,ps=null;function rM(i){if(Kl.add(i),!ps&&typeof MutationObserver=="function")try{ps=new MutationObserver(()=>{for(let t of Array.from(Kl))t()}),ps.observe(document.documentElement,{subtree:!0,attributes:!0,attributeFilter:["inert"]})}catch{ps=null}return()=>{Kl.delete(i),!Kl.size&&ps&&(ps.disconnect(),ps=null)}}function oM(i,t,e,n=document){let s=n.createElement(i);return t&&(s.className=t),e!==void 0&&(s.textContent=e),s}function Y1(i,t={}){let e={onSelect:_n,onState:_n,labels:!0,autoRotate:void 0,reveal:!0,insets:null,maxDpr:wp,...t};e.hullWorker!==void 0&&Hd(e.hullWorker);let n=i&&i.ownerDocument||document,s=n.defaultView||window,r=s!==window,o=(M,L,W)=>oM(M,L,W,n),a=o("div","holo"),l=o("canvas","holo__canvas");l.setAttribute("role","img"),l.setAttribute("aria-label","Hologram");let c=n.createElementNS(Zh,"svg");c.setAttribute("class","holo__leaders"),c.setAttribute("aria-hidden","true");let h=o("div","holo__labels");h.setAttribute("aria-hidden","true");let f=o("div","holo__notice");f.hidden=!0;let d=o("p","holo__notice-text"),u=o("button","holo__notice-btn","Restart 3D view");u.type="button",u.hidden=!0,f.append(d,u),a.append(l,c,h,f),i.append(a);let m=null;function x(){let M=new Ol({canvas:l,antialias:e.antialias!==!1,alpha:!1,depth:!1,stencil:!1,powerPreference:"default",preserveDrawingBuffer:!1});return M.setClearColor(132619,1),M.autoClear=!0,M}try{m=x()}catch{m=null}if(!m)return d.textContent="This device could not start the 3D view.",f.hidden=!1,queueMicrotask(()=>e.onState({ready:!1,error:"webgl"})),aM(a);let p=new Er,g=new hn(ds,1,1,1e6),_=new Qn;p.add(_);let S={uTime:{value:0},uReveal:{value:Jh},uFade:{value:new Nt(1,2)},uScanY:{value:0},uScanW:{value:1},uFlicker:{value:1},uRows:{value:1}},y=new ze;y.setAttribute("position",new De(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));let T=new mn({uniforms:{uRes:{value:new Nt(1,1)},uCenter:{value:new Nt(.5,.5)}},vertexShader:yp,fragmentShader:Mp,depthTest:!1,depthWrite:!1}),A=new Mn(y,T);A.frustumCulled=!1,A.renderOrder=-10,p.add(A);let v=new ss(1,1);v.rotateX(-Math.PI/2);let b=new mn({uniforms:{uCell:{value:1},uR:{value:1},uColor:{value:new k(.24,.82,1)},uTime:S.uTime,uVis:{value:0},uGrid:{value:1},uFade:S.uFade,uCenterW:{value:new k}},vertexShader:Sp,fragmentShader:bp,transparent:!0,depthTest:!1,depthWrite:!1,blending:Js,side:Sn}),D=!0,P=new Mn(v,b);P.frustumCulled=!1,P.renderOrder=-5,P.visible=!1,p.add(P);let I=new Map,O=null,V=!1,R=!1,B=!1,G=!1,N=0,X=0,U=1,Y=1,tt=0,vt=0,Ft={top:0,right:0,bottom:0,left:0,...e.insets||{}},$=sM("(prefers-reduced-motion: reduce)",()=>{$.matches&&!kt&&(yt=!1),Kt(),Ne(),Ve()},s),lt=e.labels!==!1,yt=e.autoRotate!==!1&&!$.matches,kt=!1,et={target:new k,radius:10,theta:135*Be,phi:66*Be},Zt=ui,Xt=null,at="auto",jt=null,mt={theta:0,phi:0},Q=e.rotateAfterMs>0?performance.now()-$h+e.rotateAfterMs:-1/0,dt=performance.now(),ut=1,pt=0,xt=0,At=null,Tt=!1,$t=null,K=null,St=null,F=null,Ht=0,Dt=new Map,Bt=null,ft=null,ee=null,wt=!1,Rt=!1,C=performance.now(),w=()=>(performance.now()-C)/1e3,q={frames:0,shapesBuilt:0,shapesRebuilt:0,partsCreated:0,labelMs:0,hullUpgrades:0,hullRescaled:0,detailRebuilt:0},gt=-1/0;function ot(M){return Cp[M]||Cp.primary}function bt(M){let L=ot(M),W=()=>({uColor:{value:new k(...L.color)},uVis:{value:1},uSel:{value:0},uHover:{value:0},uPulse:{value:0},uTime:S.uTime,uReveal:S.uReveal,uFade:S.uFade,uScanY:S.uScanY,uScanW:S.uScanW,uFlicker:S.uFlicker,uRows:S.uRows}),Z={transparent:!0,depthTest:!1,depthWrite:!1,blending:Js},_t=new mn({...Z,side:Sn,uniforms:{...W(),uAlpha:{value:L.fill}},vertexShader:gp,fragmentShader:_p}),Mt=new mn({...Z,uniforms:{...W(),uAlpha:{value:L.line}},vertexShader:xp,fragmentShader:vp});return{fill:_t,line:Mt}}function Et(M){let L=new Qn;L.name=M.id;let W=bt(M.tone),Z={key:M.key,part:M,group:L,mats:W,fill:null,lines:null,chunks:[],born:[],box:null,center:new k,size:0,autoOffset:new k,vis:1,visGoal:1,fillK:1,fillKGoal:1,sel:0,selGoal:0,hov:0,hovGoal:0,pulse:0,pulseGoal:0,label:null};return _.add(L),I.set(M.key,Z),q.partsCreated++,j(Z),Z}function rt(){let M=O?du(O):null;return M?Jl(Math.hypot(M.size[0],M.size[1],M.size[2])):0}function ct(M){for(let L of I.values())if(L.part.id===M)return L.part.shapes.filter(W=>W.type==="hull");return[]}function Ct(M,L,W){return{level:M||0,hullMode:L||null,scale:W||0,hosts:ct}}function z(){let M=0;for(let L of I.values())for(let W of L.chunks)M+=W.chunk.indices.length/3;return M}function ht(M,L,W,Z,_t){let Mt=L.map(it=>JSON.stringify(it)),Lt=0;for(;Lt<M.chunks.length&&Lt<Mt.length&&M.chunks[Lt].sig===Mt[Lt];)Lt++;if(Lt===M.chunks.length&&Lt===Mt.length)return!1;q.shapesRebuilt+=M.chunks.length-Lt,M.chunks.length=Lt,M.born.length=Lt;let It=_t.size();for(let it=Lt;it<L.length;it++){let se=z(),{level:Jt,hullMode:pe}=ap(L[it],se,It),Se=ir(L[it],Ct(Jt,pe,It));M.chunks.push({sig:Mt[it],chunk:Se,lod:Jt,lodBudget:Xh(se),scale:It,wait:null}),q.shapesBuilt++;let de=W+Z*(it-Lt);M.born.push(de),de>gt&&(gt=de)}return Xe(M),!0}let st=new Set,Ot=0;function Ut(M){B||(st.add(M),Ot||(Ot=s.setTimeout(zt,30)))}function zt(){Ot=0;let M=new Set(st);st.clear(),re(M)}function re(M){if(B)return;let L=ie(),W=!1,Z=!1;for(let Lt of I.values())Lt.box&&(Z=!0);let _t=w(),Mt=e.reveal!==!1&&!$.matches;for(let Lt of I.values()){let It=!1;Lt.chunks.forEach((it,se)=>{let Jt=Lt.part.shapes[se];if(!Jt)return;if(it.wait&&M.has(it.wait.key)){let de=ir(Jt,Ct(it.lod,it.wait.mode,it.wait.scale));if(de.level!==it.wait.level)return;let ve=it.chunk.vertexCount||it.chunk.lineVertexCount,Ue=de.vertexCount||de.lineVertexCount;if(ve&&!Ue){it.wait=null;return}!ve&&Ue&&(Lt.born[se]=Mt?_t:-1e4,Lt.born[se]>gt&&(gt=Lt.born[se])),it.chunk=de,it.scale=it.wait.scale,it.wait=null,q.hullRescaled++,It=!0;return}if(!it.chunk.asyncKey||!M.has(it.chunk.asyncKey)||it.chunk.done)return;let pe=!it.chunk.vertexCount&&!it.chunk.lineVertexCount,Se=ir(Jt,Ct(it.lod,it.chunk.hullMode,it.scale));Se.level===it.chunk.level&&Se.done===it.chunk.done||(it.chunk=Se,q.hullUpgrades++,pe&&(Se.vertexCount||Se.lineVertexCount)&&(Lt.born[se]=Mt?_t:-1e4,Lt.born[se]>gt&&(gt=Lt.born[se])),It=!0)}),It&&(Xe(Lt),W=!0)}W?(sr(),qt(),!Z&&I.size&&at!=="user"?xs():I.size&&(at==="auto"||at==="part")&&Ti(!0),Ne(),Ve()):L&&!ie()&&Ve(),ie()||Ce()}let ge=Wd(Ut);function Pt(){let M={hulls:0,panels:0,pending:0,empty:0,coarse:0};for(let L of I.values())L.chunks.forEach((W,Z)=>{if(!W.chunk.asyncKey)return;(L.part.shapes[Z]&&L.part.shapes[Z].type)==="hull"?M.hulls++:M.panels++,W.chunk.done||M.pending++,!W.chunk.vertexCount&&!W.chunk.lineVertexCount&&M.empty++,W.chunk.level==="coarse"&&M.coarse++});return M}function ie(){for(let M of I.values())for(let L of M.chunks)if(L.chunk.asyncKey&&!L.chunk.done||L.wait)return!0;return!1}function me(M){if(M>0)for(let L of I.values()){let W=!1;L.chunks.forEach((Z,_t)=>{let Mt=L.part.shapes[_t];if(!Mt)return;if(Z.chunk.asyncKey){if(Z.scale===M||Z.wait&&Z.wait.scale===M)return;let It=Z.chunk.hullMode==="coarse"?"coarse":"fine",it=ir(Mt,Ct(Z.lod,It,M));it.level===It&&it.done?(Z.chunk=it,Z.scale=M,Z.wait=null,q.hullRescaled++,W=!0):Z.wait={key:it.asyncKey,scale:M,mode:It,level:It};return}if(!op(Mt))return;let Lt=Math.max(Z.lodBudget||0,qh(Mt,M));Lt!==Z.lod&&(Z.chunk=ir(Mt,Ct(Lt,null,M)),Z.lod=Lt,Z.scale=M,q.detailRebuilt++,W=!0)}),W&&Xe(L)}}let Wt=[];function Ce(){let M=Wt;Wt=[];for(let L of M)L(!0)}function Xe(M){let L=lp(M.chunks.map(W=>W.chunk),M.born);if(L.fill?M.fill?(M.fill.geometry.dispose(),M.fill.geometry=L.fill):(M.fill=new Mn(L.fill,M.mats.fill),M.fill.userData.rec=M,M.fill.frustumCulled=!1,M.group.add(M.fill)):M.fill&&(M.fill.geometry.dispose(),M.group.remove(M.fill),M.fill=null),L.lines?M.lines?(M.lines.geometry.dispose(),M.lines.geometry=L.lines):(M.lines=new Ir(L.lines,M.mats.line),M.lines.frustumCulled=!1,M.group.add(M.lines)):M.lines&&(M.lines.geometry.dispose(),M.group.remove(M.lines),M.lines=null),M.box=L.box,M.support=L.support,M.box){let{min:W,max:Z}=M.box;M.center.set((W[0]+Z[0])/2,(W[1]+Z[1])/2,(W[2]+Z[2])/2),M.size=Math.hypot(Z[0]-W[0],Z[1]-W[1],Z[2]-W[2])/2}}function On(M){M.fill&&M.fill.geometry.dispose(),M.lines&&M.lines.geometry.dispose(),M.mats.fill.dispose(),M.mats.line.dispose(),_.remove(M.group),M.label&&(M.label.el.remove(),M.label.line.remove(),M.label.dot.remove()),Dt.delete(M.key)}function yo(M,L){let W=ot(L);M.mats.fill.uniforms.uColor.value.set(...W.color),M.mats.line.uniforms.uColor.value.set(...W.color),M.mats.fill.uniforms.uAlpha.value=W.fill,M.mats.line.uniforms.uAlpha.value=W.line}function ms(M,L){let W=M.part.anchor;return W?L.set(W[0],W[1],W[2]):L.copy(M.center),L.add(M.group.position)}function Mo(M,{final:L}){let W=I.size===0;O=M,l.setAttribute("aria-label",M.title?`Hologram of ${M.title}, ${M.parts.length} parts`:"Hologram");let Z=w(),_t=e.reveal!==!1&&!$.matches,Mt=new Set,Lt=M.parts.reduce((de,ve)=>de+(I.has(ve.key)?0:ve.shapes.length),0),It=_t&&Lt>1&&!V?Math.min(.045,1.6/Lt):0,it=_t?Z:-1e4,se=!1,Jt=null,pe={size:()=>Jt===null?Jt=rt():Jt};for(let de of M.parts){Mt.add(de.key);let ve=I.get(de.key);if(ve?(ve.part.tone!==de.tone&&yo(ve,de.tone),ve.part=de,ve.group.name=de.id):(ve=Et(de),se=!0),Vt(ve),de.shapes.length){let Ue=ve.chunks.length;ht(ve,de.shapes,it,It,pe)&&(se=!0),It&&(it+=It*Math.max(0,de.shapes.length-Ue))}}if(L){for(let[de,ve]of Array.from(I))Mt.has(de)||(On(ve),I.delete(de),se=!0);me(pe.size()),K&&!I.has(K)&&(K=null),F&&!I.has(F)&&(F=null)}let Se=M.view||ui;W&&I.size?(E(Se),$t=Se,at="auto"):I.size&&!Tt&&Se!==$t&&($t=Se,H(Se,!0,!1)),sr(),qt(),se&&I.size&&(W?xs():at==="auto"&&Ti(!0)),Kt(),Ne(),Ve(),Wt.length&&!ie()&&Ce()}function sr(){let M=Bn();if(!M)return;let L=new k((M.min[0]+M.max[0])/2,(M.min[1]+M.max[1])/2,(M.min[2]+M.max[2])/2),W=Math.max(1e-6,Math.hypot(M.max[0]-M.min[0],M.max[1]-M.min[1],M.max[2]-M.min[2])/2);for(let Z of I.values()){if(Z.part.explode||!Z.box){Z.autoOffset.set(0,0,0);continue}let _t=Z.center.clone().sub(L),Mt=_t.length();Mt<W*.05?Z.autoOffset.set(0,0,0):Z.autoOffset.copy(_t.multiplyScalar(W*.5/Mt))}}function Ai(M,L,W){let Z=M.part.explode;return Z?W.set(Z[0]*L,Z[1]*L,Z[2]*L):W.copy(M.autoOffset).multiplyScalar(L)}function Bn(){return Hi(0,!1)}function gs(M,L){return L?typeof L=="string"?M.key===L:L.has(M.key):F&&M.key!==F?!1:!Bt||M.visGoal>0}function Hi(M,L=!0,W=null){let Z=[1/0,1/0,1/0],_t=[-1/0,-1/0,-1/0],Mt=new k;for(let Lt of I.values())if(Lt.box&&!((W||L)&&!gs(Lt,W))){Ai(Lt,M,Mt);for(let It=0;It<3;It++){let it=It===0?Mt.x:It===1?Mt.y:Mt.z;Lt.box.min[It]+it<Z[It]&&(Z[It]=Lt.box.min[It]+it),Lt.box.max[It]+it>_t[It]&&(_t[It]=Lt.box.max[It]+it)}}return Number.isFinite(Z[0])?{min:Z,max:_t}:null}function Wi(M=N,L=X,W=Ft){let Z=Math.min(W.left||0,M*.45),_t=Math.min(W.right||0,M*.45),Mt=Math.min(W.top||0,L*.4),Lt=Math.min(W.bottom||0,Math.max(0,L*.66-Mt));return{left:Z,right:_t,top:Mt,bottom:Lt,w:Math.max(1,M-Z-_t),h:Math.max(1,L-Mt-Lt)}}function _s(M,L,W=X,Z=Wi()){let _t=(M.min[0]+M.max[0])/2,Mt=(M.min[1]+M.max[1])/2,Lt=(M.min[2]+M.max[2])/2,It=(M.max[0]-M.min[0])/2,it=(M.max[1]-M.min[1])/2,se=(M.max[2]-M.min[2])/2,Jt=Math.max(1e-6,Math.hypot(It,se)),pe=Math.tan(ds*Be/2),Se=.9,de=Jt*W/(pe*Z.w*Se),Ue=(it*Math.sin(L)+Jt*Math.abs(Math.cos(L)))*W/(pe*Z.h*Se),ci=Math.max(de,Ue)+Jt*.3;return{target:new k(_t,Mt,Lt),radius:ci,rxz:Jt}}function rr(M,L,W=pt,Z=null,_t=X,Mt=Wi()){let Lt=Math.sin(L),It=new k(Lt*Math.sin(M),Math.cos(L),Lt*Math.cos(M)),it=new k().crossVectors(new k(0,1,0),It);it.lengthSq()<1e-8&&it.set(Math.cos(M),0,-Math.sin(M)),it.normalize();let se=new k().crossVectors(It,it).normalize(),Jt=[],pe=new k;for(let tn of I.values()){if(!tn.box||!gs(tn,Z))continue;Ai(tn,W,pe);let Ze=tn.support;if(Ze)for(let an=0;an<Ze.length;an+=3)Jt.push(new k(Ze[an]+pe.x,Ze[an+1]+pe.y,Ze[an+2]+pe.z));else{let{min:an,max:ur}=tn.box;for(let Ci=0;Ci<8;Ci++)Jt.push(new k(Ci&1?ur[0]:an[0],Ci&2?ur[1]:an[1],Ci&4?ur[2]:an[2]).add(pe))}}if(!Jt.length)return null;let Se=1/0,de=-1/0,ve=1/0,Ue=-1/0;for(let tn of Jt){let Ze=tn.dot(it),an=tn.dot(se);Ze<Se&&(Se=Ze),Ze>de&&(de=Ze),an<ve&&(ve=an),an>Ue&&(Ue=an)}let ci=(Se+de)/2,hi=(ve+Ue)/2,ys=0;for(let tn of Jt)ys+=tn.dot(It);ys/=Jt.length;let Io=it.clone().multiplyScalar(ci).addScaledVector(se,hi).addScaledVector(It,ys),oe=_t/(2*Math.tan(ds*Be/2)),ue=.88,on=Mt.w/2*ue,vn=Mt.h/2*ue,je=0,zn=0;for(let tn of Jt){let Ze=tn.clone().sub(Io),an=Math.abs(Ze.dot(it)),ur=Math.abs(Ze.dot(se)),Ci=Ze.dot(It);je=Math.max(je,Ci+an*oe/on,Ci+ur*oe/vn),zn=Math.max(zn,Math.hypot(Ze.x,Ze.z))}return{target:Io,radius:Math.max(je,1e-6),rxz:Math.max(zn,1e-6)}}function So(M){return M.radius=Math.max(M.radius*1.25,ut*.3),M}function Xi(){if(at!=="part"||!jt)return null;let M=!0;for(let W of jt)I.has(W)||(M=!1);if(M)return jt;let L=new Set(Array.from(jt).filter(W=>I.has(W)));return L.size?L:null}function wn(M=Yi()?"orbit":"view",L=et.theta,W=et.phi){let Z=Xi(),_t;if(M==="orbit"){let Mt=Hi(pt,!0,Z);_t=Mt?_s(Mt,W):null}else _t=rr(L,W,pt,Z);return _t&&Z&&So(_t),_t}function xs(){if(or())return;let M=wn();M&&(et.target.copy(M.target),et.radius=M.radius,Xt=null,ut=Math.max(ut,M.rxz))}function Ti(M){if(or())return;let L=Xt&&Xt.to?Xt.to:null,W=L&&L.theta!==void 0?L.theta:et.theta,Z=L&&L.phi!==void 0?L.phi:et.phi,_t=wn(Yi()?"orbit":"view",W,Z);if(!_t)return;let Mt={target:_t.target,radius:_t.radius};L&&L.theta!==void 0&&(Mt.theta=L.theta),L&&L.phi!==void 0&&(Mt.phi=L.phi),vs(Mt,M)}function vs(M,L=!0,W=null,Z=Ap){if(ai("replaced"),!L||$.matches){M.target&&et.target.copy(M.target),M.radius!==void 0&&(et.radius=M.radius),M.theta!==void 0&&(et.theta=M.theta),M.phi!==void 0&&(et.phi=M.phi),Xt=null,Ne(),W&&W.done("arrived");return}let _t={target:et.target.clone(),radius:et.radius,theta:et.theta,phi:et.phi};Xt={from:_t,to:{target:M.target?M.target.clone():null,radius:M.radius,theta:M.theta===void 0?void 0:_t.theta+Pp(M.theta-_t.theta),phi:M.phi},start:performance.now(),dur:Z,track:W?W.track:null,done:W?W.done:null},Ne()}function or(){return!!(Xt&&Xt.track)}function ai(M){let L=Xt&&Xt.done;L&&(Xt.done=null,Xt.track=null,L(M),Ve())}function ar(){if(!Xt||Xt.track||!(at==="auto"||at==="part"))return;let{theta:M,phi:L}=Xt.to;Xt.track=()=>wn("view",M===void 0?et.theta:M,L===void 0?et.phi:L)}function E(M){let L=Un[M]||Un[ui];Zt=Un[M]?M:ui,et.theta=L[0]*Be,et.phi=L[1]*Be}function H(M,L=!0,W=!0){if(!Un[M])return!1;W&&(Tt=!0),Zt=M;let[Z,_t]=Un[M],Mt=_t*Be,Lt={theta:Z*Be,phi:Mt};at==="user"&&(at="auto");let It=wn("view",Lt.theta,Mt);return It&&(Lt={...Lt,target:It.target,radius:It.radius}),fn(),vs(Lt,L),Ve(),!0}function nt(){if(!N||!X)return;let M=Wi(),L=M.left+M.w/2,W=M.top+M.h/2,Z=L-N/2,_t=W-X/2,Mt=N+2*Math.abs(Z),Lt=X+2*Math.abs(_t),It=Mt/2-L,it=Lt/2-W;g.aspect=Mt/Lt,g.fov=2*Math.atan(Math.tan(ds*Be/2)*(Lt/X))/Be,g.setViewOffset(Mt,Lt,It,it,N,X),g.updateProjectionMatrix(),T.uniforms.uRes.value.set(N*U,X*U),T.uniforms.uCenter.value.set(L*U,(X-W)*U)}function J(){if(B)return;let M=a.getBoundingClientRect(),L=Math.round(M.width),W=Math.round(M.height),Z=Math.max(1,Math.min(e.maxDpr||wp,Math.max(1,s.devicePixelRatio||1))*Y);L===N&&W===X&&Z===U||(N=L,X=W,U=Z,L>0&&W>0&&m&&(m.setPixelRatio(U),m.setSize(L,W,!1),nt(),I.size&&at==="auto"&&xs()),Zi(),Ne())}function j(M){let L=o("div","holo-label");L.dataset.key=M.key;let W=o("span","holo-label__text");L.append(W),h.append(L);let Z=n.createElementNS(Zh,"line");Z.setAttribute("class","holo-leader"),Z.setAttribute("data-key",M.key);let _t=n.createElementNS(Zh,"circle");_t.setAttribute("class","holo-anchor"),_t.setAttribute("data-key",M.key),_t.setAttribute("r","2.2"),c.append(Z,_t),M.label={el:L,text:W,line:Z,dot:_t,w:0,h:0,name:null,shown:!1,state:""}}function Vt(M){let L=M.part.name||"";M.label.name!==L&&(M.label.name=L,M.label.text.textContent=L,M.label.w=0)}function te(){let M=[],L=new k,W=Wi(),Z={left:W.left+4,top:W.top+4,right:N-W.right-4,bottom:X-W.bottom-4};for(let oe of I.values()){let ue=oe.label;ue.name&&ue.w===0&&(ue.w=Math.ceil(ue.el.offsetWidth),ue.h=Math.ceil(ue.el.offsetHeight))}let _t=[],Mt=new k,Lt=1/0,It=1/0,it=-1/0,se=-1/0;for(let oe of I.values()){if(!oe.box||oe.vis<.3||F&&oe.key!==F)continue;Ai(oe,pt,Mt);let ue=1/0,on=1/0,vn=-1/0,je=-1/0;for(let zn=0;zn<8;zn++){L.set(zn&1?oe.box.max[0]:oe.box.min[0],zn&2?oe.box.max[1]:oe.box.min[1],zn&4?oe.box.max[2]:oe.box.min[2]).add(Mt).project(g);let tn=(L.x*.5+.5)*N,Ze=(-L.y*.5+.5)*X;tn<ue&&(ue=tn),tn>vn&&(vn=tn),Ze<on&&(on=Ze),Ze>je&&(je=Ze)}ue<Lt&&(Lt=ue),on<It&&(It=on),vn>it&&(it=vn),je>se&&(se=je),(vn-ue)*(je-on)<N*X*.12&&_t.push([ue,on,vn,je])}let Jt=w();for(let oe of I.values()){let ue=oe.label,on=oe.born.length&&Jt>=oe.born[0]+Jh*.4;if(!(lt&&ue.name&&oe.box&&on&&oe.vis>.3&&(!F||oe.key===F)&&ne(oe))||(ms(oe,L).project(g),L.z>1||L.z<-1))continue;let je=(L.x*.5+.5)*N,zn=(-L.y*.5+.5)*X,tn=X/(2*Math.max(1e-6,g.position.distanceTo(ms(oe,new k)))*Math.tan(ds*Be/2));M.push({id:oe.key,x:je,y:zn,w:ue.w,h:ue.h,priority:oe.size*tn+(oe.key===St?1e6:0),pinned:oe.key===K||le(oe)==="glow"})}let pe=Number.isFinite(Lt)?{x:(Lt+it)/2,y:(It+se)/2}:{x:N/2,y:X/2},Se=M.length,de=0;for(let oe of M)(oe.pinned||oe.x>=Z.left-1&&oe.x<=Z.right+1&&oe.y>=Z.top-1&&oe.y<=Z.bottom+1)&&(M[de++]=oe);M.length=de;let ve=(Z.right-Z.left)*(Z.bottom-Z.top),Ue=Tp+(Xy-Tp)*pt,ci=F||ee?1/0:Math.round(Math.max(qy,ve/Ue));M.length>ci&&(M.sort((oe,ue)=>(ue.pinned?1:0)-(oe.pinned?1:0)||ue.priority-oe.priority),M.length=ci);let hi=80+130*(1-pt),ys=fp(M,Z,{center:pe,previous:Dt,avoid:_t,maxCost:Yy,coverCost:hi}),Io=new Map(M.map(oe=>[oe.id,oe]));Ht=Se-ys.size;for(let oe of I.values()){let ue=oe.label,on=ys.get(oe.key);if(!on){ue.shown&&(ue.shown=!1,ue.el.classList.remove("is-shown"),ue.line.style.display="none",ue.dot.style.display="none"),Dt.delete(oe.key);continue}Dt.set(oe.key,on.slot);let vn=Io.get(oe.key);ue.el.style.transform=`translate(${Math.round(on.x)}px, ${Math.round(on.y)}px)`,ue.shown||(ue.shown=!0,ue.el.classList.add("is-shown"),ue.line.style.display="",ue.dot.style.display="");let je=oe.key===K||le(oe)==="glow"?"sel":oe.key===St?"hov":"";je!==ue.state&&(ue.state=je,ue.el.classList.toggle("is-selected",je==="sel"),ue.el.classList.toggle("is-hover",je==="hov"),ue.line.classList.toggle("is-selected",je==="sel"),ue.dot.classList.toggle("is-selected",je==="sel")),ue.line.setAttribute("x1",vn.x.toFixed(1)),ue.line.setAttribute("y1",vn.y.toFixed(1)),ue.line.setAttribute("x2",on.lx.toFixed(1)),ue.line.setAttribute("y2",on.ly.toFixed(1)),ue.dot.setAttribute("cx",vn.x.toFixed(1)),ue.dot.setAttribute("cy",vn.y.toFixed(1))}}function Gt(){for(let M of I.values()){let L=M.label;L.shown&&(L.shown=!1,L.el.classList.remove("is-shown"),L.line.style.display="none",L.dot.style.display="none")}}function qt(){let M=Hi(pt,!0);if(!M){P.visible=!1;return}let L=(M.min[0]+M.max[0])/2,W=(M.min[2]+M.max[2])/2,Z=Math.hypot(M.max[0]-M.min[0],M.max[2]-M.min[2])/2,_t=Bn()||M,Mt=Math.hypot(_t.max[0]-_t.min[0],_t.max[2]-_t.min[2])/2,Lt=Math.max(Mt*1.12,Z*.7),It=M.min[1]-Math.max(Z,M.max[1]-M.min[1])*.03;P.position.set(L,It,W),P.scale.set(Lt*3.2,1,Lt*3.2),b.uniforms.uR.value=Lt,b.uniforms.uCell.value=tM(Lt/5),b.uniforms.uCenterW.value.set(L,It,W);let it=Bt?Math.min(1,Math.max(0,(It-g.position.y)/(Mt*.3+1e-6))):0;b.uniforms.uVis.value=1-it,P.visible=D&&it<1}function Kt(){let M=!!Bt&&Bt.pulse&&!$.matches;for(let L of I.values()){let W=le(L),Z=1,_t=1;F&&L.key!==F||W==="hide"?Z=0:W==="glow"||W&&L.key===K?Z=1:W==="ghost"?(Z=Ep,_t=Zy/Ep):W?Z=Bt.others:K&&L.key!==K&&!F&&(Z=.38),L.visGoal=Z,L.fillKGoal=_t,L.selGoal=L.key===K||W==="glow"?1:0,L.pulseGoal=M&&W==="glow"?1:0,L.hovGoal=L.key===St&&L.key!==K?1:0}Ne()}function le(M){if(!Bt)return null;let L=W=>W.has(M.part.id)||W.has(M.key);return L(Bt.hide)?"hide":L(Bt.glow)?"glow":L(Bt.ghost)||Bt.shells&&Me().has(M.part.id)?"ghost":"other"}function Me(){return(!ft||ft.spec!==O)&&(ft={spec:O,ids:iM(O?O.parts:[])}),ft.ids}function ne(M){return!ee||ee.has(M.part.id)||ee.has(M.key)||M.key===K}function _e(M){return new Set((M==null?[]:[].concat(M)).map(L=>String(L)))}function ke(M){let L=null;if(M&&typeof M=="object"){let W=_e(M.ghost),Z=M.others===void 0||M.others===null?NaN:Number(M.others);L={glow:_e(M.glow),ghost:W,shells:W.has("shells"),hide:_e(M.hide),others:Number.isFinite(Z)?Math.min(1,Math.max(0,Z)):Jy,since:performance.now(),pulse:!0},!L.glow.size&&!L.ghost.size&&!L.hide.size&&!Number.isFinite(Z)&&(L=null)}Bt=L,Kt(),Ve()}function Ie(M){if(M==null)return null;for(let L of I.values())if(L.part.id===M||L.key===M)return L.key}function Pe(M){if(!M)return null;let L=M.part,W=O&&L.group?O.groups.find(Z=>Z.id===L.group):null;return{id:L.id,name:L.name,group:L.group,groupName:W?W.name:"",tone:L.tone,info:L.info,material:L.material,aka:L.aka.slice()}}function qe(M,{notify:L=!0}={}){M!==K&&(K=M,M&&fn(),Kt(),L&&e.onSelect(M?I.get(M).part.id:null,M?Pe(I.get(M)):null),Ve())}let Qt=new Kr,Je=new Nt,Ae=null;function Zn(M){let L=M.group.position;return{min:[M.box.min[0]+L.x,M.box.min[1]+L.y,M.box.min[2]+L.z],max:[M.box.max[0]+L.x,M.box.max[1]+L.y,M.box.max[2]+L.z]}}let Qe=M=>Math.max(1e-9,(M.max[0]-M.min[0])*(M.max[1]-M.min[1])*(M.max[2]-M.min[2]));function qi(M,L){if(!N||!X)return null;Je.set(M/N*2-1,-(L/X)*2+1),Qt.setFromCamera(Je,g);let W=[];for(let It of I.values())It.fill&&It.group.visible&&It.visGoal>.05&&W.push(It.fill);let Z=Qt.intersectObjects(W,!1),_t=[];for(let It of Z){let it=It.object.userData.rec;it&&!_t.includes(it)&&_t.push(it)}if(!_t.length)return null;let Mt=_t[0];for(let It=1;It<_t.length;It++){let it=_t[It],se=Zn(Mt),Jt=Zn(it);[(Jt.min[0]+Jt.max[0])/2,(Jt.min[1]+Jt.max[1])/2,(Jt.min[2]+Jt.max[2])/2].every((de,ve)=>de>=se.min[ve]&&de<=se.max[ve])&&Qe(Jt)<Qe(se)*.6&&(Mt=it)}let Lt=performance.now();if(Ae&&Math.hypot(Ae.x-M,Ae.y-L)<14&&Lt-Ae.t<5e3&&K){let It=_t.findIndex(it=>it.key===K);It>=0&&(Mt=_t[(It+1)%_t.length])}return Ae={x:M,y:L,t:Lt},Mt}let $e=new Map,xe=null;function be(M){let L=a.getBoundingClientRect();return[M.clientX-L.left,M.clientY-L.top]}function Ge(){Q=performance.now()}function fn(){Q=performance.now()}function Fe(M){if(B||G||M.target&&M.target.closest&&M.target.closest(".holo__notice"))return;let[L,W]=be(M);$e.set(M.pointerId,{x:L,y:W});try{a.setPointerCapture(M.pointerId)}catch{}if(mt.theta=0,mt.phi=0,ai("touch"),Xt=null,Ge(),$e.size===1)xe={mode:M.button===2||M.shiftKey||M.ctrlKey?"pan":"rotate",moved:!1,startX:L,startY:W,startT:performance.now(),touch:M.pointerType!=="mouse",target:M.target,lastT:performance.now()};else if($e.size===2){let[Z,_t]=Array.from($e.values());xe={mode:"pinch",moved:!0,pinchDist:Math.hypot(Z.x-_t.x,Z.y-_t.y),midX:(Z.x+_t.x)/2,midY:(Z.y+_t.y)/2,touch:!0}}Ne()}function Ye(M){if(B)return;let L=$e.get(M.pointerId),[W,Z]=be(M);if(!L){M.pointerType==="mouse"&&!G&&Lp(W,Z);return}let _t=W-L.x,Mt=Z-L.y;if(L.x=W,L.y=Z,!xe)return;if(xe.mode==="pinch"){if($e.size<2)return;let[it,se]=Array.from($e.values()),Jt=Math.hypot(it.x-se.x,it.y-se.y),pe=(it.x+se.x)/2,Se=(it.y+se.y)/2;xe.pinchDist>0&&Jt>0&&Ql(xe.pinchDist/Jt),Qh(pe-xe.midX,Se-xe.midY),xe.pinchDist=Jt,xe.midX=pe,xe.midY=Se,Ge(),Ne();return}if(!xe.moved){let it=xe.touch?Wy:Hy;if(Math.hypot(W-xe.startX,Z-xe.startY)<it)return;xe.moved=!0,Tt=!0}let Lt=performance.now(),It=Math.max(.001,(Lt-xe.lastT)/1e3);if(xe.lastT=Lt,xe.mode==="pan")Qh(_t,Mt);else{let it=Math.PI/Math.max(320,Math.min(N,X))*1.15;et.theta-=_t*it,et.phi=Math.min(Math.PI-.01,Math.max(.01,et.phi-Mt*it)),mt.theta=-_t*it/It,mt.phi=-Mt*it/It,Zt=""}Ge(),Ne()}function xn(M){if(B)return;let L=$e.has(M.pointerId);$e.delete(M.pointerId);try{a.releasePointerCapture(M.pointerId)}catch{}if(!L||!xe)return;if(xe.mode==="pinch"){if($e.size===1){let[Z]=Array.from($e.values());xe={mode:"rotate",moved:!0,startX:Z.x,startY:Z.y,startT:performance.now(),touch:!0,lastT:performance.now()}}else xe=null;mt.theta=0,mt.phi=0;return}let W=xe;if(xe=null,!W.moved&&M.type==="pointerup"&&performance.now()-W.startT<900){let[Z,_t]=be(M),Mt=W.target&&W.target.closest?W.target.closest(".holo-label"):null;if(Mt&&I.has(Mt.dataset.key))qe(Mt.dataset.key);else{let Lt=qi(Z,_t);qe(Lt?Lt.key:null)}mt.theta=0,mt.phi=0}else(W.mode!=="rotate"||performance.now()-W.lastT>80)&&(mt.theta=0,mt.phi=0);Ne()}function lr(M){if(B||G)return;M.preventDefault();let L=M.deltaMode===1?16:M.deltaMode===2?400:1;Ql(Math.exp(M.deltaY*L*.0012)),Ge(),Ne()}function Ql(M){Tt=!0;let L=Math.min(4,Math.max(.25,M)),W=wn("orbit"),Z=(W?W.radius:et.radius)*3,_t=Math.max(ut*.06,.001);et.radius=Math.min(Z,Math.max(_t,et.radius*L)),at="user",ai("touch"),Xt=null}function Qh(M,L){if(!M&&!L)return;Tt=!0;let W=2*et.radius*Math.tan(ds*Be/2)/Math.max(1,X),Z=new k().setFromMatrixColumn(g.matrixWorld,0),_t=new k().setFromMatrixColumn(g.matrixWorld,1);et.target.addScaledVector(Z,-M*W).addScaledVector(_t,L*W),at="user",ai("touch"),Xt=null}let bo=null;function Lp(M,L){xe||(bo=[M,L],Ne())}function Np(){if(!bo)return;let[M,L]=bo;if(bo=null,!N||!X)return;Je.set(M/N*2-1,-(L/X)*2+1),Qt.setFromCamera(Je,g);let W=[];for(let Mt of I.values())Mt.fill&&Mt.visGoal>.05&&W.push(Mt.fill);let Z=Qt.intersectObjects(W,!1)[0],_t=Z?Z.object.userData.rec.key:null;_t!==St&&(St=_t,a.classList.toggle("is-pointing",!!_t),Kt())}function jh(){St&&(St=null,a.classList.remove("is-pointing"),Kt())}function tu(M){if(B||G)return;let[L,W]=be(M),Z=qi(L,W);Z?cu(Z.key):uu()}let eu=M=>M.preventDefault();a.addEventListener("pointerdown",Fe),a.addEventListener("pointermove",Ye),a.addEventListener("pointerup",xn),a.addEventListener("pointercancel",xn),a.addEventListener("pointerleave",jh),a.addEventListener("wheel",lr,{passive:!1}),a.addEventListener("contextmenu",eu),a.addEventListener("dblclick",tu);let Jn=0,wo=!0,li=0,Ei=!1,nu=!0;function Ne(){wo=!0,Ei&&!Jn&&!B&&(Jn=s.requestAnimationFrame(jl))}function Yi(){if(!yt||wt||$.matches&&!kt||xe||K||Xt||!I.size)return!1;let M=performance.now(),L=M-Math.max(Q,dt);return M-Q>$h&&L<Gy}let cr=0;function iu(){if(s.clearTimeout(cr),cr=0,B||!yt||wt||$.matches&&!kt)return;let M=Q+$h-performance.now();!(M>0)||!Number.isFinite(M)||(cr=s.setTimeout(()=>{cr=0,Ne()},Math.ceil(M)+20))}function Dp(M,L){let W=!1,Z=w();if(S.uTime.value=Z,Xt){let it=Math.min(1,(L-Xt.start)/Xt.dur),se=Ip(it),Jt=Xt.from,pe=Xt.to,Se=Xt.track?Xt.track():null;if(Se&&(pe.target=Se.target,pe.radius=Se.radius),pe.target&&et.target.lerpVectors(Jt.target,pe.target,se),pe.radius!==void 0&&(et.radius=Jt.radius+(pe.radius-Jt.radius)*se),pe.theta!==void 0&&(et.theta=Jt.theta+(pe.theta-Jt.theta)*se),pe.phi!==void 0&&(et.phi=Jt.phi+(pe.phi-Jt.phi)*se),it>=1){let de=Xt.done;Xt=null,de&&(de("arrived"),Ve())}W=!0}if(!xe&&(Math.abs(mt.theta)>.001||Math.abs(mt.phi)>.001)){et.theta+=mt.theta*M,et.phi=Math.min(Math.PI-.01,Math.max(.01,et.phi+mt.phi*M));let it=Math.exp(-M*4.5);mt.theta*=it,mt.phi*=it,W=!0}if(At){let it=Math.min(1,(L-At.start)/At.dur);if(pt=At.from+(At.to-At.from)*Ip(it),!Xt&&(at==="auto"||at==="part")){let se=wn();if(se){let Jt=it>=1?1:Math.min(1,M*8);et.target.lerp(se.target,Jt),et.radius+=(se.radius-et.radius)*Jt}}if(it>=1){let se=At.done;At=null;for(let Jt of se)Jt("arrived")}W=!0}else if((at==="auto"||at==="part")&&!Xt&&!xe&&Yi()){let it=wn("orbit");it&&(Math.abs(it.radius-et.radius)>it.radius*.003||it.target.distanceTo(et.target)>it.radius*.003)&&(et.target.lerp(it.target,Math.min(1,M*1.5)),et.radius+=(it.radius-et.radius)*Math.min(1,M*1.5),W=!0)}Yi()&&(et.theta+=ky*Be*M,W=!0),Bt&&Bt.pulse&&performance.now()-Bt.since>$y&&(Bt.pulse=!1,Kt());let _t=$.matches?1:Math.min(1,M*9),Mt=new k,Lt=!1;for(let it of I.values()){Ai(it,pt,Mt),it.group.position.equals(Mt)||it.group.position.copy(Mt);for(let[se,Jt]of jy){let pe=it[Jt]-it[se];Math.abs(pe)>.003?(it[se]+=pe*_t,W=!0):it[se]=it[Jt]}it.mats.fill.uniforms.uVis.value=it.vis*it.fillK,it.mats.line.uniforms.uVis.value=it.vis,it.mats.fill.uniforms.uSel.value=it.sel,it.mats.line.uniforms.uSel.value=it.sel,it.mats.fill.uniforms.uHover.value=it.hov,it.mats.line.uniforms.uHover.value=it.hov,it.mats.fill.uniforms.uPulse.value=it.pulse,it.mats.line.uniforms.uPulse.value=it.pulse,it.group.visible=it.vis>.01,it.pulse>0&&it.group.visible&&(Lt=!0)}Rt=Lt,Z<gt+Jh+.05&&(W=!0);let It=Hi(pt,!0);if(It){let it=Math.max(1e-6,It.max[1]-It.min[1]),se=5.5,Jt=Z%se/se;S.uScanY.value=It.min[1]-it*.2+Jt*it*1.4,S.uScanW.value=it*.035,ut=Math.max(1e-6,Math.hypot(It.max[0]-It.min[0],It.max[1]-It.min[1],It.max[2]-It.min[2])/2)}return S.uFlicker.value=$.matches?1:.985+.015*Math.sin(Z*23)*Math.sin(Z*7.3),W}function su(){let M=Math.sin(et.phi);g.position.set(et.target.x+et.radius*M*Math.sin(et.theta),et.target.y+et.radius*Math.cos(et.phi),et.target.z+et.radius*M*Math.cos(et.theta)),g.up.set(0,1,0),g.lookAt(et.target);let L=Math.max(ut,1e-6);g.near=Math.max(et.radius*.01,et.radius-L*6),g.far=et.radius+L*8,g.updateProjectionMatrix(),g.updateMatrixWorld(),S.uFade.value.set(et.radius-L*.9,et.radius+L*1.1)}let hr=[];function jl(M){Jn=0;let L=r?performance.now():M;if(!Ei||B||G)return;let W=Yi()||Rt;if(!(Xt||At||xe||wo)&&W&&li&&L-li<1e3/Vy-2){Jn=s.requestAnimationFrame(jl);return}let _t=li?Math.min(.1,(L-li)/1e3):1/60;if(li&&(Xt||At||xe||W)&&(tt+=L-li,++vt>=30)){let Lt=tt/vt;tt=0,vt=0,Lt>48&&U>1.01&&(Y=Math.max(.25,Y-.25),J())}li=L,wo=!1;let Mt=Dp(_t,L);Np(),Fp(),Mt||wo||Yi()||Rt?Jn=s.requestAnimationFrame(jl):(li=0,iu())}function Fp(){if(!m||!N||!X)return;let M=performance.now();su(),qt(),m.render(p,g),q.frames++;let L=performance.now();lt?te():Gt(),q.labelMs+=performance.now()-L;let W=performance.now()-M;hr.push(W),hr.length>120&&(hr=hr.slice(-60))}function Zi(){let M=!B&&!G&&!n.hidden&&nu&&N>0&&X>0&&a.isConnected&&!a.closest("[inert]");M!==Ei&&(Ei=M,Ei?(li=0,Ne()):Jn&&(s.cancelAnimationFrame(Jn),Jn=0))}let Ao=null,ru=typeof s.ResizeObserver=="function"?s.ResizeObserver:typeof ResizeObserver=="function"?ResizeObserver:null;ru&&(Ao=new ru(()=>J()),Ao.observe(a));let ou=()=>J();s.addEventListener("resize",ou);let To=null,au=typeof s.IntersectionObserver=="function"?s.IntersectionObserver:typeof IntersectionObserver=="function"?IntersectionObserver:null;au&&(To=new au(M=>{nu=M[M.length-1].isIntersecting,Zi()},{rootMargin:"32px"}),To.observe(a));let lu=()=>Zi();n.addEventListener("visibilitychange",lu);let Up=rM(()=>Zi()),Eo=0;function Ro(M){M.preventDefault(),!B&&(G=!0,d.textContent="The 3D view was paused by the device. Restoring\u2026",u.hidden=!0,f.hidden=!1,Zi(),Ve(),clearTimeout(Eo),Eo=setTimeout(()=>{G&&!B&&(d.textContent="The 3D view was paused by the device.",u.hidden=!1)},2500))}function Co(){B||(G=!1,clearTimeout(Eo),f.hidden=!0,u.hidden=!0,Zi(),Ne(),Ve())}l.addEventListener("webglcontextlost",Ro,!1),l.addEventListener("webglcontextrestored",Co,!1),u.addEventListener("click",()=>Op());function Op(){try{m.dispose()}catch{}let M=o("canvas","holo__canvas");M.setAttribute("role","img"),M.setAttribute("aria-label",l.getAttribute("aria-label")||"Hologram"),l.removeEventListener("webglcontextlost",Ro,!1),l.removeEventListener("webglcontextrestored",Co,!1),M.addEventListener("webglcontextlost",Ro,!1),M.addEventListener("webglcontextrestored",Co,!1),l.replaceWith(M),l=M;try{m=x()}catch{d.textContent="The 3D view could not restart. Close and reopen the hologram.";return}N=0,X=0,G=!1,f.hidden=!0,J(),Ne(),Ve()}let tc=!1;function Ve(){tc||B||(tc=!0,queueMicrotask(()=>{tc=!1,B||e.onState(ec())}))}function ec(){let M=Bn();return{ready:I.size>0,building:V,title:O?O.title:"",subtitle:O?O.subtitle:"",parts:I.size,units:O?O.units:"mm",gridCell:P.visible?b.uniforms.uCell.value:null,size:M?[M.max[0]-M.min[0],M.max[1]-M.min[1],M.max[2]-M.min[2]]:null,exploded:xt,labels:lt,labelsHidden:Ht,autoRotate:yt,view:Zt,selected:K?I.get(K).part.id:null,isolated:F?I.get(F).part.id:null,contextLost:G,meshing:ie(),mesher:qd()?"worker":"main",emphasis:Bt?{glow:Array.from(Bt.glow),ghost:Array.from(Bt.ghost),hide:Array.from(Bt.hide),others:Bt.others}:null,labelsFor:ee?Array.from(ee):null,flying:!!(Xt&&Xt.done),rotateHeld:wt}}function cu(M){if(ai("replaced"),!M){jt=null,at="auto",Ti(!0);return}if(qe(M),jt=new Set([M]),at="part",At){ar(),Ne(),Ve();return}let L=wn("view");L&&vs({target:L.target,radius:L.radius}),Ve()}function hu({ids:M=null,frame:L,view:W=null,dir:Z=null,ms:_t=Ap}={}){if(B)return Promise.resolve("replaced");if(xe)return Promise.resolve("touch");let Mt=[];for(let ve of _e(M)){let Ue=Ie(ve);Ue&&!Mt.includes(Ue)&&Mt.push(Ue)}let Lt=L!=="all"&&Mt.length>0,It=null;if(W==="access"||Z==="access"){let ve=Mt.length?I.get(Mt[0]):null,Ue=ve?Ai(ve,1,new k):null;It=Ue?nM([Ue.x,Ue.y,Ue.z],O&&O.view||ui):null,It&&(Zt="")}else typeof W=="string"&&Un[W]?(It=[Un[W][0]*Be,Un[W][1]*Be],Zt=W):Z&&(It=Kh(Z,et.theta),It&&(Zt=""));It&&(Tt=!0),jt=Lt?new Set(Mt):null,at=Lt?"part":"auto",mt.theta=0,mt.phi=0,fn();let it=It?It[0]:et.theta,se=It?It[1]:et.phi,Jt=()=>wn("view",it,se),pe=Jt();if(!pe)return Ve(),Promise.resolve("arrived");let Se=At?At.start+At.dur-performance.now():0,de=Math.max(Number(_t)||0,Se);return new Promise(ve=>{let Ue=It?{target:pe.target,radius:pe.radius,theta:it,phi:se}:{target:pe.target,radius:pe.radius};vs(Ue,de>0&&Ei,{track:Jt,done:ve},de),Ve()})}function uu(){jt=null,at="auto",mt.theta=0,mt.phi=0,H(O&&O.view||ui,!0)}let Ri={updateSpec(M,{final:L=!1,normalized:W=!1}={}){if(B)return null;let Z=W&&M&&Array.isArray(M.parts)?{spec:M,warnings:[],stats:null,ok:!0}:nc(M,{partial:!L});return Z.spec&&(L?(V=!1,R=!0):V=!0,Mo(Z.spec,{final:L})),Z},setSpec(M){if(B)return null;let L=nc(M);return L.ok&&(V||(Tt=!1,$t=null),V=!1,Mo(L.spec,{final:!0}),R=!0),L},explode(M=1,L=!0){if(B)return Promise.resolve("replaced");let W=Math.min(1,Math.max(0,Number(M)||0));if(xt=W,at==="user"&&(at="auto"),At)for(let _t of At.done)_t("replaced");let Z;if(!L||$.matches){if(At=null,pt=W,at==="auto"||at==="part"){let _t=wn("view");_t&&(et.target.copy(_t.target),et.radius=_t.radius)}Z=Promise.resolve("arrived")}else{let _t=[];At={from:pt,to:W,start:performance.now(),dur:zy*Math.max(.35,Math.abs(W-pt)),done:_t},Z=new Promise(Mt=>_t.push(Mt)),ar()}return Ne(),Ve(),Z},setLabels(M){lt=!!M,Ne(),Ve()},select(M){let L=Ie(M);return L===void 0?!1:(qe(L,{notify:!0}),Ne(),!0)},focus(M){let L=Ie(M);return L===void 0?!1:(cu(L),!0)},isolate(M){let L=Ie(M);return L===void 0?!1:(ai("replaced"),F=L,L?(qe(L),jt=new Set([L]),at="part"):(jt=null,at="auto"),Kt(),Ti(!0),Ve(),!0)},setView(M){return H(M,!0)},autoRotate(M){yt=!!M,kt=yt,yt&&(wt=!1,Q=-1/0,dt=performance.now()),Ne(),Ve()},holdAutoRotate(M){wt=!!M,wt||(Q=performance.now(),iu()),Ne(),Ve()},setEmphasis:ke,labelsFor(M){ee=M==null?null:_e(M),Ne(),Ve()},flyTo:hu,resetView:uu,zoom(M){Ql(M),Ge(),Ne()},setInsets(M){Ft={top:0,right:0,bottom:0,left:0,...M},nt(),at!=="user"&&Ti(!0),Ne()},snapshot({width:M=256,height:L=192,type:W="image/png",quality:Z=.85,view:_t=null}={}){if(!m||G||!I.size)return null;M=Math.max(16,Math.round(M)),L=Math.max(16,Math.round(L));let Mt=_t&&Un[_t]?Un[_t]:null,Lt=Mt?Mt[0]*Be:et.theta,It=Mt?Mt[1]*Be:et.phi,it=new pn(M,L,{samples:4}),se=new hn(ds,M/L,1,1e6),Jt=rr(Lt,It,pt,F,L,{left:0,right:0,top:0,bottom:0,w:M*.96,h:L*.96});if(!Jt)return it.dispose(),null;let pe=Math.sin(It);se.position.set(Jt.target.x+Jt.radius*pe*Math.sin(Lt),Jt.target.y+Jt.radius*Math.cos(It),Jt.target.z+Jt.radius*pe*Math.cos(Lt)),se.lookAt(Jt.target),se.near=Math.max(Jt.radius*.01,Jt.radius-ut*6),se.far=Jt.radius+ut*8,se.updateProjectionMatrix();let Se={time:S.uTime.value,res:T.uniforms.uRes.value.clone(),center:T.uniforms.uCenter.value.clone(),fade:S.uFade.value.clone(),flicker:S.uFlicker.value,scanY:S.uScanY.value};S.uTime.value=1e5,S.uFlicker.value=1,S.uRows.value=0,S.uScanY.value=-1e9,b.uniforms.uGrid.value=0,S.uFade.value.set(Jt.radius-ut*.9,Jt.radius+ut*1.1),T.uniforms.uRes.value.set(M,L),T.uniforms.uCenter.value.set(M/2,L/2);let de=new Uint8Array(M*L*4);try{m.setRenderTarget(it),m.render(p,se),m.readRenderTargetPixels(it,0,0,M,L,de)}finally{m.setRenderTarget(null),it.dispose(),S.uTime.value=Se.time,S.uFlicker.value=Se.flicker,S.uRows.value=1,S.uScanY.value=Se.scanY,b.uniforms.uGrid.value=1,S.uFade.value.copy(Se.fade),T.uniforms.uRes.value.copy(Se.res),T.uniforms.uCenter.value.copy(Se.center)}let ve=document.createElement("canvas");ve.width=M,ve.height=L;let Ue=ve.getContext("2d"),ci=Ue.createImageData(M,L);for(let hi=0;hi<L;hi++)ci.data.set(de.subarray((L-1-hi)*M*4,(L-hi)*M*4),hi*M*4);return Ue.putImageData(ci,0,0),Ne(),W==="image/png"?ve.toDataURL("image/png"):ve.toDataURL(W,Z)},settled(M=5e3){return B||!ie()?Promise.resolve(!B):new Promise(L=>{let W=!1,Z=Mt=>{W||(W=!0,clearTimeout(_t),L(Mt))},_t=setTimeout(()=>Z(!1),M);Wt.push(Z)})},listParts(){return Array.from(I.values()).map(Pe)},getPart(M){let L=Ie(M);return L?Pe(I.get(L)):null},getState:ec,tourTarget:()=>Bp,resize:J,debugBench(M=30){if(!m||!N)return null;let L=m.getContext(),W=new Uint8Array(4),Z=performance.now();for(let Lt=0;Lt<M;Lt++)et.theta+=.01,su(),m.render(p,g),L.readPixels(0,0,1,1,L.RGBA,L.UNSIGNED_BYTE,W);let _t=(performance.now()-Z)/M,Mt=m.info;return{msPerFrame:_t,drawCalls:Mt.render.calls,triangles:Mt.render.triangles,lines:Mt.render.lines,geometries:Mt.memory.geometries,programs:Mt.programs?Mt.programs.length:null,width:N,height:X,dpr:U}},debugToggle({fills:M=!0,lines:L=!0,floor:W=!0,background:Z=!0,doubleSided:_t=!0}={}){for(let Mt of I.values()){Mt.fill&&(Mt.fill.visible=M),Mt.lines&&(Mt.lines.visible=L);let Lt=_t?Sn:ii;Mt.mats.fill.side!==Lt&&(Mt.mats.fill.side=Lt,Mt.mats.fill.needsUpdate=!0)}D=W,A.visible=Z,Ne()},debugState(){let M=Z=>Math.round(Pp(Z)/Be*100)/100,L=Z=>I.has(Z)?I.get(Z).part.id:Z,W=wn("view");return{camera:{theta:M(et.theta),phi:M(et.phi),radius:et.radius,target:et.target.toArray(),fitMode:at,focus:jt?Array.from(jt).map(L):null,view:Zt},fit:W?{radius:W.radius,target:W.target.toArray()}:null,moving:!!Xt,flying:!!(Xt&&Xt.done),tracking:or(),exploding:!!At,explodeT:pt,rotating:Yi(),rotateHeld:wt,pulseLive:Rt,awake:Ei,parts:Array.from(I.values()).map(Z=>({id:Z.part.id,role:le(Z),vis:Z.vis,visGoal:Z.visGoal,fill:Z.fillK,fillGoal:Z.fillKGoal,sel:Z.sel,selGoal:Z.selGoal,pulse:Z.pulse,pulseGoal:Z.pulseGoal,label:Z.label.shown}))}},debugInfo(){let M=m?m.info:null;return{records:I.size,geometries:M?M.memory.geometries:null,textures:M?M.memory.textures:null,programs:M&&M.programs?M.programs.length:null,awake:Ei,dpr:U,...q,triangles:z(),meshes:Pt(),hullJobs:Xd(),hullPending:ie(),hullStats:Zd(),frameMs:hr.slice(-30)}},dispose(){if(!B){if(ai("replaced"),At)for(let M of At.done)M("replaced");At=null,B=!0,ge(),s.clearTimeout(Ot),Ce(),Jn&&s.cancelAnimationFrame(Jn),clearTimeout(Eo),s.clearTimeout(cr),Ao&&Ao.disconnect(),To&&To.disconnect(),s.removeEventListener("resize",ou),n.removeEventListener("visibilitychange",lu),Up(),$.off(),a.removeEventListener("pointerdown",Fe),a.removeEventListener("pointermove",Ye),a.removeEventListener("pointerup",xn),a.removeEventListener("pointercancel",xn),a.removeEventListener("pointerleave",jh),a.removeEventListener("wheel",lr),a.removeEventListener("contextmenu",eu),a.removeEventListener("dblclick",tu),l.removeEventListener("webglcontextlost",Ro,!1),l.removeEventListener("webglcontextrestored",Co,!1);for(let M of I.values())On(M);I.clear(),y.dispose(),T.dispose(),v.dispose(),b.dispose();try{m.dispose(),m.forceContextLoss()}catch{}m=null,a.remove()}}},Bp=Object.freeze({setEmphasis:M=>ke(M),flyTo:M=>hu(M),explode:(M,L)=>Ri.explode(M,L),focus:M=>Ri.focus(M),select:M=>Ri.select(M),setLabels(M){Ri.labelsFor(Array.isArray(M)?M:null),Ri.setLabels(Array.isArray(M)||!!M)},settled:M=>Ri.settled(M),holdAutoRotate:M=>Ri.holdAutoRotate(M),parts:()=>Array.from(I.values()).map(M=>({...Pe(M),shell:Me().has(M.part.id)})),getState:()=>ec()});return J(),Zi(),Ve(),Ri}function aM(i){let t=()=>null,e=()=>Promise.resolve("arrived"),n=Object.freeze({setEmphasis:_n,flyTo:e,explode:e,focus:()=>!1,select:()=>!1,setLabels:_n,settled:()=>Promise.resolve(!1),holdAutoRotate:_n,parts:()=>[],getState:()=>({ready:!1,error:"webgl"})});return{updateSpec:t,setSpec:t,explode:e,setLabels:_n,select:()=>!1,focus:()=>!1,isolate:()=>!1,setView:()=>!1,autoRotate:_n,holdAutoRotate:_n,setEmphasis:_n,labelsFor:_n,flyTo:e,resetView:_n,zoom:_n,setInsets:_n,snapshot:t,settled:()=>Promise.resolve(!1),listParts:()=>[],getPart:t,getState:()=>({ready:!1,error:"webgl"}),tourTarget:()=>n,resize:_n,debugBench:t,debugState:t,debugInfo:t,dispose(){i.remove()}}}export{Un as VIEW_ANGLES,nM as accessAngles,Kh as anglesOfDir,Y1 as createHologram,iM as shellIdsOf};
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
//# sourceMappingURL=hologram-VZCJU4KG.js.map
