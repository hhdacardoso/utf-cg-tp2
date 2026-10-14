#version 300 es

in vec4 a_position;
in vec3 a_normal;
in vec2 a_texcoord;

uniform mat4 u_world;
uniform mat4 u_viewProjection;
uniform mat4 u_worldInverseTranspose;

out vec3 v_normal;
out vec2 v_texcoord;
out vec3 v_worldPosition;

void main() {
  vec4 worldPos = u_world * a_position;

  v_worldPosition = worldPos.xyz;
  v_normal = mat3(u_worldInverseTranspose) * a_normal;
  v_texcoord = a_texcoord;

  gl_Position = u_viewProjection * worldPos;
}