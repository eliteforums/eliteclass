import React from 'react';

type Props = {
  onNewPage: () => void;
  onDownload: () => void;
  onSave: () => void;
  onUpload: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  toggleDark: () => void;
  isDark: boolean;
};

export default function Toolbar({ onNewPage, onDownload, onSave, onUpload, zoom, setZoom, toggleDark, isDark }: Props) {
  return (
    <div className="flex gap-2 items-center p-3 bg-gray-50 dark:bg-gray-800 border-b sticky top-0 z-30">
      <button onClick={onNewPage} className="btn">New Page</button>
      <button onClick={onDownload} className="btn">Download PDF</button>
      <button onClick={onSave} className="btn">Save Draft</button>
      <button onClick={onUpload} className="btn">Upload to Drive</button>

      <div className="ml-4 flex items-center gap-2">
        <label className="text-sm">Zoom</label>
        <input type="range" min={50} max={150} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        <span className="w-8 text-right">{zoom}%</span>
      </div>

      <div className="ml-2 flex items-center gap-2">
        <button onClick={() => document.execCommand('undo')} className="btn">Undo</button>
        <button onClick={() => document.execCommand('redo')} className="btn">Redo</button>
      </div>

      <div className="ml-auto">
        <button onClick={toggleDark} className="btn">{isDark ? 'Light' : 'Dark'}</button>
      </div>
    </div>
  );
}
