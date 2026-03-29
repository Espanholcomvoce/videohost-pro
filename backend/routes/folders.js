const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT f.*, COUNT(v.id) as video_count
      FROM folders f
      LEFT JOIN videos v ON v.folder_id = f.id AND v.deleted_at IS NULL
      GROUP BY f.id ORDER BY f.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, parent_id } = req.body;
  try {
    const result = await query(
      'INSERT INTO folders (name, parent_id) VALUES ($1, $2) RETURNING *',
      [name, parent_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await query(
      'UPDATE folders SET name=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [name, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const videos = await query('SELECT COUNT(*) as cnt FROM videos WHERE folder_id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (parseInt(videos.rows[0].cnt) > 0) {
      return res.status(400).json({ error: 'Pasta contém vídeos. Mova-os antes de excluir.' });
    }
    await query('DELETE FROM folders WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
