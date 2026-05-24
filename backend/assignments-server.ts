import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());

const upload = multer({ dest: path.join(__dirname, '..', 'tmp') });

app.post('/api/assignments/upload-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const dest = path.join(__dirname, '..', 'tmp', req.file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(req.file.path, dest);

    // TODO: Upload to Google Drive here and return drive link.
    const fakeUrl = `/tmp/${encodeURIComponent(req.file.originalname)}`;
    return res.json({ file: req.file.originalname, url: fakeUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/assignments', express.json(), async (req, res) => {
  // minimal save stub — in production persist to DB
  const payload = req.body;
  // return created assignment id
  return res.json({ id: 'assign_' + Math.random().toString(36).slice(2,9), ...payload });
});

const port = process.env.PORT || 4002;
app.listen(port, () => console.log(`Assignments server listening on ${port}`));
