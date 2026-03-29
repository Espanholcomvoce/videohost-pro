const { query } = require('../db/queries');

async function domainCheck(req, res, next) {
  const origin = req.headers.origin || req.headers.referer || '';
  let hostname = '';
  try {
    hostname = new URL(origin).hostname;
  } catch {
    hostname = origin.replace(/https?:\/\//, '').split('/')[0].split(':')[0];
  }

  // Always allow localhost
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return next();
  }

  const videoId = req.params.videoId || req.query.videoId;
  try {
    // Check global domains + video-specific domains
    const result = await query(
      `SELECT id FROM allowed_domains WHERE (video_id IS NULL OR video_id = $1) AND domain = $2 LIMIT 1`,
      [videoId, hostname]
    );
    // If no domains configured at all, allow (open access)
    const countResult = await query(
      `SELECT COUNT(*) as cnt FROM allowed_domains WHERE video_id IS NULL OR video_id = $1`,
      [videoId]
    );
    if (parseInt(countResult.rows[0].cnt) === 0) return next();
    if (result.rows.length > 0) return next();
    return res.status(403).json({ error: 'Domínio não autorizado' });
  } catch (err) {
    console.error('Domain check error:', err);
    return next(); // Fail open to avoid blocking on DB errors
  }
}

module.exports = domainCheck;
