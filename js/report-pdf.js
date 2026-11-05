/* Vector charts and selectable, paginated PDF text. All dependencies are local. */
(function () {
  'use strict';
  const DC = window.DC;
  DC.reports.pdf = report => {
    const doc = new window.jspdf.jsPDF({ compress: true });
    doc.addFileToVFS('NotoSans.ttf', window.DC_REPORT_FONT);
    doc.addFont('NotoSans.ttf', 'NotoSans', 'normal'); doc.setFont('NotoSans');
    const glyphs = doc.getFont().metadata.cmap.unicode.codeMap;
    for (const ch of JSON.stringify(report.sections)) if (ch.charCodeAt(0) > 31 && !glyphs[ch.codePointAt(0)]) throw new Error('Unsupported character in report font: U+' + ch.codePointAt(0).toString(16) + '. Edit the text before export.');
    doc.setProperties({ title: report.title, subject: 'Synthetic demonstration report' });
    doc.setFontSize(19); doc.text(report.title, 14, 23);
    doc.setFontSize(9); doc.text('SYNTHETIC DEMONSTRATION - not real DERCONNECT measurements', 14, 32);
    doc.text('Generated: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' America/Los_Angeles', 14, 39);
    let y = 46;
    for (const [title, head, body] of report.sections) {
      if (y > 220) { doc.addPage(); y = 22; }
      doc.setFontSize(12); doc.text(title, 14, y); y += 5;
      doc.autoTable({ startY: y, head: [head], body, margin: { top: 22, bottom: 20, left: 14, right: 14 }, styles: { font: 'NotoSans', fontStyle: 'normal', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' }, headStyles: { fontStyle: 'normal', fillColor: [28, 60, 80] }, rowPageBreak: 'avoid', showHead: 'everyPage' });
      y = doc.lastAutoTable.finalY + 12;
    }
    doc.addPage(); doc.setFontSize(15); doc.text('Demand trend - measured and predicted median', 14, 24);
    const r = report.readings, vals = r.flatMap(p => [p.actual, p.expected]).filter(Number.isFinite), low = Math.min(...vals), high = Math.max(...vals), span = high - low || 1;
    doc.setFontSize(9); doc.text(`kW range ${DC.fmt.one(low)} to ${DC.fmt.one(high)}`, 14, 35);
    doc.text('Solid: measured    Dashed: expected median (prediction)', 14, 42);
    doc.setDrawColor(150); doc.line(20, 55, 20, 155); doc.line(20,155,195,155);
    for (const key of ['actual', 'expected']) {
      doc.setDrawColor(...(key === 'actual' ? [20, 50, 70] : [120, 70, 20])); doc.setLineWidth(0.35); doc.setLineDashPattern(key === 'expected' ? [2, 1] : [], 0);
      for (let i = 1; i < r.length; i++) if (Number.isFinite(r[i-1][key]) && Number.isFinite(r[i][key])) doc.line(20+(i-1)/Math.max(1,r.length-1)*175,155-(r[i-1][key]-low)/span*100,20+i/Math.max(1,r.length-1)*175,155-(r[i][key]-low)/span*100);
      if (r.length === 1 && Number.isFinite(r[0][key])) doc.circle(20,155-(r[0][key]-low)/span*100,0.8,'S');
    }
    doc.setLineDashPattern([],0); doc.setTextColor(25); doc.text(DC.reports.iso(report.a),20,163); doc.text(DC.reports.iso(report.b-1),195,163,{align:'right'});
    doc.text('Hourly samples; gaps remain gaps. Chart uses fixture campus wall time.',14,177);
    const pages = doc.getNumberOfPages();
    for (let i=1;i<=pages;i++) { doc.setPage(i); doc.setFontSize(8); doc.text(`Synthetic demonstration | Page ${i} of ${pages}`,14,287); }
    return doc;
  };
})();
