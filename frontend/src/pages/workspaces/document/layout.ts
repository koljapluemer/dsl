export function placeAnnotations(anchors: number[], heights: number[], gap = 12) {
  let bottom = -gap;
  return anchors.map((anchor, index) => {
    const top = Math.max(anchor, bottom + gap);
    bottom = top + (heights[index] ?? 0);
    return top;
  });
}

export function connectorOpacity(distance: number) {
  return Math.min(0.85, 0.10 + 0.75 * Math.exp(-Math.max(0, distance) / 240));
}

