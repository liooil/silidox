export class Engine {
  lastPulseTime = 0;
  pulse() {
    this.lastPulseTime = new Date().getTime()
  }
  isAlive() {
    const current = new Date().getTime()
  }
}