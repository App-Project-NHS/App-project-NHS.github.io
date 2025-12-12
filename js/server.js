const mysql = require("mysql2/promise");
const cors = require("cors");
const express = require("express");
const path = require("path"); 
const app = express();

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

console.log("✅ Connection pool created.");

app.get("/api/search", async (req, res) => {
  console.log("--- Search request received ---");

  const { postcode, service, range } = req.query;
  const searchRange = parseFloat(range) || 30;
  let serviceTable = "";

  if (service === "dentists") serviceTable = "dentists";
  else if (service === "schools") serviceTable = "schools";
  else if (service === "opticians") serviceTable = "opticians";
  else if (service === "gp") serviceTable = "gp";
  else return res.status(400).json({ error: "Invalid service" });

  console.log(`Searching for ${service} within ${searchRange} miles of ${postcode}`);

  let db;
  try {
    db = await pool.getConnection();
    console.log("Connection borrowed from pool.");

    const patientLocationQuery = "SELECT latitude, longitude FROM Postcode WHERE pcd2 = ?";
    const [locationResults] = await db.query(patientLocationQuery, [postcode]);

    if (locationResults.length === 0) {
      console.log("Patient postcode not found in database.");
      db.release();
      return res.json([]);
    }

    const patientLat = locationResults[0].latitude;
    const patientLon = locationResults[0].longitude;
    console.log(`Patient location found: ${patientLat}, ${patientLon}`);

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

    console.log("Running final optimized distance query...");
    const [results] = await db.query(distanceQuery, params);

    console.log(`Query finished. Found ${results.length} results.`);

    // Format results
    const formattedResults = results.map(row => ({
      ...row,
      distance: parseFloat(row.distance).toFixed(2)
    }));

    res.json(formattedResults);

  } catch (err) {
    console.error("An error occurred during the search:", err);
    return res.status(500).json({ error: "Database query failed" });

  } finally {
    if (db) {
      db.release();
      console.log("Connection released back to pool.");
    }
  }
});

// --- Start the Server ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});