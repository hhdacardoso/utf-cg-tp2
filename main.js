"use strict"; // ReferenceError em caso de variável não declarada

const m4 = twgl.m4;

const ARQUIVOS_OBJ = {
  arvore : {
    obj:"models/tree.obj",
    textura: "models/Textures/colormap.png",
  }
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
  bufferInfo = null,           // null = nó vazio (pivô)
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = [1, 1, 1, 1],
  texture = null,
  filhos = [],
}) {
  return { bufferInfo, position, rotation, scale, color, texture, filhos };
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

async function carregarModelos(gl, arquivos) {
  const nomes = Object.keys(arquivos);
  const textos = await Promise.all(nomes.map((n) => carregarTexto(arquivos[n].obj)));

  const modelos = {};
  nomes.forEach((nome, i) => {
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, parseObj(textos[i]));
    const texture = arquivos[nome].textura
      ? twgl.createTexture(gl, {
          src: arquivos[nome].textura,
          min: gl.NEAREST, // paleta de cores: sem mistura entre vizinhas
          mag: gl.NEAREST,
          flipY: true,
        })
      : null;
    modelos[nome] = { bufferInfo, texture };
  });
  return modelos;
}

// Converte o texto de um .obj em arrays prontos para o TWGL.
// Suporta faces v, v/vt, v//vn e v/vt/vn, índices negativos e polígonos
// com mais de 3 vértices (triangulados em leque).
function parseObj(texto) {
  const pos = [];  // posições lidas ([x, y, z])
  const uv = [];   // coordenadas de textura ([u, v])
  const nor = [];  // normais ([x, y, z])

  const position = [];
  const normal = [];
  const texcoord = [];
  const indices = [];
  const cache = new Map(); // "v/vt/vn" -> índice final (evita duplicar vértices)

  // Converte o índice do OBJ (base 1, ou negativo = relativo ao fim) para base 0
  const resolver = (s, tamanho) => {
    if (!s) return -1;
    const n = parseInt(s, 10);
    return n > 0 ? n - 1 : tamanho + n;
  };

  // Gera (ou reaproveita) o vértice final correspondente a "v/vt/vn"
  function vertice(token) {
    if (cache.has(token)) return cache.get(token);

    const [sv, svt, svn] = token.split("/");
    const p = pos[resolver(sv, pos.length)];
    const t = uv[resolver(svt, uv.length)] || [0, 0];
    const n = nor[resolver(svn, nor.length)] || [0, 1, 0];

    position.push(p[0], p[1], p[2]);
    texcoord.push(t[0], t[1]);
    normal.push(n[0], n[1], n[2]);

    const idx = position.length / 3 - 1;
    cache.set(token, idx);
    return idx;
  }

  for (const linha of texto.split("\n")) {
    const partes = linha.trim().split(/\s+/);
    const tipo = partes[0];

    if (tipo === "v") {
      // Pode haver 3 números extras de cor (x y z r g b): ignorados
      pos.push([+partes[1], +partes[2], +partes[3]]);
    } else if (tipo === "vt") {
      uv.push([+partes[1], +partes[2]]);
    } else if (tipo === "vn") {
      nor.push([+partes[1], +partes[2], +partes[3]]);
    } else if (tipo === "f") {
      const idx = partes.slice(1).map(vertice);
      // Triangulação em leque: (0,1,2), (0,2,3), (0,3,4)...
      for (let i = 1; i < idx.length - 1; i++) {
        indices.push(idx[0], idx[i], idx[i + 1]);
      }
    }
  }

  return {
    position: { numComponents: 3, data: position },
    normal: { numComponents: 3, data: normal },
    texcoord: { numComponents: 2, data: texcoord },
    indices: indices,
  };
}

function criarMoinho(gl, texBranca, posicao) {
  const bufCubo = twgl.primitives.createCubeBufferInfo(gl, 1);
  const bufEsfera = twgl.primitives.createSphereBufferInfo(gl, 1, 16, 12);
  const bufTorre = twgl.primitives.createTruncatedConeBufferInfo(gl, 0.8, 0.5, 2.4, 24, 1);
  const bufTelhado = twgl.primitives.createTruncatedConeBufferInfo(gl, 0.65, 0, 0.7, 24, 1);

  const AMARELO_CLARO = [0.85, 0.8, 0.7, 1];
  const TELHA = [0.6, 0.2, 0.15, 1];
  const MADEIRA = [0.4, 0.25, 0.1, 1];
  const TECIDO = [0.95, 0.95, 0.9, 1];

  // Uma pá = pivô girado em Z, com braço e vela como filhos
  const criarPa = (angulo) =>
    criarObjeto({
      rotation: [0, 0, angulo],
      filhos: [
        criarObjeto({
          bufferInfo: bufCubo,
          position: [0, 0.85, 0],
          scale: [0.07, 1.7, 0.07],
          color: MADEIRA,
          texture: texBranca,
        }),
        criarObjeto({
          bufferInfo: bufCubo,
          position: [0.2, 1.05, 0.03],
          scale: [0.3, 1.1, 0.03],
          color: TECIDO,
          texture: texBranca,
        }),
      ],
    });

  // Eixo: no topo da torre, na frente. É ele que gira.
  const eixo = criarObjeto({
    position: [0, 2.1, 0.62],
    filhos: [
      criarObjeto({
        bufferInfo: bufEsfera,
        scale: [0.15, 0.15, 0.15],
        color: MADEIRA,
        texture: texBranca,
      }),
      criarPa(0),
      criarPa(Math.PI / 2),
      criarPa(Math.PI),
      criarPa((3 * Math.PI) / 2),
    ],
  });

  // Raiz: orientada para o centro do diorama (+Z local aponta para o centro)
  const raiz = criarObjeto({
    position: posicao,
    rotation: [0, Math.atan2(-posicao[0], -posicao[2]), 0],
    filhos: [
      criarObjeto({
        bufferInfo: bufTorre,
        position: [0, 1.2, 0], // metade da altura 2.4
        color: AMARELO_CLARO,
        texture: texBranca,
      }),
      criarObjeto({
        bufferInfo: bufTelhado,
        position: [0, 2.75, 0], // 2.4 + metade de 0.7
        color: TELHA,
        texture: texBranca,
      }),
      eixo,
    ],
  });

  return { raiz, eixo };
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
  
  // 3. Textura branca 1x1 (para objetos sem textura)
  const texBranca = twgl.createTexture(gl, {
    src: [255, 255, 255, 255],
    min: gl.NEAREST,
    mag: gl.NEAREST,
  });
  // 4. Cena
  const cena = [];

  // Inserção da árvore
  cena.push(
    criarObjeto({
      bufferInfo:modelos.arvore.bufferInfo,
      texture:modelos.arvore.texture,
      position:[2.5, 0, 1],
      scale:[3, 3, 3],
    })
  );

  // ---------- Cenário (primitivas) ----------
// Buffers unitários compartilhados; o tamanho de cada instância vem do `scale`.
const bufEsfera = twgl.primitives.createSphereBufferInfo(gl, 1, 24, 16);   // raio 1
const bufCilindro = twgl.primitives.createCylinderBufferInfo(gl, 1, 1, 24, 1); // raio 1, altura 1
const bufLagoa = criarDisco(gl, 1, 48);                                    // raio 1

// Lagoa: disco azul um pouco acima do chão (y = 0.02) para evitar z-fighting
cena.push(
  criarObjeto({
    bufferInfo: bufLagoa,
    position: [-2.5, 0.02, -1.5],
    scale: [1.8, 1, 1.8], // raio 1.8
    color: [0.2, 0.5, 0.85, 1],
    texture: texBranca,
  })
);

// Arbustos: esferas achatadas, parcialmente enterradas no chão
const arbustos = [
  { x: 3.6, z: -2.2, r: 0.7 },
  { x: -4.0, z: 1.5, r: 0.6 },
  { x: 1.0, z: -4.0, r: 0.65 },
  { x: 0.5, z: 4.0, r: 0.7 },
  { x: 3.7, z: 2.4, r: 0.55 },
  { x: -1.2, z: -3.4, r: 0.5 },
];
for (const a of arbustos) {
  cena.push(
    criarObjeto({
      bufferInfo: bufEsfera,
      position: [a.x, a.r * 0.45, a.z],
      scale: [a.r, a.r * 0.7, a.r],
      color: [0.12, 0.45, 0.18, 1],
      texture: texBranca,
    })
  );
}

// Pedras: esferas achatadas e irregulares, cinza, com rotações diferentes
const pedras = [
  { x: 1.8, z: -2.5, s: [0.45, 0.3, 0.38], giro: 0.4 },
  { x: -0.8, z: -3.7, s: [0.35, 0.25, 0.3], giro: 1.2 },
  { x: 3.2, z: -0.6, s: [0.5, 0.35, 0.4], giro: 2.1 },
  { x: -4.2, z: -0.3, s: [0.4, 0.28, 0.35], giro: 0.9 },
];
for (const p of pedras) {
  cena.push(
    criarObjeto({
      bufferInfo: bufEsfera,
      position: [p.x, p.s[1] * 0.6, p.z],
      rotation: [0, p.giro, 0],
      scale: p.s,
      color: [0.5, 0.5, 0.52, 1],
      texture: texBranca,
    })
  );
}

// Tonel: cilindro marrom em pé (raio 0.4, altura 0.8)
cena.push(
  criarObjeto({
    bufferInfo: bufCilindro,
    position: [-0.2, 0.4, -2.0],
    scale: [0.4, 0.8, 0.4],
    color: [0.45, 0.28, 0.12, 1],
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

  const VELOCIDADE_PAS = 1.5; // rad/s
  const moinho = criarMoinho(gl, texBranca, [-2.5, 0, 2.8]);
  cena.push(moinho.raiz);
  
  // 5. Desenho de um objeto
  function desenharObjeto(obj, viewProjection, matrizPai = m4.identity()) {
    // Matriz de mundo = matriz do pai × matriz local
    const world = m4.multiply(matrizPai, criarMatrizModelo(obj));

    if (obj.bufferInfo) {
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

    for (const filho of obj.filhos) {
      desenharObjeto(filho, viewProjection, world);
    }
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

    gl.useProgram(programInfo.program);
    twgl.setUniforms(programInfo, {
      u_lightDirection: [0.5, 1, 0.7],
    });

    for (const obj of cena) {
      desenharObjeto(obj, viewProjection);
    }

    moinho.eixo.rotation[2] = time * VELOCIDADE_PAS;

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main().catch((erro) => console.error(erro));
