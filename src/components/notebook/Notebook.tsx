import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Page from './Page';
import Toolbar from './Toolbar';
import useAutosave from '../../hooks/useAutosave';
import exportPdf from '../../services/pdf/exportPdf';
import driveService from '../../services/drive/driveService';
import toast from 'react-hot-toast';

type NotePage = { id: string; html: string };

function uid() { return Math.random().toString(36).slice(2, 9); }

export default function Notebook() {
  const [pages, setPages] = useState<NotePage[]>(() => {
    try {
      const raw = localStorage.getItem('notebook.draft');
      return raw ? JSON.parse(raw) : [{ id: uid(), html: '' }];
    } catch { return [{ id: uid(), html: '' }]; }
  });
  const [zoom, setZoom] = useState(100);
  const [isDark, setIsDark] = useState(false);

  useAutosave(pages);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const addPage = useCallback(() => setPages(p => [...p, { id: uid(), html: '' }]), []);
  const updatePage = useCallback((id: string, html: string) => setPages(p => p.map(pg => pg.id === id ? { ...pg, html } : pg)), []);

  const download = async () => {
    try {
      toast.promise(exportPdf(pages.map((p, i) => ({ id: `page-${i}`, html: p.html })), { filename: 'notebook.pdf' }), {
        loading: 'Generating PDF...',
        success: 'PDF ready',
        error: 'Failed to generate PDF'
      });
    } catch (e) { console.error(e); }
  };

  const saveDraft = () => {
    localStorage.setItem('notebook.draft', JSON.stringify(pages));
    toast.success('Draft saved');
  };

  const upload = async () => {
    try {
      const blob = await exportPdf(pages.map((p, i) => ({ id: `page-${i}`, html: p.html })), { returnBlob: true });
      const res = await driveService.uploadPdf(blob, 'notebook.pdf', (progress) => {
        // Could show progress
      });
      if (res?.webViewLink) {
        navigator.clipboard.writeText(res.webViewLink);
        toast.success('Uploaded to Drive. Link copied.');
      } else {
        toast.success('Uploaded.');
      }
    } catch (err) { console.error(err); toast.error('Upload failed'); }
  };

  return (
    <div className="notebook-root min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Toolbar onNewPage={addPage} onDownload={download} onSave={saveDraft} onUpload={upload} zoom={zoom} setZoom={setZoom} toggleDark={() => setIsDark(d => !d)} isDark={isDark} />

      <div className="container mx-auto py-6 px-4 flex gap-6">
        <div className="flex-1" style={{ transform: `scale(${zoom/100})`, transformOrigin: 'top center' }}>
          <AnimatePresence initial={false} mode="popLayout">
            {pages.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} layout>
                <Page id={`page-${i}`} html={p.html} onChange={updatePage} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <aside className="w-40 hidden md:block">
          <div className="space-y-2">
            {pages.map((p, i) => (
              <div key={p.id} className="thumbnail border rounded overflow-hidden" style={{ height: 120 }}>
                <div className="w-full h-full bg-white flex items-center justify-center text-xs">Page {i+1}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
