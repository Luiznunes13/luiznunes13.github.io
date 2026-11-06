const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'scores.json');

app.use(cors());
app.use(express.json());

// Helper to read scores
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

// Helper to save scores
function saveScores(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Get top scores for a game
app.get('/api/scores/:game', (req, res) => {
  const { game } = req.params;
  const scores = getScores();
  const gameScores = scores[game] || [];
  // Sort descending by score, top 10
  gameScores.sort((a, b) => b.score - a.score);
  res.json(gameScores.slice(0, 10));
});

// Submit a score
app.post('/api/scores/:game', (req, res) => {
  const { game } = req.params;
  const { name, score } = req.body;

  if (!name || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid name or score' });
  }

  const scores = getScores();
  if (!scores[game]) {
    scores[game] = [];
  }

  scores[game].push({
    name: name.substring(0, 20),
    score: Math.floor(score),
    date: new Date().toISOString()
  });

  // Keep top 100 per game
  scores[game].sort((a, b) => b.score - a.score);
  scores[game] = scores[game].slice(0, 100);

  saveScores(scores);
  res.status(201).json({ success: true, scores: scores[game].slice(0, 10) });
});

app.listen(PORT, () => {
  console.log(`Leaderboard server running on port ${PORT}`);
});
