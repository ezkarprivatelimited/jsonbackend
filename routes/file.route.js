const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload.middleware");
const {
    getFileById,
    updateFileItems,
    uploadFileController,
    downloadFileById
} = require("../controllers/file.controller");
const {authenticateJWT} = require("../middlewares/auth.middleware");
router.use(authenticateJWT);
router.post("/", upload.single("file"), uploadFileController);
router.get("/:id", getFileById);
router.post("/:id/update-items", updateFileItems);  
router.get("/:id/download", downloadFileById);
module.exports = router;