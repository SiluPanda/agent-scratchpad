"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScratchpadVersionError = exports.ScratchpadConfigError = exports.ScratchpadError = void 0;
class ScratchpadError extends Error {
    code;
    constructor(msg, code) {
        super(msg);
        this.code = code;
        this.name = 'ScratchpadError';
    }
}
exports.ScratchpadError = ScratchpadError;
class ScratchpadConfigError extends ScratchpadError {
    constructor(msg) {
        super(msg, 'SCRATCHPAD_CONFIG_ERROR');
    }
}
exports.ScratchpadConfigError = ScratchpadConfigError;
class ScratchpadVersionError extends ScratchpadError {
    version;
    constructor(version) {
        super(`Unsupported snapshot version: ${version}`, 'SCRATCHPAD_VERSION_ERROR');
        this.version = version;
    }
}
exports.ScratchpadVersionError = ScratchpadVersionError;
//# sourceMappingURL=errors.js.map