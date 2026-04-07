import { event, Logger } from "agent-swarm-kit";


export const commitAppAction = async <T extends object = object>(clientId: string, type: string, payload: T) => {
    await Logger.logClient(clientId, `[Action commit]: ${type}`, {
        payload,
    });
    await event(clientId, `app-action-${type}`, payload);
};

export default commitAppAction;
