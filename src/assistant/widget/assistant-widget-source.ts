/**
 * Source of the embeddable Web Assistant (vanilla JS, Shadow DOM). Contains no
 * secrets: it only calls the public config/chat/transcribe/tts endpoints.
 */
export function assistantWidgetSource(base: string): string {
  return `(()=>{"use strict";
var BASE=${JSON.stringify(base)};
var me=document.currentScript||document.querySelector('script[data-site-id][src*="assistant.js"]');
var SITE=me&&me.getAttribute("data-site-id");
if(!SITE||window.__apAssistant)return;window.__apAssistant=1;
var hist=[],busy=false,last=null,cfg=null,state="idle",rec=null,ctrl=null,ttsCtrl=null,audio=null,recordingStream=null,recordingCtx=null,recordingTimer=null,recordingRaf=0,recordingChunks=[];
var host=document.createElement("div");host.setAttribute("data-ap-assistant",SITE);
var root=host.attachShadow({mode:"open"});
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function boot(){fetch(BASE+"/api/public/assistant/config?site="+encodeURIComponent(SITE)).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(r){if(!r.ok||!r.j.enabled)return;cfg=r.j;render()}).catch(function(){})}
function render(){
var p=cfg.branding.primary,a=cfg.branding.accent,side=cfg.branding.position==="left"?"left":"right";
var st=el("style");st.textContent=":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}"+
".fab{position:fixed;bottom:20px;"+side+":20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,"+p+","+a+");color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:2147483646;font-size:24px}"+
".fab:focus-visible,button:focus-visible,textarea:focus-visible{outline:3px solid "+a+";outline-offset:2px}"+
".panel{position:fixed;bottom:90px;"+side+":20px;width:min(380px,calc(100vw - 24px));height:min(600px,calc(100vh - 120px));background:#fff;color:#111;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;z-index:2147483647}"+
".panel.open{display:flex}@media(max-width:480px){.panel{bottom:0;"+side+":0;width:100vw;height:100dvh;border-radius:0}}"+
".hd{padding:14px 16px;background:"+p+";color:#fff;display:flex;align-items:center;gap:10px}.hd b{flex:1;font-size:15px}.hd button{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer}"+
".st{font-size:12px;opacity:.85}.log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f7f7f9}"+
".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}.u{align-self:flex-end;background:"+p+";color:#fff}.b{align-self:flex-start;background:#fff;border:1px solid #e5e7eb}.e{align-self:flex-start;background:#fef2f2;color:#991b1b;border:1px solid #fecaca}"+
".act{font-size:12px;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:4px 8px;align-self:flex-start}"+
".ft{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;align-items:flex-end}textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:12px;padding:9px 10px;font-size:14px;max-height:100px;color:#111;background:#fff}"+
".ib{width:40px;height:40px;border-radius:12px;border:0;cursor:pointer;background:"+a+";color:#fff;font-size:16px;flex:none}.ib.sec{background:#eef0f3;color:#111}.ib.live{animation:pl 1.2s infinite}@keyframes pl{50%{opacity:.55}}"+
".row{display:flex;gap:6px;align-self:flex-start}.row button{font-size:12px;border:1px solid #ddd;background:#fff;border-radius:999px;padding:4px 10px;cursor:pointer;color:#111}";
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
if(!window.MediaRecorder||!navigator.mediaDevices||!cfg.voiceEnabled)mic.style.display="none";
ft.appendChild(ta);ft.appendChild(mic);ft.appendChild(stop);ft.appendChild(send);
panel.appendChild(hd);panel.appendChild(log);panel.appendChild(ft);root.appendChild(fab);root.appendChild(panel);
add("b",cfg.welcomeMessage);
function setState(s,label){state=s;stl.textContent=label;stop.style.display=(s==="thinking"||s==="speaking"||s==="listening")?"":"none";mic.classList.toggle("live",s==="listening")}
function add(k,t){var m=el("div","m "+k,t);log.appendChild(m);log.scrollTop=log.scrollHeight;return m}
function retryRow(text){var r=el("div","row"),b=el("button",null,"Retry");b.onclick=function(){r.remove();ask(text,false)};r.appendChild(b);log.appendChild(r);log.scrollTop=log.scrollHeight}
function cleanupRecord(){if(recordingRaf)cancelAnimationFrame(recordingRaf);recordingRaf=0;if(recordingTimer)clearTimeout(recordingTimer);recordingTimer=null;if(recordingStream){recordingStream.getTracks().forEach(function(t){t.stop()});recordingStream=null}if(recordingCtx){recordingCtx.close().catch(function(){});recordingCtx=null}rec=null}
function dataUrl(blob){return new Promise(function(resolve,reject){var r=new FileReader();r.onerror=function(){reject(r.error||new Error("Audio read failed"))};r.onload=function(){resolve(String(r.result))};r.readAsDataURL(blob)})}
function supportedMime(){var c=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"];return c.find(function(m){return MediaRecorder.isTypeSupported(m)})||"audio/webm"}
function listen(){if(!cfg.voiceEnabled||!window.MediaRecorder||!navigator.mediaDevices||busy)return;if(rec){try{rec.stop()}catch(e){}return}setState("listening","Listening\\u2026");recordingChunks=[];var aborted=false;
navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(stream){recordingStream=stream;var mime=supportedMime();rec=new MediaRecorder(stream,{mimeType:mime});var started=performance.now(),heard=false;var silenceTimer=null;
rec.ondataavailable=function(e){if(e.data.size)recordingChunks.push(e.data)};
rec.onerror=function(){cleanupRecord();add("e","Voice input stopped unexpectedly. You can type instead.");setState("error","Voice unavailable")};
rec.onstop=function(){var localAborted=aborted;var chunks=recordingChunks.slice();cleanupRecord();if(localAborted||!chunks.length){setState("idle","Ready");return}var blob=new Blob(chunks,{type:mime});if(!blob.size){add("e","I didn't hear anything. Try again or type your message.");setState("error","No speech");return}dataUrl(blob).then(function(audioBase64){return fetch(BASE+"/api/public/assistant/transcribe?site="+encodeURIComponent(SITE),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({site:SITE,audioBase64:audioBase64,mimeType:mime})})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error((j.error&&j.error.message)||"Transcription failed");return j})}).then(function(j){if(j.text&&j.text.trim())ask(j.text,true,j.language);else throw new Error("no_speech")}).catch(function(e){if(e&&e.name==="AbortError")return;add("e",e.message==="no_speech"?"I didn't hear anything. Try again or type your message.":"I couldn't understand that. Please try again.");setState("error","Voice unavailable")})};
rec.start(250);var source=recordingCtx=new AudioContext();var analyser=source.createAnalyser();analyser.fftSize=1024;source.createMediaStreamSource(stream).connect(analyser);var data=new Uint8Array(analyser.fftSize);
function tick(){if(!rec)return;analyser.getByteTimeDomainData(data);var sum=0;for(var i=0;i<data.length;i++){var n=(data[i]-128)/128;sum+=n*n}var rms=Math.sqrt(sum/data.length),elapsed=performance.now()-started;if(rms>.035){if(!heard){heard=true}if(silenceTimer){clearTimeout(silenceTimer);silenceTimer=null}}else if(heard&&!silenceTimer&&elapsed>700){silenceTimer=setTimeout(function(){try{rec.stop()}catch(e){}},850)}if(elapsed>=12000){try{rec.stop()}catch(e){}}recordingRaf=requestAnimationFrame(tick)}recordingRaf=requestAnimationFrame(tick)
}).catch(function(e){cleanupRecord();add("e",e&&e.name==="NotAllowedError"?"Microphone access was blocked. You can keep typing instead.":"Voice input isn't working right now. You can type instead.");setState("error","Voice unavailable")});
listen.abort=function(){aborted=true;if(rec){try{rec.stop()}catch(e){cleanupRecord()}}else cleanupRecord()}
}
function stopTts(){if(ttsCtrl){ttsCtrl.abort();ttsCtrl=null}if(audio){var old=audio;audio=null;old.pause();old.removeAttribute("src");old.load();if(old.__apObjectUrl){URL.revokeObjectURL(old.__apObjectUrl);old.__apObjectUrl=null}}}
function playStreamingTts(response,signal){
if(typeof MediaSource==="undefined"||!MediaSource.isTypeSupported("audio/mpeg")||!response.body)return false;
var ms=new MediaSource(),u=URL.createObjectURL(ms),a=new Audio();a.__apObjectUrl=u;a.preload="auto";audio=a;
var queue=[],reader=response.body.getReader(),sourceBuffer=null,done=false,started=false,failed=false;
function cleanup(){if(audio===a)audio=null;a.pause();a.removeAttribute("src");a.load();URL.revokeObjectURL(u);a.__apObjectUrl=null}
function pump(){if(failed||!sourceBuffer||sourceBuffer.updating||!queue.length)return;try{sourceBuffer.appendBuffer(queue.shift())}catch(e){failed=true;cleanup();throw e}}
ms.addEventListener("sourceopen",function(){try{sourceBuffer=ms.addSourceBuffer("audio/mpeg");sourceBuffer.mode="sequence";sourceBuffer.addEventListener("updateend",function(){if(!started&&a.paused&&sourceBuffer.buffered.length){started=true;a.play().catch(function(){})}pump();if(done&&!sourceBuffer.updating&&!queue.length&&ms.readyState==="open"){try{ms.endOfStream()}catch(e){}}});(async function(){try{while(true){if(signal.aborted)throw new DOMException("Aborted","AbortError");var n=await reader.read();if(n.done)break;queue.push(n.value);pump()}done=true;pump();if(!sourceBuffer.updating&&!queue.length&&ms.readyState==="open"){try{ms.endOfStream()}catch(e){}}}catch(e){if(e&&e.name==="AbortError")return;failed=true;cleanup()}})()}catch(e){failed=true;cleanup()}});
a.onended=function(){cleanup();ttsCtrl=null;setState("idle","Ready")};a.onerror=function(){if(!signal.aborted){cleanup();add("e","I couldn't play audio, but the reply is shown above.");setState("error","Audio unavailable")}};a.src=u;
return true}
function playBufferedTts(response){return response.blob().then(function(blob){if(!blob.size)throw new Error("No audio");var u=URL.createObjectURL(blob);var a=new Audio(u);a.__apObjectUrl=u;audio=a;a.onended=function(){URL.revokeObjectURL(u);a.__apObjectUrl=null;audio=null;ttsCtrl=null;setState("idle","Ready")};a.onerror=function(){URL.revokeObjectURL(u);a.__apObjectUrl=null;audio=null;ttsCtrl=null;add("e","I couldn't play audio, but the reply is shown above.");setState("error","Audio unavailable")};return a.play()})}
function speak(t,voice,language){if(!voice||!cfg.voiceEnabled){setState("idle","Ready");return}stopTts();ttsCtrl=new AbortController();setState("speaking","Speaking\u2026");fetch(BASE+"/api/public/assistant/tts?site="+encodeURIComponent(SITE),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({site:SITE,text:t,language:language||undefined}),signal:ttsCtrl.signal}).then(function(r){if(!r.ok){if(r.status===429)throw new Error("Voice is temporarily rate-limited. Please try again shortly.");throw new Error("TTS failed")}var streaming=playStreamingTts(r,ttsCtrl.signal);if(streaming)return null;return playBufferedTts(r)}).then(function(){if(audio===null&&state==="speaking")setState("idle","Ready")}).catch(function(e){if(e&&e.name==="AbortError")return;ttsCtrl=null;stopTts();add("e",e&&e.message?e.message:"I couldn't play audio, but the reply is shown above.");setState("error","Audio unavailable")})}
function ask(text,voice,language){if(busy||!text)return;busy=true;last=text;add("u",text);setState("thinking","Thinking\\u2026");ctrl=new AbortController();var to=setTimeout(function(){ctrl.abort()},45000);
fetch(BASE+"/api/public/assistant/chat?site="+encodeURIComponent(SITE),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({site:SITE,message:text,history:hist.slice(-24),language:language||undefined,languageConfidence:language?0.95:undefined}),signal:ctrl.signal})
.then(function(r){return r.json()}).then(function(j){if(!j||!j.ok){add("e",(j&&j.error&&j.error.message)||"Something went wrong.");retryRow(text);setState("error","Something went wrong");return}hist.push({role:"user",content:text},{role:"assistant",content:j.reply});(j.actions||[]).forEach(function(a){if(a.status==="success")add("act act",a.summary).className="act"});add("b",j.reply);speak(j.reply,voice,j.language&&j.language.language?j.language.language:language)})
.catch(function(e){add("e",e&&e.name==="AbortError"?"Stopped.":(navigator.onLine?"I couldn't reach the assistant.":"You appear to be offline."));if(!(e&&e.name==="AbortError"))retryRow(text);setState(e&&e.name==="AbortError"?"idle":"error",e&&e.name==="AbortError"?"Ready":"Connection problem")})
.finally(function(){clearTimeout(to);busy=false;ctrl=null;if(state==="thinking")setState("idle","Ready")})}
fab.onclick=function(){panel.classList.toggle("open");if(panel.classList.contains("open"))ta.focus()};close.onclick=function(){stopTts();panel.classList.remove("open");fab.focus()};
send.onclick=function(){var t=ta.value.trim();ta.value="";ask(t,false)};ta.onkeydown=function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send.onclick()}if(e.key==="Escape")close.onclick()};
mic.onclick=listen;stop.onclick=function(){if(ctrl)ctrl.abort();ctrl=null;if(rec&&listen.abort)listen.abort();stopTts();setState("idle","Ready")};
}
document.body?(document.body.appendChild(host),boot()):document.addEventListener("DOMContentLoaded",function(){document.body.appendChild(host);boot()});
})();`;
}
