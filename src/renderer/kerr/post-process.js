// HDR bloom extraction and final display transform.
(function defineSilidoxKerrPostProcess(global) {
  const namespace = (global.SilidoxKerr = global.SilidoxKerr || {});

  namespace.bloomShader = /* wgsl */ `
@group(0) @binding(0) var hdr_texture: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;

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

fn sampleHdr(uv: vec2f) -> vec3f {
  return textureSampleLevel(hdr_texture, linear_sampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
}

@fragment
fn fragment_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let outputSize = vec2f(textureDimensions(hdr_texture)) * 0.5;
  let uv = frag.xy / max(outputSize, vec2f(1.0));
  let texel = 1.0 / vec2f(textureDimensions(hdr_texture));
  var color = sampleHdr(uv) * 0.28;
  color += sampleHdr(uv + vec2f(texel.x * 2.0, 0.0)) * 0.12;
  color += sampleHdr(uv - vec2f(texel.x * 2.0, 0.0)) * 0.12;
  color += sampleHdr(uv + vec2f(0.0, texel.y * 2.0)) * 0.12;
  color += sampleHdr(uv - vec2f(0.0, texel.y * 2.0)) * 0.12;
  color += sampleHdr(uv + texel * vec2f(2.0, 2.0)) * 0.06;
  color += sampleHdr(uv + texel * vec2f(-2.0, 2.0)) * 0.06;
  color += sampleHdr(uv + texel * vec2f(2.0, -2.0)) * 0.06;
  color += sampleHdr(uv + texel * vec2f(-2.0, -2.0)) * 0.06;
  let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  let threshold = smoothstep(0.72, 1.45, luminance);
  return vec4f(color * threshold, 1.0);
}
`;

  namespace.compositeShader = /* wgsl */ `
@group(0) @binding(0) var hdr_texture: texture_2d<f32>;
@group(0) @binding(1) var bloom_texture: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;

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

fn acesToneMap(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fragment_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let dimensions = vec2f(textureDimensions(hdr_texture));
  let uv = frag.xy / max(dimensions, vec2f(1.0));
  let sceneColor = textureSampleLevel(hdr_texture, linear_sampler, uv, 0.0).rgb;
  let bloom = textureSampleLevel(bloom_texture, linear_sampler, uv, 0.0).rgb;
  var color = sceneColor * 0.82 + bloom * 0.34;
  let centered = uv * 2.0 - 1.0;
  let vignette = smoothstep(1.36, 0.22, length(centered * vec2f(0.78, 1.0)));
  color *= 0.56 + vignette * 0.54;
  color = acesToneMap(color);
  color = pow(max(color, vec3f(0.0)), vec3f(1.0 / 2.2));
  return vec4f(color, 1.0);
}
`;
})(globalThis);
