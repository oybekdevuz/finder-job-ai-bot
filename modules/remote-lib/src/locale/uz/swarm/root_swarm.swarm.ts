import { addSwarm } from "agent-swarm-kit";
import { AgentName } from "../../../enum/AgentName";
import { SwarmName } from "../../../enum/SwarmName";

addSwarm({
  swarmName: SwarmName.RootSwarm,
  agentList: [AgentName.TriageAgentUz],
  defaultAgent: AgentName.TriageAgentUz,
});
