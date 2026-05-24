import React, { useState } from 'react';
import CanvasEditor from '../canvas/CanvasEditor';
import generateAssignmentPdf from '../../services/pdf/generateAssignmentPdf';
import driveService from '../../services/drive/driveService';
import toast from 'react-hot-toast';

export default function CreateAssignment() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [pages, setPages] = useState<any[]>([]);

  const handleSend = async () => {
    try {
      const blob = await generateAssignmentPdf(pages, { returnBlob: true });
      const res = await fetch('/api/assignments/upload-pdf', { method: 'POST', body: (() => { const f = new FormData(); f.append('file', blob, 'assignment.pdf'); f.append('title', title); return f; })() });
      const data = await res.json();
      toast.success('Assignment sent');
    } catch (err) { console.error(err); toast.error('Send failed'); }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold">Create Assignment</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="input" />
        <input value={dueDate} onChange={e => setDueDate(e.target.value)} type="date" className="input" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="input col-span-2" />
      </div>

      <div className="mt-4">
        <CanvasEditor pages={pages} onChange={(p) => setPages(p)} onSendAssignment={() => { void handleSend(); }} />
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={() => { localStorage.setItem('assignment.draft', JSON.stringify({ title, description, dueDate, pages })); toast.success('Draft saved'); }} className="btn">Save Draft</button>
        <button onClick={() => {/* preview */}} className="btn">Preview</button>
        <button onClick={handleSend} className="btn">Send Assignment</button>
      </div>
    </div>
  );
}
