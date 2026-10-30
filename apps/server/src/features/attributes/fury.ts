export interface InstanceFury { key: string; value: number }
export const clampFury = (value: number): number => Math.max(0, Math.min(100, Math.floor(value)));

/** Cached fury is a floor, never an addition. The initial attribute is reapplied for every new battle. */
export function startingFury(initial: number, instance: string | undefined, cache?: InstanceFury): number {
  return clampFury(Math.max(initial, instance && cache?.key === instance ? cache.value : 0));
}
export function finishedFury(instance: string | undefined, value: number): InstanceFury | undefined {
  return instance ? { key: instance, value: clampFury(value) } : undefined;
}
