export const MSG = {
  // client → server
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  PLACE_SHIP: 'place_ship',
  ROTATE: 'rotate',
  AUTO_PLACE: 'auto_place',
  FIRE: 'fire',
  SHIELD: 'shield',
  SELECT_POWERUP: 'select_powerup',
  USE_SMOKE: 'use_smoke',
  PING: 'ping',

  // server → client
  ROOM_CREATED: 'room_created',
  ROOM_JOINED: 'room_joined',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  LOBBY_UPDATE: 'lobby_update',
  GAME_START: 'game_start',
  PLACEMENT_UPDATE: 'placement_update',
  TURN: 'turn',
  SHOT_RESULT: 'shot_result',
  STORM: 'storm',
  STATE_SYNC: 'state_sync',
  GAME_OVER: 'game_over',
  ERROR: 'error',
  PONG: 'pong',
};

export function serializeShotResult(res) {
  return {
    valid: res.valid,
    r: res.r,
    c: res.c,
    hit: res.hit,
    sunk: res.sunk,
    sonar: res.sonar || false,
    found: res.found || [],
    shieldBlocked: res.shieldBlocked || false,
    armorBlocked: res.armorBlocked || false,
    ship: res.ship ? { typeId: res.ship.typeId, name: res.ship.type?.name } : null,
  };
}

export function serializeBoardShots(board) {
  return board.shots;
}

export function serializePlayerState(p) {
  return {
    id: p.id,
    name: p.name,
    ready: p.ready,
    placementDone: p.placementDone,
    energy: p.energy,
    combo: p.combo,
    inventory: { ...p.inventory },
    smokeActive: p.smokeActive,
    stats: { ...p.stats },
  };
}
