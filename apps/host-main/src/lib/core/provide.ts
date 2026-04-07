import ErrorService from "../services/base/ErrorService";
import { provide } from "./di";
import { TYPES } from "./types";

{
    provide(TYPES.errorService, () => new ErrorService());
}
