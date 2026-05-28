# reboot-english-server

## 环境要求

- Node.js >= 24

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 在项目根目录创建 .env 环境变量文件

# 3. 开发模式（热重载）
npm run dev
```

服务默认运行在 `http://localhost:3000`。

## 可用脚本

| 命令               | 说明                              |
| ------------------ | --------------------------------- |
| `npm run dev`      | 开发模式运行，文件变更自动重启    |
| `npm run build`    | 编译 TypeScript 到 `dist/`        |
| `npm start`        | 运行编译后的产物                  |
| `npm run typecheck`| 仅做类型检查，不输出文件          |
