(function () {
  const CHAT_KEY = 'logvis_chat_messages';
  let ws = null;
  let useServer = false;
  let messageCache = [];

  function getLocalMessages() {
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveLocalMessages(messages) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function renderMessages(container) {
    const messages = useServer ? messageCache : getLocalMessages();
    container.innerHTML = '';
    messages.forEach((msg) => {
      const el = document.createElement('div');
      el.className = 'chat-message chat-message--' + msg.type;
      el.innerHTML = msg.text + '<div class="chat-message__time">' + formatTime(msg.time) + '</div>';
      container.appendChild(el);
    });
    container.scrollTop = container.scrollHeight;
  }

  function connectWs(containers) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = protocol + '//' + location.host + '/ws';

    try {
      ws = new WebSocket(url);
    } catch (e) {
      useServer = false;
      initFallback(containers);
      return;
    }

    ws.onopen = function () {
      useServer = true;
    };

    ws.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          messageCache = data.messages || [];
          containers.forEach(function (c) { if (c) renderMessages(c); });
        } else if (data.type === 'new_message') {
          messageCache.push(data.message);
          containers.forEach(function (c) { if (c) renderMessages(c); });
        } else if (data.type === 'delete_message') {
          messageCache = messageCache.filter(function (m) { return m.id !== data.id; });
          containers.forEach(function (c) { if (c) renderMessages(c); });
        }
      } catch (e) { /* ignore */ }
    };

    ws.onclose = function () {
      if (useServer) {
        setTimeout(function () { connectWs(containers); }, 3000);
      }
    };

    ws.onerror = function () {
      useServer = false;
      initFallback(containers);
    };
  }

  function sendViaServer(text) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'send_message', text: text }));
      return true;
    }
    return false;
  }

  function sendViaApi(text) {
    return fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, type: 'user' }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) {
        messageCache.push(data.message);
        return true;
      }
      return false;
    }).catch(function () { return false; });
  }

  function initFallback(containers) {
    var msgs = getLocalMessages();
    if (msgs.length === 0) {
      msgs.push({
        id: 'init-' + Date.now(),
        text: 'Здравствуйте! Чем мы можем вам помочь?',
        type: 'bot',
        time: new Date().toISOString(),
      });
      saveLocalMessages(msgs);
    }
    containers.forEach(function (c) { if (c) renderMessages(c); });
  }

  function initChatInstance(containerId, inputId, sendId) {
    var container = document.getElementById(containerId);
    var input = document.getElementById(inputId);
    var sendBtn = document.getElementById(sendId);

    if (!container || !input || !sendBtn) return;

    function handleSend() {
      var text = input.value.trim();
      if (!text) return;

      input.value = '';
      input.focus();

      if (useServer) {
        if (!sendViaServer(text)) {
          sendViaApi(text);
        }
      } else {
        var msgs = getLocalMessages();
        msgs.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: text,
          type: 'user',
          time: new Date().toISOString(),
        });
        saveLocalMessages(msgs);
        renderMessages(container);

        setTimeout(function () {
          var replies = [
            'Спасибо за ваш интерес! Мы свяжемся с вами в ближайшее время.',
            'Отличный вопрос! Напишите нам на почту info@logvis.ru для подробной консультации.',
            'Спасибо за сообщение! Мы уже обрабатываем ваш запрос.',
            'Хотите обсудить проект? Оставьте ваш контакт — мы перезвоним.',
          ];
          var reply = replies[Math.floor(Math.random() * replies.length)];
          msgs = getLocalMessages();
          msgs.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            text: reply,
            type: 'bot',
            time: new Date().toISOString(),
          });
          saveLocalMessages(msgs);
          renderMessages(container);
        }, 1000 + Math.random() * 2000);
      }
    }

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSend();
    });

    return container;
  }

  function init() {
    var containers = [];

    var c1 = initChatInstance('chatMessages', 'chatInput', 'chatSend');
    if (c1) containers.push(c1);

    var c2 = initChatInstance('chatMessagesInline', 'chatInputInline', 'chatSendInline');
    if (c2) containers.push(c2);

    if (containers.length === 0) return;

    // Try server first
    connectWs(containers);

    // Also fetch via HTTP as backup to populate initial messages
    fetch('/api/messages').then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok && data.messages.length > 0) {
        messageCache = data.messages;
        containers.forEach(function (c) { renderMessages(c); });
        useServer = true;
      }
    }).catch(function () {
      // Fallback handled by initFallback
    });

    // Toggle floating chat
    var toggle = document.getElementById('chatToggle');
    var panel = document.getElementById('chatPanel');
    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        var isOpen = panel.classList.toggle('open');
        toggle.classList.toggle('active');
        if (isOpen) {
          renderMessages(panel.querySelector('.chat-messages'));
          var inp = panel.querySelector('.chat-input-area input');
          if (inp) inp.focus();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
