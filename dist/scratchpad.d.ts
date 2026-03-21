import { Scratchpad, ScratchpadOptions, ScratchpadSnapshot } from './types.js';
export declare function createScratchpad(options?: ScratchpadOptions): Scratchpad;
export declare function fromSnapshot(snap: ScratchpadSnapshot, opts?: ScratchpadOptions): ReturnType<typeof createScratchpad>;
export type { Scratchpad, ScratchpadEntry, ScratchpadOptions, ScratchpadSnapshot, ScratchpadStats, ToContextOptions, EntryOptions, ScratchpadEventName, ScratchpadEventHandler, ScratchpadEvents, PersistenceAdapter, } from './types.js';
//# sourceMappingURL=scratchpad.d.ts.map