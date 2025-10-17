require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mysql = require("mysql2/promise");
const scraper = require("./utils/scraper");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 100 }));

// MySQL connection (Railway MySQL env)
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test koneksi + buat tabel history jika belum ada
db.getConnection()
  .then(async (conn) => {
    console.log("✅ MySQL connected!");
    
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        deviceId VARCHAR(255) NOT NULL,
        animeSlug VARCHAR(255) NOT NULL,
        episodeSlug VARCHAR(255) NOT NULL,
        lastPosition INT DEFAULT 0,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_device_episode (deviceId, episodeSlug)
      );
    `);
    console.log("✅ Table 'history' ready!");
    
    conn.release();
  })
  .catch(err => console.error("❌ MySQL connection error:", err));

// Attach db ke request
app.use((req, res, next) => {
  req.db = db;
  next();
});

/** ROUTES **/

// Anime scraping endpoints
app.get("/api/anime/home", scraper.homepage);
app.get("/api/anime/schedule", scraper.schedule);
app.get("/api/anime/genre/:genre", scraper.genre);
app.get("/api/anime/release-year/:year", scraper.releaseYear);
app.get("/api/anime/:slug", scraper.detailAnime);
app.get("/api/anime/episode/:slug", scraper.detailEpisode);
app.get("/api/anime/search/:query", scraper.search);
app.get("/api/anime/ongoing", scraper.ongoing);
app.get("/api/anime/season/ongoing", scraper.seasonOngoing);

// History endpoints
app.post("/api/history", async (req, res) => {
  const { deviceId, animeSlug, episodeSlug, lastPosition } = req.body;
  if (!deviceId || !episodeSlug) return res.status(400).json({ error: "deviceId & episodeSlug required" });

  try {
    await db.execute(`
      INSERT INTO history (deviceId, animeSlug, episodeSlug, lastPosition)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE lastPosition=?
    `, [deviceId, animeSlug, episodeSlug, lastPosition, lastPosition]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/history", async (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.status(400).json({ error: "deviceId required" });

  try {
    const [rows] = await db.execute(`SELECT * FROM history WHERE deviceId=?`, [deviceId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

app.delete("/api/history", async (req, res) => {
  const { deviceId, episodeSlug } = req.body;
  if (!deviceId || !episodeSlug) return res.status(400).json({ error: "deviceId & episodeSlug required" });

  try {
    await db.execute(`DELETE FROM history WHERE deviceId=? AND episodeSlug=?`, [deviceId, episodeSlug]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
