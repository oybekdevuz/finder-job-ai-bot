import { addPolicy } from "agent-swarm-kit";
import { PolicyName } from "../enum/PolicyName";

addPolicy({
    policyName: PolicyName.CrimeaPolicy,
    validateInput: (input) => {
        if (input.toLowerCase().includes("crimea")) {
            return false;
        }
        return true
    },
    validateOutput: (output) => {
        if (output.toLowerCase().includes("crimea")) {
            return false;
        }
        return true
    },
    banMessage: "I am not going to talk about Crimea",
    autoBan: true,
})
