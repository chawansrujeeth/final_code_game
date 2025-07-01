// backend/api_server.js
// Main Express server mounting profile & friends routers.

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const profilesRouter = require('./profiles_api');
const friendsRouter = require('./friends_api');

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.use('/api/profile', profilesRouter);
app.use('/api/friends', friendsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API server listening on port ${PORT}`));
