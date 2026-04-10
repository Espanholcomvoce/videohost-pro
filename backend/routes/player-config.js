const router = require('express').Router();
const { query } = require('../db/queries');
const { getR2PublicUrl } = require('../services/r2');
const domainCheck = require('../middleware/domain-check');

router.get('/:videoId', domainCheck, async (req, res) => {
  try {
    const { videoId } = req.params;

    // Check for A/B test
    let resolvedVideoId = videoId;
    const abResult = await query(`
      SELECT atv.*, at2.status FROM ab_test_variants atv
      JOIN ab_tests at2 ON at2.id = atv.ab_test_id
      WHERE atv.video_id = $1 AND at2.status = 'active'
      LIMIT 1
    `, [videoId]);

    if (abResult.rows.length > 0) {
      // Check cookie for existing assignment
      const abCookie = req.cookies?.[`ab_${abResult.rows[0].ab_test_id}`];
      if (abCookie) {
        resolvedVideoId = abCookie;
      } else {
        // Get all variants for this test
        const variants = await query(
          'SELECT * FROM ab_test_variants WHERE ab_test_id = $1 ORDER BY created_at',
          [abResult.rows[0].ab_test_id]
        );
        // Weighted random selection
        const rand = Math.random() * 100;
        let cumulative = 0;
        for (const v of variants.rows) {
          cumulative += v.traffic_weight;
          if (rand <= cumulative) {
            resolvedVideoId = v.video_id;
            res.cookie(`ab_${v.ab_test_id}`, v.video_id, { maxAge: 30 * 24 * 60 * 60 * 1000 });
            break;
          }
        }
      }
    }

    const result = await query(`
      SELECT v.id, v.title, v.duration_seconds, v.status, v.hls_master_url, v.thumbnail_url, vc.config
      FROM videos v
      LEFT JOIN video_configs vc ON vc.video_id = v.id
      WHERE v.id = $1 AND v.status = 'ready' AND v.deleted_at IS NULL
    `, [resolvedVideoId]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Vídeo não encontrado' });

    const video = result.rows[0];
    const config = video.config || {};

    // Use public R2 URLs (bucket has public access enabled)
    const hlsUrl = video.hls_master_url ? getR2PublicUrl(video.hls_master_url) : null;
    const thumbnailUrl = video.thumbnail_url;

    // Get pixels
    const pixels = await query(
      'SELECT * FROM pixels WHERE (video_id = $1 OR video_id IS NULL) AND enabled = true',
      [resolvedVideoId]
    );

    // Check traffic filters
    const filters = await query(
      'SELECT * FROM traffic_filters WHERE video_id = $1 ORDER BY priority DESC',
      [resolvedVideoId]
    );

    res.json({
      videoId: video.id,
      title: video.title,
      duration: video.duration_seconds,
      status: video.status,
      hlsUrl,
      thumbnailUrl,
      segmentBaseUrl: `${process.env.R2_PUBLIC_URL}/videos/${resolvedVideoId}`,
      ...config,
      pixels: pixels.rows,
      trafficFilters: filters.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy HLS segments through signed URLs
router.get('/:videoId/segment/*', domainCheck, async (req, res) => {
  try {
    const { videoId } = req.params;
    const segmentPath = req.params[0]; // e.g., "720p/segment_001.ts" or "720p/playlist.m3u8"
    const key = `videos/${videoId}/${segmentPath}`;
    const signedUrl = await getSignedR2Url(key, 3600);

    res.set('Cache-Control', 'public, max-age=3600');
    res.redirect(302, signedUrl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
