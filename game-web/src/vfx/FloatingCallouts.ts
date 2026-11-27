import * as THREE from 'three';
import type { CalloutItem } from '../types';

export class FloatingCallouts {
  private items: CalloutItem[] = [];
  private nextId = 1;
  private projVec = new THREE.Vector3();

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
    const sx = (this.projVec.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this.projVec.y * 0.5 + 0.5) * window.innerHeight;
    const clampedX = Math.max(120, Math.min(window.innerWidth - 120, sx));
    const clampedY = Math.max(90, Math.min(window.innerHeight - 140, sy));
    this.spawnScreen(clampedX, clampedY, text, style, subText, duration);
  }

  spawnScreen(
    x: number,
    y: number,
    text: string,
    style: CalloutItem['style'],
    subText?: string,
    duration = 1.0
  ): void {
    this.items.push({
      id: this.nextId++,
      text,
      subText,
      style,
      x: x + (Math.random() - 0.5) * 32,
      y: y + (Math.random() - 0.5) * 18,
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
