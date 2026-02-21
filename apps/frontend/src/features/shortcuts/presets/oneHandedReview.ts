/**
 * One-handed review overlay bindings (PRD-52).
 *
 * These are *additional* overrides on top of any base preset,
 * optimised for rapid review with one hand on the keyboard.
 */
export const oneHandedReviewBindings: Record<string, string> = {
  "review.approve": "1",
  "review.reject": "2",
  "review.flag": "3",
  "playback.speedDown": "j",
  "playback.playPause": "k",
  "playback.speedUp": "l",
};
