"use client";

// Print opens the browser's print window; choosing "Save as PDF" there makes the PDF. Nothing is built on the server.
export default function PrintButton() {
  return (
    <button type="button" className="rp-btn" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
