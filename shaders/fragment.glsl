#version 300 es
precision mediump float;

in vec3 v_normal;
in vec2 v_texcoord;
in vec3 v_worldPosition;

uniform sampler2D u_texture;
uniform vec4 u_color;
uniform vec3 u_lightDirection;

out vec4 outColor;

void main() {
  vec3 normal = normalize(v_normal);

  float diffuse = max(dot(normal, normalize(u_lightDirection)), 0.0);
  float light = 0.3 + 0.7 * diffuse; // ambiente provisório

  vec4 texColor = texture(u_texture, v_texcoord);
  vec4 base = texColor * u_color;

  outColor = vec4(base.rgb * light, base.a);
}