// src/services/files.js
// Handle file downloads and processing from Slack

const axios = require("axios");
const pdfParse = require("pdf-parse");

// Download file from Slack
async function downloadFile(fileUrl, botToken) {
  try {
    const response = await axios.get(fileUrl, {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error("Failed to download file:", error.message);
    return null;
  }
}

// Extract text from PDF
async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error("Failed to parse PDF:", error.message);
    return null;
  }
}

// Convert image buffer to base64 for Claude vision
function imageToBase64(buffer, mimeType) {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mimeType,
      data: buffer.toString("base64"),
    },
  };
}

// Process files attached to a Slack message
async function processFiles(files, botToken) {
  if (!files || files.length === 0) return null;

  const results = {
    images: [],
    texts: [],
  };

  for (const file of files) {
    const mimeType = file.mimetype || "";
    const fileName = file.name || "unknown";

    console.log(`[files] Processing: ${fileName} (${mimeType})`);

    // Download the file
    const buffer = await downloadFile(file.url_private, botToken);
    if (!buffer) continue;

    // Handle different file types
    if (mimeType.startsWith("image/")) {
      // Image - prepare for Claude vision
      results.images.push(imageToBase64(buffer, mimeType));
      console.log(`[files] Image processed: ${fileName}`);
    } else if (mimeType === "application/pdf") {
      // PDF - extract text
      const text = await extractPdfText(buffer);
      if (text) {
        results.texts.push(`[PDF: ${fileName}]\n${text}`);
        console.log(`[files] PDF text extracted: ${fileName}`);
      }
    } else if (mimeType.startsWith("text/") || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      // Plain text file
      results.texts.push(`[File: ${fileName}]\n${buffer.toString("utf-8")}`);
      console.log(`[files] Text file processed: ${fileName}`);
    } else {
      console.log(`[files] Skipping unsupported type: ${mimeType}`);
    }
  }

  return results;
}

module.exports = { processFiles, downloadFile, extractPdfText };
