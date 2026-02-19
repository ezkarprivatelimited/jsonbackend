const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 👇 Correct absolute path relative to this file
const uploadDir = path.join(__dirname, "../files");

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

// Only allow JSON files
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "application/json" ||
    file.originalname.toLowerCase().endsWith(".json")
  ) {
    cb(null, true);
  } else {
    req.fileValidationError = "Only JSON files are allowed";
    cb(null, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

module.exports = upload;
