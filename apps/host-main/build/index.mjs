import { createLogger } from 'pinolog';
import { setConfig, History, PersistSwarm, PersistState, PersistStorage, PersistMemory, PersistPolicy, PersistAlive, PersistEmbedding, swarm, dumpClientPerformance, Chat, listenEvent } from 'agent-swarm-kit';
import { singleshot, getErrorMessage } from 'functools-kit';
import Redis from 'ioredis';
import { SwarmName } from '@modules/remote-lib';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import fs from 'fs/promises';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import * as readline from 'readline';
import OpenAI from 'openai';

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

setConfig({
    CC_PERSIST_EMBEDDING_CACHE: true,
});
const EMBEDDING_REDIS_TTL = 604800; // 1 week
const HISTORY_REDIS_TTL = 86400; // 24 hours
const ALIVE_REDIS_TTL = 3600; // 1 hour
const getRedis$1 = singleshot(() => new Promise((res) => {
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
History.useHistoryAdapter(class {
    async *iterate() {
        for await (const message of this._messages) {
            yield message;
        }
    }
    constructor(clientId) {
        this.clientId = clientId;
        this._redis = null;
        this._messages = [];
        this.waitForInit = singleshot(async () => {
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
PersistSwarm.usePersistActiveAgentAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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
PersistSwarm.usePersistNavigationStackAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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
PersistState.usePersistStateAdapter(class {
    constructor(stateName) {
        this.stateName = stateName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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
PersistStorage.usePersistStorageAdapter(class {
    constructor(storageName) {
        this.storageName = storageName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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
PersistMemory.usePersistMemoryAdapter(class {
    constructor(memoryName) {
        this.memoryName = memoryName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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
PersistPolicy.usePersistPolicyAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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
PersistAlive.usePersistAliveAdapter(class {
    constructor(swarmName) {
        this.swarmName = swarmName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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
PersistEmbedding.usePersistEmbeddingAdapter(class {
    constructor(embeddingName) {
        this.embeddingName = embeddingName;
        this._redis = null;
        this.waitForInit = singleshot(async () => {
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

setConfig({
    CC_KEEP_MESSAGES: 50,
    CC_LOGGER_ENABLE_INFO: true,
    CC_LOGGER_ENABLE_DEBUG: true,
    CC_LOGGER_ENABLE_LOG: true,
});
{
    const logger = createLogger("agent-swarm-kit.log");
    swarm.loggerService.setLogger({
        log: (...args) => logger.log(...args),
        debug: (...args) => logger.info(...args),
        info: (...args) => logger.info(...args),
    });
}
dumpClientPerformance.runAfterExecute();

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

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
    let swarm = SwarmName.RootSwarmEn;
    if (clientLocale === "uz") {
        swarm = SwarmName.RootSwarmUz;
    }
    else if (clientLocale === "ru") {
        swarm = SwarmName.RootSwarmRu;
    }
    return {
        async onOpen(_, ws) {
            await Chat.beginChat(clientId, swarm);
            const unToken = listenEvent(clientId, "llm-new-token", (token) => {
                ws.send(JSON.stringify({ type: "token", token }));
            });
            const unImage = listenEvent(clientId, "new-generated-image", async (path) => {
                ws.send(JSON.stringify({
                    type: "image",
                    image: await fileToBase64(path),
                }));
            });
            const unCreditPayAction = listenEvent(clientId, `app-action-credit-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-credit-payment",
                    payload,
                }));
            });
            const unElectricityPayAction = listenEvent(clientId, `app-action-electricity-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-electricity-payment",
                    payload,
                }));
            });
            const unGasPayAction = listenEvent(clientId, `app-action-gas-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-gas-payment",
                    payload,
                }));
            });
            const unGovernmentPayAction = listenEvent(clientId, `app-action-government-service-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-government-service-payment",
                    payload,
                }));
            });
            const unInternetPayAction = listenEvent(clientId, `app-action-internet-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-internet-payment",
                    payload,
                }));
            });
            const unMobilePayAction = listenEvent(clientId, `app-action-mobile-operator-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-mobile-operator-payment",
                    payload,
                }));
            });
            const unP2PPayAction = listenEvent(clientId, `app-action-send-payment-modal`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-send-payment-modal",
                    payload,
                }));
            });
            const unTransportPayAction = listenEvent(clientId, `app-action-transport-service-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-transport-service-payment",
                    payload,
                }));
            });
            const unWaterPayAction = listenEvent(clientId, `app-action-water-payment`, async (payload) => {
                ws.send(JSON.stringify({
                    type: "app-action-water-payment",
                    payload,
                }));
            });
            Chat.listenDispose(clientId, swarm, () => {
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
                const completion = await Chat.sendMessage(clientId, incoming.data, swarm);
                ws.send(JSON.stringify({
                    type: "completion",
                    completion,
                }));
            }
            catch (error) {
                console.log(getErrorMessage(error));
            }
        },
        onClose: () => {
            console.log("Disconnected");
            Chat.dispose(clientId, swarm);
        },
    };
}));

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || "";
const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
});
// Helper for readline prompts during first login
function prompt(question) {
    const rl = readline.createInterface({
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
    await client.start({
        phoneNumber: async () => await prompt("Telefon raqamingizni kiriting: "),
        password: async () => await prompt("2FA parolingizni kiriting: "),
        phoneCode: async () => await prompt("Telegram yuborgan kodni kiriting: "),
        onError: (err) => console.error("Telegram auth error:", err),
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
const SIX_HOURS = 6 * 60 * 60 * 1000;
const POST_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const openai = new OpenAI({
    apiKey: process.env.CC_OPENAI_API_KEY,
});
const getRedis = singleshot(() => new Promise((res) => {
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
                    content: `Sen ish e'lonlarini formatlash bo'yicha yordamchisan. Berilgan matndan ish e'loni ma'lumotlarini ajratib ol va AYNAN quyidagi formatda qaytar. Agar matn ish e'loni bo'lmasa, "SKIP" deb yoz.

FORMAT (aynan shu tartibda, hech narsa qo'shma, hech narsa olib tashlama):

{Lavozim nomi}

— Ish holati: #aktiv

🏢 Kompaniya: {kompaniya yoki "Ko'rsatilmagan"}

— Ish turi: {Offline/Online/Gibrid}

💰 Maosh: {maosh yoki "Kelishiladi"}

— Talablar:
{talablar ro'yxati}

— Murojaat uchun: {aloqa ma'lumotlari}

📍 Manzil: {manzil yoki "Ko'rsatilmagan"}

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
// Scrape latest posts from source channels
async function scrapeSourceChannels() {
    if (!sourceChannels.length) {
        console.log("[Scraper] No source channels configured");
        return;
    }
    if (!channelUsername) {
        console.log("[Scraper] No target channel configured");
        return;
    }
    console.log(`[Scraper] Scraping ${sourceChannels.length} source channels...`);
    for (const channel of sourceChannels) {
        try {
            console.log(`[Scraper] Reading from ${channel}...`);
            const messages = await client.getMessages(channel, { limit: 20 });
            let newPosts = 0;
            for (const msg of messages) {
                if (!msg.text || msg.text.length < 30)
                    continue;
                const alreadyScraped = await isAlreadyScraped(channel, msg.id);
                if (alreadyScraped)
                    continue;
                // Format the post
                const formatted = await formatJobPost(msg.text, channel);
                if (!formatted) {
                    // Mark as scraped even if not a job post, to avoid re-processing
                    const redis = await getRedis();
                    await redis.setex(`scraped:${channel}:${msg.id}`, POST_TTL, "1");
                    continue;
                }
                // Post to target channel
                const sent = await client.sendMessage(channelUsername, {
                    message: formatted,
                });
                // Save mapping
                await savePostMapping(channel, msg.id, sent.id);
                newPosts++;
                console.log(`[Scraper] Posted from ${channel}#${msg.id} → ${channelUsername}#${sent.id}`);
                // Small delay to avoid flood
                await new Promise((r) => setTimeout(r, 2000));
            }
            console.log(`[Scraper] ${channel}: ${newPosts} new posts`);
        }
        catch (error) {
            console.error(`[Scraper] Error scraping ${channel}:`, error);
        }
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
                        await client.invoke(new Api.messages.EditMessage({
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
// Main CRON job
async function runScraper() {
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
    console.log(`[Scraper] CRON: every 6 hours`);
    // First run after 10 seconds (let everything initialize)
    setTimeout(() => {
        runScraper();
    }, 10000);
    // Then every 6 hours
    setInterval(() => {
        runScraper();
    }, SIX_HOURS);
}

const main = async () => {
    if (CC_EXECUTE_TEST) {
        return;
    }
    const server = serve({
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
