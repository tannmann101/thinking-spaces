// Ported unchanged from backend/src/reportFormat.js -- pure text
// formatting, no database access, so nothing about the Worker port
// touches this file.
export function renderReportText(report) {
  const lines = [`${report.label} (${report.level})`, `Report generated ${report.generatedAt}`];
  report.sections.forEach((section) => {
    lines.push('', section.heading);
    if (section.lines.length === 0) {
      lines.push('  (nothing here yet)');
    } else {
      section.lines.forEach((line) => lines.push(`  - ${line}`));
    }
  });
  return lines.join('\n');
}
