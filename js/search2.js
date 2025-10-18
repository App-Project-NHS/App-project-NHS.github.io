
const form = document.getElementById("searchForm");
const tableBody = document.getElementById("resultsTable");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  console.log("Starting search... Waiting for server response...");
  tableBody.innerHTML = `<tr><td colspan="5">Loading results...</td></tr>`;

  const postcode = document.getElementById("postcode").value.trim();
  const age = document.getElementById("age").value.trim();
  const service = document.getElementById("service").value;

const res = await fetch(
    // Use your full Render URL here
    `https://nhs-backend.onrender.com/api/search?postcode=${encodeURIComponent(postcode)}&age=${age}&service=${service}`
  );

  console.log("...Search finished. Got response from server.");

  const data = await res.json();

  tableBody.innerHTML = "";
  if (!data || data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No results found</td></tr>`;
    return;
  }

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${row.street}</td>
      <td>${row.telephone || 'N/A'}</td>
      <td>${row.distance} miles</td> 
      <td><button>Select</button></td>
    `;
    tableBody.appendChild(tr);
  });
});