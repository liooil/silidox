// Direct rasterized megastructure and foreground geometry.
(function defineSilidoxKerrDirectGeometry(global) {
  const namespace = (global.SilidoxKerr = global.SilidoxKerr || {});

  namespace.ringDirectShader = /* wgsl */ `
struct SceneUniforms {
  viewport_time: vec4f,
  construction: vec4f,
  lens: vec4f,
  camera: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var<storage, read> segments: array<vec4f>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) world_normal: vec3f,
  @location(1) screen_position: vec2f,
  @location(2) module_state: vec4f,
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const RING_RADIUS: f32 = 9.25;
const SEGMENT_COUNT: f32 = 144.0;

fn rotate2(value: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(c * value.x - s * value.y, s * value.x + c * value.y);
}

fn cubePosition(index: u32) -> vec3f {
  var vertices = array<vec3f, 36>(
    vec3f(-1.0, -1.0,  1.0), vec3f( 1.0, -1.0,  1.0), vec3f( 1.0,  1.0,  1.0),
    vec3f(-1.0, -1.0,  1.0), vec3f( 1.0,  1.0,  1.0), vec3f(-1.0,  1.0,  1.0),
    vec3f( 1.0, -1.0, -1.0), vec3f(-1.0, -1.0, -1.0), vec3f(-1.0,  1.0, -1.0),
    vec3f( 1.0, -1.0, -1.0), vec3f(-1.0,  1.0, -1.0), vec3f( 1.0,  1.0, -1.0),
    vec3f(-1.0,  1.0,  1.0), vec3f( 1.0,  1.0,  1.0), vec3f( 1.0,  1.0, -1.0),
    vec3f(-1.0,  1.0,  1.0), vec3f( 1.0,  1.0, -1.0), vec3f(-1.0,  1.0, -1.0),
    vec3f(-1.0, -1.0, -1.0), vec3f( 1.0, -1.0, -1.0), vec3f( 1.0, -1.0,  1.0),
    vec3f(-1.0, -1.0, -1.0), vec3f( 1.0, -1.0,  1.0), vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0, -1.0,  1.0), vec3f( 1.0, -1.0, -1.0), vec3f( 1.0,  1.0, -1.0),
    vec3f( 1.0, -1.0,  1.0), vec3f( 1.0,  1.0, -1.0), vec3f( 1.0,  1.0,  1.0),
    vec3f(-1.0, -1.0, -1.0), vec3f(-1.0, -1.0,  1.0), vec3f(-1.0,  1.0,  1.0),
    vec3f(-1.0, -1.0, -1.0), vec3f(-1.0,  1.0,  1.0), vec3f(-1.0,  1.0, -1.0),
  );
  return vertices[index];
}

fn cubeNormal(index: u32) -> vec3f {
  var normals = array<vec3f, 6>(
    vec3f(0.0, 0.0, 1.0),
    vec3f(0.0, 0.0, -1.0),
    vec3f(0.0, 1.0, 0.0),
    vec3f(0.0, -1.0, 0.0),
    vec3f(1.0, 0.0, 0.0),
    vec3f(-1.0, 0.0, 0.0),
  );
  return normals[index / 6u];
}

@vertex
fn vertex_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  let segment = segments[instanceIndex];
  let angle = segment.x;
  let built = segment.y;
  let inclination = scene.camera.x;
  let basisX = vec3f(1.0, 0.0, 0.0);
  let basisZ = vec3f(0.0, cos(inclination), -sin(inclination));
  let normal = vec3f(0.0, sin(inclination), cos(inclination));
  let radial = basisX * cos(angle) + basisZ * sin(angle);
  let tangent = -basisX * sin(angle) + basisZ * cos(angle);
  let local = cubePosition(vertexIndex);
  let segmentLength = TAU * RING_RADIUS / SEGMENT_COUNT * 0.43;
  let world = radial * RING_RADIUS
    + tangent * local.x * segmentLength
    + normal * local.y * 0.105
    + radial * local.z * 0.42;

  let projected = rotate2(world.xy / scene.lens.z, -scene.camera.y);
  let screenPosition = vec2f(projected.x, -projected.y) + scene.lens.xy;
  let resolution = scene.viewport_time.xy;
  let minimumDimension = min(resolution.x, resolution.y);
  let clip = vec2f(
    screenPosition.x * minimumDimension / resolution.x,
    -screenPosition.y * minimumDimension / resolution.y,
  );
  let depth = clamp(0.52 - world.z * 0.018, 0.02, 0.98);
  let localNormal = cubeNormal(vertexIndex);
  let worldNormal = normalize(
    tangent * localNormal.x + normal * localNormal.y + radial * localNormal.z
  );

  var output: VertexOutput;
  output.position = vec4f(select(vec2f(3.0), clip, built > 0.001), depth, 1.0);
  output.world_normal = worldNormal;
  output.screen_position = screenPosition;
  output.module_state = vec4f(fract(angle / TAU), built, segment.z, step(0.0, world.z));
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let fromCenter = input.screen_position - scene.lens.xy;
  if (input.module_state.w < 0.5 && length(fromCenter) < 0.62) {
    discard;
  }
  let inward = normalize(vec3f(0.25, 0.48, 0.84));
  let diffuse = 0.22 + 0.78 * abs(dot(normalize(input.world_normal), inward));
  let modulePhase = fract(input.module_state.x * 144.0);
  let panel = smoothstep(0.04, 0.16, modulePhase) * (1.0 - smoothstep(0.84, 0.97, modulePhase));
  let collector = pow(max(0.5 + 0.5 * cos(input.module_state.x * TAU * 18.0), 0.0), 46.0);
  let navigation = pow(max(0.5 + 0.5 * cos(input.module_state.x * TAU * 72.0 + 0.8), 0.0), 56.0);
  let metal = mix(vec3f(0.012, 0.016, 0.020), vec3f(0.105, 0.095, 0.075), panel) * diffuse;
  let reflectedDisk = vec3f(0.42, 0.13, 0.025) * max(dot(-input.world_normal, inward), 0.0) * 0.28;
  let leading = input.module_state.z;
  let color = metal
    + reflectedDisk
    + vec3f(1.10, 0.25, 0.020) * collector * (0.36 + scene.construction.y * 0.52)
    + vec3f(0.06, 0.30, 0.82) * navigation
    + vec3f(1.20, 0.52, 0.10) * leading * (0.72 + 0.28 * sin(scene.viewport_time.z * 13.0));
  return vec4f(color, 1.0);
}
`;

  namespace.foregroundShader = /* wgsl */ `
struct SceneUniforms {
  viewport_time: vec4f,
  construction: vec4f,
  lens: vec4f,
  camera: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexInput {
  @location(0) geometry: vec4f,
  @location(1) style: vec4f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
}

@vertex
fn vertex_main(input: VertexInput, @builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let corner = corners[vertexIndex];
  let angle = input.style.x;
  let c = cos(angle);
  let s = sin(angle);
  let scaled = corner * input.geometry.zw;
  let rotated = vec2f(c * scaled.x - s * scaled.y, s * scaled.x + c * scaled.y);
  let screenPosition = input.geometry.xy + rotated;
  let resolution = scene.viewport_time.xy;
  let minimumDimension = min(resolution.x, resolution.y);
  let clip = vec2f(
    screenPosition.x * minimumDimension / resolution.x,
    -screenPosition.y * minimumDimension / resolution.y,
  );
  var output: VertexOutput;
  output.position = vec4f(clip, 0.04, 1.0);
  output.local = corner;
  output.color = input.style.yzw;
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.74, 0.99, max(abs(input.local.x), abs(input.local.y)));
  let rib = 0.70 + 0.30 * (1.0 - smoothstep(0.035, 0.16, abs(sin(input.local.x * 22.0))));
  let construction = smoothstep(0.16, 0.60, scene.construction.x);
  return vec4f(input.color * rib * construction * 0.34, edge * construction * 0.94);
}
`;

  namespace.createForegroundInstances = function createForegroundInstances() {
    const shapes = [];
    const add = (centerX, centerY, halfWidth, halfHeight, angle, red, green, blue) => {
      shapes.push(centerX, centerY, halfWidth, halfHeight, angle, red, green, blue);
    };
    const addBeam = (startX, startY, endX, endY, width, color) => {
      const dx = endX - startX;
      const dy = endY - startY;
      add(
        (startX + endX) * 0.5,
        (startY + endY) * 0.5,
        Math.hypot(dx, dy) * 0.5,
        width,
        Math.atan2(dy, dx),
        ...color,
      );
    };

    add(-1.28, 0.57, 0.72, 0.12, -0.045, 0.15, 0.16, 0.16);
    add(-0.93, 0.42, 0.31, 0.075, -0.025, 0.20, 0.20, 0.18);
    add(-0.61, 0.32, 0.078, 0.19, 0.035, 0.18, 0.19, 0.18);
    add(1.36, 0.50, 0.57, 0.105, 0.045, 0.15, 0.16, 0.16);
    add(1.12, 0.37, 0.25, 0.078, 0.025, 0.20, 0.20, 0.18);
    add(0.88, 0.29, 0.070, 0.18, -0.040, 0.18, 0.19, 0.18);
    add(-1.56, 0.43, 0.12, 0.065, -0.020, 0.25, 0.25, 0.22);
    add(-1.28, 0.45, 0.11, 0.058, -0.030, 0.25, 0.25, 0.22);
    add(-0.78, 0.37, 0.095, 0.055, 0.015, 0.25, 0.25, 0.22);
    add(1.61, 0.38, 0.12, 0.06, 0.025, 0.25, 0.25, 0.22);
    add(1.38, 0.39, 0.11, 0.055, 0.030, 0.25, 0.25, 0.22);
    add(1.02, 0.33, 0.09, 0.052, -0.015, 0.25, 0.25, 0.22);
    addBeam(-1.80, 0.47, -0.54, 0.28, 0.018, [0.31, 0.31, 0.28]);
    addBeam(-1.80, 0.52, -0.54, 0.34, 0.010, [0.36, 0.35, 0.31]);
    addBeam(1.80, 0.38, 0.72, 0.23, 0.018, [0.31, 0.31, 0.28]);
    addBeam(1.80, 0.44, 0.72, 0.29, 0.010, [0.36, 0.35, 0.31]);
    addBeam(-1.68, 0.49, -1.43, 0.58, 0.008, [0.38, 0.37, 0.33]);
    addBeam(-1.43, 0.58, -1.18, 0.41, 0.008, [0.38, 0.37, 0.33]);
    addBeam(-1.18, 0.41, -0.93, 0.56, 0.008, [0.38, 0.37, 0.33]);
    addBeam(-0.93, 0.56, -0.68, 0.32, 0.008, [0.38, 0.37, 0.33]);
    addBeam(1.76, 0.40, 1.52, 0.49, 0.008, [0.38, 0.37, 0.33]);
    addBeam(1.52, 0.49, 1.29, 0.32, 0.008, [0.38, 0.37, 0.33]);
    addBeam(1.29, 0.32, 1.05, 0.47, 0.008, [0.38, 0.37, 0.33]);
    addBeam(1.05, 0.47, 0.79, 0.26, 0.008, [0.38, 0.37, 0.33]);
    return new Float32Array(shapes);
  };
})(globalThis);
