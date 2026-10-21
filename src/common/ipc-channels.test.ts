import { describe, expectTypeOf, it } from "vitest";
import { ipcChannels } from "./ipc-channels";

import type { IpcChannel } from "./ipc-channels";

describe("ipcChannels", () => {
  // Checked by `pnpm type:check`: a channel added to the contract but not to
  // `ipcChannels`, or the other way round, fails to compile here.
  it("names exactly the channels of the IPC contract", () => {
    expectTypeOf<(typeof ipcChannels)[keyof typeof ipcChannels]>().toEqualTypeOf<IpcChannel>();
  });
});
