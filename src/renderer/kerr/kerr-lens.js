// Star/diagnostic source sampling with a Schwarzschild baseline and visual Kerr correction.
// Orbit invariant and critical capture condition follow the model described in:
// https://ebruneton.github.io/black_hole_shader/
(function defineSilidoxKerrLens(global) {
  const namespace = (global.SilidoxKerr = global.SilidoxKerr || {});

  namespace.skyShader = /* wgsl */ `
struct SceneUniforms {
  viewport_time: vec4f,
  construction: vec4f,
  lens: vec4f,
  camera: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var grid_texture: texture_2d<f32>;
@group(0) @binding(2) var grid_sampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
}

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var output: VertexOutput;
  output.position = vec4f(positions[index], 0.0, 1.0);
  return output;
}

@fragment
fn fragment_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let resolution = max(scene.viewport_time.xy, vec2f(1.0));
  let uv = frag.xy / resolution;
  return vec4f(textureSampleLevel(grid_texture, grid_sampler, uv, 0.0).rgb, 1.0);
}
`;

  namespace.lensShader = /* wgsl */ `
struct SceneUniforms {
  viewport_time: vec4f,
  construction: vec4f,
  lens: vec4f,
  camera: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var grid_texture: texture_2d<f32>;
@group(0) @binding(2) var grid_sampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
}

struct DiskSample {
  emission: vec3f,
  opacity: f32,
}

struct RingSample {
  emission: vec3f,
  opacity: f32,
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const CRITICAL_E_SQUARE: f32 = 4.0 / 27.0;
const HORIZON_RADIUS: f32 = 1.0;
const PHOTON_RADIUS: f32 = 1.50;
const DISK_INNER_RADIUS: f32 = 3.0;
const DISK_OUTER_RADIUS: f32 = 7.35;
const RING_RADIUS: f32 = 9.25;
const RING_HALF_WIDTH: f32 = 0.72;

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var output: VertexOutput;
  output.position = vec4f(positions[index], 0.0, 1.0);
  return output;
}

fn rotate2(value: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(c * value.x - s * value.y, s * value.x + c * value.y);
}

fn sampleGrid(uv: vec2f) -> vec3f {
  // Extend the finite diagnostic canvas across the source plane. Otherwise an
  // escaped ray outside the first tile is indistinguishable from capture.
  return textureSampleLevel(grid_texture, grid_sampler, fract(uv), 0.0).rgb;
}

fn screenToGridUv(screen: vec2f) -> vec2f {
  let resolution = max(scene.viewport_time.xy, vec2f(1.0));
  let pixel = (screen * min(resolution.x, resolution.y) + resolution) * 0.5;
  return pixel / resolution;
}

fn rayPlaneToScreen(point: vec2f) -> vec2f {
  let unrolled = rotate2(point / scene.lens.z, -scene.camera.y);
  return vec2f(unrolled.x, -unrolled.y) + scene.lens.xy;
}

fn sampleEscapedGrid(origin: vec3f, direction: vec3f, winding: f32) -> vec3f {
  if (abs(direction.z) < 0.00001) {
    return vec3f(0.002, 0.005, 0.009);
  }
  let sourcePlaneZ = select(14.0, -14.0, direction.z < 0.0);
  let travel = (sourcePlaneZ - origin.z) / direction.z;
  if (travel <= 0.0) {
    return vec3f(0.002, 0.005, 0.009);
  }
  let hit = origin + direction * travel;
  let uv = screenToGridUv(rayPlaneToScreen(hit.xy));
  let imageOrder = clamp(abs(winding) / TAU, 0.0, 3.0);
  let texel = 1.0 / max(scene.viewport_time.xy, vec2f(1.0));
  let spread = texel * (0.35 + imageOrder * 1.35);
  var color = sampleGrid(uv) * 0.50;
  color += sampleGrid(uv + vec2f(spread.x, 0.0)) * 0.125;
  color += sampleGrid(uv - vec2f(spread.x, 0.0)) * 0.125;
  color += sampleGrid(uv + vec2f(0.0, spread.y)) * 0.125;
  color += sampleGrid(uv - vec2f(0.0, spread.y)) * 0.125;
  return color;
}

fn positiveModulo(value: f32, period: f32) -> f32 {
  return value - floor(value / period) * period;
}

fn wrappedAngleDifference(previous: f32, current: f32) -> f32 {
  return positiveModulo(current - previous + PI, TAU) - PI;
}

fn rotateAroundAxis(value: vec3f, axis: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return value * c + cross(axis, value) * s + axis * dot(axis, value) * (1.0 - c);
}

// Real-time visual Kerr correction applied on top of the stable Schwarzschild
// orbit baseline. This is not an exact Kerr geodesic solver.
fn pseudoKerrAcceleration(u: f32, kerrBias: f32) -> f32 {
  let schwarzschild = 1.5 * u * u - u;
  let frameDragging = kerrBias * 0.18 * u * u * u;
  return schwarzschild + frameDragging;
}

fn blackbody(temperature: f32) -> vec3f {
  let t = clamp(temperature, 1500.0, 40000.0) / 100.0;
  var red = 1.0;
  var green = 1.0;
  var blue = 1.0;
  if (t > 66.0) {
    red = clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
    green = clamp(1.129891 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  } else {
    green = clamp(0.390082 * log(t) - 0.631842, 0.0, 1.0);
    if (t <= 19.0) {
      blue = 0.0;
    } else {
      blue = clamp(0.543207 * log(t - 10.0) - 1.196254, 0.0, 1.0);
    }
  }
  return vec3f(red, green, blue);
}

fn orbitPosition(u: f32, phi: f32, impactDirection: vec3f) -> vec3f {
  let radial = impactDirection * sin(phi) + vec3f(0.0, 0.0, 1.0) * cos(phi);
  return radial / max(u, 0.00001);
}

fn orbitDirection(u: f32, uDot: f32, phi: f32, impactDirection: vec3f) -> vec3f {
  let radial = impactDirection * sin(phi) + vec3f(0.0, 0.0, 1.0) * cos(phi);
  let radialDerivative = impactDirection * cos(phi) - vec3f(0.0, 0.0, 1.0) * sin(phi);
  return normalize(radialDerivative / max(u, 0.00001) - radial * uDot / max(u * u, 0.00001));
}

fn orbitalRateAt(radius: f32) -> f32 {
  return 6.2 / (pow(radius, 1.5) + 0.45);
}

fn orbitingArc(
  radius: f32,
  phi: f32,
  time: f32,
  orbitRadius: f32,
  radialWidth: f32,
  initialAngle: f32,
  angularWidth: f32,
) -> f32 {
  // A feature rotates at the rate of its own orbit. Using the sampled radius
  // here would shear one texture forever and eventually create radial waves.
  let materialAngle = phi - time * orbitalRateAt(orbitRadius);
  let angularOffset = wrappedAngleDifference(initialAngle, materialAngle);
  let radialProfile = exp(-pow((radius - orbitRadius) / radialWidth, 2.0));
  let angularProfile = exp(-pow(angularOffset / angularWidth, 2.0));
  let longitudinalDetail = 0.76 + 0.24 * cos(angularOffset * 11.0);
  return radialProfile * angularProfile * longitudinalDetail;
}

fn sampleDisk(crossing: vec3f, direction: vec3f, time: f32, tracer: f32) -> DiskSample {
  let inclination = scene.camera.x;
  let diskNormal = vec3f(0.0, sin(inclination), cos(inclination));
  let diskBasisZ = vec3f(0.0, cos(inclination), -sin(inclination));
  let radius = length(crossing);
  if (radius < DISK_INNER_RADIUS || radius > DISK_OUTER_RADIUS) {
    return DiskSample(vec3f(0.0), 0.0);
  }

  let phi = atan2(dot(crossing, diskBasisZ), crossing.x);
  let radialBand = smoothstep(DISK_INNER_RADIUS, DISK_INNER_RADIUS * 1.14, radius)
    * (1.0 - smoothstep(DISK_OUTER_RADIUS * 0.78, DISK_OUTER_RADIUS, radius));
  let innerArcA = orbitingArc(radius, phi, time, 3.48, 0.20, 0.28, 0.62);
  let innerArcB = orbitingArc(radius, phi, time, 3.92, 0.24, -2.18, 0.44);
  let middleArcA = orbitingArc(radius, phi, time, 4.56, 0.30, 1.52, 0.72);
  let middleArcB = orbitingArc(radius, phi, time, 5.18, 0.34, -0.78, 0.52);
  let outerArcA = orbitingArc(radius, phi, time, 5.92, 0.38, 2.72, 0.82);
  let outerArcB = orbitingArc(radius, phi, time, 6.62, 0.42, -1.72, 0.64);
  let orbitingStructure =
    innerArcA * 1.28 + innerArcB * 0.92
      + middleArcA * 0.84 + middleArcB * 0.72
      + outerArcA * 0.56 + outerArcB * 0.44;
  let innerHeat = exp(-pow((radius - 4.05) / 1.45, 2.0));
  let density = radialBand * (0.20 + innerHeat * 0.24 + orbitingStructure);
  let diskDirection = normalize(cross(diskNormal, crossing));
  let gravitationalShift = sqrt(max(1.0 - 1.35 / radius, 0.02));
  let beta = clamp(inverseSqrt(max(2.0 * (radius - 0.72), 0.25)), 0.0, 0.92);
  var frequencyShift = gravitationalShift / max(1.0 + beta * dot(diskDirection, direction), 0.08);
  frequencyShift = clamp(mix(1.0, frequencyShift, 0.80), 0.45, 1.72);
  let profileBase = max(1.0 - sqrt(DISK_INNER_RADIUS / radius), 0.0);
  let temperatureProfile = pow(DISK_INNER_RADIUS / radius, 0.75) * pow(profileBase, 0.25) / 0.488;
  let temperature = 7200.0 * temperatureProfile * frequencyShift;
  let thermalTint = mix(
    vec3f(1.0, 0.20, 0.025),
    vec3f(1.0, 0.84, 0.62),
    smoothstep(0.18, 0.86, temperatureProfile * frequencyShift),
  );
  let hotStreams = innerArcA + innerArcB * 0.72 + middleArcA * 0.44;
  var emission = blackbody(temperature) * thermalTint * density * pow(max(frequencyShift, 0.05), 2.65) * 0.82;
  emission += vec3f(6.2, 1.24, 0.10) * hotStreams * 0.52 * radialBand;
  emission += vec3f(2.7, 0.42, 0.042) * (middleArcB * 0.64 + outerArcA * 0.42) * radialBand;
  let tracerPatch = innerArcA * 0.78 + innerArcB * 0.36;
  emission = mix(emission, vec3f(0.01, 1.65, 3.8) * (0.72 + tracerPatch), tracer * tracerPatch * 0.98);
  return DiskSample(emission, clamp(density * 0.52, 0.0, 0.82));
}

fn sampleMagnetosphere(position: vec3f, time: f32) -> vec4f {
  let inclination = scene.camera.x;
  let axis = vec3f(0.0, sin(inclination), cos(inclination));
  let height = dot(position, axis);
  let planar = position - axis * height;
  let cylindricalRadius = length(planar);
  let fluxSurface = cylindricalRadius - (2.35 + 0.075 * height * height);
  let shell = exp(-abs(fluxSurface) / 0.095);
  let azimuth = atan2(planar.z, planar.x);
  let pulse = 0.58 + 0.42 * sin(height * 2.8 - time * 3.7 + azimuth * 3.0);
  let density = shell * max(pulse, 0.0) * smoothstep(0.72, 1.0, scene.construction.x);
  return vec4f(vec3f(0.020, 0.125, 0.62) * density, density * 0.0065);
}

fn sampleRingSource(origin: vec3f, direction: vec3f, winding: f32) -> RingSample {
  let inclination = scene.camera.x;
  let axis = vec3f(0.0, sin(inclination), cos(inclination));
  let basisZ = vec3f(0.0, cos(inclination), -sin(inclination));
  let denominator = dot(direction, axis);
  if (abs(denominator) < 0.00001) {
    return RingSample(vec3f(0.0), 0.0);
  }
  let travel = -dot(origin, axis) / denominator;
  if (travel <= 0.0) {
    return RingSample(vec3f(0.0), 0.0);
  }
  let hit = origin + direction * travel;
  let planar = hit - axis * dot(hit, axis);
  let radius = length(planar);
  let radialOffset = radius - RING_RADIUS;
  if (abs(radialOffset) > RING_HALF_WIDTH) {
    return RingSample(vec3f(0.0), 0.0);
  }
  let phi = atan2(dot(planar, basisZ), planar.x);
  let arcProgress = positiveModulo(phi + 2.22, TAU) / TAU;
  let built = 1.0 - smoothstep(
    scene.construction.x - 0.025,
    scene.construction.x + 0.025,
    arcProgress,
  );
  let radial = 0.5 + radialOffset / (2.0 * RING_HALF_WIDTH);
  let modulePhase = fract(arcProgress * 144.0);
  let moduleBody = smoothstep(0.035, 0.12, modulePhase) * (1.0 - smoothstep(0.88, 0.97, modulePhase));
  let rail = 1.0 - smoothstep(0.035, 0.10, min(abs(radial - 0.12), abs(radial - 0.88)));
  let collector = pow(max(0.5 + 0.5 * cos(arcProgress * TAU * 18.0), 0.0), 42.0);
  let navigation = pow(max(0.5 + 0.5 * cos(arcProgress * TAU * 72.0 + 0.8), 0.0), 54.0);
  let imageOrder = floor(abs(winding) / TAU + 0.45);
  let orderGain = exp(-imageOrder * 0.46);
  let metal = mix(vec3f(0.035, 0.042, 0.052), vec3f(0.42, 0.34, 0.23), moduleBody);
  let frontierAngle = scene.construction.x * TAU - 2.22;
  let frontierOffset = wrappedAngleDifference(frontierAngle, phi);
  let constructionUnits = exp(-pow(frontierOffset / 0.18, 2.0))
    * (0.42 + 0.58 * pow(max(cos(modulePhase * TAU), 0.0), 18.0));
  let maintenanceUnits = pow(max(0.5 + 0.5 * cos(arcProgress * TAU * 36.0 - scene.viewport_time.z * 0.7), 0.0), 72.0);
  let emission = built * orderGain * (
    metal * (0.72 + rail * 1.18)
      + vec3f(2.4, 0.70, 0.075) * collector * 1.42
      + vec3f(0.20, 0.78, 2.10) * navigation * 1.12
      + vec3f(0.18, 0.72, 2.60) * (constructionUnits * 1.35 + maintenanceUnits * 0.42)
  );
  return RingSample(emission, built * clamp(moduleBody + rail, 0.0, 1.0));
}

fn photonRingHint(minimumRadius: f32, criticalRadius: f32) -> f32 {
  let delta = minimumRadius - criticalRadius;
  return exp(-(delta * delta) / 0.0028);
}

@fragment
fn fragment_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let resolution = max(scene.viewport_time.xy, vec2f(1.0));
  let time = scene.viewport_time.z;
  let screen = (frag.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
  let p = screen - scene.lens.xy;
  let roll = scene.camera.y;
  let worldScale = scene.lens.z;
  let boundary = scene.lens.w;
  let rayPlane = rotate2(vec2f(p.x, -p.y), roll) * worldScale;
  let impact = length(rayPlane);
  let directGrid = sampleGrid(frag.xy / resolution);
  if (impact >= boundary) {
    return vec4f(directGrid, 1.0);
  }

  let entryZ = sqrt(max(boundary * boundary - impact * impact, 0.0));
  var impactDirection = vec3f(1.0, 0.0, 0.0);
  if (impact > 0.00001) {
    impactDirection = vec3f(rayPlane / impact, 0.0);
  }
  let inverseBoundary = 1.0 / boundary;
  var phi = atan2(impact, entryZ);
  var u = inverseBoundary;
  var uDot = entryZ / (boundary * max(impact, 0.00001));
  let eSquare = uDot * uDot + u * u * (1.0 - u);
  let inclination = scene.camera.x;
  let diskNormal = vec3f(0.0, sin(inclination), cos(inclination));
  let spin = clamp(scene.construction.z, -0.99, 0.99);
  let orbitSide = clamp(rayPlane.x / max(impact, 0.00001), -1.0, 1.0);
  let kerrBias = spin * sin(inclination) * orbitSide;
  let criticalESquare = CRITICAL_E_SQUARE * clamp(1.0 - kerrBias * 0.20, 0.76, 1.24);
  var draggingAngle = 0.0;
  var position = orbitPosition(u, phi, impactDirection);
  var direction = orbitDirection(u, uDot, phi, impactDirection);
  var previousPosition = position;
  var previousSide = dot(position, diskNormal);
  let initialPhi = phi;
  var minimumRadius = boundary;
  var transmittance = 1.0;
  var radiance = vec3f(0.0);
  var captured = eSquare >= criticalESquare;
  var escaped = false;
  var crossingCount = 0;

  let criticalImpact = inverseSqrt(criticalESquare + inverseBoundary * inverseBoundary * inverseBoundary);
  let criticalRefinement = 1.0 - smoothstep(0.025, 0.32, abs(impact - criticalImpact));
  let stepLimit = i32(round(mix(128.0, 640.0, criticalRefinement)));
  let dPhi = mix(0.040, 0.032, criticalRefinement);

  for (var stepIndex = 0; stepIndex < 640; stepIndex += 1) {
    if (stepIndex >= stepLimit) {
      break;
    }
    if (u >= 1.0) {
      position = rotateAroundAxis(orbitPosition(1.0, phi, impactDirection), diskNormal, draggingAngle);
      minimumRadius = HORIZON_RADIUS;
      captured = true;
      break;
    }
    if (uDot < 0.0 && u <= inverseBoundary && stepIndex > 2) {
      escaped = true;
      break;
    }

    let acceleration0 = pseudoKerrAcceleration(u, kerrBias);
    let nextU = u + uDot * dPhi + 0.5 * acceleration0 * dPhi * dPhi;
    let acceleration1 = pseudoKerrAcceleration(max(nextU, 0.0), kerrBias);
    uDot += 0.5 * (acceleration0 + acceleration1) * dPhi;
    u = nextU;
    phi += dPhi * (1.0 + abs(spin) * u * u * 0.035);
    if (u <= 0.0) {
      escaped = !captured;
      break;
    }

    let dragRate = spin * sin(inclination) * (0.018 + 0.16 * u * u / max(1.0 - u * 0.88, 0.12));
    draggingAngle += dragRate * dPhi;
    position = rotateAroundAxis(orbitPosition(u, phi, impactDirection), diskNormal, draggingAngle);
    direction = rotateAroundAxis(orbitDirection(u, uDot, phi, impactDirection), diskNormal, draggingAngle);
    let radius = 1.0 / u;
    minimumRadius = min(minimumRadius, radius);

    let side = dot(position, diskNormal);
    if (side * previousSide < 0.0 && transmittance > 0.015) {
      let crossingTime = previousSide / (previousSide - side);
      let crossing = mix(previousPosition, position, crossingTime);
      let disk = sampleDisk(crossing, direction, time, scene.construction.w);
      let imageGain = exp(-f32(crossingCount) * 0.12);
      radiance += transmittance * disk.emission * imageGain;
      transmittance *= 1.0 - disk.opacity;
      crossingCount += 1;
    }

    let plasma = sampleMagnetosphere(position, time);
    radiance += transmittance * plasma.rgb * dPhi;
    transmittance *= exp(-plasma.a * dPhi);
    previousPosition = position;
    previousSide = side;
  }

  var source = vec3f(0.0);
  if (!captured) {
    let escapedDirection = normalize(direction);
    let winding = phi - initialPhi + abs(draggingAngle);
    source = sampleEscapedGrid(position, escapedDirection, winding);
    if (escaped) {
      let ring = sampleRingSource(position, escapedDirection, winding);
      source = mix(source, ring.emission, ring.opacity);
    }
  }

  let criticalRadius = PHOTON_RADIUS * clamp(1.0 - kerrBias * 0.085, 0.88, 1.12);
  let photonHint = photonRingHint(minimumRadius, criticalRadius) * (0.16 + criticalRefinement * 0.84);
  var color = radiance + transmittance * source;
  color += vec3f(1.0, 0.57, 0.16) * photonHint * 0.11;
  let boundaryBlend = smoothstep(boundary * 0.76, boundary, impact);
  color = mix(color, directGrid, boundaryBlend);
  return vec4f(max(color, vec3f(0.0)), 1.0);
}
`;
})(globalThis);
