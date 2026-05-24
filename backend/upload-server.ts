import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());

const upload = multer({ dest: path.join(__dirname, '..', 'tmp') });

app.post('/upload-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  // Simple store: move file to tmp and return path
  const dest = path.join(__dirname, '..', 'tmp', req.file.originalname);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(req.file.path, dest);

  // In real deployment, upload to Google Drive here using credentials

  const url = `/tmp/${encodeURIComponent(req.file.originalname)}`;
  res.json({ file: req.file.originalname, url });
});

const port = process.env.PORT || 4001;
app.listen(port, () => console.log(`Upload server listening on ${port}`));
