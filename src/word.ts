import { Router } from 'express';
import { cozeClient } from './coze.js';
import { config } from './config.js';
import { badRequest, fail } from './response.js';

export const wordRouter = Router();

// GET /api/word/getAudio?word=apple
// 媒体接口：成功直接返回 mp3 字节流，仅出错时返回 JSON 信封。
wordRouter.get('/getAudio', async (req, res) => {
  const word = typeof req.query.word === 'string' ? req.query.word.trim() : '';
  if (!word) {
    return badRequest(res, 'word is required');
  }

  try {
    // 1. 调用工作流，拿到一个带签名、会过期的 mp3 链接。
    const run = await cozeClient.workflows.runs.create({
      workflow_id: config.coze.workflowWordGetAudio,
      parameters: { word },
    });

    const link = JSON.parse(run.data)?.link as string | undefined;
    if (!link) {
      return fail(res, 'workflow did not return an audio link');
    }

    // 2. 下载 mp3 字节（链接会过期，所以由后端取回再转发）。
    const audioRes = await fetch(link);
    if (!audioRes.ok) {
      return fail(res, `failed to download audio: ${audioRes.status}`);
    }
    const buffer = Buffer.from(await audioRes.arrayBuffer());

    // 3. 直接把字节流回给客户端。
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (err) {
    fail(res, err);
  }
});
