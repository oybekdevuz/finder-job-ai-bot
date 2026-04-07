import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import ErrorService from "./services/base/ErrorService";

export const baseServices = {
    errorService: inject<ErrorService>(TYPES.errorService),
}

const ioc = {
    ...baseServices
}

Object.assign(globalThis, { ioc });

init();

export default ioc;
