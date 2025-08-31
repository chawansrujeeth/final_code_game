// backend/middleware/index.js
// Export all middleware modules

module.exports = {
  auth: require('./auth'),
  error: require('./error'),
  logging: require('./logging'),
  rateLimit: require('./rateLimit')
};
