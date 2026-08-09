// Compute-driven ring construction state, energy ribbons, and construction units.
(function defineSilidoxKerrEnergyFlow(global) {
  const namespace = (global.SilidoxKerr = global.SilidoxKerr || {});
  namespace.segmentCount = 144;
  namespace.particleCount = 192;

  namespace.simulationShader = /* wgsl */ `
struct SceneUniforms {
  viewport_time: vec4f,
  construction: vec4f,
  lens: vec4f,
  camera: vec4f,
}

struct Particle {
  position_size: vec4f,
  style: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var<storage, read_write> segments: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const SEGMENT_COUNT: u32 = 144u;
const PARTICLE_COUNT: u32 = 192u;
const RING_RADIUS: f32 = 9.25;

fn hash11(value: f32) -> f32 {
  return fract(sin(value * 127.1) * 43758.5453);
}

fn rotate2(value: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(c * value.x - s * value.y, s * value.x + c * value.y);
}

fn projectRing(angle: f32, radius: f32) -> vec2f {
  let inclination = scene.camera.x;
  let world = vec3f(
    cos(angle) * radius,
    sin(angle) * cos(inclination) * radius,
    -sin(angle) * sin(inclination) * radius,
  );
  let projected = rotate2(world.xy / scene.lens.z, -scene.camera.y);
  return vec2f(projected.x, -projected.y) + scene.lens.xy;
}

@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) globalId: vec3u) {
  let index = globalId.x;
  if (index < SEGMENT_COUNT) {
    let arcProgress = (f32(index) + 0.5) / f32(SEGMENT_COUNT);
    let angle = arcProgress * TAU - 2.22;
    let built = 1.0 - smoothstep(
      scene.construction.x - 0.022,
      scene.construction.x + 0.022,
      arcProgress,
    );
    let leading = exp(-pow((arcProgress - scene.construction.x) / 0.018, 2.0))
      * smoothstep(0.02, 0.98, scene.construction.x);
    let activity = built * (0.62 + 0.38 * sin(scene.viewport_time.z * 2.1 + f32(index) * 0.31));
    segments[index] = vec4f(angle, built, leading, activity);
  }

  if (index < PARTICLE_COUNT) {
    let particleIndex = f32(index);
    let seed = hash11(particleIndex + 9.4);
    let power = smoothstep(0.61, 0.92, scene.construction.x);
    if (index < 144u) {
      let lane = index % 3u;
      let phase = fract(seed + scene.viewport_time.z * (0.16 + seed * 0.12));
      var start = vec2f(0.69, 0.24);
      var finish = vec2f(1.82, 0.24);
      var angle = 0.0;
      if (lane == 1u) {
        start = vec2f(-0.70, 0.06);
        finish = vec2f(-1.82, 0.10);
        angle = PI - 0.035;
      } else if (lane == 2u) {
        start = vec2f(0.68, -0.26);
        finish = vec2f(1.72, -0.31);
        angle = -0.048;
      }
      let transverse = (seed - 0.5) * 0.026;
      let tangent = normalize(finish - start);
      let normal = vec2f(-tangent.y, tangent.x);
      let position = mix(start, finish, phase) + normal * transverse;
      let intensity = power * smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.82, 1.0, phase));
      particles[index] = Particle(
        vec4f(position, 0.055 + seed * 0.055, 0.0035 + seed * 0.0025),
        vec4f(intensity, 0.0, angle, seed),
      );
    } else {
      let droneIndex = index - 144u;
      let droneSeed = hash11(f32(droneIndex) + 71.2);
      let frontier = scene.construction.x * TAU - 2.22;
      let angle = frontier + (droneSeed - 0.5) * 0.42 + sin(scene.viewport_time.z * 0.7 + droneSeed * TAU) * 0.035;
      let radius = RING_RADIUS + (hash11(f32(droneIndex) + 14.8) - 0.5) * 1.25;
      let position = projectRing(angle, radius)
        + vec2f(0.0, (hash11(f32(droneIndex) + 33.4) - 0.5) * 0.075);
      // Ring-adjacent units must be reconstructed by the lens pass as well.
      // Keep their direct rasterized proxies hidden until that source model exists.
      let visibility = 0.0;
      particles[index] = Particle(
        vec4f(position, 0.014 + droneSeed * 0.012, 0.005 + droneSeed * 0.004),
        vec4f(max(visibility, 0.0), 1.0, angle, droneSeed),
      );
    }
  }
}
`;

  namespace.energyRenderShader = /* wgsl */ `
struct SceneUniforms {
  viewport_time: vec4f,
  construction: vec4f,
  lens: vec4f,
  camera: vec4f,
}

struct Particle {
  position_size: vec4f,
  style: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) style: vec4f,
}

@vertex
fn vertex_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let particle = particles[instanceIndex];
  let corner = corners[vertexIndex];
  let angle = particle.style.z;
  let c = cos(angle);
  let s = sin(angle);
  let scaled = corner * particle.position_size.zw;
  let rotated = vec2f(c * scaled.x - s * scaled.y, s * scaled.x + c * scaled.y);
  let screenPosition = particle.position_size.xy + rotated;
  let resolution = scene.viewport_time.xy;
  let minimumDimension = min(resolution.x, resolution.y);
  let clip = vec2f(
    screenPosition.x * minimumDimension / resolution.x,
    -screenPosition.y * minimumDimension / resolution.y,
  );
  var output: VertexOutput;
  output.position = vec4f(clip, 0.02, 1.0);
  output.local = corner;
  output.style = particle.style;
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let distance = length(input.local);
  let core = 1.0 - smoothstep(0.16, 0.82, distance);
  let halo = 1.0 - smoothstep(0.18, 1.0, distance);
  let energyColor = vec3f(1.65, 0.44, 0.055) * core + vec3f(0.82, 0.20, 0.025) * halo;
  let droneColor = vec3f(0.26, 0.62, 1.28) * core + vec3f(1.10, 0.52, 0.12) * halo * 0.42;
  let color = mix(energyColor, droneColor, step(0.5, input.style.y));
  return vec4f(color * input.style.x * 0.62, halo * input.style.x);
}
`;
})(globalThis);
