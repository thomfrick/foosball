const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'foosball.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to the SQLite database:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Database Tables
db.serialize(() => {
  // Create Players Table
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      elo REAL DEFAULT 1500
    );
  `, (err) => {
    if (err) {
      console.error('Failed to create players table:', err.message);
      process.exit(1);
    } else {
      console.log('Players table is ready.');
    }
  });

  // Create Games Table
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team1_player1 INTEGER,
      team1_player2 INTEGER,
      team2_player1 INTEGER,
      team2_player2 INTEGER,
      score_team1 INTEGER,
      score_team2 INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(team1_player1) REFERENCES players(id),
      FOREIGN KEY(team1_player2) REFERENCES players(id),
      FOREIGN KEY(team2_player1) REFERENCES players(id),
      FOREIGN KEY(team2_player2) REFERENCES players(id)
    );
  `, (err) => {
    if (err) {
      console.error('Failed to create games table:', err.message);
      process.exit(1);
    } else {
      console.log('Games table is ready.');
    }
  });
});

// Utility function to calculate Elo ratings
const updateElo = async (team1Ids, team2Ids, team1Score, team2Score) => {
  const K = 32;

  try {
    const team1Elos = await Promise.all(team1Ids.map(id => getElo(id)));
    const team2Elos = await Promise.all(team2Ids.map(id => getElo(id)));

    const team1Avg = team1Elos.reduce((a, b) => a + b, 0) / team1Elos.length;
    const team2Avg = team2Elos.reduce((a, b) => a + b, 0) / team2Elos.length;

    const expectedScoreTeam1 = 1 / (1 + Math.pow(10, (team2Avg - team1Avg) / 400));
    const expectedScoreTeam2 = 1 / (1 + Math.pow(10, (team1Avg - team2Avg) / 400));

    const actualScoreTeam1 = team1Score > team2Score ? 1 : 0;
    const actualScoreTeam2 = team2Score > team1Score ? 1 : 0;

    // Update team 1 players
    await Promise.all(team1Ids.map((id, index) => {
      const newElo = team1Elos[index] + K * (actualScoreTeam1 - expectedScoreTeam1);
      return updatePlayerElo(id, newElo);
    }));

    // Update team 2 players
    await Promise.all(team2Ids.map((id, index) => {
      const newElo = team2Elos[index] + K * (actualScoreTeam2 - expectedScoreTeam2);
      return updatePlayerElo(id, newElo);
    }));

  } catch (error) {
    console.error('Error updating Elo ratings:', error.message);
    throw error;
  }
};

// Helper function to get Elo of a player
const getElo = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT elo FROM players WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject(new Error(`Player with ID ${id} not found.`));
      resolve(row.elo);
    });
  });
};

// Helper function to update a player's Elo rating
const updatePlayerElo = (playerId, newElo) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE players SET elo = ? WHERE id = ?", [newElo, playerId], function(err) {
      if (err) return reject(err);
      resolve();
    });
  });
};

// Routes
// Player Registration
app.post('/api/players', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  const trimmedName = name.trim();
  db.run("INSERT INTO players (name) VALUES (?)", [trimmedName], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Player name must be unique' });
      }
      console.error('Error inserting player:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id: this.lastID, name: trimmedName, elo: 1500 });
  });
});

// Get All Players
app.get('/api/players', (req, res) => {
  db.all("SELECT * FROM players ORDER BY name ASC", [], (err, rows) => {
    if (err) {
      console.error('Error fetching players:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Submit Game
app.post('/api/games', (req, res) => {
  const {
    team1_player1,
    team1_player2,
    team2_player1,
    team2_player2,
    score_team1,
    score_team2
  } = req.body;

  // Validate all fields are present
  if (
    !team1_player1 || !team1_player2 ||
    !team2_player1 || !team2_player2 ||
    score_team1 === undefined || score_team2 === undefined
  ) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Ensure player IDs are integers
  const players = [
    parseInt(team1_player1),
    parseInt(team1_player2),
    parseInt(team2_player1),
    parseInt(team2_player2)
  ];
  if (players.some(isNaN)) {
    return res.status(400).json({ error: 'Player IDs must be valid integers' });
  }

  // Server-side validation for unique players
  const uniquePlayers = new Set(players);
  if (uniquePlayers.size !== 4) {
    return res.status(400).json({ error: 'All players must be unique' });
  }

  // Validate scores are non-negative integers
  const scores = [
    parseInt(score_team1),
    parseInt(score_team2)
  ];
  if (scores.some(isNaN) || scores.some(score => score < 0)) {
    return res.status(400).json({ error: 'Scores must be non-negative integers' });
  }

  // Insert game into the database
  const insertGame = () => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO games
        (team1_player1, team1_player2, team2_player1, team2_player2, score_team1, score_team2)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        players[0], players[1], players[2], players[3],
        scores[0], scores[1],
        function(err) {
          if (err) {
            stmt.finalize();
            reject(err);
          } else {
            const gameId = this.lastID;
            stmt.finalize();
            resolve(gameId);
          }
        }
      );
    });
  };

  (async () => {
    try {
      const gameId = await insertGame();
      await updateElo(
        [players[0], players[1]],
        [players[2], players[3]],
        scores[0],
        scores[1]
      );
      res.json({ id: gameId });
    } catch (error) {
      console.error('Error submitting game:', error.message);
      res.status(500).json({ error: 'Database error' });
    }
  })();
});

// Get Match History
app.get('/api/games', (req, res) => {
  const query = `
    SELECT
      games.id,
      games.score_team1,
      games.score_team2,
      games.timestamp,
      p1.name AS team1_player1_name,
      p2.name AS team1_player2_name,
      p3.name AS team2_player1_name,
      p4.name AS team2_player2_name
    FROM games
    JOIN players p1 ON games.team1_player1 = p1.id
    JOIN players p2 ON games.team1_player2 = p2.id
    JOIN players p3 ON games.team2_player1 = p3.id
    JOIN players p4 ON games.team2_player2 = p4.id
    ORDER BY games.timestamp DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching games:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Get Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const query = `
    SELECT * FROM players
    ORDER BY elo DESC, name ASC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching leaderboard:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
