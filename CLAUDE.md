# reboot-english-server

## API 规范（所有接口必须遵守）

### 路径与方法 —— RPC 风格

- 统一前缀 `/api`，路径形如 `/api/{模块}/{动作}`
- 模块名用**单数名词**（`word`、`user`），动作用 **camelCase 动词**
- 常用动词词表（统一使用，勿自创同义词）：
  - `get`（取单条）、`list`（列表）、`create`、`update`、`delete`
  - 特殊动作自定义，如 `getAudio`、`login`
- **方法只用两种**：
  - `GET`：读取/查询（无副作用），参数走 **查询字符串**（`?word=apple`）
  - `POST`：其它一切（增/删/改/触发动作），参数走 **JSON 请求体**

示例：
```
GET  /api/word/getAudio?word=apple
GET  /api/word/get?word=apple
GET  /api/word/list?page=1&pageSize=20
POST /api/word/create      body: { ... }
POST /api/word/update      body: { id, ... }
POST /api/word/delete      body: { id }
POST /api/user/login       body: { username, password }
```

### 响应信封

所有 **JSON 接口**统一返回信封，字段 **camelCase**：

```json
{ "code": 200, "message": "OK", "data": { ... } }
```

- `code` = HTTP 状态码的数值，且**必须与真实 HTTP 状态码一致**（不是永远 200）
- `message` = HTTP 标准 reason 文本，**允许在其后追加具体原因**
- `data`：成功时为数据对象/数组，失败时为 `null`
- Content-Type：`application/json; charset=utf-8`

**code 取值**（目前只用这 5 个，404/429/502 等以后需要再加）：

| HTTP / code | message | 场景 |
|------|---------|------|
| `200` | OK | 成功 |
| `400` | Bad Request | 参数错误 / 客户端错误 |
| `401` | Unauthorized | 未认证（未登录 / token 失效） |
| `403` | Forbidden | 已认证但无权限 |
| `500` | Internal Server Error | 服务端错误（含工作流 / TTS 调用失败） |

示例：
```
HTTP/1.1 200 OK
{ "code": 200, "message": "OK", "data": { "word": "apple" } }

HTTP/1.1 400 Bad Request
{ "code": 400, "message": "Bad Request: word is required", "data": null }

HTTP/1.1 401 Unauthorized
{ "code": 401, "message": "Unauthorized", "data": null }
```

### 二进制 / 媒体接口（例外）

文件、音频等二进制资源接口**不套信封**：成功时直接返回内容流（如
`Content-Type: audio/mpeg`），**仅在出错时返回 JSON 信封**。
例：`GET /api/word/getAudio?word=apple` 成功返回 mp3 字节，失败返回
`{ code: 500, message, data: null }`。

## 数据库规范（所有表必须遵守）

每张表都**必须**包含以下三个公共字段：

| 字段 | 定义 | 说明 |
|------|------|------|
| `id` | `BIGINT PRIMARY KEY AUTO_INCREMENT` | 自增主键 |
| `created_at` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间，插入时自动写入 |
| `updated_at` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 更新时间，每次行被修改时自动刷新 |

建表示例：

```sql
CREATE TABLE IF NOT EXISTS word_audio (
  id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
  word       VARCHAR(128) NOT NULL UNIQUE,
  audio      LONGBLOB     NOT NULL,
  mime       VARCHAR(64)  NOT NULL DEFAULT 'audio/mpeg',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```
