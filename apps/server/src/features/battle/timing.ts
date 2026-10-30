export const OPENING_WAIT_MS = 3000;
// SuccessSkill and FailedSkill finish their SimpleScriptAction at frame 20.
export const RESULT_ANIMATION_MS = 20 * 40;
export const RESULT_MARGIN_MS = 200;
export interface OpeningState { openingDeadline?: number; openingComplete?: boolean; }
export function beginOpening(state: OpeningState, now: number): void {
  if (!state.openingComplete) state.openingDeadline ??= now + OPENING_WAIT_MS;
}
export function openingReady(state: OpeningState, now: number, players: number[], selected: number[], actionsExecuted = 0): boolean {
  if (state.openingComplete) return true;
  if (actionsExecuted > 0) { state.openingComplete = true; return true; }
  beginOpening(state, now);
  if (now >= state.openingDeadline! || (players.length > 0 && players.every(id => selected.includes(id)))) {
    state.openingComplete = true; return true;
  }
  return false;
}
export function closingDelay(animationDelay = 0): number {
  return animationDelay + RESULT_ANIMATION_MS + RESULT_MARGIN_MS;
}
