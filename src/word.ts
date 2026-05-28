import { Router } from 'express';
import type { Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { cozeClient } from './coze.js';
import { config } from './config.js';
import { pool } from './db.js';
import { badRequest, fail, success } from './response.js';

export const wordRouter = Router();

interface AudioRow extends RowDataPacket {
  audio: Buffer;
  mime: string;
}

// 把音频字节流回给客户端（媒体接口不套信封）。
function sendAudio(res: Response, audio: Buffer, mime: string): void {
  res.set('Content-Type', mime);
  res.send(audio);
}

// GET /api/word/getAudio?word=apple
// 读穿透缓存：先查库，命中直接返回；未命中则调工作流生成、存库、再返回。
wordRouter.get('/getAudio', async (req, res) => {
  const raw = typeof req.query.word === 'string' ? req.query.word.trim() : '';
  if (!raw) {
    return badRequest(res, 'word is required');
  }
  const word = raw.toLowerCase();

  try {
    // 1. 查缓存。命中直接返回。
    const [rows] = await pool.query<AudioRow[]>(
      'SELECT audio, mime FROM word_audio WHERE word = ?',
      [word],
    );
    if (rows.length > 0) {
      return sendAudio(res, rows[0].audio, rows[0].mime);
    }

    // 2. 未命中：调用工作流，拿到一个带签名、会过期的 mp3 链接。
    const run = await cozeClient.workflows.runs.create({
      workflow_id: config.coze.workflowWordGetAudio,
      parameters: { word },
    });
    const link = JSON.parse(run.data)?.link as string | undefined;
    if (!link) {
      return fail(res, 'workflow did not return an audio link');
    }

    // 3. 下载 mp3 字节（链接会过期，所以由后端取回再转发）。
    const audioRes = await fetch(link);
    if (!audioRes.ok) {
      return fail(res, `failed to download audio: ${audioRes.status}`);
    }
    const mime = audioRes.headers.get('content-type') ?? 'audio/mpeg';
    const audio = Buffer.from(await audioRes.arrayBuffer());

    // 4. 存库（并发下重复写时忽略唯一冲突），再返回。
    await pool.query(
      'INSERT INTO word_audio (word, audio, mime) VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE id = id',
      [word, audio, mime],
    );
    sendAudio(res, audio, mime);
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/word/lookup?word=apple
// 查词：调用工作流返回单词的音标、词性、释义等结构化信息（暂不缓存）。
wordRouter.get('/lookup', async (req, res) => {
  const word = typeof req.query.word === 'string' ? req.query.word.trim() : '';
  if (!word) {
    return badRequest(res, 'word is required');
  }

  try {
    // 工作流的输入参数名为 raw（对外仍统一用 word）。
    const run = await cozeClient.workflows.runs.create({
      workflow_id: config.coze.workflowWordLookup,
      parameters: { raw: word },
    });

    const result = JSON.parse(run.data)?.result;
    if (!result) {
      return fail(res, 'workflow did not return a lookup result');
    }
    success(res, result);
  } catch (err) {
    fail(res, err);
  }
});
