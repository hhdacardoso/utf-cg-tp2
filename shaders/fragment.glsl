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

// Neblina (fumaça): névoa por distância + fumaça que desliza rente ao chão
uniform bool u_fogEnabled;
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_time;

out vec4 outColor;

// Ruído de valor (value noise) 2D: números "aleatórios" suaves entre 0 e 1
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // suaviza a interpolação
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Soma de 4 camadas de ruído, cada uma com metade da força e o dobro da frequência
float fumaca(vec2 p) {
  float total = 0.0;
  float forca = 0.5;
  for (int i = 0; i < 4; i++) {
    total += forca * noise(p);
    p *= 2.0;
    forca *= 0.5;
  }
  return total;
}

void main() {
  vec4 texColor = texture(u_texture, v_texcoord);
  vec4 base = texColor * u_color;
  vec3 cor = base.rgb;

  vec3 paraOlho = u_viewWorldPosition - v_worldPosition;

  // Modelo de Phong (com a luz desligada, fica só a textura)
  if (u_lightingEnabled) {
    vec3 N = normalize(v_normal);
    vec3 L = normalize(u_lightDirection);
    vec3 V = normalize(paraOlho);
    vec3 R = reflect(-L, N); // reflect espera o vetor chegando, por isso -L

    float diff = max(dot(N, L), 0.0);
    // Sem brilho em faces que não recebem luz
    float spec = diff > 0.0 ? pow(max(dot(R, V), 0.0), u_shininess) : 0.0;

    vec3 ambiente = u_ambient * u_ambientLight;
    vec3 difusa = u_diffuse * diff * u_lightColor;
    vec3 especular = u_specular * spec * u_lightColor;

    cor = base.rgb * (ambiente + difusa) + especular;
  }

  if (u_fogEnabled) {
    // 1) Névoa por distância: aumenta do u_fogNear até o u_fogFar
    float distancia = length(paraOlho);
    float nevoaDistancia = smoothstep(u_fogNear, u_fogFar, distancia);

    // 2) Fumaça: manchas de ruído que andam com o tempo, mais densas perto do chão
    vec2 posicao = v_worldPosition.xz * 0.4 + vec2(u_time * 0.12, u_time * 0.07);
    float manchas = smoothstep(0.25, 0.85, fumaca(posicao));
    float rente = exp(-max(v_worldPosition.y, 0.0) * 0.6);
    float nevoaFumaca = manchas * rente * 0.75;

    float nevoa = clamp(nevoaDistancia * 0.8 + nevoaFumaca, 0.0, 1.0);
    cor = mix(cor, u_fogColor, nevoa);
  }

  outColor = vec4(cor, base.a);
}
