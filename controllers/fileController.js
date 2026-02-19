const fs = require("fs").promises;
const path = require("path");

const dataDirectory = path.join(__dirname, "../files");
const uploadFileController = async (req, res) => {
  try {
    console.log("Uploaded file object:", req.file);

    // 1️⃣ Multer validation error
    if (req.fileValidationError) {
      return res.status(400).json({
        success: false,
        message: req.fileValidationError,
      });
    }

    // 2️⃣ File existence check
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // 3️⃣ Use multer's absolute file path
    const filePath = req.file.path;

    // 4️⃣ Read uploaded file
    let rawData;
    try {
      rawData = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      console.error("File Read Error:", err);
      return res.status(500).json({
        success: false,
        message: "Unable to read uploaded file",
      });
    }

    // 5️⃣ Validate JSON format
    let parsedJson;
    try {
      parsedJson = JSON.parse(rawData);
    } catch (err) {
      // Delete invalid file
      await fs.unlink(filePath);
      return res.status(400).json({
        success: false,
        message: "Invalid JSON file format",
      });
    }

    // 6️⃣ Success response
    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      fileName: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      location: filePath,
      uploadedAt: new Date(),
      keysCount: Object.keys(parsedJson).length, // optional insight
    });

  } catch (error) {
    console.error("UPLOAD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const getAllFiles = async (req, res) => {
  try {
    const files = await fs.readdir(dataDirectory);

    return res.status(200).json({
      success: true,
      totalFiles: files.length,
      files,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error reading directory",
      error: error.message,
    });
  }
};
const getAllFilesWithContent = async (req, res) => {
  try {
    const files = await fs.readdir(dataDirectory);

    const fileData = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dataDirectory, file);
        const content = await fs.readFile(filePath, "utf8");

        return {
          fileName: file,
          content,
        };
      })
    );

    return res.status(200).json({
      success: true,
      totalFiles: fileData.length,
      files: fileData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error reading files",
      error: error.message,
    });
  }
};
const getFileByName = async (req, res) => {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "File name is required",
      });
    }

    // Normalize path to prevent traversal
    const safeFilePath = path.normalize(
      path.join(dataDirectory, fileName)
    );

    // Ensure requested file is inside the directory
    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Check file exists
    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const extension = path.extname(fileName).toLowerCase();

    // If JSON → return parsed JSON
    if (extension === ".json") {
      const fileContent = await fs.readFile(safeFilePath, "utf8");

      return res.status(200).json({
        success: true,
        fileName,
        data: JSON.parse(fileContent),
      });
    }

    // Otherwise → stream file
    return res.download(safeFilePath);

  } catch (error) {
    console.error("File Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
const updateFileItems = async (req, res) => {
  try {
    const { fileName } = req.params;
    const { ItemList: clientItems, ValDtls: clientValDtls } = req.body;

    if (!fileName) {
      return res.status(400).json({ success: false, message: "File name is required" });
    }

    if (!Array.isArray(clientItems) || clientItems.length === 0) {
      return res.status(400).json({ success: false, message: "ItemList must be a non-empty array" });
    }

    // Secure file path
    const dataDirectory = path.join(__dirname, '../files');
    const safeFilePath = path.normalize(path.join(dataDirectory, fileName));

    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({ success: false, message: "Invalid file path – access denied" });
    }

    // Check file exists
    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    // Read & parse original file
    const content = await fs.readFile(safeFilePath, 'utf8');
    let originalData = JSON.parse(content);

    // Normalize to get the inner invoice object
    let invoice;

    if (Array.isArray(originalData) && originalData.length > 0) {
      invoice = originalData[0];
    } else if (originalData?.data?.[0]) {
      invoice = originalData.data[0];
    } else if (originalData && typeof originalData === 'object') {
      invoice = originalData;
    } else {
      return res.status(400).json({ success: false, message: "Unsupported JSON structure" });
    }

    if (!invoice || !Array.isArray(invoice.ItemList)) {
      return res.status(400).json({ success: false, message: "Missing or invalid ItemList in file" });
    }

    // ───────────────────────────────────────────────────────────────
    // We trust client-sent values for IgstAmt and TotItemVal
    // We only recalculate AssAmt / TotAmt based on Qty, Rate, Discount
    // ───────────────────────────────────────────────────────────────

    let assVal = 0;
    let igstVal = 0;
    let discountTotal = 0;
    let totItemValSum = 0;

    const newItemList = clientItems.map((item, idx) => {
      const qty       = Number(item.Qty)       || 0;
      const unitPrice = Number(item.UnitPrice) || 0;
      const discount  = Number(item.Discount)  || 0;

      const gross     = qty * unitPrice;
      const discAmt   = gross * (discount / 100);
      const taxable   = gross - discAmt;

      // ── IMPORTANT: Do NOT recalculate IGST ───────────────────────
      // Use the value the client sent (which is preserved original)
      const igst      = Number(item.IgstAmt)   || 0;
      const totalItem = Number(item.TotItemVal) || (taxable + igst);

      assVal       += taxable;
      igstVal      += igst;
      discountTotal += discAmt;
      totItemValSum += totalItem;

      return {
        ...item, // keep everything client sent: PrdDesc, HsnCd, GstRt, IgstAmt, etc.
        SlNo: String(idx + 1),
        TotAmt:     Number(taxable.toFixed(2)),
        AssAmt:     Number(taxable.toFixed(2)),
        // IgstAmt:    ← kept as sent by client (original value preserved)
        TotItemVal: Number(totalItem.toFixed(2)),
        CgstAmt:    0,
        SgstAmt:    0,
        CesRt:      item.CesRt ?? 0,
        CesAmt:     0,
        CesNonAdvlAmt: 0,
      };
    });

    // Other charges & rounding ─ use client value if provided
    const othChrg = 
      clientValDtls?.OthChrg !== undefined && clientValDtls?.OthChrg !== null
        ? Number(clientValDtls.OthChrg)
        : Number(invoice.ValDtls?.OthChrg ?? 0);

    const rndOff = 
      clientValDtls?.RndOffAmt !== undefined && clientValDtls?.RndOffAmt !== null
        ? Number(clientValDtls.RndOffAmt)
        : Number(invoice.ValDtls?.RndOffAmt ?? 0);

    const finalTotInvVal = Number((totItemValSum + othChrg + rndOff).toFixed(2));

    // Build clean ValDtls
    invoice.ValDtls = {
      ...(invoice.ValDtls || {}),
      AssVal:    Number(assVal.toFixed(2)),
      CgstVal:   0,
      SgstVal:   0,
      IgstVal:   Number(igstVal.toFixed(2)),     // summed from preserved item.IgstAmt
      CesVal:    0,
      Discount:  Number(discountTotal.toFixed(2)),
      OthChrg:   othChrg,
      RndOffAmt: rndOff,
      TotInvVal: finalTotInvVal,
    };

    // Replace items
    invoice.ItemList = newItemList;

    // Write back in original wrapper style
    let dataToWrite;

    if (Array.isArray(originalData)) {
      dataToWrite = [invoice];
    } else if (originalData?.data) {
      dataToWrite = { ...originalData, data: [invoice] };
    } else {
      dataToWrite = invoice;
    }

    await fs.writeFile(safeFilePath, JSON.stringify(dataToWrite, null, 2), 'utf8');

    return res.status(200).json({
      success: true,
      message: "Invoice updated successfully",
      file: fileName,
      finalTotInvVal,
      othChrgUsed: othChrg,
      itemCount: newItemList.length,
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
const downloadFile = async (req, res) => {
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "File name is required",
      });
    }

    // Normalize and secure the path
    const safeFilePath = path.normalize(path.join(dataDirectory, fileName));

    // Prevent path traversal attacks
    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({
        success: false,
        message: "Access denied - invalid path",
      });
    }

    // Check if file exists
    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: `File not found: ${fileName}`,
      });
    }

    // Optional: Set custom filename if you want to clean it or add prefix/suffix
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Send file for download
    return res.download(safeFilePath, cleanFileName, (err) => {
      if (err) {
        console.error("Download error:", err);
        // If download fails after headers sent, we can't send JSON anymore
        // But we can log it
        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            message: "Error during file download",
            error: err.message,
          });
        }
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
  getAllFiles,
  getAllFilesWithContent,
  getFileByName,
  updateFileItems,
  downloadFile,
  uploadFileController
};
