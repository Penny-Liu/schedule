import { mkdir, readFile, writeFile } from "node:fs/promises";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const outputDirectory = new URL("../tmp/pdfs/", import.meta.url);
const outputFile = new URL("font-render-check.pdf", outputDirectory);
const fontFile = new URL("../public/fonts/jf-openhuninn-2.1.ttf", import.meta.url);

await mkdir(outputDirectory, { recursive: true });
const fontBase64 = (await readFile(fontFile)).toString("base64");

const doc = new jsPDF("l", "mm", "a4");
doc.addFileToVFS("jf-openhuninn-2.1.ttf", fontBase64);
for (const style of ["normal", "bold", "italic", "bolditalic"]) {
  doc.addFont("jf-openhuninn-2.1.ttf", "OpenHuninn", style);
}

doc.setFont("OpenHuninn", "bold");
doc.setFontSize(16);
doc.text("PDF 中文字型驗證 - 行政排班與基因排班", 14, 15);

autoTable(doc, {
  startY: 21,
  head: [["部門", ...Array.from({ length: 31 }, (_, index) => `${index + 1}日`)]],
  body: [
    ["行政", ...Array.from({ length: 31 }, (_, index) => index % 5 === 0 ? "王小明\n(北投)" : index % 7 === 0 ? "櫃檯" : "")],
    ["基因", ...Array.from({ length: 31 }, (_, index) => index % 4 === 0 ? "林怡君\n(基因H)" : index % 6 === 0 ? "線上解說" : "")],
    ["總務", ...Array.from({ length: 31 }, (_, index) => index % 8 === 0 ? "設備盤點" : index % 9 === 0 ? "外勤" : "")],
  ],
  margin: { left: 5, right: 5 },
  styles: {
    font: "OpenHuninn",
    fontSize: 6.5,
    halign: "center",
    valign: "middle",
    cellPadding: 0.6,
  },
  headStyles: {
    font: "OpenHuninn",
    fontStyle: "bold",
    fillColor: [51, 65, 85],
  },
  columnStyles: {
    0: { cellWidth: 22, fontStyle: "bold" },
  },
});

await writeFile(outputFile, Buffer.from(doc.output("arraybuffer")));
console.log(outputFile.pathname);
