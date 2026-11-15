#version 300 es
precision highp float; // mediump perde precisão em posições de mundo

in vec3 v_normal;
in vec2 v_texcoord;
in vec3 v_worldPosition;

uniform sampler2D u_texture;
uniform vec4 u_color;

// Luz
uniform vec3 u_lightDirection;   // aponta DO objeto PARA a luz
uniform vec3 u_lightColor;
uniform vec3 u_ambientLight;
uniform vec3 u_viewWorldPosition;
uniform bool u_lightingEnabled;

// Material
uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_shininess;

out vec4 outColor;

void main() {
  vec4 texColor = texture(u_texture, v_texcoord);
  vec4 base = texColor * u_color;

  // Luz desligada: mostra só a textura, sem sombreamento
  if (!u_lightingEnabled) {
    outColor = base;
    return;
  }

  vec3 N = normalize(v_normal);
  vec3 L = normalize(u_lightDirection);
  vec3 V = normalize(u_viewWorldPosition - v_worldPosition);
  vec3 R = reflect(-L, N); // reflect espera o vetor chegando, por isso -L

  float diff = max(dot(N, L), 0.0);
  // Sem brilho em faces que não recebem luz
  float spec = diff > 0.0 ? pow(max(dot(R, V), 0.0), u_shininess) : 0.0;

  vec3 ambiente = u_ambient * u_ambientLight;
  vec3 difusa = u_diffuse * diff * u_lightColor;
  vec3 especular = u_specular * spec * u_lightColor;

  outColor = vec4(base.rgb * (ambiente + difusa) + especular, base.a);
}
