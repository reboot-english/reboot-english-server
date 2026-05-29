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

interface LookupRow extends RowDataPacket {
  result: unknown; // JSON 列，mysql2 会自动解析为对象
}

interface AliasRow extends RowDataPacket {
  word: string;
}

interface FavoriteRow extends RowDataPacket {
  word: string;
}

interface WordRow extends RowDataPacket {
  word: string;
}

// 从请求体取 word 并归一化（trim + 小写，与 getAudio 一致）；缺失返回 ''。
function normalizeBodyWord(body: unknown): string {
  const raw = (body as { word?: unknown })?.word;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

// 把音频字节流回给客户端（媒体接口不套信封）。
function sendAudio(res: Response, audio: Buffer, mime: string): void {
  res.set('Content-Type', mime);
  res.send(audio);
}

// 调用查词工作流，返回 result 对象（无结果则 null）。工作流输入参数名为 raw。
async function runLookup(input: string): Promise<Record<string, unknown> | null> {
  const run = await cozeClient.workflows.runs.create({
    workflow_id: config.coze.workflowWordLookup,
    parameters: { raw: input },
  });
  return JSON.parse(run.data)?.result ?? null;
}

// 按规范词读 word_lookup 缓存，命中返回 result 对象，否则 null。
async function findLookup(word: string): Promise<unknown | null> {
  const [rows] = await pool.query<LookupRow[]>(
    'SELECT result FROM word_lookup WHERE word = ?',
    [word],
  );
  return rows.length > 0 ? rows[0].result : null;
}

// 回填缓存：规范词结果写 word_lookup；输入与规范词不同时写 word_alias 映射。
// 两表均用 upsert，已存在则忽略（去重 + 防并发冲突）。
async function saveLookup(raw: string, word: string, result: unknown): Promise<void> {
  await pool.query(
    'INSERT INTO word_lookup (word, result) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id',
    [word, JSON.stringify(result)],
  );
  if (word && word !== raw) {
    await pool.query(
      'INSERT INTO word_alias (raw, word) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id',
      [raw, word],
    );
  }
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
// 两级读穿透缓存：word_alias（输入词 → 规范词）+ word_lookup（规范词 → 结果）。
wordRouter.get('/lookup', async (req, res) => {
  const input = typeof req.query.word === 'string' ? req.query.word.trim() : '';
  if (!input) {
    return badRequest(res, 'word is required');
  }
  const raw = input.toLowerCase();

  try {
    // 1. 查 word_alias[raw]。
    const [aliases] = await pool.query<AliasRow[]>(
      'SELECT word FROM word_alias WHERE raw = ?',
      [raw],
    );
    if (aliases.length > 0) {
      const word = aliases[0].word;
      const cached = await findLookup(word);
      if (cached) {
        return success(res, cached); // alias + lookup 双命中
      }
      // 数据异常：alias 存在但 lookup 缺失，用规范词补一次工作流。
      const result = await runLookup(word);
      if (!result) {
        return fail(res, 'workflow did not return a lookup result');
      }
      await saveLookup(raw, word, result);
      return success(res, result);
    }

    // 2. alias 未命中，再直接查 word_lookup[raw]（raw 可能本身就是规范词）。
    const direct = await findLookup(raw);
    if (direct) {
      return success(res, direct);
    }

    // 3. 都没有：拿 raw 调工作流，回填缓存。
    const result = await runLookup(raw);
    if (!result) {
      return fail(res, 'workflow did not return a lookup result');
    }
    const word = String(result.word ?? '').trim().toLowerCase() || raw;
    await saveLookup(raw, word, result);
    success(res, result);
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/word/favorite  body: { word }
// 收藏单词（全局，暂不分用户）。幂等：重复收藏走 upsert，已存在则忽略。
wordRouter.post('/favorite', async (req, res) => {
  const word = normalizeBodyWord(req.body);
  if (!word) {
    return badRequest(res, 'word is required');
  }

  try {
    await pool.query(
      'INSERT INTO word_favorite (word) VALUES (?) ON DUPLICATE KEY UPDATE id = id',
      [word],
    );
    success(res, { word, favorited: true });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/word/unfavorite  body: { word }
// 取消收藏。幂等：没收藏过也返回成功（删除 0 行同样视为成功）。
wordRouter.post('/unfavorite', async (req, res) => {
  const word = normalizeBodyWord(req.body);
  if (!word) {
    return badRequest(res, 'word is required');
  }

  try {
    await pool.query('DELETE FROM word_favorite WHERE word = ?', [word]);
    success(res, { word, favorited: false });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/word/isFavorite?word=apple
// 查询单词是否已收藏，供客户端渲染收藏按钮初始态。
wordRouter.get('/isFavorite', async (req, res) => {
  const word = typeof req.query.word === 'string' ? req.query.word.trim().toLowerCase() : '';
  if (!word) {
    return badRequest(res, 'word is required');
  }

  try {
    const [rows] = await pool.query<FavoriteRow[]>(
      'SELECT word FROM word_favorite WHERE word = ?',
      [word],
    );
    success(res, { word, favorited: rows.length > 0 });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/word/listFavorite
// 返回所有收藏的单词，按收藏逆序（最近收藏在前）。
// 用 id DESC 而非 created_at DESC：id 自增严格单调，避免同秒并列时顺序不稳。
wordRouter.get('/listFavorite', async (_req, res) => {
  try {
    const [rows] = await pool.query<FavoriteRow[]>(
      'SELECT word FROM word_favorite ORDER BY id DESC',
    );
    success(res, rows.map((r) => r.word));
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/word/list
// 返回数据库里所有查过的单词（word_lookup），按保存逆序（id DESC，最近在前）。
wordRouter.get('/list', async (_req, res) => {
  try {
    const [rows] = await pool.query<WordRow[]>(
      'SELECT word FROM word_lookup ORDER BY id DESC',
    );
    success(res, rows.map((r) => r.word));
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/word/listAudio
// 返回所有有发音的单词（word_audio），按保存逆序（id DESC，最近在前）。
wordRouter.get('/listAudio', async (_req, res) => {
  try {
    const [rows] = await pool.query<WordRow[]>(
      'SELECT word FROM word_audio ORDER BY id DESC',
    );
    success(res, rows.map((r) => r.word));
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/word/deleteAudio  body: { word }
// 删除单词发音（word_audio）。直接按传入的 word 精确删除，不做 trim/小写归一化，
// 以便能精确删除像 /pə/ 这类音标碎片。幂等：无论原来是否存在均返回成功。
wordRouter.post('/deleteAudio', async (req, res) => {
  const raw = (req.body as { word?: unknown })?.word;
  const word = typeof raw === 'string' ? raw : '';
  if (!word) {
    return badRequest(res, 'word is required');
  }

  try {
    await pool.query('DELETE FROM word_audio WHERE word = ?', [word]);
    success(res, { word, deleted: true });
  } catch (err) {
    fail(res, err);
  }
});
