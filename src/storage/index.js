// src/storage/index.js
// Storage module exports

const { getDb, closeDb, DB_PATH } = require('./db');
const models = require('./models');

module.exports = {
  getDb,
  closeDb,
  DB_PATH,
  ...models
};
