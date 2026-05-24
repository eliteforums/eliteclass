import React from "react";

export function TemplateDownloader() {
  const downloadXML = () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<students>\n  <student>\n    <full_name>Ravi Sharma</full_name>\n    <contact_email>ravi@example.com</contact_email>\n    <phone>9876543210</phone>\n    <admission_number>2024-001</admission_number>\n    <batch></batch>\n    <emergency_contact_name></emergency_contact_name>\n    <emergency_contact_phone></emergency_contact_phone>\n    <emergency_relationship></emergency_relationship>\n    <parent_name></parent_name>\n    <parent_email></parent_email>\n    <parent_phone></parent_phone>\n    <occupation></occupation>\n    <relationship_type></relationship_type>\n  </student>\n</students>`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_import_template.xml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    const headers = [
      "full_name",
      "contact_email",
      "phone",
      "admission_number",
      "batch",
      "emergency_contact_name",
      "emergency_contact_phone",
      "emergency_relationship",
      "parent_name",
      "parent_email",
      "parent_phone",
      "occupation",
      "relationship_type",
    ];
    const sample = [
      [
        "Ravi Sharma",
        "ravi@example.com",
        "9876543210",
        "2024-001",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ];

    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("students");
      worksheet.addRow(headers);
      sample.forEach((row) => worksheet.addRow(row));
      const wbout = await workbook.xlsx.writeBuffer();
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student_import_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Fallback to CSV
      const csv = [headers.join(","), sample.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student_import_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex gap-2">
      <button onClick={downloadXML} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted">Download XML Template</button>
      <button onClick={downloadExcel} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted">Download Excel Template</button>
    </div>
  );
}

export default TemplateDownloader;
