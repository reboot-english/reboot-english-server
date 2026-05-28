import express, { type ErrorRequestHandler } from 'express';
import { badRequest, fail, success } from './response.js';
import { wordRouter } from './word.js';

export const app = express();

app.use(express.json());

// 健康检查 / 冒烟测试端点。
app.get('/ping', (_req, res) => {
  success(res, 'pong');
});

// 单词模块：/api/word/*
app.use('/api/word', wordRouter);

// 未匹配到任何路由：统一按客户端错误返回信封（暂不引入 404）。
app.use((_req, res) => {
  badRequest(res, 'unknown endpoint');
});

// 全局错误兜底：任何路由里未捕获的异常都收敛成统一的 500 信封。
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  fail(res, err);
};
app.use(errorHandler);
