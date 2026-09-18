import { describe, expect, it } from 'vitest';
import {
  evolveBannerText, evolveBlockedOnGold, nextSpeed, speedLabel,
  subtitleColorHex, SUBTITLE_COLORS, type SubtitleKind,
} from '../../src/render/affordance';

describe('speed chip copy', () => {
  it('names the multiplier in effect rather than an arrow', () => {
    expect(speedLabel(1)).toBe('SPEED 1x');
    expect(speedLabel(2)).toBe('SPEED 2x');
    expect(speedLabel(3)).toBe('SPEED 3x');
  });

  it('says when the match is paused instead of implying a speed', () => {
    expect(speedLabel(2, true)).toBe('PAUSED 2x');
  });

  it('cycles 1 -> 2 -> 3 -> 1', () => {
    expect([nextSpeed(1), nextSpeed(2), nextSpeed(3)]).toEqual([2, 3, 1]);
    // and is idempotent-safe for an unexpected value
    expect(nextSpeed(7)).toBe(1);
  });
});

describe('evolve banner copy', () => {
  it('names both gates when the age-up is affordable', () => {
    const text = evolveBannerText({ nextAge: 'medieval', cost: 40, gold: 120, xpReady: true })!;
    expect(text).toContain('press E');
    expect(text).toContain('(40 G)');
    expect(text).toContain('the Medieval Age');
  });

  it('explains the shortfall when gold is the blocker', () => {
    const text = evolveBannerText({ nextAge: 'medieval', cost: 40, gold: 22, xpReady: true })!;
    expect(text).toContain('40 G');
    expect(text).toContain('short 18 G');
    // It must not invite the press it knows will fail.
    expect(text).not.toContain('press E');
  });

  it('says nothing when XP is not ready yet', () => {
    expect(evolveBannerText({ nextAge: 'medieval', cost: 40, gold: 999, xpReady: false })).toBeNull();
  });

  it('handles the second age-up the same way', () => {
    const text = evolveBannerText({ nextAge: 'modern', cost: 90, gold: 90, xpReady: true })!;
    expect(text).toContain('the Modern Age');
    expect(text).toContain('(90 G)');
  });

  it('always names the gold cost, whichever branch it takes', () => {
    for (const gold of [0, 20, 39, 40, 500]) {
      const text = evolveBannerText({ nextAge: 'medieval', cost: 40, gold, xpReady: true })!;
      expect(text, `gold=${gold}`).toMatch(/\d+ G/);
    }
  });

  it('rounds a fractional shortfall up, never down', () => {
    const text = evolveBannerText({ nextAge: 'medieval', cost: 40, gold: 39.4, xpReady: true })!;
    expect(text).toContain('short 1 G');
  });
});

describe('evolveBlockedOnGold', () => {
  it('is true only when XP is ready and gold is not', () => {
    expect(evolveBlockedOnGold({ cost: 40, gold: 10, xpReady: true })).toBe(true);
    expect(evolveBlockedOnGold({ cost: 40, gold: 40, xpReady: true })).toBe(false);
    expect(evolveBlockedOnGold({ cost: 40, gold: 10, xpReady: false })).toBe(false);
  });
});

describe('status line colour', () => {
  it('gives every kind a real hex colour', () => {
    for (const kind of Object.keys(SUBTITLE_COLORS) as SubtitleKind[]) {
      expect(subtitleColorHex(kind)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('makes a warning distinguishable from the idle help text', () => {
    const help = subtitleColorHex('help');
    expect(subtitleColorHex('alert')).not.toBe(help);
    expect(subtitleColorHex('push')).not.toBe(help);
    expect(subtitleColorHex('evolve')).not.toBe(help);
    expect(subtitleColorHex('warcry')).not.toBe(help);
  });

  it('keeps the three result outcomes distinct from each other', () => {
    const { win, draw, lose } = SUBTITLE_COLORS;
    expect(new Set([win, draw, lose]).size).toBe(3);
  });

  it('keeps ambient help dimmer than anything actionable', () => {
    // Relative luminance of a hex colour; help should be the darkest entry
    // among the ones a player needs to notice.
    const lum = (hex: string): number => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const help = lum(SUBTITLE_COLORS.help);
    for (const kind of ['alert', 'push', 'evolve', 'warcry'] as const) {
      expect(lum(SUBTITLE_COLORS[kind]), kind).toBeGreaterThan(help);
    }
  });
});
