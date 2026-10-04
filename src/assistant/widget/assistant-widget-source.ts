/**
 * Source of the embeddable Web Assistant (vanilla JS, Shadow DOM). Contains no
 * secrets: it only calls the public config/chat endpoints, which validate the
 * site against the page origin on the server.
 */
export function assistantWidgetSource(base: string): string {
  return `(()=>{"use strict";
var BASE=${JSON.stringify(base)};
var me=document.currentScript||document.querySelector('script[data-site-id][src*="assistant.js"]');
var SITE=me&&me.getAttribute("data-site-id");
if(!SITE||window.__apAssistant)return;window.__apAssistant=1;
var hist=[],busy=false,last=null,cfg=null,state="idle",rec=null,ctrl=null;
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
var host=document.createElement("div");host.setAttribute("data-ap-assistant",SITE);
var root=host.attachShadow({mode:"open"});
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function boot(){fetch(BASE+"/api/public/assistant/config?site="+encodeURIComponent(SITE)).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(r){if(!r.ok||!r.j.enabled)return;cfg=r.j;render()}).catch(function(){})}
function render(){
var p=cfg.branding.primary,a=cfg.branding.accent,side=cfg.branding.position==="left"?"left":"right";
var st=el("style");st.textContent=":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}"
+".fab{position:fixed;bottom:20px;"+side+":20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,"+p+","+a+");color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:2147483646;font-size:24px}"
+".fab:focus-visible,button:focus-visible,textarea:focus-visible{outline:3px solid "+a+";outline-offset:2px}"
+".panel{position:fixed;bottom:90px;"+side+":20px;width:min(380px,calc(100vw - 24px));height:min(600px,calc(100vh - 120px));background:#fff;color:#111;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;z-index:2147483647}"
+".panel.open{display:flex}@media(max-width:480px){.panel{bottom:0;"+side+":0;width:100vw;height:100dvh;border-radius:0}}"
+".hd{padding:14px 16px;background:"+p+";color:#fff;display:flex;align-items:center;gap:10px}.hd b{flex:1;font-size:15px}.hd button{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer}"
+".st{font-size:12px;opacity:.85}.log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f7f7f9}"
+".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}.u{align-self:flex-end;background:"+p+";color:#fff}.b{align-self:flex-start;background:#fff;border:1px solid #e5e7eb}.e{align-self:flex-start;background:#fef2f2;color:#991b1b;border:1px solid #fecaca}"
+".act{font-size:12px;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:4px 8px;align-self:flex-start}"
+".ft{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;align-items:flex-end}textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:12px;padding:9px 10px;font-size:14px;max-height:100px;color:#111;background:#fff}"
+".ib{width:40px;height:40px;border-radius:12px;border:0;cursor:pointer;background:"+a+";color:#fff;font-size:16px;flex:none}.ib.sec{background:#eef0f3;color:#111}.ib.live{animation:pl 1.2s infinite}@keyframes pl{50%{opacity:.55}}"
+".row{display:flex;gap:6px;align-self:flex-start}.row button{font-size:12px;border:1px solid #ddd;background:#fff;border-radius:999px;padding:4px 10px;cursor:pointer;color:#111}";
root.appendChild(st);
var fab=el("button","fab","\\u2726");fab.setAttribute("aria-label","Open "+cfg.displayName);
var panel=el("div","panel");panel.setAttribute("role","dialog");panel.setAttribute("aria-label",cfg.displayName);
var hd=el("div","hd"),title=el("div");var tb=el("b",null,cfg.displayName),stl=el("div","st","Ready");stl.setAttribute("aria-live","polite");title.appendChild(tb);title.appendChild(stl);title.style.flex="1";
var close=el("button",null,"\\u00d7");close.setAttribute("aria-label","Close");hd.appendChild(title);hd.appendChild(close);
var log=el("div","log");log.setAttribute("aria-live","polite");
var ft=el("div","ft"),ta=el("textarea");ta.rows=1;ta.placeholder="Type a message\\u2026";ta.setAttribute("aria-label","Message");ta.maxLength=1000;
var mic=el("button","ib sec","\\ud83c\\udfa4");mic.setAttribute("aria-label","Speak");
var send=el("button","ib","\\u27a4");send.setAttribute("aria-label","Send");
var stop=el("button","ib sec","\\u25a0");stop.setAttribute("aria-label","Stop");stop.style.display="none";
if(!SR||!cfg.voiceEnabled)mic.style.display="none";
ft.appendChild(ta);ft.appendChild(mic);ft.appendChild(stop);ft.appendChild(send);
panel.appendChild(hd);panel.appendChild(log);panel.appendChild(ft);root.appendChild(fab);root.appendChild(panel);
add("b",cfg.welcomeMessage);
function setState(s,label){state=s;stl.textContent=label;stop.style.display=(s==="thinking"||s==="speaking"||s==="listening")?"":"none";mic.classList.toggle("live",s==="listening")}
function add(k,t){var m=el("div","m "+k,t);log.appendChild(m);log.scrollTop=log.scrollHeight;return m}
function retryRow(text){var r=el("div","row"),b=el("button",null,"Retry");b.onclick=function(){r.remove();ask(text,true)};r.appendChild(b);log.appendChild(r);log.scrollTop=log.scrollHeight}
function speak(t,voice){if(!voice||!window.speechSynthesis||!cfg.voiceEnabled){setState("idle","Ready");return}try{var u=new SpeechSynthesisUtterance(t);u.lang=cfg.voice.lang;u.rate=cfg.voice.rate;u.pitch=cfg.voice.pitch;u.onend=u.onerror=function(){setState("idle","Ready")};setState("speaking","Speaking\\u2026");speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){setState("idle","Ready")}}
function ask(text,voice){if(busy||!text)return;busy=true;last=text;add("u",text);setState("thinking","Thinking\\u2026");ctrl=new AbortController();var to=setTimeout(function(){ctrl.abort()},45000);
fetch(BASE+"/api/public/assistant/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({site:SITE,message:text,history:hist.slice(-24)}),signal:ctrl.signal})
.then(function(r){return r.json()}).then(function(j){if(!j||!j.ok){add("e",(j&&j.error&&j.error.message)||"Something went wrong.");retryRow(text);setState("error","Something went wrong");return}
hist.push({role:"user",content:text},{role:"assistant",content:j.reply});(j.actions||[]).forEach(function(a){if(a.status==="success")add("act act",a.summary).className="act"});add("b",j.reply);speak(j.reply,voice)})
.catch(function(e){add("e",e&&e.name==="AbortError"?"Stopped.":(navigator.onLine?"I couldn't reach the assistant.":"You appear to be offline."));if(!(e&&e.name==="AbortError"))retryRow(text);setState(e&&e.name==="AbortError"?"idle":"error",e&&e.name==="AbortError"?"Ready":"Connection problem")})
.finally(function(){clearTimeout(to);busy=false;ctrl=null;if(state==="thinking")setState("idle","Ready")})}
function listen(){if(!SR)return;if(rec){rec.stop();return}try{speechSynthesis&&speechSynthesis.cancel()}catch(e){}rec=new SR();rec.lang=cfg.voice.lang;rec.interimResults=false;rec.maxAlternatives=1;
rec.onresult=function(e){var t=e.results[0][0].transcript;rec=null;ask(t,true)};
rec.onerror=function(e){rec=null;var m=e.error==="not-allowed"||e.error==="service-not-allowed"?"Microphone access was blocked. You can keep typing instead.":e.error==="no-speech"?"I didn't hear anything. Try again or type your message.":"Voice input isn't working right now. You can type instead.";add("e",m);setState("error","Voice unavailable")};
rec.onend=function(){if(rec){rec=null;if(state==="listening")setState("idle","Ready")}};setState("listening","Listening\\u2026");rec.start()}
fab.onclick=function(){panel.classList.toggle("open");if(panel.classList.contains("open"))ta.focus()};close.onclick=function(){panel.classList.remove("open");fab.focus()};
send.onclick=function(){var t=ta.value.trim();ta.value="";ask(t,false)};ta.onkeydown=function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send.onclick()}if(e.key==="Escape")close.onclick()};
mic.onclick=listen;stop.onclick=function(){if(ctrl)ctrl.abort();if(rec){rec.abort();rec=null}try{speechSynthesis.cancel()}catch(e){}setState("idle","Ready")};
}
document.body?(document.body.appendChild(host),boot()):document.addEventListener("DOMContentLoaded",function(){document.body.appendChild(host);boot()});
})();`;
}
