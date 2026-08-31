// Turns any structured report (see the "--- Reports ---" section of
// db/queries.js: getSpaceReport/getWorkspaceReport/getBlockReport) into
// a plain-text narrative. Every report shares one shape --
// { level, id, label, generatedAt, sections: [{ heading, lines }] } --
// no matter which level it came from, which is what lets this stay one
// small generic renderer instead of three near-duplicates. Pure text
// formatting, no database access -- kept out of queries.js on purpose,
// same separation textLinks.jsx/listItems.js already draw between
// "gather the data" and "render it."
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
