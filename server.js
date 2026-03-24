const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

let vehicleCollection;
let serviceHistoryCollection;
let serviceCentersCollection;

async function connectDB() {
  await client.connect();
  const db = client.db("vehicleServiceDB");

  // Create collections with validation
  const collections = await db.listCollections().toArray();

  if (!collections.some((c) => c.name === "vehicles")) {
    await db.createCollection("vehicles", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["vehicleNumber", "model", "owner"],
          properties: {
            vehicleNumber: { bsonType: "string" },
            model: { bsonType: "string" },
            owner: {
              bsonType: "object",
              required: ["name", "phone"],
              properties: {
                name: { bsonType: "string" },
                phone: { bsonType: "string" },
                email: { bsonType: "string" },
                address: { bsonType: "string" },
              },
            },
            location: {
              bsonType: "object",
              required: ["type", "coordinates"],
              properties: {
                type: { bsonType: "string", enum: ["Point"] },
                coordinates: {
                  bsonType: "array",
                  items: { bsonType: "double" },
                  minItems: 2,
                  maxItems: 2,
                },
              },
            },
            services: {
              bsonType: "array",
              items: {
                bsonType: "object",
                required: ["serviceType", "cost"],
                properties: {
                  serviceType: { bsonType: "string" },
                  cost: { bsonType: "int", minimum: 1 },
                  date: { bsonType: "date" },
                  serviceCenter: { bsonType: "string" },
                  technician: { bsonType: "string" },
                },
              },
            },
            totalSpent: { bsonType: "int", minimum: 0 },
            serviceCount: { bsonType: "int", minimum: 0 },
            lastServiceDate: { bsonType: "date" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" },
          },
        },
      },
    });
    console.log("Vehicles collection created with validation");
  }

  if (!collections.some((c) => c.name === "serviceHistory")) {
    await db.createCollection("serviceHistory");
    console.log("ServiceHistory collection created");
  }

  if (!collections.some((c) => c.name === "serviceCenters")) {
    await db.createCollection("serviceCenters", {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["name", "location", "services"],
          properties: {
            name: { bsonType: "string" },
            location: {
              bsonType: "object",
              required: ["type", "coordinates"],
              properties: {
                type: { bsonType: "string", enum: ["Point"] },
                coordinates: {
                  bsonType: "array",
                  items: { bsonType: "double" },
                  minItems: 2,
                  maxItems: 2,
                },
              },
            },
            address: { bsonType: "string" },
            phone: { bsonType: "string" },
            services: { bsonType: "array" },
            rating: { bsonType: "double", minimum: 0, maximum: 5 },
          },
        },
      },
    });
    console.log("ServiceCenters collection created");
  }

  vehicleCollection = db.collection("vehicles");
  serviceHistoryCollection = db.collection("serviceHistory");
  serviceCentersCollection = db.collection("serviceCenters");

  // Create Indexes with error handling
  await createIndexes();

  // Insert sample service centers with geospatial data
  await insertSampleServiceCenters();

  console.log("Connected to MongoDB and initialized collections");
}

async function createIndexes() {
  try {
    // Drop existing text index if it exists to avoid conflicts
    const indexes = await vehicleCollection.indexes();
    const textIndex = indexes.find((idx) => idx.key && idx.key._fts === "text");

    if (textIndex) {
      console.log(`Dropping existing text index: ${textIndex.name}`);
      await vehicleCollection.dropIndex(textIndex.name);
    }

    // Single field indexes
    await vehicleCollection.createIndex({ vehicleNumber: 1 }, { unique: true });
    console.log("✓ Created index: vehicleNumber");

    await vehicleCollection.createIndex({ "owner.phone": 1 });
    console.log("✓ Created index: owner.phone");

    await vehicleCollection.createIndex({ model: 1 });
    console.log("✓ Created index: model");

    await vehicleCollection.createIndex({ totalSpent: -1 });
    console.log("✓ Created index: totalSpent");

    // Compound index for efficient queries
    await vehicleCollection.createIndex({ model: 1, totalSpent: -1 });
    console.log("✓ Created compound index: model + totalSpent");

    // Geospatial index for location-based queries
    await vehicleCollection.createIndex({ location: "2dsphere" });
    console.log("✓ Created geospatial index: location");

    await serviceCentersCollection.createIndex({ location: "2dsphere" });
    console.log("✓ Created geospatial index: serviceCenters.location");

    // Text index for search functionality
    await vehicleCollection.createIndex(
      {
        vehicleNumber: "text",
        model: "text",
        "owner.name": "text",
        "services.serviceType": "text",
      },
      {
        weights: {
          vehicleNumber: 10,
          model: 5,
          "owner.name": 3,
          "services.serviceType": 1,
        },
        name: "vehicle_text_search_index",
      },
    );
    console.log("✓ Created text index: vehicle search");

    // Partial index for vehicles with high service cost
    await vehicleCollection.createIndex(
      { totalSpent: 1 },
      {
        partialFilterExpression: { totalSpent: { $gt: 10000 } },
        name: "high_spending_vehicles",
      },
    );
    console.log("✓ Created partial index: high spending vehicles");

    // TTL index for service history (automatically delete after 5 years)
    await serviceHistoryCollection.createIndex(
      { date: 1 },
      { expireAfterSeconds: 157680000 }, // 5 years in seconds
    );
    console.log("✓ Created TTL index: service history expiry");

    // Additional useful indexes
    await vehicleCollection.createIndex({ lastServiceDate: -1 });
    console.log("✓ Created index: lastServiceDate");

    await vehicleCollection.createIndex({ serviceCount: -1 });
    console.log("✓ Created index: serviceCount");

    // Compound index for date range queries
    await vehicleCollection.createIndex({
      lastServiceDate: -1,
      totalSpent: -1,
    });
    console.log("✓ Created compound index: date + spending");

    console.log("All indexes created successfully!");
  } catch (err) {
    console.error("Error creating indexes:", err.message);
    // Continue even if index creation fails - the app will still work
    console.log("Continuing with existing indexes...");
  }
}

async function insertSampleServiceCenters() {
  try {
    const count = await serviceCentersCollection.countDocuments();
    if (count === 0) {
      const centers = [
        {
          name: "Downtown Auto Care",
          location: { type: "Point", coordinates: [77.5946, 12.9716] },
          address: "MG Road, Bangalore",
          phone: "9876543210",
          services: [
            "Oil Change",
            "Engine Repair",
            "Brake Service",
            "AC Service",
          ],
          rating: 4.5,
        },
        {
          name: "Express Service Center",
          location: { type: "Point", coordinates: [77.6394, 12.9346] },
          address: "Indiranagar, Bangalore",
          phone: "9876543211",
          services: ["Quick Service", "Tire Change", "Battery Check"],
          rating: 4.2,
        },
        {
          name: "Premium Auto Garage",
          location: { type: "Point", coordinates: [77.5911, 12.9791] },
          address: "Koramangala, Bangalore",
          phone: "9876543212",
          services: [
            "Engine Repair",
            "Transmission",
            "AC Service",
            "Body Repair",
          ],
          rating: 4.8,
        },
      ];
      await serviceCentersCollection.insertMany(centers);
      console.log("Sample service centers added");
    }
  } catch (err) {
    console.error("Error inserting sample centers:", err.message);
  }
}

// ========== ADVANCED API ENDPOINTS ==========

// 1. Aggregation Pipeline - Get vehicle statistics
app.get("/api/statistics", async (req, res) => {
  try {
    const pipeline = [
      {
        $match: { services: { $exists: true, $not: { $size: 0 } } },
      },
      {
        $unwind: "$services",
      },
      {
        $group: {
          _id: "$model",
          totalVehicles: { $addToSet: "$vehicleNumber" },
          totalServices: { $sum: 1 },
          totalRevenue: { $sum: "$services.cost" },
          averageCost: { $avg: "$services.cost" },
          maxCost: { $max: "$services.cost" },
          minCost: { $min: "$services.cost" },
        },
      },
      {
        $project: {
          model: "$_id",
          vehicleCount: { $size: "$totalVehicles" },
          totalServices: 1,
          totalRevenue: 1,
          averageCost: { $round: ["$averageCost", 2] },
          maxCost: 1,
          minCost: 1,
          _id: 0,
        },
      },
      {
        $sort: { totalRevenue: -1 },
      },
    ];

    const statistics = await vehicleCollection.aggregate(pipeline).toArray();
    res.json(statistics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. Aggregation with $lookup - Vehicle service history with details
app.get("/api/vehicle-history/:vehicleNumber", async (req, res) => {
  try {
    const pipeline = [
      {
        $match: { vehicleNumber: req.params.vehicleNumber },
      },
      {
        $unwind: "$services",
      },
      {
        $lookup: {
          from: "serviceCenters",
          localField: "services.serviceCenter",
          foreignField: "name",
          as: "centerDetails",
        },
      },
      {
        $project: {
          vehicleNumber: 1,
          model: 1,
          owner: 1,
          serviceType: "$services.serviceType",
          cost: "$services.cost",
          date: "$services.date",
          serviceCenter: "$services.serviceCenter",
          centerDetails: { $arrayElemAt: ["$centerDetails", 0] },
        },
      },
      {
        $sort: { date: -1 },
      },
    ];

    const history = await vehicleCollection.aggregate(pipeline).toArray();
    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3. Geospatial Query - Find nearby service centers
app.get("/api/nearby-centers/:lng/:lat/:maxDistance", async (req, res) => {
  try {
    const { lng, lat, maxDistance } = req.params;

    const centers = await serviceCentersCollection
      .find({
        location: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)],
            },
            $maxDistance: parseInt(maxDistance) * 1000, // Convert to meters
          },
        },
      })
      .toArray();

    res.json(centers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. Geospatial Query - Find vehicles in an area
app.get("/api/vehicles-in-area/:lng1/:lat1/:lng2/:lat2", async (req, res) => {
  try {
    const { lng1, lat1, lng2, lat2 } = req.params;

    const vehicles = await vehicleCollection
      .find({
        location: {
          $geoWithin: {
            $box: [
              [parseFloat(lng1), parseFloat(lat1)],
              [parseFloat(lng2), parseFloat(lat2)],
            ],
          },
        },
      })
      .toArray();

    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 5. Array Operations - Get vehicles by service count
app.get("/api/vehicles-by-service-count/:minCount", async (req, res) => {
  try {
    const vehicles = await vehicleCollection
      .find({
        $expr: {
          $gte: [{ $size: "$services" }, parseInt(req.params.minCount)],
        },
      })
      .toArray();

    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 6. Text Search - Full-text search across vehicles
app.get("/api/search/:query", async (req, res) => {
  try {
    const vehicles = await vehicleCollection
      .find({
        $text: { $search: req.params.query },
      })
      .toArray();

    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 7. Aggregation with $facet - Multi-dimensional analysis
app.get("/api/advanced-analysis", async (req, res) => {
  try {
    const pipeline = [
      {
        $facet: {
          // Service type distribution
          serviceTypes: [
            { $unwind: "$services" },
            { $group: { _id: "$services.serviceType", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          // Cost range distribution
          costRanges: [
            { $unwind: "$services" },
            {
              $bucket: {
                groupBy: "$services.cost",
                boundaries: [0, 1000, 5000, 10000, 50000],
                default: "Other",
                output: {
                  count: { $sum: 1 },
                  totalCost: { $sum: "$services.cost" },
                },
              },
            },
          ],
          // Top customers by spending
          topCustomers: [
            {
              $group: {
                _id: { name: "$owner.name", phone: "$owner.phone" },
                totalSpent: { $sum: "$totalSpent" },
                vehicleCount: { $sum: 1 },
              },
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 5 },
          ],
          // Monthly service trends
          monthlyTrends: [
            { $unwind: "$services" },
            {
              $group: {
                _id: {
                  year: { $year: "$services.date" },
                  month: { $month: "$services.date" },
                },
                serviceCount: { $sum: 1 },
                totalRevenue: { $sum: "$services.cost" },
              },
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } },
            { $limit: 12 },
          ],
        },
      },
    ];

    const analysis = await vehicleCollection.aggregate(pipeline).toArray();
    res.json(analysis[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 8. Update with array filters - Update specific service
app.put("/api/update-service/:vehicleNumber", async (req, res) => {
  try {
    const { vehicleNumber } = req.params;
    const { serviceIndex, serviceType, cost, date } = req.body;

    const result = await vehicleCollection.updateOne(
      { vehicleNumber },
      {
        $set: {
          [`services.${serviceIndex}.serviceType`]: serviceType,
          [`services.${serviceIndex}.cost`]: cost,
          [`services.${serviceIndex}.date`]: new Date(date),
        },
      },
    );

    res.json({ message: "Service updated", result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 9. Advanced query with $regex and array operations
app.get("/api/search-advanced", async (req, res) => {
  try {
    const { model, minCost, serviceType, minServices } = req.query;
    const query = {};

    if (model) query.model = { $regex: model, $options: "i" };
    if (minCost) query.totalSpent = { $gte: parseInt(minCost) };
    if (serviceType) {
      query.services = {
        $elemMatch: { serviceType: { $regex: serviceType, $options: "i" } },
      };
    }
    if (minServices) {
      query.$expr = { $gte: [{ $size: "$services" }, parseInt(minServices)] };
    }

    const vehicles = await vehicleCollection.find(query).toArray();
    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 10. Bulk write operations
app.post("/api/bulk-update", async (req, res) => {
  try {
    const { updates } = req.body;
    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { vehicleNumber: update.vehicleNumber },
        update: {
          $inc: { totalSpent: update.amount },
          $push: {
            services: {
              serviceType: update.serviceType,
              cost: update.amount,
              date: new Date(),
              serviceCenter: update.serviceCenter,
            },
          },
          $set: {
            lastServiceDate: new Date(),
            updatedAt: new Date(),
          },
        },
      },
    }));

    const result = await vehicleCollection.bulkWrite(bulkOps);
    res.json({ message: "Bulk update completed", result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ========== UPDATED EXISTING ENDPOINTS ==========

// Enhanced add/update vehicle with geospatial data
app.post("/vehicle", async (req, res) => {
  try {
    const vehicle = req.body;
    if (
      !vehicle.vehicleNumber ||
      !vehicle.model ||
      !vehicle.owner?.name ||
      !vehicle.owner?.phone
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const now = new Date();
    const vehicleData = {
      vehicleNumber: vehicle.vehicleNumber,
      model: vehicle.model,
      owner: {
        name: vehicle.owner.name,
        phone: vehicle.owner.phone,
        email: vehicle.owner.email || "",
        address: vehicle.owner.address || "",
      },
      location: vehicle.location || {
        type: "Point",
        coordinates: [77.5946, 12.9716], // Default coordinates
      },
      updatedAt: now,
    };

    const existing = await vehicleCollection.findOne({
      vehicleNumber: vehicle.vehicleNumber,
    });

    if (existing) {
      await vehicleCollection.updateOne(
        { vehicleNumber: vehicle.vehicleNumber },
        {
          $set: {
            model: vehicleData.model,
            owner: vehicleData.owner,
            location: vehicleData.location,
            updatedAt: now,
          },
        },
      );
    } else {
      vehicleData.services = [];
      vehicleData.totalSpent = 0;
      vehicleData.serviceCount = 0;
      vehicleData.createdAt = now;
      vehicleData.updatedAt = now;
      await vehicleCollection.insertOne(vehicleData);
    }
    res.json({ message: "Vehicle added/updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Enhanced add service with aggregation update
app.post("/service/:vehicleNumber", async (req, res) => {
  try {
    const { vehicleNumber } = req.params;
    const { serviceType, cost, date, serviceCenter, technician } = req.body;

    if (!serviceType || !cost) {
      return res.status(400).json({ error: "Missing serviceType or cost" });
    }

    const serviceData = {
      serviceType,
      cost: parseInt(cost, 10),
      date: date ? new Date(date) : new Date(),
      serviceCenter: serviceCenter || "",
      technician: technician || "",
    };

    // Add service to vehicle and update aggregates
    await vehicleCollection.updateOne(
      { vehicleNumber },
      {
        $push: { services: serviceData },
        $inc: {
          totalSpent: parseInt(cost, 10),
          serviceCount: 1,
        },
        $set: { lastServiceDate: new Date(), updatedAt: new Date() },
      },
    );

    // Also add to service history collection for archival
    await serviceHistoryCollection.insertOne({
      vehicleNumber,
      ...serviceData,
    });

    res.json({ message: "Service added" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Enhanced delete service with aggregate updates
app.delete("/service/:vehicleNumber/:serviceIndex", async (req, res) => {
  try {
    const { vehicleNumber, serviceIndex } = req.params;
    const index = parseInt(serviceIndex);

    if (isNaN(index))
      return res.status(400).json({ error: "Invalid service index" });

    const vehicle = await vehicleCollection.findOne({ vehicleNumber });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    if (!vehicle.services || index < 0 || index >= vehicle.services.length) {
      return res.status(400).json({ error: "Service index out of range" });
    }

    const removedService = vehicle.services[index];
    const newTotalSpent = vehicle.totalSpent - removedService.cost;

    vehicle.services.splice(index, 1);

    await vehicleCollection.updateOne(
      { vehicleNumber },
      {
        $set: {
          services: vehicle.services,
          totalSpent: newTotalSpent,
          serviceCount: vehicle.services.length,
          updatedAt: new Date(),
        },
      },
    );

    res.json({ message: "Service deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all vehicles with pagination and sorting
app.get("/vehicles", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || "updatedAt";
    const order = req.query.order === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    const vehicles = await vehicleCollection
      .find()
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await vehicleCollection.countDocuments();

    res.json({
      data: vehicles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Keep existing endpoints for backward compatibility
app.get("/vehicle/:vehicleNumber", async (req, res) => {
  try {
    const vehicle = await vehicleCollection.findOne({
      vehicleNumber: req.params.vehicleNumber,
    });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json(vehicle);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/vehicle/:vehicleNumber", async (req, res) => {
  try {
    const result = await vehicleCollection.deleteOne({
      vehicleNumber: req.params.vehicleNumber,
    });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Vehicle not found" });
    res.json({ message: "Vehicle deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log("\n📊 Advanced MongoDB Features Enabled:");
  console.log("  - Geospatial Indexing");
  console.log("  - Aggregation Pipeline");
  console.log("  - Full-text Search");
  console.log("  - Array Operations");
  console.log("  - Compound Indexes");
  console.log("  - Partial Indexes");
  console.log("  - TTL Indexes");
  console.log("  - Bulk Operations\n");
});

connectDB().catch(console.error);
