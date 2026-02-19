const express = require("express");
const cors = require("cors");
const fileRoutes = require("./routes/fileRoutes");
const app = express();
const PORT = 5000;
// app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "10mb" })); // must be before routes
app.use(express.urlencoded({ extended: true })); // optional but good
// Mount routes
app.use("/file", fileRoutes);

// Health route
app.get("/", (req, res) => {
  res.send("File Read/Write Server Running...");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
