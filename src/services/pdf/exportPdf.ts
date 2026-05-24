type Page = { id: string; html: string };

export default async function exportPdf(pages: Page[], opts?: { filename?: string; returnBlob?: boolean }) {
  if (typeof document === 'undefined') throw new Error('exportPdf can only be used in the browser');

  // Dynamically import heavy browser-only libs to avoid SSR and resolver issues
  const { default: html2canvas } = await import('html2canvas');
  const { default: jsPDF } = await import('jspdf');

  const filename = opts?.filename || 'notebook.pdf';
  const canvases: HTMLCanvasElement[] = [];

  // Render each page into a hidden container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  document.body.appendChild(container);

  for (let i = 0; i < pages.length; i++) {
    const wrapper = document.createElement('div');
    wrapper.style.width = '210mm';
    wrapper.style.minHeight = '297mm';
    wrapper.style.background = '#fff';
    wrapper.style.padding = '32px';
    wrapper.innerHTML = pages[i].html || '<div></div>';
    container.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true });
    canvases.push(canvas as HTMLCanvasElement);
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  canvases.forEach((c, idx) => {
    const imgData = (c as HTMLCanvasElement).toDataURL('image/png');
    const imgProps = { width: 210, height: ((c as HTMLCanvasElement).height * 210) / (c as HTMLCanvasElement).width };
    if (idx > 0) pdf.addPage();
    // @ts-ignore jsPDF typings sometimes differ per version
    pdf.addImage(imgData, 'PNG', 0, 0, imgProps.width, imgProps.height);
    pdf.setFontSize(10);
    // place page number near bottom-right
    pdf.text(`${idx + 1}`, 200, 287);
  });

  document.body.removeChild(container);

  if (opts?.returnBlob) {
    // @ts-ignore
    const blob = pdf.output('blob');
    return blob;
  }

  // @ts-ignore
  pdf.save(filename);
  return true;
}
