const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@cluster0.ty9bkxj.mongodb.net/?appName=Cluster0`;

// Midlewire

app.use(cors());
app.use(express.json());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("HR Server Is here");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // HR DATABASE
    const db = client.db("HR_DataBase");
    // HR All Collection

    const usersCollection = db.collection("usersCollection");
    const assetsCollection = db.collection("assetsCollection");
    const RequstassetsCollection = db.collection("RequstassetsCollection");
    const assignedAssetscollection = db.collection("assignedAssetscollection");
    const employeeAffiliationsCollections = db.collection(
      "employeeAffiliationsCollections"
    );
    const packagesCollection = db.collection("packagesCollection");

    // Adding User to the Database Start---------------

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // Adding Assets to the Database Start---------------

    app.post("/assets", async (req, res) => {
      const asset = req.body;
      const result = await assetsCollection.insertOne(asset);
      res.send(result);
    });
    app.get("/assets", async (req, res) => {
      const cursor = assetsCollection.find().sort({ dateAdded: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/packages", async (req, res) => {
      const cursor = packagesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Requst Asset Data API

    app.post("/requestAsset", async (req, res) => {
      const requestAsset = req.body;
      const result = await RequstassetsCollection.insertOne(requestAsset);
      res.send(result);
    });
    app.get("/requestAsset", async (req, res) => {
      const cursor = RequstassetsCollection.find().sort({ dateAdded: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/requestAsset/:id", async (req, res) => {
      console.log("DELETE ID:", req.params.id); // debug

      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await RequstassetsCollection.deleteOne(query);
      res.send(result);
    });

    // APPROVE REQUEST API-----------
    app.post("/approveRequest/:id", async (req, res) => {
      const requestId = req.params.id;
      const asset = req.body;
      console.log("asset Id ", asset);

      const {
        assetId,
        assetType,
        assetName,
        hrEmail,
        companyName,
        employeeEmail,
        employeeName,
        assetImage,
      } = req.body;

      //  Request delete from requestCollection

      const query = { _id: new ObjectId(requestId) };
      await RequstassetsCollection.deleteOne(query);

      //  reduce quantity from main asset collection
      await assetsCollection.updateOne(
        { _id: new ObjectId(assetId) },
        { $inc: { availableQuantity: -1 } }
      );

      // Create new employee Affiliations Collections Api-----------------------
      const user = await usersCollection.findOne({ email: hrEmail });

      const employeeAffiliations = {
        employeeEmail,
        employeeName,
        hrEmail,
        companyName,
        companyLogo: user.companyLogo,
        affiliationDate: new Date(),
        status: "active",
      };

      const result2 = await employeeAffiliationsCollections.insertOne(
        employeeAffiliations
      );
      // Create new assignedAsset Api-----------------------
      const assignedAsset = {
        assetId,
        assetName,
        assetImage,
        employeeEmail,
        employeeName,
        assetType,
        processedBy: hrEmail,
        companyName,
        assignmentDate: new Date(),
        returnDate: null,
        status: "assigned",
      };

      const result = await assignedAssetscollection.insertOne(assignedAsset);

      res.send({
        success: true,
        message: "Asset approved & assigned successfully",
        data: result,
        result2,
      });
    });

    app.get("/assignedAssets", async (req, res) => {
      const cursor = assignedAssetscollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Adding User to the Database End-------------------
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`HR server is running in the port ${port}`);
});
