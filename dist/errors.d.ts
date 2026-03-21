export declare class ScratchpadError extends Error {
    readonly code: string;
    constructor(msg: string, code: string);
}
export declare class ScratchpadConfigError extends ScratchpadError {
    constructor(msg: string);
}
export declare class ScratchpadVersionError extends ScratchpadError {
    readonly version: number;
    constructor(version: number);
}
//# sourceMappingURL=errors.d.ts.map