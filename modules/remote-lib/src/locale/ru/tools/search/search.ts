import {
  addTool,
  commitSystemMessage,
  commitToolOutput,
  execute,
  getLastUserMessage,
  Schema,
  Storage,
} from "agent-swarm-kit";
import { str } from "functools-kit";
import { StorageName } from "src/enum/StorageName";
import { ToolName } from "src/enum/ToolName";
import { z } from "zod";

const PARAMETER_SCHEMA = z
  .object({
    description: z.string(),
  })
  .strict();

addTool({
  toolName: ToolName.SearchLegalDocsToolRu,
  type: "function",
  validate: async ({ clientId, agentName, params }) => {
    const validationResult = PARAMETER_SCHEMA.safeParse(params);
    return validationResult.success;
  },
  call: async ({ toolId, clientId, agentName, params }) => {
    let search: string;
    if (typeof params.description === "string") {
      search = params.description.trim();
    } else {
      search = await getLastUserMessage(clientId);
    }

    if (!search) {
      await commitToolOutput(
        toolId,
        str.newline(`Информация не найдена`),
        clientId,
        agentName
      );
      await execute(
        "Попросите пользователя предоставить более подробную информацию.",
        clientId,
        agentName
      );
      return;
    }

    const information = await Storage.take({
      search,
      total: 1,
      clientId,
      agentName,
      score: 0.6,
      storageName: StorageName.LegalDocsStorageRu,
    });

    if (information?.length) {
      await commitToolOutput(
        toolId,
        str.newline(
          `Найдена следующая информация по запросу ${search}: ${Schema.serialize(
            information
          )}`
        ),
        clientId,
        agentName
      );
      await commitSystemMessage(
        "Не ищите эту информацию повторно!",
        clientId,
        agentName
      );
      await execute("", clientId, agentName);
      return;
    }

    await commitToolOutput(
      toolId,
      str.newline([
        "Информация не найдена в базе данных.",
        "Но скажите пользователю, что вы не знаете, а не что информация не найдена в базе данных.",
      ]),
      clientId,
      agentName
    );
    await execute(
      "Попросите пользователя уточнить критерии поиска.",
      clientId,
      agentName
    );
  },
  function: {
    name: "search_legal_docs_tool",
    description: "Получить информацию о юридических документах.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            "ОБЯЗАТЕЛЬНО: Укажите описание юридического документа с несколькими ключевыми словами для поиска соответствующей информации в базе данных.",
        },
      },
      required: ["description"],
    },
  },
});
