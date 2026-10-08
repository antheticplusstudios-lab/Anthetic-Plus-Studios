// Self-contained fallback page (no app imports) with the same looping bot animation.
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>500 — This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { --bg:#111; --fg:#f4f4f5; --muted:#a1a1aa; --accent:#8bd450; --card:#1b1b1d; }
      * { box-sizing: border-box; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; overflow: hidden; }
      .card { max-width: 28rem; width: 100%; text-align: center; position: relative; }
      .scene { position: relative; width: 12rem; height: 12rem; margin: 0 auto; }
      .ring { position: absolute; inset: 0; border: 2px solid var(--accent); border-radius: 50%; opacity: 0; animation: ping 3s cubic-bezier(.2,.6,.4,1) infinite; }
      .ring:nth-child(2) { animation-delay: 1s; } .ring:nth-child(3) { animation-delay: 2s; }
      .orbit { position: absolute; inset: 0; animation: spin 4s linear infinite; }
      .orbit i { position: absolute; left: 50%; top: 0; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 16px var(--accent); }
      .bot { position: absolute; left: 50%; top: 50%; animation: bob 2.4s ease-in-out infinite; }
      .ant { position: absolute; top: -24px; left: 50%; width: 2px; height: 24px; background: var(--muted); transform-origin: bottom; animation: sway 1.6s ease-in-out infinite; }
      .ant b { position: absolute; left: -4px; top: -8px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); animation: blink 1.2s steps(2, jump-none) infinite; }
      .head { width: 80px; height: 64px; border: 2px solid var(--fg); border-radius: 16px; background: var(--card); display: flex; align-items: center; justify-content: center; gap: 12px; }
      .eye { width: 12px; height: 12px; border-radius: 50%; background: var(--fg); animation: look 5s ease-in-out infinite; }
      .code { font-size: 4.5rem; font-weight: 800; margin: 1.5rem 0 0; letter-spacing: -0.02em; }
      h1 { font-size: 1.25rem; margin: .5rem 0; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: .5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: .55rem 1.1rem; border-radius: .6rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--accent); color: #111; } .secondary { background: transparent; color: var(--fg); border-color: #3f3f46; }
      @keyframes ping { 0% { transform: scale(.35); opacity: .9 } 100% { transform: scale(1.15); opacity: 0 } }
      @keyframes spin { to { transform: rotate(360deg) } }
      @keyframes bob { 0%,100% { transform: translate(-50%,-50%) } 50% { transform: translate(-50%, calc(-50% - 8px)) } }
      @keyframes sway { 0%,100% { transform: translateX(-50%) rotate(-14deg) } 50% { transform: translateX(-50%) rotate(14deg) } }
      @keyframes blink { 0% { opacity: 1 } 50% { opacity: .15 } }
      @keyframes look { 0%,20%,100% { transform: none } 30% { transform: translateX(-4px) } 45% { transform: translateX(4px) } 60% { transform: none } 63% { transform: scaleY(.1) } 66% { transform: none } }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="scene" aria-hidden="true">
        <span class="ring"></span><span class="ring"></span><span class="ring"></span>
        <div class="orbit"><i></i></div>
        <div class="bot"><span class="ant"><b></b></span><div class="head"><span class="eye"></span><span class="eye"></span></div></div>
      </div>
      <div class="code">500</div>
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. Try refreshing, or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
