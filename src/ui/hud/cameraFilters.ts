/**
 * Lokam Mini — Camera Filters & Weather Atmospheric Compositor
 * Provides camera color grade presets and composite weather effects (rain, droplets, mist, fog).
 */

export interface CameraFilter {
  id: string;
  name: string;
  tag: string;
  cssBackdrop: string;
  canvasFilter: string;
  tint?: string;
  tintBlend?: GlobalCompositeOperation;
  badgeColor: string;
}

export const CAMERA_FILTERS: CameraFilter[] = [
  {
    id: 'normal',
    name: 'Normal',
    tag: 'NATURAL',
    cssBackdrop: '',
    canvasFilter: 'none',
    badgeColor: '#ffffff',
  },
  {
    id: 'vibrant',
    name: 'Vibrant Seaside',
    tag: 'VIVID',
    cssBackdrop: 'backdrop-contrast-115 backdrop-saturate-135 backdrop-brightness-105',
    canvasFilter: 'contrast(1.15) saturate(1.35) brightness(1.05)',
    badgeColor: '#38bdf8',
  },
  {
    id: 'cyberpunk',
    name: 'Neon Cyber',
    tag: 'NEON',
    cssBackdrop: 'backdrop-contrast-125 backdrop-saturate-145 backdrop-hue-rotate-[-10deg]',
    canvasFilter: 'contrast(1.22) saturate(1.4) hue-rotate(-10deg)',
    tint: 'rgba(236, 72, 153, 0.08)',
    tintBlend: 'screen',
    badgeColor: '#ec4899',
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    tag: 'SUNSET',
    cssBackdrop: 'backdrop-sepia-[0.25] backdrop-saturate-130 backdrop-brightness-105 backdrop-contrast-110',
    canvasFilter: 'sepia(0.25) saturate(1.3) brightness(1.05) contrast(1.1)',
    tint: 'rgba(245, 158, 11, 0.10)',
    tintBlend: 'overlay',
    badgeColor: '#f59e0b',
  },
  {
    id: 'vintage',
    name: 'Vintage 90s',
    tag: 'RETRO',
    cssBackdrop: 'backdrop-sepia-[0.38] backdrop-contrast-105 backdrop-brightness-95',
    canvasFilter: 'sepia(0.38) contrast(1.08) brightness(0.96) saturate(1.1)',
    badgeColor: '#d97706',
  },
  {
    id: 'noir',
    name: 'B&W Noir',
    tag: 'MONO',
    cssBackdrop: 'backdrop-grayscale backdrop-contrast-130 backdrop-brightness-95',
    canvasFilter: 'grayscale(1) contrast(1.35) brightness(0.95)',
    badgeColor: '#94a3b8',
  },
  {
    id: 'emerald',
    name: 'Tropical Emerald',
    tag: 'LUSH',
    cssBackdrop: 'backdrop-contrast-110 backdrop-saturate-130 backdrop-hue-rotate-[15deg]',
    canvasFilter: 'contrast(1.1) saturate(1.3) hue-rotate(15deg)',
    tint: 'rgba(16, 185, 129, 0.07)',
    tintBlend: 'overlay',
    badgeColor: '#10b981',
  },
  {
    id: 'polaroid',
    name: 'Polaroid Fade',
    tag: 'FILM',
    cssBackdrop: 'backdrop-contrast-105 backdrop-saturate-90 backdrop-brightness-110 backdrop-sepia-[0.15]',
    canvasFilter: 'contrast(1.05) saturate(0.9) brightness(1.1) sepia(0.15)',
    badgeColor: '#f43f5e',
  },
  {
    id: 'monsoon',
    name: 'Monsoon Drama',
    tag: 'WEATHER',
    cssBackdrop: 'backdrop-contrast-130 backdrop-saturate-115 backdrop-brightness-90',
    canvasFilter: 'contrast(1.3) saturate(1.15) brightness(0.92)',
    tint: 'rgba(30, 58, 138, 0.12)',
    tintBlend: 'multiply',
    badgeColor: '#6366f1',
  },
];

interface WeatherParams {
  rain: number;
  storm?: number;
  fog?: number;
  windSpeed?: number;
  windDir?: number;
}

/**
 * Draws realistic rain atmosphere, atmospheric depth, and camera lens water droplets onto the canvas.
 */
export function renderWeatherAtmosphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  weather: WeatherParams
): void {
  const { rain, storm = 0, fog = 0, windSpeed = 0.3 } = weather;
  if (rain <= 0.02 && storm <= 0.05 && fog <= 0.1) return;

  ctx.save();

  // 1. Atmospheric Rain / Storm Mist Haze at horizon & lower frame
  if (rain > 0.05 || storm > 0.1) {
    const mistGradient = ctx.createLinearGradient(0, height * 0.45, 0, height);
    const mistAlpha = Math.min(0.28, rain * 0.22 + storm * 0.1);
    mistGradient.addColorStop(0, `rgba(200, 220, 240, 0)`);
    mistGradient.addColorStop(0.7, `rgba(185, 210, 235, ${mistAlpha * 0.5})`);
    mistGradient.addColorStop(1, `rgba(170, 200, 230, ${mistAlpha})`);
    ctx.fillStyle = mistGradient;
    ctx.fillRect(0, height * 0.45, width, height * 0.55);
  }

  // 2. High-Speed Rain Streaks (Physics-based motion blurred streaks)
  if (rain > 0.05) {
    const streakCount = Math.floor(Math.min(180, 45 + rain * 160));
    ctx.lineWidth = Math.max(1, width * 0.0012);
    ctx.strokeStyle = `rgba(225, 240, 255, ${Math.min(0.55, 0.25 + rain * 0.3)})`;
    ctx.lineCap = 'round';

    const slant = (windSpeed - 0.2) * 22;
    const streakLen = Math.max(18, height * 0.05 * (0.8 + rain * 0.6));

    ctx.beginPath();
    // Deterministic spread across frame based on seed
    for (let i = 0; i < streakCount; i++) {
      const rx = (Math.sin(i * 997) * 0.5 + 0.5) * width;
      const ry = (Math.cos(i * 613) * 0.5 + 0.5) * height;
      const len = streakLen * (0.6 + (Math.sin(i * 331) * 0.5 + 0.5) * 0.8);
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + slant, ry + len);
    }
    ctx.stroke();
  }

  // 3. Camera Lens Rain Droplets (Glistening water beads on camera glass)
  if (rain > 0.08) {
    const dropletCount = Math.floor(Math.min(32, 8 + rain * 24));
    
    for (let i = 0; i < dropletCount; i++) {
      // Semi-random distributed positions favoring edges and corners like a real camera
      const angle = (i / dropletCount) * Math.PI * 2 + Math.sin(i * 13) * 0.4;
      const dist = (0.3 + (Math.sin(i * 47) * 0.5 + 0.5) * 0.68) * Math.min(width, height) * 0.5;
      const cx = width * 0.5 + Math.cos(angle) * dist;
      const cy = height * 0.5 + Math.sin(angle) * dist;
      const radius = Math.max(3.5, Math.min(16, (width * 0.007) * (0.7 + (Math.cos(i * 29) * 0.5 + 0.5) * 1.2)));

      // Droplet outer refraction ring (dark refraction shadow)
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 10, 25, 0.28)';
      ctx.fill();

      // Droplet inner glass reflection highlight (water refraction gradient)
      const dropGrad = ctx.createRadialGradient(
        cx - radius * 0.25,
        cy - radius * 0.25,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      dropGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      dropGrad.addColorStop(0.5, 'rgba(210, 235, 255, 0.25)');
      dropGrad.addColorStop(0.85, 'rgba(140, 180, 220, 0.4)');
      dropGrad.addColorStop(1, 'rgba(0, 15, 35, 0.45)');
      ctx.fillStyle = dropGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Specular pin-point white light reflection
      ctx.beginPath();
      ctx.arc(cx - radius * 0.35, cy - radius * 0.35, Math.max(1, radius * 0.22), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();

      // Minor secondary rim light
      ctx.beginPath();
      ctx.arc(cx + radius * 0.25, cy + radius * 0.25, Math.max(0.6, radius * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();

      // Subtle water drip trail on occasional larger droplets
      if (radius > 10 && i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.4, cy + radius * 0.6);
        ctx.quadraticCurveTo(cx, cy + radius * 1.8, cx + radius * 0.2, cy + radius * 2.2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = Math.max(1, radius * 0.2);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}
