# B200 node burn-in and GPU 4 diagnostic report

Static web report for node `s946907x5206414` (Supermicro B200, 8x NVIDIA B200), prepared for the
Supermicro JumpStart team. No build step, no backend, no external dependencies.

## Files

| File | Purpose |
|---|---|
| `index.html` | Report content and structure (all prose lives here) |
| `styles.css` | Screen and print styles (`@media print` section drives the PDF layout) |
| `script.js` | Password gate, navigation, tables and SVG charts (plain JS) |
| `data.js` | Derived telemetry series and per-phase summaries, generated from the assessment folders |

## Opening locally

Double-click `index.html`, or serve the folder:

```sh
cd report
python3 -m http.server 8080
# open http://localhost:8080/
```

Password: `Super123`. Access is remembered for the browser tab session (`sessionStorage`);
"Lock report" clears it. This is a client-side gate only — anyone with the files can read them.

## Hosting

Upload the four files to any static host (S3 + CloudFront, GitHub Pages, Netlify, nginx, an internal
file share). All paths are relative; the report works from any URL prefix. If the host should not be
indexed, keep the `<meta name="robots" content="noindex">` tag and disable directory listing.

## PDF

Click **Download PDF** (or use the browser's Print > Save as PDF). The print stylesheet expands all
collapsed sections, hides navigation and controls, forces page breaks before major sections and keeps
charts and tables unsplit. Chrome/Edge give the most faithful output; enable "Background graphics"
if the GPU 4 row highlighting is wanted in the PDF.

## Regenerating `data.js`

`data.js` was produced from the four `assessment_*` folders in the parent directory (NVML and BMC
telemetry downsampled to 5 s / 10 s buckets, per-phase per-GPU statistics, GEMM and inference series).
The generator script is not part of the deliverable; the numbers quoted in `index.html` were derived from
the same source files and are listed in the Evidence Appendix.
