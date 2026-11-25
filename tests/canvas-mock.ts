/**
 * Chart.js needs a CanvasRenderingContext2D. happy-dom does not implement one,
 * so tests install this stub before creating charts.
 */

type AnyFn = (...args: unknown[]) => unknown;

function stubContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const noop: AnyFn = () => undefined;
  const gradient = { addColorStop: noop } as unknown as CanvasGradient;
  const ctx: Record<string, unknown> = {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '12px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalCompositeOperation: 'source-over',
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (text: unknown) => ({ width: String(text).length * 6 }),
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    transform: noop,
    setTransform: noop,
    resetTransform: noop,
    drawImage: noop,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: noop,
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    setLineDash: noop,
    getLineDash: () => [],
    lineDashOffset: 0,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

export function installCanvasMock(): void {
  const proto = HTMLCanvasElement.prototype;
  proto.getContext = function getContext(this: HTMLCanvasElement, type: string) {
    if (type === '2d') return stubContext(this);
    return null;
  } as typeof proto.getContext;

  if (typeof window.devicePixelRatio !== 'number') {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }

  for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'] as const) {
    const fallback = prop.endsWith('Width') ? 800 : 360;
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(): number {
        const inline = Number.parseInt(this.style[prop.endsWith('Width') ? 'width' : 'height'] ?? '', 10);
        return Number.isFinite(inline) && inline > 0 ? inline : fallback;
      },
    });
  }
}
