// backend/routes/index.js
// Export all route modules

module.exports = {
  api: null, // Placeholder - implement general API routes  
  auth: require('./auth'),
  profile: require('./profile'),
  friends: require('./friends'),
  games: null // Placeholder - implement game routes
};
