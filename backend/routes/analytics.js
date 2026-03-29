const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../db/queries');
const { lookup } = require('../services/geoip');
const { v4: uuidv4 } = require('uuid');

// Public endpoint — called from player embed
router.post('/event', async (req, res) => {
  const { videoId, sessionId, visitorId, currentTime, percentWatched, isPlaying, eventType, metadata } = req.body;
  if (!videoId || !sessionId || !eventType) return res.status(400).json({ error: 'Missing fields' });

  try {
    // Check if session exists
    const existing = await query('SELECT id FROM analytics_sessions WHERE id = $1', [sessionId]);

    if (existing.rows.length === 0) {
      // Create session
      const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
      const geo = lookup(ip);
      const ua = req.headers['user-agent'] || '';
      const referer = req.headers.referer || metadata?.referer || '';

      // Parse device
      let device_type = 'desktop';
      if (/mobile|android|iphone|ipad/i.test(ua)) device_type = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';

      // Parse browser
      let browser = 'Other';
      if (/chrome/i.test(ua) && !/edge/i.test(ua)) browser = 'Chrome';
      else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
      else if (/firefox/i.test(ua)) browser = 'Firefox';
      else if (/edge/i.test(ua)) browser = 'Edge';

      // Parse OS
      let os = 'Other';
      if (/windows/i.test(ua)) os = 'Windows';
      else if (/mac/i.test(ua)) os = 'macOS';
      else if (/linux/i.test(ua)) os = 'Linux';
      else if (/android/i.test(ua)) os = 'Android';
      else if (/iphone|ipad/i.test(ua)) os = 'iOS';

      await query(`
        INSERT INTO analytics_sessions (id, video_id, visitor_id, ip_address, country, region, city, device_type, browser, os, referer_url, utm_source, utm_medium, utm_campaign, utm_content)
        VALUES ($1,$2,$3,$4::inet,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [
        sessionId, videoId, visitorId || 'anonymous',
        ip || null, geo.country, geo.region, geo.city,
        device_type, browser, os, referer,
        metadata?.utm_source || null, metadata?.utm_medium || null,
        metadata?.utm_campaign || null, metadata?.utm_content || null
      ]);
    }

    // Insert event
    await query(`
      INSERT INTO analytics_events (session_id, video_id, event_type, current_time_seconds, percent_watched, metadata)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [sessionId, videoId, eventType, currentTime || 0, percentWatched || 0, metadata ? JSON.stringify(metadata) : null]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Analytics event error:', err);
    res.json({ ok: true }); // Don't fail the player
  }
});

// Protected endpoints
router.get('/video/:videoId/overview', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  const { start_date, end_date, device, country, utm_source, variant_id } = req.query;

  let dateFilter = '';
  const params = [videoId];
  let idx = 2;

  if (start_date) { dateFilter += ` AND s.started_at >= $${idx++}`; params.push(start_date); }
  if (end_date) { dateFilter += ` AND s.started_at <= $${idx++}`; params.push(end_date); }
  if (device) { dateFilter += ` AND s.device_type = $${idx++}`; params.push(device); }
  if (country) { dateFilter += ` AND s.country = $${idx++}`; params.push(country); }
  if (utm_source) { dateFilter += ` AND s.utm_source = $${idx++}`; params.push(utm_source); }

  try {
    const result = await query(`
      WITH session_stats AS (
        SELECT s.id as sid, s.visitor_id,
          MAX(e.current_time_seconds) as max_time,
          MAX(e.percent_watched) as max_percent,
          BOOL_OR(e.event_type = 'play') as has_play,
          BOOL_OR(e.event_type = 'cta_click') as has_cta_click,
          BOOL_OR(e.event_type = 'cta_shown') as has_cta_shown,
          BOOL_OR(e.event_type = 'unmute') as has_unmute
        FROM analytics_sessions s
        LEFT JOIN analytics_events e ON e.session_id = s.id
        WHERE s.video_id = $1 ${dateFilter}
        GROUP BY s.id, s.visitor_id
      )
      SELECT
        COUNT(*) as total_loads,
        COUNT(*) FILTER (WHERE has_play) as total_plays,
        COUNT(DISTINCT visitor_id) FILTER (WHERE has_play) as unique_viewers,
        ROUND(AVG(max_time) FILTER (WHERE has_play), 1) as avg_watch_time,
        ROUND(100.0 * COUNT(*) FILTER (WHERE max_percent >= 95) / NULLIF(COUNT(*) FILTER (WHERE has_play), 0), 1) as completion_rate,
        COUNT(*) FILTER (WHERE has_cta_click) as cta_clicks,
        COUNT(*) FILTER (WHERE has_cta_shown) as cta_shown_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE has_unmute) / NULLIF(COUNT(*) FILTER (WHERE has_play), 0), 1) as unmute_rate
      FROM session_stats
    `, params);

    const row = result.rows[0];
    row.play_rate = row.total_loads > 0 ? Math.round(100 * row.total_plays / row.total_loads * 10) / 10 : 0;
    row.cta_rate = row.cta_shown_count > 0 ? Math.round(100 * row.cta_clicks / row.cta_shown_count * 10) / 10 : 0;
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/video/:videoId/retention', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  const { start_date, end_date } = req.query;
  try {
    // Get video duration
    const vid = await query('SELECT duration_seconds FROM videos WHERE id=$1', [videoId]);
    if (vid.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
    const duration = Math.ceil(vid.rows[0].duration_seconds);

    let dateFilter = '';
    const params = [videoId];
    if (start_date) { dateFilter += ' AND s.started_at >= $2'; params.push(start_date); }
    if (end_date) { dateFilter += ` AND s.started_at <= $${params.length + 1}`; params.push(end_date); }

    const result = await query(`
      SELECT s.id, MAX(e.current_time_seconds) as max_time
      FROM analytics_sessions s
      JOIN analytics_events e ON e.session_id = s.id
      WHERE s.video_id = $1 AND e.event_type IN ('heartbeat','play','ended') ${dateFilter}
      GROUP BY s.id
    `, params);

    const totalSessions = result.rows.length;
    if (totalSessions === 0) return res.json([]);

    const retention = [];
    for (let sec = 0; sec <= duration; sec += Math.max(1, Math.floor(duration / 200))) {
      const viewersAtSecond = result.rows.filter(r => r.max_time >= sec).length;
      retention.push({ second: sec, viewers_percent: Math.round(100 * viewersAtSecond / totalSessions * 10) / 10 });
    }
    res.json(retention);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/video/:videoId/heatmap', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  try {
    const result = await query(`
      SELECT FLOOR(current_time_seconds) as second, COUNT(*) as cnt
      FROM analytics_events
      WHERE video_id = $1 AND event_type = 'heartbeat'
      GROUP BY FLOOR(current_time_seconds)
      ORDER BY second
    `, [videoId]);

    const maxCnt = Math.max(...result.rows.map(r => parseInt(r.cnt)), 1);
    const heatmap = result.rows.map(r => ({
      second: parseInt(r.second),
      intensity: Math.round(parseInt(r.cnt) / maxCnt * 100) / 100
    }));
    res.json(heatmap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/video/:videoId/funnel', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  try {
    const result = await query(`
      SELECT
        COUNT(DISTINCT s.id) as loaded,
        COUNT(DISTINCT s.id) FILTER (WHERE e.event_type = 'play') as played,
        COUNT(DISTINCT s.id) FILTER (WHERE e.percent_watched >= 50) as reached_50,
        COUNT(DISTINCT s.id) FILTER (WHERE e.event_type = 'cta_shown') as cta_shown,
        COUNT(DISTINCT s.id) FILTER (WHERE e.event_type = 'cta_click') as cta_clicked
      FROM analytics_sessions s
      LEFT JOIN analytics_events e ON e.session_id = s.id
      WHERE s.video_id = $1
    `, [videoId]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/video/:videoId/audience', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  try {
    const [countries, devices, browsers, referers, hourly] = await Promise.all([
      query(`SELECT country, COUNT(*) as count FROM analytics_sessions WHERE video_id=$1 AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 20`, [videoId]),
      query(`SELECT device_type, COUNT(*) as count FROM analytics_sessions WHERE video_id=$1 GROUP BY device_type`, [videoId]),
      query(`SELECT browser, COUNT(*) as count FROM analytics_sessions WHERE video_id=$1 GROUP BY browser ORDER BY count DESC LIMIT 10`, [videoId]),
      query(`SELECT SUBSTRING(referer_url FROM '://([^/]+)') as domain, COUNT(*) as count FROM analytics_sessions WHERE video_id=$1 AND referer_url IS NOT NULL GROUP BY domain ORDER BY count DESC LIMIT 10`, [videoId]),
      query(`SELECT EXTRACT(HOUR FROM started_at) as hour, COUNT(*) as count FROM analytics_sessions WHERE video_id=$1 GROUP BY hour ORDER BY hour`, [videoId])
    ]);

    res.json({
      countries: countries.rows,
      devices: devices.rows.reduce((acc, r) => { acc[r.device_type] = parseInt(r.count); return acc; }, {}),
      browsers: browsers.rows,
      referers: referers.rows,
      hourly_plays: hourly.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/video/:videoId/traffic', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  try {
    const result = await query(`
      SELECT utm_source, utm_medium, utm_campaign, utm_content,
        COUNT(*) as sessions,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.session_id = s.id AND e.event_type='play')) as plays
      FROM analytics_sessions s
      WHERE video_id = $1 AND (utm_source IS NOT NULL OR utm_medium IS NOT NULL)
      GROUP BY utm_source, utm_medium, utm_campaign, utm_content
      ORDER BY sessions DESC
    `, [videoId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/video/:videoId/export', requireAuth, async (req, res) => {
  const { videoId } = req.params;
  const { start_date, end_date } = req.query;
  try {
    let dateFilter = '';
    const params = [videoId];
    if (start_date) { dateFilter += ' AND e.created_at >= $2'; params.push(start_date); }
    if (end_date) { dateFilter += ` AND e.created_at <= $${params.length + 1}`; params.push(end_date); }

    const result = await query(`
      SELECT e.session_id, s.visitor_id, e.event_type, e.current_time_seconds, e.percent_watched,
        s.country, s.device_type, s.browser, s.utm_source, e.created_at
      FROM analytics_events e
      JOIN analytics_sessions s ON s.id = e.session_id
      WHERE e.video_id = $1 ${dateFilter}
      ORDER BY e.created_at
    `, params);

    const headers = 'session_id,visitor_id,event_type,current_time,percent_watched,country,device,browser,utm_source,created_at\n';
    const csv = headers + result.rows.map(r =>
      `${r.session_id},${r.visitor_id},${r.event_type},${r.current_time_seconds},${r.percent_watched},${r.country},${r.device_type},${r.browser},${r.utm_source || ''},${r.created_at}`
    ).join('\n');

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename=analytics_${videoId}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
