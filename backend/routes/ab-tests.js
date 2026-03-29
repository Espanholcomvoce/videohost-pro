const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const tests = await query('SELECT * FROM ab_tests ORDER BY created_at DESC');
    for (const test of tests.rows) {
      const variants = await query('SELECT * FROM ab_test_variants WHERE ab_test_id = $1', [test.id]);
      test.variants = variants.rows;
    }
    res.json(tests.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const test = await query('SELECT * FROM ab_tests WHERE id = $1', [req.params.id]);
    if (test.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
    const variants = await query('SELECT * FROM ab_test_variants WHERE ab_test_id = $1', [req.params.id]);
    res.json({ ...test.rows[0], variants: variants.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, variants } = req.body;
  if (!variants || variants.length < 2) return res.status(400).json({ error: 'Mínimo 2 variações' });

  const totalWeight = variants.reduce((sum, v) => sum + (v.traffic_weight || 0), 0);
  if (totalWeight !== 100) return res.status(400).json({ error: 'Pesos devem somar 100' });

  try {
    const test = await query('INSERT INTO ab_tests (name) VALUES ($1) RETURNING *', [name]);
    for (const v of variants) {
      await query(
        'INSERT INTO ab_test_variants (ab_test_id, video_id, variant_name, traffic_weight, utm_content) VALUES ($1,$2,$3,$4,$5)',
        [test.rows[0].id, v.video_id, v.variant_name, v.traffic_weight, v.utm_content || null]
      );
    }
    res.json(test.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, status } = req.body;
  try {
    const result = await query(
      'UPDATE ab_tests SET name=COALESCE($1,name), status=COALESCE($2,status), updated_at=NOW() WHERE id=$3 RETURNING *',
      [name, status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/variants', async (req, res) => {
  const { variants } = req.body;
  try {
    await query('DELETE FROM ab_test_variants WHERE ab_test_id = $1', [req.params.id]);
    for (const v of variants) {
      await query(
        'INSERT INTO ab_test_variants (ab_test_id, video_id, variant_name, traffic_weight, utm_content) VALUES ($1,$2,$3,$4,$5)',
        [req.params.id, v.video_id, v.variant_name, v.traffic_weight, v.utm_content || null]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM ab_tests WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
