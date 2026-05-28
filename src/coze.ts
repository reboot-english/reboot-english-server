import { CozeAPI } from '@coze/api';
import { config } from './config.js';

// 全局共享的 Coze 客户端实例，供各 API 模块复用。
export const cozeClient = new CozeAPI({
  token: config.coze.token,
  baseURL: config.coze.baseURL,
});
