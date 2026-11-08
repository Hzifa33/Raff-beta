// RAFF 4.0.0 — Universal Hidden Iframe Print Engine (Tauri 2 & Web Compatible)

export function printHtml(html: string): boolean {
  try {
    if (typeof document !== 'undefined' && document.body) {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn('Iframe print failed, falling back to window.open', e);
            fallbackWindowPrint(html);
          } finally {
            setTimeout(() => {
              try {
                document.body.removeChild(iframe);
              } catch {}
            }, 3000);
          }
        }, 250);

        return true;
      }
    }
  } catch (err) {
    console.warn('Print iframe error, attempting fallback', err);
  }

  return fallbackWindowPrint(html);
}

function fallbackWindowPrint(html: string): boolean {
  try {
    const win = window.open('', '_blank', 'width=980,height=720');
    if (win) {
      win.document.write(html);
      win.document.close();
      return true;
    }
  } catch {}
  return false;
}
