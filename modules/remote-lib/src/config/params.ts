declare function parseInt(value: unknown): number;
declare function parseFloat(value: unknown): number;

export const CC_OPENAI_API_KEY =
  process.env.CC_OPENAI_API_KEY || "nomic-embed-text";
export const CC_XAI_API_KEY = process.env.CC_XAI_API_KEY || "nomic-embed-text";
export const CC_COHERE_API_KEY =
  process.env.CC_COHERE_API_KEY || "nomic-embed-text";
export const CC_OPENAI_CHAT_MODEL =
  process.env.CC_OPENAI_CHAT_MODEL || "gpt-3.5-turbo";
export const CC_OPENAI_EMBEDDING_MODEL =
  process.env.CC_OPENAI_EMBEDDING_MODEL || "text-embedding-ada-002";

export const CC_CLIENT_SESSION_EXPIRE_SECONDS = 7 * 24 * 60 * 60; // 1 week

export const CC_REDIS_HOST = process.env.CC_REDIS_HOST || "127.0.0.1";
export const CC_REDIS_PORT = parseInt(process.env.CC_REDIS_PORT) || 6379;
export const CC_REDIS_PASSWORD = process.env.CC_REDIS_PASSWORD || "";

export const CC_VECTOR_SEARCH_LIMIT =
  parseInt(process.env.CC_VECTOR_SEARCH_LIMIT) || 1;
export const CC_VECTOR_SEARCH_SIMILARITY =
  parseFloat(process.env.CC_VECTOR_SEARCH_SIMILARITY) || 0.55;

export const CC_REDIS_FLUSHALL = !!process.env.CC_REDIS_FLUSHALL || false;

export const CC_WWWROOT_PORT = parseInt(process.env.CC_WWWROOT_PORT) || 80;

export const CC_EXECUTE_TEST = !!process.env.CC_EXECUTE_TEST;

export const CC_ENABLE_TERMINATE_SESSIONS =
  !!process.env.CC_ENABLE_TERMINATE_SESSIONS || false;

export const CC_WEATHER_API_KEY =
  process.env.CC_WEATHER_API_KEY || "text-embedding-ada-002";

export const CC_GEMINI_API_KEY = process.env.CC_GEMINI_API_KEY || "";

export const CC_GEMINI_CHAT_MODEL =
  process.env.CC_GEMINI_CHAT_MODEL || "gemini-2.0-flash";

export const CC_CHANNEL_USERNAME = process.env.CC_CHANNEL_USERNAME || "";
