import { describe, expect, it } from 'vitest';
import { InputBuffer, INPUT_BUFFER_MAX, INPUT_BUFFER_TTL_MS } from '../../src/render/inputBuffer';

const key = (k: string, code = `Key${k.toUpperCase()}`) => ({ key: k, code });

describe('InputBuffer', () => {
  it('replays presses oldest-first', () => {
    const buf = new InputBuffer();
    buf.push(key('x'), 0);
    buf.push(key('1'), 10);
    buf.push(key('c'), 20);
    expect(buf.drain(25).map((k) => k.key)).toEqual(['x', '1', 'c']);
  });

  it('empties itself on drain', () => {
    const buf = new InputBuffer();
    buf.push(key('x'), 0);
    expect(buf.drain(1).length).toBe(1);
    expect(buf.size()).toBe(0);
    expect(buf.drain(2)).toEqual([]);
  });

  it('drops presses older than the TTL', () => {
    const buf = new InputBuffer(8, 1000);
    buf.push(key('x'), 0);
    buf.push(key('1'), 900);
    // 1100ms later the first press is stale, the second is not.
    const fresh = buf.drain(1100);
    expect(fresh.map((k) => k.key)).toEqual(['1']);
    expect(buf.dropped).toBe(1);
  });

  it('accepts a press exactly at the TTL boundary', () => {
    const buf = new InputBuffer(8, 1000);
    buf.push(key('x'), 0);
    expect(buf.drain(1000).length).toBe(1);
  });

  it('stays bounded, evicting the oldest on overflow', () => {
    const buf = new InputBuffer(3, 60_000);
    for (let i = 0; i < 5; i++) buf.push(key(String(i)), i);
    expect(buf.size()).toBe(3);
    // The two oldest were evicted; the newest three survive, still in order.
    expect(buf.drain(100).map((k) => k.key)).toEqual(['2', '3', '4']);
    expect(buf.dropped).toBe(2);
  });

  it('reports acceptance only when nothing had to be evicted', () => {
    const buf = new InputBuffer(2, 60_000);
    expect(buf.push(key('a'), 0)).toBe(true);
    expect(buf.push(key('b'), 1)).toBe(true);
    expect(buf.push(key('c'), 2)).toBe(false);
  });

  it('defaults to a sane ceiling and lifetime', () => {
    const buf = new InputBuffer();
    expect(buf.maxQueued).toBe(INPUT_BUFFER_MAX);
    expect(buf.ttlMs).toBe(INPUT_BUFFER_TTL_MS);
    expect(INPUT_BUFFER_MAX).toBeGreaterThan(4);
    expect(INPUT_BUFFER_TTL_MS).toBeGreaterThanOrEqual(500);
    expect(INPUT_BUFFER_TTL_MS).toBeLessThanOrEqual(2000);
  });

  it('records modifiers and a code fallback', () => {
    const buf = new InputBuffer();
    buf.push({ key: 'm', shiftKey: true }, 0);
    const [only] = buf.drain(1);
    expect(only?.shiftKey).toBe(true);
    expect(only?.ctrlKey).toBe(false);
    expect(only?.code).toBe('');
  });

  it('clear() discards without counting as dropped', () => {
    const buf = new InputBuffer();
    buf.push(key('x'), 0);
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.dropped).toBe(0);
  });
});
