// GLSL for the hologram (three.js ShaderMaterial; three prepends the standard uniforms and
// attributes and maps attribute/varying/gl_FragColor to GLSL ES 3.0). Everything is unlit and
// drawn with additive blending and no depth buffer, so draw order never matters.

// Shared by part fills and part edges: the materialize sweep. A shape appears bottom to top over
// uReveal seconds after it arrived (aBorn), with a bright band at the sweep front.
const REVEAL = /* glsl */ `
  float prog = clamp((uTime - vBorn) / uReveal, 0.0, 1.0);
  float sweep = prog * 1.15 - 0.075;
  if (vH > sweep) discard;
  float front = (1.0 - smoothstep(0.0, 0.09, sweep - vH)) * step(prog, 0.999);
`;

const COMMON_UNIFORMS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uVis;
  uniform float uSel;
  uniform float uHover;
  uniform float uTime;
  uniform float uReveal;
  uniform vec2 uFade;
  uniform float uScanY;
  uniform float uScanW;
  uniform float uFlicker;
  uniform float uRows;
`;

export const FILL_VS = /* glsl */ `
  attribute float aBorn;
  attribute float aH;
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    vH = aH;
    vBorn = aBorn;
    vDepth = -mv.z;
    vWY = wp.y;
    gl_Position = projectionMatrix * mv;
  }
`;

export const FILL_FS = /* glsl */ `
  ${COMMON_UNIFORMS}
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  void main() {
    ${REVEAL}
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float facing = abs(dot(n, v));
    float rim = pow(1.0 - facing, 2.2);
    float fade = 1.0 - 0.58 * smoothstep(uFade.x, uFade.y, vDepth);
    float scan = exp(-pow((vWY - uScanY) / uScanW, 2.0));
    float rows = mix(0.87, 0.8 + 0.2 * step(1.5, mod(gl_FragCoord.y, 3.0)), uRows);
    float a = uAlpha * (0.14 + 1.35 * rim) * rows;
    a *= 1.0 + 1.1 * uSel + 0.5 * uHover;
    a += scan * 0.16 * uAlpha;
    a *= fade * uVis * uFlicker;
    vec3 col = mix(uColor, vec3(0.86, 1.0, 1.0), clamp(0.1 + 0.45 * uSel + 0.3 * rim * rim, 0.0, 1.0));
    gl_FragColor = vec4(col * a + vec3(0.65, 1.0, 1.0) * front * 0.5 * uVis, 1.0);
  }
`;

export const LINE_VS = /* glsl */ `
  attribute float aBorn;
  attribute float aH;
  attribute float aW;
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  varying float vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vH = aH;
    vBorn = aBorn;
    vW = aW;
    vDepth = -mv.z;
    vWY = wp.y;
    gl_Position = projectionMatrix * mv;
  }
`;

export const LINE_FS = /* glsl */ `
  ${COMMON_UNIFORMS}
  varying float vH;
  varying float vBorn;
  varying float vDepth;
  varying float vWY;
  varying float vW;
  void main() {
    ${REVEAL}
    float fade = 1.0 - 0.62 * smoothstep(uFade.x, uFade.y, vDepth);
    float scan = exp(-pow((vWY - uScanY) / uScanW, 2.0));
    float a = uAlpha * vW * fade * uVis * uFlicker * (1.0 + 0.8 * uSel + 0.45 * uHover);
    a += (scan * 0.22 + front) * uVis;
    vec3 col = mix(uColor, vec3(0.9, 1.0, 1.0), clamp(0.28 + 0.55 * uSel + 0.25 * uHover, 0.0, 1.0));
    gl_FragColor = vec4(col * a, 1.0);
  }
`;

// Full-screen background: deep navy with a soft glow behind the model (uCenter, drawing-buffer px).
export const BG_VS = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const BG_FS = /* glsl */ `
  uniform vec2 uRes;
  uniform vec2 uCenter;
  void main() {
    vec2 p = (gl_FragCoord.xy - uCenter) / uRes.y;
    float d = length(p * vec2(0.85, 1.0));
    vec3 inner = vec3(0.028, 0.078, 0.118);
    vec3 outer = vec3(0.008, 0.016, 0.027);
    vec3 col = mix(inner, outer, smoothstep(0.0, 0.9, d));
    col += vec3(0.0, 0.03, 0.045) * (1.0 - smoothstep(0.0, 0.32, d));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The projector floor: fading grid, a bright ring, a dashed outer ring and tick marks.
export const FLOOR_VS = /* glsl */ `
  uniform vec3 uCenterW;
  varying vec2 vP;
  varying float vDepth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xz - uCenterW.xz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const FLOOR_FS = /* glsl */ `
  uniform float uCell;
  uniform float uR;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uVis;
  uniform float uGrid;
  uniform vec2 uFade;
  varying vec2 vP;
  varying float vDepth;
  float grid(vec2 p, float cell) {
    vec2 q = p / cell;
    vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    float r = length(vP);
    float fw = max(fwidth(r), 1e-5);
    float fadeR = 1.0 - smoothstep(uR * 0.35, uR * 1.4, r);
    float g = grid(vP, uCell) * 0.09 + grid(vP, uCell * 5.0) * 0.15;
    float ring = 1.0 - smoothstep(0.0, fw * 1.6, abs(r - uR));
    float ring2 = 1.0 - smoothstep(0.0, fw * 1.3, abs(r - uR * 1.075));
    float ang = atan(vP.y, vP.x) / 6.2831853;
    float dash = step(0.42, fract(ang * 96.0 + uTime * 0.6));
    float arc = abs(fract(ang * 36.0 + 0.5) - 0.5) * 6.2831853 / 36.0 * r;
    float tick = (1.0 - smoothstep(0.0, fw * 1.4, arc)) * step(uR * 1.012, r) * step(r, uR * 1.05);
    float glow = (1.0 - smoothstep(0.0, uR, r)) * 0.07;
    float fade = 1.0 - 0.45 * smoothstep(uFade.x, uFade.y, vDepth);
    float a = (g * fadeR * uGrid + ring * 0.5 + ring2 * dash * 0.3 * uGrid + tick * 0.38 + glow) * fade * uVis;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;
