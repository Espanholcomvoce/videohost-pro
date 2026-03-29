const { query } = require('../db/queries');
const https = require('https');
const http = require('http');

async function cleanupOldEvents(days = 90) {
  const result = await query(
    'DELETE FROM analytics_events WHERE created_at < NOW() - $1::interval',
    [`${days} days`]
  );
  return result.rowCount;
}

async function getDailyDigest(videoId, date) {
  const startDate = date || new Date().toISOString().split('T')[0];
  const endDate = new Date(new Date(startDate).getTime() + 86400000).toISOString().split('T')[0];

  const overview = await query(`
    SELECT
      COUNT(DISTINCT s.id) FILTER (WHERE e.event_type = 'play') as total_plays,
      COUNT(DISTINCT s.visitor_id) FILTER (WHERE e.event_type = 'play') as unique_viewers,
      ROUND(AVG(max_time), 1) as avg_watch_time,
      COUNT(DISTINCT s.id) FILTER (WHERE e.event_type = 'cta_click') as cta_clicks
    FROM analytics_sessions s
    LEFT JOIN LATERAL (
      SELECT MAX(current_time_seconds) as max_time FROM analytics_events WHERE session_id = s.id
    ) mt ON true
    LEFT JOIN analytics_events e ON e.session_id = s.id
    WHERE s.video_id = $1 AND s.started_at >= $2 AND s.started_at < $3
  `, [videoId, startDate, endDate]);

  return { videoId, date: startDate, ...overview.rows[0] };
}

async function sendWebhookDigest(webhookUrl, videoId) {
  const digest = await getDailyDigest(videoId);
  const data = JSON.stringify(digest);
  const url = new URL(webhookUrl);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = { cleanupOldEvents, getDailyDigest, sendWebhookDigest };
