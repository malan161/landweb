(function () {
  var CHAT_KEY = 'logvis_chat_messages';

  function formatTime(iso) {
    var d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: 'numeric', month: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function getLocalMessages() {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || []; }
    catch { return []; }
  }

  function saveLocalMessages(msgs) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
  }

  function fetchMessages() {
    return fetch('/api/messages', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) return { ok: true, messages: data.messages };
        return { ok: false, messages: getLocalMessages() };
      })
      .catch(function () { return { ok: false, messages: getLocalMessages() }; });
  }

  function deleteMessageOnServer(id) {
    return fetch('/api/messages/' + id, { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (data) { return data.ok; })
      .catch(function () { return false; });
  }

  function sendReply(text) {
    return fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, type: 'admin' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) return true;
        // Fallback to localStorage
        var msgs = getLocalMessages();
        msgs.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: text, type: 'admin',
          time: new Date().toISOString(),
        });
        saveLocalMessages(msgs);
        return true;
      })
      .catch(function () {
        var msgs = getLocalMessages();
        msgs.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text: text, type: 'admin',
          time: new Date().toISOString(),
        });
        saveLocalMessages(msgs);
        return true;
      });
  }

  function updateServerStatus(connected) {
    var el = document.getElementById('serverStatus');
    if (!el) return;
    if (connected) {
      el.innerHTML = '🟢 Сервер';
      el.style.color = '#22c55e';
    } else {
      el.innerHTML = '🟡 Локальный режим';
      el.style.color = '#eab308';
    }
  }

  function render() {
    var totalEl = document.getElementById('totalMessages');
    var usersEl = document.getElementById('userMessages');
    var container = document.getElementById('messagesList');
    if (!container) return;

    fetchMessages().then(function (result) {
      updateServerStatus(result.ok);
      var messages = result.messages;
      if (totalEl) totalEl.textContent = messages.length;
      if (usersEl) usersEl.textContent = messages.filter(function (m) { return m.type === 'user'; }).length;

      if (messages.length === 0) {
        container.innerHTML = '<div class="admin-empty">Сообщений пока нет</div>';
        return;
      }

      container.innerHTML = '';
      messages.slice().reverse().forEach(function (msg) {
        var div = document.createElement('div');
        div.className = 'admin-message';

        var badgeText = msg.type === 'user' ? 'Клиент' : msg.type === 'admin' ? 'Админ' : 'Бот';
        var badgeClass = 'admin-message__badge--' + msg.type;

        div.innerHTML =
          '<span class="admin-message__badge ' + badgeClass + '">' + badgeText + '</span>' +
          '<div class="admin-message__body">' +
            '<div class="admin-message__text">' + msg.text + '</div>' +
            '<div class="admin-message__time">' + formatTime(msg.time) + '</div>' +
          '</div>' +
          '<button class="admin-delete-btn" data-id="' + msg.id + '">Удалить</button>';

        container.appendChild(div);
      });

      container.querySelectorAll('.admin-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.id;
          deleteMessageOnServer(id).then(function (ok) {
            if (!ok) {
              var msgs = getLocalMessages().filter(function (m) { return m.id !== id; });
              saveLocalMessages(msgs);
            }
            render();
          });
        });
      });
    });
  }

  var form = document.getElementById('replyForm');
  var input = document.getElementById('replyInput');
  if (form && input) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendReply(text).then(function () { render(); });
    });
  }

  render();
  setInterval(render, 5000);
})();
