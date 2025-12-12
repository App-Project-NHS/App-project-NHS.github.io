const mysql = require("mysql2/promise");
const cors = require("cors");
const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const CACHE_DURATION_MS = 1000 * 60 * 60; 

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

console.log("✅ Server starting in Optimized Mode...");

app.get("/api/search", async (req, res) => {
  const { postcode, service, range } = req.query;

  if (!postcode || !service) {
    return res.status(400).json({ error: "Missing postcode or service" });
  }

  const serviceTable = ALLOWED_TABLES[service];
  if (!serviceTable) {
    return res.status(400).json({ error: "Invalid service type" });
  }

  const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
  const searchRange = parseFloat(range) || 30;

  try {
    let patientLat, patientLon;

    const cachedLoc = locationCache.get(cleanPostcode);
    const now = Date.now();

    if (cachedLoc && (now - cachedLoc.timestamp < CACHE_DURATION_MS)) {
      patientLat = cachedLoc.lat;
      patientLon = cachedLoc.lon;
    } else {
      const patientLocationQuery = "SELECT latitude, longitude FROM Postcode WHERE pcd2 = ?";
      const [locationResults] = await pool.query(patientLocationQuery, [cleanPostcode]);

      if (locationResults.length === 0) {
        return res.json([]); 
      }

      patientLat = locationResults[0].latitude;
      patientLon = locationResults[0].longitude;

      locationCache.set(cleanPostcode, { lat: patientLat, lon: patientLon, timestamp: now });
    }

    const latRange = searchRange / 69.0;
    const lonRange = searchRange / (69.0 * Math.cos(patientLat * (Math.PI / 180)));

    const minLat = patientLat - latRange;
    const maxLat = patientLat + latRange;
    const minLon = patientLon - lonRange;
    const maxLon = patientLon + lonRange;

    const distanceQuery = `
      SELECT *, (3959 * acos(
          cos(radians(?)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(?)) +
          sin(radians(?)) * sin(radians(latitude))
        )) AS distance
      FROM ${serviceTable}
      WHERE
        latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
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
    console.error("Server Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});