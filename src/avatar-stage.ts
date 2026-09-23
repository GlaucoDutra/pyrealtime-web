import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AvatarToolHost } from "./tool-router";

const PROCEDURAL_ANIMATIONS = ["idle", "yes", "no", "wave", "thinking", "celebrate"];

interface AnimationOptions {
  loop?: boolean;
  returnToIdle?: boolean;
}

export class AvatarStage implements AvatarToolHost {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  private readonly clock = new THREE.Clock();
  private readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private idleAction: THREE.AnimationAction | null = null;
  private activeAction: THREE.AnimationAction | null = null;
  private gesture: { name: string; started: number; duration: number; loop: boolean } | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private audioContext: AudioContext | null = null;
  private resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private proceduralHead: THREE.Mesh | null = null;
  private proceduralMouth: THREE.Mesh | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.camera.position.set(0, 0.25, 4.4);
    this.scene.add(new THREE.HemisphereLight(0xb8e8ff, 0x10213c, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3.5);
    key.position.set(3, 4, 5);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x25bfff, 10, 10);
    rim.position.set(-2.5, 1.5, -1);
    this.scene.add(rim);
    this.scene.add(this.root);

    this.createProceduralAvatar();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animate();
  }

  private createProceduralAvatar(): void {
    this.clearRoot();
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x15549a,
      emissive: 0x07294d,
      roughness: 0.24,
      metalness: 0.58,
      clearcoat: 0.9,
    });
    const faceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9eefff,
      emissive: 0x188aca,
      emissiveIntensity: 0.8,
      roughness: 0.18,
      metalness: 0.25,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.76, 1.05, 12, 28), bodyMaterial);
    body.position.y = -0.55;
    this.root.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 48, 32), bodyMaterial);
    head.scale.set(1, 0.92, 0.82);
    head.position.y = 0.75;
    this.root.add(head);
    this.proceduralHead = head;

    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.56, 48, 24, 0, Math.PI * 2, 0.35, 1.32), faceMaterial);
    visor.rotation.x = -0.06;
    visor.position.set(0, 0.82, 0.43);
    visor.scale.set(1, 0.58, 0.35);
    this.root.add(visor);

    const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.25, 8, 16), faceMaterial);
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(0, 0.53, 0.68);
    mouth.scale.set(1, 1, 0.45);
    this.root.add(mouth);
    this.proceduralMouth = mouth;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.28, 0.018, 12, 96),
      new THREE.MeshBasicMaterial({ color: 0x42d7ff, transparent: true, opacity: 0.46 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.34;
    this.root.add(ring);
  }

  async load(url: string): Promise<void> {
    if (!url) {
      this.createProceduralAvatar();
      return;
    }
    const gltf = await new GLTFLoader().loadAsync(url);
    this.clearRoot();
    this.root.add(gltf.scene);
    this.clips = gltf.animations;
    this.mixer = new THREE.AnimationMixer(gltf.scene);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 2.7 / Math.max(size.x, size.y, size.z, 0.001);
    gltf.scene.scale.setScalar(scale);
    gltf.scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

    const idle = this.clips.find((clip) => /idle/i.test(clip.name)) ?? this.clips[0];
    if (idle) {
      this.idleAction = this.mixer.clipAction(idle);
      this.idleAction.play();
    }
  }

  availableAnimations(): string[] {
    const embedded = this.clips.map((clip) => clip.name).filter(Boolean);
    return Array.from(new Set([...PROCEDURAL_ANIMATIONS, ...embedded]));
  }

  async playAnimation(name: string, options: AnimationOptions = {}): Promise<unknown> {
    const normalized = name.trim().toLowerCase();
    const clip = this.clips.find((candidate) => candidate.name.toLowerCase() === normalized)
      ?? this.clips.find((candidate) => candidate.name.toLowerCase().includes(normalized));

    if (clip && this.mixer) {
      this.activeAction?.fadeOut(0.18);
      this.idleAction?.fadeOut(0.18);
      const action = this.mixer.clipAction(clip).reset().fadeIn(0.18);
      action.clampWhenFinished = true;
      action.setLoop(options.loop ? THREE.LoopRepeat : THREE.LoopOnce, options.loop ? Infinity : 1);
      action.play();
      this.activeAction = action;
      if (!options.loop && options.returnToIdle !== false) {
        window.setTimeout(() => {
          action.fadeOut(0.22);
          this.idleAction?.reset().fadeIn(0.22).play();
        }, Math.max(clip.duration * 1_000 - 180, 100));
      }
      return { ok: true, clip_name: clip.name, source: "gltf" };
    }

    const gestureName = PROCEDURAL_ANIMATIONS.find((candidate) => normalized.includes(candidate))
      ?? (/(approve|thumb|nod)/.test(normalized) ? "yes" : undefined)
      ?? (/(reject|shake)/.test(normalized) ? "no" : undefined)
      ?? "wave";
    this.gesture = { name: gestureName, started: performance.now(), duration: 1_350, loop: options.loop === true };
    return { ok: true, clip_name: gestureName, source: "procedural" };
  }

  attachAudioStream(stream: MediaStream): void {
    void this.closeAudioAnalyser();
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    this.audioContext = context;
    this.analyser = analyser;
    this.analyserData = new Uint8Array(analyser.frequencyBinCount);
  }

  private audioLevel(): number {
    if (!this.analyser || !this.analyserData) return 0;
    this.analyser.getByteFrequencyData(this.analyserData);
    let total = 0;
    for (const value of this.analyserData) total += value;
    return total / this.analyserData.length / 255;
  }

  private applyGesture(time: number): void {
    if (!this.proceduralHead) return;
    this.proceduralHead.rotation.set(0, 0, 0);
    this.root.rotation.z *= 0.86;
    this.root.position.y = Math.sin(time * 0.0017) * 0.025;
    if (!this.gesture) return;

    const elapsed = time - this.gesture.started;
    const progress = elapsed / this.gesture.duration;
    if (progress >= 1 && !this.gesture.loop) {
      this.gesture = null;
      return;
    }
    const phase = (progress % 1) * Math.PI * 2;
    if (this.gesture.name === "yes") this.proceduralHead.rotation.x = Math.sin(phase * 2) * 0.28;
    else if (this.gesture.name === "no") this.proceduralHead.rotation.y = Math.sin(phase * 2) * 0.36;
    else if (this.gesture.name === "thinking") this.proceduralHead.rotation.z = 0.13 + Math.sin(phase) * 0.05;
    else if (this.gesture.name === "celebrate") this.root.position.y += Math.abs(Math.sin(phase * 2)) * 0.28;
    else this.root.rotation.z = Math.sin(phase * 2) * 0.16;
  }

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const time = performance.now();
    this.mixer?.update(delta);
    this.applyGesture(time);
    const level = this.audioLevel();
    if (this.proceduralMouth) {
      this.proceduralMouth.scale.y = THREE.MathUtils.lerp(this.proceduralMouth.scale.y, 0.75 + level * 4.2, 0.26);
    }
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = Math.max(this.canvas.clientWidth, 1);
    const height = Math.max(this.canvas.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private clearRoot(): void {
    for (const child of [...this.root.children]) {
      child.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      this.root.remove(child);
    }
    this.mixer = null;
    this.clips = [];
    this.idleAction = null;
    this.activeAction = null;
    this.proceduralHead = null;
    this.proceduralMouth = null;
  }

  private async closeAudioAnalyser(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== "closed") await this.audioContext.close();
    this.audioContext = null;
    this.analyser = null;
    this.analyserData = null;
  }

  async destroy(): Promise<void> {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    await this.closeAudioAnalyser();
    this.clearRoot();
    this.renderer.dispose();
  }
}
