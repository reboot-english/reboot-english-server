-- reboot-english-server 数据库结构
--
-- 用途：在新环境一次性建库 + 建表。项目暂无迁移机制，表结构以本文件为准，
--       改表后请同步更新这里。
-- 执行：mysql -u <user> -p < schema.sql
--
-- 公共字段约定（见 CLAUDE.md）：每张表都含
--   id         BIGINT PRIMARY KEY AUTO_INCREMENT
--   created_at TIMESTAMP 默认 CURRENT_TIMESTAMP
--   updated_at TIMESTAMP 默认 CURRENT_TIMESTAMP，ON UPDATE 自动刷新

-- 建库（库名含连字符，需反引号）。
CREATE DATABASE IF NOT EXISTS `reboot-english`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE `reboot-english`;

-- 单词语音缓存：word -> mp3 字节。getAudio 读穿透缓存。
CREATE TABLE IF NOT EXISTS word_audio (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  word       VARCHAR(128) NOT NULL,
  audio      LONGBLOB     NOT NULL,
  mime       VARCHAR(64)  NOT NULL DEFAULT 'audio/mpeg',
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 查词结果缓存：规范词 -> 结果 JSON。lookup 第二级缓存。
CREATE TABLE IF NOT EXISTS word_lookup (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  word       VARCHAR(128) NOT NULL,
  result     JSON         NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 输入词归一化映射：输入词 raw -> 规范词 word。lookup 第一级缓存。
CREATE TABLE IF NOT EXISTS word_alias (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  raw        VARCHAR(128) NOT NULL,
  word       VARCHAR(128) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_raw (raw)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 单词收藏（全局，暂不分用户）。word 全局唯一。
CREATE TABLE IF NOT EXISTS word_favorite (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  word       VARCHAR(128) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
