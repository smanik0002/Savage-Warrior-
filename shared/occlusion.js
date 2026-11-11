// Conservative software occlusion test for the city: is the segment from the camera to a point blocked by a building?
// boxes: [{ x, z, w, d, h, ck }]  (axis-aligned footprints with roof height h).  skipCk: chunk key whose buildings are ignored
// (the chunk being tested must not be hidden by its own front building).
export function segmentBlocked(ox, oy, oz, tx, ty, tz, boxes, skipCk) {
  const dx = tx - ox, dz = tz - oz, dy = ty - oy;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.ck === skipCk) continue;
    const hw = b.w / 2, hd = b.d / 2;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ox < b.x - hw || ox > b.x + hw) continue; }
    else {
      let a = (b.x - hw - ox) / dx, c = (b.x + hw - ox) / dx;
      if (a > c) { const q = a; a = c; c = q; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (oz < b.z - hd || oz > b.z + hd) continue; }
    else {
      let a = (b.z - hd - oz) / dz, c = (b.z + hd - oz) / dz;
      if (a > c) { const q = a; a = c; c = q; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) continue;
    }
    // segment is inside the footprint for t in [t0, t1]; it is blocked when it is below the roof at entry or exit
    const yEnter = oy + dy * t0, yExit = oy + dy * t1;
    if (Math.min(yEnter, yExit) < b.h - 0.3) return true;
  }
  return false;
}

// A chunk is hidden only if every sample ray towards it (corners, edge middles, centre at roof height) is blocked.
export function chunkOccluded(cam, chunk, boxes) {
  const { minX, maxX, minZ, maxZ, maxH, ck } = chunk;
  const ty = Math.max(maxH, 2);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const tx = minX + (maxX - minX) * (i / 2), tz = minZ + (maxZ - minZ) * (j / 2);
    if (!segmentBlocked(cam.x, cam.y, cam.z, tx, ty, tz, boxes, ck)) return false;
  }
  return true;
}
