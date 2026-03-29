const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');
const { startTranscoding } = require('../services/transcoder');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
const ACCEPTED_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

router.use(requireAuth);

router.post('/init', async (req, res) => {
  const { filename, fileSize, mimeType } = req.body;
  const ext = path.extname(filename).toLowerCase();

  if (!ACCEPTED_EXTS.includes(ext)) {
    return res.status(400).json({ error: `Formato não aceito. Use: ${ACCEPTED_EXTS.join(', ')}` });
  }
  if (fileSize > MAX_SIZE) {
    return res.status(400).json({ error: 'Arquivo excede limite de 2GB' });
  }

  try {
    const videoId = uuidv4();
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    await query(
      `INSERT INTO videos (id, title, original_filename, file_size_bytes, status) VALUES ($1, $2, $3, $4, 'uploading')`,
      [videoId, path.basename(filename, ext), filename, fileSize]
    );

    const uploadDir = path.join(process.cwd(), 'tmp', 'uploads', videoId);
    await fs.mkdir(uploadDir, { recursive: true });

    res.json({ videoId, chunkSize: CHUNK_SIZE, totalChunks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chunk/:videoId', upload.single('chunk'), async (req, res) => {
  const { videoId } = req.params;
  const chunkIndex = parseInt(req.query.index || req.headers['x-chunk-index'] || '0');

  try {
    const chunkPath = path.join(process.cwd(), 'tmp', 'uploads', videoId, `chunk_${String(chunkIndex).padStart(5, '0')}`);
    await fs.writeFile(chunkPath, req.file.buffer);
    res.json({ received: true, chunkIndex });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/complete/:videoId', async (req, res) => {
  const { videoId } = req.params;
  try {
    const uploadDir = path.join(process.cwd(), 'tmp', 'uploads', videoId);
    const chunks = (await fs.readdir(uploadDir)).filter(f => f.startsWith('chunk_')).sort();

    // Get original filename to determine extension
    const videoResult = await query('SELECT original_filename FROM videos WHERE id=$1', [videoId]);
    const ext = path.extname(videoResult.rows[0].original_filename).toLowerCase();
    const outputPath = path.join(uploadDir, `original${ext}`);

    // Combine chunks
    const writeStream = require('fs').createWriteStream(outputPath);
    for (const chunk of chunks) {
      const data = await fs.readFile(path.join(uploadDir, chunk));
      writeStream.write(data);
    }
    await new Promise(resolve => writeStream.end(resolve));

    // Delete chunk files
    for (const chunk of chunks) {
      await fs.unlink(path.join(uploadDir, chunk));
    }

    await query('UPDATE videos SET status=$1, updated_at=NOW() WHERE id=$2', ['pending', videoId]);

    // Start transcoding
    startTranscoding(videoId);

    res.json({ videoId, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:videoId', async (req, res) => {
  try {
    const result = await query('SELECT id, title, status, duration_seconds, thumbnail_url FROM videos WHERE id=$1', [req.params.videoId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vídeo não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
