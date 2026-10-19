export interface BuildingEntranceConfig {
  id: string;
  name: string;
  category: string;
  position: [number, number, number];
  colorHex?: string;
  radius?: number;
  height?: number;
  subtitle?: string;
  interiorStory?: string;
}
