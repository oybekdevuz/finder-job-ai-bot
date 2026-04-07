import {
  addCompletion,
  Logger,
  event,
  type ICompletionArgs,
  type IModelMessage,
} from "agent-swarm-kit";
import { CompletionName } from "../enum/CompletionName";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { randomString } from "functools-kit";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { CC_GEMINI_API_KEY, CC_GEMINI_CHAT_MODEL } from "src/config/params";

const chat = new ChatGoogleGenerativeAI({
  apiKey: CC_GEMINI_API_KEY,
  model: CC_GEMINI_CHAT_MODEL || "gemini-2.0-flash",
  streaming: true,
  temperature: 0,
});

addCompletion({
  completionName: CompletionName.GeminiCompletion,
  getCompletion: async ({
    agentName,
    messages: rawMessages,
    mode,
    tools: rawTools,
    clientId,
  }: ICompletionArgs): Promise<IModelMessage> => {
    Logger.logClient(
      clientId,
      `Using ${CompletionName.GeminiCompletion} completion`,
      JSON.stringify(rawMessages)
    );

    // bindTools LangChain tool formatini kutadi
    const tools = rawTools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const chatInstance =
      tools && tools.length > 0 ? chat.bindTools(tools) : chat;

    // Gemini uchun: barcha system xabarlarni birlashtirib bitta qilib boshiga qo'yish
    const systemMessages = rawMessages.filter((msg) => msg.role === "system");
    const nonSystemMessages = rawMessages.filter((msg) => msg.role !== "system");

    const formattedMessages: BaseMessage[] = [];

    // Birinchi bo'lib birlashtirilgan system xabarni qo'shish
    if (systemMessages.length > 0) {
      const combinedSystemContent = systemMessages
        .map((msg) => msg.content || "")
        .join("\n\n");
      formattedMessages.push(new SystemMessage({ content: combinedSystemContent }));
    }

    // Qolgan xabarlarni qo'shish
    for (const msg of nonSystemMessages) {
      const { role, content, tool_calls, tool_call_id } = msg;

      switch (role) {
        case "user":
          formattedMessages.push(new HumanMessage({ content: content || "" }));
          break;
        case "assistant":
          formattedMessages.push(new AIMessage({
            content: content || "",
            tool_calls: tool_calls?.map((tc) => ({
              id: tc.id || randomString(),
              name: tc.function.name,
              args:
                typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments,
            })),
          }));
          break;
        case "tool":
          formattedMessages.push(new ToolMessage({
            content: content || "",
            tool_call_id: tool_call_id || "unknown",
          }));
          break;
        default:
          formattedMessages.push(new HumanMessage({ content: content || "" }));
      }
    }

    try {
      const response = await chatInstance.invoke(formattedMessages, {
        callbacks: [
          {
            handleLLMNewToken(token: string) {
              event(clientId, "llm-new-token", token);
            },
          },
        ],
      });

      const { content, tool_calls } = response;
      const text = typeof content === "string" ? content : "";

      return {
        content: text,
        mode,
        agentName,
        role: "assistant",
        tool_calls: tool_calls?.map((tc) => ({
          id: tc.id || randomString(),
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.args,
          },
        })),
      };
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError",
        stack: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? error.cause : undefined,
        raw: error,
      };
      Logger.logClient(
        clientId,
        "Gemini Error",
        JSON.stringify(errorDetails, null, 2)
      );
      console.error("[GeminiCompletion] Error:", errorDetails);
      // Xatolik bo'lsa, hech bo'lmasa foydalanuvchiga xabar qaytarish uchun
      return {
        content:
          "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        mode,
        agentName,
        role: "assistant",
      };
    }
  },
});
