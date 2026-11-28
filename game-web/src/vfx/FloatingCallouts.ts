import * as THREE from 'three';
import type { CalloutItem } from '../types';

export class FloatingCallouts {
  private items: CalloutItem[] = [];
  private nextId = 1;
  private projVec = new THREE.Vector3();

  private clampToSafeScreen(x: number, y: number): { x: number; y: number } {
    const w = Math.max(360, window.innerWidth);
    const h = Math.max(320, window.innerHeight);
    let cx = Math.max(150, Math.min(w - 150, x));
    let cy = Math.max(110, Math.min(h - 140, y));

    // Keep clear of the bottom-left 3D Face Wipe portrait (left: 18px, bottom: 18px, 176x176 + margin)
    const wipeRight = Math.min(w * 0.42, 310);
    const wipeTop = h - 255;
    if (cx < wipeRight && cy > wipeTop) {
      cy = Math.max(120, wipeTop - 20);
    }

    // Keep clear of top-left hearts/star pills & top-right FEVER gauge
    if (cx < 270 && cy < 185) {
      cy = 195;
    }
    if (cx > w - 290 && cy < 185) {
      cy = 195;
    }

    return { x: cx, y: cy };
  }

  spawnWorld(
    worldPos: THREE.Vector3,
    camera: THREE.Camera,
    text: string,
    style: CalloutItem['style'],
    subText?: string,
    duration = 0.95
  ): void {
    this.projVec.copy(worldPos);
    this.projVec.y += 1.2;
    this.projVec.project(camera);
    // If the projected target is behind the camera or far off-screen, pop cleanly in upper-center
    if (
      this.projVec.z > 1 ||
      this.projVec.z < -1 ||
      Math.abs(this.projVec.x) > 1.25 ||
      Math.abs(this.projVec.y) > 1.25
    ) {
      this.spawnScreen(window.innerWidth * 0.5, window.innerHeight * 0.30, text, style, subText, duration);
      return;
    }
    const sx = (this.projVec.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this.projVec.y * 0.5 + 0.5) * window.innerHeight;
    const safe = this.clampToSafeScreen(sx, sy);
    this.spawnScreen(safe.x, safe.y, text, style, subText, duration);
  }

  spawnScreen(
    x: number,
    y: number,
    text: string,
    style: CalloutItem['style'],
    subText?: string,
    duration = 1.0
  ): void {
    const safe = this.clampToSafeScreen(
      x + (Math.random() - 0.5) * 24,
      y + (Math.random() - 0.5) * 14
    );
    this.items.push({
      id: this.nextId++,
      text,
      subText,
      style,
      x: safe.x,
      y: safe.y,
      age: 0,
      duration,
    });
    if (this.items.length > 14) {
      this.items.shift();
    }
  }

  update(dt: number): CalloutItem[] {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      it.y -= 36 * dt;
      if (it.age >= it.duration) {
        this.items.splice(i, 1);
      }
    }
    return this.items;
  }
}
