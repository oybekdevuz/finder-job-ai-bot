import { addTriageNavigation } from "agent-swarm-kit";
import { ToolName } from "src/enum/ToolName";


addTriageNavigation({
  toolName: ToolName.NavigateToTriageToolUz,
  description: "Har qanday o'z mavzuingdan boshqa savollar uchun triage agentga o'tkazish",
  lastMessage: (_, lastMessage, lastAgent) => `Men hozirgina ${lastAgent} gaplashdim. Mening senga xabarim: ${lastMessage}`,
})