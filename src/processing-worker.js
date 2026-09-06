import * as pdf from "./pdf-tools.js";
process.on("SIGTERM", () => {
  pdf.stopCommands();
  process.exit(0);
});
process.on("disconnect", () => {
  pdf.stopCommands();
  process.exit(0);
});
const allowed = new Set([
  "mergePdfs",
  "compressPdf",
  "convertToWord",
  "deletePages",
  "extractCoordinates",
  "extractHtml",
  "extractPages",
  "ocrPdf",
  "paginatePdf",
  "protectPdf",
  "rotatePdf",
  "unlockPdf",
  "archivePdf",
]);
process.on("message", async ({ operation, args }) => {
  try {
    if (!allowed.has(operation) || !Array.isArray(args))
      throw new Error("Unsupported PDF operation.");
    const result = await pdf[operation](...args);
    process.send({ result });
  } catch (error) {
    process.send({ error: error.message || "Unable to process this PDF." });
  }
});
