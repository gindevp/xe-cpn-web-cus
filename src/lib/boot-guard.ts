/** Cờ RootComponent bật sau khi React hydrate xong. */
export const APP_READY_FLAG = "__XE_APP_READY__";

/**
 * Chạy trước bundle (ES5 thuần):
 * - polyfill API mà framework/bundle gọi nhưng Safari iOS < 15.4 thiếu (Object.hasOwn, .at, findLast);
 * - nếu sau 12s React chưa hydrate (JS lỗi / chunk 404 / trình duyệt quá cũ) → hiện thanh báo + nút tải lại,
 *   kèm lỗi JS đầu tiên để chụp màn hình gửi kỹ thuật.
 */
export const BOOT_GUARD_SCRIPT = `(function(){try{
if(!Object.hasOwn){Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};}
function at(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this[n];}
[Array,String].forEach(function(C){if(!C.prototype.at)Object.defineProperty(C.prototype,"at",{value:at,writable:true,configurable:true});});
if(!Array.prototype.findLast){Object.defineProperty(Array.prototype,"findLast",{value:function(f,t){for(var i=this.length-1;i>=0;i--){if(f.call(t,this[i],i,this))return this[i];}return undefined;},writable:true,configurable:true});}
if(!Array.prototype.findLastIndex){Object.defineProperty(Array.prototype,"findLastIndex",{value:function(f,t){for(var i=this.length-1;i>=0;i--){if(f.call(t,this[i],i,this))return i;}return -1;},writable:true,configurable:true});}
}catch(e){}
var firstErr="";
function onErr(m){if(!firstErr&&m)firstErr=String(m).slice(0,200);}
window.addEventListener("error",function(e){onErr(e&&(e.message||(e.target&&(e.target.src||e.target.href)&&("Không tải được "+(e.target.src||e.target.href)))));},true);
window.addEventListener("unhandledrejection",function(e){onErr(e&&e.reason&&(e.reason.message||e.reason));});
setTimeout(function(){
if(window.${APP_READY_FLAG})return;
var d=document.createElement("div");
d.setAttribute("style","position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#fff7e6;border-top:1px solid #f0b429;padding:14px 16px;font:14px/1.4 -apple-system,system-ui,sans-serif;color:#222;box-shadow:0 -4px 16px rgba(0,0,0,.12)");
var p=document.createElement("div");p.textContent="Trang chưa tải xong. Bấm «Tải lại». Nếu vẫn lỗi, mở bằng Safari/Chrome hoặc cập nhật iOS.";
var b=document.createElement("button");b.textContent="Tải lại";
b.setAttribute("style","margin-top:10px;padding:8px 18px;border:0;border-radius:8px;background:#1d3fb8;color:#fff;font-weight:600;font-size:14px");
b.onclick=function(){var u=location.href.replace(/([?&])_r=\\d+&?/,"$1").replace(/[?&]$/,"");location.replace(u+(u.indexOf("?")<0?"?":"&")+"_r="+Date.now());};
d.appendChild(p);d.appendChild(b);
var s=document.createElement("div");s.setAttribute("style","margin-top:8px;font-size:11px;color:#777;word-break:break-all");
s.textContent=(firstErr?firstErr+" · ":"")+navigator.userAgent;d.appendChild(s);
(document.body||document.documentElement).appendChild(d);
},12000);
})();`;
