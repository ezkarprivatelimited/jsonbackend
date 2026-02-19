const express = require("express");
const router = express.Router();
const {
  getAllFiles,
  getFileByName,
  downloadFile,
  updateFileItems,
  uploadFileController
} = require("../controllers/fileController");
const upload = require("../middlewares/uploadMiddleware");
router.get("/", getAllFiles);
router.post("/upload", upload.single("file"), uploadFileController);
router.get("/:fileName", getFileByName);
router.post("/:fileName/update-items", updateFileItems);
router.get("/:fileName/download", downloadFile);
module.exports = router;
