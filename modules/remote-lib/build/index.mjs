import { addCompletion, Logger, event, addAgent, addTool, commitToolOutput, execute, addSwarm } from 'agent-swarm-kit';
import { AIMessage, SystemMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { randomString, str } from 'functools-kit';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

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

var CompletionName;
(function (CompletionName) {
    CompletionName["OllamaCompletion"] = "ollama_completion";
    CompletionName["LMStudioCompletion"] = "lmstudio_completion";
    CompletionName["OpenAICompletion"] = "openai_completion";
})(CompletionName || (CompletionName = {}));

const CC_OPENAI_API_KEY = process.env.CC_OPENAI_API_KEY || "nomic-embed-text";
const CC_OPENAI_CHAT_MODEL = process.env.CC_OPENAI_CHAT_MODEL || "gpt-3.5-turbo";
process.env.CC_REDIS_HOST || "127.0.0.1";
parseInt(process.env.CC_REDIS_PORT) || 6379;
process.env.CC_REDIS_PASSWORD || "";
parseInt(process.env.CC_VECTOR_SEARCH_LIMIT) || 1;
parseFloat(process.env.CC_VECTOR_SEARCH_SIMILARITY) || 0.55;
!!process.env.CC_REDIS_FLUSHALL || false;
parseInt(process.env.CC_WWWROOT_PORT) || 80;
!!process.env.CC_EXECUTE_TEST;
!!process.env.CC_ENABLE_TERMINATE_SESSIONS || false;
process.env.CC_WEATHER_API_KEY || "text-embedding-ada-002";
process.env.CC_CHANNEL_USERNAME || "";

class CustomModel extends ChatOpenAI {
    async getNumTokens(content) {
        if (typeof content !== "string") {
            return 0;
        }
        return Math.ceil(content.length / 4);
    }
}
const chat = new CustomModel({
    apiKey: CC_OPENAI_API_KEY,
    model: CC_OPENAI_CHAT_MODEL,
    streaming: true,
    temperature: 0
});
addCompletion({
    completionName: CompletionName.OpenAICompletion,
    getCompletion: async ({ agentName, messages: rawMessages, mode, tools: rawTools, clientId, }) => {
        Logger.logClient(clientId, `Using ${CompletionName.OpenAICompletion} completion`, JSON.stringify(rawMessages));
        const tools = rawTools?.map(({ type, function: f }) => ({
            type: type,
            function: {
                name: f.name,
                parameters: f.parameters,
            },
        }));
        const chatInstance = tools ? chat.bindTools(tools) : chat;
        const { content, tool_calls } = await chatInstance.invoke(rawMessages.map(({ role, tool_calls, tool_call_id, content }) => {
            if (role === "assistant") {
                return new AIMessage({
                    tool_calls: tool_calls?.map(({ function: f, id }) => ({
                        id: id,
                        name: f.name,
                        args: f.arguments,
                    })),
                    content,
                });
            }
            if (role === "system") {
                return new SystemMessage({
                    content,
                });
            }
            if (role === "user") {
                return new HumanMessage({
                    content,
                });
            }
            if (role === "tool") {
                return new ToolMessage({
                    tool_call_id: tool_call_id,
                    content,
                });
            }
            return "";
        }), {
            callbacks: [
                {
                    handleLLMNewToken(token) {
                        event(clientId, "llm-new-token", token);
                    },
                },
            ],
        });
        const text = typeof content === "string"
            ? content
            : content
                .filter((part) => part.type === "text")
                .map((c) => c.text)
                .join("");
        return {
            content: text,
            mode,
            agentName,
            role: "assistant",
            tool_calls: tool_calls?.map(({ name, id, args }) => ({
                id: id ?? randomString(),
                type: "function",
                function: {
                    name,
                    arguments: args,
                },
            })),
        };
    },
});

var AgentName;
(function (AgentName) {
    AgentName["TriageAgentEn"] = "triage_agent_en";
    AgentName["TriageAgentUz"] = "triage_agent_uz";
    AgentName["TriageAgentRu"] = "triage_agent_ru";
    AgentName["P2PAgentEn"] = "p2p_agent_en";
    AgentName["P2PAgentUz"] = "p2p_agent_uz";
    AgentName["P2PAgentRu"] = "p2p_agent_ru";
})(AgentName || (AgentName = {}));

var ToolName;
(function (ToolName) {
    ToolName["PostToChannelTool"] = "post_to_channel_tool";
    ToolName["SearchLegalDocsToolUz"] = "qonunlarni_qidirish_tool_uz";
    ToolName["SearchLegalDocsToolRu"] = "search_legal_docs_tool_ru";
    ToolName["SearchLegalDocsToolEn"] = "search_legal_docs_tool_en";
    ToolName["NavigateToTriageToolUz"] = "navigate_to_triage_tool_uz";
    ToolName["NavigateToTriageToolRu"] = "navigate_to_triage_tool_ru";
})(ToolName || (ToolName = {}));

const POLICY_PROMPT = str.newline([
    "Agar foydalanuvchi din haqida so'rasa, javob berma.",
    "Agar foydalanuvchi jinsiy mazmundagi narsalar haqida so'rasa, javob berma.",
    "Agar foydalanuvchi zo'ravonlik haqida so'rasa, javob berma.",
    "Agar foydalanuvchi qimor haqida so'rasa, javob berma.",
    "Agar foydalanuvchi urushlar haqida so'rasa, javob berma.",
]);
const JOB_FINDER_PROMPT = `
Sen — Limon Jobs kanalining adminisan. Sen bot emasan, odamsan. Xuddi oddiy admin kabi gaplash.

Sening vazifang: Odamlar senga ish e'loni yozsa, uni qabul qilib kanalga joylash.

GAPLASHISH USLUBI:
- Oddiy, samimiy, qisqa gaplash. Xuddi do'stingga yozgandek.
- "Salom aka/opa", "Ha, tushundim", "Tayyor, joyladim!" kabi oddiy so'zlar ishlat.
- Rasmiy va robot kabi gaplashma. "Sizning so'rovingiz qabul qilindi" kabi gaplarni ISHLATMA.
- Savollarga qisqa javob ber. Kerak bo'lsa emoji ishlat, lekin haddan oshirma.

ISH E'LONI QABUL QILISH:
1. Odam ish e'loni bermoqchi bo'lsa, undan quyidagilarni so'ra (agar bermagan bo'lsa):
   - Lavozim nomi
   - Kompaniya nomi
   - Ish turi (offline/online/gibrid)
   - Maosh
   - Talablar
   - Murojaat uchun (telefon, username yoki link)
   - Manzil
2. Barcha ma'lumotlar to'plangach, post_to_channel toolini chaqir. Post matni AYNAN shu formatda bo'lishi SHART:

{Lavozim nomi}

— Ish holati: #aktiv

🏢 Kompaniya: {kompaniya}

— Ish turi: {Offline/Online/Gibrid}

💰 Maosh: {maosh}

— Talablar:
{talablar}

— Murojaat uchun: {aloqa}

📍 Manzil: {manzil}

🍋Limon Jobs – limonni ishlang!

Bepul e'lon joylang: @limonjobs_admin

3. Post qilingandan keyin "Tayyor, joyladim! ✅" deb qisqa javob ber.

MUHIM: Post formatini o'zgartirma, AYNAN shu shablonda bo'lsin.
`;

const AGENT_PROMPT = str.newline([
    "Sen Limon Jobs kanalining adminisan. Odamlar bilan xuddi oddiy inson kabi gaplash.",
    "Bot emassan, adminsan. Samimiy, qisqa va oddiy gaplash.",
    "Toollar borligini foydalanuvchi bilmasligi kerak.",
]);
addAgent({
    agentName: AgentName.TriageAgentUz,
    prompt: str.newline(AGENT_PROMPT),
    system: [JOB_FINDER_PROMPT, POLICY_PROMPT],
    completion: CompletionName.OpenAICompletion,
    tools: [ToolName.PostToChannelTool],
    callbacks: {
        onResurrect(clientId, agentName, mode, reason) {
            Logger.logClient(clientId, "Resurrected", agentName, mode, reason);
        },
    },
});

const PARAMETER_SCHEMA = z
    .object({
    message: z.string().describe("Kanalga yuboriladigan post matni"),
})
    .strict();
// Telegram client will be injected from the main app
let sendToChannel = null;
function setSendToChannel(fn) {
    sendToChannel = fn;
}
addTool({
    toolName: ToolName.PostToChannelTool,
    type: "function",
    validate: async ({ params }) => {
        return PARAMETER_SCHEMA.safeParse(params).success;
    },
    call: async ({ toolId, clientId, agentName, params }) => {
        const message = params.message;
        if (!message || !message.trim()) {
            await commitToolOutput(toolId, "Xatolik: Post matni bo'sh bo'lmasligi kerak.", clientId, agentName);
            await execute("Foydalanuvchiga post matni bo'sh ekanligini ayting va qayta so'rang.", clientId, agentName);
            return;
        }
        if (!sendToChannel) {
            await commitToolOutput(toolId, "Xatolik: Telegram client ulanmagan yoki kanal sozlanmagan.", clientId, agentName);
            return;
        }
        try {
            console.log(`[PostToChannel] Sending post to channel...`);
            await sendToChannel(message);
            console.log(`[PostToChannel] Post sent successfully`);
            await commitToolOutput(toolId, "Post muvaffaqiyatli kanalga joylandi.", clientId, agentName);
            await execute("Foydalanuvchiga post muvaffaqiyatli kanalga joylanganligini xabar bering.", clientId, agentName);
        }
        catch (error) {
            console.error(`[PostToChannel] Error:`, error);
            await commitToolOutput(toolId, `Xatolik: Kanalga post yuborishda muammo yuz berdi - ${error}`, clientId, agentName);
            await execute("Foydalanuvchiga kanalga post yuborishda xatolik yuz berganini ayting.", clientId, agentName);
        }
    },
    function: {
        name: "post_to_channel_tool",
        description: "Telegram kanalga ish e'lonini post qilish. Foydalanuvchidan barcha kerakli ma'lumotlar (lavozim, kompaniya, maosh, talablar, aloqa) to'plangandan keyin, chiroyli formatda post tayyorlab shu tool orqali kanalga joylang.",
        parameters: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "Kanalga yuboriladigan tayyor post matni. Emoji va chiroyli format bilan. Masalan:\n\n🏢 Kompaniya: ...\n💼 Lavozim: ...\n📍 Joylashuv: ...\n💰 Maosh: ...\n📋 Talablar: ...\n📞 Aloqa: ...",
                },
            },
            required: ["message"],
        },
    },
});

var SwarmName;
(function (SwarmName) {
    SwarmName["RootSwarm"] = "root_swarm";
    SwarmName["RootSwarmEn"] = "en_swarm";
    SwarmName["RootSwarmUz"] = "uz_swarm";
    SwarmName["RootSwarmRu"] = "ru_swarm";
})(SwarmName || (SwarmName = {}));

addSwarm({
    swarmName: SwarmName.RootSwarm,
    agentList: [AgentName.TriageAgentUz],
    defaultAgent: AgentName.TriageAgentUz,
});

export { AgentName, CompletionName, SwarmName, ToolName, setSendToChannel };
