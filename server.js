// Polyfill for environments where global File is missing (Node < 20)
if (typeof globalThis.File === "undefined") {
  globalThis.File = class File {};
}

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mysql = require("mysql2/promise");
const scraper = require("./utils/scraper");

const app = express();
const PORT = process.env.PORT || 8080;

// IMPORTANT: Trust proxy for Railway deployment
app.set("trust proxy", 1);

// Middleware
app.use(cors());
app.use(compression());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests from this IP, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// MySQL connection pool
let db;

async function initializeDatabase() {
  try {
    if (!process.env.MYSQLHOST || !process.env.MYSQLUSER || !process.env.MYSQLDATABASE) {
      console.warn("⚠️  MYSQL env vars not set; starting without database features.");
      return false;
    }
    console.log(`Attempting to connect to MySQL at ${process.env.MYSQLHOST}:${process.env.MYSQLPORT}...`);
    
    db = mysql.createPool({
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: process.env.MYSQLPORT,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 30000,
    });

    const conn = await db.getConnection();
    console.log("✅ MySQL connected successfully!");
    
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        deviceId VARCHAR(255) NOT NULL,
        animeSlug VARCHAR(255) NOT NULL,
        episodeSlug VARCHAR(255) NOT NULL,
        lastPosition INT DEFAULT 0,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_device_episode (deviceId, episodeSlug),
        INDEX idx_device (deviceId),
        INDEX idx_episode (episodeSlug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ Table 'history' initialized!");
    
    conn.release();
    return true;
  } catch (err) {
    console.error("❌ Database initialization error:", err.message);
    return false;
  }
}

// Attach db to request
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    database: db ? "connected" : "disconnected"
  });
});

/* ==================== ANIME SCRAPING ROUTES ==================== */

// Order matters: specific routes before generic "/api/anime/:slug"
app.get("/api/anime/home", scraper.homepage);
app.get("/api/anime/schedule", scraper.schedule);
app.get("/api/anime/genre/:genre", scraper.genre);
app.get("/api/anime/release-year/:year", scraper.releaseYear);
app.get("/api/anime/episode/:slug", scraper.detailEpisode);
app.get("/api/anime/search/:query", scraper.search);
app.get("/api/anime/ongoing", scraper.ongoing);
app.get("/api/anime/season/ongoing", scraper.seasonOngoing);
app.get("/api/anime/:slug", scraper.detailAnime);

// Aliases to match Flutter BASE_URL like /anime/*
app.get("/anime/home", scraper.homepage);
app.get("/anime/schedule", scraper.schedule);
app.get("/anime/genre/:genre", scraper.genre);
app.get("/anime/release-year/:year", scraper.releaseYear);
app.get("/anime/anime/:slug", scraper.detailAnime);
app.get("/anime/episode/:slug", scraper.detailEpisode);
app.get("/anime/search/:query", scraper.search);
app.get("/anime/ongoing", scraper.ongoing);
app.get("/anime/season/ongoing", scraper.seasonOngoing);

/* ==================== HISTORY MANAGEMENT ROUTES ==================== */

app.post("/api/history", async (req, res) => {
  const { deviceId, animeSlug, episodeSlug, lastPosition } = req.body;
  
  if (!deviceId || !episodeSlug) {
    return res.status(400).json({ error: "deviceId and episodeSlug are required" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database is not configured" });
  }

  try {
    await db.execute(`
      INSERT INTO history (deviceId, animeSlug, episodeSlug, lastPosition)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        lastPosition = VALUES(lastPosition),
        updatedAt = CURRENT_TIMESTAMP
    `, [deviceId, animeSlug, episodeSlug, lastPosition || 0]);
    
    res.json({ success: true, message: "Watch progress saved" });
  } catch (err) {
    console.error("❌ Save history error:", err);
    res.status(500).json({ error: "Failed to save watch progress" });
  }
});

app.get("/api/history", async (req, res) => {
  const { deviceId } = req.query;
  
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId query parameter is required" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database is not configured" });
  }

  try {
    const [rows] = await db.execute(
      `SELECT * FROM history WHERE deviceId = ? ORDER BY updatedAt DESC`,
      [deviceId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Fetch history error:", err);
    res.status(500).json({ error: "Failed to fetch watch history" });
  }
});

app.get("/api/history/:episodeSlug", async (req, res) => {
  const { deviceId } = req.query;
  const { episodeSlug } = req.params;
  
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId query parameter is required" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database is not configured" });
  }

  try {
    const [rows] = await db.execute(
      `SELECT * FROM history WHERE deviceId = ? AND episodeSlug = ?`,
      [deviceId, episodeSlug]
    );
    
    if (rows.length === 0) {
      return res.json({ lastPosition: 0, found: false });
    }
    
    res.json({ ...rows[0], found: true });
  } catch (err) {
    console.error("❌ Fetch episode progress error:", err);
    res.status(500).json({ error: "Failed to fetch episode progress" });
  }
});

app.delete("/api/history", async (req, res) => {
  const { deviceId, episodeSlug } = req.body;
  
  if (!deviceId || !episodeSlug) {
    return res.status(400).json({ error: "deviceId and episodeSlug are required" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database is not configured" });
  }

  try {
    const result = await db.execute(
      `DELETE FROM history WHERE deviceId = ? AND episodeSlug = ?`,
      [deviceId, episodeSlug]
    );
    
    if (result[0].affectedRows === 0) {
      return res.status(404).json({ error: "History entry not found" });
    }
    
    res.json({ success: true, message: "Watch history deleted" });
  } catch (err) {
    console.error("❌ Delete history error:", err);
    res.status(500).json({ error: "Failed to delete watch history" });
  }
});

app.delete("/api/history/device/:deviceId", async (req, res) => {
  const { deviceId } = req.params;
  
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  if (!db) {
    return res.status(503).json({ error: "Database is not configured" });
  }

  try {
    await db.execute(`DELETE FROM history WHERE deviceId = ?`, [deviceId]);
    res.json({ success: true, message: "All watch history cleared" });
  } catch (err) {
    console.error("❌ Clear all history error:", err);
    res.status(500).json({ error: "Failed to clear watch history" });
  }
});

/* ==================== ERROR HANDLING ==================== */

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found", path: req.path });
});

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

/* ==================== START SERVER ==================== */

async function start() {
  const dbReady = await initializeDatabase();
  if (!dbReady) {
    console.warn("⚠️  Continuing without database connection. History endpoints will be disabled.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  });
}

start();

process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  if (db) await db.end();
  process.exit(0);
});