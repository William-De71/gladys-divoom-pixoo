// -----------------------------------------------------------------------------
// Scene actions and triggers (manifest `scene_actions`, `scene_triggers`).
//
// Actions
//   show_message      one or two text lines over a plain background, for a
//                     while or until something else is shown
//   play_gif          a GIF from a URL, downloaded by the Pixoo itself
//   show_clock_face   a clock face by its Divoom id
//   countdown         the countdown tool of the Pixoo
//   stopwatch         the stopwatch tool (start, stop, reset)
//   scoreboard        the scoreboard tool (blue and red scores)
//   noise_meter       the noise meter tool (on / off)
//   play_buzzer       the buzzer, a few seconds at most
//
// Triggers (the Pixoo pushes nothing; the integration sees it stop answering)
//   unreachable       a display stopped answering (twice in a row)
//   reachable_again   it answers again
//
// Screen on/off, brightness and channel are device features: the Gladys
// "device state" trigger and "control a device" action already cover them.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  SHOW_MESSAGE: 'show_message',
  PLAY_GIF: 'play_gif',
  SHOW_CLOCK_FACE: 'show_clock_face',
  COUNTDOWN: 'countdown',
  STOPWATCH: 'stopwatch',
  SCOREBOARD: 'scoreboard',
  NOISE_METER: 'noise_meter',
  PLAY_BUZZER: 'play_buzzer',
};

// The outputs each action returns, as declared in the manifest.
export const SCENE_ACTION_OUTPUTS = {
  [SCENE_ACTIONS.SHOW_MESSAGE]: [],
  [SCENE_ACTIONS.PLAY_GIF]: [],
  [SCENE_ACTIONS.SHOW_CLOCK_FACE]: [],
  [SCENE_ACTIONS.COUNTDOWN]: [],
  [SCENE_ACTIONS.STOPWATCH]: [],
  [SCENE_ACTIONS.SCOREBOARD]: [],
  [SCENE_ACTIONS.NOISE_METER]: [],
  [SCENE_ACTIONS.PLAY_BUZZER]: [],
};

export const SCENE_TRIGGERS = {
  UNREACHABLE: 'unreachable',
  REACHABLE_AGAIN: 'reachable_again',
};

export const STOPWATCH_STATUS = { start: 1, stop: 0, reset: 2 };
