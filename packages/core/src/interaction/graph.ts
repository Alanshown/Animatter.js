import type { Intent, Interaction } from "../types.js";
export interface GraphRule {
  from: string | "*";
  on: Intent | Intent[];
  to: string;
  when?: (event: Interaction) => boolean;
  effect: (event: Interaction, target: string) => void;
}
/** Explicit directed effects; dispatch is bounded and never recursively replays native input. */
export class InteractionGraph {
  private nodes = new Map<string, Set<Intent>>();
  private rules = new Set<GraphRule>();
  register(id: string, capabilities: Intent[] = []): void {
    this.nodes.set(id, new Set(capabilities));
  }
  remove(id: string): void {
    this.nodes.delete(id);
    for (const r of this.rules)
      if (r.from === id || r.to === id) this.rules.delete(r);
  }
  connect(rule: GraphRule): () => void {
    this.rules.add(rule);
    return () => this.rules.delete(rule);
  }
  dispatch(event: Interaction): void {
    for (const rule of [...this.rules])
      if (
        (rule.from === "*" || rule.from === event.target) &&
        (Array.isArray(rule.on)
          ? rule.on.includes(event.type)
          : rule.on === event.type) &&
        this.nodes.has(rule.to) &&
        (!rule.when || rule.when(event))
      )
        rule.effect(event, rule.to);
  }
  supports(id: string, kind: Intent): boolean {
    const caps = this.nodes.get(id);
    return !!caps && (!caps.size || caps.has(kind));
  }
  snapshot(): {
    nodes: string[];
    edges: { from: string; to: string; on: Intent | Intent[] }[];
  } {
    return {
      nodes: [...this.nodes.keys()],
      edges: [...this.rules].map(({ from, to, on }) => ({ from, to, on })),
    };
  }
  clear(): void {
    this.nodes.clear();
    this.rules.clear();
  }
}
