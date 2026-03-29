const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { video_id } = req.query;
  try {
    let result;
    if (video_id) {
      result = await query('SELECT * FROM pixels WHERE video_id = $1 OR video_id IS NULL ORDER BY created_at', [video_id]);
    } else {
      result = await query('SELECT * FROM pixels ORDER BY created_at');
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { video_id, pixel_type, pixel_id_or_url, events, enabled } = req.body;
  try {
    const result = await query(
      'INSERT INTO pixels (video_id, pixel_type, pixel_id_or_url, events, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [video_id || null, pixel_type, pixel_id_or_url, events || ['play', 'ended'], enabled !== false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { pixel_type, pixel_id_or_url, events, enabled } = req.body;
  try {
    const result = await query(
      'UPDATE pixels SET pixel_type=COALESCE($1,pixel_type), pixel_id_or_url=COALESCE($2,pixel_id_or_url), events=COALESCE($3,events), enabled=COALESCE($4,enabled) WHERE id=$5 RETURNING *',
      [pixel_type, pixel_id_or_url, events, enabled, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM pixels WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
