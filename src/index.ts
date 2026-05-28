import { config } from './config.js';
import { app } from './app.js';

app.listen(config.port, () => {
  console.log(`服务已启动: http://localhost:${config.port}`);
});
