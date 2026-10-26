const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const routes = require('./routes');
const { ensureDatabase } = require('./db/bootstrap');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = clientOrigins.includes('*')
  ? { origin: true }
  : { origin: clientOrigins, credentials: true };

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(async (req, res, next) => {
  try {
    await ensureDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use('/api', routes);

app.get('/', (req, res) =>
  res.type('text/plain').send('UMUHINZI CONNECT API IS RUNNING')
);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
