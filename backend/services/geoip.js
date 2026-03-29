const geoip = require('geoip-lite');

function lookup(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return { country: 'Local', region: '', city: '' };
  }
  const geo = geoip.lookup(ip);
  if (!geo) return { country: 'Unknown', region: '', city: '' };
  return { country: geo.country || 'Unknown', region: geo.region || '', city: geo.city || '' };
}

module.exports = { lookup };
