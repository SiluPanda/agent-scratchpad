export class ScratchpadError extends Error {
  constructor(msg: string, readonly code: string) {
    super(msg);
    this.name = 'ScratchpadError';
  }
}

export class ScratchpadConfigError extends ScratchpadError {
  constructor(msg: string) {
    super(msg, 'SCRATCHPAD_CONFIG_ERROR');
  }
}

export class ScratchpadVersionError extends ScratchpadError {
  constructor(readonly version: number) {
    super(`Unsupported snapshot version: ${version}`, 'SCRATCHPAD_VERSION_ERROR');
  }
}
