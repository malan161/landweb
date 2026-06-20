const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'messages.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// File-based storage
function readMessages() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeMessages(messages) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf-8');
}

function addMessage(text, type) {
  const messages = readMessages();
  const msg = {
    id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
    text: text.trim(),
    type: type,
    time: new Date().toISOString(),
  };
  messages.push(msg);
  writeMessages(messages);
  return msg;
}

function deleteMessage(id) {
  const messages = readMessages();
  const filtered = messages.filter((m) => m.id !== id);
  if (filtered.length === messages.length) return false;
  writeMessages(filtered);
  return true;
}

// App setup
const app = express();
const server = http.createServer(app);

app.use(express.json());

// Redirect logvis.ru -> www.logvis.ru
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host && host === 'logvis.ru') {
    return res.redirect(301, `https://www.logvis.ru${req.url}`);
  }
  next();
});

// Admin auth middleware (simple) — must be BEFORE static
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('Ошибка: ADMIN_USER и ADMIN_PASS должны быть установлены в .env файле');
  process.exit(1);
}

app.use('/admin.html', (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Logvis Admin"');
    return res.status(401).send('Требуется авторизация');
  }
  const base64 = auth.split(' ')[1];
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');
  const [user, pass] = decoded.split(':');
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Logvis Admin"');
    return res.status(401).send('Неверные данные');
  }
  next();
});

app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  },
}));

// API Routes
app.get('/api/messages', (req, res) => {
  const messages = readMessages();
  res.json({ ok: true, messages });
});

app.post('/api/messages', (req, res) => {
  const { text, type } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ ok: false, error: 'Text is required' });
  }
  const msg = addMessage(text, type || 'user');
  broadcast({ type: 'new_message', message: msg });
  res.json({ ok: true, message: msg });
});

app.delete('/api/messages/:id', (req, res) => {
  const deleted = deleteMessage(req.params.id);
  if (!deleted) {
    return res.status(404).json({ ok: false, error: 'Message not found' });
  }
  broadcast({ type: 'delete_message', id: req.params.id });
  res.json({ ok: true });
});

// WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  const messages = readMessages();
  ws.send(JSON.stringify({ type: 'init', messages }));

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'send_message') {
        const msg = addMessage(data.text, 'user');
        broadcast({ type: 'new_message', message: msg });

        const replies = [
          'Спасибо за ваш интерес! Мы свяжемся с вами в ближайшее время.',
          'Отличный вопрос! Напишите нам на почту info@logvis.ru для подробной консультации.',
          'Спасибо за сообщение! Мы уже обрабатываем ваш запрос.',
          'Хотите обсудить проект? Оставьте ваш контакт — мы перезвоним.',
        ];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        setTimeout(() => {
          const botMsg = addMessage(reply, 'bot');
          broadcast({ type: 'new_message', message: botMsg });
        }, 1000 + Math.random() * 2000);
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🚀 Logvis запущен!');
  console.log(`  📄 Сайт:        http://localhost:${PORT}`);
  console.log(`  🔧 Админка:     http://localhost:${PORT}/admin.html`);
  console.log(`  💬 WS:          ws://localhost:${PORT}/ws`);
  console.log('');
  console.log(`  Логин: admin / Пароль: ${ADMIN_PASS}`);
  console.log('');
});
