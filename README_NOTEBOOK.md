Notebook Feature
================

Quick start

1. Install dependencies required for the notebook feature:

```bash
npm install html2canvas jspdf react-hot-toast framer-motion multer express cors
```

2. Start the upload server (separate process):

```bash
node backend/upload-server.js
```

3. Import the `Notebook` component at a route or page (`routes/notebook.tsx` is provided).

Notes
- The upload server is a minimal Express endpoint that stores uploaded PDFs in `tmp/`.
- For Google Drive uploads, implement Drive API integration in `backend/upload-server.ts` using service account credentials.
