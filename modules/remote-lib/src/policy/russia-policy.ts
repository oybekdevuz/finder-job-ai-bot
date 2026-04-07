import { addPolicy } from "agent-swarm-kit";
import { PolicyName } from "../enum/PolicyName";

addPolicy({
    policyName: PolicyName.RussiaPolicy,
    validateInput: (input) => {
        if (input.toLowerCase().includes("russia")) {
            return false;
        }
        return true
    },
    validateOutput: (output) => {
        if (output.toLowerCase().includes("russia")) {
            return false;
        }
        return true
    },
    banMessage: "I am not going to talk about Russia",
    autoBan: true,
})
