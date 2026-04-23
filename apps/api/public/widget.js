/* RAGSupport Chat Widget — drop-in embed script */
(function () {
  'use strict';

  // ── Config from script tag ────────────────────────────────────────────────
  var script  = document.currentScript || (function () {
    var all = document.getElementsByTagName('script');
    return all[all.length - 1];
  })();

  var API_KEY = script.getAttribute('data-api-key') || '';
  var API_URL = (script.getAttribute('data-api-url') || '').replace(/\/$/, '');
  var COLOR   = script.getAttribute('data-primary-color') || '#6366f1';
  var POS     = script.getAttribute('data-position') || 'bottom-right';
  var TITLE   = script.getAttribute('data-title') || 'Support Chat';
  var GREETING = script.getAttribute('data-greeting') || 'Hi! How can I help you today?';

  if (!API_KEY || !API_URL) {
    console.warn('[RAGSupport] data-api-key and data-api-url are required.');
    return;
  }

  // ── Session ID (persists for the browser tab) ─────────────────────────────
  var SESSION_KEY = 'rsg_sid_' + btoa(API_KEY).slice(0, 8);
  var sessionId   = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '#rsg-bubble{position:fixed;z-index:2147483647;width:52px;height:52px;border-radius:50%;background:' + COLOR + ';',
    'border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);display:flex;align-items:center;',
    'justify-content:center;transition:transform .15s;outline:none;}',
    '#rsg-bubble:hover{transform:scale(1.08);}',
    '#rsg-bubble svg{width:24px;height:24px;fill:#fff;}',

    '#rsg-window{position:fixed;z-index:2147483646;width:360px;height:520px;max-height:calc(100vh - 100px);',
    'background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.18);',
    'display:flex;flex-direction:column;overflow:hidden;',
    'transition:opacity .2s,transform .2s;opacity:0;pointer-events:none;transform:translateY(12px) scale(.97);}',
    '#rsg-window.rsg-open{opacity:1;pointer-events:all;transform:translateY(0) scale(1);}',

    '#rsg-header{background:' + COLOR + ';color:#fff;padding:14px 16px;',
    'display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
    '#rsg-header-title{font-size:15px;font-weight:600;font-family:system-ui,sans-serif;}',
    '#rsg-close{background:none;border:none;cursor:pointer;color:#fff;opacity:.8;',
    'font-size:20px;line-height:1;padding:0;display:flex;align-items:center;}',
    '#rsg-close:hover{opacity:1;}',

    '#rsg-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;',
    'font-family:system-ui,sans-serif;font-size:14px;}',
    '.rsg-msg{max-width:80%;padding:9px 13px;border-radius:12px;line-height:1.5;word-break:break-word;}',
    '.rsg-msg.rsg-bot{background:#f3f4f6;color:#111;align-self:flex-start;border-bottom-left-radius:4px;}',
    '.rsg-msg.rsg-user{background:' + COLOR + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px;}',

    '.rsg-dots{display:flex;gap:4px;align-items:center;padding:4px 0;}',
    '.rsg-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;',
    'animation:rsg-bounce .9s infinite ease-in-out;}',
    '.rsg-dot:nth-child(2){animation-delay:.15s;}',
    '.rsg-dot:nth-child(3){animation-delay:.3s;}',
    '@keyframes rsg-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',

    '#rsg-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb;flex-shrink:0;}',
    '#rsg-input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 11px;',
    'font-size:14px;font-family:system-ui,sans-serif;resize:none;outline:none;',
    'max-height:96px;line-height:1.4;}',
    '#rsg-input:focus{border-color:' + COLOR + ';}',
    '#rsg-send{background:' + COLOR + ';color:#fff;border:none;border-radius:8px;',
    'width:38px;height:38px;cursor:pointer;display:flex;align-items:center;justify-content:center;',
    'flex-shrink:0;align-self:flex-end;transition:opacity .15s;}',
    '#rsg-send:disabled{opacity:.45;cursor:default;}',
    '#rsg-send svg{width:18px;height:18px;fill:#fff;}',
  ].join('');
  document.head.appendChild(css);

  // ── Position helpers ──────────────────────────────────────────────────────
  var isRight  = POS.includes('right');
  var isBottom = POS.includes('bottom');
  var edge     = 20; // px from edge

  function applyPos(el, offsetBottom) {
    el.style[isRight  ? 'right'  : 'left']  = edge + 'px';
    el.style[isBottom ? 'bottom' : 'top']   = (edge + (offsetBottom || 0)) + 'px';
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  // Bubble
  var bubble = document.createElement('button');
  bubble.id = 'rsg-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  applyPos(bubble, 0);
  document.body.appendChild(bubble);

  // Window
  var win = document.createElement('div');
  win.id = 'rsg-window';
  applyPos(win, 64);
  win.innerHTML = [
    '<div id="rsg-header">',
      '<span id="rsg-header-title">' + escHtml(TITLE) + '</span>',
      '<button id="rsg-close" aria-label="Close chat">&#x2715;</button>',
    '</div>',
    '<div id="rsg-messages"></div>',
    '<form id="rsg-form">',
      '<textarea id="rsg-input" rows="1" placeholder="Type a message…"></textarea>',
      '<button id="rsg-send" type="submit" aria-label="Send">',
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">',
          '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>',
        '</svg>',
      '</button>',
    '</form>',
  ].join('');
  document.body.appendChild(win);

  var msgs   = document.getElementById('rsg-messages');
  var input  = document.getElementById('rsg-input');
  var form   = document.getElementById('rsg-form');
  var send   = document.getElementById('rsg-send');
  var close  = document.getElementById('rsg-close');

  // Greeting bubble
  appendBot(GREETING);

  // ── Open / close ──────────────────────────────────────────────────────────
  var isOpen = false;

  bubble.addEventListener('click', function () {
    isOpen = !isOpen;
    win.classList.toggle('rsg-open', isOpen);
    bubble.innerHTML = isOpen
      ? '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
      : '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
    if (isOpen) { scrollToBottom(); input.focus(); }
  });

  close.addEventListener('click', function () {
    isOpen = false;
    win.classList.remove('rsg-open');
    bubble.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  });

  // Auto-resize textarea
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 96) + 'px';
  });

  // Send on Enter (Shift+Enter = newline)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  // ── Send message ──────────────────────────────────────────────────────────
  var streaming = false;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || streaming) return;

    appendUser(text);
    input.value = '';
    input.style.height = 'auto';
    send.disabled = true;
    streaming = true;

    var typingEl = appendTyping();

    fetch(API_URL + '/api/chat/message', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    API_KEY,
      },
      body: JSON.stringify({ message: text, sessionId: sessionId }),
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);

      var botBubble = null;
      var accumulated = '';

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer  = '';

      function read() {
        reader.read().then(function (result) {
          if (result.done) {
            finishStream(typingEl);
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete last line

          lines.forEach(function (line) {
            if (!line.startsWith('data: ')) return;
            var raw = line.slice(6).trim();
            if (raw === '[DONE]') return;
            try {
              var parsed = JSON.parse(raw);
              var token  = typeof parsed === 'string' ? parsed : parsed.token;
              if (token) {
                if (!botBubble) {
                  typingEl.remove();
                  botBubble = appendBot('');
                }
                accumulated += token;
                botBubble.textContent = accumulated;
                scrollToBottom();
              }
            } catch (_) {}
          });

          read();
        }).catch(function () { finishStream(typingEl); });
      }

      read();
    })
    .catch(function () {
      typingEl.remove();
      appendBot('Sorry, something went wrong. Please try again.');
      finishStream(null);
    });
  });

  function finishStream(typingEl) {
    if (typingEl && typingEl.parentNode) typingEl.remove();
    send.disabled = false;
    streaming = false;
    scrollToBottom();
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function appendUser(text) {
    var el = document.createElement('div');
    el.className = 'rsg-msg rsg-user';
    el.textContent = text;
    msgs.appendChild(el);
    scrollToBottom();
  }

  function appendBot(text) {
    var el = document.createElement('div');
    el.className = 'rsg-msg rsg-bot';
    el.textContent = text;
    msgs.appendChild(el);
    scrollToBottom();
    return el;
  }

  function appendTyping() {
    var el = document.createElement('div');
    el.className = 'rsg-msg rsg-bot';
    el.innerHTML = '<div class="rsg-dots"><div class="rsg-dot"></div>' +
      '<div class="rsg-dot"></div><div class="rsg-dot"></div></div>';
    msgs.appendChild(el);
    scrollToBottom();
    return el;
  }

  function scrollToBottom() {
    msgs.scrollTop = msgs.scrollHeight;
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
})();
