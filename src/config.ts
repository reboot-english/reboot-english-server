import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必需的环境变量: ${name}（请在 .env 中配置）`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  coze: {
    token: required('COZE_API_TOKEN'),
    baseURL: process.env.COZE_API_BASE_URL ?? 'https://api.coze.cn',
    // 各业务工作流的 ID。
    workflowWordGetAudio: required('COZE_WORKFLOW_WORD_GET_AUDIO'),
  },
};
