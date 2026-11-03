// The VO-locked edit. Each output segment plays one shot through a piecewise-linear
// time warp: keys are [outputLocal, sourceLocal]. Everything is re-rendered at the
// warped time (no frame duplication), so slow-downs stay smooth and speed-ups stay
// crisp; character "on twos" cadence is held at 15 fps of OUTPUT time.
export const EDIT = [
  { shot: 0, o0: 0.0, o1: 3.0, keys: [[0, 0], [3.0, 3.0]] }, // hook
  { shot: 1, o0: 3.0, o1: 8.5, keys: [[0, 0], [2.0, 2.2], [3.8, 4.7], [5.5, 7.0]] }, // impossible spoon
  { shot: 2, o0: 8.5, o1: 15.9, keys: [[0, 0], [2.55, 3.85], [3.65, 6.05], [5.05, 7.55], [7.4, 10.0]] }, // star collapses
  { shot: 3, o0: 15.9, o1: 26.0, keys: [[0, 0], [4.6, 5.3], [10.1, 12.0]] }, // density reveal
  { shot: 4, o0: 26.0, o1: 35.0, keys: [[0, 0], [9.0, 10.0]] }, // cosmic lighthouse
  { shot: 5, o0: 35.0, o1: 52.01, keys: [[0, 0], [17.01, 17.01]] }, // recap + final joke
];

export function warp(keys, x) {
  if (x <= keys[0][0]) return [keys[0][1], (keys[1][1] - keys[0][1]) / (keys[1][0] - keys[0][0])];
  for (let i = 1; i < keys.length; i++) {
    const [a0, b0] = keys[i - 1];
    const [a1, b1] = keys[i];
    if (x <= a1 || i === keys.length - 1) {
      const speed = (b1 - b0) / (a1 - a0);
      return [b0 + (x - a0) * speed, speed];
    }
  }
  return [x, 1];
}

// output time -> {shotIndex, srcLocal, speed}
export function locate(T) {
  const seg = EDIT.find((s) => T >= s.o0 && T < s.o1) || EDIT[EDIT.length - 1];
  const [src, speed] = warp(seg.keys, T - seg.o0);
  return { shot: seg.shot, src, speed, seg };
}
