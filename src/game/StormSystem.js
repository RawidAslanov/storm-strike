import { STORM_EVENTS } from './constants.js';

export class StormSystem {
  constructor() {
    this.turnsSinceStorm = 0;
    this.stormInterval = 4;
    this.activeEvent = null;
    this.eventHistory = [];
  }

  reset() {
    this.turnsSinceStorm = 0;
    this.stormInterval = 4;
    this.activeEvent = null;
    this.eventHistory = [];
  }

  tick(turnNumber) {
    this.turnsSinceStorm++;

    if (this.turnsSinceStorm < this.stormInterval) return null;

    this.turnsSinceStorm = 0;
    this.stormInterval = 3 + Math.floor(Math.random() * 3);

    const events = Object.values(STORM_EVENTS);
    const weights = [0.4, 0.3, 0.3];
    let roll = Math.random();
    let event = events[0];
    for (let i = 0; i < events.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { event = events[i]; break; }
    }

    this.activeEvent = event;
    this.eventHistory.push({ event, turn: turnNumber });
    return event;
  }
}
