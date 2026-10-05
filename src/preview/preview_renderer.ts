import type { BufferGeometry, InstancedMesh, Material, OrthographicCamera, Scene, WebGLRenderer } from 'three';
import type { ModelPlan, VoxelPlan } from '../types';

const BACKGROUND = '#1b1d25';
const DEFAULT_YAW = Math.PI / 4;
const DEFAULT_PITCH = Math.PI / 6;
const MIN_PITCH = -Math.PI / 2 + 0.08;
const MAX_PITCH = Math.PI / 2 - 0.08;

interface ProjectedPoint {
  x: number;
  y: number;
}

type FaceAxis = 'x' | 'y' | 'z';

interface VisibleFace {
  axis: FaceAxis;
  positive: boolean;
  shade: number;
  depth: number;
}

/** Renders ModelPlan data without creating or changing Blockbench project objects. */
export class PreviewRenderer {
  private readonly hostThree = (globalThis as typeof globalThis & {
    THREE?: typeof import('three');
  }).THREE;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly webglCanvas: HTMLCanvasElement;
  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: OrthographicCamera | null = null;
  private mesh: InstancedMesh | null = null;
  private geometry: BufferGeometry | null = null;
  private material: Material | null = null;
  private plan: ModelPlan | null = null;
  private webglUnavailable = false;
  private disposed = false;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private zoom = 1;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private pointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Texture Model preview requires a 2D canvas context.');
    this.canvas = canvas;
    this.context = context;
    // The visible canvas stays 2D so it remains usable if WebGL fails later.
    this.webglCanvas = document.createElement('canvas');
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerEnd);
    this.canvas.addEventListener('pointercancel', this.onPointerEnd);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.webglCanvas.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();
  }

  render(plan: ModelPlan): void {
    if (this.disposed) return;
    this.plan = plan;
    this.releaseModel();
    if (plan.voxelCount > 0 && this.prepareWebGL()) {
      try {
        this.createModel(plan);
      } catch {
        this.releaseWebGL();
        this.webglUnavailable = true;
      }
    }
    this.drawFrame();
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.round(this.canvas.clientWidth || (this.width > 1 ? this.width : this.canvas.width || 640)));
    const height = Math.max(1, Math.round(this.canvas.clientHeight || (this.height > 1 ? this.height : this.canvas.height || 360)));
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.width = width;
    this.height = height;
    this.pixelRatio = ratio;
    if (this.canvas.width !== Math.round(width * ratio)) this.canvas.width = Math.round(width * ratio);
    if (this.canvas.height !== Math.round(height * ratio)) this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.renderer?.setPixelRatio(ratio);
    this.renderer?.setSize(width, height, false);
    this.requestFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this.onPointerEnd);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.webglCanvas.removeEventListener('webglcontextlost', this.onContextLost);
    if (this.pointerId !== null && this.canvas.hasPointerCapture(this.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.releaseWebGL();
    this.plan = null;
  }

  private prepareWebGL(): boolean {
    if (this.webglUnavailable) return false;
    if (this.renderer) return true;
    const three = this.hostThree;
    if (!three?.InstancedMesh) {
      this.webglUnavailable = true;
      return false;
    }
    try {
      this.renderer = new three.WebGLRenderer({
        canvas: this.webglCanvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
      });
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height, false);
      this.renderer.setClearColor(BACKGROUND, 1);
      this.scene = new three.Scene();
      this.scene.add(new three.AmbientLight(0xffffff, 0.76));
      const light = new three.DirectionalLight(0xffffff, 0.54);
      light.position.set(1, 2, 3);
      this.scene.add(light);
      this.camera = new three.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      return true;
    } catch {
      this.releaseWebGL();
      this.webglUnavailable = true;
      return false;
    }
  }

  private createModel(plan: ModelPlan): void {
    const three = this.hostThree;
    if (!this.scene || !three) return;
    const count = plan.voxels.length;
    const size = plan.voxelSize;
    const geometry = new three.BoxGeometry(size, size, size);
    this.geometry = geometry;
    const alpha = new Float32Array(count);
    geometry.setAttribute('instanceAlpha', new three.InstancedBufferAttribute(alpha, 1));
    const material = new three.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: true
    });
    this.material = material;
    // Three r129 instanceColor carries RGB only. Add one alpha per instance.
    material.onBeforeCompile = (shader) => {
      const vertexMarker = '#include <begin_vertex>';
      const fragmentMarker = '#include <output_fragment>';
      if (!shader.vertexShader.includes(vertexMarker) || !shader.fragmentShader.includes(fragmentMarker)) {
        throw new Error('The host Three.js shader does not support instance alpha.');
      }
      shader.vertexShader = `attribute float instanceAlpha;\nvarying float vInstanceAlpha;\n${shader.vertexShader}`
        .replace(vertexMarker, `${vertexMarker}\nvInstanceAlpha = instanceAlpha;`);
      shader.fragmentShader = `varying float vInstanceAlpha;\n${shader.fragmentShader}`
        .replace(fragmentMarker, `diffuseColor.a *= vInstanceAlpha;\n${fragmentMarker}`);
    };
    const mesh = new three.InstancedMesh(geometry, material, count);
    const matrix = new three.Matrix4();
    const color = new three.Color();
    for (let index = 0; index < count; index += 1) {
      const voxel = plan.voxels[index];
      if (!voxel) continue;
      matrix.makeTranslation(voxel.x + size / 2, voxel.y + size / 2, voxel.z + size / 2);
      mesh.setMatrixAt(index, matrix);
      color.setRGB(voxel.rgba.r / 255, voxel.rgba.g / 255, voxel.rgba.b / 255);
      mesh.setColorAt(index, color);
      alpha[index] = voxel.rgba.a / 255;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    geometry.getAttribute('instanceAlpha').needsUpdate = true;
    this.mesh = mesh;
    this.scene.add(mesh);
  }

  private releaseModel(): void {
    if (this.mesh) {
      this.scene?.remove(this.mesh);
      this.mesh.dispose();
    }
    this.mesh = null;
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
  }

  private releaseWebGL(): void {
    this.releaseModel();
    const renderer = this.renderer;
    this.renderer = null;
    if (renderer) {
      try {
        renderer.dispose();
        renderer.forceContextLoss();
      } catch {
        // A lost WebGL context can reject cleanup calls; the 2D canvas remains usable.
      }
    }
    this.scene = null;
    this.camera = null;
    this.webglCanvas.width = 0;
    this.webglCanvas.height = 0;
  }

  private drawFrame(): void {
    if (this.disposed) return;
    this.frame = 0;
    this.context.fillStyle = BACKGROUND;
    this.context.fillRect(0, 0, this.width, this.height);
    if (!this.plan || this.plan.voxelCount === 0) {
      this.drawEmptyMessage();
      return;
    }
    if (this.renderer && this.scene && this.camera && this.mesh) {
      try {
        this.configureCamera(this.plan);
        this.renderer.render(this.scene, this.camera);
        this.context.drawImage(this.webglCanvas, 0, 0, this.width, this.height);
        return;
      } catch {
        this.releaseWebGL();
        this.webglUnavailable = true;
      }
    }
    this.drawCanvasFallback(this.plan);
  }

  private configureCamera(plan: ModelPlan): void {
    if (!this.camera) return;
    const size = plan.bounds.size;
    const center = plan.bounds.min.map((value, index) => (value + (plan.bounds.max[index] ?? value)) / 2);
    const diameter = Math.max(1, Math.hypot(size[0], size[1], size[2]));
    const halfHeight = diameter * 0.7 / Math.min(1, this.width / this.height) / this.zoom;
    const halfWidth = halfHeight * this.width / this.height;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.near = 0.1;
    this.camera.far = diameter * 8 + 100;
    const distance = diameter * 3 + 10;
    this.camera.position.set(
      (center[0] ?? 0) + Math.sin(this.yaw) * Math.cos(this.pitch) * distance,
      (center[1] ?? 0) + Math.sin(this.pitch) * distance,
      (center[2] ?? 0) + Math.cos(this.yaw) * Math.cos(this.pitch) * distance
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(center[0] ?? 0, center[1] ?? 0, center[2] ?? 0);
    this.camera.updateProjectionMatrix();
  }

  private drawEmptyMessage(): void {
    this.context.fillStyle = '#b9becb';
    this.context.font = '14px sans-serif';
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    this.context.fillText(this.plan ? '没有可预览的 Cube' : '选择纹理后预览', this.width / 2, this.height / 2);
  }

  private drawCanvasFallback(plan: ModelPlan): void {
    const centerX = (plan.bounds.min[0] + plan.bounds.max[0]) / 2;
    const centerY = (plan.bounds.min[1] + plan.bounds.max[1]) / 2;
    const centerZ = (plan.bounds.min[2] + plan.bounds.max[2]) / 2;
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const sinPitch = Math.sin(this.pitch);
    const cosPitch = Math.cos(this.pitch);
    const viewX = sinYaw * cosPitch;
    const viewY = sinPitch;
    const viewZ = cosYaw * cosPitch;
    const diameter = Math.max(1, Math.hypot(...plan.bounds.size));
    const scale = Math.min(this.width, this.height) * 0.7 * this.zoom / diameter;
    const project = (x: number, y: number, z: number): ProjectedPoint => {
      const dx = x - centerX;
      const dy = y - centerY;
      const dz = z - centerZ;
      return {
        x: this.width / 2 + (cosYaw * dx - sinYaw * dz) * scale,
        y: this.height / 2 - (-sinYaw * sinPitch * dx + cosPitch * dy - cosYaw * sinPitch * dz) * scale
      };
    };
    const sorted = plan.voxels.map((voxel) => ({
      voxel,
      depth: (voxel.x + plan.voxelSize / 2 - centerX) * viewX
        + (voxel.y + plan.voxelSize / 2 - centerY) * viewY
        + (voxel.z + plan.voxelSize / 2 - centerZ) * viewZ
    }));
    sorted.sort((a, b) => a.depth - b.depth);
    for (const item of sorted) {
      const voxel = item.voxel;
      if (voxel.rgba.a === 0) continue;
      const faces: VisibleFace[] = [
        { axis: 'x', positive: viewX >= 0, shade: 0.74, depth: Math.abs(viewX) },
        { axis: 'y', positive: viewY >= 0, shade: viewY >= 0 ? 1 : 0.48, depth: Math.abs(viewY) },
        { axis: 'z', positive: viewZ >= 0, shade: 0.85, depth: Math.abs(viewZ) }
      ];
      faces.sort((a, b) => a.depth - b.depth);
      for (const face of faces) this.drawVoxelFace(voxel, face, plan.voxelSize, project);
    }
  }

  private drawVoxelFace(
    voxel: VoxelPlan,
    face: VisibleFace,
    size: number,
    project: (x: number, y: number, z: number) => ProjectedPoint
  ): void {
    const x0 = voxel.x;
    const y0 = voxel.y;
    const z0 = voxel.z;
    const x1 = x0 + size;
    const y1 = y0 + size;
    const z1 = z0 + size;
    let points: ProjectedPoint[];
    if (face.axis === 'x') {
      const x = face.positive ? x1 : x0;
      points = [project(x, y0, z0), project(x, y0, z1), project(x, y1, z1), project(x, y1, z0)];
    } else if (face.axis === 'y') {
      const y = face.positive ? y1 : y0;
      points = [project(x0, y, z0), project(x1, y, z0), project(x1, y, z1), project(x0, y, z1)];
    } else {
      const z = face.positive ? z1 : z0;
      points = [project(x0, y0, z), project(x1, y0, z), project(x1, y1, z), project(x0, y1, z)];
    }
    const [first, ...rest] = points;
    if (!first) return;
    const color = voxel.rgba;
    this.context.fillStyle = `rgba(${Math.round(color.r * face.shade)}, ${Math.round(color.g * face.shade)}, ${Math.round(color.b * face.shade)}, ${color.a / 255})`;
    this.context.beginPath();
    this.context.moveTo(first.x, first.y);
    for (const point of rest) this.context.lineTo(point.x, point.y);
    this.context.closePath();
    this.context.fill();
  }

  private requestFrame(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => this.drawFrame());
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.disposed || event.button !== 0) return;
    this.pointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    const dx = event.clientX - this.lastPointerX;
    const dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.yaw += dx * 0.008;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * 0.008));
    this.requestFrame();
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.pointerId = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.disposed) return;
    event.preventDefault();
    this.zoom = Math.min(12, Math.max(0.2, this.zoom * Math.exp(-event.deltaY * 0.001)));
    this.requestFrame();
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.releaseWebGL();
    this.webglUnavailable = true;
    this.requestFrame();
  };
}
