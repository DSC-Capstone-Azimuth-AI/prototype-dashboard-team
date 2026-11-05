# Offline PDF dependencies

- jsPDF 3.0.3: https://github.com/parallax/jsPDF (MIT; jspdf-LICENSE.txt).
- jsPDF-AutoTable 5.0.2: https://github.com/simonbengtsson/jsPDF-AutoTable (MIT; autotable-LICENSE.txt).
- Noto Sans Regular: https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf (SIL OFL; NotoSans-LICENSE.txt), bundled as base64 in report-font.js. Source font SHA-256 is identical to decoding that assignment. Snapshot downloaded November 4, 2026; not automatically updated.

These assets are committed locally for offline operation. jsPDF creates searchable text and vector charts; AutoTable handles line wrapping, pagination and repeated headers. Noto Sans preserves common accented/Greek text. Unsupported glyphs block PDF generation with a visible error rather than silently dropping characters. No HTML-to-PDF, remote fonts, CDN or browser print dialog is used at runtime. Only the APIs for text, tables, vector lines and downloads are used.
