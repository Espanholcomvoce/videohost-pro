const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');
const { deleteR2Folder } = require('../services/r2');
const { v4: uuidv4 } = require('uuid');

router.use(requireAuth);

// Registro de video pre-procesado localmente (sin transcoding en el servidor)
router.post('/register', async (req, res) => {
  try {
    const { videoId, title, r2_path, hls_master_url, thumbnail_url, duration_seconds, file_size_bytes } = req.body;
    if (!videoId || !title || !r2_path || !hls_master_url) {
      return res.status(400).json({ error: 'Campos obrigatórios: videoId, title, r2_path, hls_master_url' });
    }

    await query(
      `INSERT INTO videos (id, title, status, r2_path, hls_master_url, thumbnail_url, duration_seconds, file_size_bytes)
       VALUES ($1, $2, 'ready', $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET status='ready', hls_master_url=$4, thumbnail_url=$5, duration_seconds=$6, updated_at=NOW()`,
      [videoId, title, r2_path, hls_master_url, thumbnail_url || null, duration_seconds || null, file_size_bytes || null]
    );

    const defaultConfig = {
      autoplay: true, smart_autoplay: true, muted: true, loop: false,
      progress_bar_mode: 'none', show_time: false,
      focused_fullscreen: false, seek_disabled: false, seek_disabled_until_seconds: 0,
      skip_warning_text: 'Não pule! A parte mais importante está chegando',
      cta_enabled: false, cta_text: '', cta_url: '', cta_color: '#6C5CE7',
      cta_time_seconds: 0, cta_behavior: 'new_tab',
      continue_watching_enabled: true, fake_views_count: 0, fake_comments: [],
      show_controls: true, skin: 'dark', primary_color: '#6C5CE7',
      speed_rates: [0.75, 1, 1.25, 1.5, 2], show_volume: true
    };
    await query(
      `INSERT INTO video_configs (video_id, config) VALUES ($1, $2) ON CONFLICT (video_id) DO NOTHING`,
      [videoId, JSON.stringify(defaultConfig)]
    );

    res.json({ videoId, status: 'ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const { folder_id, status, search, page = 1, limit = 20, include_deleted } = req.query;
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];
  let idx = 1;

  if (!include_deleted) {
    where.push(`v.deleted_at IS NULL`);
  }
  if (folder_id) { where.push(`v.folder_id = $${idx++}`); params.push(folder_id); }
  if (status) { where.push(`v.status = $${idx++}`); params.push(status); }
  if (search) { where.push(`v.title ILIKE $${idx++}`); params.push(`%${search}%`); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const countResult = await query(`SELECT COUNT(*) as total FROM videos v ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(limit);
    params.push(offset);
    const result = await query(`
      SELECT v.*,
        (SELECT COUNT(*) FROM analytics_events ae JOIN analytics_sessions s ON ae.session_id=s.id WHERE s.video_id=v.id AND ae.event_type='play') as views
      FROM videos v ${whereClause}
      ORDER BY v.created_at DESC LIMIT $${idx++} OFFSET $${idx++}
    `, params);

    res.json({ videos: result.rows, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trash', async (req, res) => {
  try {
    const result = await query('SELECT * FROM videos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT v.*, vc.config
      FROM videos v
      LEFT JOIN video_configs vc ON vc.video_id = v.id
      WHERE v.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vídeo não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { title, description, folder_id } = req.body;
  try {
    const result = await query(
      'UPDATE videos SET title=COALESCE($1,title), description=COALESCE($2,description), folder_id=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [title, description, folder_id || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/config', async (req, res) => {
  const config = req.body;
  try {
    const result = await query(`
      INSERT INTO video_configs (video_id, config) VALUES ($1, $2)
      ON CONFLICT (video_id) DO UPDATE SET config = $2, updated_at = NOW()
      RETURNING *
    `, [req.params.id, JSON.stringify(config)]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  try {
    const original = await query('SELECT * FROM videos WHERE id=$1', [req.params.id]);
    if (original.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
    const v = original.rows[0];
    const newId = uuidv4();

    await query(
      `INSERT INTO videos (id, title, description, folder_id, status, duration_seconds, file_size_bytes, r2_path, thumbnail_url, hls_master_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [newId, v.title + ' (cópia)', v.description, v.folder_id, v.status, v.duration_seconds, v.file_size_bytes, v.r2_path, v.thumbnail_url, v.hls_master_url]
    );

    // Copy config
    const configResult = await query('SELECT config FROM video_configs WHERE video_id=$1', [req.params.id]);
    if (configResult.rows.length > 0) {
      await query('INSERT INTO video_configs (video_id, config) VALUES ($1, $2)', [newId, JSON.stringify(configResult.rows[0].config)]);
    }

    res.json({ id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('UPDATE videos SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    await query('UPDATE videos SET deleted_at=NULL, updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/permanent', async (req, res) => {
  try {
    const v = await query('SELECT r2_path FROM videos WHERE id=$1', [req.params.id]);
    if (v.rows.length > 0 && v.rows[0].r2_path) {
      await deleteR2Folder(v.rows[0].r2_path);
    }
    await query('DELETE FROM videos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
