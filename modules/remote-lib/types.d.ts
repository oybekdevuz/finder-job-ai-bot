declare function setSendToChannel(fn: (message: string) => Promise<void>): void;

declare enum AgentName {
    TriageAgentEn = "triage_agent_en",
    TriageAgentUz = "triage_agent_uz",
    TriageAgentRu = "triage_agent_ru",
    P2PAgentEn = "p2p_agent_en",
    P2PAgentUz = "p2p_agent_uz",
    P2PAgentRu = "p2p_agent_ru"
}

declare enum ToolName {
    PostToChannelTool = "post_to_channel_tool",
    SearchLegalDocsToolUz = "qonunlarni_qidirish_tool_uz",
    SearchLegalDocsToolRu = "search_legal_docs_tool_ru",
    SearchLegalDocsToolEn = "search_legal_docs_tool_en",
    NavigateToTriageToolUz = "navigate_to_triage_tool_uz",
    NavigateToTriageToolRu = "navigate_to_triage_tool_ru"
}

declare enum CompletionName {
    OllamaCompletion = "ollama_completion",
    CohereCompletion = "cohere_completion",
    LMStudioCompletion = "lmstudio_completion",
    OpenAICompletion = "openai_completion",
    XAICompletion = "xai_completion",
    GeminiCompletion = "gemini_completion"
}

declare enum SwarmName {
    RootSwarm = "root_swarm",
    RootSwarmEn = "en_swarm",
    RootSwarmUz = "uz_swarm",
    RootSwarmRu = "ru_swarm"
}

export { AgentName, CompletionName, SwarmName, ToolName, setSendToChannel };
