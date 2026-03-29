const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM allowed_domains ORDER BY domain');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { domain, video_id } = req.body;
  try {
    const result = await query(
      'INSERT INTO allowed_domains (domain, video_id) VALUES ($1, $2) RETURNING *',
      [domain, video_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM allowed_domains WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
