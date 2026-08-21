export interface ScheduledEvent<T> {
  time: number;
  priority: number;
  order: number;
  payload: T;
}

export class EventQueue<T> {
  private items: Array<ScheduledEvent<T>> = [];

  get size(): number { return this.items.length; }

  push(event: ScheduledEvent<T>): void {
    this.items.push(event);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[parent], this.items[index]) <= 0) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop(): ScheduledEvent<T> | undefined {
    if (!this.items.length) return undefined;
    const first = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      this.items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.compare(this.items[left], this.items[smallest]) < 0) smallest = left;
        if (right < this.items.length && this.compare(this.items[right], this.items[smallest]) < 0) smallest = right;
        if (smallest === index) break;
        [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
        index = smallest;
      }
    }
    return first;
  }

  private compare(a: ScheduledEvent<T>, b: ScheduledEvent<T>): number {
    return a.time - b.time || a.priority - b.priority || a.order - b.order;
  }
}
