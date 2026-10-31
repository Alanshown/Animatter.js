export type TaskResult = "completed" | "cancelled";
export interface BehaviorTask {
  id: string;
  channel: string;
  priority: number;
  update(dt: number): boolean;
  pause?(): void;
  resume?(): void;
  cancel?(): void;
  signal?: AbortSignal;
}
interface Entry {
  task: BehaviorTask;
  finish(result: TaskResult): void;
  detach(): void;
  sequence: number;
}
interface Channel {
  active: Entry | null;
  queue: Entry[];
}
/** Stable priority queues per channel. Preemption is cooperative and preserves paused tasks. */
export class InteractionArbiter {
  private channels = new Map<string, Channel>();
  private entries = new Map<string, Entry>();
  private sequence = 0;
  private draining = false;
  enqueue(task: BehaviorTask): Promise<TaskResult> {
    if (this.draining)
      throw new Error("Cannot enqueue during bulk cancellation");
    if (this.entries.has(task.id))
      throw new Error(`Duplicate task: ${task.id}`);
    if (!Number.isFinite(task.priority))
      throw new TypeError("Task priority must be finite");
    if (task.signal?.aborted) return Promise.resolve("cancelled");
    const channel = this.channels.get(task.channel) ?? {
      active: null,
      queue: [],
    };
    // A failed pause leaves the existing task intact and never inserts a new task.
    if (channel.active && task.priority > channel.active.task.priority) {
      channel.active.task.pause?.();
      channel.queue.push(channel.active);
      channel.active = null;
    }
    this.channels.set(task.channel, channel);
    let finish!: (result: TaskResult) => void;
    const result = new Promise<TaskResult>((resolve) => {
      finish = resolve;
    });
    const abort = () => this.cancel(task.id);
    const entry: Entry = {
      task,
      finish,
      sequence: this.sequence++,
      detach: () => task.signal?.removeEventListener("abort", abort),
    };
    this.entries.set(task.id, entry);
    task.signal?.addEventListener("abort", abort, { once: true });
    channel.queue.push(entry);
    try {
      this.activate(channel);
    } catch (error) {
      this.compact(task.channel, channel);
      throw error;
    }
    return result;
  }
  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const channel of this.channels.values()) {
      const entry = channel.active;
      if (!entry) continue;
      try {
        if (entry.task.update(dt) && channel.active === entry)
          this.finish(entry, "completed");
      } catch (error) {
        if (this.entries.has(entry.task.id)) this.cancel(entry.task.id);
        throw error;
      }
    }
  }
  cancel(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    try {
      entry.task.cancel?.();
    } finally {
      this.finish(entry, "cancelled");
    }
  }
  cancelChannel(name: string): void {
    const channel = this.channels.get(name);
    if (!channel) return;
    this.drain([
      ...channel.queue.map((e) => e.task.id),
      ...(channel.active ? [channel.active.task.id] : []),
    ]);
    this.compact(name, channel);
  }
  clear(): void {
    try {
      this.drain([...this.entries.keys()]);
    } finally {
      this.channels.clear();
    }
  }
  get size(): number {
    return this.entries.size;
  }
  snapshot(): { channel: string; active: string | null; queued: string[] }[] {
    return [...this.channels].map(([channel, c]) => ({
      channel,
      active: c.active?.task.id ?? null,
      queued: c.queue.map((e) => e.task.id),
    }));
  }
  private drain(ids: string[]): void {
    const previous = this.draining;
    this.draining = true;
    let failure: unknown;
    let failed = false;
    try {
      for (const id of ids)
        try {
          this.cancel(id);
        } catch (error) {
          failure = error;
          failed = true;
        }
    } finally {
      this.draining = previous;
    }
    if (failed) throw failure;
  }
  private finish(entry: Entry, result: TaskResult): void {
    if (this.entries.get(entry.task.id) !== entry) return;
    const channel = this.channels.get(entry.task.channel)!;
    if (channel.active === entry) channel.active = null;
    else channel.queue = channel.queue.filter((e) => e !== entry);
    this.entries.delete(entry.task.id);
    entry.detach();
    entry.finish(result);
    try {
      if (!this.draining) this.activate(channel);
    } finally {
      this.compact(entry.task.channel, channel);
    }
  }
  private compact(name: string, channel: Channel): void {
    if (!channel.active && !channel.queue.length) this.channels.delete(name);
  }
  private activate(channel: Channel): void {
    if (channel.active || this.draining) return;
    channel.queue.sort(
      (a, b) => b.task.priority - a.task.priority || a.sequence - b.sequence,
    );
    const entry = channel.queue.shift() ?? null;
    channel.active = entry;
    if (!entry) return;
    try {
      entry.task.resume?.();
    } catch (error) {
      channel.active = null;
      this.entries.delete(entry.task.id);
      entry.detach();
      entry.finish("cancelled");
      throw error;
    }
  }
}
