const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@cluster0.ty9bkxj.mongodb.net/?appName=Cluster0`;

const stripe = require("stripe")(process.env.STRIPE_SECRET);

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-adminsSDK.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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

    // ------------  Users Related APIs ---------------

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
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const updateDoc = {
        $set: {
          name: req.body.name,
          photoURL: req.body.photoURL,
          phoneNumber: req.body.phoneNumber,
          updatedAt: new Date().toLocaleString(),
        },
      };
      const result = await usersCollection.updateOne(
        { email: email },
        updateDoc
      );
      res.send(result);
    });

    //  -------------- Assets Related APIs ---------------

    app.post("/assets", async (req, res) => {
      const asset = req.body;
      const result = await assetsCollection.insertOne(asset);
      res.send(result);
    });

    app.get("/assets", async (req, res) => {
      const email = req.query.hrEmail;
      const query = {};
      if (email) {
        query.hrEmail = email;
      }
      const cursor = assetsCollection.find(query).sort({ dateAdded: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const result = await assetsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    app.patch("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const updateAsset = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          productName: updateAsset.productName,
          productType: updateAsset.productType,
          productQuantity: updateAsset.productQuantity,
          productImage: updateAsset.productImage,
        },
      };

      const result = await assetsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ------------------- package Related APIs ----------------------

    app.get("/packages", async (req, res) => {
      const cursor = packagesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

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
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await RequstassetsCollection.deleteOne(query);
      res.send(result);
    });

    // -----------Approve Request Asset Related APIs -----------

    app.post("/approveRequest/:id", async (req, res) => {
      const requestId = req.params.id;
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
      // ------------ check Package Limit --------------
      const hrUser = await usersCollection.findOne({ email: hrEmail });
      if (hrUser.packageLimit <= 0) {
        return res.send({
          success: false,
          needUpgrade: true,
          message: "Package limit exceeded! Please upgrade plan.",
        });
      }

      // ------------ Request delete from requestCollection---------

      const query = { _id: new ObjectId(requestId) };
      await RequstassetsCollection.deleteOne(query);

      //  reduce quantity from main asset collection
      await assetsCollection.updateOne(
        { _id: new ObjectId(assetId) },
        { $inc: { availableQuantity: -1 } }
      );
      // check employeeAffiliations alredy have or not , if alredy have then update only quentity ?

      const existingAffiliation = await employeeAffiliationsCollections.findOne(
        { employeeEmail, hrEmail }
      );

      if (existingAffiliation) {
        await employeeAffiliationsCollections.updateOne(
          {
            _id: existingAffiliation._id,
          },
          { $inc: { assetsCount: 1 } }
        );
      } else {
        const employeeAffiliations = {
          employeeEmail,
          employeeName,
          hrEmail,
          companyName,
          companyLogo: hrUser.companyLogo,
          assetsCount: 1,
          affiliationDate: new Date().toLocaleDateString(),
          status: "active",
        };
        await employeeAffiliationsCollections.insertOne(employeeAffiliations);
      }

      await usersCollection.updateOne(
        { email: hrEmail },
        {
          $inc: { packageLimit: -1, currentEmployees: 1 },
        }
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
      });
    });

    //---------- assigned Assets api --------------------

    app.get("/assignedAssets", async (req, res) => {
      const { employeeEmail, limit = 0, skip = 0, filter = "" } = req.query;
      const query = {};
      if (employeeEmail) {
        query.employeeEmail = employeeEmail;
      }

      // Filtering ----------
      if (filter === "Returnable" || filter === "Non-returnable") {
        query.assetType = filter;
      }

      const result = await assignedAssetscollection
        .find(query)
        .limit(Number(limit))
        .skip(Number(skip))
        .toArray();
      const count = await assignedAssetscollection.countDocuments(query);
      res.send({ result, total: count });
    });

    app.get("/myEmployeeList", async (req, res) => {
      const { hrEmail, companyName } = req.query;
      let query = {};
      if (hrEmail) {
        query.hrEmail = hrEmail;
      }
      if (companyName) {
        query.companyName = companyName;
      }
      const cursor = employeeAffiliationsCollections.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/myEmployeeList/:id", async (req, res) => {
      const id = req.params.id;
      const hrEmail = req.query.hrEmail;
      const result = await employeeAffiliationsCollections.deleteOne({
        _id: new ObjectId(id),
        hrEmail,
      });
      res.send(result);
    });

    // Payments Related APIs

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const payment = paymentInfo.price * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: payment,
              product_data: {
                name: paymentInfo.subscription,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/payment-success?email=${paymentInfo.hrEmail}&subscription=${paymentInfo.subscription}&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/update-subscription/:email", async (req, res) => {
      const email = req.params.email;
      const { subscription } = req.body;

      const packageData = await packagesCollection.findOne({ subscription });

      await usersCollection.updateOne(
        { email },
        {
          $set: {
            subscription,
            packageLimit: packageData.employeeLimit,
          },
        }
      );

      res.send({ success: true });
    });

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
