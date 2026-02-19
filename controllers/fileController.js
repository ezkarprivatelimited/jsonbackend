const fs = require("fs").promises;
const path = require("path");

const dataDirectory = path.join(__dirname, "../files");
const uploadFileController = async (req, res) => {
  try {
    if (req.fileValidationError) {
      return res.status(400).json({
        success: false,
        message: req.fileValidationError,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const filePath = req.file.path;

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

    try {
      JSON.parse(rawData);
    } catch (err) {
      await fs.unlink(filePath);
      return res.status(400).json({
        success: false,
        message: "Invalid JSON file format",
      });
    }

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      fileName: req.file.filename,
      size: req.file.size,
      uploadedAt: new Date(),
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

    // ─────────────────────────────────────────────
    // Basic validations
    // ─────────────────────────────────────────────
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "File name is required",
      });
    }

    if (!Array.isArray(clientItems) || clientItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ItemList must be a non-empty array",
      });
    }

    // ─────────────────────────────────────────────
    // Secure file path (prevent path traversal)
    // ─────────────────────────────────────────────
    const dataDirectory = path.resolve(__dirname, "../files");
    const safeFilePath = path.normalize(
      path.join(dataDirectory, fileName)
    );

    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({
        success: false,
        message: "Invalid file path – access denied",
      });
    }

    // ─────────────────────────────────────────────
    // Check file exists
    // ─────────────────────────────────────────────
    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // ─────────────────────────────────────────────
    // Read original file
    // ─────────────────────────────────────────────
    const content = await fs.readFile(safeFilePath, "utf8");
    let originalData = JSON.parse(content);

    // ─────────────────────────────────────────────
    // Normalize invoice structure
    // ─────────────────────────────────────────────
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

    // 🔒 Prevent item count tampering
    if (clientItems.length !== invoice.ItemList.length) {
      return res.status(400).json({
        success: false,
        message: "Item count mismatch. Modification not allowed.",
      });
    }

    // ─────────────────────────────────────────────
    // Update items WITHOUT replacing object
    // ─────────────────────────────────────────────
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

      // IMPORTANT: Preserve IGST sent by client
      const igst = Number(clientItem.IgstAmt) || 0;
      const totalItem =
        Number(clientItem.TotItemVal) || taxable + igst;

      // 🔥 Update ONLY editable numeric fields
      existingItem.SlNo = String(idx + 1);
      existingItem.Qty = qty;
      existingItem.UnitPrice = unitPrice;
      existingItem.Discount = discount;
      existingItem.TotAmt = Number(taxable.toFixed(2));
      existingItem.AssAmt = Number(taxable.toFixed(2));
      existingItem.IgstAmt = Number(igst.toFixed(2));
      existingItem.TotItemVal = Number(totalItem.toFixed(2));

      // Preserve other GST fields safely
      existingItem.CgstAmt = existingItem.CgstAmt ?? 0;
      existingItem.SgstAmt = existingItem.SgstAmt ?? 0;
      existingItem.CesRt = existingItem.CesRt ?? 0;
      existingItem.CesAmt = existingItem.CesAmt ?? 0;
      existingItem.CesNonAdvlAmt =
        existingItem.CesNonAdvlAmt ?? 0;

      // Accumulate totals
      assVal += taxable;
      igstVal += igst;
      discountTotal += discAmt;
      totItemValSum += totalItem;
    });

    // ─────────────────────────────────────────────
    // Other Charges & Rounding
    // ─────────────────────────────────────────────
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

    // ✅ Update ONLY allowed fields
    invoice.ValDtls.AssVal = Number(assVal.toFixed(2));
    invoice.ValDtls.OthChrg = othChrg;
    invoice.ValDtls.Discount=0
    // ─────────────────────────────────────────────
    // Preserve original wrapper structure
    // ─────────────────────────────────────────────
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
      file: fileName,
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
const downloadFile1 = async (req, res) => {
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

const downloadFile = async (req, res) => {
  console.log("hi")
  try {
    const { fileName } = req.params;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "File name is required",
      });
    }

    // Absolute safe base directory
    const dataDirectory = path.resolve(__dirname, "../files");

    // Secure file path
    const safeFilePath = path.normalize(
      path.join(dataDirectory, fileName)
    );

    // Prevent path traversal
    if (!safeFilePath.startsWith(dataDirectory)) {
      return res.status(403).json({
        success: false,
        message: "Access denied - invalid path",
      });
    }

    // Check file exists
    try {
      await fs.access(safeFilePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: `File not found: ${fileName}`,
      });
    }

    // Clean file name for download
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Send file
    res.download(safeFilePath, cleanFileName, async (err) => {
      if (err) {
        console.error("Download error:", err);
        return;
      }

      try {
        console.log()
        // Delete file after successful download
        await fs.unlink(safeFilePath);
        console.log(`File deleted after download: ${fileName}`);
      } catch (deleteError) {
        console.error("Error deleting file:", deleteError);
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
