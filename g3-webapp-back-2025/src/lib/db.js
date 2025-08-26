import { Pool } from 'pg';

const pool = new Pool({
  user: 'g3db_app',
  host: '10.100.54.170',
  database: 'g3db',
  password: 'g3',
  port: 5432,
});

export default {
  query: (text, params) => pool.query(text, params),
};