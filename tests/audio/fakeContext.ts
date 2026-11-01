/** A stand-in for the browser's AudioContext (M9 tests): records what is made and started, makes no sound. */
export interface FakeContext {
  readonly context: AudioContext;
  readonly started: { readonly type: string; readonly at: number; readonly freq: number }[];
  readonly calls: string[];
  setTime(seconds: number): void;
}

class FakeParam {
  value = 0;
  readonly events: string[] = [];
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export function fakeContext(): FakeContext {
  const started: FakeContext['started'] = [];
  const calls: string[] = [];
  let time = 0;
  let state: AudioContextState = 'suspended';
  const node = (): Record<string, unknown> => ({
    connect: (target: unknown) => target,
    disconnect: () => undefined,
  });
  const context = {
    get currentTime() {
      return time;
    },
    get state() {
      return state;
    },
    sampleRate: 8000,
    destination: node(),
    resume: () => {
      calls.push('resume');
      state = 'running';
      return Promise.resolve();
    },
    suspend: () => {
      calls.push('suspend');
      state = 'suspended';
      return Promise.resolve();
    },
    createGain: () => ({ ...node(), gain: new FakeParam() }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() }),
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource: () => {
      const source = { ...node(), buffer: null, onended: null, start: (at: number) => started.push({ type: 'noise', at, freq: 0 }), stop: () => undefined };
      return source;
    },
    createOscillator: () => {
      const frequency = new FakeParam();
      const osc = {
        ...node(),
        type: 'sine',
        frequency,
        onended: null,
        start: (at: number) => started.push({ type: osc.type, at, freq: frequency.value }),
        stop: () => undefined,
      };
      return osc;
    },
  };
  return {
    context: context as unknown as AudioContext,
    started,
    calls,
    setTime: (seconds) => {
      time = seconds;
    },
  };
}
