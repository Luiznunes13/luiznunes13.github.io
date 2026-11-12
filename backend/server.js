const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
// Fora da pasta do site: o deploy faz git clean e passa a pasta pro www-data,
// e o backend roda com o usuário da VM (não conseguia gravar lá).
const DATA_FILE = process.env.SCORES_FILE || path.join(os.homedir(), 'housegames-data', 'scores.json');
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

// Só os jogos da casa: antes qualquer nome em /api/scores/<nome> criava uma
// lista nova no arquivo, e um robô podia encher o disco da VM do site.
const GAMES = new Set(['block-puzzle-house', 'brain-house', 'cruzadinhas-house']);
const MAX_SCORE = 10000000;
const MAX_PER_GAME = 100;
// Limite de envios por IP (em memória; zera se o processo reiniciar).
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10;
const hits = new Map();

app.set('trust proxy', 'loopback'); // IP real vem do Nginx (X-Forwarded-For)
app.use(cors({ origin: ['https://rednosegamehouse.duckdns.org', 'https://luiznunes13.github.io'] }));
app.use(express.json({ limit: '1kb' }));

function getScores() {
  if (!fs.existsSync(DATA_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

// Grava num temporário e renomeia: o arquivo nunca fica pela metade.
function saveScores(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// Nome: só letras, números e espaço, 1 a 20 caracteres.
function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.normalize('NFC').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().substring(0, 20);
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 10000) hits.clear(); // ponytail: limpeza grossa; trocar por LRU se o tráfego crescer
  return list.length > RATE_MAX;
}

function knownGame(req, res, next) {
  if (!GAMES.has(req.params.game)) {
    return res.status(404).json({ error: 'Unknown game' });
  }
  next();
}

app.get('/api/scores/:game', knownGame, (req, res) => {
  const gameScores = getScores()[req.params.game] || [];
  gameScores.sort((a, b) => b.score - a.score);
  res.json(gameScores.slice(0, 10));
});

app.post('/api/scores/:game', knownGame, (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  const name = cleanName(req.body && req.body.name);
  const score = req.body && req.body.score;
  if (!name || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: 'Invalid name or score' });
  }

  const { game } = req.params;
  const scores = getScores();
  // Joga fora listas de jogos que não existem mais (lixo do formato antigo).
  for (const key of Object.keys(scores)) {
    if (!GAMES.has(key)) delete scores[key];
  }
  scores[game] = scores[game] || [];
  scores[game].push({ name, score, date: new Date().toISOString() });
  scores[game].sort((a, b) => b.score - a.score);
  scores[game] = scores[game].slice(0, MAX_PER_GAME);

  saveScores(scores);
  res.status(201).json({ success: true, scores: scores[game].slice(0, 10) });
});

app.listen(PORT, () => {
  console.log(`Leaderboard server running on port ${PORT}`);
});
