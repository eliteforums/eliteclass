import React from "react";

export function XMLTemplateDownloader() {
  const handleDownload = () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<students>\n  <student>\n    <full_name>Ravi Sharma</full_name>\n    <contact_email>ravi@example.com</contact_email>\n    <phone>9876543210</phone>\n    <admission_number>2024-001</admission_number>\n    <batch></batch>\n    <emergency_contact_name></emergency_contact_name>\n    <emergency_contact_phone></emergency_contact_phone>\n    <emergency_relationship></emergency_relationship>\n    <parent_name></parent_name>\n    <parent_email></parent_email>\n    <parent_phone></parent_phone>\n    <occupation></occupation>\n    <relationship_type></relationship_type>\n  </student>\n</students>`;

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_import_template.xml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
    >
      Download XML Template
    </button>
  );
}

export default XMLTemplateDownloader;
