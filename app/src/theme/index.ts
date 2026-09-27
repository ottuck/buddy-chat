import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F4F1',
  surface: '#FFFFFF',
  border: '#E7E2DC',
  text: '#2B2622',
  textMuted: '#8A817A',
  accent: '#F07A4A',
  onAccent: '#FFFFFF',
  bubbleMine: '#FFE1D2',
  bubbleMineText: '#3A2A22',
  bubbleTheirs: '#FFFFFF',
  bubbleTheirsText: '#2B2622',
  online: '#3CC37A',
  fullness: '#F5B642',
  cleanliness: '#58B7E8',
  // The buddy's stage: a soft toy-screen tint, not a monochrome LCD.
  stage: '#EAF3E3',
  stageFloor: '#D6E6C8',
  stageLine: '#B8CFA4',
};

export type Colors = typeof light;

const dark: Colors = {
  background: '#16161A',
  surface: '#1F1F24',
  border: '#2E2E35',
  text: '#EDEAE6',
  textMuted: '#9A948E',
  accent: '#F07A4A',
  onAccent: '#FFFFFF',
  bubbleMine: '#5A3527',
  bubbleMineText: '#FFE9DE',
  bubbleTheirs: '#26262C',
  bubbleTheirsText: '#EDEAE6',
  online: '#3CC37A',
  fullness: '#F5B642',
  cleanliness: '#58B7E8',
  stage: '#1E2822',
  stageFloor: '#27352C',
  stageLine: '#36493C',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

// Web shows the same mobile layout, centered and capped at this width (docs/product.md, 플랫폼).
export const MAX_CONTENT_WIDTH = 560;
