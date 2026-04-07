import { addTriageNavigation } from "agent-swarm-kit";
import { ToolName } from "src/enum/ToolName";


addTriageNavigation({
  toolName: ToolName.NavigateToTriageToolRu,
  description: "Переключиться на агента Triage для вопросов не по теме",
  lastMessage: (_, lastMessage, lastAgent) => `I just spoke to ${lastAgent}. My message is: ${lastMessage}`,
})