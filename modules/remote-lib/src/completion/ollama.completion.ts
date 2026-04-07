import {
  addCompletion,
  Logger,
  event,
  type ICompletionArgs,
  type IModelMessage,
} from "agent-swarm-kit";
import { CompletionName } from "../enum/CompletionName";
import { ChatOllama } from "@langchain/ollama";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  AIMessage,
  type MessageContentText,
} from "@langchain/core/messages";
import { randomString, str } from "functools-kit";
import type { ToolDefinition } from "@langchain/core/language_models/base";

const chat = new ChatOllama({
  baseUrl: "http://127.0.0.1:11434",
  model: "llama3.1:8b",
  streaming: true,
});

const TOOL_PROTOCOL_PROMPT = str.newline(
  `For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:`,
  `<tool_call>`,
  `{"name": <function-name>, "arguments": <args-json-object>}`,
  `</tool_call>`
);

addCompletion({
  completionName: CompletionName.OllamaCompletion,
  getCompletion: async ({
    agentName,
    messages: rawMessages,
    mode,
    tools: rawTools,
    clientId,
  }: ICompletionArgs): Promise<IModelMessage> => {
    Logger.logClient(
      clientId,
      `Using ${CompletionName.OllamaCompletion} completion`,
      JSON.stringify(rawMessages)
    );

    const tools = rawTools?.map(
      ({ type, function: f }): ToolDefinition => ({
        type: type as "function",
        function: {
          name: f.name,
          parameters: f.parameters,
        },
      })
    );

    const chatInstance = tools ? chat.bindTools(tools) : chat;

    try {
      const { content, tool_calls } = await chatInstance.invoke(
        [
          new SystemMessage(TOOL_PROTOCOL_PROMPT),
          ...rawMessages.map(({ role, tool_calls, tool_call_id, content }) => {
            if (role === "assistant") {
              return new AIMessage({
                tool_calls: tool_calls?.map(({ function: f, id }) => ({
                  id: id!,
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
                tool_call_id: tool_call_id!,
                content,
              });
            }
            return "";
          }),
        ],
        {
          tools,
          callbacks: [
            {
              handleLLMNewToken(token: string) {
                event(clientId, "llm-new-token", token);
              },
            },
          ],
        }
      );

      const text =
        typeof content === "string"
          ? content
          : content
              .filter((part) => part.type === "text")
              .map((c) => (c as MessageContentText).text)
              .join("");

      const result = {
        content: text,
        mode,
        agentName,
        role: "assistant" as const,
        tool_calls: tool_calls?.map(({ name, id, args }) => ({
          id: id ?? randomString(),
          type: "function" as const,
          function: {
            name,
            arguments: args,
          },
        })),
      };

      // Model output'ni logga chiqarish
      Logger.logClient(
        clientId,
        "[OllamaCompletion] Model output",
        JSON.stringify(result, null, 2)
      );
      console.log("[OllamaCompletion] Model output:", result);

      return result;
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
        "Ollama Error",
        JSON.stringify(errorDetails, null, 2)
      );
      console.error("[OllamaCompletion] Error:", errorDetails);
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
