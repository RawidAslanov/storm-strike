import { SHIP_IMAGES } from './shipLayer.js';

export function shipIconImg(typeId, width = 48) {
  const h = Math.round(width * 0.45);
  return `<img src="${SHIP_IMAGES[typeId]}" class="ship-icon-img" width="${width}" height="${h}" alt="" draggable="false">`;
}

export function shipIconSvg(typeId, size = 48) {
  return shipIconImg(typeId, size);
}
