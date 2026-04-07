import { ICompletionArgs, IModelMessage } from 'agent-swarm-kit';
import * as functools_kit from 'functools-kit';
import { TSubject } from 'functools-kit';
import Redis from 'ioredis';
import LoggerService$1 from 'src/lib/services/base/LoggerService';
import EmbeddingService$1 from 'src/lib/services/api/EmbeddingService';
import { ICompanyDto } from 'src/schema/Company.schema';

interface IContext {
    clientId: string;
}

declare class LoggerService {
    protected readonly contextService: {
        readonly context: IContext;
    };
    private _logger;
    private _debug;
    log: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    debugCtx: (...args: any[]) => void;
    setPrefix: (prefix: string) => void;
    setDebug: (debug: boolean) => void;
    logCtx: (...args: any[]) => void;
}

declare class CompletionService {
    readonly loggerService: LoggerService;
    getCompletion: ({ agentName, messages: rawMessages, mode, tools, }: ICompletionArgs) => Promise<IModelMessage>;
}

type Embeddings = number[];
declare class EmbeddingService {
    readonly loggerService: LoggerService;
    createEmbedding: (text: string) => Promise<Embeddings>;
    calculateEmbeddings: (a: Embeddings, b: Embeddings) => Promise<number>;
}

declare class ErrorService {
    get beforeExitSubject(): TSubject<void>;
    handleGlobalError: (error: Error) => Promise<void>;
    private _listenForError;
    protected init: () => void;
}

declare class RedisService {
    private readonly loggerService;
    getRedis: (() => Promise<Redis>) & functools_kit.ISingleshotClearable;
    private makePingInterval;
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

declare class CompanyDbPrivateService {
    readonly loggerService: LoggerService$1;
    readonly embeddingService: EmbeddingService$1;
    create: (dto: any) => Promise<any>;
    remove: (id: string) => Promise<void>;
    findByFulltext: (search: string) => Promise<any[]>;
}

interface ICompanyDbPrivateService extends CompanyDbPrivateService {
}
type IgnoreKeys = keyof {
    loggerService: never;
    contextService: never;
    embeddingService: never;
    TargetModel: never;
};
type TCompanyDbPrivateService = {
    [key in Exclude<keyof ICompanyDbPrivateService, IgnoreKeys>]: unknown;
};
declare class CompanyDbPublicService implements TCompanyDbPrivateService {
    readonly loggerService: LoggerService;
    readonly contextService: {
        readonly context: IContext;
    };
    readonly companyDbPrivateService: CompanyDbPrivateService;
    remove: (id: string, clientId: string) => Promise<void>;
    create: (dto: ICompanyDto, clientId: string) => Promise<any>;
    findByFulltext: (search: string, clientId: string) => Promise<any[]>;
}

declare const ioc: {
    companyDbPrivateService: CompanyDbPrivateService;
    companyDbPublicService: CompanyDbPublicService;
    loggerService: LoggerService;
    errorService: ErrorService;
    contextService: {
        readonly context: IContext;
    };
    redisService: RedisService;
    embeddingService: EmbeddingService;
    completionService: CompletionService;
};

export { ioc };
