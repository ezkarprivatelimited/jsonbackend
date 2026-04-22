const fs = require("fs").promises;
const mongoose = require("mongoose");
const path = require("path");
const User = require("../schema/user.schema.js");
const dataDirectory = path.join(__dirname, "../files");
const uploadFileController = async (req, res) => {
    try {
        const { id } = req.user ?? {};
        if (!id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (req.fileValidationError) {
            return res.status(400).json({ success: false, message: req.fileValidationError });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const filePath = req.file.path;
        let rawData;
        try {
            rawData = await fs.readFile(filePath, "utf-8");
        } catch (err) {
            console.error("File Read Error:", err);
            return res.status(500).json({ success: false, message: "Unable to read uploaded file" });
        }

        // ✅ Validate JSON BEFORE pushing to user.files
        try {
            JSON.parse(rawData);
        } catch (err) {
            await fs.unlink(filePath).catch(console.error); // cleanup disk
            return res.status(400).json({ success: false, message: "Invalid JSON file format" });
        }

        // ✅ Only update DB after all validations pass
        user.files.push({
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: filePath,
            size: req.file.size,
            mimetype: req.file.mimetype,
        });

        await user.save();

        return res.status(200).json({
            success: true,
            message: "File uploaded successfully",
            fileName: req.file.filename,
            size: req.file.size,
            uploadedAt: new Date(),
        });

    } catch (error) {
        console.error("UPLOAD ERROR:", error);

        // ✅ Attempt cleanup if file was uploaded but something else failed
        if (req.file?.path) {
            await fs.unlink(req.file.path).catch(console.error);
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};
const getFileById = async (req, res) => {
  try {
    let { id: fileId } = req.params;
    const { id } = req.user;
    console.log(fileId)
    if (!id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    // console.log(user.files)
    fileId=new mongoose.Types.ObjectId(fileId);
    const file = user.files.id(fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }
    const safeFilePath = path.normalize(path.join("", file.path))
    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const extension = path.extname(file.path).toLowerCase();
    if (extension === ".json") {
      const fileContent = await fs.readFile(safeFilePath, "utf8");
      return res.status(200).json({
        success: true,
        file: JSON.parse(fileContent) ,
      });
    }
    return res.download(safeFilePath);
  } catch (error) {
    console.error("File retrieval error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
const updateFileItems = async (req, res) => {
  try {
    const { id: fileId } = req.params;
    const { ItemList: clientItems, ValDtls: clientValDtls } = req.body;
    const { id } = req.user;

    if (!id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const file = user.files.find((file) => file._id.toString() === fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    if (!Array.isArray(clientItems) || clientItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ItemList must be a non-empty array",
      });
    }

    const safeFilePath = path.resolve(file.path);
    const dataDirectory = path.resolve(__dirname, "../files");
    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({
        success: false,
        message: "Invalid file path access denied",
      });
    }

    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: "File not found on disk",
      });
    }

    const content = await fs.readFile(safeFilePath, "utf8");
    let originalData = JSON.parse(content);
    let invoice;

    if (Array.isArray(originalData) && originalData.length > 0) {
      invoice = originalData[0];
    } else if (originalData?.data?.[0]) {
      invoice = originalData.data[0];
    } else if (typeof originalData === "object") {
      invoice = originalData;
    } else {
      return res.status(400).json({
        success: false,
        message: "Unsupported JSON structure",
      });
    }

    if (!invoice || !Array.isArray(invoice.ItemList)) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid ItemList in file",
      });
    }

    if (clientItems.length !== invoice.ItemList.length) {
      return res.status(400).json({
        success: false,
        message: "Item count mismatch. Modification not allowed.",
      });
    }

    let assVal = 0;
    let igstVal = 0;
    let discountTotal = 0;
    let totItemValSum = 0;

    invoice.ItemList.forEach((existingItem, idx) => {
      const clientItem = clientItems[idx];
      if (!clientItem) return;

      const qty = Number(clientItem.Qty) || 0;
      const unitPrice = Number(clientItem.UnitPrice) || 0;
      const discount = Number(clientItem.Discount) || 0;

      const gross = qty * unitPrice;
      const discAmt = gross * (discount / 100);
      const taxable = gross - discAmt;
      const igst = Number(clientItem.IgstAmt) || 0;
      const totalItem = Number(clientItem.TotItemVal) || taxable + igst;

      existingItem.SlNo = String(idx + 1);
      existingItem.Qty = qty;
      existingItem.UnitPrice = unitPrice;
      existingItem.Discount = discount;
      existingItem.TotAmt = Number(taxable.toFixed(2));
      existingItem.AssAmt = Number(taxable.toFixed(2));
      existingItem.IgstAmt = Number(igst.toFixed(2));
      existingItem.TotItemVal = Number(totalItem.toFixed(2));
      existingItem.CgstAmt = existingItem.CgstAmt ?? 0;
      existingItem.SgstAmt = existingItem.SgstAmt ?? 0;
      existingItem.CesRt = existingItem.CesRt ?? 0;
      existingItem.CesAmt = existingItem.CesAmt ?? 0;
      existingItem.CesNonAdvlAmt = existingItem.CesNonAdvlAmt ?? 0;

      assVal += taxable;
      igstVal += igst;
      discountTotal += discAmt;
      totItemValSum += totalItem;
    });

    const othChrg =
      clientValDtls?.OthChrg !== undefined
        ? Number(clientValDtls.OthChrg)
        : Number(invoice.ValDtls?.OthChrg ?? 0);

    const rndOff =
      clientValDtls?.RndOffAmt !== undefined
        ? Number(clientValDtls.RndOffAmt)
        : Number(invoice.ValDtls?.RndOffAmt ?? 0);

    const finalTotInvVal = Number(
      (totItemValSum + othChrg + rndOff).toFixed(2)
    );

    invoice.ValDtls = invoice.ValDtls || {};
    invoice.ValDtls.AssVal = Number(assVal.toFixed(2));
    invoice.ValDtls.OthChrg = othChrg;
    invoice.ValDtls.Discount = 0;

    let dataToWrite;
    if (Array.isArray(originalData)) {
      dataToWrite = [invoice];
    } else if (originalData?.data) {
      dataToWrite = { ...originalData, data: [invoice] };
    } else {
      dataToWrite = invoice;
    }

    await fs.writeFile(
      safeFilePath,
      JSON.stringify(dataToWrite, null, 2),
      "utf8"
    );

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      file: file.name,
      finalTotInvVal,
      othChrgUsed: othChrg,
      itemCount: invoice.ItemList.length,
    });

  } catch (err) {
    console.error("Update failed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update file",
      error: err.message,
    });
  }
};
const downloadFileById = async (req, res) => {
  try {
    const { id: fileId } = req.params;
    const { id } = req.user;

    if (!id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const file = user.files.find((file) => file._id.toString() === fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const dataDirectory = path.resolve(__dirname, "../files");

    const safeFilePath = path.normalize(
      path.join(dataDirectory, file.path)
    );

    // Prevent path traversal
    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({
        success: false,
        message: "Access denied - invalid path",
      });
    }
    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: `File not found: ${file.path}`,
      });
    }
    const cleanFileName = file.path.replace(/[^a-zA-Z0-9._-]/g, "_");

    res.download(safeFilePath, cleanFileName, async (err) => {
      if (err) {
        console.error("Download error:", err);
        return;
      }

      try {
        await fs.unlink(safeFilePath);
        console.log(`File deleted after download: ${file.path}`);
        user.files = user.files.filter(
          (f) => f._id.toString() !== fileId
        );
        await user.save();
        console.log(`File entry removed from user record: ${fileId}`);
      } catch (deleteError) {
        console.error("Error during post-download cleanup:", deleteError);
      }
    });

  } catch (error) {
    console.error("Download controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
module.exports = {
    getFileById,
    updateFileItems,
    uploadFileController,
    downloadFileById
};
