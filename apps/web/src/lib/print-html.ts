/** Print a DOM subtree in an isolated iframe (works with fixed modals and Tailwind). */
export function printHtmlElement(element: HTMLElement): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden",
  );
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  const stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((node) => {
      const href = (node as HTMLLinkElement).href;
      return href ? `<link rel="stylesheet" href="${href}" />` : "";
    })
    .join("\n");

  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((style) => style.outerHTML)
    .join("\n");

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Print</title>
${stylesheetLinks}
${inlineStyles}
<style>
  @page { margin: 12mm; }
  body { margin: 0; padding: 24px; background: #fff; color: #0f172a; font-family: system-ui,Segoe UI,sans-serif; font-size: 12px; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .vetos-printable-document, .vetos-printable-document * { visibility: visible !important; color: #0f172a !important; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; }
  h1, h2 { margin: 0 0 8px; }
</style>
</head>
<body>${element.outerHTML}</body>
</html>`);
  doc.close();

  const cleanup = () => iframe.remove();

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(cleanup, 2000);
    }
  };

  iframe.onload = () => window.setTimeout(runPrint, 100);
  window.setTimeout(runPrint, 400);
}
