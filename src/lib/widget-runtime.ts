/**
 * Production AntheticPlus widget runtime (Gen 2).
 * The visual is the configurable Metal Balls / sphere-field renderer used by
 * the admin Widget Manager. The browser receives presentation configuration
 * only; credentials remain server-side.
 */
export function widgetSource(apiBase: string, fallbackToken = "") {
  return `/* AntheticPlus widget v3 - Metal Balls */
(function(){
  if (window.__antheticPlusWidget) return;
  var GATEWAY = ${JSON.stringify(apiBase)};
  var API = (GATEWAY ? GATEWAY.replace(/\\/$/, "") + "/v1/widget" : "");
  if (!API) { console.error("[AntheticPlus] VITE_API_GATEWAY_URL is not configured"); return; }
  var me = document.currentScript || document.querySelector('script[data-token][src*="widget"]');
  var TOKEN = (me && me.getAttribute("data-token")) || ${JSON.stringify(fallbackToken)};
  if (!TOKEN) { console.warn("[AntheticPlus] missing data-token"); return; }
  window.__antheticPlusWidget = true;
  var SK = "ap_sess_" + TOKEN, sess;
  try { sess = localStorage.getItem(SK); } catch(e) {}
  if (!sess) { sess = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^a-zA-Z0-9-]/g,""); try { localStorage.setItem(SK, sess); } catch(e) {} }

  var C = {
    style:"metal-balls", primary:"#FF0000", secondary:"#FF0000", center:"#FBFBFB", glow:"#FF0000",
    size:64, position:"bottom-right", ballCount:32, radius:37, ballSize:3, centerSize:31, tilt:49,
    variation:0.14, shine:true, speed:1,
    stateAnimations:{}, labels:{}, welcome:"Hello! How can I help you today?", placeholder:"Type your message…", sound:false,
    chat:{title:"AI Assistant",subtitle:"Usually replies instantly",autoOpen:false},
    mobile:{hidden:false,size:56}, desktop:{size:64}, fallback:{enabled:true,type:"static"}, advanced:{debug:false}
  };
  var STATE_DEFAULTS={idle:{enabled:true,speed:1,energy:.25},listening:{enabled:true,speed:1.1,energy:.6},thinking:{enabled:true,speed:1.3,energy:.85},speaking:{enabled:true,speed:1.25,energy:1},message:{enabled:true,speed:1.1,energy:.7},success:{enabled:true,speed:.9,energy:.5},handoff:{enabled:true,speed:1,energy:.5},error:{enabled:true,speed:1,energy:.9},offline:{enabled:false,speed:0,energy:0}};
  var LABEL={idle:"Ready",listening:"Listening…",thinking:"Thinking…",speaking:"Replying…",message:"New message",success:"Done",handoff:"Connecting you to a person",error:"Something went wrong",offline:"Offline"};
  var STATE_COLORS={idle:null,listening:"#00D9FF",thinking:"#8B5CF6",speaking:null,message:null,success:"#22C55E",handoff:"#F59E0B",error:"#EF4444",offline:"#6B7280"};
  var state="idle",open=false,busy=false,root,canvas,ctx,log,input,send,statusEl,frame,host,shadow,lastText,loading;
  var reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(v){return String(v).replace(/[&<>"']/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]);});}
  function hex(h){h=String(h||"").replace("#",""); if(h.length===3)h=h.split("").map(function(x){return x+x}).join(""); var n=parseInt(h,16); return [n>>16&255,n>>8&255,n&255];}
  function rgba(h,a){var c=hex(h);return "rgba("+c[0]+","+c[1]+","+c[2]+","+a+")";}
  function merge(a,b){var o={}; for(var k in a)o[k]=a[k]; for(var j in b||{})o[j]=b[j]; return o;}
  function stateCfg(){return merge(STATE_DEFAULTS[state]||STATE_DEFAULTS.idle,C.stateAnimations&&C.stateAnimations[state]);}
  function setState(s){state=s; if(root)root.setAttribute("data-state",s); if(statusEl)statusEl.textContent=(C.labels&&C.labels[s])||LABEL[s]||"";}

  function css(){
    var size=Math.max(44,Math.min(132,Number(C.size)||64));
    var pos=C.position==="bottom-left"?"left:20px":"right:20px";
    var panelSide=C.position==="bottom-left"?"left:0":"right:0";
    var s=document.createElement("style");
    s.textContent=[
      ":host{all:initial}*{box-sizing:border-box}button,textarea{font-family:inherit}button:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:3px}.ap-close{position:absolute;right:12px;top:12px;border:0;background:transparent;color:inherit;font-size:24px;cursor:pointer}.ap-panel[aria-hidden=true]{visibility:hidden}.ap-panel[aria-hidden=false]{visibility:visible}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}",
      ".ap-root{position:fixed;bottom:20px;"+pos+";z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,sans-serif}",
      ".ap-orb{width:"+size+"px;height:"+size+"px;border-radius:50%;border:0;padding:0;background:transparent;cursor:pointer;display:block;position:relative;filter:drop-shadow(0 10px 24px rgba(0,0,0,.22))}",
      ".ap-orb canvas{width:100%;height:100%;display:block;border-radius:50%}",
      ".ap-panel{position:absolute;bottom:"+(size+14)+"px;"+panelSide+";width:350px;max-width:calc(100vw - 32px);height:500px;max-height:72vh;background:#161a1b;color:#f4f7f6;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 70px rgba(0,0,0,.45);opacity:0;transform:translateY(12px) scale(.97);pointer-events:none;transition:all .28s cubic-bezier(.22,1,.36,1)}",
      ".ap-root.ap-open .ap-panel{opacity:1;transform:none;pointer-events:auto}",
      ".ap-head{padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)}.ap-head b{font-size:15px;display:block}.ap-head span{font-size:12px;opacity:.7}",
      ".ap-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}",
      ".ap-m{max-width:84%;padding:9px 13px;border-radius:14px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}",
      ".ap-u{align-self:flex-end;background:"+(C.primary||"#FF0000")+";color:#fff;border-bottom-right-radius:4px}",
      ".ap-a{align-self:flex-start;background:rgba(255,255,255,.07);border-bottom-left-radius:4px}",
      ".ap-e{align-self:center;font-size:12px;color:#fca5a5}",
      ".ap-f{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.08)}",
      ".ap-i{min-width:0;resize:none;flex:1;background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;font:inherit;font-size:13.5px;outline:none}",
      ".ap-s{border:0;border-radius:10px;background:"+(C.primary||"#FF0000")+";color:#fff;padding:0 16px;font-weight:600;cursor:pointer}.ap-s:disabled{opacity:.5}",
      (C.mobile&&C.mobile.hidden?"@media(max-width:640px){.ap-root{display:none}}":""),
      (C.mobile&&!C.mobile.hidden?"@media(max-width:640px){.ap-orb{width:"+Math.max(40,Math.min(100,Number(C.mobile.size)||56))+"px;height:"+Math.max(40,Math.min(100,Number(C.mobile.size)||56))+"px}.ap-panel{bottom:"+(Math.max(40,Math.min(100,Number(C.mobile.size)||56))+14)+"px}}":""),
    ].join("\\n");
    shadow.appendChild(s);
    return size;
  }

  function build(){
    host=document.createElement("div");host.setAttribute("data-ap-widget","");shadow=host.attachShadow({mode:"open"});document.body.appendChild(host);css();
    root=document.createElement("div");root.className="ap-root";
    root.innerHTML='<div class="ap-panel" role="dialog" aria-label="AI assistant" aria-hidden="true"><div class="ap-head"><b></b><span></span><button class="ap-close" aria-label="Close assistant">×</button></div><div class="ap-log" aria-live="polite"></div><form class="ap-f"><textarea class="ap-i" rows="1" aria-label="Message" autocomplete="off" maxlength="2000"></textarea><button class="ap-s" type="submit">Send</button></form></div><button class="ap-orb" aria-label="Open chat" aria-expanded="false"><canvas></canvas></button>';
    shadow.appendChild(root);
    log=root.querySelector(".ap-log");input=root.querySelector(".ap-i");send=root.querySelector(".ap-s");statusEl=root.querySelector(".ap-head span");
    root.querySelector(".ap-head b").textContent=(C.chat&&C.chat.title)||"AI Assistant";
    root.querySelector(".ap-head span").textContent=(C.chat&&C.chat.subtitle)||LABEL.idle; input.placeholder=C.placeholder||"Type your message…";
    canvas=root.querySelector("canvas");ctx=canvas.getContext&&canvas.getContext("2d");
    if(!ctx && C.fallback&&C.fallback.enabled){ var fb=document.createElement("span");fb.style.cssText="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,"+(C.secondary||"#FF0000")+","+(C.primary||"#FF0000")+" 60%,"+(C.glow||"#FF0000")+");"; root.querySelector(".ap-orb").appendChild(fb); }
    if(ctx){ var d=window.devicePixelRatio||1; var size=Number(C.size)||64; canvas.width=size*d;canvas.height=size*d;frame=requestAnimationFrame(draw); }
    root.querySelector(".ap-orb").onclick=toggle;
    root.querySelector(".ap-close").onclick=function(){if(open)toggle()};
    input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}});
    root.addEventListener("keydown",function(e){if(e.key==="Escape"&&open){e.preventDefault();toggle()}});
    input.addEventListener("focus",function(){if(!busy&&state!=="offline")setState("listening")});
    input.addEventListener("blur",function(){if(state==="listening")setState("idle")});
    root.querySelector("form").onsubmit=function(e){e.preventDefault();submit()}; setState(state);
  }

  function spherePoints(n){
    var pts=[],gold=Math.PI*(3-Math.sqrt(5));
    n=Math.max(8,Math.min(128,Math.round(n||32)));
    for(var i=0;i<n;i++){
      var y=1-(i/(n-1))*2;var r=Math.sqrt(Math.max(0,1-y*y));var a=gold*i;
      pts.push({x:Math.cos(a)*r,y:y,z:Math.sin(a)*r,p:i/n});
    }
    return pts;
  }
  var points=spherePoints(C.ballCount);
  function ensurePoints(){if(points.length!==Math.round(C.ballCount||32))points=spherePoints(C.ballCount);}

  function draw(now){
    if(!ctx)return;
    var size=Number(C.size)||64,dpr=window.devicePixelRatio||1,R=size*dpr/2,t=(now/1000)*(Number(C.speed)||1),cfg=stateCfg(),energy=Number(cfg.energy||.25),speed=Number(cfg.speed||1);
    t*=speed;ensurePoints();ctx.clearRect(0,0,size*dpr,size*dpr);ctx.save();ctx.translate(R,R);
    var base=(cfg.color||STATE_COLORS[state]||C.primary||"#FF0000");
    var br=R*(Number(C.radius||37)/50),bs=Math.max(.8,(Number(C.ballSize)||3)*dpr*.8),tilt=(Number(C.tilt||49)*Math.PI/180),variation=Number(C.variation||.14);
    if(state==="offline")energy=0;
    var items=[];
    for(var i=0;i<points.length;i++){
      var p=points[i],wig=Math.sin(t*2.1+p.p*17)*variation*energy;
      var x=p.x*(1+wig),y=p.y,z=p.z;
      var ct=Math.cos(t*.65),st=Math.sin(t*.65),rx=x*ct-z*st,rz=x*st+z*ct;
      var cy=Math.cos(tilt),sy=Math.sin(tilt),ry=y*cy-rz*sy,zz=y*sy+rz*cy;
      var depth=(zz+1)/2,px=rx*br,py=ry*br;
      items.push({x:px,y:py,z:zz,depth:depth});
    }
    items.sort(function(a,b){return a.z-b.z});
    for(var j=0;j<items.length;j++){
      var q=items[j],rr=bs*(.7+q.depth*.7);ctx.beginPath();ctx.arc(q.x,q.y,rr,0,Math.PI*2);
      var alpha=.35+.65*q.depth;ctx.shadowColor=rgba(C.glow||base,Math.min(1,(Number(C.glowOpacity)||.55)));ctx.shadowBlur=Math.max(0,R*.08*(Number(C.glowStrength)||1)*energy);
      var g=ctx.createRadialGradient(q.x-rr*.35,q.y-rr*.45,rr*.08,q.x,q.y,rr);g.addColorStop(0,"rgba(255,255,255,"+(.45+q.depth*.4)+")");g.addColorStop(.25,rgba(C.secondary||base,alpha));g.addColorStop(1,rgba(base,.9));ctx.fillStyle=g;ctx.fill();
    }
    var cr=Math.max(3,(Number(C.centerSize)||31)*dpr*.5);ctx.shadowBlur=R*.16*energy;ctx.shadowColor=rgba(C.glow||base,.5);var cg=ctx.createRadialGradient(-cr*.25,-cr*.35,cr*.08,0,0,cr);cg.addColorStop(0,"rgba(255,255,255,.95)");cg.addColorStop(.55,C.center||"#FBFBFB");cg.addColorStop(1,rgba(C.center||"#FBFBFB",.82));ctx.beginPath();ctx.arc(0,0,cr,0,Math.PI*2);ctx.fillStyle=cg;ctx.fill();
    if(C.shine!==false){ctx.beginPath();ctx.arc(-cr*.34,-cr*.38,cr*.22,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,.5)";ctx.fill();}
    ctx.restore();if(!reduced&&host&&host.isConnected)frame=requestAnimationFrame(draw);
  }

  function add(cls,text){var near=log.scrollHeight-log.scrollTop-log.clientHeight<80;var el=document.createElement("div");el.className="ap-m "+cls;el.textContent=text;log.appendChild(el);if(near||cls==="ap-u")log.scrollTop=log.scrollHeight;return el;}
  function toggle(){open=!open;root.classList.toggle("ap-open",open);root.querySelector(".ap-panel").setAttribute("aria-hidden",String(!open));root.querySelector(".ap-orb").setAttribute("aria-expanded",String(open));if(!open)root.querySelector(".ap-orb").focus();if(open){if(!log.childNodes.length&&C.welcome)add("ap-a",C.welcome);setTimeout(function(){input.focus()},200)}}
  function retry(text){var row=document.createElement("button");row.textContent="Retry message";row.className="ap-s";row.onclick=function(){if(busy)return;row.remove();input.value=text;submit(true)};log.appendChild(row)}
  function submit(isRetry){
    var text=input.value.trim();if(!text||busy||state==="offline")return;input.value="";if(!isRetry)add("ap-u",text);busy=true;send.disabled=true;input.disabled=true;setState("thinking");loading=add("ap-a","Thinking…");
    fetch(API+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:TOKEN,message:text,sessionId:sess}),signal:AbortSignal.timeout(45000)})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
    .then(function(res){if(!res.ok){setState(res.j&&res.j.code==="offline"?"offline":(res.j&&res.j.code==="inactive"?"offline":"error"));add("ap-e",typeof (res.j&&res.j.error)==="string"?res.j.error:"Unable to reply. Please try again.");retry(text);return}setState("speaking");add("ap-a",String(res.j.reply||""));setTimeout(function(){if(state==="speaking")setState(open?"idle":"message")},1400)})
    .catch(function(){setState("error");add("ap-e","Connection problem. Please try again.");retry(text)})
    .then(function(){busy=false;send.disabled=false;input.disabled=false;if(loading)loading.remove();loading=null});
  }

  function start(){
    fetch(API+"/config?token="+encodeURIComponent(TOKEN),{headers:{"X-Widget-Token":TOKEN}})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
    .then(function(res){
      if(!res.ok){if(res.j&&res.j.code==="invalid_token")return;state="offline";}
      else {var c=res.j.config||{};for(var k in c)if(c[k]!==undefined&&c[k]!==null)C[k]=c[k];points=spherePoints(C.ballCount);}
      build();if(C.chat&&C.chat.autoOpen)toggle();
    }).catch(function(){state="offline";build()});
  }
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",start):start();
})();`;
}
