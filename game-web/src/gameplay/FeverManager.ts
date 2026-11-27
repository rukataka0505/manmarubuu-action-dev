export class FeverManager {
  public meter = 0; // 0..100
  public active = false;
  public remainingSec = 0;
  public readonly maxDuration = 12.0;

  isReady(): boolean {
    return !this.active && this.meter >= 100;
  }

  addCharge(amount: number, onReady?: () => void): boolean {
    if (this.active) return false;
    const wasReady = this.meter >= 100;
    this.meter = Math.min(100, this.meter + amount);
    const justBecameReady = !wasReady && this.meter >= 100;
    if (justBecameReady) {
      onReady?.();
    }
    return justBecameReady;
  }

  activate(onActivated?: () => void): boolean {
    if (this.active || this.meter < 100) return false;
    this.active = true;
    this.remainingSec = this.maxDuration;
    this.meter = 100;
    onActivated?.();
    return true;
  }

  forceActivate(): void {
    this.active = true;
    this.remainingSec = this.maxDuration;
    this.meter = 100;
  }

  getScoreMultiplier(): number {
    return this.active ? 8 : 1;
  }

  update(dt: number, onEnded: () => void): void {
    if (!this.active) return;
    this.remainingSec -= dt;
    this.meter = Math.max(0, (this.remainingSec / this.maxDuration) * 100);
    if (this.remainingSec <= 0) {
      this.active = false;
      this.remainingSec = 0;
      this.meter = 0;
      onEnded();
    }
  }
}
