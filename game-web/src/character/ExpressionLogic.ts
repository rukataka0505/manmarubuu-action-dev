import type { ExpressionName } from '../types';

export const EXPRESSION_LABELS_JA: Record<ExpressionName, string> = {
  Sleep: 'のんびり',
  Happy: 'にっこり♪',
  Damage: 'いたたた…',
  Pien: 'ぴえん…',
  Ganbaru: 'がんばるっ！',
  Panic: 'あせあせ！',
  Pout: 'むぅ…',
  Fever: 'FEVER!!',
};

export interface ExpressionContext {
  isVictory: boolean;
  damageTimer: number;
  bossIntroPienTimer: number;
  feverActive: boolean;
  happyTimer: number;
  isHipDropping: boolean;
  isDashing: boolean;
  isNearLedgeOrFallingFast: boolean;
  hp: number;
  idleSec: number;
  isCutsceneStar: boolean;
}

export function resolveExpression(ctx: ExpressionContext): ExpressionName {
  if (ctx.isVictory) return 'Fever';
  if (ctx.damageTimer > 0) return 'Damage';
  if (ctx.bossIntroPienTimer > 0) return 'Pien';
  if (ctx.isCutsceneStar) return 'Happy';
  if (ctx.feverActive) return 'Fever';
  if (ctx.happyTimer > 0) return 'Happy';
  if (ctx.isHipDropping || ctx.isDashing) return 'Ganbaru';
  if (ctx.isNearLedgeOrFallingFast) return 'Panic';
  if (ctx.hp === 1 && ctx.idleSec > 1.2) return 'Pien';
  if (ctx.idleSec > 3.5) {
    // Alternate between Sleep and cute Pout during long idle look-back
    const cycle = Math.floor((ctx.idleSec - 3.5) / 3.0) % 2;
    return cycle === 1 ? 'Pout' : 'Sleep';
  }
  return 'Sleep';
}
