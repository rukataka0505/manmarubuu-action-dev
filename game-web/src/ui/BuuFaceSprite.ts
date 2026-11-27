import type { ExpressionName } from '../types';

export const FACE_WIPE_SPRITE_URLS: Record<ExpressionName, string> = {
  Sleep: './images/face-wipe/sleep.png',
  Happy: './images/face-wipe/happy.png',
  Damage: './images/face-wipe/damage.png',
  Pien: './images/face-wipe/pien.png',
  Ganbaru: './images/face-wipe/ganbaru.png',
  Panic: './images/face-wipe/panic.png',
  Pout: './images/face-wipe/pout.png',
  Fever: './images/face-wipe/fever.png',
};

export const FACE_WIPE_BG_BY_EXPRESSION: Record<ExpressionName, string> = {
  Sleep: '#ffe8cc',
  Happy: '#fff3a8',
  Damage: '#ffb3c1',
  Pien: '#bde4ff',
  Ganbaru: '#ffd6a5',
  Panic: '#d0e8ff',
  Pout: '#ffcce0',
  Fever: 'conic-gradient(from 0deg, #ffb3d9, #ffe994, #a8f0c8, #9cdbff, #d8b5ff, #ffb3d9)',
};

let spritesPreloaded = false;
const preloadedImages: HTMLImageElement[] = [];

export function preloadBuuFaceSprites(): void {
  if (spritesPreloaded || typeof Image === 'undefined') return;
  spritesPreloaded = true;
  for (const url of Object.values(FACE_WIPE_SPRITE_URLS)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    preloadedImages.push(img);
  }
}

export function getBuuFaceSpriteInfo(expr: ExpressionName): {
  url: string;
  bg: string;
  exprClass: string;
} {
  return {
    url: FACE_WIPE_SPRITE_URLS[expr] ?? FACE_WIPE_SPRITE_URLS.Sleep,
    bg: FACE_WIPE_BG_BY_EXPRESSION[expr] ?? FACE_WIPE_BG_BY_EXPRESSION.Sleep,
    exprClass: `expr-${expr.toLowerCase()}`,
  };
}
