'use strict';

var pinolog = require('pinolog');
var agentSwarmKit = require('agent-swarm-kit');
var functoolsKit = require('functools-kit');
var Redis = require('ioredis');
var remoteLib = require('@modules/remote-lib');
var nodeServer = require('@hono/node-server');
var hono = require('hono');
var nodeWs = require('@hono/node-ws');
var fs = require('fs/promises');
var telegram = require('telegram');
var index_js = require('telegram/sessions/index.js');
var readline = require('readline');
var OpenAI = require('openai');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var readline__namespace = /*#__PURE__*/_interopNamespaceDefault(readline);

(function() {
    const env = {};
    try {
        if (process) {
            process.env = Object.assign({}, process.env);
            Object.assign(process.env, env);
            return;
        }
    } catch (e) {} // avoid ReferenceError: process is not defined
    globalThis.process = { env:env };
})();

agentSwarmKit.setConfig({
    CC_PERSIST_EMBEDDING_CACHE: true,
});
const EMBEDDING_REDIS_TTL = 604800; // 1 week
const HISTORY_REDIS_TTL = 86400; // 24 hours
const ALIVE_REDIS_TTL = 3600; // 1 hour
const getRedis$1 = functoolsKit.singleshot(() => new Promise((res) => {
    const redis = new Redis({
        host: process.env.CC_REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.CC_REDIS_PORT) || 6379,
        password: process.env.CC_REDIS_PASSWORD || "",
    });
    redis.on("connect", () => {
        res(redis);
    });
    redis.on("error", (error) => {
        throw error;
    });
    redis.on("close", () => {
        throw new Error("redis connection closed");
    });
    return redis;
}));
agentSwarmKit.History.useHistoryAdapter(class {
    async *iterate() {
        for await (const message of this._messages) {
            yield message;
        }
    }
    constructor(clientId) {
        this.clientId = clientId;
        this._redis = null;
        this._messages = [];
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
            const messages = await this._redis.lrange(`history:${this.clientId}:messages`, 0, -1);
            this._messages = messages.map((msg) => JSON.parse(msg));
        });
    }
    async push(value) {
        const key = `history:${this.clientId}:messages`;
        await this._redis.rpush(key, JSON.stringify(value));
        await this._redis.expire(key, HISTORY_REDIS_TTL);
        this._messages.push(value);
    }
    async pop() {
        const key = `history:${this.clientId}:messages`;
        await this._redis.lpop(key);
        return this._messages.pop() ?? null;
    }
    async dispose() {
        this._messages = [];
    }
});
agentSwarmKit.PersistSwarm.usePersistActiveAgentAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
        });
    }
    async readValue(clientId) {
        const key = `swarm:${this.swarmName}:active_agent:${clientId}`;
        const value = await this._redis.get(key);
        if (!value) {
            throw new Error(`PersistActiveAgent ${clientId} not found.`);
        }
        return JSON.parse(value);
    }
    async hasValue(clientId) {
        const key = `swarm:${this.swarmName}:active_agent:${clientId}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(clientId, entity) {
        const key = `swarm:${this.swarmName}:active_agent:${clientId}`;
        await this._redis.set(key, JSON.stringify(entity));
    }
});
agentSwarmKit.PersistSwarm.usePersistNavigationStackAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
        });
    }
    async readValue(clientId) {
        const key = `swarm:${this.swarmName}:navigation_stack:${clientId}`;
        const value = await this._redis.get(key);
        if (!value) {
            throw new Error(`PersistNavigationStack ${clientId} not found.`);
        }
        return JSON.parse(value);
    }
    async hasValue(clientId) {
        const key = `swarm:${this.swarmName}:navigation_stack:${clientId}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(clientId, entity) {
        const key = `swarm:${this.swarmName}:navigation_stack:${clientId}`;
        await this._redis.set(key, JSON.stringify(entity));
    }
});
agentSwarmKit.PersistState.usePersistStateAdapter(class {
    constructor(stateName) {
        this.stateName = stateName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
        });
    }
    async readValue(clientId) {
        const key = `state:${this.stateName}:${clientId}`;
        const value = await this._redis.get(key);
        if (!value) {
            throw new Error(`PersistState ${clientId} not found.`);
        }
        return JSON.parse(value);
    }
    async hasValue(clientId) {
        const key = `state:${this.stateName}:${clientId}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(clientId, entity) {
        const key = `state:${this.stateName}:${clientId}`;
        await this._redis.set(key, JSON.stringify(entity));
    }
});
agentSwarmKit.PersistStorage.usePersistStorageAdapter(class {
    constructor(storageName) {
        this.storageName = storageName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
        });
    }
    async readValue(clientId) {
        const key = `storage:${this.storageName}:${clientId}`;
        const value = await this._redis.get(key);
        if (!value) {
            throw new Error(`PersistStorage ${clientId} not found.`);
        }
        return JSON.parse(value);
    }
    async hasValue(clientId) {
        const key = `storage:${this.storageName}:${clientId}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(clientId, entity) {
        const key = `storage:${this.storageName}:${clientId}`;
        await this._redis.set(key, JSON.stringify(entity));
    }
});
agentSwarmKit.PersistMemory.usePersistMemoryAdapter(class {
    constructor(memoryName) {
        this.memoryName = memoryName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
        });
    }
    async readValue(clientId) {
        const key = `memory:${this.memoryName}:${clientId}`;
        const value = await this._redis.get(key);
        if (!value) {
            throw new Error(`PersistMemory ${clientId} not found.`);
        }
        return JSON.parse(value);
    }
    async hasValue(clientId) {
        const key = `memory:${this.memoryName}:${clientId}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(clientId, entity) {
        const key = `memory:${this.memoryName}:${clientId}`;
        await this._redis.set(key, JSON.stringify(entity));
    }
});
agentSwarmKit.PersistPolicy.usePersistPolicyAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
        });
    }
    async readValue(policyName) {
        const key = `policy:${this.swarmName}:${policyName}`;
        const value = await this._redis.get(key);
        if (!value) {
            throw new Error(`PersistPolicy ${policyName} not found.`);
        }
        return JSON.parse(value);
    }
    async hasValue(policyName) {
        const key = `policy:${this.swarmName}:${policyName}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(policyName, entity) {
        const key = `policy:${this.swarmName}:${policyName}`;
        await this._redis.set(key, JSON.stringify(entity));
    }
});
agentSwarmKit.PersistAlive.usePersistAliveAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
            const pattern = `alive:${this.swarmName}:*`;
            const keys = await this._redis.keys(pattern);
            if (keys.length > 0) {
                await this._redis.del(...keys);
            }
        });
    }
    async readValue(clientId) {
        const key = `alive:${this.swarmName}:${clientId}`;
        const value = await this._redis.get(key);
        if (!value) {
            return { online: false };
        }
        return JSON.parse(value);
    }
    async hasValue(clientId) {
        const key = `alive:${this.swarmName}:${clientId}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(clientId, entity) {
        const key = `alive:${this.swarmName}:${clientId}`;
        if (!entity.online) {
            await this._redis.del(key);
            return;
        }
        await this._redis.set(key, JSON.stringify(entity));
        await this._redis.expire(key, ALIVE_REDIS_TTL);
    }
});
agentSwarmKit.PersistEmbedding.usePersistEmbeddingAdapter(class {
    constructor(embeddingName) {
        this.embeddingName = embeddingName;
        this._redis = null;
        this.waitForInit = functoolsKit.singleshot(async () => {
            this._redis = await getRedis$1();
        });
    }
    async readValue(stringHash) {
        const key = `embedding:${this.embeddingName}:${stringHash}`;
        const value = await this._redis.get(key);
        if (!value) {
            throw new Error(`PersistEmbedding ${stringHash} not found.`);
        }
        const buffer = Buffer.from(value, "base64");
        const embeddings = Array.from(new Float64Array(buffer.buffer));
        return { embeddings };
    }
    async hasValue(stringHash) {
        const key = `embedding:${this.embeddingName}:${stringHash}`;
        const exists = await this._redis.exists(key);
        return exists === 1;
    }
    async writeValue(stringHash, entity) {
        const key = `embedding:${this.embeddingName}:${stringHash}`;
        const buffer = Buffer.from(new Float64Array(entity.embeddings).buffer);
        await this._redis.set(key, buffer.toString("base64"));
        await this._redis.expire(key, EMBEDDING_REDIS_TTL);
    }
});

agentSwarmKit.setConfig({
    CC_KEEP_MESSAGES: 50,
    CC_LOGGER_ENABLE_INFO: true,
    CC_LOGGER_ENABLE_DEBUG: true,
    CC_LOGGER_ENABLE_LOG: true,
});
{
    const logger = pinolog.createLogger("agent-swarm-kit.log");
    agentSwarmKit.swarm.loggerService.setLogger({
        log: (...args) => logger.log(...args),
        debug: (...args) => logger.info(...args),
        info: (...args) => logger.info(...args),
    });
}
agentSwarmKit.dumpClientPerformance.runAfterExecute();

const app = new hono.Hono();
const { injectWebSocket, upgradeWebSocket } = nodeWs.createNodeWebSocket({ app });

const CC_WWWROOT_PORT = parseInt(process.env.CC_WWWROOT_PORT) || 80;
const CC_EXECUTE_TEST = !!process.env.CC_EXECUTE_TEST;

async function fileToBase64(path) {
    const data = await fs.readFile(path);
    return data.toString('base64');
}
app.get("/api/v1/session/:clientId", upgradeWebSocket((ctx) => {
    const clientId = ctx.req.param("clientId");
    const clientLocale = new URL(ctx.req.url).searchParams.get("locale");
    console.log(`Connected: ${clientId} locale: ${clientLocale}`);
    let swarm = remoteLib.SwarmName.RootSwarmEn;
    if (clientLocale === "uz") {
        swarm = remoteLib.SwarmName.RootSwarmUz;
    }
    else if (clientLocale === "ru") {
        swarm = remoteLib.SwarmName.RootSwarmRu;
    }
    return {
        async onOpen(_, ws) {
            await agentSwarmKit.Chat.beginChat(clientId, swarm);
            const unToken = agentSwarmKit.listenEvent(clientId, "llm-new-token", (token) => {
                ws.send(JSON.stringify({ type: "token", token }));
            });
            const unImage = agentSwarmKit.listenEvent(clientId, "new-generated-image", async (path) => {
                ws.send(JSON.stringify({
                    type: "image",
                    image: await fileToBase64(path),
                }));
            });
            const unCreditPayAction = agentSwarmKit.listenEvent(clientId, `app-action-credit-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-credit-payment",
                    payload,
                }));
            });
            const unElectricityPayAction = agentSwarmKit.listenEvent(clientId, `app-action-electricity-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-electricity-payment",
                    payload,
                }));
            });
            const unGasPayAction = agentSwarmKit.listenEvent(clientId, `app-action-gas-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-gas-payment",
                    payload,
                }));
            });
            const unGovernmentPayAction = agentSwarmKit.listenEvent(clientId, `app-action-government-service-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-government-service-payment",
                    payload,
                }));
            });
            const unInternetPayAction = agentSwarmKit.listenEvent(clientId, `app-action-internet-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-internet-payment",
                    payload,
                }));
            });
            const unMobilePayAction = agentSwarmKit.listenEvent(clientId, `app-action-mobile-operator-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-mobile-operator-payment",
                    payload,
                }));
            });
            const unP2PPayAction = agentSwarmKit.listenEvent(clientId, `app-action-send-payment-modal`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-send-payment-modal",
                    payload,
                }));
            });
            const unTransportPayAction = agentSwarmKit.listenEvent(clientId, `app-action-transport-service-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-transport-service-payment",
                    payload,
                }));
            });
            const unWaterPayAction = agentSwarmKit.listenEvent(clientId, `app-action-water-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-water-payment",
                    payload,
                }));
            });
            agentSwarmKit.Chat.listenDispose(clientId, swarm, () => {
                unToken();
                unImage();
                unCreditPayAction();
                unElectricityPayAction();
                unGasPayAction();
                unGovernmentPayAction();
                unInternetPayAction();
                unMobilePayAction();
                unP2PPayAction();
                unTransportPayAction();
                unWaterPayAction();
            });
        },
        async onMessage(event, ws) {
            const incoming = JSON.parse(event.data.toString());
            try {
                const completion = await agentSwarmKit.Chat.sendMessage(clientId, incoming.data, swarm);
                ws.send(JSON.stringify({
                    type: "completion",
                    completion,
                }));
            }
            catch (error) {
                console.log(functoolsKit.getErrorMessage(error));
            }
        },
        onClose: () => {
            console.log("Disconnected");
            agentSwarmKit.Chat.dispose(clientId, swarm);
        },
    };
}));

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || "";
const client = new telegram.TelegramClient(new index_js.StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
});
// Helper for readline prompts during first login
function prompt(question) {
    const rl = readline__namespace.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}
// TODO: Private chat handler (hozircha o'chirilgan)
// async function handleNewMessage(event: NewMessageEvent) {
//   const message = event.message;
//   if (message.out) return;
//   if (!event.isPrivate) return;
//   const chatId = message.chatId?.toString();
//   if (!chatId) return;
//   const text = message.text;
//   if (!text) return;
//   const clientId = chatId;
//   const swarmName = SwarmName.RootSwarm;
//   try {
//     if (!activeSessions.has(clientId)) {
//       await Chat.beginChat(clientId, swarmName);
//       activeSessions.set(clientId, swarmName);
//     }
//     const answer = await Chat.sendMessage(clientId, text, swarmName);
//     if (!answer || !answer.trim()) return;
//     await client.sendMessage(chatId, { message: answer });
//   } catch (error) {
//     console.error(`Error processing message:`, error);
//     await client.sendMessage(chatId, {
//       message: "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
//     });
//   }
// }
const startTelegramBot = async () => {
    console.log("Starting Telegram userbot...");
    console.log("[DEBUG] apiId:", apiId, "apiHash:", apiHash ? apiHash.slice(0, 4) + "***" : "MISSING");
    console.log("[DEBUG] sessionString:", sessionString ? `${sessionString.length} chars` : "EMPTY (first login)");
    await client.start({
        phoneNumber: async () => {
            const phone = await prompt("Telefon raqamingizni kiriting: ");
            console.log("[DEBUG] Phone entered:", phone);
            return phone;
        },
        password: async () => {
            console.log("[DEBUG] 2FA password requested");
            return await prompt("2FA parolingizni kiriting: ");
        },
        phoneCode: async () => {
            console.log("[DEBUG] OTP code requested — Telegram should send code now");
            return await prompt("Telegram yuborgan kodni kiriting: ");
        },
        onError: (err) => {
            console.error("[DEBUG] Telegram auth error:", err);
            console.error("[DEBUG] Error details:", JSON.stringify(err, null, 2));
        },
    });
    console.log("Telegram userbot connected!");
    // Save session string for future use
    const session = client.session.save();
    if (session && !sessionString) {
        console.log("========================================");
        console.log("TELEGRAM_SESSION ni .env fayliga saqlang:");
        console.log(session);
        console.log("========================================");
    }
    // TODO: Private chat handler (hozircha o'chirilgan)
    // client.addEventHandler(handleNewMessage, new NewMessage({}));
    console.log("Telegram userbot started successfully!");
};

const channelUsername = process.env.CC_CHANNEL_USERNAME || "";
const sourceChannels = (process.env.CC_SOURCE_CHANNELS || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
const CRON_INTERVAL = 30 * 60 * 1000; // 30 min (test), production: 90 min
const POST_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
// Priority channels — take posts even without salary
const PRIORITY_CHANNELS = ["@techjobs_uz", "@marketingdaishla"];
const deepseekApiKey = process.env.CC_DEPSEEK_API_KEY;
const openai = new OpenAI({
    apiKey: deepseekApiKey || process.env.CC_OPENAI_API_KEY,
    ...(deepseekApiKey && { baseURL: "https://api.deepseek.com" }),
});
const getRedis = functoolsKit.singleshot(() => new Promise((res) => {
    const redis = new Redis({
        host: process.env.CC_REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.CC_REDIS_PORT) || 6379,
        password: process.env.CC_REDIS_PASSWORD || "",
    });
    redis.on("connect", () => res(redis));
    redis.on("error", (error) => {
        console.error("[Scraper] Redis error:", error);
    });
    return redis;
}));
// Check if a source message was already scraped
async function isAlreadyScraped(sourceChannel, messageId) {
    const redis = await getRedis();
    const exists = await redis.exists(`scraped:${sourceChannel}:${messageId}`);
    return exists === 1;
}
// Save post mapping to Redis
async function savePostMapping(sourceChannel, sourceMessageId, targetMessageId) {
    const redis = await getRedis();
    const data = JSON.stringify({
        sourceChannel,
        sourceMessageId,
        targetMessageId,
        postedAt: Date.now(),
    });
    await redis.setex(`scraped:${sourceChannel}:${sourceMessageId}`, POST_TTL, "1");
    await redis.setex(`post:${targetMessageId}`, POST_TTL, data);
    await redis.sadd("post_ids", String(targetMessageId));
}
// Format a job post using OpenAI
async function formatJobPost(originalText, sourceChannel) {
    try {
        const response = await openai.chat.completions.create({
            model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: `Sen ish e'lonlarini formatlash bo'yicha yordamchisan. Berilgan matndan ish e'loni ma'lumotlarini ajratib ol va quyidagi formatda qaytar. Agar matn ish e'loni bo'lmasa, "SKIP" deb yoz.

MUHIM: Figurali qavslar {} ichidagi so'zlar PLACEHOLDER emas — ularni matndan topilgan haqiqiy ma'lumot bilan ALMASHTIR. Masalan, agar lavozim "SMM menejer" bo'lsa, aynan "SMM menejer" deb yoz.

FORMAT:

LAVOZIM_NOMI

— Ish holati: #aktiv

🏢 Kompaniya: KOMPANIYA_NOMI (topilmasa "Ko'rsatilmagan")

— Ish turi: OFFLINE_ONLINE_GIBRID

💰 Maosh: MAOSH_SUMMASI (topilmasa "Kelishiladi")

— Talablar:
TALABLAR_ROYXATI

— Murojaat uchun: ALOQA_MALUMOTLARI

📍 Manzil: MANZIL (topilmasa "Ko'rsatilmagan")

🍋Limon Jobs – limonni ishlang!

Bepul e'lon joylang: @limonjobs_admin

MISOL:
SMM menejer

— Ish holati: #aktiv

🏢 Kompaniya: Najot Ta'lim

— Ish turi: Offline

💰 Maosh: 5-8 mln so'm

— Talablar:
- 1+ yil tajriba
- Instagram, Telegram bilimlari

— Murojaat uchun: @admin_hr

📍 Manzil: Toshkent shahri

🍋Limon Jobs – limonni ishlang!

Bepul e'lon joylang: @limonjobs_admin`,
                },
                {
                    role: "user",
                    content: originalText,
                },
            ],
        });
        const result = response.choices[0]?.message?.content?.trim();
        if (!result || result === "SKIP")
            return null;
        return result;
    }
    catch (error) {
        console.error("[Scraper] OpenAI format error:", error);
        return null;
    }
}
// Check if a formatted post is a duplicate of recent posts
async function isDuplicate(formatted) {
    const redis = await getRedis();
    const recentPosts = await redis.lrange("recent_posts", 0, 29);
    if (!recentPosts.length)
        return false;
    try {
        const response = await openai.chat.completions.create({
            model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: `Sen ish e'lonlarini solishtiruvchisan. Yangi e'lon bilan mavjud e'lonlarni solishtir.

DUPLICATE deb yoz agar:
- Lavozim bir xil yoki o'xshash (masalan "Video montajyor" va "Videomontajor" bir xil)
- Kompaniya bir xil
- Murojaat uchun link, telefon raqam yoki username bir xil
- Manzil bir xil (masalan "Impact Coworking" va "Toshkent, Impact Coworking")
- Maosh diapazoni bir xil yoki juda yaqin

Agar yuqoridagilardan KAMIDA 2 tasi mos kelsa — "DUPLICATE".
Aks holda "UNIQUE".
Faqat bitta so'z yoz.`,
                },
                {
                    role: "user",
                    content: `YANGI E'LON:\n${formatted}\n\nMAVJUD E'LONLAR:\n${recentPosts.join("\n---\n")}`,
                },
            ],
        });
        const result = response.choices[0]?.message?.content?.trim();
        return result === "DUPLICATE";
    }
    catch (error) {
        console.error("[Scraper] Duplicate check error:", error);
        return false;
    }
}
// Save formatted post to recent list for duplicate checking
async function saveToRecent(formatted) {
    const redis = await getRedis();
    await redis.lpush("recent_posts", formatted);
    await redis.ltrim("recent_posts", 0, 49); // keep last 50
}
// Collect unscraped posts from all source channels (1-2 days old)
async function collectCandidates() {
    const candidates = [];
    const oneDayAgo = Math.floor(Date.now() / 1000 - 24 * 60 * 60);
    const twoDaysAgo = Math.floor(Date.now() / 1000 - 48 * 60 * 60);
    for (const channel of sourceChannels) {
        try {
            console.log(`[Scraper] Reading from ${channel}...`);
            const messages = await client.getMessages(channel, {
                limit: 50,
                offsetDate: oneDayAgo,
            });
            for (const msg of messages) {
                if (!msg.text || msg.text.length < 30)
                    continue;
                if (!msg.date || msg.date < twoDaysAgo)
                    break;
                const alreadyScraped = await isAlreadyScraped(channel, msg.id);
                if (alreadyScraped)
                    continue;
                candidates.push({
                    channel,
                    msgId: msg.id,
                    text: msg.text,
                    date: msg.date,
                });
            }
            // Delay between channels to avoid flood
            await new Promise((r) => setTimeout(r, 3000));
        }
        catch (error) {
            if (error?.seconds) {
                console.log(`[Scraper] FloodWait: waiting ${error.seconds}s...`);
                await new Promise((r) => setTimeout(r, error.seconds * 1000));
            }
            else {
                console.error(`[Scraper] Error reading ${channel}:`, error);
            }
        }
    }
    return candidates;
}
// Get recent post categories to ensure diversity
async function getRecentCategories() {
    const redis = await getRedis();
    return await redis.lrange("recent_categories", 0, 2);
}
async function saveCategory(category) {
    const redis = await getRedis();
    await redis.lpush("recent_categories", category);
    await redis.ltrim("recent_categories", 0, 9);
}
// Use AI to select best 1-2 posts from candidates
async function selectBestPosts(candidates) {
    const recentCategories = await getRecentCategories();
    const recentPosts = await (await getRedis()).lrange("recent_posts", 0, 29);
    const candidateList = candidates
        .map((c, i) => `[${i}] Kanal: ${c.channel} | Sana: ${new Date(c.date * 1000).toISOString()}\n${c.text}`)
        .join("\n---\n");
    try {
        const response = await openai.chat.completions.create({
            model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: `Sen ish e'lonlarini saralovchisan. Berilgan nomzodlardan eng yaxshi 1-2 tasini tanlashing kerak.

SARALASH QOIDALARI (muhimlik tartibi bo'yicha):

1. DUBLIKAT TEKSHIRISH: Agar nomzod MAVJUD E'LONLAR bilan bir xil lavozim, kompaniya, manzilga ega bo'lsa — TANLAMAGIN.

2. MAOSH USTUNLIGI: Maosh/oylik narxi ko'rsatilgan e'lonlar birinchi. Eng yuqori maoshni olish.

3. PRIORITY KANALLAR: ${PRIORITY_CHANNELS.join(", ")} kanallaridagi e'lonlarni maosh ko'rsatilmagan bo'lsa ham olish mumkin.

4. FALLBACK: Agar priority kanallarda bugun e'lon yo'q bo'lsa — boshqa kanallardan maosh bo'yicha, keyin maoshsizlarni vaqti bo'yicha (birinchi chiqqanini) olish.

5. XILMA-XILLIK: Oxirgi 3 ta post kategoriyalari: [${recentCategories.join(", ")}]. Ulardan farqli kategoriya tanlashga harakat qil. Ketma-ket 3 ta bir xil kategoriya bo'lmasligi kerak.

6. SOTUV DEPRIORITIZATSIYA: Sotuvchi, call center, sotuv menejer, sales kabi e'lonlar juda ko'p. Iloji boricha boshqa turdagi vakansiyalarni birinchi ol. Sotuv vakansiyalarini faqat boshqa variant bo'lmaganda ol.

JAVOB FORMATI (faqat JSON, boshqa hech narsa yozma):
[
  {
    "index": 0,
    "category": "dasturchi",
    "reason": "qisqa sabab"
  }
]

Agar hech biri mos kelmasa, bo'sh massiv qaytar: []`,
                },
                {
                    role: "user",
                    content: `NOMZODLAR:\n${candidateList}\n\nMAVJUD E'LONLAR (dublikat uchun):\n${recentPosts.length ? recentPosts.join("\n---\n") : "Yo'q"}`,
                },
            ],
        });
        const result = response.choices[0]?.message?.content?.trim();
        if (!result)
            return [];
        const selections = JSON.parse(result);
        // Format selected posts
        const output = [];
        for (const sel of selections.slice(0, 2)) {
            const candidate = candidates[sel.index];
            if (!candidate)
                continue;
            const formatted = await formatJobPost(candidate.text, candidate.channel);
            if (!formatted)
                continue;
            output.push({
                index: sel.index,
                formatted,
                category: sel.category,
            });
            console.log(`[Scraper] Selected: [${sel.category}] from ${candidate.channel}#${candidate.msgId} — ${sel.reason}`);
        }
        return output;
    }
    catch (error) {
        console.error("[Scraper] AI selection error:", error);
        return [];
    }
}
// Scrape, select best posts, and publish
async function scrapeSourceChannels() {
    if (!sourceChannels.length) {
        console.log("[Scraper] No source channels configured");
        return;
    }
    if (!channelUsername) {
        console.log("[Scraper] No target channel configured");
        return;
    }
    // 1. Collect all candidates from all channels
    const candidates = await collectCandidates();
    console.log(`[Scraper] Found ${candidates.length} candidates`);
    if (!candidates.length) {
        console.log("[Scraper] No new candidates found");
        return;
    }
    // 2. AI selects best 1-2
    const selected = await selectBestPosts(candidates);
    console.log(`[Scraper] AI selected ${selected.length} posts`);
    // 3. Publish selected posts (with final duplicate check)
    for (const sel of selected) {
        const candidate = candidates[sel.index];
        // Final duplicate check against already posted content
        const duplicate = await isDuplicate(sel.formatted);
        if (duplicate) {
            console.log(`[Scraper] Duplicate skipped (final check): ${candidate.channel}#${candidate.msgId}`);
            continue;
        }
        try {
            const sent = await client.sendMessage(channelUsername, {
                message: sel.formatted,
                linkPreview: false,
            });
            await saveToRecent(sel.formatted);
            await saveCategory(sel.category);
            await savePostMapping(candidate.channel, candidate.msgId, sent.id);
            console.log(`[Scraper] Posted [${sel.category}] from ${candidate.channel}#${candidate.msgId} → ${channelUsername}#${sent.id}`);
            await new Promise((r) => setTimeout(r, 10000));
        }
        catch (error) {
            if (error?.seconds) {
                console.log(`[Scraper] FloodWait: waiting ${error.seconds}s...`);
                await new Promise((r) => setTimeout(r, error.seconds * 1000));
            }
            else {
                console.error(`[Scraper] Error posting:`, error);
            }
        }
    }
    // 4. Mark all candidates as scraped (selected or not)
    const redis = await getRedis();
    for (const c of candidates) {
        await redis.setex(`scraped:${c.channel}:${c.msgId}`, POST_TTL, "1");
    }
}
// Check if source posts still exist, edit target if deleted
async function checkExistingPosts() {
    const redis = await getRedis();
    const postIds = await redis.smembers("post_ids");
    if (!postIds.length) {
        console.log("[Scraper] No tracked posts to check");
        return;
    }
    console.log(`[Scraper] Checking ${postIds.length} tracked posts...`);
    for (const targetIdStr of postIds) {
        try {
            const data = await redis.get(`post:${targetIdStr}`);
            if (!data) {
                // Post expired from Redis, remove from set
                await redis.srem("post_ids", targetIdStr);
                continue;
            }
            const { sourceChannel, sourceMessageId, targetMessageId } = JSON.parse(data);
            // Try to read the source message
            let sourceExists = true;
            try {
                const msgs = await client.getMessages(sourceChannel, {
                    ids: [sourceMessageId],
                });
                // If message is deleted, getMessages returns empty or message with empty text
                if (!msgs.length || !msgs[0] || !msgs[0].text) {
                    sourceExists = false;
                }
            }
            catch {
                sourceExists = false;
            }
            // Delay between post checks
            await new Promise((r) => setTimeout(r, 3000));
            if (!sourceExists) {
                console.log(`[Scraper] Source post ${sourceChannel}#${sourceMessageId} deleted, editing target#${targetMessageId}`);
                try {
                    // Get current target message
                    const targetMsgs = await client.getMessages(channelUsername, {
                        ids: [targetMessageId],
                    });
                    if (targetMsgs.length && targetMsgs[0] && targetMsgs[0].text) {
                        const currentText = targetMsgs[0].text;
                        // Check if already marked as closed
                        if (currentText.includes("#yopildi"))
                            continue;
                        // Edit: replace #aktiv with #yopildi, remove contact info
                        let editedText = currentText.replace("#aktiv", "#yopildi");
                        // Replace "Murojaat uchun" line with "Vakansiya yopildi"
                        editedText = editedText.replace(/— Murojaat uchun:.*(?:\n|$)/, "— ❌ Vakansiya yopildi\n");
                        await client.invoke(new telegram.Api.messages.EditMessage({
                            peer: channelUsername,
                            id: targetMessageId,
                            message: editedText,
                        }));
                        console.log(`[Scraper] Marked target#${targetMessageId} as closed`);
                    }
                }
                catch (editError) {
                    console.error(`[Scraper] Error editing target#${targetMessageId}:`, editError);
                }
                // Remove from tracking
                await redis.srem("post_ids", targetIdStr);
                await redis.del(`post:${targetIdStr}`);
            }
        }
        catch (error) {
            console.error(`[Scraper] Error checking post ${targetIdStr}:`, error);
        }
    }
}
// Check if current time is within posting hours (08:00 - 21:00 Tashkent)
function isPostingHours() {
    const now = new Date();
    // UTC+5 for Tashkent
    const tashkentHour = (now.getUTCHours() + 5) % 24;
    return tashkentHour >= 8 && tashkentHour < 21;
}
// Main CRON job
async function runScraper() {
    if (!isPostingHours()) {
        console.log(`[Scraper] Outside posting hours (08:00-21:00 Tashkent), skipping`);
        return;
    }
    console.log(`[Scraper] Running at ${new Date().toISOString()}`);
    try {
        await scrapeSourceChannels();
        await checkExistingPosts();
    }
    catch (error) {
        console.error("[Scraper] Error in scraper run:", error);
    }
    console.log(`[Scraper] Done`);
}
async function startScraper() {
    if (!sourceChannels.length) {
        console.log("[Scraper] CC_SOURCE_CHANNELS not set, scraper disabled");
        return;
    }
    console.log(`[Scraper] Configured with ${sourceChannels.length} source channels: ${sourceChannels.join(", ")}`);
    console.log(`[Scraper] Target channel: ${channelUsername}`);
    console.log(`[Scraper] Schedule: every 30min (test), 08:00-21:00 Tashkent`);
    // First run after 10 seconds
    setTimeout(() => {
        runScraper();
    }, 10000);
    // Then on interval
    setInterval(() => {
        runScraper();
    }, CRON_INTERVAL);
}

const main = async () => {
    if (CC_EXECUTE_TEST) {
        return;
    }
    const server = nodeServer.serve({
        fetch: app.fetch,
        port: CC_WWWROOT_PORT,
        hostname: "0.0.0.0",
    });
    server.addListener("listening", () => {
        console.log(`Server listening on http://localhost:${CC_WWWROOT_PORT}`);
    });
    injectWebSocket(server);
    // Start Telegram bot
    await startTelegramBot();
    // Start channel scraper CRON
    await startScraper();
};
main();

console.log("[DEBUG] ENV check — TELEGRAM_API_ID:", process.env.TELEGRAM_API_ID || "MISSING");
console.log("[DEBUG] ENV check — TELEGRAM_API_HASH:", process.env.TELEGRAM_API_HASH ? "SET" : "MISSING");
console.log("[DEBUG] ENV check — TELEGRAM_SESSION:", process.env.TELEGRAM_SESSION ? "SET" : "MISSING");
