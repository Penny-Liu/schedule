export const loadExcelJS = async () => (await import("exceljs")).default;

export const loadPdfLibraries = async () => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  return { jsPDF, autoTable };
};
