"use strict"; // ReferenceError em caso de variável não declarada

const m4 = twgl.m4;

// Matriz de modelo a partir de posição, rotação (rad) e escala.
// Ordem: T * Ry * Rx * Rz * S
function criarMatrizModelo({ position, rotation, scale }) {
  let m = m4.translation(position);
  m = m4.multiply(m, m4.rotationY(rotation[1]));
  m = m4.multiply(m, m4.rotationX(rotation[0]));
  m = m4.multiply(m, m4.rotationZ(rotation[2]));
  m = m4.multiply(m, m4.scaling(scale));
  return m;
}

async function carregarShader(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao carregar ${url}`);
  return await resposta.text();
}

// Cria um objeto de cena com valores padrão
function criarObjeto({
  bufferInfo,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = [1, 1, 1, 1],
  texture = null,
}) {
  return { bufferInfo, position, rotation, scale, color, texture };
}

// ---------- Câmeras ----------
const camState = {
  ativa: 1,                      // 1 = automática, 2 = orbital
  raio: 12,                      // distância ao alvo (scroll)
  yaw: 0.8,                      // câmera 2 (rad)
  pitch: 0.5,                    // câmera 2 (rad)
  alvo: [0, 0, 0],
};
const RAIO_MIN = 4;
const RAIO_MAX = 30;
const ELEVACAO_AUTO = Math.PI / 4;            // 45°
const VELOCIDADE_AUTO = 0.3;                  // rad/s
const PITCH_MAX = (85 * Math.PI) / 180;

// Posição do olho em coordenadas esféricas ao redor do alvo
function posicaoOlho(yaw, pitch, raio, alvo) {
  return [
    alvo[0] + raio * Math.cos(pitch) * Math.cos(yaw),
    alvo[1] + raio * Math.sin(pitch),
    alvo[2] + raio * Math.cos(pitch) * Math.sin(yaw),
  ];
}

function calcularView(time) {
  const yaw = camState.ativa === 1 ? time * VELOCIDADE_AUTO : camState.yaw;
  const pitch = camState.ativa === 1 ? ELEVACAO_AUTO : camState.pitch;
  const olho = posicaoOlho(yaw, pitch, camState.raio, camState.alvo);
  const camera = m4.lookAt(olho, camState.alvo, [0, 1, 0]);
  return m4.inverse(camera);
}

const NOMES_CAMERA = {
  1: "1 (automática)",
  2: "2 (orbital)",
};

function configurarControles(canvas) {
  const hudCamera = document.getElementById("camera-ativa");

  function selecionarCamera(n) {
    console.log("Camera ativa " + n); // Teste do listener
    camState.ativa = n;
    hudCamera.textContent = NOMES_CAMERA[n];
  }
  selecionarCamera(camState.ativa); // texto inicial

  window.addEventListener("keydown", (e) => {
    if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
      selecionarCamera(1);
    }
    if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
      selecionarCamera(2);
    }
  });

  // Scroll: aproxima/afasta (vale para as duas câmeras)
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camState.raio *= 1 + e.deltaY * 0.001;
      camState.raio = Math.min(RAIO_MAX, Math.max(RAIO_MIN, camState.raio));
    },
    { passive: false }
  );

  // Mouse: orbita a câmera 2 enquanto o botão esquerdo está pressionado
  canvas.addEventListener("pointermove", (e) => {
    if (camState.ativa !== 2 || !(e.buttons & 1)) return;
    camState.yaw -= e.movementX * 0.005;
    camState.pitch += e.movementY * 0.005;
    camState.pitch = Math.min(PITCH_MAX, Math.max(-PITCH_MAX, camState.pitch));
  });
}

async function main() {
  // 1.Contexto e inicialização
  const canvas = document.getElementById("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("Seu navegador não suporta WebGL2.");
    return;
  }

  // Check do load da TWGL
  if (typeof twgl === "undefined") {
    console.error("TWGL não carregou.");
    return;
  }

  gl.enable(gl.DEPTH_TEST); // z-buffer
  gl.enable(gl.CULL_FACE);  // descarta faces de trás (antihorário = frente)
  gl.clearColor(0.53, 0.81, 0.92, 1.0); // céu azul claro
  
  twgl.setDefaults({ attribPrefix: "a_" });
  configurarControles(canvas);

  // 2. Shaders
  const [vs, fs] = await Promise.all([
    carregarShader("shaders/vertex.glsl"),
    carregarShader("shaders/fragment.glsl"),
  ]);
  const programInfo = twgl.createProgramInfo(gl, [vs, fs]);
  
  // 3. Textura branca 1x1 (para objetos sem textura)
  const texBranca = twgl.createTexture(gl, {
    src: [255, 255, 255, 255],
    min: gl.NEAREST,
    mag: gl.NEAREST,
  });
  // 4. Cena
  const cena = [];
  
  cena.push(
    criarObjeto({
      bufferInfo: twgl.primitives.createCubeBufferInfo(gl, 2),
      position: [0, 1, 0],
      color: [0.9, 0.3, 0.3, 1],
      texture: texBranca,
    })
  );
  
  // Chão provisório, só para dar referência espacial
  cena.push(
    criarObjeto({
      bufferInfo: twgl.primitives.createCylinderBufferInfo(gl, 6, 0.2, 48, 1),
      position: [0, -0.1, 0],
      color: [0.3, 0.7, 0.3, 1],
      texture: texBranca,
    })
  );
  
  // 5. Desenho de um objeto
  function desenharObjeto(obj, viewProjection) {
    const world = criarMatrizModelo(obj);

    twgl.setBuffersAndAttributes(gl, programInfo, obj.bufferInfo);
    twgl.setUniforms(programInfo, {
      u_world: world,
      u_viewProjection: viewProjection,
      u_worldInverseTranspose: m4.transpose(m4.inverse(world)),
      u_texture: obj.texture || texBranca,
      u_color: obj.color,
    });
    twgl.drawBufferInfo(gl, obj.bufferInfo);
  }
  
  // 6. Loop
  function render(timeMs) {
    const time = timeMs * 0.001;

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Câmera fixa provisória (substituída na Fase 2)
    const aspect = gl.canvas.width / gl.canvas.height;
    const projection = m4.perspective(Math.PI / 4, aspect, 0.1, 100);
    const viewProjection = m4.multiply(projection, calcularView(time));

    // Animação de teste
    cena[0].rotation[1] = time;

    gl.useProgram(programInfo.program);
    twgl.setUniforms(programInfo, {
      u_lightDirection: [0.5, 1, 0.7],
    });

    for (const obj of cena) {
      desenharObjeto(obj, viewProjection);
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main().catch((erro) => console.error(erro));
