const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");
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
      const cursor = assetsCollection.find();
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
