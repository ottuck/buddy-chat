import { memo, useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';

// A pixel-art frame: equal-length rows, one character per pixel. '.' is transparent; every other
// character is looked up in the palette. Drawn as SVG squares, so it stays crisp at any size on
// iOS and the web (a scaled-up bitmap would be smoothed and blurry).
export type Frame = readonly string[];
export type Palette = Readonly<Record<string, string>>;

type Run = { x: number; y: number; width: number; color: string };

// Adjacent pixels of one color in a row become one rectangle.
function toRuns(frame: Frame, palette: Palette): Run[] {
  const runs: Run[] = [];
  frame.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      const color = palette[key];
      if (key !== '.' && color) runs.push({ x, y, width: end - x, color });
      x = end;
    }
  });
  return runs;
}

type Props = {
  frame: Frame;
  palette: Palette;
  // Screen points per pixel.
  scale: number;
  // Mirror horizontally (facing the other way).
  flipped?: boolean;
};

export const PixelSprite = memo(function PixelSprite({ frame, palette, scale, flipped }: Props) {
  const runs = useMemo(() => toRuns(frame, palette), [frame, palette]);
  const width = frame[0]?.length ?? 0;
  const height = frame.length;
  return (
    <Svg
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      style={flipped ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      {runs.map((run) => (
        // A hair wider than the run: without it, anti-aliasing leaves faint seams between squares.
        <Rect
          key={`${run.x},${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width + 0.02}
          height={1.02}
          fill={run.color}
        />
      ))}
    </Svg>
  );
});
