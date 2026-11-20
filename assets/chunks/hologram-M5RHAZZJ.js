import{a as ps,b as ql,f as Jh,g as $h}from"./chunk-I2T6UIOM.js";import"./chunk-KVMUXFPB.js";var Iu=0,Rc=1,Pu=2;var Hr=1,Lu=2,Gs=3,Kn=0,dn=1,xn=2,Qi=0,Vs=1,Hs=2,Cc=3,Ic=4,Nu=5;var ji=100,Du=101,Fu=102,Uu=103,Ou=104,Bu=200,zu=201,ku=202,Gu=203,Pc=204,Lc=205,Vu=206,Hu=207,Wu=208,Xu=209,qu=210,Yu=211,Zu=212,Ju=213,$u=214,Ko=0,Qo=1,jo=2,Cs=3,ta=4,ea=5,na=6,ia=7,Nc=0,Ku=1,Qu=2,Qn=0,Dc=1,Fc=2,Uc=3,Oc=4,Bc=5,zc=6,kc=7;var Gc=300,ts=301,Ws=302,za=303,ka=304,sa=1e3,Xn=1001,ra=1002,tn=1003,ju=1004;var Wr=1005;var hn=1006,Ga=1007;var _i=1008;var En=1009,Vc=1010,Hc=1011,Xs=1012,Va=1013,zn=1014,kn=1015,Gn=1016,Ha=1017,Wa=1018,es=1020,Wc=35902,Xc=35899,qc=1021,Yc=1022,Vn=1023,mi=1026,xi=1027,Zc=1028,Xa=1029,Oi=1030,qa=1031;var Ya=1033,Xr=33776,qr=33777,Yr=33778,Zr=33779,Za=35840,Ja=35841,$a=35842,Ka=35843,Qa=36196,ja=37492,tl=37496,el=37488,nl=37489,Jr=37490,il=37491,sl=37808,rl=37809,ol=37810,al=37811,ll=37812,cl=37813,hl=37814,ul=37815,fl=37816,dl=37817,pl=37818,ml=37819,gl=37820,_l=37821,xl=36492,vl=36494,yl=36495,Ml=36283,Sl=36284,$r=36285,bl=36286;var fr=2300,oa=2301,Zo=2302,xc=2303,vc=2400,yc=2401,Mc=2402;var tf=3200;var Jc=0,ef=1,vi="",bn="srgb",dr="srgb-linear",pr="linear",Pe="srgb";var Jo=7680;var nf=519,sf=512,rf=513,of=514,$c=515,af=516,lf=517,Kc=518,Qc=519,cf=35044;var jc="300 es",In=2e3,mr=2001;function gp(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function _p(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function gr(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function hf(){let i=gr("canvas");return i.style.display="block",i}var Kh={},Is=null;function th(...i){let t="THREE."+i.shift();Is?Is("log",t,...i):console.log(t,...i)}function uf(i){let t=i[0];if(typeof t=="string"&&t.startsWith("TSL:")){let e=i[1];e&&e.isStackTrace?i[0]+=" "+e.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function ae(...i){i=uf(i);let t="THREE."+i.shift();if(Is)Is("warn",t,...i);else{let e=i[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...i)}}function ce(...i){i=uf(i);let t="THREE."+i.shift();if(Is)Is("error",t,...i);else{let e=i[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...i)}}function cr(...i){let t=i.join(" ");t in Kh||(Kh[t]=!0,ae(...i))}function ff(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}var df={[Ko]:Ko,[jo]:na,[ta]:ta,[Cs]:ea,[Qo]:Qo,[na]:jo,[ia]:ia,[ea]:Cs},Yn=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let s=n[t];if(s!==void 0){let r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let s=n.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,t);t.target=null}}},sn=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var $o=Math.PI/180,aa=180/Math.PI;function qs(){let i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(sn[i&255]+sn[i>>8&255]+sn[i>>16&255]+sn[i>>24&255]+"-"+sn[t&255]+sn[t>>8&255]+"-"+sn[t>>16&15|64]+sn[t>>24&255]+"-"+sn[e&63|128]+sn[e>>8&255]+"-"+sn[e>>16&255]+sn[e>>24&255]+sn[n&255]+sn[n>>8&255]+sn[n>>16&255]+sn[n>>24&255]).toLowerCase()}function ye(i,t,e){return Math.max(t,Math.min(e,i))}function xp(i,t){return(i%t+t)%t}function Yl(i,t,e){return(1-e)*i+e*t}function pf(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function eh(i){switch(i.constructor){case Uint32Array:return 4294967295;case Uint16Array:return 65535;case Uint8Array:case Uint8ClampedArray:return 255;case Int32Array:return 2147483647;case Int16Array:return 32767;case Int8Array:return 127;default:return}}function vp(i,t){if(t.constructor===Float32Array)return i;let e=eh(t);if(e===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.max(i/e,-1)}function yp(i,t){if(t.constructor===Float32Array)return i;let e=eh(t);if(e===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.round(i*e)}var ah=class ah{constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=ye(this.x,t.x,e.x),this.y=ye(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=ye(this.x,t,e),this.y=ye(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ye(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(ye(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*s+t.x,this.y=r*s+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};ah.prototype.isVector2=!0;var Lt=ah,Zn=class{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,o,a){let l=n[s+0],c=n[s+1],h=n[s+2],f=n[s+3],d=r[o+0],u=r[o+1],m=r[o+2],x=r[o+3];if(f!==x||l!==d||c!==u||h!==m){let p=l*d+c*u+h*m+f*x;p<0&&(d=-d,u=-u,m=-m,x=-x,p=-p);let g=1-a;if(p<.9995){let _=Math.acos(p),M=Math.sin(_);g=Math.sin(g*_)/M,a=Math.sin(a*_)/M,l=l*g+d*a,c=c*g+u*a,h=h*g+m*a,f=f*g+x*a}else{l=l*g+d*a,c=c*g+u*a,h=h*g+m*a,f=f*g+x*a;let _=1/Math.sqrt(l*l+c*c+h*h+f*f);l*=_,c*=_,h*=_,f*=_}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=f}static multiplyQuaternionsFlat(t,e,n,s,r,o){let a=n[s],l=n[s+1],c=n[s+2],h=n[s+3],f=r[o],d=r[o+1],u=r[o+2],m=r[o+3];return t[e]=a*m+h*f+l*u-c*d,t[e+1]=l*m+h*d+c*f-a*u,t[e+2]=c*m+h*u+a*d-l*f,t[e+3]=h*m-a*f-l*d-c*u,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,s=t._y,r=t._z,o=t._order,a=Math.cos,l=Math.sin,c=a(n/2),h=a(s/2),f=a(r/2),d=l(n/2),u=l(s/2),m=l(r/2);switch(o){case"XYZ":this._x=d*h*f+c*u*m,this._y=c*u*f-d*h*m,this._z=c*h*m+d*u*f,this._w=c*h*f-d*u*m;break;case"YXZ":this._x=d*h*f+c*u*m,this._y=c*u*f-d*h*m,this._z=c*h*m-d*u*f,this._w=c*h*f+d*u*m;break;case"ZXY":this._x=d*h*f-c*u*m,this._y=c*u*f+d*h*m,this._z=c*h*m+d*u*f,this._w=c*h*f-d*u*m;break;case"ZYX":this._x=d*h*f-c*u*m,this._y=c*u*f+d*h*m,this._z=c*h*m-d*u*f,this._w=c*h*f+d*u*m;break;case"YZX":this._x=d*h*f+c*u*m,this._y=c*u*f+d*h*m,this._z=c*h*m-d*u*f,this._w=c*h*f-d*u*m;break;case"XZY":this._x=d*h*f-c*u*m,this._y=c*u*f-d*h*m,this._z=c*h*m+d*u*f,this._w=c*h*f+d*u*m;break;default:ae("Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],s=e[4],r=e[8],o=e[1],a=e[5],l=e[9],c=e[2],h=e[6],f=e[10],d=n+a+f;if(d>0){let u=.5/Math.sqrt(d+1);this._w=.25/u,this._x=(h-l)*u,this._y=(r-c)*u,this._z=(o-s)*u}else if(n>a&&n>f){let u=2*Math.sqrt(1+n-a-f);this._w=(h-l)/u,this._x=.25*u,this._y=(s+o)/u,this._z=(r+c)/u}else if(a>f){let u=2*Math.sqrt(1+a-n-f);this._w=(r-c)/u,this._x=(s+o)/u,this._y=.25*u,this._z=(l+h)/u}else{let u=2*Math.sqrt(1+f-n-a);this._w=(o-s)/u,this._x=(r+c)/u,this._y=(l+h)/u,this._z=.25*u}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(ye(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+o*a+s*c-r*l,this._y=s*h+o*l+r*a-n*c,this._z=r*h+o*c+n*l-s*a,this._w=o*h-n*a-s*l-r*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,s=t._y,r=t._z,o=t._w,a=this.dot(t);a<0&&(n=-n,s=-s,r=-r,o=-o,a=-a);let l=1-e;if(a<.9995){let c=Math.acos(a),h=Math.sin(c);l=Math.sin(l*c)/h,e=Math.sin(e*c)/h,this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+o*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},lh=class lh{constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Qh.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Qh.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*o,this}applyQuaternion(t){let e=this.x,n=this.y,s=this.z,r=t.x,o=t.y,a=t.z,l=t.w,c=2*(o*s-a*n),h=2*(a*e-r*s),f=2*(r*n-o*e);return this.x=e+l*c+o*f-a*h,this.y=n+l*h+a*c-r*f,this.z=s+l*f+r*h-o*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=ye(this.x,t.x,e.x),this.y=ye(this.y,t.y,e.y),this.z=ye(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=ye(this.x,t,e),this.y=ye(this.y,t,e),this.z=ye(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ye(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,s=t.y,r=t.z,o=e.x,a=e.y,l=e.z;return this.x=s*l-r*a,this.y=r*o-n*l,this.z=n*a-s*o,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Zl.copy(this).projectOnVector(t),this.sub(Zl)}reflect(t){return this.sub(Zl.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(ye(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};lh.prototype.isVector3=!0;var G=lh,Zl=new G,Qh=new Zn,ch=class ch{constructor(t,e,n,s,r,o,a,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c)}set(t,e,n,s,r,o,a,l,c){let h=this.elements;return h[0]=t,h[1]=s,h[2]=a,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=o,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[3],l=n[6],c=n[1],h=n[4],f=n[7],d=n[2],u=n[5],m=n[8],x=s[0],p=s[3],g=s[6],_=s[1],M=s[4],y=s[7],T=s[2],A=s[5],v=s[8];return r[0]=o*x+a*_+l*T,r[3]=o*p+a*M+l*A,r[6]=o*g+a*y+l*v,r[1]=c*x+h*_+f*T,r[4]=c*p+h*M+f*A,r[7]=c*g+h*y+f*v,r[2]=d*x+u*_+m*T,r[5]=d*p+u*M+m*A,r[8]=d*g+u*y+m*v,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8];return e*o*h-e*a*c-n*r*h+n*a*l+s*r*c-s*o*l}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],f=h*o-a*c,d=a*l-h*r,u=c*r-o*l,m=e*f+n*d+s*u;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);let x=1/m;return t[0]=f*x,t[1]=(s*c-h*n)*x,t[2]=(a*n-s*o)*x,t[3]=d*x,t[4]=(h*e-s*l)*x,t[5]=(s*r-a*e)*x,t[6]=u*x,t[7]=(n*l-c*e)*x,t[8]=(o*e-n*r)*x,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,o,a){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*o+c*a)+o+t,-s*c,s*l,-s*(-c*o+l*a)+a+e,0,0,1),this}scale(t,e){return cr("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(Jl.makeScale(t,e)),this}rotate(t){return cr("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(Jl.makeRotation(-t)),this}translate(t,e){return cr("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(Jl.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}};ch.prototype.isMatrix3=!0;var he=ch,Jl=new he,jh=new he().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),tu=new he().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Mp(){let i={enabled:!0,workingColorSpace:dr,spaces:{},convert:function(s,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===Pe&&(s.r=pi(s.r),s.g=pi(s.g),s.b=pi(s.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===Pe&&(s.r=Rs(s.r),s.g=Rs(s.g),s.b=Rs(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===vi?pr:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,o){return s.copy(this.spaces[o].fromXYZ).multiply(this.spaces[r].toXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[dr]:{primaries:t,whitePoint:n,transfer:pr,toXYZ:jh,fromXYZ:tu,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:bn},outputColorSpaceConfig:{drawingBufferColorSpace:bn}},[bn]:{primaries:t,whitePoint:n,transfer:Pe,toXYZ:jh,fromXYZ:tu,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:bn}}}),i}var Se=Mp();function pi(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Rs(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var ms,la=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{ms===void 0&&(ms=gr("canvas")),ms.width=t.width,ms.height=t.height;let s=ms.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=ms}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=gr("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=pi(r[o]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(pi(e[n]/255)*255):e[n]=pi(e[n]);return{data:e,width:t.width,height:t.height}}else return ae("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},Sp=0,Ps=class{constructor(t=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Sp++}),this.uuid=qs(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width||0,e.height||0,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push($l(s[o].image)):r.push($l(s[o]))}else r=$l(s);n.url=r}return e||(t.images[this.uuid]=n),n}};function $l(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?la.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(ae("Texture: Unable to serialize Texture."),{})}var bp=0,Kl=new G,gn=class i extends Yn{constructor(t=i.DEFAULT_IMAGE,e=i.DEFAULT_MAPPING,n=Xn,s=Xn,r=hn,o=_i,a=Vn,l=En,c=i.DEFAULT_ANISOTROPY,h=vi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:bp++}),this.uuid=qs(),this.name="",this.source=new Ps(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=c,this.format=a,this.internalFormat=null,this.type=l,this.offset=new Lt(0,0),this.repeat=new Lt(1,1),this.center=new Lt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new he,this.generateMipmaps=!0,this.mipmapsAutoUpdate=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.isPMREMTexture=!1,this.normalized=!1}get width(){return this.source.getSize(Kl).x}get height(){return this.source.getSize(Kl).y}get depth(){return this.source.getSize(Kl).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.mipmapsAutoUpdate=t.mipmapsAutoUpdate,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isPMREMTexture=t.isPMREMTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){ae(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){ae(`Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,mipmapsAutoUpdate:this.mipmapsAutoUpdate,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Gc)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case sa:t.x=t.x-Math.floor(t.x);break;case Xn:t.x=t.x<0?0:1;break;case ra:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case sa:t.y=t.y-Math.floor(t.y);break;case Xn:t.y=t.y<0?0:1;break;case ra:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};gn.DEFAULT_IMAGE=null;gn.DEFAULT_MAPPING=Gc;gn.DEFAULT_ANISOTROPY=1;var hh=class hh{constructor(t=0,e=0,n=0,s=1){this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*s+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*s+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*s+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*s+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r,l=t.elements,c=l[0],h=l[4],f=l[8],d=l[1],u=l[5],m=l[9],x=l[2],p=l[6],g=l[10];if(Math.abs(h-d)<.01&&Math.abs(f-x)<.01&&Math.abs(m-p)<.01){if(Math.abs(h+d)<.1&&Math.abs(f+x)<.1&&Math.abs(m+p)<.1&&Math.abs(c+u+g-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let M=(c+1)/2,y=(u+1)/2,T=(g+1)/2,A=(h+d)/4,v=(f+x)/4,b=(m+p)/4;return M>y&&M>T?M<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(M),s=A/n,r=v/n):y>T?y<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(y),n=A/s,r=b/s):T<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(T),n=v/r,s=b/r),this.set(n,s,r,e),this}let _=Math.sqrt((p-m)*(p-m)+(f-x)*(f-x)+(d-h)*(d-h));return Math.abs(_)<.001&&(_=1),this.x=(p-m)/_,this.y=(f-x)/_,this.z=(d-h)/_,this.w=Math.acos((c+u+g-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=ye(this.x,t.x,e.x),this.y=ye(this.y,t.y,e.y),this.z=ye(this.z,t.z,e.z),this.w=ye(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=ye(this.x,t,e),this.y=ye(this.y,t,e),this.z=ye(this.z,t,e),this.w=ye(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ye(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};hh.prototype.isVector4=!0;var ze=hh,ca=class extends Yn{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:hn,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new ze(0,0,t,e),this.scissorTest=!1,this.viewport=new ze(0,0,t,e),this.textures=[];let s=n.count;for(let r=0;r<s;r++)this.textures[r]=new gn({width:t,height:e,depth:n.depth}),this.textures[r].isRenderTargetTexture=!0,this.textures[r].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){let e={minFilter:hn,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.mipmapsAutoUpdate!==void 0&&(e.mipmapsAutoUpdate=t.mipmapsAutoUpdate),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),t!==null&&t.renderTarget===null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;let s=Object.assign({},t.textures[e].image);this.textures[e].source=new Ps(s)}if(this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveColorBuffer=t.resolveColorBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,this.storeMultisampledColorBuffer=t.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=t.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=t.storeMultisampledStencilBuffer,t.depthTexture!==null)if(t.depthTexture.renderTarget===t){let e=t.depthTexture.clone();e.renderTarget=null,this.depthTexture=e}else this.depthTexture=t.depthTexture;else this.depthTexture=null;return this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},un=class extends ca{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},_r=class extends gn{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=tn,this.minFilter=tn,this.wrapR=Xn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var ha=class extends gn{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=tn,this.minFilter=tn,this.wrapR=Xn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(t){return super.copy(t),this.wrapR=t.wrapR,this}};var Ba=class Ba{constructor(t,e,n,s,r,o,a,l,c,h,f,d,u,m,x,p){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,o,a,l,c,h,f,d,u,m,x,p)}set(t,e,n,s,r,o,a,l,c,h,f,d,u,m,x,p){let g=this.elements;return g[0]=t,g[4]=e,g[8]=n,g[12]=s,g[1]=r,g[5]=o,g[9]=a,g[13]=l,g[2]=c,g[6]=h,g[10]=f,g[14]=d,g[3]=u,g[7]=m,g[11]=x,g[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Ba().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let e=this.elements,n=t.elements,s=1/gs.setFromMatrixColumn(t,0).length(),r=1/gs.setFromMatrixColumn(t,1).length(),o=1/gs.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,s=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),l=Math.cos(s),c=Math.sin(s),h=Math.cos(r),f=Math.sin(r);if(t.order==="XYZ"){let d=o*h,u=o*f,m=a*h,x=a*f;e[0]=l*h,e[4]=-l*f,e[8]=c,e[1]=u+m*c,e[5]=d-x*c,e[9]=-a*l,e[2]=x-d*c,e[6]=m+u*c,e[10]=o*l}else if(t.order==="YXZ"){let d=l*h,u=l*f,m=c*h,x=c*f;e[0]=d+x*a,e[4]=m*a-u,e[8]=o*c,e[1]=o*f,e[5]=o*h,e[9]=-a,e[2]=u*a-m,e[6]=x+d*a,e[10]=o*l}else if(t.order==="ZXY"){let d=l*h,u=l*f,m=c*h,x=c*f;e[0]=d-x*a,e[4]=-o*f,e[8]=m+u*a,e[1]=u+m*a,e[5]=o*h,e[9]=x-d*a,e[2]=-o*c,e[6]=a,e[10]=o*l}else if(t.order==="ZYX"){let d=o*h,u=o*f,m=a*h,x=a*f;e[0]=l*h,e[4]=m*c-u,e[8]=d*c+x,e[1]=l*f,e[5]=x*c+d,e[9]=u*c-m,e[2]=-c,e[6]=a*l,e[10]=o*l}else if(t.order==="YZX"){let d=o*l,u=o*c,m=a*l,x=a*c;e[0]=l*h,e[4]=x-d*f,e[8]=m*f+u,e[1]=f,e[5]=o*h,e[9]=-a*h,e[2]=-c*h,e[6]=u*f+m,e[10]=d-x*f}else if(t.order==="XZY"){let d=o*l,u=o*c,m=a*l,x=a*c;e[0]=l*h,e[4]=-f,e[8]=c*h,e[1]=d*f+x,e[5]=o*h,e[9]=u*f-m,e[2]=m*f-u,e[6]=a*h,e[10]=x*f+d}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(wp,t,Ap)}lookAt(t,e,n){let s=this.elements;return Mn.subVectors(t,e),Mn.lengthSq()===0&&(Mn.z=1),Mn.normalize(),Ei.crossVectors(n,Mn),Ei.lengthSq()===0&&(Math.abs(n.z)===1?Mn.x+=1e-4:Mn.z+=1e-4,Mn.normalize(),Ei.crossVectors(n,Mn)),Ei.normalize(),Mo.crossVectors(Mn,Ei),s[0]=Ei.x,s[4]=Mo.x,s[8]=Mn.x,s[1]=Ei.y,s[5]=Mo.y,s[9]=Mn.y,s[2]=Ei.z,s[6]=Mo.z,s[10]=Mn.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,o=n[0],a=n[4],l=n[8],c=n[12],h=n[1],f=n[5],d=n[9],u=n[13],m=n[2],x=n[6],p=n[10],g=n[14],_=n[3],M=n[7],y=n[11],T=n[15],A=s[0],v=s[4],b=s[8],N=s[12],I=s[1],P=s[5],O=s[9],V=s[13],R=s[2],B=s[6],k=s[10],L=s[14],W=s[3],U=s[7],X=s[11],j=s[15];return r[0]=o*A+a*I+l*R+c*W,r[4]=o*v+a*P+l*B+c*U,r[8]=o*b+a*O+l*k+c*X,r[12]=o*N+a*V+l*L+c*j,r[1]=h*A+f*I+d*R+u*W,r[5]=h*v+f*P+d*B+u*U,r[9]=h*b+f*O+d*k+u*X,r[13]=h*N+f*V+d*L+u*j,r[2]=m*A+x*I+p*R+g*W,r[6]=m*v+x*P+p*B+g*U,r[10]=m*b+x*O+p*k+g*X,r[14]=m*N+x*V+p*L+g*j,r[3]=_*A+M*I+y*R+T*W,r[7]=_*v+M*P+y*B+T*U,r[11]=_*b+M*O+y*k+T*X,r[15]=_*N+M*V+y*L+T*j,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],o=t[1],a=t[5],l=t[9],c=t[13],h=t[2],f=t[6],d=t[10],u=t[14],m=t[3],x=t[7],p=t[11],g=t[15],_=l*u-c*d,M=a*u-c*f,y=a*d-l*f,T=o*u-c*h,A=o*d-l*h,v=o*f-a*h;return e*(x*_-p*M+g*y)-n*(m*_-p*T+g*A)+s*(m*M-x*T+g*v)-r*(m*y-x*A+p*v)}determinantAffine(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[1],o=t[5],a=t[9],l=t[2],c=t[6],h=t[10];return e*(o*h-a*c)-n*(r*h-a*l)+s*(r*c-o*l)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],o=t[4],a=t[5],l=t[6],c=t[7],h=t[8],f=t[9],d=t[10],u=t[11],m=t[12],x=t[13],p=t[14],g=t[15],_=e*a-n*o,M=e*l-s*o,y=e*c-r*o,T=n*l-s*a,A=n*c-r*a,v=s*c-r*l,b=h*x-f*m,N=h*p-d*m,I=h*g-u*m,P=f*p-d*x,O=f*g-u*x,V=d*g-u*p,R=_*V-M*O+y*P+T*I-A*N+v*b;if(R===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let B=1/R;return t[0]=(a*V-l*O+c*P)*B,t[1]=(s*O-n*V-r*P)*B,t[2]=(x*v-p*A+g*T)*B,t[3]=(d*A-f*v-u*T)*B,t[4]=(l*I-o*V-c*N)*B,t[5]=(e*V-s*I+r*N)*B,t[6]=(p*y-m*v-g*M)*B,t[7]=(h*v-d*y+u*M)*B,t[8]=(o*O-a*I+c*b)*B,t[9]=(n*I-e*O-r*b)*B,t[10]=(m*A-x*y+g*_)*B,t[11]=(f*y-h*A-u*_)*B,t[12]=(a*N-o*P-l*b)*B,t[13]=(e*P-n*N+s*b)*B,t[14]=(x*M-m*T-p*_)*B,t[15]=(h*T-f*M+d*_)*B,this}scale(t){let e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),s=Math.sin(e),r=1-n,o=t.x,a=t.y,l=t.z,c=r*o,h=r*a;return this.set(c*o+n,c*a-s*l,c*l+s*a,0,c*a+s*l,h*a+n,h*l-s*o,0,c*l-s*a,h*l+s*o,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,o){return this.set(1,n,r,0,t,1,o,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){let s=this.elements,r=e._x,o=e._y,a=e._z,l=e._w,c=r+r,h=o+o,f=a+a,d=r*c,u=r*h,m=r*f,x=o*h,p=o*f,g=a*f,_=l*c,M=l*h,y=l*f,T=n.x,A=n.y,v=n.z;return s[0]=(1-(x+g))*T,s[1]=(u+y)*T,s[2]=(m-M)*T,s[3]=0,s[4]=(u-y)*A,s[5]=(1-(d+g))*A,s[6]=(p+_)*A,s[7]=0,s[8]=(m+M)*v,s[9]=(p-_)*v,s[10]=(1-(d+x))*v,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){let s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let o=gs.set(s[0],s[1],s[2]).length(),a=gs.set(s[4],s[5],s[6]).length(),l=gs.set(s[8],s[9],s[10]).length();r<0&&(o=-o),Fn.copy(this);let c=1/o,h=1/a,f=1/l;return Fn.elements[0]*=c,Fn.elements[1]*=c,Fn.elements[2]*=c,Fn.elements[4]*=h,Fn.elements[5]*=h,Fn.elements[6]*=h,Fn.elements[8]*=f,Fn.elements[9]*=f,Fn.elements[10]*=f,e.setFromRotationMatrix(Fn),n.x=o,n.y=a,n.z=l,this}makePerspective(t,e,n,s,r,o,a=In,l=!1){let c=this.elements,h=2*r/(e-t),f=2*r/(n-s),d=(e+t)/(e-t),u=(n+s)/(n-s),m,x;if(l)m=r/(o-r),x=o*r/(o-r);else if(a===In)m=-(o+r)/(o-r),x=-2*o*r/(o-r);else if(a===mr)m=-o/(o-r),x=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=f,c[9]=u,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=x,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,s,r,o,a=In,l=!1){let c=this.elements,h=2/(e-t),f=2/(n-s),d=-(e+t)/(e-t),u=-(n+s)/(n-s),m,x;if(l)m=1/(o-r),x=o/(o-r);else if(a===In)m=-2/(o-r),x=-(o+r)/(o-r);else if(a===mr)m=-1/(o-r),x=-r/(o-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=h,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=f,c[9]=0,c[13]=u,c[2]=0,c[6]=0,c[10]=m,c[14]=x,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}};Ba.prototype.isMatrix4=!0;var fe=Ba,gs=new G,Fn=new fe,wp=new G(0,0,0),Ap=new G(1,1,1),Ei=new G,Mo=new G,Mn=new G,eu=new fe,nu=new Zn,Jn=class i{constructor(t=0,e=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let s=t.elements,r=s[0],o=s[4],a=s[8],l=s[1],c=s[5],h=s[9],f=s[2],d=s[6],u=s[10];switch(e){case"XYZ":this._y=Math.asin(ye(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,u),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-ye(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,u),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-f,r),this._z=0);break;case"ZXY":this._x=Math.asin(ye(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-f,u),this._z=Math.atan2(-o,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-ye(f,-1,1)),Math.abs(f)<.9999999?(this._x=Math.atan2(d,u),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-o,c));break;case"YZX":this._z=Math.asin(ye(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-f,r)):(this._x=0,this._y=Math.atan2(a,u));break;case"XZY":this._z=Math.asin(-ye(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,u),this._y=0);break;default:ae("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return eu.makeRotationFromQuaternion(t),this.setFromRotationMatrix(eu,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return nu.setFromEuler(this),this.setFromQuaternion(nu,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Jn.DEFAULT_ORDER="XYZ";var Ls=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},Tp=0,iu=new G,_s=new Zn,li=new fe,So=new G,ir=new G,Ep=new G,Rp=new Zn,su=new G(1,0,0),ru=new G(0,1,0),ou=new G(0,0,1),au={type:"added"},Cp={type:"removed"},xs={type:"childadded",child:null},Ql={type:"childremoved",child:null},wn=class i extends Yn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Tp++}),this.uuid=qs(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let t=new G,e=new Jn,n=new Zn,s=new G(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new fe},normalMatrix:{value:new he}}),this.matrix=new fe,this.matrixWorld=new fe,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Ls,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale),this.pivot!==null&&this.position.copy(this.pivot).applyMatrix4(this.matrix).sub(this.pivot)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return _s.setFromAxisAngle(t,e),this.quaternion.multiply(_s),this}rotateOnWorldAxis(t,e){return _s.setFromAxisAngle(t,e),this.quaternion.premultiply(_s),this}rotateX(t){return this.rotateOnAxis(su,t)}rotateY(t){return this.rotateOnAxis(ru,t)}rotateZ(t){return this.rotateOnAxis(ou,t)}translateOnAxis(t,e){return iu.copy(t).applyQuaternion(this.quaternion),this.position.add(iu.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(su,t)}translateY(t){return this.translateOnAxis(ru,t)}translateZ(t){return this.translateOnAxis(ou,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(li.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?So.copy(t):So.set(t,e,n);let s=this.parent;this.updateWorldMatrix(!0,!1),ir.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?li.lookAt(ir,So,this.up):li.lookAt(So,ir,this.up),this.quaternion.setFromRotationMatrix(li),s&&(li.extractRotation(s.matrixWorld),_s.setFromRotationMatrix(li),this.quaternion.premultiply(_s.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(ce("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(au),xs.child=t,this.dispatchEvent(xs),xs.child=null):ce("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(Cp),Ql.child=t,this.dispatchEvent(Ql),Ql.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),li.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),li.multiply(t.parent.matrixWorld)),t.applyMatrix4(li),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(au),xs.child=t,this.dispatchEvent(xs),xs.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){let o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ir,t,Ep),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ir,Rp,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}intersectsFrustum(){return!0}traverse(t){t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let e=t.x,n=t.y,s=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*s,r[13]+=n-r[1]*e-r[5]*n-r[9]*s,r[14]+=s-r[2]*e-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){let s=this.parent;if(t===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){let r=this.children;for(let o=0,a=r.length;o<a;o++)r[o].updateWorldMatrix(!1,!0,n)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,s.name=this.name,s.castShadow=this.castShadow,s.receiveShadow=this.receiveShadow,s.visible=this.visible,s.frustumCulled=this.frustumCulled,s.renderOrder=this.renderOrder,s.static=this.static,s.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(a=>({...a})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(a,l){return a[l.uuid]===void 0&&(a[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let l=a.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){let f=l[c];r(t.shapes,f)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let l=0,c=this.material.length;l<c;l++)a.push(r(t.materials,this.material[l]));s.material=a}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){let l=this.animations[a];s.animations.push(r(t.animations,l))}}if(e){let a=o(t.geometries),l=o(t.materials),c=o(t.textures),h=o(t.images),f=o(t.shapes),d=o(t.skeletons),u=o(t.animations),m=o(t.nodes);a.length>0&&(n.geometries=a),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),f.length>0&&(n.shapes=f),d.length>0&&(n.skeletons=d),u.length>0&&(n.animations=u),m.length>0&&(n.nodes=m)}return n.object=s,n;function o(a){let l=[];for(let c in a){let h=a[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let s=t.children[n];this.add(s.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}};wn.DEFAULT_UP=new G(0,1,0);wn.DEFAULT_MATRIX_AUTO_UPDATE=!0;wn.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var qn=class extends wn{constructor(){super(),this.isGroup=!0,this.type="Group"}},Ip={type:"move"},Ns=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new qn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new qn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new G,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new G),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new qn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new G,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new G,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,o=null,a=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){o=!0;for(let x of t.hand.values()){let p=e.getJointPose(x,n),g=this._getHandJoint(c,x);p!==null&&(g.matrix.fromArray(p.transform.matrix),g.matrix.decompose(g.position,g.quaternion,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=p.radius),g.visible=p!==null}let h=c.joints["index-finger-tip"],f=c.joints["thumb-tip"],d=h.position.distanceTo(f.position),u=.02,m=.005;c.inputState.pinching&&d>u+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&d<=u-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.quaternion,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));a!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.quaternion,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(Ip)))}return a!==null&&(a.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new qn;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},mf={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Ri={h:0,s:0,l:0},bo={h:0,s:0,l:0};function jl(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}var Ae=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=bn){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,Se.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=Se.workingColorSpace){return this.r=t,this.g=e,this.b=n,Se.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=Se.workingColorSpace){if(t=xp(t,1),e=ye(e,0,1),n=ye(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=jl(o,r,t+1/3),this.g=jl(o,r,t),this.b=jl(o,r,t-1/3)}return Se.colorSpaceToWorking(this,s),this}setStyle(t,e=bn){function n(r){r!==void 0&&parseFloat(r)<1&&ae("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseFloat(r[1]))/100,Math.min(100,parseFloat(r[2]))/100,Math.min(100,parseFloat(r[3]))/100,e);break;case"hsl":case"hsla":if(r=/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:ae("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);ae("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=bn){let n=mf[t.toLowerCase()];return n!==void 0?this.setHex(n,e):ae("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=pi(t.r),this.g=pi(t.g),this.b=pi(t.b),this}copyLinearToSRGB(t){return this.r=Rs(t.r),this.g=Rs(t.g),this.b=Rs(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=bn){return Se.workingToColorSpace(rn.copy(this),t),Math.round(ye(rn.r*255,0,255))*65536+Math.round(ye(rn.g*255,0,255))*256+Math.round(ye(rn.b*255,0,255))}getHexString(t=bn){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=Se.workingColorSpace){Se.workingToColorSpace(rn.copy(this),e);let n=rn.r,s=rn.g,r=rn.b,o=Math.max(n,s,r),a=Math.min(n,s,r),l,c,h=(a+o)/2;if(a===o)l=0,c=0;else{let f=o-a;switch(c=h<=.5?f/(o+a):f/(2-o-a),o){case n:l=(s-r)/f+(s<r?6:0);break;case s:l=(r-n)/f+2;break;case r:l=(n-s)/f+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=Se.workingColorSpace){return Se.workingToColorSpace(rn.copy(this),e),t.r=rn.r,t.g=rn.g,t.b=rn.b,t}getStyle(t=bn){Se.workingToColorSpace(rn.copy(this),t);let e=rn.r,n=rn.g,s=rn.b;return t!==bn?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(Ri),this.setHSL(Ri.h+t,Ri.s+e,Ri.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(Ri),t.getHSL(bo);let n=Yl(Ri.h,bo.h,e),s=Yl(Ri.s,bo.s,e),r=Yl(Ri.l,bo.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},rn=new Ae;Ae.NAMES=mf;var xr=class extends wn{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Jn,this.environmentIntensity=1,this.environmentRotation=new Jn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),this.background=t.background!==null?t.background.clone():null,this.environment=t.environment!==null?t.environment.clone():null,this.fog=t.fog!==null?t.fog.clone():null,this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),this.overrideMaterial=t.overrideMaterial!==null?t.overrideMaterial.clone():null,this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),e.object.backgroundBlurriness=this.backgroundBlurriness,e.object.backgroundIntensity=this.backgroundIntensity,e.object.backgroundRotation=this.backgroundRotation.toArray(),e.object.environmentIntensity=this.environmentIntensity,e.object.environmentRotation=this.environmentRotation.toArray(),e}},Un=new G,ci=new G,tc=new G,hi=new G,vs=new G,ys=new G,lu=new G,ec=new G,nc=new G,ic=new G,sc=new ze,rc=new ze,oc=new ze,di=class i{constructor(t=new G,e=new G,n=new G){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),Un.subVectors(t,e),s.cross(Un);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){Un.subVectors(s,e),ci.subVectors(n,e),tc.subVectors(t,e);let o=Un.dot(Un),a=Un.dot(ci),l=Un.dot(tc),c=ci.dot(ci),h=ci.dot(tc),f=o*c-a*a;if(f===0)return r.set(0,0,0),null;let d=1/f,u=(c*l-a*h)*d,m=(o*h-a*l)*d;return r.set(1-u-m,m,u)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,hi)===null?!1:hi.x>=0&&hi.y>=0&&hi.x+hi.y<=1}static getInterpolation(t,e,n,s,r,o,a,l){return this.getBarycoord(t,e,n,s,hi)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,hi.x),l.addScaledVector(o,hi.y),l.addScaledVector(a,hi.z),l)}static getInterpolatedAttribute(t,e,n,s,r,o){return sc.setScalar(0),rc.setScalar(0),oc.setScalar(0),sc.fromBufferAttribute(t,e),rc.fromBufferAttribute(t,n),oc.fromBufferAttribute(t,s),o.setScalar(0),o.addScaledVector(sc,r.x),o.addScaledVector(rc,r.y),o.addScaledVector(oc,r.z),o}static isFrontFacing(t,e,n,s){return Un.subVectors(n,e),ci.subVectors(t,e),Un.cross(ci).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Un.subVectors(this.c,this.b),ci.subVectors(this.a,this.b),Un.cross(ci).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return i.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return i.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return i.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return i.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return i.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,s=this.b,r=this.c,o,a;vs.subVectors(s,n),ys.subVectors(r,n),ec.subVectors(t,n);let l=vs.dot(ec),c=ys.dot(ec);if(l<=0&&c<=0)return e.copy(n);nc.subVectors(t,s);let h=vs.dot(nc),f=ys.dot(nc);if(h>=0&&f<=h)return e.copy(s);let d=l*f-h*c;if(d<=0&&l>=0&&h<=0&&l-h>0)return o=l/(l-h),e.copy(n).addScaledVector(vs,o);ic.subVectors(t,r);let u=vs.dot(ic),m=ys.dot(ic);if(m>=0&&u<=m)return e.copy(r);let x=u*c-l*m;if(x<=0&&c>=0&&m<=0)return a=c/(c-m),e.copy(n).addScaledVector(ys,a);let p=h*m-u*f;if(p<=0&&f-h>=0&&u-m>=0)return lu.subVectors(r,s),a=(f-h)/(f-h+(u-m)),e.copy(s).addScaledVector(lu,a);let g=1/(p+x+d);return o=x*g,a=d*g,e.copy(n).addScaledVector(vs,o).addScaledVector(ys,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},Li=class{constructor(t=new G(1/0,1/0,1/0),e=new G(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(On.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(On.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=On.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0&&t.isBatchedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,On):On.fromBufferAttribute(r,o),On.applyMatrix4(t.matrixWorld),this.expandByPoint(On);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),wo.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),wo.copy(n.boundingBox)),wo.applyMatrix4(t.matrixWorld),this.union(wo)}let s=t.children;for(let r=0,o=s.length;r<o;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,On),On.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(sr),Ao.subVectors(this.max,sr),Ms.subVectors(t.a,sr),Ss.subVectors(t.b,sr),bs.subVectors(t.c,sr),Ci.subVectors(Ss,Ms),Ii.subVectors(bs,Ss),Vi.subVectors(Ms,bs);let e=[0,-Ci.z,Ci.y,0,-Ii.z,Ii.y,0,-Vi.z,Vi.y,Ci.z,0,-Ci.x,Ii.z,0,-Ii.x,Vi.z,0,-Vi.x,-Ci.y,Ci.x,0,-Ii.y,Ii.x,0,-Vi.y,Vi.x,0];return!ac(e,Ms,Ss,bs,Ao)||(e=[1,0,0,0,1,0,0,0,1],!ac(e,Ms,Ss,bs,Ao))?!1:(To.crossVectors(Ci,Ii),e=[To.x,To.y,To.z],ac(e,Ms,Ss,bs,Ao))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,On).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(On).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(ui[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),ui[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),ui[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),ui[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),ui[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),ui[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),ui[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),ui[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(ui),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},ui=[new G,new G,new G,new G,new G,new G,new G,new G],On=new G,wo=new Li,Ms=new G,Ss=new G,bs=new G,Ci=new G,Ii=new G,Vi=new G,sr=new G,Ao=new G,To=new G,Hi=new G;function ac(i,t,e,n,s){for(let r=0,o=i.length-3;r<=o;r+=3){Hi.fromArray(i,r);let a=s.x*Math.abs(Hi.x)+s.y*Math.abs(Hi.y)+s.z*Math.abs(Hi.z),l=t.dot(Hi),c=e.dot(Hi),h=n.dot(Hi);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>a)return!1}return!0}var qe=new G,Eo=new Lt,Pp=0,Ne=class extends Yn{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Pp++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=cf,this.updateRanges=[],this.gpuType=kn,this.version=0,this._normalizationScale=t!==void 0?eh(t):void 0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this._normalizationScale=t._normalizationScale,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Eo.fromBufferAttribute(this,e),Eo.applyMatrix3(t),this.setXY(e,Eo.x,Eo.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)qe.fromBufferAttribute(this,e),qe.applyMatrix3(t),this.setXYZ(e,qe.x,qe.y,qe.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)qe.fromBufferAttribute(this,e),qe.applyMatrix4(t),this.setXYZ(e,qe.x,qe.y,qe.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)qe.fromBufferAttribute(this,e),qe.applyNormalMatrix(t),this.setXYZ(e,qe.x,qe.y,qe.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)qe.fromBufferAttribute(this,e),qe.transformDirection(t),this.setXYZ(e,qe.x,qe.y,qe.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=this._denormalize(n)),n}setComponent(t,e,n){return this.normalized&&(n=this._normalize(n)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=this._denormalize(e)),e}setX(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=this._denormalize(e)),e}setY(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=this._denormalize(e)),e}setZ(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=this._denormalize(e)),e}setW(t,e){return this.normalized&&(e=this._normalize(e)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=this._normalize(e),n=this._normalize(n)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=this._normalize(e),n=this._normalize(n),s=this._normalize(s)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=this._normalize(e),n=this._normalize(n),s=this._normalize(s),r=this._normalize(r)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return t.name=this.name,t.usage=this.usage,t.gpuType=this.gpuType,t}dispose(){this.dispatchEvent({type:"dispose"})}_denormalize(t){let e=this._normalizationScale;return e!==void 0?Math.max(t/e,-1):vp(t,this.array)}_normalize(t){let e=this._normalizationScale;return e!==void 0?Math.round(t*e):yp(t,this.array)}};var vr=class extends Ne{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var yr=class extends Ne{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var we=class extends Ne{constructor(t,e,n){super(new Float32Array(t),e,n)}},Lp=new Li,rr=new G,lc=new G,Yi=class{constructor(t=new G,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):Lp.setFromPoints(t).getCenter(n);let s=0;for(let r=0,o=t.length;r<o;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;rr.subVectors(t,this.center);let e=rr.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector(rr,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(lc.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(rr.copy(t.center).add(lc)),this.expandByPoint(rr.copy(t.center).sub(lc))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},Np=0,Cn=new fe,cc=new wn,ws=new G,Sn=new Li,or=new Li,je=new G,Ue=class i extends Yn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Np++}),this.uuid=qs(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(gp(t)?yr:vr)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new he().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Cn.makeRotationFromQuaternion(t),this.applyMatrix4(Cn),this}rotateX(t){return Cn.makeRotationX(t),this.applyMatrix4(Cn),this}rotateY(t){return Cn.makeRotationY(t),this.applyMatrix4(Cn),this}rotateZ(t){return Cn.makeRotationZ(t),this.applyMatrix4(Cn),this}translate(t,e,n){return Cn.makeTranslation(t,e,n),this.applyMatrix4(Cn),this}scale(t,e,n){return Cn.makeScale(t,e,n),this.applyMatrix4(Cn),this}lookAt(t){return cc.lookAt(t),cc.updateMatrix(),this.applyMatrix4(cc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(ws).negate(),this.translate(ws.x,ws.y,ws.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let s=0,r=t.length;s<r;s++){let o=t[s];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new we(n,3))}else{let n=Math.min(t.length,e.count);for(let s=0;s<n;s++){let r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&ae("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Li);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){ce("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new G(-1/0,-1/0,-1/0),new G(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){let r=e[n];Sn.setFromBufferAttribute(r),this.morphTargetsRelative?(je.addVectors(this.boundingBox.min,Sn.min),this.boundingBox.expandByPoint(je),je.addVectors(this.boundingBox.max,Sn.max),this.boundingBox.expandByPoint(je)):(this.boundingBox.expandByPoint(Sn.min),this.boundingBox.expandByPoint(Sn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&ce('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Yi);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){ce("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new G,1/0);return}if(t){let n=this.boundingSphere.center;if(Sn.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){let a=e[r];or.setFromBufferAttribute(a),this.morphTargetsRelative?(je.addVectors(Sn.min,or.min),Sn.expandByPoint(je),je.addVectors(Sn.max,or.max),Sn.expandByPoint(je)):(Sn.expandByPoint(or.min),Sn.expandByPoint(or.max))}Sn.getCenter(n);let s=0;for(let r=0,o=t.count;r<o;r++)je.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(je));if(e)for(let r=0,o=e.length;r<o;r++){let a=e[r],l=this.morphTargetsRelative;for(let c=0,h=a.count;c<h;c++)je.fromBufferAttribute(a,c),l&&(ws.fromBufferAttribute(t,c),je.add(ws)),s=Math.max(s,n.distanceToSquared(je))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&ce('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){ce("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,s=e.normal,r=e.uv,o=this.getAttribute("tangent");(o===void 0||o.count!==n.count)&&(o=new Ne(new Float32Array(4*n.count),4),this.setAttribute("tangent",o));let a=[],l=[],c=new Uint8Array(n.count);for(let N=0;N<n.count;N++)a[N]=new G,l[N]=new G;let h=new G,f=new G,d=new G,u=new Lt,m=new Lt,x=new Lt,p=new G,g=new G;function _(N,I,P){c[N]=c[I]=c[P]=1,h.fromBufferAttribute(n,N),f.fromBufferAttribute(n,I),d.fromBufferAttribute(n,P),u.fromBufferAttribute(r,N),m.fromBufferAttribute(r,I),x.fromBufferAttribute(r,P),f.sub(h),d.sub(h),m.sub(u),x.sub(u);let O=1/(m.x*x.y-x.x*m.y);isFinite(O)&&(p.copy(f).multiplyScalar(x.y).addScaledVector(d,-m.y).multiplyScalar(O),g.copy(d).multiplyScalar(m.x).addScaledVector(f,-x.x).multiplyScalar(O),a[N].add(p),a[I].add(p),a[P].add(p),l[N].add(g),l[I].add(g),l[P].add(g))}let M=this.groups;M.length===0&&(M=[{start:0,count:t.count}]);for(let N=0,I=M.length;N<I;++N){let P=M[N],O=P.start,V=P.count;for(let R=O,B=O+V;R<B;R+=3)_(t.getX(R+0),t.getX(R+1),t.getX(R+2))}let y=new G,T=new G,A=new G,v=new G;function b(N){A.fromBufferAttribute(s,N),v.copy(A);let I=a[N];y.copy(I),y.sub(A.multiplyScalar(A.dot(I))).normalize(),T.crossVectors(v,I);let O=T.dot(l[N])<0?-1:1;o.setXYZW(N,y.x,y.y,y.z,O)}for(let N=0,I=n.count;N<I;++N)c[N]&&b(N);this._transformed=!0}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new Ne(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let d=0,u=n.count;d<u;d++)n.setXYZ(d,0,0,0);let s=new G,r=new G,o=new G,a=new G,l=new G,c=new G,h=new G,f=new G;if(t)for(let d=0,u=t.count;d<u;d+=3){let m=t.getX(d+0),x=t.getX(d+1),p=t.getX(d+2);s.fromBufferAttribute(e,m),r.fromBufferAttribute(e,x),o.fromBufferAttribute(e,p),h.subVectors(o,r),f.subVectors(s,r),h.cross(f),a.fromBufferAttribute(n,m),l.fromBufferAttribute(n,x),c.fromBufferAttribute(n,p),a.add(h),l.add(h),c.add(h),n.setXYZ(m,a.x,a.y,a.z),n.setXYZ(x,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let d=0,u=e.count;d<u;d+=3)s.fromBufferAttribute(e,d+0),r.fromBufferAttribute(e,d+1),o.fromBufferAttribute(e,d+2),h.subVectors(o,r),f.subVectors(s,r),h.cross(f),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)je.fromBufferAttribute(t,e),je.normalize(),t.setXYZ(e,je.x,je.y,je.z)}toNonIndexed(){function t(a,l){let c=a.array,h=a.itemSize,f=a.normalized,d=new c.constructor(l.length*h),u=0,m=0;for(let x=0,p=l.length;x<p;x++){a.isInterleavedBufferAttribute?u=l[x]*a.data.stride+a.offset:u=l[x]*h;for(let g=0;g<h;g++)d[m++]=c[u++]}return new Ne(d,h,f)}if(this.index===null)return ae("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new i,n=this.index.array,s=this.attributes;for(let a in s){let l=s[a],c=t(l,n);e.setAttribute(a,c)}let r=this.morphAttributes;for(let a in r){let l=[],c=r[a];for(let h=0,f=c.length;h<f;h++){let d=c[h],u=t(d,n);l.push(u)}e.morphAttributes[a]=l}e.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,l=o.length;a<l;a++){let c=o[a];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,t.name=this.name,Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let c=n[l];t.data.attributes[l]=c.toJSON(t.data)}let s={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],h=[];for(let f=0,d=c.length;f<d;f++){let u=c[f];h.push(u.toJSON(t.data))}h.length>0&&(s[l]=h,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(t.data.boundingSphere=a.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let s=t.attributes;for(let c in s){let h=s[c];this.setAttribute(c,h.clone(e))}let r=t.morphAttributes;for(let c in r){let h=[],f=r[c];for(let d=0,u=f.length;d<u;d++)h.push(f[d].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;let o=t.groups;for(let c=0,h=o.length;c<h;c++){let f=o[c];this.addGroup(f.start,f.count,f.materialIndex)}let a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var hc=new G,Dp=new G,Fp=new he,Bn=class{constructor(t=new G(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let s=hc.subVectors(n,e).cross(Dp.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){let s=t.delta(hc),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let o=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(o<0||o>1)?null:e.copy(t.start).addScaledVector(s,o)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||Fp.getNormalMatrix(t),s=this.coplanarPoint(hc).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(t){return this.normal.fromArray(t.normal),this.constant=t.constant,this}},Up=0,Ni=class extends Yn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Up++}),this.uuid=qs(),this.name="",this.type="Material",this.blending=Vs,this.side=Kn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Pc,this.blendDst=Lc,this.blendEquation=ji,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ae(0,0,0),this.blendAlpha=0,this.depthFunc=Cs,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=nf,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Jo,this.stencilZFail=Jo,this.stencilZPass=Jo,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){ae(`Material: parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){ae(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.diffuseRoughness!==void 0&&(n.diffuseRoughness=this.diffuseRoughness),this.diffuseRoughnessMap&&this.diffuseRoughnessMap.isTexture&&(n.diffuseRoughnessMap=this.diffuseRoughnessMap.toJSON(t).uuid),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessMinimum!==void 0&&(n.iridescenceThicknessMinimum=this.iridescenceThicknessMinimum),this.iridescenceThicknessMaximum!==void 0&&(n.iridescenceThicknessMaximum=this.iridescenceThicknessMaximum),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(r=>r.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let o=[];for(let a in r){let l=r[a];delete l.metadata,o.push(l)}return o}if(e){let r=s(t.textures),o=s(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new Ae().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.diffuseRoughness!==void 0&&(this.diffuseRoughness=t.diffuseRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.retroreflectivity!==void 0&&(this.retroreflectivity=t.retroreflectivity),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessMinimum!==void 0&&(this.iridescenceThicknessMinimum=t.iridescenceThicknessMinimum),t.iridescenceThicknessMaximum!==void 0&&(this.iridescenceThicknessMaximum=t.iridescenceThicknessMaximum),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessMinimum=t.iridescenceThicknessRange[0],this.iridescenceThicknessMaximum=t.iridescenceThicknessRange[1]),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.clippingPlanes!==void 0&&(this.clippingPlanes=t.clippingPlanes.map(n=>new Bn().fromJSON(n))),t.clipIntersection!==void 0&&(this.clipIntersection=t.clipIntersection),t.clipShadows!==void 0&&(this.clipShadows=t.clipShadows),t.depthPacking!==void 0&&(this.depthPacking=t.depthPacking),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.linecap!==void 0&&(this.linecap=t.linecap),t.linejoin!==void 0&&(this.linejoin=t.linejoin),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new Lt().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Lt().fromArray(t.clearcoatNormalScale)),t.diffuseRoughnessMap!==void 0&&(this.diffuseRoughnessMap=e[t.diffuseRoughnessMap]||null),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}};var fi=new G,uc=new G,Ro=new G,Co=new G,Ds=class{constructor(t=new G,e=new G(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,fi)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=fi.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(fi.copy(this.origin).addScaledVector(this.direction,e),fi.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){uc.copy(t).add(e).multiplyScalar(.5),Ro.copy(e).sub(t).normalize(),Co.copy(this.origin).sub(uc);let r=t.distanceTo(e)*.5,o=-this.direction.dot(Ro),a=Co.dot(this.direction),l=-Co.dot(Ro),c=Co.lengthSq(),h=Math.abs(1-o*o),f,d,u,m;if(h>0)if(f=o*l-a,d=o*a-l,m=r*h,f>=0)if(d>=-m)if(d<=m){let x=1/h;f*=x,d*=x,u=f*(f+o*d+2*a)+d*(o*f+d+2*l)+c}else d=r,f=Math.max(0,-(o*d+a)),u=-f*f+d*(d+2*l)+c;else d=-r,f=Math.max(0,-(o*d+a)),u=-f*f+d*(d+2*l)+c;else d<=-m?(f=Math.max(0,-(-o*r+a)),d=f>0?-r:Math.min(Math.max(-r,-l),r),u=-f*f+d*(d+2*l)+c):d<=m?(f=0,d=Math.min(Math.max(-r,-l),r),u=d*(d+2*l)+c):(f=Math.max(0,-(o*r+a)),d=f>0?r:Math.min(Math.max(-r,-l),r),u=-f*f+d*(d+2*l)+c);else d=o>0?-r:r,f=Math.max(0,-(o*d+a)),u=-f*f+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,f),s&&s.copy(uc).addScaledVector(Ro,d),u}intersectSphere(t,e){if(t.radius<0)return null;fi.subVectors(t.center,this.origin);let n=fi.dot(this.direction),s=fi.dot(fi)-n*n,r=t.radius*t.radius;if(s>r)return null;let o=Math.sqrt(r-s),a=n-o,l=n+o;return l<0?null:a<0?this.at(l,e):this.at(a,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,o,a,l,c=1/this.direction.x,h=1/this.direction.y,f=1/this.direction.z,d=this.origin;return c>=0?(n=(t.min.x-d.x)*c,s=(t.max.x-d.x)*c):(n=(t.max.x-d.x)*c,s=(t.min.x-d.x)*c),h>=0?(r=(t.min.y-d.y)*h,o=(t.max.y-d.y)*h):(r=(t.max.y-d.y)*h,o=(t.min.y-d.y)*h),n>o||r>s||((r>n||isNaN(n))&&(n=r),(o<s||isNaN(s))&&(s=o),f>=0?(a=(t.min.z-d.z)*f,l=(t.max.z-d.z)*f):(a=(t.max.z-d.z)*f,l=(t.min.z-d.z)*f),n>l||a>s)||((a>n||n!==n)&&(n=a),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,fi)!==null}intersectTriangle(t,e,n,s,r){let o=this.origin,a=this.direction,l=a.x,c=a.y,h=a.z,f=t.x-o.x,d=t.y-o.y,u=t.z-o.z,m=e.x-o.x,x=e.y-o.y,p=e.z-o.z,g=n.x-o.x,_=n.y-o.y,M=n.z-o.z,y=Math.abs(l),T=Math.abs(c),A=Math.abs(h),v,b,N,I,P,O,V,R,B,k,L,W;if(y>=T&&y>=A?(N=l,O=f,B=m,W=g,l>=0?(v=c,b=h,I=d,P=u,V=x,R=p,k=_,L=M):(v=h,b=c,I=u,P=d,V=p,R=x,k=M,L=_)):T>=A?(N=c,O=d,B=x,W=_,c>=0?(v=h,b=l,I=u,P=f,V=p,R=m,k=M,L=g):(v=l,b=h,I=f,P=u,V=m,R=p,k=g,L=M)):(N=h,O=u,B=p,W=M,h>=0?(v=l,b=c,I=f,P=d,V=m,R=x,k=g,L=_):(v=c,b=l,I=d,P=f,V=x,R=m,k=_,L=g)),N===0)return null;let U=v/N,X=b/N,j=1/N,_t=I-U*O,Dt=P-X*O,Z=V-U*B,ot=R-X*B,xt=k-U*W,Gt=L-X*W,tt=xt*ot-Gt*Z,Jt=_t*Gt-Dt*xt,se=Z*Dt-ot*_t;if(s){if(tt<0||Jt<0||se<0)return null}else if((tt<0||Jt<0||se<0)&&(tt>0||Jt>0||se>0))return null;let lt=tt+Jt+se;if(lt===0)return null;let ee=j*(tt*O+Jt*B+se*W);return(lt>0?ee<0:ee>0)?null:this.at(ee/lt,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},ua=class extends Ni{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ae(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Jn,this.combine=Nc,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},cu=new fe,Wi=new Ds,Io=new Yi,hu=new G,Po=new G,Lo=new G,No=new G,fc=new G,Do=new G,uu=new G,Fo=new G,_n=class extends wn{constructor(t=new Ue,e=new ua){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0?this.morphTargetInfluences=t.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,t.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){let a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(s,t);let a=this.morphTargetInfluences;if(r&&a){Do.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let h=a[l],f=r[l];h!==0&&(fc.fromBufferAttribute(f,t),o?Do.addScaledVector(fc,h):Do.addScaledVector(fc.sub(e),h))}e.add(Do)}return e}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Io.copy(n.boundingSphere),Io.applyMatrix4(r),Wi.copy(t.ray).recast(t.near),!(Io.containsPoint(Wi.origin)===!1&&(Wi.intersectSphere(Io,hu)===null||Wi.origin.distanceToSquared(hu)>(t.far-t.near)**2))&&(cu.copy(r).invert(),Wi.copy(t.ray).applyMatrix4(cu),!(n.boundingBox!==null&&Wi.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Wi)))}_computeIntersections(t,e,n){let s,r=this.geometry,o=this.material,a=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,f=r.attributes.normal,d=r.groups,u=r.drawRange;if(a!==null)if(Array.isArray(o))for(let m=0,x=d.length;m<x;m++){let p=d[m],g=o[p.materialIndex],_=Math.max(p.start,u.start),M=Math.min(a.count,Math.min(p.start+p.count,u.start+u.count));for(let y=_,T=M;y<T;y+=3){let A=a.getX(y),v=a.getX(y+1),b=a.getX(y+2);s=Uo(this,g,t,n,c,h,f,A,v,b),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=p.materialIndex,e.push(s))}}else{let m=Math.max(0,u.start),x=Math.min(a.count,u.start+u.count);for(let p=m,g=x;p<g;p+=3){let _=a.getX(p),M=a.getX(p+1),y=a.getX(p+2);s=Uo(this,o,t,n,c,h,f,_,M,y),s&&(s.faceIndex=Math.floor(p/3),e.push(s))}}else if(l!==void 0)if(Array.isArray(o))for(let m=0,x=d.length;m<x;m++){let p=d[m],g=o[p.materialIndex],_=Math.max(p.start,u.start),M=Math.min(l.count,Math.min(p.start+p.count,u.start+u.count));for(let y=_,T=M;y<T;y+=3){let A=y,v=y+1,b=y+2;s=Uo(this,g,t,n,c,h,f,A,v,b),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=p.materialIndex,e.push(s))}}else{let m=Math.max(0,u.start),x=Math.min(l.count,u.start+u.count);for(let p=m,g=x;p<g;p+=3){let _=p,M=p+1,y=p+2;s=Uo(this,o,t,n,c,h,f,_,M,y),s&&(s.faceIndex=Math.floor(p/3),e.push(s))}}}};function Op(i,t,e,n,s,r,o,a){let l;if(t.side===dn?l=n.intersectTriangle(o,r,s,!0,a):l=n.intersectTriangle(s,r,o,t.side===Kn,a),l===null)return null;Fo.copy(a),Fo.applyMatrix4(i.matrixWorld);let c=e.ray.origin.distanceTo(Fo);return c<e.near||c>e.far?null:{distance:c,point:Fo.clone(),object:i}}function Uo(i,t,e,n,s,r,o,a,l,c){i.getVertexPosition(a,Po),i.getVertexPosition(l,Lo),i.getVertexPosition(c,No);let h=Op(i,t,e,n,Po,Lo,No,uu);if(h){let f=new G;di.getBarycoord(uu,Po,Lo,No,f),s&&(h.uv=di.getInterpolatedAttribute(s,a,l,c,f,new Lt)),r&&(h.uv1=di.getInterpolatedAttribute(r,a,l,c,f,new Lt)),o&&(h.normal=di.getInterpolatedAttribute(o,a,l,c,f,new G),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let d={a,b:l,c,normal:new G,materialIndex:0};di.getNormal(Po,Lo,No,d.normal),h.face=d,h.barycoord=f}return h}var fa=class extends gn{constructor(t=null,e=1,n=1,s,r,o,a,l,c=tn,h=tn,f,d){super(null,o,a,l,c,h,s,r,f,d),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var Xi=new Yi,Bp=new Lt(.5,.5),Oo=new G,Zi=class{constructor(t=new Bn,e=new Bn,n=new Bn,s=new Bn,r=new Bn,o=new Bn){this.planes=[t,e,n,s,r,o]}set(t,e,n,s,r,o){let a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=In,n=!1){let s=this.planes,r=t.elements,o=r[0],a=r[1],l=r[2],c=r[3],h=r[4],f=r[5],d=r[6],u=r[7],m=r[8],x=r[9],p=r[10],g=r[11],_=r[12],M=r[13],y=r[14],T=r[15];if(s[0].setComponents(c-o,u-h,g-m,T-_).normalize(),s[1].setComponents(c+o,u+h,g+m,T+_).normalize(),s[2].setComponents(c+a,u+f,g+x,T+M).normalize(),s[3].setComponents(c-a,u-f,g-x,T-M).normalize(),n)s[4].setComponents(l,d,p,y).normalize(),s[5].setComponents(c-l,u-d,g-p,T-y).normalize();else if(s[4].setComponents(c-l,u-d,g-p,T-y).normalize(),e===In)s[5].setComponents(c+l,u+d,g+p,T+y).normalize();else if(e===mr)s[5].setComponents(l,d,p,y).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),Xi.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),Xi.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(Xi)}intersectsSprite(t){Xi.center.set(0,0,0);let e=Bp.distanceTo(t.center);return Xi.radius=.7071067811865476+e,Xi.applyMatrix4(t.matrixWorld),this.intersectsSphere(Xi)}intersectsSphere(t){let e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let s=e[n];if(Oo.x=s.normal.x>0?t.max.x:t.min.x,Oo.y=s.normal.y>0?t.max.y:t.min.y,Oo.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(Oo)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},fu=new fe,da=class i{constructor(){this.coordinateSystem=In,this._frustums=[],this._count=0}setFromArrayCamera(t){let e=t.cameras,n=this._frustums;for(let s=0;s<e.length;s++){let r=e[s];fu.multiplyMatrices(r.projectionMatrix,r.matrixWorldInverse),n[s]===void 0&&(n[s]=new Zi),n[s].setFromProjectionMatrix(fu,r.coordinateSystem,r.reversedDepth)}return this._count=e.length,this}getFrustum(t){return this._frustums[t]}intersectsObject(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsObject(t))return!0;return!1}intersectsSprite(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsSprite(t))return!0;return!1}intersectsSphere(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsSphere(t))return!0;return!1}intersectsBox(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].intersectsBox(t))return!0;return!1}containsPoint(t){let e=this._frustums;for(let n=0;n<this._count;n++)if(e[n].containsPoint(t))return!0;return!1}copy(t){this.coordinateSystem=t.coordinateSystem;let e=this._frustums,n=t._frustums;for(let s=0;s<t._count;s++)e[s]===void 0&&(e[s]=new Zi),e[s].copy(n[s]);return this._count=t._count,this}clone(){return new i().copy(this)}};var pa=class extends Ni{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Ae(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}},ma=new G,ga=new G,du=new fe,ar=new Ds,Bo=new Yi,dc=new G,pu=new G,_a=class extends wn{constructor(t=new Ue,e=new pa){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0?this.morphTargetInfluences=t.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,t.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[0];for(let s=1,r=e.count;s<r;s++)ma.fromBufferAttribute(e,s-1),ga.fromBufferAttribute(e,s),n[s]=n[s-1],n[s]+=ma.distanceTo(ga);t.setAttribute("lineDistance",new we(n,1))}else ae("Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}intersectsFrustum(t){return t.intersectsObject(this)}raycast(t,e){let n=this.geometry,s=this.matrixWorld,r=t.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Bo.copy(n.boundingSphere),Bo.applyMatrix4(s),Bo.radius+=r,t.ray.intersectsSphere(Bo)===!1)return;du.copy(s).invert(),ar.copy(t.ray).applyMatrix4(du);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=a*a,c=this.isLineSegments?2:1,h=n.index,d=n.attributes.position;if(h!==null){let u=Math.max(0,o.start),m=Math.min(h.count,o.start+o.count);for(let x=u,p=m-1;x<p;x+=c){let g=h.getX(x),_=h.getX(x+1),M=zo(this,t,ar,l,g,_,x);M&&e.push(M)}if(this.isLineLoop){let x=h.getX(m-1),p=h.getX(u),g=zo(this,t,ar,l,x,p,m-1);g&&e.push(g)}}else{let u=Math.max(0,o.start),m=Math.min(d.count,o.start+o.count);for(let x=u,p=m-1;x<p;x+=c){let g=zo(this,t,ar,l,x,x+1,x);g&&e.push(g)}if(this.isLineLoop){let x=zo(this,t,ar,l,m-1,u,m-1);x&&e.push(x)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){let a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function zo(i,t,e,n,s,r,o){let a=i.geometry.attributes.position;if(ma.fromBufferAttribute(a,s),ga.fromBufferAttribute(a,r),e.distanceSqToSegment(ma,ga,dc,pu)>n)return;dc.applyMatrix4(i.matrixWorld);let c=t.ray.origin.distanceTo(dc);if(!(c<t.near||c>t.far))return{distance:c,point:pu.clone().applyMatrix4(i.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:i}}var mu=new G,gu=new G,Mr=class extends _a{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let t=this.geometry;if(t.index===null){let e=t.attributes.position,n=[];for(let s=0,r=e.count;s<r;s+=2)mu.fromBufferAttribute(e,s),gu.fromBufferAttribute(e,s+1),n[s]=s===0?0:n[s-1],n[s+1]=n[s]+mu.distanceTo(gu);t.setAttribute("lineDistance",new we(n,1))}else ae("LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}};var Sr=class extends gn{constructor(t=[],e=ts,n,s,r,o,a,l,c,h){super(t,e,n,s,r,o,a,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}};var gi=class extends gn{constructor(t,e,n=zn,s,r,o,a=tn,l=tn,c,h=mi,f=1){if(h!==mi&&h!==xi)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let d={width:t,height:e,depth:f};super(d,s,r,o,a,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Ps(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return e.compareFunction=this.compareFunction,e}},br=class extends gi{constructor(t,e=zn,n=ts,s,r,o=tn,a=tn,l,c=mi){let h={width:t,height:t,depth:1},f=[h,h,h,h,h,h];super(t,t,e,n,s,r,o,a,l,c),this.image=f,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}},wr=class extends gn{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}},$n=class i extends Ue{constructor(t=1,e=1,n=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:o};let a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);let l=[],c=[],h=[],f=[],d=0,u=0;m("z","y","x",-1,-1,n,e,t,o,r,0),m("z","y","x",1,-1,n,e,-t,o,r,1),m("x","z","y",1,1,t,n,e,s,o,2),m("x","z","y",1,-1,t,n,-e,s,o,3),m("x","y","z",1,-1,t,e,n,s,r,4),m("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new we(c,3)),this.setAttribute("normal",new we(h,3)),this.setAttribute("uv",new we(f,2));function m(x,p,g,_,M,y,T,A,v,b,N){let I=y/v,P=T/b,O=y/2,V=T/2,R=A/2,B=v+1,k=b+1,L=0,W=0,U=new G;for(let X=0;X<k;X++){let j=X*P-V;for(let _t=0;_t<B;_t++){let Dt=_t*I-O;U[x]=Dt*_,U[p]=j*M,U[g]=R,c.push(U.x,U.y,U.z),U[x]=0,U[p]=0,U[g]=A>0?1:-1,h.push(U.x,U.y,U.z),f.push(_t/v),f.push(1-X/b),L+=1}}for(let X=0;X<b;X++)for(let j=0;j<v;j++){let _t=d+j+B*X,Dt=d+j+B*(X+1),Z=d+(j+1)+B*(X+1),ot=d+(j+1)+B*X;l.push(_t,Dt,ot),l.push(Dt,Z,ot),W+=6}a.addGroup(u,W,N),u+=W,d+=L}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},Ar=class i extends Ue{constructor(t=1,e=1,n=4,s=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:t,height:e,capSegments:n,radialSegments:s,heightSegments:r},e=Math.max(0,e),n=Math.max(1,Math.floor(n)),s=Math.max(3,Math.floor(s)),r=Math.max(1,Math.floor(r));let o=[],a=[],l=[],c=[],h=e/2,f=Math.PI/2*t,d=e,u=2*f+d,m=n*2+r,x=s+1,p=new G,g=new G;for(let _=0;_<=m;_++){let M=0,y=0,T=0,A=0;if(_<=n){let N=_/n,I=N*Math.PI/2;y=-h-t*Math.cos(I),T=t*Math.sin(I),A=-t*Math.cos(I),M=N*f}else if(_<=n+r){let N=(_-n)/r;y=-h+N*e,T=t,A=0,M=f+N*d}else{let N=(_-n-r)/n,I=N*Math.PI/2;y=h+t*Math.sin(I),T=t*Math.cos(I),A=t*Math.sin(I),M=f+d+N*f}let v=Math.max(0,Math.min(1,M/u)),b=0;_===0?b=.5/s:_===m&&(b=-.5/s);for(let N=0;N<=s;N++){let I=N/s,P=I*Math.PI*2,O=Math.sin(P),V=Math.cos(P);g.x=-T*V,g.y=y,g.z=T*O,a.push(g.x,g.y,g.z),p.set(-T*V,A,T*O),p.normalize(),l.push(p.x,p.y,p.z),c.push(I+b,v)}if(_>0){let N=(_-1)*x;for(let I=0;I<s;I++){let P=N+I,O=N+I+1,V=_*x+I,R=_*x+I+1;o.push(P,O,V),o.push(O,R,V)}}}this.setIndex(o),this.setAttribute("position",new we(a,3)),this.setAttribute("normal",new we(l,3)),this.setAttribute("uv",new we(c,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}};var Fs=class i extends Ue{constructor(t=1,e=1,n=1,s=32,r=1,o=!1,a=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:s,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:l};let c=this;s=Math.floor(s),r=Math.floor(r);let h=[],f=[],d=[],u=[],m=0,x=[],p=n/2,g=0;_(),o===!1&&(t>0&&M(!0),e>0&&M(!1)),this.setIndex(h),this.setAttribute("position",new we(f,3)),this.setAttribute("normal",new we(d,3)),this.setAttribute("uv",new we(u,2));function _(){let y=new G,T=new G,A=0,v=(e-t)/n;for(let b=0;b<=r;b++){let N=[],I=b/r,P=I*(e-t)+t;for(let O=0;O<=s;O++){let V=O/s,R=V*l+a,B=Math.sin(R),k=Math.cos(R);T.x=P*B,T.y=-I*n+p,T.z=P*k,f.push(T.x,T.y,T.z),y.set(B,v,k).normalize(),d.push(y.x,y.y,y.z),u.push(V,1-I),N.push(m++)}x.push(N)}for(let b=0;b<s;b++)for(let N=0;N<r;N++){let I=x[N][b],P=x[N+1][b],O=x[N+1][b+1],V=x[N][b+1];(t>0||N!==0)&&(h.push(I,P,V),A+=3),(e>0||N!==r-1)&&(h.push(P,O,V),A+=3)}c.addGroup(g,A,0),g+=A}function M(y){let T=m,A=new Lt,v=new G,b=0,N=y===!0?t:e,I=y===!0?1:-1;for(let O=1;O<=s;O++)f.push(0,p*I,0),d.push(0,I,0),u.push(.5,.5),m++;let P=m;for(let O=0;O<=s;O++){let R=O/s*l+a,B=Math.cos(R),k=Math.sin(R);v.x=N*k,v.y=p*I,v.z=N*B,f.push(v.x,v.y,v.z),d.push(0,I,0),A.x=B*.5+.5,A.y=k*.5*I+.5,u.push(A.x,A.y),m++}for(let O=0;O<s;O++){let V=T+O,R=P+O;y===!0?h.push(R,R+1,V):h.push(R+1,R,V),b+=3}c.addGroup(g,b,y===!0?1:2),g+=b}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}};var ko=new G,Go=new G,pc=new G,Vo=new di,Tr=class extends Ue{constructor(t=null,e=1){if(super(),this.type="EdgesGeometry",this.parameters={geometry:t,thresholdAngle:e},t!==null){let s=Math.pow(10,4),r=Math.cos($o*e),o=t.getIndex(),a=t.getAttribute("position"),l=o?o.count:a.count,c=[0,0,0],h=["a","b","c"],f=new Array(3),d=new Map,u=[];for(let m=0;m<l;m+=3){o?(c[0]=o.getX(m),c[1]=o.getX(m+1),c[2]=o.getX(m+2)):(c[0]=m,c[1]=m+1,c[2]=m+2);let{a:x,b:p,c:g}=Vo;if(x.fromBufferAttribute(a,c[0]),p.fromBufferAttribute(a,c[1]),g.fromBufferAttribute(a,c[2]),Vo.getNormal(pc),f[0]=`${Math.round(x.x*s)},${Math.round(x.y*s)},${Math.round(x.z*s)}`,f[1]=`${Math.round(p.x*s)},${Math.round(p.y*s)},${Math.round(p.z*s)}`,f[2]=`${Math.round(g.x*s)},${Math.round(g.y*s)},${Math.round(g.z*s)}`,!(f[0]===f[1]||f[1]===f[2]||f[2]===f[0]))for(let _=0;_<3;_++){let M=(_+1)%3,y=f[_],T=f[M],A=Vo[h[_]],v=Vo[h[M]],b=`${y}_${T}`,N=`${T}_${y}`,I=d.get(N);I?(pc.dot(I.normal)<=r&&(u.push(A.x,A.y,A.z),u.push(v.x,v.y,v.z)),d.set(N,null)):d.has(b)||d.set(b,{index0:c[_],index1:c[M],normal:pc.clone()})}}for(let m of d.values())if(m){let{index0:x,index1:p}=m;ko.fromBufferAttribute(a,x),Go.fromBufferAttribute(a,p),u.push(ko.x,ko.y,ko.z),u.push(Go.x,Go.y,Go.z)}this.setAttribute("position",new we(u,3))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}},An=class{constructor(){this.type="Curve",this.arcLengthDivisions=200,this.needsUpdate=!1,this.cacheArcLengths=null}getPoint(){ae("Curve: .getPoint() not implemented.")}getPointAt(t,e){let n=this.getUtoTmapping(t);return this.getPoint(n,e)}getPoints(t=5){let e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return e}getSpacedPoints(t=5){let e=[];for(let n=0;n<=t;n++)e.push(this.getPointAt(n/t));return e}getLength(){let t=this.getLengths();return t[t.length-1]}getLengths(t=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===t+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let e=[],n,s=this.getPoint(0),r=0;e.push(0);for(let o=1;o<=t;o++)n=this.getPoint(o/t),r+=n.distanceTo(s),e.push(r),s=n;return this.cacheArcLengths=e,e}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(t,e=null){let n=this.getLengths(),s=0,r=n.length,o;e?o=e:o=t*n[r-1];let a=0,l=r-1,c;for(;a<=l;)if(s=Math.floor(a+(l-a)/2),c=n[s]-o,c<0)a=s+1;else if(c>0)l=s-1;else{l=s;break}if(s=l,n[s]===o)return s/(r-1);let h=n[s],d=n[s+1]-h,u=(o-h)/d;return(s+u)/(r-1)}getTangent(t,e){let s=t-1e-4,r=t+1e-4;s<0&&(s=0),r>1&&(r=1);let o=this.getPoint(s),a=this.getPoint(r),l=e||(o.isVector2?new Lt:new G);return l.copy(a).sub(o).normalize(),l}getTangentAt(t,e){let n=this.getUtoTmapping(t);return this.getTangent(n,e)}computeFrenetFrames(t,e=!1){let n=new G,s=[],r=[],o=[],a=new G,l=new fe;for(let u=0;u<=t;u++){let m=u/t;s[u]=this.getTangentAt(m,new G)}r[0]=new G,o[0]=new G;let c=Number.MAX_VALUE,h=Math.abs(s[0].x),f=Math.abs(s[0].y),d=Math.abs(s[0].z);h<=c&&(c=h,n.set(1,0,0)),f<=c&&(c=f,n.set(0,1,0)),d<=c&&n.set(0,0,1),a.crossVectors(s[0],n).normalize(),r[0].crossVectors(s[0],a),o[0].crossVectors(s[0],r[0]);for(let u=1;u<=t;u++){if(r[u]=r[u-1].clone(),o[u]=o[u-1].clone(),a.crossVectors(s[u-1],s[u]),a.length()>Number.EPSILON){a.normalize();let m=Math.acos(ye(s[u-1].dot(s[u]),-1,1));r[u].applyMatrix4(l.makeRotationAxis(a,m))}o[u].crossVectors(s[u],r[u])}if(e===!0){let u=Math.acos(ye(r[0].dot(r[t]),-1,1));u/=t,s[0].dot(a.crossVectors(r[0],r[t]))>0&&(u=-u);for(let m=1;m<=t;m++)r[m].applyMatrix4(l.makeRotationAxis(s[m],u*m)),o[m].crossVectors(s[m],r[m])}return{tangents:s,normals:r,binormals:o}}clone(){return new this.constructor().copy(this)}copy(t){return this.arcLengthDivisions=t.arcLengthDivisions,this.cacheArcLengths=null,this}toJSON(){let t={metadata:{version:4.7,type:"Curve",generator:"Curve.toJSON"}};return t.arcLengthDivisions=this.arcLengthDivisions,t.type=this.type,t}fromJSON(t){return this.arcLengthDivisions=t.arcLengthDivisions,this.cacheArcLengths=null,this}},Us=class extends An{constructor(t=0,e=0,n=1,s=1,r=0,o=Math.PI*2,a=!1,l=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=t,this.aY=e,this.xRadius=n,this.yRadius=s,this.aStartAngle=r,this.aEndAngle=o,this.aClockwise=a,this.aRotation=l}getPoint(t,e=new Lt){let n=e,s=Math.PI*2,r=this.aEndAngle-this.aStartAngle,o=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=s;for(;r>s;)r-=s;r<Number.EPSILON&&(o?r=0:r=s),this.aClockwise===!0&&!o&&(r===s?r=-s:r=r-s);let a=this.aStartAngle+t*r,l=this.aX+this.xRadius*Math.cos(a),c=this.aY+this.yRadius*Math.sin(a);if(this.aRotation!==0){let h=Math.cos(this.aRotation),f=Math.sin(this.aRotation),d=l-this.aX,u=c-this.aY;l=d*h-u*f+this.aX,c=d*f+u*h+this.aY}return n.set(l,c)}copy(t){return super.copy(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}toJSON(){let t=super.toJSON();return t.aX=this.aX,t.aY=this.aY,t.xRadius=this.xRadius,t.yRadius=this.yRadius,t.aStartAngle=this.aStartAngle,t.aEndAngle=this.aEndAngle,t.aClockwise=this.aClockwise,t.aRotation=this.aRotation,t}fromJSON(t){return super.fromJSON(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}},xa=class extends Us{constructor(t,e,n,s,r,o){super(t,e,n,n,s,r,o),this.isArcCurve=!0,this.type="ArcCurve"}};function nh(){let i=0,t=0,e=0,n=0;function s(r,o,a,l){i=r,t=a,e=-3*r+3*o-2*a-l,n=2*r-2*o+a+l}return{initCatmullRom:function(r,o,a,l,c){s(o,a,c*(a-r),c*(l-o))},initNonuniformCatmullRom:function(r,o,a,l,c,h,f){let d=(o-r)/c-(a-r)/(c+h)+(a-o)/h,u=(a-o)/h-(l-o)/(h+f)+(l-a)/f;d*=h,u*=h,s(o,a,d,u)},calc:function(r){let o=r*r,a=o*r;return i+t*r+e*o+n*a}}}var _u=new G,xu=new G,mc=new nh,gc=new nh,_c=new nh,Os=class extends An{constructor(t=[],e=!1,n="centripetal",s=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=t,this.closed=e,this.curveType=n,this.tension=s}getPoint(t,e=new G){let n=e,s=this.points,r=s.length,o=(r-(this.closed?0:1))*t,a=Math.floor(o),l=o-a;this.closed?a+=a>0?0:(Math.floor(Math.abs(a)/r)+1)*r:l===0&&a===r-1&&(a=r-2,l=1);let c,h;this.closed||a>0?c=s[(a-1)%r]:(xu.subVectors(s[0],s[1]).add(s[0]),c=xu);let f=s[a%r],d=s[(a+1)%r];if(this.closed||a+2<r?h=s[(a+2)%r]:(_u.subVectors(s[r-1],s[r-2]).add(s[r-1]),h=_u),this.curveType==="centripetal"||this.curveType==="chordal"){let u=this.curveType==="chordal"?.5:.25,m=Math.pow(c.distanceToSquared(f),u),x=Math.pow(f.distanceToSquared(d),u),p=Math.pow(d.distanceToSquared(h),u);x<1e-4&&(x=1),m<1e-4&&(m=x),p<1e-4&&(p=x),mc.initNonuniformCatmullRom(c.x,f.x,d.x,h.x,m,x,p),gc.initNonuniformCatmullRom(c.y,f.y,d.y,h.y,m,x,p),_c.initNonuniformCatmullRom(c.z,f.z,d.z,h.z,m,x,p)}else this.curveType==="catmullrom"&&(mc.initCatmullRom(c.x,f.x,d.x,h.x,this.tension),gc.initCatmullRom(c.y,f.y,d.y,h.y,this.tension),_c.initCatmullRom(c.z,f.z,d.z,h.z,this.tension));return n.set(mc.calc(l),gc.calc(l),_c.calc(l)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(s.clone())}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}toJSON(){let t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){let s=this.points[e];t.points.push(s.toArray())}return t.closed=this.closed,t.curveType=this.curveType,t.tension=this.tension,t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(new G().fromArray(s))}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}};function vu(i,t,e,n,s){let r=(n-t)*.5,o=(s-e)*.5,a=i*i,l=i*a;return(2*e-2*n+r+o)*l+(-3*e+3*n-2*r-o)*a+r*i+e}function zp(i,t){let e=1-i;return e*e*t}function kp(i,t){return 2*(1-i)*i*t}function Gp(i,t){return i*i*t}function hr(i,t,e,n){return zp(i,t)+kp(i,e)+Gp(i,n)}function Vp(i,t){let e=1-i;return e*e*e*t}function Hp(i,t){let e=1-i;return 3*e*e*i*t}function Wp(i,t){return 3*(1-i)*i*i*t}function Xp(i,t){return i*i*i*t}function ur(i,t,e,n,s){return Vp(i,t)+Hp(i,e)+Wp(i,n)+Xp(i,s)}var Er=class extends An{constructor(t=new Lt,e=new Lt,n=new Lt,s=new Lt){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=t,this.v1=e,this.v2=n,this.v3=s}getPoint(t,e=new Lt){let n=e,s=this.v0,r=this.v1,o=this.v2,a=this.v3;return n.set(ur(t,s.x,r.x,o.x,a.x),ur(t,s.y,r.y,o.y,a.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}},va=class extends An{constructor(t=new G,e=new G,n=new G,s=new G){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=t,this.v1=e,this.v2=n,this.v3=s}getPoint(t,e=new G){let n=e,s=this.v0,r=this.v1,o=this.v2,a=this.v3;return n.set(ur(t,s.x,r.x,o.x,a.x),ur(t,s.y,r.y,o.y,a.y),ur(t,s.z,r.z,o.z,a.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}},Rr=class extends An{constructor(t=new Lt,e=new Lt){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=t,this.v2=e}getPoint(t,e=new Lt){let n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new Lt){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},ya=class extends An{constructor(t=new G,e=new G){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=t,this.v2=e}getPoint(t,e=new G){let n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new G){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},Cr=class extends An{constructor(t=new Lt,e=new Lt,n=new Lt){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new Lt){let n=e,s=this.v0,r=this.v1,o=this.v2;return n.set(hr(t,s.x,r.x,o.x),hr(t,s.y,r.y,o.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},Ir=class extends An{constructor(t=new G,e=new G,n=new G){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new G){let n=e,s=this.v0,r=this.v1,o=this.v2;return n.set(hr(t,s.x,r.x,o.x),hr(t,s.y,r.y,o.y),hr(t,s.z,r.z,o.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){let t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}},Pr=class extends An{constructor(t=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=t}getPoint(t,e=new Lt){let n=e,s=this.points,r=(s.length-1)*t,o=Math.floor(r),a=r-o,l=s[o===0?o:o-1],c=s[o],h=s[o>s.length-2?s.length-1:o+1],f=s[o>s.length-3?s.length-1:o+2];return n.set(vu(a,l.x,c.x,h.x,f.x),vu(a,l.y,c.y,h.y,f.y)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(s.clone())}return this}toJSON(){let t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){let s=this.points[e];t.points.push(s.toArray())}return t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){let s=t.points[e];this.points.push(new Lt().fromArray(s))}return this}},Ma=Object.freeze({__proto__:null,ArcCurve:xa,CatmullRomCurve3:Os,CubicBezierCurve:Er,CubicBezierCurve3:va,EllipseCurve:Us,LineCurve:Rr,LineCurve3:ya,QuadraticBezierCurve:Cr,QuadraticBezierCurve3:Ir,SplineCurve:Pr}),Sa=class extends An{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1,this.cacheLengths=null}add(t){this.curves.push(t)}closePath(){let t=this.curves[0].getPoint(0),e=this.curves[this.curves.length-1].getPoint(1);if(!t.equals(e)){let n=t.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Ma[n](e,t))}return this}getPoint(t,e){let n=t*this.getLength(),s=this.getCurveLengths(),r=0;for(;r<s.length;){if(s[r]>=n){let o=s[r]-n,a=this.curves[r],l=a.getLength(),c=l===0?0:1-o/l;return a.getPointAt(c,e)}r++}return null}getLength(){let t=this.getCurveLengths();return t[t.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let t=[],e=0;for(let n=0,s=this.curves.length;n<s;n++)e+=this.curves[n].getLength(),t.push(e);return this.cacheLengths=t,t}getSpacedPoints(t=40){let e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return this.autoClose&&e.push(e[0]),e}getPoints(t=12){let e=[],n;for(let s=0,r=this.curves;s<r.length;s++){let o=r[s],a=o.isEllipseCurve?t*2:o.isLineCurve||o.isLineCurve3?1:o.isSplineCurve?t*o.points.length:t,l=o.getPoints(a);for(let c=0;c<l.length;c++){let h=l[c];n&&n.equals(h)||(e.push(h),n=h)}}return this.autoClose&&e.length>1&&!e[e.length-1].equals(e[0])&&e.push(e[0]),e}copy(t){super.copy(t),this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){let s=t.curves[e];this.curves.push(s.clone())}return this.autoClose=t.autoClose,this.cacheLengths=null,this}toJSON(){let t=super.toJSON();t.autoClose=this.autoClose,t.curves=[];for(let e=0,n=this.curves.length;e<n;e++){let s=this.curves[e];t.curves.push(s.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.autoClose=t.autoClose,this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){let s=t.curves[e];this.curves.push(new Ma[s.type]().fromJSON(s))}return this.cacheLengths=null,this}},Lr=class extends Sa{constructor(t){super(),this.type="Path",this.currentPoint=new Lt,t&&this.setFromPoints(t)}setFromPoints(t){this.moveTo(t[0].x,t[0].y);for(let e=1,n=t.length;e<n;e++)this.lineTo(t[e].x,t[e].y);return this}moveTo(t,e){return this.currentPoint.set(t,e),this}lineTo(t,e){let n=new Rr(this.currentPoint.clone(),new Lt(t,e));return this.curves.push(n),this.currentPoint.set(t,e),this}quadraticCurveTo(t,e,n,s){let r=new Cr(this.currentPoint.clone(),new Lt(t,e),new Lt(n,s));return this.curves.push(r),this.currentPoint.set(n,s),this}bezierCurveTo(t,e,n,s,r,o){let a=new Er(this.currentPoint.clone(),new Lt(t,e),new Lt(n,s),new Lt(r,o));return this.curves.push(a),this.currentPoint.set(r,o),this}splineThru(t){let e=[this.currentPoint.clone()].concat(t),n=new Pr(e);return this.curves.push(n),this.currentPoint.copy(t[t.length-1]),this}arc(t,e,n,s,r,o){let a=this.currentPoint.x,l=this.currentPoint.y;return this.absarc(t+a,e+l,n,s,r,o),this}absarc(t,e,n,s,r,o){return this.absellipse(t,e,n,n,s,r,o),this}ellipse(t,e,n,s,r,o,a,l){let c=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(t+c,e+h,n,s,r,o,a,l),this}absellipse(t,e,n,s,r,o,a,l){let c=new Us(t,e,n,s,r,o,a,l);if(this.curves.length>0){let f=c.getPoint(0);f.equals(this.currentPoint)||this.lineTo(f.x,f.y)}this.curves.push(c);let h=c.getPoint(1);return this.currentPoint.copy(h),this}copy(t){return super.copy(t),this.currentPoint.copy(t.currentPoint),this}toJSON(){let t=super.toJSON();return t.currentPoint=this.currentPoint.toArray(),t}fromJSON(t){return super.fromJSON(t),this.currentPoint.fromArray(t.currentPoint),this}},Bs=class extends Lr{constructor(t){super(t),this.uuid=qs(),this.type="Shape",this.holes=[]}getPointsHoles(t){let e=[];for(let n=0,s=this.holes.length;n<s;n++)e[n]=this.holes[n].getPoints(t);return e}extractPoints(t){return{shape:this.getPoints(t),holes:this.getPointsHoles(t)}}copy(t){super.copy(t),this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){let s=t.holes[e];this.holes.push(s.clone())}return this}toJSON(){let t=super.toJSON();t.uuid=this.uuid,t.holes=[];for(let e=0,n=this.holes.length;e<n;e++){let s=this.holes[e];t.holes.push(s.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.uuid=t.uuid,this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){let s=t.holes[e];this.holes.push(new Lr().fromJSON(s))}return this}};function qp(i,t,e=2){let n=t&&t.length,s=n?t[0]*e:i.length,r=gf(i,0,s,e,!0),o=[];if(!r||r.next===r.prev)return o;let a,l,c;if(n&&(r=Kp(i,t,r,e)),i.length>80*e){a=i[0],l=i[1];let h=a,f=l;for(let d=e;d<s;d+=e){let u=i[d],m=i[d+1];u<a&&(a=u),m<l&&(l=m),u>h&&(h=u),m>f&&(f=m)}c=Math.max(h-a,f-l),c=c!==0?32767/c:0}return Nr(r,o,e,a,l,c,0),o}function gf(i,t,e,n,s){let r;if(s===lm(i,t,e,n)>0)for(let o=t;o<e;o+=n)r=yu(o/n|0,i[o],i[o+1],r);else for(let o=e-n;o>=t;o-=n)r=yu(o/n|0,i[o],i[o+1],r);return r&&zs(r,r.next)&&(Fr(r),r=r.next),r}function Ji(i,t){if(!i)return i;t||(t=i);let e=i,n;do if(n=!1,!e.steiner&&(zs(e,e.next)||Be(e.prev,e,e.next)===0)){if(Fr(e),e=t=e.prev,e===e.next)break;n=!0}else e=e.next;while(n||e!==t);return t}function Nr(i,t,e,n,s,r,o){if(!i)return;!o&&r&&nm(i,n,s,r);let a=i;for(;i.prev!==i.next;){let l=i.prev,c=i.next;if(r?Zp(i,n,s,r):Yp(i)){t.push(l.i,i.i,c.i),Fr(i),i=c.next,a=c.next;continue}if(i=c,i===a){o?o===1?(i=Jp(Ji(i),t),Nr(i,t,e,n,s,r,2)):o===2&&$p(i,t,e,n,s,r):Nr(Ji(i),t,e,n,s,r,1);break}}}function Yp(i){let t=i.prev,e=i,n=i.next;if(Be(t,e,n)>=0)return!1;let s=t.x,r=e.x,o=n.x,a=t.y,l=e.y,c=n.y,h=Math.min(s,r,o),f=Math.min(a,l,c),d=Math.max(s,r,o),u=Math.max(a,l,c),m=n.next;for(;m!==t;){if(m.x>=h&&m.x<=d&&m.y>=f&&m.y<=u&&lr(s,a,r,l,o,c,m.x,m.y)&&Be(m.prev,m,m.next)>=0)return!1;m=m.next}return!0}function Zp(i,t,e,n){let s=i.prev,r=i,o=i.next;if(Be(s,r,o)>=0)return!1;let a=s.x,l=r.x,c=o.x,h=s.y,f=r.y,d=o.y,u=Math.min(a,l,c),m=Math.min(h,f,d),x=Math.max(a,l,c),p=Math.max(h,f,d),g=Sc(u,m,t,e,n),_=Sc(x,p,t,e,n),M=i.prevZ,y=i.nextZ;for(;M&&M.z>=g&&y&&y.z<=_;){if(M.x>=u&&M.x<=x&&M.y>=m&&M.y<=p&&M!==s&&M!==o&&lr(a,h,l,f,c,d,M.x,M.y)&&Be(M.prev,M,M.next)>=0||(M=M.prevZ,y.x>=u&&y.x<=x&&y.y>=m&&y.y<=p&&y!==s&&y!==o&&lr(a,h,l,f,c,d,y.x,y.y)&&Be(y.prev,y,y.next)>=0))return!1;y=y.nextZ}for(;M&&M.z>=g;){if(M.x>=u&&M.x<=x&&M.y>=m&&M.y<=p&&M!==s&&M!==o&&lr(a,h,l,f,c,d,M.x,M.y)&&Be(M.prev,M,M.next)>=0)return!1;M=M.prevZ}for(;y&&y.z<=_;){if(y.x>=u&&y.x<=x&&y.y>=m&&y.y<=p&&y!==s&&y!==o&&lr(a,h,l,f,c,d,y.x,y.y)&&Be(y.prev,y,y.next)>=0)return!1;y=y.nextZ}return!0}function Jp(i,t){let e=i;do{let n=e.prev,s=e.next.next;!zs(n,s)&&xf(n,e,e.next,s)&&Dr(n,s)&&Dr(s,n)&&(t.push(n.i,e.i,s.i),Fr(e),Fr(e.next),e=i=s),e=e.next}while(e!==i);return Ji(e)}function $p(i,t,e,n,s,r){let o=i;do{let a=o.next.next;for(;a!==o.prev;){if(o.i!==a.i&&rm(o,a)){let l=vf(o,a);o=Ji(o,o.next),l=Ji(l,l.next),Nr(o,t,e,n,s,r,0),Nr(l,t,e,n,s,r,0);return}a=a.next}o=o.next}while(o!==i)}function Kp(i,t,e,n){let s=[];for(let r=0,o=t.length;r<o;r++){let a=t[r]*n,l=r<o-1?t[r+1]*n:i.length,c=gf(i,a,l,n,!1);c===c.next&&(c.steiner=!0),s.push(sm(c))}s.sort(Qp);for(let r=0;r<s.length;r++)e=jp(s[r],e);return e}function Qp(i,t){let e=i.x-t.x;if(e===0&&(e=i.y-t.y,e===0)){let n=(i.next.y-i.y)/(i.next.x-i.x),s=(t.next.y-t.y)/(t.next.x-t.x);e=n-s}return e}function jp(i,t){let e=tm(i,t);if(!e)return t;let n=vf(e,i);return Ji(n,n.next),Ji(e,e.next)}function tm(i,t){let e=t,n=i.x,s=i.y,r=-1/0,o;if(zs(i,e))return e;do{if(zs(i,e.next))return e.next;if(s<=e.y&&s>=e.next.y&&e.next.y!==e.y){let f=e.x+(s-e.y)*(e.next.x-e.x)/(e.next.y-e.y);if(f<=n&&f>r&&(r=f,o=e.x<e.next.x?e:e.next,f===n))return o}e=e.next}while(e!==t);if(!o)return null;let a=o,l=o.x,c=o.y,h=1/0;e=o;do{if(n>=e.x&&e.x>=l&&n!==e.x&&_f(s<c?n:r,s,l,c,s<c?r:n,s,e.x,e.y)){let f=Math.abs(s-e.y)/(n-e.x);Dr(e,i)&&(f<h||f===h&&(e.x>o.x||e.x===o.x&&em(o,e)))&&(o=e,h=f)}e=e.next}while(e!==a);return o}function em(i,t){return Be(i.prev,i,t.prev)<0&&Be(t.next,i,i.next)<0}function nm(i,t,e,n){let s=i;do s.z===0&&(s.z=Sc(s.x,s.y,t,e,n)),s.prevZ=s.prev,s.nextZ=s.next,s=s.next;while(s!==i);s.prevZ.nextZ=null,s.prevZ=null,im(s)}function im(i){let t,e=1;do{let n=i,s;i=null;let r=null;for(t=0;n;){t++;let o=n,a=0;for(let c=0;c<e&&(a++,o=o.nextZ,!!o);c++);let l=e;for(;a>0||l>0&&o;)a!==0&&(l===0||!o||n.z<=o.z)?(s=n,n=n.nextZ,a--):(s=o,o=o.nextZ,l--),r?r.nextZ=s:i=s,s.prevZ=r,r=s;n=o}r.nextZ=null,e*=2}while(t>1);return i}function Sc(i,t,e,n,s){return i=(i-e)*s|0,t=(t-n)*s|0,i=(i|i<<8)&16711935,i=(i|i<<4)&252645135,i=(i|i<<2)&858993459,i=(i|i<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,i|t<<1}function sm(i){let t=i,e=i;do(t.x<e.x||t.x===e.x&&t.y<e.y)&&(e=t),t=t.next;while(t!==i);return e}function _f(i,t,e,n,s,r,o,a){return(s-o)*(t-a)>=(i-o)*(r-a)&&(i-o)*(n-a)>=(e-o)*(t-a)&&(e-o)*(r-a)>=(s-o)*(n-a)}function lr(i,t,e,n,s,r,o,a){return!(i===o&&t===a)&&_f(i,t,e,n,s,r,o,a)}function rm(i,t){return i.next.i!==t.i&&i.prev.i!==t.i&&!om(i,t)&&(Dr(i,t)&&Dr(t,i)&&am(i,t)&&(Be(i.prev,i,t.prev)||Be(i,t.prev,t))||zs(i,t)&&Be(i.prev,i,i.next)>0&&Be(t.prev,t,t.next)>0)}function Be(i,t,e){return(t.y-i.y)*(e.x-t.x)-(t.x-i.x)*(e.y-t.y)}function zs(i,t){return i.x===t.x&&i.y===t.y}function xf(i,t,e,n){let s=Wo(Be(i,t,e)),r=Wo(Be(i,t,n)),o=Wo(Be(e,n,i)),a=Wo(Be(e,n,t));return!!(s!==r&&o!==a||s===0&&Ho(i,e,t)||r===0&&Ho(i,n,t)||o===0&&Ho(e,i,n)||a===0&&Ho(e,t,n))}function Ho(i,t,e){return t.x<=Math.max(i.x,e.x)&&t.x>=Math.min(i.x,e.x)&&t.y<=Math.max(i.y,e.y)&&t.y>=Math.min(i.y,e.y)}function Wo(i){return i>0?1:i<0?-1:0}function om(i,t){let e=i;do{if(e.i!==i.i&&e.next.i!==i.i&&e.i!==t.i&&e.next.i!==t.i&&xf(e,e.next,i,t))return!0;e=e.next}while(e!==i);return!1}function Dr(i,t){return Be(i.prev,i,i.next)<0?Be(i,t,i.next)>=0&&Be(i,i.prev,t)>=0:Be(i,t,i.prev)<0||Be(i,i.next,t)<0}function am(i,t){let e=i,n=!1,s=(i.x+t.x)/2,r=(i.y+t.y)/2;do e.y>r!=e.next.y>r&&e.next.y!==e.y&&s<(e.next.x-e.x)*(r-e.y)/(e.next.y-e.y)+e.x&&(n=!n),e=e.next;while(e!==i);return n}function vf(i,t){let e=bc(i.i,i.x,i.y),n=bc(t.i,t.x,t.y),s=i.next,r=t.prev;return i.next=t,t.prev=i,e.next=s,s.prev=e,n.next=e,e.prev=n,r.next=n,n.prev=r,n}function yu(i,t,e,n){let s=bc(i,t,e);return n?(s.next=n.next,s.prev=n,n.next.prev=s,n.next=s):(s.prev=s,s.next=s),s}function Fr(i){i.next.prev=i.prev,i.prev.next=i.next,i.prevZ&&(i.prevZ.nextZ=i.nextZ),i.nextZ&&(i.nextZ.prevZ=i.prevZ)}function bc(i,t,e){return{i,x:t,y:e,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function lm(i,t,e,n){let s=0;for(let r=t,o=e-n;r<e;r+=n)s+=(i[o]-i[r])*(i[r+1]+i[o+1]),o=r;return s}var wc=class{static triangulate(t,e,n=2){return qp(t,e,n)}},qi=class i{static area(t){let e=t.length,n=0;for(let s=e-1,r=0;r<e;s=r++)n+=t[s].x*t[r].y-t[r].x*t[s].y;return n*.5}static isClockWise(t){return i.area(t)<0}static triangulateShape(t,e){let n=[],s=[],r=[];Mu(t),Su(n,t);let o=t.length;e.forEach(Mu);for(let l=0;l<e.length;l++)s.push(o),o+=e[l].length,Su(n,e[l]);let a=wc.triangulate(n,s);for(let l=0;l<a.length;l+=3)r.push(a.slice(l,l+3));return r}};function Mu(i){let t=i.length;t>2&&i[t-1].equals(i[0])&&i.pop()}function Su(i,t){for(let e=0;e<t.length;e++)i.push(t[e].x),i.push(t[e].y)}var Ur=class i extends Ue{constructor(t=new Bs([new Lt(.5,.5),new Lt(-.5,.5),new Lt(-.5,-.5),new Lt(.5,-.5)]),e={}){super(),this.type="ExtrudeGeometry",this.parameters={shapes:t,options:e},t=Array.isArray(t)?t:[t];let n=this,s=[],r=[];for(let a=0,l=t.length;a<l;a++){let c=t[a];o(c)}this.setAttribute("position",new we(s,3)),this.setAttribute("uv",new we(r,2)),this.computeVertexNormals();function o(a){let l=[],c=e.curveSegments!==void 0?e.curveSegments:12,h=e.steps!==void 0?e.steps:1,f=e.depth!==void 0?e.depth:1,d=e.bevelEnabled!==void 0?e.bevelEnabled:!0,u=e.bevelThickness!==void 0?e.bevelThickness:.2,m=e.bevelSize!==void 0?e.bevelSize:u-.1,x=e.bevelOffset!==void 0?e.bevelOffset:0,p=e.bevelSegments!==void 0?e.bevelSegments:3,g=e.extrudePath,_=e.UVGenerator!==void 0?e.UVGenerator:cm,M,y=!1,T,A,v,b;if(g){M=g.getSpacedPoints(h),y=!0,d=!1;let K=g.isCatmullRomCurve3?g.closed:!1;T=g.computeFrenetFrames(h,K),A=new G,v=new G,b=new G}d||(p=0,u=0,m=0,x=0);let N=a.extractPoints(c),I=N.shape,P=N.holes;if(!qi.isClockWise(I)){I=I.reverse();for(let K=0,ft=P.length;K<ft;K++){let ht=P[K];qi.isClockWise(ht)&&(P[K]=ht.reverse())}}function V(K){let ht=10000000000000001e-36,dt=K[0];for(let mt=1;mt<=K.length;mt++){let Bt=mt%K.length,It=K[Bt],Zt=It.x-dt.x,Q=It.y-dt.y,yt=Zt*Zt+Q*Q,D=Math.max(Math.abs(It.x),Math.abs(It.y),Math.abs(dt.x),Math.abs(dt.y)),Vt=ht*D*D;if(yt<=Vt){K.splice(Bt,1),mt--;continue}dt=It}}V(I),P.forEach(V);let R=P.length,B=I;for(let K=0;K<R;K++){let ft=P[K];I=I.concat(ft)}function k(K,ft,ht){return ft||ce("ExtrudeGeometry: vec does not exist"),K.clone().addScaledVector(ft,ht)}let L=I.length;function W(K,ft,ht){let dt,mt,Bt,It=K.x-ft.x,Zt=K.y-ft.y,Q=ht.x-K.x,yt=ht.y-K.y,D=It*It+Zt*Zt,Vt=It*yt-Zt*Q;if(Math.abs(Vt)>Number.EPSILON){let Nt=Math.sqrt(D),Qt=Math.sqrt(Q*Q+yt*yt),ut=ft.x-Zt/Nt,Kt=ft.y+It/Nt,At=ht.x-yt/Qt,Pt=ht.y+Q/Qt,C=((At-ut)*yt-(Pt-Kt)*Q)/(It*yt-Zt*Q);dt=ut+It*C-K.x,mt=Kt+Zt*C-K.y;let w=dt*dt+mt*mt;if(w<=2)return new Lt(dt,mt);Bt=Math.sqrt(w/2)}else{let Nt=!1;It>Number.EPSILON?Q>Number.EPSILON&&(Nt=!0):It<-Number.EPSILON?Q<-Number.EPSILON&&(Nt=!0):Math.sign(Zt)===Math.sign(yt)&&(Nt=!0),Nt?(dt=-Zt,mt=It,Bt=Math.sqrt(D)):(dt=It,mt=Zt,Bt=Math.sqrt(D/2))}return new Lt(dt/Bt,mt/Bt)}let U=[];for(let K=0,ft=B.length,ht=ft-1,dt=K+1;K<ft;K++,ht++,dt++)ht===ft&&(ht=0),dt===ft&&(dt=0),U[K]=W(B[K],B[ht],B[dt]);let X=[],j,_t=U.concat();for(let K=0,ft=R;K<ft;K++){let ht=P[K];j=[];for(let dt=0,mt=ht.length,Bt=mt-1,It=dt+1;dt<mt;dt++,Bt++,It++)Bt===mt&&(Bt=0),It===mt&&(It=0),j[dt]=W(ht[dt],ht[Bt],ht[It]);X.push(j),_t=_t.concat(j)}let Dt;if(p===0)Dt=qi.triangulateShape(B,P);else{let K=[],ft=[];for(let ht=0;ht<p;ht++){let dt=ht/p,mt=u*Math.cos(dt*Math.PI/2),Bt=m*Math.sin(dt*Math.PI/2)+x;for(let It=0,Zt=B.length;It<Zt;It++){let Q=k(B[It],U[It],Bt);Jt(Q.x,Q.y,-mt),dt===0&&K.push(Q)}for(let It=0,Zt=R;It<Zt;It++){let Q=P[It];j=X[It];let yt=[];for(let D=0,Vt=Q.length;D<Vt;D++){let Nt=k(Q[D],j[D],Bt);Jt(Nt.x,Nt.y,-mt),dt===0&&yt.push(Nt)}dt===0&&ft.push(yt)}}Dt=qi.triangulateShape(K,ft)}let Z=Dt.length,ot=m+x;for(let K=0;K<L;K++){let ft=d?k(I[K],_t[K],ot):I[K];y?(v.copy(T.normals[0]).multiplyScalar(ft.x),A.copy(T.binormals[0]).multiplyScalar(ft.y),b.copy(M[0]).add(v).add(A),Jt(b.x,b.y,b.z)):Jt(ft.x,ft.y,0)}for(let K=1;K<=h;K++)for(let ft=0;ft<L;ft++){let ht=d?k(I[ft],_t[ft],ot):I[ft];y?(v.copy(T.normals[K]).multiplyScalar(ht.x),A.copy(T.binormals[K]).multiplyScalar(ht.y),b.copy(M[K]).add(v).add(A),Jt(b.x,b.y,b.z)):Jt(ht.x,ht.y,f/h*K)}for(let K=p-1;K>=0;K--){let ft=K/p,ht=u*Math.cos(ft*Math.PI/2),dt=m*Math.sin(ft*Math.PI/2)+x;for(let mt=0,Bt=B.length;mt<Bt;mt++){let It=k(B[mt],U[mt],dt);Jt(It.x,It.y,f+ht)}for(let mt=0,Bt=P.length;mt<Bt;mt++){let It=P[mt];j=X[mt];for(let Zt=0,Q=It.length;Zt<Q;Zt++){let yt=k(It[Zt],j[Zt],dt);y?Jt(yt.x,yt.y+M[h-1].y,M[h-1].x+ht):Jt(yt.x,yt.y,f+ht)}}}xt(),Gt();function xt(){let K=s.length/3;if(d){let ft=0,ht=L*ft;for(let dt=0;dt<Z;dt++){let mt=Dt[dt];se(mt[2]+ht,mt[1]+ht,mt[0]+ht)}ft=h+p*2,ht=L*ft;for(let dt=0;dt<Z;dt++){let mt=Dt[dt];se(mt[0]+ht,mt[1]+ht,mt[2]+ht)}}else{for(let ft=0;ft<Z;ft++){let ht=Dt[ft];se(ht[2],ht[1],ht[0])}for(let ft=0;ft<Z;ft++){let ht=Dt[ft];se(ht[0]+L*h,ht[1]+L*h,ht[2]+L*h)}}n.addGroup(K,s.length/3-K,0)}function Gt(){let K=s.length/3,ft=0;tt(B,ft),ft+=B.length;for(let ht=0,dt=P.length;ht<dt;ht++){let mt=P[ht];tt(mt,ft),ft+=mt.length}n.addGroup(K,s.length/3-K,1)}function tt(K,ft){let ht=K.length;for(;--ht>=0;){let dt=ht,mt=ht-1;mt<0&&(mt=K.length-1);for(let Bt=0,It=h+p*2;Bt<It;Bt++){let Zt=L*Bt,Q=L*(Bt+1),yt=ft+dt+Zt,D=ft+mt+Zt,Vt=ft+mt+Q,Nt=ft+dt+Q;lt(yt,D,Vt,Nt)}}}function Jt(K,ft,ht){l.push(K),l.push(ft),l.push(ht)}function se(K,ft,ht){ee(K),ee(ft),ee(ht);let dt=s.length/3,mt=_.generateTopUV(n,s,dt-3,dt-2,dt-1);gt(mt[0]),gt(mt[1]),gt(mt[2])}function lt(K,ft,ht,dt){ee(K),ee(ft),ee(dt),ee(ft),ee(ht),ee(dt);let mt=s.length/3,Bt=_.generateSideWallUV(n,s,mt-6,mt-3,mt-2,mt-1);gt(Bt[0]),gt(Bt[1]),gt(Bt[3]),gt(Bt[1]),gt(Bt[2]),gt(Bt[3])}function ee(K){s.push(l[K*3+0]),s.push(l[K*3+1]),s.push(l[K*3+2])}function gt(K){r.push(K.x),r.push(K.y)}}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){let t=super.toJSON(),e=this.parameters.shapes,n=this.parameters.options;return hm(e,n,t)}static fromJSON(t,e){let n=[];for(let r=0,o=t.shapes.length;r<o;r++){let a=e[t.shapes[r]];n.push(a)}let s=t.options.extrudePath;return s!==void 0&&(t.options.extrudePath=new Ma[s.type]().fromJSON(s)),new i(n,t.options)}},cm={generateTopUV:function(i,t,e,n,s){let r=t[e*3],o=t[e*3+1],a=t[n*3],l=t[n*3+1],c=t[s*3],h=t[s*3+1];return[new Lt(r,o),new Lt(a,l),new Lt(c,h)]},generateSideWallUV:function(i,t,e,n,s,r){let o=t[e*3],a=t[e*3+1],l=t[e*3+2],c=t[n*3],h=t[n*3+1],f=t[n*3+2],d=t[s*3],u=t[s*3+1],m=t[s*3+2],x=t[r*3],p=t[r*3+1],g=t[r*3+2];return Math.abs(a-h)<Math.abs(o-c)?[new Lt(o,1-l),new Lt(c,1-f),new Lt(d,1-m),new Lt(x,1-g)]:[new Lt(a,1-l),new Lt(h,1-f),new Lt(u,1-m),new Lt(p,1-g)]}};function hm(i,t,e){if(e.shapes=[],Array.isArray(i))for(let n=0,s=i.length;n<s;n++){let r=i[n];e.shapes.push(r.uuid)}else e.shapes.push(i.uuid);return e.options=Object.assign({},t),t.extrudePath!==void 0&&(e.options.extrudePath=t.extrudePath.toJSON()),e}var $i=class i extends Ue{constructor(t=[new Lt(0,-.5),new Lt(.5,0),new Lt(0,.5)],e=12,n=0,s=Math.PI*2){super(),this.type="LatheGeometry",this.parameters={points:t,segments:e,phiStart:n,phiLength:s},e=Math.floor(e),s=ye(s,0,Math.PI*2);let r=[],o=[],a=[],l=[],c=[],h=1/e,f=new G,d=new Lt,u=new G,m=new G,x=new G,p=0,g=0;for(let _=0;_<=t.length-1;_++)switch(_){case 0:p=t[_+1].x-t[_].x,g=t[_+1].y-t[_].y,u.x=g*1,u.y=-p,u.z=g*0,x.copy(u),u.normalize(),l.push(u.x,u.y,u.z);break;case t.length-1:x.normalize(),l.push(x.x,x.y,x.z);break;default:p=t[_+1].x-t[_].x,g=t[_+1].y-t[_].y,u.x=g*1,u.y=-p,u.z=g*0,m.copy(u),u.x+=x.x,u.y+=x.y,u.z+=x.z,u.normalize(),l.push(u.x,u.y,u.z),x.copy(m)}for(let _=0;_<=e;_++){let M=n+_*h*s,y=Math.sin(M),T=Math.cos(M);for(let A=0;A<=t.length-1;A++){f.x=t[A].x*y,f.y=t[A].y,f.z=t[A].x*T,o.push(f.x,f.y,f.z),d.x=_/e,d.y=A/(t.length-1),a.push(d.x,d.y);let v=l[3*A+0]*y,b=l[3*A+1],N=l[3*A+0]*T;c.push(v,b,N)}}for(let _=0;_<e;_++)for(let M=0;M<t.length-1;M++){let y=M+_*t.length,T=y,A=y+t.length,v=y+t.length+1,b=y+1;r.push(T,A,b),r.push(v,b,A)}this.setIndex(r),this.setAttribute("position",new we(o,3)),this.setAttribute("uv",new we(a,2)),this.setAttribute("normal",new we(c,3))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.points,t.segments,t.phiStart,t.phiLength)}};var Ki=class i extends Ue{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};let r=t/2,o=e/2,a=Math.floor(n),l=Math.floor(s),c=a+1,h=l+1,f=t/a,d=e/l,u=[],m=[],x=[],p=[];for(let g=0;g<h;g++){let _=g*d-o;for(let M=0;M<c;M++){let y=M*f-r;m.push(y,-_,0),x.push(0,0,1),p.push(M/a),p.push(1-g/l)}}for(let g=0;g<l;g++)for(let _=0;_<a;_++){let M=_+c*g,y=_+c*(g+1),T=_+1+c*(g+1),A=_+1+c*g;u.push(M,y,A),u.push(y,T,A)}this.setIndex(u),this.setAttribute("position",new we(m,3)),this.setAttribute("normal",new we(x,3)),this.setAttribute("uv",new we(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.widthSegments,t.heightSegments)}};var Or=class i extends Ue{constructor(t=1,e=32,n=16,s=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:s,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let l=Math.min(o+a,Math.PI),c=0,h=[],f=new G,d=new G,u=[],m=[],x=[],p=[];for(let g=0;g<=n;g++){let _=[],M=g/n,y=o+M*a,T=t*Math.cos(y),A=Math.sqrt(t*t-T*T),v=0;g===0&&o===0?v=.5/e:g===n&&l===Math.PI&&(v=-.5/e);for(let b=0;b<=e;b++){let N=b/e,I=s+N*r;f.x=-A*Math.cos(I),f.y=T,f.z=A*Math.sin(I),m.push(f.x,f.y,f.z),d.copy(f).normalize(),x.push(d.x,d.y,d.z),p.push(N+v,1-M),_.push(c++)}h.push(_)}for(let g=0;g<n;g++)for(let _=0;_<e;_++){let M=h[g][_+1],y=h[g][_],T=h[g+1][_],A=h[g+1][_+1];(g!==0||o>0)&&u.push(M,y,A),(g!==n-1||l<Math.PI)&&u.push(y,T,A)}this.setIndex(u),this.setAttribute("position",new we(m,3)),this.setAttribute("normal",new we(x,3)),this.setAttribute("uv",new we(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};var Br=class i extends Ue{constructor(t=1,e=.4,n=12,s=48,r=Math.PI*2,o=0,a=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:e,radialSegments:n,tubularSegments:s,arc:r,thetaStart:o,thetaLength:a},n=Math.floor(n),s=Math.floor(s);let l=[],c=[],h=[],f=[],d=new G,u=new G,m=new G;for(let x=0;x<=n;x++){let p=o+x/n*a;for(let g=0;g<=s;g++){let _=g/s*r;u.x=(t+e*Math.cos(p))*Math.cos(_),u.y=(t+e*Math.cos(p))*Math.sin(_),u.z=e*Math.sin(p),c.push(u.x,u.y,u.z),d.x=t*Math.cos(_),d.y=t*Math.sin(_),m.subVectors(u,d).normalize(),h.push(m.x,m.y,m.z),f.push(g/s),f.push(x/n)}}for(let x=1;x<=n;x++)for(let p=1;p<=s;p++){let g=(s+1)*x+p-1,_=(s+1)*(x-1)+p-1,M=(s+1)*(x-1)+p,y=(s+1)*x+p;l.push(g,_,y),l.push(_,M,y)}this.setIndex(l),this.setAttribute("position",new we(c,3)),this.setAttribute("normal",new we(h,3)),this.setAttribute("uv",new we(f,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc,t.thetaStart,t.thetaLength)}};var zr=class i extends Ue{constructor(t=new Ir(new G(-1,-1,0),new G(-1,1,0),new G(1,1,0)),e=64,n=1,s=8,r=!1){super(),this.type="TubeGeometry",this.parameters={path:t,tubularSegments:e,radius:n,radialSegments:s,closed:r};let o=t.computeFrenetFrames(e,r);this.tangents=o.tangents,this.normals=o.normals,this.binormals=o.binormals;let a=new G,l=new G,c=new Lt,h=new G,f=[],d=[],u=[],m=[];x(),this.setIndex(m),this.setAttribute("position",new we(f,3)),this.setAttribute("normal",new we(d,3)),this.setAttribute("uv",new we(u,2));function x(){for(let M=0;M<e;M++)p(M);p(r===!1?e:0),_(),g()}function p(M){h=t.getPointAt(M/e,h);let y=o.normals[M],T=o.binormals[M];for(let A=0;A<=s;A++){let v=A/s*Math.PI*2,b=Math.sin(v),N=-Math.cos(v);l.x=N*y.x+b*T.x,l.y=N*y.y+b*T.y,l.z=N*y.z+b*T.z,l.normalize(),d.push(l.x,l.y,l.z),a.x=h.x+n*l.x,a.y=h.y+n*l.y,a.z=h.z+n*l.z,f.push(a.x,a.y,a.z)}}function g(){for(let M=1;M<=e;M++)for(let y=1;y<=s;y++){let T=(s+1)*(M-1)+(y-1),A=(s+1)*M+(y-1),v=(s+1)*M+y,b=(s+1)*(M-1)+y;m.push(T,A,b),m.push(A,v,b)}}function _(){for(let M=0;M<=e;M++)for(let y=0;y<=s;y++)c.x=M/e,c.y=y/s,u.push(c.x,c.y)}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){let t=super.toJSON();return t.path=this.parameters.path.toJSON(),t}static fromJSON(t){return new i(new Ma[t.path.type]().fromJSON(t.path),t.tubularSegments,t.radius,t.radialSegments,t.closed)}};function ns(i){let t={};for(let e in i){t[e]={};for(let n in i[e]){let s=i[e][n];if(bu(s))s.isRenderTargetTexture?(ae("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone();else if(Array.isArray(s))if(bu(s[0])){let r=[];for(let o=0,a=s.length;o<a;o++)r[o]=s[o].clone();t[e][n]=r}else t[e][n]=s.slice();else t[e][n]=s}}return t}function an(i){let t={};for(let e=0;e<i.length;e++){let n=ns(i[e]);for(let s in n)t[s]=n[s]}return t}function bu(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function um(i){let t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function ih(i){let t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Se.workingColorSpace}var yf={clone:ns,merge:an},fm=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,dm=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,fn=class extends Ni{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=fm,this.fragmentShader=dm,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=ns(t.uniforms),this.uniformsGroups=um(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let s in this.uniforms){let o=this.uniforms[s].value;o&&o.isTexture?e.uniforms[s]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[s]={type:"m4",value:o.toArray()}:e.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(let n in t.uniforms){let s=t.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=e[s.value]||null;break;case"c":this.uniforms[n].value=new Ae().setHex(s.value);break;case"v2":this.uniforms[n].value=new Lt().fromArray(s.value);break;case"v3":this.uniforms[n].value=new G().fromArray(s.value);break;case"v4":this.uniforms[n].value=new ze().fromArray(s.value);break;case"m3":this.uniforms[n].value=new he().fromArray(s.value);break;case"m4":this.uniforms[n].value=new fe().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(let n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}},ba=class extends fn{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}};var wa=class extends Ni{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=tf,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},Aa=class extends Ni{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function As(i,t){return!i||i.constructor===t?i:typeof t.BYTES_PER_ELEMENT=="number"?new t(i):Array.prototype.slice.call(i)}function Xo(i){return i!==void 0&&i.inTangents!==void 0&&i.outTangents!==void 0}var Di=class{constructor(t,e,n,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,s=e[n],r=e[n-1];n:{t:{let o;e:{i:if(!(t<s)){for(let a=n+2;;){if(s===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=s,s=e[++n],t<s)break t}o=e.length;break e}if(!(t>=r)){let a=e[1];t<a&&(n=2,r=a);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(s=r,r=e[--n-1],t>=r)break t}o=n,n=0;break e}break n}for(;n<o;){let a=n+o>>>1;t<e[a]?o=a:n=a+1}if(s=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=t*s;for(let o=0;o!==s;++o)e[o]=n[r+o];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},Ta=class extends Di{constructor(t,e,n,s){super(t,e,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:vc,endingEnd:vc}}intervalChanged_(t,e,n){let s=this.parameterPositions,r=t-2,o=t+1,a=s[r],l=s[o];if(a===void 0)switch(this.getSettings_().endingStart){case yc:r=t,a=2*e-n;break;case Mc:r=s.length-2,a=e+s[r]-s[r+1];break;default:r=t,a=n}if(l===void 0)switch(this.getSettings_().endingEnd){case yc:o=t,l=2*n-e;break;case Mc:o=1,l=n+s[1]-s[0];break;default:o=t-1,l=e}let c=(n-e)*.5,h=this.valueSize;this._weightPrev=c/(e-a),this._weightNext=c/(l-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this._offsetPrev,f=this._offsetNext,d=this._weightPrev,u=this._weightNext,m=(n-e)/(s-e),x=m*m,p=x*m,g=-d*p+2*d*x-d*m,_=(1+d)*p+(-1.5-2*d)*x+(-.5+d)*m+1,M=(-1-u)*p+(1.5+u)*x+.5*m,y=u*p-u*x;for(let T=0;T!==a;++T)r[T]=g*o[h+T]+_*o[c+T]+M*o[l+T]+y*o[f+T];return r}},Ea=class extends Di{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=(n-e)/(s-e),f=1-h;for(let d=0;d!==a;++d)r[d]=o[c+d]*f+o[l+d]*h;return r}},Ra=class extends Di{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t){return this.copySampleValue_(t-1)}},Ca=class extends Di{interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=t*a,c=l-a,h=this.inTangents,f=this.outTangents;if(!h||!f){let m=(n-e)/(s-e),x=1-m;for(let p=0;p!==a;++p)r[p]=o[c+p]*x+o[l+p]*m;return r}let d=a*2,u=t-1;for(let m=0;m!==a;++m){let x=o[c+m],p=o[l+m],g=u*d+m*2,_=f[g],M=f[g+1],y=t*d+m*2,T=h[y],A=h[y+1],v=mm(n,e,_,T,s);r[m]=Mf(v,x,M,A,p)}return r}};function Mf(i,t,e,n,s){let r=1-i;return r*r*r*t+3*r*r*i*e+3*r*i*i*n+i*i*i*s}function pm(i,t,e,n,s){let r=1-i;return 3*r*r*(e-t)+6*r*i*(n-e)+3*i*i*(s-n)}function mm(i,t,e,n,s){let r=(i-t)/(s-t);for(let o=0;o<8;o++){let a=Mf(r,t,e,n,s)-i;if(Math.abs(a)<1e-10)break;let l=pm(r,t,e,n,s);if(Math.abs(l)<1e-10)break;r=Math.max(0,Math.min(1,r-a/l))}return r}var Tn=class{constructor(t,e,n,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=As(e,this.TimeBufferType),this.values=As(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:As(t.times,Array),values:As(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(n.interpolation=s),Xo(t.settings)&&(n.settings={inTangents:As(t.settings.inTangents,Array),outTangents:As(t.settings.outTangents,Array)})}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new Ra(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new Ea(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new Ta(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let e=new Ca(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case fr:e=this.InterpolantFactoryMethodDiscrete;break;case oa:e=this.InterpolantFactoryMethodLinear;break;case Zo:e=this.InterpolantFactoryMethodSmooth;break;case xc:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return ae("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return fr;case this.InterpolantFactoryMethodLinear:return oa;case this.InterpolantFactoryMethodSmooth:return Zo;case this.InterpolantFactoryMethodBezier:return xc}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]+=t;Xo(this.settings)&&(wu(this.settings.inTangents,t),wu(this.settings.outTangents,t))}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]*=t;Xo(this.settings)&&(Au(this.settings.inTangents,t),Au(this.settings.outTangents,t))}return this}trim(t,e){let n=this.times,s=n.length,r=0,o=s-1;for(;r!==s&&n[r]<t;)++r;for(;o!==-1&&n[o]>e;)--o;if(++o,r!==0||o!==s){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(ce("KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,s=this.values,r=n.length;r===0&&(ce("KeyframeTrack: Track is empty.",this),t=!1);let o=null;for(let a=0;a!==r;a++){let l=n[a];if(typeof l=="number"&&isNaN(l)){ce("KeyframeTrack: Time is not a valid number.",this,a,l),t=!1;break}if(o!==null&&o>l){ce("KeyframeTrack: Out of order keys.",this,a,l,o),t=!1;break}o=l}if(s!==void 0&&_p(s))for(let a=0,l=s.length;a!==l;++a){let c=s[a];if(isNaN(c)){ce("KeyframeTrack: Value is not a valid number.",this,a,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===Zo,r=t.length-1,o=1;for(let a=1;a<r;++a){let l=!1,c=t[a],h=t[a+1];if(c!==h&&(a!==1||c!==t[0]))if(s)l=!0;else{let f=a*n,d=f-n,u=f+n;for(let m=0;m!==n;++m){let x=e[f+m];if(x!==e[d+m]||x!==e[u+m]){l=!0;break}}}if(l){if(a!==o){t[o]=t[a];let f=a*n,d=o*n;for(let u=0;u!==n;++u)e[d+u]=e[f+u]}++o}}if(r>0){t[o]=t[r];for(let a=r*n,l=o*n,c=0;c!==n;++c)e[l+c]=e[a+c];++o}return o!==t.length?(this.times=t.slice(0,o),this.values=e.slice(0,o*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,s=new n(this.name,t,e);return s.createInterpolant=this.createInterpolant,Xo(this.settings)&&(s.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),s}};function wu(i,t){for(let e=0,n=i.length;e!==n;e+=2)i[e]+=t}function Au(i,t){for(let e=0,n=i.length;e!==n;e+=2)i[e]*=t}Tn.prototype.ValueTypeName="";Tn.prototype.TimeBufferType=Float32Array;Tn.prototype.ValueBufferType=Float32Array;Tn.prototype.DefaultInterpolation=oa;var Fi=class extends Tn{constructor(t,e,n){super(t,e,n)}};Fi.prototype.ValueTypeName="bool";Fi.prototype.ValueBufferType=Array;Fi.prototype.DefaultInterpolation=fr;Fi.prototype.InterpolantFactoryMethodLinear=void 0;Fi.prototype.InterpolantFactoryMethodSmooth=void 0;var Ia=class extends Tn{constructor(t,e,n,s){super(t,e,n,s)}};Ia.prototype.ValueTypeName="color";var Pa=class extends Tn{constructor(t,e,n,s){super(t,e,n,s)}};Pa.prototype.ValueTypeName="number";var La=class extends Di{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,l=(n-e)/(s-e),c=t*a;for(let h=c+a;c!==h;c+=4)Zn.slerpFlat(r,0,o,c-a,o,c,l);return r}},kr=class extends Tn{constructor(t,e,n,s){super(t,e,n,s)}InterpolantFactoryMethodLinear(t){return new La(this.times,this.values,this.getValueSize(),t)}};kr.prototype.ValueTypeName="quaternion";kr.prototype.InterpolantFactoryMethodSmooth=void 0;var Ui=class extends Tn{constructor(t,e,n){super(t,e,n)}};Ui.prototype.ValueTypeName="string";Ui.prototype.ValueBufferType=Array;Ui.prototype.DefaultInterpolation=fr;Ui.prototype.InterpolantFactoryMethodLinear=void 0;Ui.prototype.InterpolantFactoryMethodSmooth=void 0;var Na=class extends Tn{constructor(t,e,n,s){super(t,e,n,s)}};Na.prototype.ValueTypeName="vector";var Da=class{constructor(t,e,n){let s=this,r=!1,o=0,a=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(h){a++,r===!1&&s.onStart!==void 0&&s.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,s.onProgress!==void 0&&s.onProgress(h,o,a),o===a&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(h){s.onError!==void 0&&s.onError(h)},this.resolveURL=function(h){return h=h.normalize("NFC"),l?l(h):h},this.setURLModifier=function(h){return l=h,this},this.addHandler=function(h,f){return c.push(h,f),this},this.removeHandler=function(h){let f=c.indexOf(h);return f!==-1&&c.splice(f,2),this},this.getHandler=function(h){for(let f=0,d=c.length;f<d;f+=2){let u=c[f],m=c[f+1];if(u.global&&(u.lastIndex=0),u.test(h))return m}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},Sf=new Da,Fa=class{constructor(t){this.manager=t!==void 0?t:Sf,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},this.priority="auto",this.cache="default",typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){let n=this;return new Promise(function(s,r){n.load(t,s,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}setPriority(t){return this.priority=t,this}setCache(t){return this.cache=t,this}abort(){return this}};Fa.DEFAULT_MATERIAL_NAME="__DEFAULT";var qo=new G,Yo=new Zn,Wn=new G,Gr=class extends wn{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new fe,this.projectionMatrix=new fe,this.projectionMatrixInverse=new fe,this.coordinateSystem=In,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(qo,Yo,Wn),Wn.x===1&&Wn.y===1&&Wn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(qo,Yo,Wn.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(qo,Yo,Wn),Wn.x===1&&Wn.y===1&&Wn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(qo,Yo,Wn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Pi=new G,Tu=new Lt,Eu=new Lt,on=class extends Gr{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=aa*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan($o*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return aa*2*Math.atan(Math.tan($o*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Pi.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Pi.x,Pi.y).multiplyScalar(-t/Pi.z),Pi.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Pi.x,Pi.y).multiplyScalar(-t/Pi.z)}getViewSize(t,e){return this.getViewBounds(t,Tu,Eu),e.subVectors(Eu,Tu)}setViewOffset(t,e,n,s,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan($o*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s,o=this.view;if(this.view!==null&&this.view.enabled){let l=o.fullWidth,c=o.fullHeight;r+=o.offsetX*s/l,e-=o.offsetY*n/c,s*=o.width/l,n*=o.height/c}let a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}};var Ua=class extends Gr{constructor(t=-1,e=1,n=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-t,o=n+t,a=s+e,l=s-e;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,o=r+c*this.view.width,a-=h*this.view.offsetY,l=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}};var Ts=-90,Es=1,ks=class extends wn{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new on(Ts,Es,t,e);s.layers=this.layers,this.add(s);let r=new on(Ts,Es,t,e);r.layers=this.layers,this.add(r);let o=new on(Ts,Es,t,e);o.layers=this.layers,this.add(o);let a=new on(Ts,Es,t,e);a.layers=this.layers,this.add(a);let l=new on(Ts,Es,t,e);l.layers=this.layers,this.add(l);let c=new on(Ts,Es,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,s,r,o,a,l]=e;for(let c of e)this.remove(c);if(t===In)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===mr)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,l,c,h]=this.children,f=t.getRenderTarget(),d=t.getActiveCubeFace(),u=t.getActiveMipmapLevel(),m=t.xr.enabled;t.xr.enabled=!1;let x=n.texture.mipmapsAutoUpdate;n.texture.mipmapsAutoUpdate=!1;let p=!1;t.isWebGLRenderer===!0?p=t.state.buffers.depth.getReversed():p=t.reversedDepthBuffer,t.setRenderTarget(n,0,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,2,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,3,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.mipmapsAutoUpdate=x,t.setRenderTarget(n,5,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,h),t.setRenderTarget(f,d,u),t.xr.enabled=m,n.texture.needsPMREMUpdate=!0}},Oa=class extends on{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t,this.perCameraFrustumCulled=!1}};var sh="\\[\\]\\.:\\/",gm=new RegExp("["+sh+"]","g"),rh="[^"+sh+"]",_m="[^"+sh.replace("\\.","")+"]",xm=/((?:WC+[\/:])*)/.source.replace("WC",rh),vm=/(WCOD+)?/.source.replace("WCOD",_m),ym=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",rh),Mm=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",rh),Sm=new RegExp("^"+xm+vm+ym+Mm+"$"),bm=["material","materials","bones","map"],Ac=class{constructor(t,e,n){let s=n||De.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,s)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},De=class i{constructor(t,e,n){this.path=e,this.parsedPath=n||i.parseTrackName(e),this.node=i.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new i.Composite(t,e,n):new i(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(gm,"")}static parseTrackName(t){let e=Sm.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);bm.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===e||a.uuid===e)return a;let l=n(a.children);if(l)return l}return null},s=n(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)t[e++]=n[s]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,s=e.propertyName,r=e.propertyIndex;if(t||(t=i.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){ae("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){ce("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){ce("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){ce("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===c){c=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){ce("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){ce("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){ce("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){ce("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let o=t[s];if(o===void 0){let c=e.nodeName;ce("PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",t);return}let a=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?a=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){ce("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){ce("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(l=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};De.Composite=Ac;De.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};De.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};De.prototype.GetterByBindingType=[De.prototype._getValue_direct,De.prototype._getValue_array,De.prototype._getValue_arrayElement,De.prototype._getValue_toArray];De.prototype.SetterByBindingTypeAndVersioning=[[De.prototype._setValue_direct,De.prototype._setValue_direct_setNeedsUpdate,De.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[De.prototype._setValue_array,De.prototype._setValue_array_setNeedsUpdate,De.prototype._setValue_array_setMatrixWorldNeedsUpdate],[De.prototype._setValue_arrayElement,De.prototype._setValue_arrayElement_setNeedsUpdate,De.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[De.prototype._setValue_fromArray,De.prototype._setValue_fromArray_setNeedsUpdate,De.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Ly=new Float32Array(1);var Ru=new fe,Vr=class{constructor(t,e,n=0,s=1/0){this.ray=new Ds(t,e),this.near=n,this.far=s,this.camera=null,this.layers=new Ls,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,e.projectionMatrix.elements[14]).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):ce("Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return Ru.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(Ru),this}intersectObject(t,e=!0,n=[]){return Tc(t,this,n,e),n.sort(Cu),n}intersectObjects(t,e=!0,n=[]){for(let s=0,r=t.length;s<r;s++)Tc(t[s],this,n,e);return n.sort(Cu),n}};function Cu(i,t){return i.distance-t.distance}function Tc(i,t,e,n){let s=!0;if(i.layers.test(t.layers)&&i.raycast(t,e)===!1&&(s=!1),s===!0&&n===!0){let r=i.children;for(let o=0,a=r.length;o<a;o++)Tc(r[o],t,e,!0)}}var uh=class uh{constructor(t,e,n,s){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,s){let r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=s,this}};uh.prototype.isMatrix2=!0;var Ec=uh;function oh(i,t,e,n){let s=wm(n);switch(e){case qc:return i*t;case Zc:return i*t/s.components*s.byteLength;case Xa:return i*t/s.components*s.byteLength;case Oi:return i*t*2/s.components*s.byteLength;case qa:return i*t*2/s.components*s.byteLength;case Yc:return i*t*3/s.components*s.byteLength;case Vn:return i*t*4/s.components*s.byteLength;case Ya:return i*t*4/s.components*s.byteLength;case Xr:case qr:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Yr:case Zr:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case Ja:case Ka:return Math.max(i,16)*Math.max(t,8)/4;case Za:case $a:return Math.max(i,8)*Math.max(t,8)/2;case Qa:case ja:case el:case nl:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case tl:case Jr:case il:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case sl:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case rl:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case ol:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case al:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case ll:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case cl:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case hl:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case ul:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case fl:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case dl:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case pl:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case ml:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case gl:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case _l:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case xl:case vl:case yl:return Math.ceil(i/4)*Math.ceil(t/4)*16;case Ml:case Sl:return Math.ceil(i/4)*Math.ceil(t/4)*8;case $r:case bl:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function wm(i){switch(i){case En:case Vc:return{byteLength:1,components:1};case Xs:case Hc:case Gn:return{byteLength:2,components:1};case Ha:case Wa:return{byteLength:2,components:4};case zn:case Va:case kn:return{byteLength:4,components:1};case Wc:case Xc:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"187"}}));typeof window<"u"&&(window.__THREE__?ae("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="187");function Wf(){let i=null,t=!1,e=null,n=null;function s(r,o){n=i.requestAnimationFrame(s),e(r,o)}return{start:function(){t!==!0&&e!==null&&i!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function Tm(i){let t=new WeakMap;function e(a,l){let c=a.array,h=a.usage,f=c.byteLength,d=i.createBuffer();i.bindBuffer(l,d),i.bufferData(l,c,h),a.onUploadCallback();let u;if(c instanceof Float32Array)u=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)u=i.HALF_FLOAT;else if(c instanceof Uint16Array)a.isFloat16BufferAttribute?u=i.HALF_FLOAT:u=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)u=i.SHORT;else if(c instanceof Uint32Array)u=i.UNSIGNED_INT;else if(c instanceof Int32Array)u=i.INT;else if(c instanceof Int8Array)u=i.BYTE;else if(c instanceof Uint8Array)u=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)u=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:d,type:u,bytesPerElement:c.BYTES_PER_ELEMENT,version:a.version,size:f}}function n(a,l,c){let h=l.array,f=l.updateRanges;if(i.bindBuffer(c,a),f.length===0)i.bufferSubData(c,0,h);else{f.sort((u,m)=>u.start-m.start);let d=0;for(let u=1;u<f.length;u++){let m=f[d],x=f[u];x.start<=m.start+m.count+1?m.count=Math.max(m.count,x.start+x.count-m.start):(++d,f[d]=x)}f.length=d+1;for(let u=0,m=f.length;u<m;u++){let x=f[u];i.bufferSubData(c,x.start*h.BYTES_PER_ELEMENT,h,x.start,x.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);let l=t.get(a);l&&(i.deleteBuffer(l.buffer),t.delete(a))}function o(a,l){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=t.get(a);(!h||h.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let c=t.get(a);if(c===void 0)t.set(a,e(a,l));else if(c.version<a.version){if(c.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,a,l),c.version=a.version}}return{get:s,remove:r,update:o}}var Em=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Rm=`#ifdef USE_ALPHAHASH
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
#endif`,Cm=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Im=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Pm=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Lm=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Nm=`#ifdef USE_AOMAP
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
#endif`,Dm=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Fm=`#ifdef USE_BATCHING
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
#endif`,Um=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Om=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Bm=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,zm=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,km=`#ifdef USE_IRIDESCENCE
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
#endif`,Gm=`#ifdef USE_BUMPMAP
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
#endif`,Vm=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,Hm=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Wm=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Xm=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,qm=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,Ym=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Zm=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Jm=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,$m=`#define PI 3.141592653589793
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
} // validated`,Km=`vec3 transformedNormal = objectNormal;
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
#endif`,Qm=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,jm=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,tg=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,eg=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,ng="gl_FragColor = linearToOutputTexel( gl_FragColor );",ig=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,sg=`#ifdef USE_ENVMAP
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
#endif`,rg=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	uniform samplerCube envMap;
	#ifdef ENVMAP_TYPE_PMREM
		float roughnessToMip( const in float roughness ) {
			float r = clamp( roughness, 0.0, 1.0 );
			return ENVMAP_MAX_LOD * r * ( 2.0 - r );
		}
	#endif
#endif`,og=`#ifdef USE_ENVMAP
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
#endif`,ag=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,lg=`#ifdef USE_ENVMAP
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
#endif`,cg=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,hg=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,ug=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fg=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,dg=`#ifdef USE_GRADIENTMAP
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
}`,pg=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,mg=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,gg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,_g=`uniform bool receiveShadow;
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
#include <lightprobes_pars_fragment>`,xg=`#ifdef USE_ENVMAP
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
#endif`,vg=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,yg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Mg=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Sg=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,bg=`PhysicalMaterial material;
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
#endif`,wg=`uniform sampler2D dfgLUT;
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
}`,Ag=`
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
#endif`,Tg=`#if defined( RE_IndirectDiffuse )
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
#endif`,Eg=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Rg=`#if NUM_LIGHT_PROBE_GRIDS > 0
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
#endif`,Cg=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Ig=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Pg=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Lg=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Ng=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Dg=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Fg=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,Ug=`#if defined( USE_POINTS_UV )
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
#endif`,Og=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Bg=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,zg=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,kg=`#if defined( USE_MORPHCOLORS )
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
#endif`,Gg=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Vg=`#ifdef USE_MORPHTARGETS
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
#endif`,Hg=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Wg=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,Xg=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,qg=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Yg=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Zg=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Jg=`#ifdef USE_NORMALMAP
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
#endif`,$g=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Kg=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Qg=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,jg=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,t0=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,e0=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,n0=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,i0=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,s0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,r0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,o0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,a0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,l0=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,c0=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,h0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,u0=`float getShadowMask() {
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
}`,f0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,d0=`#ifdef USE_SKINNING
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
#endif`,p0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,m0=`#ifdef USE_SKINNING
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
#endif`,g0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,_0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,x0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,v0=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,y0=`#ifdef USE_TRANSMISSION
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
#endif`,M0=`#ifdef USE_TRANSMISSION
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
#endif`,S0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,b0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,w0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,A0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,T0=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,E0=`uniform sampler2D t2D;
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
}`,R0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,C0=`uniform float backgroundBlurriness;
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
}`,I0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,P0=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,L0=`#include <common>
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
}`,N0=`#if DEPTH_PACKING == 3200
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
}`,D0=`#define DISTANCE
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
}`,F0=`#define DISTANCE
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
}`,U0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,O0=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,B0=`uniform float scale;
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
}`,z0=`uniform vec3 diffuse;
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
}`,k0=`#include <common>
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
}`,G0=`uniform vec3 diffuse;
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
}`,V0=`#define LAMBERT
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
}`,H0=`#define LAMBERT
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
}`,W0=`#define MATCAP
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
}`,X0=`#define MATCAP
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
}`,q0=`#define NORMAL
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
}`,Y0=`#define NORMAL
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
}`,Z0=`#define PHONG
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
}`,J0=`#define PHONG
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
}`,$0=`#define STANDARD
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
}`,K0=`#define STANDARD
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
}`,Q0=`#define TOON
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
}`,j0=`#define TOON
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
}`,t_=`uniform float size;
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
}`,e_=`uniform vec3 diffuse;
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
}`,n_=`#include <common>
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
}`,i_=`uniform vec3 color;
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
}`,s_=`uniform float rotation;
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
}`,r_=`uniform vec3 diffuse;
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
}`,_e={alphahash_fragment:Em,alphahash_pars_fragment:Rm,alphamap_fragment:Cm,alphamap_pars_fragment:Im,alphatest_fragment:Pm,alphatest_pars_fragment:Lm,aomap_fragment:Nm,aomap_pars_fragment:Dm,batching_pars_vertex:Fm,batching_vertex:Um,begin_vertex:Om,beginnormal_vertex:Bm,bsdfs:zm,iridescence_fragment:km,bumpmap_pars_fragment:Gm,clipping_planes_fragment:Vm,clipping_planes_pars_fragment:Hm,clipping_planes_pars_vertex:Wm,clipping_planes_vertex:Xm,color_fragment:qm,color_pars_fragment:Ym,color_pars_vertex:Zm,color_vertex:Jm,common:$m,defaultnormal_vertex:Km,displacementmap_pars_vertex:Qm,displacementmap_vertex:jm,emissivemap_fragment:tg,emissivemap_pars_fragment:eg,colorspace_fragment:ng,colorspace_pars_fragment:ig,envmap_fragment:sg,envmap_common_pars_fragment:rg,envmap_pars_fragment:og,envmap_pars_vertex:ag,envmap_physical_pars_fragment:xg,envmap_vertex:lg,fog_vertex:cg,fog_pars_vertex:hg,fog_fragment:ug,fog_pars_fragment:fg,gradientmap_pars_fragment:dg,lightmap_pars_fragment:pg,lights_lambert_fragment:mg,lights_lambert_pars_fragment:gg,lights_pars_begin:_g,lights_toon_fragment:vg,lights_toon_pars_fragment:yg,lights_phong_fragment:Mg,lights_phong_pars_fragment:Sg,lights_physical_fragment:bg,lights_physical_pars_fragment:wg,lights_fragment_begin:Ag,lights_fragment_maps:Tg,lights_fragment_end:Eg,lightprobes_pars_fragment:Rg,logdepthbuf_fragment:Cg,logdepthbuf_pars_fragment:Ig,logdepthbuf_pars_vertex:Pg,logdepthbuf_vertex:Lg,map_fragment:Ng,map_pars_fragment:Dg,map_particle_fragment:Fg,map_particle_pars_fragment:Ug,metalnessmap_fragment:Og,metalnessmap_pars_fragment:Bg,morphinstance_vertex:zg,morphcolor_vertex:kg,morphnormal_vertex:Gg,morphtarget_pars_vertex:Vg,morphtarget_vertex:Hg,normal_fragment_begin:Wg,normal_fragment_maps:Xg,normal_pars_fragment:qg,normal_pars_vertex:Yg,normal_vertex:Zg,normalmap_pars_fragment:Jg,clearcoat_normal_fragment_begin:$g,clearcoat_normal_fragment_maps:Kg,clearcoat_pars_fragment:Qg,iridescence_pars_fragment:jg,opaque_fragment:t0,packing:e0,premultiplied_alpha_fragment:n0,project_vertex:i0,dithering_fragment:s0,dithering_pars_fragment:r0,roughnessmap_fragment:o0,roughnessmap_pars_fragment:a0,shadowmap_pars_fragment:l0,shadowmap_pars_vertex:c0,shadowmap_vertex:h0,shadowmask_pars_fragment:u0,skinbase_vertex:f0,skinning_pars_vertex:d0,skinning_vertex:p0,skinnormal_vertex:m0,specularmap_fragment:g0,specularmap_pars_fragment:_0,tonemapping_fragment:x0,tonemapping_pars_fragment:v0,transmission_fragment:y0,transmission_pars_fragment:M0,uv_pars_fragment:S0,uv_pars_vertex:b0,uv_vertex:w0,worldpos_vertex:A0,background_vert:T0,background_frag:E0,backgroundCube_vert:R0,backgroundCube_frag:C0,cube_vert:I0,cube_frag:P0,depth_vert:L0,depth_frag:N0,distance_vert:D0,distance_frag:F0,equirect_vert:U0,equirect_frag:O0,linedashed_vert:B0,linedashed_frag:z0,meshbasic_vert:k0,meshbasic_frag:G0,meshlambert_vert:V0,meshlambert_frag:H0,meshmatcap_vert:W0,meshmatcap_frag:X0,meshnormal_vert:q0,meshnormal_frag:Y0,meshphong_vert:Z0,meshphong_frag:J0,meshphysical_vert:$0,meshphysical_frag:K0,meshtoon_vert:Q0,meshtoon_frag:j0,points_vert:t_,points_frag:e_,shadow_vert:n_,shadow_frag:i_,sprite_vert:s_,sprite_frag:r_},qt={common:{diffuse:{value:new Ae(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new he},alphaMap:{value:null},alphaMapTransform:{value:new he},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new he}},envmap:{envMap:{value:null},envMapRotation:{value:new he},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new he}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new he}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new he},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new he},normalScale:{value:new Lt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new he},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new he}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new he}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new he}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ae(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:[]},probesMin:{value:[]},probesMax:{value:[]},probesResolution:{value:[]}},points:{diffuse:{value:new Ae(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new he},alphaTest:{value:0},uvTransform:{value:new he}},sprite:{diffuse:{value:new Ae(16777215)},opacity:{value:1},center:{value:new Lt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new he},alphaMap:{value:null},alphaMapTransform:{value:new he},alphaTest:{value:0}}},ti={basic:{uniforms:an([qt.common,qt.specularmap,qt.envmap,qt.aomap,qt.lightmap,qt.fog]),vertexShader:_e.meshbasic_vert,fragmentShader:_e.meshbasic_frag},lambert:{uniforms:an([qt.common,qt.specularmap,qt.envmap,qt.aomap,qt.lightmap,qt.emissivemap,qt.bumpmap,qt.normalmap,qt.displacementmap,qt.fog,qt.lights,{emissive:{value:new Ae(0)},envMapIntensity:{value:1}}]),vertexShader:_e.meshlambert_vert,fragmentShader:_e.meshlambert_frag},phong:{uniforms:an([qt.common,qt.specularmap,qt.envmap,qt.aomap,qt.lightmap,qt.emissivemap,qt.bumpmap,qt.normalmap,qt.displacementmap,qt.fog,qt.lights,{emissive:{value:new Ae(0)},specular:{value:new Ae(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:_e.meshphong_vert,fragmentShader:_e.meshphong_frag},standard:{uniforms:an([qt.common,qt.envmap,qt.aomap,qt.lightmap,qt.emissivemap,qt.bumpmap,qt.normalmap,qt.displacementmap,qt.roughnessmap,qt.metalnessmap,qt.fog,qt.lights,{emissive:{value:new Ae(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:_e.meshphysical_vert,fragmentShader:_e.meshphysical_frag},toon:{uniforms:an([qt.common,qt.aomap,qt.lightmap,qt.emissivemap,qt.bumpmap,qt.normalmap,qt.displacementmap,qt.gradientmap,qt.fog,qt.lights,{emissive:{value:new Ae(0)}}]),vertexShader:_e.meshtoon_vert,fragmentShader:_e.meshtoon_frag},matcap:{uniforms:an([qt.common,qt.bumpmap,qt.normalmap,qt.displacementmap,qt.fog,{matcap:{value:null}}]),vertexShader:_e.meshmatcap_vert,fragmentShader:_e.meshmatcap_frag},points:{uniforms:an([qt.points,qt.fog]),vertexShader:_e.points_vert,fragmentShader:_e.points_frag},dashed:{uniforms:an([qt.common,qt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:_e.linedashed_vert,fragmentShader:_e.linedashed_frag},depth:{uniforms:an([qt.common,qt.displacementmap]),vertexShader:_e.depth_vert,fragmentShader:_e.depth_frag},normal:{uniforms:an([qt.common,qt.bumpmap,qt.normalmap,qt.displacementmap,{opacity:{value:1}}]),vertexShader:_e.meshnormal_vert,fragmentShader:_e.meshnormal_frag},sprite:{uniforms:an([qt.sprite,qt.fog]),vertexShader:_e.sprite_vert,fragmentShader:_e.sprite_frag},background:{uniforms:{uvTransform:{value:new he},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:_e.background_vert,fragmentShader:_e.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new he}},vertexShader:_e.backgroundCube_vert,fragmentShader:_e.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:_e.cube_vert,fragmentShader:_e.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:_e.equirect_vert,fragmentShader:_e.equirect_frag},distance:{uniforms:an([qt.common,qt.displacementmap,{referencePosition:{value:new G},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:_e.distance_vert,fragmentShader:_e.distance_frag},shadow:{uniforms:an([qt.lights,qt.fog,{color:{value:new Ae(0)},opacity:{value:1}}]),vertexShader:_e.shadow_vert,fragmentShader:_e.shadow_frag}};ti.physical={uniforms:an([ti.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new he},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new he},clearcoatNormalScale:{value:new Lt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new he},diffuseRoughness:{value:0},diffuseRoughnessMap:{value:null},diffuseRoughnessMapTransform:{value:new he},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new he},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new he},sheen:{value:0},sheenColor:{value:new Ae(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new he},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new he},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new he},transmissionSamplerSize:{value:new Lt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new he},attenuationDistance:{value:0},attenuationColor:{value:new Ae(0)},specularColor:{value:new Ae(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new he},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new he},anisotropyVector:{value:new Lt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new he}}]),vertexShader:_e.meshphysical_vert,fragmentShader:_e.meshphysical_frag};var wl={r:0,b:0,g:0},o_=new fe,Xf=new he;Xf.set(-1,0,0,0,1,0,0,0,1);function a_(i,t,e,n,s,r){let o=new Ae(0),a=s===!0?0:1,l,c,h=null,f=0,d=null;function u(_){let M=_.isScene===!0?_.background:null;if(M&&M.isTexture){let y=_.backgroundBlurriness>0;M=t.get(M,y)}return M}function m(_){let M=!1,y=u(_);y===null?p(o,a):y&&y.isColor&&(p(y,1),M=!0);let T=i.xr.getEnvironmentBlendMode();T==="additive"?e.buffers.color.setClear(0,0,0,1,r):T==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(i.autoClear||M)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function x(_,M){let y=u(M);y&&y.isCubeTexture?(c===void 0&&(c=new _n(new $n(1,1,1),new fn({name:"BackgroundCubeMaterial",uniforms:ns(ti.backgroundCube.uniforms),vertexShader:ti.backgroundCube.vertexShader,fragmentShader:ti.backgroundCube.fragmentShader,side:dn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(T,A,v){this.matrixWorld.copyPosition(v.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=y,c.material.uniforms.backgroundBlurriness.value=M.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(o_.makeRotationFromEuler(M.backgroundRotation)).transpose(),y.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Xf),c.material.toneMapped=Se.getTransfer(y.colorSpace)!==Pe,(h!==y||f!==y.version||d!==i.toneMapping)&&(c.material.needsUpdate=!0,h=y,f=y.version,d=i.toneMapping),c.layers.enableAll(),_.unshift(c,c.geometry,c.material,0,0,null)):y&&y.isTexture&&(l===void 0&&(l=new _n(new Ki(2,2),new fn({name:"BackgroundMaterial",uniforms:ns(ti.background.uniforms),vertexShader:ti.background.vertexShader,fragmentShader:ti.background.fragmentShader,side:Kn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=y,l.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,l.material.toneMapped=Se.getTransfer(y.colorSpace)!==Pe,y.matrixAutoUpdate===!0&&y.updateMatrix(),l.material.uniforms.uvTransform.value.copy(y.matrix),(h!==y||f!==y.version||d!==i.toneMapping)&&(l.material.needsUpdate=!0,h=y,f=y.version,d=i.toneMapping),l.layers.enableAll(),_.unshift(l,l.geometry,l.material,0,0,null))}function p(_,M){_.getRGB(wl,ih(i)),e.buffers.color.setClear(wl.r,wl.g,wl.b,M,r)}function g(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return o},setClearColor:function(_,M=1){o.set(_),a=M,p(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(_){a=_,p(o,a)},render:m,addToRenderList:x,dispose:g}}function l_(i,t){let e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=d(null),r=s,o=!1;function a(P,O,V,R,B){let k=!1,L=f(P,R,V,O);r!==L&&(r=L,c(r.object)),k=u(P,R,V,B),k&&m(P,R,V,B),B!==null&&t.update(B,i.ELEMENT_ARRAY_BUFFER),(k||o)&&(o=!1,y(P,O,V,R),B!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(B).buffer))}function l(){return i.createVertexArray()}function c(P){return i.bindVertexArray(P)}function h(P){return i.deleteVertexArray(P)}function f(P,O,V,R){let B=R.wireframe===!0,k=n[O.id];k===void 0&&(k={},n[O.id]=k);let L=P.isInstancedMesh===!0?P.id:0,W=k[L];W===void 0&&(W={},k[L]=W);let U=W[V.id];U===void 0&&(U={},W[V.id]=U);let X=U[B];return X===void 0&&(X=d(l()),U[B]=X),X}function d(P){let O=[],V=[],R=[];for(let B=0;B<e;B++)O[B]=0,V[B]=0,R[B]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:O,enabledAttributes:V,attributeDivisors:R,object:P,attributes:{},index:null}}function u(P,O,V,R){let B=r.attributes,k=O.attributes,L=0,W=V.getAttributes();for(let U in W)if(W[U].location>=0){let j=B[U],_t=k[U];if(_t===void 0&&(U==="instanceMatrix"&&P.instanceMatrix&&(_t=P.instanceMatrix),U==="instanceColor"&&P.instanceColor&&(_t=P.instanceColor)),j===void 0||j.attribute!==_t||_t&&j.data!==_t.data)return!0;L++}return r.attributesNum!==L||r.index!==R}function m(P,O,V,R){let B={},k=O.attributes,L=0,W=V.getAttributes();for(let U in W)if(W[U].location>=0){let j=k[U];j===void 0&&(U==="instanceMatrix"&&P.instanceMatrix&&(j=P.instanceMatrix),U==="instanceColor"&&P.instanceColor&&(j=P.instanceColor));let _t={};_t.attribute=j,j&&j.data&&(_t.data=j.data),B[U]=_t,L++}r.attributes=B,r.attributesNum=L,r.index=R}function x(){let P=r.newAttributes;for(let O=0,V=P.length;O<V;O++)P[O]=0}function p(P){g(P,0)}function g(P,O){let V=r.newAttributes,R=r.enabledAttributes,B=r.attributeDivisors;V[P]=1,R[P]===0&&(i.enableVertexAttribArray(P),R[P]=1),B[P]!==O&&(i.vertexAttribDivisor(P,O),B[P]=O)}function _(){let P=r.newAttributes,O=r.enabledAttributes;for(let V=0,R=O.length;V<R;V++)O[V]!==P[V]&&(i.disableVertexAttribArray(V),O[V]=0)}function M(P,O,V,R,B,k,L){L===!0?i.vertexAttribIPointer(P,O,V,B,k):i.vertexAttribPointer(P,O,V,R,B,k)}function y(P,O,V,R){x();let B=R.attributes,k=V.getAttributes(),L=O.defaultAttributeValues;for(let W in k){let U=k[W];if(U.location>=0){let X=B[W];if(X===void 0&&(W==="instanceMatrix"&&P.instanceMatrix&&(X=P.instanceMatrix),W==="instanceColor"&&P.instanceColor&&(X=P.instanceColor)),X!==void 0){let j=X.normalized,_t=X.itemSize,Dt=t.get(X);if(Dt===void 0)continue;let Z=Dt.buffer,ot=Dt.type,xt=Dt.bytesPerElement,Gt=ot===i.INT||ot===i.UNSIGNED_INT||X.gpuType===Va;if(X.isInterleavedBufferAttribute){let tt=X.data,Jt=tt.isInterleavedBuffer===!0?tt.stride:tt.itemSize,se=X.offset;if(tt.isInstancedInterleavedBuffer||tt.isInstancedBufferAttribute){for(let lt=0;lt<U.locationSize;lt++)g(U.location+lt,tt.meshPerAttribute);P.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=tt.meshPerAttribute*tt.count)}else for(let lt=0;lt<U.locationSize;lt++)p(U.location+lt);i.bindBuffer(i.ARRAY_BUFFER,Z);for(let lt=0;lt<U.locationSize;lt++)M(U.location+lt,_t/U.locationSize,ot,j,Jt*xt,(se+_t/U.locationSize*lt)*xt,Gt)}else{if(X.isInstancedBufferAttribute){for(let tt=0;tt<U.locationSize;tt++)g(U.location+tt,X.meshPerAttribute);P.isInstancedMesh!==!0&&R._maxInstanceCount===void 0&&(R._maxInstanceCount=X.meshPerAttribute*X.count)}else for(let tt=0;tt<U.locationSize;tt++)p(U.location+tt);i.bindBuffer(i.ARRAY_BUFFER,Z);for(let tt=0;tt<U.locationSize;tt++)M(U.location+tt,_t/U.locationSize,ot,j,_t*xt,_t/U.locationSize*tt*xt,Gt)}}else if(L!==void 0){let j=L[W];if(j!==void 0)switch(j.length){case 2:i.vertexAttrib2fv(U.location,j);break;case 3:i.vertexAttrib3fv(U.location,j);break;case 4:i.vertexAttrib4fv(U.location,j);break;default:i.vertexAttrib1fv(U.location,j)}}}}_()}function T(){N();for(let P in n){let O=n[P];for(let V in O){let R=O[V];for(let B in R){let k=R[B];for(let L in k)h(k[L].object),delete k[L];delete R[B]}}delete n[P]}}function A(P){if(n[P.id]===void 0)return;let O=n[P.id];for(let V in O){let R=O[V];for(let B in R){let k=R[B];for(let L in k)h(k[L].object),delete k[L];delete R[B]}}delete n[P.id]}function v(P){for(let O in n){let V=n[O];for(let R in V){let B=V[R];if(B[P.id]===void 0)continue;let k=B[P.id];for(let L in k)h(k[L].object),delete k[L];delete B[P.id]}}}function b(P){for(let O in n){let V=n[O],R=P.isInstancedMesh===!0?P.id:0,B=V[R];if(B!==void 0){for(let k in B){let L=B[k];for(let W in L)h(L[W].object),delete L[W];delete B[k]}delete V[R],Object.keys(V).length===0&&delete n[O]}}}function N(){I(),o=!0,r!==s&&(r=s,c(r.object))}function I(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:a,reset:N,resetDefaultState:I,dispose:T,releaseStatesOfGeometry:A,releaseStatesOfObject:b,releaseStatesOfProgram:v,initAttributes:x,enableAttribute:p,disableUnusedAttributes:_}}function c_(i,t,e){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),e.update(c,n,1)}function o(l,c,h){h!==0&&(i.drawArraysInstanced(n,l,c,h),e.update(c,n,h))}function a(l,c,h){if(h===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,h);let d=0;for(let u=0;u<h;u++)d+=c[u];e.update(d,n,1)}this.setMode=s,this.render=r,this.renderInstances=o,this.renderMultiDraw=a}function h_(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let v=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(v.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function o(v){return!(v!==Vn&&n.convert(v)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(v){let b=v===Gn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(v!==En&&v!==kn&&!b&&n.convert(v)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE))}function l(v){if(v==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";v="mediump"}return v==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp",h=l(c);h!==c&&(ae("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);let f=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control"),d=e.logarithmicDepthBuffer===!0&&f===!1;e.reversedDepthBuffer===!0&&f===!1&&ae("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer."),e.logarithmicDepthBuffer===!0&&f===!0&&ae("WebGLRenderer: Logarithmic depth buffer is ignored when reversed depth buffer is enabled.");let u=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),m=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),x=i.getParameter(i.MAX_TEXTURE_SIZE),p=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),g=i.getParameter(i.MAX_VERTEX_ATTRIBS),_=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),M=i.getParameter(i.MAX_VARYING_VECTORS),y=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),T=i.getParameter(i.MAX_SAMPLES),A=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:o,textureTypeReadable:a,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:u,maxVertexTextures:m,maxTextureSize:x,maxCubemapSize:p,maxAttributes:g,maxVertexUniforms:_,maxVaryings:M,maxFragmentUniforms:y,maxSamples:T,samples:A}}function u_(i){let t=this,e=null,n=0,s=!1,r=!1,o=new Bn,a=new he,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(f,d){let u=f.length!==0||d||n!==0||s;return s=d,n=f.length,u},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(f,d){e=h(f,d,0)},this.setState=function(f,d,u){let m=f.clippingPlanes,x=f.clipIntersection,p=f.clipShadows,g=i.get(f);if(!s||m===null||m.length===0||r&&!p)r?h(null):c();else{let _=r?0:n,M=_*4,y=g.clippingState||null;l.value=y,y=h(m,d,M,u);for(let T=0;T!==M;++T)y[T]=e[T];g.clippingState=y,this.numIntersection=x?this.numPlanes:0,this.numPlanes+=_}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(f,d,u,m){let x=f!==null?f.length:0,p=null;if(x!==0){if(p=l.value,m!==!0||p===null){let g=u+x*4,_=d.matrixWorldInverse;a.getNormalMatrix(_),(p===null||p.length<g)&&(p=new Float32Array(g));for(let M=0,y=u;M!==x;++M,y+=4)o.copy(f[M]).applyMatrix4(_,a),o.normal.toArray(p,y),p[y+3]=o.constant}l.value=p,l.needsUpdate=!0}return t.numPlanes=x,t.numIntersection=0,p}}var jr=class extends un{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new Sr(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},s=new $n(5,5,5),r=new fn({name:"CubemapFromEquirect",uniforms:ns(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:dn,blending:Qi});r.uniforms.tEquirect.value=e;let o=new _n(s,r),a=e.minFilter;return e.minFilter===_i&&(e.minFilter=hn),new ks(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){let r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,s);t.setRenderTarget(r)}},bf=256,f_=3,d_=20,qf=256,Yf=16,p_=3,m_=new G,g_=new Ae,Tl=class i{constructor(t){this._renderer=t,this._cubeSize=0,this._sourceTarget=null,this._cubeCamera=new ks(1,10,null),this._boxMesh=new _n(new $n(5,5,5),null),this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null,this._integrationMaterial=null}fromScene(t,e=0,n=.1,s=100,r={}){let{size:o=256,position:a=m_}=r,l=this._renderer;this._setSize(o);let c=this._allocateTarget(),h=this._getSourceTarget(!0);e>0&&(h.texture.mipmapsAutoUpdate=!1);let f=l.autoClear,d=l.autoClearColor,u=l.autoClearDepth,m=l.autoClearStencil,x=t.background;l.autoClear=!0,l.autoClearColor=!0,l.autoClearDepth=!0,l.autoClearStencil=!0,x===null&&(t.background=l.getClearColor(g_));let p=new ks(n,s,h);return p.position.copy(a),p.update(l,t),l.autoClear=f,l.autoClearColor=d,l.autoClearDepth=u,l.autoClearStencil=m,t.background=x,e>0&&(h.texture.mipmapsAutoUpdate=!0,this._blur(c,e)),this._applyPMREM(c),c}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Tf(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Af(),this._compileMaterial(this._equirectMaterial))}dispose(){this._sourceTarget!==null&&this._sourceTarget.dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._integrationMaterial!==null&&this._integrationMaterial.dispose(),this._boxMesh.geometry.dispose()}static lodToRoughness(t,e){return e>0?1-Math.sqrt(1-t/e):0}_setSize(t){this._cubeSize=Math.max(bf,pf(t))}_fromTexture(t,e){t.mapping===ts||t.mapping===Ws?this._setSize(t.image.length===0?bf:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4);let n=e||this._allocateTarget();return this._textureToCubemap(t),this._applyPMREM(n),n}_allocateTarget(){let t=this._cubeSize,e=wf(t,!1,!1),n=Math.log2(t)-f_;for(let s=0;s<=n;s++)e.texture.mipmaps.push({width:t>>s,height:t>>s});return e.texture.name="PMREM",e.texture.isPMREMTexture=!0,e}_getSourceTarget(t=!1){let e=this._cubeSize,n=this._sourceTarget;return(n===null||n.width!==e||t&&n.depthBuffer===!1)&&(n!==null&&n.dispose(),this._sourceTarget=wf(e,!0,t)),this._sourceTarget}_compileMaterial(t){this._boxMesh.material=t,this._renderer.compile(this._boxMesh,this._cubeCamera.children[0])}_renderCube(t,e,n){let s=this._boxMesh,r=this._cubeCamera;s.material=n,r.renderTarget=t,r.activeMipmapLevel=e;let o=t.width>>e;t.viewport.set(0,0,o,o),r.update(this._renderer,s),t.viewport.set(0,0,t.width,t.height)}_textureToCubemap(t){let e;t.mapping===ts||t.mapping===Ws?(this._cubemapMaterial===null&&(this._cubemapMaterial=Tf()),e=this._cubemapMaterial,e.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):(this._equirectMaterial===null&&(this._equirectMaterial=Af()),e=this._equirectMaterial),e.uniforms.envMap.value=t,this._renderCube(this._getSourceTarget(),0,e)}_applyPMREM(t){this._ggxMaterial===null&&(this._ggxMaterial=__(),this._integrationMaterial=x_());let e=this._cubeSize,n=t.texture.mipmaps.length-1,s=this._ggxMaterial.uniforms;s.envMap.value=this._sourceTarget.texture;let r=this._integrationMaterial.uniforms;r.envMap.value=this._sourceTarget.texture,r.sourceLod.value=Math.log2(e/Yf);for(let o=0;o<=n;o++){let a=i.lodToRoughness(o,n);if(o>n-p_)r.roughness.value=a,this._renderCube(t,o,this._integrationMaterial);else{let l=a>0?Math.log2(e)+.5*Math.log2(6/(qf*Math.pow(a,4)))+.5:0;s.roughness.value=a,s.lodBias.value=l,this._renderCube(t,o,this._ggxMaterial)}}}_blur(t,e){this._blurMaterial===null&&(this._blurMaterial=v_());let n=this._blurMaterial,s=n.uniforms,r=this._sourceTarget;s.sigma.value=Math.min(e,Math.PI)/Math.SQRT2,s.envMap.value=r.texture,this._renderCube(t,0,n),s.envMap.value=t.texture,this._renderCube(r,0,n)}};function wf(i,t,e){return new jr(i,{minFilter:_i,generateMipmaps:t,type:Gn,colorSpace:dr,depthBuffer:e})}function to(i,t,e){return new fn({name:i,uniforms:t,vertexShader:_e.cube_vert,fragmentShader:e,side:dn,blending:Qi,depthTest:!1,depthWrite:!1})}function __(){return to("PMREMGGXConvolution",{envMap:{value:null},roughness:{value:0},lodBias:{value:0}},`

		#define GGX_SAMPLES ${qf}u

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
	`)}function x_(){return to("PMREMGGXIntegration",{envMap:{value:null},roughness:{value:0},sourceLod:{value:0},sourceSize:{value:Yf}},`

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
	`)}function v_(){return to("PMREMSphericalGaussianBlur",{envMap:{value:null},sigma:{value:0}},`

		#define SAMPLES ${d_}
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
	`)}function Af(){return to("PMREMEquirectangularToCubemap",{envMap:{value:null}},`

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
	`)}function Tf(){return to("PMREMCubemapToCubemap",{envMap:{value:null},flipEnvMap:{value:-1}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float flipEnvMap;

		void main() {

			gl_FragColor = vec4( textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) ).rgb, 1.0 );

		}
	`)}function y_(i){let t=new WeakMap,e=new WeakMap,n=null;function s(d,u=!1){return d==null?null:u?o(d):r(d)}function r(d){if(d&&d.isTexture){let u=d.mapping;if(u===za||u===ka)if(t.has(d)){let m=t.get(d).texture;return a(m,d.mapping)}else{let m=d.image;if(m&&m.height>0){let x=new jr(m.height);return x.fromEquirectangularTexture(i,d),t.set(d,x),d.addEventListener("dispose",c),a(x.texture,d.mapping)}else return null}}return d}function o(d){if(d&&d.isTexture&&d.isPMREMTexture!==!0){let u=d.mapping,m=u===za||u===ka,x=u===ts||u===Ws;if(m||x){let p=e.get(d),g=p!==void 0?p.texture.pmremVersion:0;if(d.isRenderTargetTexture&&d.pmremVersion!==g)return n===null&&(n=new Tl(i)),p=m?n.fromEquirectangular(d,p):n.fromCubemap(d,p),p.texture.pmremVersion=d.pmremVersion,e.set(d,p),p.texture;if(p!==void 0)return p.texture;{let _=d.image;return m&&_&&_.height>0||x&&_&&l(_)?(n===null&&(n=new Tl(i)),p=m?n.fromEquirectangular(d):n.fromCubemap(d),p.texture.pmremVersion=d.pmremVersion,e.set(d,p),d.addEventListener("dispose",h),p.texture):null}}}return d}function a(d,u){return u===za?d.mapping=ts:u===ka&&(d.mapping=Ws),d}function l(d){let u=0,m=6;for(let x=0;x<m;x++)d[x]!==void 0&&u++;return u===m}function c(d){let u=d.target;u.removeEventListener("dispose",c);let m=t.get(u);m!==void 0&&(t.delete(u),m.dispose())}function h(d){let u=d.target;u.removeEventListener("dispose",h);let m=e.get(u);m!==void 0&&(e.delete(u),m.dispose())}function f(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:f}}function M_(i){let t={};function e(n){if(t[n]!==void 0)return t[n];let s=i.getExtension(n);return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let s=e(n);return s===null&&cr("WebGLRenderer: "+n+" extension not supported."),s}}}function S_(i,t,e,n){let s={},r=new WeakMap,o=new FinalizationRegistry(m=>delete s[m]);function a(m){l(m.target)}function l(m){m.index!==null&&t.remove(m.index);for(let p in m.attributes)t.remove(m.attributes[p]);m.removeEventListener("dispose",a),delete s[m.id],o.unregister(m);let x=r.get(m);x&&(t.remove(x),r.delete(m)),n.releaseStatesOfGeometry(m),m.isInstancedBufferGeometry===!0&&delete m._maxInstanceCount,e.memory.geometries--}function c(m,x){return s[x.id]!==void 0||(x.addEventListener("dispose",a),s[x.id]=new WeakRef(x),o.register(x,x.id,x),e.memory.geometries++),x}function h(m){let x=m.attributes;for(let p in x)t.update(x[p],i.ARRAY_BUFFER)}function f(m){let x=m.index,p=m.attributes.position,g=0;if(p===void 0)return;let _=x!==null?x.array.length:p.array.length/3-1,M=p.count>=65535?yr:vr,y=new M(Math.ceil(_/3)*6,1),T=y.array;if(x!==null){let v=x.array;g=x.version;for(let b=0,N=0;b<_;b+=3){let I=v[b+0],P=v[b+1],O=v[b+2];T[N++]=I,T[N++]=P,T[N++]=P,T[N++]=O,T[N++]=O,T[N++]=I}}else{g=p.version;for(let v=0,b=0;v<_;v+=3){let N=v+0,I=v+1,P=v+2;T[b++]=N,T[b++]=I,T[b++]=I,T[b++]=P,T[b++]=P,T[b++]=N}}y.version=g;let A=r.get(m);A&&t.remove(A),r.set(m,y)}function d(m){let x=r.get(m);if(x){let p=m.index;p!==null&&x.version<p.version&&f(m)}else f(m);return r.get(m)}function u(){for(let m in s){let x=s[m].deref();x!==void 0&&l(x)}}return{get:c,update:h,getWireframeAttribute:d,dispose:u}}function b_(i,t,e){let n;function s(f){n=f}let r,o;function a(f){r=f.type,o=f.bytesPerElement}function l(f,d){i.drawElements(n,d,r,f*o),e.update(d,n,1)}function c(f,d,u){u!==0&&(i.drawElementsInstanced(n,d,r,f*o,u),e.update(d,n,u))}function h(f,d,u){if(u===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,d,0,r,f,0,u);let x=0;for(let p=0;p<u;p++)x+=d[p];e.update(x,n,1)}this.setMode=s,this.setIndex=a,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function w_(i){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case i.TRIANGLES:e.triangles+=a*(r/3);break;case i.LINES:e.lines+=a*(r/2);break;case i.LINE_STRIP:e.lines+=a*(r-1);break;case i.LINE_LOOP:e.lines+=a*r;break;case i.POINTS:e.points+=a*r;break;default:ce("WebGLInfo: Unknown draw mode:",o);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function A_(i,t,e){let n=new WeakMap,s=new ze;function r(o,a,l){let c=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,f=h!==void 0?h.length:0,d=n.get(a);if(d===void 0||d.count!==f){let N=function(){v.dispose(),n.delete(a),a.removeEventListener("dispose",N)};d!==void 0&&d.texture.dispose();let u=a.morphAttributes.position!==void 0,m=a.morphAttributes.normal!==void 0,x=a.morphAttributes.color!==void 0,p=a.morphAttributes.position||[],g=a.morphAttributes.normal||[],_=a.morphAttributes.color||[],M=0;u===!0&&(M=1),m===!0&&(M=2),x===!0&&(M=3);let y=a.attributes.position.count*M,T=1;y>t.maxTextureSize&&(T=Math.ceil(y/t.maxTextureSize),y=t.maxTextureSize);let A=new Float32Array(y*T*4*f),v=new _r(A,y,T,f);v.type=kn,v.needsUpdate=!0;let b=M*4;for(let I=0;I<f;I++){let P=p[I],O=g[I],V=_[I],R=y*T*4*I;for(let B=0;B<P.count;B++){let k=B*b;u===!0&&(s.fromBufferAttribute(P,B),A[R+k+0]=s.x,A[R+k+1]=s.y,A[R+k+2]=s.z,A[R+k+3]=0),m===!0&&(s.fromBufferAttribute(O,B),A[R+k+4]=s.x,A[R+k+5]=s.y,A[R+k+6]=s.z,A[R+k+7]=0),x===!0&&(s.fromBufferAttribute(V,B),A[R+k+8]=s.x,A[R+k+9]=s.y,A[R+k+10]=s.z,A[R+k+11]=V.itemSize===4?s.w:1)}}d={count:f,texture:v,size:new Lt(y,T)},n.set(a,d),a.addEventListener("dispose",N)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",o.morphTexture,e);else{let u=0;for(let x=0;x<c.length;x++)u+=c[x];let m=a.morphTargetsRelative?1:1-u;l.getUniforms().setValue(i,"morphTargetBaseInfluence",m),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",d.texture,e),l.getUniforms().setValue(i,"morphTargetsTextureSize",d.size)}return{update:r}}function T_(i,t,e,n,s){let r=new WeakMap;function o(c){let h=s.render.frame,f=c.geometry,d=t.get(c,f);if(r.get(d)!==h&&(t.update(d),r.set(d,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(e.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){let u=c.skeleton;r.get(u)!==h&&(u.update(),r.set(u,h))}return d}function a(){r=new WeakMap}function l(c){let h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),e.remove(h.instanceMatrix),h.instanceColor!==null&&e.remove(h.instanceColor)}return{update:o,dispose:a}}var E_={[Dc]:"LINEAR_TONE_MAPPING",[Fc]:"REINHARD_TONE_MAPPING",[Uc]:"CINEON_TONE_MAPPING",[Oc]:"ACES_FILMIC_TONE_MAPPING",[zc]:"AGX_TONE_MAPPING",[kc]:"NEUTRAL_TONE_MAPPING",[Bc]:"CUSTOM_TONE_MAPPING"};function R_(i,t,e,n,s,r){let o=new un(t,e,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),a=null,l=null,c=null,h=new Ue;h.setAttribute("position",new we([-1,3,0,-1,-1,0,3,-1,0],3)),h.setAttribute("uv",new we([0,2,0,0,2,0],2));let f=new ba({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),d=new _n(h,f),u=new Ua(-1,1,1,-1,0,1),m=null,x=null,p=!1,g,_=null,M=[],y=!1;this.setSize=function(T,A){o.setSize(T,A),a!==null&&a.setSize(T,A),l!==null&&l.setSize(T,A);for(let v=0;v<M.length;v++){let b=M[v];b.setSize&&b.setSize(T,A)}},this.setEffects=function(T){M=T,y=M.length>0&&M[0].isRenderPass===!0;let A=o.width,v=o.height;M.length>0&&a===null&&(a=new un(A,v,{type:Gn,depthBuffer:!1,stencilBuffer:!1}),l=new un(A,v,{type:Gn,depthBuffer:!1,stencilBuffer:!1}));let b=s===!0&&M.some(N=>N.needsDepthTexture===!0);b!==(o.depthTexture!==null)&&(b===!0&&c===null&&(c=new gi(A,v),r===!0&&(c.format=xi,c.type=es)),o.dispose(),o.depthTexture=b?c:null,o.resolveDepthBuffer=b,o.storeMultisampledDepthBuffer=b);for(let N=0;N<M.length;N++){let I=M[N];I.setSize&&I.setSize(A,v),b&&I.needsDepthTexture===!0&&I.setDepthTexture&&I.setDepthTexture(c)}},this.begin=function(T,A){if(p||T.toneMapping===Qn&&M.length===0)return!1;if(_=A,A!==null){let v=A.width,b=A.height;(o.width!==v||o.height!==b)&&this.setSize(v,b)}return y===!1&&T.setRenderTarget(o),g=T.toneMapping,T.toneMapping=Qn,!0},this.hasRenderPass=function(){return y},this.end=function(T,A){T.toneMapping=g,p=!0;let v=o,b=a;for(let N=0;N<M.length;N++){let I=M[N];I.enabled!==!1&&(I.render(T,b,v,A),I.needsSwap!==!1&&(v=b,b=b===a?l:a))}if(m!==T.outputColorSpace||x!==T.toneMapping){m=T.outputColorSpace,x=T.toneMapping,f.defines={},Se.getTransfer(m)===Pe&&(f.defines.SRGB_TRANSFER="");let N=E_[x];N&&(f.defines[N]=""),f.needsUpdate=!0}f.uniforms.tDiffuse.value=v.texture,T.setRenderTarget(_),T.render(d,u),_=null,p=!1},this.isCompositing=function(){return p},this.dispose=function(){o.dispose(),a!==null&&a.dispose(),l!==null&&l.dispose(),h.dispose(),f.dispose()}}var Zf=new gn,Jf=new gi(1,1),$f=new br(1),Kf=new _r,Qf=new ha,jf=new Sr,Ef=[],Rf=[],Cf=new Float32Array(16),If=new Float32Array(9),Pf=new Float32Array(4);function Zs(i,t,e){let n=i[0];if(n<=0||n>0)return i;let s=t*e,r=Ef[s];if(r===void 0&&(r=new Float32Array(s),Ef[s]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,i[o].toArray(r,a)}return r}function Je(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function $e(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function Rl(i,t){let e=Rf[t];e===void 0&&(e=new Int32Array(t),Rf[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function C_(i,t){let e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function I_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Je(e,t))return;i.uniform2fv(this.addr,t),$e(e,t)}}function P_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Je(e,t))return;i.uniform3fv(this.addr,t),$e(e,t)}}function L_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Je(e,t))return;i.uniform4fv(this.addr,t),$e(e,t)}}function N_(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(Je(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),$e(e,t)}else{if(Je(e,n))return;Pf.set(n),i.uniformMatrix2fv(this.addr,!1,Pf),$e(e,n)}}function D_(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(Je(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),$e(e,t)}else{if(Je(e,n))return;If.set(n),i.uniformMatrix3fv(this.addr,!1,If),$e(e,n)}}function F_(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(Je(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),$e(e,t)}else{if(Je(e,n))return;Cf.set(n),i.uniformMatrix4fv(this.addr,!1,Cf),$e(e,n)}}function U_(i,t){let e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function O_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Je(e,t))return;i.uniform2iv(this.addr,t),$e(e,t)}}function B_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Je(e,t))return;i.uniform3iv(this.addr,t),$e(e,t)}}function z_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Je(e,t))return;i.uniform4iv(this.addr,t),$e(e,t)}}function k_(i,t){let e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function G_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Je(e,t))return;i.uniform2uiv(this.addr,t),$e(e,t)}}function V_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Je(e,t))return;i.uniform3uiv(this.addr,t),$e(e,t)}}function H_(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Je(e,t))return;i.uniform4uiv(this.addr,t),$e(e,t)}}function Cl(i){return i.version===0&&(i.compareFunction=Qc,i.needsUpdate=!0),i}function W_(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?r=Cl(Jf):r=Zf,e.setTexture2D(t||r,s)}function X_(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||Qf,s)}function q_(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_CUBE_SHADOW?r=Cl($f):r=jf,e.setTextureCube(t||r,s)}function Y_(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||Kf,s)}function Z_(i){switch(i){case 5126:return C_;case 35664:return I_;case 35665:return P_;case 35666:return L_;case 35674:return N_;case 35675:return D_;case 35676:return F_;case 5124:case 35670:return U_;case 35667:case 35671:return O_;case 35668:case 35672:return B_;case 35669:case 35673:return z_;case 5125:return k_;case 36294:return G_;case 36295:return V_;case 36296:return H_;case 35678:case 36198:case 36298:case 36306:case 35682:return W_;case 35679:case 36299:case 36307:return X_;case 35680:case 36300:case 36308:case 36293:return q_;case 36289:case 36303:case 36311:case 36292:return Y_}}function J_(i,t){i.uniform1fv(this.addr,t)}function $_(i,t){let e=Zs(t,this.size,2);i.uniform2fv(this.addr,e)}function K_(i,t){let e=Zs(t,this.size,3);i.uniform3fv(this.addr,e)}function Q_(i,t){let e=Zs(t,this.size,4);i.uniform4fv(this.addr,e)}function j_(i,t){let e=Zs(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function tx(i,t){let e=Zs(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function ex(i,t){let e=Zs(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function nx(i,t){i.uniform1iv(this.addr,t)}function ix(i,t){i.uniform2iv(this.addr,t)}function sx(i,t){i.uniform3iv(this.addr,t)}function rx(i,t){i.uniform4iv(this.addr,t)}function ox(i,t){i.uniform1uiv(this.addr,t)}function ax(i,t){i.uniform2uiv(this.addr,t)}function lx(i,t){i.uniform3uiv(this.addr,t)}function cx(i,t){i.uniform4uiv(this.addr,t)}function hx(i,t,e){let n=this.cache,s=t.length,r=Rl(e,s);Je(n,r)||(i.uniform1iv(this.addr,r),$e(n,r));let o;this.type===i.SAMPLER_2D_SHADOW?o=Cl(Jf):o=Zf;for(let a=0;a!==s;++a)e.setTexture2D(t[a]||o,r[a])}function ux(i,t,e){let n=this.cache,s=t.length,r=Rl(e,s);Je(n,r)||(i.uniform1iv(this.addr,r),$e(n,r));for(let o=0;o!==s;++o)e.setTexture3D(t[o]||Qf,r[o])}function fx(i,t,e){let n=this.cache,s=t.length,r=Rl(e,s);Je(n,r)||(i.uniform1iv(this.addr,r),$e(n,r));let o;this.type===i.SAMPLER_CUBE_SHADOW?o=Cl($f):o=jf;for(let a=0;a!==s;++a)e.setTextureCube(t[a]||o,r[a])}function dx(i,t,e){let n=this.cache,s=t.length,r=Rl(e,s);Je(n,r)||(i.uniform1iv(this.addr,r),$e(n,r));for(let o=0;o!==s;++o)e.setTexture2DArray(t[o]||Kf,r[o])}function px(i){switch(i){case 5126:return J_;case 35664:return $_;case 35665:return K_;case 35666:return Q_;case 35674:return j_;case 35675:return tx;case 35676:return ex;case 5124:case 35670:return nx;case 35667:case 35671:return ix;case 35668:case 35672:return sx;case 35669:case 35673:return rx;case 5125:return ox;case 36294:return ax;case 36295:return lx;case 36296:return cx;case 35678:case 36198:case 36298:case 36306:case 35682:return hx;case 35679:case 36299:case 36307:return ux;case 35680:case 36300:case 36308:case 36293:return fx;case 36289:case 36303:case 36311:case 36292:return dx}}var ph=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=Z_(e.type)}},mh=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=px(e.type)}},gh=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let s=this.seq;for(let r=0,o=s.length;r!==o;++r){let a=s[r];a.setValue(t,e[a.id],n)}}},fh=/(\w+)(\])?(\[|\.)?/g;function Lf(i,t){i.seq.push(t),i.map[t.id]=t}function mx(i,t,e){let n=i.name,s=n.length;for(fh.lastIndex=0;;){let r=fh.exec(n),o=fh.lastIndex,a=r[1],l=r[2]==="]",c=r[3];if(l&&(a=a|0),c===void 0||c==="["&&o+2===s){Lf(e,c===void 0?new ph(a,i,t):new mh(a,i,t));break}else{let f=e.map[a];f===void 0&&(f=new gh(a),Lf(e,f)),e=f}}}var Ys=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let o=0;o<n;++o){let a=t.getActiveUniform(e,o),l=t.getUniformLocation(e,a.name);mx(a,l,this)}let s=[],r=[];for(let o of this.seq)o.type===t.SAMPLER_2D_SHADOW||o.type===t.SAMPLER_CUBE_SHADOW||o.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(o):r.push(o);s.length>0&&(this.seq=s.concat(r))}setValue(t,e,n,s){let r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){let s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,o=e.length;r!==o;++r){let a=e[r],l=n[a.id];l.needsUpdate!==!1&&a.setValue(t,l.value,s)}}static seqWithValue(t,e){let n=[];for(let s=0,r=t.length;s!==r;++s){let o=t[s];o.id in e&&n.push(o)}return n}};function Nf(i,t,e){let n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}var gx=37297,_x=0;function xx(i,t){let e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=s;o<r;o++){let a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}var Df=new he;function vx(i){Se._getMatrix(Df,Se.workingColorSpace,i);let t=`mat3( ${Df.elements.map(e=>e.toFixed(4))} )`;switch(Se.getTransfer(i)){case pr:return[t,"LinearTransferOETF"];case Pe:return[t,"sRGBTransferOETF"];default:return ae("WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function Ff(i,t,e){let n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";let o=/ERROR: 0:(\d+)/.exec(r);if(o){let a=parseInt(o[1]);return e.toUpperCase()+`

`+r+`

`+xx(i.getShaderSource(t),a)}else return r}function yx(i,t){let e=vx(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( ${e[0]} * value.rgb, value.a ) );`,"}"].join(`
`)}var Mx={[Dc]:"Linear",[Fc]:"Reinhard",[Uc]:"Cineon",[Oc]:"ACESFilmic",[zc]:"AgX",[kc]:"Neutral",[Bc]:"Custom"};function Sx(i,t){let e=Mx[t];return e===void 0?(ae("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var Al=new G;function bx(){Se.getLuminanceCoefficients(Al);let i=Al.x.toFixed(4),t=Al.y.toFixed(4),e=Al.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function wx(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Qr).join(`
`)}function Ax(i){let t=[];for(let e in i){let n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Tx(i,t){let e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(t,s),o=r.name,a=1;r.type===i.FLOAT_MAT2&&(a=2),r.type===i.FLOAT_MAT3&&(a=3),r.type===i.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:i.getAttribLocation(t,o),locationSize:a}}return e}function Qr(i){return i!==""}function Uf(i,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows).replace(/NUM_LIGHT_PROBE_GRIDS/g,t.numLightProbeGrids)}function Of(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var Ex=/^[ \t]*#include +<([\w\d./]+)>/gm;function _h(i){return i.replace(Ex,Rx)}function Rx(i,t){let e=_e[t];if(e===void 0)throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">");return _h(e)}var Cx=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Bf(i){return i.replace(Cx,Ix)}function Ix(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function zf(i){let t=`precision ${i.precision} float;
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
#define LOW_PRECISION`),t}var Px={[Hr]:"SHADOWMAP_TYPE_PCF",[Gs]:"SHADOWMAP_TYPE_VSM"};function Lx(i){return Px[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var Nx={[Ws]:"ENVMAP_MODE_REFRACTION"};function Dx(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":Nx[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}var Fx={[Nc]:"ENVMAP_BLENDING_MULTIPLY",[Ku]:"ENVMAP_BLENDING_MIX",[Qu]:"ENVMAP_BLENDING_ADD"};function Ux(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":Fx[i.combine]||"ENVMAP_BLENDING_NONE"}function Ox(i,t,e,n){let s=i.getContext(),r=e.defines,o=e.vertexShader,a=e.fragmentShader,l=Lx(e),c=e.envMapPMREM===!0?"ENVMAP_TYPE_PMREM":"ENVMAP_TYPE_CUBE",h=Dx(e),f=Ux(e),d=wx(e),u=Ax(r),m=s.createProgram(),x,p,g=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(x=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u].filter(Qr).join(`
`),x.length>0&&(x+=`
`),p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u].filter(Qr).join(`
`),p.length>0&&(p+=`
`)):(x=[zf(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.diffuseRoughnessMapUv?"#define DIFFUSE_ROUGHNESSMAP_UV "+e.diffuseRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Qr).join(`
`),p=[zf(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,u,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+f:"",e.envMapPMREM?"#define ENVMAP_MAX_LOD "+e.envMapMaxLod+".0":"",e.envMapPMREM?"#define ENVMAP_SIZE "+e.envMapSize+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.diffuseRoughness?"#define USE_DIFFUSE_ROUGHNESS":"",e.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.retroreflection?"#define USE_RETROREFLECTION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==Qn?"#define TONE_MAPPING":"",e.toneMapping!==Qn?_e.tonemapping_pars_fragment:"",e.toneMapping!==Qn?Sx("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",_e.colorspace_pars_fragment,yx("linearToOutputTexel",e.outputColorSpace),bx(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Qr).join(`
`)),o=_h(o),o=Uf(o,e),o=Of(o,e),a=_h(a),a=Uf(a,e),a=Of(a,e),o=Bf(o),a=Bf(a),e.isRawShaderMaterial!==!0&&(g=`#version 300 es
`,x=[d,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+x,p=["#define varying in",e.glslVersion===jc?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===jc?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let _=g+x+o,M=g+p+a,y=Nf(s,s.VERTEX_SHADER,_),T=Nf(s,s.FRAGMENT_SHADER,M);s.attachShader(m,y),s.attachShader(m,T),e.index0AttributeName!==void 0?s.bindAttribLocation(m,0,e.index0AttributeName):e.hasPositionAttribute===!0&&s.bindAttribLocation(m,0,"position"),s.linkProgram(m);function A(I){if(i.debug.checkShaderErrors){let P=s.getProgramInfoLog(m)||"",O=s.getShaderInfoLog(y)||"",V=s.getShaderInfoLog(T)||"",R=P.trim(),B=O.trim(),k=V.trim(),L=!0,W=!0;if(s.getProgramParameter(m,s.LINK_STATUS)===!1)if(L=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,m,y,T);else{let U=Ff(s,y,"vertex"),X=Ff(s,T,"fragment");ce("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(m,s.VALIDATE_STATUS)+`

Material Name: `+I.name+`
Material Type: `+I.type+`

Program Info Log: `+R+`
`+U+`
`+X)}else R!==""?ae("WebGLProgram: Program Info Log:",R):(B===""||k==="")&&(W=!1);W&&(I.diagnostics={runnable:L,programLog:R,vertexShader:{log:B,prefix:x},fragmentShader:{log:k,prefix:p}})}s.deleteShader(y),s.deleteShader(T),v=new Ys(s,m),b=Tx(s,m)}let v;this.getUniforms=function(){return v===void 0&&A(this),v};let b;this.getAttributes=function(){return b===void 0&&A(this),b};let N=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return N===!1&&(N=s.getProgramParameter(m,gx)),N},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(m),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=_x++,this.cacheKey=t,this.usedTimes=1,this.program=m,this.vertexShader=y,this.fragmentShader=T,this}var Bx=0,xh=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){let s=this._getShaderCacheForMaterial(t);return s.has(e)===!1&&(s.add(e),e.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new vh(t),e.set(t,n)),n}},vh=class{constructor(t){this.id=Bx++,this.code=t,this.usedTimes=0}};function zx(i){return i===Oi||i===Jr||i===$r}function kx(i,t,e,n,s,r){let o=new Ls,a=new xh,l=new Set,c=[],h=new Map,f=n.logarithmicDepthBuffer,d={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function u(v){return l.add(v),v===0?"uv":`uv${v}`}function m(v,b,N,I,P,O){let V=I.fog,R=P.geometry,B=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?I.environment:null,k=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap,L=t.get(v.envMap||B,k),W=d[v.type],U=n.precision;v.precision!==null&&(U=n.getMaxPrecision(v.precision),U!==v.precision&&ae("WebGLProgram.getParameters:",v.precision,"not supported, using",U,"instead."));let X=R.morphAttributes.position||R.morphAttributes.normal||R.morphAttributes.color,j=X!==void 0?X.length:0,_t=0;R.morphAttributes.position!==void 0&&(_t=1),R.morphAttributes.normal!==void 0&&(_t=2),R.morphAttributes.color!==void 0&&(_t=3);let Dt,Z,ot,xt;if(W){let Ht=ti[W];Dt=Ht.vertexShader,Z=Ht.fragmentShader}else{Dt=v.vertexShader,Z=v.fragmentShader;let Ht=a.getVertexShaderStage(v),Re=a.getFragmentShaderStage(v);a.update(v,Ht,Re),ot=Ht.id,xt=Re.id}let Gt=i.getRenderTarget(),tt=i.state.buffers.depth.getReversed(),Jt=P.isInstancedMesh===!0,se=P.isBatchedMesh===!0,lt=!!v.map,ee=!!v.matcap,gt=!!L,K=gt&&L.isPMREMTexture===!0,ft=!!v.aoMap,ht=!!v.lightMap,dt=!!v.bumpMap&&v.wireframe===!1,mt=!!v.normalMap,Bt=!!v.displacementMap,It=!!v.emissiveMap,Zt=!!v.metalnessMap,Q=!!v.roughnessMap,yt=v.anisotropy>0,D=v.clearcoat>0,Vt=v.diffuseRoughness>0,Nt=v.dispersion>0,Qt=v.retroreflectivity>0,ut=v.iridescence>0,Kt=v.sheen>0,At=v.transmission>0,Pt=yt&&!!v.anisotropyMap,C=D&&!!v.clearcoatMap,w=D&&!!v.clearcoatNormalMap,q=D&&!!v.clearcoatRoughnessMap,vt=Vt&&!!v.diffuseRoughnessMap,it=ut&&!!v.iridescenceMap,St=ut&&!!v.iridescenceThicknessMap,Et=Kt&&!!v.sheenColorMap,st=Kt&&!!v.sheenRoughnessMap,at=!!v.specularMap,Ft=!!v.specularColorMap,z=!!v.specularIntensityMap,ct=At&&!!v.transmissionMap,rt=At&&!!v.thicknessMap,zt=!!v.gradientMap,Rt=!!v.alphaMap,Ot=v.alphaTest>0,ie=!!v.alphaHash,de=!!v.extensions,Ct=Qn;v.toneMapped&&(Gt===null||Gt.isXRRenderTarget===!0)&&(Ct=i.toneMapping);let re=K?L.isCompressedCubeTexture?L.image[0].mipmaps:L.mipmaps:null,me={shaderID:W,shaderType:v.type,shaderName:v.name,vertexShader:Dt,fragmentShader:Z,defines:v.defines,customVertexShaderID:ot,customFragmentShaderID:xt,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:U,batching:se,batchingColor:se&&P._colorsTexture!==null,instancing:Jt,instancingColor:Jt&&P.instanceColor!==null,instancingMorph:Jt&&P.morphTexture!==null,outputColorSpace:Gt===null?i.outputColorSpace:Gt.isXRRenderTarget===!0?Gt.texture.colorSpace:Se.workingColorSpace,alphaToCoverage:!!v.alphaToCoverage,map:lt,matcap:ee,envMap:gt,envMapMode:gt&&L.mapping,envMapPMREM:K,envMapMaxLod:K?re.length-1:null,envMapSize:K?re[0].width:null,aoMap:ft,lightMap:ht,bumpMap:dt,normalMap:mt,displacementMap:Bt,emissiveMap:It,normalMapObjectSpace:mt&&v.normalMapType===ef,normalMapTangentSpace:mt&&v.normalMapType===Jc,packedNormalMap:mt&&v.normalMapType===Jc&&zx(v.normalMap.format),metalnessMap:Zt,roughnessMap:Q,anisotropy:yt,anisotropyMap:Pt,clearcoat:D,clearcoatMap:C,clearcoatNormalMap:w,clearcoatRoughnessMap:q,diffuseRoughness:Vt,diffuseRoughnessMap:vt,dispersion:Nt,retroreflection:Qt,iridescence:ut,iridescenceMap:it,iridescenceThicknessMap:St,sheen:Kt,sheenColorMap:Et,sheenRoughnessMap:st,specularMap:at,specularColorMap:Ft,specularIntensityMap:z,transmission:At,transmissionMap:ct,thicknessMap:rt,gradientMap:zt,opaque:v.transparent===!1&&v.blending===Vs&&v.alphaToCoverage===!1,alphaMap:Rt,alphaTest:Ot,alphaHash:ie,combine:v.combine,mapUv:lt&&u(v.map.channel),aoMapUv:ft&&u(v.aoMap.channel),lightMapUv:ht&&u(v.lightMap.channel),bumpMapUv:dt&&u(v.bumpMap.channel),normalMapUv:mt&&u(v.normalMap.channel),displacementMapUv:Bt&&u(v.displacementMap.channel),emissiveMapUv:It&&u(v.emissiveMap.channel),metalnessMapUv:Zt&&u(v.metalnessMap.channel),roughnessMapUv:Q&&u(v.roughnessMap.channel),anisotropyMapUv:Pt&&u(v.anisotropyMap.channel),clearcoatMapUv:C&&u(v.clearcoatMap.channel),clearcoatNormalMapUv:w&&u(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:q&&u(v.clearcoatRoughnessMap.channel),diffuseRoughnessMapUv:vt&&u(v.diffuseRoughnessMap.channel),iridescenceMapUv:it&&u(v.iridescenceMap.channel),iridescenceThicknessMapUv:St&&u(v.iridescenceThicknessMap.channel),sheenColorMapUv:Et&&u(v.sheenColorMap.channel),sheenRoughnessMapUv:st&&u(v.sheenRoughnessMap.channel),specularMapUv:at&&u(v.specularMap.channel),specularColorMapUv:Ft&&u(v.specularColorMap.channel),specularIntensityMapUv:z&&u(v.specularIntensityMap.channel),transmissionMapUv:ct&&u(v.transmissionMap.channel),thicknessMapUv:rt&&u(v.thicknessMap.channel),alphaMapUv:Rt&&u(v.alphaMap.channel),vertexTangents:!!R.attributes.tangent&&(mt||yt),vertexNormals:!!R.attributes.normal,vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!R.attributes.color&&R.attributes.color.itemSize===4,pointsUvs:P.isPoints===!0&&!!R.attributes.uv&&(lt||Rt),fog:!!V,useFog:v.fog===!0,fogExp2:!!V&&V.isFogExp2,flatShading:v.wireframe===!1&&(v.flatShading===!0||R.attributes.normal===void 0&&mt===!1&&(v.isMeshLambertMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isMeshPhysicalMaterial)),sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:f,reversedDepthBuffer:tt,skinning:P.isSkinnedMesh===!0,hasPositionAttribute:R.attributes.position!==void 0,morphTargets:R.morphAttributes.position!==void 0,morphNormals:R.morphAttributes.normal!==void 0,morphColors:R.morphAttributes.color!==void 0,morphTargetsCount:j,morphTextureStride:_t,numSunLights:b.sun.length,numDirLights:b.directional.length,numPointLights:b.point.length,numSpotLights:b.spot.length,numSpotLightMaps:b.spotLightMap.length,numRectAreaLights:b.rectArea.length,numHemiLights:b.hemi.length,numSunLightShadows:b.sunShadowMap.length,numDirLightShadows:b.directionalShadowMap.length,numPointLightShadows:b.pointShadowMap.length,numSpotLightShadows:b.spotShadowMap.length,numSpotLightShadowsWithMaps:b.numSpotLightShadowsWithMaps,numLightProbes:b.numLightProbes,numLightProbeGrids:O.filter(Ht=>Ht.texture!==null).length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:v.dithering,shadowMapEnabled:i.shadowMap.enabled&&N.length>0,shadowMapType:i.shadowMap.type,toneMapping:Ct,decodeVideoTexture:lt&&v.map.isVideoTexture===!0&&Se.getTransfer(v.map.colorSpace)===Pe,decodeVideoTextureEmissive:It&&v.emissiveMap.isVideoTexture===!0&&Se.getTransfer(v.emissiveMap.colorSpace)===Pe,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===xn,flipSided:v.side===dn,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionClipCullDistance:de&&v.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(de&&v.extensions.multiDraw===!0||se)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:v.customProgramCacheKey()};return me.vertexUv1s=l.has(1),me.vertexUv2s=l.has(2),me.vertexUv3s=l.has(3),l.clear(),me}function x(v){let b=[];if(v.shaderID?b.push(v.shaderID):(b.push(v.customVertexShaderID),b.push(v.customFragmentShaderID)),v.defines!==void 0)for(let N in v.defines)b.push(N),b.push(v.defines[N]);return v.isRawShaderMaterial===!1&&(p(b,v),g(b,v),b.push(i.outputColorSpace)),b.push(v.customProgramCacheKey),b.join()}function p(v,b){v.push(b.precision),v.push(b.outputColorSpace),v.push(b.envMapMode),v.push(b.envMapPMREM),v.push(b.envMapMaxLod),v.push(b.envMapSize),v.push(b.mapUv),v.push(b.alphaMapUv),v.push(b.lightMapUv),v.push(b.aoMapUv),v.push(b.bumpMapUv),v.push(b.normalMapUv),v.push(b.displacementMapUv),v.push(b.emissiveMapUv),v.push(b.metalnessMapUv),v.push(b.roughnessMapUv),v.push(b.anisotropyMapUv),v.push(b.clearcoatMapUv),v.push(b.clearcoatNormalMapUv),v.push(b.clearcoatRoughnessMapUv),v.push(b.diffuseRoughnessMapUv),v.push(b.iridescenceMapUv),v.push(b.iridescenceThicknessMapUv),v.push(b.sheenColorMapUv),v.push(b.sheenRoughnessMapUv),v.push(b.specularMapUv),v.push(b.specularColorMapUv),v.push(b.specularIntensityMapUv),v.push(b.transmissionMapUv),v.push(b.thicknessMapUv),v.push(b.combine),v.push(b.fogExp2),v.push(b.sizeAttenuation),v.push(b.morphTargetsCount),v.push(b.numSunLights),v.push(b.numDirLights),v.push(b.numPointLights),v.push(b.numSpotLights),v.push(b.numSpotLightMaps),v.push(b.numHemiLights),v.push(b.numRectAreaLights),v.push(b.numSunLightShadows),v.push(b.numDirLightShadows),v.push(b.numPointLightShadows),v.push(b.numSpotLightShadows),v.push(b.numSpotLightShadowsWithMaps),v.push(b.numLightProbes),v.push(b.numLightProbeGrids),v.push(b.shadowMapType),v.push(b.toneMapping),v.push(b.numClippingPlanes),v.push(b.numClipIntersection),v.push(b.depthPacking)}function g(v,b){o.disableAll(),b.instancing&&o.enable(0),b.instancingColor&&o.enable(1),b.instancingMorph&&o.enable(2),b.matcap&&o.enable(3),b.envMap&&o.enable(4),b.normalMapObjectSpace&&o.enable(5),b.normalMapTangentSpace&&o.enable(6),b.clearcoat&&o.enable(7),b.iridescence&&o.enable(8),b.alphaTest&&o.enable(9),b.vertexColors&&o.enable(10),b.vertexAlphas&&o.enable(11),b.vertexUv1s&&o.enable(12),b.vertexUv2s&&o.enable(13),b.vertexUv3s&&o.enable(14),b.vertexTangents&&o.enable(15),b.anisotropy&&o.enable(16),b.alphaHash&&o.enable(17),b.batching&&o.enable(18),b.dispersion&&o.enable(19),b.retroreflection&&o.enable(24),b.diffuseRoughness&&o.enable(25),b.batchingColor&&o.enable(20),b.gradientMap&&o.enable(21),b.packedNormalMap&&o.enable(22),b.vertexNormals&&o.enable(23),v.push(o.mask),o.disableAll(),b.fog&&o.enable(0),b.useFog&&o.enable(1),b.flatShading&&o.enable(2),b.logarithmicDepthBuffer&&o.enable(3),b.reversedDepthBuffer&&o.enable(4),b.skinning&&o.enable(5),b.morphTargets&&o.enable(6),b.morphNormals&&o.enable(7),b.morphColors&&o.enable(8),b.premultipliedAlpha&&o.enable(9),b.shadowMapEnabled&&o.enable(10),b.doubleSided&&o.enable(11),b.flipSided&&o.enable(12),b.useDepthPacking&&o.enable(13),b.dithering&&o.enable(14),b.transmission&&o.enable(15),b.sheen&&o.enable(16),b.opaque&&o.enable(17),b.pointsUvs&&o.enable(18),b.decodeVideoTexture&&o.enable(19),b.decodeVideoTextureEmissive&&o.enable(20),b.alphaToCoverage&&o.enable(21),b.numLightProbeGrids>0&&o.enable(22),b.hasPositionAttribute&&o.enable(23),v.push(o.mask)}function _(v){let b=d[v.type],N;if(b){let I=ti[b];N=yf.clone(I.uniforms)}else N=v.uniforms;return N}function M(v,b){let N=h.get(b);return N!==void 0?++N.usedTimes:(N=new Ox(i,b,v,s),c.push(N),h.set(b,N)),N}function y(v){if(--v.usedTimes===0){let b=c.indexOf(v);c[b]=c[c.length-1],c.pop(),h.delete(v.cacheKey),v.destroy()}}function T(v){a.remove(v)}function A(){a.dispose()}return{getParameters:m,getProgramCacheKey:x,getUniforms:_,acquireProgram:M,releaseProgram:y,releaseShaderCache:T,programs:c,dispose:A}}function Gx(){let i=new WeakMap;function t(o){return i.has(o)}function e(o){let a=i.get(o);return a===void 0&&(a={},i.set(o,a)),a}function n(o){i.delete(o)}function s(o,a,l){i.get(o)[a]=l}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function Vx(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.materialVariant!==t.materialVariant?i.materialVariant-t.materialVariant:i.z!==t.z?i.z-t.z:i.id-t.id}function kf(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function Gf(){let i=[],t=0,e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function o(d){let u=0;return d.isInstancedMesh&&(u+=2),d.isSkinnedMesh&&(u+=1),u}function a(d,u,m,x,p,g){let _=i[t];return _===void 0?(_={id:d.id,object:d,geometry:u,material:m,materialVariant:o(d),groupOrder:x,renderOrder:d.renderOrder,z:p,group:g},i[t]=_):(_.id=d.id,_.object=d,_.geometry=u,_.material=m,_.materialVariant=o(d),_.groupOrder=x,_.renderOrder=d.renderOrder,_.z=p,_.group=g),t++,_}function l(d,u,m,x,p,g,_){_.reversedDepth===!0&&(p=-p);let M=a(d,u,m,x,p,g);m.transmission>0?n.push(M):m.transparent===!0?s.push(M):e.push(M)}function c(d,u,m,x,p,g){let _=a(d,u,m,x,p,g);m.transmission>0?n.unshift(_):m.transparent===!0?s.unshift(_):e.unshift(_)}function h(d,u){e.length>1&&e.sort(d||Vx),n.length>1&&n.sort(u||kf),s.length>1&&s.sort(u||kf)}function f(){for(let d=t,u=i.length;d<u;d++){let m=i[d];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:f,sort:h}}function Hx(){let i=new WeakMap;function t(n,s){let r=i.get(n),o;return r===void 0?(o=new Gf,i.set(n,[o])):s>=r.length?(o=new Gf,r.push(o)):o=r[s],o}function e(){i=new WeakMap}return{get:t,dispose:e}}function Wx(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={direction:new G,color:new Ae};break;case"SpotLight":e={position:new G,direction:new G,color:new Ae,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new G,color:new Ae,distance:0,decay:0};break;case"HemisphereLight":e={direction:new G,skyColor:new Ae,groundColor:new Ae};break;case"RectAreaLight":e={color:new Ae,position:new G,halfWidth:new G,halfHeight:new G};break}return i[t.id]=e,e}}}function Xx(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"SunLight":case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Lt};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Lt};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Lt,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}var qx=0;function Yx(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function Zx(i){let t=new Wx,e=Xx(),n={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new G);let s=new G,r=new fe,o=new fe;function a(c){let h=0,f=0,d=0;for(let O=0;O<9;O++)n.probe[O].set(0,0,0);let u=0,m=0,x=0,p=0,g=0,_=0,M=0,y=0,T=0,A=0,v=0,b=0,N=0,I=0;c.sort(Yx);for(let O=0,V=c.length;O<V;O++){let R=c[O],B=R.color,k=R.intensity,L=R.distance,W=null;if(R.shadow&&R.shadow.map&&(R.shadow.map.texture.format===Oi?W=R.shadow.map.texture:W=R.shadow.map.depthTexture||R.shadow.map.texture),R.isAmbientLight)h+=B.r*k,f+=B.g*k,d+=B.b*k;else if(R.isLightProbe){for(let U=0;U<9;U++)n.probe[U].addScaledVector(R.sh.coefficients[U],k);I++}else if(R.isSunLight){let U=t.get(R);if(U.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){let X=R.shadow,j=e.get(R);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize.copy(X.mapSize).multiply(X.getFrameExtents()),n.sunShadow[m]=j,n.sunShadowMap[m]=W;let _t=X.getViewportCount();for(let Dt=0;Dt<_t;Dt++)n.sunShadowMatrix[x+Dt]=X.getMatrix(Dt),n.sunShadowCascade[x+Dt]=X._cascadeData[Dt];x+=_t,m++}n.sun[u]=U,u++}else if(R.isDirectionalLight){let U=t.get(R);if(U.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){let X=R.shadow,j=e.get(R);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize=X.mapSize,n.directionalShadow[p]=j,n.directionalShadowMap[p]=W,n.directionalShadowMatrix[p]=R.shadow.matrix,T++}n.directional[p]=U,p++}else if(R.isSpotLight){let U=t.get(R);U.position.setFromMatrixPosition(R.matrixWorld),U.color.copy(B).multiplyScalar(k),U.distance=L,U.coneCos=Math.cos(R.angle),U.penumbraCos=Math.cos(R.angle*(1-R.penumbra)),U.decay=R.decay,n.spot[_]=U;let X=R.shadow;if(R.map&&(n.spotLightMap[b]=R.map,b++,X.updateMatrices(R),R.castShadow&&N++),n.spotLightMatrix[_]=X.matrix,R.castShadow){let j=e.get(R);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize=X.mapSize,n.spotShadow[_]=j,n.spotShadowMap[_]=W,v++}_++}else if(R.isRectAreaLight){let U=t.get(R);U.color.copy(B).multiplyScalar(k),U.halfWidth.set(R.width*.5,0,0),U.halfHeight.set(0,R.height*.5,0),n.rectArea[M]=U,M++}else if(R.isPointLight){let U=t.get(R);if(U.color.copy(R.color).multiplyScalar(R.intensity),U.distance=R.distance,U.decay=R.decay,R.castShadow){let X=R.shadow,j=e.get(R);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize=X.mapSize,j.shadowCameraNear=X.camera.near,j.shadowCameraFar=X.camera.far,n.pointShadow[g]=j,n.pointShadowMap[g]=W,n.pointShadowMatrix[g]=R.shadow.matrix,A++}n.point[g]=U,g++}else if(R.isHemisphereLight){let U=t.get(R);U.skyColor.copy(R.color).multiplyScalar(k),U.groundColor.copy(R.groundColor).multiplyScalar(k),n.hemi[y]=U,y++}}M>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=qt.LTC_FLOAT_1,n.rectAreaLTC2=qt.LTC_FLOAT_2):(n.rectAreaLTC1=qt.LTC_HALF_1,n.rectAreaLTC2=qt.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=f,n.ambient[2]=d;let P=n.hash;(P.sunLength!==u||P.directionalLength!==p||P.pointLength!==g||P.spotLength!==_||P.rectAreaLength!==M||P.hemiLength!==y||P.numSunShadows!==m||P.numDirectionalShadows!==T||P.numPointShadows!==A||P.numSpotShadows!==v||P.numSpotMaps!==b||P.numLightProbes!==I)&&(n.sun.length=u,n.directional.length=p,n.spot.length=_,n.rectArea.length=M,n.point.length=g,n.hemi.length=y,n.sunShadow.length=m,n.sunShadowMap.length=m,n.sunShadowMatrix.length=x,n.sunShadowCascade.length=x,n.directionalShadow.length=T,n.directionalShadowMap.length=T,n.directionalShadowMatrix.length=T,n.pointShadow.length=A,n.pointShadowMap.length=A,n.pointShadowMatrix.length=A,n.spotShadow.length=v,n.spotShadowMap.length=v,n.spotLightMatrix.length=v+b-N,n.spotLightMap.length=b,n.numSpotLightShadowsWithMaps=N,n.numLightProbes=I,P.sunLength=u,P.directionalLength=p,P.pointLength=g,P.spotLength=_,P.rectAreaLength=M,P.hemiLength=y,P.numSunShadows=m,P.numDirectionalShadows=T,P.numPointShadows=A,P.numSpotShadows=v,P.numSpotMaps=b,P.numLightProbes=I,n.version=qx++)}function l(c,h){let f=0,d=0,u=0,m=0,x=0,p=0,g=h.matrixWorldInverse;for(let _=0,M=c.length;_<M;_++){let y=c[_];if(y.isSunLight){let T=n.sun[f];T.direction.setFromMatrixPosition(y.matrixWorld),T.direction.transformDirection(g),f++}else if(y.isDirectionalLight){let T=n.directional[d];T.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),T.direction.sub(s),T.direction.transformDirection(g),d++}else if(y.isSpotLight){let T=n.spot[m];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),T.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),T.direction.sub(s),T.direction.transformDirection(g),m++}else if(y.isRectAreaLight){let T=n.rectArea[x];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),o.identity(),r.copy(y.matrixWorld),r.premultiply(g),o.extractRotation(r),T.halfWidth.set(y.width*.5,0,0),T.halfHeight.set(0,y.height*.5,0),T.halfWidth.applyMatrix4(o),T.halfHeight.applyMatrix4(o),x++}else if(y.isPointLight){let T=n.point[u];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),u++}else if(y.isHemisphereLight){let T=n.hemi[p];T.direction.setFromMatrixPosition(y.matrixWorld),T.direction.transformDirection(g),p++}}}return{setup:a,setupView:l,state:n}}function Vf(i){let t=new Zx(i),e=[],n=[],s=[];function r(f){h.camera=f,e.length=0,n.length=0,s.length=0}function o(f){f.isLightProbeGrid?s.push(f):e.push(f)}function a(f){n.push(f)}function l(){t.setup(e),s.sort((f,d)=>f.priority-d.priority||f.id-d.id)}function c(f){t.setupView(e,f)}let h={lightsArray:e,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:h,setupLights:l,setupLightsView:c,pushLight:o,pushShadow:a}}function Jx(i){let t=new WeakMap;function e(s,r=0){let o=t.get(s),a;return o===void 0?(a=new Vf(i),t.set(s,[a])):r>=o.length?(a=new Vf(i),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}var $x=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Kx=`uniform sampler2D shadow_pass;
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
}`,Qx=[new G(1,0,0),new G(-1,0,0),new G(0,1,0),new G(0,-1,0),new G(0,0,1),new G(0,0,-1)],jx=[new G(0,-1,0),new G(0,-1,0),new G(0,0,1),new G(0,0,-1),new G(0,-1,0),new G(0,-1,0)],Hf=new fe,Kr=new G,dh=new G;function tv(i,t,e){let n=new Zi,s=new Lt,r=new Lt,o=new ze,a=new wa,l=new Aa,c={},h=e.maxTextureSize,f={[Kn]:dn,[dn]:Kn,[xn]:xn},d=new fn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Lt},radius:{value:4}},vertexShader:$x,fragmentShader:Kx}),u=d.clone();u.defines.HORIZONTAL_PASS=1;let m=new Ue;m.setAttribute("position",new Ne(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let x=new _n(m,d),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Hr;let g=this.type;this.render=function(A,v,b){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||A.length===0)return;this.type===Lu&&(ae("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Hr);let N=i.getRenderTarget(),I=i.getActiveCubeFace(),P=i.getActiveMipmapLevel(),O=i.state;O.setBlending(Qi),O.buffers.depth.getReversed()===!0?O.buffers.color.setClear(0,0,0,0):O.buffers.color.setClear(1,1,1,1),O.buffers.depth.setTest(!0),O.setScissorTest(!1);let V=g!==this.type;V&&v.traverse(function(R){R.material&&(Array.isArray(R.material)?R.material.forEach(B=>B.needsUpdate=!0):R.material.needsUpdate=!0)});for(let R=0,B=A.length;R<B;R++){let k=A[R],L=k.shadow;if(L===void 0){ae("WebGLShadowMap:",k,"has no shadow.");continue}if(L.autoUpdate===!1&&L.needsUpdate===!1)continue;s.copy(L.mapSize);let W=L.getFrameExtents();s.multiply(W),r.copy(L.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/W.x),s.x=r.x*W.x,L.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/W.y),s.y=r.y*W.y,L.mapSize.y=r.y));let U=i.state.buffers.depth.getReversed();if(L.camera._reversedDepth=U,L.map===null||V===!0){if(L.map!==null&&(L.map.depthTexture!==null&&(L.map.depthTexture.dispose(),L.map.depthTexture=null),L.map.dispose()),this.type===Gs){if(k.isPointLight){ae("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}L.map=new un(s.x,s.y,{format:Oi,type:Gn,minFilter:hn,magFilter:hn,generateMipmaps:!1}),L.map.texture.name=k.name+".shadowMap",L.map.depthTexture=new gi(s.x,s.y,kn),L.map.depthTexture.name=k.name+".shadowMapDepth",L.map.depthTexture.format=mi,L.map.depthTexture.compareFunction=null,L.map.depthTexture.minFilter=tn,L.map.depthTexture.magFilter=tn}else k.isPointLight?(L.map=new jr(s.x),L.map.depthTexture=new br(s.x,zn)):(L.map=new un(s.x,s.y),L.map.depthTexture=new gi(s.x,s.y,zn)),L.map.depthTexture.name=k.name+".shadowMap",L.map.depthTexture.format=mi,this.type===Hr?(L.map.depthTexture.compareFunction=U?Kc:$c,L.map.depthTexture.minFilter=hn,L.map.depthTexture.magFilter=hn):(L.map.depthTexture.compareFunction=null,L.map.depthTexture.minFilter=tn,L.map.depthTexture.magFilter=tn);L.camera.updateProjectionMatrix()}L.map.isWebGLCubeRenderTarget!==!0&&(L.map.width!==s.x||L.map.height!==s.y)&&L.map.setSize(s.x,s.y);let X=L.map.isWebGLCubeRenderTarget?6:L.getViewportCount();k.isPointLight!==!0&&L.updateMatrices(k,b);let j=(L.camera.layers.mask&4294967294)!==0?L.camera.layers:b.layers;for(let _t=0;_t<X;_t++){let Dt=L.getCamera(_t);if(k.isPointLight){let Z=L.camera,ot=L.matrix,xt=k.distance||Z.far;xt!==Z.far&&(Z.far=xt,Z.updateProjectionMatrix()),Kr.setFromMatrixPosition(k.matrixWorld),Z.position.copy(Kr),dh.copy(Z.position),dh.add(Qx[_t]),Z.up.copy(jx[_t]),Z.lookAt(dh),Z.updateMatrixWorld(),ot.makeTranslation(-Kr.x,-Kr.y,-Kr.z),Hf.multiplyMatrices(Z.projectionMatrix,Z.matrixWorldInverse),L._frustum.setFromProjectionMatrix(Hf,Z.coordinateSystem,Z.reversedDepth)}if(L.map.isWebGLCubeRenderTarget)i.setRenderTarget(L.map,_t),i.clear();else{_t===0&&(i.setRenderTarget(L.map),i.clear());let Z=L.getViewport(_t);o.set(r.x*Z.x,r.y*Z.y,r.x*Z.z,r.y*Z.w),O.viewport(o)}n=L.getFrustum(_t),y(v,b,Dt,k,j,this.type)}L.isPointLightShadow!==!0&&this.type===Gs&&_(L,b),L.needsUpdate=!1}g=this.type,p.needsUpdate=!1,i.setRenderTarget(N,I,P)};function _(A,v){let b=t.update(x);d.defines.VSM_SAMPLES!==A.blurSamples&&(d.defines.VSM_SAMPLES=A.blurSamples,u.defines.VSM_SAMPLES=A.blurSamples,d.needsUpdate=!0,u.needsUpdate=!0),A.mapPass===null?A.mapPass=new un(s.x,s.y,{format:Oi,type:Gn}):(A.mapPass.width!==A.map.width||A.mapPass.height!==A.map.height)&&A.mapPass.setSize(A.map.width,A.map.height),d.uniforms.shadow_pass.value=A.map.depthTexture,d.uniforms.resolution.value.set(A.map.width,A.map.height),d.uniforms.radius.value=A.radius,i.setRenderTarget(A.mapPass),i.clear(),i.renderBufferDirect(v,null,b,d,x,null),u.uniforms.shadow_pass.value=A.mapPass.texture,u.uniforms.resolution.value.set(A.map.width,A.map.height),u.uniforms.radius.value=A.radius,i.setRenderTarget(A.map),i.clear(),i.renderBufferDirect(v,null,b,u,x,null)}function M(A,v,b,N){let I=null,P=b.isPointLight===!0?A.customDistanceMaterial:A.customDepthMaterial;if(P!==void 0)I=P;else if(I=b.isPointLight===!0?l:a,i.localClippingEnabled&&v.clipShadows===!0&&Array.isArray(v.clippingPlanes)&&v.clippingPlanes.length!==0||v.displacementMap&&v.displacementScale!==0||v.alphaMap&&v.alphaTest>0||v.map&&v.alphaTest>0||v.alphaToCoverage===!0){let O=I.uuid,V=v.uuid,R=c[O];R===void 0&&(R={},c[O]=R);let B=R[V];B===void 0&&(B=I.clone(),R[V]=B,v.addEventListener("dispose",T)),I=B}if(I.visible=v.visible,I.wireframe=v.wireframe,N===Gs?I.side=v.shadowSide!==null?v.shadowSide:v.side:I.side=v.shadowSide!==null?v.shadowSide:f[v.side],I.alphaMap=v.alphaMap,I.alphaTest=v.alphaToCoverage===!0?.5:v.alphaTest,I.map=v.map,I.clipShadows=v.clipShadows,I.clippingPlanes=v.clippingPlanes,I.clipIntersection=v.clipIntersection,I.displacementMap=v.displacementMap,I.displacementScale=v.displacementScale,I.displacementBias=v.displacementBias,I.wireframeLinewidth=v.wireframeLinewidth,I.linewidth=v.linewidth,b.isPointLight===!0&&I.isMeshDistanceMaterial===!0){let O=i.properties.get(I);O.light=b}return I}function y(A,v,b,N,I,P){if(A.visible===!1)return;if(A.layers.test(I)&&(A.isMesh||A.isLine||A.isPoints)&&(A.castShadow||A.receiveShadow&&P===Gs)&&(!A.frustumCulled||A.intersectsFrustum(n))){A.modelViewMatrix.multiplyMatrices(b.matrixWorldInverse,A.matrixWorld);let R=t.update(A),B=A.material;if(Array.isArray(B)){let k=R.groups;for(let L=0,W=k.length;L<W;L++){let U=k[L],X=B[U.materialIndex];if(X&&X.visible){let j=M(A,X,N,P);A.onBeforeShadow(i,A,v,b,R,j,U),i.renderBufferDirect(b,null,R,j,A,U),A.onAfterShadow(i,A,v,b,R,j,U)}}}else if(B.visible){let k=M(A,B,N,P);A.onBeforeShadow(i,A,v,b,R,k,null),i.renderBufferDirect(b,null,R,k,A,null),A.onAfterShadow(i,A,v,b,R,k,null)}}let V=A.children;for(let R=0,B=V.length;R<B;R++)y(V[R],v,b,N,I,P)}function T(A){A.target.removeEventListener("dispose",T);for(let b in c){let N=c[b],I=A.target.uuid;I in N&&(N[I].dispose(),delete N[I])}}}function ev(i,t){function e(){let z=!1,ct=new ze,rt=null,zt=new ze(0,0,0,0);return{setMask:function(Rt){rt!==Rt&&!z&&(i.colorMask(Rt,Rt,Rt,Rt),rt=Rt)},setLocked:function(Rt){z=Rt},setClear:function(Rt,Ot,ie,de,Ct){Ct===!0&&(Rt*=de,Ot*=de,ie*=de),ct.set(Rt,Ot,ie,de),zt.equals(ct)===!1&&(i.clearColor(Rt,Ot,ie,de),zt.copy(ct))},reset:function(){z=!1,rt=null,zt.set(-1,0,0,0)}}}function n(){let z=!1,ct=!1,rt=null,zt=null,Rt=null;return{setReversed:function(Ot){if(ct!==Ot){let ie=t.get("EXT_clip_control");Ot?ie.clipControlEXT(ie.LOWER_LEFT_EXT,ie.ZERO_TO_ONE_EXT):ie.clipControlEXT(ie.LOWER_LEFT_EXT,ie.NEGATIVE_ONE_TO_ONE_EXT),ct=Ot;let de=Rt;Rt=null,this.setClear(de)}},getReversed:function(){return ct},setTest:function(Ot){Ot?tt(i.DEPTH_TEST):Jt(i.DEPTH_TEST)},setMask:function(Ot){rt!==Ot&&!z&&(i.depthMask(Ot),rt=Ot)},setFunc:function(Ot){if(ct&&(Ot=df[Ot]),zt!==Ot){switch(Ot){case Ko:i.depthFunc(i.NEVER);break;case Qo:i.depthFunc(i.ALWAYS);break;case jo:i.depthFunc(i.LESS);break;case Cs:i.depthFunc(i.LEQUAL);break;case ta:i.depthFunc(i.EQUAL);break;case ea:i.depthFunc(i.GEQUAL);break;case na:i.depthFunc(i.GREATER);break;case ia:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}zt=Ot}},setLocked:function(Ot){z=Ot},setClear:function(Ot){Rt!==Ot&&(Rt=Ot,ct&&(Ot=1-Ot),i.clearDepth(Ot))},reset:function(){z=!1,rt=null,zt=null,Rt=null,ct=!1}}}function s(){let z=!1,ct=null,rt=null,zt=null,Rt=null,Ot=null,ie=null,de=null,Ct=null;return{setTest:function(re){z||(re?tt(i.STENCIL_TEST):Jt(i.STENCIL_TEST))},setMask:function(re){ct!==re&&!z&&(i.stencilMask(re),ct=re)},setFunc:function(re,me,Ht){(rt!==re||zt!==me||Rt!==Ht)&&(i.stencilFunc(re,me,Ht),rt=re,zt=me,Rt=Ht)},setOp:function(re,me,Ht){(Ot!==re||ie!==me||de!==Ht)&&(i.stencilOp(re,me,Ht),Ot=re,ie=me,de=Ht)},setLocked:function(re){z=re},setClear:function(re){Ct!==re&&(i.clearStencil(re),Ct=re)},reset:function(){z=!1,ct=null,rt=null,zt=null,Rt=null,Ot=null,ie=null,de=null,Ct=null}}}let r=new e,o=new n,a=new s,l={},c=new WeakMap,h={},f={},d={},u=new WeakMap,m=[],x=null,p=!1,g=null,_=null,M=null,y=null,T=null,A=null,v=null,b=new Ae(0,0,0),N=0,I=!1,P=null,O=null,V=null,R=null,B=null,k=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),L=!1,W=0,U=i.getParameter(i.VERSION);U.indexOf("WebGL")!==-1?(W=parseFloat(/^WebGL (\d)/.exec(U)[1]),L=W>=1):U.indexOf("OpenGL ES")!==-1&&(W=parseFloat(/^OpenGL ES (\d)/.exec(U)[1]),L=W>=2);let X=null,j={},_t=i.getParameter(i.SCISSOR_BOX),Dt=i.getParameter(i.VIEWPORT),Z=new ze().fromArray(_t),ot=new ze().fromArray(Dt);function xt(z,ct,rt,zt){let Rt=new Uint8Array(4),Ot=i.createTexture();i.bindTexture(z,Ot),i.texParameteri(z,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(z,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let ie=0;ie<rt;ie++)z===i.TEXTURE_3D||z===i.TEXTURE_2D_ARRAY?i.texImage3D(ct,0,i.RGBA,1,1,zt,0,i.RGBA,i.UNSIGNED_BYTE,Rt):i.texImage2D(ct+ie,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,Rt);return Ot}let Gt={};Gt[i.TEXTURE_2D]=xt(i.TEXTURE_2D,i.TEXTURE_2D,1),Gt[i.TEXTURE_CUBE_MAP]=xt(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),Gt[i.TEXTURE_2D_ARRAY]=xt(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),Gt[i.TEXTURE_3D]=xt(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),tt(i.DEPTH_TEST),o.setFunc(Cs),dt(!1),mt(Rc),tt(i.CULL_FACE),ft(Qi);function tt(z){h[z]!==!0&&(i.enable(z),h[z]=!0)}function Jt(z){h[z]!==!1&&(i.disable(z),h[z]=!1)}function se(z,ct){return d[z]!==ct?(i.bindFramebuffer(z,ct),d[z]=ct,z===i.DRAW_FRAMEBUFFER&&(d[i.FRAMEBUFFER]=ct),z===i.FRAMEBUFFER&&(d[i.DRAW_FRAMEBUFFER]=ct),!0):!1}function lt(z,ct){let rt=m,zt=!1;if(z){rt=u.get(ct),rt===void 0&&(rt=[],u.set(ct,rt));let Rt=z.textures;if(rt.length!==Rt.length||rt[0]!==i.COLOR_ATTACHMENT0){for(let Ot=0,ie=Rt.length;Ot<ie;Ot++)rt[Ot]=i.COLOR_ATTACHMENT0+Ot;rt.length=Rt.length,zt=!0}}else rt[0]!==i.BACK&&(rt[0]=i.BACK,zt=!0);zt&&i.drawBuffers(rt)}function ee(z){return x!==z?(i.useProgram(z),x=z,!0):!1}let gt={[ji]:i.FUNC_ADD,[Du]:i.FUNC_SUBTRACT,[Fu]:i.FUNC_REVERSE_SUBTRACT};gt[Uu]=i.MIN,gt[Ou]=i.MAX;let K={[Bu]:i.ZERO,[zu]:i.ONE,[ku]:i.SRC_COLOR,[Pc]:i.SRC_ALPHA,[qu]:i.SRC_ALPHA_SATURATE,[Wu]:i.DST_COLOR,[Vu]:i.DST_ALPHA,[Gu]:i.ONE_MINUS_SRC_COLOR,[Lc]:i.ONE_MINUS_SRC_ALPHA,[Xu]:i.ONE_MINUS_DST_COLOR,[Hu]:i.ONE_MINUS_DST_ALPHA,[Yu]:i.CONSTANT_COLOR,[Zu]:i.ONE_MINUS_CONSTANT_COLOR,[Ju]:i.CONSTANT_ALPHA,[$u]:i.ONE_MINUS_CONSTANT_ALPHA};function ft(z,ct,rt,zt,Rt,Ot,ie,de,Ct,re){if(z===Qi){p===!0&&(Jt(i.BLEND),p=!1);return}if(p===!1&&(tt(i.BLEND),p=!0),z!==Nu){if(z!==g||re!==I){if((_!==ji||T!==ji)&&(i.blendEquation(i.FUNC_ADD),_=ji,T=ji),re)switch(z){case Vs:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Hs:i.blendFunc(i.ONE,i.ONE);break;case Cc:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Ic:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:ce("WebGLState: Invalid blending: ",z);break}else switch(z){case Vs:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Hs:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Cc:ce("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Ic:ce("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:ce("WebGLState: Invalid blending: ",z);break}M=null,y=null,A=null,v=null,b.set(0,0,0),N=0,g=z,I=re}return}Rt=Rt||ct,Ot=Ot||rt,ie=ie||zt,(ct!==_||Rt!==T)&&(i.blendEquationSeparate(gt[ct],gt[Rt]),_=ct,T=Rt),(rt!==M||zt!==y||Ot!==A||ie!==v)&&(i.blendFuncSeparate(K[rt],K[zt],K[Ot],K[ie]),M=rt,y=zt,A=Ot,v=ie),(de.equals(b)===!1||Ct!==N)&&(i.blendColor(de.r,de.g,de.b,Ct),b.copy(de),N=Ct),g=z,I=!1}function ht(z,ct){z.side===xn?Jt(i.CULL_FACE):tt(i.CULL_FACE);let rt=z.side===dn;ct&&(rt=!rt),dt(rt),z.blending===Vs&&z.transparent===!1?ft(Qi):ft(z.blending,z.blendEquation,z.blendSrc,z.blendDst,z.blendEquationAlpha,z.blendSrcAlpha,z.blendDstAlpha,z.blendColor,z.blendAlpha,z.premultipliedAlpha),o.setFunc(z.depthFunc),o.setTest(z.depthTest),o.setMask(z.depthWrite),r.setMask(z.colorWrite);let zt=z.stencilWrite;a.setTest(zt),zt&&(a.setMask(z.stencilWriteMask),a.setFunc(z.stencilFunc,z.stencilRef,z.stencilFuncMask),a.setOp(z.stencilFail,z.stencilZFail,z.stencilZPass)),It(z.polygonOffset,z.polygonOffsetFactor,z.polygonOffsetUnits),z.alphaToCoverage===!0?tt(i.SAMPLE_ALPHA_TO_COVERAGE):Jt(i.SAMPLE_ALPHA_TO_COVERAGE)}function dt(z){P!==z&&(z?i.frontFace(i.CW):i.frontFace(i.CCW),P=z)}function mt(z){z!==Iu?(tt(i.CULL_FACE),z!==O&&(z===Rc?i.cullFace(i.BACK):z===Pu?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):Jt(i.CULL_FACE),O=z}function Bt(z){z!==V&&(L&&i.lineWidth(z),V=z)}function It(z,ct,rt){z?(tt(i.POLYGON_OFFSET_FILL),(R!==ct||B!==rt)&&(R=ct,B=rt,o.getReversed()&&(ct=-ct,rt=-rt),i.polygonOffset(ct,rt))):Jt(i.POLYGON_OFFSET_FILL)}function Zt(z){z?tt(i.SCISSOR_TEST):Jt(i.SCISSOR_TEST)}function Q(z){z===void 0&&(z=i.TEXTURE0+k-1),X!==z&&(i.activeTexture(z),X=z)}function yt(z,ct,rt){rt===void 0&&(X===null?rt=i.TEXTURE0+k-1:rt=X);let zt=j[rt];zt===void 0&&(zt={type:void 0,texture:void 0},j[rt]=zt),(zt.type!==z||zt.texture!==ct)&&(X!==rt&&(i.activeTexture(rt),X=rt),i.bindTexture(z,ct||Gt[z]),zt.type=z,zt.texture=ct)}function D(){let z=j[X];z!==void 0&&z.type!==void 0&&(i.bindTexture(z.type,null),z.type=void 0,z.texture=void 0)}function Vt(){try{i.compressedTexImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function Nt(){try{i.compressedTexImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function Qt(){try{i.texSubImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function ut(){try{i.texSubImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function Kt(){try{i.compressedTexSubImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function At(){try{i.compressedTexSubImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function Pt(){try{i.texStorage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function C(){try{i.texStorage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function w(){try{i.texImage2D(...arguments)}catch(z){ce("WebGLState:",z)}}function q(){try{i.texImage3D(...arguments)}catch(z){ce("WebGLState:",z)}}function vt(z){return f[z]!==void 0?f[z]:i.getParameter(z)}function it(z,ct){f[z]!==ct&&(i.pixelStorei(z,ct),f[z]=ct)}function St(z){Z.equals(z)===!1&&(i.scissor(z.x,z.y,z.z,z.w),Z.copy(z))}function Et(z){ot.equals(z)===!1&&(i.viewport(z.x,z.y,z.z,z.w),ot.copy(z))}function st(z,ct){let rt=c.get(ct);rt===void 0&&(rt=new WeakMap,c.set(ct,rt));let zt=rt.get(z);zt===void 0&&(zt=i.getUniformBlockIndex(ct,z.name),i.uniformBlockBinding(ct,zt,zt),rt.set(z,zt))}function at(z,ct,rt){let Rt=c.get(ct).get(z);l[Rt]!==rt&&(i.bindBufferBase(i.UNIFORM_BUFFER,Rt,rt),l[Rt]=rt)}function Ft(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),o.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),h={},f={},X=null,j={},d={},l={},u=new WeakMap,m=[],x=null,p=!1,g=null,_=null,M=null,y=null,T=null,A=null,v=null,b=new Ae(0,0,0),N=0,I=!1,P=null,O=null,V=null,R=null,B=null,Z.set(0,0,i.canvas.width,i.canvas.height),ot.set(0,0,i.canvas.width,i.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:tt,disable:Jt,bindFramebuffer:se,drawBuffers:lt,useProgram:ee,setBlending:ft,setMaterial:ht,setFlipSided:dt,setCullFace:mt,setLineWidth:Bt,setPolygonOffset:It,setScissorTest:Zt,activeTexture:Q,bindTexture:yt,unbindTexture:D,compressedTexImage2D:Vt,compressedTexImage3D:Nt,texImage2D:w,texImage3D:q,pixelStorei:it,getParameter:vt,updateUBOMapping:st,uniformBlockBinding:at,texStorage2D:Pt,texStorage3D:C,texSubImage2D:Qt,texSubImage3D:ut,compressedTexSubImage2D:Kt,compressedTexSubImage3D:At,scissor:St,viewport:Et,reset:Ft}}function nv(i,t,e,n,s,r,o){let a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Lt,h=new WeakMap,f=new Set,d,u=new WeakMap,m=new Set,x=new FinalizationRegistry(C=>m.delete(C)),p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(C,w){return p?new OffscreenCanvas(C,w):gr("canvas")}function _(C,w,q){let vt=1,it=Pt(C);if((it.width>q||it.height>q)&&(vt=q/Math.max(it.width,it.height)),vt<1)if(typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&C instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&C instanceof ImageBitmap||typeof VideoFrame<"u"&&C instanceof VideoFrame){let St=Math.floor(vt*it.width),Et=Math.floor(vt*it.height);d===void 0&&(d=g(St,Et));let st=w?g(St,Et):d;return st.width=St,st.height=Et,st.getContext("2d").drawImage(C,0,0,St,Et),ae("WebGLRenderer: Texture has been resized from ("+it.width+"x"+it.height+") to ("+St+"x"+Et+")."),st}else return"data"in C&&ae("WebGLRenderer: Image in DataTexture is too big ("+it.width+"x"+it.height+")."),C;return C}function M(C){return C.generateMipmaps}function y(C){i.generateMipmap(C)}function T(C){return C.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:C.isWebGL3DRenderTarget?i.TEXTURE_3D:C.isWebGLArrayRenderTarget||C.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function A(C,w,q,vt,it,St=!1){if(C!==null){if(i[C]!==void 0)return i[C];ae("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+C+"'")}let Et;vt&&(Et=t.get("EXT_texture_norm16"),Et||ae("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let st=w;if(w===i.RED&&(q===i.FLOAT&&(st=i.R32F),q===i.HALF_FLOAT&&(st=i.R16F),q===i.UNSIGNED_BYTE&&(st=i.R8),q===i.UNSIGNED_SHORT&&Et&&(st=Et.R16_EXT),q===i.SHORT&&Et&&(st=Et.R16_SNORM_EXT)),w===i.RED_INTEGER&&(q===i.UNSIGNED_BYTE&&(st=i.R8UI),q===i.UNSIGNED_SHORT&&(st=i.R16UI),q===i.UNSIGNED_INT&&(st=i.R32UI),q===i.BYTE&&(st=i.R8I),q===i.SHORT&&(st=i.R16I),q===i.INT&&(st=i.R32I)),w===i.RG&&(q===i.FLOAT&&(st=i.RG32F),q===i.HALF_FLOAT&&(st=i.RG16F),q===i.UNSIGNED_BYTE&&(st=i.RG8),q===i.UNSIGNED_SHORT&&Et&&(st=Et.RG16_EXT),q===i.SHORT&&Et&&(st=Et.RG16_SNORM_EXT)),w===i.RG_INTEGER&&(q===i.UNSIGNED_BYTE&&(st=i.RG8UI),q===i.UNSIGNED_SHORT&&(st=i.RG16UI),q===i.UNSIGNED_INT&&(st=i.RG32UI),q===i.BYTE&&(st=i.RG8I),q===i.SHORT&&(st=i.RG16I),q===i.INT&&(st=i.RG32I)),w===i.RGB_INTEGER&&(q===i.UNSIGNED_BYTE&&(st=i.RGB8UI),q===i.UNSIGNED_SHORT&&(st=i.RGB16UI),q===i.UNSIGNED_INT&&(st=i.RGB32UI),q===i.BYTE&&(st=i.RGB8I),q===i.SHORT&&(st=i.RGB16I),q===i.INT&&(st=i.RGB32I)),w===i.RGBA_INTEGER&&(q===i.UNSIGNED_BYTE&&(st=i.RGBA8UI),q===i.UNSIGNED_SHORT&&(st=i.RGBA16UI),q===i.UNSIGNED_INT&&(st=i.RGBA32UI),q===i.BYTE&&(st=i.RGBA8I),q===i.SHORT&&(st=i.RGBA16I),q===i.INT&&(st=i.RGBA32I)),w===i.RGB&&(q===i.UNSIGNED_SHORT&&Et&&(st=Et.RGB16_EXT),q===i.SHORT&&Et&&(st=Et.RGB16_SNORM_EXT),q===i.UNSIGNED_INT_5_9_9_9_REV&&(st=i.RGB9_E5),q===i.UNSIGNED_INT_10F_11F_11F_REV&&(st=i.R11F_G11F_B10F)),w===i.RGBA){let at=St?pr:Se.getTransfer(it);q===i.FLOAT&&(st=i.RGBA32F),q===i.HALF_FLOAT&&(st=i.RGBA16F),q===i.UNSIGNED_BYTE&&(st=at===Pe?i.SRGB8_ALPHA8:i.RGBA8),q===i.UNSIGNED_SHORT&&Et&&(st=Et.RGBA16_EXT),q===i.SHORT&&Et&&(st=Et.RGBA16_SNORM_EXT),q===i.UNSIGNED_SHORT_4_4_4_4&&(st=i.RGBA4),q===i.UNSIGNED_SHORT_5_5_5_1&&(st=i.RGB5_A1)}return(st===i.R16F||st===i.R32F||st===i.RG16F||st===i.RG32F||st===i.RGBA16F||st===i.RGBA32F)&&t.get("EXT_color_buffer_float"),st}function v(C,w){let q;return C?w===null||w===zn||w===es?q=i.DEPTH24_STENCIL8:w===kn?q=i.DEPTH32F_STENCIL8:w===Xs&&(q=i.DEPTH24_STENCIL8,ae("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):w===null||w===zn||w===es?q=i.DEPTH_COMPONENT24:w===kn?q=i.DEPTH_COMPONENT32F:w===Xs&&(q=i.DEPTH_COMPONENT16),q}function b(C,w){return M(C)===!0||C.isFramebufferTexture&&C.minFilter!==tn&&C.minFilter!==hn?Math.log2(Math.max(w.width,w.height))+1:C.mipmaps.length>0?C.mipmaps.length:C.isCompressedTexture&&Array.isArray(C.image)?w.mipmaps.length:1}function N(C){let w=new WeakRef(C);n.get(C).__ref=w,m.add(w),x.register(C,w,w)}function I(C){let w=n.get(C).__ref;w!==void 0&&(m.delete(w),x.unregister(w))}function P(C){V(C.target)}function O(C){R(C.target)}function V(C){C.removeEventListener("dispose",P),I(C),k(C),C.isVideoTexture&&h.delete(C),C.isHTMLTexture&&f.delete(C)}function R(C){C.removeEventListener("dispose",O),I(C),W(C)}function B(){for(let C of m){let w=C.deref();w!==void 0&&(w.isRenderTarget===!0?R(w):V(w))}m.clear(),f.clear()}function k(C){let w=n.get(C);if(w.__webglInit===void 0)return;let q=C.source,vt=u.get(q);if(vt){let it=vt[w.__cacheKey];it.usedTimes--,it.usedTimes===0&&L(C),Object.keys(vt).length===0&&u.delete(q)}n.remove(C)}function L(C){let w=n.get(C);i.deleteTexture(w.__webglTexture);let q=C.source,vt=u.get(q);delete vt[w.__cacheKey],o.memory.textures--}function W(C){let w=n.get(C);w.__depthDisposeCallback&&w.__depthDisposeCallback();let q=C.depthTexture;if(q&&q.renderTarget===C&&V(q),C.isWebGLCubeRenderTarget)for(let it=0;it<6;it++){if(Array.isArray(w.__webglFramebuffer[it]))for(let St=0;St<w.__webglFramebuffer[it].length;St++)i.deleteFramebuffer(w.__webglFramebuffer[it][St]);else i.deleteFramebuffer(w.__webglFramebuffer[it]);w.__webglDepthbuffer&&i.deleteRenderbuffer(w.__webglDepthbuffer[it])}else{if(Array.isArray(w.__webglFramebuffer))for(let it=0;it<w.__webglFramebuffer.length;it++)i.deleteFramebuffer(w.__webglFramebuffer[it]);else i.deleteFramebuffer(w.__webglFramebuffer);if(w.__webglDepthbuffer&&i.deleteRenderbuffer(w.__webglDepthbuffer),w.__webglMultisampledFramebuffer&&i.deleteFramebuffer(w.__webglMultisampledFramebuffer),w.__webglColorRenderbuffer)for(let it=0;it<w.__webglColorRenderbuffer.length;it++)w.__webglColorRenderbuffer[it]&&i.deleteRenderbuffer(w.__webglColorRenderbuffer[it]);w.__webglDepthRenderbuffer&&i.deleteRenderbuffer(w.__webglDepthRenderbuffer)}let vt=C.textures;for(let it=0,St=vt.length;it<St;it++){let Et=n.get(vt[it]);Et.__webglTexture&&(i.deleteTexture(Et.__webglTexture),o.memory.textures--),n.remove(vt[it])}n.remove(C)}let U=0;function X(){U=0}function j(){return U}function _t(C){U=C}function Dt(){let C=U;return C>=s.maxTextures&&ae("WebGLTextures: Trying to use "+(C+1)+" texture units while this GPU supports only "+s.maxTextures),U+=1,C}function Z(C){let w=[];return w.push(C.wrapS),w.push(C.wrapT),w.push(C.wrapR||0),w.push(C.magFilter),w.push(C.minFilter),w.push(C.anisotropy),w.push(C.internalFormat),w.push(C.format),w.push(C.type),w.push(C.generateMipmaps),w.push(C.mipmapsAutoUpdate),w.push(C.premultiplyAlpha),w.push(C.flipY),w.push(C.unpackAlignment),w.push(C.colorSpace),w.join()}function ot(C,w){let q=n.get(C);if(C.isVideoTexture&&Kt(C),C.isRenderTargetTexture===!1&&C.isExternalTexture!==!0&&C.version>0&&q.__version!==C.version){let vt=C.image;if(vt===null)ae("WebGLRenderer: Texture marked for update but no image data found.");else if(vt.complete===!1)ae("WebGLRenderer: Texture marked for update but image is incomplete");else{ht(q,C,w);return}}else C.isExternalTexture&&(q.__webglTexture=C.sourceTexture?C.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,q.__webglTexture,i.TEXTURE0+w)}function xt(C,w){let q=n.get(C);if(C.isRenderTargetTexture===!1&&C.version>0&&q.__version!==C.version){ht(q,C,w);return}else C.isExternalTexture&&(q.__webglTexture=C.sourceTexture?C.sourceTexture:null);e.bindTexture(i.TEXTURE_2D_ARRAY,q.__webglTexture,i.TEXTURE0+w)}function Gt(C,w){let q=n.get(C);if(C.isRenderTargetTexture===!1&&C.version>0&&q.__version!==C.version){ht(q,C,w);return}e.bindTexture(i.TEXTURE_3D,q.__webglTexture,i.TEXTURE0+w)}function tt(C,w){let q=n.get(C);if(C.version>0&&q.__version!==C.version){dt(q,C,w);return}e.bindTexture(i.TEXTURE_CUBE_MAP,q.__webglTexture,i.TEXTURE0+w)}let Jt={[sa]:i.REPEAT,[Xn]:i.CLAMP_TO_EDGE,[ra]:i.MIRRORED_REPEAT},se={[tn]:i.NEAREST,[ju]:i.NEAREST_MIPMAP_NEAREST,[Wr]:i.NEAREST_MIPMAP_LINEAR,[hn]:i.LINEAR,[Ga]:i.LINEAR_MIPMAP_NEAREST,[_i]:i.LINEAR_MIPMAP_LINEAR},lt={[sf]:i.NEVER,[Qc]:i.ALWAYS,[rf]:i.LESS,[$c]:i.LEQUAL,[of]:i.EQUAL,[Kc]:i.GEQUAL,[af]:i.GREATER,[lf]:i.NOTEQUAL};function ee(C,w){if(w.type===kn&&t.has("OES_texture_float_linear")===!1&&(w.magFilter===hn||w.magFilter===Ga||w.magFilter===Wr||w.magFilter===_i||w.minFilter===hn||w.minFilter===Ga||w.minFilter===Wr||w.minFilter===_i)&&ae("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(C,i.TEXTURE_WRAP_S,Jt[w.wrapS]),i.texParameteri(C,i.TEXTURE_WRAP_T,Jt[w.wrapT]),(C===i.TEXTURE_3D||C===i.TEXTURE_2D_ARRAY)&&i.texParameteri(C,i.TEXTURE_WRAP_R,Jt[w.wrapR]),i.texParameteri(C,i.TEXTURE_MAG_FILTER,se[w.magFilter]),i.texParameteri(C,i.TEXTURE_MIN_FILTER,se[w.minFilter]),w.compareFunction&&(i.texParameteri(C,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(C,i.TEXTURE_COMPARE_FUNC,lt[w.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(w.magFilter===tn||w.minFilter!==Wr&&w.minFilter!==_i||w.type===kn&&t.has("OES_texture_float_linear")===!1)return;if(w.anisotropy>1||n.get(w).__currentAnisotropy){let q=t.get("EXT_texture_filter_anisotropic");i.texParameterf(C,q.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(w.anisotropy,s.getMaxAnisotropy())),n.get(w).__currentAnisotropy=w.anisotropy}}}function gt(C,w){let q=!1;C.__webglInit===void 0&&(C.__webglInit=!0,w.addEventListener("dispose",P),N(w));let vt=w.source,it=u.get(vt);it===void 0&&(it={},u.set(vt,it));let St=Z(w);if(St!==C.__cacheKey){it[St]===void 0&&(it[St]={texture:i.createTexture(),usedTimes:0},o.memory.textures++,q=!0),it[St].usedTimes++;let Et=it[C.__cacheKey];Et!==void 0&&(it[C.__cacheKey].usedTimes--,Et.usedTimes===0&&L(w)),C.__cacheKey=St,C.__webglTexture=it[St].texture}return q}function K(C,w,q){return Math.floor(Math.floor(C/q)/w)}function ft(C,w,q,vt){let St=C.updateRanges;if(St.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,w.width,w.height,q,vt,w.data);else{St.sort((z,ct)=>z.start-ct.start);let Et=0;for(let z=1;z<St.length;z++){let ct=St[Et],rt=St[z],zt=ct.start+ct.count,Rt=K(rt.start,w.width,4),Ot=K(ct.start,w.width,4);rt.start<=zt+1&&Rt===Ot&&K(rt.start+rt.count-1,w.width,4)===Rt?ct.count=Math.max(ct.count,rt.start+rt.count-ct.start):(++Et,St[Et]=rt)}St.length=Et+1;let st=e.getParameter(i.UNPACK_ROW_LENGTH),at=e.getParameter(i.UNPACK_SKIP_PIXELS),Ft=e.getParameter(i.UNPACK_SKIP_ROWS);e.pixelStorei(i.UNPACK_ROW_LENGTH,w.width);for(let z=0,ct=St.length;z<ct;z++){let rt=St[z],zt=Math.floor(rt.start/4),Rt=Math.ceil(rt.count/4),Ot=zt%w.width,ie=Math.floor(zt/w.width),de=Rt,Ct=1;e.pixelStorei(i.UNPACK_SKIP_PIXELS,Ot),e.pixelStorei(i.UNPACK_SKIP_ROWS,ie),e.texSubImage2D(i.TEXTURE_2D,0,Ot,ie,de,Ct,q,vt,w.data)}C.clearUpdateRanges(),e.pixelStorei(i.UNPACK_ROW_LENGTH,st),e.pixelStorei(i.UNPACK_SKIP_PIXELS,at),e.pixelStorei(i.UNPACK_SKIP_ROWS,Ft)}}function ht(C,w,q){let vt=i.TEXTURE_2D;(w.isDataArrayTexture||w.isCompressedArrayTexture)&&(vt=i.TEXTURE_2D_ARRAY),w.isData3DTexture&&(vt=i.TEXTURE_3D);let it=gt(C,w),St=w.source;e.bindTexture(vt,C.__webglTexture,i.TEXTURE0+q);let Et=n.get(St);if(St.version!==Et.__version||it===!0){if(e.activeTexture(i.TEXTURE0+q),(typeof ImageBitmap<"u"&&w.image instanceof ImageBitmap)===!1){let Ct=Se.getPrimaries(Se.workingColorSpace),re=w.colorSpace===vi?null:Se.getPrimaries(w.colorSpace),me=w.colorSpace===vi||Ct===re?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,w.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,w.premultiplyAlpha),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,me)}e.pixelStorei(i.UNPACK_ALIGNMENT,w.unpackAlignment);let at=_(w.image,!1,s.maxTextureSize);at=At(w,at);let Ft=r.convert(w.format,w.colorSpace),z=r.convert(w.type),ct=A(w.internalFormat,Ft,z,w.normalized,w.colorSpace,w.isVideoTexture);ee(vt,w);let rt,zt=w.mipmaps,Rt=w.isVideoTexture!==!0,Ot=Et.__version===void 0||it===!0,ie=St.dataReady,de=b(w,at);if(w.isDepthTexture)ct=v(w.format===xi,w.type),Ot&&(Rt?e.texStorage2D(i.TEXTURE_2D,1,ct,at.width,at.height):e.texImage2D(i.TEXTURE_2D,0,ct,at.width,at.height,0,Ft,z,null));else if(w.isDataTexture)if(zt.length>0){Rt&&Ot&&e.texStorage2D(i.TEXTURE_2D,de,ct,zt[0].width,zt[0].height);for(let Ct=0,re=zt.length;Ct<re;Ct++)rt=zt[Ct],Rt?ie&&e.texSubImage2D(i.TEXTURE_2D,Ct,0,0,rt.width,rt.height,Ft,z,rt.data):e.texImage2D(i.TEXTURE_2D,Ct,ct,rt.width,rt.height,0,Ft,z,rt.data);w.generateMipmaps=!1}else Rt?(Ot&&e.texStorage2D(i.TEXTURE_2D,de,ct,at.width,at.height),ie&&ft(w,at,Ft,z)):e.texImage2D(i.TEXTURE_2D,0,ct,at.width,at.height,0,Ft,z,at.data);else if(w.isCompressedTexture)if(w.isCompressedArrayTexture){Rt&&Ot&&e.texStorage3D(i.TEXTURE_2D_ARRAY,de,ct,zt[0].width,zt[0].height,at.depth);for(let Ct=0,re=zt.length;Ct<re;Ct++)if(rt=zt[Ct],w.format!==Vn)if(Ft!==null)if(Rt){if(ie)if(w.layerUpdates.size>0){let me=oh(rt.width,rt.height,w.format,w.type);for(let Ht of w.layerUpdates){let Re=rt.data.subarray(Ht*me/rt.data.BYTES_PER_ELEMENT,(Ht+1)*me/rt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,Ct,0,0,Ht,rt.width,rt.height,1,Ft,Re)}}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,Ct,0,0,0,rt.width,rt.height,at.depth,Ft,rt.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,Ct,ct,rt.width,rt.height,at.depth,0,rt.data,0,0);else ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Rt?ie&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,Ct,0,0,0,rt.width,rt.height,at.depth,Ft,z,rt.data):e.texImage3D(i.TEXTURE_2D_ARRAY,Ct,ct,rt.width,rt.height,at.depth,0,Ft,z,rt.data);w.layerUpdates.size>0&&w.clearLayerUpdates()}else{Rt&&Ot&&e.texStorage2D(i.TEXTURE_2D,de,ct,zt[0].width,zt[0].height);for(let Ct=0,re=zt.length;Ct<re;Ct++)rt=zt[Ct],w.format!==Vn?Ft!==null?Rt?ie&&e.compressedTexSubImage2D(i.TEXTURE_2D,Ct,0,0,rt.width,rt.height,Ft,rt.data):e.compressedTexImage2D(i.TEXTURE_2D,Ct,ct,rt.width,rt.height,0,rt.data):ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Rt?ie&&e.texSubImage2D(i.TEXTURE_2D,Ct,0,0,rt.width,rt.height,Ft,z,rt.data):e.texImage2D(i.TEXTURE_2D,Ct,ct,rt.width,rt.height,0,Ft,z,rt.data)}else if(w.isDataArrayTexture)if(Rt){if(Ot&&e.texStorage3D(i.TEXTURE_2D_ARRAY,de,ct,at.width,at.height,at.depth),ie)if(w.layerUpdates.size>0){let Ct=oh(at.width,at.height,w.format,w.type);for(let re of w.layerUpdates){let me=at.data.subarray(re*Ct/at.data.BYTES_PER_ELEMENT,(re+1)*Ct/at.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,re,at.width,at.height,1,Ft,z,me)}w.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,at.width,at.height,at.depth,Ft,z,at.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,ct,at.width,at.height,at.depth,0,Ft,z,at.data);else if(w.isData3DTexture)Rt?(Ot&&e.texStorage3D(i.TEXTURE_3D,de,ct,at.width,at.height,at.depth),ie&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,at.width,at.height,at.depth,Ft,z,at.data)):e.texImage3D(i.TEXTURE_3D,0,ct,at.width,at.height,at.depth,0,Ft,z,at.data);else if(w.isFramebufferTexture){if(Ot)if(Rt)e.texStorage2D(i.TEXTURE_2D,de,ct,at.width,at.height);else{let Ct=at.width,re=at.height;for(let me=0;me<de;me++)e.texImage2D(i.TEXTURE_2D,me,ct,Ct,re,0,Ft,z,null),Ct>>=1,re>>=1}}else if(w.isHTMLTexture){if("texElementImage2D"in i){let Ct=i.canvas;if(Ct.hasAttribute("layoutsubtree")||Ct.setAttribute("layoutsubtree","true"),at.parentNode!==Ct){Ct.appendChild(at),f.add(w),Ct.onpaint=re=>{let me=re.changedElements;for(let Ht of f)me.includes(Ht.image)&&(Ht.needsUpdate=!0)},Ct.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,at);else{let me=i.RGBA,Ht=i.RGBA,Re=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,me,Ht,Re,at)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(zt.length>0){if(Rt&&Ot){let Ct=Pt(zt[0]);e.texStorage2D(i.TEXTURE_2D,de,ct,Ct.width,Ct.height)}for(let Ct=0,re=zt.length;Ct<re;Ct++)rt=zt[Ct],Rt?ie&&e.texSubImage2D(i.TEXTURE_2D,Ct,0,0,Ft,z,rt):e.texImage2D(i.TEXTURE_2D,Ct,ct,Ft,z,rt);w.generateMipmaps=!1}else if(Rt){if(Ot){let Ct=Pt(at);e.texStorage2D(i.TEXTURE_2D,de,ct,Ct.width,Ct.height)}ie&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,Ft,z,at)}else e.texImage2D(i.TEXTURE_2D,0,ct,Ft,z,at);M(w)&&w.mipmapsAutoUpdate===!0&&y(vt),Et.__version=St.version,w.onUpdate&&w.onUpdate(w)}C.__version=w.version}function dt(C,w,q){if(w.image.length!==6)return;let vt=gt(C,w),it=w.source;e.bindTexture(i.TEXTURE_CUBE_MAP,C.__webglTexture,i.TEXTURE0+q);let St=n.get(it);if(it.version!==St.__version||vt===!0){e.activeTexture(i.TEXTURE0+q);let Et=Se.getPrimaries(Se.workingColorSpace),st=w.colorSpace===vi?null:Se.getPrimaries(w.colorSpace),at=w.colorSpace===vi||Et===st?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,w.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,w.premultiplyAlpha),e.pixelStorei(i.UNPACK_ALIGNMENT,w.unpackAlignment),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,at);let Ft=w.isCompressedTexture||w.image[0].isCompressedTexture,z=w.image[0]&&w.image[0].isDataTexture,ct=[];for(let Ht=0;Ht<6;Ht++)!Ft&&!z?ct[Ht]=_(w.image[Ht],!0,s.maxCubemapSize):ct[Ht]=z?w.image[Ht].image:w.image[Ht],ct[Ht]=At(w,ct[Ht]);let rt=ct[0],zt=r.convert(w.format,w.colorSpace),Rt=r.convert(w.type),Ot=A(w.internalFormat,zt,Rt,w.normalized,w.colorSpace),ie=w.isVideoTexture!==!0,de=St.__version===void 0||vt===!0,Ct=it.dataReady,re=b(w,rt);ee(i.TEXTURE_CUBE_MAP,w);let me;if(w.isDepthTexture){if(Ot=v(w.format===xi,w.type),de)if(ie)e.texStorage2D(i.TEXTURE_CUBE_MAP,1,Ot,rt.width,rt.height);else for(let Ht=0;Ht<6;Ht++)e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,0,Ot,rt.width,rt.height,0,zt,Rt,null)}else if(Ft){ie&&de&&e.texStorage2D(i.TEXTURE_CUBE_MAP,re,Ot,rt.width,rt.height);for(let Ht=0;Ht<6;Ht++){me=ct[Ht].mipmaps;for(let Re=0;Re<me.length;Re++){let Ge=me[Re];w.format!==Vn?zt!==null?ie?Ct&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re,0,0,Ge.width,Ge.height,zt,Ge.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re,Ot,Ge.width,Ge.height,0,Ge.data):ae("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):ie?Ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re,0,0,Ge.width,Ge.height,zt,Rt,Ge.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re,Ot,Ge.width,Ge.height,0,zt,Rt,Ge.data)}}}else{if(me=w.mipmaps,ie&&de){me.length>0&&re++;let Ht=Pt(ct[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,re,Ot,Ht.width,Ht.height)}for(let Ht=0;Ht<6;Ht++)if(z){ie?Ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,0,0,0,ct[Ht].width,ct[Ht].height,zt,Rt,ct[Ht].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,0,Ot,ct[Ht].width,ct[Ht].height,0,zt,Rt,ct[Ht].data);for(let Re=0;Re<me.length;Re++){let yn=me[Re].image[Ht].image;ie?Ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re+1,0,0,yn.width,yn.height,zt,Rt,yn.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re+1,Ot,yn.width,yn.height,0,zt,Rt,yn.data)}}else{ie?Ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,0,0,0,zt,Rt,ct[Ht]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,0,Ot,zt,Rt,ct[Ht]);for(let Re=0;Re<me.length;Re++){let Ge=me[Re];ie?Ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re+1,0,0,zt,Rt,Ge.image[Ht]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Ht,Re+1,Ot,zt,Rt,Ge.image[Ht])}}}M(w)&&w.mipmapsAutoUpdate===!0&&y(i.TEXTURE_CUBE_MAP),St.__version=it.version,w.onUpdate&&w.onUpdate(w)}C.__version=w.version}function mt(C,w,q,vt,it,St){let Et=r.convert(q.format,q.colorSpace),st=r.convert(q.type),at=A(q.internalFormat,Et,st,q.normalized,q.colorSpace),Ft=n.get(w),z=n.get(q);if(z.__renderTarget=w,!Ft.__hasExternalTextures){let ct=Math.max(1,w.width>>St),rt=Math.max(1,w.height>>St);it===i.TEXTURE_3D||it===i.TEXTURE_2D_ARRAY?e.texImage3D(it,St,at,ct,rt,w.depth,0,Et,st,null):e.texImage2D(it,St,at,ct,rt,0,Et,st,null)}e.bindFramebuffer(i.FRAMEBUFFER,C),ut(w)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,vt,it,z.__webglTexture,0,Qt(w)):(it===i.TEXTURE_2D||it>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&it<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,vt,it,z.__webglTexture,St),e.bindFramebuffer(i.FRAMEBUFFER,null)}function Bt(C,w,q){if(i.bindRenderbuffer(i.RENDERBUFFER,C),w.depthBuffer){let vt=w.depthTexture,it=vt&&vt.isDepthTexture?vt.type:null,St=v(w.stencilBuffer,it),Et=w.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;ut(w)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Qt(w),St,w.width,w.height):q?i.renderbufferStorageMultisample(i.RENDERBUFFER,Qt(w),St,w.width,w.height):i.renderbufferStorage(i.RENDERBUFFER,St,w.width,w.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,Et,i.RENDERBUFFER,C)}else{let vt=w.textures;for(let it=0;it<vt.length;it++){let St=vt[it],Et=r.convert(St.format,St.colorSpace),st=r.convert(St.type),at=A(St.internalFormat,Et,st,St.normalized,St.colorSpace);ut(w)?a.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Qt(w),at,w.width,w.height):q?i.renderbufferStorageMultisample(i.RENDERBUFFER,Qt(w),at,w.width,w.height):i.renderbufferStorage(i.RENDERBUFFER,at,w.width,w.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function It(C,w,q){let vt=w.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(i.FRAMEBUFFER,C),!(w.depthTexture&&w.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let it=n.get(w.depthTexture);it.__renderTarget=w;let St=vt?w.depthTexture.image[0]:w.depthTexture.image;(!it.__webglTexture||St.width!==w.width||St.height!==w.height)&&(St.width=w.width,St.height=w.height,w.depthTexture.needsUpdate=!0),vt?tt(w.depthTexture,0):ot(w.depthTexture,0);let Et=it.__webglTexture,st=Qt(w),at=vt?i.TEXTURE_CUBE_MAP_POSITIVE_X+q:i.TEXTURE_2D,Ft=w.depthTexture.format===xi?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(w.depthTexture.format===mi)ut(w)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Ft,at,Et,0,st):i.framebufferTexture2D(i.FRAMEBUFFER,Ft,at,Et,0);else if(w.depthTexture.format===xi)ut(w)?a.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Ft,at,Et,0,st):i.framebufferTexture2D(i.FRAMEBUFFER,Ft,at,Et,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Zt(C){let w=n.get(C),q=C.isWebGLCubeRenderTarget===!0;if(w.__boundDepthTexture!==C.depthTexture){let vt=C.depthTexture;if(w.__depthDisposeCallback&&w.__depthDisposeCallback(),vt){let it=()=>{delete w.__boundDepthTexture,delete w.__depthDisposeCallback,vt.removeEventListener("dispose",it)};vt.addEventListener("dispose",it),w.__depthDisposeCallback=it}w.__boundDepthTexture=vt}if(C.depthTexture&&!w.__autoAllocateDepthBuffer)if(q)for(let vt=0;vt<6;vt++)It(w.__webglFramebuffer[vt],C,vt);else C.texture.mipmaps.length>0?It(w.__webglFramebuffer[0],C,0):It(w.__webglFramebuffer,C,0);else if(q){w.__webglDepthbuffer=[];for(let vt=0;vt<6;vt++)if(e.bindFramebuffer(i.FRAMEBUFFER,w.__webglFramebuffer[vt]),w.__webglDepthbuffer[vt]===void 0)w.__webglDepthbuffer[vt]=i.createRenderbuffer(),Bt(w.__webglDepthbuffer[vt],C,!1);else{let it=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,St=w.__webglDepthbuffer[vt];i.bindRenderbuffer(i.RENDERBUFFER,St),i.framebufferRenderbuffer(i.FRAMEBUFFER,it,i.RENDERBUFFER,St)}}else if(C.texture.mipmaps.length>0?e.bindFramebuffer(i.FRAMEBUFFER,w.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,w.__webglFramebuffer),w.__webglDepthbuffer===void 0)w.__webglDepthbuffer=i.createRenderbuffer(),Bt(w.__webglDepthbuffer,C,!1);else{let it=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,St=w.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,St),i.framebufferRenderbuffer(i.FRAMEBUFFER,it,i.RENDERBUFFER,St)}e.bindFramebuffer(i.FRAMEBUFFER,null)}function Q(C,w,q){let vt=n.get(C);w!==void 0&&mt(vt.__webglFramebuffer,C,C.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),q!==void 0&&Zt(C)}function yt(C){let w=C.texture,q=n.get(C),vt=n.get(w);C.addEventListener("dispose",O),N(C);let it=C.textures,St=C.isWebGLCubeRenderTarget===!0,Et=it.length>1;if(Et||(vt.__webglTexture===void 0&&(vt.__webglTexture=i.createTexture()),vt.__version=w.version,o.memory.textures++),St){q.__webglFramebuffer=[];for(let st=0;st<6;st++)if(w.mipmaps.length>0){q.__webglFramebuffer[st]=[];for(let at=0;at<w.mipmaps.length;at++)q.__webglFramebuffer[st][at]=i.createFramebuffer()}else q.__webglFramebuffer[st]=i.createFramebuffer()}else{if(w.mipmaps.length>0){q.__webglFramebuffer=[];for(let st=0;st<w.mipmaps.length;st++)q.__webglFramebuffer[st]=i.createFramebuffer()}else q.__webglFramebuffer=i.createFramebuffer();if(Et)for(let st=0,at=it.length;st<at;st++){let Ft=n.get(it[st]);Ft.__webglTexture===void 0&&(Ft.__webglTexture=i.createTexture(),o.memory.textures++)}if(C.samples>0&&ut(C)===!1){q.__webglMultisampledFramebuffer=i.createFramebuffer(),q.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,q.__webglMultisampledFramebuffer);for(let st=0;st<it.length;st++){let at=it[st];q.__webglColorRenderbuffer[st]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,q.__webglColorRenderbuffer[st]);let Ft=r.convert(at.format,at.colorSpace),z=r.convert(at.type),ct=A(at.internalFormat,Ft,z,at.normalized,at.colorSpace,C.isXRRenderTarget===!0),rt=Qt(C);i.renderbufferStorageMultisample(i.RENDERBUFFER,rt,ct,C.width,C.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+st,i.RENDERBUFFER,q.__webglColorRenderbuffer[st])}i.bindRenderbuffer(i.RENDERBUFFER,null),C.depthBuffer&&(q.__webglDepthRenderbuffer=i.createRenderbuffer(),Bt(q.__webglDepthRenderbuffer,C,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(St){e.bindTexture(i.TEXTURE_CUBE_MAP,vt.__webglTexture),ee(i.TEXTURE_CUBE_MAP,w);for(let st=0;st<6;st++)if(w.mipmaps.length>0)for(let at=0;at<w.mipmaps.length;at++)mt(q.__webglFramebuffer[st][at],C,w,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+st,at);else mt(q.__webglFramebuffer[st],C,w,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+st,0);M(w)?y(i.TEXTURE_CUBE_MAP):w.mipmaps.length>0&&i.texParameteri(i.TEXTURE_CUBE_MAP,i.TEXTURE_MAX_LEVEL,w.mipmaps.length-1),e.unbindTexture()}else if(Et){for(let st=0,at=it.length;st<at;st++){let Ft=it[st],z=n.get(Ft),ct=i.TEXTURE_2D;(C.isWebGL3DRenderTarget||C.isWebGLArrayRenderTarget)&&(ct=C.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(ct,z.__webglTexture),ee(ct,Ft),mt(q.__webglFramebuffer,C,Ft,i.COLOR_ATTACHMENT0+st,ct,0),M(Ft)&&y(ct)}e.unbindTexture()}else{let st=i.TEXTURE_2D;if((C.isWebGL3DRenderTarget||C.isWebGLArrayRenderTarget)&&(st=C.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(st,vt.__webglTexture),ee(st,w),w.mipmaps.length>0)for(let at=0;at<w.mipmaps.length;at++)mt(q.__webglFramebuffer[at],C,w,i.COLOR_ATTACHMENT0,st,at);else mt(q.__webglFramebuffer,C,w,i.COLOR_ATTACHMENT0,st,0);M(w)?y(st):w.mipmaps.length>0&&i.texParameteri(st,i.TEXTURE_MAX_LEVEL,w.mipmaps.length-1),e.unbindTexture()}C.depthBuffer&&Zt(C)}function D(C){let w=C.textures;for(let q=0,vt=w.length;q<vt;q++){let it=w[q];if(M(it)&&it.mipmapsAutoUpdate===!0){let St=T(C),Et=n.get(it).__webglTexture;e.bindTexture(St,Et),y(St),e.unbindTexture()}}}let Vt=[];function Nt(C){if(C.samples>0){if(ut(C)===!1){let w=C.textures,q=C.width,vt=C.height,it=i.COLOR_BUFFER_BIT,St=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,Et=n.get(C),st=w.length>1;if(st)for(let Ft=0;Ft<w.length;Ft++)e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ft,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ft,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,Et.__webglMultisampledFramebuffer),C.texture.mipmaps.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Et.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Et.__webglFramebuffer);for(let Ft=0;Ft<w.length;Ft++){if(C.resolveDepthBuffer&&(C.depthBuffer&&(it|=i.DEPTH_BUFFER_BIT),C.stencilBuffer&&C.resolveStencilBuffer&&(it|=i.STENCIL_BUFFER_BIT)),st){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,Et.__webglColorRenderbuffer[Ft]);let z=n.get(w[Ft]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,z,0)}i.blitFramebuffer(0,0,q,vt,0,0,q,vt,it,i.NEAREST),l===!0&&(Vt.length=0,Vt.push(i.COLOR_ATTACHMENT0+Ft),C.depthBuffer&&C.storeMultisampledDepthBuffer===!1&&Vt.push(St),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,Vt))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),st)for(let Ft=0;Ft<w.length;Ft++){e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ft,i.RENDERBUFFER,Et.__webglColorRenderbuffer[Ft]);let z=n.get(w[Ft]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,Et.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Ft,i.TEXTURE_2D,z,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Et.__webglMultisampledFramebuffer)}else if(C.depthBuffer&&C.storeMultisampledDepthBuffer===!1&&l){let w=C.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[w])}}}function Qt(C){return Math.min(s.maxSamples,C.samples)}function ut(C){let w=n.get(C);return C.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&w.__useRenderToTexture!==!1}function Kt(C){let w=o.render.frame;h.get(C)!==w&&(h.set(C,w),C.update())}function At(C,w){let q=C.colorSpace,vt=C.format,it=C.type;return C.isCompressedTexture===!0||C.isVideoTexture===!0||q!==dr&&q!==vi&&(Se.getTransfer(q)===Pe?(vt!==Vn||it!==En)&&ae("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):ce("WebGLTextures: Unsupported texture color space:",q)),w}function Pt(C){return typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement?(c.width=C.naturalWidth||C.width,c.height=C.naturalHeight||C.height):typeof VideoFrame<"u"&&C instanceof VideoFrame?(c.width=C.displayWidth,c.height=C.displayHeight):(c.width=C.width,c.height=C.height),c}this.allocateTextureUnit=Dt,this.resetTextureUnits=X,this.getTextureUnits=j,this.setTextureUnits=_t,this.setTexture2D=ot,this.setTexture2DArray=xt,this.setTexture3D=Gt,this.setTextureCube=tt,this.rebindTextures=Q,this.setupRenderTarget=yt,this.updateRenderTargetMipmap=D,this.updateMultisampleRenderTarget=Nt,this.setupDepthRenderbuffer=Zt,this.setupFrameBufferTexture=mt,this.useMultisampledRTT=ut,this.dispose=B}function iv(i,t){function e(n,s=vi){let r,o=Se.getTransfer(s);if(n===En)return i.UNSIGNED_BYTE;if(n===Ha)return i.UNSIGNED_SHORT_4_4_4_4;if(n===Wa)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Wc)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Xc)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Vc)return i.BYTE;if(n===Hc)return i.SHORT;if(n===Xs)return i.UNSIGNED_SHORT;if(n===Va)return i.INT;if(n===zn)return i.UNSIGNED_INT;if(n===kn)return i.FLOAT;if(n===Gn)return i.HALF_FLOAT;if(n===qc)return i.ALPHA;if(n===Yc)return i.RGB;if(n===Vn)return i.RGBA;if(n===mi)return i.DEPTH_COMPONENT;if(n===xi)return i.DEPTH_STENCIL;if(n===Zc)return i.RED;if(n===Xa)return i.RED_INTEGER;if(n===Oi)return i.RG;if(n===qa)return i.RG_INTEGER;if(n===Ya)return i.RGBA_INTEGER;if(n===Xr||n===qr||n===Yr||n===Zr)if(o===Pe)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Xr)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===qr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Yr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Zr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Xr)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===qr)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Yr)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Zr)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Za||n===Ja||n===$a||n===Ka)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Za)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Ja)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===$a)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Ka)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Qa||n===ja||n===tl||n===el||n===nl||n===Jr||n===il)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Qa||n===ja)return o===Pe?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===tl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===el)return r.COMPRESSED_R11_EAC;if(n===nl)return r.COMPRESSED_SIGNED_R11_EAC;if(n===Jr)return r.COMPRESSED_RG11_EAC;if(n===il)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===sl||n===rl||n===ol||n===al||n===ll||n===cl||n===hl||n===ul||n===fl||n===dl||n===pl||n===ml||n===gl||n===_l)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===sl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===rl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===ol)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===al)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===ll)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===cl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===hl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===ul)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===fl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===dl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===pl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===ml)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===gl)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===_l)return o===Pe?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===xl||n===vl||n===yl)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===xl)return o===Pe?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===vl)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===yl)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Ml||n===Sl||n===$r||n===bl)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Ml)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Sl)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===$r)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===bl)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===es?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}var sv=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,rv=`
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

}`,yh=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){let n=new wr(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new fn({vertexShader:sv,fragmentShader:rv,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new _n(new Ki(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Mh=class extends Yn{constructor(t,e){super();let n=this,s=null,r=1,o=null,a="local-floor",l=1,c=null,h=null,f=null,d=null,u=null,m=null,x=typeof XRWebGLBinding<"u",p=new yh,g={},_=e.getContextAttributes(),M=null,y=null,T=[],A=[],v=new Lt,b=null,N=null,I=new on;I.viewport=new ze;let P=new on;P.viewport=new ze;let O=[I,P],V=new Oa,R=null,B=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Z){let ot=T[Z];return ot===void 0&&(ot=new Ns,T[Z]=ot),ot.getTargetRaySpace()},this.getControllerGrip=function(Z){let ot=T[Z];return ot===void 0&&(ot=new Ns,T[Z]=ot),ot.getGripSpace()},this.getHand=function(Z){let ot=T[Z];return ot===void 0&&(ot=new Ns,T[Z]=ot),ot.getHandSpace()};function k(Z){let ot=A.indexOf(Z.inputSource);if(ot===-1)return;let xt=T[ot];xt!==void 0&&(xt.update(Z.inputSource,Z.frame,c||o),xt.dispatchEvent({type:Z.type,data:Z.inputSource}))}function L(){s.removeEventListener("select",k),s.removeEventListener("selectstart",k),s.removeEventListener("selectend",k),s.removeEventListener("squeeze",k),s.removeEventListener("squeezestart",k),s.removeEventListener("squeezeend",k),s.removeEventListener("end",L),s.removeEventListener("inputsourceschange",W);for(let Z=0;Z<T.length;Z++){let ot=A[Z];ot!==null&&(A[Z]=null,T[Z].disconnect(ot))}R=null,B=null,p.reset();for(let Z in g)delete g[Z];if(t.setRenderTarget(M),u=null,d=null,f=null,s=null,y=null,Dt.stop(),n.isPresenting=!1,t.setPixelRatio(b),t.setSize(v.width,v.height,!1),N!==null){let Z=N.camera;Z.fov=N.fov,Z.zoom=N.zoom,Z.updateProjectionMatrix(),N=null}n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Z){r=Z,n.isPresenting===!0&&ae("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Z){a=Z,n.isPresenting===!0&&ae("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||o},this.setReferenceSpace=function(Z){c=Z},this.getBaseLayer=function(){return d!==null?d:u},this.getBinding=function(){return f===null&&x&&(f=new XRWebGLBinding(s,e)),f},this.getFrame=function(){return m},this.getSession=function(){return s},this.setSession=async function(Z){if(s=Z,s!==null){if(M=t.getRenderTarget(),s.addEventListener("select",k),s.addEventListener("selectstart",k),s.addEventListener("selectend",k),s.addEventListener("squeeze",k),s.addEventListener("squeezestart",k),s.addEventListener("squeezeend",k),s.addEventListener("end",L),s.addEventListener("inputsourceschange",W),_.xrCompatible!==!0&&await e.makeXRCompatible(),b=t.getPixelRatio(),t.getSize(v),x&&"createProjectionLayer"in XRWebGLBinding.prototype){let xt=null,Gt=null,tt=null;_.depth&&(tt=_.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,xt=_.stencil?xi:mi,Gt=_.stencil?es:zn);let Jt={colorFormat:e.RGBA8,depthFormat:tt,scaleFactor:r};f=this.getBinding(),d=f.createProjectionLayer(Jt),s.updateRenderState({layers:[d]}),t.setPixelRatio(1),t.setSize(d.textureWidth,d.textureHeight,!1),y=new un(d.textureWidth,d.textureHeight,{format:Vn,type:En,depthTexture:new gi(d.textureWidth,d.textureHeight,Gt,void 0,void 0,void 0,void 0,void 0,void 0,xt),stencilBuffer:_.stencil,colorSpace:t.outputColorSpace,samples:_.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}else{let xt={antialias:_.antialias,alpha:!0,depth:_.depth,stencil:_.stencil,framebufferScaleFactor:r};u=new XRWebGLLayer(s,e,xt),s.updateRenderState({baseLayer:u}),t.setPixelRatio(1),t.setSize(u.framebufferWidth,u.framebufferHeight,!1),y=new un(u.framebufferWidth,u.framebufferHeight,{format:Vn,type:En,colorSpace:t.outputColorSpace,stencilBuffer:_.stencil,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1,storeMultisampledDepthBuffer:u.ignoreDepthValues===!1,storeMultisampledStencilBuffer:u.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(l),c=null,o=await s.requestReferenceSpace(a),Dt.setContext(s),Dt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function W(Z){for(let ot=0;ot<Z.removed.length;ot++){let xt=Z.removed[ot],Gt=A.indexOf(xt);Gt>=0&&(A[Gt]=null,T[Gt].disconnect(xt))}for(let ot=0;ot<Z.added.length;ot++){let xt=Z.added[ot],Gt=A.indexOf(xt);if(Gt===-1){for(let Jt=0;Jt<T.length;Jt++)if(Jt>=A.length){A.push(xt),Gt=Jt;break}else if(A[Jt]===null){A[Jt]=xt,Gt=Jt;break}if(Gt===-1)break}let tt=T[Gt];tt&&tt.connect(xt)}}function U(Z,ot){ot===null?Z.matrixWorld.copy(Z.matrix):Z.matrixWorld.multiplyMatrices(ot.matrixWorld,Z.matrix),Z.matrixWorldInverse.copy(Z.matrixWorld).invert()}this.updateCamera=function(Z){if(s===null)return;let ot=Z.near,xt=Z.far;p.texture!==null&&(p.depthNear>0&&(ot=p.depthNear),p.depthFar>0&&(xt=p.depthFar)),V.near=P.near=I.near=ot,V.far=P.far=I.far=xt,(R!==V.near||B!==V.far)&&(s.updateRenderState({depthNear:V.near,depthFar:V.far}),R=V.near,B=V.far),V.layers.mask=Z.layers.mask|6,I.layers.mask=V.layers.mask&-5,P.layers.mask=V.layers.mask&-3;let Gt=Z.parent,tt=V.cameras;U(V,Gt);for(let Jt=0;Jt<tt.length;Jt++)U(tt[Jt],Gt);V.projectionMatrix.copy(I.projectionMatrix),V.projectionMatrixInverse.copy(I.projectionMatrixInverse),N===null&&Z.isPerspectiveCamera&&(N={camera:Z,fov:Z.fov,zoom:Z.zoom}),X(Z,V,Gt)};function X(Z,ot,xt){xt===null?Z.matrix.copy(ot.matrixWorld):(Z.matrix.copy(xt.matrixWorld),Z.matrix.invert(),Z.matrix.multiply(ot.matrixWorld)),Z.matrix.decompose(Z.position,Z.quaternion,Z.scale),Z.updateMatrixWorld(!0),Z.projectionMatrix.copy(ot.projectionMatrix),Z.projectionMatrixInverse.copy(ot.projectionMatrixInverse),Z.isPerspectiveCamera&&(Z.fov=aa*2*Math.atan(1/Z.projectionMatrix.elements[5]),Z.zoom=1)}this.getCamera=function(){return V},this.getFoveation=function(){if(!(d===null&&u===null))return l},this.setFoveation=function(Z){l=Z,d!==null&&(d.fixedFoveation=Z),u!==null&&u.fixedFoveation!==void 0&&(u.fixedFoveation=Z)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(V)},this.getCameraTexture=function(Z){return g[Z]};let j=null;function _t(Z,ot){if(h=ot.getViewerPose(c||o),m=ot,h!==null){let xt=h.views;u!==null&&(t.setRenderTargetFramebuffer(y,u.framebuffer),t.setRenderTarget(y));let Gt=!1;xt.length!==V.cameras.length&&(V.cameras.length=0,Gt=!0);for(let lt=0;lt<xt.length;lt++){let ee=xt[lt],gt=null;if(u!==null)gt=u.getViewport(ee);else{let ft=f.getViewSubImage(d,ee);gt=ft.viewport,lt===0&&(t.setRenderTargetTextures(y,ft.colorTexture,ft.depthStencilTexture),t.setRenderTarget(y))}let K=O[lt];K===void 0&&(K=new on,K.layers.enable(lt),K.viewport=new ze,O[lt]=K),K.matrix.fromArray(ee.transform.matrix),K.matrix.decompose(K.position,K.quaternion,K.scale),K.projectionMatrix.fromArray(ee.projectionMatrix),K.projectionMatrixInverse.copy(K.projectionMatrix).invert(),K.viewport.set(gt.x,gt.y,gt.width,gt.height),lt===0&&(V.matrix.copy(K.matrix),V.matrix.decompose(V.position,V.quaternion,V.scale)),Gt===!0&&V.cameras.push(K)}let tt=s.enabledFeatures;if(tt&&tt.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&x){f=n.getBinding();let lt=f.getDepthInformation(xt[0]);lt&&lt.isValid&&lt.texture&&p.init(lt,s.renderState)}if(tt&&tt.includes("camera-access")&&x){t.state.unbindTexture(),f=n.getBinding();for(let lt=0;lt<xt.length;lt++){let ee=xt[lt].camera;if(ee){let gt=g[ee];gt||(gt=new wr,g[ee]=gt);let K=f.getCameraImage(ee);gt.sourceTexture=K}}}}for(let xt=0;xt<T.length;xt++){let Gt=A[xt],tt=T[xt];Gt!==null&&tt!==void 0&&tt.update(Gt,ot,c||o)}j&&j(Z,ot),ot.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ot}),m=null}let Dt=new Wf;Dt.setAnimationLoop(_t),this.setAnimationLoop=function(Z){j=Z},this.dispose=function(){}}},ov=new fe,td=new he;td.set(-1,0,0,0,1,0,0,0,1);function av(i,t){function e(p,g){p.matrixAutoUpdate===!0&&p.updateMatrix(),g.value.copy(p.matrix)}function n(p,g){g.color.getRGB(p.fogColor.value,ih(i)),g.isFog?(p.fogNear.value=g.near,p.fogFar.value=g.far):g.isFogExp2&&(p.fogDensity.value=g.density)}function s(p,g,_,M,y){g.isNodeMaterial?g.uniformsNeedUpdate=!1:g.isMeshBasicMaterial?r(p,g):g.isMeshLambertMaterial?(r(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshToonMaterial?(r(p,g),f(p,g)):g.isMeshPhongMaterial?(r(p,g),h(p,g),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)):g.isMeshStandardMaterial?(r(p,g),d(p,g),g.isMeshPhysicalMaterial&&u(p,g,y)):g.isMeshMatcapMaterial?(r(p,g),m(p,g)):g.isMeshDepthMaterial?r(p,g):g.isMeshDistanceMaterial?(r(p,g),x(p,g)):g.isMeshNormalMaterial?r(p,g):g.isLineBasicMaterial?(o(p,g),g.isLineDashedMaterial&&a(p,g)):g.isPointsMaterial?l(p,g,_,M):g.isSpriteMaterial?c(p,g):g.isShadowMaterial?(p.color.value.copy(g.color),p.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function r(p,g){p.opacity.value=g.opacity,g.color&&p.diffuse.value.copy(g.color),g.emissive&&p.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(p.map.value=g.map,e(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.bumpMap&&(p.bumpMap.value=g.bumpMap,e(g.bumpMap,p.bumpMapTransform),p.bumpScale.value=g.bumpScale,g.side===dn&&(p.bumpScale.value*=-1)),g.normalMap&&(p.normalMap.value=g.normalMap,e(g.normalMap,p.normalMapTransform),p.normalScale.value.copy(g.normalScale),g.side===dn&&p.normalScale.value.negate()),g.displacementMap&&(p.displacementMap.value=g.displacementMap,e(g.displacementMap,p.displacementMapTransform),p.displacementScale.value=g.displacementScale,p.displacementBias.value=g.displacementBias),g.emissiveMap&&(p.emissiveMap.value=g.emissiveMap,e(g.emissiveMap,p.emissiveMapTransform)),g.specularMap&&(p.specularMap.value=g.specularMap,e(g.specularMap,p.specularMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest);let _=t.get(g),M=_.envMap,y=_.envMapRotation;M&&(p.envMap.value=M,p.envMapRotation.value.setFromMatrix4(ov.makeRotationFromEuler(y)).transpose(),M.isCubeTexture&&M.isRenderTargetTexture===!1&&p.envMapRotation.value.premultiply(td),p.reflectivity.value=g.reflectivity,p.ior.value=g.ior,p.refractionRatio.value=g.refractionRatio),g.lightMap&&(p.lightMap.value=g.lightMap,p.lightMapIntensity.value=g.lightMapIntensity,e(g.lightMap,p.lightMapTransform)),g.aoMap&&(p.aoMap.value=g.aoMap,p.aoMapIntensity.value=g.aoMapIntensity,e(g.aoMap,p.aoMapTransform))}function o(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,g.map&&(p.map.value=g.map,e(g.map,p.mapTransform))}function a(p,g){p.dashSize.value=g.dashSize,p.totalSize.value=g.dashSize+g.gapSize,p.scale.value=g.scale}function l(p,g,_,M){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.size.value=g.size*_,p.scale.value=M*.5,g.map&&(p.map.value=g.map,e(g.map,p.uvTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function c(p,g){p.diffuse.value.copy(g.color),p.opacity.value=g.opacity,p.rotation.value=g.rotation,g.map&&(p.map.value=g.map,e(g.map,p.mapTransform)),g.alphaMap&&(p.alphaMap.value=g.alphaMap,e(g.alphaMap,p.alphaMapTransform)),g.alphaTest>0&&(p.alphaTest.value=g.alphaTest)}function h(p,g){p.specular.value.copy(g.specular),p.shininess.value=Math.max(g.shininess,1e-4)}function f(p,g){g.gradientMap&&(p.gradientMap.value=g.gradientMap)}function d(p,g){p.metalness.value=g.metalness,g.metalnessMap&&(p.metalnessMap.value=g.metalnessMap,e(g.metalnessMap,p.metalnessMapTransform)),p.roughness.value=g.roughness,g.roughnessMap&&(p.roughnessMap.value=g.roughnessMap,e(g.roughnessMap,p.roughnessMapTransform)),g.envMap&&(p.envMapIntensity.value=g.envMapIntensity)}function u(p,g,_){p.ior.value=g.ior,g.diffuseRoughness>0&&(p.diffuseRoughness.value=g.diffuseRoughness,g.diffuseRoughnessMap&&(p.diffuseRoughnessMap.value=g.diffuseRoughnessMap,e(g.diffuseRoughnessMap,p.diffuseRoughnessMapTransform))),g.sheen>0&&(p.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),p.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(p.sheenColorMap.value=g.sheenColorMap,e(g.sheenColorMap,p.sheenColorMapTransform)),g.sheenRoughnessMap&&(p.sheenRoughnessMap.value=g.sheenRoughnessMap,e(g.sheenRoughnessMap,p.sheenRoughnessMapTransform))),g.clearcoat>0&&(p.clearcoat.value=g.clearcoat,p.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(p.clearcoatMap.value=g.clearcoatMap,e(g.clearcoatMap,p.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,e(g.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(p.clearcoatNormalMap.value=g.clearcoatNormalMap,e(g.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===dn&&p.clearcoatNormalScale.value.negate())),g.dispersion>0&&(p.dispersion.value=g.dispersion),g.retroreflectivity>0&&(p.retroreflectivity.value=g.retroreflectivity),g.iridescence>0&&(p.iridescence.value=g.iridescence,p.iridescenceIOR.value=g.iridescenceIOR,p.iridescenceThicknessMinimum.value=g.iridescenceThicknessMinimum,p.iridescenceThicknessMaximum.value=g.iridescenceThicknessMaximum,g.iridescenceMap&&(p.iridescenceMap.value=g.iridescenceMap,e(g.iridescenceMap,p.iridescenceMapTransform)),g.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=g.iridescenceThicknessMap,e(g.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),g.transmission>0&&(p.transmission.value=g.transmission,p.transmissionSamplerMap.value=_.texture,p.transmissionSamplerSize.value.set(_.width,_.height),g.transmissionMap&&(p.transmissionMap.value=g.transmissionMap,e(g.transmissionMap,p.transmissionMapTransform)),p.thickness.value=g.thickness,g.thicknessMap&&(p.thicknessMap.value=g.thicknessMap,e(g.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=g.attenuationDistance,p.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(p.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(p.anisotropyMap.value=g.anisotropyMap,e(g.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=g.specularIntensity,p.specularColor.value.copy(g.specularColor),g.specularColorMap&&(p.specularColorMap.value=g.specularColorMap,e(g.specularColorMap,p.specularColorMapTransform)),g.specularIntensityMap&&(p.specularIntensityMap.value=g.specularIntensityMap,e(g.specularIntensityMap,p.specularIntensityMapTransform))}function m(p,g){g.matcap&&(p.matcap.value=g.matcap)}function x(p,g){let _=t.get(g).light;p.referencePosition.value.setFromMatrixPosition(_.matrixWorld),p.nearDistance.value=_.shadow.camera.near,p.farDistance.value=_.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function lv(i,t,e,n){let s={},r={};function o(_,M){let y=M.program;n.uniformBlockBinding(_,y,s[_.id])}function a(_,M){let y=s[_.id];y===void 0&&(m(_),y=l(_),s[_.id]=y,_.addEventListener("dispose",p));let T=M.program;n.updateUBOMapping(_,T);let A=t.render.frame;r[_.id]!==A&&(c(_),r[_.id]=A)}function l(_){let M=i.createBuffer(),y=_.__size,T=_.usage;return i.bindBuffer(i.UNIFORM_BUFFER,M),i.bufferData(i.UNIFORM_BUFFER,y,T),i.bindBuffer(i.UNIFORM_BUFFER,null),M}function c(_){let M=s[_.id],y=_.uniforms,T=_.__cache;i.bindBuffer(i.UNIFORM_BUFFER,M);for(let A=0,v=y.length;A<v;A++){let b=y[A];if(Array.isArray(b))for(let N=0,I=b.length;N<I;N++)h(b[N],A,N,T);else h(b,A,0,T)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function h(_,M,y,T){if(d(_,M,y,T)===!0){let A=_.__offset,v=_.value;if(Array.isArray(v)){let b=0;for(let N=0;N<v.length;N++){let I=v[N],P=x(I,!0);f(I,_.__data,b),b+=P.storage/Float32Array.BYTES_PER_ELEMENT}}else f(v,_.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,A,_.__data)}}function f(_,M,y){typeof _=="number"||typeof _=="boolean"?M[y]=_:_.isMatrix3?(M[y]=_.elements[0],M[y+1]=_.elements[1],M[y+2]=_.elements[2],M[y+3]=0,M[y+4]=_.elements[3],M[y+5]=_.elements[4],M[y+6]=_.elements[5],M[y+7]=0,M[y+8]=_.elements[6],M[y+9]=_.elements[7],M[y+10]=_.elements[8],M[y+11]=0):ArrayBuffer.isView(_)?M.set(_.subarray(0,M.length-y),y):_.toArray(M,y)}function d(_,M,y,T){let A=_.value,v=M+"_"+y;if(Array.isArray(A)){T[v]===void 0&&(T[v]=[]);let b=T[v],N=!1;for(let I=0;I<A.length;I++)u(A[I],b,I)===!0&&(N=!0);return N}return u(A,T,v)}function u(_,M,y){if(M[y]===void 0)return typeof _=="number"||typeof _=="boolean"?M[y]=_:ArrayBuffer.isView(_)?M[y]=_.slice():M[y]=_.clone(),!0;{let T=M[y];if(typeof _=="number"||typeof _=="boolean"){if(T!==_)return M[y]=_,!0}else{if(ArrayBuffer.isView(_))return!0;if(T.equals(_)===!1)return T.copy(_),!0}}return!1}function m(_){let M=_.uniforms,y=0,T=16;for(let v=0,b=M.length;v<b;v++){let N=Array.isArray(M[v])?M[v]:[M[v]];for(let I=0,P=N.length;I<P;I++){let O=N[I],V=Array.isArray(O.value)?O.value:[O.value],R=Array.isArray(M[v])||Array.isArray(O.value),B=y;for(let L=0,W=V.length;L<W;L++){let U=V[L],X=x(U,R),j=y%T,_t=j%X.boundary,Dt=j+_t;y+=_t,Dt!==0&&T-Dt<X.storage&&(y+=T-Dt),L===0&&(B=y),y+=X.storage}let k=O.type==="int"?Int32Array:O.type==="uint"?Uint32Array:Float32Array;O.__data=new k((y-B)/Float32Array.BYTES_PER_ELEMENT),O.__offset=B}}let A=y%T;return A>0&&(y+=T-A),_.__size=y,_.__cache={},this}function x(_,M){let y={boundary:0,storage:0};return typeof _=="number"||typeof _=="boolean"?(y.boundary=4,y.storage=4):_.isVector2?(y.boundary=8,y.storage=8):_.isVector3||_.isColor?(y.boundary=16,y.storage=12):_.isVector4?(y.boundary=16,y.storage=16):_.isMatrix3?(y.boundary=16,y.storage=48):_.isMatrix4?(y.boundary=16,y.storage=64):_.isTexture?ae("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(_)?(y.boundary=16,y.storage=_.byteLength):ae("WebGLRenderer: Unsupported uniform value type.",_),M===!0&&(y.boundary=16,y.storage=Math.ceil(y.storage/16)*16),y}function p(_){let M=_.target;M.removeEventListener("dispose",p),i.deleteBuffer(s[M.id]),delete s[M.id],delete r[M.id]}function g(){for(let _ in s)i.deleteBuffer(s[_]);s={},r={}}return{bind:o,update:a,dispose:g}}var cv=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),jn=null;function hv(){return jn===null&&(jn=new fa(cv,16,16,Oi,Gn),jn.name="DFG_LUT",jn.minFilter=hn,jn.magFilter=hn,jn.wrapS=Xn,jn.wrapT=Xn,jn.generateMipmaps=!1,jn.needsUpdate=!0),jn}var El=class{constructor(t={}){let{canvas:e=hf(),context:n=null,depth:s=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:f=!1,reversedDepthBuffer:d=!1,outputBufferType:u=En}=t;this.isWebGLRenderer=!0;let m;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=n.getContextAttributes().alpha}else m=o;let x=u,p=new Set([Ya,qa,Xa]),g=new Set([En,zn,Xs,es,Ha,Wa]),_=new Uint32Array(4),M=new Int32Array(4),y={textures:[],min:[],max:[],resolution:[]},T=null,A=null,v=[],b=[],N=null;this.domElement=e,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Qn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let I=this,P=!1,O=null,V=null,R=null,B=null;this._outputColorSpace=bn;let k=0,L=0,W=null,U=-1,X=null,j=new ze,_t=new ze,Dt=null,Z=new Ae(0),ot=0,xt=e.width,Gt=e.height,tt=1,Jt=null,se=null,lt=new ze(0,0,xt,Gt),ee=new ze(0,0,xt,Gt),gt=!1,K=new Zi,ft=new da,ht=!1,dt=!1,mt=new fe,Bt=new G,It=new ze,Zt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Q=!1;function yt(){return W===null?tt:1}let D=n;function Vt(E,H){return e.getContext(E,H)}let Nt,Qt,ut,Kt,At,Pt,C,w,q,vt,it,St,Et,st,at,Ft,z,ct,rt,zt,Rt,Ot,ie;try{let E={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:f};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${"187"}`),e.addEventListener("webglcontextlost",re,!1),e.addEventListener("webglcontextrestored",me,!1),e.addEventListener("webglcontextcreationerror",Ht,!1),D===null){let H="webgl2";if(D=Vt(H,E),D===null)throw Vt(H)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}de()}catch(E){throw e.removeEventListener("webglcontextlost",re,!1),e.removeEventListener("webglcontextrestored",me,!1),e.removeEventListener("webglcontextcreationerror",Ht,!1),ce("WebGLRenderer: "+E.message),E}function de(){Nt=new M_(D),Nt.init(),Rt=new iv(D,Nt),Qt=new h_(D,Nt,t,Rt),ut=new ev(D,Nt),Qt.reversedDepthBuffer&&d&&ut.buffers.depth.setReversed(!0),V=D.createFramebuffer(),R=D.createFramebuffer(),B=D.createFramebuffer(),Kt=new w_(D),At=new Gx,Pt=new nv(D,Nt,ut,At,Qt,Rt,Kt),C=new y_(I),w=new Tm(D),Ot=new l_(D,w),q=new S_(D,w,Kt,Ot),vt=new T_(D,q,w,Ot,Kt),ct=new A_(D,Qt,Pt),at=new u_(At),it=new kx(I,C,Nt,Qt,Ot,at),St=new av(I,At),Et=new Hx,st=new Jx(Nt),z=new a_(I,C,ut,vt,m,l),Ft=new tv(I,vt,Qt),ie=new lv(D,Kt,Qt,ut),rt=new c_(D,Nt,Kt),zt=new b_(D,Nt,Kt),Kt.programs=it.programs,I.capabilities=Qt,I.extensions=Nt,I.properties=At,I.renderLists=Et,I.shadowMap=Ft,I.state=ut,I.info=Kt}x!==En&&(N=new R_(x,e.width,e.height,a,s,r));let Ct=new Mh(I,D);this.xr=Ct,this.getContext=function(){return D},this.getContextAttributes=function(){return D.getContextAttributes()},this.forceContextLoss=function(){let E=Nt.get("WEBGL_lose_context");E&&E.loseContext()},this.forceContextRestore=function(){let E=Nt.get("WEBGL_lose_context");E&&E.restoreContext()},this.getPixelRatio=function(){return tt},this.setPixelRatio=function(E){E!==void 0&&(tt=E,this.setSize(xt,Gt,!1))},this.getSize=function(E){return E.set(xt,Gt)},this.setSize=function(E,H,et=!0){if(Ct.isPresenting){ae("WebGLRenderer: Can't change size while VR device is presenting.");return}xt=E,Gt=H,e.width=Math.floor(E*tt),e.height=Math.floor(H*tt),et===!0&&(e.style.width=E+"px",e.style.height=H+"px"),N!==null&&N.setSize(e.width,e.height),this.setViewport(0,0,E,H)},this.getDrawingBufferSize=function(E){return E.set(xt*tt,Gt*tt).floor()},this.setDrawingBufferSize=function(E,H,et){xt=E,Gt=H,tt=et,e.width=Math.floor(E*et),e.height=Math.floor(H*et),this.setViewport(0,0,E,H)},this.setEffects=function(E){if(x===En){ce("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(E){for(let H=0;H<E.length;H++)if(E[H].isOutputPass===!0){ae("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}N.setEffects(E||[])},this.getCurrentViewport=function(E){return E.copy(j)},this.getViewport=function(E){return E.copy(lt)},this.setViewport=function(E,H,et,Y){E.isVector4?lt.set(E.x,E.y,E.z,E.w):lt.set(E,H,et,Y),ut.viewport(j.copy(lt).multiplyScalar(yt()).round())},this.getScissor=function(E){return E.copy(ee)},this.setScissor=function(E,H,et,Y){E.isVector4?ee.set(E.x,E.y,E.z,E.w):ee.set(E,H,et,Y),ut.scissor(_t.copy(ee).multiplyScalar(yt()).round())},this.getScissorTest=function(){return gt},this.setScissorTest=function(E){ut.setScissorTest(gt=E)},this.setOpaqueSort=function(E){Jt=E},this.setTransparentSort=function(E){se=E},this.getClearColor=function(E){return E.copy(z.getClearColor())},this.setClearColor=function(){z.setClearColor(...arguments)},this.getClearAlpha=function(){return z.getClearAlpha()},this.setClearAlpha=function(){z.setClearAlpha(...arguments)},this.clear=function(E=!0,H=!0,et=!0){let Y=0;if(E){let J=!1;if(W!==null){let Ut=W.texture.format;J=p.has(Ut)}if(J){let Ut=W.texture.type,jt=g.has(Ut),kt=z.getClearColor(),Wt=z.getClearAlpha(),Yt=kt.r,Xt=kt.g,ge=kt.b;jt?(_[0]=Yt,_[1]=Xt,_[2]=ge,_[3]=Wt,D.clearBufferuiv(D.COLOR,0,_)):(M[0]=Yt,M[1]=Xt,M[2]=ge,M[3]=Wt,D.clearBufferiv(D.COLOR,0,M))}else Y|=D.COLOR_BUFFER_BIT}H&&(Y|=D.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),et&&(Y|=D.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),Y!==0&&D.clear(Y)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(E){E.setRenderer(this),O=E},this.dispose=function(){e.removeEventListener("webglcontextlost",re,!1),e.removeEventListener("webglcontextrestored",me,!1),e.removeEventListener("webglcontextcreationerror",Ht,!1),z.dispose(),Et.dispose(),st.dispose(),Pt.dispose(),At.dispose(),C.dispose(),vt.dispose(),q.dispose(),Ot.dispose(),ie.dispose(),it.dispose(),Ct.dispose(),Ct.removeEventListener("sessionstart",ho),Ct.removeEventListener("sessionend",Qs),ii.stop()};function re(E){E.preventDefault(),th("WebGLRenderer: Context Lost."),P=!0}function me(){th("WebGLRenderer: Context Restored."),P=!1;let E=Kt.autoReset,H=Ft.enabled,et=Ft.autoUpdate,Y=Ft.needsUpdate,J=Ft.type;de(),Kt.autoReset=E,Ft.enabled=H,Ft.autoUpdate=et,Ft.needsUpdate=Y,Ft.type=J}function Ht(E){ce("WebGLRenderer: A WebGL context could not be created. Reason: ",E.statusMessage)}function Re(E){let H=E.target;H.removeEventListener("dispose",Re),Ge(H)}function Ge(E){yn(E),At.remove(E)}function yn(E){let H=At.get(E).programs;H!==void 0&&(H.forEach(function(et){it.releaseProgram(et)}),E.isShaderMaterial&&it.releaseShaderCache(E))}this.renderBufferDirect=function(E,H,et,Y,J,Ut){H===null&&(H=Zt);let jt=J.isMesh&&J.matrixWorld.determinantAffine()<0,kt=Vl(E,H,et,Y,J);ut.setMaterial(Y,jt);let Wt=et.index,Yt=1;if(Y.wireframe===!0){if(Wt=q.getWireframeAttribute(et),Wt===void 0)return;Yt=2}let Xt=et.drawRange,ge=et.attributes.position,$t=Xt.start*Yt,xe=(Xt.start+Xt.count)*Yt;Ut!==null&&($t=Math.max($t,Ut.start*Yt),xe=Math.min(xe,(Ut.start+Ut.count)*Yt)),Wt!==null?($t=Math.max($t,0),xe=Math.min(xe,Wt.count)):ge!=null&&($t=Math.max($t,0),xe=Math.min(xe,ge.count));let Oe=xe-$t;if(Oe<0||Oe===1/0)return;Ot.setup(J,Y,kt,et,Wt);let Le,Ce=rt;if(Wt!==null&&(Le=w.get(Wt),Ce=zt,Ce.setIndex(Le)),J.isMesh)Y.wireframe===!0?(ut.setLineWidth(Y.wireframeLinewidth*yt()),Ce.setMode(D.LINES)):Ce.setMode(D.TRIANGLES);else if(J.isLine){let Ye=Y.linewidth;Ye===void 0&&(Ye=1),ut.setLineWidth(Ye*yt()),J.isLineSegments?Ce.setMode(D.LINES):J.isLineLoop?Ce.setMode(D.LINE_LOOP):Ce.setMode(D.LINE_STRIP)}else J.isPoints?Ce.setMode(D.POINTS):J.isSprite&&Ce.setMode(D.TRIANGLES);if(J.isBatchedMesh)if(Nt.get("WEBGL_multi_draw"))Ce.renderMultiDraw(J._multiDrawStarts,J._multiDrawCounts,J._multiDrawCount);else{let Ye=J._multiDrawStarts,te=J._multiDrawCounts,Ke=J._multiDrawCount,Me=Wt?w.get(Wt).bytesPerElement:1,si=At.get(Y).currentProgram.getUniforms();for(let Qe=0;Qe<Ke;Qe++)si.setValue(D,"_gl_DrawID",Qe),Ce.render(Ye[Qe]/Me,te[Qe])}else if(J.isInstancedMesh)Ce.renderInstances($t,Oe,J.count);else if(et.isInstancedBufferGeometry){let Ye=et._maxInstanceCount!==void 0?et._maxInstanceCount:1/0,te=Math.min(et.instanceCount,Ye);Ce.renderInstances($t,Oe,te)}else Ce.render($t,Oe)};function cs(E,H,et,Y){O!==null&&E.isNodeMaterial&&O.setObject(Y,E),ht===!0&&at.setState(E,et,!1),E.transparent===!0&&E.side===xn&&E.forceSinglePass===!1?(E.side=dn,E.needsUpdate=!0,bi(E,H,Y),E.side=Kn,E.needsUpdate=!0,bi(E,H,Y),E.side=xn):bi(E,H,Y)}this.compile=function(E,H,et=null){et===null&&(et=E),O!==null&&O.renderStart(E,H,et),A=st.get(et),A.init(H),b.push(A),et.traverseVisible(function(J){J.isLight&&J.layers.test(H.layers)&&(A.pushLight(J),J.castShadow&&A.pushShadow(J))}),E!==et&&E.traverseVisible(function(J){J.isLight&&J.layers.test(H.layers)&&(A.pushLight(J),J.castShadow&&A.pushShadow(J))}),A.setupLights(),O!==null&&O.updateLights(A.state.lightsArray),dt=this.localClippingEnabled,ht=at.init(this.clippingPlanes,dt),ht===!0&&at.setGlobalState(this.clippingPlanes,H),O!==null&&Ft.render(A.state.shadowsArray,et,H);let Y=new Set;return E.traverse(function(J){if(!(J.isMesh||J.isPoints||J.isLine||J.isSprite))return;let Ut=J.material;if(Ut)if(Array.isArray(Ut))for(let jt=0;jt<Ut.length;jt++){let kt=Ut[jt];cs(kt,et,H,J),Y.add(kt)}else cs(Ut,et,H,J),Y.add(Ut)}),A=b.pop(),O!==null&&O.renderEnd(),Y},this.compileAsync=function(E,H,et=null){let Y=this.compile(E,H,et);return new Promise(J=>{function Ut(){if(Y.forEach(function(jt){let Wt=At.get(jt).currentProgram;(Wt===void 0||Wt.isReady())&&Y.delete(jt)}),Y.size===0){J(E);return}setTimeout(Ut,10)}Nt.get("KHR_parallel_shader_compile")!==null?Ut():setTimeout(Ut,10)})};let ni=null;function hs(E){ni&&ni(E)}function ho(){ii.stop()}function Qs(){ii.start()}let ii=new Wf;ii.setAnimationLoop(hs),typeof self<"u"&&ii.setContext(self),this.setAnimationLoop=function(E){ni=E,Ct.setAnimationLoop(E),E===null?ii.stop():ii.start()},Ct.addEventListener("sessionstart",ho),Ct.addEventListener("sessionend",Qs),this.render=function(E,H){if(H!==void 0&&H.isCamera!==!0){ce("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;O!==null&&O.renderStart(E,H);let et=Ct.enabled===!0&&Ct.isPresenting===!0,Y=N!==null&&(W===null||et)&&N.begin(I,W);if(E.matrixWorldAutoUpdate===!0&&E.updateMatrixWorld(),H.parent===null&&H.matrixWorldAutoUpdate===!0&&H.updateMatrixWorld(),Ct.enabled===!0&&Ct.isPresenting===!0&&(N===null||N.isCompositing()===!1)&&(Ct.cameraAutoUpdate===!0&&Ct.updateCamera(H),H=Ct.getCamera()),E.isScene===!0&&E.onBeforeRender(I,E,H,W),A=st.get(E,b.length),A.init(H),A.state.textureUnits=Pt.getTextureUnits(),b.push(A),mt.multiplyMatrices(H.projectionMatrix,H.matrixWorldInverse),H.isArrayCamera?ft.setFromArrayCamera(H):K.setFromProjectionMatrix(mt,In,H.reversedDepth),dt=this.localClippingEnabled,ht=at.init(this.clippingPlanes,dt),T=Et.get(E,v.length),T.init(),v.push(T),this.info.render.frame++,Ct.enabled===!0&&Ct.isPresenting===!0){let jt=I.xr.getDepthSensingMesh();jt!==null&&Rn(jt,H,-1/0,I.sortObjects)}Rn(E,H,0,I.sortObjects),T.finish(),O!==null&&O.updateLights(A.state.lightsArray),I.sortObjects===!0&&T.sort(Jt,se),Q=Ct.enabled===!1||Ct.isPresenting===!1||Ct.hasDepthSensing()===!1,Q&&z.addToRenderList(T,E),this.info.autoReset===!0&&this.info.reset(),ht===!0&&at.beginShadows();let J=A.state.shadowsArray;if(Ft.render(J,E,H),ht===!0&&at.endShadows(),(Y&&N.hasRenderPass())===!1){let jt=T.opaque,kt=T.transmissive;if(A.setupLights(),H.isArrayCamera){let Wt=H.cameras;if(kt.length>0)for(let Yt=0,Xt=Wt.length;Yt<Xt;Yt++){let ge=Wt[Yt];Mi(jt,kt,E,ge)}Q&&z.render(E);for(let Yt=0,Xt=Wt.length;Yt<Xt;Yt++){let ge=Wt[Yt];us(T,E,ge,ge.viewport)}}else kt.length>0&&Mi(jt,kt,E,H),Q&&z.render(E),us(T,E,H)}W!==null&&L===0&&(Pt.updateMultisampleRenderTarget(W),Pt.updateRenderTargetMipmap(W)),Y&&N.end(I),E.isScene===!0&&E.onAfterRender(I,E,H),Ot.resetDefaultState(),U=-1,X=null,b.pop(),b.length>0?(A=b[b.length-1],Pt.setTextureUnits(A.state.textureUnits),ht===!0&&at.setGlobalState(I.clippingPlanes,A.state.camera)):A=null,v.pop(),v.length>0?T=v[v.length-1]:T=null,O!==null&&O.renderEnd()};function Rn(E,H,et,Y){if(E.visible===!1)return;if(E.layers.test(H.layers)){if(E.isGroup)et=E.renderOrder;else if(E.isLOD)E.autoUpdate===!0&&E.update(H);else if(E.isLight)A.pushLight(E),E.castShadow&&A.pushShadow(E);else if(E.isSprite){let jt=H.isArrayCamera?ft:K;if(!E.frustumCulled||E.intersectsFrustum(jt)){Y&&It.setFromMatrixPosition(E.matrixWorld).applyMatrix4(mt);let kt=vt.update(E),Wt=E.material;Wt.visible&&T.push(E,kt,Wt,et,It.z,null,H)}}else if(E.isMesh||E.isLine||E.isPoints){let jt=H.isArrayCamera?ft:K;if(!E.frustumCulled||E.intersectsFrustum(jt)){let kt=vt.update(E),Wt=E.material;if(Y&&(E.boundingSphere!==void 0?(E.boundingSphere===null&&E.computeBoundingSphere(),It.copy(E.boundingSphere.center)):(kt.boundingSphere===null&&kt.computeBoundingSphere(),It.copy(kt.boundingSphere.center)),It.applyMatrix4(E.matrixWorld).applyMatrix4(mt)),Array.isArray(Wt)){let Yt=kt.groups;for(let Xt=0,ge=Yt.length;Xt<ge;Xt++){let $t=Yt[Xt],xe=Wt[$t.materialIndex];xe&&xe.visible&&T.push(E,kt,xe,et,It.z,$t,H)}}else Wt.visible&&T.push(E,kt,Wt,et,It.z,null,H)}}}let Ut=E.children;for(let jt=0,kt=Ut.length;jt<kt;jt++)Rn(Ut[jt],H,et,Y)}function us(E,H,et,Y){let{opaque:J,transmissive:Ut,transparent:jt}=E;A.setupLightsView(et),ht===!0&&at.setGlobalState(I.clippingPlanes,et),Y&&ut.viewport(j.copy(Y)),J.length>0&&Si(J,H,et),Ut.length>0&&Si(Ut,H,et),jt.length>0&&Si(jt,H,et),ut.buffers.depth.setTest(!0),ut.buffers.depth.setMask(!0),ut.buffers.color.setMask(!0),ut.setPolygonOffset(!1)}function Mi(E,H,et,Y){if((et.isScene===!0?et.overrideMaterial:null)!==null)return;if(A.state.transmissionRenderTarget[Y.id]===void 0){let $t=Nt.has("EXT_color_buffer_half_float")||Nt.has("EXT_color_buffer_float");A.state.transmissionRenderTarget[Y.id]=new un(1,1,{generateMipmaps:!0,type:$t?Gn:En,minFilter:_i,samples:Math.max(4,Qt.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Se.workingColorSpace})}let Ut=A.state.transmissionRenderTarget[Y.id],jt=Y.viewport||j;Ut.setSize(jt.z*I.transmissionResolutionScale,jt.w*I.transmissionResolutionScale);let kt=I.getRenderTarget(),Wt=I.getActiveCubeFace(),Yt=I.getActiveMipmapLevel();I.setRenderTarget(Ut),I.getClearColor(Z),ot=I.getClearAlpha(),ot<1&&I.setClearColor(16777215,.5),I.clear(),Q&&z.render(et);let Xt=I.toneMapping;I.toneMapping=Qn;let ge=Y.viewport;if(Y.viewport!==void 0&&(Y.viewport=void 0),A.setupLightsView(Y),ht===!0&&at.setGlobalState(I.clippingPlanes,Y),Si(E,et,Y),Pt.updateMultisampleRenderTarget(Ut),Pt.updateRenderTargetMipmap(Ut),Nt.has("WEBGL_multisampled_render_to_texture")===!1){let $t=!1;for(let xe=0,Oe=H.length;xe<Oe;xe++){let Le=H[xe],{object:Ce,geometry:Ye,material:te,group:Ke}=Le;if(te.side===xn&&Ce.layers.test(Y.layers)){let Me=te.side;te.side=dn,te.needsUpdate=!0,uo(Ce,et,Y,Ye,te,Ke),te.side=Me,te.needsUpdate=!0,$t=!0}}$t===!0&&(Pt.updateMultisampleRenderTarget(Ut),Pt.updateRenderTargetMipmap(Ut))}I.setRenderTarget(kt,Wt,Yt),I.setClearColor(Z,ot),ge!==void 0&&(Y.viewport=ge),I.toneMapping=Xt}function Si(E,H,et){let Y=H.isScene===!0?H.overrideMaterial:null;for(let J=0,Ut=E.length;J<Ut;J++){let jt=E[J],{object:kt,geometry:Wt,group:Yt}=jt,Xt=jt.material;Xt.allowOverride===!0&&Y!==null&&(Xt=Y),kt.layers.test(et.layers)&&uo(kt,H,et,Wt,Xt,Yt)}}function uo(E,H,et,Y,J,Ut){O!==null&&J.isNodeMaterial&&O.setObject(E,J),E.onBeforeRender(I,H,et,Y,J,Ut),E.modelViewMatrix.multiplyMatrices(et.matrixWorldInverse,E.matrixWorld),E.normalMatrix.getNormalMatrix(E.modelViewMatrix),J.onBeforeRender(I,H,et,Y,E,Ut),J.transparent===!0&&J.side===xn&&J.forceSinglePass===!1?(J.side=dn,J.needsUpdate=!0,I.renderBufferDirect(et,H,Y,J,E,Ut),J.side=Kn,J.needsUpdate=!0,I.renderBufferDirect(et,H,Y,J,E,Ut),J.side=xn):I.renderBufferDirect(et,H,Y,J,E,Ut),E.onAfterRender(I,H,et,Y,J,Ut)}function fs(E){let H=0;for(let et of E)et.texture!==null&&H++;return H}function bi(E,H,et){H.isScene!==!0&&(H=Zt);let Y=At.get(E),J=A.state.lights,Ut=A.state.shadowsArray,jt=J.state.version,kt=it.getParameters(E,J.state,Ut,H,et,A.state.lightProbeGridArray),Wt=it.getProgramCacheKey(kt),Yt=Y.programs;Y.environment=E.isMeshStandardMaterial||E.isMeshLambertMaterial||E.isMeshPhongMaterial?H.environment:null,Y.fog=H.fog;let Xt=E.isMeshStandardMaterial||E.isMeshLambertMaterial&&!E.envMap||E.isMeshPhongMaterial&&!E.envMap;Y.envMap=C.get(E.envMap||Y.environment,Xt),Y.envMapRotation=Y.environment!==null&&E.envMap===null?H.environmentRotation:E.envMapRotation,Yt===void 0&&(E.addEventListener("dispose",Re),Yt=new Map,Y.programs=Yt,Y.programVariants=new Map);let ge=Yt.get(Wt);if(ge!==void 0){if(Y.currentProgram===ge&&Y.lightsStateVersion===jt)return po(E,kt),ge}else kt.uniforms=it.getUniforms(E),O!==null&&E.isNodeMaterial&&O.build(E,et,kt),E.onBeforeCompile(kt,I),ge=it.acquireProgram(kt,Wt),Yt.set(Wt,ge),Y.uniforms=kt.uniforms;let $t=Y.uniforms;return(!E.isShaderMaterial&&!E.isRawShaderMaterial||E.clipping===!0)&&($t.clippingPlanes=at.uniform),po(E,kt),Y.needsLights=js(E),Y.lightsStateVersion=jt,Y.needsLights&&($t.ambientLightColor.value=J.state.ambient,$t.lightProbe.value=J.state.probe,$t.sunLights.value=J.state.sun,$t.sunLightShadows.value=J.state.sunShadow,$t.directionalLights.value=J.state.directional,$t.directionalLightShadows.value=J.state.directionalShadow,$t.spotLights.value=J.state.spot,$t.spotLightShadows.value=J.state.spotShadow,$t.rectAreaLights.value=J.state.rectArea,$t.ltc_1.value=J.state.rectAreaLTC1,$t.ltc_2.value=J.state.rectAreaLTC2,$t.pointLights.value=J.state.point,$t.pointLightShadows.value=J.state.pointShadow,$t.hemisphereLights.value=J.state.hemi,$t.sunShadowMatrix.value=J.state.sunShadowMatrix,$t.sunShadowCascade.value=J.state.sunShadowCascade,$t.directionalShadowMatrix.value=J.state.directionalShadowMatrix,$t.spotLightMatrix.value=J.state.spotLightMatrix,$t.spotLightMap.value=J.state.spotLightMap,$t.pointShadowMatrix.value=J.state.pointShadowMatrix),Y.numLightProbeGrids=fs(A.state.lightProbeGridArray),Y.currentProgram=ge,Y.uniformsList=null,ge}function wi(E,H,et,Y,J){let Ut=At.get(E),jt=Ut.currentProgram.id+","+Y+","+J,kt=Ut.programVariants.get(jt);return kt===void 0?(kt=bi(E,H,et),Ut.programVariants.set(jt,kt)):(Ut.currentProgram=kt,Ut.uniformsList=null,Ut.outputColorSpace=Y,Ut.toneMapping=J),kt}function fo(E){if(E.uniformsList===null){let H=E.currentProgram.getUniforms();E.uniformsList=Ys.seqWithValue(H.seq,E.uniforms)}return E.uniformsList}function po(E,H){let et=At.get(E);et.outputColorSpace=H.outputColorSpace,et.batching=H.batching,et.batchingColor=H.batchingColor,et.instancing=H.instancing,et.instancingColor=H.instancingColor,et.instancingMorph=H.instancingMorph,et.skinning=H.skinning,et.morphTargets=H.morphTargets,et.morphNormals=H.morphNormals,et.morphColors=H.morphColors,et.morphTargetsCount=H.morphTargetsCount,et.numClippingPlanes=H.numClippingPlanes,et.numIntersection=H.numClipIntersection,et.vertexAlphas=H.vertexAlphas,et.vertexTangents=H.vertexTangents,et.toneMapping=H.toneMapping}function Vl(E,H,et,Y,J){H.isScene!==!0&&(H=Zt),Pt.resetTextureUnits();let Ut=H.fog,jt=Y.isMeshStandardMaterial||Y.isMeshLambertMaterial||Y.isMeshPhongMaterial?H.environment:null,kt=W===null?I.outputColorSpace:W.isXRRenderTarget===!0?W.texture.colorSpace:Se.workingColorSpace,Wt=Y.isMeshStandardMaterial||Y.isMeshLambertMaterial&&!Y.envMap||Y.isMeshPhongMaterial&&!Y.envMap,Yt=C.get(Y.envMap||jt,Wt),Xt=Y.vertexColors===!0&&!!et.attributes.color&&et.attributes.color.itemSize===4,ge=!!et.attributes.tangent&&(!!Y.normalMap||Y.anisotropy>0),$t=!!et.morphAttributes.position,xe=!!et.morphAttributes.normal,Oe=!!et.morphAttributes.color,Le=Qn;Y.toneMapped&&(W===null||W.isXRRenderTarget===!0)&&(Le=I.toneMapping);let Ce=et.morphAttributes.position||et.morphAttributes.normal||et.morphAttributes.color,Ye=Ce!==void 0?Ce.length:0,te=At.get(Y),Ke=A.state.lights;if(ht===!0&&(dt===!0||E!==X)){let Ie=E===X&&Y.id===U;at.setState(Y,E,Ie)}let Me=!1,si=!1;Y.version===te.__version?te.needsLights&&te.lightsStateVersion!==Ke.state.version||J.isBatchedMesh&&te.batching===!1||!J.isBatchedMesh&&te.batching===!0||J.isBatchedMesh&&te.batchingColor===!0&&J._colorsTexture===null||J.isBatchedMesh&&te.batchingColor===!1&&J._colorsTexture!==null||J.isInstancedMesh&&te.instancing===!1||!J.isInstancedMesh&&te.instancing===!0||J.isSkinnedMesh&&te.skinning===!1||!J.isSkinnedMesh&&te.skinning===!0||J.isInstancedMesh&&te.instancingColor===!0&&J.instanceColor===null||J.isInstancedMesh&&te.instancingColor===!1&&J.instanceColor!==null||J.isInstancedMesh&&te.instancingMorph===!0&&J.morphTexture===null||J.isInstancedMesh&&te.instancingMorph===!1&&J.morphTexture!==null||te.envMap!==Yt||Y.fog===!0&&te.fog!==Ut||te.numClippingPlanes!==void 0&&(te.numClippingPlanes!==at.numPlanes||te.numIntersection!==at.numIntersection)||te.vertexAlphas!==Xt||te.vertexTangents!==ge||te.morphTargets!==$t||te.morphNormals!==xe||te.morphColors!==Oe||te.morphTargetsCount!==Ye||te.numLightProbeGrids!==fs(A.state.lightProbeGridArray)?Me=!0:(te.outputColorSpace!==kt||te.toneMapping!==Le)&&(si=!0):(Me=!0,te.__version=Y.version);let Qe=te.currentProgram;(Me===!0||si===!0)&&(Qe=si===!0?wi(Y,H,J,kt,Le):bi(Y,H,J),O&&Y.isNodeMaterial&&O.onUpdateProgram(Y,Qe,te));let ki=!1,Nn=!1,Hn=!1,pe=Qe.getUniforms(),ke=te.uniforms;if(ut.useProgram(Qe.program)&&(ki=!0,Nn=!0,Hn=!0),Y.id!==U&&(U=Y.id,Nn=!0),ki||X!==E){ut.buffers.depth.getReversed()&&E.reversedDepth!==!0&&(E._reversedDepth=!0,E.updateProjectionMatrix()),pe.setValue(D,"projectionMatrix",E.projectionMatrix),pe.setValue(D,"viewMatrix",E.matrixWorldInverse);let He=pe.map.cameraPosition;He!==void 0&&He.setValue(D,Bt.setFromMatrixPosition(E.matrixWorld)),Qt.logarithmicDepthBuffer&&pe.setValue(D,"logDepthBufFC",2/(Math.log(E.far+1)/Math.LN2)),(Y.isMeshPhongMaterial||Y.isMeshToonMaterial||Y.isMeshLambertMaterial||Y.isMeshBasicMaterial||Y.isMeshStandardMaterial||Y.isShaderMaterial)&&pe.setValue(D,"isOrthographic",E.isOrthographicCamera===!0),X!==E&&(X=E,Nn=!0,Hn=!0)}if(te.needsLights&&(Ke.state.sunShadowMap.length>0&&pe.setValue(D,"sunShadowMap",Ke.state.sunShadowMap,Pt),Ke.state.directionalShadowMap.length>0&&pe.setValue(D,"directionalShadowMap",Ke.state.directionalShadowMap,Pt),Ke.state.spotShadowMap.length>0&&pe.setValue(D,"spotShadowMap",Ke.state.spotShadowMap,Pt),Ke.state.pointShadowMap.length>0&&pe.setValue(D,"pointShadowMap",Ke.state.pointShadowMap,Pt)),J.isSkinnedMesh){pe.setOptional(D,J,"bindMatrix"),pe.setOptional(D,J,"bindMatrixInverse");let Ie=J.skeleton;Ie&&(Ie.boneTexture===null&&Ie.computeBoneTexture(),pe.setValue(D,"boneTexture",Ie.boneTexture,Pt))}J.isBatchedMesh&&(pe.setOptional(D,J,"batchingTexture"),pe.setValue(D,"batchingTexture",J._matricesTexture,Pt),pe.setOptional(D,J,"batchingIdTexture"),pe.setValue(D,"batchingIdTexture",J._indirectTexture,Pt),pe.setOptional(D,J,"batchingColorTexture"),J._colorsTexture!==null&&pe.setValue(D,"batchingColorTexture",J._colorsTexture,Pt));let Ve=et.morphAttributes;if((Ve.position!==void 0||Ve.normal!==void 0||Ve.color!==void 0)&&ct.update(J,et,Qe),(Nn||te.receiveShadow!==J.receiveShadow)&&(te.receiveShadow=J.receiveShadow,pe.setValue(D,"receiveShadow",J.receiveShadow)),(Y.isMeshStandardMaterial||Y.isMeshLambertMaterial||Y.isMeshPhongMaterial)&&Y.envMap===null&&H.environment!==null&&(ke.envMapIntensity.value=H.environmentIntensity),ke.dfgLUT!==void 0&&(ke.dfgLUT.value=hv()),Nn){if(pe.setValue(D,"toneMappingExposure",I.toneMappingExposure),te.needsLights&&Hl(ke,Hn),Ut&&Y.fog===!0&&St.refreshFogUniforms(ke,Ut),St.refreshMaterialUniforms(ke,Y,tt,Gt,A.state.transmissionRenderTarget[E.id]),te.needsLights&&te.numLightProbeGrids>0){let Ie=y,He=0;for(let be of A.state.lightProbeGridArray)be.texture!==null&&(Ie.textures[He]=be.texture,Ie.min[He]=be.boundingBox.min,Ie.max[He]=be.boundingBox.max,Ie.resolution[He]=be.resolution,He++);for(let be in Ie)Ie[be].length=He;ke.probesSH.value=Ie.textures,ke.probesMin.value=Ie.min,ke.probesMax.value=Ie.max,ke.probesResolution.value=Ie.resolution}Ys.upload(D,fo(te),ke,Pt)}if(Y.isShaderMaterial&&Y.uniformsNeedUpdate===!0&&(Ys.upload(D,fo(te),ke,Pt),Y.uniformsNeedUpdate=!1),Y.isSpriteMaterial&&pe.setValue(D,"center",J.center),pe.setValue(D,"modelViewMatrix",J.modelViewMatrix),pe.setValue(D,"normalMatrix",J.normalMatrix),pe.setValue(D,"modelMatrix",J.matrixWorld),Y.uniformsGroups!==void 0){let Ie=Y.uniformsGroups;for(let He=0,be=Ie.length;He<be;He++){let ri=Ie[He];ie.update(ri,Qe),ie.bind(ri,Qe)}}return Qe}function Hl(E,H){E.ambientLightColor.needsUpdate=H,E.lightProbe.needsUpdate=H,E.sunLights.needsUpdate=H,E.sunLightShadows.needsUpdate=H,E.directionalLights.needsUpdate=H,E.directionalLightShadows.needsUpdate=H,E.pointLights.needsUpdate=H,E.pointLightShadows.needsUpdate=H,E.spotLights.needsUpdate=H,E.spotLightShadows.needsUpdate=H,E.rectAreaLights.needsUpdate=H,E.hemisphereLights.needsUpdate=H}function js(E){return E.isMeshLambertMaterial||E.isMeshToonMaterial||E.isMeshPhongMaterial||E.isMeshStandardMaterial||E.isShadowMaterial||E.isShaderMaterial&&E.lights===!0}this.getActiveCubeFace=function(){return k},this.getActiveMipmapLevel=function(){return L},this.getRenderTarget=function(){return W},this.setRenderTargetTextures=function(E,H,et){let Y=At.get(E);Y.__autoAllocateDepthBuffer=E.resolveDepthBuffer===!1,Y.__autoAllocateDepthBuffer===!1&&(Y.__useRenderToTexture=!1),At.get(E.texture).__webglTexture=H,At.get(E.depthTexture).__webglTexture=Y.__autoAllocateDepthBuffer?void 0:et,Y.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(E,H){let et=At.get(E);et.__webglFramebuffer=H,et.__useDefaultFramebuffer=H===void 0},this.setRenderTarget=function(E,H=0,et=0){W=E,k=H,L=et;let Y=null,J=!1,Ut=!1;if(E){let kt=At.get(E);if(kt.__useDefaultFramebuffer!==void 0){ut.bindFramebuffer(D.FRAMEBUFFER,kt.__webglFramebuffer),j.copy(E.viewport),_t.copy(E.scissor),Dt=E.scissorTest,ut.viewport(j),ut.scissor(_t),ut.setScissorTest(Dt),U=-1;return}else if(kt.__webglFramebuffer===void 0)Pt.setupRenderTarget(E);else if(kt.__hasExternalTextures)Pt.rebindTextures(E,At.get(E.texture).__webglTexture,At.get(E.depthTexture).__webglTexture);else if(E.depthBuffer){let Xt=E.depthTexture;if(kt.__boundDepthTexture!==Xt){if(Xt!==null&&At.has(Xt)&&(E.width!==Xt.image.width||E.height!==Xt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");Pt.setupDepthRenderbuffer(E)}}let Wt=E.texture;(Wt.isData3DTexture||Wt.isDataArrayTexture||Wt.isCompressedArrayTexture)&&(Ut=!0);let Yt=At.get(E).__webglFramebuffer;E.isWebGLCubeRenderTarget?(Array.isArray(Yt[H])?Y=Yt[H][et]:Y=Yt[H],J=!0):E.samples>0&&Pt.useMultisampledRTT(E)===!1?Y=At.get(E).__webglMultisampledFramebuffer:Array.isArray(Yt)?Y=Yt[et]:Y=Yt,j.copy(E.viewport),_t.copy(E.scissor),Dt=E.scissorTest}else j.copy(lt).multiplyScalar(tt).floor(),_t.copy(ee).multiplyScalar(tt).floor(),Dt=gt;if(et!==0&&(Y=V),ut.bindFramebuffer(D.FRAMEBUFFER,Y)&&ut.drawBuffers(E,Y),ut.viewport(j),ut.scissor(_t),ut.setScissorTest(Dt),J){let kt=At.get(E.texture);D.framebufferTexture2D(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_CUBE_MAP_POSITIVE_X+H,kt.__webglTexture,et)}else if(Ut){let kt=H;for(let Wt=0;Wt<E.textures.length;Wt++){let Yt=At.get(E.textures[Wt]);D.framebufferTextureLayer(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0+Wt,Yt.__webglTexture,et,kt)}}else if(E!==null&&et!==0){let kt=At.get(E.texture);D.framebufferTexture2D(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_2D,kt.__webglTexture,et)}U=-1};function Ai(E){let H=At.get(E);return(H.__readFormat!==E.format||H.__readType!==E.type)&&(H.__readFormat=E.format,H.__readType=E.type,H.__formatReadable=Qt.textureFormatReadable(E.format),H.__typeReadable=Qt.textureTypeReadable(E.type)),H}this.readRenderTargetPixels=function(E,H,et,Y,J,Ut,jt,kt=0){if(!(E&&E.isWebGLRenderTarget)){ce("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Wt=At.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&jt!==void 0&&(Wt=Wt[jt],Array.isArray(Wt)&&(Wt=Wt[0])),Wt){ut.bindFramebuffer(D.FRAMEBUFFER,Wt);try{let Yt=E.textures[kt],Xt=Yt.format,ge=Yt.type;E.textures.length>1&&D.readBuffer(D.COLOR_ATTACHMENT0+kt);let $t=Ai(Yt);if($t.__formatReadable===!1){ce("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if($t.__typeReadable===!1){ce("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}H>=0&&H<=E.width-Y&&et>=0&&et<=E.height-J&&D.readPixels(H,et,Y,J,Rt.convert(Xt),Rt.convert(ge),Ut)}finally{let Yt=W!==null?At.get(W).__webglFramebuffer:null;ut.bindFramebuffer(D.FRAMEBUFFER,Yt)}}},this.readRenderTargetPixelsAsync=async function(E,H,et,Y,J,Ut,jt,kt=0){if(!(E&&E.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Wt=At.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&jt!==void 0&&(Wt=Wt[jt],Array.isArray(Wt)&&(Wt=Wt[0])),Wt)if(H>=0&&H<=E.width-Y&&et>=0&&et<=E.height-J){ut.bindFramebuffer(D.FRAMEBUFFER,Wt);let Yt=E.textures[kt],Xt=Yt.format,ge=Yt.type;E.textures.length>1&&D.readBuffer(D.COLOR_ATTACHMENT0+kt);let $t=Ai(Yt);if($t.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if($t.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let xe=D.createBuffer();D.bindBuffer(D.PIXEL_PACK_BUFFER,xe),D.bufferData(D.PIXEL_PACK_BUFFER,Ut.byteLength,D.STREAM_READ),D.readPixels(H,et,Y,J,Rt.convert(Xt),Rt.convert(ge),0),D.bindBuffer(D.PIXEL_PACK_BUFFER,null);let Oe=W!==null?At.get(W).__webglFramebuffer:null;ut.bindFramebuffer(D.FRAMEBUFFER,Oe);let Le=D.fenceSync(D.SYNC_GPU_COMMANDS_COMPLETE,0);return D.flush(),await ff(D,Le,4),D.bindBuffer(D.PIXEL_PACK_BUFFER,xe),D.getBufferSubData(D.PIXEL_PACK_BUFFER,0,Ut),D.bindBuffer(D.PIXEL_PACK_BUFFER,null),D.deleteBuffer(xe),D.deleteSync(Le),Ut}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(E,H=null,et=0){let Y=Math.pow(2,-et),J=Math.floor(E.image.width*Y),Ut=Math.floor(E.image.height*Y),jt=H!==null?H.x:0,kt=H!==null?H.y:0;Pt.setTexture2D(E,0),D.copyTexSubImage2D(D.TEXTURE_2D,et,0,0,jt,kt,J,Ut),ut.unbindTexture()},this.copyTextureToTexture=function(E,H,et=null,Y=null,J=0,Ut=0){let jt,kt,Wt,Yt,Xt,ge,$t,xe,Oe,Le=E.isCompressedTexture?E.mipmaps[Ut]:E.image;if(et!==null)jt=et.max.x-et.min.x,kt=et.max.y-et.min.y,Wt=et.isBox3?et.max.z-et.min.z:1,Yt=et.min.x,Xt=et.min.y,ge=et.isBox3?et.min.z:0;else{let pe=Math.pow(2,-J);jt=Math.floor(Le.width*pe),kt=Math.floor(Le.height*pe),E.isDataArrayTexture?Wt=Le.depth:E.isData3DTexture?Wt=Math.floor(Le.depth*pe):Wt=1,Yt=0,Xt=0,ge=0}Y!==null?($t=Y.x,xe=Y.y,Oe=Y.z):($t=0,xe=0,Oe=0);let Ce=Rt.convert(H.format),Ye=Rt.convert(H.type),te;H.isData3DTexture?(Pt.setTexture3D(H,0),te=D.TEXTURE_3D):H.isDataArrayTexture||H.isCompressedArrayTexture?(Pt.setTexture2DArray(H,0),te=D.TEXTURE_2D_ARRAY):(Pt.setTexture2D(H,0),te=D.TEXTURE_2D),ut.activeTexture(D.TEXTURE0),ut.pixelStorei(D.UNPACK_FLIP_Y_WEBGL,H.flipY),ut.pixelStorei(D.UNPACK_PREMULTIPLY_ALPHA_WEBGL,H.premultiplyAlpha),ut.pixelStorei(D.UNPACK_ALIGNMENT,H.unpackAlignment);let Ke=ut.getParameter(D.UNPACK_ROW_LENGTH),Me=ut.getParameter(D.UNPACK_IMAGE_HEIGHT),si=ut.getParameter(D.UNPACK_SKIP_PIXELS),Qe=ut.getParameter(D.UNPACK_SKIP_ROWS),ki=ut.getParameter(D.UNPACK_SKIP_IMAGES);ut.pixelStorei(D.UNPACK_ROW_LENGTH,Le.width),ut.pixelStorei(D.UNPACK_IMAGE_HEIGHT,Le.height),ut.pixelStorei(D.UNPACK_SKIP_PIXELS,Yt),ut.pixelStorei(D.UNPACK_SKIP_ROWS,Xt),ut.pixelStorei(D.UNPACK_SKIP_IMAGES,ge);let Nn=E.isDataArrayTexture||E.isData3DTexture,Hn=H.isDataArrayTexture||H.isData3DTexture;if(E.isDepthTexture){let pe=At.get(E),ke=At.get(H),Ve=At.get(pe.__renderTarget),Ie=At.get(ke.__renderTarget);ut.bindFramebuffer(D.READ_FRAMEBUFFER,Ve.__webglFramebuffer),ut.bindFramebuffer(D.DRAW_FRAMEBUFFER,Ie.__webglFramebuffer);for(let He=0;He<Wt;He++)Nn&&(D.framebufferTextureLayer(D.READ_FRAMEBUFFER,D.COLOR_ATTACHMENT0,At.get(E).__webglTexture,J,ge+He),D.framebufferTextureLayer(D.DRAW_FRAMEBUFFER,D.COLOR_ATTACHMENT0,At.get(H).__webglTexture,Ut,Oe+He)),D.blitFramebuffer(Yt,Xt,Yt+jt,Xt+kt,$t,xe,$t+jt,xe+kt,D.DEPTH_BUFFER_BIT,D.NEAREST);ut.bindFramebuffer(D.READ_FRAMEBUFFER,null),ut.bindFramebuffer(D.DRAW_FRAMEBUFFER,null)}else if(J!==0||E.isRenderTargetTexture||At.has(E)){let pe=At.get(E),ke=At.get(H);ut.bindFramebuffer(D.READ_FRAMEBUFFER,R),ut.bindFramebuffer(D.DRAW_FRAMEBUFFER,B);for(let Ve=0;Ve<Wt;Ve++)Nn?D.framebufferTextureLayer(D.READ_FRAMEBUFFER,D.COLOR_ATTACHMENT0,pe.__webglTexture,J,ge+Ve):D.framebufferTexture2D(D.READ_FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_2D,pe.__webglTexture,J),Hn?D.framebufferTextureLayer(D.DRAW_FRAMEBUFFER,D.COLOR_ATTACHMENT0,ke.__webglTexture,Ut,Oe+Ve):D.framebufferTexture2D(D.DRAW_FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_2D,ke.__webglTexture,Ut),J!==0?D.blitFramebuffer(Yt,Xt,Yt+jt,Xt+kt,$t,xe,$t+jt,xe+kt,D.COLOR_BUFFER_BIT,D.NEAREST):Hn?D.copyTexSubImage3D(te,Ut,$t,xe,Oe+Ve,Yt,Xt,jt,kt):D.copyTexSubImage2D(te,Ut,$t,xe,Yt,Xt,jt,kt);ut.bindFramebuffer(D.READ_FRAMEBUFFER,null),ut.bindFramebuffer(D.DRAW_FRAMEBUFFER,null)}else Hn?E.isDataTexture||E.isData3DTexture?D.texSubImage3D(te,Ut,$t,xe,Oe,jt,kt,Wt,Ce,Ye,Le.data):H.isCompressedArrayTexture?D.compressedTexSubImage3D(te,Ut,$t,xe,Oe,jt,kt,Wt,Ce,Le.data):D.texSubImage3D(te,Ut,$t,xe,Oe,jt,kt,Wt,Ce,Ye,Le):E.isDataTexture?D.texSubImage2D(D.TEXTURE_2D,Ut,$t,xe,jt,kt,Ce,Ye,Le.data):E.isCompressedTexture?D.compressedTexSubImage2D(D.TEXTURE_2D,Ut,$t,xe,Le.width,Le.height,Ce,Le.data):D.texSubImage2D(D.TEXTURE_2D,Ut,$t,xe,jt,kt,Ce,Ye,Le);ut.pixelStorei(D.UNPACK_ROW_LENGTH,Ke),ut.pixelStorei(D.UNPACK_IMAGE_HEIGHT,Me),ut.pixelStorei(D.UNPACK_SKIP_PIXELS,si),ut.pixelStorei(D.UNPACK_SKIP_ROWS,Qe),ut.pixelStorei(D.UNPACK_SKIP_IMAGES,ki),Ut===0&&H.generateMipmaps===!0&&H.mipmapsAutoUpdate===!0&&D.generateMipmap(te),ut.unbindTexture()},this.initRenderTarget=function(E){At.get(E).__webglFramebuffer===void 0&&Pt.setupRenderTarget(E)},this.initTexture=function(E){E.isCubeTexture?Pt.setTextureCube(E,0):E.isData3DTexture?Pt.setTexture3D(E,0):E.isDataArrayTexture||E.isCompressedArrayTexture?Pt.setTexture2DArray(E,0):Pt.setTexture2D(E,0),ut.unbindTexture()},this.resetState=function(){k=0,L=0,W=null,ut.reset(),Ot.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return In}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=Se._getDrawingBufferColorSpace(t),e.unpackColorSpace=Se._getUnpackColorSpace()}};var eo=new G;function Pn(i,t,e,n,s,r){let o=2*Math.PI*s/4,a=Math.max(r-2*s,0),l=Math.PI/4;eo.copy(t),eo[n]=0,eo.normalize();let c=.5*o/(o+a),h=1-eo.angleTo(i)/l;return Math.sign(eo[e])===1?h*c:a/(o+a)+c+c*(1-h)}var Il=class i extends $n{constructor(t=1,e=1,n=1,s=2,r=.1){let o=s*2+1;if(r=Math.min(t/2,e/2,n/2,r),super(1,1,1,o,o,o),this.type="RoundedBoxGeometry",this.parameters={width:t,height:e,depth:n,segments:s,radius:r},o===1)return;let a=this.toNonIndexed();this.index=null,this.attributes.position=a.attributes.position,this.attributes.normal=a.attributes.normal,this.attributes.uv=a.attributes.uv;let l=new G,c=new G,h=new G(t,e,n).divideScalar(2).subScalar(r),f=this.attributes.position.array,d=this.attributes.normal.array,u=this.attributes.uv.array,m=f.length/6,x=new G,p=.5/o;for(let g=0,_=0;g<f.length;g+=3,_+=2)switch(l.fromArray(f,g),c.copy(l),c.x-=Math.sign(c.x)*p,c.y-=Math.sign(c.y)*p,c.z-=Math.sign(c.z)*p,c.normalize(),f[g+0]=h.x*Math.sign(l.x)+c.x*r,f[g+1]=h.y*Math.sign(l.y)+c.y*r,f[g+2]=h.z*Math.sign(l.z)+c.z*r,d[g+0]=c.x,d[g+1]=c.y,d[g+2]=c.z,Math.floor(g/m)){case 0:x.set(1,0,0),u[_+0]=Pn(x,c,"z","y",r,n),u[_+1]=1-Pn(x,c,"y","z",r,e);break;case 1:x.set(-1,0,0),u[_+0]=1-Pn(x,c,"z","y",r,n),u[_+1]=1-Pn(x,c,"y","z",r,e);break;case 2:x.set(0,1,0),u[_+0]=1-Pn(x,c,"x","z",r,t),u[_+1]=Pn(x,c,"z","x",r,n);break;case 3:x.set(0,-1,0),u[_+0]=1-Pn(x,c,"x","z",r,t),u[_+1]=1-Pn(x,c,"z","x",r,n);break;case 4:x.set(0,0,1),u[_+0]=1-Pn(x,c,"x","y",r,t),u[_+1]=1-Pn(x,c,"y","x",r,e);break;case 5:x.set(0,0,-1),u[_+0]=Pn(x,c,"x","y",r,t),u[_+1]=1-Pn(x,c,"y","x",r,e);break}}static fromJSON(t){return new i(t.width,t.height,t.depth,t.segments,t.radius)}};var ed=Object.freeze({x:[0,2,1],y:[1,0,2],z:[2,0,1]}),od=Math.PI*2,nd=40,uv=.55;function ad(i){let t=Number.isFinite(i)?Math.min(1,Math.max(0,i)):1;return Math.min(nd,2/Math.max(t,2/nd))}var Js=(i,t)=>i<0?-Math.pow(-i,t):Math.pow(i,t);function id(i,t){let e=i.length,n=new Float64Array(e);if(e<2)return n;let s=new Float64Array(e-1),r=new Float64Array(e-1);for(let a=0;a<e-1;a++)s[a]=i[a+1]-i[a],r[a]=(t[a+1]-t[a])/s[a];if(e===2)return n[0]=n[1]=r[0],n;for(let a=1;a<e-1;a++)if(r[a-1]*r[a]<=0)n[a]=0;else{let l=2*s[a]+s[a-1],c=s[a]+2*s[a-1];n[a]=(l+c)/(l/r[a-1]+c/r[a])}let o=(a,l,c,h)=>{let f=((2*a+l)*c-a*h)/(a+l);return Math.sign(f)!==Math.sign(c)?f=0:Math.sign(c)!==Math.sign(h)&&Math.abs(f)>Math.abs(3*c)&&(f=3*c),f};return n[0]=o(s[0],s[1],r[0],r[1]),n[e-1]=o(s[e-2],s[e-3],r[e-2],r[e-3]),n}function sd(i,t,e,n,s){let r=i[n+1]-i[n],o=(s-i[n])/r,a=o*o,l=a*o;return(2*l-3*a+1)*t[n]+(l-2*a+o)*r*e[n]+(-2*l+3*a)*t[n+1]+(l-a)*r*e[n+1]}function ld(i){let t=0;for(let e=0;e<i.length;e++){let n=i[e],s=i[(e+1)%i.length];t+=n[0]*s[1]-s[0]*n[1]}return t/2}function fv(i,t,e=[0,0]){let n=i.map(_=>[_[0]-e[0],_[1]-e[1]]);ld(n)<0&&(n=n.reverse());let s=1/0,r=-1/0;for(let _ of n)s=Math.min(s,_[0]),r=Math.max(r,_[0]);let o=(s+r)/2,a=0,l=0,c=1/0;for(let _=0;_<n.length;_++){let M=n[_],y=n[(_+1)%n.length];if((M[0]-o)*(y[0]-o)>0||M[0]===y[0])continue;let T=(o-M[0])/(y[0]-M[0]),A=M[1]+T*(y[1]-M[1]);A<c&&(c=A,a=_,l=T)}let h=n[a],f=n[(a+1)%n.length],d=[h[0]+l*(f[0]-h[0]),h[1]+l*(f[1]-h[1])],u=[d];for(let _=1;_<=n.length;_++)u.push(n[(a+_)%n.length]);u.push(d);let m=[0];for(let _=1;_<u.length;_++)m.push(m[_-1]+Math.hypot(u[_][0]-u[_-1][0],u[_][1]-u[_-1][1]));let x=m[m.length-1]||1,p=new Float64Array(2*t),g=0;for(let _=0;_<t;_++){let M=_/t*x;for(;g<m.length-2&&m[g+1]<M;)g++;let y=m[g+1]-m[g]||1,T=Math.min(1,Math.max(0,(M-m[g])/y));p[2*_]=u[g][0]+T*(u[g+1][0]-u[g][0]),p[2*_+1]=u[g][1]+T*(u[g+1][1]-u[g][1])}return p}function dv(i,t){let e=new Float64Array(2*t),n=i.w/2,s=i.h/2,r=i.pts?fv(i.pts,t,[0,0]):null,o=2/ad(i.round),a=i.top!==void 0&&i.w>0?i.top/i.w:1,l=(i.twist||0)*Math.PI/180,c=Math.cos(l),h=Math.sin(l);for(let f=0;f<t;f++){let d,u;if(r)d=r[2*f],u=r[2*f+1];else{let m=-Math.PI/2+od*f/t;d=n*Js(Math.cos(m),o),u=s*Js(Math.sin(m),o)}if(a!==1&&u>0&&(d*=1+(a-1)*Math.min(1,u/Math.max(s,1e-9))),l){let m=d*c-u*h;u=d*h+u*c,d=m}e[2*f]=(i.c?i.c[0]:0)+d,e[2*f+1]=(i.c?i.c[1]:0)+u}return e}function pv(i,t,e,n=12){let s=i[0],r=i[i.length-1],o=r-s,a=2*(i.length-1)<=t?2:1,l=[];for(let d=0;d<i.length-1;d++){let u=i[d],m=i[d+1],x=Math.max(a,Math.min(24,Math.round((m-u)/o*t)));for(let p=0;p<x;p++)l.push(u+(m-u)*p/x)}l.push(r);for(let[d,,u]of e){let m=n;for(let p=0;p<=m;p++)l.push(d+u*Math.cos(Math.PI*p/m));let x=Math.max(u*.004,o*1e-5);l.push(d-u-x,d+u+x)}let c=l.filter(d=>d>=s&&d<=r).sort((d,u)=>d-u),h=[],f=o*1e-6;for(let d of c)(!h.length||d-h[h.length-1]>f)&&h.push(d);return h}function cd(i,t={}){let e=t.N||40,n=t.M||40,s=ed[i.axis||"x"]||ed.x,r=i.sections,o=r.length,a=r.map(k=>k.s),l=r.map(k=>dv(k,e)),c=new Float64Array(o),h=new Float64Array(o),f=[];for(let k=0;k<e;k++){for(let L=0;L<o;L++)c[L]=l[L][2*k],h[L]=l[L][2*k+1];f.push([id(a,c),id(a,h),Float64Array.from(c),Float64Array.from(h)])}let d=i.arches||[],u=pv(a,n,d,t.archSteps||12),m=u.length,x=new Float32Array(m*e*3),p=new Float64Array(m*e*2),g=0;for(let k=0;k<m;k++){let L=u[k],W=0;for(;W<o-2&&L>a[W+1];)W++;let U=-1/0;for(let[X,j,_t]of d){let Dt=L-X;Math.abs(Dt)<=_t&&(U=Math.max(U,j+Math.sqrt(Math.max(0,_t*_t-Dt*Dt))))}for(let X=0;X<e;X++){let[j,_t,Dt,Z]=f[X],ot=sd(a,Dt,j,W,L),xt=sd(a,Z,_t,W,L);xt<U&&(xt=U);let Gt=[0,0,0];Gt[s[0]]=L,Gt[s[1]]=ot,Gt[s[2]]=xt,x[g*3]=Gt[0],x[g*3+1]=Gt[1],x[g*3+2]=Gt[2],p[g*2]=ot,p[g*2+1]=xt,g++}}let _=[];for(let k=0;k<m-1;k++)for(let L=0;L<e;L++){let W=k*e+L,U=k*e+(L+1)%e,X=(k+1)*e+L,j=(k+1)*e+(L+1)%e;_.push(W,U,j,W,j,X)}let M=[],y=k=>[x[k*3],x[k*3+1],x[k*3+2]],T=k=>{for(let L=0;L<e;L++)M.push(...y(k*e+L),...y(k*e+(L+1)%e))};if(t.ribs!==!1&&!t.edges){let L=(a[o-1]-a[0])*(t.ribGap||.03),W=-1/0;a.forEach((U,X)=>{if(!(X===0||X===o-1)&&(U-W<L||a[o-1]-U<L))return;let _t=0;for(let Dt=1;Dt<m;Dt++)Math.abs(u[Dt]-U)<Math.abs(u[_t]-U)&&(_t=Dt);T(_t),W=U})}else T(0),T(m-1);let A=M.length/3;for(let k of t.edges?[.25,.75]:[.125,.375,.625,.875]){let L=Math.round(k*e)%e;for(let W=0;W<m-1;W++)M.push(...y(W*e+L),...y((W+1)*e+L))}mv(x,m,e,M,Math.cos(35*Math.PI/180));let v=i.cap===void 0?"both":i.cap,b=v==="both"||v==="start",N=v==="both"||v==="end",I=[],P=[],O=m*e;for(let[k,L]of[[b,0],[N,m-1]]){if(!k)continue;let W=[];for(let j=0;j<e;j++)W.push([p[(L*e+j)*2],p[(L*e+j)*2+1]]);let U=gv(W),X=O;for(let j=0;j<e;j++)I.push(...y(L*e+j)),O++;for(let j of U)P.push(X+j[0],X+j[1],X+j[2])}let V=new Float32Array(x.length+I.length);V.set(x,0),V.set(I,x.length);let R=new Uint32Array(_.length+P.length);R.set(_,0),R.set(P,_.length);let B=new Float32Array(M.length/3).fill(1);return B.fill(uv,0,A),{positions:V,indices:R,lines:M,lineWeights:B,skinVertices:m*e,rings:m,ringSize:e}}function mv(i,t,e,n,s){let r=new Float64Array((t-1)*e*3),o=new Uint8Array((t-1)*e);for(let c=0;c<t-1;c++)for(let h=0;h<e;h++){let f=(c*e+h)*3,d=(c*e+(h+1)%e)*3,u=((c+1)*e+h)*3,m=((c+1)*e+(h+1)%e)*3,x=[i[m]-i[f],i[m+1]-i[f+1],i[m+2]-i[f+2]],p=[i[u]-i[d],i[u+1]-i[d+1],i[u+2]-i[d+2]],g=[x[1]*p[2]-x[2]*p[1],x[2]*p[0]-x[0]*p[2],x[0]*p[1]-x[1]*p[0]],_=Math.hypot(g[0],g[1],g[2]),M=c*e+h,y=Math.hypot(...x)*Math.hypot(...p);_>1e-9*Math.max(y,1e-12)&&_>0&&(r[M*3]=g[0]/_,r[M*3+1]=g[1]/_,r[M*3+2]=g[2]/_,o[M]=1)}let a=(c,h)=>r[c*3]*r[h*3]+r[c*3+1]*r[h*3+1]+r[c*3+2]*r[h*3+2],l=(c,h)=>n.push(i[c*3],i[c*3+1],i[c*3+2],i[h*3],i[h*3+1],i[h*3+2]);for(let c=0;c<t-1;c++)for(let h=0;h<e;h++){let f=c*e+h;if(!o[f])continue;let d=c*e+(h+1)%e;if(o[d]&&a(f,d)<s&&l(c*e+(h+1)%e,(c+1)*e+(h+1)%e),c<t-2){let u=(c+1)*e+h;o[u]&&a(f,u)<s&&l((c+1)*e+h,(c+1)*e+(h+1)%e)}}}function gv(i){let t=i.length;if(t<3)return[];let e=[];for(let c=0;c<t;c++)e.push(c);let s=ld(i)>=0?1:-1,r=(c,h,f)=>(i[h][0]-i[c][0])*(i[f][1]-i[c][1])-(i[h][1]-i[c][1])*(i[f][0]-i[c][0]),o=(c,h,f,d)=>{let u=r(h,f,c)*s,m=r(f,d,c)*s,x=r(d,h,c)*s;return u>0&&m>0&&x>0},a=[],l=0;for(;e.length>3&&l++<t*t;){let c=!1;for(let h=0;h<e.length;h++){let f=e[(h+e.length-1)%e.length],d=e[h],u=e[(h+1)%e.length],m=r(f,d,u)*s;if(m<0)continue;if(m===0){e.splice(h,1),c=!0;break}let x=!0;for(let p of e)if(!(p===f||p===d||p===u)&&o(p,f,d,u)){x=!1;break}if(x){a.push([f,d,u]),e.splice(h,1),c=!0;break}}if(!c)break}if(e.length===3)a.push([e[0],e[1],e[2]]);else if(e.length>3)for(let c=1;c<e.length-1;c++)a.push([e[0],e[c],e[c+1]]);return a}function hd(i,t,e={}){let n=e.around||32,s=e.rows||16,r=2/ad(t),[o,a,l]=i.map(x=>x/2),c=new Float32Array((s+1)*n*3),h=0;for(let x=0;x<=s;x++){let p=-Math.PI/2+Math.PI*x/s,g=Js(Math.cos(p),r),_=Js(Math.sin(p),r);for(let M=0;M<n;M++){let y=od*M/n;c[h++]=o*g*Js(Math.cos(y),r),c[h++]=a*_,c[h++]=l*g*Js(Math.sin(y),r)}}let f=[];for(let x=0;x<s;x++)for(let p=0;p<n;p++){let g=x*n+p,_=x*n+(p+1)%n,M=(x+1)*n+p,y=(x+1)*n+(p+1)%n;x>0&&f.push(g,_,y),x<s-1&&f.push(g,y,M)}let d=[],u=x=>[c[x*3],c[x*3+1],c[x*3+2]],m=s/2;for(let x=0;x<n;x++)d.push(...u(m*n+x),...u(m*n+(x+1)%n));for(let x of[0,n/4,n/2,3*n/4])for(let p=0;p<s;p++)d.push(...u(p*n+x),...u((p+1)*n+x));return{positions:c,indices:Uint32Array.from(f),lines:d}}function ud(i,t=8,e=70){let n=i.length;if(n<3)return{points:i.map(h=>h.slice()),corners:[0,n-1]};let s=Math.cos(e*Math.PI/180),r=h=>{if(h===0||h===n-1)return!0;let f=i[h-1],d=i[h],u=i[h+1],m=[d[0]-f[0],d[1]-f[1]],x=[u[0]-d[0],u[1]-d[1]],p=Math.hypot(m[0],m[1]),g=Math.hypot(x[0],x[1]);return p<1e-12||g<1e-12?!0:(m[0]*x[0]+m[1]*x[1])/(p*g)<s},o=[i[0].slice()],a=[0],l=[0],c=0;for(let h=1;h<n;h++){if(!r(h))continue;let f=i.slice(c,h+1),d=_v(f,t,l,o.length-1);for(let u=1;u<d.length;u++)o.push(d[u]);a.push(o.length-1),c=h}return{points:o,corners:a,given:l}}function rd(i,t,e){let n=[t[0]-i[0],t[1]-i[1]],s=[e[0]-t[0],e[1]-t[1]],r=Math.hypot(n[0],n[1])*Math.hypot(s[0],s[1]);return r<1e-18?0:Math.acos(Math.max(-1,Math.min(1,(n[0]*s[0]+n[1]*s[1])/r)))*180/Math.PI}function _v(i,t,e=null,n=0){if(i.length===2)return e&&e.push(n+1),[i[0].slice(),i[1].slice()];let s=[[2*i[0][0]-i[1][0],2*i[0][1]-i[1][1]],...i,[2*i[i.length-1][0]-i[i.length-2][0],2*i[i.length-1][1]-i[i.length-2][1]]],r=[i[0].slice()];for(let o=1;o<s.length-2;o++){let a=s[o-1],l=s[o],c=s[o+1],h=s[o+2],f=(rd(a,l,c)+rd(l,c,h))/2,d=Math.max(1,Math.min(t,Math.ceil(f/9))),u=(_,M)=>Math.max(1e-9,Math.sqrt(Math.hypot(M[0]-_[0],M[1]-_[1]))),m=0,x=m+u(a,l),p=x+u(l,c),g=p+u(c,h);for(let _=1;_<=d;_++){let M=x+(p-x)*_/d,y=(I,P,O,V)=>[((V-M)*I[0]+(M-O)*P[0])/(V-O),((V-M)*I[1]+(M-O)*P[1])/(V-O)],T=y(a,l,m,x),A=y(l,c,x,p),v=y(c,h,p,g),b=y(T,A,m,p),N=y(A,v,x,g);r.push(y(b,N,x,p))}e&&e.push(n+r.length-1)}return r}var fd={coarse:{div:70,voxels:3e4,rounds:1,across:4,tris:7e3},fine:{div:150,voxels:24e4,rounds:3,across:9,tris:3e4}},Pl=Math.PI/180,no=i=>[1,0,0,0,Math.cos(i),-Math.sin(i),0,Math.sin(i),Math.cos(i)],dd=i=>[Math.cos(i),0,Math.sin(i),0,1,0,-Math.sin(i),0,Math.cos(i)],Ul=i=>[Math.cos(i),-Math.sin(i),0,Math.sin(i),Math.cos(i),0,0,0,1],Dl=[1,0,0,0,1,0,0,0,1],xv={y:Dl,"-y":no(Math.PI),x:Ul(-Math.PI/2),"-x":Ul(Math.PI/2),z:no(Math.PI/2),"-z":no(-Math.PI/2)};function Ll(i,t){let e=new Array(9);for(let n=0;n<3;n++)for(let s=0;s<3;s++)e[n*3+s]=i[n*3]*t[s]+i[n*3+1]*t[3+s]+i[n*3+2]*t[6+s];return e}var vd=i=>[i[0],i[3],i[6],i[1],i[4],i[7],i[2],i[5],i[8]];function pd(i,t){if(!Array.isArray(i)||i.length<2)return!1;let e=1/0,n=-1/0;for(let r of i){let o=r[t];o<e&&(e=o),o>n&&(n=o)}let s=Math.max(1e-6,(n-e)*.002);return e>=-s&&Math.abs(e)<=s&&n>s}function Fl(i,t,e){let n=[];for(let s of i)n.push(s[0],s[1]);if(e){let s=0;for(let o of i)s=Math.max(s,Math.abs(o[t]));let r=s*.002+1e-9;for(let o=i.length-1;o>=0;o--){let a=i[o];Math.abs(a[t])<=r||n.push(t===0?-a[0]:a[0],t===1?-a[1]:a[1])}}return Float64Array.from(n)}function vv(i){let t=i.map(([s,r])=>[r,Math.max(0,s)]),e=Math.max(...t.map(s=>s[1])),n=s=>s[1]<=e*.002;return Fl(t,1,n(t[0])||n(t[t.length-1]))}var yv={x:0,y:1,z:2};function is(i){let t=1/0,e=-1/0,n=1/0,s=-1/0;for(let r=0;r<i.length;r+=2)i[r]<t&&(t=i[r]),i[r]>e&&(e=i[r]),i[r+1]<n&&(n=i[r+1]),i[r+1]>s&&(s=i[r+1]);return{u0:t,u1:e,v0:n,v1:s}}var Mv=Math.cos(30*Math.PI/180);function Ol(i,t,e=!0){let n=i.length/2;if(n<3||!(t>0))return i;let s=_=>i[(_%n+n)%n*2],r=_=>i[(_%n+n)%n*2+1],o=_=>Math.hypot(s(_+1)-s(_),r(_+1)-r(_)),a=new Uint8Array(n),l=new Float64Array(n),c=new Float64Array(n);e||(a[0]=1,a[n-1]=1);let h=new Float64Array(n);for(let _=0;_<n;_++){let M=o(_-1),y=o(_);if(M<1e-9||y<1e-9)continue;let T=(s(_)-s(_-1))/M,A=(r(_)-r(_-1))/M,v=(s(_+1)-s(_))/y,b=(r(_+1)-r(_))/y;h[_]=Math.atan2(T*b-A*v,T*v+A*b)}let f=Math.acos(Mv),d=75*Math.PI/180,u=12*Math.PI/180,m=0;{let _=is(i);m=Math.max(_.u1-_.u0,_.v1-_.v0)}let x=(_,M)=>(e||M>0&&M<n-1)&&Math.sign(h[(M%n+n)%n])===Math.sign(h[_])&&Math.abs(h[(M%n+n)%n])>u&&Math.abs(h[(M%n+n)%n])<d,p=_=>o(_-1)<m*.2&&o(_)<m*.2;for(let _=0;_<n;_++){if(a[_])continue;let M=o(_-1),y=o(_);if(M<1e-9||y<1e-9){a[_]=1;continue}let T=Math.abs(h[_]);if(T>d||T>f&&!(p(_)&&(x(_,_-1)||x(_,_+1)))){a[_]=1;continue}let A=(s(_)-s(_-1))/M,v=(r(_)-r(_-1))/M,b=(s(_+1)-s(_))/y,N=(r(_+1)-r(_))/y,I=A*y+b*M,P=v*y+N*M,O=Math.hypot(I,P)||1;l[_]=I/O,c[_]=P/O}let g=[];for(let _=0;_<(e?n:n-1);_++){let M=s(_),y=r(_),T=s(_+1),A=r(_+1),v=o(_);if(v<1e-9)continue;let b=(_+1)%n,N=(T-M)/v,I=(A-y)/v,P=Math.min(v,o(_-1)||v),O=Math.min(v,o(_+1)||v),V=a[_]?N*v:l[_]*P,R=a[_]?I*v:c[_]*P,B=a[b]?N*v:l[b]*O,k=a[b]?I*v:c[b]*O,L=Math.acos(Math.max(-1,Math.min(1,(V*N+R*I)/(Math.hypot(V,R)||1))))+Math.acos(Math.max(-1,Math.min(1,(B*N+k*I)/(Math.hypot(B,k)||1)))),W=a[_]&&a[b]?1:Math.max(1,Math.min(24,Math.ceil(v/t),Math.ceil(L/(6*Math.PI/180))));for(let U=0;U<W;U++){let X=U/W,j=X*X,_t=j*X,Dt=2*_t-3*j+1,Z=_t-2*j+X,ot=-2*_t+3*j,xt=_t-j;g.push(Dt*M+Z*V+ot*T+xt*B,Dt*y+Z*R+ot*A+xt*k)}}return e||g.push(s(n-1),r(n-1)),Float64Array.from(g)}function Nl(i,t,e,n,s,r,o,a=0,l=0){let c=i.length/2,h=new Float32Array(e*s),f=new Float64Array(c+1);for(let d=0;d<s;d++){let u=n+(l+d)*r,m=0;for(let g=0;g<c;g++){let _=i[g*2],M=i[g*2+1],y=(g+1)%c,T=i[y*2],A=i[y*2+1];M>u!=A>u&&(f[m++]=_+(u-M)*(T-_)/(A-M))}let x=Array.from(f.subarray(0,m)).sort((g,_)=>g-_),p=0;for(let g=0;g<e;g++){let _=t+(a+g)*r;for(;p<x.length&&x[p]<_;)p++;let M=(p&1)===1,y=o*o;for(let A=0;A<c;A++){let v=i[A*2],b=i[A*2+1],N=(A+1)%c,I=i[N*2],P=i[N*2+1],O=_<Math.min(v,I)?Math.min(v,I)-_:_>Math.max(v,I)?_-Math.max(v,I):0;if(O*O>=y)continue;let V=u<Math.min(b,P)?Math.min(b,P)-u:u>Math.max(b,P)?u-Math.max(b,P):0;if(O*O+V*V>=y)continue;let R=I-v,B=P-b,k=R*R+B*B,L=k>0?((_-v)*R+(u-b)*B)/k:0;L=L<0?0:L>1?1:L;let W=v+L*R-_,U=b+L*B-u,X=W*W+U*U;X<y&&(y=X)}let T=Math.sqrt(y);h[g+e*d]=M?T:-T}}return h}var $s=class{constructor(t,e,n,s,r,o,a=0,l=0){this.data=t,this.u0=e,this.v0=s,this.i0=a,this.j0=l,this.nu=n,this.nv=r,this.inv=1/o,this.du=0,this.dv=0}at(t,e){let n=this.inv,s=(t-this.u0)*n-this.i0,r=(e-this.v0)*n-this.j0,o=this.nu;s<0?s=0:s>o-1.0001&&(s=o-1.0001),r<0?r=0:r>this.nv-1.0001&&(r=this.nv-1.0001);let a=s|0,l=r|0,c=s-a,h=r-l,f=a+o*l,d=this.data,u=d[f],m=d[f+1],x=d[f+o],p=d[f+o+1];return this.du=((m-u)*(1-h)+(p-x)*h)*n,this.dv=((x-u)*(1-c)+(p-m)*c)*n,(u+(m-u)*c)*(1-h)+(x+(p-x)*c)*h}};function Bi(i,t,e){if(e<=0)return i<t?i:t;let n=e-Math.abs(i-t);return n<=0?i<t?i:t:(i<t?i:t)-n*n/(4*e)}function yd(i){let t=xv[i.axis||"y"]||Dl;(i.type==="box"||i.type==="sphere"||i.type==="hull")&&(t=Dl),Array.isArray(i.rot)&&(t=Ll(Ll(Ll(no(i.rot[0]*Pl),dd(i.rot[1]*Pl)),Ul(i.rot[2]*Pl)),t));let e=i.at||[0,0,0],n=[],s=i.repeat,r=s?s.count:1;for(let o=0;o<r;o++){let a=Dl,l=[0,0,0];if(s&&s.along)l=[s.along[0]*o,s.along[1]*o,s.along[2]*o];else if(s){let f=((s.start||0)+s.step*o)*Pl;a=s.around==="x"?no(f):s.around==="z"?Ul(f):dd(f);let d=s.center||[0,0,0],u=[e[0]-d[0],e[1]-d[1],e[2]-d[2]];l=[a[0]*u[0]+a[1]*u[1]+a[2]*u[2]+d[0]-e[0],a[3]*u[0]+a[4]*u[1]+a[5]*u[2]+d[1]-e[1],a[6]*u[0]+a[7]*u[1]+a[8]*u[2]+d[2]-e[2]]}let c=Ll(a,t),h=[e[0]+l[0],e[1]+l[1],e[2]+l[2]];n.push({inv:vd(c),origin:h,full:c})}return n}function Sv(i){switch(i.type){case"box":{let t=i.size[0]/2,e=i.size[1]/2,n=i.size[2]/2,s=Math.min(i.r||0,t,e,n);return{half:[t,e,n],field(r,o,a){let l=Math.abs(r)-t+s,c=Math.abs(o)-e+s,h=Math.abs(a)-n+s,f=l>0?l:0,d=c>0?c:0,u=h>0?h:0,m=Math.sqrt(f*f+d*d+u*u),x=Math.min(Math.max(l,c,h),0);return-(m+x-s)}}}case"cylinder":{let t=Math.max(i.r,i.r2??i.r),e=i.h/2;return{half:[t,e,t],field(n,s,r){let o=Math.sqrt(n*n+r*r)-t,a=Math.abs(s)-e,l=o>0?o:0,c=a>0?a:0;return-(Math.min(Math.max(o,a),0)+Math.sqrt(l*l+c*c))}}}case"sphere":{let t=i.size?i.size.map(e=>e/2):[i.r,i.r,i.r];return{half:t,field(e,n,s){let r=Math.sqrt((e/t[0])**2+(n/t[1])**2+(s/t[2])**2),o=Math.sqrt((e/(t[0]*t[0]))**2+(n/(t[1]*t[1]))**2+(s/(t[2]*t[2]))**2);return o>0?-(r*(r-1))/o:Math.min(...t)}}}default:return null}}function bv(i,t,e){let n=[];for(let s of Array.isArray(i)?i:[]){let r=Sv(s);if(r)for(let o of yd(s)){if(e&&o.origin[2]<0){let f=o.full;o.full=[f[0],f[1],f[2],f[3],f[4],f[5],-f[6],-f[7],-f[8]],o.origin=[o.origin[0],o.origin[1],-o.origin[2]],o.inv=vd(o.full)}let a=[1/0,1/0,1/0],l=[-1/0,-1/0,-1/0];for(let f of[-1,1])for(let d of[-1,1])for(let u of[-1,1]){let m=[f*r.half[0],d*r.half[1],u*r.half[2]],x=o.full,p=[x[0]*m[0]+x[1]*m[1]+x[2]*m[2]+o.origin[0],x[3]*m[0]+x[4]*m[1]+x[5]*m[2]+o.origin[1],x[6]*m[0]+x[7]*m[1]+x[8]*m[2]+o.origin[2]];for(let g=0;g<3;g++)a[g]=Math.min(a[g],p[g]-t),l[g]=Math.max(l[g],p[g]+t)}let c=o.inv,h=o.origin;n.push({lo:a,hi:l,field(f,d,u){let m=f-h[0],x=d-h[1],p=u-h[2];return r.field(c[0]*m+c[1]*x+c[2]*p,c[3]*m+c[4]*x+c[5]*p,c[6]*m+c[7]*x+c[8]*p)}})}}return n}function io(i){return JSON.stringify([i.side||null,i.top||null,i.front||null,i.revolve||null,i.revolve?i.axis||"y":null,i.r??null,i.mirror?1:0,i.cut||null])}var bh=class{constructor(t,e,n){let s=fd[e]||fd.fine,r=!!(t.top&&pd(t.top,1)),o=!!(t.front&&pd(t.front,0)),a=!!t.mirror||r||o,l=t.side?Fl(t.side,-1,!1):null,c=t.top?Fl(t.top,1,r):null,h=t.front?Fl(t.front,0,o):null,f=Array.isArray(t.revolve)&&t.revolve.length>=2?vv(t.revolve):null,d=String(t.axis||"y"),u=d.startsWith("-")?-1:1,m=yv[d.replace("-","")]??1,x=-1e9,p=1e9,g=-1e9,_=1e9,M=-1e9,y=1e9;if(f){let lt=is(f),ee=u>0?lt.u0:-lt.u1,gt=u>0?lt.u1:-lt.u0,K=[-lt.v1,-lt.v1,-lt.v1],ft=[lt.v1,lt.v1,lt.v1];K[m]=ee,ft[m]=gt,x=K[0],p=ft[0],g=K[1],_=ft[1],M=K[2],y=ft[2]}if(l){let lt=is(l);x=Math.max(x,lt.u0),p=Math.min(p,lt.u1),g=Math.max(g,lt.v0),_=Math.min(_,lt.v1)}if(c){let lt=is(c);x=Math.max(x,lt.u0),p=Math.min(p,lt.u1),M=Math.max(M,lt.v0),y=Math.min(y,lt.v1)}if(h){let lt=is(h);M=Math.max(M,lt.u0),y=Math.min(y,lt.u1),g=Math.max(g,lt.v0),_=Math.min(_,lt.v1)}if(this.ok=p>x&&_>g&&y>M&&![x,p,g,_,M,y].some(lt=>Math.abs(lt)>=1e9),!this.ok)return;let T=!1,A=!1;if(a)if(M>(y-M)*.02||y<-(y-M)*.02)A=!0;else{T=!0;let lt=Math.max(Math.abs(M),Math.abs(y));M=-lt,y=lt}let v=p-x,b=_-g,N=y-M,I=Math.min(v,b,N),P=Math.max(0,Math.min(t.r??I*.04,I*.45)),O=2,V=n>0?n:Math.hypot(v,b,N),R=Math.min(V/s.div,I/s.across),B=Math.min(1,Math.hypot(v,b,N)/V),k=s.tris*Math.max(.08,Math.pow(B,1.5)),L=2*(v*b+b*N+v*N)*.75;R=Math.max(R,Math.sqrt(2*L/k));let W=lt=>(Math.ceil(v/lt)+2*O+1)*(Math.ceil(b/lt)+2*O+1)*(Math.ceil(N/lt)+2*O+1);for(let lt=0;lt<60&&W(R)>s.voxels;lt++)R*=1.06;let U=Math.ceil(v/R)+2*O+1,X=Math.ceil(b/R)+2*O+1,j=Math.ceil(N/R)+2*O+1,_t=(x+p)/2-(U-1)*R/2,Dt=(g+_)/2-(X-1)*R/2,Z=(M+y)/2-(j-1)*R/2,ot=R/2,xt=Math.max(4*P,8*R),Gt=2*U-1,tt=2*X-1,Jt=2*j-1,se=lt=>Ol(lt,R*.75);if(this.S=l?new $s(Nl(se(l),_t,Gt,Dt,tt,ot,xt),_t,Gt,Dt,tt,ot):null,this.T=c?new $s(Nl(se(c),_t,Gt,Z,Jt,ot,xt),_t,Gt,Z,Jt,ot):null,this.F=h?new $s(Nl(se(h),Z,Jt,Dt,tt,ot,xt),Z,Jt,Dt,tt,ot):null,this.R=null,f){let lt=is(f),ee=lt.u0-2*R,gt=Math.ceil((lt.u1-lt.u0+4*R)/ot)+1,K=-2*R,ft=Math.ceil((lt.v1+4*R)/ot)+1,ht=[_t,Dt,Z],dt=[_t+(U-1)*R,Dt+(X-1)*R,Z+(j-1)*R],mt=(m+1)%3,Bt=(m+2)%3,It=u>0?ht[m]:-dt[m],Zt=u>0?dt[m]:-ht[m],Q=(C,w)=>C>0?C:w<0?-w:0,yt=Math.hypot(Q(ht[mt],dt[mt]),Q(ht[Bt],dt[Bt])),D=Math.hypot(Math.max(-ht[mt],dt[mt]),Math.max(-ht[Bt],dt[Bt])),Vt=(C,w,q,vt)=>{let it=Math.max(0,Math.min(vt-2,Math.floor((C-2*R-q)/ot)));return[it,Math.max(it+1,Math.min(vt-1,Math.ceil((w+2*R-q)/ot)))]},[Nt,Qt]=Vt(It,Zt,ee,gt),[ut,Kt]=Vt(yt,D,K,ft),At=Qt-Nt+1,Pt=Kt-ut+1;this.R=new $s(Nl(se(f),ee,At,K,Pt,ot,xt,Nt,ut),ee,At,K,Pt,ot,Nt,ut),this.ri=m,this.rsign=u}this.kc=P*.6,this.cuts=bv(t.cut,Math.max(this.kc,R),T),Object.assign(this,{L:s,k:P,h:R,fold:T,dup:A,mirror:a,nx:U,ny:X,nz:j,gx:_t,gy:Dt,gz:Z,mx:Gt,my:tt,mz:Jt,pad:O}),this.termCount=4+this.cuts.length,this.box={min:[x,g,M],max:[p,_,y]},this.gx_=0,this.gy_=0,this.gz_=0}rev(t,e,n){let s=[t,e,n],r=this.rsign*s[this.ri],o=(this.ri+1)%3,a=(this.ri+2)%3,l=Math.hypot(s[o],s[a]),c=this.R.at(r,l),h=[0,0,0];return h[this.ri]=this.rsign*this.R.du,l>1e-9&&(h[o]=this.R.dv*s[o]/l,h[a]=this.R.dv*s[a]/l),this.rgx=h[0],this.rgy=h[1],this.rgz=h[2],c}f(t,e,n){let s=this.fold&&n<0?-n:n,r=this.k,o=this.S?this.S.at(t,e):1e9;this.T&&(o=Bi(o,this.T.at(t,s),r)),this.F&&(o=Bi(o,this.F.at(s,e),r)),this.R&&(o=o>=1e9?this.rev(t,e,n):Bi(o,this.rev(t,e,n),r));for(let a=0;a<this.cuts.length;a++){let l=this.cuts[a];t<l.lo[0]||t>l.hi[0]||e<l.lo[1]||e>l.hi[1]||s<l.lo[2]||s>l.hi[2]||(o=Bi(o,-l.field(t,e,s),this.kc))}return o}fg(t,e,n){let s=this.fold&&n<0,r=s?-n:n,o=this.k,a=1e9,l=0,c=0,h=0,f=(u,m,x,p,g)=>{let _=g-Math.abs(a-u);if(g<=0||_<=0){u<a&&(a=u,l=m,c=x,h=p);return}let M=_/(2*g),y=_*_/(4*g);a<=u?(a-=y,l=(1-M)*l+M*m,c=(1-M)*c+M*x,h=(1-M)*h+M*p):(a=u-y,l=(1-M)*m+M*l,c=(1-M)*x+M*c,h=(1-M)*p+M*h)};if(this.S&&(a=this.S.at(t,e),l=this.S.du,c=this.S.dv),this.T){let u=this.T.at(t,r);a>=1e9?(a=u,l=this.T.du,c=0,h=s?-this.T.dv:this.T.dv):f(u,this.T.du,0,s?-this.T.dv:this.T.dv,o)}if(this.F){let u=this.F.at(r,e);a>=1e9?(a=u,l=0,c=this.F.dv,h=s?-this.F.du:this.F.du):f(u,0,this.F.dv,s?-this.F.du:this.F.du,o)}if(this.R){let u=this.rev(t,e,n);a>=1e9?(a=u,l=this.rgx,c=this.rgy,h=this.rgz):f(u,this.rgx,this.rgy,this.rgz,o)}let d=this.h*.25;for(let u=0;u<this.cuts.length;u++){let m=this.cuts[u];if(t<m.lo[0]||t>m.hi[0]||e<m.lo[1]||e>m.hi[1]||r<m.lo[2]||r>m.hi[2])continue;let x=-m.field(t,e,r),p=-(m.field(t+d,e,r)-m.field(t-d,e,r))/(2*d),g=-(m.field(t,e+d,r)-m.field(t,e-d,r))/(2*d),_=-(m.field(t,e,r+d)-m.field(t,e,r-d))/(2*d);s&&(_=-_),f(x,p,g,_,this.kc)}return this.gx_=l,this.gy_=c,this.gz_=h,a}terms(t,e,n,s,r){let o=this.fold&&n<0,a=o?-n:n,l=(h,f,d,u,m)=>{s[h]=f;let x=Math.hypot(d,u,m)||1;r[h*3]=d/x,r[h*3+1]=u/x,r[h*3+2]=m/x};if(this.S?l(0,this.S.at(t,e),this.S.du,this.S.dv,0):l(0,1e9,0,0,0),this.T){let h=this.T.at(t,a);l(1,h,this.T.du,0,o?-this.T.dv:this.T.dv)}else l(1,1e9,0,0,0);if(this.F){let h=this.F.at(a,e);l(2,h,0,this.F.dv,o?-this.F.du:this.F.du)}else l(2,1e9,0,0,0);if(this.R){let h=this.rev(t,e,n);l(3,h,this.rgx,this.rgy,this.rgz)}else l(3,1e9,0,0,0);let c=this.h*.25;for(let h=0;h<this.cuts.length;h++){let f=this.cuts[h],d=-(f.field(t+c,e,a)-f.field(t-c,e,a)),u=-(f.field(t,e+c,a)-f.field(t,e-c,a)),m=-(f.field(t,e,a+c)-f.field(t,e,a-c));o&&(m=-m),l(4+h,-f.field(t,e,a),d,u,m)}}};function wv(i,{level:t="fine",scale:e=0}={}){let n=new bh(i,t,e);return n.ok?n:null}var Av=[0,2,4,6,0,1,4,5,0,1,2,3],Tv=[1,3,5,7,2,3,6,7,4,5,6,7],yi=class{constructor(t,e=4096){this.Type=t,this.a=new t(e),this.n=0}push3(t,e,n){this.n+3>this.a.length&&this.grow(),this.a[this.n++]=t,this.a[this.n++]=e,this.a[this.n++]=n}push4(t,e,n,s){this.n+4>this.a.length&&this.grow(),this.a[this.n++]=t,this.a[this.n++]=e,this.a[this.n++]=n,this.a[this.n++]=s}grow(){let t=new this.Type(this.a.length*2);t.set(this.a),this.a=t}done(){return this.a.slice(0,this.n)}},Ev=Math.cos(24*Math.PI/180),Rv=.32;function wh(i,{level:t="fine",scale:e=0}={}){let n=_d(),s=wv(i,{level:t,scale:e});if(!s)return null;let{nx:r,ny:o,nz:a,gx:l,gy:c,gz:h,h:f,mx:d,mz:u,k:m,kc:x,cuts:p,fold:g,dup:_}=s,M=s.S&&s.S.data,y=s.T&&s.T.data,T=s.F&&s.F.data,A=r*o,v=new Float32Array(A*a);for(let Q=0;Q<a;Q++){let yt=h+Q*f,D=2*Q;g&&yt<0&&(D=Math.round((-yt-h)/(f/2))),D>u-1&&(D=u-1);for(let Vt=0;Vt<o;Vt++){let Nt=r*Vt+A*Q,Qt=2*Vt*d,ut=T?T[D+u*2*Vt]:1e9,Kt=d*D;for(let At=0;At<r;At++){let Pt=M?M[2*At+Qt]:1e9;if(y&&(Pt=Bi(Pt,y[2*At+Kt],m)),T&&(Pt=Bi(Pt,ut,m)),s.R){let C=s.rev(l+At*f,c+Vt*f,yt);Pt=Pt>=1e9?C:Bi(Pt,C,m)}v[Nt+At]=Pt}}}for(let Q of p){let yt=g?[[Q.lo[2],Q.hi[2]],[-Q.hi[2],-Q.lo[2]]]:[[Q.lo[2],Q.hi[2]]],D=Math.max(0,Math.floor((Q.lo[0]-l)/f)),Vt=Math.min(r-1,Math.ceil((Q.hi[0]-l)/f)),Nt=Math.max(0,Math.floor((Q.lo[1]-c)/f)),Qt=Math.min(o-1,Math.ceil((Q.hi[1]-c)/f)),ut=new Set;for(let[Kt,At]of yt){let Pt=Math.max(0,Math.floor((Kt-h)/f)),C=Math.min(a-1,Math.ceil((At-h)/f));for(let w=Pt;w<=C;w++){if(ut.has(w))continue;ut.add(w);let q=h+w*f,vt=g&&q<0?-q:q;for(let it=Nt;it<=Qt;it++){let St=c+it*f,Et=r*it+A*w;for(let st=D;st<=Vt;st++)v[Et+st]=Bi(v[Et+st],-Q.field(l+st*f,St,vt),x)}}}}let b=r-1,N=o-1,I=a-1,P=new Int32Array(b*N*I).fill(-1),O=new yi(Float64Array,32768),V=[0,1,r,r+1,A,A+1,A+r,A+r+1],R=new Float64Array(8),B=0;for(let Q=0;Q<I;Q++)for(let yt=0;yt<N;yt++){let D=r*yt+A*Q;for(let Vt=0;Vt<b;Vt++){let Nt=D+Vt,Qt=0;for(let C=0;C<8;C++){let w=v[Nt+V[C]];R[C]=w,w>0&&(Qt|=1<<C)}if(Qt===0||Qt===255)continue;let ut=0,Kt=0,At=0,Pt=0;for(let C=0;C<12;C++){let w=Av[C],q=Tv[C];if((Qt>>w&1)===(Qt>>q&1))continue;let vt=R[w]/(R[w]-R[q]),it=w&1,St=w>>1&1,Et=w>>2;ut+=it+((q&1)-it)*vt,Kt+=St+((q>>1&1)-St)*vt,At+=Et+((q>>2)-Et)*vt,Pt++}P[Vt+b*(yt+N*Q)]=B++,O.push3(l+(Vt+ut/Pt)*f,c+(yt+Kt/Pt)*f,h+(Q+At/Pt)*f)}}let k=new yi(Int32Array,32768),L=b*N;for(let Q=1;Q<a-1;Q++)for(let yt=1;yt<o-1;yt++)for(let D=1;D<r-1;D++){let Vt=D+r*yt+A*Q,Nt=v[Vt]>0,Qt=D+b*yt+L*Q;if(Nt!==v[Vt+1]>0){let ut=P[Qt-b-L],Kt=P[Qt-L],At=P[Qt],Pt=P[Qt-b];ut>=0&&Kt>=0&&At>=0&&Pt>=0&&(Nt?k.push4(ut,Kt,At,Pt):k.push4(ut,Pt,At,Kt))}if(Nt!==v[Vt+r]>0){let ut=P[Qt-1-L],Kt=P[Qt-1],At=P[Qt],Pt=P[Qt-L];ut>=0&&Kt>=0&&At>=0&&Pt>=0&&(Nt?k.push4(ut,Kt,At,Pt):k.push4(ut,Pt,At,Kt))}if(Nt!==v[Vt+A]>0){let ut=P[Qt-1-b],Kt=P[Qt-b],At=P[Qt],Pt=P[Qt-1];ut>=0&&Kt>=0&&At>=0&&Pt>=0&&(Nt?k.push4(ut,Kt,At,Pt):k.push4(ut,Pt,At,Kt))}}let W=k.done(),U=O.done(),X=B,j=Q=>{let yt=U[Q*3],D=U[Q*3+1],Vt=U[Q*3+2],Nt=s.fg(yt,D,Vt),Qt=s.gx_,ut=s.gy_,Kt=s.gz_,At=Qt*Qt+ut*ut+Kt*Kt;if(At<1e-12)return;let Pt=Nt/At,C=Math.abs(Pt)*Math.sqrt(At);C>f&&(Pt*=f/C),U[Q*3]=yt-Pt*Qt,U[Q*3+1]=D-Pt*ut,U[Q*3+2]=Vt-Pt*Kt},_t=new Float64Array(X*3),Dt=new Uint16Array(X);for(let Q=0;Q<s.L.rounds;Q++){_t.fill(0),Dt.fill(0);for(let yt=0;yt<W.length;yt+=4)for(let D=0;D<4;D++){let Vt=W[yt+D]*3,Nt=W[yt+(D+1&3)]*3;_t[Vt]+=U[Nt],_t[Vt+1]+=U[Nt+1],_t[Vt+2]+=U[Nt+2],_t[Nt]+=U[Vt],_t[Nt+1]+=U[Vt+1],_t[Nt+2]+=U[Vt+2],Dt[Vt/3]++,Dt[Nt/3]++}for(let yt=0;yt<X;yt++){let D=Dt[yt];if(D)for(let Vt=0;Vt<3;Vt++)U[yt*3+Vt]+=.5*(_t[yt*3+Vt]/D-U[yt*3+Vt])}for(let yt=0;yt<X;yt++)j(yt)}if(!s.L.rounds)for(let Q=0;Q<X;Q++)j(Q);let Z=new Float32Array(X*3);for(let Q=0;Q<X;Q++){s.fg(U[Q*3],U[Q*3+1],U[Q*3+2]);let yt=-s.gx_,D=-s.gy_,Vt=-s.gz_,Nt=Math.hypot(yt,D,Vt)||1;Z[Q*3]=yt/Nt,Z[Q*3+1]=D/Nt,Z[Q*3+2]=Vt/Nt}let ot=new Uint32Array(W.length/4*6),xt=0;for(let Q=0;Q<W.length;Q+=4){let yt=W[Q],D=W[Q+1],Vt=W[Q+2],Nt=W[Q+3],Qt=(U[yt*3]-U[Vt*3])**2+(U[yt*3+1]-U[Vt*3+1])**2+(U[yt*3+2]-U[Vt*3+2])**2,ut=(U[D*3]-U[Nt*3])**2+(U[D*3+1]-U[Nt*3+1])**2+(U[D*3+2]-U[Nt*3+2])**2;Qt<=ut?(ot[xt++]=yt,ot[xt++]=D,ot[xt++]=Vt,ot[xt++]=yt,ot[xt++]=Vt,ot[xt++]=Nt):(ot[xt++]=yt,ot[xt++]=D,ot[xt++]=Nt,ot[xt++]=D,ot[xt++]=Vt,ot[xt++]=Nt)}let Gt=s.termCount,tt=new Float32Array(X*Gt),Jt=new Float32Array(X*Gt*3),se=new Float64Array(Gt),lt=new Float64Array(Gt*3),ee=new Uint8Array(X);for(let Q=0;Q<X;Q++){s.terms(U[Q*3],U[Q*3+1],U[Q*3+2],se,lt);let yt=0;for(let D=0;D<Gt;D++)tt[Q*Gt+D]=se[D],se[D]<se[yt]&&(yt=D);Jt.set(lt,Q*Gt*3),ee[Q]=Math.min(yt,255)}let gt=Lv(U,ot,tt,Jt,Gt,Math.max(m,1.5*f),Math.max(x,1.5*f)),K=s.R?s.ri:0,ft=Math.max(s.box.max[K]-s.box.min[K],1e-9),ht=e>0?e:ft*1.2,dt=new Float32Array(0);ft>ht*(s.R?.15:.3)&&(dt=gd(U,ot,K,Cv(s.box.min[K],s.box.max[K],ht/13)));let mt=new Float32Array(0);s.R&&Array.isArray(i.revolve)&&(mt=gd(U,ot,K,Iv(i.revolve,s.rsign,f)));let Bt=new Float32Array((gt.length+mt.length+dt.length)/3);Bt.fill(1,0,(gt.length+mt.length)/3),Bt.fill(Rv,(gt.length+mt.length)/3),gt=md(md(gt,mt),dt);let It={positions:Float32Array.from(U),normals:Z,indices:ot,lines:gt,lineWeights:Bt,terms:ee},Zt={min:s.box.min.slice(),max:s.box.max.slice()};if(_){It=Pv(It);let Q=Math.max(Math.abs(Zt.min[2]),Math.abs(Zt.max[2]));Zt.min[2]=-Q,Zt.max[2]=Q}return{...It,level:t,cell:f,grid:[r,o,a],triangles:It.indices.length/3,ms:_d()-n,box:Zt}}function md(i,t){let e=new Float32Array(i.length+t.length);return e.set(i),e.set(t,i.length),e}function Cv(i,t,e){let n=[],s=Math.max(1,Math.floor((t-i)/e)),r=i+(t-i-(s-1)*e)/2;for(let o=0;o<s;o++){let a=r+o*e;a>i+e*.35&&a<t-e*.35&&n.push(a)}return n}function Iv(i,t,e){let n=[],s=i.length,r=0;for(let l=0;l<s;l++){if(i[l][0]>i[r][0]&&(r=l),l===0||l===s-1)continue;let[c,h]=i[l-1],[f,d]=i[l],[u,m]=i[l+1],x=d-h,p=f-c,g=m-d,_=u-f,M=Math.hypot(x,p),y=Math.hypot(g,_);M<1e-9||y<1e-9||(x*g+p*_)/(M*y)<Math.cos(35*Math.PI/180)&&n.push(d)}n.push(i[r][1]);let o=Math.min(...i.map(l=>l[1])),a=Math.max(...i.map(l=>l[1]));return[...new Set(n.map(l=>Math.min(a-e*.6,Math.max(o+e*.6,l))*t))]}function gd(i,t,e,n){let s=new yi(Float32Array,4096),r=new Float64Array(3),o=new Float64Array(6);for(let a of n)for(let l=0;l<t.length;l+=3){let c=t[l],h=t[l+1],f=t[l+2];if(r[0]=i[c*3+e]-a,r[1]=i[h*3+e]-a,r[2]=i[f*3+e]-a,r[0]>0&&r[1]>0&&r[2]>0||r[0]<=0&&r[1]<=0&&r[2]<=0)continue;let d=0,u=[c,h,f];for(let m=0;m<3&&d<2;m++){let x=u[m],p=u[(m+1)%3],g=r[m],_=r[(m+1)%3];if(g>0==_>0)continue;let M=g/(g-_);o[d*3]=i[x*3]+(i[p*3]-i[x*3])*M,o[d*3+1]=i[x*3+1]+(i[p*3+1]-i[x*3+1])*M,o[d*3+2]=i[x*3+2]+(i[p*3+2]-i[x*3+2])*M,d++}d===2&&(s.push3(o[0],o[1],o[2]),s.push3(o[3],o[4],o[5]))}return s.done()}function Pv({positions:i,normals:t,indices:e,lines:n,lineWeights:s,terms:r}){let o=i.length/3,a=new Float32Array(i.length*2),l=new Float32Array(i.length*2);a.set(i),l.set(t);for(let u=0;u<o;u++)a[(o+u)*3]=i[u*3],a[(o+u)*3+1]=i[u*3+1],a[(o+u)*3+2]=-i[u*3+2],l[(o+u)*3]=t[u*3],l[(o+u)*3+1]=t[u*3+1],l[(o+u)*3+2]=-t[u*3+2];let c=new Uint32Array(e.length*2);c.set(e);for(let u=0;u<e.length;u+=3)c[e.length+u]=e[u]+o,c[e.length+u+1]=e[u+2]+o,c[e.length+u+2]=e[u+1]+o;let h=new Float32Array(n.length*2);h.set(n);for(let u=0;u<n.length;u+=3)h[n.length+u]=n[u],h[n.length+u+1]=n[u+1],h[n.length+u+2]=-n[u+2];let f=new Uint8Array(r.length*2);f.set(r),f.set(r,r.length);let d=new Float32Array(s.length*2);return d.set(s),d.set(s,s.length),{positions:a,normals:l,indices:c,lines:h,lineWeights:d,terms:f}}function Lv(i,t,e,n,s,r,o){let a=new yi(Float32Array,4096),l=[],c=[];for(let p=0;p<Math.min(4,s);p++)for(let g=p+1;g<Math.min(4,s);g++)l.push(p),c.push(g);for(let p=4;p<s;p++)l.push(-1),c.push(p);let h=p=>{let g=p*s,_=0;for(let M=1;M<4;M++)e[g+M]<e[g+_]&&(_=M);return _},f=e.length/s,d=new Uint8Array(f),u=Math.max(r,o)*2;for(let p=0;p<f;p++){let g=0;for(let _=0;_<s;_++)Math.abs(e[p*s+_])<u&&g++;d[p]=g>=2?1:0}let m=[];for(let p=0;p<t.length;p+=3)(d[t[p]]||d[t[p+1]]||d[t[p+2]])&&m.push(p);let x=new Float64Array(6);for(let p=0;p<l.length;p++){let g=c[p],_=g>=4?o:r;for(let M=0;M<m.length;M++){let y=m[M],T=0;for(let A=0;A<3;A++){let v=t[y+A],b=t[y+(A===2?0:A+1)],N=l[p]<0?h(v):l[p],I=l[p]<0?h(b):l[p],P=e[v*s+N]-e[v*s+g],O=e[b*s+I]-e[b*s+g];if(P>0==O>0||P===O)continue;let V=P/(P-O),R=e[v*s+N]+(e[b*s+I]-e[v*s+N])*V;if(Math.abs(R)>_)continue;let B=v*s*3,k=b*s*3,L=0;for(let U=0;U<3;U++){let X=n[B+N*3+U]+(n[k+I*3+U]-n[B+N*3+U])*V,j=n[B+g*3+U]+(n[k+g*3+U]-n[B+g*3+U])*V;L+=X*j}if(L>Ev)continue;let W=!1;for(let U=0;U<s&&!W;U++){if(U===N||U===I||U===g||l[p]<0&&U<4)continue;e[v*s+U]+(e[b*s+U]-e[v*s+U])*V<R-_*.25&&(W=!0)}W||(T<2&&(x[T*3]=i[v*3]+(i[b*3]-i[v*3])*V,x[T*3+1]=i[v*3+1]+(i[b*3+1]-i[v*3+1])*V,x[T*3+2]=i[v*3+2]+(i[b*3+2]-i[v*3+2])*V),T++)}T===2&&(a.push3(x[0],x[1],x[2]),a.push3(x[3],x[4],x[5]))}}return a.done()}function _d(){return typeof performance<"u"&&performance.now?performance.now():Date.now()}var Nv={right:{u:0,v:1,dirs:[[0,0,1]]},left:{u:0,v:1,dirs:[[0,0,-1]]},sides:{u:0,v:1,dirs:[[0,0,1],[0,0,-1]]},front:{u:2,v:1,dirs:[[1,0,0]]},back:{u:2,v:1,dirs:[[-1,0,0]]},top:{u:0,v:2,dirs:[[0,1,0]]},bottom:{u:0,v:2,dirs:[[0,-1,0]]}};function Dv(i){return yd(i).map(t=>({m:t.full,t:t.origin}))}function Fv(i,t,e){let n=!1,s=i.length/2;for(let r=0,o=s-1;r<s;o=r++){let a=i[r*2],l=i[r*2+1],c=i[o*2],h=i[o*2+1];l>e!=h>e&&t<(c-a)*(e-l)/(h-l)+a&&(n=!n)}return n}function Sh(i,t,e,n,s,r,o,a){let l=(u,m,x,p,g,_)=>(x-u)*(_-m)-(p-m)*(g-u),c=l(i,t,e,n,s,r),h=l(i,t,e,n,o,a),f=l(s,r,o,a,i,t),d=l(s,r,o,a,e,n);return c>0!=h>0&&f>0!=d>0}function Uv(i,t){let e=Array.from(i),s=(t[2]-t[0])*(t[5]-t[1])-(t[4]-t[0])*(t[3]-t[1])>0?1:-1;for(let r=0;r<3&&e.length;r++){let o=t[r*2],a=t[r*2+1],l=t[(r+1)%3*2],c=t[(r+1)%3*2+1],h=(u,m)=>s*((l-o)*(m-a)-(c-a)*(u-o)),f=[],d=e.length/2;for(let u=0;u<d;u++){let m=e[u*2],x=e[u*2+1],p=e[(u+1)%d*2],g=e[(u+1)%d*2+1],_=h(m,x),M=h(p,g);if(_>=0&&f.push(m,x),_>=0!=M>=0){let y=_/(_-M);f.push(m+(p-m)*y,x+(g-x)*y)}}e=f}return e}function Ov(i){let t=i.length/2;if(t<3)return[];let e=0;for(let l=0;l<t;l++){let c=(l+1)%t;e+=i[l*2]*i[c*2+1]-i[c*2]*i[l*2+1]}let n=e>0,s=[];for(let l=0;l<t;l++)s.push(l);let r=[],o=(l,c,h)=>(i[c*2]-i[l*2])*(i[h*2+1]-i[l*2+1])-(i[c*2+1]-i[l*2+1])*(i[h*2]-i[l*2]),a=0;for(;s.length>3&&a++<500;){let l=!1;for(let c=0;c<s.length;c++){let h=s[(c+s.length-1)%s.length],f=s[c],d=s[(c+1)%s.length],u=o(h,f,d);if(n?u<=1e-12:u>=-1e-12)continue;let m=!1;for(let x of s){if(x===h||x===f||x===d)continue;let p=o(h,f,x),g=o(f,d,x),_=o(d,h,x);if(n?p>0&&g>0&&_>0:p<0&&g<0&&_<0){m=!0;break}}if(!m){r.push(h,f,d),s.splice(c,1),l=!0;break}}if(!l){for(let c=1;c<s.length-1;c++)r.push(s[0],s[c],s[c+1]);return r}}return s.length===3&&r.push(s[0],s[1],s[2]),r}var xd=new WeakMap;function Bv(i){let t=[];for(let{mesh:a,shape:l}of i){if(!a||!a.positions||!a.positions.length)continue;let c=JSON.stringify([l.at||null,l.rot||null,l.repeat||null]),h=xd.get(a);h||xd.set(a,h=new Map);let f=h.get(c);if(!f){let d=Dv(l),u=a.positions.length/3,m=new Float32Array(u*3*d.length),x=new Float32Array(u*3*d.length),p=new Uint8Array(u*d.length),g=new Uint32Array(a.indices.length*d.length),_=[1/0,1/0,1/0],M=[-1/0,-1/0,-1/0];d.forEach((y,T)=>{let A=y.m,v=y.t,b=a.positions,N=a.normals;for(let I=0;I<u;I++){let P=b[I*3],O=b[I*3+1],V=b[I*3+2],R=(T*u+I)*3;m[R]=A[0]*P+A[1]*O+A[2]*V+v[0],m[R+1]=A[3]*P+A[4]*O+A[5]*V+v[1],m[R+2]=A[6]*P+A[7]*O+A[8]*V+v[2];for(let W=0;W<3;W++)m[R+W]<_[W]&&(_[W]=m[R+W]),m[R+W]>M[W]&&(M[W]=m[R+W]);let B=N[I*3],k=N[I*3+1],L=N[I*3+2];x[R]=A[0]*B+A[1]*k+A[2]*L,x[R+1]=A[3]*B+A[4]*k+A[5]*L,x[R+2]=A[6]*B+A[7]*k+A[8]*L}p.set(a.terms,T*u);for(let I=0;I<a.indices.length;I++)g[T*a.indices.length+I]=a.indices[I]+T*u}),f={P:m,N:x,TM:p,I:g,lo:_,hi:M,cell:a.cell||1/0},h.set(c,f)}t.push(f)}if(t.length===1)return t[0];if(!t.length)return null;let e=t.reduce((a,l)=>a+l.P.length/3,0),n=t.reduce((a,l)=>a+l.I.length,0),s={P:new Float32Array(e*3),N:new Float32Array(e*3),TM:new Uint8Array(e),I:new Uint32Array(n),lo:[1/0,1/0,1/0],hi:[-1/0,-1/0,-1/0],cell:1/0},r=0,o=0;for(let a of t){s.P.set(a.P,r*3),s.N.set(a.N,r*3),s.TM.set(a.TM,r);for(let l=0;l<a.I.length;l++)s.I[o+l]=a.I[l]+r;for(let l=0;l<3;l++)s.lo[l]=Math.min(s.lo[l],a.lo[l]),s.hi[l]=Math.max(s.hi[l],a.hi[l]);s.cell=Math.min(s.cell,a.cell),r+=a.P.length/3,o+=a.I.length}return s}function Md(i,t){let e=Nv[t.face];if(!e||!Array.isArray(t.outline)||t.outline.length<3)return null;let n=Bv(i);if(!n)return null;let{P:s,N:r,TM:o,I:a,lo:l,hi:c,cell:h}=n,f=Math.hypot(c[0]-l[0],c[1]-l[1],c[2]-l[2]),d=t.lift??Math.max(f*.0035,(Number.isFinite(h)?h:0)*.15),u=Number.isFinite(h)?h*.5:f/300,m=new yi(Float32Array,4096),x=new yi(Float32Array,4096),p=new yi(Float32Array,1024),{u:g,v:_}=e,M=[],y=t.wrap?e.dirs.slice(0,1):e.dirs;for(let V of y)M.push({dir:V,flip:!1});if(t.mirror&&(t.face==="front"||t.face==="back"||t.face==="top"||t.face==="bottom"))for(let V of y)M.push({dir:V,flip:!0});let T=new Float64Array(t.outline.length*2);t.outline.forEach((V,R)=>{T[R*2]=V[0],T[R*2+1]=V[1]});let A=Ol(T,Math.max(u,f/400)),v=s.length/3,b=new Int8Array(v),N=(V,R,B,k,L,W,U,X)=>{let j=(W-X)*(B-U)+(U-L)*(k-X);if(Math.abs(j)<1e-12)return null;let _t=((W-X)*(V-U)+(U-L)*(R-X))/j,Dt=((X-k)*(V-U)+(B-U)*(R-X))/j;return[_t,Dt,1-_t-Dt]},I=(V,R,B,k)=>{let L=0,W=0,U=0,X=0,j=0,_t=0,Dt=[V,R,B];for(let ot=0;ot<3;ot++){let xt=Dt[ot]*3;X+=s[xt]*k[ot],j+=s[xt+1]*k[ot],_t+=s[xt+2]*k[ot],L+=r[xt]*k[ot],W+=r[xt+1]*k[ot],U+=r[xt+2]*k[ot]}let Z=Math.hypot(L,W,U)||1;L/=Z,W/=Z,U/=Z,m.push3(X+L*d,j+W*d,_t+U*d),x.push3(L,W,U)};for(let V of M){let R=Float64Array.from(A);if(V.flip)for(let gt=0;gt<R.length;gt+=2)g===2&&(R[gt]=-R[gt]),_===2&&(R[gt+1]=-R[gt+1]);let B=is(R),k=V.dir;b.fill(-1);let L=32,W=(B.u1-B.u0)/L||1,U=(B.v1-B.v0)/L||1,X=R.length/2,j=new Array(L*L);for(let gt=0;gt<X;gt++){let K=R[gt*2],ft=R[gt*2+1],ht=R[(gt+1)%X*2],dt=R[(gt+1)%X*2+1],mt=Math.max(0,Math.floor((Math.min(K,ht)-B.u0)/W)),Bt=Math.min(L-1,Math.floor((Math.max(K,ht)-B.u0)/W)),It=Math.max(0,Math.floor((Math.min(ft,dt)-B.v0)/U)),Zt=Math.min(L-1,Math.floor((Math.max(ft,dt)-B.v0)/U));for(let Q=mt;Q<=Bt;Q++)for(let yt=It;yt<=Zt;yt++)(j[Q+yt*L]||(j[Q+yt*L]=[])).push(gt)}let _t=new Int32Array(X).fill(-1),Dt=gt=>(b[gt]<0&&(b[gt]=Fv(R,s[gt*3+g],s[gt*3+_])?1:0),b[gt]===1),Z=[];for(let gt=0;gt<a.length;gt+=3){let K=a[gt],ft=a[gt+1],ht=a[gt+2],dt=s[K*3+g],mt=s[ft*3+g],Bt=s[ht*3+g],It=s[K*3+_],Zt=s[ft*3+_],Q=s[ht*3+_];if(Math.max(dt,mt,Bt)<B.u0||Math.min(dt,mt,Bt)>B.u1||Math.max(It,Zt,Q)<B.v0||Math.min(It,Zt,Q)>B.v1||!t.wrap&&((r[K*3]+r[ft*3]+r[ht*3])*k[0]+(r[K*3+1]+r[ft*3+1]+r[ht*3+1])*k[1]+(r[K*3+2]+r[ft*3+2]+r[ht*3+2])*k[2]<=.45||o[K]>=4||o[ft]>=4||o[ht]>=4))continue;Z.push(gt);let yt=(Dt(K)?1:0)+(Dt(ft)?1:0)+(Dt(ht)?1:0),D=!1,Vt=X,Nt=Math.min(dt,mt,Bt),Qt=Math.max(dt,mt,Bt),ut=Math.min(It,Zt,Q),Kt=Math.max(It,Zt,Q),At=Math.max(0,Math.floor((Nt-B.u0)/W)),Pt=Math.min(L-1,Math.floor((Qt-B.u0)/W)),C=Math.max(0,Math.floor((ut-B.v0)/U)),w=Math.min(L-1,Math.floor((Kt-B.v0)/U));for(let it=At;it<=Pt&&!D;it++)for(let St=C;St<=w&&!D;St++){let Et=j[it+St*L];if(Et)for(let st=0;st<Et.length&&!D;st++){let at=Et[st];if(_t[at]===gt)continue;_t[at]=gt;let Ft=R[at*2],z=R[at*2+1],ct=R[(at+1)%Vt*2],rt=R[(at+1)%Vt*2+1];Math.max(Ft,ct)<Nt||Math.min(Ft,ct)>Qt||Math.max(z,rt)<ut||Math.min(z,rt)>Kt||(D=Sh(Ft,z,ct,rt,dt,It,mt,Zt)||Sh(Ft,z,ct,rt,mt,Zt,Bt,Q)||Sh(Ft,z,ct,rt,Bt,Q,dt,It))}}if(!D&&yt===3){I(K,ft,ht,[1,0,0]),I(K,ft,ht,[0,1,0]),I(K,ft,ht,[0,0,1]);continue}if(!D&&yt===0&&!zv(R[0],R[1],dt,It,mt,Zt,Bt,Q))continue;let q=Uv(R,[dt,It,mt,Zt,Bt,Q]);if(q.length<6)continue;let vt=Ov(q);for(let it=0;it<vt.length;it+=3)for(let St=0;St<3;St++){let Et=vt[it+St],st=N(q[Et*2],q[Et*2+1],dt,It,mt,Zt,Bt,Q);I(K,ft,ht,st||[1/3,1/3,1/3])}}let ot=48,xt=(B.u1-B.u0)/ot||1,Gt=(B.v1-B.v0)/ot||1,tt=new Map;for(let gt of Z){let K=a[gt],ft=a[gt+1],ht=a[gt+2],dt=[s[K*3+g],s[ft*3+g],s[ht*3+g]],mt=[s[K*3+_],s[ft*3+_],s[ht*3+_]],Bt=Math.max(0,Math.floor((Math.min(...dt)-B.u0)/xt)),It=Math.min(ot-1,Math.floor((Math.max(...dt)-B.u0)/xt)),Zt=Math.max(0,Math.floor((Math.min(...mt)-B.v0)/Gt)),Q=Math.min(ot-1,Math.floor((Math.max(...mt)-B.v0)/Gt));for(let yt=Bt;yt<=It;yt++)for(let D=Zt;D<=Q;D++){let Vt=yt+D*ot,Nt=tt.get(Vt);Nt||tt.set(Vt,Nt=[]),Nt.push(gt)}}let Jt=(gt,K)=>{let ft=Math.min(ot-1,Math.max(0,Math.floor((gt-B.u0)/xt))),ht=Math.min(ot-1,Math.max(0,Math.floor((K-B.v0)/Gt))),dt=tt.get(ft+ht*ot);if(!dt)return null;for(let mt of dt){let Bt=a[mt],It=a[mt+1],Zt=a[mt+2],Q=N(gt,K,s[Bt*3+g],s[Bt*3+_],s[It*3+g],s[It*3+_],s[Zt*3+g],s[Zt*3+_]);if(Q&&Q[0]>=-1e-6&&Q[1]>=-1e-6&&Q[2]>=-1e-6){let yt=0,D=0,Vt=0,Nt=0,Qt=0,ut=0,Kt=[Bt,It,Zt];for(let C=0;C<3;C++)yt+=s[Kt[C]*3]*Q[C],D+=s[Kt[C]*3+1]*Q[C],Vt+=s[Kt[C]*3+2]*Q[C],Nt+=r[Kt[C]*3]*Q[C],Qt+=r[Kt[C]*3+1]*Q[C],ut+=r[Kt[C]*3+2]*Q[C];let At=Math.hypot(Nt,Qt,ut)||1,Pt=d*1.15;return[yt+Nt/At*Pt,D+Qt/At*Pt,Vt+ut/At*Pt]}}return null},se=R.length/2,lt=null,ee=null;for(let gt=0;gt<se;gt++){let K=R[gt*2],ft=R[gt*2+1],ht=R[(gt+1)%se*2],dt=R[(gt+1)%se*2+1],mt=Math.hypot(ht-K,dt-ft),Bt=Math.max(1,Math.ceil(mt/u));for(let It=0;It<Bt;It++){let Zt=It/Bt,Q=Jt(K+(ht-K)*Zt,ft+(dt-ft)*Zt);Q&&lt&&(p.push3(lt[0],lt[1],lt[2]),p.push3(Q[0],Q[1],Q[2])),gt===0&&It===0&&(ee=Q),lt=Q}}lt&&ee&&(p.push3(lt[0],lt[1],lt[2]),p.push3(ee[0],ee[1],ee[2]))}let P=m.done();if(!P.length&&!p.n)return null;let O=new Uint32Array(P.length/3);for(let V=0;V<O.length;V++)O[V]=V;return{positions:P,normals:x.done(),indices:O,lines:p.done(),triangles:O.length/3}}function zv(i,t,e,n,s,r,o,a){let l=(i-s)*(n-r)-(e-s)*(t-r),c=(i-o)*(r-a)-(s-o)*(t-a),h=(i-e)*(a-n)-(o-e)*(t-n),f=l<0||c<0||h<0,d=l>0||c>0||h>0;return!(f&&d)}var kv=64,Gv=24*1024*1024,Vv=["coarse","fine"],vn=new Map,oo=new Set,Eh=new Set,zi=[],Ah=null,Ln=null,Rh,ss=!1,Hv=0,Sd=0,Wv=()=>typeof Worker=="function"&&Rh!==null&&!ss,Xv=()=>typeof window>"u"&&typeof process<"u"&&!!(process.versions&&process.versions.node),qv=null;function Td(i){Rh=i===null?null:String(i),Ln&&(Ln.terminate(),Ln=null)}function Ed(i){return Eh.add(i),()=>Eh.delete(i)}function Rd(){return oo.size}function Cd(){return!!Ln&&!ss}var so={jobs:0,ms:0,byKind:{}};function Id(i,t){if(!(t>=0))return;so.jobs++,so.ms+=t;let e=`${i.kind}-${i.level}`,n=so.byKind[e]||(so.byKind[e]={jobs:0,ms:0,max:0});n.jobs++,n.ms+=t,n.max=Math.max(n.max,t)}function Pd(){return JSON.parse(JSON.stringify({...so,cached:vn.size,worker:!!Ln&&!ss}))}function zl(i){return i>0?Math.round(Math.pow(2,Math.round(Math.log2(i)*2)/2)):0}var Yv=i=>JSON.stringify([i.at||[0,0,0],i.rot||null,i.repeat||null]);function Ld(i,t,e=null){let n=zl(t),s=`h:${io(i)}@${n}`;return Dd(s,{kind:"hull",shape:i,scale:n},e)}function Nd(i,t,e,n=null){let s=zl(e),r=Array.isArray(t)?t:[],o=`p:${JSON.stringify([i.face,i.outline,i.mirror?1:0,i.wrap?1:0,i.lift??null])}|${r.map(a=>io(a)+Yv(a)).join("|")}@${s}`;return r.length?Dd(o,{kind:"panel",panel:i,hosts:r,scale:s},n):{key:o,mesh:null,level:null,done:!0}}function Dd(i,t,e){let n=vn.get(i);n&&(vn.delete(i),vn.set(i,n));let s=e==="coarse"||qv==="coarse",r=e==="fine"&&!s;if(Xv()){let a=e==="coarse"?"coarse":"fine";return n&&n.done?{key:i,mesh:n.fine,level:"fine",done:!0}:((!n||n[a]===void 0)&&(n=Ch(i,a,Fd({...t,level:a}))),{key:i,mesh:n[a],level:a,done:!0})}if(n&&n.done)return{key:i,mesh:n.fine,level:"fine",done:!0};let o=t.kind==="panel"&&t.hosts.every(a=>{let l=vn.get(`h:${io(a)}@${t.scale}`);return l&&l.done});for(let a of Vv)a==="coarse"&&(o||r)||a==="fine"&&s&&!o||n&&n[a]!==void 0||oo.has(`${i}|${a}`)||(oo.add(`${i}|${a}`),zi.push({...t,key:i,level:a}));return Zv(),n&&n.coarse?{key:i,mesh:n.coarse,level:"coarse",done:s&&!o}:{key:i,mesh:null,level:null,done:!1}}var bd=i=>(i.level==="coarse"?0:2)+(i.kind==="panel"?1:0);function Ch(i,t,e){let n=vn.get(i);n||(n={coarse:void 0,fine:void 0,done:!1,bytes:0},vn.set(i,n)),n[t]=e||null,t==="fine"&&(n.done=!0,n.coarse=void 0),n.bytes=wd(n.coarse)+wd(n.fine);let s=0;for(let r of vn.values())s+=r.bytes;for(let[r,o]of vn){if(vn.size<=kv&&s<=Gv)break;r!==i&&(s-=o.bytes,vn.delete(r))}return n}function wd(i){if(!i)return 0;let t=0;for(let e of["positions","normals","indices","lines","lineWeights","terms"])i[e]&&(t+=i[e].byteLength);return t}function Fd(i){if(i.kind==="hull")return wh(i.shape,{level:i.level,scale:i.scale});let t=i.hosts.map(e=>{let n=`h:${io(e)}@${i.scale}`,s=vn.get(n),r=s&&(i.level==="fine"?s.fine:s.coarse??s.fine);return(r===void 0||i.level==="fine"&&!(s&&s.done))&&(r=wh(e,{level:i.level,scale:i.scale}),s=Ch(n,i.level,r)),{mesh:r,shape:e}});return Md(t,i.panel)}function Ud(i,t){oo.delete(`${i.key}|${i.level}`);let e=vn.get(i.key);i.level==="coarse"&&e&&e.done||Ch(i.key,i.level,t);for(let n of Array.from(Eh))try{n(i.key,i.level)}catch(s){console.warn("[jarvis] hull listener failed:",s&&s.message)}}var ro=new Map,Th=!1;function Zv(){Th||(Th=!0,queueMicrotask(()=>{Th=!1,zi.sort((i,t)=>bd(i)-bd(t)),Bl()}))}function Bl(){if(Wv()&&Jv()){for(;zi.length;){let t=zi.shift();if(Ad(t))continue;t.id=++Hv;let e=t.kind==="hull"?{id:t.id,kind:"hull",shape:t.shape,level:t.level,scale:t.scale}:{id:t.id,kind:"panel",panel:t.panel,hosts:t.hosts,level:t.level,scale:t.scale};try{Ln.postMessage(e),ro.set(t.id,t)}catch{ss=!0,zi.unshift(t);break}}if(!ss)return}if(Ah||!zi.length)return;let i=zi.shift();if(Ad(i)){Bl();return}Ah=i,clearTimeout(Sd),Sd=setTimeout(()=>{let t=null,e=performance.now();try{t=Fd(i)}catch(n){console.warn("[jarvis] hull mesh failed:",n&&n.message)}Id(i,performance.now()-e),Ah=null,Ud(i,t),Bl()},0)}function Ad(i){let t=vn.get(i.key);return t&&(t.done||t[i.level]!==void 0)?(oo.delete(`${i.key}|${i.level}`),!0):!1}function Jv(){if(Ln)return!0;let i=Rh;if(i===void 0)try{let t=document.querySelector('meta[name="jarvis-build"]'),e=t&&/^[0-9a-f]{8}$/.test(t.content||"")?t.content:"";i=new URL(`assets/hull-worker.js${e?`?v=${e}`:""}`,document.baseURI).href}catch{return!1}try{Ln=new Worker(i,{name:"jarvis-hull"})}catch{return ss=!0,!1}return Ln.onmessage=t=>{let e=t.data||{},n=ro.get(e.id);n&&(ro.delete(e.id),Id(n,e.ms),Ud(n,e.mesh||null))},Ln.onerror=t=>{t&&t.preventDefault&&t.preventDefault(),ss=!0;try{Ln.terminate()}catch{}Ln=null;let e=Array.from(ro.values());ro.clear(),zi.unshift(...e),Bl()},!0}var $v=32,lo=Math.PI/180,Ih=32,Kv=40,Qv=48,jv={x:["z","y"],y:["x","z"],z:["x","y"]},Dh=Object.freeze([3e5,6e5]),Od=Object.freeze([.12,.04]);function Fh(i){return i>=Dh[1]?2:i>=Dh[0]?1:0}function Uh(i,t){if(!(t>0)||!i||i.type==="hull"||i.type==="panel")return 0;let e=Jh({shapes:[i]}),n=e?Math.hypot(e.size[0],e.size[1],e.size[2]):0;return n<t*Od[1]?2:n<t*Od[0]?1:0}function Hd(i){return!!i&&(i.type==="loft"||i.type==="box"&&i.round>0||i.type==="lathe"&&!!i.smooth)}function Wd(i,t,e){return{level:Math.max(Fh(t),Uh(i,e)),hullMode:t>=Dh[1]?"coarse":null}}var Bd={y:null,"-y":new fe().makeRotationX(Math.PI),x:new fe().makeRotationZ(-Math.PI/2),"-x":new fe().makeRotationZ(Math.PI/2),z:new fe().makeRotationX(Math.PI/2),"-z":new fe().makeRotationX(-Math.PI/2)},ty={z:null,y:new fe().makeRotationX(Math.PI/2),x:new fe().makeRotationY(-Math.PI/2)};function ey(i){let t=new fe;if(!(i.type==="loft"||i.type==="hull"))if(i.type==="extrude"){let n=ty[(i.axis||"z").replace("-","")];n&&t.copy(n)}else i.axis&&Bd[i.axis]&&t.copy(Bd[i.axis]);if(i.rot){let n=new fe().makeRotationFromEuler(new Jn(i.rot[0]*lo,i.rot[1]*lo,i.rot[2]*lo,"XYZ"));t.premultiply(n)}let e=i.at||[0,0,0];return t.premultiply(new fe().makeTranslation(e[0],e[1],e[2])),t}function ny(i){if(!i)return[new fe];let t=[];for(let e=0;e<i.count;e++){if(i.along){t.push(new fe().makeTranslation(i.along[0]*e,i.along[1]*e,i.along[2]*e));continue}let n=(i.start+i.step*e)*lo,s=i.around==="x"?new fe().makeRotationX(n):i.around==="z"?new fe().makeRotationZ(n):new fe().makeRotationY(n),r=i.center||[0,0,0],o=new fe().makeTranslation(r[0],r[1],r[2]).multiply(s).multiply(new fe().makeTranslation(-r[0],-r[1],-r[2]));t.push(o)}return t}function Ph(i,t,e,n=64,s="xz",r=Math.PI*2){let a=r>=Math.PI*2-1e-6?n:Math.max(2,Math.round(n*r/(Math.PI*2)));for(let l=0;l<a;l++){let c=l/a*r,h=(l+1)/a*r;s==="xz"?i.push(Math.cos(c)*t,e,Math.sin(c)*t,Math.cos(h)*t,e,Math.sin(h)*t):i.push(Math.cos(c)*t,Math.sin(c)*t,e,Math.cos(h)*t,Math.sin(h)*t,e)}return i}function Lh(i,t){for(let e=0;e<t.length-1;e++)i.push(t[e].x,t[e].y,t[e].z,t[e+1].x,t[e+1].y,t[e+1].z);return i}function rs(i){let t=new Tr(i,$v),e=Array.from(t.getAttribute("position").array);return t.dispose(),e}function zd(i){return!!i.repeat&&i.repeat.count>12}function kd(i){let t=[0,1,2].sort((r,o)=>i[o]-i[r]),[e,n]=t,s=[];for(let r of[-1,1]){let o=[0,0,0],a=[0,0,0];o[e]=-i[e]/2,a[e]=i[e]/2,o[n]=a[n]=r*i[n]/2,s.push(...o,...a)}return s}function iy(i,t){let e=1/0,n=-1/0,s=new Float64Array(i.length*2);i.forEach(([a,l],c)=>{s[c*2]=a,s[c*2+1]=l,e=Math.min(e,a,l),n=Math.max(n,a,l)});let r=Ol(s,(n-e)/60||1,t),o=[];for(let a=0;a<r.length;a+=2)o.push([r[a],r[a+1]]);return o}function sy(i,t){let[e,n,s]=i.map(h=>h/2),r=t*(1-Math.SQRT1_2),o=[],a=[-(e-r),e-r],l=[-(n-r),n-r],c=[-(s-r),s-r];for(let h of l)for(let f of c)o.push(-(e-t),h,f,e-t,h,f);for(let h of a)for(let f of c)o.push(h,-(n-t),f,h,n-t,f);for(let h of a)for(let f of l)o.push(h,f,-(s-t),h,f,s-t);return o}function Gd(i,t){let e=new Ue;return e.setAttribute("position",new Ne(i instanceof Float32Array?i:new Float32Array(i),3)),e.setIndex(new Ne(t instanceof Uint32Array?t:Uint32Array.from(t),1)),e.computeVertexNormals(),e}function Vd(i){let t=i&&i.lines?Array.from(i.lines):[],e=i&&i.lineWeights&&i.lineWeights.length===t.length/3?i.lineWeights:null;if(!i||!i.positions||!i.positions.length)return{geometry:null,lines:t,lineWeights:e};let n=new Ue;return n.setAttribute("position",new Ne(i.positions,3)),n.setAttribute("normal",new Ne(i.normals,3)),n.setIndex(new Ne(i.indices,1)),{geometry:n,lines:t,lineWeights:e}}function Nh(i,t=0){let e=i.repeat?i.repeat.count:1,n=i.type==="loft"?Math.min(40,8+6*i.sections.length):40,s;if(e>16?s={N:16,M:Math.min(n,12),around:16,rows:8,lathe:24}:e>4?s={N:24,M:Math.min(n,20),around:20,rows:10,lathe:32}:s={N:40,M:n,around:32,rows:16,lathe:Qv},s.archSteps=12,s.ribGap=.03,t>0){let r=t>=2?.34:.6,o=(a,l)=>Math.max(l,4*Math.round(a*r/4));s={N:o(s.N,12),M:Math.max(6,Math.round(s.M*r)),around:o(s.around,12),rows:Math.max(6,2*Math.round(s.rows*r/2)),lathe:o(s.lathe,16),archSteps:t>=2?6:8,ribGap:t>=2?.2:.1}}return s}function ry(i){let t=i.axis||"x",[e,n]=jv[t];return{axis:t,cap:i.cap,arches:i.arches,sections:i.sections.map(s=>({s:s[t],c:[s[e]||0,s[n]||0],w:s.w,h:s.h,round:s.round??1,top:s.top,twist:s.twist,pts:s.pts}))}}function oy(i,t){let e=t.level||0;switch(i.type){case"hull":{let n=Ld(i,t.scale||0,t.hullMode||null);return{...Vd(n.mesh),asyncKey:n.key,level:n.mesh?n.level:null,done:n.done}}case"panel":{let n=t.hosts?t.hosts(i.on):[],s=Nd(i,n,t.scale||0,t.hullMode||null);return{...Vd(s.mesh),asyncKey:s.key,level:s.mesh?s.level:null,done:s.done}}case"loft":{let n=Nh(i,e),s=!!i.repeat&&i.repeat.count>6,r=cd(ry(i),{N:n.N,M:n.M,archSteps:n.archSteps,ribGap:n.ribGap,ribs:!s,edges:s});return{geometry:Gd(r.positions,r.indices),lines:r.lines,lineWeights:r.lineWeights}}case"box":{let[n,s,r]=i.size;if(i.round>0){let a=Nh(i,e),l=hd(i.size,i.round,{around:a.around,rows:a.rows});return{geometry:Gd(l.positions,l.indices),lines:zd(i)?kd(i.size):l.lines}}if(i.r>0)return{geometry:new Il(n,s,r,3,i.r),lines:sy(i.size,i.r)};let o=new $n(n,s,r);return{geometry:o,lines:zd(i)?kd(i.size):rs(o)}}case"cylinder":{let n=i.sides||Ih,s=i.r,r=i.r2??i.r,o=i.h;if(i.hole>0){let l=[new Lt(i.hole,-o/2),new Lt(s,-o/2),new Lt(r,o/2),new Lt(i.hole,o/2),new Lt(i.hole,-o/2)],c=new $i(l,n);return{geometry:c,lines:rs(c)}}let a=new Fs(r,s,o,n,1,!1);return{geometry:a,lines:rs(a)}}case"cone":{let n=new Fs(0,i.r,i.h,i.sides||Ih,1,!1);return{geometry:n,lines:rs(n)}}case"sphere":{let n=new Or(1,Ih,16),s=i.size?i.size.map(o=>o/2):[i.r,i.r,i.r];n.scale(s[0],s[1],s[2]);let r=[];for(let o=0;o<64;o++){let a=o/64*Math.PI*2,l=(o+1)/64*Math.PI*2;r.push(Math.cos(a)*s[0],0,Math.sin(a)*s[2],Math.cos(l)*s[0],0,Math.sin(l)*s[2]),r.push(Math.cos(a)*s[0],Math.sin(a)*s[1],0,Math.cos(l)*s[0],Math.sin(l)*s[1],0)}return{geometry:n,lines:r}}case"torus":{let n=(i.arc||360)*lo,s=new Br(i.r,i.tube,12,48,n);s.rotateX(-Math.PI/2);let r=[],o=a=>{let l=Math.max(8,Math.round(64*(n/(Math.PI*2))));for(let c=0;c<l;c++){let h=c/l*n,f=(c+1)/l*n;r.push(Math.cos(h)*a,0,-Math.sin(h)*a,Math.cos(f)*a,0,-Math.sin(f)*a)}};return o(i.r+i.tube),o(Math.max(0,i.r-i.tube)),{geometry:s,lines:r}}case"capsule":{let n=Math.max(0,i.h-2*i.r),s=new Ar(i.r,n,6,20,1),r=[];return Ph(r,i.r,n/2,40),Ph(r,i.r,-n/2,40),{geometry:s,lines:r}}case"lathe":{if(i.smooth){let r=Nh(i,e),{points:o,corners:a,given:l}=ud(i.profile,8),c=new $i(o.map(([m,x])=>new Lt(Math.max(0,m),x)),r.lathe),h=[],f=0,d=[0];for(let m=1;m<o.length;m++)d.push(f+=Math.hypot(o[m][0]-o[m-1][0],o[m][1]-o[m-1][1]));let u=-1/0;for(let m of Array.from(new Set([...a,...l])).sort((x,p)=>x-p)){let[x,p]=o[m];x<=1e-9||d[m]-u<f*.04&&!a.includes(m)||(Ph(h,x,p,64),u=d[m])}return{geometry:c,lines:h}}let n=i.profile.map(([r,o])=>new Lt(r,o)),s=new $i(n,Kv);return{geometry:s,lines:rs(s)}}case"extrude":{let n=i.smooth?iy(i.outline,!0):i.outline,s=new Bs(n.map(([c,h])=>new Lt(c,h))),r=i.bevel||0,o=Math.max(i.depth-2*r,i.depth*.1),a=new Ur(s,{depth:o,bevelEnabled:r>0,bevelThickness:r,bevelSize:r,bevelOffset:-r,bevelSegments:3,curveSegments:4});a.translate(0,0,-o/2);let l;if(r>0){l=rs(a);for(let c of[-o/2,o/2]){let h=n.map(([f,d])=>new G(f,d,c));h.push(h[0].clone()),Lh(l,h)}}else l=rs(a);return{geometry:a,lines:l}}case"tube":{let n=i.path.map(([l,c,h])=>new G(l,c,h)),s=new Os(n,!1,"centripetal"),r=Math.min(160,Math.max(12,n.length*10)),o=i.r2!==void 0?12:10,a=new zr(s,r,i.r,o,!1);if(i.r2!==void 0&&i.r2!==i.r){let l=a.getAttribute("position"),c=new G,h=new G;for(let f=0;f<=r;f++){s.getPointAt(f/r,c);let d=(i.r+(i.r2-i.r)*f/r)/i.r;for(let u=0;u<=o;u++){let m=f*(o+1)+u;h.fromBufferAttribute(l,m).sub(c).multiplyScalar(d).add(c),l.setXYZ(m,h.x,h.y,h.z)}}a.computeVertexNormals()}return{geometry:a,lines:Lh([],s.getPoints(r))}}case"line":{let n=i.path.map(([s,r,o])=>new G(s,r,o));return{geometry:null,lines:Lh([],n)}}default:return{geometry:null,lines:[]}}}function Ks(i,t={}){let{geometry:e,lines:n,lineWeights:s,asyncKey:r,level:o,done:a}=oy(i,t||{}),l=i.type==="panel"?new fe:ey(i),c=i.type==="panel"?[new fe]:ny(i.repeat),h=e,f=null,d=null,u=null;h&&(h.getAttribute("normal")||h.computeVertexNormals(),f=h.getAttribute("position"),d=h.getAttribute("normal"),u=h.getIndex());let m=f?f.count:0,x=u?u.count:m,p=n.length/3,g=new Float32Array(m*3*c.length),_=new Float32Array(m*3*c.length),M=new Uint32Array(x*c.length),y=new Float32Array(p*3*c.length),T=new G,A=new G,v=new he,b=new fe,N=1/0,I=-1/0;c.forEach((O,V)=>{b.multiplyMatrices(O,l),v.getNormalMatrix(b);let R=V*m;for(let L=0;L<m;L++)T.fromBufferAttribute(f,L).applyMatrix4(b),g[(R+L)*3]=T.x,g[(R+L)*3+1]=T.y,g[(R+L)*3+2]=T.z,T.y<N&&(N=T.y),T.y>I&&(I=T.y),A.fromBufferAttribute(d,L).applyMatrix3(v).normalize(),_[(R+L)*3]=A.x,_[(R+L)*3+1]=A.y,_[(R+L)*3+2]=A.z;let B=V*x;for(let L=0;L<x;L++)M[B+L]=R+(u?u.getX(L):L);let k=V*p;for(let L=0;L<p;L++)T.set(n[L*3],n[L*3+1],n[L*3+2]).applyMatrix4(b),y[(k+L)*3]=T.x,y[(k+L)*3+1]=T.y,y[(k+L)*3+2]=T.z,T.y<N&&(N=T.y),T.y>I&&(I=T.y)}),h&&h.dispose(),Number.isFinite(N)||(N=0,I=0);let P={positions:g,normals:_,indices:M,lines:y,vertexCount:m*c.length,lineVertexCount:p*c.length,minY:N,maxY:I};if(s&&s.length===p){let O=new Float32Array(p*c.length);for(let V=0;V<c.length;V++)O.set(s,V*p);P.lineWeights=O}return r&&(P.asyncKey=r,P.level=o,P.done=!!a,t&&t.hullMode&&(P.hullMode=t.hullMode)),P}function Xd(i,t){let e=0,n=0,s=0;for(let f of i)e+=f.vertexCount,n+=f.indices.length,s+=f.lineVertexCount;let r=[1/0,1/0,1/0],o=[-1/0,-1/0,-1/0],a=f=>{for(let d=0;d<f.length;d+=3)for(let u=0;u<3;u++){let m=f[d+u];m<r[u]&&(r[u]=m),m>o[u]&&(o[u]=m)}},l=null;if(e>0){let f=new Float32Array(e*3),d=new Float32Array(e*3),u=new Float32Array(e),m=new Float32Array(e),x=e>65535?new Uint32Array(n):new Uint16Array(n),p=0,g=0;i.forEach((_,M)=>{f.set(_.positions,p*3),d.set(_.normals,p*3);let y=_.maxY-_.minY||1;for(let T=0;T<_.vertexCount;T++)u[p+T]=t[M],m[p+T]=(_.positions[T*3+1]-_.minY)/y;for(let T=0;T<_.indices.length;T++)x[g+T]=_.indices[T]+p;a(_.positions),p+=_.vertexCount,g+=_.indices.length}),l=new Ue,l.setAttribute("position",new Ne(f,3)),l.setAttribute("normal",new Ne(d,3)),l.setAttribute("aBorn",new Ne(u,1)),l.setAttribute("aH",new Ne(m,1)),l.setIndex(new Ne(x,1)),l.computeBoundingSphere(),l.computeBoundingBox()}let c=null;if(s>0){let f=new Float32Array(s*3),d=new Float32Array(s),u=new Float32Array(s),m=new Float32Array(s).fill(1),x=0;i.forEach((p,g)=>{f.set(p.lines,x*3);let _=p.maxY-p.minY||1;for(let M=0;M<p.lineVertexCount;M++)d[x+M]=t[g],u[x+M]=(p.lines[M*3+1]-p.minY)/_;p.lineWeights&&m.set(p.lineWeights,x),a(p.lines),x+=p.lineVertexCount}),c=new Ue,c.setAttribute("position",new Ne(f,3)),c.setAttribute("aBorn",new Ne(d,1)),c.setAttribute("aH",new Ne(u,1)),c.setAttribute("aW",new Ne(m,1)),c.computeBoundingSphere()}let h=Number.isFinite(r[0])?{min:r,max:o}:null;return{fill:l,lines:c,box:h,support:ay(i)}}var ao=[];for(let i=-1;i<=1;i++)for(let t=-1;t<=1;t++)for(let e=-1;e<=1;e++)(i||t||e)&&ao.push([i,t,e]);function ay(i){let t=new Float64Array(ao.length).fill(-1/0),e=new Float32Array(ao.length*3),n=s=>{for(let r=0;r<s.length;r+=3){let o=s[r],a=s[r+1],l=s[r+2];for(let c=0;c<ao.length;c++){let h=ao[c],f=o*h[0]+a*h[1]+l*h[2];f>t[c]&&(t[c]=f,e[c*3]=o,e[c*3+1]=a,e[c*3+2]=l)}}};for(let s of i)n(s.positions),n(s.lines);return Number.isFinite(t[0])?e:null}var ly=[16,30,48,72,104,144,196],cy=[0,20,-20,42,-42,66,-66,95,-95,130,-130,180],Zd=Math.PI/180,hy=.55,uy=80,fy=45,dy=110,qd=26,Oh=(()=>{let i=[];for(let t of ly)for(let e of cy)i.push({r:t,da:e*Zd,cost:t+Math.abs(e)*hy});return i.sort((t,e)=>t.cost-e.cost),i})();function py(i){let t=2166136261,e=String(i);for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return(t>>>0)%360*Zd}function Yd(i,t,e){let n=e+t.da,s=Math.cos(n),r=Math.sin(n),o=i.x+t.r*s,a=i.y+t.r*r,l=s>.38?o:s<-.38?o-i.w:o-i.w/2,c=r>.38?a:r<-.38?a-i.h:a-i.h/2;return{x:l,y:c}}function Jd(i,t,e={}){let n=e.gap??3,s=e.center||{x:(t.left+t.right)/2,y:(t.top+t.bottom)/2},r=e.previous||null,o=e.avoid||[],a=e.maxCost??1/0,l=e.coverCost??uy,c=i.filter(y=>Number.isFinite(y.x)&&Number.isFinite(y.y)&&y.w>0&&y.h>0).sort((y,T)=>(T.pinned?1:0)-(y.pinned?1:0)||T.priority-y.priority),h=[],f=[],d=[],u=new Map,m=(y,T,A,v,b)=>{if(y<t.left||T<t.top||y+A>t.right||T+v>t.bottom)return!1;let N=y-n,I=T-n,P=y+A+n,O=T+v+n;for(let V=0;V<h.length;V++){let R=h[V];if(N<R[2]&&P>R[0]&&I<R[3]&&O>R[1])return!1}for(let V=0;V<f.length;V++){let R=f[V];if(R[0]>y-2&&R[0]<y+A+2&&R[1]>T-2&&R[1]<T+v+2)return!1}return!(b.x>y-2&&b.x<y+A+2&&b.y>T-2&&b.y<T+v+2)},x=(y,T,A,v)=>{for(let b=0;b<o.length;b++){let N=o[b];if(y<N[2]&&y+A>N[0]&&T<N[3]&&T+v>N[1])return!1}return!0},p=c.map(y=>[y.x,y.y,y]),g=(y,T,A)=>{for(let v=0;v<p.length;v++){let[b,N,I]=p[v];if(I!==A&&b>y-2&&b<y+A.w+2&&N>T-2&&N<T+A.h+2)return!0}return!1},_=(y,T,A)=>[Math.min(Math.max(y.x,T),T+y.w),Math.min(Math.max(y.y,A),A+y.h)],M=(y,T,A)=>{let[v,b]=_(y,T,A);for(let N=0;N<d.length;N++)if(co(y.x,y.y,v,b,d[N]))return!1;for(let N=0;N<d.length;N++)if(my(d[N],T-1,A-1,T+y.w+1,A+y.h+1))return!1;return!0};for(let y of c){if(!(y.x>=t.left-1&&y.x<=t.right+1&&y.y>=t.top-1&&y.y<=t.bottom+1)&&!y.pinned)continue;let A=y.x-s.x,v=y.y-s.y,b=Math.hypot(A,v)<6?py(y.id):Math.atan2(v,A),N=null,I=-1,P=r?r.get(y.id):void 0,O=y.pinned?1/0:a;for(let k=0;k<Oh.length;k++){let L=Oh[k],W=k===P?qd:0;if(L.cost-qd>=O)break;let U=Yd(y,L,b);if(!m(U.x,U.y,y.w,y.h,y))continue;let X=L.cost-W;X>=O||(o.length&&!x(U.x,U.y,y.w,y.h)&&(X+=l),!(X>=O)&&(g(U.x,U.y,y)&&(X+=fy),!(X>=O)&&(M(y,U.x,U.y)||(X+=dy),X<O&&(O=X,N=U,I=k))))}let V=!1;if(!N){if(!y.pinned)continue;let k=Yd(y,Oh[2],b);k.x=Math.min(Math.max(k.x,t.left),Math.max(t.left,t.right-y.w)),k.y=Math.min(Math.max(k.y,t.top),Math.max(t.top,t.bottom-y.h)),N=k,I=2,V=!0}h.push([N.x,N.y,N.x+y.w,N.y+y.h]),f.push([y.x,y.y]);let[R,B]=_(y,N.x,N.y);d.push([y.x,y.y,R,B]),u.set(y.id,{x:N.x,y:N.y,w:y.w,h:y.h,slot:I,lx:R,ly:B,forced:V})}return u}function kl(i,t,e,n,s,r){return(e-i)*(r-t)-(n-t)*(s-i)}function co(i,t,e,n,s){let[r,o,a,l]=s,c=kl(r,o,a,l,i,t),h=kl(r,o,a,l,e,n),f=kl(i,t,e,n,r,o),d=kl(i,t,e,n,a,l);return(c>0&&h<0||c<0&&h>0)&&(f>0&&d<0||f<0&&d>0)}function my(i,t,e,n,s){let[r,o,a,l]=i,c=(h,f)=>h>t&&h<n&&f>e&&f<s;return c(r,o)||c(a,l)?!0:co(r,o,a,l,[t,e,n,e])||co(r,o,a,l,[n,e,n,s])||co(r,o,a,l,[t,s,n,s])||co(r,o,a,l,[t,e,t,s])}var $d=`
  float prog = clamp((uTime - vBorn) / uReveal, 0.0, 1.0);
  float sweep = prog * 1.15 - 0.075;
  if (vH > sweep) discard;
  float front = (1.0 - smoothstep(0.0, 0.09, sweep - vH)) * step(prog, 0.999);
`,Kd=`
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uVis;
  uniform float uSel;
  uniform float uHover;
  uniform float uTime;
  uniform float uReveal;
  uniform vec2 uFade;
  uniform float uScanY;
  uniform float uScanW;
  uniform float uFlicker;
  uniform float uRows;
`,Qd=`
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
`,jd=`
  ${Kd}
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  void main() {
    ${$d}
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
    a *= fade * uVis * uFlicker;
    vec3 col = mix(uColor, vec3(0.86, 1.0, 1.0), clamp(0.1 + 0.45 * uSel + 0.3 * rim * rim, 0.0, 1.0));
    gl_FragColor = vec4(col * a + vec3(0.65, 1.0, 1.0) * front * 0.5 * uVis, 1.0);
  }
`,tp=`
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
`,ep=`
  ${Kd}
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  varying float vW;
  void main() {
    ${$d}
    float fade = 1.0 - 0.62 * smoothstep(uFade.x, uFade.y, vDepth);
    float scan = exp(-pow((vWY - uScanY) / uScanW, 2.0));
    float a = uAlpha * vW * fade * uVis * uFlicker * (1.0 + 0.8 * uSel + 0.45 * uHover);
    a += (scan * 0.22 + front) * uVis;
    vec3 col = mix(uColor, vec3(0.9, 1.0, 1.0), clamp(0.28 + 0.55 * uSel + 0.25 * uHover, 0.0, 1.0));
    gl_FragColor = vec4(col * a, 1.0);
  }
`,np=`
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`,ip=`
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
`,sp=`
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
`,rp=`
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
`;var Bh="http://www.w3.org/2000/svg",pn=Math.PI/180,os=32,op=2,zh=.75,gy=950,_y=750,xy=7,kh=7e3,vy=12e4,yy=30,My=5,Sy=10,ap=34e3,by=15e3,wy=8,Ay=300,lp={primary:{color:[.243,.878,1],fill:.2,line:.6},secondary:{color:[.22,.58,1],fill:.1,line:.4},accent:{color:[.62,.96,1],fill:.26,line:.85},warning:{color:[1,.69,.27],fill:.26,line:.8}},as={front:[90,80],back:[-90,80],right:[0,80],left:[180,80],top:[0,.6],bottom:[0,179.4],"front-left":[135,66],"front-right":[45,66],"back-left":[-135,66],"back-right":[-45,66]},ei=()=>{};function cp(i){return i<.5?4*i*i*i:1-Math.pow(-2*i+2,3)/2}function Ty(i){let t=Math.PI*2;return i%=t,i>Math.PI&&(i-=t),i<-Math.PI&&(i+=t),i}function Ey(i){if(!(i>0))return 1;let t=Math.pow(10,Math.floor(Math.log10(i))),e=i/t;return(e<1.5?1:e<3.5?2:e<7.5?5:10)*t}function Ry(i,t,e=window){let n=null;try{n=e.matchMedia?e.matchMedia(i):null}catch{n=null}if(!n)return{matches:!1,off:ei};let s=()=>t(n.matches);return n.addEventListener?n.addEventListener("change",s):n.addListener&&n.addListener(s),{get matches(){return n.matches},off(){n.removeEventListener?n.removeEventListener("change",s):n.removeListener&&n.removeListener(s)}}}var Gl=new Set,ls=null;function Cy(i){if(Gl.add(i),!ls&&typeof MutationObserver=="function")try{ls=new MutationObserver(()=>{for(let t of Array.from(Gl))t()}),ls.observe(document.documentElement,{subtree:!0,attributes:!0,attributeFilter:["inert"]})}catch{ls=null}return()=>{Gl.delete(i),!Gl.size&&ls&&(ls.disconnect(),ls=null)}}function Iy(i,t,e,n=document){let s=n.createElement(i);return t&&(s.className=t),e!==void 0&&(s.textContent=e),s}function _1(i,t={}){let e={onSelect:ei,onState:ei,labels:!0,autoRotate:void 0,reveal:!0,insets:null,maxDpr:op,...t};e.hullWorker!==void 0&&Td(e.hullWorker);let n=i&&i.ownerDocument||document,s=n.defaultView||window,r=s!==window,o=(S,F,$)=>Iy(S,F,$,n),a=o("div","holo"),l=o("canvas","holo__canvas");l.setAttribute("role","img"),l.setAttribute("aria-label","Hologram");let c=n.createElementNS(Bh,"svg");c.setAttribute("class","holo__leaders"),c.setAttribute("aria-hidden","true");let h=o("div","holo__labels");h.setAttribute("aria-hidden","true");let f=o("div","holo__notice");f.hidden=!0;let d=o("p","holo__notice-text"),u=o("button","holo__notice-btn","Restart 3D view");u.type="button",u.hidden=!0,f.append(d,u),a.append(l,c,h,f),i.append(a);let m=null;function x(){let S=new El({canvas:l,antialias:e.antialias!==!1,alpha:!1,depth:!1,stencil:!1,powerPreference:"default",preserveDrawingBuffer:!1});return S.setClearColor(132619,1),S.autoClear=!0,S}try{m=x()}catch{m=null}if(!m)return d.textContent="This device could not start the 3D view.",f.hidden=!1,queueMicrotask(()=>e.onState({ready:!1,error:"webgl"})),Py(a);let p=new xr,g=new on(os,1,1,1e6),_=new qn;p.add(_);let M={uTime:{value:0},uReveal:{value:zh},uFade:{value:new Lt(1,2)},uScanY:{value:0},uScanW:{value:1},uFlicker:{value:1},uRows:{value:1}},y=new Ue;y.setAttribute("position",new Ne(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));let T=new fn({uniforms:{uRes:{value:new Lt(1,1)},uCenter:{value:new Lt(.5,.5)}},vertexShader:np,fragmentShader:ip,depthTest:!1,depthWrite:!1}),A=new _n(y,T);A.frustumCulled=!1,A.renderOrder=-10,p.add(A);let v=new Ki(1,1);v.rotateX(-Math.PI/2);let b=new fn({uniforms:{uCell:{value:1},uR:{value:1},uColor:{value:new G(.24,.82,1)},uTime:M.uTime,uVis:{value:0},uGrid:{value:1},uFade:M.uFade,uCenterW:{value:new G}},vertexShader:sp,fragmentShader:rp,transparent:!0,depthTest:!1,depthWrite:!1,blending:Hs,side:xn}),N=!0,I=new _n(v,b);I.frustumCulled=!1,I.renderOrder=-5,I.visible=!1,p.add(I);let P=new Map,O=null,V=!1,R=!1,B=!1,k=!1,L=0,W=0,U=1,X=1,j=0,_t=0,Dt={top:0,right:0,bottom:0,left:0,...e.insets||{}},Z=Ry("(prefers-reduced-motion: reduce)",()=>{Z.matches&&!Gt&&(xt=!1),be(),ln()},s),ot=e.labels!==!1,xt=e.autoRotate!==!1&&!Z.matches,Gt=!1,tt={target:new G,radius:10,theta:135*pn,phi:66*pn},Jt=ps,se=null,lt="auto",ee=null,gt={theta:0,phi:0},K=e.rotateAfterMs>0?performance.now()-kh+e.rotateAfterMs:-1/0,ft=performance.now(),ht=1,dt=0,mt=0,Bt=null,It=!1,Zt=null,Q=null,yt=null,D=null,Vt=0,Nt=new Map,Qt=performance.now(),ut=()=>(performance.now()-Qt)/1e3,Kt={frames:0,shapesBuilt:0,shapesRebuilt:0,partsCreated:0,labelMs:0,hullUpgrades:0,hullRescaled:0,detailRebuilt:0},At=-1/0;function Pt(S){return lp[S]||lp.primary}function C(S){let F=Pt(S),$=()=>({uColor:{value:new G(...F.color)},uVis:{value:1},uSel:{value:0},uHover:{value:0},uTime:M.uTime,uReveal:M.uReveal,uFade:M.uFade,uScanY:M.uScanY,uScanW:M.uScanW,uFlicker:M.uFlicker,uRows:M.uRows}),nt={transparent:!0,depthTest:!1,depthWrite:!1,blending:Hs},Tt=new fn({...nt,side:xn,uniforms:{...$(),uAlpha:{value:F.fill}},vertexShader:Qd,fragmentShader:jd}),wt=new fn({...nt,uniforms:{...$(),uAlpha:{value:F.line}},vertexShader:tp,fragmentShader:ep});return{fill:Tt,line:wt}}function w(S){let F=new qn;F.name=S.id;let $=C(S.tone),nt={key:S.key,part:S,group:F,mats:$,fill:null,lines:null,chunks:[],born:[],box:null,center:new G,size:0,autoOffset:new G,vis:1,visGoal:1,sel:0,selGoal:0,hov:0,hovGoal:0,label:null};return _.add(F),P.set(S.key,nt),Kt.partsCreated++,fo(nt),nt}function q(){let S=O?$h(O):null;return S?zl(Math.hypot(S.size[0],S.size[1],S.size[2])):0}function vt(S){for(let F of P.values())if(F.part.id===S)return F.part.shapes.filter($=>$.type==="hull");return[]}function it(S,F,$){return{level:S||0,hullMode:F||null,scale:$||0,hosts:vt}}function St(){let S=0;for(let F of P.values())for(let $ of F.chunks)S+=$.chunk.indices.length/3;return S}function Et(S,F,$,nt,Tt){let wt=F.map(Mt=>JSON.stringify(Mt)),bt=0;for(;bt<S.chunks.length&&bt<wt.length&&S.chunks[bt].sig===wt[bt];)bt++;if(bt===S.chunks.length&&bt===wt.length)return!1;Kt.shapesRebuilt+=S.chunks.length-bt,S.chunks.length=bt,S.born.length=bt;let pt=Tt.size();for(let Mt=bt;Mt<F.length;Mt++){let oe=St(),{level:ne,hullMode:Fe}=Wd(F[Mt],oe,pt),Te=Ks(F[Mt],it(ne,Fe,pt));S.chunks.push({sig:wt[Mt],chunk:Te,lod:ne,lodBudget:Fh(oe),scale:pt,wait:null}),Kt.shapesBuilt++;let ve=$+nt*(Mt-bt);S.born.push(ve),ve>At&&(At=ve)}return Ct(S),!0}let st=new Set,at=0;function Ft(S){B||(st.add(S),at||(at=s.setTimeout(z,30)))}function z(){at=0;let S=new Set(st);st.clear(),ct(S)}function ct(S){if(B)return;let F=Rt(),$=!1,nt=!1;for(let bt of P.values())bt.box&&(nt=!0);let Tt=ut(),wt=e.reveal!==!1&&!Z.matches;for(let bt of P.values()){let pt=!1;bt.chunks.forEach((Mt,oe)=>{let ne=bt.part.shapes[oe];if(!ne)return;if(Mt.wait&&S.has(Mt.wait.key)){let ve=Ks(ne,it(Mt.lod,Mt.wait.mode,Mt.wait.scale));if(ve.level!==Mt.wait.level)return;let Ee=Mt.chunk.vertexCount||Mt.chunk.lineVertexCount,cn=ve.vertexCount||ve.lineVertexCount;if(Ee&&!cn){Mt.wait=null;return}!Ee&&cn&&(bt.born[oe]=wt?Tt:-1e4,bt.born[oe]>At&&(At=bt.born[oe])),Mt.chunk=ve,Mt.scale=Mt.wait.scale,Mt.wait=null,Kt.hullRescaled++,pt=!0;return}if(!Mt.chunk.asyncKey||!S.has(Mt.chunk.asyncKey)||Mt.chunk.done)return;let Fe=!Mt.chunk.vertexCount&&!Mt.chunk.lineVertexCount,Te=Ks(ne,it(Mt.lod,Mt.chunk.hullMode,Mt.scale));Te.level===Mt.chunk.level&&Te.done===Mt.chunk.done||(Mt.chunk=Te,Kt.hullUpgrades++,Fe&&(Te.vertexCount||Te.lineVertexCount)&&(bt.born[oe]=wt?Tt:-1e4,bt.born[oe]>At&&(At=bt.born[oe])),pt=!0)}),pt&&(Ct(bt),$=!0)}$?(Ge(),js(),!nt&&P.size&&lt!=="user"?us():P.size&&(lt==="auto"||lt==="part")&&Mi(!0),be(),ln()):F&&!Rt()&&ln(),Rt()||de()}let rt=Ed(Ft);function zt(){let S={hulls:0,panels:0,pending:0,empty:0,coarse:0};for(let F of P.values())F.chunks.forEach(($,nt)=>{if(!$.chunk.asyncKey)return;(F.part.shapes[nt]&&F.part.shapes[nt].type)==="hull"?S.hulls++:S.panels++,$.chunk.done||S.pending++,!$.chunk.vertexCount&&!$.chunk.lineVertexCount&&S.empty++,$.chunk.level==="coarse"&&S.coarse++});return S}function Rt(){for(let S of P.values())for(let F of S.chunks)if(F.chunk.asyncKey&&!F.chunk.done||F.wait)return!0;return!1}function Ot(S){if(S>0)for(let F of P.values()){let $=!1;F.chunks.forEach((nt,Tt)=>{let wt=F.part.shapes[Tt];if(!wt)return;if(nt.chunk.asyncKey){if(nt.scale===S||nt.wait&&nt.wait.scale===S)return;let pt=nt.chunk.hullMode==="coarse"?"coarse":"fine",Mt=Ks(wt,it(nt.lod,pt,S));Mt.level===pt&&Mt.done?(nt.chunk=Mt,nt.scale=S,nt.wait=null,Kt.hullRescaled++,$=!0):nt.wait={key:Mt.asyncKey,scale:S,mode:pt,level:pt};return}if(!Hd(wt))return;let bt=Math.max(nt.lodBudget||0,Uh(wt,S));bt!==nt.lod&&(nt.chunk=Ks(wt,it(bt,null,S)),nt.lod=bt,nt.scale=S,Kt.detailRebuilt++,$=!0)}),$&&Ct(F)}}let ie=[];function de(){let S=ie;ie=[];for(let F of S)F(!0)}function Ct(S){let F=Xd(S.chunks.map($=>$.chunk),S.born);if(F.fill?S.fill?(S.fill.geometry.dispose(),S.fill.geometry=F.fill):(S.fill=new _n(F.fill,S.mats.fill),S.fill.userData.rec=S,S.fill.frustumCulled=!1,S.group.add(S.fill)):S.fill&&(S.fill.geometry.dispose(),S.group.remove(S.fill),S.fill=null),F.lines?S.lines?(S.lines.geometry.dispose(),S.lines.geometry=F.lines):(S.lines=new Mr(F.lines,S.mats.line),S.lines.frustumCulled=!1,S.group.add(S.lines)):S.lines&&(S.lines.geometry.dispose(),S.group.remove(S.lines),S.lines=null),S.box=F.box,S.support=F.support,S.box){let{min:$,max:nt}=S.box;S.center.set(($[0]+nt[0])/2,($[1]+nt[1])/2,($[2]+nt[2])/2),S.size=Math.hypot(nt[0]-$[0],nt[1]-$[1],nt[2]-$[2])/2}}function re(S){S.fill&&S.fill.geometry.dispose(),S.lines&&S.lines.geometry.dispose(),S.mats.fill.dispose(),S.mats.line.dispose(),_.remove(S.group),S.label&&(S.label.el.remove(),S.label.line.remove(),S.label.dot.remove()),Nt.delete(S.key)}function me(S,F){let $=Pt(F);S.mats.fill.uniforms.uColor.value.set(...$.color),S.mats.line.uniforms.uColor.value.set(...$.color),S.mats.fill.uniforms.uAlpha.value=$.fill,S.mats.line.uniforms.uAlpha.value=$.line}function Ht(S,F){let $=S.part.anchor;return $?F.set($[0],$[1],$[2]):F.copy(S.center),F.add(S.group.position)}function Re(S,{final:F}){let $=P.size===0;O=S,l.setAttribute("aria-label",S.title?`Hologram of ${S.title}, ${S.parts.length} parts`:"Hologram");let nt=ut(),Tt=e.reveal!==!1&&!Z.matches,wt=new Set,bt=S.parts.reduce((ve,Ee)=>ve+(P.has(Ee.key)?0:Ee.shapes.length),0),pt=Tt&&bt>1&&!V?Math.min(.045,1.6/bt):0,Mt=Tt?nt:-1e4,oe=!1,ne=null,Fe={size:()=>ne===null?ne=q():ne};for(let ve of S.parts){wt.add(ve.key);let Ee=P.get(ve.key);if(Ee?(Ee.part.tone!==ve.tone&&me(Ee,ve.tone),Ee.part=ve,Ee.group.name=ve.id):(Ee=w(ve),oe=!0),po(Ee),ve.shapes.length){let cn=Ee.chunks.length;Et(Ee,ve.shapes,Mt,pt,Fe)&&(oe=!0),pt&&(Mt+=pt*Math.max(0,ve.shapes.length-cn))}}if(F){for(let[ve,Ee]of Array.from(P))wt.has(ve)||(re(Ee),P.delete(ve),oe=!0);Ot(Fe.size()),Q&&!P.has(Q)&&(Q=null),D&&!P.has(D)&&(D=null)}let Te=S.view||ps;$&&P.size?(uo(Te),Zt=Te,lt="auto"):P.size&&!It&&Te!==Zt&&(Zt=Te,fs(Te,!0,!1)),Ge(),js(),oe&&P.size&&($?us():lt==="auto"&&Mi(!0)),Ai(),be(),ln(),ie.length&&!Rt()&&de()}function Ge(){let S=cs();if(!S)return;let F=new G((S.min[0]+S.max[0])/2,(S.min[1]+S.max[1])/2,(S.min[2]+S.max[2])/2),$=Math.max(1e-6,Math.hypot(S.max[0]-S.min[0],S.max[1]-S.min[1],S.max[2]-S.min[2])/2);for(let nt of P.values()){if(nt.part.explode||!nt.box){nt.autoOffset.set(0,0,0);continue}let Tt=nt.center.clone().sub(F),wt=Tt.length();wt<$*.05?nt.autoOffset.set(0,0,0):nt.autoOffset.copy(Tt.multiplyScalar($*.5/wt))}}function yn(S,F,$){let nt=S.part.explode;return nt?$.set(nt[0]*F,nt[1]*F,nt[2]*F):$.copy(S.autoOffset).multiplyScalar(F)}function cs(){return ni(0,!1)}function ni(S,F=!0,$=null){let nt=[1/0,1/0,1/0],Tt=[-1/0,-1/0,-1/0],wt=new G;for(let bt of P.values())if(bt.box&&!($&&bt.key!==$)&&!(F&&!$&&D&&bt.key!==D)){yn(bt,S,wt);for(let pt=0;pt<3;pt++){let Mt=pt===0?wt.x:pt===1?wt.y:wt.z;bt.box.min[pt]+Mt<nt[pt]&&(nt[pt]=bt.box.min[pt]+Mt),bt.box.max[pt]+Mt>Tt[pt]&&(Tt[pt]=bt.box.max[pt]+Mt)}}return Number.isFinite(nt[0])?{min:nt,max:Tt}:null}function hs(S=L,F=W,$=Dt){let nt=Math.min($.left||0,S*.45),Tt=Math.min($.right||0,S*.45),wt=Math.min($.top||0,F*.4),bt=Math.min($.bottom||0,Math.max(0,F*.66-wt));return{left:nt,right:Tt,top:wt,bottom:bt,w:Math.max(1,S-nt-Tt),h:Math.max(1,F-wt-bt)}}function ho(S,F,$=W,nt=hs()){let Tt=(S.min[0]+S.max[0])/2,wt=(S.min[1]+S.max[1])/2,bt=(S.min[2]+S.max[2])/2,pt=(S.max[0]-S.min[0])/2,Mt=(S.max[1]-S.min[1])/2,oe=(S.max[2]-S.min[2])/2,ne=Math.max(1e-6,Math.hypot(pt,oe)),Fe=Math.tan(os*pn/2),Te=.9,ve=ne*$/(Fe*nt.w*Te),cn=(Mt*Math.sin(F)+ne*Math.abs(Math.cos(F)))*$/(Fe*nt.h*Te),oi=Math.max(ve,cn)+ne*.3;return{target:new G(Tt,wt,bt),radius:oi,rxz:ne}}function Qs(S,F,$=dt,nt=null,Tt=W,wt=hs()){let bt=Math.sin(F),pt=new G(bt*Math.sin(S),Math.cos(F),bt*Math.cos(S)),Mt=new G().crossVectors(new G(0,1,0),pt);Mt.lengthSq()<1e-8&&Mt.set(Math.cos(S),0,-Math.sin(S)),Mt.normalize();let oe=new G().crossVectors(pt,Mt).normalize(),ne=[],Fe=new G;for(let Xe of P.values()){if(!Xe.box||(nt?Xe.key!==nt:D&&Xe.key!==D))continue;yn(Xe,$,Fe);let We=Xe.support;if(We)for(let nn=0;nn<We.length;nn+=3)ne.push(new G(We[nn]+Fe.x,We[nn+1]+Fe.y,We[nn+2]+Fe.z));else{let{min:nn,max:nr}=Xe.box;for(let Ti=0;Ti<8;Ti++)ne.push(new G(Ti&1?nr[0]:nn[0],Ti&2?nr[1]:nn[1],Ti&4?nr[2]:nn[2]).add(Fe))}}if(!ne.length)return null;let Te=1/0,ve=-1/0,Ee=1/0,cn=-1/0;for(let Xe of ne){let We=Xe.dot(Mt),nn=Xe.dot(oe);We<Te&&(Te=We),We>ve&&(ve=We),nn<Ee&&(Ee=nn),nn>cn&&(cn=nn)}let oi=(Te+ve)/2,ai=(Ee+cn)/2,ds=0;for(let Xe of ne)ds+=Xe.dot(pt);ds/=ne.length;let yo=Mt.clone().multiplyScalar(oi).addScaledVector(oe,ai).addScaledVector(pt,ds),le=Tt/(2*Math.tan(os*pn/2)),ue=.88,en=wt.w/2*ue,mn=wt.h/2*ue,Ze=0,Dn=0;for(let Xe of ne){let We=Xe.clone().sub(yo),nn=Math.abs(We.dot(Mt)),nr=Math.abs(We.dot(oe)),Ti=We.dot(pt);Ze=Math.max(Ze,Ti+nn*le/en,Ti+nr*le/mn),Dn=Math.max(Dn,Math.hypot(We.x,We.z))}return{target:yo,radius:Math.max(Ze,1e-6),rxz:Math.max(Dn,1e-6)}}function ii(S){return S.radius=Math.max(S.radius*1.25,ht*.3),S}function Rn(S=ri()?"orbit":"view",F=tt.theta,$=tt.phi){let nt=lt==="part"&&ee&&P.has(ee)?ee:null,Tt;if(S==="orbit"){let wt=nt?ni(dt,!0,nt):ni(dt,!0);Tt=wt?ho(wt,$):null}else Tt=Qs(F,$,dt,nt);return Tt&&nt&&ii(Tt),Tt}function us(){let S=Rn();S&&(tt.target.copy(S.target),tt.radius=S.radius,se=null,ht=Math.max(ht,S.rxz))}function Mi(S){let F=se&&se.to?se.to:null,$=F&&F.theta!==void 0?F.theta:tt.theta,nt=F&&F.phi!==void 0?F.phi:tt.phi,Tt=Rn(ri()?"orbit":"view",$,nt);if(!Tt)return;let wt={target:Tt.target,radius:Tt.radius};F&&F.theta!==void 0&&(wt.theta=F.theta),F&&F.phi!==void 0&&(wt.phi=F.phi),Si(wt,S)}function Si(S,F=!0){if(!F||Z.matches){S.target&&tt.target.copy(S.target),S.radius!==void 0&&(tt.radius=S.radius),S.theta!==void 0&&(tt.theta=S.theta),S.phi!==void 0&&(tt.phi=S.phi),se=null,be();return}let $={target:tt.target.clone(),radius:tt.radius,theta:tt.theta,phi:tt.phi};se={from:$,to:{target:S.target?S.target.clone():null,radius:S.radius,theta:S.theta===void 0?void 0:$.theta+Ty(S.theta-$.theta),phi:S.phi},start:performance.now(),dur:_y},be()}function uo(S){let F=as[S]||as[ps];Jt=as[S]?S:ps,tt.theta=F[0]*pn,tt.phi=F[1]*pn}function fs(S,F=!0,$=!0){if(!as[S])return!1;$&&(It=!0),Jt=S;let[nt,Tt]=as[S],wt=Tt*pn,bt={theta:nt*pn,phi:wt};lt==="user"&&(lt="auto");let pt=Rn("view",bt.theta,wt);return pt&&(bt={...bt,target:pt.target,radius:pt.radius}),xe(),Si(bt,F),ln(),!0}function bi(){if(!L||!W)return;let S=hs(),F=S.left+S.w/2,$=S.top+S.h/2,nt=F-L/2,Tt=$-W/2,wt=L+2*Math.abs(nt),bt=W+2*Math.abs(Tt),pt=wt/2-F,Mt=bt/2-$;g.aspect=wt/bt,g.fov=2*Math.atan(Math.tan(os*pn/2)*(bt/W))/pn,g.setViewOffset(wt,bt,pt,Mt,L,W),g.updateProjectionMatrix(),T.uniforms.uRes.value.set(L*U,W*U),T.uniforms.uCenter.value.set(F*U,(W-$)*U)}function wi(){if(B)return;let S=a.getBoundingClientRect(),F=Math.round(S.width),$=Math.round(S.height),nt=Math.max(1,Math.min(e.maxDpr||op,Math.max(1,s.devicePixelRatio||1))*X);F===L&&$===W&&nt===U||(L=F,W=$,U=nt,F>0&&$>0&&m&&(m.setPixelRatio(U),m.setSize(F,$,!1),bi(),P.size&&lt==="auto"&&us()),Gi(),be())}function fo(S){let F=o("div","holo-label");F.dataset.key=S.key;let $=o("span","holo-label__text");F.append($),h.append(F);let nt=n.createElementNS(Bh,"line");nt.setAttribute("class","holo-leader"),nt.setAttribute("data-key",S.key);let Tt=n.createElementNS(Bh,"circle");Tt.setAttribute("class","holo-anchor"),Tt.setAttribute("data-key",S.key),Tt.setAttribute("r","2.2"),c.append(nt,Tt),S.label={el:F,text:$,line:nt,dot:Tt,w:0,h:0,name:null,shown:!1,state:""}}function po(S){let F=S.part.name||"";S.label.name!==F&&(S.label.name=F,S.label.text.textContent=F,S.label.w=0)}function Vl(){let S=[],F=new G,$=hs(),nt={left:$.left+4,top:$.top+4,right:L-$.right-4,bottom:W-$.bottom-4};for(let le of P.values()){let ue=le.label;ue.name&&ue.w===0&&(ue.w=Math.ceil(ue.el.offsetWidth),ue.h=Math.ceil(ue.el.offsetHeight))}let Tt=[],wt=new G,bt=1/0,pt=1/0,Mt=-1/0,oe=-1/0;for(let le of P.values()){if(!le.box||le.vis<.3||D&&le.key!==D)continue;yn(le,dt,wt);let ue=1/0,en=1/0,mn=-1/0,Ze=-1/0;for(let Dn=0;Dn<8;Dn++){F.set(Dn&1?le.box.max[0]:le.box.min[0],Dn&2?le.box.max[1]:le.box.min[1],Dn&4?le.box.max[2]:le.box.min[2]).add(wt).project(g);let Xe=(F.x*.5+.5)*L,We=(-F.y*.5+.5)*W;Xe<ue&&(ue=Xe),Xe>mn&&(mn=Xe),We<en&&(en=We),We>Ze&&(Ze=We)}ue<bt&&(bt=ue),en<pt&&(pt=en),mn>Mt&&(Mt=mn),Ze>oe&&(oe=Ze),(mn-ue)*(Ze-en)<L*W*.12&&Tt.push([ue,en,mn,Ze])}let ne=ut();for(let le of P.values()){let ue=le.label,en=le.born.length&&ne>=le.born[0]+zh*.4;if(!(ot&&ue.name&&le.box&&en&&le.vis>.3&&(!D||le.key===D))||(Ht(le,F).project(g),F.z>1||F.z<-1))continue;let Ze=(F.x*.5+.5)*L,Dn=(-F.y*.5+.5)*W,Xe=W/(2*Math.max(1e-6,g.position.distanceTo(Ht(le,new G)))*Math.tan(os*pn/2));S.push({id:le.key,x:Ze,y:Dn,w:ue.w,h:ue.h,priority:le.size*Xe+(le.key===yt?1e6:0),pinned:le.key===Q})}let Fe=Number.isFinite(bt)?{x:(bt+Mt)/2,y:(pt+oe)/2}:{x:L/2,y:W/2},Te=S.length,ve=0;for(let le of S)(le.pinned||le.x>=nt.left-1&&le.x<=nt.right+1&&le.y>=nt.top-1&&le.y<=nt.bottom+1)&&(S[ve++]=le);S.length=ve;let Ee=(nt.right-nt.left)*(nt.bottom-nt.top),cn=ap+(by-ap)*dt,oi=D?1/0:Math.round(Math.max(wy,Ee/cn));S.length>oi&&(S.sort((le,ue)=>(ue.pinned?1:0)-(le.pinned?1:0)||ue.priority-le.priority),S.length=oi);let ai=80+130*(1-dt),ds=Jd(S,nt,{center:Fe,previous:Nt,avoid:Tt,maxCost:Ay,coverCost:ai}),yo=new Map(S.map(le=>[le.id,le]));Vt=Te-ds.size;for(let le of P.values()){let ue=le.label,en=ds.get(le.key);if(!en){ue.shown&&(ue.shown=!1,ue.el.classList.remove("is-shown"),ue.line.style.display="none",ue.dot.style.display="none"),Nt.delete(le.key);continue}Nt.set(le.key,en.slot);let mn=yo.get(le.key);ue.el.style.transform=`translate(${Math.round(en.x)}px, ${Math.round(en.y)}px)`,ue.shown||(ue.shown=!0,ue.el.classList.add("is-shown"),ue.line.style.display="",ue.dot.style.display="");let Ze=le.key===Q?"sel":le.key===yt?"hov":"";Ze!==ue.state&&(ue.state=Ze,ue.el.classList.toggle("is-selected",Ze==="sel"),ue.el.classList.toggle("is-hover",Ze==="hov"),ue.line.classList.toggle("is-selected",Ze==="sel"),ue.dot.classList.toggle("is-selected",Ze==="sel")),ue.line.setAttribute("x1",mn.x.toFixed(1)),ue.line.setAttribute("y1",mn.y.toFixed(1)),ue.line.setAttribute("x2",en.lx.toFixed(1)),ue.line.setAttribute("y2",en.ly.toFixed(1)),ue.dot.setAttribute("cx",mn.x.toFixed(1)),ue.dot.setAttribute("cy",mn.y.toFixed(1))}}function Hl(){for(let S of P.values()){let F=S.label;F.shown&&(F.shown=!1,F.el.classList.remove("is-shown"),F.line.style.display="none",F.dot.style.display="none")}}function js(){let S=ni(dt,!0);if(!S){I.visible=!1;return}let F=(S.min[0]+S.max[0])/2,$=(S.min[2]+S.max[2])/2,nt=Math.hypot(S.max[0]-S.min[0],S.max[2]-S.min[2])/2,Tt=cs()||S,wt=Math.hypot(Tt.max[0]-Tt.min[0],Tt.max[2]-Tt.min[2])/2,bt=Math.max(wt*1.12,nt*.7),pt=S.min[1]-Math.max(nt,S.max[1]-S.min[1])*.03;I.position.set(F,pt,$),I.scale.set(bt*3.2,1,bt*3.2),b.uniforms.uR.value=bt,b.uniforms.uCell.value=Ey(bt/5),b.uniforms.uCenterW.value.set(F,pt,$),I.visible=N}function Ai(){for(let S of P.values()){let F=1;D&&S.key!==D?F=0:Q&&S.key!==Q&&!D&&(F=.38),S.visGoal=F,S.selGoal=S.key===Q?1:0,S.hovGoal=S.key===yt&&S.key!==Q?1:0}b.uniforms.uVis.value=1,be()}function E(S){if(S==null)return null;for(let F of P.values())if(F.part.id===S||F.key===S)return F.key}function H(S){if(!S)return null;let F=S.part,$=O&&F.group?O.groups.find(nt=>nt.id===F.group):null;return{id:F.id,name:F.name,group:F.group,groupName:$?$.name:"",tone:F.tone,info:F.info,material:F.material,aka:F.aka.slice()}}function et(S,{notify:F=!0}={}){S!==Q&&(Q=S,S&&xe(),Ai(),F&&e.onSelect(S?P.get(S).part.id:null,S?H(P.get(S)):null),ln())}let Y=new Vr,J=new Lt,Ut=null;function jt(S){let F=S.group.position;return{min:[S.box.min[0]+F.x,S.box.min[1]+F.y,S.box.min[2]+F.z],max:[S.box.max[0]+F.x,S.box.max[1]+F.y,S.box.max[2]+F.z]}}let kt=S=>Math.max(1e-9,(S.max[0]-S.min[0])*(S.max[1]-S.min[1])*(S.max[2]-S.min[2]));function Wt(S,F){if(!L||!W)return null;J.set(S/L*2-1,-(F/W)*2+1),Y.setFromCamera(J,g);let $=[];for(let pt of P.values())pt.fill&&pt.group.visible&&pt.visGoal>.05&&$.push(pt.fill);let nt=Y.intersectObjects($,!1),Tt=[];for(let pt of nt){let Mt=pt.object.userData.rec;Mt&&!Tt.includes(Mt)&&Tt.push(Mt)}if(!Tt.length)return null;let wt=Tt[0];for(let pt=1;pt<Tt.length;pt++){let Mt=Tt[pt],oe=jt(wt),ne=jt(Mt);[(ne.min[0]+ne.max[0])/2,(ne.min[1]+ne.max[1])/2,(ne.min[2]+ne.max[2])/2].every((ve,Ee)=>ve>=oe.min[Ee]&&ve<=oe.max[Ee])&&kt(ne)<kt(oe)*.6&&(wt=Mt)}let bt=performance.now();if(Ut&&Math.hypot(Ut.x-S,Ut.y-F)<14&&bt-Ut.t<5e3&&Q){let pt=Tt.findIndex(Mt=>Mt.key===Q);pt>=0&&(wt=Tt[(pt+1)%Tt.length])}return Ut={x:S,y:F,t:bt},wt}let Yt=new Map,Xt=null;function ge(S){let F=a.getBoundingClientRect();return[S.clientX-F.left,S.clientY-F.top]}function $t(){K=performance.now()}function xe(){K=performance.now()}function Oe(S){if(B||k||S.target&&S.target.closest&&S.target.closest(".holo__notice"))return;let[F,$]=ge(S);Yt.set(S.pointerId,{x:F,y:$});try{a.setPointerCapture(S.pointerId)}catch{}if(gt.theta=0,gt.phi=0,se=null,$t(),Yt.size===1)Xt={mode:S.button===2||S.shiftKey||S.ctrlKey?"pan":"rotate",moved:!1,startX:F,startY:$,startT:performance.now(),touch:S.pointerType!=="mouse",target:S.target,lastT:performance.now()};else if(Yt.size===2){let[nt,Tt]=Array.from(Yt.values());Xt={mode:"pinch",moved:!0,pinchDist:Math.hypot(nt.x-Tt.x,nt.y-Tt.y),midX:(nt.x+Tt.x)/2,midY:(nt.y+Tt.y)/2,touch:!0}}be()}function Le(S){if(B)return;let F=Yt.get(S.pointerId),[$,nt]=ge(S);if(!F){S.pointerType==="mouse"&&!k&&si($,nt);return}let Tt=$-F.x,wt=nt-F.y;if(F.x=$,F.y=nt,!Xt)return;if(Xt.mode==="pinch"){if(Yt.size<2)return;let[Mt,oe]=Array.from(Yt.values()),ne=Math.hypot(Mt.x-oe.x,Mt.y-oe.y),Fe=(Mt.x+oe.x)/2,Te=(Mt.y+oe.y)/2;Xt.pinchDist>0&&ne>0&&te(Xt.pinchDist/ne),Ke(Fe-Xt.midX,Te-Xt.midY),Xt.pinchDist=ne,Xt.midX=Fe,Xt.midY=Te,$t(),be();return}if(!Xt.moved){let Mt=Xt.touch?Sy:My;if(Math.hypot($-Xt.startX,nt-Xt.startY)<Mt)return;Xt.moved=!0,It=!0}let bt=performance.now(),pt=Math.max(.001,(bt-Xt.lastT)/1e3);if(Xt.lastT=bt,Xt.mode==="pan")Ke(Tt,wt);else{let Mt=Math.PI/Math.max(320,Math.min(L,W))*1.15;tt.theta-=Tt*Mt,tt.phi=Math.min(Math.PI-.01,Math.max(.01,tt.phi-wt*Mt)),gt.theta=-Tt*Mt/pt,gt.phi=-wt*Mt/pt,Jt=""}$t(),be()}function Ce(S){if(B)return;let F=Yt.has(S.pointerId);Yt.delete(S.pointerId);try{a.releasePointerCapture(S.pointerId)}catch{}if(!F||!Xt)return;if(Xt.mode==="pinch"){if(Yt.size===1){let[nt]=Array.from(Yt.values());Xt={mode:"rotate",moved:!0,startX:nt.x,startY:nt.y,startT:performance.now(),touch:!0,lastT:performance.now()}}else Xt=null;gt.theta=0,gt.phi=0;return}let $=Xt;if(Xt=null,!$.moved&&S.type==="pointerup"&&performance.now()-$.startT<900){let[nt,Tt]=ge(S),wt=$.target&&$.target.closest?$.target.closest(".holo-label"):null;if(wt&&P.has(wt.dataset.key))et(wt.dataset.key);else{let bt=Wt(nt,Tt);et(bt?bt.key:null)}gt.theta=0,gt.phi=0}else($.mode!=="rotate"||performance.now()-$.lastT>80)&&(gt.theta=0,gt.phi=0);be()}function Ye(S){if(B||k)return;S.preventDefault();let F=S.deltaMode===1?16:S.deltaMode===2?400:1;te(Math.exp(S.deltaY*F*.0012)),$t(),be()}function te(S){It=!0;let F=Math.min(4,Math.max(.25,S)),$=Rn("orbit"),nt=($?$.radius:tt.radius)*3,Tt=Math.max(ht*.06,.001);tt.radius=Math.min(nt,Math.max(Tt,tt.radius*F)),lt="user",se=null}function Ke(S,F){if(!S&&!F)return;It=!0;let $=2*tt.radius*Math.tan(os*pn/2)/Math.max(1,W),nt=new G().setFromMatrixColumn(g.matrixWorld,0),Tt=new G().setFromMatrixColumn(g.matrixWorld,1);tt.target.addScaledVector(nt,-S*$).addScaledVector(Tt,F*$),lt="user",se=null}let Me=null;function si(S,F){Xt||(Me=[S,F],be())}function Qe(){if(!Me)return;let[S,F]=Me;if(Me=null,!L||!W)return;J.set(S/L*2-1,-(F/W)*2+1),Y.setFromCamera(J,g);let $=[];for(let wt of P.values())wt.fill&&wt.visGoal>.05&&$.push(wt.fill);let nt=Y.intersectObjects($,!1)[0],Tt=nt?nt.object.userData.rec.key:null;Tt!==yt&&(yt=Tt,a.classList.toggle("is-pointing",!!Tt),Ai())}function ki(){yt&&(yt=null,a.classList.remove("is-pointing"),Ai())}function Nn(S){if(B||k)return;let[F,$]=ge(S),nt=Wt(F,$);nt?Yh(nt.key):Zh()}let Hn=S=>S.preventDefault();a.addEventListener("pointerdown",Oe),a.addEventListener("pointermove",Le),a.addEventListener("pointerup",Ce),a.addEventListener("pointercancel",Ce),a.addEventListener("pointerleave",ki),a.addEventListener("wheel",Ye,{passive:!1}),a.addEventListener("contextmenu",Hn),a.addEventListener("dblclick",Nn);let pe=0,ke=!0,Ve=0,Ie=!1,He=!0;function be(){ke=!0,Ie&&!pe&&!B&&(pe=s.requestAnimationFrame(Wl))}function ri(){if(!xt||Z.matches&&!Gt||Xt||Q||se||!P.size)return!1;let S=performance.now(),F=S-Math.max(K,ft);return S-K>kh&&F<vy}let tr=0;function hp(){if(s.clearTimeout(tr),tr=0,B||!xt||Z.matches&&!Gt)return;let S=K+kh-performance.now();!(S>0)||!Number.isFinite(S)||(tr=s.setTimeout(()=>{tr=0,be()},Math.ceil(S)+20))}function up(S,F){let $=!1,nt=ut();if(M.uTime.value=nt,se){let pt=Math.min(1,(F-se.start)/se.dur),Mt=cp(pt),oe=se.from,ne=se.to;ne.target&&tt.target.lerpVectors(oe.target,ne.target,Mt),ne.radius!==void 0&&(tt.radius=oe.radius+(ne.radius-oe.radius)*Mt),ne.theta!==void 0&&(tt.theta=oe.theta+(ne.theta-oe.theta)*Mt),ne.phi!==void 0&&(tt.phi=oe.phi+(ne.phi-oe.phi)*Mt),pt>=1&&(se=null),$=!0}if(!Xt&&(Math.abs(gt.theta)>.001||Math.abs(gt.phi)>.001)){tt.theta+=gt.theta*S,tt.phi=Math.min(Math.PI-.01,Math.max(.01,tt.phi+gt.phi*S));let pt=Math.exp(-S*4.5);gt.theta*=pt,gt.phi*=pt,$=!0}if(Bt){let pt=Math.min(1,(F-Bt.start)/Bt.dur);if(dt=Bt.from+(Bt.to-Bt.from)*cp(pt),lt==="auto"||lt==="part"){let Mt=Rn();if(Mt&&!se){let oe=pt>=1?1:Math.min(1,S*8);tt.target.lerp(Mt.target,oe),tt.radius+=(Mt.radius-tt.radius)*oe}}pt>=1&&(Bt=null),$=!0}else if((lt==="auto"||lt==="part")&&!se&&!Xt&&ri()){let pt=Rn("orbit");pt&&(Math.abs(pt.radius-tt.radius)>pt.radius*.003||pt.target.distanceTo(tt.target)>pt.radius*.003)&&(tt.target.lerp(pt.target,Math.min(1,S*1.5)),tt.radius+=(pt.radius-tt.radius)*Math.min(1,S*1.5),$=!0)}ri()&&(tt.theta+=xy*pn*S,$=!0);let Tt=Z.matches?1:Math.min(1,S*9),wt=new G;for(let pt of P.values()){yn(pt,dt,wt),pt.group.position.equals(wt)||pt.group.position.copy(wt);for(let[Mt,oe]of[["vis","visGoal"],["sel","selGoal"],["hov","hovGoal"]]){let ne=pt[oe]-pt[Mt];Math.abs(ne)>.003?(pt[Mt]+=ne*Tt,$=!0):pt[Mt]=pt[oe]}pt.mats.fill.uniforms.uVis.value=pt.vis,pt.mats.line.uniforms.uVis.value=pt.vis,pt.mats.fill.uniforms.uSel.value=pt.sel,pt.mats.line.uniforms.uSel.value=pt.sel,pt.mats.fill.uniforms.uHover.value=pt.hov,pt.mats.line.uniforms.uHover.value=pt.hov,pt.group.visible=pt.vis>.01}nt<At+zh+.05&&($=!0);let bt=ni(dt,!0);if(bt){let pt=Math.max(1e-6,bt.max[1]-bt.min[1]),Mt=5.5,oe=nt%Mt/Mt;M.uScanY.value=bt.min[1]-pt*.2+oe*pt*1.4,M.uScanW.value=pt*.035,ht=Math.max(1e-6,Math.hypot(bt.max[0]-bt.min[0],bt.max[1]-bt.min[1],bt.max[2]-bt.min[2])/2)}return M.uFlicker.value=Z.matches?1:.985+.015*Math.sin(nt*23)*Math.sin(nt*7.3),$}function Gh(){let S=Math.sin(tt.phi);g.position.set(tt.target.x+tt.radius*S*Math.sin(tt.theta),tt.target.y+tt.radius*Math.cos(tt.phi),tt.target.z+tt.radius*S*Math.cos(tt.theta)),g.up.set(0,1,0),g.lookAt(tt.target);let F=Math.max(ht,1e-6);g.near=Math.max(tt.radius*.01,tt.radius-F*6),g.far=tt.radius+F*8,g.updateProjectionMatrix(),g.updateMatrixWorld(),M.uFade.value.set(tt.radius-F*.9,tt.radius+F*1.1)}let er=[];function Wl(S){pe=0;let F=r?performance.now():S;if(!Ie||B||k)return;let $=ri();if(!(se||Bt||Xt||ke)&&$&&Ve&&F-Ve<1e3/yy-2){pe=s.requestAnimationFrame(Wl);return}let Tt=Ve?Math.min(.1,(F-Ve)/1e3):1/60;if(Ve&&(se||Bt||Xt||$)&&(j+=F-Ve,++_t>=30)){let bt=j/_t;j=0,_t=0,bt>48&&U>1.01&&(X=Math.max(.25,X-.25),wi())}Ve=F,ke=!1;let wt=up(Tt,F);Qe(),fp(),wt||ke||ri()?pe=s.requestAnimationFrame(Wl):(Ve=0,hp())}function fp(){if(!m||!L||!W)return;let S=performance.now();Gh(),js(),m.render(p,g),Kt.frames++;let F=performance.now();ot?Vl():Hl(),Kt.labelMs+=performance.now()-F;let $=performance.now()-S;er.push($),er.length>120&&(er=er.slice(-60))}function Gi(){let S=!B&&!k&&!n.hidden&&He&&L>0&&W>0&&a.isConnected&&!a.closest("[inert]");S!==Ie&&(Ie=S,Ie?(Ve=0,be()):pe&&(s.cancelAnimationFrame(pe),pe=0))}let mo=null,Vh=typeof s.ResizeObserver=="function"?s.ResizeObserver:typeof ResizeObserver=="function"?ResizeObserver:null;Vh&&(mo=new Vh(()=>wi()),mo.observe(a));let Hh=()=>wi();s.addEventListener("resize",Hh);let go=null,Wh=typeof s.IntersectionObserver=="function"?s.IntersectionObserver:typeof IntersectionObserver=="function"?IntersectionObserver:null;Wh&&(go=new Wh(S=>{He=S[S.length-1].isIntersecting,Gi()},{rootMargin:"32px"}),go.observe(a));let Xh=()=>Gi();n.addEventListener("visibilitychange",Xh);let dp=Cy(()=>Gi()),_o=0;function xo(S){S.preventDefault(),!B&&(k=!0,d.textContent="The 3D view was paused by the device. Restoring\u2026",u.hidden=!0,f.hidden=!1,Gi(),ln(),clearTimeout(_o),_o=setTimeout(()=>{k&&!B&&(d.textContent="The 3D view was paused by the device.",u.hidden=!1)},2500))}function vo(){B||(k=!1,clearTimeout(_o),f.hidden=!0,u.hidden=!0,Gi(),be(),ln())}l.addEventListener("webglcontextlost",xo,!1),l.addEventListener("webglcontextrestored",vo,!1),u.addEventListener("click",()=>pp());function pp(){try{m.dispose()}catch{}let S=o("canvas","holo__canvas");S.setAttribute("role","img"),S.setAttribute("aria-label",l.getAttribute("aria-label")||"Hologram"),l.removeEventListener("webglcontextlost",xo,!1),l.removeEventListener("webglcontextrestored",vo,!1),S.addEventListener("webglcontextlost",xo,!1),S.addEventListener("webglcontextrestored",vo,!1),l.replaceWith(S),l=S;try{m=x()}catch{d.textContent="The 3D view could not restart. Close and reopen the hologram.";return}L=0,W=0,k=!1,f.hidden=!0,wi(),be(),ln()}let Xl=!1;function ln(){Xl||B||(Xl=!0,queueMicrotask(()=>{Xl=!1,B||e.onState(qh())}))}function qh(){let S=cs();return{ready:P.size>0,building:V,title:O?O.title:"",subtitle:O?O.subtitle:"",parts:P.size,units:O?O.units:"mm",gridCell:I.visible?b.uniforms.uCell.value:null,size:S?[S.max[0]-S.min[0],S.max[1]-S.min[1],S.max[2]-S.min[2]]:null,exploded:mt,labels:ot,labelsHidden:Vt,autoRotate:xt,view:Jt,selected:Q?P.get(Q).part.id:null,isolated:D?P.get(D).part.id:null,contextLost:k,meshing:Rt(),mesher:Cd()?"worker":"main"}}function Yh(S){if(!S){ee=null,lt="auto",Mi(!0);return}et(S),ee=S,lt="part";let F=Rn("view");F&&Si({target:F.target,radius:F.radius}),ln()}function Zh(){ee=null,lt="auto",gt.theta=0,gt.phi=0,fs(O&&O.view||ps,!0)}let mp={updateSpec(S,{final:F=!1,normalized:$=!1}={}){if(B)return null;let nt=$&&S&&Array.isArray(S.parts)?{spec:S,warnings:[],stats:null,ok:!0}:ql(S,{partial:!F});return nt.spec&&(F?(V=!1,R=!0):V=!0,Re(nt.spec,{final:F})),nt},setSpec(S){if(B)return null;let F=ql(S);return F.ok&&(V||(It=!1,Zt=null),V=!1,Re(F.spec,{final:!0}),R=!0),F},explode(S=1,F=!0){let $=Math.min(1,Math.max(0,Number(S)||0));if(mt=$,lt==="user"&&(lt="auto"),!F||Z.matches){if(Bt=null,dt=$,lt==="auto"||lt==="part"){let nt=Rn("view");nt&&(tt.target.copy(nt.target),tt.radius=nt.radius)}}else Bt={from:dt,to:$,start:performance.now(),dur:gy*Math.max(.35,Math.abs($-dt))};be(),ln()},setLabels(S){ot=!!S,be(),ln()},select(S){let F=E(S);return F===void 0?!1:(et(F,{notify:!0}),be(),!0)},focus(S){let F=E(S);return F===void 0?!1:(Yh(F),!0)},isolate(S){let F=E(S);return F===void 0?!1:(D=F,F?(et(F),ee=F,lt="part"):(ee=null,lt="auto"),Ai(),Mi(!0),ln(),!0)},setView(S){return fs(S,!0)},autoRotate(S){xt=!!S,Gt=xt,xt&&(K=-1/0,ft=performance.now()),be(),ln()},resetView:Zh,zoom(S){te(S),$t(),be()},setInsets(S){Dt={top:0,right:0,bottom:0,left:0,...S},bi(),lt!=="user"&&Mi(!0),be()},snapshot({width:S=256,height:F=192,type:$="image/png",quality:nt=.85,view:Tt=null}={}){if(!m||k||!P.size)return null;S=Math.max(16,Math.round(S)),F=Math.max(16,Math.round(F));let wt=Tt&&as[Tt]?as[Tt]:null,bt=wt?wt[0]*pn:tt.theta,pt=wt?wt[1]*pn:tt.phi,Mt=new un(S,F,{samples:4}),oe=new on(os,S/F,1,1e6),ne=Qs(bt,pt,dt,D,F,{left:0,right:0,top:0,bottom:0,w:S*.96,h:F*.96});if(!ne)return Mt.dispose(),null;let Fe=Math.sin(pt);oe.position.set(ne.target.x+ne.radius*Fe*Math.sin(bt),ne.target.y+ne.radius*Math.cos(pt),ne.target.z+ne.radius*Fe*Math.cos(bt)),oe.lookAt(ne.target),oe.near=Math.max(ne.radius*.01,ne.radius-ht*6),oe.far=ne.radius+ht*8,oe.updateProjectionMatrix();let Te={time:M.uTime.value,res:T.uniforms.uRes.value.clone(),center:T.uniforms.uCenter.value.clone(),fade:M.uFade.value.clone(),flicker:M.uFlicker.value,scanY:M.uScanY.value};M.uTime.value=1e5,M.uFlicker.value=1,M.uRows.value=0,M.uScanY.value=-1e9,b.uniforms.uGrid.value=0,M.uFade.value.set(ne.radius-ht*.9,ne.radius+ht*1.1),T.uniforms.uRes.value.set(S,F),T.uniforms.uCenter.value.set(S/2,F/2);let ve=new Uint8Array(S*F*4);try{m.setRenderTarget(Mt),m.render(p,oe),m.readRenderTargetPixels(Mt,0,0,S,F,ve)}finally{m.setRenderTarget(null),Mt.dispose(),M.uTime.value=Te.time,M.uFlicker.value=Te.flicker,M.uRows.value=1,M.uScanY.value=Te.scanY,b.uniforms.uGrid.value=1,M.uFade.value.copy(Te.fade),T.uniforms.uRes.value.copy(Te.res),T.uniforms.uCenter.value.copy(Te.center)}let Ee=document.createElement("canvas");Ee.width=S,Ee.height=F;let cn=Ee.getContext("2d"),oi=cn.createImageData(S,F);for(let ai=0;ai<F;ai++)oi.data.set(ve.subarray((F-1-ai)*S*4,(F-ai)*S*4),ai*S*4);return cn.putImageData(oi,0,0),be(),$==="image/png"?Ee.toDataURL("image/png"):Ee.toDataURL($,nt)},settled(S=5e3){return B||!Rt()?Promise.resolve(!B):new Promise(F=>{let $=!1,nt=wt=>{$||($=!0,clearTimeout(Tt),F(wt))},Tt=setTimeout(()=>nt(!1),S);ie.push(nt)})},listParts(){return Array.from(P.values()).map(H)},getPart(S){let F=E(S);return F?H(P.get(F)):null},getState:qh,resize:wi,debugBench(S=30){if(!m||!L)return null;let F=m.getContext(),$=new Uint8Array(4),nt=performance.now();for(let bt=0;bt<S;bt++)tt.theta+=.01,Gh(),m.render(p,g),F.readPixels(0,0,1,1,F.RGBA,F.UNSIGNED_BYTE,$);let Tt=(performance.now()-nt)/S,wt=m.info;return{msPerFrame:Tt,drawCalls:wt.render.calls,triangles:wt.render.triangles,lines:wt.render.lines,geometries:wt.memory.geometries,programs:wt.programs?wt.programs.length:null,width:L,height:W,dpr:U}},debugToggle({fills:S=!0,lines:F=!0,floor:$=!0,background:nt=!0,doubleSided:Tt=!0}={}){for(let wt of P.values()){wt.fill&&(wt.fill.visible=S),wt.lines&&(wt.lines.visible=F);let bt=Tt?xn:Kn;wt.mats.fill.side!==bt&&(wt.mats.fill.side=bt,wt.mats.fill.needsUpdate=!0)}N=$,A.visible=nt,be()},debugInfo(){let S=m?m.info:null;return{records:P.size,geometries:S?S.memory.geometries:null,textures:S?S.memory.textures:null,programs:S&&S.programs?S.programs.length:null,awake:Ie,dpr:U,...Kt,triangles:St(),meshes:zt(),hullJobs:Rd(),hullPending:Rt(),hullStats:Pd(),frameMs:er.slice(-30)}},dispose(){if(!B){B=!0,rt(),s.clearTimeout(at),de(),pe&&s.cancelAnimationFrame(pe),clearTimeout(_o),s.clearTimeout(tr),mo&&mo.disconnect(),go&&go.disconnect(),s.removeEventListener("resize",Hh),n.removeEventListener("visibilitychange",Xh),dp(),Z.off(),a.removeEventListener("pointerdown",Oe),a.removeEventListener("pointermove",Le),a.removeEventListener("pointerup",Ce),a.removeEventListener("pointercancel",Ce),a.removeEventListener("pointerleave",ki),a.removeEventListener("wheel",Ye),a.removeEventListener("contextmenu",Hn),a.removeEventListener("dblclick",Nn),l.removeEventListener("webglcontextlost",xo,!1),l.removeEventListener("webglcontextrestored",vo,!1);for(let S of P.values())re(S);P.clear(),y.dispose(),T.dispose(),v.dispose(),b.dispose();try{m.dispose(),m.forceContextLoss()}catch{}m=null,a.remove()}}};return wi(),Gi(),ln(),mp}function Py(i){let t=()=>null;return{updateSpec:t,setSpec:t,explode:ei,setLabels:ei,select:()=>!1,focus:()=>!1,isolate:()=>!1,setView:()=>!1,autoRotate:ei,resetView:ei,zoom:ei,setInsets:ei,snapshot:t,settled:()=>Promise.resolve(!1),listParts:()=>[],getPart:t,getState:()=>({ready:!1,error:"webgl"}),resize:ei,debugBench:t,debugInfo:t,dispose(){i.remove()}}}export{as as VIEW_ANGLES,_1 as createHologram};
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
//# sourceMappingURL=hologram-M5RHAZZJ.js.map
