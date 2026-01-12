require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 5000;

// ---------------- Middleware ----------------
app.use(cors());
app.use(express.json());

// ---------------- MongoDB ----------------
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let users, assets, reqAssets, assignedAssets, affiliations, packages;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("hrData");

    users = db.collection("users");
    assets = db.collection("assets");
    reqAssets = db.collection("requestAssets");
    assignedAssets = db.collection("assignedAssets");
    affiliations = db.collection("affiliations");
    packages = db.collection("packages");

    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB connection failed", error);
  }
}
connectDB();

// ---------------- Root ----------------
app.get("/", (req, res) => {
  res.send("HR Server is Running.....");
});

// ================= USERS =================
app.post("/users", async (req, res) => {
  try {
    const result = await users.insertOne(req.body);
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

app.get("/users/:email", async (req, res) => {
  try {
    const result = await users.findOne({ email: req.params.email });
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});

app.patch("/users/:email", async (req, res) => {
  const updateDoc = {
    $set: { ...req.body, updatedAt: new Date() },
  };
  const result = await users.updateOne({ email: req.params.email }, updateDoc);
  res.send(result);
});

// ================= ASSETS =================
app.post("/assets", async (req, res) => {
  const asset = { ...req.body, dateAdded: new Date() };
  const result = await assets.insertOne(asset);
  res.send(result);
});

app.get("/assets", async (req, res) => {
  const query = {};
  if (req.query.hrEmail) query.hrEmail = req.query.hrEmail;
  const result = await assets.find(query).sort({ dateAdded: -1 }).toArray();
  res.send(result);
});

app.patch("/assets/:id", async (req, res) => {
  const result = await assets.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.send(result);
});

app.delete("/assets/:id", async (req, res) => {
  const result = await assets.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
});

// ================= REQUEST ASSETS =================
app.post("/asset-requests", async (req, res) => {
  const result = await reqAssets.insertOne(req.body);
  res.send(result);
});

app.get("/asset-requests", async (req, res) => {
  const query = {};
  if (req.query.hrEmail) query.hrEmail = req.query.hrEmail;
  const result = await reqAssets.find(query).toArray();
  res.send(result);
});

app.delete("/asset-requests/:id", async (req, res) => {
  const result = await reqAssets.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
});

// ================= APPROVE REQUEST =================
app.post("/approve-request/:id", async (req, res) => {
  const data = req.body;

  const hrUser = await users.findOne({ email: data.hrEmail });
  if (!hrUser || hrUser.packageLimit <= 0) {
    return res.send({
      success: false,
      needUpgrade: true,
      message: "Package limit exceeded!",
    });
  }

  await reqAssets.deleteOne({ _id: new ObjectId(req.params.id) });

  await assets.updateOne(
    { _id: new ObjectId(data.assetId) },
    { $inc: { availableQuantity: -1 } }
  );

  const exist = await affiliations.findOne({
    employeeEmail: data.employeeEmail,
    hrEmail: data.hrEmail,
  });

  if (exist) {
    await affiliations.updateOne(
      { _id: exist._id },
      { $inc: { assetsCount: 1 } }
    );
  } else {
    await affiliations.insertOne({
      employeeEmail: data.employeeEmail,
      employeeName: data.employeeName,
      hrEmail: data.hrEmail,
      companyName: data.companyName,
      employeePhoto: data.employeePhoto,
      companyLogo: hrUser.companyLogo,
      assetsCount: 1,
      affiliationDate: new Date(),
    });
  }

  await users.updateOne(
    { email: data.hrEmail },
    { $inc: { packageLimit: -1, currentEmployees: 1 } }
  );

  const result = await assignedAssets.insertOne({
    ...data,
    assignmentDate: new Date(),
    status: "assigned",
  });

  res.send({ success: true, data: result });
});

// ================= ASSIGNED ASSETS =================
app.get("/assignedAssets", async (req, res) => {
  const query = {};
  if (req.query.employeeEmail) query.employeeEmail = req.query.employeeEmail;
  if (
    req.query.filter === "Returnable" ||
    req.query.filter === "Non-returnable"
  ) {
    query.assetType = req.query.filter;
  }

  const result = await assignedAssets
    .find(query)
    .limit(Number(req.query.limit || 0))
    .skip(Number(req.query.skip || 0))
    .toArray();

  const total = await assignedAssets.countDocuments(query);
  res.send({ result, total });
});

// ================= EMPLOYEES =================
app.get("/employees", async (req, res) => {
  const query = {};
  if (req.query.hrEmail) query.hrEmail = req.query.hrEmail;
  if (req.query.employeeEmail) query.employeeEmail = req.query.employeeEmail;
  if (req.query.companyName) query.companyName = req.query.companyName;

  const result = await affiliations.find(query).toArray();
  res.send(result);
});

app.delete("/employees/:id", async (req, res) => {
  const result = await affiliations.deleteOne({
    _id: new ObjectId(req.params.id),
    hrEmail: req.query.hrEmail,
  });
  res.send(result);
});

// ================= PACKAGES =================
app.get("/packages", async (req, res) => {
  const result = await packages.find().toArray();
  res.send(result);
});

// ================= PAYMENTS =================
app.post("/create-checkout-session", async (req, res) => {
  const { price, subscription, hrEmail } = req.body;

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: "USD",
          unit_amount: price * 100,
          product_data: { name: subscription },
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.FRONTEND_URL}/payment-success?email=${hrEmail}&subscription=${subscription}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
  });

  res.send({ url: session.url });
});

app.patch("/update-subscription/:email", async (req, res) => {
  const pack = await packages.findOne({
    subscription: req.body.subscription,
  });

  await users.updateOne(
    { email: req.params.email },
    {
      $set: {
        subscription: req.body.subscription,
        packageLimit: pack.employeeLimit,
      },
    }
  );

  res.send({ success: true });
});

// ---------------- START ----------------
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

module.exports = app;
