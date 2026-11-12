export const frequencies = [60, 170, 350, 1000, 3500, 10000];
export const defaults = { volume: 100, bands: [0,0,0,0,0,0], bass: 0, clarity: 0, space: 0, mono: false, night: false, bypass: false };
export const presets = {
  flat: [0,0,0,0,0,0], music: [3,2,-1,0,2,3], voice: [-4,-2,0,3,4,1], cinema: [5,3,-1,1,2,3], bass: [7,4,0,-1,0,1]
};
export function normalize(value = {}) {
  const clamp = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
  return { volume: clamp(value.volume,0,400,100), bands: frequencies.map((_,i)=>clamp(value.bands?.[i],-12,12,0)), bass: clamp(value.bass,0,12,0), clarity: clamp(value.clarity,0,8,0), space: clamp(value.space,0,60,0), mono: value.mono === true, night: value.night === true, bypass: value.bypass === true };
}
