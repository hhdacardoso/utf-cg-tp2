"use strict"; // ReferenceError em caso de variável não declarada

const m4 = twgl.m4;

const ARQUIVOS_OBJ = {
  arvore : "models/tree.obj",
};

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

// Disco no plano XZ (y = 0), normal +Y, centrado na origem.
// Triângulos em sentido anti-horário visto de cima (compatível com CULL_FACE).
function criarDisco(gl, raio, segmentos = 64) {
  const position = [0, 0, 0];
  const normal = [0, 1, 0];
  const texcoord = [0.5, 0.5];
  const indices = [];

  for (let i = 0; i < segmentos; i++) {
    const a = (i / segmentos) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    position.push(raio * c, 0, raio * s);
    normal.push(0, 1, 0);
    texcoord.push(0.5 + 0.5 * c, 0.5 + 0.5 * s); // projeção planar
  }

  for (let i = 0; i < segmentos; i++) {
    const atual = 1 + i;
    const proximo = 1 + ((i + 1) % segmentos);
    indices.push(0, proximo, atual);
  }

  return twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 3, data: position },
    normal: { numComponents: 3, data: normal },
    texcoord: { numComponents: 2, data: texcoord },
    indices: indices,
  });
}

// Textura do chão desenhada em canvas: gramado + anel branco + faixa preta.
function criarTexturaChao(gl, tamanho = 1024) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = tamanho;
  const ctx = cv.getContext("2d");
  const c = tamanho / 2;

  // Fundo: faixa preta (borda)
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, tamanho, tamanho);

  // Anel branco fino
  ctx.fillStyle = "#f2f2f2";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.88, 0, Math.PI * 2);
  ctx.fill();

  // Gramado
  ctx.fillStyle = "#4caf50";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.84, 0, Math.PI * 2);
  ctx.fill();

  // Manchas de variação na grama (só dentro do gramado)
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c * 0.84, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * tamanho;
    const y = Math.random() * tamanho;
    const r = 2 + Math.random() * 6;
    ctx.fillStyle = Math.random() < 0.5 ? "#3f9a44" : "#5dbb63";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  return twgl.createTexture(gl, { src: cv, min: gl.LINEAR_MIPMAP_LINEAR });
}

// Hemisfério inferior (y <= 0), centrado na origem, equador em y = 0.
// phi: latitude, 0 = equador, 90° = polo inferior.
function criarHemisferio(gl, raio, stacks = 24, slices = 64) {
  const position = [];
  const normal = [];
  const texcoord = [];
  const indices = [];

  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * (Math.PI / 2);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);

    for (let j = 0; j <= slices; j++) {
      const a = (j / slices) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      // Normal = direção do centro até o vértice (esfera centrada na origem)
      const nx = cp * ca;
      const ny = -sp;
      const nz = cp * sa;

      position.push(raio * nx, raio * ny, raio * nz);
      normal.push(nx, ny, nz);
      texcoord.push(j / slices, i / stacks); // v: 0 = equador, 1 = polo
    }
  }

  // j = slices repete o vértice de j = 0 (costura da textura)
  const colunas = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const A = i * colunas + j;
      const B = A + 1;
      const C = A + colunas;
      const D = C + 1;
      indices.push(A, B, C); // anti-horário visto de fora
      indices.push(B, D, C);
    }
  }

  return twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 3, data: position },
    normal: { numComponents: 3, data: normal },
    texcoord: { numComponents: 2, data: texcoord },
    indices: indices,
  });
}

// Textura 2048x512: u percorre a circunferência, v vai do equador (topo) ao polo.
// Com raio 6, os pixels por unidade de mundo ficam iguais nos dois eixos.
function criarTexturaHemisferio(gl) {
  const W = 2048;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");

  // Corpo branco
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, W, H);

  // Faixa preta no equador (topo da imagem)
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, W, 56);

  // Botão central em u = 0 (desenhado nas duas pontas para fechar a costura).
  // Só a metade de baixo do círculo aparece, que é a que cabe no hemisfério.
  for (const cx of [0, W]) {
    const circulo = (r, cor) => {
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(cx, 0, r, 0, Math.PI * 2);
      ctx.fill();
    };
    circulo(100, "#1a1a1a"); // aro preto
    circulo(72, "#f4f4f4");  // branco
    circulo(48, "#cfcfcf");  // miolo cinza
  }

  return twgl.createTexture(gl, {
    src: cv,
    min: gl.LINEAR_MIPMAP_LINEAR,
    wrapS: gl.REPEAT,
    wrapT: gl.CLAMP_TO_EDGE,
  });
}

async function carregarTexto(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao carregar ${url}`);
  return await resposta.text();
}

async function carregarModelos(gl, arquivos){
  const nomes = Object.keys(arquivos);
  const textos = await Promise.all(nomes.map((n) => carregarTexto(arquivos[n])));

  const modelos = {};
  nomes.forEach((nome, i) => {
    modelos[nome] = textos[i]; // por enquanto, só o texto bruto
  });
  return modelos;
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

  // Carregamento dos modelos dos objetos da cena
  const modelos = await carregarModelos(gl, ARQUIVOS_OBJ);
  console.log(Object.keys(modelos)); // ["arvore", "pedra"]
  
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
  
  const texChao = criarTexturaChao(gl);

  // Chão: círculo da pokébola
  cena.push(
    criarObjeto({
      bufferInfo: criarDisco(gl, 6, 64),
      position: [0, 0, 0],
      color: [1, 1, 1, 1], // branco para não tingir a textura
      texture: texChao,
    })
  );

  const texHemisferio = criarTexturaHemisferio(gl);

  // Hemisfério: "chão" da pokébola, mesmo raio do disco
  cena.push(
    criarObjeto({
      bufferInfo: criarHemisferio(gl, 6, 24, 64),
      position: [0, 0, 0],
      color: [1, 1, 1, 1],
      texture: texHemisferio,
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
