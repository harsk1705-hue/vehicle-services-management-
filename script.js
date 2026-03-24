const API_URL = "http://localhost:5000";

// ========== FORM CLEAR FUNCTION ==========
function clearAddForm() {
  const vehicleNumber = document.getElementById("vehicleNumber");
  const model = document.getElementById("model");
  const owner = document.getElementById("owner");
  const phone = document.getElementById("phone");
  const serviceType = document.getElementById("serviceType");
  const cost = document.getElementById("cost");

  if (vehicleNumber) vehicleNumber.value = "";
  if (model) model.value = "";
  if (owner) owner.value = "";
  if (phone) phone.value = "";
  if (serviceType) serviceType.value = "";
  if (cost) cost.value = "";
}

// ========== LOADING OVERLAY FUNCTIONS ==========
function showLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.remove("hidden");
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.add("hidden");
}

// ========== SIDEBAR STATS FUNCTIONS ==========
async function updateSidebarStats() {
  try {
    const res = await fetch(`${API_URL}/api/statistics`);
    const stats = await res.json();

    // Calculate totals
    let totalVehicles = 0;
    let totalRevenue = 0;
    let totalServices = 0;
    let totalCostSum = 0;

    if (stats && stats.length > 0) {
      stats.forEach((stat) => {
        totalVehicles += stat.vehicleCount || 0;
        totalRevenue += stat.totalRevenue || 0;
        totalServices += stat.totalServices || 0;
        totalCostSum += stat.totalRevenue || 0;
      });
    }

    const avgCost = totalServices > 0 ? totalCostSum / totalServices : 0;

    // Update sidebar stats
    const totalVehiclesEl = document.getElementById("totalVehicles");
    const totalRevenueEl = document.getElementById("totalRevenue");
    const totalServicesEl = document.getElementById("totalServices");
    const avgCostEl = document.getElementById("avgCost");

    if (totalVehiclesEl) totalVehiclesEl.textContent = totalVehicles;
    if (totalRevenueEl)
      totalRevenueEl.textContent = `₹${totalRevenue.toLocaleString()}`;
    if (totalServicesEl) totalServicesEl.textContent = totalServices;
    if (avgCostEl)
      avgCostEl.textContent = `₹${Math.round(avgCost).toLocaleString()}`;
  } catch (err) {
    console.error("Error updating sidebar stats:", err);
  }
}

// ========== DATE TIME FUNCTION ==========
function updateDateTime() {
  const now = new Date();
  const options = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const dateTimeEl = document.getElementById("currentDateTime");
  if (dateTimeEl) {
    dateTimeEl.textContent = now.toLocaleDateString("en-US", options);
  }
}

// ========== ADD VEHICLE & SERVICE ==========
async function addVehicleAndService() {
  const vehicleNumber = document.getElementById("vehicleNumber")?.value.trim();
  const model = document.getElementById("model")?.value.trim();
  const owner = document.getElementById("owner")?.value.trim();
  const phone = document.getElementById("phone")?.value.trim();
  const serviceType = document.getElementById("serviceType")?.value.trim();
  const cost = document.getElementById("cost")?.value.trim();

  // Validation
  if (!vehicleNumber || !model || !owner || !phone) {
    alert(
      "Please fill all vehicle details (Vehicle Number, Model, Owner Name, Phone)",
    );
    return;
  }

  if (!serviceType || !cost) {
    alert("Please fill all service details (Service Type and Cost)");
    return;
  }

  showLoading();

  // Get location if geolocation is available
  let location = null;
  if (navigator.geolocation) {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      location = {
        type: "Point",
        coordinates: [position.coords.longitude, position.coords.latitude],
      };
      console.log("Location captured:", location);
    } catch (err) {
      console.log("Location access denied or unavailable:", err.message);
    }
  }

  try {
    // Save vehicle first
    let res = await fetch(`${API_URL}/vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleNumber,
        model,
        owner: {
          name: owner,
          phone: phone,
          email: "",
          address: "",
        },
        location: location,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to save vehicle");
    }
    console.log("Vehicle saved successfully");

    // Add service to vehicle
    res = await fetch(`${API_URL}/service/${vehicleNumber}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType,
        cost: parseInt(cost, 10),
        date: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to add service");
    }
    console.log("Service added successfully");

    // Clear form and reload vehicles
    clearAddForm();
    alert("Vehicle and service added successfully!");
    await loadVehicles(1);
    await updateSidebarStats();
  } catch (err) {
    console.error("Error in addVehicleAndService:", err);
    alert(
      err.message ||
        "Error saving vehicle and service. Please check if the server is running.",
    );
  } finally {
    hideLoading();
  }
}

// ========== LOAD ALL VEHICLES ==========
let currentPage = 1;

async function loadVehicles(
  page = currentPage,
  sort = "updatedAt",
  order = "desc",
) {
  showLoading();
  try {
    const res = await fetch(
      `${API_URL}/vehicles?page=${page}&sort=${sort}&order=${order}`,
    );
    if (!res.ok) throw new Error("Failed to load vehicles");

    const response = await res.json();
    const data = response.data || [];
    const pagination = response.pagination;

    const outputDiv = document.getElementById("output");
    if (!outputDiv) return;

    if (!data.length) {
      outputDiv.innerHTML =
        "<p>No vehicle records found. Add your first vehicle!</p>";
      return;
    }

    const html = data
      .map(
        (vehicle) => `
      <div class="vehicle-card">
        <b>🚗 Vehicle Number:</b> ${escapeHtml(vehicle.vehicleNumber)}<br/>
        <b>🔧 Model:</b> ${escapeHtml(vehicle.model)}<br/>
        <b>👤 Owner:</b> ${escapeHtml(vehicle.owner?.name || "N/A")} (${escapeHtml(vehicle.owner?.phone || "N/A")})<br/>
        <b>💰 Total Spent:</b> ₹${vehicle.totalSpent || 0}<br/>
        <b>🔢 Service Count:</b> ${vehicle.serviceCount || 0}<br/>
        <b>📅 Last Service:</b> ${vehicle.lastServiceDate ? new Date(vehicle.lastServiceDate).toLocaleDateString() : "N/A"}<br/>
        <b>🛠️ Services:</b>
        <ul>
          ${(vehicle.services || [])
            .map(
              (service, i) => `
            <li>
              ${escapeHtml(service.serviceType)} - ₹${service.cost} (${service.date ? new Date(service.date).toLocaleDateString() : "N/A"})
              <button onclick="deleteService('${escapeHtml(vehicle.vehicleNumber)}', ${i})" title="Delete Service">&times;</button>
            </li>`,
            )
            .join("")}
        </ul>
        <div style="margin-top: 10px;">
          <button class="btn-primary" onclick="openEditModal('${escapeHtml(vehicle.vehicleNumber)}')" style="margin-right: 5px;">✏️ Edit Vehicle</button>
          <button class="btn-secondary" onclick="deleteVehicle('${escapeHtml(vehicle.vehicleNumber)}')" style="margin-right: 5px;">🗑️ Delete Vehicle</button>
          <button class="btn-info" onclick="viewServiceHistory('${escapeHtml(vehicle.vehicleNumber)}')">📜 View History</button>
        </div>
      </div>
    `,
      )
      .join("");

    // Add pagination controls
    const paginationHtml = pagination
      ? `
      <div class="pagination">
        <button onclick="loadVehicles(${pagination.page - 1})" ${pagination.page === 1 ? "disabled" : ""}>Previous</button>
        <span>Page ${pagination.page} of ${pagination.pages}</span>
        <button onclick="loadVehicles(${pagination.page + 1})" ${pagination.page === pagination.pages ? "disabled" : ""}>Next</button>
      </div>
    `
      : "";

    outputDiv.innerHTML = html + paginationHtml;
    currentPage = pagination?.page || 1;
  } catch (err) {
    console.error("Error loading vehicles:", err);
    const outputDiv = document.getElementById("output");
    if (outputDiv) {
      outputDiv.innerHTML =
        "<p style='color: red;'>Error loading vehicles. Make sure the server is running.</p>";
    }
  } finally {
    hideLoading();
  }
}

// ========== SEARCH VEHICLE ==========
async function searchVehicle() {
  const vehicleNumber = document
    .getElementById("searchVehicleNumber")
    ?.value.trim();
  if (!vehicleNumber) {
    alert("Please enter a vehicle number to search");
    return;
  }

  showLoading();
  try {
    const res = await fetch(`${API_URL}/vehicle/${vehicleNumber}`);
    const searchOutput = document.getElementById("searchOutput");

    if (res.status === 404) {
      searchOutput.innerHTML =
        "<p style='color: #f44336;'>Vehicle not found</p>";
      return;
    }

    if (!res.ok) throw new Error("Failed to search vehicle");

    const v = await res.json();
    const html = `
      <div style="margin-top: 10px;">
        <b>Vehicle Number:</b> ${escapeHtml(v.vehicleNumber)}<br/>
        <b>Model:</b> ${escapeHtml(v.model)}<br/>
        <b>Owner:</b> ${escapeHtml(v.owner?.name || "N/A")} (${escapeHtml(v.owner?.phone || "N/A")})<br/>
        <b>Total Spent:</b> ₹${v.totalSpent || 0}<br/>
        <b>Services:</b>
        <ul>
          ${(v.services || [])
            .map(
              (s, i) => `
            <li>
              ${escapeHtml(s.serviceType)} - ₹${s.cost}
              <button onclick="deleteService('${escapeHtml(v.vehicleNumber)}', ${i})" style="margin-left: 10px;">&times;</button>
            </li>`,
            )
            .join("")}
        </ul>
        <button class="btn-primary" onclick="openEditModal('${escapeHtml(v.vehicleNumber)}')">Edit Vehicle</button>
        <button class="btn-secondary" onclick="deleteVehicle('${escapeHtml(v.vehicleNumber)}')">Delete Vehicle</button>
      </div>
    `;
    searchOutput.innerHTML = html;
  } catch (err) {
    console.error("Error searching vehicle:", err);
    alert("Error searching vehicle");
  } finally {
    hideLoading();
  }
}

// ========== DELETE VEHICLE ==========
async function deleteVehicle(vehicleNumber) {
  if (!confirm(`Delete vehicle ${vehicleNumber} and all associated services?`))
    return;

  showLoading();
  try {
    const res = await fetch(`${API_URL}/vehicle/${vehicleNumber}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error("Failed to delete vehicle");

    alert("Vehicle deleted successfully");
    await loadVehicles(1);
    await updateSidebarStats();

    // Clear search output if it was showing this vehicle
    const searchOutput = document.getElementById("searchOutput");
    if (searchOutput) searchOutput.innerHTML = "";
  } catch (err) {
    console.error("Error deleting vehicle:", err);
    alert(err.message || "Error deleting vehicle");
  } finally {
    hideLoading();
  }
}

// ========== DELETE SERVICE ==========
async function deleteService(vehicleNumber, serviceIndex) {
  if (
    !confirm(
      `Delete service #${serviceIndex + 1} from vehicle ${vehicleNumber}?`,
    )
  )
    return;

  showLoading();
  try {
    const res = await fetch(
      `${API_URL}/service/${vehicleNumber}/${serviceIndex}`,
      {
        method: "DELETE",
      },
    );

    if (!res.ok) throw new Error("Failed to delete service");

    alert("Service deleted successfully");
    await loadVehicles(currentPage);
    await updateSidebarStats();
    await searchVehicle(); // Refresh search results if any
  } catch (err) {
    console.error("Error deleting service:", err);
    alert(err.message || "Error deleting service");
  } finally {
    hideLoading();
  }
}

// ========== EDIT MODAL FUNCTIONS ==========
const modal = document.getElementById("editModal");

async function openEditModal(vehicleNumber) {
  showLoading();
  try {
    const res = await fetch(`${API_URL}/vehicle/${vehicleNumber}`);
    if (res.status === 404) {
      alert("Vehicle not found");
      return;
    }

    if (!res.ok) throw new Error("Failed to load vehicle");

    const v = await res.json();

    const editVehicleNumber = document.getElementById("editVehicleNumber");
    const editModel = document.getElementById("editModel");
    const editOwner = document.getElementById("editOwner");
    const editPhone = document.getElementById("editPhone");
    const editEmail = document.getElementById("editEmail");
    const editAddress = document.getElementById("editAddress");
    const editServiceType = document.getElementById("editServiceType");
    const editCost = document.getElementById("editCost");

    if (editVehicleNumber) editVehicleNumber.value = v.vehicleNumber;
    if (editModel) editModel.value = v.model;
    if (editOwner) editOwner.value = v.owner?.name || "";
    if (editPhone) editPhone.value = v.owner?.phone || "";
    if (editEmail) editEmail.value = v.owner?.email || "";
    if (editAddress) editAddress.value = v.owner?.address || "";
    if (editServiceType) editServiceType.value = "";
    if (editCost) editCost.value = "";

    if (modal) modal.classList.remove("hidden");
  } catch (err) {
    console.error("Error opening edit modal:", err);
    alert("Error loading vehicle");
  } finally {
    hideLoading();
  }
}

function closeEditModal() {
  if (modal) modal.classList.add("hidden");
}

async function updateVehicle() {
  const vehicleNumber = document
    .getElementById("editVehicleNumber")
    ?.value.trim();
  const model = document.getElementById("editModel")?.value.trim();
  const ownerName = document.getElementById("editOwner")?.value.trim();
  const ownerPhone = document.getElementById("editPhone")?.value.trim();
  const ownerEmail = document.getElementById("editEmail")?.value.trim();
  const ownerAddress = document.getElementById("editAddress")?.value.trim();
  const serviceType = document.getElementById("editServiceType")?.value.trim();
  const cost = document.getElementById("editCost")?.value.trim();

  if (!model || !ownerName || !ownerPhone) {
    alert("Please fill all vehicle details (Model, Owner Name, Phone)");
    return;
  }

  showLoading();
  try {
    // Update vehicle info
    let res = await fetch(`${API_URL}/vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleNumber,
        model,
        owner: {
          name: ownerName,
          phone: ownerPhone,
          email: ownerEmail || "",
          address: ownerAddress || "",
        },
      }),
    });

    if (!res.ok) throw new Error("Failed to update vehicle");

    // If service details provided, add service
    if (serviceType && cost) {
      res = await fetch(`${API_URL}/service/${vehicleNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType,
          cost: parseInt(cost, 10),
          date: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to add service");
    }

    closeEditModal();
    await loadVehicles(currentPage);
    await updateSidebarStats();
    await searchVehicle();
    alert("Vehicle updated successfully!");
  } catch (err) {
    console.error("Error updating vehicle:", err);
    alert(err.message || "Error updating vehicle");
  } finally {
    hideLoading();
  }
}

// ========== HELPER FUNCTION ==========
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ========== ADVANCED FUNCTIONS ==========

async function showStatistics() {
  showLoading();
  try {
    const res = await fetch(`${API_URL}/api/statistics`);
    if (!res.ok) throw new Error("Failed to load statistics");

    const stats = await res.json();
    const outputDiv = document.getElementById("output");

    if (!stats.length) {
      outputDiv.innerHTML =
        "<p>No statistics available. Add some vehicles first!</p><button onclick='loadVehicles(1)' class='btn-primary' style='margin-top: 20px;'>Back to List</button>";
      return;
    }

    let html =
      '<div class="stats-dashboard"><h3>📊 Service Statistics by Model</h3>';

    stats.forEach((stat) => {
      html += `
        <div class="stat-card">
          <h4>${escapeHtml(stat.model)}</h4>
          <p>🚗 Vehicles: ${stat.vehicleCount}</p>
          <p>🛠️ Total Services: ${stat.totalServices}</p>
          <p>💰 Total Revenue: ₹${stat.totalRevenue}</p>
          <p>📊 Average Cost: ₹${stat.averageCost}</p>
          <p>📈 Cost Range: ₹${stat.minCost} - ₹${stat.maxCost}</p>
        </div>
      `;
    });

    html +=
      '<button onclick="loadVehicles(1)" class="btn-primary" style="margin-top: 20px;">Back to List</button></div>';
    outputDiv.innerHTML = html;
  } catch (err) {
    console.error("Error loading statistics:", err);
    alert("Error loading statistics");
  } finally {
    hideLoading();
  }
}

async function viewServiceHistory(vehicleNumber) {
  showLoading();
  try {
    const res = await fetch(`${API_URL}/api/vehicle-history/${vehicleNumber}`);
    if (!res.ok) throw new Error("Failed to load service history");

    const history = await res.json();
    const outputDiv = document.getElementById("output");

    if (!history.length) {
      outputDiv.innerHTML = `<h3>Service History for ${escapeHtml(vehicleNumber)}</h3><p>No service history found.</p><button onclick="loadVehicles(1)" class="btn-primary">Back to List</button>`;
      return;
    }

    let html = `<h3>📜 Service History for ${escapeHtml(vehicleNumber)}</h3>`;
    history.forEach((service) => {
      html += `
        <div class="history-card">
          <p><b>🔧 Service:</b> ${escapeHtml(service.serviceType)}</p>
          <p><b>💰 Cost:</b> ₹${service.cost}</p>
          <p><b>📅 Date:</b> ${service.date ? new Date(service.date).toLocaleDateString() : "N/A"}</p>
          ${service.serviceCenter ? `<p><b>🏢 Service Center:</b> ${escapeHtml(service.serviceCenter)}</p>` : ""}
          ${
            service.centerDetails
              ? `
            <p><b>⭐ Rating:</b> ${service.centerDetails.rating}</p>
            <p><b>📍 Address:</b> ${escapeHtml(service.centerDetails.address)}</p>
          `
              : ""
          }
        </div>
        <hr/>
      `;
    });

    html +=
      '<button onclick="loadVehicles(1)" class="btn-primary">Back to List</button>';
    outputDiv.innerHTML = html;
  } catch (err) {
    console.error("Error loading service history:", err);
    alert("Error loading service history");
  } finally {
    hideLoading();
  }
}

async function findNearbyCenters() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      showLoading();
      const lng = position.coords.longitude;
      const lat = position.coords.latitude;
      const distance = prompt("Enter search radius (km):", "5");

      if (!distance) {
        hideLoading();
        return;
      }

      try {
        const res = await fetch(
          `${API_URL}/api/nearby-centers/${lng}/${lat}/${distance}`,
        );
        if (!res.ok) throw new Error("Failed to find nearby centers");

        const centers = await res.json();
        const outputDiv = document.getElementById("output");

        if (!centers.length) {
          outputDiv.innerHTML = `<h3>📍 Nearby Service Centers</h3><p>No service centers found within ${distance}km.</p><button onclick="loadVehicles(1)" class="btn-primary">Back to List</button>`;
          return;
        }

        let html = `<h3>📍 Nearby Service Centers (within ${distance}km)</h3>`;
        centers.forEach((center) => {
          html += `
          <div class="center-card">
            <h4>🏪 ${escapeHtml(center.name)}</h4>
            <p>⭐ Rating: ${center.rating}</p>
            <p>📍 ${escapeHtml(center.address)}</p>
            <p>📞 ${escapeHtml(center.phone)}</p>
            <p>🔧 Services: ${center.services.join(", ")}</p>
          </div>
        `;
        });

        html +=
          '<button onclick="loadVehicles(1)" class="btn-primary">Back to List</button>';
        outputDiv.innerHTML = html;
      } catch (err) {
        console.error("Error finding nearby centers:", err);
        alert("Error finding nearby centers");
      } finally {
        hideLoading();
      }
    },
    (error) => {
      console.error("Geolocation error:", error);
      alert("Unable to get your location. Please enable location access.");
    },
  );
}

async function advancedSearch() {
  const query = prompt(
    "Enter search term (vehicle number, model, owner name, or service type):",
  );
  if (!query) return;

  showLoading();
  try {
    const res = await fetch(`${API_URL}/api/search/${query}`);
    if (!res.ok) throw new Error("Failed to perform search");

    const vehicles = await res.json();
    const outputDiv = document.getElementById("output");

    if (!vehicles.length) {
      outputDiv.innerHTML = `<h3>🔍 Search Results for "${escapeHtml(query)}"</h3><p>No vehicles found matching your search.</p><button onclick="loadVehicles(1)" class="btn-primary">Back to List</button>`;
      return;
    }

    let html = `<h3>🔍 Search Results for "${escapeHtml(query)}"</h3>`;
    vehicles.forEach((vehicle) => {
      html += `
        <div class="vehicle-card">
          <b>🚗 ${escapeHtml(vehicle.vehicleNumber)}</b> - ${escapeHtml(vehicle.model)}<br/>
          👤 Owner: ${escapeHtml(vehicle.owner?.name || "N/A")}<br/>
          💰 Total Spent: ₹${vehicle.totalSpent || 0}<br/>
          🛠️ Services: ${vehicle.serviceCount || 0}<br/>
          <button onclick="viewServiceHistory('${escapeHtml(vehicle.vehicleNumber)}')" class="btn-info" style="margin-top: 5px;">View Details</button>
        </div>
      `;
    });

    html +=
      '<button onclick="loadVehicles(1)" class="btn-primary" style="margin-top: 20px;">Back to List</button>';
    outputDiv.innerHTML = html;
  } catch (err) {
    console.error("Error performing search:", err);
    alert("Error performing search");
  } finally {
    hideLoading();
  }
}

async function showAdvancedAnalysis() {
  showLoading();
  try {
    const res = await fetch(`${API_URL}/api/advanced-analysis`);
    if (!res.ok) throw new Error("Failed to load analysis");

    const analysis = await res.json();
    const outputDiv = document.getElementById("output");

    let html = `
      <div class="analysis-dashboard">
        <h3>📈 Advanced Analytics Dashboard</h3>
        
        <h4>Top Service Types</h4>
        <ul>
          ${(analysis.serviceTypes || []).map((s) => `<li>${escapeHtml(s._id)}: ${s.count} times</li>`).join("")}
        </ul>
        
        <h4>Cost Distribution</h4>
        <ul>
          ${(analysis.costRanges || [])
            .map(
              (range) => `
            <li>₹${
              range._id === 0
                ? "0-1000"
                : range._id === 1000
                  ? "1000-5000"
                  : range._id === 5000
                    ? "5000-10000"
                    : range._id === 10000
                      ? "10000-50000"
                      : "50000+"
            }: 
                ${range.count} services (₹${range.totalCost})</li>
          `,
            )
            .join("")}
        </ul>
        
        <h4>Top Customers</h4>
        <ul>
          ${(analysis.topCustomers || [])
            .map(
              (c) => `
            <li>${escapeHtml(c._id.name)} (${escapeHtml(c._id.phone)}): ₹${c.totalSpent} (${c.vehicleCount} vehicles)</li>
          `,
            )
            .join("")}
        </ul>
        
        <h4>Recent Monthly Trends</h4>
        <ul>
          ${(analysis.monthlyTrends || [])
            .map(
              (t) => `
            <li>${t._id.year}-${t._id.month}: ${t.serviceCount} services (₹${t.totalRevenue})</li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `;

    html +=
      '<button onclick="loadVehicles(1)" class="btn-primary">Back to List</button>';
    outputDiv.innerHTML = html;
  } catch (err) {
    console.error("Error loading analysis:", err);
    alert("Error loading analysis");
  } finally {
    hideLoading();
  }
}

async function advancedFilter() {
  const model = prompt("Filter by model (leave empty for all):");
  const minCost = prompt("Minimum total spent (₹):");
  const serviceType = prompt("Service type contains:");
  const minServices = prompt("Minimum number of services:");

  const params = new URLSearchParams();
  if (model) params.append("model", model);
  if (minCost) params.append("minCost", minCost);
  if (serviceType) params.append("serviceType", serviceType);
  if (minServices) params.append("minServices", minServices);

  showLoading();
  try {
    const res = await fetch(`${API_URL}/api/search-advanced?${params}`);
    if (!res.ok) throw new Error("Failed to filter vehicles");

    const vehicles = await res.json();
    const outputDiv = document.getElementById("output");

    if (!vehicles.length) {
      outputDiv.innerHTML = `<h3>🔧 Filtered Results</h3><p>No vehicles match the filter criteria.</p><button onclick="loadVehicles(1)" class="btn-primary">Back to List</button>`;
      return;
    }

    let html = `<h3>🔧 Filtered Results</h3>`;
    vehicles.forEach((vehicle) => {
      html += `
        <div class="vehicle-card">
          <b>🚗 ${escapeHtml(vehicle.vehicleNumber)}</b> - ${escapeHtml(vehicle.model)}<br/>
          👤 Owner: ${escapeHtml(vehicle.owner?.name || "N/A")}<br/>
          💰 Total Spent: ₹${vehicle.totalSpent || 0}<br/>
          🛠️ Services: ${vehicle.serviceCount || 0}<br/>
        </div>
      `;
    });

    html +=
      '<button onclick="loadVehicles(1)" class="btn-primary" style="margin-top: 20px;">Back to List</button>';
    outputDiv.innerHTML = html;
  } catch (err) {
    console.error("Error filtering vehicles:", err);
    alert("Error filtering vehicles");
  } finally {
    hideLoading();
  }
}

// ========== INITIAL LOAD ==========
// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, initializing...");
  await loadVehicles(1);
  await updateSidebarStats();
  updateDateTime();
  setInterval(updateDateTime, 1000);
});

// Make functions available globally
window.addVehicleAndService = addVehicleAndService;
window.loadVehicles = loadVehicles;
window.searchVehicle = searchVehicle;
window.deleteVehicle = deleteVehicle;
window.deleteService = deleteService;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.updateVehicle = updateVehicle;
window.showStatistics = showStatistics;
window.viewServiceHistory = viewServiceHistory;
window.findNearbyCenters = findNearbyCenters;
window.advancedSearch = advancedSearch;
window.showAdvancedAnalysis = showAdvancedAnalysis;
window.advancedFilter = advancedFilter;
window.clearAddForm = clearAddForm;
