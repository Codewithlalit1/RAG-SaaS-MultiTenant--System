// RAG Support Widget — vanilla JS, zero runtime dependencies.
// Embed: <script src="widget.min.js" data-api-key="rsk_..." data-api-url="https://api.example.com"></script>

const script =
  document.currentScript ||
  document.querySelector('script[data-api-key]');

if (!script) {
  console.warn('[RAGWidget] could not locate own <script> tag');
} else {
  init(script);
}

function init(scriptEl) {
  const API_KEY = scriptEl.dataset.apiKey;
  const API_URL = (scriptEl.dataset.apiUrl || '').replace(/\/$/, '');
  const TENANT  = scriptEl.dataset.tenant  || 'default';
  const TITLE   = scriptEl.dataset.title   || 'Support';
  const COLOR   = scriptEl.dataset.color   || '#4f46e5';

  if (!API_KEY) {
    console.warn('[RAGWidget] data-api-key is required');
    return;
  }

  // ── Session ID (persisted per tenant) ──────────────────────────────────────
  const SESSION_KEY = `rsk_session_${TENANT}`;
  let sessionId = localStorage.getItem(SESSION_KEY) || uuid();
  localStorage.setItem(SESSION_KEY, sessionId);

  // ── Shadow DOM host ────────────────────────────────────────────────────────
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'closed' });

  // ── Styles (injected into shadow root — fully isolated) ────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = buildCss(COLOR);
  root.appendChild(styleEl);

  // ── FAB (floating action button) ───────────────────────────────────────────
  const fab = document.createElement('button');
  fab.id = 'fab';
  fab.setAttribute('aria-label', 'Open support chat');
  fab.innerHTML = iconChat();
  root.appendChild(fab);

  // ── Chat window ────────────────────────────────────────────────────────────
  const win = document.createElement('div');
  win.id = 'win';
  win.className = 'hidden';
  win.innerHTML = `
    <div id="hdr">
      <span id="hdr-title">${esc(TITLE)}</span>
      <button id="close-btn" aria-label="Close chat">&#x2715;</button>
    </div>
    <div id="msgs" role="log" aria-live="polite" aria-atomic="false"></div>
    <div id="foot">
      <input id="inp" type="text" placeholder="Ask a question…" autocomplete="off" />
      <button id="send">Send</button>
    </div>`;
  root.appendChild(win);

  // ── Element refs ───────────────────────────────────────────────────────────
  const msgs    = root.getElementById('msgs');
  const inp     = root.getElementById('inp');
  const sendBtn = root.getElementById('send');

  // ── Open / close ───────────────────────────────────────────────────────────
  let open = false;

  fab.addEventListener('click', () => setOpen(!open));
  root.getElementById('close-btn').addEventListener('click', () => setOpen(false));

  function setOpen(next) {
    open = next;
    win.className = open ? '' : 'hidden';
    fab.innerHTML = open ? iconClose() : iconChat();
    if (open) inp.focus();
  }

  // ── Send message ───────────────────────────────────────────────────────────
  sendBtn.addEventListener('click', send);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  async function send() {
    const text = inp.value.trim();
    if (!text || sendBtn.disabled) return;

    inp.value = '';
    setEnabled(false);

    addBubble('user', text);
    const reply = addBubble('assistant', '…', true);

    try {
      const res = await fetch(`${API_URL}/api/chat/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body:    JSON.stringify({ message: text, sessionId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      let accumulated = '';
      reply.classList.remove('typing');
      reply.textContent = '';

      // Parse the SSE stream from the POST response body
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.startsWith('data: ')) continue;
          const raw = block.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const { token } = JSON.parse(raw);
            if (token) {
              accumulated += token;
              reply.textContent = accumulated;
              scrollDown();
            }
          } catch { /* skip malformed event */ }
        }
      }

      if (!accumulated) {
        reply.textContent = "I don't have information on that. Please contact our support team.";
      }
    } catch (err) {
      reply.classList.remove('typing');
      reply.textContent = `Sorry, something went wrong: ${err.message}`;
    } finally {
      setEnabled(true);
      inp.focus();
      scrollDown();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addBubble(role, text, typing) {
    const el = document.createElement('div');
    el.className = 'msg ' + role + (typing ? ' typing' : '');
    el.textContent = text;
    msgs.appendChild(el);
    scrollDown();
    return el;
  }

  function scrollDown() {
    msgs.scrollTop = msgs.scrollHeight;
  }

  function setEnabled(on) {
    sendBtn.disabled = !on;
    inp.disabled     = !on;
  }
}

// ── Pure helpers (no DOM access) ───────────────────────────────────────────

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for browsers without crypto.randomUUID (pre-2021)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function iconChat() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="26" height="26">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`;
}

function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"
               stroke-linecap="round" width="22" height="22">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;
}

function buildCss(c) {
  // c = primary colour (hex).  All widget styles are scoped inside the shadow root.
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    #fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483646;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${c}; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,.22);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s ease;
    }
    #fab:hover { transform: scale(1.08); }

    #win {
      position: fixed; bottom: 92px; right: 24px; z-index: 2147483647;
      width: 360px; height: 500px; max-height: calc(100vh - 112px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 48px rgba(0,0,0,.18);
      display: flex; flex-direction: column;
      transform-origin: bottom right;
      transition: opacity .15s ease, transform .15s ease;
      font-family: system-ui, -apple-system, sans-serif;
    }
    #win.hidden { opacity: 0; transform: scale(.92); pointer-events: none; }

    #hdr {
      background: ${c}; border-radius: 16px 16px 0 0;
      padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    }
    #hdr-title { color: #fff; font-size: 14px; font-weight: 600; }
    #close-btn {
      background: transparent; border: none; cursor: pointer;
      color: #fff; opacity: .75; font-size: 20px; line-height: 1;
      padding: 2px 4px; border-radius: 4px;
    }
    #close-btn:hover { opacity: 1; background: rgba(255,255,255,.15); }

    #msgs {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    /* Custom scrollbar */
    #msgs::-webkit-scrollbar { width: 4px; }
    #msgs::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }

    .msg {
      max-width: 82%; padding: 9px 13px; border-radius: 16px;
      font-size: 14px; line-height: 1.5; word-break: break-word;
    }
    .msg.user {
      align-self: flex-end; background: ${c}; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .msg.assistant {
      align-self: flex-start; background: #f3f4f6; color: #111;
      border-bottom-left-radius: 4px;
    }
    .msg.typing { color: #9ca3af; font-style: italic; }

    #foot {
      padding: 10px 12px; border-top: 1px solid #e5e7eb;
      display: flex; gap: 8px; align-items: center; flex-shrink: 0;
    }
    #inp {
      flex: 1; border: 1px solid #d1d5db; border-radius: 10px;
      padding: 9px 12px; font: 14px system-ui, sans-serif; outline: none;
      transition: border-color .15s, box-shadow .15s;
    }
    #inp:focus { border-color: ${c}; box-shadow: 0 0 0 3px ${c}33; }
    #inp:disabled { background: #f9fafb; }

    #send {
      background: ${c}; color: #fff; border: none; border-radius: 10px;
      padding: 9px 15px; font: 600 13px system-ui, sans-serif;
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
      transition: filter .15s;
    }
    #send:not(:disabled):hover { filter: brightness(1.1); }
    #send:disabled { opacity: .5; cursor: default; }

    @media (max-width: 400px) {
      #win { width: calc(100vw - 16px); right: 8px; bottom: 80px; }
      #fab { right: 16px; bottom: 16px; }
    }
  `;
}
