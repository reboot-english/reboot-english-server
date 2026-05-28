import type { Response } from 'express';

// 统一响应信封：HTTP 状态码与 body.code 保持一致，message 用 HTTP 标准文本（可追加具体原因）。

export function success<T>(res: Response, data: T): void {
  res.status(200).json({ code: 200, message: 'OK', data });
}

// 客户端错误：始终返回 400。
export function badRequest(res: Response, error?: string): void {
  res.status(400).json({
    code: 400,
    message: error ? `Bad Request: ${error}` : 'Bad Request',
    data: null,
  });
}

// 前期统一按服务端错误处理：始终返回 500。
// error 可直接传 catch 到的异常，内部负责取出可读信息。
export function fail(res: Response, error?: unknown): void {
  const detail = error instanceof Error ? error.message : error ? String(error) : '';
  res.status(500).json({
    code: 500,
    message: detail ? `Internal Server Error: ${detail}` : 'Internal Server Error',
    data: null,
  });
}
