import mysql from 'mysql2/promise';
import { config } from './config.js';

// 全局共享的 MySQL 连接池，供各 API 模块复用。
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
});
