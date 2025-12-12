const mysql = require("mysql2/promise");
const cors = require("cors");
const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const CACHE_DURATION_MS = 1000 * 60 * 60; // 1 Hour

app.use(cors());
app.use(express.json());
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));

const pool = mysql.createPool({
  host: "mysql.cs.bangor.ac.uk",
  user: "jcr23gxs",
  password: "32392a0d3f",
  database: "jcr23gxs",
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const locationCache = new Map();

const ALLOWED_TABLES = {
  dentists: "dentists",
  schools: "schools",
  opticians: "opticians",
  gp: "gp"
};

console.log("✅ Server starting...");

app.get("/api/search", async (req, res) => {
  const { postcode, service, range } = req.query;


  if (!postcode || !service) {
    return res.status(400).json({ error: "Missing postcode or service" });
  }

  const serviceTable = ALLOWED_TABLES[service];
  if (!serviceTable) {
    return res.status(400).json({ error: "Invalid service type" });
  }

  const searchRange = parseFloat(range) || 30;

  try {
    let patientLat, patientLon;


    const cachedLoc = locationCache.get(postcode);
    const now = Date.now();

    if (cachedLoc && (now - cachedLoc.timestamp < CACHE_DURATION_MS)) {
      patientLat = cachedLoc.lat;
      patientLon = cachedLoc.lon;
    } else {
      const patientLocationQuery = "SELECT latitude, longitude FROM Postcode WHERE pcd2 = ?";
      const [locationResults] = await pool.query(patientLocationQuery, [postcode]);

      if (locationResults.length === 0) {
        return res.json([]); 
      }

      patientLat = locationResults[0].latitude;
      patientLon = locationResults[0].longitude;

      locationCache.set(postcode, { lat: patientLat, lon: patientLon, timestamp: now });
    }

    const latRange = searchRange / 69.0;
    const lonRange = searchRange / (69.0 * Math.cos(patientLat * (Math.PI / 180)));
    
    const minLat = patientLat - latRange;
    const maxLat = patientLat + latRange;
    const minLon = patientLon - lonRange;
    const maxLon = patientLon + lonRange;

    const distanceQuery = `
      SELECT t1.*, (3959 * acos(
          cos(radians(?)) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians(?)) +
          sin(radians(?)) * sin(radians(p.latitude))
        )) AS distance
      FROM ${serviceTable} AS t1
      JOIN Postcode AS p ON t1.postcode = p.pcd2
      WHERE
        p.latitude BETWEEN ? AND ?
        AND p.longitude BETWEEN ? AND ?
      HAVING distance < ?
      ORDER BY distance ASC
      LIMIT 30
    `;

    const params = [
      patientLat, patientLon, patientLat, 
      minLat, maxLat,                     
      minLon, maxLon,                     
      searchRange                        
    ];

    const [results] = await pool.query(distanceQuery, params);

    const formattedResults = results.map(row => ({
      ...row,
      distance: parseFloat(row.distance).toFixed(2)
    }));

    res.json(formattedResults);

  } catch (err) {
    console.error("Search Error:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});