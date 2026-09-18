import { describe, expect, it } from 'vitest';
import { dispatchKey, type InputActions } from '../../src/render/inputActions';
import { InputBuffer } from '../../src/render/inputBuffer';
import { nextSpeed, speedLabel } from '../../src/render/affordance';

/** Records which action fired, so the map can be asserted without a browser. */
function recorder(): { calls: string[]; actions: InputActions } {
  const calls: string[] = [];
  const noop = (name: string) => () => calls.push(name);
  const actions: InputActions = {
    togglePause: noop('pause'),
    toggleFullscreen: noop('fullscreen'),
    spawn: (kind) => calls.push(`spawn:${kind}`),
    evolve: noop('evolve'),
    upgrade: (which) => calls.push(`upgrade:${which}`),
    turret: noop('turret'),
    chronoSurge: noop('chronoSurge'),
    warCry: noop('warCry'),
    reinforce: noop('reinforce'),
    ultimate: noop('ultimate'),
    cycleSpeed: noop('cycleSpeed'),
    muteKey: noop('mute'),
    resultsAdvance: noop('advance'),
    resultsRestart: noop('restart'),
  };
  return { calls, actions };
}

describe('dispatchKey', () => {
  it('maps every in-match hotkey', () => {
    const cases: Array<[string, string]> = [
      ['1', 'spawn:swarm'], ['2', 'spawn:tank'], ['3', 'spawn:ranged'],
      ['e', 'evolve'], ['E', 'evolve'],
      ['u', 'upgrade:forge'], ['y', 'upgrade:armor'],
      ['t', 'turret'], ['q', 'chronoSurge'], ['w', 'warCry'],
      ['c', 'reinforce'], ['x', 'cycleSpeed'], [' ', 'ultimate'],
      ['m', 'mute'],
    ];
    for (const [key, expected] of cases) {
      const { calls, actions } = recorder();
      expect(dispatchKey(key, '', 'playing', actions), `key '${key}'`).toBe(expected);
      expect(calls).toEqual([expected]);
    }
  });

  it('keeps pause and fullscreen available after the match ends', () => {
    for (const phase of ['playing', 'results'] as const) {
      const { actions } = recorder();
      expect(dispatchKey('p', '', phase, actions)).toBe('pause');
      expect(dispatchKey('P', '', phase, actions)).toBe('pause');
      expect(dispatchKey('', 'Escape', phase, actions)).toBe('pause');
      expect(dispatchKey('f', '', phase, actions)).toBe('fullscreen');
    }
  });

  it('reserves Enter / Space / R for the results card only', () => {
    const { calls, actions } = recorder();
    expect(dispatchKey('', 'Enter', 'playing', actions)).toBeNull();
    expect(dispatchKey('', 'Space', 'playing', actions)).toBeNull();
    expect(dispatchKey('r', '', 'playing', actions)).toBeNull();
    expect(calls).toEqual([]);

    expect(dispatchKey('', 'Enter', 'results', actions)).toBe('advance');
    expect(dispatchKey('', 'Space', 'results', actions)).toBe('restart');
    expect(dispatchKey('r', '', 'results', actions)).toBe('restart');
  });

  it('ignores unbound keys without touching any action', () => {
    const { calls, actions } = recorder();
    for (const key of ['z', 'b', '9', 'F7']) {
      expect(dispatchKey(key, '', 'playing', actions)).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it('passes modifiers through to the mute key', () => {
    const seen: string[] = [];
    const { actions } = recorder();
    actions.muteKey = (mods) => seen.push(`${mods.shiftKey}/${mods.ctrlKey}/${mods.metaKey}`);
    dispatchKey('m', '', 'playing', actions, { shiftKey: true, ctrlKey: false, metaKey: true });
    expect(seen).toEqual(['true/false/true']);
  });
});

/**
 * The reported bug: two `x` presses 1.5 s after the stage card was clicked
 * never engaged and the HUD stayed at 1x. This drives the same modules the
 * scene uses — InputBuffer, dispatchKey, nextSpeed — through the boot sequence
 * rather than a copy of it.
 */
describe('presses typed during scene boot', () => {
  class FakeScene {
    private buf = new InputBuffer();
    private ready = false;
    speed = 1;
    private actions: InputActions = {
      ...recorder().actions,
      cycleSpeed: () => { this.speed = nextSpeed(this.speed); },
    };

    press(key: string, at: number): void {
      if (!this.ready) this.buf.push({ key }, at);
      else dispatchKey(key, '', 'playing', this.actions);
    }

    /** Stand-in for the end of create(): become ready, then replay. */
    finishBoot(at: number): void {
      this.ready = true;
      for (const buffered of this.buf.drain(at)) {
        dispatchKey(buffered.key, buffered.code, 'playing', this.actions, {
          shiftKey: buffered.shiftKey, ctrlKey: buffered.ctrlKey, metaKey: buffered.metaKey,
        });
      }
    }
  }

  it('replays a boot-time speed toggle so the chip actually changes', () => {
    const scene = new FakeScene();
    scene.press('x', 0);
    scene.press('x', 120);
    expect(scene.speed).toBe(1); // not ready yet: parked, not dropped
    scene.finishBoot(400);
    expect(scene.speed).toBe(3);
    expect(speedLabel(scene.speed)).toBe('SPEED 3x');
  });

  it('replays the exact reported case: presses 1.5 s after the stage card', () => {
    // create() is what takes the time; presses land during it and boot ends
    // shortly after, so they are still fresh when replayed.
    const scene = new FakeScene();
    scene.press('x', 1400);
    scene.press('x', 1450);
    scene.finishBoot(1500);
    expect(scene.speed).toBe(3);
  });

  it('discards boot presses that are too old by the time the scene is ready', () => {
    const scene = new FakeScene();
    scene.press('x', 0);
    scene.finishBoot(9000); // far past the TTL: the scene never sees it
    expect(scene.speed).toBe(1);
  });

  it('handles a press arriving after boot through the same path', () => {
    const scene = new FakeScene();
    scene.finishBoot(0);
    scene.press('x', 10);
    expect(scene.speed).toBe(2);
  });
});
