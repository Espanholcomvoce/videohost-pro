const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');

router.use(requireAuth);

router.get('/:videoId', async (req, res) => {
  try {
    const result = await query('SELECT * FROM traffic_filters WHERE video_id = $1 ORDER BY priority DESC', [req.params.videoId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { video_id, rule_type, rule_value, redirect_video_id, priority } = req.body;
  try {
    const result = await query(
      'INSERT INTO traffic_filters (video_id, rule_type, rule_value, redirect_video_id, priority) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [video_id, rule_type, rule_value, redirect_video_id, priority || 0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { rule_type, rule_value, redirect_video_id, priority } = req.body;
  try {
    const result = await query(
      'UPDATE traffic_filters SET rule_type=COALESCE($1,rule_type), rule_value=COALESCE($2,rule_value), redirect_video_id=COALESCE($3,redirect_video_id), priority=COALESCE($4,priority) WHERE id=$5 RETURNING *',
      [rule_type, rule_value, redirect_video_id, priority, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM traffic_filters WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
