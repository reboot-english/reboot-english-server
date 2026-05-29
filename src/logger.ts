import type { RequestHandler } from 'express';

// 访问日志中间件：每个请求在响应结束时打一行，含方法、路径、状态码、耗时。
// 挂在 res 'finish' 上而非同步打印，确保拿到最终状态码（含路由内改写的状态）。
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ` +
        `${res.statusCode} ${ms.toFixed(1)}ms`,
    );
  });
  next();
};
