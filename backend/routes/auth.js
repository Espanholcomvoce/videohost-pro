const router = require('express').Router();
const { login, requireAuth, logout } = require('../middleware/auth');

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, (req, res) => {
  res.json({ authenticated: true, user: req.user.user });
});

module.exports = router;
